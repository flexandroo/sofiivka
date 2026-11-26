// Real migration + public RPC checks for a category larger than the old four-card limit.
import assert from "node:assert/strict";
import { LocalCatalogDataSource } from "../../catalog/local-data-source.mjs";

const one = async (db, sql, values = []) => (await db.query(sql, values)).rows[0];
async function publicCall(db, name, value) {
  await db.exec("set role anon");
  try { return (await one(db, `select public.${name}($1) result`, [value])).result; }
  finally { await db.exec("reset role"); }
}
const peerId = index => `rt-peer-${String(index).padStart(2, "0")}`;

export async function run(db) {
  const brand = await one(db, "select internal_id,stable_id,name from public.brands where status='active' order by stable_id limit 1");
  const leaves = (await db.query("select internal_id,stable_id from public.categories where level=3 and status='active' and visibility='catalog' order by stable_id limit 2")).rows;
  assert.equal(leaves.length, 2);
  const rows = [
    ["rt-target", 1000, "published", leaves[0]],
    ...Array.from({ length: 16 }, (_, index) => [peerId(index + 1), 1001 + index, "published", leaves[0]]),
    ["rt-draft", 1000, "draft", leaves[0]],
    ["rt-hidden", 1000, "hidden", leaves[0]],
    ["rt-other-category", 1000, "published", leaves[1]]
  ];
  for (const [id, amount, status, category] of rows) {
    await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,inventory_status,publication_status)
      values($1,$1,$1,$1,$1,$1,$2,$3,$4,'known','in_stock',$5)`, [id, brand.internal_id, category.internal_id, amount, status]);
  }
  await db.query(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
    values('v-related-twelve','test','[]','[]','{}',20,18,repeat('0',64),true)`);
  await db.query("insert into public.catalog_snapshot_pointer(singleton,snapshot_version) values(true,'v-related-twelve')");
  await db.query(`insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version) values(true,'v-related-twelve')
    on conflict(singleton) do update set base_snapshot_version=excluded.base_snapshot_version,revision=0`);
  const refresh = async () => db.query("select public._admin_refresh_catalog(array_agg(internal_id order by legacy_id)) from public.products where legacy_id like 'rt-%'");
  await refresh();
  const get = id => publicCall(db, "get_catalog_product", id);
  const ids = result => result.relatedProducts.map(card => card.id);

  // Price distance determines this fixture's expected order independently of the implementation.
  let result = await get("rt-target");
  const expected = Array.from({ length: 12 }, (_, index) => peerId(index + 1));
  assert.deepEqual(ids(result), expected, "twelve nearest published same-category peers, not four");
  assert.ok(result.relatedProducts.every(card => card.publicationStatus === "published" && card.primaryCategoryId === leaves[0].stable_id));
  assert.ok(!ids(result).some(id => ["rt-target", "rt-draft", "rt-hidden", "rt-other-category"].includes(id)));
  assert.deepEqual(await publicCall(db, "get_catalog_product_by_slug", " RT-TARGET "), result, "existing slug wrapper returns the same response");

  const products = (await db.query("select payload from public.catalog_product_snapshots where snapshot_version='v-related-twelve' order by legacy_id")).rows.map(row => row.payload);
  const local = new LocalCatalogDataSource({ publicOnly: true, snapshotProvider: () => ({ version: "v-related-twelve", products, categories: [], brands: [{ id: brand.stable_id, name: brand.name }], attributeDefinitions: {} }) });
  assert.deepEqual(ids(await local.getProductById("rt-target")), expected, "local public adapter keeps the same twelve-card ranking");
  assert.deepEqual(await local.getProductBySlug("RT-TARGET"), await local.getProductById("rt-target"));
  assert.equal(await local.getProductById("rt-draft"), null);

  // Ordered manual cards retain their original kind/list priority, including cross-category accessories.
  const manual = [
    ["accessory", peerId(16), 0], ["accessory", "rt-draft", 1], ["accessory", "rt-other-category", 2],
    ["compatible", peerId(15), 0], ["compatible", peerId(16), 1],
    ["similar", peerId(14), 0], ["similar", "rt-hidden", 1]
  ];
  for (const [kind, related, order] of manual) {
    await db.query(`insert into public.product_relations(product_id,relation_kind,related_product_id,sort_order)
      select target.internal_id,$1,related.internal_id,$3 from public.products target cross join public.products related
      where target.legacy_id='rt-target' and related.legacy_id=$2`, [kind, related, order]);
  }
  await refresh();
  result = await get("rt-target");
  const prefix = [peerId(16), "rt-other-category", peerId(15), peerId(14)];
  assert.deepEqual(ids(result).slice(0, prefix.length), prefix, "manual order is unchanged and duplicate kind references appear once");
  assert.deepEqual(ids(result).slice(prefix.length), expected, "manual prefix is followed by twelve unselected automatic peers");
  assert.equal(new Set(ids(result)).size, ids(result).length);
  assert.ok(!ids(result).includes("rt-draft") && !ids(result).includes("rt-hidden"));
  assert.deepEqual(await publicCall(db, "get_catalog_product_by_slug", "rt-target"), result);

  // Publication refresh removes an automatic peer; the next eligible peer fills the slot.
  await db.query("update public.products set publication_status='hidden' where legacy_id=$1", [peerId(1)]);
  await refresh();
  result = await get("rt-target");
  assert.deepEqual(ids(result).slice(0, prefix.length), prefix);
  assert.deepEqual(ids(result).slice(prefix.length), Array.from({ length: 12 }, (_, index) => peerId(index + 2)));
  for (const id of ["rt-draft", "rt-hidden", peerId(1), "unknown"]) assert.equal(await get(id), null, `${id}: no public PDP`);
  assert.deepEqual((await get("rt-other-category")).relatedProducts, [], "small categories are not padded with other categories");

  console.log(JSON.stringify({ status: "ok", suite: "related-twelve", candidates: 16, automaticLimit: 12, manualPrefix: prefix.length, localParity: true, slugParity: true, excludesDraftAndHidden: true }));
}
