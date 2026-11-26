// Derive small transport-recovery transactions from a hash-verified frozen chunk.
// No hosted connections. The parent source_ref and every per-product value stay unchanged.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {enrichmentSql} from './brand-enrichment.mjs';
import {readyPayload,publicationSql as makePublication,atomicPublicationSql} from './prepare-brand-release.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
export const TRANSACTION_GUARDS="set local statement_timeout='45s';\nset local lock_timeout='5s';\nset local jit=off;\n";

export function withTransactionGuards(sql,{statementTimeout='45s',lockTimeout='5s'}={}){
  for(const value of[statementTimeout,lockTimeout])if(!/^[1-9]\d*(?:ms|s|min)$/.test(value))throw new Error('Timeout must be an explicit positive ms/s/min interval.');
  const guards=`set local statement_timeout='${statementTimeout}';\nset local lock_timeout='${lockTimeout}';\nset local jit=off;\n`;
  if(!/^\s*(?:--[^\n]*\n\s*)*begin;\n/i.test(sql)||!/^commit;\s*$/im.test(sql))throw new Error('Unexpected transaction envelope.');
  if(/set\s+local\s+(?:statement_timeout|lock_timeout|jit)\s*=/i.test(sql))throw new Error('Parent already has transaction guards; review before subdivision.');
  return sql.replace(/(^|\n)begin;\n/i,(_,prefix)=>`${prefix}begin;\n${guards}`);
}

export function normalizeExclusionIds(input){
  if(input===undefined||input===null)return new Set();
  const values=input instanceof Set?[...input]:Array.isArray(input)?input:
    input&&typeof input==='object'?(input.products??input.ids??input.legacyIds):null;
  if(!Array.isArray(values))throw new Error('Exclusions must be an ID array/Set or an object with products/ids/legacyIds.');
  const ids=values.map(entry=>typeof entry==='string'?entry:entry?.legacyId);
  for(const id of ids)if(typeof id!=='string'||!id.trim()||id!==id.trim()||id.includes('\0'))throw new Error('Every exclusion requires an exact nonempty legacyId without surrounding whitespace or NUL.');
  if(new Set(ids).size!==ids.length)throw new Error('Exclusion IDs must be unique.');
  if(input&&typeof input==='object'&&!Array.isArray(input)&&!(input instanceof Set)&&input.count!==undefined&&input.count!==ids.length)throw new Error('Exclusion count differs from the explicit ID list.');
  return new Set(ids);
}

function inspectFrozenParent({draftSql,publicationSql,atomicSql,sourceRef,ids,originalsBySku}){
  if(!sourceRef||!Array.isArray(ids)||!ids.length||!(originalsBySku instanceof Map))throw new Error('Frozen sourceRef, IDs and exact original products are required.');
  const items=readyPayload(draftSql);
  assert.deepEqual(items.map(item=>item.legacyId),ids,'Frozen draft IDs differ from manifest.');
  assert.equal(new Set(ids).size,ids.length,'Frozen parent has duplicate IDs.');
  assert.equal(publicationSql,makePublication([{sourceRef,ids}]),'Frozen publication is not the exact parent-scoped transaction.');
  assert.equal(atomicSql,atomicPublicationSql(draftSql,publicationSql),'Frozen atomic envelope differs from draft plus publication.');
  const enrichRows=rows=>rows.map(item=>{
    const original=originalsBySku.get(item.sku.trim().toLowerCase());
    if(!original)throw new Error(`Exact original source product missing: ${item.sku}`);
    assert.equal(String(original.sourceId).trim(),item.sourceId,`${item.sku}: original source ID differs.`);
    return {...item,original};
  });
  const originalEnrichment=enrichmentSql(enrichRows(items),sourceRef);
  const enrichmentSuffix=`\n${originalEnrichment}\ncommit;\n`;
  if(!draftSql.endsWith(enrichmentSuffix)||draftSql.indexOf(originalEnrichment)!==draftSql.lastIndexOf(originalEnrichment)){
    throw new Error('Frozen enrichment does not exactly match the original source batch; refusing to replace it.');
  }
  const baseDraft=draftSql.slice(0,-enrichmentSuffix.length)+'\ncommit;\n';
  const match=baseDraft.match(/jsonb_array_elements\(\$sofimport\$([\s\S]*?)\$sofimport\$::jsonb\)/);
  if(!match||match[1]!==JSON.stringify(items))throw new Error('Unexpected normalized JSON serialization.');
  const parentBlock=`$sofimport$${match[1]}$sofimport$`;
  if(baseDraft.split(parentBlock).length!==3)throw new Error('Expected exactly two original normalized JSON references.');
  const seenAnchor=`$sofimport$${sourceRef}$sofimport$, now(), ${items.length},`;
  if(baseDraft.split(seenAnchor).length!==2)throw new Error('Unable to bind the exact parent records_seen field.');
  return {items,baseDraft,parentBlock,seenAnchor,enrichRows};
}

/**
 * Opt-in atomic-only transform. Seed a minimal snapshot for newly added products
 * so the unchanged source patch survives until the final publisher builds the full
 * payload. Lock the same active pointer/release as _admin_refresh_catalog.
 * Fail closed for any compiler-template change; never remove a guessed SQL range.
 */
export function seedDraftCatalogSnapshots(atomicSql,items){
  const supplierMatches=[...atomicSql.matchAll(/^  select internal_id into supplier_value from public\.suppliers where stable_id = ('[^'\r\n]+');$/gm)];
  if(supplierMatches.length!==1)throw new Error('Single-refresh refused: exact compiler supplier binding was not found.');
  const json=JSON.stringify(items),supplierLiteral=supplierMatches[0][1];
  const block=`  if cardinality(added) > 0 then
    perform public._admin_refresh_catalog(added);
    -- Supplier characteristics are shown on the product page from the snapshot payload; later refreshes keep them.
    update public.catalog_product_snapshots snapshot
    set payload = snapshot.payload || jsonb_build_object(
        'source', jsonb_build_object('supplier', ${supplierLiteral}, 'sourceId', item_row.value ->> 'sourceId',
          'sourceCategory', item_row.value ->> 'sourceCategory', 'mappingStatus', 'mapped'),
        'sourceAttributes', item_row.value -> 'characteristics',
        'unmappedAttributes', item_row.value -> 'characteristics'),
      updated_at = now()
    from jsonb_array_elements($sofimport$${json}$sofimport$::jsonb) item_row
    where snapshot.legacy_id = item_row.value ->> 'legacyId'
      and snapshot.snapshot_version = (select snapshot_version from public.catalog_snapshot_pointer where singleton)
      and exists (select 1 from public.products product where product.legacy_id = snapshot.legacy_id and product.internal_id = any(added));
  end if;

`;
  const anchored=block+'  update public.import_runs\n';
  if(atomicSql.split(anchored).length!==2)throw new Error('Single-refresh refused: exact compiler draft-refresh block/anchor differs.');
  if((atomicSql.match(/^    perform public\._admin_refresh_catalog\(added\);$/gm)||[]).length!==1||
     (atomicSql.match(/^  perform public\._admin_refresh_catalog\(target_ids\);$/gm)||[]).length!==1){
    throw new Error('Single-refresh refused: expected one draft and one atomic-publication refresh.');
  }
  const refresh='    perform public._admin_refresh_catalog(added);';
  const seed=`    -- Atomic publication builds the full payload once; preserve source fields in a locked minimal seed.
    declare
      seed_active_version text;
      seed_base_sort integer;
    begin
      select pointer.snapshot_version into seed_active_version
      from public.catalog_snapshot_pointer pointer
      join public.catalog_snapshot_releases release on release.snapshot_version = pointer.snapshot_version and release.ready
      where pointer.singleton
      for update of pointer, release;
      if seed_active_version is null then raise exception 'Active catalogue release not found'; end if;

      select coalesce(max(snapshot.sort_order), -1) + 1 into seed_base_sort
      from public.catalog_product_snapshots snapshot where snapshot.snapshot_version = seed_active_version;

      insert into public.catalog_product_snapshots (snapshot_version, legacy_id, sort_order, payload, updated_at)
      select seed_active_version, product.legacy_id,
        seed_base_sort + array_position(added, product.internal_id) - 1,
        jsonb_build_object('id', product.legacy_id), now()
      from public.products product where product.internal_id = any(added)
      on conflict (snapshot_version, legacy_id) do nothing;
    end;`;
  const replacement=block.replace(refresh,seed)+'  update public.import_runs\n';
  const sql=atomicSql.replace(anchored,replacement);
  assert.deepEqual(readyPayload(sql),items,'Single-refresh changed normalized source values.');
  if((sql.match(/^\s*perform public\._admin_refresh_catalog\(/gm)||[]).length!==1||
     !sql.includes('  perform public._admin_refresh_catalog(target_ids);')){
    throw new Error('Single-refresh refused: final publisher refresh was not preserved exactly once.');
  }
  // The compiler source/sourceAttributes/unmappedAttributes patch is byte-identical.
  assert.equal(sql.replace(seed,refresh),atomicSql,'Single-refresh changed SQL outside the draft refresh call.');
  return {sql};
}

/** A deterministic local transform. Validate the complete frozen parent before applying explicit exclusions. */
export function splitFrozenChunk({draftSql,publicationSql,atomicSql,sourceRef,ids,originalsBySku,excludeIds,singleRefresh=false,maxBytes=600_000,maxRequestBytes=650_000,projectId=null,statementTimeout='45s',lockTimeout='5s'}){
  if(typeof singleRefresh!=='boolean')throw new Error('singleRefresh must be an explicit boolean.');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>650_000)throw new Error('maxBytes must be a positive integer no larger than 650000.');
  if(!Number.isSafeInteger(maxRequestBytes)||maxRequestBytes<1||maxRequestBytes>650_000)throw new Error('maxRequestBytes must be a positive integer no larger than 650000.');
  const {items,baseDraft,parentBlock,seenAnchor,enrichRows}=inspectFrozenParent({draftSql,publicationSql,atomicSql,sourceRef,ids,originalsBySku});
  const exclusions=normalizeExclusionIds(excludeIds);
  const eligible=items.filter(item=>!exclusions.has(item.legacyId));
  const excluded=items.filter(item=>exclusions.has(item.legacyId));
  assert.equal(eligible.length+excluded.length,items.length,'Every parent ID belongs to exactly one scope partition.');
  assert.deepEqual([...eligible,...excluded].map(item=>item.legacyId).sort(),[...ids].sort(),'Exclusions changed the parent identity set.');
  function build(subset){
    const subsetIds=subset.map(item=>item.legacyId);
    const body=baseDraft.split(parentBlock).join(`$sofimport$${JSON.stringify(subset)}$sofimport$`)
      .replace(seenAnchor,`$sofimport$${sourceRef}$sofimport$, now(), ${subset.length},`);
    const draft=body.replace(/\ncommit;\s*$/i,()=>`\n${enrichmentSql(enrichRows(subset),sourceRef)}\ncommit;\n`);
    const publication=makePublication([{sourceRef,ids:subsetIds}]);
    const guards={statementTimeout,lockTimeout};
    const guardedDraft=withTransactionGuards(draft,guards),guardedPublication=withTransactionGuards(publication,guards);
    // Assemble before adding guards so the atomic transaction contains exactly one guard block.
    const combined=atomicPublicationSql(draft,publication);
    const transformed=singleRefresh?seedDraftCatalogSnapshots(combined,subset):null;
    const atomic=withTransactionGuards(transformed?transformed.sql:combined,guards);
    return {sourceRef,ids:subsetIds,items:subset,draftSql:guardedDraft,publicationSql:guardedPublication,atomicSql:atomic,
      draftBytes:Buffer.byteLength(guardedDraft),draftSha256:sha(guardedDraft),
      publicationBytes:Buffer.byteLength(guardedPublication),publicationSha256:sha(guardedPublication),
      atomicBytes:Buffer.byteLength(atomic),atomicSha256:sha(atomic),
      requestBytes:Buffer.byteLength(JSON.stringify({...projectId?{project_id:projectId}:{},query:atomic})),statementTimeout,lockTimeout,
      ...(singleRefresh?{singleRefresh:true,draftRefreshStrategy:'locked-minimal-snapshot-seed'}:{})};
  }
  const parts=[];
  for(let start=0;start<eligible.length;){
    let low=1,high=eligible.length-start,best=null;
    while(low<=high){
      const count=Math.floor((low+high)/2),candidate=build(eligible.slice(start,start+count));
      if(candidate.atomicBytes<=maxBytes&&candidate.requestBytes<=maxRequestBytes){best=candidate;low=count+1;}
      else high=count-1;
    }
    if(!best){const single=build(eligible.slice(start,start+1));throw new Error(`Single product ${eligible[start].sku} exceeds recovery limits (${single.atomicBytes} SQL bytes / ${single.requestBytes} request bytes).`);}
    parts.push({...best,part:parts.length+1,parentProductCount:items.length,
      ...(excludeIds!==undefined?{eligibleProductCount:eligible.length,excludedProductCount:excluded.length,excludedIds:excluded.map(item=>item.legacyId)}:{})});start+=best.ids.length;
  }
  assert.deepEqual(parts.flatMap(part=>part.ids),eligible.map(item=>item.legacyId),'Subdivision changed eligible identity/order.');
  assert.deepEqual(parts.flatMap(part=>part.items),eligible,'Subdivision changed a normalized eligible source value.');
  return parts;
}

function verifiedRead(filename,expectedHash,expectedBytes){
  const buffer=fs.readFileSync(path.resolve(ROOT,filename));
  if(expectedHash&&sha(buffer)!==expectedHash)throw new Error(`Frozen hash changed: ${filename}`);
  if(expectedBytes!==undefined&&buffer.length!==expectedBytes)throw new Error(`Frozen byte count changed: ${filename}`);
  return buffer.toString('utf8');
}
function writeNewOrIdentical(filename,contents){
  if(fs.existsSync(filename)){
    if(!fs.readFileSync(filename).equals(Buffer.from(contents)))throw new Error(`Refusing to overwrite a different recovery artifact: ${filename}`);
    return;
  }
  fs.writeFileSync(filename,contents,{flag:'wx'});
}

export function prepareSubdivisions({manifest:manifestName,chunkNumbers,excludeIds,excludeFile,singleRefresh=false,maxBytes=600_000,maxRequestBytes=650_000,statementTimeout='45s',lockTimeout='5s',output}){
  if(typeof singleRefresh!=='boolean')throw new Error('singleRefresh must be an explicit boolean.');
  const manifestPath=path.resolve(ROOT,manifestName),manifestBytes=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestBytes);
  if(!Array.isArray(chunkNumbers)||!chunkNumbers.length||new Set(chunkNumbers).size!==chunkNumbers.length)throw new Error('Select explicit unpublished parent chunk numbers.');
  for(const n of chunkNumbers)if(!Number.isSafeInteger(n)||n<1||n>manifest.chunks.length)throw new Error(`Invalid one-based chunk number ${n}.`);
  const contiguous=chunkNumbers.every((n,i)=>!i||n===chunkNumbers[i-1]+1);
  if(excludeIds!==undefined&&excludeFile)throw new Error('Use either excludeIds or excludeFile, not both.');
  const exclusionBytes=excludeFile?fs.readFileSync(path.resolve(ROOT,excludeFile)):null;
  const exclusions=normalizeExclusionIds(exclusionBytes?JSON.parse(exclusionBytes):excludeIds);
  const scoped=excludeFile!==undefined||excludeIds!==undefined;
  const allManifestIds=new Set(manifest.chunks.flatMap(parent=>parent.ids));
  assert.equal(allManifestIds.size,manifest.chunks.reduce((n,parent)=>n+parent.ids.length,0),'Frozen release repeats an identity across parents.');
  for(const id of exclusions)if(!allManifestIds.has(id))throw new Error(`Excluded ID does not belong to the frozen release: ${id}`);
  const selection=chunkNumbers.length===1?`chunk-${String(chunkNumbers[0]).padStart(3,'0')}`:
    contiguous?`chunks-${chunkNumbers[0]}-${chunkNumbers.at(-1)}`:`selected-${sha(chunkNumbers.join(',')).slice(0,12)}`;
  const scopeSuffix=scoped?`-scope-${sha([...exclusions].sort().join('\n')).slice(0,12)}`:'';
  const out=path.resolve(ROOT,output||`imports/recoveries/${manifest.jobId}/${selection}${scopeSuffix}${singleRefresh?'-single-refresh':''}`);
  const allowed=['imports/recoveries','tmp'].some(prefix=>out.startsWith(path.resolve(ROOT,prefix)+path.sep));
  if(!allowed||out.startsWith(path.dirname(manifestPath)+path.sep)||out===path.dirname(manifestPath))throw new Error('Recovery output must be a separate workspace tmp/imports/recoveries folder.');
  const originalsBySku=new Map();
  for(const batch of manifest.batches){
    const input=JSON.parse(fs.readFileSync(path.resolve(ROOT,batch.file),'utf8'));
    for(const product of input.products){const key=String(product.sku).trim().toLowerCase();if(originalsBySku.has(key))throw new Error('Cross-batch source SKU collision.');originalsBySku.set(key,product);}
  }
  // Every original frozen SQL/hash and metadata is checked before scope filtering.
  // This includes unselected/all-excluded parents, so exclusions cannot bypass validation.
  if(manifest.metadata)verifiedRead(manifest.metadata.file,manifest.metadata.sha256,manifest.metadata.bytes);
  const selected=new Set(chunkNumbers),verifiedParents=new Map();
  for(let i=0;i<manifest.chunks.length;i++){
    const parent=manifest.chunks[i],number=i+1;
    const draftSql=verifiedRead(parent.file,parent.sha256,parent.bytes);
    const publicationSql=verifiedRead(parent.publicationFile);
    const atomicSql=verifiedRead(parent.atomicFile,parent.atomicSha256,parent.atomicBytes);
    inspectFrozenParent({draftSql,publicationSql,atomicSql,sourceRef:parent.sourceRef,ids:parent.ids,originalsBySku});
    if(selected.has(number))verifiedParents.set(number,{draftSql,publicationSql,atomicSql});
  }
  const all=[],parents=[];
  for(const number of chunkNumbers){
    const parent=manifest.chunks[number-1];
    const {draftSql,publicationSql,atomicSql}=verifiedParents.get(number);
    const eligibleIds=parent.ids.filter(id=>!exclusions.has(id)),excludedIds=parent.ids.filter(id=>exclusions.has(id));
    const parts=splitFrozenChunk({draftSql,publicationSql,atomicSql,sourceRef:parent.sourceRef,ids:parent.ids,originalsBySku,...(scoped?{excludeIds:exclusions}:{}),singleRefresh,maxBytes,maxRequestBytes,projectId:manifest.projectRef,statementTimeout,lockTimeout});
    assert.deepEqual(parts.flatMap(part=>part.ids),eligibleIds,'Derived eligible partition differs from the explicit exclusion set.');
    assert.equal(eligibleIds.length+excludedIds.length,parent.ids.length);
    parents.push({parentChunk:number,sourceRef:parent.sourceRef,parentProductCount:parent.ids.length,eligibleProductCount:eligibleIds.length,excludedProductCount:excludedIds.length,eligibleIds,excludedIds,parts:parts.length,skipped:eligibleIds.length===0});
    for(const part of parts){
      all.push({...part,parentChunk:number,parentAtomicSha256:parent.atomicSha256,parentAtomicFile:parent.atomicFile});
    }
  }
  assert.deepEqual(all.flatMap(part=>part.ids),parents.flatMap(parent=>parent.eligibleIds),'Derived parts do not exactly partition the eligible parent identities.');
  assert.equal(new Set(all.flatMap(part=>part.ids)).size,all.reduce((n,part)=>n+part.ids.length,0),'Derived scope has duplicate eligible IDs.');
  // Generate everything before creating files; the original release files are read-only inputs.
  fs.mkdirSync(out,{recursive:true});
  const chunks=[];
  for(const part of all){
    const base=`${String(part.parentChunk).padStart(3,'0')}-${String(part.part).padStart(3,'0')}`;
    const file=path.join(out,`${base}-draft.sql`),publicationFile=path.join(out,`${base}-publish.sql`),atomicFile=path.join(out,`${base}-atomic.sql`);
    writeNewOrIdentical(file,part.draftSql);writeNewOrIdentical(publicationFile,part.publicationSql);writeNewOrIdentical(atomicFile,part.atomicSql);
    const {items,draftSql,publicationSql,atomicSql,...metadata}=part;
    chunks.push({...metadata,file:path.relative(ROOT,file).replaceAll('\\','/'),publicationFile:path.relative(ROOT,publicationFile).replaceAll('\\','/'),atomicFile:path.relative(ROOT,atomicFile).replaceAll('\\','/'),sha256:part.draftSha256,bytes:part.draftBytes});
  }
  const derived={jobId:manifest.jobId,mode:'local-derived-transport-recovery',parentManifest:path.relative(ROOT,manifestPath).replaceAll('\\','/'),parentManifestSha256:sha(manifestBytes),parentChunks:chunkNumbers,maxBytes,maxRequestBytes,newProducts:all.reduce((n,part)=>n+part.ids.length,0),chunks,
    ...(scoped?{mode:'local-derived-scope-filtered-recovery',
      exclusionFile:excludeFile?path.relative(ROOT,path.resolve(ROOT,excludeFile)).replaceAll('\\','/'):null,
      exclusionFileSha256:exclusionBytes?sha(exclusionBytes):null,requestedExclusionCount:exclusions.size,
      parentProductCount:parents.reduce((n,parent)=>n+parent.parentProductCount,0),
      eligibleProductCount:parents.reduce((n,parent)=>n+parent.eligibleProductCount,0),
      excludedProductCount:parents.reduce((n,parent)=>n+parent.excludedProductCount,0),
      excludedIds:parents.flatMap(parent=>parent.excludedIds),parents}:{}),
    ...(singleRefresh?{singleRefresh:true,draftRefreshStrategy:'locked-minimal-snapshot-seed',sourceContractRequirement:'The unchanged importer source patch populates the minimal draft seed; final publication builds the full payload once using existing_payload. Local DB scenario must pass before use.'}:{}),
    execution:'Not executed. Operator selects only unpublished parent chunks after checking any pending transaction.',
    ownership:'Each part retains its exact parent source_ref; multiple import_runs with that ref are intentional. Audit distinct refs and SUM(records_succeeded), not one run row per parent.',
    transactionGuards:[`set local statement_timeout='${statementTimeout}';`,`set local lock_timeout='${lockTimeout}';`,'set local jit=off;']};
  const derivedFile=path.join(out,'manifest.json');writeNewOrIdentical(derivedFile,JSON.stringify(derived,null,2)+'\n');
  return {manifest:path.relative(ROOT,derivedFile).replaceAll('\\','/'),...derived};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const allowedArgs=new Set(['manifest','chunk','from-chunk','exclude-file','single-refresh','max-bytes','max-request-bytes','statement-timeout','lock-timeout','output']);
    const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const match=/^--([a-z-]+)=(.+)$/.exec(arg);if(!match||!allowedArgs.has(match[1]))throw new Error('Use --manifest=... --chunk=71 or --from-chunk=71 [--exclude-file=imports/exclusions.json] [--single-refresh=true] [--max-bytes=600000] [--statement-timeout=45s] [--output=tmp/...]');return[match[1],match[2]];}));
    if(!args.manifest||(!args.chunk&&!args['from-chunk'])||(args.chunk&&args['from-chunk']))throw new Error('A manifest and exactly one explicit chunk selector are required.');
    if(args['single-refresh']!==undefined&&!['true','false'].includes(args['single-refresh']))throw new Error('Use --single-refresh=true or --single-refresh=false explicitly.');
    const input=JSON.parse(fs.readFileSync(path.resolve(ROOT,args.manifest),'utf8'));
    const chunkNumbers=args.chunk?args.chunk.split(',').map(Number):Array.from({length:input.chunks.length-Number(args['from-chunk'])+1},(_,i)=>Number(args['from-chunk'])+i);
    const result=prepareSubdivisions({manifest:args.manifest,chunkNumbers,...(args['exclude-file']?{excludeFile:args['exclude-file']}:{}),...(args['single-refresh']!==undefined?{singleRefresh:args['single-refresh']==='true'}:{}),...(args['max-bytes']?{maxBytes:Number(args['max-bytes'])}:{}),...(args['max-request-bytes']?{maxRequestBytes:Number(args['max-request-bytes'])}:{}),...(args['statement-timeout']?{statementTimeout:args['statement-timeout']}:{}),...(args['lock-timeout']?{lockTimeout:args['lock-timeout']}:{}),...(args.output?{output:args.output}:{})});
    console.log(JSON.stringify({manifest:result.manifest,parentChunks:result.parentChunks,parts:result.chunks.length,products:result.newProducts,...(result.singleRefresh?{singleRefresh:true}:{}),
      ...(args['exclude-file']?{parentProductCount:result.parentProductCount,eligibleProductCount:result.eligibleProductCount,excludedProductCount:result.excludedProductCount,excludedIds:result.excludedIds,exclusionFileSha256:result.exclusionFileSha256}:{}),
      chunks:result.chunks.map(p=>({parentChunk:p.parentChunk,part:p.part,products:p.ids.length,atomicBytes:p.atomicBytes,requestBytes:p.requestBytes,atomicSha256:p.atomicSha256})),executed:false}));
  }catch(error){console.error(error.stack||error.message);process.exitCode=1;}
}
