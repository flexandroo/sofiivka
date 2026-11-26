// Prepare a selected-ID-only sale-unit repair; never connects to a hosted database.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const directory='imports/rehau-pipe-prices-2026-11-26',source=directory+'/reviewed-per-metre-pipe-aliases.json';
const bytes=fs.readFileSync(source),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
assert.equal(hash(bytes),'e461c762cdf5f83d7a1169a7feba3b6906d5dd0eb9a54e762692f3f76148476a');
const aliases=JSON.parse(bytes),reference=JSON.parse(fs.readFileSync('imports/rehau-prices-2026-11-26/catalog-reference.json'));
const products=reference.rows.map(row=>Object.fromEntries(reference.columns.map((k,i)=>[k,row[i]])));
const bySku=new Map(products.filter(p=>p.brand==='rehau').map(p=>[p.sku,p]));
const items=aliases.map(a=>{assert.equal(a.expectedSaleUnit,'m');const p=bySku.get(a.catalogSku);assert.ok(p&&p.publicationStatus==='published');assert.equal(p.amount,null);assert.equal(p.priceSource,null);assert.equal(p.priceStatus,'unknown');return{legacyId:p.legacyId,internalId:p.internalId,sku:p.sku,originalUpdatedAt:p.updatedAt,before:'piece',after:'m',quoteId:a.quoteId};}).sort((a,b)=>a.legacyId<b.legacyId?-1:1);
assert.equal(items.length,129);assert.equal(new Set(items.map(i=>i.internalId)).size,129);
const active='ae5db3f38bc5df72c2d0ea11bf95eefaf589867ff011bfa82dd17e1f3805e564';
const plan={kind:'confirmed-per-metre-sale-units',authorizedOn:'2026-11-26',projectRef:'fkjarsouuchjiedrrblc',activeVersion:active,aliasSha256:hash(bytes),items};
const planText=JSON.stringify(plan,null,2)+'\n',planSha256=hash(planText);
const payload="convert_from(decode('"+Buffer.from(JSON.stringify(items)).toString('base64')+"','base64'),'UTF8')::jsonb";
function build(direction){const from=direction==='apply'?'piece':'m',to=direction==='apply'?'m':'piece';
return `-- Exact 129 confirmed pipe IDs only; price-free preparation. Plan SHA ${planSha256}.
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';
set local timezone='UTC';
do $sale_unit_repair$
declare items jsonb:=${payload};item jsonb;p public.products%rowtype;ids uuid[]:='{}';version text;
begin
 if current_user not in('postgres','service_role','supabase_admin') or current_database()<>'postgres' then raise exception 'Privileged production importer required';end if;
 if(select count(*)from public.products)<>19629 then raise exception 'Catalogue count changed';end if;
 select snapshot_version into version from public.catalog_snapshot_pointer where singleton for update;
 if version is distinct from '${active}'then raise exception 'Active pointer changed';end if;
 perform 1 from public.catalog_snapshot_releases where snapshot_version=version and ready for update;if not found then raise exception 'Ready release missing';end if;
 for item in select value from jsonb_array_elements(items)loop
  select x.* into p from public.products x join public.brands b on b.internal_id=x.brand_id
   where x.internal_id=(item->>'internalId')::uuid and x.legacy_id=item->>'legacyId' and x.sku=item->>'sku' and b.stable_id='rehau'and x.publication_status='published' for update of x;
  if not found or p.amount is not null or p.old_amount is not null or p.price_status<>'unknown' or exists(select 1 from public.product_price_sources where product_id=p.internal_id)then raise exception 'Unpriced pipe identity guard refused %',item->>'legacyId';end if;
  if p.sale_unit='${to}'then
   if not exists(select 1 from public.catalog_product_snapshots s join public.catalog_product_cards c using(snapshot_version,legacy_id)where s.snapshot_version=version and s.legacy_id=p.legacy_id and s.payload#>>'{pricing,unit}'='${to}'and c.card#>>'{pricing,unit}'='${to}')then raise exception 'Prepared pipe cache differs';end if;
   continue;
  end if;
  if p.sale_unit<>'${from}'then raise exception 'Unexpected prior sale unit';end if;
  ${direction==='apply'?"if p.updated_at is distinct from(item->>'originalUpdatedAt')::timestamptz then raise exception 'Pipe row changed after reference export';end if;":''}
  update public.products set sale_unit='${to}',updated_at=now() where internal_id=p.internal_id;
  ids:=array_append(ids,p.internal_id);
 end loop;
 if cardinality(ids)>0 then perform public._admin_refresh_catalog(ids);end if;
end $sale_unit_repair$;
commit;
select jsonb_build_object('status','committed','operation','${direction}','selected',129,'saleUnit','${to}','planSha256','${planSha256}')result;
`;}
fs.writeFileSync(directory+'/sale-unit-plan.json',planText);
const files=['apply','rollback'].map(direction=>{const file=directory+'/sale-units-'+direction+'.sql',sql=build(direction);fs.writeFileSync(file,sql);return{file,sha256:hash(sql),bytes:Buffer.byteLength(sql),direction};});
fs.writeFileSync(directory+'/sale-unit-manifest.json',JSON.stringify({planSha256,items:129,files},null,2)+'\n');
console.log(JSON.stringify({planSha256,items:129,files}));
