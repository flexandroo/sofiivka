// Independent SELECT-only audit for the separate explicit-unit price release.
// The earlier 923-price audit and all of its artifacts are left untouched.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {detailsSql,priceRowFingerprint} from './build-rehau-price-audit.mjs';
const ROOT=path.resolve(import.meta.dirname,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const md5=b=>createHash('md5').update(b).digest('hex');
const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
const encoded=v=>`convert_from(decode(${literal(Buffer.from(JSON.stringify(v)).toString('base64'))},'base64'),'UTF8')::jsonb`;
const read=async file=>JSON.parse(await fs.readFile(path.resolve(ROOT,file),'utf8'));
const oldHash=rows=>md5([...rows].sort((a,b)=>Buffer.compare(Buffer.from(a.legacyId),Buffer.from(b.legacyId))).map(priceRowFingerprint).join(''));
function expectedUah(amount,rate){const r=v=>{const m=/^(\d+)(?:\.(\d+))?$/.exec(String(v));assert.ok(m);return[BigInt(m[1]+(m[2]||'')),10n**BigInt(m[2]?.length||0)];};const[a,b]=r(amount),[c,d]=r(rate),n=a*c*1025n,q=b*d*1000n;return Number((n*2n+q)/(q*2n));}
export function unitDetailsSql(rows,{manifest,part}){
 const base=detailsSql(rows,{manifest,part}).trim().replace(/;$/,'');
 const units=rows.map(p=>({id:p.legacyId,uuid:p.internalId,unit:p.expectedSaleUnit}));
 return `-- SELECT-only exact price/source plus explicit canonical and public units.
with financial as materialized(${base}),expected_units as materialized(select value e from jsonb_array_elements(${encoded(units)})),active as materialized(select snapshot_version from public.catalog_snapshot_pointer where singleton),
unit_checks as materialized(select e.e->>'id' id,(p.internal_id is null or p.sale_unit is distinct from e.e->>'unit'
 or s.legacy_id is null or c.legacy_id is null or s.payload#>>'{pricing,unit}'is distinct from e.e->>'unit' or c.card#>>'{pricing,unit}'is distinct from e.e->>'unit') bad
 from expected_units e left join public.products p on p.internal_id=(e.e->>'uuid')::uuid and p.legacy_id=e.e->>'id'
 left join public.catalog_product_snapshots s on s.legacy_id=p.legacy_id and s.snapshot_version=(select snapshot_version from active)
 left join public.catalog_product_cards c on c.legacy_id=p.legacy_id and c.snapshot_version=(select snapshot_version from active))
select financial.result||jsonb_build_object('unitFailures',(select count(*)from unit_checks where bad),'unitViolationIds',(select coalesce(jsonb_agg(id),'[]')from unit_checks where bad),'pass',(financial.result->>'pass')::boolean and(select count(*)from unit_checks where bad)=0)result from financial;
`;
}
export async function buildSaleUnitPriceAudit({manifestFile,expectedPlanSha256,baselineFile='backups/rehau-pipe-prices-2026-11-26/protected-before.json',outputDirectory}={}){
 assert.match(expectedPlanSha256||'',/^[a-f\d]{64}$/,'Explicit frozen plan SHA required');
 manifestFile??=(await read('imports/rehau-pipe-prices-2026-11-26/release-pointer.json')).manifest;
 const manifestBytes=await fs.readFile(path.resolve(ROOT,manifestFile)),manifest=JSON.parse(manifestBytes);
 assert.equal(manifest.format,'rehau-sale-unit-price-release-v1');assert.equal(manifest.projectRef,'fkjarsouuchjiedrrblc');assert.equal(manifest.planSha256,expectedPlanSha256);
 async function verified(file,digest){const bytes=await fs.readFile(path.resolve(ROOT,file));assert.equal(sha(bytes),digest);return JSON.parse(bytes);}
 const plan=await verified(manifest.planFile,manifest.planSha256),ref=await verified(manifest.referenceFile,manifest.referenceSha256),policy=await verified(manifest.policyFile,manifest.policySha256);
 assert.equal(ref.projectRef,manifest.projectRef);assert.equal(policy.projectRef,manifest.projectRef);assert.ok(ref.columns.includes('saleUnit'));assert.equal(policy.settings.enabled,true);assert.equal(Number(policy.settings.markup_percent),2.5);
 const rows=ref.rows.map(row=>Object.fromEntries(ref.columns.map((column,i)=>[column,row[i]]))),byId=new Map(rows.map(p=>[p.legacyId,p]));assert.equal(rows.length,19629);assert.equal(byId.size,rows.length);
 const original=rows.filter(p=>p.priceSource);assert.equal(original.length,2884);assert.ok(original.every(p=>p.amount>0&&p.oldAmount===null&&p.priceStatus==='known'&&p.priceSource.active));
 const rates=Object.fromEntries(policy.latestRates.filter(r=>['EUR','USD'].includes(r.currency)).map(r=>{assert.equal(r.source,'NBU');return[r.currency,{rate:r.rate,rateDate:r.rate_date}];}));assert.ok(rates.EUR&&rates.USD);
 const parsed=await verified(plan.parsedFile,plan.parsedSha256),quotes=new Map(parsed.quotes.map(q=>[q.quoteId,q])),aliases=[];
 for(const input of plan.aliasInputs)aliases.push(...await verified(input.file,input.sha256));
 const selected=new Set();for(const item of plan.items){
  assert.ok(!selected.has(item.legacyId));selected.add(item.legacyId);const prior=byId.get(item.legacyId),q=quotes.get(item.provenance.quoteId);assert.ok(prior&&q);
  assert.equal(prior.sku,item.sku);assert.equal(prior.internalId,item.internalId);assert.equal(prior.brand,'rehau');assert.equal(prior.publicationStatus,'published');assert.equal(item.publicationStatus,'published');
  assert.equal(prior.priceSource,null);assert.equal(prior.amount,null);assert.equal(prior.oldAmount,null);assert.equal(prior.priceStatus,'unknown');assert.equal(item.beforeSource,null);assert.deepEqual(item.before,{amount:null,oldAmount:null,currency:'UAH',priceStatus:'unknown'});
  assert.ok(['m','piece'].includes(item.expectedSaleUnit));assert.equal(prior.saleUnit,item.expectedSaleUnit);assert.equal(item.provenance.saleUnit,item.expectedSaleUnit);assert.equal(item.provenance.priceQuantity,1);assert.equal(item.provenance.quantityOrPackConversionApplied,false);
  assert.equal(q.source.fileSha256,'d0a968b79bd68a9fcf6ccee72db5e82ee6ece13686b1728fec2456494885fce4');assert.equal(q.source.currencyLabel,'Евро Рехау');assert.equal(q.priceStatus,'quoted');assert.equal(q.vatIncluded,null);
  assert.equal(item.afterSource.baseAmount,q.sourcePrice);assert.equal(item.afterSource.currency,'EUR');assert.equal(item.afterSource.vatIncluded,null);assert.equal(item.afterSource.active,true);assert.equal(item.afterSource.sourceRef,JSON.stringify(item.provenance));
  assert.equal(item.provenance.interpretedCurrency,'EUR');assert.equal(item.provenance.currencyAuthorization.markupPercent,2.5);assert.equal(item.after.amount,expectedUah(q.sourcePrice,rates.EUR.rate));assert.deepEqual(item.after,{amount:item.after.amount,oldAmount:null,currency:'UAH',priceStatus:'known'});
  assert.ok(aliases.some(a=>a.brand==='rehau'&&a.catalogSku===item.sku&&a.sourceSku===q.sku&&a.quoteId===q.quoteId&&a.expectedSaleUnit===item.expectedSaleUnit&&a.sourceUrl===item.provenance.manufacturerAlias.sourceUrl&&a.proof===item.provenance.manufacturerAlias.proof));
 }
 assert.equal(plan.items.length,manifest.changedProducts);assert.equal(manifest.summary.expectedPositive,original.length+plan.items.length);assert.deepEqual(manifest.chunks.flatMap(c=>c.ids),plan.items.map(p=>p.legacyId));
 for(const c of manifest.chunks){assert.equal(c.rows,c.ids.length);for(const[file,digest]of[[c.file,c.sha256],[c.rollbackFile,c.rollbackSha256]])assert.equal(sha(await fs.readFile(path.resolve(ROOT,file))),digest);}
 const baselineBytes=await fs.readFile(path.resolve(ROOT,baselineFile)),baseline=new Map(JSON.parse(baselineBytes).map(x=>[x.name,x]));
 for(const[name,count]of Object.entries({products:19629,product_attribute_values:49599,product_source_records:19629,product_media:37671,product_documents:83392,product_price_sources:2884}))assert.equal(baseline.get(name)?.rows,count);
 const oldIds=original.map(p=>({id:p.legacyId,uuid:p.internalId,unit:p.saleUnit})),newIds=plan.items.map(p=>({id:p.legacyId,uuid:p.internalId,unit:p.expectedSaleUnit}));
 const publicCount=rows.filter(p=>p.publicationStatus==='published').length;assert.equal(publicCount,19326);
 const chunks=manifest.chunks.map(c=>({sourceRef:c.sourceRef,rows:c.rows}));
 const fingerprint=['p.legacy_id','p.internal_id::text','p.sku','b.stable_id','p.publication_status::text','p.amount::text','p.old_amount::text','p.currency','p.price_status::text'].map(x=>`md5(case when ${x} is null then 'NULL'else 'VALUE:'||${x} end)`).join('||');
 const global=`-- SELECT-only whole catalogue and preserved old2884 commercial/source support.
with old_ids as materialized(select value e from jsonb_array_elements(${encoded(oldIds)})),new_ids as materialized(select value e from jsonb_array_elements(${encoded(newIds)})),
 supported as materialized(select e->>'id'id,(e->>'uuid')::uuid uuid from old_ids union all select e->>'id',(e->>'uuid')::uuid from new_ids),
 expected_chunks as materialized(select value e from jsonb_array_elements(${encoded(chunks)})),active as materialized(select snapshot_version from public.catalog_snapshot_pointer where singleton),
 rates as materialized(select distinct on(currency)currency,rate,rate_date,source from public.fx_rates where currency in('EUR','USD')order by currency,rate_date desc),
 runs as materialized(select *from public.price_fx_runs where rates->>'jobId'=${literal(manifest.jobId)}and rates->>'operation'='apply'),
 old_prices as materialized(select p.legacy_id,md5(${fingerprint})fingerprint from old_ids o join public.products p on p.internal_id=(o.e->>'uuid')::uuid join public.brands b on b.internal_id=p.brand_id),
 old_source_rows as materialized(select s.*from public.product_price_sources s where exists(select 1 from old_ids o where(o.e->>'uuid')::uuid=s.product_id)),
 stats as(select
 (select count(*)from public.products)products,(select count(*)from public.products where publication_status='published')published,
 (select count(*)from public.products where amount>0 and price_status='known')known_prices,(select count(*)from public.products where old_amount is not null)old_prices,
 (select count(*)from public.product_attribute_values)attributes,(select count(*)from public.product_source_records)source_records,(select count(*)from public.product_media)media,(select count(*)from public.product_documents)documents,
 (select count(*)from public.product_price_sources)price_sources,(select count(*)from public.product_price_sources where active)active_price_sources,
 (select count(*)from public.products p where p.amount is not null and not exists(select 1 from supported e where e.id=p.legacy_id and e.uuid=p.internal_id))unsupported_prices,
 (select count(*)from public.product_price_sources s where not exists(select 1 from supported e where e.uuid=s.product_id))unsupported_sources,
 (select count(*)from public.products p left join public.product_price_sources s on s.product_id=p.internal_id left join rates r on r.currency=s.currency where p.amount is not null and case when s.product_id is null or not s.active or s.currency not in('UAH','EUR','USD')or(s.currency<>'UAH'and r.rate is null)then true else p.currency<>'UAH'or p.price_status<>'known'or p.amount is distinct from public._fx_site_price(s.base_amount,s.currency,s.vat_included,case when s.currency='UAH'then 1 else r.rate end,2.5,${Number(policy.settings.vat_percent)})end)unsupported_formula_prices,
 (select count(*)from old_prices)original_checked,(select md5(coalesce(string_agg(fingerprint,''order by legacy_id collate "C"),''))from old_prices)original_price_hash,
 (select count(*)from old_source_rows)original_source_rows,(select md5(coalesce(string_agg(md5(to_jsonb(s)::text),''order by md5(to_jsonb(s)::text)collate "C"),''))from old_source_rows s)original_source_hash,
 (select count(*)from old_ids o left join public.products p on p.internal_id=(o.e->>'uuid')::uuid where p.internal_id is null or p.sale_unit is distinct from o.e->>'unit')original_unit_failures,
 (select count(*)from public.catalog_product_cards c join active a using(snapshot_version))active_cards,(select count(*)from public.catalog_product_snapshots s join active a using(snapshot_version))active_snapshots,
 (select count(*)from public.products p left join public.catalog_product_cards c on c.legacy_id=p.legacy_id and c.snapshot_version=(select snapshot_version from active)where p.publication_status='published'and(c.legacy_id is null or c.amount is distinct from p.amount or c.price_status is distinct from p.price_status or(c.card#>>'{pricing,amount}')::numeric is distinct from p.amount or(c.card#>>'{pricing,oldAmount}')::numeric is distinct from p.old_amount or c.card#>>'{pricing,currency}'is distinct from p.currency or c.card#>>'{pricing,priceStatus}'is distinct from p.price_status::text or coalesce(c.card#>>'{pricing,unit}','piece')is distinct from p.sale_unit))card_pricing_unit_failures,
 (select count(*)from public.catalog_product_cards c join active a using(snapshot_version)left join public.products p on p.legacy_id=c.legacy_id where p.internal_id is null or p.publication_status<>'published')extra_public_cards,
 (select count(*)from public.products p left join public.catalog_product_snapshots s on s.legacy_id=p.legacy_id and s.snapshot_version=(select snapshot_version from active)where p.publication_status='published'and(s.legacy_id is null or(s.payload#>>'{pricing,amount}')::numeric is distinct from p.amount or(s.payload#>>'{pricing,oldAmount}')::numeric is distinct from p.old_amount or s.payload#>>'{pricing,currency}'is distinct from p.currency or s.payload#>>'{pricing,priceStatus}'is distinct from p.price_status::text or coalesce(s.payload#>>'{pricing,unit}','piece')is distinct from p.sale_unit))snapshot_pricing_unit_failures,
 (select count(*)from runs)job_rows,(select coalesce(sum(changed),0)from runs)job_changed,
 (select count(*)from expected_chunks e where(select count(*)from runs r where r.rates->>'sourceRef'=e.e->>'sourceRef'and r.changed=(e.e->>'rows')::int)<>1)chunk_failures,
 (select count(*)from runs r where not exists(select 1 from expected_chunks e where e.e->>'sourceRef'=r.rates->>'sourceRef')or r.rates->>'planSha256'is distinct from ${literal(manifest.planSha256)})unexpected_job_rows,
 (select jsonb_object_agg(currency,jsonb_build_object('rate',rate,'rateDate',rate_date::text))from rates)actual_rates,(select count(*)from public.catalog_snapshot_releases)release_rows,(select snapshot_version from active)active_version)
select jsonb_build_object('jobId',${literal(manifest.jobId)},'planSha256',${literal(manifest.planSha256)},'actual',to_jsonb(stats),'expectedNew',${plan.items.length},'expectedKnown',${manifest.summary.expectedPositive},
 'pass',products=19629 and published=19326 and known_prices=${manifest.summary.expectedPositive} and old_prices=0 and attributes=49599 and source_records=19629 and media=37671 and documents=83392
 and price_sources=${manifest.summary.expectedPositive} and active_price_sources=${manifest.summary.expectedPositive} and unsupported_prices=0 and unsupported_sources=0 and unsupported_formula_prices=0
 and original_checked=2884 and original_price_hash=${literal(oldHash(original))}and original_source_rows=2884 and original_source_hash=${literal(baseline.get('product_price_sources').hash)}and original_unit_failures=0
 and active_cards=19326 and active_snapshots=19570 and card_pricing_unit_failures=0 and snapshot_pricing_unit_failures=0 and extra_public_cards=0
 and job_rows=${manifest.chunks.length} and job_changed=${plan.items.length} and chunk_failures=0 and unexpected_job_rows=0 and actual_rates=${encoded(rates)} and release_rows=1 and active_version=${literal(manifest.activeVersion)}
 and(select enabled and markup_percent=2.5 and vat_percent=${Number(policy.settings.vat_percent)} from public.price_fx_settings where singleton))result from stats;
`;
 const output=path.resolve(ROOT,outputDirectory??path.join(path.dirname(manifestFile),'audits'));await fs.mkdir(output,{recursive:true});const files=[];
 async function save(name,kind,sql,rows){assert.ok(Buffer.byteLength(sql)<=600000);assert.ok(!/\b(?:update|insert|delete|vacuum|alter|create|drop|truncate|set)\b/i.test(sql.replace(/--[^\n]*/g,'')));const file=path.join(output,name);await fs.writeFile(file,sql);files.push({file:path.relative(ROOT,file).replaceAll('\\','/'),kind,rows,bytes:Buffer.byteLength(sql),sha256:sha(sql)});}
 let pending=[],part=1;for(const row of plan.items){if(pending.length&&(pending.length>=100||Buffer.byteLength(unitDetailsSql([...pending,row],{manifest,part}))>600000)){await save(`details-${String(part++).padStart(3,'0')}.sql`,'details',unitDetailsSql(pending,{manifest,part:part-1}),pending.length);pending=[];}pending.push(row);}if(pending.length)await save(`details-${String(part).padStart(3,'0')}.sql`,'details',unitDetailsSql(pending,{manifest,part}),pending.length);
 await save('global.sql','global',global,19629);
 const result={format:'bounded-rehau-sale-unit-price-audit-v1',status:'SELECT_ONLY_NOT_EXECUTED',jobId:manifest.jobId,manifestFile,manifestSha256:sha(manifestBytes),planSha256:manifest.planSha256,baselineFile,baselineSha256:sha(baselineBytes),expectedSelected:plan.items.length,expectedOriginalSupported:original.length,expectedKnown:manifest.summary.expectedPositive,expectedPerMetre:plan.items.filter(p=>p.expectedSaleUnit==='m').length,expectedPiece:plan.items.filter(p=>p.expectedSaleUnit==='piece').length,files,sourceHashContract:'Full original source-row MD5 values sorted by row hash COLLATE C, matching root protected-before.',instructions:'Run every pure SELECT; require every result.pass=true. Root protected nonfinancial whole-row hashes remain separate.'};
 assert.equal(files.filter(f=>f.kind==='details').reduce((n,f)=>n+f.rows,0),plan.items.length);await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(const arg of process.argv.slice(2)){const[key,...rest]=arg.replace(/^--/,'').split('='),v=rest.join('=');if(key==='manifest')options.manifestFile=v;else if(key==='plan-sha256')options.expectedPlanSha256=v;else if(key==='baseline')options.baselineFile=v;else if(key==='output')options.outputDirectory=v;else throw Error('Unknown argument '+arg);}
 const r=await buildSaleUnitPriceAudit(options);console.log(JSON.stringify({...r,files:r.files.map(f=>({kind:f.kind,rows:f.rows,bytes:f.bytes,sha256:f.sha256})),hostedConnections:0}));
}
