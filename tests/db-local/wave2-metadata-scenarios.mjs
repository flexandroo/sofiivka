import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {metadataSql as priorMetadata} from '../../scripts/import/three-brand-metadata.mjs';
import {metadataSql,categories,attributes,brands,options,stagedReference} from '../../scripts/import/wave2-metadata.mjs';

export async function run(db){
  const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  await db.exec(`insert into public.categories(stable_id,slug,title,level,status,visibility)
    values('sewerage','sewerage','Каналізація та дренаж',1,'active','catalog')on conflict(stable_id)do update set status='active',visibility='catalog';
    insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
    values('v-wave2-metadata','test','[]','[]','{}',0,0,repeat('0',64),true);
    insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,'v-wave2-metadata')on conflict(singleton)do update set snapshot_version=excluded.snapshot_version;
    insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,'v-wave2-metadata')on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version;`);
  await db.exec(priorMetadata());
  const productsBefore=await one('select count(*)::int n from public.products');
  const categoryBefore=await one("select to_jsonb(c) data from public.categories c where stable_id='pellet-burners'");
  const linksBefore=(await db.query("select to_jsonb(a) data from public.category_attributes a join public.categories c on c.internal_id=a.category_id where c.stable_id='pellet-burners' order by attribute_id")).rows;
  await db.exec(metadataSql());
  const counts=()=>one(`select(select count(*)::int from public.brands)brands,(select count(*)::int from public.categories)categories,
    (select count(*)::int from public.attribute_definitions)attributes,(select count(*)::int from public.category_attributes)links,(select count(*)::int from public.attribute_options)options`);
  const first=await counts();
  await db.exec(metadataSql());
  assert.deepEqual(await counts(),first,'all metadata is idempotent');
  assert.deepEqual(await one('select count(*)::int n from public.products'),productsBefore,'no product or price writes');
  assert.deepEqual(await one("select to_jsonb(c) data from public.categories c where stable_id='pellet-burners'"),categoryBefore,'existing category whole row preserved');
  for(const row of linksBefore){
    const after=await one('select to_jsonb(a) data from public.category_attributes a where category_id=$1 and attribute_id=$2',[row.data.category_id,row.data.attribute_id]);
    assert.deepEqual(after,row,'existing category attributes preserved');
  }
  for(const spec of categories){
    const category=await one('select p.stable_id parent,c.level from public.categories c join public.categories p on p.internal_id=c.parent_id where c.stable_id=$1',[spec.id]);
    assert.equal(category.parent,spec.parent);assert.ok(category.level<=3);
  }
  const root=path.resolve(import.meta.dirname,'../..');
  const reference=(await one(fs.readFileSync(path.join(root,'scripts/import/reference.sql'),'utf8'))).reference;
  const staged=stagedReference(reference);
  assert.deepEqual(staged.products,reference.products);
  assert.equal(staged.categories.find(x=>x.id==='ventilation').leaf,false);
  assert.equal(staged.categories.find(x=>x.id==='ventilation-components').leaf,true);
  for(const brand of brands)assert.ok(staged.brands.some(x=>x.id===brand.id));
  for(const [id,values]of Object.entries(options))for(const value of values)assert.ok(staged.attributes[id].values.includes(value));
  for(const attribute of attributes)assert.equal(staged.attributes[attribute.id].type,'number');
  // A conflicting identity or disabled option must abort the entire additive transaction.
  await db.exec("update public.attribute_options set active=false where value='Факельний, автоматичний'");
  await assert.rejects(db.exec(metadataSql()),/Refusing to reactivate/);await db.exec('rollback');
  assert.equal((await one("select active from public.attribute_options where value='Факельний, автоматичний'")).active,false);
  await db.exec("update public.attribute_options set active=true where value='Факельний, автоматичний';update public.categories set parent_id=(select internal_id from public.categories where stable_id='heating')where stable_id='water-heating-pipes'");
  await assert.rejects(db.exec(metadataSql()),/Category identity\/state conflict/);await db.exec('rollback');
  console.log(JSON.stringify({status:'ok',checks:'wave2-additive-metadata',categories:categories.length,attributes:attributes.length,
    tests:['idempotency','existing-products-and-category-rows-preserved','existing-facet-links-preserved','staged-reference','disabled-option-refused','conflicting-parent-refused']}));
}
