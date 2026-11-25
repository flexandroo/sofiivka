/**
 * Rehearse every bounded draft/publication statement of a prepared brand release locally.
 * Usage: node scripts/import/rehearse-brand-release.mjs imports/releases/<job>/manifest.json
 * Uses in-memory PGlite and the real project migrations. Never opens hosted connections.
 * A compact progress stream is printed; the complete report is written to imports/rehearsals/.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createDatabase} from '../../tests/db-local/database.mjs';
import {metadataSql} from './three-brand-metadata.mjs';
import {readyPayload,atomicPublicationSql} from './prepare-brand-release.mjs';
import {stableImportId} from './product-identity.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..');
const one=async(db,query,args=[])=>(await db.query(query,args)).rows[0];
const stableId=stableImportId;
const progress=value=>console.log(JSON.stringify(value));
const elapsed=start=>Math.round(performance.now()-start);
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const relationBytes=async db=>(await one(db,"select coalesce(sum(pg_total_relation_size(c.oid)),0)::float8 bytes from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).bytes;

export async function rehearse(manifestPath){
  const manifestFile=path.resolve(ROOT,manifestPath);const manifest=await readJson(manifestFile);
  assert.match(manifest.jobId,/^[a-zA-Z0-9._-]+$/,'safe job identity');
  assert.ok(Array.isArray(manifest.chunks)&&Array.isArray(manifest.batches),'prepared manifest shape');
  const reportFile=path.join(ROOT,'imports/rehearsals',`${manifest.jobId}-local.json`);
  const report={jobId:manifest.jobId,manifest:path.relative(ROOT,manifestFile).replaceAll('\\','/'),mode:'local-pglite-only',startedAt:new Date().toISOString(),status:'running',chunks:[],brands:[],checks:[]};
  const started=performance.now();let db;
  try{
    // Validate the exact on-disk SQL and derive expectations from the full input batches.
    const wanted=new Map();const byBrand=new Map();const payloads=new Map();
    const chunks=[];
    for(const chunk of manifest.chunks){
      const sql=await fs.readFile(path.resolve(ROOT,chunk.file),'utf8');
      if(chunk.sha256)assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),chunk.sha256,`${chunk.file}: hash mismatch`);
      assert.equal(Buffer.byteLength(sql),chunk.bytes,`${chunk.file}: byte count mismatch`);
      assert.ok(Buffer.byteLength(sql)<2_000_000,`${chunk.file}: exceeds execute_sql budget`);
      const items=readyPayload(sql);assert.equal(items.length,chunk.ids.length,`${chunk.file}: payload count`);
      assert.deepEqual(items.map(x=>x.legacyId),chunk.ids,`${chunk.file}: payload identity`);
      for(const item of items){assert.ok(!payloads.has(item.legacyId),'no repeated imported identity');payloads.set(item.legacyId,item);}
      const publicationFile=chunk.publicationFile;
      assert.ok(publicationFile,`${chunk.file}: per-chunk publication file required`);
      const publication=await fs.readFile(path.resolve(ROOT,publicationFile),'utf8');
      assert.ok(chunk.atomicFile,`${chunk.file}: atomic transaction file required`);
      const atomicSql=await fs.readFile(path.resolve(ROOT,chunk.atomicFile),'utf8');
      assert.match(chunk.atomicSha256,/^[a-f0-9]{64}$/,`${chunk.atomicFile}: SHA-256 required`);
      assert.equal(crypto.createHash('sha256').update(atomicSql).digest('hex'),chunk.atomicSha256,`${chunk.atomicFile}: hash mismatch`);
      assert.equal(Buffer.byteLength(atomicSql),chunk.atomicBytes,`${chunk.atomicFile}: byte count mismatch`);
      assert.ok(chunk.atomicBytes<2_000_000,`${chunk.atomicFile}: exceeds execute_sql budget`);
      assert.equal(atomicSql,atomicPublicationSql(sql,publication),`${chunk.atomicFile}: exact draft/publication transaction envelope`);
      chunks.push({...chunk,sql,items,publicationSql:publication,atomicSql});
    }
    for(const batchEntry of manifest.batches){
      const batch=await readJson(path.resolve(ROOT,batchEntry.file));let ready=0;
      for(const product of batch.products){
        const id=stableId(batch.supplier,product.sourceId);if(!payloads.has(id))continue;
        assert.ok(!wanted.has(id),`repeated batch identity ${id}`);wanted.set(id,product);ready++;
        const brand=product.brand||batch.brand;const expected=byBrand.get(brand)||{brand,expected:0,inputProducts:0};expected.expected++;byBrand.set(brand,expected);
        assert.equal(payloads.get(id).brand,brand,`${id}: brand matches input batch`);
      }
      assert.equal(ready,batchEntry.ready,`${batchEntry.file}: manifest ready count must match the entire input batch`);
      for(const brand of new Set(batch.products.map(x=>x.brand||batch.brand))){
        const row=byBrand.get(brand);if(row)row.inputProducts+=batch.products.filter(x=>(x.brand||batch.brand)===brand).length;
      }
    }
    assert.equal(wanted.size,manifest.newProducts,'every prepared product belongs to the source batches');
    assert.equal(payloads.size,wanted.size,'no unaccounted prepared payloads');
    const ids=[...wanted.keys()];
    report.newProducts=ids.length;report.brands=[...byBrand.values()];
    progress({phase:'setup',jobId:manifest.jobId,newProducts:ids.length,chunks:chunks.length,brands:report.brands});
    db=await createDatabase();
    // The checked production taxonomy contains sewerage; older local seed fixtures do not.
    await db.exec(`insert into public.categories(stable_id,slug,parent_id,level,title,short_title,sort_order,status,visibility)
      values('sewerage','sewerage',null,1,'Каналізація та дренаж','Каналізація та дренаж',350,'active','catalog')on conflict(stable_id)do nothing;
      insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
      values('v-brand-rehearsal','local-rehearsal',
        (select coalesce(jsonb_agg(public._taxonomy_category_release_entry(c) order by c.sort_order),'[]'::jsonb)from public.categories c where c.status='active'),
        (select coalesce(jsonb_agg(public._taxonomy_brand_release_entry(b) order by b.stable_id),'[]'::jsonb)from public.brands b where b.status='active'),
        (select coalesce(jsonb_object_agg(d.stable_id,public._attributes_release_fields(d)),'{}'::jsonb)from public.attribute_definitions d where d.status='active'),
        0,0,repeat('0',64),true);
      insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,'v-brand-rehearsal')on conflict(singleton)do update set snapshot_version=excluded.snapshot_version;
      insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,'v-brand-rehearsal')on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version,revision=0;`);
    await db.exec(metadataSql());
    // Repeating additive metadata must be harmless on an already-provisioned release.
    await db.exec(metadataSql());
    if(manifest.metadata){
      const prerequisite=await fs.readFile(path.resolve(ROOT,manifest.metadata.file),'utf8');
      assert.equal(crypto.createHash('sha256').update(prerequisite).digest('hex'),manifest.metadata.sha256,'release metadata hash');
      assert.equal(Buffer.byteLength(prerequisite),manifest.metadata.bytes,'release metadata byte count');
      await db.exec(prerequisite);await db.exec(prerequisite);
      report.checks.push('release-specific-metadata-hash-and-idempotency');
    }
    const fixtureBrand=await one(db,"select internal_id from public.brands where status='active' order by stable_id limit 1");
    const fixtureCategory=await one(db,`select c.internal_id from public.categories c where c.status='active' and c.visibility='catalog'
      and not exists(select 1 from public.categories child where child.parent_id=c.internal_id and child.status='active')order by c.stable_id limit 1`);
    await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,publication_status)
      values('brand-rehearsal-sentinel','REHEARSAL-SENTINEL','brand-rehearsal-sentinel','Наявний контрольний товар','Наявний контрольний товар','REHEARSAL-SENTINEL',$1,$2,2345,'known','published')`,[fixtureBrand.internal_id,fixtureCategory.internal_id]);
    await db.query("select public._admin_refresh_catalog(array[internal_id])from public.products where legacy_id='brand-rehearsal-sentinel'");
    const sentinelBefore=(await one(db,"select to_jsonb(p) data from public.products p where legacy_id='brand-rehearsal-sentinel'")).data;
    const baseline=await one(db,'select count(*)::int n from public.products');
    report.relationBytesBefore=await relationBytes(db);
    report.checks.push('manifest-hashes-and-whole-input-coverage','metadata-applied-twice');
    for(let i=0;i<chunks.length;i++){
      const chunk=chunks[i];const start=performance.now();await db.exec(chunk.sql);
      const timing={index:i+1,products:chunk.ids.length,draftMs:elapsed(start)};
      if(i===0){
        const before=await one(db,'select count(*)::int n from public.products');
        const beforeMedia=await one(db,'select count(*)::int n from public.product_media');
        await db.exec(chunk.sql);
        assert.deepEqual(await one(db,'select count(*)::int n from public.products'),before,'first chunk idempotent products');
        assert.deepEqual(await one(db,'select count(*)::int n from public.product_media'),beforeMedia,'first chunk idempotent media');
      }
      const state=await one(db,"select count(*)::int total,count(*)filter(where publication_status='draft')::int drafts from public.products where legacy_id=any($1::text[])",[chunk.ids]);
      assert.equal(state.total,chunk.ids.length);assert.equal(state.drafts,chunk.ids.length);
      report.chunks.push(timing);progress({phase:'draft',...timing});
    }
    const draftState=await one(db,"select count(*)::int total,count(*)filter(where publication_status='draft')::int drafts from public.products where legacy_id=any($1::text[])",[ids]);
    assert.deepEqual(draftState,{total:ids.length,drafts:ids.length});
    assert.equal((await one(db,'select count(*)::int n from public.products')).n,baseline.n+ids.length,'no extra products added');
    assert.equal((await one(db,'select count(*)::int n from public.catalog_product_cards where legacy_id=any($1::text[])',[ids])).n,0,'drafts have no public cards');
    report.checks.push('all-new-products-draft','first-draft-chunk-idempotent','no-extra-product-or-media-duplicates','drafts-not-public');
    for(let i=0;i<chunks.length;i++){
      const chunk=chunks[i];const start=performance.now();await db.exec(chunk.publicationSql);
      report.chunks[i].publishMs=elapsed(start);
      if(i===0)await db.exec(chunk.publicationSql);
      const published=await one(db,"select count(*)::int n from public.products where legacy_id=any($1::text[])and publication_status='published'",[chunk.ids]);
      assert.equal(published.n,chunk.ids.length);
      progress({phase:'publish',...report.chunks[i]});
    }
    const published=await db.query(`select p.legacy_id,b.stable_id brand,p.publication_status::text status,p.amount::float8 amount,
      s.payload from public.products p join public.brands b on b.internal_id=p.brand_id
      join public.catalog_product_snapshots s on s.legacy_id=p.legacy_id and s.snapshot_version='v-brand-rehearsal'
      where p.legacy_id=any($1::text[])`,[ids]);
    assert.equal(published.rows.length,ids.length,'each expected product has one active snapshot');
    for(const product of published.rows){
      const expected=payloads.get(product.legacy_id);assert.equal(product.status,'published');
      assert.equal(product.amount,expected.amount,`${product.legacy_id}: price preserved`);
      assert.deepEqual(product.payload.sourceAttributes,expected.characteristics,`${product.legacy_id}: source characteristics preserved`);
      assert.deepEqual(product.payload.unmappedAttributes,expected.characteristics,`${product.legacy_id}: PDP characteristics preserved`);
      assert.equal(product.payload.publicationStatus,'published',`${product.legacy_id}: snapshot status published`);
    }
    const publicCards=await one(db,'select count(*)::int n from public.catalog_product_cards where legacy_id=any($1::text[])',[ids]);assert.equal(publicCards.n,ids.length);
    for(const expected of report.brands){
      const actual=published.rows.filter(p=>p.brand===expected.brand).length;expected.actual=actual;assert.equal(actual,expected.expected,`${expected.brand}: full batch count`);
    }
    const actualMedia=await one(db,'select count(*)::int n from public.product_media m join public.products p on p.internal_id=m.product_id where p.legacy_id=any($1::text[])',[ids]);
    assert.equal(actualMedia.n,[...payloads.values()].reduce((n,p)=>n+p.images.length,0),'all source images loaded once');
    const actualDocs=await one(db,'select count(*)::int n from public.product_documents d join public.products p on p.internal_id=d.product_id where p.legacy_id=any($1::text[])',[ids]);
    assert.equal(actualDocs.n,[...payloads.values()].reduce((n,p)=>n+p.documents.length,0),'all source document references loaded once');
    assert.deepEqual((await one(db,"select to_jsonb(p) data from public.products p where legacy_id='brand-rehearsal-sentinel'")).data,sentinelBefore,'sentinel whole row and price unchanged');
    report.checks.push('all-chunks-published','first-publication-chunk-idempotent','all-public-cards-present','all-source-characteristics-preserved','all-input-prices-preserved','per-brand-counts-exact','whole-sentinel-row-and-price-unchanged');
    report.checks.push('atomic-sql-hashes-bytes-and-envelope-validated');
    if(chunks.length){
      const counts=()=>one(db,`select(select count(*)::int from public.products)products,
        (select count(*)::int from public.product_media)media,(select count(*)::int from public.product_documents)documents,
        (select count(*)::int from public.catalog_product_cards)public_cards`);
      const beforeAtomic=await counts();const first=chunks[0];
      const beforeProducts=(await db.query('select to_jsonb(p) data from public.products p where legacy_id=any($1::text[])order by legacy_id',[first.ids])).rows;
      const start=performance.now();await db.exec(first.atomicSql);await db.exec(first.atomicSql);report.atomicReplayMs=elapsed(start);
      assert.deepEqual(await counts(),beforeAtomic,'atomic replay preserves product/media/document/card counts');
      assert.deepEqual((await db.query('select to_jsonb(p) data from public.products p where legacy_id=any($1::text[])order by legacy_id',[first.ids])).rows,beforeProducts,'atomic replay preserves all imported product fields and prices');
      assert.deepEqual((await one(db,"select to_jsonb(p) data from public.products p where legacy_id='brand-rehearsal-sentinel'")).data,sentinelBefore,'atomic replay preserves the unrelated sentinel whole row');
      report.checks.push('first-atomic-chunk-applied-twice','atomic-replay-no-duplicate-products-or-media','atomic-replay-imported-rows-and-prices-unchanged','atomic-replay-sentinel-unchanged');
      progress({phase:'atomic-replay',index:1,products:first.ids.length,ms:report.atomicReplayMs});
    }
    report.status='ok';report.publicCards=publicCards.n;report.imageRows=actualMedia.n;report.documentRows=actualDocs.n;
    report.relationBytesAfter=await relationBytes(db);report.relationBytesAdded=report.relationBytesAfter-report.relationBytesBefore;
    report.maxDraftMs=Math.max(0,...report.chunks.map(x=>x.draftMs));report.maxPublishMs=Math.max(0,...report.chunks.map(x=>x.publishMs));
    report.slowChunks=report.chunks.filter(x=>x.draftMs>=15000||x.publishMs>=15000);
  }catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};throw error;}
  finally{
    if(db)await db.close();report.elapsedMs=elapsed(started);report.finishedAt=new Date().toISOString();
    await fs.mkdir(path.dirname(reportFile),{recursive:true});await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
    progress({phase:'complete',status:report.status,jobId:report.jobId,newProducts:report.newProducts,elapsedMs:report.elapsedMs,maxDraftMs:report.maxDraftMs,maxPublishMs:report.maxPublishMs,atomicReplayMs:report.atomicReplayMs,slowChunks:report.slowChunks?.length,report:path.relative(ROOT,reportFile).replaceAll('\\','/')});
  }
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const input=process.argv[2];if(!input)throw new Error('Usage: node scripts/import/rehearse-brand-release.mjs <manifest.json>');
  await rehearse(input);
}
