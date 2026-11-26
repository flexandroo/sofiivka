// Generate one read-only, bounded-result desired-state audit for the frozen 510-product plan.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const file=path.join(root,'imports/overnight-audit/catalog-repair-plan.json'),bytes=fs.readFileSync(file),plan=JSON.parse(bytes);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(sha(bytes),'254bd0437857c4b90b5b736fa36cde37eb15784f8bfb3803493879121c42bb1f');
const expected=plan.products.map(p=>({id:p.id,uuid:p.internalId,sku:p.sku,status:p.productChanges.find(c=>c.field==='publication_status')?.new||p.expectedStatus,
  fields:Object.fromEntries(p.productChanges.map(c=>[c.field,c.new])),
  attrs:p.attributeChanges.map(c=>({uuid:c.attributeId,key:c.stableId,row:c.action==='delete'?null:Object.fromEntries(Object.entries({...c.oldRow,...c.newValues}).filter(([k])=>k!=='updated_at'))})),
  sources:p.sourceChanges.map(s=>({uuid:s.sourceRecordId,sourceId:s.sourceId,url:s.sourceUrl,supplier:s.supplierId,run:s.importRunId,chars:s.newCharacteristics})),
  displays:p.displayChanges.filter(d=>d.group==='base').flatMap(d=>d.paths.map(x=>({path:x.path,rows:x.newRows})))}));
assert.equal(expected.length,510);
function auditSql(rows,part){
const encoded=Buffer.from(JSON.stringify(rows)).toString('base64');
return `-- Read-only desired-state audit of the exact frozen510 plan part${part}; no source payload is returned.
with expected as materialized(select value e from jsonb_array_elements(convert_from(decode('${encoded}','base64'),'UTF8')::jsonb)),
checked as materialized(
 select e.e,p.internal_id,p.legacy_id,p.sku,p.title,p.publication_status,p.amount,p.currency,p.price_status,
  to_jsonb(p)product_row,c.stable_id category,s.payload,card.card,card.category_id card_category
 from expected e left join public.products p on p.internal_id=(e.e->>'uuid')::uuid
 left join public.categories c on c.internal_id=p.primary_category_id
 left join public.catalog_product_snapshots s on s.snapshot_version='${plan.activeVersion}'and s.legacy_id=e.e->>'id'
 left join public.catalog_product_cards card on card.snapshot_version='${plan.activeVersion}'and card.legacy_id=e.e->>'id'
),violations as(
 select e->>'id'id,'identity/status/snapshot'kind from checked where internal_id is null or legacy_id is distinct from e->>'id'or sku is distinct from e->>'sku'
  or publication_status::text is distinct from e->>'status'or payload is null
 union all select e->>'id','canonical-selected-field:'||f.key from checked cross join lateral jsonb_each(e->'fields')f
  where product_row->f.key is distinct from f.value
 union all select e->>'id','public-core'from checked where payload->>'title'is distinct from title or payload->>'primaryCategoryId'is distinct from category
  or payload->>'sku'is distinct from sku or payload->>'publicationStatus'is distinct from publication_status::text
 union all select e->>'id','public-card'from checked where case when publication_status='published'then
  card is null or card->>'title'is distinct from title or card_category is distinct from category or card->>'primaryCategoryId'is distinct from category
  or card#>'{pricing,amount}'is distinct from coalesce(to_jsonb(amount),'null'::jsonb)or card#>>'{pricing,currency}'is distinct from currency
  or card#>>'{pricing,priceStatus}'is distinct from price_status::text else card is not null end
 union all select c.e->>'id','typed:'||(a->>'key')from checked c cross join lateral jsonb_array_elements(c.e->'attrs')a
  left join public.product_attribute_values v on v.product_id=c.internal_id and v.attribute_id=(a->>'uuid')::uuid
  where(to_jsonb(v)-'updated_at')is distinct from nullif(a->'row','null'::jsonb)
 union all select c.e->>'id','public-typed:'||(a->>'key')from checked c cross join lateral jsonb_array_elements(c.e->'attrs')a
  where case when a->'row'='null'::jsonb then c.payload->'normalizedAttributes'?(a->>'key')
   else c.payload#>array['normalizedAttributes',a->>'key']is distinct from(a#>'{row,value_number}')end
 union all select c.e->>'id','source-characteristics'from checked c cross join lateral jsonb_array_elements(c.e->'sources')x
  left join public.product_source_records s on s.internal_id=(x->>'uuid')::uuid
  where s.product_id is distinct from c.internal_id or s.source_id is distinct from x->>'sourceId'or s.source_url is distinct from x->>'url'
   or s.supplier_id::text is distinct from x->>'supplier'or s.import_run_id::text is distinct from x->>'run'or s.payload_checksum is not null
   or s.raw_payload->'characteristics'is distinct from x->'chars'
 union all select c.e->>'id','public-source-array'from checked c cross join lateral jsonb_array_elements(c.e->'sources')x
  where c.payload->'sourceAttributes'is distinct from x->'chars'or c.payload->'unmappedAttributes'is distinct from x->'chars'
   or(c.payload#>'{source,characteristics}'is not null and c.payload#>'{source,characteristics}'is distinct from x->'chars')
 union all select c.e->>'id','public-qualified-firebox-array'from checked c cross join lateral jsonb_array_elements(c.e->'displays')x
  where c.payload#>(array(select jsonb_array_elements_text(x->'path')))is distinct from x->'rows'
 union all select e->>'id','public-copy:'||f.key from checked cross join lateral jsonb_each(e->'fields')f
  where f.key in('description','short_description','full_description','description_sections','seo_title','seo_description')and
   payload#>(case f.key when'seo_title'then array['seo','title']when'seo_description'then array['seo','description']
    when'short_description'then array['shortDescription']when'full_description'then array['fullDescription']
    when'description_sections'then array['descriptionSections']else array[f.key]end)is distinct from f.value
)
select jsonb_build_object('jobId','${plan.jobId}','part',${part},'expectedProducts',${rows.length},'actualExpectedIdentities',(select count(*)from checked where internal_id is not null),
 'expectedSources',${rows.reduce((n,x)=>n+x.sources.length,0)},'expectedTypedRows',${rows.reduce((n,x)=>n+x.attrs.length,0)},
 'expectedCategoryMoves',${rows.filter(x=>Object.hasOwn(x.fields,'primary_category_id')).length},'expectedDraftCable',${rows.filter(x=>x.status==='draft').length},
 'canonicalPublished',(select count(*)from public.products where publication_status='published'),
 'activeVersion',(select snapshot_version from public.catalog_snapshot_pointer where singleton),
 'violationCount',(select count(*)from violations),'violations',(select coalesce(jsonb_agg(v),'[]')from(select id,kind from violations order by id,kind limit20)v),
 'pass',(select count(*)=${rows.length} from checked)and(select count(*)=19629 from public.products)and not exists(select1 from violations)
  and(select snapshot_version='${plan.activeVersion}'from public.catalog_snapshot_pointer where singleton))result;
`.replaceAll('limit20','limit 20').replaceAll('select1','select 1');
}
const chunks=[];let current=[];
for(const item of expected){
  if(current.length&&Buffer.byteLength(JSON.stringify([...current,item]))*4/3+10000>600000){chunks.push(current);current=[];}
  current.push(item);
}if(current.length)chunks.push(current);
const outputs=chunks.map((rows,index)=>{
  const sql=auditSql(rows,index+1),target=path.join(root,`imports/overnight-audit/catalog-repair-desired-audit-${String(index+1).padStart(3,'0')}.sql`);
  assert.ok(Buffer.byteLength(sql)<=650000,'Read audit part exceeds the transport bound');fs.writeFileSync(target,sql);
  return{file:path.relative(root,target),bytes:Buffer.byteLength(sql),sha256:sha(sql),products:rows.length};
});
const globalSql=`-- Read-only compact global state check after the510 repair, before later repair phases.
with actual as(select count(*)products,count(*)filter(where publication_status='published')published,
 count(*)filter(where publication_status='draft')draft,count(*)filter(where publication_status='hidden')hidden,
 count(*)filter(where publication_status='archived')archived from public.products),counts as(
 select actual.*,(select count(*)from public.product_attribute_values)attributes,
 (select count(*)from public.catalog_product_cards c where c.snapshot_version='${plan.activeVersion}')cards,
 (select snapshot_version from public.catalog_snapshot_pointer where singleton)active_version from actual)
select jsonb_build_object('actual',to_jsonb(counts),'pass',products=19629 and published=19326 and draft=197 and hidden=47 and archived=59
 and attributes=49610 and cards=19326 and active_version='${plan.activeVersion}')result from counts;\n`;
const globalFile=path.join(root,'imports/overnight-audit/catalog-repair-desired-audit-global.sql');fs.writeFileSync(globalFile,globalSql);
console.log(JSON.stringify({parts:outputs,global:{file:path.relative(root,globalFile),bytes:Buffer.byteLength(globalSql),sha256:sha(globalSql)},products:expected.length,readOnly:true,executed:false}));
