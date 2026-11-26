// Local-only regression: unknown VAT is quoted as stated; every existing boolean-VAT result stays exact.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const migration=await fs.readFile(path.join(ROOT,'supabase/migrations/20261126033003_user_price_vat_unstated_as_quoted.sql'),'utf8');
const original=await fs.readFile(path.join(ROOT,'supabase/migrations/20261005120814_fx_pricing.sql'),'utf8');
const originalFunction=original.match(/create or replace function public\._fx_site_price\([\s\S]*?\$\$;/)?.[0];
assert.ok(originalFunction,'Original FX contract missing');
const referenceArg=process.argv.find(value=>value.startsWith('--reference='));
const referenceFile=path.resolve(ROOT,referenceArg?.slice('--reference='.length)||'imports/overnight-prices/catalog-reference.json');
let reference=null;
try{reference=JSON.parse(await fs.readFile(referenceFile,'utf8'));}catch(error){if(error.code!=='ENOENT'||referenceArg)throw error;}
const policyFile=path.join(ROOT,'imports/overnight-prices/price-policy-reference.json');
let policy={settings:{vat_percent:20,markup_percent:2.5},latestRates:[{currency:'EUR',rate:49.606},{currency:'USD',rate:45.3541}]};
try{policy=JSON.parse(await fs.readFile(policyFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const sourceRows=(reference?.rows||[]).filter(row=>row[12]).map(row=>({legacyId:row[0],source:row[12]}));
const db=new PGlite();
try{
  await db.exec(`create table public.product_price_sources(product_id text primary key,base_amount numeric(14,2) not null,
    currency text not null,vat_included boolean not null,source text not null,source_ref text,active boolean not null,
    created_at timestamptz not null,updated_at timestamptz not null);
    create table public.price_fx_settings(singleton boolean primary key,markup_percent numeric,vat_percent numeric,enabled boolean,updated_at timestamptz);
    insert into public.price_fx_settings values(true,2.5,20,true,'2026-11-25T00:00:00Z');
    create table public.products(legacy_id text primary key,title text,amount numeric,old_amount numeric,price_status text);
    insert into public.products values('manual-sentinel','Existing product',2345.67,3000,'known');
    create temporary table vectors(id text primary key,base numeric,currency text,vat boolean,rate numeric,markup numeric,vat_percent numeric);
    create temporary table before_results(id text primary key,amount numeric);
    ${originalFunction}`);
  const fingerprint=async()=> (await db.query(`select jsonb_build_object(
    'products',(select jsonb_agg(to_jsonb(p)order by legacy_id)from public.products p),
    'sources',(select md5(coalesce(string_agg(md5(to_jsonb(p)::text),''order by product_id collate "C"),''))from public.product_price_sources p),
    'settings',(select jsonb_agg(to_jsonb(s))from public.price_fx_settings s))state`)).rows[0].state;
  for(let offset=0;offset<sourceRows.length;offset+=200){
    const batch=sourceRows.slice(offset,offset+200);
    await db.query(`insert into public.product_price_sources
      select x->>'legacyId',(x#>>'{source,baseAmount}')::numeric,x#>>'{source,currency}',(x#>>'{source,vatIncluded}')::boolean,
        x#>>'{source,source}',x#>>'{source,sourceRef}',(x#>>'{source,active}')::boolean,
        (x#>>'{source,updatedAt}')::timestamptz,(x#>>'{source,updatedAt}')::timestamptz
      from jsonb_array_elements($1::jsonb)x`,[JSON.stringify(batch)]);
  }
  const rates=new Map(policy.latestRates.map(row=>[row.currency,row.rate]));
  for(let offset=0;offset<sourceRows.length;offset+=200){
    const batch=sourceRows.slice(offset,offset+200).map(row=>({...row,rate:row.source.currency==='UAH'?1:rates.get(row.source.currency)}));
    await db.query(`insert into vectors select 'actual:'||(x->>'legacyId'),(x#>>'{source,baseAmount}')::numeric,
      x#>>'{source,currency}',(x#>>'{source,vatIncluded}')::boolean,(x->>'rate')::numeric,$2::numeric,$3::numeric
      from jsonb_array_elements($1::jsonb)x`,[JSON.stringify(batch),policy.settings.markup_percent,policy.settings.vat_percent]);
  }
  await db.exec(`insert into vectors select 'matrix:'||row_number()over(),base,currency,vat,rate,markup,vat_percent
    from unnest(array[0.01,0.49,0.5,1.005,9.99,100,1000,99999999999.99]::numeric[])base
    cross join unnest(array['UAH','EUR','USD'])currency cross join unnest(array[true,false])vat
    cross join unnest(array[1,45.3541,49.606]::numeric[])rate
    cross join unnest(array[0,2.5,50]::numeric[])markup cross join unnest(array[0,20,50]::numeric[])vat_percent;
    insert into before_results select id,public._fx_site_price(base,currency,vat,rate,markup,vat_percent)from vectors;`);
  const before=await fingerprint();
  await assert.rejects(db.exec(`insert into public.product_price_sources values('null-before',1,'EUR',null,'test',null,true,now(),now())`),/not-null|not null/i);
  await db.exec(migration);
  assert.deepEqual(await fingerprint(),before,'Migration changed prior source/product/settings rows');
  const mismatch=await db.query(`select count(*)::integer n from vectors v join before_results b using(id)
    where public._fx_site_price(v.base,v.currency,v.vat,v.rate,v.markup,v.vat_percent)is distinct from b.amount`);
  assert.equal(mismatch.rows[0].n,0,'A boolean VAT result changed');
  await db.exec(`insert into public.product_price_sources values('null-after',100,'EUR',null,'User recommended list',
    '{"vat":"unstated","treatment":"as-quoted"}',true,now(),now());`);
  const nulls=await db.query(`select public._fx_site_price(100,'EUR',null,49.606,2.5,20)null_eur,
    public._fx_site_price(100,'EUR',true,49.606,2.5,20)included_eur,
    public._fx_site_price(100,'EUR',false,49.606,2.5,20)excluded_eur,
    public._fx_site_price(100,'UAH',null,null,2.5,20)null_uah,
    public._fx_site_price(100,'EUR',null,null,2.5,20)missing_rate,
    (select vat_included is null from public.product_price_sources where product_id='null-after')vat_still_unknown`);
  const n=nulls.rows[0];assert.equal(n.null_eur,n.included_eur);assert.equal(Number(n.null_eur),5085);
  assert.equal(Number(n.excluded_eur),6102);assert.equal(Number(n.null_uah),100);assert.equal(n.missing_rate,null);assert.equal(n.vat_still_unknown,true);
  const count=(await db.query('select count(*)::integer n from vectors')).rows[0].n;
  console.log(JSON.stringify({status:'PASS',suite:'price-vat-unstated',actualPriorSources:sourceRows.length,booleanVectors:count,
    allPriorBooleanResultsIdentical:true,priorRowsAndSettingsUnchanged:true,nullAsQuotedWithoutVATClaim:true,
    falseStillAddsVAT:true,missingRateStillUnavailable:true,hostedConnections:0}));
}finally{await db.close();}
