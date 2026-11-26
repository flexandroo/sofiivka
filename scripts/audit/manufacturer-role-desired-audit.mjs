// Generate bounded, read-only desired-state checks. Run BEFORE the later claim
// and grammar copy overlays. Does not connect to PostgreSQL or mutate a plan.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const ROOT=path.resolve(import.meta.dirname,'../..'),OUT=path.join(ROOT,'imports/overnight-audit/source-reconciliation');
const file=path.join(OUT,'correction-plan.json'),raw=fs.readFileSync(file),plan=JSON.parse(raw);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(sha(raw),'e5f34b6c9e0c4c80528e3df56659ef9930a7a62d435e036a1034f684b21a6bd9');
assert.equal(plan.products.length,326);
const expected=plan.products.map(p=>({id:p.id,uuid:p.internalId,sku:p.sku,status:p.expectedStatus,brand:p.guardProduct.brand_id,run:p.guardProduct.last_import_run_id,fields:Object.fromEntries(p.productChanges.map(c=>[c.field,c.new]))}));
export function roleAuditSql(rows,part=1) {
  const encoded=Buffer.from(JSON.stringify(rows)).toString('base64');
  return `-- Read-only exact manufacturer-role desired audit part ${part}. Before claim/copy overlays.
with expected as materialized(select value e from jsonb_array_elements(convert_from(decode('${encoded}','base64'),'UTF8')::jsonb)),
checked as materialized(
 select e.e,p.internal_id,p.legacy_id,p.sku,p.slug,p.title,p.short_title,p.publication_status,p.amount,p.currency,p.price_status,
 to_jsonb(p) product_row,c.stable_id category,s.payload,card.card,card.category_id card_category
 from expected e left join public.products p on p.internal_id=(e.e->>'uuid')::uuid
 left join public.categories c on c.internal_id=p.primary_category_id
 left join public.catalog_product_snapshots s on s.snapshot_version='${plan.activeVersion}' and s.legacy_id=e.e->>'id'
 left join public.catalog_product_cards card on card.snapshot_version='${plan.activeVersion}' and card.legacy_id=e.e->>'id'
),violations as(
 select e->>'id' id,'identity/ownership/status/snapshot' kind from checked
 where internal_id is null or legacy_id is distinct from e->>'id' or sku is distinct from e->>'sku'
 or product_row->>'brand_id' is distinct from e->>'brand' or product_row->>'last_import_run_id' is distinct from e->>'run'
 or publication_status::text is distinct from e->>'status' or payload is null
 union all select e->>'id','canonical-selected:'||f.key from checked cross join lateral jsonb_each(e->'fields')f
 where product_row->f.key is distinct from f.value
 union all select e->>'id','public-core' from checked where payload->>'title' is distinct from title or payload->>'shortTitle' is distinct from short_title
 or payload->>'sku' is distinct from sku or payload->>'slug' is distinct from slug or payload->>'primaryCategoryId' is distinct from category
 or payload->>'publicationStatus' is distinct from publication_status::text
 union all select e->>'id','public-card' from checked where card is null or card->>'title' is distinct from title
 or card->>'shortTitle' is distinct from short_title or card->>'sku' is distinct from sku or card->>'slug' is distinct from slug
 or card_category is distinct from category or card->>'primaryCategoryId' is distinct from category
 or card#>'{pricing,amount}' is distinct from coalesce(to_jsonb(amount),'null'::jsonb)
 or card#>>'{pricing,currency}' is distinct from currency or card#>>'{pricing,priceStatus}' is distinct from price_status::text
 union all select e->>'id','public-copy:'||f.key from checked cross join lateral jsonb_each(e->'fields')f
 where f.key<>'primary_category_id' and payload#>(case f.key
 when 'short_title' then array['shortTitle'] when 'short_description' then array['shortDescription']
 when 'full_description' then array['fullDescription'] when 'description_sections' then array['descriptionSections']
 when 'seo_title' then array['seo','title'] when 'seo_description' then array['seo','description'] else array[f.key] end) is distinct from f.value
)
select jsonb_build_object('jobId','${plan.jobId}','part',${part},'expectedProducts',${rows.length},
 'actualExpectedIdentities',(select count(*) from checked where internal_id is not null),
 'expectedHeadRepairs',${rows.filter(x=>Object.hasOwn(x.fields,'title')).length},
 'expectedCategoryMoves',${rows.filter(x=>Object.hasOwn(x.fields,'primary_category_id')).length},
 'activeVersion',(select snapshot_version from public.catalog_snapshot_pointer where singleton),
 'violationCount',(select count(*) from violations),
 'violations',(select coalesce(jsonb_agg(v),'[]') from(select id,kind from violations order by id,kind limit 20)v),
 'pass',(select count(*)=${rows.length} from checked) and(select count(*)=19629 from public.products)
 and not exists(select 1 from violations)
 and(select snapshot_version='${plan.activeVersion}' from public.catalog_snapshot_pointer where singleton)) result;
`;
}
const groups=[];let pending=[];
for(const row of expected){if(pending.length&&Buffer.byteLength(roleAuditSql([...pending,row],groups.length+1))>600000){groups.push(pending);pending=[];}pending.push(row);}if(pending.length)groups.push(pending);
const parts=groups.map((rows,i)=>{const sql=roleAuditSql(rows,i+1),file=path.join(OUT,`role-desired-audit-${String(i+1).padStart(3,'0')}.sql`);assert.ok(Buffer.byteLength(sql)<=600000);fs.writeFileSync(file,sql);return{file:path.relative(ROOT,file).replaceAll('\\','/'),bytes:Buffer.byteLength(sql),sha256:sha(sql),products:rows.length,ids:rows.map(x=>x.id)};});
assert.deepEqual(parts.flatMap(x=>x.ids),expected.map(x=>x.id));
const globalSql=`-- Read-only compact global state after326 role repairs and before595 claims.
with actual as(select count(*) products,count(*)filter(where publication_status='published') published,
 count(*)filter(where publication_status='draft') draft,count(*)filter(where publication_status='hidden') hidden,
 count(*)filter(where publication_status='archived') archived from public.products),counts as(
 select actual.*,(select count(*) from public.product_attribute_values) attributes,
 (select count(*) from public.catalog_product_cards where snapshot_version='${plan.activeVersion}') cards,
 (select snapshot_version from public.catalog_snapshot_pointer where singleton) active_version,
 (select revision from public.catalog_admin_cache_revision where singleton) cache_revision from actual)
select jsonb_build_object('actual',to_jsonb(counts),'pass',products=19629 and published=19326 and draft=197 and hidden=47 and archived=59
 and attributes=49609 and cards=19326 and active_version='${plan.activeVersion}') result from counts;
`;
const globalFile=path.join(OUT,'role-desired-audit-global.sql');fs.writeFileSync(globalFile,globalSql);
const manifest={format:'manufacturer-role-desired-audit-v1',status:'READ_ONLY_NOT_EXECUTED',beforeOverlayJobs:['manufacturer-claims-20261126-ae32abafcb32','manufacturer-role-grammar-20261126-94951b79290e'],jobId:plan.jobId,planSha256:sha(raw),products:326,parts,global:{file:path.relative(ROOT,globalFile).replaceAll('\\','/'),bytes:Buffer.byteLength(globalSql),sha256:sha(globalSql)}};
fs.writeFileSync(path.join(OUT,'role-desired-audit-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({products:326,parts:parts.map(({ids,...p})=>p),global:manifest.global,readOnly:true,executed:false}));
