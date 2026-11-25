// Real-schema PGlite coverage of source enrichment inside the atomic draft/publication flow.
// Run: node tests/db-local/harness.mjs brand-enrichment-scenarios.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { enrichmentSql } from "../../scripts/import/brand-enrichment.mjs";
import { readyPayload, splitDraftSql, publicationSql, atomicPublicationSql } from "../../scripts/import/prepare-brand-release.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
const state = async (db, legacyId) => one(db, `select to_jsonb(product) product,
  (select jsonb_agg(to_jsonb(source) order by source.internal_id) from public.product_source_records source where source.product_id=product.internal_id) sources
  from public.products product where product.legacy_id=$1`, [legacyId]);

export async function run(db) {
  const brands = (await db.query("select internal_id,stable_id,name from public.brands where status='active' order by stable_id limit 2")).rows;
  assert.equal(brands.length, 2);
  const category = await one(db, `select c.internal_id,c.stable_id from public.categories c where c.status='active' and c.visibility='catalog'
    and not exists(select 1 from public.categories child where child.parent_id=c.internal_id and child.status='active') order by c.stable_id limit 1`);
  const supplier = await one(db, "insert into public.suppliers(stable_id,name) values('brand-enrichment-test','Тестовий постачальник') returning internal_id");
  const ownedRef = "enrichment/'quoted\\reference/$brand_enrichment_do$";
  const ownedRun = await one(db, "insert into public.import_runs(supplier_id,status,source_ref) values($1,'succeeded',$2) returning internal_id", [supplier.internal_id, ownedRef]);
  const foreignRun = await one(db, "insert into public.import_runs(supplier_id,status,source_ref) values($1,'succeeded','foreign-run') returning internal_id", [supplier.internal_id]);
  const existingSeries = [];
  for (let i = 0; i < 2; i += 1) existingSeries.push(await one(db, `insert into public.product_series(stable_id,brand_id,slug,name,description)
    values($1,$2,'alpha','Alpha','Ручний опис серії зберігається') returning *`, [`enrich-series-${i}`, brands[i].internal_id]));
  const manual = await one(db, `insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,publication_status,series_id)
    values('enrich-manual','ENRICH-MANUAL','enrich-manual','Ручний товар','Ручний товар','Manual',$1,$2,1499,'known','published',$3) returning internal_id`, [brands[0].internal_id,category.internal_id,existingSeries[0].internal_id]);
  await db.query(`insert into public.product_source_records(product_id,supplier_id,source_id,raw_payload,import_run_id)
    values($1,$2,'manual-source','{"characteristics":[{"label":"Ручна характеристика","value":"Зберегти"}],"manualNote":"Не змінювати"}',$3)`, [manual.internal_id,supplier.internal_id,foreignRun.internal_id]);
  const manualBefore = await state(db, "enrich-manual");
  const seriesBefore = (await db.query("select to_jsonb(s) value from public.product_series s where internal_id=any($1::uuid[]) order by stable_id", [existingSeries.map(s => s.internal_id)])).rows;

  // A real draft/source pair proves both ownership guards and exact metadata merge semantics.
  const guard = await one(db, `insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,last_import_run_id)
    values('enrich-guard','ENRICH-GUARD','enrich-guard','Тестовий товар','Тестовий товар','Guard',$1,$2,$3) returning internal_id`, [brands[0].internal_id,category.internal_id,ownedRun.internal_id]);
  const characteristics = [{ label: "Діаметр", value: "16 мм" }];
  const source = await one(db, `insert into public.product_source_records(product_id,supplier_id,source_id,raw_payload,import_run_id)
    values($1,$2,'guard-source',$3::jsonb,$4) returning internal_id`, [guard.internal_id,supplier.internal_id,JSON.stringify({ characteristics, manualNote: "Залишити" }),ownedRun.internal_id]);
  const original = { sourceEvidence: { quote: "' \\ $brand_enrichment_do$; drop table public.products; --", url: "https://manufacturer.test/product" }, series: "Alpha", priceCurrency: "EUR", vatIncluded: false, related: ["OTHER-1"], ean: "0012345678905", characteristics: [{ label: "НЕ ПЕРЕПИСАТИ", value: "ignored" }] };
  const row = { legacyId: "enrich-guard", sourceId: "guard-source", sku: "ENRICH-GUARD", brand: brands[0].stable_id, original };
  const sql = enrichmentSql([row], ownedRef);
  assert.doesNotMatch(sql, /^begin;|^commit;/mi);
  await db.exec(sql);
  const merged = await one(db, "select raw_payload from public.product_source_records where internal_id=$1", [source.internal_id]);
  assert.deepEqual(merged.raw_payload.characteristics, characteristics);
  assert.equal(merged.raw_payload.manualNote, "Залишити");
  for (const key of ["sourceEvidence","series","priceCurrency","vatIncluded","related","ean"]) assert.deepEqual(merged.raw_payload[key], original[key]);
  assert.equal((await one(db, "select series_id from public.products where internal_id=$1", [guard.internal_id])).series_id,existingSeries[0].internal_id);
  const once = await state(db, "enrich-guard");
  await db.exec(sql);
  assert.deepEqual(await state(db, "enrich-guard"), once, "idempotent reruns do not touch timestamps, characteristics or metadata");

  const refused = async (rows, ref, pattern) => {
    const before = await state(db,"enrich-guard");
    await assert.rejects(db.exec(enrichmentSql(rows,ref)),pattern);
    assert.deepEqual(await state(db,"enrich-guard"),before);
  };
  await refused([row], "foreign-run", /not owned by/);
  await refused([{ ...row, legacyId: "enrich-manual", sku: "ENRICH-MANUAL", sourceId: "manual-source" }], ownedRef, /not owned by/);
  await refused([{ ...row, original: { ...original, ean: "changed" } }], ownedRef, /already differs/);
  await db.query("update public.product_source_records set import_run_id=$1 where internal_id=$2",[foreignRun.internal_id,source.internal_id]);
  await refused([row],ownedRef,/source record.*not owned/);
  await db.query("update public.product_source_records set import_run_id=$1 where internal_id=$2",[ownedRun.internal_id,source.internal_id]);
  assert.throws(() => enrichmentSql([row,row],ownedRef),/Duplicate/);
  assert.throws(() => enrichmentSql([{ ...row, original: { ean: "\0" } }],ownedRef),/NUL/);

  // Real import-check output + enrichment + publication run inside ONE SQL transaction.
  await db.exec(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
    values('v-brand-enrichment','test','[]','[]','{}',2,1,repeat('0',64),true);
    insert into public.catalog_snapshot_pointer(singleton,snapshot_version) values(true,'v-brand-enrichment');
    insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version) values(true,'v-brand-enrichment')
      on conflict(singleton) do update set base_snapshot_version=excluded.base_snapshot_version,revision=0;`);
  const reference = (await one(db,fs.readFileSync(path.join(ROOT,"scripts/import/reference.sql"),"utf8"))).reference;
  fs.mkdirSync(path.join(ROOT,"tmp"),{ recursive:true });
  const directory=fs.mkdtempSync(path.join(ROOT,"tmp/brand-enrichment-test-"));
  const image="assets/products/general-fittings/"+fs.readdirSync(path.join(ROOT,"assets/products/general-fittings")).find(name=>name.endsWith(".webp"));
  const names=["Alpha","Alpha","Gamma 'quoted' \\ $brand_enrichment_do$","Alpha!",null];
  const originals=names.map((series,index)=>({ sourceId:`atomic-${index}`,sourceUrl:`https://manufacturer.test/atomic-${index}`,sourceCategory:"Офіційний каталог",
    sku:`ENRICH-ATOMIC-${index}`,model:`ENRICH-ATOMIC-${index}`,title:`Фітинг ${brands[index===1?1:0].name} ENRICH-ATOMIC-${index}`,brand:brands[index===1?1:0].stable_id,category:category.stable_id,price:null,
    shortDescription:"З’єднання для трубопровідної системи.",description:`Фітинг ${brands[index===1?1:0].name} ENRICH-ATOMIC-${index} використовується для монтажу трубопровідної системи. Розмір і виконання перевіряють за технічним паспортом виробника перед установленням.`,
    characteristics,filters:{},images:[image],documents:[],series,sourceEvidence:{manufacturer:"https://manufacturer.test",index},priceCurrency:"UAH",vatIncluded:null,related:[],ean:null }));
  const batchFile=path.join(directory,"batch.json");
  fs.writeFileSync(batchFile,JSON.stringify({ supplier:"brand-enrichment-atomic",supplierName:"Тестовий виробник",collectedAt:"2026-11-25",sourceSite:"https://manufacturer.test",products:originals }));
  const referenceFile=path.join(directory,"reference.json"); fs.writeFileSync(referenceFile,JSON.stringify(reference));
  const checked=JSON.parse(execFileSync(process.execPath,["scripts/import-check.mjs",batchFile,`--reference=${referenceFile}`,"--check-links"],{cwd:ROOT,encoding:"utf8"}));
  assert.equal(checked.blocked,0); assert.equal(checked.ready,5);
  const generated=fs.readFileSync(batchFile.replace(/\.json$/,".sql"),"utf8");
  const [chunk]=splitDraftSql(generated,{jobId:"enrichment-atomic",batchName:"batch.json"});
  const rows=readyPayload(chunk.sql).map(item=>({ ...item,original:originals.find(p=>p.sku===item.sku) }));
  const body=enrichmentSql(rows,chunk.sourceRef);
  const draft=chunk.sql.replace(/\ncommit;\s*$/i,`\n${body}\n${body}\ncommit;\n`);
  const atomic=atomicPublicationSql(draft,publicationSql([chunk]));
  await db.exec(atomic);
  const imported=(await db.query(`select p.legacy_id,p.series_id,p.publication_status::text status,p.amount,s.name series_name,s.brand_id series_brand,p.brand_id,
      source.raw_payload,snapshot.payload snapshot from public.products p
    left join public.product_series s on s.internal_id=p.series_id
    join public.product_source_records source on source.product_id=p.internal_id
    join public.catalog_product_snapshots snapshot on snapshot.legacy_id=p.legacy_id and snapshot.snapshot_version='v-brand-enrichment'
    where p.legacy_id=any($1::text[]) order by p.sku`,[chunk.ids])).rows;
  assert.equal(imported.length,5);
  for(let index=0;index<imported.length;index+=1){
    const product=imported[index];assert.equal(product.status,"published");assert.equal(product.amount,null);
    assert.equal(product.series_name,names[index]);
    if(names[index])assert.equal(product.series_brand,product.brand_id);else assert.equal(product.series_id,null);
    assert.deepEqual(product.raw_payload.characteristics,characteristics);
    assert.deepEqual(product.raw_payload.sourceEvidence,originals[index].sourceEvidence);
    assert.deepEqual(product.snapshot.unmappedAttributes,characteristics);
    if(index<2) assert.equal(product.series_id,existingSeries[index].internal_id);
  }
  assert.equal((await one(db,"select count(*)::int n from public.catalog_product_cards where legacy_id=any($1::text[])",[chunk.ids])).n,5);
  assert.deepEqual(await state(db,"enrich-manual"),manualBefore,"old manual product, price and provenance stay byte-for-byte unchanged");
  assert.deepEqual((await db.query("select to_jsonb(s) value from public.product_series s where internal_id=any($1::uuid[]) order by stable_id",[existingSeries.map(s=>s.internal_id)])).rows,seriesBefore,"manual series content is never overwritten");
  assert.equal((await one(db,"select count(*)::int n from public.product_series where brand_id=$1 and name=$2",[brands[0].internal_id,names[2]])).n,1);
  assert.equal((await one(db,"select count(*)::int n from public.product_series where brand_id=$1 and name='Alpha!'",[brands[0].internal_id])).n,1,"same-slug different-name series gets an independent identity");
  const createdSeries=await one(db,"select stable_id from public.product_series where brand_id=$1 and name=$2",[brands[0].internal_id,names[2]]);
  const expectedHash=await one(db,"select substr(md5($1 || ':' || lower($2)),1,12) value",[brands[0].stable_id,names[2]]);
  assert.ok(createdSeries.stable_id.endsWith(expectedHash.value),"public series identity depends on the stable brand ID and name, not database-specific UUIDs");
  const publishedBefore=await Promise.all(chunk.ids.map(id=>state(db,id)));
  await db.exec(atomic);
  assert.deepEqual(await Promise.all(chunk.ids.map(id=>state(db,id))),publishedBefore,"a completed atomic release replays as verify-only for published products");
  const firstOwned=await one(db,"select internal_id from public.products where legacy_id=$1",[chunk.ids[0]]);
  await db.query("update public.product_source_records set raw_payload=jsonb_set(raw_payload,'{sourceEvidence}','{\"manual\":true}') where product_id=$1",[firstOwned.internal_id]);
  const editedMetadata=await state(db,chunk.ids[0]);
  await assert.rejects(db.exec(body),/already differs|published metadata/);
  assert.deepEqual(await state(db,chunk.ids[0]),editedMetadata,"published provenance edits are refused, never overwritten");
  await db.query("update public.product_source_records set raw_payload=jsonb_set(raw_payload,'{sourceEvidence}',$1::jsonb) where product_id=$2",[JSON.stringify(originals[0].sourceEvidence),firstOwned.internal_id]);
  await db.query("update public.products set series_id=$1 where internal_id=$2",[existingSeries[1].internal_id,firstOwned.internal_id]);
  const editedSeries=await state(db,chunk.ids[0]);
  await assert.rejects(db.exec(body),/published series.*differs/);
  assert.deepEqual(await state(db,chunk.ids[0]),editedSeries,"published series edits are refused, never overwritten");
  assert.equal((await one(db,"select count(*)::int n from public.products where legacy_id='enrich-manual'")).n,1,"quoted source text cannot execute SQL");
  console.log(JSON.stringify({status:"ok",checks:"brand-enrichment",atomicProducts:5,ownershipRefusals:4,publishedTamperRefusals:2,seriesBrandIsolation:true,deterministicPublicIds:true,idempotent:true,publishedReplay:true,manualRowsPreserved:true}));
}
