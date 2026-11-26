// Narrow wrapper around the frozen, tested role SQL engine. Never changes that
// engine, either preceding plan or the eight-product grammar plan.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {selectedProducts,repairChunkSql} from './prepare-manufacturer-role-repair.mjs';
const ROOT=path.resolve(import.meta.dirname,'../..');
const PLAN='imports/overnight-audit/source-reconciliation/correction-grammar-followup-plan.json';
const FROZEN='a5a442477c2bcae7084a8059d30665a2060a5b6e6f3265b74b978c388860fa32';
const fields=new Set(['description','short_description','full_description','description_sections','seo_title','seo_description']);
const sha=v=>createHash('sha256').update(v).digest('hex');
const numbers=v=>JSON.stringify(v).match(/\d+(?:[.,]\d+)?/g)||[];
export async function prepareGrammar({outputDir,maxBytes=300000,chunkSize=8}={}){
  assert.ok(Number.isInteger(maxBytes)&&maxBytes>10000&&maxBytes<=600000);
  assert.ok(Number.isInteger(chunkSize)&&chunkSize>=1&&chunkSize<=8);
  const raw=await fs.readFile(path.join(ROOT,PLAN),'utf8'),plan=JSON.parse(raw);assert.equal(sha(raw),FROZEN);
  assert.equal(plan.format,'sofiivka-catalog-repair-plan-v1');assert.equal(plan.projectRef,'fkjarsouuchjiedrrblc');
  assert.equal(plan.summary.products,8);assert.equal(plan.summary.baseProductCopyFields,32);
  const items=selectedProducts(plan,['base']);assert.equal(items.length,8);
  for(const item of items){assert.ok(item.sku.startsWith('DRN'));assert.equal(item.productChanges.length,4);assert.equal(item.expectedStatus,'published');
    for(const change of item.productChanges){assert.equal(change.group,'base');assert.ok(fields.has(change.field));assert.deepEqual(numbers(change.old),numbers(change.new));}
  }
  const directory=path.resolve(ROOT,outputDir??`imports/overnight-audit/releases/${plan.jobId}-grammar-${FROZEN.slice(0,12)}`);await fs.mkdir(directory,{recursive:true});
  const chunks=[];let offset=0;
  while(offset<items.length){let count=Math.min(chunkSize,items.length-offset),selected,sql,rollbackSql;
    const options={activeVersion:plan.activeVersion,planSha256:FROZEN,jobId:plan.jobId,productCount:19629};
    for(;;){selected=items.slice(offset,offset+count);sql=repairChunkSql(selected,options);rollbackSql=repairChunkSql(selected,{...options,direction:'rollback'});
      if(Math.max(Buffer.byteLength(sql),Buffer.byteLength(rollbackSql))<=maxBytes)break;assert.ok(count>1);count=Math.ceil(count/2);}
    const index=chunks.length+1,name=String(index).padStart(3,'0'),file=path.join(directory,`${name}-apply.sql`),rollbackFile=path.join(directory,`${name}-rollback.sql`);
    await fs.writeFile(file,sql);await fs.writeFile(rollbackFile,rollbackSql);
    chunks.push({index,products:selected.length,ids:selected.map(x=>x.id),file:path.relative(ROOT,file).replaceAll('\\','/'),rollbackFile:path.relative(ROOT,rollbackFile).replaceAll('\\','/'),bytes:Buffer.byteLength(sql),rollbackBytes:Buffer.byteLength(rollbackSql),sha256:sha(sql),rollbackSha256:sha(rollbackSql)});offset+=count;
  }
  assert.deepEqual(chunks.flatMap(c=>c.ids),items.map(x=>x.id));
  const manifest={format:'sofiivka-catalog-repair-release-v1',jobId:plan.jobId,projectRef:plan.projectRef,activeVersion:plan.activeVersion,planFile:PLAN,planSha256:FROZEN,groups:['base'],requiresJobs:plan.requiresJobs,requiresPlanHashes:plan.requiresPlanHashes,products:8,copyFields:32,maxBytes,engine:'scripts/audit/prepare-manufacturer-role-repair.mjs#repairChunkSql',chunks};
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options={};for(const arg of process.argv.slice(2)){const[key,...rest]=arg.replace(/^--/,'').split('=');if(key==='output')options.outputDir=rest.join('=');else if(key==='max-bytes')options.maxBytes=Number(rest.join('='));else if(key==='chunk-size')options.chunkSize=Number(rest.join('='));else throw Error('Unknown argument '+arg);}
  const result=await prepareGrammar(options);console.log(JSON.stringify({status:'PREPARED_NOT_EXECUTED',jobId:result.jobId,products:result.products,chunks:result.chunks.length,maxApplyBytes:Math.max(...result.chunks.map(c=>c.bytes)),maxRollbackBytes:Math.max(...result.chunks.map(c=>c.rollbackBytes)),hostedConnections:0}));
}
