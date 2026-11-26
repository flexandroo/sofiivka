// Bounded pure-SELECT desired-state audits. Reads frozen inputs; never connects to hosted services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createDatabase} from '../../tests/db-local/database.mjs';
import {claimProducts} from './prepare-manufacturer-claim-repair.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DEFAULTS=['imports/overnight-audit/source-reconciliation/correction-claims-plan.json','imports/overnight-audit/rehau-cone-correction-plan.json','imports/overnight-audit/rehau-max-temperature-correction-plan.json'];
const COPY_PATHS={title:['title'],short_title:['shortTitle'],description:['description'],short_description:['shortDescription'],full_description:['fullDescription'],description_sections:['descriptionSections'],seo_title:['seo','title'],seo_description:['seo','description']};
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>`convert_from(decode('${Buffer.from(JSON.stringify(value)).toString('base64')}','base64'),'UTF8')::jsonb`;
const read=async file=>JSON.parse(await fs.readFile(path.resolve(ROOT,file),'utf8'));
const same=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}};
const relative=file=>path.relative(ROOT,file).replaceAll('\\','/');

function desiredItem(item,preservation){
 const values=[],intern=new Map();
 const copies=item.productChanges.map(change=>{assert.ok(COPY_PATHS[change.field]);const key=JSON.stringify(change.new);let index=intern.get(key);if(index===undefined){index=values.length;intern.set(key,index);values.push(change.new);}return{field:change.field,path:COPY_PATHS[change.field],value:index};});
 const sources=item.sourceChanges.map(source=>{const originalHash=preservation.get(source.sourceRecordId);assert.ok(originalHash,'Missing exact original raw-payload hash');return{id:source.sourceRecordId,supplierId:source.supplierId,sourceId:source.sourceId,sourceUrl:source.sourceUrl,importRunId:source.importRunId,chars:source.newCharacteristics,authority:source.authorityGuards,originalHash};});
 const paths=item.displayChanges.flatMap(display=>display.paths.map(scoped=>{const source=sources.find(source=>same(source.chars,scoped.newRows));return{path:scoped.path,...(source?{fromSource:source.id}:{rows:scoped.newRows})};}));
 const attrs=item.attributeChanges.map(change=>{const target=change.action==='delete'?null:{...change.oldRow,...change.newValues};if(target){delete target.updated_at;delete target.created_at;}return{id:change.attributeId,stableId:change.stableId,action:change.action,target,createdAt:change.oldRow.created_at};});
 return{id:item.id,internalId:item.internalId,sku:item.sku,brandId:item.guardProduct.brand_id,brand:item.expectedBrand,importRunId:item.guardProduct.last_import_run_id,status:item.expectedStatus,values,copies,sources,paths,attrs,nestedAbsent:!paths.some(p=>same(p.path,['source','characteristics']))};
}

function auditSql(items,activeVersion,label){
 assert.match(activeVersion,/^[a-f\d]{64}$/);assert.match(label,/^[a-z0-9-]+$/);
 return `-- Pure SELECT: desired manufacturer claims, before the independent grammar phase; ${label}.
with expected as materialized(select value item from jsonb_array_elements(${json(items)})),
active as materialized(select p.snapshot_version from public.catalog_snapshot_pointer p join public.catalog_snapshot_releases r using(snapshot_version)where p.singleton and r.ready and p.snapshot_version='${activeVersion}'),
checked as materialized(
 select e.item->>'id'id,
  (p.internal_id is null or p.internal_id::text is distinct from e.item->>'internalId'or p.sku is distinct from e.item->>'sku'
    or p.brand_id::text is distinct from e.item->>'brandId'or b.stable_id is distinct from e.item->>'brand'
    or p.last_import_run_id::text is distinct from e.item->>'importRunId'or p.publication_status::text is distinct from e.item->>'status')identity_bad,
  exists(select 1 from jsonb_array_elements(e.item->'copies')copy where to_jsonb(p)->(copy->>'field')is distinct from(e.item->'values'->(copy->>'value')::integer))copy_bad,
  exists(select 1 from jsonb_array_elements(e.item->'sources')wanted left join public.product_source_records src on src.internal_id=(wanted->>'id')::uuid
   where src.internal_id is null or src.product_id is distinct from p.internal_id or src.supplier_id::text is distinct from wanted->>'supplierId'
    or src.source_id is distinct from wanted->>'sourceId'or src.source_url is distinct from wanted->>'sourceUrl'or src.import_run_id::text is distinct from wanted->>'importRunId'
    or src.payload_checksum is not null or src.raw_payload->'characteristics'is distinct from wanted->'chars'
    or exists(select 1 from jsonb_array_elements(wanted->'authority')guard where src.raw_payload#>array(select jsonb_array_elements_text(guard->'path'))is distinct from guard->'expected'))source_bad,
  exists(select 1 from jsonb_array_elements(e.item->'sources')wanted left join public.product_source_records src on src.internal_id=(wanted->>'id')::uuid
   where src.internal_id is null or md5((src.raw_payload-'characteristics')::text)is distinct from wanted->>'originalHash')original_raw_bad,
  exists(select 1 from jsonb_array_elements(e.item->'attrs')wanted left join public.product_attribute_values v on v.product_id=p.internal_id and v.attribute_id=(wanted->>'id')::uuid
    left join public.attribute_definitions d on d.internal_id=(wanted->>'id')::uuid
   where d.stable_id is distinct from wanted->>'stableId'or(wanted->>'action'='delete'and v.product_id is not null)
    or(wanted->>'action'='replace'and(v.product_id is null or(to_jsonb(v)-array['updated_at','created_at'])is distinct from wanted->'target'
      or v.created_at is distinct from(wanted->>'createdAt')::timestamptz)))typed_bad,
  (s.legacy_id is null or not coalesce(s.payload@>jsonb_build_object('id',p.legacy_id,'sku',p.sku,'slug',p.slug,'title',p.title,'shortTitle',p.short_title,'model',p.model,
     'brandId',b.stable_id,'primaryCategoryId',cat.stable_id,'seriesId',ser.stable_id,'publicationStatus',p.publication_status,
     'pricing',jsonb_build_object('amount',p.amount,'oldAmount',p.old_amount,'currency',p.currency,'priceStatus',p.price_status),'inventory',jsonb_build_object('status',p.inventory_status)),false)
    or exists(select 1 from jsonb_array_elements(e.item->'copies')copy where coalesce(s.payload#>array(select jsonb_array_elements_text(copy->'path')),'null'::jsonb)is distinct from(e.item->'values'->(copy->>'value')::integer))
    or exists(select 1 from jsonb_array_elements(e.item->'paths')wanted where s.payload#>array(select jsonb_array_elements_text(wanted->'path'))is distinct from
      coalesce(wanted->'rows',(select src->'chars'from jsonb_array_elements(e.item->'sources')src where src->>'id'=wanted->>'fromSource')))
    or((e.item->>'nestedAbsent')::boolean and coalesce(s.payload#>'{source,characteristics}','null'::jsonb)<>'null'::jsonb)
    or s.payload->'normalizedAttributes'is distinct from typed.attrs or s.payload->'catalogAttributes'is distinct from typed.catalog_attrs)snapshot_bad,
  (case when p.publication_status='published'then c.legacy_id is null or c.brand_id is distinct from b.stable_id or c.category_id is distinct from cat.stable_id
      or c.series_id is distinct from ser.stable_id or c.amount is distinct from p.amount or c.price_status is distinct from p.price_status or c.inventory_status is distinct from p.inventory_status
      or c.normalized_attributes is distinct from typed.attrs or c.card is distinct from public._catalog_card(s.payload,b.name)
    else c.legacy_id is not null end)card_bad
 from expected e left join public.products p on p.legacy_id=e.item->>'id'
 left join public.brands b on b.internal_id=p.brand_id left join public.categories cat on cat.internal_id=p.primary_category_id left join public.product_series ser on ser.internal_id=p.series_id
 left join public.catalog_product_snapshots s on s.legacy_id=p.legacy_id and s.snapshot_version=(select snapshot_version from active)
 left join public.catalog_product_cards c on c.legacy_id=p.legacy_id and c.snapshot_version=(select snapshot_version from active)
 left join lateral(
  select coalesce(jsonb_object_agg(t.stable_id,t.value_json),'{}'::jsonb)attrs,
   coalesce(jsonb_agg(jsonb_build_object('id',t.stable_id,'label',t.label,'value',t.value_json,'unit',coalesce(t.unit,''),'provenance',coalesce(t.provenance,'editorial'),
    'rule',coalesce(t.normalization_rule,'admin-v1'),'sourceLabel',coalesce(t.source_label,''),'sourceValue',coalesce(t.source_value,'null'::jsonb),'unitStatus',coalesce(t.unit_status,'not-applicable'))order by t.sort_order,t.stable_id),'[]'::jsonb)catalog_attrs
  from(select d.stable_id,d.label,d.unit,d.sort_order,v.provenance,v.normalization_rule,v.source_label,v.source_value,v.unit_status,
    case d.value_type when 'number'then to_jsonb(v.value_number)when 'boolean'then to_jsonb(v.value_boolean)when 'select'then coalesce(to_jsonb(o.value),to_jsonb(v.value_text))else to_jsonb(v.value_text)end value_json
   from public.product_attribute_values v join public.attribute_definitions d on d.internal_id=v.attribute_id and d.status='active'
   left join public.attribute_options o on o.internal_id=v.option_id where v.product_id=p.internal_id)t
 )typed on true
),stats as(select count(*)checked_products,count(*)filter(where identity_bad)identity_failures,count(*)filter(where copy_bad)copy_failures,
 count(*)filter(where source_bad)source_failures,count(*)filter(where original_raw_bad)original_raw_failures,count(*)filter(where typed_bad)typed_failures,
 count(*)filter(where snapshot_bad)snapshot_failures,count(*)filter(where card_bad)card_failures from checked)
select jsonb_build_object('pass',checked_products=${items.length} and identity_failures+copy_failures+source_failures+original_raw_failures+typed_failures+snapshot_failures+card_failures=0
 and(select snapshot_version from active)='${activeVersion}','scope','${label}','expectedProducts',${items.length},'actual',to_jsonb(stats),
 'failedIds',coalesce((select jsonb_agg(id)from(select id from checked where identity_bad or copy_bad or source_bad or original_raw_bad or typed_bad or snapshot_bad or card_bad order by id limit 10)fail),'[]'::jsonb))result from stats;
`;
}

function globalSql(sources,activeVersion){
 const sorted=[...sources].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const expectedHash=createHash('md5').update(sorted.map(s=>s.hash).join('')).digest('hex');
 return `-- Pure SELECT: final counts and original raw evidence for all targeted sources. Run after all three claim phases.
with expected as materialized(select value item from jsonb_array_elements(${json(sorted)})),
checked as materialized(select e.item,src.internal_id,md5((src.raw_payload-'characteristics')::text)actual_hash from expected e left join public.product_source_records src on src.internal_id=(e.item->>'id')::uuid),
stats as(select count(*)expected_sources,count(internal_id)found_sources,count(*)filter(where actual_hash is distinct from item->>'hash')original_raw_failures,
 md5(string_agg(actual_hash,''order by item->>'id'collate "C"))actual_original_hash from checked),
counts as(select(select count(*)from public.products)products,(select count(*)from public.products where publication_status='published')published,
 (select count(*)from public.product_attribute_values)pav,(select count(*)from public.products where price_status='known'and amount>0)known_prices,
 (select count(*)from public.products where old_amount is not null)old_prices,(select count(*)from public.product_price_sources where active)active_price_sources,
 (select snapshot_version from public.catalog_snapshot_pointer where singleton)active_version,
 (select count(*)from public.catalog_product_cards where snapshot_version='${activeVersion}')public_cards,
 (select count(*)from public.catalog_product_snapshots where snapshot_version='${activeVersion}')active_snapshots)
select jsonb_build_object('pass',expected_sources=${sources.length} and found_sources=${sources.length} and original_raw_failures=0 and actual_original_hash='${expectedHash}'
 and products=19629 and published=19326 and pav=49599 and known_prices=1961 and old_prices=0 and active_price_sources=1961
 and active_version='${activeVersion}'and public_cards=19326 and active_snapshots=19570,
 'scope','all-claims-global','actualSources',to_jsonb(stats),'expectedOriginalHash','${expectedHash}','actualCounts',to_jsonb(counts))result from stats cross join counts;
`;
}

async function main(){
 const selected=[],args=process.argv.slice(2);let output='imports/overnight-audit/manufacturer-claim-desired';
 for(const arg of args){if(arg.startsWith('--plan='))selected.push(arg.slice(7));else if(arg.startsWith('--output='))output=arg.slice(9);else throw Error(`Unknown argument ${arg}`);}
 const inputs=[];for(const file of selected.length?selected:DEFAULTS){const bytes=await fs.readFile(path.resolve(ROOT,file));const plan=JSON.parse(bytes);inputs.push({file,plan,sha256:sha(bytes),items:claimProducts(plan)});}
 const versions=new Set(inputs.map(p=>p.plan.activeVersion));assert.equal(versions.size,1);const activeVersion=[...versions][0];
 const directory=path.resolve(ROOT,output);await fs.mkdir(directory,{recursive:true});const db=await createDatabase();
 const pages=new Map(),rawRows=new Map(),preservation=new Map(),allSources=new Map(),files=[];
 try{
  // Feed original PG JSON text directly back to Postgres. Inner numbers are never JS-reserialized for evidence hashes.
  for(const input of inputs)for(const item of input.items){
   const backup=item.sourceBackup.file,file=/[/\\]/.test(backup)?backup:`backups/overnight-2026-11-26/live/${backup}`;
   if(!pages.has(file))pages.set(file,await read(file));const entry=pages.get(file).rows[item.sourceBackup.rowIndex];
   const raw=entry.row_json??Buffer.from(entry.row_base64,'base64').toString('utf8');rawRows.set(item.id,raw);
  }
  const originals=[...rawRows.values()];for(let offset=0;offset<originals.length;offset+=50){
   const exact='['+originals.slice(offset,offset+50).join(',')+']';
   const{rows}=await db.query(`select s->>'internal_id'id,md5(((s->'raw_payload')-'characteristics')::text)hash from jsonb_array_elements($1::jsonb)row cross join lateral jsonb_array_elements(row->'sources')s`,[exact]);
   for(const row of rows)preservation.set(row.id,row.hash);
  }
  async function write(file,sql,metadata){
   assert.ok(/^--[^\n]*\nwith /i.test(sql)&&!/(?:^|;)\s*(?:set|begin|commit|update|insert|delete|do|create)\b/im.test(sql),'Only a pure SELECT audit may be emitted');
   const bytes=Buffer.byteLength(sql);assert.ok(bytes<=600000,'Audit exceeds the request budget');
   await db.query('EXPLAIN (FORMAT JSON) '+sql);const absolute=path.join(directory,file);await fs.writeFile(absolute,sql);files.push({file:relative(absolute),bytes,sha256:sha(sql),localExplain:'PASS',...metadata});
  }
  const plans=[];
  for(const input of inputs){const items=input.items.map(item=>desiredItem(item,preservation)),label=input.plan.jobId;let offset=0,part=0;
   const counts={products:items.length,sources:items.reduce((n,p)=>n+p.sources.length,0),copyFields:items.reduce((n,p)=>n+p.copies.length,0),typedRows:items.reduce((n,p)=>n+p.attrs.length,0),publicArrays:items.reduce((n,p)=>n+p.paths.length,0)};
   plans.push({file:input.file,sha256:input.sha256,jobId:label,counts});for(const item of items)for(const source of item.sources){const previous=allSources.get(source.id);assert.ok(!previous||previous.hash===source.originalHash);allSources.set(source.id,{id:source.id,hash:source.originalHash});}
   while(offset<items.length){let count=Math.min(50,items.length-offset),sql;for(;;){sql=auditSql(items.slice(offset,offset+count),activeVersion,label);if(Buffer.byteLength(sql)<=580000)break;assert.ok(count>1);count=Math.ceil(count/2);}
    const batch=items.slice(offset,offset+count);await write(`${label}-${String(++part).padStart(3,'0')}.sql`,sql,{kind:'desired',jobId:label,products:count,sources:batch.reduce((n,p)=>n+p.sources.length,0),copyFields:batch.reduce((n,p)=>n+p.copies.length,0),typedRows:batch.reduce((n,p)=>n+p.attrs.length,0),publicArrays:batch.reduce((n,p)=>n+p.paths.length,0)});offset+=count;
   }
  }
  await write('all-claims-global.sql',globalSql([...allSources.values()],activeVersion),{kind:'global-original-evidence-and-counts',sources:allSources.size});
  const manifest={format:'manufacturer-claim-desired-audit-v1',projectRef:'fkjarsouuchjiedrrblc',activeVersion,readOnly:true,localExplain:'PASS',mustRunBeforeGrammarPhase:true,
   instructions:'Execute desired files for their completed phase; every result.pass must be true. Execute global only after all selected phases. No source values are returned.',
   originalHashContract:'md5(raw_payload minus characteristics ::text), computed from lossless original PG JSON in local Postgres. Global MD5 concatenates these hashes ordered by source UUID text COLLATE C.',plans,files};
  const manifestFile=path.join(directory,'manifest.json'),text=JSON.stringify(manifest,null,2)+'\n';await fs.writeFile(manifestFile,text);
  console.log(JSON.stringify({status:'PREPARED_READ_ONLY',manifest:relative(manifestFile),sha256:sha(text),plans:plans.map(p=>({jobId:p.jobId,...p.counts})),files:files.length,maxBytes:Math.max(...files.map(f=>f.bytes)),originalSources:allSources.size,localExplain:'PASS',hostedConnections:0}));
 }finally{await db.close();}
}
main().catch(error=>{console.error(JSON.stringify({status:'FAIL',error:error.message?.slice(0,1000),code:error.code,detail:error.detail?.slice(0,300),hostedConnections:0}));process.exitCode=1;});
