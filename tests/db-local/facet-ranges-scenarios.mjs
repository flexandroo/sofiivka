// Numeric facet ranges (20261005000600, AUD-030): get_catalog_facets adds `technicalRanges` for numeric
// facets with more than 12 values; every existing key of the response is unchanged.
import assert from "node:assert/strict";

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const ARGS = "$1::text, null, null, null, null, $2::jsonb, null, null, null";

export async function run(db) {
  const brand = await one(db, "select internal_id, stable_id from public.brands where status = 'active' order by stable_id limit 1");
  const leaf = await one(db, `select internal_id, stable_id from public.categories
    where level = 3 and status = 'active' and visibility = 'catalog' order by stable_id limit 1`);
  const definitions = {
    headM: { id: "headM", label: "Напір", type: "number", unit: "м", filterable: true, rank: 1 },
    powerKw: { id: "powerKw", label: "Потужність", type: "number", unit: "кВт", filterable: true, rank: 2 },
    flowM3h: { id: "flowM3h", label: "Витрата", type: "number", unit: "м³/год", filterable: true, rank: 3 },
    material: { id: "material", label: "Матеріал", type: "select", unit: "", filterable: true, rank: 4 },
    code: { id: "code", label: "Код", type: "string", unit: "", filterable: true, rank: 5 }
  };
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-facets', 'test', $1, '[]'::jsonb, $2, 30, 30, repeat('0', 64), true)`,
    [JSON.stringify([{ id: leaf.stable_id, title: "Тест", facetIds: Object.keys(definitions) }]), JSON.stringify(definitions)]);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-facets')");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-facets')
    on conflict (singleton) do update set base_snapshot_version = 'v-facets', revision = 0`);

  for (let i = 0; i < 30; i += 1) {
    const id = `f-${String(i).padStart(2, "0")}`;
    const attributes = {
      headM: 10 + (i % 20) * 2.5,                  // 20 distinct values: 10 … 57.5
      powerKw: [0.75, 1.1, 1.5, 2.2][i % 4],        // 4 values: stays checkboxes
      flowM3h: i % 15 === 14 ? "10-20" : i % 15,    // 15 values, one not a number: no range
      material: i % 2 ? "brass" : "steel",
      code: `C${i % 14}`                            // 14 values but not numeric
    };
    await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
        amount, price_status, inventory_status, publication_status)
      values ($1, $1, $1, $1, $1, $1, $2, $3, 100, 'known', 'in_stock', 'published')`, [id, brand.internal_id, leaf.internal_id]);
    await db.query(`insert into public.catalog_product_snapshots (snapshot_version, legacy_id, sort_order, payload)
      values ('v-facets', $1, $2, jsonb_build_object('id', $1::text))`, [id, i]);
    await db.query(`insert into public.catalog_product_cards (snapshot_version, legacy_id, sort_order, brand_id, category_id,
        amount, price_status, inventory_status, normalized_attributes, search_text, card)
      values ('v-facets', $1, $2, $3, $4, 100, 'known', 'in_stock', $5, $1, jsonb_build_object('id', $1::text))`,
      [id, i, brand.stable_id, leaf.stable_id, JSON.stringify(attributes)]);
  }

  // 1. Only numeric facets with > 12 values get a range; everything else is as before.
  const facets = (await one(db, `select public.get_catalog_facets(${ARGS}) r`, [leaf.stable_id, "{}"])).r;
  assert.deepEqual(Object.keys(facets.technicalRanges), ["headM"]);
  assert.deepEqual(facets.technicalRanges.headM, { min: 10, max: 57.5, values: 20, products: 30, unit: "м" });
  assert.equal(Object.keys(facets.technicalCounts.headM).length, 20, "checkbox counts are still returned");
  assert.ok(facets.technicalCounts.powerKw && facets.technicalCounts.flowM3h && facets.technicalCounts.code);

  // 2. Backward compatible: without technicalRanges the response equals the previous one.
  const previous = (await one(db, `select jsonb_set(public._catalog_facets_v2(${ARGS}), '{version}',
      to_jsonb(public._admin_catalog_version())) r`, [leaf.stable_id, "{}"])).r;
  const { technicalRanges, ...rest } = facets;
  assert.ok(technicalRanges);
  assert.deepEqual(rest, previous);

  // 3. Selecting the in-range values (how a «від/до» UI filters) narrows the products, and the
  //    facet's own range stays the full one (its counts ignore its own filter).
  const selected = Object.keys(facets.technicalCounts.headM).filter(value => Number(value) >= 40);
  const filtered = (await one(db, `select public.get_catalog_facets(${ARGS}) r`, [leaf.stable_id, JSON.stringify({ headM: selected })])).r;
  assert.equal(filtered.total, 8, "head 40 … 57.5 covers 8 products");
  assert.deepEqual(filtered.technicalRanges.headM, facets.technicalRanges.headM);
  const narrow = (await one(db, `select public.get_catalog_facets(${ARGS}) r`, [leaf.stable_id, JSON.stringify({ material: ["brass"] })])).r;
  assert.equal(narrow.technicalRanges.headM, undefined, "10 brass head values: checkboxes again");

  // 4. Anonymous visitors call the public RPC; the helper is private.
  await db.exec("set role anon");
  try {
    assert.ok((await one(db, `select public.get_catalog_facets(${ARGS}) r`, [leaf.stable_id, "{}"])).r.technicalRanges.headM);
    await assert.rejects(db.query("select public._catalog_facet_ranges('{}'::jsonb)"), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
  console.log(JSON.stringify({ status: "ok", scenarios: 4, suite: "facet-ranges" }));
}
