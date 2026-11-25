// Local-only proof of bounded brand imports, idempotency and import-owned publication.
// node tests/db-local/harness.mjs brand-release-scenarios.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {splitDraftSql,publicationSql,readyPayload,prepareRelease} from '../../scripts/import/prepare-brand-release.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const one=async(db,sql,params=[])=>(await db.query(sql,params)).rows[0];
export async function run(db){
  const brand=await one(db,"select internal_id,stable_id,name from public.brands where status='active' order by stable_id limit 1");
  const category=await one(db,`select c.internal_id,c.stable_id from public.categories c where c.status='active' and c.visibility='catalog'
    and not exists(select 1 from public.categories child where child.parent_id=c.internal_id and child.status='active') order by c.stable_id limit 1`);
  await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,publication_status)
    values('brand-release-old','BR-OLD','brand-release-old','Наявний товар','Наявний товар','BR-OLD',$1,$2,1999,'known','published')`,[brand.internal_id,category.internal_id]);
  await db.exec(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
    values('v-brand-release','test','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,1,1,repeat('0',64),true);
    insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,'v-brand-release')on conflict(singleton)do update set snapshot_version=excluded.snapshot_version;
    insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,'v-brand-release')on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version,revision=0;
    select public._admin_refresh_catalog(array_agg(internal_id))from public.products;`);
  const before=(await one(db,"select to_jsonb(p) row from public.products p where sku='BR-OLD'")).row;
  const reference=(await one(db,fs.readFileSync(path.join(root,'scripts/import/reference.sql'),'utf8'))).reference;
  fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'tmp/brand-release-test-'));
  try{
    const picture='assets/products/tervix/'+fs.readdirSync(path.join(root,'assets/products/tervix')).find(x=>x.endsWith('.webp'));
    const product=(sku,n)=>({sourceId:sku,sourceUrl:`https://example.test/${sku}`,sourceCategory:'Тестові компоненти',sku,model:sku,
      brand:brand.stable_id,title:`Компонент ${brand.name} ${sku}`,category:category.stable_id,price:1000+n,
      shortDescription:'Компонент інженерної системи.',description:`Компонент ${brand.name} ${sku} призначений для перевірки імпорту інженерного каталогу. Технічні дані та зображення зберігаються разом із джерелом.`,
      sections:[{title:'Застосування',paragraphs:['Перевірка локального імпорту.']}],characteristics:[{label:'Матеріал',value:'Латунь'}],filters:{},images:[picture],documents:[]});
    const batch={supplier:'brand-release-test',supplierName:'Локальний тест',sourceSite:'https://example.test',collectedAt:'2026-11-25',products:[product('BR-NEW-1',1),product('BR-NEW-2',2),{...product('BR-OLD',0),price:777}]};
    const batchFile=path.join(directory,'batch.json');const referenceFile=path.join(directory,'reference.json');
    fs.writeFileSync(batchFile,JSON.stringify(batch));fs.writeFileSync(referenceFile,JSON.stringify(reference));
    const result=JSON.parse(execFileSync(process.execPath,['scripts/import-check.mjs',batchFile,`--reference=${referenceFile}`],{cwd:root,encoding:'utf8'}));
    assert.deepEqual([result.total,result.existing,result.ready,result.blocked,result.priceChanges],[3,1,2,0,1]);
    const metadataFile=path.join(directory,'metadata.sql');const prerequisite='-- Local metadata fixture\nbegin;\nselect 1;\ncommit;\n';
    fs.writeFileSync(metadataFile,prerequisite);
    assert.throws(()=>prepareRelease([batchFile],{jobPrefix:'../unsafe'}),/Unsafe release job prefix/);
    const prepared=prepareRelease([batchFile],{reference:referenceFile,jobPrefix:'local-metadata-test',metadataFile});
    assert.equal(prepared.metadata.sha256,createHash('sha256').update(prerequisite).digest('hex'));
    assert.equal(prepared.metadata.bytes,Buffer.byteLength(prerequisite));
    assert.equal(prepared.newProducts,2);assert.ok(prepared.jobId.startsWith('local-metadata-test-'));
    assert.ok(prepared.chunks.every(chunk=>chunk.sourceRef.startsWith(prepared.jobId+'/')));
    const expectedDigest=createHash('sha256').update(fs.readFileSync(batchFile)).update('\0metadata\0').update(prerequisite).digest('hex').slice(0,12);
    assert.equal(prepared.jobId,`local-metadata-test-${expectedDigest}`,'metadata is part of the immutable release identity');
    const sql=fs.readFileSync(path.join(directory,'batch.sql'),'utf8');
    assert.equal(readyPayload(sql).length,2);
    const chunks=splitDraftSql(sql,{jobId:'local-brand-release',batchName:'batch.json',size:1,maxBytes:1_500_000});
    assert.equal(chunks.length,2);assert.ok(chunks.every(x=>x.ids.length===1&&Buffer.byteLength(x.sql)<=1_500_000));
    assert.equal(new Set(chunks.map(x=>x.sourceRef)).size,2);
    for(const chunk of chunks){await db.exec(chunk.sql);await db.exec(chunk.sql);}
    assert.deepEqual((await db.query("select sku,publication_status::text status,amount::float8 amount from public.products where sku like 'BR-NEW-%' order by sku")).rows,[
      {sku:'BR-NEW-1',status:'draft',amount:1001},{sku:'BR-NEW-2',status:'draft',amount:1002}]);
    assert.equal((await one(db,"select count(*)::int n from public.product_media m join public.products p on p.internal_id=m.product_id where p.sku like 'BR-NEW-%'")).n,2,'repeated chunks do not duplicate media');
    await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,publication_status)
      values('brand-release-unrelated','BR-UNRELATED','brand-release-unrelated','Інша чернетка','Інша чернетка','BR-UNRELATED',$1,$2,333,'known','draft')`,[brand.internal_id,category.internal_id]);
    await db.exec(publicationSql([chunks[0]]));
    assert.deepEqual((await db.query("select sku,publication_status::text status from public.products where sku like 'BR-NEW-%' order by sku")).rows,[{sku:'BR-NEW-1',status:'published'},{sku:'BR-NEW-2',status:'draft'}]);
    await assert.rejects(db.exec(publicationSql([{...chunks[1],sourceRef:'a-different-import'}])),/Publication refused/);
    await db.exec('rollback');
    assert.equal((await one(db,"select publication_status::text status from public.products where sku='BR-NEW-2'")).status,'draft');
    await db.exec(publicationSql([chunks[0]]));await db.exec(publicationSql([chunks[1]]));await db.exec(publicationSql([chunks[1]]));
    assert.equal((await one(db,"select count(*)::int n from public.products where sku like 'BR-NEW-%' and publication_status='published'")).n,2);
    assert.equal((await one(db,"select count(*)::int n from public.catalog_product_cards where legacy_id=any($1::text[])",[chunks.flatMap(x=>x.ids)])).n,2,'both published products have public cards');
    assert.equal((await one(db,"select publication_status::text status from public.products where sku='BR-UNRELATED'")).status,'draft');
    assert.deepEqual((await one(db,"select to_jsonb(p) row from public.products p where sku='BR-OLD'")).row,before,'all original product columns including price remain identical');
    assert.throws(()=>splitDraftSql(sql,{jobId:'x',batchName:'batch.json',maxBytes:1}),/single product exceeds/);
    const payload=readyPayload(sql);const colliding=sql.replace(JSON.stringify(payload),JSON.stringify([payload[0],{...payload[1],legacyId:payload[0].legacyId}]));
    assert.throws(()=>splitDraftSql(colliding,{jobId:'x',batchName:'batch.json'}),/legacy IDs collide/);
    assert.throws(()=>publicationSql([chunks[0],chunks[0]]),/colliding product IDs/);
    console.log(JSON.stringify({status:'ok',checks:'brand-release-safety',draftChunks:2,tests:['existing-row-and-price-unchanged','two-new-products-only','draft-import-idempotency','media-not-duplicated','per-chunk-publication','publication-source-ownership','publication-idempotency','unrelated-draft-preserved','public-read-model','request-budget','identity-collision']}));
  }finally{
    const resolved=path.resolve(directory);const allowed=path.resolve(root,'tmp')+path.sep;
    if(!resolved.startsWith(allowed)||!path.basename(resolved).startsWith('brand-release-test-'))throw new Error('Unsafe test-fixture cleanup target');
    fs.rmSync(resolved,{recursive:true,force:true});
    await db.close();
  }
}
