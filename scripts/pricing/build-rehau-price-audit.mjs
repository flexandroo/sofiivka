// Bounded SELECT-only desired-state checks for a separately frozen additive
// REHAU release. No hosted client, mutations, policy changes or old audit edits.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(import.meta.dirname,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const md5=v=>createHash('md5').update(v).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(path.resolve(ROOT,p),'utf8'));
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const encoded=v=>`convert_from(decode(${literal(Buffer.from(JSON.stringify(v)).toString('base64'))},'base64'),'UTF8')::jsonb`;
const comparables=['legacyId','internalId','sku','brand','publicationStatus','amount','oldAmount','currency','priceStatus'];
const rowExpressions=['p.legacy_id','p.internal_id::text','p.sku','b.stable_id','p.publication_status::text','p.amount::text','p.old_amount::text','p.currency','p.price_status::text'];
const sqlFingerprint=`md5(${rowExpressions.map(x=>`md5(case when ${x} is null then 'NULL' else 'VALUE:'||${x} end)`).join('||')})`;
function decimal2(v){if(v===null||v===undefined)return null;const text=String(v);assert.match(text,/^\d+(?:\.\d{1,2})?$/);const[a,b='']=text.split('.');return a+'.'+b.padEnd(2,'0');}
export function priceRowFingerprint(row){return md5(comparables.map(k=>{const v=['amount','oldAmount'].includes(k)?decimal2(row[k]):row[k];return md5(v===null||v===undefined?'NULL':'VALUE:'+String(v));}).join(''));}
function oldPriceHash(rows){return md5([...rows].sort((a,b)=>Buffer.compare(Buffer.from(a.legacyId),Buffer.from(b.legacyId))).map(priceRowFingerprint).join(''));}
function rational(v){const match=/^(\d+)(?:\.(\d+))?$/.exec(String(v));assert.ok(match,'Plain positive decimal required');return{n:BigInt(match[1]+(match[2]||'')),d:10n**BigInt(match[2]?.length||0)};}
function euroAsQuoted(base,rate){const a=rational(base),b=rational(rate),n=a.n*b.n*1025n,d=a.d*b.d*1000n;assert.ok(n>0n&&d>0n);return Number((2n*n+d)/(2n*d));}
// Exact WC connection articles may contain «Труба» in their catalogue name.
// Their verified fitting class remains authoritative; a missing class must not
// hide a real Cyrillic pipe head from the unresolved-unit gate.
const pipeClasses=new Set(['Kunststoffrohr glatt','Mehrschichtrohr glatt','Vorisoliertes Kunststoffrohr','Kunststoffrohr gerippt','Drainage-/Infiltrationsrohr','Schutzrohr für Kunststoff-Rohrsystem']);
const clearlyPipe=p=>p.category?.endsWith('-pipes')||p.category==='ventilation-ducts'||pipeClasses.has(p.sourceEvidence?.sourceEtim?.class?.name)||(!p.sourceEvidence?.sourceEtim?.class?.name&&/(?<!\p{L})труба(?!\p{L})/iu.test(p.title||''));

export function detailsSql(rows,{manifest,part}){
 return `-- SELECT-only exact new REHAU price/source/provenance audit part ${part}.
with expected as materialized(select value e from jsonb_array_elements(${encoded(rows)})), checked as materialized(
 select e.e,p.internal_id,p.legacy_id,p.sku,p.publication_status,b.stable_id brand,p.amount,p.old_amount,p.currency,p.price_status,s.product_id,
 (p.internal_id is null or p.internal_id::text is distinct from e.e->>'internalId' or p.legacy_id is distinct from e.e->>'legacyId'
 or p.sku is distinct from e.e->>'sku' or b.stable_id is distinct from 'rehau'
 or p.publication_status::text is distinct from e.e->>'publicationStatus'
 or p.amount is distinct from(e.e#>>'{after,amount}')::numeric or p.old_amount is not null
 or p.currency is distinct from 'UAH' or p.price_status::text is distinct from 'known') core_bad,
 (s.product_id is null or s.base_amount is distinct from(e.e#>>'{afterSource,baseAmount}')::numeric
 or s.currency is distinct from 'EUR' or s.vat_included is not null or s.active is distinct from true
 or s.source is distinct from e.e#>>'{afterSource,source}' or s.source_ref is distinct from e.e#>>'{afterSource,sourceRef}') source_bad
 from expected e left join public.products p on p.internal_id=(e.e->>'internalId')::uuid
 left join public.brands b on b.internal_id=p.brand_id left join public.product_price_sources s on s.product_id=p.internal_id
)
select jsonb_build_object('jobId',${literal(manifest.jobId)},'part',${part},'expected',${rows.length},'checked',count(*),
 'canonicalFailures',count(*)filter(where core_bad),'sourceProvenanceFailures',count(*)filter(where source_bad),
 'violations',(select coalesce(jsonb_agg(v),'[]')from(select e->>'legacyId' id,core_bad,source_bad from checked where core_bad or source_bad order by e->>'legacyId' limit 20)v),
 'pass',count(*)=${rows.length} and count(*)filter(where core_bad or source_bad)=0) result from checked;
`;
}

export async function buildRehauPriceAudit({manifestFile,expectedPlanSha256,baselineFile='backups/rehau-prices-2026-11-26/protected-before.json',outputDirectory,globalRevision}={}){
 if(globalRevision)assert.match(globalRevision,/^r[2-9][0-9]*$/);
 assert.match(expectedPlanSha256||'',/^[a-f\d]{64}$/,'Provide the explicit final frozen --plan-sha256');
 if(!manifestFile)manifestFile=(await read('imports/rehau-prices-2026-11-26/release-pointer.json')).manifest;
 const manifestBytes=await fs.readFile(path.resolve(ROOT,manifestFile)),manifest=JSON.parse(manifestBytes);
 assert.equal(manifest.format,'rehau-eur-user-price-release-v1');assert.equal(manifest.projectRef,'fkjarsouuchjiedrrblc');assert.equal(manifest.planSha256,expectedPlanSha256);
 const planBytes=await fs.readFile(path.resolve(ROOT,manifest.planFile));assert.equal(sha(planBytes),expectedPlanSha256);const plan=JSON.parse(planBytes);
 const referenceBytes=await fs.readFile(path.resolve(ROOT,manifest.referenceFile));assert.equal(sha(referenceBytes),manifest.referenceSha256);const reference=JSON.parse(referenceBytes);
 const policyBytes=await fs.readFile(path.resolve(ROOT,manifest.policyFile));assert.equal(sha(policyBytes),manifest.policySha256);const policy=JSON.parse(policyBytes);
 assert.equal(reference.projectRef,manifest.projectRef);assert.equal(policy.projectRef,manifest.projectRef);assert.equal(Number(policy.settings.markup_percent),2.5);assert.equal(policy.settings.enabled,true);
 const rates=Object.fromEntries(policy.latestRates.filter(x=>['EUR','USD'].includes(x.currency)).map(x=>{assert.equal(x.source,'NBU');return[x.currency,{rate:x.rate,rateDate:x.rate_date}];}));assert.ok(rates.EUR&&rates.USD);
 const ref=reference.rows.map(r=>Object.fromEntries(reference.columns.map((c,i)=>[c,r[i]])));assert.equal(ref.length,19629);assert.equal(manifest.canonicalProducts,ref.length);
 const refMap=new Map(ref.map(r=>[r.legacyId,r]));assert.equal(refMap.size,ref.length);
 const original=ref.filter(p=>p.priceSource);assert.equal(original.length,1961);assert.ok(original.every(p=>p.brand!=='rehau'&&p.priceStatus==='known'&&p.amount>0&&p.oldAmount===null&&p.priceSource.active));
 const manufacturerBytes=await fs.readFile(path.resolve(ROOT,plan.manufacturerFile));assert.equal(sha(manufacturerBytes),plan.manufacturerSha256);
 const manufacturer=new Map(JSON.parse(manufacturerBytes).products.map(p=>[p.sku,p]));
 const parsedBytes=await fs.readFile(path.resolve(ROOT,plan.parsedFile));assert.equal(sha(parsedBytes),plan.parsedSha256);const quotes=new Map(JSON.parse(parsedBytes).quotes.map(q=>[q.quoteId,q]));
 const aliases=[];for(const input of plan.aliasInputs){const bytes=await fs.readFile(path.resolve(ROOT,input.file));assert.equal(sha(bytes),input.sha256);aliases.push(...JSON.parse(bytes));}
 const decisions=new Map();for(const input of plan.reviewInputs??[]){const bytes=await fs.readFile(path.resolve(ROOT,input.file));assert.equal(sha(bytes),input.sha256);if(input.file.endsWith('/reviewed-alias-decisions.json'))for(const row of JSON.parse(bytes).rows)decisions.set(row.quoteId,row);}
 assert.ok(decisions.size,'Frozen independent alias/unit decisions are required');
 const seen=new Set();for(const item of plan.items){
   assert.ok(!seen.has(item.legacyId));seen.add(item.legacyId);const prior=refMap.get(item.legacyId);assert.ok(prior);assert.equal(prior.sku,item.sku);assert.equal(prior.internalId,item.internalId);assert.equal(prior.brand,'rehau');assert.equal(prior.publicationStatus,'published');assert.equal(item.publicationStatus,'published');
   assert.equal(prior.priceSource,null);assert.equal(prior.amount,null);assert.equal(prior.oldAmount,null);assert.equal(prior.priceStatus,'unknown');assert.equal(item.beforeSource,null);assert.deepEqual(item.before,{amount:null,oldAmount:null,currency:'UAH',priceStatus:'unknown'});
   const official=manufacturer.get(item.sku);assert.ok(official);assert.ok(!clearlyPipe(official),'Pipe with unresolved unit selected: '+item.sku);
   const q=quotes.get(item.provenance.quoteId);assert.ok(q);assert.equal(q.source.fileSha256,'d0a968b79bd68a9fcf6ccee72db5e82ee6ece13686b1728fec2456494885fce4');assert.equal(q.source.currencyLabel,'Евро Рехау');assert.equal(q.priceStatus,'quoted');assert.equal(q.vatIncluded,null);
   assert.ok(decisions.get(q.quoteId)?.decision.startsWith('eligible-'),'Selected quote lacks eligible exact-variant/unit decision: '+item.sku);
   assert.equal(item.afterSource.baseAmount,q.sourcePrice);assert.equal(item.afterSource.currency,'EUR');assert.equal(item.afterSource.vatIncluded,null);assert.equal(item.afterSource.active,true);assert.equal(item.afterSource.sourceRef,JSON.stringify(item.provenance));
   assert.equal(item.provenance.interpretedCurrency,'EUR');assert.equal(item.provenance.currencyAuthorization.markupPercent,2.5);assert.equal(item.provenance.stockImported,false);
   assert.ok(aliases.some(a=>a.brand==='rehau'&&a.sourceSku===q.sku&&a.catalogSku===item.sku&&(!a.quoteId||a.quoteId===q.quoteId)&&a.sourceUrl===item.provenance.manufacturerAlias.sourceUrl&&a.proof===item.provenance.manufacturerAlias.proof));
   assert.equal(item.after.amount,euroAsQuoted(q.sourcePrice,rates.EUR.rate));assert.equal(item.after.oldAmount,null);assert.equal(item.after.currency,'UAH');assert.equal(item.after.priceStatus,'known');
 }
 assert.equal(plan.items.length,manifest.changedProducts);assert.equal(manifest.summary.expectedPositive,original.length+plan.items.length);
 assert.deepEqual(manifest.chunks.flatMap(c=>c.ids),plan.items.map(x=>x.legacyId));
 for(const c of manifest.chunks){assert.equal(c.rows,c.ids.length);for(const [file,checksum]of [[c.file,c.sha256],[c.rollbackFile,c.rollbackSha256]])assert.equal(sha(await fs.readFile(path.resolve(ROOT,file))),checksum);}
 const baseline=await read(baselineFile),baselineMap=new Map(baseline.map(x=>[x.name,x]));
 for(const [name,n]of Object.entries({products:19629,product_attribute_values:49599,product_source_records:19629,product_media:37671,product_documents:83392,product_price_sources:1961}))assert.equal(baselineMap.get(name)?.rows,n);
 const oldIds=original.map(p=>({id:p.legacyId,uuid:p.internalId})),newIds=plan.items.map(p=>({id:p.legacyId,uuid:p.internalId}));
 const chunks=manifest.chunks.map(c=>({sourceRef:c.sourceRef,rows:c.rows}));
 const global=`-- SELECT-only whole-catalogue pricing/cache/support/job audit. No source payload is returned.
with old_ids as materialized(select value e from jsonb_array_elements(${encoded(oldIds)})),new_ids as materialized(select value e from jsonb_array_elements(${encoded(newIds)})),
 supported as materialized(select e->>'id' id,(e->>'uuid')::uuid uuid from old_ids union all select e->>'id',(e->>'uuid')::uuid from new_ids),
 expected_chunks as materialized(select value e from jsonb_array_elements(${encoded(chunks)})),
 active as materialized(select snapshot_version from public.catalog_snapshot_pointer where singleton),
 rates as materialized(select distinct on(currency)currency,rate,rate_date,source from public.fx_rates where currency in('EUR','USD')order by currency,rate_date desc),
 runs as materialized(select * from public.price_fx_runs where rates->>'jobId'=${literal(manifest.jobId)} and rates->>'operation'='apply'),
 old_prices as materialized(select p.legacy_id,${sqlFingerprint} fingerprint from old_ids o join public.products p on p.internal_id=(o.e->>'uuid')::uuid join public.brands b on b.internal_id=p.brand_id),
 stats as(select
 (select count(*)from public.products) products,(select count(*)from public.products where publication_status='published') published,
 (select count(*)from public.products where amount>0 and price_status='known') known_prices,(select count(*)from public.products where old_amount is not null) old_prices,
 (select count(*)from public.product_attribute_values) attributes,(select count(*)from public.product_source_records) source_records,
 (select count(*)from public.product_media) media,(select count(*)from public.product_documents) documents,
 (select count(*)from public.product_price_sources) price_sources,(select count(*)from public.product_price_sources where active) active_price_sources,
 (select count(*)from public.products p where p.amount is not null and not exists(select 1 from supported e where e.id=p.legacy_id and e.uuid=p.internal_id)) unsupported_prices,
 (select count(*)from public.product_price_sources s where not exists(select 1 from supported e where e.uuid=s.product_id)) unsupported_sources,
 (select count(*)from public.products p left join public.product_price_sources s on s.product_id=p.internal_id left join rates r on r.currency=s.currency where p.amount is not null and
   case when s.product_id is null or not s.active or s.currency not in('UAH','EUR','USD')or(s.currency<>'UAH'and r.rate is null)then true
   else p.currency<>'UAH' or p.price_status<>'known' or p.amount is distinct from public._fx_site_price(s.base_amount,s.currency,s.vat_included,case when s.currency='UAH'then 1 else r.rate end,2.5,${Number(policy.settings.vat_percent)})end) unsupported_formula_prices,
 (select count(*)from old_prices) original_checked,
 (select md5(coalesce(string_agg(fingerprint,'' order by legacy_id collate "C"),''))from old_prices) original_price_hash,
 (select count(*)from public.product_price_sources s join public.products p on p.internal_id=s.product_id join public.brands b on b.internal_id=p.brand_id where b.stable_id<>'rehau') original_source_rows,
 (select md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' order by md5(to_jsonb(s)::text) collate "C"),''))from public.product_price_sources s join public.products p on p.internal_id=s.product_id join public.brands b on b.internal_id=p.brand_id where b.stable_id<>'rehau') original_source_hash,
 (select count(*)from public.catalog_product_cards c join active a using(snapshot_version)) active_cards,
 (select count(*)from public.catalog_product_snapshots s join active a using(snapshot_version)) active_snapshots,
 (select count(*)from public.products p left join public.catalog_product_cards c on c.legacy_id=p.legacy_id and c.snapshot_version=(select snapshot_version from active)where p.publication_status='published'and(c.legacy_id is null or c.amount is distinct from p.amount or c.price_status is distinct from p.price_status or(c.card#>>'{pricing,amount}')::numeric is distinct from p.amount or(c.card#>>'{pricing,oldAmount}')::numeric is distinct from p.old_amount or c.card#>>'{pricing,currency}'is distinct from p.currency or c.card#>>'{pricing,priceStatus}'is distinct from p.price_status::text)) card_pricing_failures,
 (select count(*)from public.catalog_product_cards c join active a using(snapshot_version)left join public.products p on p.legacy_id=c.legacy_id where p.internal_id is null or p.publication_status<>'published') extra_public_cards,
 (select count(*)from public.products p left join public.catalog_product_snapshots s on s.legacy_id=p.legacy_id and s.snapshot_version=(select snapshot_version from active)where p.publication_status='published'and(s.legacy_id is null or(s.payload#>>'{pricing,amount}')::numeric is distinct from p.amount or(s.payload#>>'{pricing,oldAmount}')::numeric is distinct from p.old_amount or s.payload#>>'{pricing,currency}'is distinct from p.currency or s.payload#>>'{pricing,priceStatus}'is distinct from p.price_status::text)) snapshot_pricing_failures,
 (select count(*)from runs) job_rows,(select coalesce(sum(changed),0)from runs) job_changed,
 (select count(*)from expected_chunks e where(select count(*)from runs r where r.rates->>'sourceRef'=e.e->>'sourceRef'and r.changed=(e.e->>'rows')::int)<>1) chunk_failures,
 (select count(*)from runs r where not exists(select 1 from expected_chunks e where e.e->>'sourceRef'=r.rates->>'sourceRef')or r.rates->>'planSha256' is distinct from ${literal(manifest.planSha256)}) unexpected_job_rows,
 (select jsonb_object_agg(currency,jsonb_build_object('rate',rate,'rateDate',rate_date::text))from rates) actual_rates,
 (select count(*)from public.catalog_snapshot_releases) release_rows,
 (select snapshot_version from active) active_version)
select jsonb_build_object('jobId',${literal(manifest.jobId)},'planSha256',${literal(manifest.planSha256)},'actual',to_jsonb(stats),
 'expectedNew',${plan.items.length},'expectedKnown',${manifest.summary.expectedPositive},'expectedChunks',${manifest.chunks.length},
 'pass',products=19629 and published=19326 and known_prices=${manifest.summary.expectedPositive} and old_prices=0
 and attributes=49599 and source_records=19629 and media=37671 and documents=83392
 and price_sources=${manifest.summary.expectedPositive} and active_price_sources=${manifest.summary.expectedPositive}
 and unsupported_prices=0 and unsupported_sources=0 and unsupported_formula_prices=0
 and original_checked=1961 and original_price_hash=${literal(oldPriceHash(original))}
 and original_source_rows=1961 and original_source_hash=${literal(baselineMap.get('product_price_sources').hash)}
 and active_cards=19326 and active_snapshots=19570 and card_pricing_failures=0 and extra_public_cards=0 and snapshot_pricing_failures=0
 and job_rows=${manifest.chunks.length} and job_changed=${plan.items.length} and chunk_failures=0 and unexpected_job_rows=0
 and actual_rates=${encoded(rates)} and release_rows=1 and active_version=${literal(manifest.activeVersion)}
 and(select enabled and markup_percent=2.5 and vat_percent=${Number(policy.settings.vat_percent)} from public.price_fx_settings where singleton)) result from stats;
`;
 const output=path.resolve(ROOT,outputDirectory??path.join(path.dirname(manifestFile),'audits'));await fs.mkdir(output,{recursive:true});
 const files=[];async function save(name,kind,sql,rows){assert.ok(Buffer.byteLength(sql)<=600000,name+' exceeds600KB');assert.ok(!/\b(?:update|insert|delete|vacuum|alter|create|drop|truncate|set)\b/i.test(sql.replace(/--[^\n]*/g,'')),'Audit must be SELECT-only');const file=path.join(output,name);await fs.writeFile(file,sql);files.push({file:path.relative(ROOT,file).replaceAll('\\','/'),kind,rows,bytes:Buffer.byteLength(sql),sha256:sha(sql)});}
 let supersedes;
 if(globalRevision){const previousFile=path.join(output,'manifest.json'),previousBytes=await fs.readFile(previousFile),previous=JSON.parse(previousBytes);assert.equal(previous.planSha256,manifest.planSha256);for(const f of previous.files.filter(f=>f.kind==='details')){assert.equal(sha(await fs.readFile(path.resolve(ROOT,f.file))),f.sha256);files.push(f);}supersedes={manifestFile:path.relative(ROOT,previousFile).replaceAll('\\','/'),manifestSha256:sha(previousBytes),global:previous.files.find(f=>f.kind==='global'),reason:'Match protected-before source-row hash order: row MD5 COLLATE C; original failed SQL retained unchanged.'};}
 else{let pending=[];let part=1;for(const row of plan.items){if(pending.length&&(pending.length>=100||Buffer.byteLength(detailsSql([...pending,row],{manifest,part}))>600000)){await save(`details-${String(part).padStart(3,'0')}.sql`,'details',detailsSql(pending,{manifest,part}),pending.length);pending=[];part++;}pending.push(row);}if(pending.length)await save(`details-${String(part).padStart(3,'0')}.sql`,'details',detailsSql(pending,{manifest,part}),pending.length);}
 await save(globalRevision?`global-${globalRevision}.sql`:'global.sql','global',global,19629);
 const result={format:'bounded-rehau-price-audit-v1',status:'SELECT_ONLY_NOT_EXECUTED',jobId:manifest.jobId,manifestFile,manifestSha256:sha(manifestBytes),planFile:manifest.planFile,planSha256:manifest.planSha256,baselineFile,expectedSelected:plan.items.length,expectedOriginalSupported:1961,expectedKnown:manifest.summary.expectedPositive,detailRows:files.filter(f=>f.kind==='details').reduce((n,x)=>n+x.rows,0),files,instructions:'Execute every SELECT; all result.pass must be true. Detailed checkedRows must sum to expectedSelected. Protected9 immutable-row fingerprints remain a separate root audit.'};
 if(supersedes)result.supersedes=supersedes;
 assert.equal(result.detailRows,result.expectedSelected);await fs.writeFile(path.join(output,globalRevision?`manifest-${globalRevision}.json`:'manifest.json'),JSON.stringify(result,null,2)+'\n');return result;
}

export async function selfTestFingerprint(){
 const{createDatabase}=await import('../../tests/db-local/database.mjs');const db=await createDatabase();
 try{const sample={legacyId:'audit-українська|id',internalId:'00000000-0000-4000-8000-000000000101',sku:'001234567',brand:'rehau',publicationStatus:'published',amount:12.34,oldAmount:null,currency:'UAH',priceStatus:'known'};
 const p={legacy_id:sample.legacyId,internal_id:sample.internalId,sku:sample.sku,publication_status:sample.publicationStatus,amount:sample.amount,old_amount:sample.oldAmount,currency:sample.currency,price_status:sample.priceStatus};
 const r=await db.query(`select ${sqlFingerprint} fingerprint from jsonb_populate_record(null::public.products,$1::jsonb)p cross join(select $2::text stable_id)b`,[JSON.stringify(p),sample.brand]);assert.equal(r.rows[0].fingerprint,priceRowFingerprint(sample));
 assert.ok(clearlyPipe({category:'pipe-fittings',title:'Труба REHAU SDR11'}));assert.ok(clearlyPipe({category:'pipe-fittings',title:'Попередньо ізольована труба REHAU'}));assert.ok(!clearlyPipe({category:'pipe-fittings',title:'Муфта REHAU для труби 16 мм'}));assert.ok(!clearlyPipe({category:'pipe-fittings',title:'Трубка T REHAU для радіатора 250 мм'}));
 assert.ok(!clearlyPipe({category:'internal-sewer-fittings',title:'Каналізаційний фітинг REHAU Труба для унітаза DN 110, довжина 250 мм',sourceEvidence:{sourceEtim:{class:{name:'Anschlussgarnitur Wand-WC'}}}}));
 return{status:'PASS',priceFingerprintRealSchema:true,utf8PipeUnitCases:5,hostedConnections:0};
 }finally{await db.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};let self=false;for(const arg of process.argv.slice(2)){const[key,...rest]=arg.replace(/^--/,'').split('='),value=rest.join('=');if(key==='manifest')options.manifestFile=value;else if(key==='plan-sha256')options.expectedPlanSha256=value;else if(key==='baseline')options.baselineFile=value;else if(key==='output')options.outputDirectory=value;else if(key==='global-revision')options.globalRevision=value;else if(key==='self-test-only')self=true;else throw Error('Unknown argument '+arg);}
 if(self)console.log(JSON.stringify(await selfTestFingerprint()));else{const result=await buildRehauPriceAudit(options);console.log(JSON.stringify({status:result.status,jobId:result.jobId,expectedSelected:result.expectedSelected,expectedKnown:result.expectedKnown,files:result.files,hostedConnections:0}));}
}
