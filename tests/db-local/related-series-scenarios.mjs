// Related products and series admin v1 scenarios: access by role, ordered relation lists,
// validation, concurrency, release payload and product page, audit, cache revision; series
// create / rename / delete (refused while used, or with unlinking) and card refresh.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000041",
  manager: "00000000-0000-4000-8000-000000000042",
  content: "00000000-0000-4000-8000-000000000043"
};

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
const content = async (db, sql, params) => (await as(db, "authenticated", STAFF.content, () => one(db, sql, params))).r;
const manager = async (db, sql, params) => (await as(db, "authenticated", STAFF.manager, () => one(db, sql, params))).r;
const revision = async db => Number((await one(db, "select revision from public.catalog_admin_cache_revision")).revision);
const publicProduct = async (db, id) => (await as(db, "anon", null, () => one(db, "select public.get_catalog_product($1) r", [id]))).r;
const relatedIds = async (db, id) => ((await publicProduct(db, id))?.relatedProducts || []).map(card => card.id);
const payload = async (db, id) => (await one(db, `select snapshot.payload p from public.catalog_product_snapshots snapshot
  join public.catalog_snapshot_pointer pointer on pointer.snapshot_version = snapshot.snapshot_version
  where snapshot.legacy_id = $1`, [id]))?.p;
const card = async (db, id) => one(db, `select card.series_id, card.search_text from public.catalog_product_cards card
  join public.catalog_snapshot_pointer pointer on pointer.snapshot_version = card.snapshot_version
  where card.legacy_id = $1`, [id]);
const listIds = relations => Object.fromEntries(Object.entries(relations).map(([kind, items]) => [kind, items.map(item => item.legacyId)]));

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  const brand = await one(db, "select internal_id, stable_id from public.brands where status = 'active' order by stable_id limit 1");
  const leaf = await one(db, `select internal_id from public.categories
    where level = 3 and status = 'active' and visibility = 'catalog' order by stable_id limit 1`);
  const rows = [
    ["r-1", "Котел Альфа", 1000, "published"], ["r-2", "Димохід Бета", 200, "published"],
    ["r-3", "Насос Гамма", 500, "published"], ["r-4", "Котел Дельта", 1100, "published"],
    ["r-5", "Кран Епсилон", 50, "draft"], ["r-6", "Котел Зета", 990, "published"],
    ["r-7", "Котел Ета", 1300, "published"]
  ];
  for (const [id, title, amount, status] of rows) {
    await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
        amount, price_status, inventory_status, publication_status)
      values ($1, upper($1), $1, $2, $2, $1, $3, $4, $5, 'known', 'in_stock', $6)`, [id, title, brand.internal_id, leaf.internal_id, amount, status]);
  }

  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-rel', 'test', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 7, 6, repeat('0', 64), true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-rel')");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-rel')
    on conflict (singleton) do update set base_snapshot_version = 'v-rel', revision = 0`);
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id order by legacy_id)) from public.products where legacy_id like 'r-%'");

  // 1. The payload always carries the three (empty) lists; the product page still has automatic similar items.
  assert.deepEqual((await payload(db, "r-1")).relatedProductIds, { accessory: [], compatible: [], similar: [] });
  const automaticBefore = await relatedIds(db, "r-1");
  assert.equal(automaticBefore.length, 4, "four automatic similar products");
  assert.ok(!automaticBefore.includes("r-5"), "drafts never appear");

  // 2. Access: anon none, manager reads only, content manager edits.
  await expectError(as(db, "anon", null, () => db.query("select public.admin_get_product_relations('r-1')")), /permission denied/, "anon read");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_set_product_relations('r-1', '{}', null)")), /permission denied/, "anon set");
  await expectError(as(db, "authenticated", "00000000-0000-4000-8000-0000000000ff", () => db.query("select public.admin_get_product_relations('r-1')")), /Not authorized/, "no profile");
  const managerView = await manager(db, "select public.admin_get_product_relations('r-1') r");
  assert.equal(managerView.canEdit, false);
  assert.equal(managerView.limit, 24);
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_set_product_relations('r-1', $1, null)", [{ accessory: ["r-2"] }])),
    /Недостатньо прав/, "manager set");
  assert.equal(await content(db, "select public.admin_get_product_relations('nope') r"), null);

  // 3. Save ordered lists; the release payload and product page follow.
  let detail = await content(db, "select public.admin_get_product_relations('r-1') r");
  assert.equal(detail.canEdit, true);
  let revisionBefore = await revision(db);
  detail = await content(db, "select public.admin_set_product_relations('r-1', $1, $2) r",
    [{ accessory: ["r-2", "r-5"], compatible: ["r-3"], similar: ["r-7"] }, detail.state]);
  assert.deepEqual(listIds(detail.relations), { accessory: ["r-2", "r-5"], compatible: ["r-3"], similar: ["r-7"] });
  assert.deepEqual(detail.state, { accessory: ["r-2", "r-5"], compatible: ["r-3"], similar: ["r-7"] });
  assert.equal(detail.relations.accessory[1].inCatalog, false, "draft is flagged in the editor");
  assert.ok(await revision(db) > revisionBefore, "relation change bumps the cache revision");
  assert.deepEqual((await payload(db, "r-1")).relatedProductIds, { accessory: ["r-2", "r-5"], compatible: ["r-3"], similar: ["r-7"] });
  let page = await publicProduct(db, "r-1");
  assert.match(page.version, /:admin:/);
  const ids = page.relatedProducts.map(item => item.id);
  assert.deepEqual(ids.slice(0, 3), ["r-2", "r-3", "r-7"], "manual cards first, in kind and list order; drafts skipped");
  assert.deepEqual(ids.slice(3).sort(), ["r-4", "r-6"], "automatic similar fill with the remaining candidates");
  assert.equal(new Set(ids).size, ids.length, "no duplicates");
  assert.ok(!ids.includes("r-5") && !ids.includes("r-1"));
  assert.deepEqual((await payload(db, "r-2")).relatedProductIds.accessory, [], "relations are one-directional");

  // Audit in the product history.
  const audit = await one(db, `select action, changed_sections, before_state, after_state from public.product_admin_audit
    where legacy_id = 'r-1' and 'relations' = any(changed_sections) order by created_at desc limit 1`);
  assert.equal(audit.action, "update");
  assert.deepEqual(audit.after_state.relatedProductIds.accessory, ["r-2", "r-5"]);
  assert.deepEqual(audit.before_state.relatedProductIds.accessory, []);

  // Reorder one kind; kinds left out stay as they are.
  detail = await content(db, "select public.admin_set_product_relations('r-1', $1, $2) r", [{ accessory: ["r-5", "r-2"] }, detail.state]);
  assert.deepEqual(listIds(detail.relations), { accessory: ["r-5", "r-2"], compatible: ["r-3"], similar: ["r-7"] });
  assert.deepEqual((await payload(db, "r-1")).relatedProductIds.accessory, ["r-5", "r-2"]);

  // Same lists again: no audit row, no revision bump.
  const auditCount = async () => (await one(db, "select count(*)::int c from public.product_admin_audit where legacy_id = 'r-1'")).c;
  const auditBefore = await auditCount();
  revisionBefore = await revision(db);
  detail = await content(db, "select public.admin_set_product_relations('r-1', $1, null) r", [{ accessory: ["r-5", "r-2"], similar: ["r-7"] }]);
  assert.equal(await auditCount(), auditBefore);
  assert.equal(await revision(db), revisionBefore);

  // 4. Guards: nothing changes on a refused save.
  const stale = { accessory: [], compatible: [], similar: [] };
  await expectError(content(db, "select public.admin_set_product_relations('r-1', $1, $2) r", [{ similar: [] }, stale]), /інший працівник/, "stale state");
  await expectError(content(db, "select public.admin_set_product_relations('r-1', $1, null) r", [{ similar: ["r-1"] }]), /самим собою/, "self");
  await expectError(content(db, "select public.admin_set_product_relations('r-1', $1, null) r", [{ similar: ["r-3", "r-3"] }]), /повторюється у блоці «Схожі товари»/, "duplicate");
  await expectError(content(db, "select public.admin_set_product_relations('r-1', $1, null) r", [{ spare: ["r-3"] }]), /Невідомий тип/, "unknown kind");
  await expectError(content(db, "select public.admin_set_product_relations('r-1', $1, null) r", [{ similar: ["nope"] }]), /«nope» не знайдено/, "missing product");
  await expectError(content(db, "select public.admin_set_product_relations('r-1', $1, null) r", [{ similar: "r-3" }]), /Некоректний/, "not an array");
  await expectError(content(db, "select public.admin_set_product_relations('r-1', $1, null) r",
    [{ accessory: Array.from({ length: 25 }, (_, index) => `x-${index}`) }]), /до 24 товарів/, "too many");
  await expectError(content(db, "select public.admin_set_product_relations('r-1', $1, null) r", [{ compatible: [], similar: ["r-1"] }]), /самим собою/, "validated before writing");
  await expectError(content(db, "select public.admin_set_product_relations('nope', $1, null) r", [{}]), /Товар не знайдено/, "missing product page");
  assert.deepEqual((await content(db, "select public.admin_get_product_relations('r-1') r")).state,
    { accessory: ["r-5", "r-2"], compatible: ["r-3"], similar: ["r-7"] }, "refused saves change nothing");

  // 5. The related product leaves the catalogue: the page skips it, the payload keeps the id.
  await db.query("update public.products set publication_status = 'hidden' where legacy_id = 'r-3'");
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id)) from public.products where legacy_id = 'r-3'");
  page = await publicProduct(db, "r-1");
  assert.ok(!page.relatedProducts.some(item => item.id === "r-3"), "hidden product is not shown");
  await db.query("update public.products set publication_status = 'published' where legacy_id = 'r-3'");
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id)) from public.products where legacy_id = 'r-3'");

  // Helpers stay private.
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select public._product_relation_legacy_ids(gen_random_uuid())")), /permission denied/, "helper hidden");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select public._admin_product_payload_base(gen_random_uuid(), '{}')")), /permission denied/, "base hidden");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select * from public.product_relations")), /permission denied/, "table hidden");

  // 6. Series: create.
  await expectError(as(db, "anon", null, () => db.query("select public.admin_list_brand_series($1)", [brand.stable_id])), /permission denied/, "anon series");
  const managerSeries = await manager(db, "select public.admin_list_brand_series($1) r", [brand.stable_id]);
  assert.equal(managerSeries.canEdit, false);
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_create_series($1, $2)", [brand.stable_id, { name: "X" }])), /Недостатньо прав/, "manager create");
  let series = await content(db, "select public.admin_create_series($1, $2) r", [brand.stable_id, { name: "Преміум Лайн" }]);
  const premium = series.series.find(item => item.name === "Преміум Лайн");
  assert.equal(premium.slug, "premium-lain");
  assert.equal(premium.id, `${brand.stable_id}-premium-lain`);
  assert.equal(premium.productCount, 0);
  await expectError(content(db, "select public.admin_create_series($1, $2)", [brand.stable_id, { name: "преміум лайн" }]), /вже є серія/, "duplicate name");
  await expectError(content(db, "select public.admin_create_series($1, $2)", [brand.stable_id, { name: "Інша", slug: "premium-lain" }]), /зайнятий/, "duplicate code");
  await expectError(content(db, "select public.admin_create_series($1, $2)", [brand.stable_id, { name: "Інша", slug: "Bad Code" }]), /латинські/, "bad code");
  await expectError(content(db, "select public.admin_create_series($1, $2)", [brand.stable_id, { name: "  " }]), /обов/, "empty name");
  await expectError(content(db, "select public.admin_create_series('no-brand', $1)", [{ name: "X" }]), /Бренд не знайдено/, "missing brand");
  series = await content(db, "select public.admin_create_series($1, $2) r", [brand.stable_id, { name: "Еко" }]);
  const eco = series.series.find(item => item.name === "Еко");

  // Products join the series (through the product editor in real life).
  await db.query("update public.products set series_id = (select internal_id from public.product_series where stable_id = $1) where legacy_id in ('r-1', 'r-2')", [premium.id]);
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id)) from public.products where legacy_id in ('r-1', 'r-2')");
  assert.equal((await card(db, "r-1")).series_id, premium.id);
  series = await content(db, "select public.admin_list_brand_series($1) r", [brand.stable_id]);
  assert.equal(series.series.find(item => item.id === premium.id).productCount, 2);
  assert.equal(series.series.find(item => item.id === premium.id).publishedCount, 2);

  // 7. Rename refreshes the member cards and bumps the revision; stale saves are refused.
  revisionBefore = await revision(db);
  series = await content(db, "select public.admin_update_series($1, $2, $3) r", [premium.id, { name: "Преміум Плюс" }, premium.updatedAt]);
  const renamed = series.series.find(item => item.id === premium.id);
  assert.equal(renamed.name, "Преміум Плюс");
  assert.equal(renamed.slug, "premium-lain", "code stays");
  assert.match((await card(db, "r-2")).search_text, /Преміум Плюс/);
  assert.ok(await revision(db) > revisionBefore, "rename bumps the cache revision");
  await expectError(content(db, "select public.admin_update_series($1, $2, $3)", [premium.id, { name: "Ще" }, premium.updatedAt]), /інший працівник/, "stale rename");
  await expectError(content(db, "select public.admin_update_series($1, $2, null)", [premium.id, { name: "еко" }]), /вже є серія/, "rename clash");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_update_series($1, $2, null)", [premium.id, { name: "X" }])), /Недостатньо прав/, "manager rename");
  revisionBefore = await revision(db);
  await content(db, "select public.admin_update_series($1, $2, null) r", [eco.id, { description: "Опис" }]);
  assert.equal(await revision(db), revisionBefore, "description alone does not touch the storefront");
  const history = await one(db, "select count(*)::int c from public.taxonomy_admin_audit where entity_type = 'series' and stable_id = $1", [premium.id]);
  assert.equal(history.c, 2, "create and rename audited");

  // 8. Delete: refused while used; with unlinking the products lose the series and their cards follow.
  await expectError(content(db, "select public.admin_delete_series($1, $2)", [premium.id, renamed.updatedAt]), /використовують товари \(2\)/, "used series");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_delete_series($1, null, true)", [premium.id])), /Недостатньо прав/, "manager delete");
  await expectError(content(db, "select public.admin_delete_series($1, $2, true)", [premium.id, "2000-01-01T00:00:00Z"]), /інший працівник/, "stale delete");
  revisionBefore = await revision(db);
  series = await content(db, "select public.admin_delete_series($1, $2, true) r", [premium.id, renamed.updatedAt]);
  assert.ok(!series.series.some(item => item.id === premium.id));
  assert.equal((await one(db, "select count(*)::int c from public.products where legacy_id in ('r-1', 'r-2') and series_id is not null")).c, 0);
  assert.equal((await card(db, "r-1")).series_id, null, "cards lose the series");
  assert.equal((await payload(db, "r-1")).seriesId, null);
  assert.deepEqual((await payload(db, "r-1")).relatedProductIds.accessory, ["r-5", "r-2"], "refresh keeps relations");
  assert.ok(await revision(db) > revisionBefore);
  assert.equal((await one(db, "select count(*)::int c from public.product_admin_audit where 'series' = any(changed_sections)")).c, 2, "each unlinked product audited");
  revisionBefore = await revision(db);
  await content(db, "select public.admin_delete_series($1, null) r", [eco.id]);
  assert.equal(await revision(db), revisionBefore, "deleting an empty series does not touch the storefront");
  await expectError(content(db, "select public.admin_delete_series($1, null)", [eco.id]), /Серію не знайдено/, "already deleted");
  assert.equal((await one(db, "select count(*)::int c from public.taxonomy_admin_audit where entity_type = 'series'")).c, 6, "audit kept after delete");

  console.log(JSON.stringify({ status: "ok", scenarios: 8, suite: "related-series" }));
}
