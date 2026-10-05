// FX pricing scenarios: UAH / EUR / USD supplier prices, VAT, NBU rate + markup, whole hryvnia,
// skipped products without a rate, old price handling, cards refresh, access.
import assert from "node:assert/strict";

const STAFF = { owner: "00000000-0000-4000-8000-000000000061", content: "00000000-0000-4000-8000-000000000062" };

async function as(db, role, userId, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  if (role) await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec("reset role"); }
}

async function expectError(promise, pattern, label) {
  try { await promise; } catch (error) {
    assert.match(error.message, pattern, `${label}: unexpected error ${error.message}`);
    return;
  }
  assert.fail(`${label}: expected an error`);
}

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const product = (db, legacyId) => one(db, "select amount::float8 amount, old_amount::float8 old_amount, price_status::text price_status from public.products where legacy_id = $1", [legacyId]);
const card = (db, legacyId) => one(db, "select amount::float8 amount from public.catalog_product_cards where snapshot_version = 'v-fx' and legacy_id = $1", [legacyId]);

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query("insert into public.admin_profiles (user_id, name, role) values ($1, 'Власник', 'owner'), ($2, 'Контент', 'content_manager')", [STAFF.owner, STAFF.content]);

  const brand = await one(db, "select internal_id from public.brands where status = 'active' order by stable_id limit 1");
  const leaf = await one(db, "select internal_id from public.categories where level = 3 and status = 'active' and visibility = 'catalog' order by stable_id limit 1");
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, old_amount, price_status, inventory_status, publication_status)
    values ('fx-uah', 'FX-1', 'fx-uah', 'Котел UAH', 'UAH', 'U', $1, $2, 1000, null, 'known', 'in_stock', 'published'),
           ('fx-uah-net', 'FX-2', 'fx-uah-net', 'Насос без ПДВ', 'Net', 'N', $1, $2, null, null, 'on_request', 'unknown', 'published'),
           ('fx-eur', 'FX-3', 'fx-eur', 'Бойлер EUR', 'EUR', 'E', $1, $2, 100, 99999, 'known', 'in_stock', 'published'),
           ('fx-usd', 'FX-4', 'fx-usd', 'Фільтр USD', 'USD', 'D', $1, $2, 500, null, 'known', 'in_stock', 'published'),
           ('fx-none', 'FX-5', 'fx-none', 'Без джерела', 'None', 'X', $1, $2, 777, null, 'known', 'in_stock', 'published')`,
    [brand.internal_id, leaf.internal_id]);
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-fx', 'test', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 5, 5, repeat('0', 64), true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-fx') on conflict (singleton) do update set snapshot_version = 'v-fx'");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-fx')
    on conflict (singleton) do update set base_snapshot_version = 'v-fx', revision = 0`);
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id order by legacy_id)) from public.products where legacy_id like 'fx-%'");

  await db.query(`insert into public.product_price_sources (product_id, base_amount, currency, vat_included, source)
    select internal_id, v.base, v.cur, v.vat, 'test'
    from public.products join (values ('fx-uah', 1234.40, 'UAH', true), ('fx-uah-net', 1000.00, 'UAH', false),
      ('fx-eur', 100.00, 'EUR', false), ('fx-usd', 10.00, 'USD', true)) v(legacy, base, cur, vat) on v.legacy = legacy_id`);

  // 1. Access: helpers are hidden from API roles, the admin wrapper needs a product manager.
  await expectError(as(db, "anon", null, () => db.query("select public.fx_recalculate_prices()")), /permission denied/, "anon recalc");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select public.fx_store_nbu_payload('[]')")), /permission denied/, "owner store payload");
  await expectError(as(db, "anon", null, () => db.query("select * from public.product_price_sources")), /permission denied/, "anon sources");
  await expectError(as(db, "authenticated", STAFF.content, () => db.query("select public.admin_fx_recalculate_prices()")), /власнику, адміністратору та менеджеру/, "content recalc");

  // 2. No rates yet: UAH prices apply, currency prices are skipped and keep their old amount.
  let result = (await as(db, "authenticated", STAFF.owner, () => one(db, "select public.admin_fx_recalculate_prices() r"))).r;
  assert.equal(result.changed, 2, JSON.stringify(result));
  assert.equal(result.skipped, 2);
  assert.equal((await product(db, "fx-uah")).amount, 1234, "UAH with VAT goes as is, rounded");
  assert.deepEqual(await product(db, "fx-uah-net"), { amount: 1200, old_amount: null, price_status: "known" }, "UAH without VAT gets +20%");
  assert.equal((await product(db, "fx-eur")).amount, 100, "no EUR rate: untouched");
  assert.equal((await product(db, "fx-none")).amount, 777, "products without a source are never touched");

  // 3. NBU payload: only EUR/USD stored, date parsed, rerun is an upsert.
  const nbu = [
    { r030: 978, txt: "Євро", rate: 48.1234, cc: "EUR", exchangedate: "05.10.2026" },
    { r030: 840, txt: "Долар США", rate: 41.5, cc: "USD", exchangedate: "05.10.2026" },
    { r030: 985, txt: "Злотий", rate: 11.2, cc: "PLN", exchangedate: "05.10.2026" }
  ];
  assert.equal((await one(db, "select public.fx_store_nbu_payload($1) n", [JSON.stringify(nbu)])).n, 2);
  assert.equal((await one(db, "select public.fx_store_nbu_payload($1) n", [JSON.stringify(nbu)])).n, 2);
  assert.equal((await one(db, "select count(*)::int n from public.fx_rates")).n, 2);
  assert.equal((await one(db, "select rate_date::text d from public.fx_rates where currency = 'EUR'")).d, "2026-10-05");
  await expectError(db.query("select public.fx_store_nbu_payload('{}')"), /not a JSON array/, "bad payload");

  // 4. Currency prices: base × VAT × rate × 1.025, whole hryvnia; a higher old price stays, a lower one goes.
  result = (await one(db, "select public.fx_recalculate_prices() r")).r;
  assert.equal(result.changed, 2, JSON.stringify(result));
  assert.equal(result.unchanged, 2);
  const eur = Math.round(100 * 1.2 * 48.1234 * 1.025);
  const usd = Math.round(10 * 41.5 * 1.025);
  assert.deepEqual(await product(db, "fx-eur"), { amount: eur, old_amount: 99999, price_status: "known" });
  assert.equal((await product(db, "fx-usd")).amount, usd);
  assert.equal((await card(db, "fx-eur")).amount, eur, "storefront card refreshed");
  assert.equal((await card(db, "fx-usd")).amount, usd);

  // 5. Next day's rate: the newest date wins; unchanged products are not rewritten.
  await db.query("insert into public.fx_rates (currency, rate_date, rate) values ('EUR', '2026-10-06', 50)");
  result = (await one(db, "select public.fx_recalculate_prices() r")).r;
  assert.equal(result.changed, 1);
  assert.equal((await product(db, "fx-eur")).amount, Math.round(100 * 1.2 * 50 * 1.025));
  await db.query("update public.product_price_sources set base_amount = 2000 where product_id = (select internal_id from public.products where legacy_id = 'fx-eur')");
  result = (await one(db, "select public.fx_recalculate_prices() r")).r;
  assert.equal(result.changed, 1, "an old price below the new price is cleared");
  assert.equal((await product(db, "fx-eur")).amount, Math.round(2000 * 1.2 * 50 * 1.025));
  assert.equal((await product(db, "fx-eur")).old_amount, null);

  // 6. Inactive source and disabled switch.
  await db.query("update public.product_price_sources set active = false where product_id = (select internal_id from public.products where legacy_id = 'fx-usd')");
  await db.query("update public.products set amount = 1 where legacy_id = 'fx-usd'");
  await one(db, "select public.fx_recalculate_prices()");
  assert.equal((await product(db, "fx-usd")).amount, 1, "inactive source is ignored");
  await db.query("update public.price_fx_settings set enabled = false");
  assert.equal((await one(db, "select public.fx_recalculate_prices() r")).r.status, "disabled");

  // 7. Without pg_net the fetch is logged as skipped and ingest still recalculates.
  await db.query("update public.price_fx_settings set enabled = true");
  assert.equal((await one(db, "select public.fx_request_nbu_rates() r")).r, null);
  assert.equal((await one(db, "select status from public.fx_fetch_log order by internal_id desc limit 1")).status, "skipped");
  assert.equal((await one(db, "select public.fx_ingest_nbu_rates() r")).r.prices.status, "ok");
  assert.ok((await one(db, "select count(*)::int n from public.price_fx_runs")).n >= 5, "every run is logged");

  console.log(JSON.stringify({ status: "ok", scenario: "fx-pricing" }));
}
