// Sparse brand facets: preserve v2/v3 semantics, bound attribute work, evaluate the public core once.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS_DIR } from './database.mjs';
import { run as existingParity } from './facets-v3-scenarios.mjs';

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const signature = '(text,text,text[],text[],text[],jsonb,numeric,numeric,text)';
const args = '$1::text,$2::text,$3::text[],$4::text[],$5::text[],$6::jsonb,$7::numeric,$8::numeric,$9::text';

export async function run(db) {
  await existingParity(db); // Includes sixty deterministic random combinations, rank nine and anon grants.
  const oldSql = fs.readFileSync(path.join(MIGRATIONS_DIR, '20261107134348_facets_single_pass.sql'), 'utf8');
  await db.exec(oldSql.slice(0, oldSql.indexOf('revoke all')).replace('public._catalog_facets_v3(', 'public._catalog_facets_before_sparse('));

  const types = [true, false, null, '', 'true', 'yes', 'ні', 0, -2, 1.5, { b: [1, null], a: true }, [false, 'x', 1]];
  const values = (await db.query(`select public._catalog_filter_value(jsonb_build_object('f', value), 'f') expected,
    case jsonb_typeof(value) when 'boolean' then case when value = 'true'::jsonb then 'yes' else 'no' end
      when 'null' then null else value #>> '{}' end actual from jsonb_array_elements($1::jsonb)`, [JSON.stringify(types)])).rows;
  values.forEach(row => assert.equal(row.actual, row.expected, 'JSON scalar/container serialization must match the existing helper'));

  const brand = await one(db, 'select internal_id,stable_id from public.brands where status=\'active\' order by stable_id limit 1');
  const leaf = await one(db, 'select internal_id,stable_id from public.categories where level=3 and status=\'active\' order by stable_id limit 1');
  const definitions = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [`s${i}`, { id: `s${i}`, label: `Sparse ${i}`, type: i === 0 ? 'number' : 'select', filterable: true, rank: i }]));
  await db.query(`insert into public.catalog_snapshot_releases
    (snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
    values ('v-sparse','test',$1,'[]',$2,3500,3500,repeat('0',64),true)`,
  [JSON.stringify([{ id: leaf.stable_id, facetIds: Object.keys(definitions) }]), JSON.stringify(definitions)]);
  await db.query("update public.catalog_snapshot_pointer set snapshot_version='v-sparse' where singleton");
  await db.query("update public.catalog_admin_cache_revision set base_snapshot_version='v-sparse',revision=0 where singleton");
  await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,inventory_status,publication_status)
    select 'sparse-'||i,'sparse-'||i,'sparse-'||i,'Sparse '||i,'Sparse '||i,'Sparse '||i,$1,$2,100,'known','in_stock','published'
    from generate_series(1,3500) i`, [brand.internal_id, leaf.internal_id]);
  await db.exec(`insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload)
    select 'v-sparse','sparse-'||i,i,jsonb_build_object('id','sparse-'||i) from generate_series(1,3500)i`);
  await db.query(`insert into public.catalog_product_cards(snapshot_version,legacy_id,sort_order,brand_id,category_id,amount,price_status,inventory_status,normalized_attributes,search_text,card)
    select 'v-sparse','sparse-'||i,i,$1,$2,100,'known','in_stock',
      jsonb_build_object('s0',i%20,'s1',i%2=0,'s2',case when i%3=0 then null else 'text-'||(i%3) end)
        ||case when i<=26 then jsonb_build_object('s'||(3+i/2),jsonb_build_object('value',i%2)) else '{}'::jsonb end,
      'Sparse '||i,jsonb_build_object('id','sparse-'||i) from generate_series(1,3500)i`, [brand.stable_id, leaf.stable_id]);
  await db.exec('analyze public.catalog_product_cards; analyze public.catalog_snapshot_pointer');

  const base = [null, brand.stable_id, null, null, null, '{}', null, null, null];
  const scenarios = [base, base.map((v,i) => i===5 ? '{"s0":["2","4"],"s1":["yes"]}' : v),
    base.map((v,i) => i===5 ? '{"s48":["missing"]}' : v), base.map((v,i) => i===6 ? 200 : v)];
  let sparseMs = 0;
  for (const input of scenarios) {
    const before = (await one(db, `select public._catalog_facets_before_sparse(${args}) r`, input)).r;
    const started = performance.now();
    const after = (await one(db, `select public._catalog_facets_v3(${args}) r`, input)).r;
    sparseMs = Math.max(sparseMs, Math.round(performance.now()-started));
    assert.deepEqual(after,before,'sparse brand and selected absent facets preserve the full previous response');
  }
  const rpc = (await one(db, `select public.get_catalog_facets(${args}) r`, base)).r;
  assert.equal(rpc.total,3500);
  assert.equal(Object.keys(rpc.technicalCounts).length,9);
  assert.ok(rpc.technicalRanges.s0,'numeric ranges still added by the public wrapper');

  // Count actual core evaluations; timing alone would not catch wrapper flattening regressions.
  const core = (await one(db, `select pg_get_functiondef('public._catalog_facets_v3${signature}'::regprocedure) definition`)).definition;
  await db.exec('create sequence public.facet_core_probe');
  const stub = core.slice(0,core.indexOf('AS $function$')) + `AS $function$
    select jsonb_build_object('version','test','total',nextval('public.facet_core_probe'),'technicalCounts','{}'::jsonb)
  $function$;`;
  await db.exec(stub);
  try {
    await one(db,'select public.get_catalog_facets() r');
    assert.equal(Number((await one(db,'select last_value from public.facet_core_probe')).last_value),1,'public RPC evaluates v3 once');
  } finally { await db.exec(core); }
  const config = await one(db, `select proconfig from pg_proc where oid='public.get_catalog_facets${signature}'::regprocedure`);
  assert.ok(config.proconfig.includes('statement_timeout=8s'),'timeout remains unchanged');
  console.log(JSON.stringify({ status:'ok',suite:'facets-sparse',jsonTypes:types.length,sparseProducts:3500,allowedKeys:49,sparseParityCases:scenarios.length,maxSparseMs:sparseMs,coreCallsPerRpc:1 }));
}
