// Current compact PROD identities/commercial values plus protected rich fixtures, real migrations, no hosted connection.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createDatabase} from './database.mjs';
import {saleUnitPriceChunkSql as priceChunkSql} from '../../scripts/pricing/rehau-sale-unit-user-prices.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=async file=>JSON.parse(await fs.readFile(path.resolve(ROOT,file),'utf8'));
const one=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0];
const hash=value=>createHash('sha256').update(value).digest('hex');
const pointer=await read('imports/rehau-pipe-prices-2026-11-26/release-pointer.json'),manifest=await read(pointer.manifest),plan=await read(manifest.planFile);
const reference=await read(manifest.referenceFile),policy=await read(manifest.policyFile),items=plan.items;
assert.equal(hash(await fs.readFile(path.resolve(ROOT,manifest.planFile))),manifest.planSha256);
assert.equal(hash(await fs.readFile(path.resolve(ROOT,manifest.referenceFile))),manifest.referenceSha256);
assert.equal(hash(await fs.readFile(path.resolve(ROOT,manifest.policyFile))),manifest.policySha256);
const products=reference.rows.map(row=>Object.fromEntries(reference.columns.map((field,index)=>[field,row[index]])));
assert.ok(reference.columns.includes('saleUnit'));assert.equal(items.filter(item=>item.expectedSaleUnit==='m').length,129);assert.equal(items.filter(item=>item.expectedSaleUnit==='piece').length,11);
const ACTIVE=manifest.activeVersion,started=performance.now(),db=await createDatabase();
try{
 await db.exec("set timezone='UTC'");
 const brands=[...new Set(products.map(p=>p.brand))];await db.query(`insert into public.brands(stable_id,slug,name,status)select value,value,value,'active'from jsonb_array_elements_text($1::jsonb)on conflict(stable_id)do nothing`,[JSON.stringify(brands)]);
 const category=await one(db,`select internal_id from public.categories c where status='active'and not exists(select 1 from public.categories child where child.parent_id=c.internal_id and child.status='active')order by stable_id limit 1`);assert.ok(category);
 for(let offset=0;offset<products.length;offset+=1000)await db.query(`insert into public.products(internal_id,legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,
 amount,old_amount,currency,price_status,publication_status,sale_unit,description,short_description,full_description,description_sections,updated_at,archived_at)
 select(x->>'internalId')::uuid,x->>'legacyId',x->>'sku','fresh-price-qa-'||($3::integer+n)::text,x->>'title',x->>'title',x->>'model',b.internal_id,$2::uuid,
 (x->>'amount')::numeric,(x->>'oldAmount')::numeric,x->>'currency',(x->>'priceStatus')::public.product_price_status,(x->>'publicationStatus')::public.product_publication_status,x->>'saleUnit',
 'Protected description '||(x->>'legacyId'),'Protected short','Protected full','[{"title":"Protected source","paragraphs":["Keep source facts and minus -40 °C"]}]',
 (x->>'updatedAt')::timestamptz,case when x->>'publicationStatus'='archived'then(x->>'updatedAt')::timestamptz end
 from jsonb_array_elements($1::jsonb)with ordinality input(x,n)join public.brands b on b.stable_id=x->>'brand'`,[JSON.stringify(products.slice(offset,offset+1000)),category.internal_id,offset]);
 const prior=products.filter(p=>p.priceSource);for(let offset=0;offset<prior.length;offset+=200)await db.query(`insert into public.product_price_sources(product_id,base_amount,currency,vat_included,source,source_ref,active,created_at,updated_at)
 select(x->>'internalId')::uuid,(x#>>'{priceSource,baseAmount}')::numeric,x#>>'{priceSource,currency}',(x#>>'{priceSource,vatIncluded}')::boolean,x#>>'{priceSource,source}',x#>>'{priceSource,sourceRef}',
 (x#>>'{priceSource,active}')::boolean,(x#>>'{priceSource,updatedAt}')::timestamptz,(x#>>'{priceSource,updatedAt}')::timestamptz from jsonb_array_elements($1::jsonb)x`,[JSON.stringify(prior.slice(offset,offset+200))]);
 assert.equal(prior.length,2884);for(const rate of policy.latestRates)await db.query(`insert into public.fx_rates(currency,rate_date,rate,source,fetched_at)values($1,$2,$3,$4,$5)on conflict(currency,rate_date)do update set rate=excluded.rate`,[rate.currency,rate.rate_date,rate.rate,rate.source,rate.fetched_at]);
 await db.query(`update public.price_fx_settings set enabled=true,markup_percent=$1,vat_percent=$2 where singleton`,[policy.settings.markup_percent,policy.settings.vat_percent]);
 await db.query(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)values($1,'fresh-rehau-price-qa','[]','[]','{}',$2,19326,repeat('0',64),true)`,[ACTIVE,products.length]);
 await db.query(`insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,$1)`,[ACTIVE]);
 await db.query(`insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,$1)on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version,revision=0`,[ACTIVE]);
 await db.query(`insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload)
 select $1,legacy_id,row_number()over(order by legacy_id)::integer-1,jsonb_build_object('id',legacy_id,'source',jsonb_build_object('supplier','protected','sourceId',legacy_id),
 'sourceAttributes','[{"label":"Кут конуса","value":"60 °"},{"label":"Температурний діапазон","value":"-40 - 95 °C"}]'::jsonb,
 'unmappedAttributes','[{"label":"Кут конуса","value":"60 °"},{"label":"Температурний діапазон","value":"-40 - 95 °C"}]'::jsonb,
 'pricing',jsonb_build_object('amount',amount,'oldAmount',old_amount,'currency',currency,'priceStatus',price_status,'unit',sale_unit))from public.products where publication_status<>'archived'`,[ACTIVE]);
 await db.query(`insert into public.catalog_product_cards(snapshot_version,legacy_id,sort_order,brand_id,category_id,amount,price_status,inventory_status,normalized_attributes,search_text,card)
 select s.snapshot_version,p.legacy_id,s.sort_order,b.stable_id,c.stable_id,p.amount,p.price_status,p.inventory_status,'{}',p.title,jsonb_build_object('id',p.legacy_id,'pricing',s.payload->'pricing')
 from public.catalog_product_snapshots s join public.products p on p.legacy_id=s.legacy_id and p.publication_status='published'join public.brands b on b.internal_id=p.brand_id join public.categories c on c.internal_id=p.primary_category_id where snapshot_version=$1`,[ACTIVE]);
 const first=items[0];await db.exec(`insert into public.suppliers(stable_id,name,active)values('rehau-price-qa','Protected supplier',true)on conflict do nothing`);
 await db.query(`insert into public.product_source_records(product_id,supplier_id,source_id,raw_payload,mapping_status)select $1,internal_id,'protected-source',
 '{"sourceEvidence":{"exactSku":"preserve","rawEtim":"-40 - 95 °C"},"characteristics":[{"label":"Кут конуса","value":"60 °"}]}'::jsonb,'mapped'from public.suppliers where stable_id='rehau-price-qa'`,[first.internalId]);
 const definition=await one(db,`select internal_id from public.attribute_definitions where status='active'and value_type='number'order by stable_id limit 1`);
 await db.query(`insert into public.product_attribute_values(product_id,attribute_id,value_number,source_label,source_value,provenance)values($1,$2,90,'Protected angle','"90 °"','source-confirmed')`,[first.internalId,definition.internal_id]);
 await db.query(`insert into public.product_media(product_id,url,role)values($1,'/assets/products/qa/protected.webp','primary')`,[first.internalId]);
 await db.query(`insert into public.product_documents(product_id,title,url)values($1,'Protected PDF','/assets/products/qa/protected.pdf')`,[first.internalId]);
 for(let offset=0;offset<items.length;offset+=50)await db.query('select public._admin_refresh_catalog($1::uuid[])',[items.slice(offset,offset+50).map(i=>i.internalId)]);
 async function protectedHash(){return one(db,`select
 (select md5(string_agg(md5((to_jsonb(p)-array['amount','old_amount','currency','price_status','updated_at'])::text),''order by legacy_id collate "C"))from public.products p)products,
 (select md5(coalesce(string_agg(md5(to_jsonb(s)::text),''order by internal_id),''))from public.product_source_records s)sources,
 (select md5(coalesce(string_agg(md5(to_jsonb(v)::text),''order by product_id,attribute_id),''))from public.product_attribute_values v)typed,
 (select md5(coalesce(string_agg(md5(to_jsonb(v)::text),''order by internal_id),''))from public.product_media v)media,
 (select md5(coalesce(string_agg(md5(to_jsonb(v)::text),''order by internal_id),''))from public.product_documents v)documents,
 (select md5(string_agg(md5(jsonb_build_array(payload->'source',payload->'sourceAttributes',payload->'unmappedAttributes')::text),''order by legacy_id collate "C"))from public.catalog_product_snapshots where snapshot_version=$1)sourceDisplay`,[ACTIVE]);}
 const commercial=()=>one(db,`select md5(string_agg(jsonb_build_array(legacy_id,amount,old_amount,currency,price_status)::text,''order by legacy_id collate "C"))hash from public.products`);
 const priorSources=()=>one(db,`select md5(string_agg(md5(to_jsonb(s)::text),''order by product_id))hash,count(*)::integer n from public.product_price_sources s where product_id=any($1::uuid[])`,[prior.map(p=>p.internalId)]);
 const before=await protectedHash(),beforeCommercial=await commercial(),beforeSources=await priorSources();
 const firstChunk=manifest.chunks.find(chunk=>items.some(item=>item.expectedSaleUnit==='m'&&chunk.ids.includes(item.legacyId)));assert.ok(firstChunk);
 const metre=items.find(item=>item.expectedSaleUnit==='m'&&firstChunk.ids.includes(item.legacyId)),id="'"+metre.internalId.replaceAll("'","''")+"'::uuid";
 const firstSql=await fs.readFile(path.resolve(ROOT,firstChunk.file),'utf8'),unitAnchor='do $rehau_sale_unit_guard$';
 const badCanonical=firstSql.replace(unitAnchor,`update public.products set sale_unit='piece'where internal_id=${id};\n`+unitAnchor);
 await assert.rejects(db.exec(badCanonical),/Canonical sale-unit guard failed/);await db.exec('rollback;');assert.deepEqual(await commercial(),beforeCommercial);assert.deepEqual(await protectedHash(),before);
 // A serializer/cache regression after the financial writes must roll back prices, sources and the job audit together.
 const postIndex=firstSql.lastIndexOf(unitAnchor);assert.ok(postIndex>firstSql.indexOf(unitAnchor));
 const drift=`update public.catalog_product_snapshots set payload=jsonb_set(payload,'{pricing,unit}','"piece"')where legacy_id=(select legacy_id from public.products where internal_id=${id});\nupdate public.catalog_product_cards set card=jsonb_set(card,'{pricing,unit}','"piece"')where legacy_id=(select legacy_id from public.products where internal_id=${id});\n`;
 await assert.rejects(db.exec(firstSql.slice(0,postIndex)+drift+firstSql.slice(postIndex)),/Public pricing sale-unit postcondition failed/);await db.exec('rollback;');
 assert.deepEqual(await commercial(),beforeCommercial);assert.deepEqual(await protectedHash(),before);assert.equal((await one(db,'select count(*)::integer n from public.product_price_sources')).n,2884);assert.equal((await one(db,'select count(*)::integer n from public.price_fx_runs')).n,0);
 const bad=structuredClone(items.slice(0,50));bad.at(-1).before.amount=999;
 await assert.rejects(db.exec(priceChunkSql(bad,{sourceRef:'rehau-qa/late-guard',jobId:'rehau-qa',planSha256:manifest.planSha256,policy,productCount:products.length,activeVersion:ACTIVE})),/Prior commercial\/source state changed/);await db.exec('rollback;');
 assert.deepEqual(await commercial(),beforeCommercial);assert.deepEqual(await protectedHash(),before);assert.equal((await one(db,'select count(*)::integer n from public.product_price_sources')).n,2884);
 for(const chunk of manifest.chunks){const bytes=await fs.readFile(path.resolve(ROOT,chunk.file));assert.equal(hash(bytes),chunk.sha256);assert.ok(bytes.length<650000);await db.exec(bytes.toString());}
 assert.deepEqual(await protectedHash(),before);assert.deepEqual(await priorSources(),beforeSources);
 for(let offset=0;offset<items.length;offset+=100){const batch=items.slice(offset,offset+100);const{rows}=await db.query(`select p.legacy_id,p.amount,p.old_amount,p.currency,p.price_status::text,p.sale_unit,s.base_amount,s.currency source_currency,s.vat_included,s.source_ref,
 snapshot.payload#>>'{pricing,amount}'snapshot_amount,card.card#>>'{pricing,amount}'card_amount,snapshot.payload#>>'{pricing,unit}'snapshot_unit,card.card#>>'{pricing,unit}'card_unit from public.products p join public.product_price_sources s on s.product_id=p.internal_id
 join public.catalog_product_snapshots snapshot on snapshot.legacy_id=p.legacy_id and snapshot.snapshot_version=$1 join public.catalog_product_cards card on card.legacy_id=p.legacy_id and card.snapshot_version=$1 where p.legacy_id=any($2::text[])`,[ACTIVE,batch.map(i=>i.legacyId)]);
  assert.equal(rows.length,batch.length);for(const actual of rows){const expected=batch.find(i=>i.legacyId===actual.legacy_id);assert.equal(Number(actual.amount),expected.after.amount);assert.equal(actual.old_amount,null);assert.equal(actual.currency,'UAH');assert.equal(actual.price_status,'known');
   assert.equal(Number(actual.base_amount),Number(expected.afterSource.baseAmount));assert.equal(actual.source_currency,'EUR');assert.equal(actual.vat_included,null);assert.equal(actual.source_ref,expected.afterSource.sourceRef);assert.equal(Number(actual.snapshot_amount),expected.after.amount);assert.equal(Number(actual.card_amount),expected.after.amount);
   assert.equal(actual.sale_unit,expected.expectedSaleUnit);assert.equal(actual.snapshot_unit,expected.expectedSaleUnit);assert.equal(actual.card_unit,expected.expectedSaleUnit);}}
 const audits=(await one(db,'select count(*)::integer n from public.price_fx_runs')).n;assert.equal(audits,manifest.chunks.length);const complete=await commercial();
 for(const chunk of manifest.chunks)await db.exec(await fs.readFile(path.resolve(ROOT,chunk.file),'utf8'));assert.deepEqual(await commercial(),complete);assert.equal((await one(db,'select count(*)::integer n from public.price_fx_runs')).n,audits);
 assert.equal((await one(db,"select count(*)::integer n from public.products where price_status='known'and amount>0")).n,manifest.summary.expectedPositive);
 await db.query('update public.products set old_amount=amount+1000 where internal_id=$1',[first.internalId]);await assert.rejects(db.exec(await fs.readFile(path.resolve(ROOT,manifest.chunks[0].file),'utf8')),/refusing replay overwrite/);await db.exec('rollback;');await db.query('update public.products set old_amount=null where internal_id=$1',[first.internalId]);
 for(const chunk of [...manifest.chunks].reverse()){const bytes=await fs.readFile(path.resolve(ROOT,chunk.rollbackFile));assert.equal(hash(bytes),chunk.rollbackSha256);await db.exec(bytes.toString());}
 assert.deepEqual(await commercial(),beforeCommercial);assert.deepEqual(await protectedHash(),before);assert.deepEqual(await priorSources(),beforeSources);assert.equal((await one(db,'select count(*)::integer n from public.product_price_sources')).n,2884);
 const report={status:'PASS',suite:'rehau-sale-unit-price-release',jobId:manifest.jobId,canonicalProducts:products.length,selectedCurrentRecords:items.length,chunks:manifest.chunks.length,perMetre:129,pieceEndcaps:11,
 actualFreshIdentitiesCommercialAndSaleUnits:true,prior2884SourcesWholeRowsIdentical:true,allNonCommercialFieldsIncludingSaleUnitPreserved:true,privateSourceTypedMediaDocumentsAndCacheFactsPreserved:true,
 eurBaseAndUnknownVatPreserved:true,onceOnlyNbuMarkup:true,noRollOrLengthScaling:true,desiredSnapshotCardPricesAndUnits:true,canonicalUnitMismatchRollback:true,postPriceUnitDriftRollsBackMoneySourcesAndAudit:true,
 lateConflictRollback:true,idempotentReplay:true,manualReplayRefused:true,pairedRecoveryExact:true,hostedConnections:0,elapsedMs:Math.round(performance.now()-started)};
 await fs.writeFile(path.join(path.dirname(path.resolve(ROOT,manifest.planFile)),'local-db-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({status:'FAIL',suite:'rehau-sale-unit-price-release',error:error.message?.slice(0,1400),code:error.code,detail:error.detail?.slice(0,300),hostedConnections:0}));process.exitCode=1;}
finally{await db.close();}
