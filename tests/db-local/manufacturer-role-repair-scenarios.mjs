// Actual manufacturer role corrections: all 326 frozen records, real migrations, preserved prices and exact failure/recovery paths.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createDatabase} from './database.mjs';
import {selectedProducts,repairChunkSql} from '../../scripts/audit/prepare-manufacturer-role-repair.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=async file=>JSON.parse(await fs.readFile(path.resolve(ROOT,file),'utf8'));
const one=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0];
const plan=await read('imports/overnight-audit/source-reconciliation/correction-plan.json');
const items=selectedProducts(plan),started=performance.now(),db=await createDatabase();
const planSha256=createHash('sha256').update(await fs.readFile(path.join(ROOT,'imports/overnight-audit/source-reconciliation/correction-plan.json'))).digest('hex');
assert.equal(planSha256,'e5f34b6c9e0c4c80528e3df56659ef9930a7a62d435e036a1034f684b21a6bd9','Frozen manufacturer plan changed');
assert.equal(items.length,326);assert.equal(plan.summary.headProducts,306);assert.equal(plan.summary.categoryMoves,33);
const records=[];
const pages=new Map();
for(const item of items){
  if(!pages.has(item.sourceBackup.file))pages.set(item.sourceBackup.file,await read(item.sourceBackup.file));
  const entry=pages.get(item.sourceBackup.file).rows[item.sourceBackup.rowIndex];
  const row=JSON.parse(entry.row_json??Buffer.from(entry.row_base64,'base64').toString('utf8'));
  assert.equal(row.product.legacy_id,item.id);assert.equal(row.product.internal_id,item.internalId);records.push(row);
}
const options={activeVersion:plan.activeVersion,planSha256,jobId:plan.jobId,productCount:records.length+1};
const hash=value=>createHash('sha256').update(value).digest('hex');
const releases={};
for(const groups of [['categories','base']]){
  const manifest=await read(`imports/overnight-audit/releases/${plan.jobId}-${groups.join('-')}-${planSha256.slice(0,12)}/manifest.json`);
  assert.equal(manifest.planSha256,planSha256);const selected=selectedProducts(plan,groups),byId=new Map(selected.map(item=>[item.id,item]));
  assert.deepEqual(manifest.chunks.flatMap(c=>c.ids),selected.map(item=>item.id));
  for(const chunk of manifest.chunks)for(const direction of ['apply','rollback']){
    const sql=await fs.readFile(path.resolve(ROOT,direction==='apply'?chunk.file:chunk.rollbackFile),'utf8');
    assert.equal(hash(sql),direction==='apply'?chunk.sha256:chunk.rollbackSha256);assert.ok(Buffer.byteLength(sql)<650000);
    assert.equal(sql,repairChunkSql(chunk.ids.map(id=>byId.get(id)),{...options,productCount:19629,direction}),'Frozen artifact differs from its reviewed compiler input');
  }
  releases[groups.join(',')]=manifest;
}
const compareWithoutTime=value=>{const copy=structuredClone(value);delete copy.updated_at;return copy;};
const sourceComparable=value=>{const copy=compareWithoutTime(value);delete copy.raw_payload.characteristics;return copy;};
async function insert(table,rows,conflict=''){
  if(!rows.length)return;
  const {rows:columns}=await db.query(`select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped and attgenerated=''order by attnum`,[`public.${table}`]);
  const names=columns.map(c=>'"'+c.attname.replaceAll('"','""')+'"').join(',');
  for(let offset=0;offset<rows.length;offset+=100)await db.query(`insert into public.${table}(${names})select ${names} from jsonb_populate_recordset(null::public.${table},$1::jsonb)${conflict}`,[JSON.stringify(rows.slice(offset,offset+100))]);
}
async function snapshotState(){
  const out={};
  const orders={products:'internal_id',product_attribute_values:'product_id,attribute_id',product_source_records:'internal_id',product_price_sources:'product_id',product_media:'internal_id',product_documents:'internal_id',product_categories:'product_id,category_id',catalog_product_snapshots:'snapshot_version,legacy_id',catalog_product_cards:'snapshot_version,legacy_id'};
  for(const[table,order]of Object.entries(orders)){
    const{rows}=await db.query(`select to_jsonb(t)row from public.${table} t order by ${order}`);
    out[table]=rows.map(x=>compareWithoutTime(x.row));
  }
  return out;
}
async function execItems(selected,direction='apply'){
  for(let offset=0;offset<selected.length;offset+=25)await db.exec(repairChunkSql(selected.slice(offset,offset+25),{...options,direction}));
}
async function execFrozen(groups,direction='apply'){
  const manifest=releases[groups],chunks=direction==='apply'?manifest.chunks:[...manifest.chunks].reverse();
  for(const chunk of chunks){const sql=await fs.readFile(path.resolve(ROOT,direction==='apply'?chunk.file:chunk.rollbackFile),'utf8');
    // This fixture contains every affected real record plus one sentinel; only the total-row assertion differs.
    const original='if(select count(*)from public.products)<>19629';assert.ok(sql.includes(original));
    await db.exec(sql.replace(original,`if(select count(*)from public.products)<>${options.productCount}`));
  }
}
try{
  await db.exec("set timezone='UTC'");
  const prices=await read('imports/overnight-prices/price-plan.json');const priceById=new Map(prices.rows.map(row=>[row.legacyId,row.target]));
  const userIds=new Set();for(const record of records)for(const row of [record.product,...record.sources,...record.attributes])for(const key of ['created_by','updated_by'])if(row[key])userIds.add(row[key]);
  for(const id of userIds)await db.query('insert into auth.users(id)values($1)on conflict do nothing',[id]);
  for(const id of new Set(records.map(r=>r.product.brand_id)))await db.query(`insert into public.brands(internal_id,stable_id,slug,name,status)values($1,$2,$2,$2,'active')on conflict(internal_id)do nothing`,[id,'qa-'+id]);
  const categoryIds=new Set(records.map(r=>r.product.primary_category_id));for(const item of items)for(const change of item.productChanges)if(change.field==='primary_category_id')categoryIds.add(change.new);
  for(const id of categoryIds)await db.query(`insert into public.categories(internal_id,stable_id,slug,title,level,status)values($1,$2,$2,$2,1,'active')on conflict(internal_id)do nothing`,[id,'qa-'+id]);
  const sources=records.flatMap(r=>r.sources);
  for(const id of new Set(sources.map(s=>s.supplier_id)))await db.query(`insert into public.suppliers(internal_id,stable_id,name,active)values($1,$2,$2,true)on conflict(internal_id)do nothing`,[id,'qa-'+id]);
  const runs=new Map();for(const source of sources)if(source.import_run_id)runs.set(source.import_run_id,source.supplier_id);
  const supplier=sources[0].supplier_id;for(const record of records)if(record.product.last_import_run_id&&!runs.has(record.product.last_import_run_id))runs.set(record.product.last_import_run_id,supplier);
  for(const [id,supplierId]of runs)await db.query(`insert into public.import_runs(internal_id,supplier_id,status,source_ref)values($1,$2,'succeeded','local-repair-fixture')on conflict(internal_id)do nothing`,[id,supplierId]);
  for(const record of records)if(record.product.series_id)await db.query(`insert into public.product_series(internal_id,stable_id,brand_id,slug,name)values($1,$2,$3,$2,$2)on conflict(internal_id)do nothing`,[record.product.series_id,'qa-'+record.product.series_id,record.product.brand_id]);
  const attributes=records.flatMap(r=>r.attributes),definitions=new Map();for(const row of attributes)if(!definitions.has(row.attribute_id))definitions.set(row.attribute_id,row);
  for(const[id,row]of definitions){const type=row.option_id?'select':row.value_number!==null?'number':row.value_boolean!==null?'boolean':'string';
    await db.query(`insert into public.attribute_definitions(internal_id,stable_id,label,value_type)values($1,$2,$2,$3::public.attribute_value_type)on conflict(internal_id)do nothing`,[id,'qa-'+id,type]);}
  const seenOptions=new Set();for(const row of attributes)if(row.option_id&&!seenOptions.has(row.option_id)){seenOptions.add(row.option_id);await db.query(`insert into public.attribute_options(internal_id,attribute_id,value,label)values($1,$2,$3,$3)on conflict(internal_id)do nothing`,[row.option_id,row.attribute_id,'qa-'+row.option_id]);}
  const products=records.map(record=>{const p=structuredClone(record.product),target=priceById.get(p.legacy_id);if(target){p.amount=target.amount;p.old_amount=target.oldAmount;p.currency=target.currency;p.price_status=target.priceStatus;}return p;});
  await insert('products',products);await insert('product_attribute_values',attributes);await insert('product_source_records',sources);
  const sentinel={...products[0],internal_id:'00000000-0000-4000-8000-000000000001',legacy_id:'qa-unrelated-sentinel',sku:'qa-unrelated-sentinel',slug:'qa-unrelated-sentinel',title:'Unrelated sentinel',amount:12345,old_amount:null,currency:'UAH',price_status:'known'};
  await insert('products',[sentinel]);
  // A price update after the source backup must survive every repair and its reverse.
  await db.query(`update public.products set amount=54321,old_amount=null,price_status='known'where internal_id=$1`,[products[0].internal_id]);
  await db.query(`insert into public.product_price_sources(product_id,base_amount,currency,vat_included,source,source_ref)values($1,54321,'UAH',null,'preserved verified list','post-backup-price')`,[products[0].internal_id]);
  await db.query(`insert into public.product_media(product_id,url,role)values($1,'/assets/products/qa/protected.webp','primary')`,[products[0].internal_id]);
  await db.query(`insert into public.product_documents(product_id,title,url)values($1,'Protected PDF','/assets/products/qa/protected.pdf')`,[products[0].internal_id]);
  await db.query(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)values($1,'repair-qa','[]','[]','{}',$2,$2,repeat('0',64),true);`,[plan.activeVersion,options.productCount]);
  await db.query(`insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,$1);`,[plan.activeVersion]);
  await db.query(`insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,$1)on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version,revision=0`,[plan.activeVersion]);
  let ordinal=0;
  for(const item of items){
    const record=records.find(r=>r.product.legacy_id===item.id),raw=record.sources[0]?.raw_payload??{};
    const sourceRows=item.displayChanges.find(c=>c.kind==='replace-characteristics')?.oldRows??raw.characteristics??raw.technicalDetails??[];
    const payload={id:item.id,source:{supplier:'preserved',sourceId:item.id},sourceAttributes:sourceRows,unmappedAttributes:sourceRows};
    for(const change of item.displayChanges)for(const scoped of change.paths??[]){if(scoped.path.length===1)payload[scoped.path[0]]=scoped.oldRows;else payload.source.characteristics=scoped.oldRows;}
    await db.query(`insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload)values($1,$2,$3,$4)`,[plan.activeVersion,item.id,ordinal++,payload]);
  }
  await db.query(`insert into public.catalog_product_snapshots(snapshot_version,legacy_id,sort_order,payload)values($1,$2,$3,$4)`,[plan.activeVersion,sentinel.legacy_id,ordinal,{id:sentinel.legacy_id,source:{supplier:'sentinel'},sourceAttributes:[],unmappedAttributes:[]}]);
  for(let offset=0;offset<products.length;offset+=50)await db.query(`select public._admin_refresh_catalog($1::uuid[])`,[products.slice(offset,offset+50).map(p=>p.internal_id)]);
  await db.query(`select public._admin_refresh_catalog(array[$1::uuid])`,[sentinel.internal_id]);
  const before=await snapshotState();
  // A late identity mismatch rolls back earlier rows, source/cache changes and any typed updates.
  const bad=structuredClone(items.slice(0,2));bad[1].sku+='-wrong';
  await assert.rejects(db.exec(repairChunkSql(bad,options)),error=>{if(error.code==='42601'){const sql=repairChunkSql(bad,options);error.detail=sql.slice(Number(error.position)-180,Number(error.position)+180);throw error;}return /identity\/ownership guard/.test(error.message);});await db.exec('rollback;');assert.deepEqual(await snapshotState(),before);
  const badOld=structuredClone(items.filter(item=>item.productChanges.length).slice(0,2));badOld[1].productChanges[0].old='wrong expected old text';
  await assert.rejects(db.exec(repairChunkSql(badOld,options)),/old-value guard/);await db.exec('rollback;');assert.deepEqual(await snapshotState(),before);
  const safe=selectedProducts(plan,['categories','base']);await execFrozen('categories,base');
  const after=await snapshotState(),afterById=new Map(after.products.map(p=>[p.legacy_id,p]));
  for(const item of items){
    const original=before.products.find(p=>p.legacy_id===item.id),actual=afterById.get(item.id),expected={...original};
    for(const change of item.productChanges)expected[change.field]=change.new;
    if(item.productChanges.some(change=>['title','short_title'].includes(change.field))){
      assert.notEqual(actual.search_document,original.search_document,'Title repair did not rebuild searchable words');
      const first=actual.title.split(/\s+/)[0].toLocaleLowerCase('uk');
      assert.ok(actual.search_document.includes(first),'Search index does not contain the corrected article role');
      expected.search_document=actual.search_document;
    }
    assert.deepEqual(actual,expected,`Unapproved canonical field changed: ${item.id}`);
    for(const change of item.attributeChanges){const row=after.product_attribute_values.find(v=>v.product_id===item.internalId&&v.attribute_id===change.attributeId);
      if(change.action==='delete')assert.equal(row,undefined);else assert.deepEqual(row,compareWithoutTime({...change.oldRow,...change.newValues}));}
    for(const change of item.sourceChanges){const row=after.product_source_records.find(v=>v.internal_id===change.sourceRecordId),old=before.product_source_records.find(v=>v.internal_id===change.sourceRecordId);
      assert.deepEqual(sourceComparable(row),sourceComparable(old),'Original manufacturer evidence or other source metadata changed');assert.deepEqual(row.raw_payload.characteristics,change.newCharacteristics);}
    const snap=await one(db,`select payload from public.catalog_product_snapshots where snapshot_version=$1 and legacy_id=$2`,[plan.activeVersion,item.id]);
    for(const change of item.displayChanges){if(change.kind==='replace-characteristics'){assert.deepEqual(snap.payload.sourceAttributes,change.newRows);assert.deepEqual(snap.payload.unmappedAttributes,change.newRows);}
      for(const scoped of change.paths??[])assert.deepEqual(scoped.path.reduce((v,k)=>v?.[k],snap.payload),scoped.newRows);}
  }
  assert.deepEqual(after.product_price_sources,before.product_price_sources);assert.deepEqual(after.product_media,before.product_media);assert.deepEqual(after.product_documents,before.product_documents);assert.deepEqual(after.product_categories,before.product_categories);
  const expectedSources=structuredClone(before.product_source_records);
  for(const item of items)for(const change of item.sourceChanges)expectedSources.find(source=>source.internal_id===change.sourceRecordId).raw_payload.characteristics=change.newCharacteristics;
  assert.deepEqual(after.product_source_records,expectedSources,'A source record changed outside its approved characteristic array');
  const expectedTyped=structuredClone(before.product_attribute_values);
  for(const item of items)for(const change of item.attributeChanges){const index=expectedTyped.findIndex(row=>row.product_id===item.internalId&&row.attribute_id===change.attributeId);assert.ok(index>=0);
    if(change.action==='delete')expectedTyped.splice(index,1);else Object.assign(expectedTyped[index],change.newValues);}
  assert.deepEqual(after.product_attribute_values,expectedTyped,'An unapproved typed attribute changed');
  assert.deepEqual(afterById.get(sentinel.legacy_id),before.products.find(p=>p.legacy_id===sentinel.legacy_id));
  const revision=(await one(db,'select revision from public.catalog_admin_cache_revision where singleton')).revision;
  await execFrozen('categories,base');assert.deepEqual(await snapshotState(),after);assert.equal((await one(db,'select revision from public.catalog_admin_cache_revision where singleton')).revision,revision,'Replay unnecessarily refreshed the cache');
  // Post-repair manual edits are not overwritten by replay.
  const manualItem=items.find(item=>item.productChanges.some(c=>c.field==='title'));
  const expectedTitle=afterById.get(manualItem.id).title;
  await db.query('update public.products set title=$2 where internal_id=$1',[manualItem.internalId,'Unrelated manual title edit']);
  await assert.rejects(db.exec(repairChunkSql([manualItem],options)),/old-value guard/);await db.exec('rollback;');
  await db.query('update public.products set title=$2 where internal_id=$1',[manualItem.internalId,expectedTitle]);
  await execFrozen('categories,base','rollback');
  assert.deepEqual(await snapshotState(),before,'Paired rollback did not restore exact semantic canonical/source/PAV data');
  const report={status:'PASS',suite:'manufacturer-role-repair-real-schema',planSha256,plannedProducts:items.length,headProducts:plan.summary.headProducts,categoryMoves:plan.summary.categoryMoves,safeProducts:safe.length,
    realBackupRecords:true,postBackupPricesPreserved:true,originalSourceEvidencePreserved:true,protectedMediaDocumentsAndSentinel:true,
    allPlannedCases:true,frozenArtifactHashesAndBytes:true,exactPreparedArtifactsTested:true,replayNoRefresh:true,lateGuardRollback:true,wrongOldValueRollback:true,allTypedRowsGuarded:true,cacheRecoveryExact:true,manualReplayRefused:true,pairedRecoveryExact:true,hostedConnections:0,elapsedMs:Math.round(performance.now()-started)};
  await fs.writeFile(path.join(ROOT,'imports/overnight-audit/source-reconciliation/correction-local-db-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({status:'FAIL',suite:'manufacturer-role-repair-real-schema',error:error.message?.slice(0,1800),detail:error.detail?.slice(0,400),code:error.code,hostedConnections:0}));process.exitCode=1;}
finally{await db.close();}
