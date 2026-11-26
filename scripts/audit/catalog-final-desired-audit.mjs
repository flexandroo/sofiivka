// Compose the final selected state across six frozen, ordered plans; generate SELECT-only audits.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createDatabase} from '../../tests/db-local/database.mjs';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'imports/overnight-audit/final-desired');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),same=(a,b)=>assert.deepEqual(a,b);
const files=['catalog-repair-plan.json','rehau-cone-correction-plan.json','source-reconciliation/correction-plan.json',
 'rehau-max-temperature-correction-plan.json','source-reconciliation/correction-claims-plan.json','source-reconciliation/correction-grammar-followup-plan.json'];
const items=new Map(),proofs=[];let activeVersion;
for(const file of files){
 const bytes=fs.readFileSync(path.join(root,'imports/overnight-audit',file)),plan=JSON.parse(bytes);assert.match(plan.activeVersion,/^[a-f\d]{64}$/);
 if(activeVersion)same(activeVersion,plan.activeVersion);else activeVersion=plan.activeVersion;
 proofs.push({file,jobId:plan.jobId,sha256:sha(bytes),products:plan.products.length});
 for(const p of plan.products){
  if(!items.has(p.id))items.set(p.id,{id:p.id,uuid:p.internalId,sku:p.sku,status:p.expectedStatus,guard:p.guardProduct,fields:{},attrs:new Map(),sources:new Map(),displays:new Map()});
  const item=items.get(p.id);same(item.uuid,p.internalId);same(item.sku,p.sku);same(item.guard,p.guardProduct);
  for(const c of p.productChanges){if(Object.hasOwn(item.fields,c.field))same(item.fields[c.field],c.old);item.fields[c.field]=c.new;if(c.field==='publication_status')item.status=c.new;}
  for(const c of p.attributeChanges){
   const old=Object.fromEntries(Object.entries(c.oldRow).filter(([key])=>key!=='updated_at'));
   if(item.attrs.has(c.attributeId))same(item.attrs.get(c.attributeId).row,old);
   item.attrs.set(c.attributeId,{uuid:c.attributeId,key:c.stableId,row:c.action==='delete'?null:{...old,...c.newValues}});
  }
  for(const c of p.sourceChanges){
   const prior=item.sources.get(c.sourceRecordId);if(prior)same(prior.chars,c.oldCharacteristics);
   const next={uuid:c.sourceRecordId,sourceId:c.sourceId,url:c.sourceUrl,supplier:c.supplierId,run:c.importRunId,chars:c.newCharacteristics};
   if(prior)same({...prior,chars:null},{...next,chars:null});item.sources.set(c.sourceRecordId,next);
  }
  for(const d of p.displayChanges){
   const paths=d.paths??(d.path?[d]:d.kind==='replace-characteristics'?[{path:['sourceAttributes'],oldRows:d.oldRows,newRows:d.newRows},{path:['unmappedAttributes'],oldRows:d.oldRows,newRows:d.newRows},
    {path:['source','characteristics'],oldRows:d.oldRows,newRows:d.newRows,optional:true}]:null);
   assert.ok(paths?.length,'Every display repair needs an exact array contract');
   for(const p of paths){const key=JSON.stringify(p.path),prior=item.displays.get(key);if(prior)same(prior.rows,p.oldRows);item.displays.set(key,{path:p.path,rows:p.newRows,optional:!!p.optional});}
  }
 }
}
const expected=[...items.values()].sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id))).map(item=>({...item,attrs:[...item.attrs.values()],sources:[...item.sources.values()],displays:[...item.displays.values()]}));
assert.equal(expected.length,1252);assert.equal(expected.flatMap(x=>x.sources).length,999);assert.equal(expected.flatMap(x=>x.attrs).length,32);
// Hash large string-only JSON values with the PostgreSQL engine itself. Typed
// numeric rows remain full JSONB equality checks, so numeric scale is irrelevant.
const fullExpected=structuredClone(expected),hashCases=[];
function assertStringJson(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 assert.equal(typeof value,'object','Numeric JSON must retain semantic JSONB comparison, not a textual hash');
 for(const child of Object.values(value))assertStringJson(child);
}
const addHash=(value,set)=>{assertStringJson(value);hashCases.push({value,set});};
for(const item of expected){
 for(const [key,value]of Object.entries(item.fields))addHash(value,h=>{item.fields[key]=h;});
 for(const source of item.sources)addHash(source.chars,h=>{source.charsHash=h;delete source.chars;});
 for(const display of item.displays)addHash(display.rows,h=>{display.rowsHash=h;delete display.rows;});
}
const db=await createDatabase();
try{
 for(let offset=0;offset<hashCases.length;offset+=300){
  const batch=hashCases.slice(offset,offset+300);
  const result=await db.query('select md5(value::text)hash from jsonb_array_elements($1::jsonb)with ordinality t(value,n)order by n',[JSON.stringify(batch.map(c=>c.value))]);
  assert.equal(result.rows.length,batch.length);result.rows.forEach((row,i)=>batch[i].set(row.hash));
 }
}finally{await db.close();}
function sqlFor(rows,part){const data=Buffer.from(JSON.stringify(rows)).toString('base64');return`-- Final composed desired state; part${part}; SELECT only. Source originals have a separate independent protection audit.
with expected as materialized(select value e from jsonb_array_elements(convert_from(decode('${data}','base64'),'UTF8')::jsonb)),
checked as materialized(
 select e.e,p.internal_id,p.legacy_id,p.sku,p.title,p.short_title,p.publication_status,p.amount,p.old_amount,p.currency,p.price_status,p.inventory_status,
  to_jsonb(p)product_row,category.stable_id category,s.payload,card.card,card.category_id card_category,card.normalized_attributes card_attrs,
  coalesce((select jsonb_object_agg(d.stable_id,case d.value_type when'number'then to_jsonb(v.value_number)when'boolean'then to_jsonb(v.value_boolean)
   when'select'then coalesce(to_jsonb(o.value),to_jsonb(v.value_text))else to_jsonb(v.value_text)end)
   from public.product_attribute_values v join public.attribute_definitions d on d.internal_id=v.attribute_id and d.status='active'
   left join public.attribute_options o on o.internal_id=v.option_id where v.product_id=p.internal_id),'{}'::jsonb)canonical_attrs,
  coalesce((select jsonb_agg(m.url order by(m.role='primary')desc,m.sort_order,m.internal_id)from public.product_media m
   where m.product_id=p.internal_id and m.active and m.media_type='image'),'[]'::jsonb)canonical_images,
  coalesce((select jsonb_agg(jsonb_build_object('type','PDF','title',d.title,'url',d.url)order by d.sort_order,d.internal_id)
   from public.product_documents d where d.product_id=p.internal_id and d.active),'[]'::jsonb)canonical_documents
 from expected e left join public.products p on p.internal_id=(e.e->>'uuid')::uuid
 left join public.categories category on category.internal_id=p.primary_category_id
 left join public.catalog_product_snapshots s on s.snapshot_version='${activeVersion}'and s.legacy_id=e.e->>'id'
 left join public.catalog_product_cards card on card.snapshot_version='${activeVersion}'and card.legacy_id=e.e->>'id'
),violations as(
 select e->>'id'id,'identity/ownership/status/snapshot'kind from checked where internal_id is null or legacy_id is distinct from e->>'id'or sku is distinct from e->>'sku'
  or product_row->>'brand_id'is distinct from e#>>'{guard,brand_id}'or product_row->>'last_import_run_id'is distinct from e#>>'{guard,last_import_run_id}'
  or publication_status::text is distinct from e->>'status'or payload is null
 union all select e->>'id','canonical-final-field:'||f.key from checked cross join lateral jsonb_each(e->'fields')f where md5((product_row->f.key)::text)is distinct from(f.value#>>'{}')
 union all select e->>'id','public-core/typed/inventory'from checked where payload->>'title'is distinct from title or payload->>'shortTitle'is distinct from short_title
  or payload->>'primaryCategoryId'is distinct from category or payload->>'sku'is distinct from sku or payload->>'publicationStatus'is distinct from publication_status::text
  or payload->'normalizedAttributes'is distinct from canonical_attrs or payload#>>'{inventory,status}'is distinct from inventory_status::text
 union all select e->>'id','public-current-pricing'from checked where payload#>'{pricing,amount}'is distinct from coalesce(to_jsonb(amount),'null'::jsonb)
  or payload#>'{pricing,oldAmount}'is distinct from coalesce(to_jsonb(old_amount),'null'::jsonb)or payload#>>'{pricing,currency}'is distinct from currency
  or payload#>>'{pricing,priceStatus}'is distinct from price_status::text
 union all select e->>'id','public-media/documents'from checked where payload->'images'is distinct from canonical_images or payload->'documents'is distinct from canonical_documents
 union all select e->>'id','public-card'from checked where case when publication_status='published'then
  card is null or card->>'title'is distinct from title or card->>'shortTitle'is distinct from short_title or card_category is distinct from category
  or card->>'primaryCategoryId'is distinct from category or card->'normalizedAttributes'is distinct from canonical_attrs or card_attrs is distinct from canonical_attrs
  or card->'pricing'is distinct from payload->'pricing'or card->'inventory'is distinct from payload->'inventory'
  or card->'images'is distinct from case when jsonb_array_length(canonical_images)>0 then jsonb_build_array(canonical_images->0)else'[]'::jsonb end
  else card is not null end
 union all select c.e->>'id','typed-final-row:'||(a->>'key')from checked c cross join lateral jsonb_array_elements(c.e->'attrs')a
  left join public.product_attribute_values v on v.product_id=c.internal_id and v.attribute_id=(a->>'uuid')::uuid
  where(to_jsonb(v)-'updated_at')is distinct from nullif(a->'row','null'::jsonb)
 union all select c.e->>'id','public-typed-detail:'||(a->>'key')from checked c cross join lateral jsonb_array_elements(c.e->'attrs')a
  where case when a->'row'='null'::jsonb then exists(select 1 from jsonb_array_elements(c.payload->'catalogAttributes')v where v->>'id'=a->>'key')
   else not exists(select 1 from jsonb_array_elements(c.payload->'catalogAttributes')v where v->>'id'=a->>'key'
    and v->'value'is not distinct from coalesce(a#>'{row,value_number}',a#>'{row,value_text}',a#>'{row,value_boolean}'))end
 union all select c.e->>'id','source-final-characteristics/identity'from checked c cross join lateral jsonb_array_elements(c.e->'sources')x
  left join public.product_source_records s on s.internal_id=(x->>'uuid')::uuid where s.product_id is distinct from c.internal_id
   or s.source_id is distinct from x->>'sourceId'or s.source_url is distinct from x->>'url'or s.supplier_id::text is distinct from x->>'supplier'
   or s.import_run_id::text is distinct from x->>'run'or s.payload_checksum is not null or md5((s.raw_payload->'characteristics')::text)is distinct from x->>'charsHash'
 union all select c.e->>'id','public-final-source-array'from checked c cross join lateral jsonb_array_elements(c.e->'displays')x
  where not(coalesce((x->>'optional')::boolean,false)and c.payload#>(array(select jsonb_array_elements_text(x->'path')))is null)
   and md5((c.payload#>(array(select jsonb_array_elements_text(x->'path'))))::text)is distinct from x->>'rowsHash'
 union all select e->>'id','public-final-copy:'||f.key from checked cross join lateral jsonb_each(e->'fields')f
  where f.key in('title','short_title','description','short_description','full_description','description_sections','seo_title','seo_description')and
   md5((payload#>(case f.key when'seo_title'then array['seo','title']when'seo_description'then array['seo','description']when'short_title'then array['shortTitle']
    when'short_description'then array['shortDescription']when'full_description'then array['fullDescription']when'description_sections'then array['descriptionSections']else array[f.key]end))::text)is distinct from(f.value#>>'{}')
)
select jsonb_build_object('phase','final-composed','part',${part},'expectedProducts',${rows.length},'actualExpectedIdentities',(select count(*)from checked where internal_id is not null),
 'expectedSourceRecords',${rows.reduce((n,p)=>n+p.sources.length,0)},'expectedTypedRows',${rows.reduce((n,p)=>n+p.attrs.length,0)},
 'violationCount',(select count(*)from violations),'violations',(select coalesce(jsonb_agg(v),'[]')from(select id,kind from violations order by id,kind limit 20)v),
 'pass',(select count(*)=${rows.length} from checked)and not exists(select 1 from violations)
  and(select snapshot_version='${activeVersion}'from public.catalog_snapshot_pointer where singleton))result;\n`;}
fs.mkdirSync(out,{recursive:true});const parts=[];let current=[];
for(const item of expected){if(current.length&&Buffer.byteLength(JSON.stringify([...current,item]))*4/3+15000>595000){parts.push(current);current=[];}current.push(item);}if(current.length)parts.push(current);
const outputs=parts.map((rows,i)=>{const sql=sqlFor(rows,i+1),file=String(i+1).padStart(3,'0')+'-verify.sql';assert.ok(Buffer.byteLength(sql)<=600000);fs.writeFileSync(path.join(out,file),sql);return{file,bytes:Buffer.byteLength(sql),sha256:sha(sql),products:rows.length};});
for(const file of fs.readdirSync(out).filter(name=>/^\d{3}-verify\.sql$/.test(name)))if(!outputs.some(p=>p.file===file))fs.unlinkSync(path.join(out,file));
fs.writeFileSync(path.join(out,'expected-full.json'),JSON.stringify(fullExpected)+'\n');
fs.writeFileSync(path.join(out,'expected-hashed.json'),JSON.stringify(expected)+'\n');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({status:'PREPARED-NOT-EXECUTED',sourcePlans:proofs,activeVersion,expectedProducts:1252,expectedSources:999,expectedTypedRows:32,
 hashContract:'Native PostgreSQL md5(jsonb::text) computed by local PGlite; all hashed JSON contains no numeric primitives. Full typed numeric rows retain JSONB equality.',
 hashCases:hashCases.length,expectedFullSha256:sha(fs.readFileSync(path.join(out,'expected-full.json'))),expectedHashedSha256:sha(fs.readFileSync(path.join(out,'expected-hashed.json'))),parts:outputs},null,2)+'\n');
console.log(JSON.stringify({status:'PREPARED-NOT-EXECUTED',products:1252,sources:999,typedRows:32,parts:outputs,hostedConnections:0}));
