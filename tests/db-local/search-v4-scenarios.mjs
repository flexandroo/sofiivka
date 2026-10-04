// Catalogue search v4 (20261005000500, AUD-025): brand synonyms (Cyrillic spellings), the SKU-prefix
// bonus only for queries with a digit, and unchanged results for every other query.
import assert from "node:assert/strict";

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const search = async (db, query, fn = "search_catalog") =>
  (await one(db, `select public.${fn}($1, 48, 6, 6, 6) r`, [query])).r;
const ids = result => result.products.map(product => product.id);
const sorted = list => [...list].sort();

export async function run(db) {
  const brand = async id => (await one(db, "select internal_id from public.brands where stable_id = $1", [id])).internal_id;
  const leaf = await one(db, `select internal_id from public.categories
    where level = 3 and status = 'active' and visibility = 'catalog' order by stable_id limit 1`);
  const rows = [
    // legacy_id, sku, title, model, brand
    ["a-1", "7112345", "Котел газовий BAXI Luna 24", "LUNA24", "baxi"],
    ["a-2", "baxi-sb-25", "Сонячний колектор BAXI SB 25", "SB25", "baxi"],
    ["a-3", "grundfos-flange-32", "Фланець для насоса Grundfos", "FL32", "grundfos"],
    ["a-4", "99160579", "Насос циркуляційний Grundfos ALPHA2 25-60", "ALPHA2 25-60", "grundfos"],
    ["a-5", "FPV12ECO", "Фільтр Ecosoft FPV12", "FPV12", "ecosoft"],
    ["a-6", "TH-1200", "Насос поверхневий 1200", "TH1200", "tekk"],
    ["a-7", "WS-25", "Насос Wilo Star 25/4", "STAR25", "wilo"],
    ["a-8", "MO550MECOSTD", "Змішувач для кухні", "MECO", "altep"],
    ["a-9", "TJ-10", "Котел твердопаливний 10", "TJ10", "termojet"]
  ];
  for (const [legacyId, sku, title, model, brandId] of rows) {
    await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
        amount, old_amount, price_status, inventory_status, publication_status)
      values ($1, $2, $1, $3, $3, $4, $5, $6, 100, null, 'known', 'in_stock', 'published')`,
      [legacyId, sku, title, model, await brand(brandId), leaf.internal_id]);
  }
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    select 'v-search4', 'test',
      (select jsonb_agg(jsonb_build_object('id', c.stable_id, 'title', c.title, 'shortTitle', c.short_title,
         'parentId', parent.stable_id, 'status', c.status) order by c.level, c.stable_id)
       from public.categories c left join public.categories parent on parent.internal_id = c.parent_id
       where c.status = 'active'),
      (select jsonb_agg(jsonb_build_object('id', b.stable_id, 'name', b.name) order by b.stable_id)
       from public.brands b where b.status = 'active'),
      '{}'::jsonb, ${rows.length}, ${rows.length}, repeat('0', 64), true`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-search4')");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-search4')
    on conflict (singleton) do update set base_snapshot_version = 'v-search4', revision = 0`);
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id order by legacy_id)) from public.products where legacy_id like 'a-%'");
  assert.equal((await one(db, "select count(*)::int c from public.catalog_product_cards where snapshot_version = 'v-search4'")).c, rows.length);

  // 1. Synonyms are seeded for the seeded brands, linked by stable_id.
  const seeded = await one(db, "select count(*)::int c, count(distinct brand_id)::int brands from public.catalog_search_synonyms");
  assert.ok(seeded.c >= 60 && seeded.brands >= 30, JSON.stringify(seeded));
  const expand = async query => (await one(db, "select public._catalog_search_expand($1) x", [query])).x;
  assert.equal(await expand("Грундфос"), "grundfos");
  assert.equal(await expand("насос  грундфос"), "насос grundfos");
  assert.equal(await expand("текк хаус"), "tekk haus");
  assert.equal(await expand("грундф"), "grundfos", "half-typed brand");
  assert.equal(await expand("грун"), null, "too short to guess");
  assert.equal(await expand("термо"), null, "a common word start is not a brand");
  assert.equal(await expand("насос"), null);
  assert.equal(await expand("grundfos"), null);

  // 2. Cyrillic brand spellings find the brand's products and the brand itself.
  const brandCases = {
    "грундфос": ["a-3", "a-4"], "Грундфос": ["a-3", "a-4"], "екософт": ["a-5"], "баксі": ["a-1", "a-2"], "бакси": ["a-1", "a-2"],
    "віло": ["a-7"], "текхаус": ["a-6"], "текк хаус": ["a-6"], "термоджет": ["a-9"], "альтеп": ["a-8"], "грундф": ["a-3", "a-4"]
  };
  for (const [query, expected] of Object.entries(brandCases)) {
    const result = await search(db, query);
    assert.deepEqual(sorted(ids(result)), expected, query);
    assert.equal(result.totalProducts, expected.length, query);
    assert.ok(result.brands.length >= 1, `${query}: brand hit`);
  }
  assert.equal((await search(db, "грундфос")).brands[0].entity.id, "grundfos");
  assert.equal((await search(db, "грундфос")).brands[0].count, 2);
  assert.deepEqual(ids(await search(db, "насос грундфос")), ["a-4"], "synonym inside a longer query");

  // 3. SKU-prefix bonus only with a digit: «baxi» no longer puts the collector (SKU baxi-…) first.
  const baxiV3 = await search(db, "baxi", "_catalog_search_v3");
  assert.equal(ids(baxiV3)[0], "a-2", "v3 ranked the collector first");
  const baxi = await search(db, "baxi");
  assert.deepEqual(ids(baxi), ["a-1", "a-2"], "boiler first now");
  assert.ok(baxi.productHits.every(hit => hit.score < 18000));
  const grundfos = await search(db, "grundfos");
  assert.ok(grundfos.productHits.every(hit => hit.score < 18000), "grundfos-flange SKU gets no bonus");
  for (const [query, id] of [["MO550", "a-8"], ["9916", "a-4"], ["th-12", "a-6"]]) {
    const hit = (await search(db, query)).productHits[0];
    assert.equal(hit.product.id, id, query);
    assert.equal(hit.score, 18000, `${query}: SKU prefix with a digit keeps the bonus`);
  }
  assert.equal((await search(db, "MO550MECOSTD")).productHits[0].score, 100000, "exact SKU");

  // 4. Every other query: same products, order and totals as v3.
  for (const query of ["насос", "котел", "фланець", "luna", "alpha2 25-60", "фільтр", "FPV12", "star", "змішувач", "насоз", "щщщщ"]) {
    const v3 = await search(db, query, "_catalog_search_v3");
    const v4 = await search(db, query);
    assert.deepEqual(ids(v4), ids(v3), query);
    assert.equal(v4.totalProducts, v3.totalProducts, query);
    assert.deepEqual(v4.categories, v3.categories, query);
    assert.deepEqual(v4.brands, v3.brands, query);
    assert.deepEqual(v4.series, v3.series, query);
  }

  // 5. Access: public wrapper only; synonyms table and helpers are private.
  await db.exec("set role anon");
  try {
    assert.equal((await search(db, "грундфос")).products.length, 2);
    await assert.rejects(db.query("select public._catalog_search_v4('насос')"), /permission denied/);
    await assert.rejects(db.query("select public._catalog_search_expand('насос')"), /permission denied/);
    await assert.rejects(db.query("select * from public.catalog_search_synonyms"), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
  console.log(JSON.stringify({ status: "ok", scenarios: 5, suite: "search-v4" }));
}
