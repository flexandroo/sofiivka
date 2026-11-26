// Compile bounded, replay-safe price-only transactions and reverse transactions. Never executes SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ACTIVE='ae5db3f38bc5df72c2d0ea11bf95eefaf589867ff011bfa82dd17e1f3805e564';
const DEFAULT=path.join(ROOT,'imports/overnight-prices');
const sha=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const sourceComparable=value=>value?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='updatedAt')):null;
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const priceEqual=(left,right)=>['amount','oldAmount','currency','priceStatus'].every(key=>left[key]===right[key]);

export function changeItems(plan){
  const seen=new Set();const items=[];
  for(const row of plan.rows){
    assert.ok(row.legacyId&&row.sku&&row.brand&&row.internalId,'Missing exact product identity');
    assert.ok(!seen.has(row.legacyId),'Duplicate planned product');seen.add(row.legacyId);
    let targetSource=row.expected.priceSource;
    if(row.action==='apply_user_price_list')targetSource=row.priceSource;
    else if(row.deactivateUnapprovedPriceSource&&targetSource)targetSource={...targetSource,active:false};
    else if(row.action==='list_on_request'&&targetSource)throw new Error('An existing source becoming on-request needs an explicit source policy');
    const currentSource=sourceComparable(row.expected.priceSource),newSource=sourceComparable(targetSource);
    const sourceChanged=!equal(currentSource,newSource);
    if(priceEqual(row.expected,row.target)&&!sourceChanged)continue;
    assert.ok(['apply_user_price_list','clear_non_list_price','retain_prior_price_list','list_on_request'].includes(row.action),'Unexpected changed row');
    items.push({legacyId:row.legacyId,sku:row.sku,brand:row.brand,internalId:row.internalId,
      publicationStatus:row.expected.publicationStatus,
      before:{amount:row.expected.amount,oldAmount:row.expected.oldAmount,currency:row.expected.currency,priceStatus:row.expected.priceStatus},
      after:row.target,beforeSource:currentSource,afterSource:newSource,
      originalSourceUpdatedAt:row.expected.priceSource?.updatedAt||null,sourceChanged,
      provenance:row.provenance||{kind:row.action}});
  }
  return items;
}

function projectedSource(alias){return `jsonb_build_object('baseAmount',${alias}.base_amount,'currency',${alias}.currency,
 'vatIncluded',${alias}.vat_included,'active',${alias}.active,'source',${alias}.source,'sourceRef',${alias}.source_ref)`;}
const jsonSql=value=>`convert_from(decode(${literal(Buffer.from(JSON.stringify(value)).toString('base64'))},'base64'),'UTF8')::jsonb`;

export function priceChunkSql(items,{sourceRef,jobId,planSha256,policy,productCount=19629,direction='apply',activeVersion=ACTIVE}){
  assert.ok(items.length>0&&items.length<=100,'A price chunk must contain1–100 exact products');
  assert.ok(['apply','rollback'].includes(direction));assert.match(activeVersion,/^[a-f0-9]{64}$/);
  const payload=items.map(item=>({...item,
    expected:direction==='apply'?item.before:item.after,target:direction==='apply'?item.after:item.before,
    expectedSource:direction==='apply'?item.beforeSource:item.afterSource,
    targetSource:direction==='apply'?item.afterSource:item.beforeSource}));
  const rates=Object.fromEntries(policy.latestRates.filter(row=>['EUR','USD'].includes(row.currency)).map(row=>[row.currency,{rate:row.rate,rateDate:row.rate_date}]));
  return `-- Exact price-only ${direction}; ${sourceRef}; frozen plan SHA256 ${planSha256}.
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';
set local jit=off;
set local timezone='UTC';
do $user_price_chunk$
declare
 items jsonb:=${jsonSql(payload)};
 expected_rates jsonb:=${jsonSql(rates)};
 item jsonb;
 product public.products%rowtype;
 current_source jsonb;
 expected_source jsonb;
 target_source jsonb;
 source_updated_at timestamptz;
 pricing_matches boolean;
 source_matches boolean;
 audit_exists boolean;
 changed_ids uuid[]:='{}';
 changes jsonb:='[]';
 verified integer:=0;
 active_version text;
 actual_rates jsonb;
begin
 -- The established external-write trigger skips non-authenticated import sessions; never disable triggers.
 if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'A privileged importer session is required'; end if;
 if current_database()<>'postgres' then raise exception 'Unexpected price database'; end if;
 if jsonb_array_length(items)>100 then raise exception 'Oversized price chunk'; end if;
 if (select count(*)from public.products)<>${Number(productCount)} then raise exception 'Catalogue product count changed'; end if;
 select pointer.snapshot_version into active_version from public.catalog_snapshot_pointer pointer where singleton for update;
 if active_version is distinct from ${literal(activeVersion)} then raise exception 'Active catalogue changed'; end if;
 perform 1 from public.catalog_snapshot_releases where snapshot_version=active_version and ready for update;
 if not found then raise exception 'A ready active release is required'; end if;
 perform 1 from public.price_fx_settings where singleton and enabled
   and markup_percent=${Number(policy.settings.markup_percent)} and vat_percent=${Number(policy.settings.vat_percent)} for share;
 if not found then raise exception 'Approved FX settings changed'; end if;
 select jsonb_object_agg(currency,jsonb_build_object('rate',rate,'rateDate',rate_date::text)) into actual_rates
 from(select distinct on(currency)currency,rate,rate_date from public.fx_rates where currency in('EUR','USD')order by currency,rate_date desc)r;
 if actual_rates is distinct from expected_rates then raise exception 'Latest NBU rates changed; rebuild the price plan'; end if;
 if exists(select 1 from pg_attribute where attrelid='public.product_price_sources'::regclass and attname='vat_included'and attnotnull)
   or public._fx_site_price(100,'EUR',null,1,0,20)is distinct from 100
   or public._fx_site_price(100,'EUR',false,1,0,20)is distinct from 120
   or public._fx_site_price(100,'EUR',true,1,0,20)is distinct from 100
 then raise exception 'Reviewed nullable/as-quoted VAT contract is required'; end if;
 if (select count(*)from public.price_fx_runs where rates->>'sourceRef'=${literal(sourceRef)})>1 then raise exception 'Ambiguous prior price audit'; end if;
 select exists(select 1 from public.price_fx_runs where rates->>'sourceRef'=${literal(sourceRef)})into audit_exists;
 for item in select value from jsonb_array_elements(items)loop
   select p.* into product from public.products p join public.brands b on b.internal_id=p.brand_id
   where p.legacy_id=item->>'legacyId'and p.internal_id=(item->>'internalId')::uuid
     and p.sku=item->>'sku'and b.stable_id=item->>'brand'
     and p.publication_status::text=item->>'publicationStatus' for update of p;
   if not found then raise exception 'Price identity/status guard refused %',item->>'legacyId'; end if;
   current_source:=null;source_updated_at:=null;
   select ${projectedSource('s')},s.updated_at into current_source,source_updated_at
     from public.product_price_sources s where product_id=product.internal_id for update;
   expected_source:=nullif(item->'expectedSource','null'::jsonb);
   target_source:=nullif(item->'targetSource','null'::jsonb);
   -- Normalize the one numeric source amount; JSON source text must never become a currency guess.
   if expected_source is not null then expected_source:=jsonb_set(expected_source,'{baseAmount}',to_jsonb((expected_source->>'baseAmount')::numeric));end if;
   if target_source is not null then target_source:=jsonb_set(target_source,'{baseAmount}',to_jsonb((target_source->>'baseAmount')::numeric));end if;
   if target_source is not null and(target_source->>'active')::boolean and item#>>'{target,priceStatus}'='known'
     and public._fx_site_price((target_source->>'baseAmount')::numeric,target_source->>'currency',
       (target_source->>'vatIncluded')::boolean,(expected_rates->(target_source->>'currency')->>'rate')::numeric,
       ${Number(policy.settings.markup_percent)},${Number(policy.settings.vat_percent)})is distinct from(item#>>'{target,amount}')::numeric
   then raise exception 'Target price is inconsistent with its exact approved source/FX %',item->>'legacyId';end if;
   pricing_matches:=product.amount is not distinct from(item#>>'{target,amount}')::numeric
     and product.old_amount is not distinct from(item#>>'{target,oldAmount}')::numeric
     and product.currency=item#>>'{target,currency}'and product.price_status::text=item#>>'{target,priceStatus}';
   source_matches:=current_source is not distinct from target_source;
   if pricing_matches and source_matches then verified:=verified+1;continue;end if;
   if audit_exists then raise exception 'Completed price chunk differs; refusing replay overwrite %',item->>'legacyId';end if;
   if product.amount is distinct from(item#>>'{expected,amount}')::numeric
     or product.old_amount is distinct from(item#>>'{expected,oldAmount}')::numeric
     or product.currency is distinct from(item#>>'{expected,currency}')
     or product.price_status::text is distinct from(item#>>'{expected,priceStatus}')
     or current_source is distinct from expected_source
   then raise exception 'Prior commercial/source state changed %',item->>'legacyId';end if;
${direction==='apply'?`   if expected_source is not null and source_updated_at is distinct from(item->>'originalSourceUpdatedAt')::timestamptz then
     raise exception 'Prior price source timestamp changed %',item->>'legacyId';end if;`:''}
   if target_source is distinct from current_source then
     if target_source is null then
       -- Reverse only this job's newly inserted source after its exact full-source guard above.
       delete from public.product_price_sources where product_id=product.internal_id;
     else
       if target_source->>'currency'not in('UAH','EUR','USD')then raise exception 'Unsupported source currency';end if;
       insert into public.product_price_sources(product_id,base_amount,currency,vat_included,source,source_ref,active)
       values(product.internal_id,(target_source->>'baseAmount')::numeric,target_source->>'currency',
         (target_source->>'vatIncluded')::boolean,target_source->>'source',target_source->>'sourceRef',(target_source->>'active')::boolean)
       on conflict(product_id)do update set base_amount=excluded.base_amount,currency=excluded.currency,
         vat_included=excluded.vat_included,source=excluded.source,source_ref=excluded.source_ref,active=excluded.active,updated_at=now();
     end if;
   end if;
   update public.products set amount=(item#>>'{target,amount}')::numeric,old_amount=(item#>>'{target,oldAmount}')::numeric,
     currency=item#>>'{target,currency}',price_status=(item#>>'{target,priceStatus}')::public.product_price_status,updated_at=now()
   where internal_id=product.internal_id;
   changed_ids:=array_append(changed_ids,product.internal_id);
   changes:=changes||jsonb_build_array(jsonb_build_object('legacyId',product.legacy_id,
     'before',item->'expected','after',item->'target','beforeSource',expected_source,'afterSource',target_source,'provenance',item->'provenance'));
 end loop;
 if cardinality(changed_ids)>0 then
   -- Exactly one cache refresh per bounded transaction; source characteristics stay in the existing payload.
   perform public._admin_refresh_catalog(changed_ids);
   insert into public.price_fx_runs(rates,changed,unchanged,skipped,changes)
   values(jsonb_build_object('kind','user_price_list_reconciliation','operation',${literal(direction)},
     'jobId',${literal(jobId)},'sourceRef',${literal(sourceRef)},'planSha256',${literal(planSha256)},'nbu',expected_rates),
     cardinality(changed_ids),verified,0,changes);
 end if;
 if (select snapshot_version from public.catalog_snapshot_pointer where singleton)is distinct from active_version
   or(select count(*)from public.products)<>${Number(productCount)} then raise exception 'Catalogue identity changed';end if;
end $user_price_chunk$;
commit;
select jsonb_build_object('status','committed','sourceRef',${literal(sourceRef)},
  'auditRows',(select count(*)from public.price_fx_runs where rates->>'sourceRef'=${literal(sourceRef)}))result;
`;
}

export async function prepare({directory=DEFAULT,chunkSize=75}={}){
  assert.ok(Number.isSafeInteger(chunkSize)&&chunkSize>0&&chunkSize<=100,'chunkSize must be1–100');
  const planBytes=await fs.readFile(path.join(directory,'price-plan.json'));const plan=JSON.parse(planBytes.toString('utf8'));
  const policy=JSON.parse(await fs.readFile(path.join(directory,'price-policy-reference.json'),'utf8'));
  assert.equal(plan.projectRef,'fkjarsouuchjiedrrblc');assert.equal(plan.status,'STAGED_NOT_APPLIED');
  assert.equal(plan.referenceSha256,sha(await fs.readFile(path.resolve(ROOT,plan.referenceFile))),'Reference changed');
  const planSha256=sha(planBytes),jobId=`user-prices-20261126-${planSha256.slice(0,12)}`;
  const items=changeItems(plan),output=path.join(directory,'releases',jobId);await fs.mkdir(output,{recursive:true});
  const chunks=[];
  for(let offset=0;offset<items.length;offset+=chunkSize){
    const rows=items.slice(offset,offset+chunkSize),index=chunks.length+1;
    const label=String(index).padStart(3,'0');
    const sourceRef=`${jobId}/apply/${label}`;
    const recoveryRef=`${jobId}/rollback/${label}`;
    const sql=priceChunkSql(rows,{sourceRef,jobId,planSha256,policy,productCount:plan.rows.length});
    const recovery=priceChunkSql(rows,{sourceRef:recoveryRef,jobId,planSha256,policy,productCount:plan.rows.length,direction:'rollback'});
    assert.ok(Buffer.byteLength(sql)<1800000,'A generated transaction exceeds the hosted transport budget');
    const file=path.join(output,`${label}-apply.sql`),rollbackFile=path.join(output,`${label}-rollback.sql`);
    await fs.writeFile(file,sql);await fs.writeFile(rollbackFile,recovery);
    chunks.push({index,sourceRef,recoveryRef,ids:rows.map(row=>row.legacyId),rows:rows.length,
      file:path.relative(ROOT,file).replaceAll('\\','/'),sha256:sha(sql),bytes:Buffer.byteLength(sql),
      rollbackFile:path.relative(ROOT,rollbackFile).replaceAll('\\','/'),rollbackSha256:sha(recovery)});
  }
  const manifest={format:'user-price-release-v1',status:'PREPARED_NOT_APPLIED',jobId,projectRef:plan.projectRef,activeVersion:ACTIVE,
    planSha256,policySha256:plan.policySha256,referenceSha256:plan.referenceSha256,canonicalProducts:plan.rows.length,
    changedProducts:items.length,chunkSize,chunks,
    newListSources:items.filter(row=>row.provenance.kind==='user_price_list').length,
    priceFieldsOnly:true,sourceProvenancePreserved:true,singleRefreshPerChunk:true,
    requiresMigration:'20261126033003_user_price_vat_unstated_as_quoted',hostedWrites:0};
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(directory,'release-pointer.json'),JSON.stringify({jobId,manifest:path.relative(ROOT,path.join(output,'manifest.json')).replaceAll('\\','/'),planSha256},null,2)+'\n');
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=process.argv.find(a=>a.startsWith('--chunk-size='));const result=await prepare({chunkSize:arg?Number(arg.slice(13)):75});
  console.log(JSON.stringify({status:result.status,jobId:result.jobId,changedProducts:result.changedProducts,chunks:result.chunks.length,newListSources:result.newListSources,hostedWrites:0}));
}
