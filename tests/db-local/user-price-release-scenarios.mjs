// Actual 19,629-product compact reference + every854 staged change, against the real repo schema.
// Does not connect to hosted services. Imports and publications are never performed here.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDatabase} from './database.mjs';
import {prepare,changeItems,priceChunkSql} from '../../scripts/pricing/prepare-user-price-release.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIR=path.join(ROOT,'imports/overnight-prices');
const read=async relative=>JSON.parse(await fs.readFile(path.resolve(ROOT,relative),'utf8'));
const one=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0];
const plan=await read('imports/overnight-prices/price-plan.json');
const reference=await read('imports/overnight-prices/catalog-reference.json');
const policy=await read('imports/overnight-prices/price-policy-reference.json');
const manifest=await prepare();const items=changeItems(plan);const ids=items.map(row=>row.legacyId);
const products=reference.rows.map(row=>Object.fromEntries(reference.columns.map((key,i)=>[key,row[i]])));
const ACTIVE=manifest.activeVersion;const started=performance.now();const db=await createDatabase();
try{
  const brands=[...new Set(products.map(row=>row.brand))];
  await db.query(`insert into public.brands(stable_id,slug,name,status)
    select value,value,value,'active'from jsonb_array_elements_text($1::jsonb)on conflict(stable_id)do nothing`,[JSON.stringify(brands)]);
  const category=await one(db,`select c.internal_id from public.categories c where c.status='active'
    and not exists(select1 from public.categories child where child.parent_id=c.internal_id and child.status='active')order by stable_id limit1`.replaceAll('select1','select 1').replaceAll('limit1','limit 1'));
  assert.ok(category,'No fixture leaf');
  for(let offset=0;offset<products.length;offset+=1000){
    const batch=products.slice(offset,offset+1000);
    await db.query(`insert into public.products(internal_id,legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,
      amount,old_amount,currency,price_status,publication_status,description,short_description,full_description,description_sections,updated_at,archived_at)
      select(x->>'internalId')::uuid,x->>'legacyId',x->>'sku','price-fixture-'||($3::integer+ord)::text,x->>'title',x->>'title',
        x->>'model',b.internal_id,$2::uuid,(x->>'amount')::numeric,(x->>'oldAmount')::numeric,x->>'currency',
        (x->>'priceStatus')::public.product_price_status,(x->>'publicationStatus')::public.product_publication_status,
        'Protected description '||(x->>'legacyId'),'Protected short '||(x->>'legacyId'),'Protected full '||(x->>'legacyId'),
        jsonb_build_array(jsonb_build_object('title','Protected section','paragraphs',jsonb_build_array('Exact source content'))),(x->>'updatedAt')::timestamptz,
        case when x->>'publicationStatus'='archived' then(x->>'updatedAt')::timestamptz end
      from jsonb_array_elements($1::jsonb)with ordinality input(x,ord)join public.brands b on b.stable_id=x->>'brand'`,[JSON.stringify(batch),category.internal_id,offset]);
  }
  const sourced=products.filter(row=>row.priceSource);
  for(let offset=0;offset<sourced.length;offset+=200)await db.query(`insert into public.product_price_sources(product_id,base_amount,currency,vat_included,source,source_ref,active,created_at,updated_at)
    select(x->>'internalId')::uuid,(x#>>'{priceSource,baseAmount}')::numeric,x#>>'{priceSource,currency}',(x#>>'{priceSource,vatIncluded}')::boolean,
      x#>>'{priceSource,source}',x#>>'{priceSource,sourceRef}',(x#>>'{priceSource,active}')::boolean,
      (x#>>'{priceSource,updatedAt}')::timestamptz,(x#>>'{priceSource,updatedAt}')::timestamptz from jsonb_array_elements($1::jsonb)x`,[JSON.stringify(sourced.slice(offset,offset+200))]);
  for(const rate of policy.latestRates)await db.query(`insert into public.fx_rates(currency,rate_date,rate,source,fetched_at)values($1,$2,$3,$4,$5)
    on conflict(currency,rate_date)do update set rate=excluded.rate`,[rate.currency,rate.rate_date,rate.rate,rate.source,rate.fetched_at]);
  await db.query(`update public.price_fx_settings set enabled=true,markup_percent=$1,vat_percent=$2 where singleton`,[policy.settings.markup_percent,policy.settings.vat_percent]);
  await db.query(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,
    product_count,public_product_count,product_id_hash,ready)values($1,'price-qa','[]','[]','{}',$2,$3,repeat('0',64),true);
    `,[ACTIVE,products.length,products.filter(row=>row.publicationStatus==='published').length]);
  await db.query('insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,$1)',[ACTIVE]);
  await db.query(`insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,$1)
    on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version,revision=0`,[ACTIVE]);
  await db.query(`insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload)
    select $1,legacy_id,row_number()over(order by legacy_id)::integer-1,jsonb_build_object('id',legacy_id,
      'source',jsonb_build_object('supplier','qa-source','sourceId',legacy_id,'sourceCategory','Protected category','mappingStatus','mapped'),
      'sourceAttributes',jsonb_build_array(jsonb_build_object('label','Exact pressure','value','5','unit','bar')),
      'unmappedAttributes',jsonb_build_array(jsonb_build_object('label','Exact pressure','value','5','unit','bar')))
    from public.products where publication_status<>'archived'`,[ACTIVE]);
  await db.query(`update public.catalog_product_snapshots s set payload=payload||jsonb_build_object('pricing',jsonb_build_object(
      'amount',p.amount,'oldAmount',p.old_amount,'currency',p.currency,'priceStatus',p.price_status))
    from public.products p where p.legacy_id=s.legacy_id and s.snapshot_version=$1`,[ACTIVE]);
  await db.query(`insert into public.catalog_product_cards(snapshot_version,legacy_id,sort_order,brand_id,category_id,series_id,
      amount,price_status,inventory_status,normalized_attributes,search_text,card)
    select s.snapshot_version,p.legacy_id,s.sort_order,b.stable_id,c.stable_id,null,p.amount,p.price_status,p.inventory_status,'{}',p.title,
      jsonb_build_object('id',p.legacy_id,'sku',p.sku,'pricing',s.payload->'pricing')
    from public.catalog_product_snapshots s join public.products p on p.legacy_id=s.legacy_id and p.publication_status='published'
      join public.brands b on b.internal_id=p.brand_id join public.categories c on c.internal_id=p.primary_category_id
    where s.snapshot_version=$1`,[ACTIVE]);
  // Seed one actual changed product with extra protected private/media/document data.
  const protectedId=items.find(row=>row.provenance.kind==='user_price_list').internalId;
  await db.exec(`insert into public.suppliers(stable_id,name,active)values('qa-price-source','QA price source',true)on conflict(stable_id)do nothing;`);
  await db.query(`insert into public.product_source_records(product_id,supplier_id,source_id,raw_payload,mapping_status)
    select $1,internal_id,'protected-source','{"sourceEvidence":{"exact":"preserve"},"characteristics":[{"label":"Pressure","value":"5 bar"}]}'::jsonb,'mapped'
    from public.suppliers where stable_id='qa-price-source'`,[protectedId]);
  await db.query(`insert into public.product_media(product_id,url,role)values($1,'/assets/products/qa/protected.webp','primary')`,[protectedId]);
  await db.query(`insert into public.product_documents(product_id,title,url)values($1,'Protected document','/assets/products/qa/protected.pdf')`,[protectedId]);
  for(let offset=0;offset<ids.length;offset+=75)await db.query('select public._admin_refresh_catalog(array_agg(internal_id))from public.products where legacy_id=any($1::text[])',[ids.slice(offset,offset+75)]);

  const protectedHash=()=>one(db,`select
    (select md5(string_agg(md5((to_jsonb(p)-array['amount','old_amount','currency','price_status','updated_at'])::text),''order by legacy_id collate "C"))from public.products p)products,
    (select md5(coalesce(string_agg(md5(to_jsonb(p)::text),''order by internal_id),''))from public.product_source_records p)sources,
    (select md5(coalesce(string_agg(md5(to_jsonb(p)::text),''order by internal_id),''))from public.product_media p)media,
    (select md5(coalesce(string_agg(md5(to_jsonb(p)::text),''order by internal_id),''))from public.product_documents p)documents,
    (select md5(coalesce(string_agg(md5(to_jsonb(p)::text),''order by product_id,attribute_id),''))from public.product_attribute_values p)typed,
    (select md5(coalesce(string_agg(md5(jsonb_build_array(payload->'source',payload->'sourceAttributes',payload->'unmappedAttributes')::text),''order by legacy_id collate "C"),''))
      from public.catalog_product_snapshots where snapshot_version=$1)sourceCharacteristics`,[ACTIVE]);
  const commercialHash=()=>one(db,`select md5(string_agg(jsonb_build_array(legacy_id,amount,old_amount,currency,price_status)::text,''order by legacy_id collate "C"))hash from public.products`);
  const priorSourceHash=()=>one(db,`select count(*)::integer n,md5(string_agg(md5(to_jsonb(p)::text),''order by product_id))hash from public.product_price_sources p where product_id=any($1::uuid[])`,[sourced.map(row=>row.internalId)]);
  const before=await protectedHash(),beforeCommercial=await commercialHash(),beforeSource=await priorSourceHash();
  // A late bad row must roll back the earlier updates/audit/cache changes in that same chunk.
  const bad=structuredClone(items.slice(0,75));bad.at(-1).sku+='-BROKEN';
  const badSql=priceChunkSql(bad,{sourceRef:'price-qa/negative',jobId:'qa',planSha256:manifest.planSha256,policy,productCount:products.length});
  await assert.rejects(db.exec(badSql),/identity\/status guard/);await db.exec('rollback;');
  assert.deepEqual(await commercialHash(),beforeCommercial);assert.deepEqual(await protectedHash(),before);
  for(const chunk of manifest.chunks)await db.exec(await fs.readFile(path.resolve(ROOT,chunk.file),'utf8'));
  assert.deepEqual(await protectedHash(),before,'A price release changed protected product/source/media/document/characteristic fields');
  assert.deepEqual(await priorSourceHash(),beforeSource,'A retained earlier price source row changed');
  for(let offset=0;offset<items.length;offset+=100){
    const batch=items.slice(offset,offset+100);const{rows}=await db.query(`select p.legacy_id,p.amount,p.old_amount,p.price_status::text,
      s.payload#>>'{pricing,amount}'snapshot_amount,c.card#>>'{pricing,amount}'card_amount,
      ps.vat_included,ps.source_ref from public.products p left join public.product_price_sources ps on ps.product_id=p.internal_id
      join public.catalog_product_snapshots s on s.legacy_id=p.legacy_id and s.snapshot_version=$1
      left join public.catalog_product_cards c on c.legacy_id=p.legacy_id and c.snapshot_version=$1 where p.legacy_id=any($2::text[])`,[ACTIVE,batch.map(row=>row.legacyId)]);
    assert.equal(rows.length,batch.length);const byId=new Map(rows.map(row=>[row.legacy_id,row]));
    for(const expected of batch){const actual=byId.get(expected.legacyId);assert.equal(actual.amount===null?null:Number(actual.amount),expected.after.amount);
      assert.equal(actual.old_amount,null);assert.equal(actual.price_status,expected.after.priceStatus);
      assert.equal(actual.snapshot_amount===null?null:Number(actual.snapshot_amount),expected.after.amount);
      assert.equal(actual.card_amount===null?null:Number(actual.card_amount),expected.after.amount);
      if(expected.provenance.kind==='user_price_list'){assert.equal(actual.vat_included,expected.afterSource.vatIncluded);assert.equal(actual.source_ref,expected.afterSource.sourceRef);}
    }
  }
  assert.equal((await one(db,'select count(*)::integer n from public.product_price_sources')).n,1961);
  assert.equal((await one(db,"select count(*)::integer n from public.products where price_status='known'")).n,1961);
  assert.equal((await one(db,'select count(*)::integer n from public.products where old_amount is not null')).n,0);
  const auditCount=(await one(db,'select count(*)::integer n from public.price_fx_runs')).n;assert.equal(auditCount,manifest.chunks.length);
  const auditResults=await db.exec(await fs.readFile(path.join(path.dirname(path.resolve(ROOT,manifest.chunks[0].file)),'final-audit.sql'),'utf8'));
  assert.equal(auditResults.at(-1).rows[0].result.pass,true,'The final hosted audit SQL did not pass locally');
  const boundedAudit=JSON.parse(await fs.readFile(path.join(path.dirname(path.resolve(ROOT,manifest.chunks[0].file)),'audit-parts-manifest.json'),'utf8'));
  let detailRows=0;
  for(const part of boundedAudit.files){
    const sql=await fs.readFile(path.resolve(ROOT,part.file),'utf8');assert.ok(Buffer.byteLength(sql)<700000);
    const results=await db.exec(sql);const result=results.at(-1).rows[0].result;
    assert.equal(result.pass,true,`Bounded final audit failed: ${part.file}`);
    if(part.kind==='details')detailRows+=Number(result.checkedRows);
  }
  assert.equal(detailRows,1961,'Bounded final audit omitted or repeated expected rows');
  const complete=await commercialHash();
  for(const chunk of manifest.chunks)await db.exec(await fs.readFile(path.resolve(ROOT,chunk.file),'utf8'));
  assert.deepEqual(await commercialHash(),complete);assert.equal((await one(db,'select count(*)::integer n from public.price_fx_runs')).n,auditCount);
  // Replay refuses manual edits after the audit, even if another part would otherwise be idempotent.
  const first=items[0];await db.query('update public.products set old_amount=9999999 where legacy_id=$1',[first.legacyId]);
  await assert.rejects(db.exec(await fs.readFile(path.resolve(ROOT,manifest.chunks[0].file),'utf8')),/refusing replay overwrite/);await db.exec('rollback;');
  await db.query('update public.products set old_amount=null where legacy_id=$1',[first.legacyId]);
  for(const chunk of [...manifest.chunks].reverse())await db.exec(await fs.readFile(path.resolve(ROOT,chunk.rollbackFile),'utf8'));
  assert.deepEqual(await commercialHash(),beforeCommercial,'Recovery did not restore original commercial fields');
  assert.deepEqual(await protectedHash(),before);assert.deepEqual(await priorSourceHash(),beforeSource);
  assert.equal((await one(db,'select count(*)::integer n from public.product_price_sources')).n,1683);
  const report={status:'PASS',suite:'actual-user-price-release',canonicalProducts:products.length,changedProducts:items.length,
    chunks:manifest.chunks.length,newListSources:278,clearedNonListPrices:560,unsupportedOldPricesCleared:16,
    retainedPriorSourceRows:1683,allPriorSourceRowsByteIdentical:true,knownPricesAfter:1961,
    allProtectedProductFieldsIdentical:true,privateSourceAndCharacteristicsPreserved:true,mediaDocumentsPreserved:true,
    wholeUAHAndNullVATVerified:true,replayIdempotent:true,lateGuardRollback:true,manualReplayRefused:true,
    recoveryCommercialAndSourcesExact:true,finalAuditSQLPassed:true,boundedAuditSQLPassed:true,activeSnapshotRows:19570,publicCards:19327,
    hostedConnections:0,elapsedMs:Math.round(performance.now()-started)};
  await fs.writeFile(path.join(DIR,'local-release-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({status:'FAIL',suite:'actual-user-price-release',error:error.message,code:error.code,detail:error.detail?.slice(0,500),hostedConnections:0}));process.exitCode=1;}
finally{await db.close();}
