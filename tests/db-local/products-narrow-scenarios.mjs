// Full-response parity for the narrow paged catalogue query and one-evaluation public wrapper.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS_DIR } from './database.mjs';
import { run as pricedFirst } from './priced-first-scenarios.mjs';

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const types = 'text,text,text[],text[],text[],jsonb,numeric,numeric,text,integer,integer,text[],text';
const args = '$1::text,$2::text,$3::text[],$4::text[],$5::text[],$6::jsonb,$7::numeric,$8::numeric,$9::text,$10::integer,$11::integer,$12::text[],$13::text';

export async function run(db) {
  await pricedFirst(db);
  const oldCore = fs.readFileSync(path.join(MIGRATIONS_DIR,'20261104114631_catalog_priced_first.sql'),'utf8');
  await db.exec(oldCore.replace('public._catalog_products_v2(', 'public._catalog_products_before_narrow('));
  const oldWrappers = fs.readFileSync(path.join(MIGRATIONS_DIR,'20260929000700_products_admin_cache_revision.sql'),'utf8');
  const oldPublic = oldWrappers.slice(oldWrappers.indexOf('create or replace function public.get_catalog_products('),oldWrappers.indexOf('create or replace function public.get_catalog_facets('));
  await db.exec(oldPublic.replace('public.get_catalog_products(', 'public._catalog_products_wrapper_before_narrow('));
  const brands = (await db.query("select internal_id,stable_id from public.brands where status='active' order by stable_id limit 2")).rows;
  const leaves = (await db.query("select internal_id,stable_id,parent_id from public.categories where level=3 and status='active' and visibility='catalog' order by stable_id limit 2")).rows;
  for (let i=0;i<200;i+=1) {
    const id=`narrow-${String(i).padStart(3,'0')}`;
    const brand=brands[i%2], leaf=leaves[i%2], known=i%4!==0;
    const attrs={ powerKw:i%5, enabled:i%2===0, material:i%3?'латунь':'сталь', shape:i%2?{ b:2,a:1 }:['x',true], absent:null };
    await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,inventory_status,publication_status)
      values($1,$1,$1,$1,$1,$1,$2,$3,$4,$5,$6,'published')`,[id,brand.internal_id,leaf.internal_id,known?100+(i%11):null,known?'known':'on_request',i%3?'in_stock':'unknown']);
    await db.query("insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload) values('v-pf',$1,$2,jsonb_build_object('id',$1::text))",[id,1000+i]);
    await db.query(`insert into public.catalog_product_cards(snapshot_version,legacy_id,sort_order,brand_id,category_id,amount,price_status,inventory_status,normalized_attributes,search_text,card)
      values('v-pf',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,1000+i,brand.stable_id,leaf.stable_id,known?100+(i%11):null,known?'known':'on_request',i%3?'in_stock':'unknown',JSON.stringify(attrs),`${id} Pipe ${i%3?'насос':'труба'}`,JSON.stringify({id,slug:id,title:`Товар ${i}`,brandId:brand.stable_id,normalizedAttributes:attrs,extra:{untouched:[true,1,'x']}})]);
  }
  // The same legacy id exists in a historical release; page lookups must use both primary-key columns.
  await db.exec(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
    values('v-history','test','[]','[]','{}',1,1,repeat('0',64),true);
    insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload) values('v-history','narrow-000',1,'{}');
    insert into public.catalog_product_cards(snapshot_version,legacy_id,sort_order,brand_id,category_id,price_status,inventory_status,normalized_attributes,search_text,card)
      select 'v-history',legacy_id,1,brand_id,category_id,price_status,inventory_status,'{}',search_text,'{"id":"POISON-HISTORICAL"}' from public.catalog_product_cards where snapshot_version='v-pf' and legacy_id='narrow-000';
    analyze public.catalog_product_cards; analyze public.catalog_snapshot_pointer;`);
  const base=[null,null,null,null,null,'{}',null,null,'default',1,96,null,null];
  const changed=changes=>base.map((value,index)=>index in changes?changes[index]:value);
  const parent=(await one(db,'select stable_id from public.categories where internal_id=$1',[leaves[0].parent_id])).stable_id;
  const scenarios=[base,changed({0:'all'}),changed({0:''}),changed({0:'missing-category'}),changed({0:parent}),changed({0:leaves[0].stable_id,1:brands[0].stable_id}),
    changed({1:brands[1].stable_id,2:[leaves[1].stable_id]}),changed({2:[leaves[0].stable_id],3:[brands[1].stable_id]}),changed({4:['in_stock']}),
    changed({5:'{"powerKw":["0","2"],"enabled":["yes"]}'}),changed({5:'{"material":["сталь","латунь"]}'}),changed({5:'{"absent":["null"]}'}),
    changed({5:'{"missing":["x"]}'}),changed({5:'{"powerKw":[]}'}),changed({5:JSON.stringify({shape:['{"a": 1, "b": 2}']})}),
    changed({6:105,7:108}),changed({6:200}),changed({8:'price-asc'}),changed({8:'price-desc'}),changed({8:null}),changed({8:'unknown'}),
    changed({9:2,10:24}),changed({9:999}),changed({9:0,10:0}),changed({9:null,10:null}),changed({10:999}),
    changed({11:['pf-1-request','pf-4-stock','missing','narrow-000','narrow-001','narrow-001']}),changed({11:['narrow-000','narrow-001'],8:'price-desc'}),
    changed({11:[]}),changed({12:'  Pipe  '}),changed({12:'narrow-0%'}),changed({12:'щщщ'})];
  let seed=20261125;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
  for(let i=0;i<60;i+=1) scenarios.push(changed({0:random()<.3?leaves[i%2].stable_id:null,1:random()<.2?brands[i%2].stable_id:null,
    4:random()<.3?['in_stock']:null,5:random()<.5?JSON.stringify({powerKw:[String(i%5)],enabled:[i%2?'yes':'no']}):'{}',
    6:random()<.2?103:null,8:['default','price-asc','price-desc',null][i%4],9:1+i%3,10:1+i%96,12:random()<.2?'Pipe':null}));
  for (let i=0;i<scenarios.length;i+=1) {
    const before=(await one(db,`select public._catalog_products_before_narrow(${args}) r`,scenarios[i])).r;
    const after=(await one(db,`select public._catalog_products_v2(${args}) r`,scenarios[i])).r;
    assert.deepEqual(after,before,`full response parity case ${i}: ${JSON.stringify(scenarios[i])}`);
  }
  for(const fn of ['_catalog_products_before_narrow','_catalog_products_v2']) {
    await assert.rejects(db.query(`select public.${fn}(${args})`,changed({5:'{"enabled":"invalid"}'})),/cannot get array length/,'invalid scalar selections retain the existing input error');
  }
  // The public wrapper still replaces snapshot version with the live admin revision and preserves access.
  await db.exec("set role anon");
  try {
    const rpc=(await one(db,`select public.get_catalog_products(${args}) r`,base)).r;
    assert.equal(rpc.total,205); assert.equal(rpc.products.length,96);
    await assert.rejects(db.query('select public._catalog_products_v2()'),/permission denied/);
  } finally { await db.exec('reset role'); }
  // Sitemap-sized fixture: late pages must preserve order and avoid spilling full payloads to disk.
  await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,inventory_status,publication_status)
    select 'load-'||i,'load-'||i,'load-'||i,'Load '||i,'Load '||i,'Load '||i,$1,$2,100,'known','in_stock','published'
    from generate_series(1,11000)i`,[brands[0].internal_id,leaves[0].internal_id]);
  await db.exec(`insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload)
    select 'v-pf','load-'||i,5000+i,jsonb_build_object('id','load-'||i) from generate_series(1,11000)i`);
  await db.query(`insert into public.catalog_product_cards(snapshot_version,legacy_id,sort_order,brand_id,category_id,amount,price_status,inventory_status,normalized_attributes,search_text,card)
    select 'v-pf','load-'||i,5000+i,$1,$2,100,'known','in_stock','{}','Load '||i,
      jsonb_build_object('id','load-'||i,'title','Load '||i,'description',repeat('content ',130)) from generate_series(1,11000)i`,[brands[0].stable_id,leaves[0].stable_id]);
  await db.exec("analyze public.catalog_product_cards; set work_mem='4MB'");
  for(const page of [1,60,117]) {
    const input=changed({9:page});
    const before=(await one(db,`select public._catalog_products_before_narrow(${args}) r`,input)).r;
    for(let repeat=0;repeat<2;repeat+=1) {
      const after=(await one(db,`select public.get_catalog_products(${args}) r`,input)).r;
      assert.deepEqual({...after,version:before.version},before,`large page ${page}, repeat ${repeat}`);
    }
  }
  const plan=(await one(db,"explain(analyze,buffers,format json) select public.get_catalog_products(page_size=>96,page_number=>117)"))['QUERY PLAN'][0];
  assert.equal(plan.Plan['Temp Read Blocks'],0,'narrow sitemap page does not read disk spill');
  assert.equal(plan.Plan['Temp Written Blocks'],0,'narrow sitemap page does not write disk spill');
  await db.exec("delete from public.catalog_snapshot_pointer where singleton");
  assert.equal((await one(db,'select public.get_catalog_products() r')).r,null,'missing active release remains null');
  await db.exec("insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,'v-pf')");
  const core=(await one(db,`select pg_get_functiondef('public._catalog_products_v2(${types})'::regprocedure) definition`)).definition;
  await db.exec('create sequence public.products_core_probe');
  await db.exec(core.slice(0,core.indexOf('AS $function$'))+`AS $function$
    select jsonb_build_object('version','test','total',nextval('public.products_core_probe'),'products','[]'::jsonb)
  $function$;`);
  try {
    await one(db,'select public._catalog_products_wrapper_before_narrow()');
    const oldCalls=Number((await one(db,'select last_value from public.products_core_probe')).last_value);
    await db.exec('alter sequence public.products_core_probe restart with 1');
    await one(db,'select public.get_catalog_products()');
    const newCalls=Number((await one(db,'select last_value from public.products_core_probe')).last_value);
    assert.equal(oldCalls,2,'baseline reproduces wrapper evaluation amplification'); assert.equal(newCalls,1);
  } finally { await db.exec(core); }
  const config=(await one(db,`select proconfig from pg_proc where oid='public.get_catalog_products(${types})'::regprocedure`)).proconfig;
  assert.ok(config.includes('statement_timeout=8s'));
  console.log(JSON.stringify({status:'ok',suite:'products-narrow',fullResponseParity:scenarios.length,products:11205,largePages:[1,60,117],lastPageMs:Math.round(plan['Execution Time']),tempBlocks:0,oldCoreCalls:2,newCoreCalls:1,pricedFirst:'PASS',historicalSnapshot:'PASS',anon:'PASS'}));
}
