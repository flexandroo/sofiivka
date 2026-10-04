// Catalogue search v3 (20261005000200): same hits as v2 for direct matches, typo fallback, apostrophes,
// category counts over the subtree, and access.
import assert from "node:assert/strict";

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const search = async (db, query, fn = "search_catalog") =>
  (await one(db, `select public.${fn}($1, 48, 6, 6, 6) r`, [query])).r;
const ids = result => result.products.map(product => product.id);

export async function run(db) {
  const brand = await one(db, "select internal_id from public.brands where status = 'active' order by stable_id limit 1");
  const leaf = await one(db, `select internal_id, parent_id from public.categories
    where level = 3 and status = 'active' and visibility = 'catalog' order by stable_id limit 1`);
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, old_amount, price_status, inventory_status, publication_status)
    values ('s-1', 'SKU-100', 's-1', 'Насос циркуляційний Гамма 25/60', 'Гамма', 'G25', $1, $2, 500, null, 'known', 'in_stock', 'published'),
           ('s-2', 'SKU-200', 's-2', 'Бойлер непрямого нагріву Бета 150', 'Бета', 'B150', $1, $2, 900, null, 'known', 'in_stock', 'published'),
           ('s-3', 'SKU-300', 's-3', 'Зʼєднання різьбове Омега', 'Омега', 'O3', $1, $2, 50, null, 'known', 'in_stock', 'published'),
           ('s-4', 'SKU-400', 's-4', 'Насос дренажний Дельта', 'Дельта', 'D4', $1, $2, 700, null, 'known', 'in_stock', 'published')`,
    [brand.internal_id, leaf.internal_id]);

  // Active release whose category list mirrors the taxonomy (id + parentId), as the publisher writes it.
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    select 'v-search', 'test',
      (select jsonb_agg(jsonb_build_object('id', c.stable_id, 'title', c.title, 'shortTitle', c.short_title,
         'parentId', parent.stable_id, 'status', c.status) order by c.level, c.stable_id)
       from public.categories c left join public.categories parent on parent.internal_id = c.parent_id
       where c.status = 'active'),
      '[]'::jsonb, '{}'::jsonb, 4, 4, repeat('0', 64), true`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-search')");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-search')
    on conflict (singleton) do update set base_snapshot_version = 'v-search', revision = 0`);
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id order by legacy_id)) from public.products where legacy_id like 's-%'");
  assert.equal((await one(db, "select count(*)::int c from public.catalog_product_cards where snapshot_version = 'v-search'")).c, 4);

  // 1. Direct matches return the same products in the same order as v2.
  for (const query of ["насос", "бойлер", "sku-200", "g25", "гамма 25/60", "дренажний"]) {
    const v2 = await search(db, query, "_catalog_search_v2");
    const v3 = await search(db, query);
    assert.deepEqual(ids(v3), ids(v2), query);
    assert.equal(v3.totalProducts, v2.totalProducts, query);
    assert.ok(v3.products.length > 0, query);
  }
  assert.deepEqual(ids(await search(db, "SKU-200")).slice(0, 1), ["s-2"]);
  assert.deepEqual(ids(await search(db, "насос")), ["s-1", "s-4"]);

  // 2. A typo still finds the product (fuzzy fallback only runs when nothing matches directly).
  assert.ok(ids(await search(db, "насоз")).includes("s-1"), "typo");
  assert.deepEqual(ids(await search(db, "щщщщщщ")), []);

  // 3. Apostrophes are ignored: ' and ʼ and ’ find the same product.
  for (const query of ["з'єднання", "зʼєднання", "з’єднання", "зєднання"]) {
    assert.deepEqual(ids(await search(db, query)), ["s-3"], query);
  }

  // 4. Category hits count products in the whole subtree; empty categories are left out.
  const root = await one(db, `select c.stable_id, c.title from public.categories c
    join public.categories mid on mid.parent_id = c.internal_id where mid.internal_id = $1`, [leaf.parent_id]);
  if (root) {
    const hit = (await search(db, root.title)).categories.find(item => item.entity.id === root.stable_id);
    assert.ok(hit, `parent category ${root.title} is found`);
    assert.equal(hit.count, 4);
  }
  const all = await one(db, "select array_agg(stable_id) ids from public.categories");
  for (const query of ["котл", "насос", "фільтр"]) {
    for (const item of (await search(db, query)).categories) {
      assert.ok(item.count > 0, `${query}: ${item.entity.id} has products`);
      assert.ok(all.ids.includes(item.entity.id));
    }
  }

  // 5. Public wrapper only.
  await db.exec("set role anon");
  try {
    assert.ok((await search(db, "насос")).products.length === 2);
    await assert.rejects(db.query("select public._catalog_search_v3('насос')"), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
  console.log(JSON.stringify({ status: "ok", scenarios: 5, suite: "search" }));
}
