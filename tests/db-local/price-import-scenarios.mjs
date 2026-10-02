// Price import v1 scenarios: roles, dry run vs apply, per-row validation, duplicates, unknown keys,
// audit, import_runs bookkeeping across batches, product cards and cache revision.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000051",
  manager: "00000000-0000-4000-8000-000000000052",
  content: "00000000-0000-4000-8000-000000000053"
};
const RUN = "6f1c2a52-0000-4000-8000-0000000000aa";

async function as(db, role, userId, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  if (role) await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec("reset role"); }
}

async function expectError(promise, pattern, label) {
  try { await promise; } catch (error) {
    assert.match(error.message, pattern, `${label}: unexpected error ${error.message}`);
    return error;
  }
  assert.fail(`${label}: expected an error`);
}

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const apply = (db, user, payload) => as(db, "authenticated", user, async () => (await one(db, "select public.admin_apply_price_updates($1) r", [payload])).r);
const product = (db, legacyId) => one(db, "select amount::float8 amount, old_amount::float8 old_amount, price_status::text price_status, inventory_status::text inventory_status from public.products where legacy_id = $1", [legacyId]);
const card = (db, legacyId) => one(db, "select amount::float8 amount, price_status::text price_status, inventory_status::text inventory_status from public.catalog_product_cards where snapshot_version = 'v-price' and legacy_id = $1", [legacyId]);
const revision = async db => Number((await one(db, "select revision from public.catalog_admin_cache_revision")).revision);
const byLine = result => Object.fromEntries(result.rows.map(row => [row.line, row]));

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  const brand = await one(db, "select internal_id from public.brands where status = 'active' order by stable_id limit 1");
  const leaf = await one(db, `select internal_id from public.categories
    where level = 3 and status = 'active' and visibility = 'catalog' order by stable_id limit 1`);
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, old_amount, price_status, inventory_status, publication_status)
    values ('p-1', 'PR-001', 'p-1', 'Котел Альфа', 'Альфа', 'A1', $1, $2, 1000, null, 'known', 'in_stock', 'published'),
           ('p-2', 'PR-002', 'p-2', 'Бойлер Бета', 'Бета', 'B2', $1, $2, 900, 1200, 'known', 'in_stock', 'published'),
           ('p-3', 'PR-003', 'p-3', 'Насос Гамма', 'Гамма', 'G3', $1, $2, null, null, 'on_request', 'unknown', 'published'),
           ('p-4', '00123', 'p-4', 'Фільтр Дельта', 'Дельта', 'D4', $1, $2, 300, null, 'known', 'in_stock', 'draft')`,
    [brand.internal_id, leaf.internal_id]);
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-price', 'test', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 4, 3, repeat('0', 64), true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-price')");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-price')
    on conflict (singleton) do update set base_snapshot_version = 'v-price', revision = 0`);
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id order by legacy_id)) from public.products where legacy_id like 'p-%'");

  // 1. Access: anon has no grant, content manager is refused, manager may import; helper hidden.
  await expectError(as(db, "anon", null, () => db.query("select public.admin_apply_price_updates('{}')")), /permission denied/, "anon apply");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_export_products()")), /permission denied/, "anon export");
  await expectError(apply(db, STAFF.content, { rows: [{ key: "PR-001", price: 1 }] }), /власнику, адміністратору та менеджеру/, "content apply");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select public._price_import_number('1', 'x')")), /permission denied/, "helper hidden");
  await expectError(apply(db, STAFF.owner, { matchBy: "title", rows: [{ key: "x" }] }), /SKU або Legacy ID/, "bad matchBy");
  await expectError(apply(db, STAFF.owner, { rows: [] }), /від 1 до 200/, "empty batch");
  await expectError(apply(db, STAFF.owner, { rows: Array.from({ length: 201 }, (_, i) => ({ key: `k${i}` })) }), /від 1 до 200/, "batch too big");
  await expectError(apply(db, STAFF.owner, { dryRun: false, rows: [{ key: "PR-001", price: 1 }] }), /ідентифікатор імпорту/, "apply needs runId");

  // 2. Export: any staff member, list filters, sorted by SKU, pages capped at 1000.
  const exported = (await as(db, "authenticated", STAFF.content, () => one(db, "select public.admin_export_products() r"))).r;
  assert.equal(exported.total, 4);
  assert.deepEqual(exported.rows.map(row => row.sku), ["00123", "PR-001", "PR-002", "PR-003"]);
  assert.equal(Number(exported.rows[2].oldAmount), 1200);
  assert.equal(exported.rows[2].brand.length > 0, true);
  const filtered = (await as(db, "authenticated", STAFF.owner, () => one(db,
    "select public.admin_export_products(query_text => 'Бета', filter_publication => 'published', page_size => 5000) r"))).r;
  assert.equal(filtered.total, 1);
  assert.equal(filtered.pageSize, 1000);
  assert.equal((await as(db, "authenticated", STAFF.owner, () => one(db, "select public.admin_export_products(filter_price => 'on_request') r"))).r.rows[0].legacyId, "p-3");

  // 3. Dry run: per-row results, nothing written.
  const rows = [
    { line: 2, key: "pr-001", price: "1 250,50" },                              // changed, SKU case-insensitive
    { line: 3, key: "PR-002", price: 1300 },                                    // old price 1200 dropped with a warning
    { line: 4, key: "PR-003", price: 450, inventoryStatus: "in_stock" },        // on_request -> known
    { line: 5, key: "00123", price: 300, inventoryStatus: "in_stock" },         // unchanged
    { line: 6, key: "NOPE-1", price: 10 },                                      // not found
    { line: 7, key: "PR-001", price: 5 },                                       // duplicate in file
    { line: 8, key: "", price: 5 },                                             // empty key
    { line: 9, key: "PR-00X", price: 1 }                                        // not found
  ];
  const revisionBefore = await revision(db);
  const preview = await apply(db, STAFF.manager, { matchBy: "sku", dryRun: true, rows });
  const lines = byLine(preview);
  assert.equal(preview.dryRun, true);
  assert.deepEqual(preview.counts, { changed: 3, unchanged: 1, notFound: 2, invalid: 2 });
  assert.equal(lines[2].status, "changed");
  assert.equal(Number(lines[2].after.amount), 1250.5);
  assert.equal(Number(lines[2].before.amount), 1000);
  assert.equal(lines[2].legacyId, "p-1");
  assert.equal(lines[3].after.oldAmount, null);
  assert.match(lines[3].message, /Стару ціну прибрано/);
  assert.equal(lines[4].after.priceStatus, "known");
  assert.equal(lines[5].status, "unchanged");
  assert.equal(lines[6].status, "not_found");
  assert.match(lines[6].message, /«NOPE-1» не знайдено/);
  assert.match(lines[7].message, /повторюється у файлі \(рядок 2\)/);
  assert.match(lines[8].message, /Порожній SKU/);
  assert.equal((await product(db, "p-1")).amount, 1000, "dry run writes nothing");
  assert.equal(await revision(db), revisionBefore, "dry run leaves the cache revision");
  assert.equal((await one(db, "select count(*)::int c from public.import_runs")).c, 0);

  // 4. Validation per row: one bad row never stops the others.
  const invalid = byLine(await apply(db, STAFF.owner, { dryRun: true, rows: [
    { line: 2, key: "PR-001", price: -5 },
    { line: 3, key: "PR-002", price: "12a" },
    { line: 4, key: "PR-001x", price: 1 },
    { line: 5, key: "p-1", price: 0 }
  ] }));
  assert.match(invalid[2].message, /від’ємною/);
  assert.match(invalid[3].message, /не є числом/);
  assert.equal(invalid[4].status, "not_found");
  assert.equal(invalid[5].status, "not_found", "matchBy sku ignores legacy ids");
  const more = byLine(await apply(db, STAFF.owner, { dryRun: true, rows: [
    { line: 2, key: "PR-001", price: 0 },
    { line: 3, key: "PR-001x" },
    { line: 4, key: "PR-002", price: 500, oldPrice: 400 },
    { line: 5, key: "PR-002", priceStatus: "free" }
  ] }));
  assert.match(more[2].message, /більшою за 0/);
  assert.match(more[4].message, /Стара ціна \(400(\.00)?\) має бути більшою за ціну \(500(\.00)?\)/);
  assert.equal(more[5].message, "SKU повторюється у файлі (рядок 4).");
  const statusRows = byLine(await apply(db, STAFF.owner, { dryRun: true, rows: [
    { line: 2, key: "PR-002", priceStatus: "free" },
    { line: 3, key: "PR-001", inventoryStatus: "lots" },
    { line: 4, key: "PR-003", priceStatus: "known" },
    { line: 5, key: "00123", price: 10, priceStatus: "on_request" },
    { line: 6, key: "PR-003", oldPrice: 99 }
  ] }));
  assert.match(statusRows[2].message, /Невідомий статус ціни «free»/);
  assert.match(statusRows[3].message, /Невідомий статус наявності «lots»/);
  assert.match(statusRows[4].message, /потрібна ціна/);
  assert.match(statusRows[5].message, /статус ціни — «За запитом»/);
  assert.equal(statusRows[6].status, "invalid", "duplicate key");

  // 5. Apply in two batches of one import: products, audit, cards, revision, import_runs.
  const batch1 = await apply(db, STAFF.manager, { matchBy: "sku", dryRun: false, runId: RUN, fileName: "supplier.csv", rows: rows.slice(0, 4) });
  assert.deepEqual(batch1.counts, { changed: 3, unchanged: 1, notFound: 0, invalid: 0 });
  assert.match(batch1.catalogVersion, /^v-price:admin:\d+$/);
  assert.deepEqual(await product(db, "p-1"), { amount: 1250.5, old_amount: null, price_status: "known", inventory_status: "in_stock" });
  assert.deepEqual(await product(db, "p-2"), { amount: 1300, old_amount: null, price_status: "known", inventory_status: "in_stock" });
  assert.deepEqual(await product(db, "p-3"), { amount: 450, old_amount: null, price_status: "known", inventory_status: "in_stock" });
  assert.deepEqual(await card(db, "p-1"), { amount: 1250.5, price_status: "known", inventory_status: "in_stock" }, "public card refreshed");
  assert.equal((await card(db, "p-3")).amount, 450);
  assert.ok(await revision(db) > revisionBefore, "apply bumps the cache revision");
  const audit = await one(db, `select count(*)::int c, min(actor_id::text) actor, bool_and(changed_sections @> array['commercial', 'price_import']) sections,
    bool_and(after_state ->> 'runId' = $1) run from public.product_admin_audit where action = 'update'`, [RUN]);
  assert.deepEqual(audit, { c: 3, actor: STAFF.manager, sections: true, run: true }, "one audit row per changed product");
  let importRun = await one(db, "select status::text, records_seen, records_succeeded, records_failed, source_ref, metadata from public.import_runs where internal_id = $1", [RUN]);
  assert.equal(importRun.status, "succeeded");
  assert.equal(importRun.records_seen, 4);
  assert.equal(importRun.source_ref, "supplier.csv");
  assert.equal(importRun.metadata.kind, "admin_price_import");

  const batch2 = await apply(db, STAFF.manager, { matchBy: "sku", dryRun: false, runId: RUN, fileName: "supplier.csv", rows: [
    { line: 6, key: "NOPE-1", price: 10 },
    { line: 10, key: "PR-002", oldPrice: "1 500", inventoryStatus: "out_of_stock" },
    { line: 11, key: "PR-001", oldPrice: 900 }
  ] });
  assert.deepEqual(batch2.counts, { changed: 1, unchanged: 0, notFound: 1, invalid: 1 });
  assert.deepEqual(await product(db, "p-2"), { amount: 1300, old_amount: 1500, price_status: "known", inventory_status: "out_of_stock" });
  assert.equal((await product(db, "p-1")).old_amount, null, "invalid row left untouched");
  importRun = await one(db, "select status::text, records_seen, records_succeeded, records_failed, metadata from public.import_runs where internal_id = $1", [RUN]);
  assert.deepEqual([importRun.status, importRun.records_seen, importRun.records_succeeded, importRun.records_failed], ["partial", 7, 5, 2]);
  assert.equal(importRun.metadata.batches, 2);
  assert.equal(importRun.metadata.changed, 4);

  // Another user cannot append to someone else's run.
  await expectError(apply(db, STAFF.owner, { dryRun: false, runId: RUN, rows: [{ key: "PR-001", price: 1 }] }), /іншому запуску/, "foreign run");

  // 6. Legacy id matching, switching to on_request clears prices, oldPrice 0 clears.
  const byLegacy = await apply(db, STAFF.owner, { matchBy: "legacy_id", dryRun: false, runId: "6f1c2a52-0000-4000-8000-0000000000bb", rows: [
    { line: 2, key: "p-2", priceStatus: "on_request" },
    { line: 3, key: "p-4", price: "1299,00", oldPrice: 0 },
    { line: 4, key: "PR-001", price: 1 }
  ] });
  assert.deepEqual(byLegacy.counts, { changed: 2, unchanged: 0, notFound: 1, invalid: 0 });
  assert.deepEqual(await product(db, "p-2"), { amount: null, old_amount: null, price_status: "on_request", inventory_status: "out_of_stock" });
  assert.equal(await card(db, "p-2").then(row => row.price_status), "on_request");
  assert.deepEqual(await product(db, "p-4"), { amount: 1299, old_amount: null, price_status: "known", inventory_status: "in_stock" });
  assert.equal(await card(db, "p-4"), undefined, "drafts stay off the storefront");

  // 7. Without an active release the import still works (fresh/QA databases), no catalogue version.
  await db.query("update public.catalog_snapshot_releases set ready = false");
  const noRelease = await apply(db, STAFF.owner, { dryRun: false, runId: "6f1c2a52-0000-4000-8000-0000000000cc", rows: [{ key: "PR-001", price: 1111 }] });
  assert.equal(noRelease.counts.changed, 1);
  assert.equal(noRelease.catalogVersion, null);
  await db.query("update public.catalog_snapshot_releases set ready = true");

  console.log(JSON.stringify({ status: "ok", scenarios: 7, suite: "price-import" }));
}
