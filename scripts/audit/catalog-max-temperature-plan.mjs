// Withdraw a contradicted derived MAX scalar. Never turn its source minimum into a new claimed maximum.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'imports/overnight-audit');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const frozenBytes=fs.readFileSync(path.join(root,'imports/overnight-audit/catalog-repair-plan.json'));
assert.equal(sha(frozenBytes),'254bd0437857c4b90b5b736fa36cde37eb15784f8bfb3803493879121c42bb1f');
const frozen=JSON.parse(frozenBytes),postBySku=new Map(read('imports/overnight-audit/max-temp-review/post510-current.json').map(x=>[x.sku,x]));
const selected=frozen.products.filter(p=>p.sourceChanges.some(s=>s.changes.some(c=>c.feature.code==='EF020023'&&c.rawSignedValue==='-10 °C')));
assert.equal(selected.length,20);assert.equal(postBySku.size,20);const selectedBySku=new Map(selected.map(x=>[x.sku,x]));
const text=fs.readFileSync(path.join(root,'imports/overnight-audit/max-temp-review/10685080.txt'),'utf8').split('\f');
const pdfPath='assets/products/rehau/documents/10685080.pdf',pdfSha256=sha(fs.readFileSync(path.join(root,pdfPath)));
for(const page of [7,8])assert.match(text[page-1],/geeignet von -10 °C bis max\. 95 °C \(gleitend\) und 6 bar/);
const products=[],adjudications=[];
for(const file of read('backups/overnight-2026-11-26/live-manifest.json').files){
 const bytes=fs.readFileSync(path.join(root,'backups/overnight-2026-11-26/live',file.file));assert.equal(sha(bytes),file.sha256);
 for(const [rowIndex,encoded]of JSON.parse(bytes).rows.entries()){
  const record=JSON.parse(Buffer.from(encoded.row_base64,'base64').toString('utf8')),p=record.product;if(!selectedBySku.has(p.sku))continue;
  const reviewed=selectedBySku.get(p.sku),source=record.sources[0],e=source.raw_payload.sourceEvidence,current=postBySku.get(p.sku);
  const applied=reviewed.sourceChanges.find(s=>s.sourceRecordId===source.internal_id);assert.ok(applied);
  assert.equal(current.source_record_id,source.internal_id);assert.equal(current.payload_checksum,null);assert.equal(e.exactSku,p.sku);
  assert.match(e.sourceTitle,/RAUVIPEX (?:UNO|DUO)/);assert.match(e.sourceDescriptionDe,/-10 °C bis max\. 95 °C \(gleitend\) und 6 bar/);
  const bad=e.sourceEtim.features.filter(f=>f.code==='EF020023');assert.equal(bad.length,1);assert.equal(bad[0].name,'Max. Mediumtemperatur (Dauerbetrieb)');assert.equal(bad[0].value,'-10 °C');
  assert.deepEqual(current.source_characteristics,applied.newCharacteristics,'Current source must be exactly the applied510 result');
  for(const field of ['source_attributes','unmapped_attributes'])assert.deepEqual(current[field],current.source_characteristics,'Exact current public arrays must be coupled');
  const label='Максимальна температура середовища за тривалої роботи',oldCharacteristics=structuredClone(current.source_characteristics);
  const removed=oldCharacteristics.filter(c=>c.label===label);assert.deepEqual(removed,[{label,value:'-10 °C'}]);
  const newCharacteristics=oldCharacteristics.filter(c=>c.label!==label);assert.equal(newCharacteristics.length,oldCharacteristics.length-1);
  const newSeo=reviewed.productChanges.find(c=>c.field==='seo_description')?.new??p.seo_description;
  assert.equal(current.seo_description,newSeo,'Current SEO must match its independently projected post510 state');
  const publicCopy=[p.title,p.description,p.short_description,p.full_description,JSON.stringify(p.description_sections),p.seo_title,newSeo].join('\n');
  assert.ok(!publicCopy.toLocaleLowerCase('uk').includes(label.toLocaleLowerCase('uk')),'A maximum-labelled public clause needs an additional bounded copy repair');
  assert.ok(record.attributes.every(a=>!a.source_label?.includes('Mediumtemperatur')),'Unexpected typed maximum-temperature fact requires separate review');
  const tablePages=[7,8].filter(page=>text[page-1].includes(p.sku)),proof={proofKind:'rehau-max-scalar-contradiction',sku:p.sku,sourceUrl:source.source_url,
   sourceTitle:e.sourceTitle,contradictedFeature:bad[0],exactSkuOriginalProse:e.sourceDescriptionDe,
   officialPdf:{documentId:'10685080',sourceUrl:'https://oxomi.com/portals/api/v1/documents/download?portal=3000126&document=10685080',path:pdfPath,sha256:pdfSha256,
    familyPages:[7,8],exactSkuTablePages:tablePages,temperatureContext:'geeignet von -10 °C bis max. 95 °C (gleitend) und 6 bar',visuallyInspected:true},
   decision:'Withdraw the unreliable derived MAX=-10 scalar. Preserve the exact manufacturer prose interval with its sliding-temperature/6bar qualification and all original ETIM. Do not replace it with an unqualified95 maximum.',
   exactSkuPdfStatus:tablePages.length?'exact-SKU table row and matching family conditions':'current exact-SKU API title/prose; family PDF conditions independently confirm the conflict, but no exact table row was found'};
  const paths=[{path:['sourceAttributes'],oldRows:current.source_attributes,newRows:newCharacteristics},{path:['unmappedAttributes'],oldRows:current.unmapped_attributes,newRows:newCharacteristics}];
  if(current.nested_source_characteristics!==null){assert.deepEqual(current.nested_source_characteristics,oldCharacteristics);paths.push({path:['source','characteristics'],oldRows:oldCharacteristics,newRows:newCharacteristics});}
  products.push({id:p.legacy_id,internalId:p.internal_id,sku:p.sku,expectedStatus:p.publication_status,productMd5AtAudit:record.product_md5,
   sourceBackup:{file:file.file,rowIndex},guardProduct:{legacy_id:p.legacy_id,sku:p.sku,brand_id:p.brand_id,last_import_run_id:p.last_import_run_id},
   productChanges:[],attributeChanges:[],sourceChanges:[{group:'base',kind:'withdraw-contradicted-maximum',proofKind:'rehau-max-scalar-contradiction',
    sourceRecordId:source.internal_id,sourceId:source.source_id,sourceUrl:source.source_url,supplierId:source.supplier_id,importRunId:source.import_run_id,
    payloadChecksumBefore:null,oldCharacteristics,newCharacteristics,authorityGuards:[{path:['sourceEvidence','exactSku'],expected:p.sku},
     {path:['sourceEvidence','sourceEtim'],expected:e.sourceEtim},{path:['sourceEvidence','sourceDescriptionDe'],expected:e.sourceDescriptionDe},
     {path:['sourceEvidence','sourceDescriptionUa'],expected:e.sourceDescriptionUa},{path:['sourceEvidence','sourceTitle'],expected:e.sourceTitle}],proof}],
   displayChanges:[{group:'base',kind:'replace-characteristics',sourceRecordId:source.internal_id,oldRows:oldCharacteristics,newRows:newCharacteristics,paths,proof}],proofs:[proof]});
  adjudications.push({sku:p.sku,id:p.legacy_id,sourceRecordId:source.internal_id,sourceUrl:source.source_url,originalEtimMaximum:'-10 °C',
   exactSkuProseExplicitInterval:true,originalEtimAndProseRetained:true,removedDerivedRows:1,pavChanges:0,copyChanges:0,...proof});
 }
}
assert.equal(products.length,20);assert.equal(adjudications.filter(p=>p.officialPdf.exactSkuTablePages.length).length,17);
products.sort((a,b)=>a.sku.localeCompare(b.sku));adjudications.sort((a,b)=>a.sku.localeCompare(b.sku));
const contentSha256=sha(JSON.stringify(products)),jobId='rehau-max-scalar-repair-20261126-'+contentSha256.slice(0,12);
const plan={format:'sofiivka-catalog-repair-plan-v1',status:'SOURCE-ADJUDICATED-POST510-GUARDS-NOT-APPLIED',jobId,projectRef:'fkjarsouuchjiedrrblc',activeVersion:frozen.activeVersion,
 contentSha256,parentAppliedPlanSha256:sha(frozenBytes),summary:{products:20,sourceMaximumScalarWithdrawals:20,pavChanges:0,productCopyFields:0,exactSkuPdfRows:17,exactSkuApiPlusFamilyPdf:3},
 preserve:['original sourceEvidence/ETIM/prose/URLs','manufacturer qualified interval','all other characteristics','price','SKU','slug','media','documents','PAV'],products};
const target=path.join(out,'rehau-max-temperature-correction-plan.json');fs.writeFileSync(target,JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(path.join(out,'max-temp-review/adjudications.json'),JSON.stringify({status:plan.status,summary:plan.summary,products:adjudications},null,2)+'\n');
console.log(JSON.stringify({status:plan.status,jobId,sha256:sha(fs.readFileSync(target)),summary:plan.summary,hostedConnections:0}));
