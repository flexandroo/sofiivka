// Default catalogue order: priced and in stock, then priced, then on request. Price sorting and id lists keep their order.
import assert from "node:assert/strict";

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];

export async function run(db) {
  const brand = await one(db, "select internal_id from public.brands where status = 'active' order by stable_id limit 1");
  const leaf = await one(db, "select internal_id, stable_id from public.categories where level = 3 and status = 'active' and visibility = 'catalog' order by stable_id limit 1");
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status)
    values ('pf-1-request', 'PF-1', 'pf-1', 'За запитом', 'A', 'A', $1, $2, null, 'on_request', 'in_stock', 'published'),
           ('pf-2-unknown', 'PF-2', 'pf-2', 'Без ціни', 'B', 'B', $1, $2, null, 'unknown', 'unknown', 'published'),
           ('pf-3-priced', 'PF-3', 'pf-3', 'З ціною', 'C', 'C', $1, $2, 300, 'known', 'unknown', 'published'),
           ('pf-4-stock', 'PF-4', 'pf-4', 'З ціною в наявності', 'D', 'D', $1, $2, 500, 'known', 'in_stock', 'published'),
           ('pf-5-stock', 'PF-5', 'pf-5', 'Дешевший в наявності', 'E', 'E', $1, $2, 100, 'known', 'in_stock', 'published')`,
    [brand.internal_id, leaf.internal_id]);
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-pf', 'test', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 5, 5, repeat('0', 64), true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-pf') on conflict (singleton) do update set snapshot_version = 'v-pf'");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-pf')
    on conflict (singleton) do update set base_snapshot_version = 'v-pf', revision = 0`);
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id order by legacy_id)) from public.products where legacy_id like 'pf-%'");

  const ids = async args => (await one(db, `select public.get_catalog_products(${args}) as result`)).result.products.map(product => product.id);
  const scope = `scope_category => '${leaf.stable_id}'`;

  assert.deepEqual(await ids(scope), ["pf-4-stock", "pf-5-stock", "pf-3-priced", "pf-1-request", "pf-2-unknown"], "priced and in stock come first");
  assert.deepEqual((await ids(`${scope}, sort_mode => 'price-asc'`)).slice(0, 3), ["pf-5-stock", "pf-3-priced", "pf-4-stock"], "price sorting ignores stock");
  assert.deepEqual((await ids(`${scope}, sort_mode => 'price-desc'`)).slice(0, 3), ["pf-4-stock", "pf-3-priced", "pf-5-stock"]);
  assert.deepEqual(await ids(`product_ids => array['pf-1-request', 'pf-4-stock']`), ["pf-1-request", "pf-4-stock"], "id lists keep the existing order");

  const paged = (await one(db, `select public.get_catalog_products(${scope}, page_size => 2, page_number => 2) as result`)).result;
  assert.deepEqual(paged.products.map(product => product.id), ["pf-3-priced", "pf-1-request"], "paging follows the same order");
  assert.equal(paged.total, 5);
  console.log(JSON.stringify({ status: "ok", suite: "priced-first" }));
}
