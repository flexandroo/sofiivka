// Actual eight VALDrain records in their required post-head/post-claim state.
// Tests frozen prepared SQL; no hosted connection or frozen producer mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDatabase} from './database.mjs';
import {prepareGrammar} from '../../scripts/audit/prepare-manufacturer-grammar-repair.mjs';
import {repairChunkSql,selectedProducts} from '../../scripts/audit/prepare-manufacturer-role-repair.mjs';
const ROOT=path.resolve(import.meta.dirname,'../..');
const read=async p=>JSON.parse(await fs.readFile(path.resolve(ROOT,p),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const started=performance.now();
const planFile='imports/overnight-audit/source-reconciliation/correction-grammar-followup-plan.json';
const raw=await fs.readFile(path.join(ROOT,planFile)),plan=JSON.parse(raw),planSha256=hash(raw);
assert.equal(planSha256,'a5a442477c2bcae7084a8059d30665a2060a5b6e6f3265b74b978c388860fa32');
const headFile='imports/overnight-audit/source-reconciliation/correction-plan.json',claimFile='imports/overnight-audit/source-reconciliation/correction-claims-plan.json';
const headRaw=await fs.readFile(path.join(ROOT,headFile)),claimRaw=await fs.readFile(path.join(ROOT,claimFile));
assert.equal(hash(headRaw),plan.requiresPlanHashes.heads);assert.equal(hash(claimRaw),plan.requiresPlanHashes.claims);
const heads=new Map(JSON.parse(headRaw).products.map(x=>[x.id,x])),claims=new Map(JSON.parse(claimRaw).products.map(x=>[x.id,x]));
const items=selectedProducts(plan,['base']);assert.equal(items.length,8);assert.equal(items.reduce((n,x)=>n+x.productChanges.length,0),32);
const release=await prepareGrammar(),records=[],pages=new Map();
for(const item of items){
  if(!pages.has(item.sourceBackup.file))pages.set(item.sourceBackup.file,await read(item.sourceBackup.file));
  const packed=pages.get(item.sourceBackup.file).rows[item.sourceBackup.rowIndex];
  const record=JSON.parse(packed.row_json??Buffer.from(packed.row_base64,'base64').toString('utf8'));
  assert.equal(record.product.legacy_id,item.id);assert.equal(record.product.sku,item.sku);
  for(const prior of [heads.get(item.id),claims.get(item.id)])for(const c of prior?.productChanges||[])record.product[c.field]=structuredClone(c.new);
  for(const change of item.productChanges)assert.deepEqual(record.product[change.field],change.old,'Exact required post-phase old value');
  records.push(record);
}
const options={activeVersion:plan.activeVersion,planSha256,jobId:plan.jobId,productCount:9};
const byId=new Map(items.map(x=>[x.id,x]));
assert.deepEqual(release.chunks.flatMap(c=>c.ids),items.map(x=>x.id));
for(const c of release.chunks)for(const direction of ['apply','rollback']){
  const bytes=await fs.readFile(path.resolve(ROOT,direction==='apply'?c.file:c.rollbackFile));
  assert.equal(hash(bytes),direction==='apply'?c.sha256:c.rollbackSha256);assert.ok(bytes.length<=release.maxBytes);
  assert.equal(bytes.toString(),repairChunkSql(c.ids.map(id=>byId.get(id)),{...options,productCount:19629,direction}));
}
const db=await createDatabase();
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
async function insert(table,rows){
  if(!rows.length)return;const{rows:columns}=await db.query(`select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped and attgenerated='' order by attnum`,[`public.${table}`]);
  const names=columns.map(x=>'"'+x.attname.replaceAll('"','""')+'"').join(',');
  await db.query(`insert into public.${table}(${names})select ${names} from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,[JSON.stringify(rows)]);
}
async function state(){
  const out={},orders={products:'internal_id',product_attribute_values:'product_id,attribute_id',product_source_records:'internal_id',product_price_sources:'product_id',product_media:'internal_id',product_documents:'internal_id',product_categories:'product_id,category_id',catalog_product_snapshots:'snapshot_version,legacy_id',catalog_product_cards:'snapshot_version,legacy_id'};
  for(const [table,order]of Object.entries(orders)){const{rows}=await db.query(`select to_jsonb(t) row from public.${table} t order by ${order}`);out[table]=rows.map(x=>{const v=x.row;if(['products','catalog_product_snapshots','catalog_product_cards'].includes(table))delete v.updated_at;return v;});}
  return out;
}
async function execFrozen(direction='apply'){
  const chunks=direction==='apply'?release.chunks:[...release.chunks].reverse();
  for(const c of chunks){const sql=await fs.readFile(path.resolve(ROOT,direction==='apply'?c.file:c.rollbackFile),'utf8');
    const guard='if(select count(*)from public.products)<>19629';assert.equal(sql.split(guard).length,2);
    await db.exec(sql.replace(guard,'if(select count(*)from public.products)<>9'));
  }
}
try{
  await db.exec("set timezone='UTC'");
  for(const record of records)for(const row of [record.product,...record.sources,...record.attributes])for(const key of ['created_by','updated_by'])if(row[key])await db.query('insert into auth.users(id)values($1)on conflict do nothing',[row[key]]);
  for(const id of new Set(records.map(r=>r.product.brand_id)))await db.query(`insert into public.brands(internal_id,stable_id,slug,name,status)values($1,$2,$2,$2,'active')on conflict do nothing`,[id,'qa-'+id]);
  for(const id of new Set(records.map(r=>r.product.primary_category_id)))await db.query(`insert into public.categories(internal_id,stable_id,slug,title,level,status)values($1,$2,$2,$2,1,'active')on conflict do nothing`,[id,'qa-'+id]);
  const sources=records.flatMap(r=>r.sources),supplier=sources[0].supplier_id;
  for(const id of new Set(sources.map(s=>s.supplier_id)))await db.query(`insert into public.suppliers(internal_id,stable_id,name,active)values($1,$2,$2,true)on conflict do nothing`,[id,'qa-'+id]);
  const runs=new Map(sources.filter(s=>s.import_run_id).map(s=>[s.import_run_id,s.supplier_id]));
  for(const r of records)if(r.product.last_import_run_id&&!runs.has(r.product.last_import_run_id))runs.set(r.product.last_import_run_id,supplier);
  for(const[id,supplierId]of runs)await db.query(`insert into public.import_runs(internal_id,supplier_id,status,source_ref)values($1,$2,'succeeded','grammar-local-actual-fixture')on conflict do nothing`,[id,supplierId]);
  for(const r of records)if(r.product.series_id)await db.query(`insert into public.product_series(internal_id,stable_id,brand_id,slug,name)values($1,$2,$3,$2,$2)on conflict do nothing`,[r.product.series_id,'qa-'+r.product.series_id,r.product.brand_id]);
  const attrs=records.flatMap(r=>r.attributes),defs=new Map(attrs.map(a=>[a.attribute_id,a]));
  for(const[id,a]of defs){const type=a.option_id?'select':a.value_number!==null?'number':a.value_boolean!==null?'boolean':'string';await db.query(`insert into public.attribute_definitions(internal_id,stable_id,label,value_type)values($1,$2,$2,$3::public.attribute_value_type)on conflict do nothing`,[id,'qa-'+id,type]);}
  const seen=new Set();for(const a of attrs)if(a.option_id&&!seen.has(a.option_id)){seen.add(a.option_id);await db.query(`insert into public.attribute_options(internal_id,attribute_id,value,label)values($1,$2,$3,$3)on conflict do nothing`,[a.option_id,a.attribute_id,'qa-'+a.option_id]);}
  await insert('products',records.map(r=>r.product));await insert('product_attribute_values',attrs);await insert('product_source_records',sources);
  const sentinel={...records[0].product,internal_id:'00000000-0000-4000-8000-000000000001',legacy_id:'qa-grammar-sentinel',sku:'qa-grammar-sentinel',slug:'qa-grammar-sentinel',title:'Unrelated sentinel',amount:12345,old_amount:null,currency:'UAH',price_status:'known'};
  await insert('products',[sentinel]);
  await db.query(`update public.products set amount=54321,old_amount=null,price_status='known'where internal_id=$1`,[items[0].internalId]);
  await db.query(`insert into public.product_price_sources(product_id,base_amount,currency,vat_included,source,source_ref)values($1,54321,'UAH',null,'protected post-backup price','grammar-after-source-backup')`,[items[0].internalId]);
  await db.query(`insert into public.product_media(product_id,url,role)values($1,'/assets/products/qa/protected.webp','primary')`,[items[0].internalId]);
  await db.query(`insert into public.product_documents(product_id,title,url)values($1,'Protected PDF','/assets/products/qa/protected.pdf')`,[items[0].internalId]);
  await db.query(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)values($1,'grammar-qa','[]','[]','{}',9,9,repeat('0',64),true)`,[plan.activeVersion]);
  await db.query(`insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,$1)`,[plan.activeVersion]);
  await db.query(`insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,$1)on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version,revision=0`,[plan.activeVersion]);
  let index=0;for(const r of [...records,{product:sentinel,sources:[]}]){const sourceRows=r.sources[0]?.raw_payload.characteristics||[];
    await db.query(`insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload)values($1,$2,$3,$4)`,[plan.activeVersion,r.product.legacy_id,index++,{id:r.product.legacy_id,source:{supplier:'preserved'},sourceAttributes:sourceRows,unmappedAttributes:sourceRows}]);}
  await db.query('select public._admin_refresh_catalog($1::uuid[])',[[...items.map(x=>x.internalId),sentinel.internal_id]]);
  const before=await state(),sentinelBefore=(await one('select to_jsonb(p) row from public.products p where legacy_id=$1',[sentinel.legacy_id])).row;
  // The final real record has a manual edit: earlier seven rows must roll back.
  const last=items.at(-1),lastOld=last.productChanges.find(c=>c.field==='description').old;
  await db.query('update public.products set description=$2 where internal_id=$1',[last.internalId,'Late manual source-copy edit']);
  const conflictBefore=await state(),revisionBefore=(await one('select revision from public.catalog_admin_cache_revision where singleton')).revision;
  await assert.rejects(execFrozen(),/old-value guard/);await db.exec('rollback');assert.deepEqual(await state(),conflictBefore);
  assert.equal((await one('select revision from public.catalog_admin_cache_revision where singleton')).revision,revisionBefore);
  await db.query('update public.products set description=$2 where internal_id=$1',[last.internalId,lastOld]);assert.deepEqual(await state(),before);
  await execFrozen();const after=await state();
  const paths={description:['description'],short_description:['shortDescription'],full_description:['fullDescription'],description_sections:['descriptionSections'],seo_title:['seo','title'],seo_description:['seo','description']};
  for(const item of items){
    const original=before.products.find(p=>p.legacy_id===item.id),actual=after.products.find(p=>p.legacy_id===item.id),expected=structuredClone(original);
    for(const c of item.productChanges)expected[c.field]=c.new;assert.deepEqual(actual,expected,item.sku+' unapproved canonical change');
    const snap=after.catalog_product_snapshots.find(s=>s.legacy_id===item.id),oldSnap=before.catalog_product_snapshots.find(s=>s.legacy_id===item.id),expectedSnap=structuredClone(oldSnap);
    for(const c of item.productChanges){const address=paths[c.field];let parent=expectedSnap.payload;for(const part of address.slice(0,-1))parent=parent[part];parent[address.at(-1)]=c.new;}
    assert.deepEqual(snap,expectedSnap,item.sku+' unapproved public payload change');
  }
  for(const table of ['product_attribute_values','product_source_records','product_price_sources','product_media','product_documents','product_categories','catalog_product_cards'])assert.deepEqual(after[table],before[table],table+' must remain unchanged');
  assert.deepEqual((await one('select to_jsonb(p) row from public.products p where legacy_id=$1',[sentinel.legacy_id])).row,sentinelBefore);
  const revision=(await one('select revision from public.catalog_admin_cache_revision where singleton')).revision;
  await execFrozen();assert.deepEqual(await state(),after);assert.equal((await one('select revision from public.catalog_admin_cache_revision where singleton')).revision,revision);
  // A later manual text is protected from both replay and accidental recovery.
  await db.query('update public.products set description=$2 where internal_id=$1',[items[0].internalId,'Manual text after grammar']);
  await assert.rejects(execFrozen(),/old-value guard/);await db.exec('rollback');
  await db.query('update public.products set description=$2 where internal_id=$1',[items[0].internalId,items[0].productChanges.find(c=>c.field==='description').new]);
  await execFrozen('rollback');assert.deepEqual(await state(),before,'Paired rollback must restore all exact semantic rows and public payloads');
  await execFrozen();assert.deepEqual(await state(),after,'Reapply after recovery must reproduce exact desired state');
  assert.equal(hash(await fs.readFile(path.join(ROOT,headFile))),plan.requiresPlanHashes.heads);assert.equal(hash(await fs.readFile(path.join(ROOT,claimFile))),plan.requiresPlanHashes.claims);assert.equal(hash(await fs.readFile(path.join(ROOT,planFile))),planSha256);
  const report={status:'PASS',suite:'manufacturer-grammar-real-eight-records',products:8,copyFields:32,planSha256,preparedArtifactHashesAndBytes:true,allActualPostHeadAndClaimOldValues:true,allCanonicalAndSnapshotChangesExact:true,allNumbersSkuSlugsAndModelsPreserved:true,postBackupPricePreserved:true,sourcePavMediaDocumentsPriceSourcesAndCardsUnchanged:true,unrelatedSentinelEntireRowUnchanged:true,replayNoCacheRefresh:true,lateConflictWholeTransactionRollback:true,manualReplayRefused:true,pairedRollbackAndReapplyExact:true,frozenPrecedingPlansUnchanged:true,hostedConnections:0,elapsedMs:Math.round(performance.now()-started)};
  await fs.writeFile(path.join(ROOT,'imports/overnight-audit/source-reconciliation/correction-grammar-local-db-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({status:'FAIL',suite:'manufacturer-grammar-real-eight-records',error:error.message?.slice(0,2000),code:error.code,hostedConnections:0}));process.exitCode=1;}
finally{await db.close();}
