// Local real-schema proof for separate manufacturer-claim plans. No hosted connections.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createDatabase} from './database.mjs';
import {claimProducts,claimRepairChunkSql,prepareClaimRepair,runtimeClaimItems} from '../../scripts/audit/prepare-manufacturer-claim-repair.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=async file=>JSON.parse(await fs.readFile(path.resolve(ROOT,file),'utf8'));
const one=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0];
const hash=value=>createHash('sha256').update(value).digest('hex');
const semantic=value=>{const copy=structuredClone(value);delete copy.updated_at;return copy;};
const ORDERS={products:'internal_id',product_attribute_values:'product_id,attribute_id',product_source_records:'internal_id',product_source_attributes:'internal_id',product_price_sources:'product_id',product_media:'internal_id',product_documents:'internal_id',product_categories:'product_id,category_id',catalog_product_snapshots:'snapshot_version,legacy_id',catalog_product_cards:'snapshot_version,legacy_id'};

async function run(planFile){
 const rawPlan=await fs.readFile(path.resolve(ROOT,planFile),'utf8'),plan=JSON.parse(rawPlan),items=claimProducts(plan),planSha256=hash(rawPlan),records=[],pages=new Map();
 let earlierSignedPlan;
 let priorHeads;
 if(plan.requiresHeadPlanSha256){
  const file=path.join(path.dirname(path.resolve(ROOT,planFile)),'correction-plan.json'),bytes=await fs.readFile(file);
  assert.equal(hash(bytes),plan.requiresHeadPlanSha256,'The prerequisite head plan hash changed');priorHeads=JSON.parse(bytes);assert.equal(priorHeads.jobId,plan.requiresJobId);
 }
 const started=performance.now(),db=await createDatabase();
 const compactRuntime=items.some(item=>item.expectedBrand==='general-fittings');
 const options={activeVersion:plan.activeVersion,planSha256,jobId:plan.jobId,productCount:items.length+1,compactRuntime};
 try{
  await db.exec("set timezone='UTC'");
  for(const item of items){
   assert.ok(item.sourceBackup?.file&&Number.isInteger(item.sourceBackup.rowIndex),'Each local case requires its frozen full source backup location');
   const backupFile=/[/\\]/.test(item.sourceBackup.file)?item.sourceBackup.file:`backups/overnight-2026-11-26/live/${item.sourceBackup.file}`;
   if(!pages.has(backupFile))pages.set(backupFile,await read(backupFile));
   const entry=pages.get(backupFile).rows[item.sourceBackup.rowIndex],record=JSON.parse(entry.row_json??Buffer.from(entry.row_base64,'base64').toString('utf8'));
   assert.equal(record.product.internal_id,item.internalId);assert.equal(record.product.legacy_id,item.id);
   for(const sourceChange of item.sourceChanges){
    const source=record.sources.find(s=>s.internal_id===sourceChange.sourceRecordId);assert.ok(source);
    if(JSON.stringify(source.raw_payload.characteristics)!==JSON.stringify(sourceChange.oldCharacteristics)){
     assert.equal(sourceChange.proofKind,'rehau-max-scalar-contradiction','An unrecorded prior source mutation cannot be assumed');
     earlierSignedPlan??=await read('imports/overnight-audit/catalog-repair-plan.json');
     const prior=earlierSignedPlan.products.flatMap(p=>p.sourceChanges).find(s=>s.sourceRecordId===sourceChange.sourceRecordId);
     assert.ok(prior);assert.deepEqual(source.raw_payload.characteristics,prior.oldCharacteristics);assert.deepEqual(sourceChange.oldCharacteristics,prior.newCharacteristics);
     source.raw_payload.characteristics=structuredClone(prior.newCharacteristics);
    }
   }
   // Reproduce the exact earlier approved head plan, then verify every staged old copy value.
   const priorHead=priorHeads?.products.find(product=>product.id===item.id);
   for(const change of priorHead?.productChanges??[])record.product[change.field]=structuredClone(change.new);
   for(const change of item.productChanges)assert.deepEqual(record.product[change.field],change.old,'A claim old value is not the proven post-head baseline');
   records.push(record);
  }
  const manifest=await prepareClaimRepair({planFile,outputDir:`tmp/manufacturer-claim-test/${plan.jobId}${compactRuntime?'-compact':''}`,compactRuntime});
  if(compactRuntime)for(const[item,index]of items.map((item,index)=>[item,index])){
   const compact=runtimeClaimItems([item])[0];assert.deepEqual(compact.guardProduct,item.guardProduct);
   item.sourceChanges.forEach((source,i)=>{assert.deepEqual(compact.sourceChanges[i].authorityGuards,source.authorityGuards);assert.deepEqual(compact.sourceChanges[i].oldCharacteristics,source.oldCharacteristics);assert.deepEqual(compact.sourceChanges[i].newCharacteristics,source.newCharacteristics);});
   item.displayChanges.forEach((display,i)=>display.paths.forEach((scoped,j)=>assert.deepEqual(compact.displayChanges[i].paths[j],scoped)));
  }
  assert.deepEqual(manifest.chunks.flatMap(c=>c.ids),items.map(p=>p.id));
  const byId=new Map(items.map(p=>[p.id,p]));
  for(const chunk of manifest.chunks)for(const direction of ['apply','rollback']){
   const bytes=await fs.readFile(path.resolve(ROOT,direction==='apply'?chunk.file:chunk.rollbackFile));assert.ok(bytes.length<650000&&chunk.products<=50);
   assert.equal(hash(bytes),direction==='apply'?chunk.sha256:chunk.rollbackSha256);
   assert.equal(bytes.toString(),claimRepairChunkSql(chunk.ids.map(id=>byId.get(id)),{...options,productCount:19629,direction}));
   assert.equal(bytes.toString().split('perform public._admin_refresh_catalog(').length-1,1,'Exactly one explicit catalogue refresh is allowed');
  }
  const columns=new Map();
  async function insert(table,rows){
   if(!rows.length)return;if(!columns.has(table)){const{rows:fields}=await db.query(`select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped and attgenerated=''order by attnum`,[`public.${table}`]);columns.set(table,fields.map(f=>'"'+f.attname.replaceAll('"','""')+'"').join(','));}
   const names=columns.get(table);for(let offset=0;offset<rows.length;offset+=100)await db.query(`insert into public.${table}(${names})select ${names}from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,[JSON.stringify(rows.slice(offset,offset+100))]);
  }
  const sources=records.flatMap(r=>r.sources),attributes=records.flatMap(r=>r.attributes),users=new Set();
  for(const record of records)for(const row of [record.product,...record.sources,...record.attributes])for(const key of ['created_by','updated_by'])if(row[key])users.add(row[key]);
  for(const id of users)await db.query('insert into auth.users(id)values($1)on conflict do nothing',[id]);
  for(const item of items){
   const existing=await one(db,'select internal_id from public.brands where stable_id=$1',[item.expectedBrand]);
   if(existing&&existing.internal_id!==item.guardProduct.brand_id)await db.query('delete from public.brands where internal_id=$1',[existing.internal_id]);
   await db.query(`insert into public.brands(internal_id,stable_id,slug,name,status)values($1,$2,$2,$2,'active')on conflict(internal_id)do nothing`,[item.guardProduct.brand_id,item.expectedBrand]);
  }
  for(const id of new Set(records.map(r=>r.product.primary_category_id)))await db.query(`insert into public.categories(internal_id,stable_id,slug,title,level,status)values($1,$2,$2,$2,1,'active')on conflict(internal_id)do nothing`,[id,'qa-'+id]);
  for(const id of new Set(sources.map(s=>s.supplier_id)))await db.query(`insert into public.suppliers(internal_id,stable_id,name,active)values($1,$2,$2,true)on conflict(internal_id)do nothing`,[id,'qa-'+id]);
  const runs=new Map();for(const source of sources)if(source.import_run_id)runs.set(source.import_run_id,source.supplier_id);
  for(const record of records)if(record.product.last_import_run_id&&!runs.has(record.product.last_import_run_id))runs.set(record.product.last_import_run_id,sources[0].supplier_id);
  for(const[id,supplierId]of runs)await db.query(`insert into public.import_runs(internal_id,supplier_id,status)values($1,$2,'succeeded')on conflict(internal_id)do nothing`,[id,supplierId]);
  for(const record of records)if(record.product.series_id)await db.query(`insert into public.product_series(internal_id,stable_id,brand_id,slug,name)values($1,$2,$3,$2,$2)on conflict(internal_id)do nothing`,[record.product.series_id,'qa-'+record.product.series_id,record.product.brand_id]);
  const definitions=new Map();for(const row of attributes)if(!definitions.has(row.attribute_id))definitions.set(row.attribute_id,row);
  for(const[id,row]of definitions)await db.query(`insert into public.attribute_definitions(internal_id,stable_id,label,value_type)values($1,$2,$2,$3::public.attribute_value_type)on conflict(internal_id)do nothing`,[id,'qa-'+id,row.option_id?'select':row.value_number!==null?'number':row.value_boolean!==null?'boolean':'string']);
  const optionsSeen=new Set();for(const row of attributes)if(row.option_id&&!optionsSeen.has(row.option_id)){optionsSeen.add(row.option_id);await db.query(`insert into public.attribute_options(internal_id,attribute_id,value,label)values($1,$2,$3,$3)on conflict(internal_id)do nothing`,[row.option_id,row.attribute_id,'qa-'+row.option_id]);}
  const pricePlan=await read('imports/overnight-prices/price-plan.json'),prices=new Map(pricePlan.rows.map(row=>[row.legacyId,row.target]));
  const products=records.map(record=>{const p=structuredClone(record.product),price=prices.get(p.legacy_id);if(price){p.amount=price.amount;p.old_amount=price.oldAmount;p.currency=price.currency;p.price_status=price.priceStatus;}return p;});
  await insert('products',products);await insert('product_source_records',sources);await insert('product_attribute_values',attributes);
  const sentinel={...products[0],internal_id:'00000000-0000-4000-8000-000000000002',legacy_id:'qa-mixed-thread-sentinel',sku:'qa-mixed-thread-sentinel',slug:'qa-mixed-thread-sentinel',title:'Genuine mixed-thread sentinel',amount:99999,old_amount:null,price_status:'known'};
  await insert('products',[sentinel]);
  const sentinelSource={...sources[0],internal_id:'00000000-0000-4000-8000-000000000003',product_id:sentinel.internal_id,source_id:sentinel.sku,
   raw_payload:{sourceEvidence:{manufacturerDescription:'FEMALE STRAIGHT UNION BALL VALVE',original:'preserve'},characteristics:[{label:'Виконання',value:'Внутрішня різьба; Зовнішня різьба'}]}};
  await insert('product_source_records',[sentinelSource]);
  await db.query(`update public.products set amount=77777,old_amount=null,price_status='known'where internal_id=$1`,[products[0].internal_id]);
  await db.query(`insert into public.product_price_sources(product_id,base_amount,currency,vat_included,source,source_ref)values($1,77777,'UAH',null,'Preserved list','after-source-backup')`,[products[0].internal_id]);
  await db.query(`insert into public.product_media(product_id,url,role)values($1,'/assets/products/qa/claim.webp','primary')`,[products[0].internal_id]);
  await db.query(`insert into public.product_documents(product_id,title,url)values($1,'Preserved manufacturer PDF','/assets/products/qa/claim.pdf')`,[products[0].internal_id]);
  await db.query(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)values($1,'claim-qa','[]','[]','{}',$2,$2,repeat('0',64),true)`,[plan.activeVersion,options.productCount]);
  await db.query(`insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,$1)`,[plan.activeVersion]);
  await db.query(`insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,$1)on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version,revision=0`,[plan.activeVersion]);
  let ordinal=0;for(const item of items){const payload={id:item.id,source:{supplier:'original',sourceId:item.sourceChanges[0].sourceId}};
   for(const display of item.displayChanges)for(const scoped of display.paths){if(scoped.path.length===1)payload[scoped.path[0]]=scoped.oldRows;else payload.source.characteristics=scoped.oldRows;}
   await db.query(`insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload)values($1,$2,$3,$4)`,[plan.activeVersion,item.id,ordinal++,payload]);
  }
  await db.query(`insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload)values($1,$2,$3,$4)`,[plan.activeVersion,sentinel.legacy_id,ordinal,{id:sentinel.legacy_id,source:{supplier:'mixed'},sourceAttributes:sentinelSource.raw_payload.characteristics,unmappedAttributes:sentinelSource.raw_payload.characteristics}]);
  for(let offset=0;offset<products.length;offset+=50)await db.query('select public._admin_refresh_catalog($1::uuid[])',[products.slice(offset,offset+50).map(p=>p.internal_id)]);
  await db.query('select public._admin_refresh_catalog(array[$1::uuid])',[sentinel.internal_id]);
  async function state(){const out={};for(const[table,order]of Object.entries(ORDERS)){const{rows}=await db.query(`select to_jsonb(t)row from public.${table}t order by ${order}`.replace(`${table}t `,`${table} t `));out[table]=rows.map(row=>semantic(row.row));}return out;}
  async function exec(direction='apply'){for(const chunk of direction==='apply'?manifest.chunks:[...manifest.chunks].reverse()){
   const sql=await fs.readFile(path.resolve(ROOT,direction==='apply'?chunk.file:chunk.rollbackFile),'utf8'),guard='if(select count(*)from public.products)<>19629 ';assert.ok(sql.includes(guard));await db.exec(sql.replace(guard,`if(select count(*)from public.products)<>${options.productCount} `));}}
  const before=await state();
  const bad=structuredClone(items.slice(0,Math.min(2,items.length)));bad.at(-1).sourceChanges[0].authorityGuards[0].expected='wrong captured authority';
  await assert.rejects(db.exec(claimRepairChunkSql(bad,options)),/authority guard/);await db.exec('rollback;');assert.deepEqual(await state(),before);
  const badOld=structuredClone(items.slice(0,Math.min(2,items.length)));badOld.at(-1).sourceChanges[0].oldCharacteristics[0].value='wrong old characteristic';
  await assert.rejects(db.exec(claimRepairChunkSql(badOld,options)),/old-array guard/);await db.exec('rollback;');assert.deepEqual(await state(),before);
  await exec();const after=await state(),expectedProducts=structuredClone(before.products),expectedSources=structuredClone(before.product_source_records),expectedAttributes=structuredClone(before.product_attribute_values);
  for(const item of items){
   const product=expectedProducts.find(p=>p.legacy_id===item.id);for(const change of item.productChanges)product[change.field]=change.new;
   for(const source of item.sourceChanges)expectedSources.find(s=>s.internal_id===source.sourceRecordId).raw_payload.characteristics=source.newCharacteristics;
   for(const change of item.attributeChanges){const index=expectedAttributes.findIndex(a=>a.product_id===item.internalId&&a.attribute_id===change.attributeId);assert.ok(index>=0);if(change.action==='delete')expectedAttributes.splice(index,1);else Object.assign(expectedAttributes[index],change.newValues);}
   const{payload}=await one(db,'select payload from public.catalog_product_snapshots where snapshot_version=$1 and legacy_id=$2',[plan.activeVersion,item.id]);
   for(const display of item.displayChanges)for(const scoped of display.paths)assert.deepEqual(scoped.path.reduce((value,key)=>value?.[key],payload),scoped.newRows);
  }
  // Generated search_document legitimately follows an explicitly repaired title.
  const stripSearch=rows=>rows.map(row=>{const copy=structuredClone(row);delete copy.search_document;return copy;});
  assert.deepEqual(stripSearch(after.products),stripSearch(expectedProducts));assert.deepEqual(after.product_source_records,expectedSources);assert.deepEqual(after.product_attribute_values,expectedAttributes);
  for(const table of ['product_source_attributes','product_price_sources','product_media','product_documents','product_categories'])assert.deepEqual(after[table],before[table],`Protected ${table} changed`);
  const revision=(await one(db,'select revision from public.catalog_admin_cache_revision where singleton')).revision;await exec();assert.deepEqual(await state(),after);assert.equal((await one(db,'select revision from public.catalog_admin_cache_revision where singleton')).revision,revision);
  const first=items[0].sourceChanges[0];await db.query(`update public.product_source_records set raw_payload=jsonb_set(raw_payload,'{characteristics,0,value}','"manual"')where internal_id=$1`,[first.sourceRecordId]);
  await assert.rejects(db.exec(claimRepairChunkSql([items[0]],options)),/old-array guard/);await db.exec('rollback;');await db.query(`update public.product_source_records set raw_payload=jsonb_set(raw_payload,'{characteristics}',$2::jsonb)where internal_id=$1`,[first.sourceRecordId,JSON.stringify(first.newCharacteristics)]);
  await exec('rollback');assert.deepEqual(await state(),before,'Paired rollback did not recover all semantic rows and active cache');
  const forbidden=structuredClone(plan);forbidden.products[0].productChanges.push({field:'amount',old:1,new:2});assert.throws(()=>claimProducts(forbidden),/not claim-repair fields|do not rewrite/);
  const female=items.find(p=>p.sourceChanges[0].proofKind==='gf-female-only-connection');if(female){const mixed={...plan,products:[structuredClone(female)]};const source=mixed.products[0].sourceChanges[0];source.rawGuardPaths=source.authorityGuards;source.rawGuardPaths.find(g=>g.path[1]==='manufacturerDescription').expected='FEMALE STRAIGHT UNION BALL VALVE';assert.throws(()=>claimProducts(mixed),/outside female-only repair/);}
  const report={status:'PASS',suite:'manufacturer-claim-real-schema',planFile,planSha256,products:items.length,chunks:manifest.chunks.length,allActualBackupCases:true,
   frozenArtifactHashesAndBytes:true,compactRuntime,headDependencyHashAndOldValuesVerified:!!priorHeads,post510ProjectionVerified:!!earlierSignedPlan,pricesAndStockSlugsPreserved:true,originalManufacturerEvidenceAndPSAPreserved:true,mediaDocumentsAndMixedThreadSentinelPreserved:true,
   exactPublicArraysAndTypedChanges:true,authorityAndLateOldGuardRollback:true,noRefreshReplay:true,manualReplayRefused:true,pairedRecoveryIncludingCache:true,hostedConnections:0,elapsedMs:Math.round(performance.now()-started)};
  await fs.writeFile(path.join(ROOT,`imports/overnight-audit/${plan.jobId}-local-qa.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await db.close();}
}
const supplied=process.argv.slice(2).filter(arg=>arg.startsWith('--plan=')).map(arg=>arg.slice(7));
let plans=supplied;if(!plans.length){plans=[];for(const file of ['imports/overnight-audit/source-reconciliation/correction-claims-plan.json','imports/overnight-audit/rehau-cone-correction-plan.json','imports/overnight-audit/rehau-max-temperature-correction-plan.json'])try{await fs.access(path.resolve(ROOT,file));plans.push(file);}catch{}assert.ok(plans.length,'No manufacturer claim plan is available');}
try{for(const file of plans)await run(file);}catch(error){console.error(JSON.stringify({status:'FAIL',suite:'manufacturer-claim-real-schema',error:error.message?.slice(0,1800),code:error.code,detail:error.detail?.slice(0,400),hostedConnections:0}));process.exitCode=1;}
