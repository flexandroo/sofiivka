// Facet counts in one pass (20261107000300): _catalog_facets_v3 must return exactly what
// _catalog_facets_v2 returned, for every filter combination, while reading the scope once.
import assert from "node:assert/strict";

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const ARGS = "$1::text, $2::text, $3::text[], $4::text[], $5::text[], $6::jsonb, $7::numeric, $8::numeric, $9::text";

// Small deterministic generator, so a failure can be replayed.
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}

export async function run(db) {
  const next = random(20261107);
  const pick = list => list[Math.floor(next() * list.length)];

  // A section with its descendants, plus a leaf outside it.
  const section = await one(db, `select parent.stable_id, array_agg(leaf.stable_id order by leaf.stable_id) leaves
    from public.categories parent
    join public.categories child on child.parent_id = parent.internal_id
    join public.categories leaf on leaf.parent_id = child.internal_id and leaf.status = 'active'
    where parent.level = 1 and parent.status = 'active'
    group by parent.stable_id having count(*) >= 3 order by parent.stable_id limit 1`);
  const outside = await one(db, `select leaf.stable_id from public.categories leaf
    join public.categories child on child.internal_id = leaf.parent_id
    join public.categories parent on parent.internal_id = child.parent_id
    where leaf.level = 3 and parent.stable_id <> $1 order by leaf.stable_id limit 1`, [section.stable_id]);
  const leaves = section.leaves.slice(0, 4);
  const brands = (await db.query("select stable_id from public.brands where status = 'active' order by stable_id limit 4")).rows.map(row => row.stable_id);

  // Twelve filterable facets (more than the nine v2 keeps), numbers, words, booleans and gaps.
  const definitions = {};
  const facetIds = [];
  for (let i = 0; i < 12; i += 1) {
    const id = `f${i}`;
    definitions[id] = { id, label: `Параметр ${i}`, type: i % 3 === 0 ? "number" : i % 3 === 1 ? "select" : "boolean", unit: "", filterable: i !== 5, rank: 12 - i };
    facetIds.push(id);
  }
  definitions.hidden = { id: "hidden", label: "Не фільтр", type: "select", filterable: true, rank: 0 };
  const categories = [...leaves, outside.stable_id].map((id, index) => ({ id, title: id, facetIds: index === 0 ? facetIds.slice(0, 6) : facetIds }));
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-facets3', 'test', $1, '[]'::jsonb, $2, 0, 0, repeat('0', 64), true)`, [JSON.stringify(categories), JSON.stringify(definitions)]);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-facets3')");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-facets3')
    on conflict (singleton) do update set base_snapshot_version = 'v-facets3', revision = 0`);

  const insertCards = async (count, prefix, offset = 0) => {
    const rows = [];
    for (let i = 0; i < count; i += 1) {
      const attributes = {};
      for (let f = 0; f < 12; f += 1) {
        if (next() < 0.15) continue;                       // missing attribute
        if (next() < 0.05) { attributes[`f${f}`] = null; continue; }
        attributes[`f${f}`] = f % 3 === 0 ? pick([1, 1.5, 2, 2.2, 3, 4, 5.5, 7, 10, 12, 15, 20, 25, 30])
          : f % 3 === 1 ? pick(["латунь", "сталь", "чавун", "пластик"]) : next() < 0.5;
      }
      if (next() < 0.3) attributes.hidden = "x";
      const known = next() < 0.75;
      rows.push([`${prefix}-${i}`, offset + i, pick(brands), next() < 0.9 ? pick(leaves) : outside.stable_id,
        known ? Math.round(next() * 50000) : null, known ? "known" : "on_request",
        pick(["in_stock", "out_of_stock", "unknown"]), JSON.stringify(attributes), `${prefix} ${pick(["насос", "котел", "фільтр"])} ${i}`]);
    }
    for (const row of rows) {
      await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
          amount, price_status, inventory_status, publication_status)
        select $1, $1, $1, $1, $1, $1, brand.internal_id, category.internal_id, $4, $5::public.product_price_status,
          $6::public.product_inventory_status, 'published'
        from public.brands brand, public.categories category where brand.stable_id = $2 and category.stable_id = $3`,
        [row[0], row[2], row[3], row[4], row[5], row[6]]);
      await db.query(`insert into public.catalog_product_snapshots (snapshot_version, legacy_id, sort_order, payload)
        values ('v-facets3', $1, $2, jsonb_build_object('id', $1::text))`, [row[0], row[1]]);
      await db.query(`insert into public.catalog_product_cards (snapshot_version, legacy_id, sort_order, brand_id, category_id,
          amount, price_status, inventory_status, normalized_attributes, search_text, card)
        values ('v-facets3', $1, $2, $3, $4, $5, $6, $7, $8, $9, jsonb_build_object('id', $1::text))`, row);
    }
  };
  await insertCards(240, "p");

  const facets = async (fn, args) => (await one(db, `select public.${fn}(${ARGS}) r`, args)).r;
  const compare = async (label, args) => {
    const [v2, v3] = await Promise.all([facets("_catalog_facets_v2", args), facets("_catalog_facets_v3", args)]);
    assert.deepEqual(v3, v2, `${label}: ${JSON.stringify(args)}`);
    return v3;
  };

  // 1. Hand-picked cases: no filters, each group alone, combinations, unknown values, empty results.
  const base = [section.stable_id, null, null, null, null, "{}", null, null, null];
  const withArgs = changes => base.map((value, index) => (index in changes ? changes[index] : value));
  const plain = await compare("no filters", base);
  assert.ok(plain.total > 100 && Object.keys(plain.technicalCounts).length === 9, "nine facets kept");
  await compare("whole catalogue", withArgs({ 0: null }));
  await compare("all", withArgs({ 0: "all" }));
  await compare("unknown scope", withArgs({ 0: "missing-category" }));
  await compare("one leaf", withArgs({ 0: leaves[0] }));
  await compare("scope brand", withArgs({ 1: brands[0] }));
  await compare("category filter", withArgs({ 2: [leaves[1], leaves[2]] }));
  await compare("brand filter", withArgs({ 3: [brands[1]] }));
  await compare("availability", withArgs({ 4: ["in_stock"] }));
  await compare("price range", withArgs({ 6: 10000, 7: 30000 }));
  await compare("min price only", withArgs({ 6: 45000 }));
  await compare("query", withArgs({ 8: "насос" }));
  await compare("number facet", withArgs({ 5: JSON.stringify({ f0: ["2", "3", "10"] }) }));
  await compare("boolean facet", withArgs({ 5: JSON.stringify({ f2: ["yes"] }) }));
  await compare("two facets", withArgs({ 5: JSON.stringify({ f0: ["2"], f1: ["сталь", "латунь"] }) }));
  await compare("value nobody has", withArgs({ 5: JSON.stringify({ f0: ["__no_value__"] }) }));
  await compare("empty array is no filter", withArgs({ 5: JSON.stringify({ f0: [] }) }));
  await compare("filter on a facet outside the scope", withArgs({ 5: JSON.stringify({ hidden: ["x"] }) }));
  await compare("everything", withArgs({ 2: [leaves[1]], 3: [brands[0], brands[2]], 4: ["in_stock", "unknown"], 5: JSON.stringify({ f0: ["2", "5.5"], f4: ["сталь"] }), 6: 1000, 7: 40000, 8: "p" }));
  const none = await compare("nothing matches", withArgs({ 8: "щщщ" }));
  assert.equal(none.total, 0);

  // 2. Random combinations.
  const numberValues = ["1", "1.5", "2", "2.2", "3", "4", "5.5", "7", "10", "12", "15", "20", "25", "30"];
  for (let run = 0; run < 60; run += 1) {
    const technical = {};
    for (const facet of ["f0", "f1", "f2", "f3", "f4", "f6", "f9"]) {
      if (next() < 0.25) {
        technical[facet] = facet === "f2" ? [pick(["yes", "no"])] : facet === "f1" || facet === "f4"
          ? [pick(["латунь", "сталь", "чавун", "пластик"])] : numberValues.filter(() => next() < 0.3);
      }
    }
    const args = [
      pick([section.stable_id, section.stable_id, leaves[0], null]),
      next() < 0.1 ? brands[0] : null,
      next() < 0.2 ? [pick(leaves)] : null,
      next() < 0.3 ? brands.filter(() => next() < 0.5) : null,
      next() < 0.3 ? [pick(["in_stock", "out_of_stock", "unknown"])] : null,
      JSON.stringify(technical),
      next() < 0.2 ? Math.round(next() * 20000) : null,
      next() < 0.2 ? 20000 + Math.round(next() * 30000) : null,
      next() < 0.15 ? pick(["насос", "котел", "p-1"]) : null
    ];
    await compare(`random ${run}`, args);
  }

  // 3. The public RPC uses v3 and still adds technicalRanges.
  const rpc = await one(db, `select public.get_catalog_facets(${ARGS}) r`, base);
  const { technicalRanges, ...rest } = rpc.r;
  assert.ok(technicalRanges && typeof technicalRanges === "object");
  assert.deepEqual(rest, { ...plain, version: rest.version });
  await db.exec("set role anon");
  try {
    assert.ok((await one(db, `select public.get_catalog_facets(${ARGS}) r`, base)).r.total > 0);
    await assert.rejects(db.query(`select public._catalog_facets_v3(${ARGS})`, base), /permission denied/);
  } finally {
    await db.exec("reset role");
  }

  // 4. Speed: a scope the size of /catalog/water-supply with a technical filter.
  await insertCards(1600, "s", 1000);
  const timed = async fn => {
    const started = performance.now();
    await facets(fn, withArgs({ 5: JSON.stringify({ f0: ["2", "3", "4", "5.5", "7", "10"], f1: ["сталь"] }) }));
    return Math.round(performance.now() - started);
  };
  await timed("_catalog_facets_v3");
  const v2Time = await timed("_catalog_facets_v2");
  const v3Time = await timed("_catalog_facets_v3");
  assert.ok(v3Time < v2Time, `v3 ${v3Time} ms should beat v2 ${v2Time} ms`);
  console.log(JSON.stringify({ status: "ok", scenarios: 4, suite: "facets-v3", randomCombinations: 60, v2Ms: v2Time, v3Ms: v3Time }));
}
