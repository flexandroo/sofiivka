// Exact sealing-cone context repairs, separate from the frozen 510-product repair.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'imports/overnight-audit');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const targets=new Set(['11691691001','12446161001','12446661001']);
const originalPlan=read('imports/overnight-audit/catalog-repair-plan.json');
assert.ok(originalPlan.products.every(x=>!targets.has(x.sku)),'Re-read/project any overlapping source/copy changes first');
const snapshots=new Map(read('imports/overnight-audit/cone-snapshot-arrays-before.json').map(row=>[row.sku,row]));
const manifest=read('backups/overnight-2026-11-26/live-manifest.json');
const taxonomy=read('backups/overnight-2026-11-26/live/taxonomy.json')[0].data;
const angleDefinition=taxonomy.attribute_definitions.find(x=>x.stable_id==='angleDegrees');
const products=[];
for(const file of manifest.files){
  const bytes=fs.readFileSync(path.join(root,'backups/overnight-2026-11-26/live',file.file));assert.equal(sha(bytes),file.sha256);
  for(const [rowIndex,encoded]of JSON.parse(bytes).rows.entries()){
    const record=JSON.parse(Buffer.from(encoded.row_base64,'base64').toString('utf8')),p=record.product;if(!targets.has(p.sku))continue;
    const source=record.sources[0],e=source.raw_payload.sourceEvidence,etim=e.sourceEtim,straight=p.sku==='12446661001';
    assert.equal(e.exactSku,p.sku);assert.equal(source.payload_checksum,null);assert.equal(p.publication_status,'published');
    assert.match(e.sourceDescriptionUa,/зовнішня нарізка з конусом 60°/);
    const feature=etim.features.find(row=>row.name===(straight?'Form':'Winkel'));
    assert.equal(feature.value,straight?'gerade':'90 °');
    assert.equal(etim.class.code,straight?'EC003024':'EC003025');
    const oldCharacteristics=structuredClone(source.raw_payload.characteristics),newCharacteristics=structuredClone(oldCharacteristics);
    const oldLabel=straight?'Кут відводу':'Кут',indexes=oldCharacteristics.map((r,i)=>r.label===oldLabel&&r.value==='60 °'?i:-1).filter(i=>i>=0);
    assert.equal(indexes.length,1,'Exactly one misqualified derived angle row is required');const index=indexes[0];
    if(straight)newCharacteristics[index]={...newCharacteristics[index],label:'Кут конуса'};
    else{newCharacteristics[index]={...newCharacteristics[index],value:'90 °'};newCharacteristics.push({label:'Кут конуса',value:'60 °'});}
    const oldPav=record.attributes.find(a=>a.attribute_id===angleDefinition.internal_id);assert.equal(oldPav.value_number,60);
    const snapshot=snapshots.get(p.sku),paths=[];
    for(const [field,key]of [['sourceAttributes','source_attributes'],['unmappedAttributes','unmapped_attributes']]){
      assert.deepEqual(snapshot[key],oldCharacteristics,'Current active source array must match the exact original guarded source characteristics');
      paths.push({path:[field],oldRows:snapshot[key],newRows:newCharacteristics});
    }
    if(snapshot.nested_source_characteristics!==null){assert.deepEqual(snapshot.nested_source_characteristics,oldCharacteristics);paths.push({path:['source','characteristics'],oldRows:oldCharacteristics,newRows:newCharacteristics});}
    const proof={proofKind:'rehau-cone-angle-context',sourceUrl:source.source_url,sku:p.sku,sourceTitle:e.sourceTitle,
      originalDescription:e.sourceDescriptionUa,etimClass:etim.class,etimFeature:feature,
      decision:straight?'Retain the60° sealing-cone fact under its explicit label; omit the generic angle facet for the straight adapter. Do not infer0° or180° bending convention.'
        :'Retain the60° sealing-cone fact separately; the tee branch angle is90° under the exact-SKU ETIM Winkel feature.'};
    products.push({id:p.legacy_id,internalId:p.internal_id,sku:p.sku,expectedStatus:p.publication_status,productMd5AtAudit:record.product_md5,
      sourceBackup:{file:file.file,rowIndex},guardProduct:{legacy_id:p.legacy_id,sku:p.sku,brand_id:p.brand_id,last_import_run_id:p.last_import_run_id},
      productChanges:[],attributeChanges:[{group:'base',action:straight?'delete':'replace',attributeId:angleDefinition.internal_id,stableId:'angleDegrees',oldRow:oldPav,
        ...(straight?{}:{newValues:{value_number:90,source_label:'Winkel (кут відгалуження)',source_value:'90 °',source_unit:'°',normalization_rule:'exact-ETIM-branch-angle-not-thread-sealing-cone',unit_status:'normalized',provenance:'source-confirmed'}}),proof}],
      sourceChanges:[{group:'base',kind:'cone-angle-context',proofKind:'rehau-cone-angle-context',sourceRecordId:source.internal_id,sourceId:source.source_id,
        sourceUrl:source.source_url,supplierId:source.supplier_id,importRunId:source.import_run_id,payloadChecksumBefore:null,
        oldCharacteristics,newCharacteristics,authorityGuards:[{path:['sourceEvidence','exactSku'],expected:p.sku},
          {path:['sourceEvidence','sourceEtim'],expected:etim},{path:['sourceEvidence','sourceTitle'],expected:e.sourceTitle},
          {path:['sourceEvidence','sourceDescriptionUa'],expected:e.sourceDescriptionUa},
          {path:['sourceEvidence','sourceDescriptionDe'],expected:e.sourceDescriptionDe}],proof}],
      displayChanges:[{group:'base',kind:'replace-characteristics',sourceRecordId:source.internal_id,oldRows:oldCharacteristics,newRows:newCharacteristics,paths,proof}],proofs:[proof]});
  }
}
assert.equal(products.length,3);products.sort((a,b)=>a.sku.localeCompare(b.sku));
const contentSha256=sha(JSON.stringify(products)),jobId='rehau-cone-context-repair-20261126-'+contentSha256.slice(0,12);
const plan={format:'sofiivka-catalog-repair-plan-v1',status:'SOURCE-REVIEWED-PREPARED-NOT-APPLIED',jobId,projectRef:'fkjarsouuchjiedrrblc',
  activeVersion:'ae5db3f38bc5df72c2d0ea11bf95eefaf589867ff011bfa82dd17e1f3805e564',contentSha256,
  sourceManifestSha256:sha(fs.readFileSync(path.join(root,'backups/overnight-2026-11-26/live-manifest.json'))),
  summary:{products:3,typedBranchAngleRepairs:2,typedAngleRemovals:1,sourceCharacteristicContextRepairs:3,productCopyFields:0},
  preserve:['manufacturer original ETIM/description/title','SKU','slug','price','inventory','source ownership','media','documents'],products};
const file=path.join(out,'rehau-cone-correction-plan.json');fs.writeFileSync(file,JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({status:plan.status,jobId,summary:plan.summary,file:'imports/overnight-audit/rehau-cone-correction-plan.json',sha256:sha(fs.readFileSync(file)),hostedConnections:0}));
