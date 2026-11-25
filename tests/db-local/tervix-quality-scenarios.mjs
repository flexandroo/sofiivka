// Unit-quality and real-schema regression for the single published 401211 correction.
// node tests/db-local/harness.mjs tervix-quality-scenarios.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { curateTervixSpecifications } from "../../scripts/import/tervix-specification-quality.mjs";
import { SOURCE_REF, frozenTervix401211Payload, tervix401211CorrectionPlan, tervix401211CorrectionSql } from "../../scripts/import/tervix-401211-quality-fix.mjs";
const one=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0];
const root=path.resolve(import.meta.dirname,"../..");

export async function run(db) {
  const validSkus=["491932","491931","491930","491922","491921","491920","491912","491910","491911","201700","201780","201770","201760","201750"];
  for(const sku of validSkus){
    const rows=[{label:sku.startsWith("49")?"Споживча потужність клапана":"Потужність (max)",value:sku==="201700"?"5 Вт (активно), 1,1 мА (режим сну)":"5 Вт (при роботі привода) 1,1мА в режимі «сон»"}];
    const before=structuredClone(rows),curated=curateTervixSpecifications(rows,{sku});
    assert.deepEqual(curated.characteristics,rows);assert.deepEqual(curated.sourceIssues,[]);assert.deepEqual(rows,before);
  }
  const unsupported={label:"Споживана потужність",value:"> 1A"},supply={label:"Блок живлення",value:"5В, 1А"};
  const selected=curateTervixSpecifications([supply,unsupported],{sku:"401211",sourceUrl:"https://tervix.ua/example"});
  assert.deepEqual(selected.characteristics,[supply]);assert.deepEqual(selected.sourceIssues[0].originalCharacteristic,unsupported);
  assert.equal(selected.sourceIssues[0].code,"power-current-unit-mismatch");
  assert.deepEqual(curateTervixSpecifications([{label:"Струм споживання",value:"1 A"}]).sourceIssues,[]);
  assert.deepEqual(curateTervixSpecifications([{label:"Потужність",value:5,unit:"Вт"}]).sourceIssues,[]);
  assert.equal(curateTervixSpecifications([{label:"Потужність",value:1,unit:"А"}]).sourceIssues.length,1);

  const frozen=path.join(root,"imports/releases/three-brands-20261125-0f27bb511996/manifest.json");
  const payload=fs.existsSync(frozen)?frozenTervix401211Payload():{
    legacyId:"tervix-4013",sku:"401211",sourceId:"4013",sourceUrl:"https://tervix.ua/product/401211/",brand:"tervix",title:"Контролер Tervix 401211",model:"Gateway",
    description:"Контролер",shortDescription:"Контролер",fullDescription:"Контролер Tervix 401211.\n\nТехнічні параметри\nБлок живлення: 5В, 1А.\n\nСпоживана потужність: > 1A.\n\nІнша перевірена характеристика.",
    sections:[{title:"Технічні параметри",paragraphs:["Блок живлення: 5В, 1А.","Споживана потужність: > 1A.","Інша перевірена характеристика."]}],characteristics:[supply,unsupported,{label:"Стандарт",value:"ZigBee 3.0"}]
  };
  const plan=tervix401211CorrectionPlan(payload),sql=tervix401211CorrectionSql(payload);
  const brand=await one(db,"insert into public.brands(stable_id,slug,name) values('tervix','tervix','Tervix') on conflict(stable_id) do update set stable_id=excluded.stable_id returning internal_id");
  const category=await one(db,"select internal_id from public.categories where status='active' order by stable_id limit 1");
  const supplier=await one(db,"insert into public.suppliers(stable_id,name) values('tervix-quality-test','Tervix test') returning internal_id");
  const run=await one(db,"insert into public.import_runs(supplier_id,status,source_ref,records_seen,records_succeeded,metadata) values($1,'succeeded',$2,56,56,'{\"keep\":\"source statistics\"}') returning internal_id",[supplier.internal_id,SOURCE_REF]);
  const series=await one(db,"insert into public.product_series(stable_id,brand_id,slug,name,description) values('tervix-quality-series',$1,'gateway','Gateway','Preserved manual series description') returning internal_id",[brand.internal_id]);
  const product=await one(db,`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,series_id,amount,price_status,publication_status,description,short_description,full_description,description_sections,last_import_run_id)
    values('tervix-4013','401211','tervix-quality-product',$1,$1,$2,$3,$4,$5,399.5,'known','published',$6,$7,$8,$9::jsonb,$10) returning internal_id`,
    [payload.title,payload.model,brand.internal_id,category.internal_id,series.internal_id,payload.description,payload.shortDescription,payload.fullDescription,JSON.stringify(payload.sections),run.internal_id]);
  const source=await one(db,"insert into public.product_source_records(product_id,supplier_id,source_id,source_url,raw_payload,import_run_id) values($1,$2,'4013',$3,$4::jsonb,$5) returning internal_id",[product.internal_id,supplier.internal_id,payload.sourceUrl,JSON.stringify({characteristics:payload.characteristics,series:"Gateway",manualNote:"preserve",sourceEvidence:{originalEvidence:"keep"}}),run.internal_id]);
  await db.exec(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready) values('v-tervix-quality','test','[]','[]','{}',1,1,repeat('0',64),true);
    insert into public.catalog_snapshot_pointer(singleton,snapshot_version) values(true,'v-tervix-quality');
    insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version) values(true,'v-tervix-quality') on conflict(singleton) do update set base_snapshot_version=excluded.base_snapshot_version,revision=0;`);
  await db.query("select public._admin_refresh_catalog(array[$1::uuid])",[product.internal_id]);
  await db.query("update public.catalog_product_snapshots set payload=payload || jsonb_build_object('sourceAttributes',$1::jsonb,'unmappedAttributes',$1::jsonb) where legacy_id='tervix-4013'",[JSON.stringify(payload.characteristics)]);
  const protectedProduct=await one(db,"select to_jsonb(p)-'updated_at'-'full_description'-'description_sections' value from public.products p where internal_id=$1",[product.internal_id]);
  const protectedSource=await one(db,"select to_jsonb(s)-'updated_at'-'raw_payload' value from public.product_source_records s where internal_id=$1",[source.internal_id]);
  const protectedRun=await one(db,"select to_jsonb(r) value from public.import_runs r where internal_id=$1",[run.internal_id]);
  await db.exec(sql);
  const changed=await one(db,"select full_description,description_sections from public.products where internal_id=$1",[product.internal_id]);
  const raw=await one(db,"select raw_payload from public.product_source_records where internal_id=$1",[source.internal_id]);
  const snapshot=await one(db,"select payload from public.catalog_product_snapshots where legacy_id='tervix-4013' and snapshot_version='v-tervix-quality'");
  assert.equal(changed.full_description,plan.corrected.fullDescription);assert.deepEqual(changed.description_sections,plan.corrected.sections);
  assert.deepEqual(raw.raw_payload.characteristics,plan.corrected.characteristics);assert.deepEqual(raw.raw_payload.sourceEvidence.qualityCorrections,[plan.issue]);
  assert.equal(raw.raw_payload.sourceEvidence.originalEvidence,"keep");assert.equal(raw.raw_payload.manualNote,"preserve");
  assert.deepEqual(snapshot.payload.unmappedAttributes,plan.corrected.characteristics);assert.deepEqual(snapshot.payload.sourceAttributes,plan.corrected.characteristics);
  assert.equal(snapshot.payload.fullDescription,plan.corrected.fullDescription);assert.deepEqual(snapshot.payload.descriptionSections,plan.corrected.sections);
  assert.deepEqual(await one(db,"select to_jsonb(p)-'updated_at'-'full_description'-'description_sections' value from public.products p where internal_id=$1",[product.internal_id]),protectedProduct);
  assert.deepEqual(await one(db,"select to_jsonb(s)-'updated_at'-'raw_payload' value from public.product_source_records s where internal_id=$1",[source.internal_id]),protectedSource);
  assert.deepEqual(await one(db,"select to_jsonb(r) value from public.import_runs r where internal_id=$1",[run.internal_id]),protectedRun);
  const first=await one(db,"select to_jsonb(p) value from public.products p where internal_id=$1",[product.internal_id]);
  await db.exec(sql);assert.deepEqual(await one(db,"select to_jsonb(p) value from public.products p where internal_id=$1",[product.internal_id]),first);
  await assert.rejects(db.exec(tervix401211CorrectionSql(payload,"wrong-import-run")),/exact published import-owned/);await db.exec("rollback;");
  await db.query("update public.products set full_description=full_description || ' manual edit' where internal_id=$1",[product.internal_id]);
  const edited=await one(db,"select to_jsonb(p) value from public.products p where internal_id=$1",[product.internal_id]);
  await assert.rejects(db.exec(sql),/original values changed/);await db.exec("rollback;");
  assert.deepEqual(await one(db,"select to_jsonb(p) value from public.products p where internal_id=$1",[product.internal_id]),edited);
  console.log(JSON.stringify({status:"ok",checks:"tervix-specification-quality",powerWithCurrentCases:15,validMixedCasesPreserved:14,suppressed:1,realSchemaCorrection:true,sourceEvidencePreserved:true,protectedPriceTitleSeriesAndRunStats:true,idempotent:true,ownershipAndOriginalValueGuards:true}));
}
