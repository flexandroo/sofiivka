import assert from 'node:assert/strict';
import { metadataSql, categories, attributes, stagedReference } from '../../scripts/import/three-brand-metadata.mjs';

export async function run(db) {
  // The live sewerage root was activated administratively after the original seed.
  await db.query(`insert into public.categories (stable_id,slug,title,level,status,visibility)
    values ('sewerage','sewerage','Каналізація та дренаж',1,'active','catalog')
    on conflict (stable_id) do update set status='active',visibility='catalog'`);
  await db.query(`insert into public.catalog_snapshot_releases
    (snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
    values ('brand-import-test','test','[]','[]','{}',0,0,repeat('0',64),true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton,snapshot_version) values (true,'brand-import-test')");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton,base_snapshot_version)
    values (true,'brand-import-test') on conflict (singleton) do update set base_snapshot_version=excluded.base_snapshot_version`);
  const productBefore = (await db.query('select count(*)::int count from public.products')).rows[0].count;
  const sql = metadataSql();
  await db.exec(sql);
  const readCounts = async () => (await db.query(`select
    (select count(*)::int from public.categories) categories,
    (select count(*)::int from public.brands) brands,
    (select count(*)::int from public.attribute_definitions) attributes,
    (select count(*)::int from public.category_attributes) relations`)).rows[0];
  const first = await readCounts();
  await db.exec(sql);
  assert.deepEqual(await readCounts(), first, 'Repeated prerequisites must not duplicate metadata');
  for (const spec of categories) {
    const row = (await db.query('select c.title,c.level,p.stable_id parent from public.categories c join public.categories p on p.internal_id=c.parent_id where c.stable_id=$1', [spec.id])).rows[0];
    assert.equal(row.parent, spec.parent);
    assert.equal(row.title, spec.title);
    assert.ok(row.level <= 3);
  }
  for (const spec of attributes) {
    const row = (await db.query('select value_type,unit,filterable from public.attribute_definitions where stable_id=$1', [spec.id])).rows[0];
    assert.deepEqual(row, { value_type: 'number', unit: spec.unit, filterable: true });
  }
  assert.equal((await db.query('select count(*)::int count from public.products')).rows[0].count, productBefore);
  const reference = stagedReference({ brands: [], categories: [], attributes: {}, products: [] });
  assert.equal(reference.categories.find(row => row.id === 'internal-sewerage').leaf, false);
  assert.equal(reference.categories.find(row => row.id === 'internal-sewer-pipes').leaf, true);
  const release = (await db.query("select categories,brands,attribute_definitions from public.catalog_snapshot_releases where snapshot_version='brand-import-test'")).rows[0];
  assert.equal(release.categories.length, categories.length);
  assert.ok(release.brands.some(row => row.id === 'tervix'));
  assert.equal(release.attribute_definitions.pipeDiameterMm.type, 'number');
  console.log(JSON.stringify({ status: 'ok', checks: 'three-brand-import-metadata', categories: categories.length, definitions: attributes.length }));
}
