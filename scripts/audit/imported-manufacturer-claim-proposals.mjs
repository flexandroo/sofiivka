// Stages exact, source-backed withdrawals of derived claims. Offline only.
// Run after the finite manufacturer-role head plan is frozen. Public arrays
// were captured with 12 bounded SELECTs; no original manufacturer rows change.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT=path.resolve(import.meta.dirname,'../..');
const OUT=path.join(ROOT,'imports/overnight-audit/source-reconciliation');
const read=p=>JSON.parse(fs.readFileSync(path.resolve(ROOT,p),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const clone=v=>structuredClone(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copyFields=['title','short_title','description','short_description','full_description','description_sections','seo_title','seo_description'];
const write=(name,value)=>fs.writeFileSync(path.join(OUT,name),JSON.stringify(value,null,2)+'\n');

function walk(value,transform,prefix,matches) {
  if(typeof value==='string') { const next=transform(value);if(next!==value)matches.push({path:prefix,before:value,after:next});return next; }
  if(Array.isArray(value))return value.map((v,i)=>walk(v,transform,`${prefix}[${i}]`,matches));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,transform,`${prefix}.${k}`,matches)]));
  return value;
}
export function withoutExternalFeature(rows) {
  let removed=0;
  const next=rows.flatMap(row=>{
    if(row.label!=='Виконання'||typeof row.value!=='string')return[clone(row)];
    const tokens=row.value.split(';').map(x=>x.trim()),kept=tokens.filter(x=>{if(x==='Зовнішня різьба'){removed++;return false;}return true;});
    if(kept.length===tokens.length)return[clone(row)];
    return kept.length?[{...clone(row),value:kept.join('; ')}]:[];
  });return {rows:next,removed};
}
export function withoutExternalCopy(text) {
  return text.replace(/;\s*Зовнішня різьба(?=[;,\.\s…]|$)/gu,'')
    .replace(/Зовнішня різьба\.\s*/gu,'')
    .replace(/;\s*Зовнішня(?: різьба)?…$/gu,'');
}
const materialRow=row=>row.label==='Матеріал'&&row.value==='Латунь'||row.label==='Матеріал корпусу за паспортом серії'&&/Латунь CW617N/.test(row.value);
const boxFluidRow=row=>materialRow(row)||/^(?:Мінімальна температура:|Максимальна температура:|Температура системи:|Максимальний робочий тиск:|Умова для мінусової температури:)/u.test(row.label);
export function withoutUnprovenMaterialCopy(text) {
  return text.replace('Корпус виготовлено з латуні, гільзу — з нержавіючої сталі AISI 304.','Гільзу виготовлено з нержавіючої сталі AISI 304.')
    .replace(/(?:,\s*|;\s*)матеріал Латунь(?=[,.\s…]|$)/gu,'')
    .replace(/матеріал Латунь(?:,\s*|;\s*)/gu,'');
}

if(process.argv.includes('--self-test')) {
  const input=[{label:'Виконання',value:'Нікельоване покриття; Внутрішня різьба; Зовнішня різьба'},{label:'Розмір приєднання',value:'1/2"×16'},{label:'Матеріал',value:'Латунь'}];
  const next=withoutExternalFeature(input);assert.equal(next.removed,1);assert.equal(next.rows[0].value,'Нікельоване покриття; Внутрішня різьба');assert.deepEqual(input[1],next.rows[1]);assert.deepEqual(input[2],next.rows[2]);
  assert.equal(withoutExternalFeature(next.rows).removed,0);
  assert.equal(withoutExternalCopy('Внутрішня різьба. Зовнішня різьба. Кут 90°.'),'Внутрішня різьба. Кут 90°.');
  assert.equal(withoutExternalCopy('виконання Внутрішня різьба; Зовнішня різьба. Фото.'),'виконання Внутрішня різьба. Фото.');
  assert.equal(withoutExternalCopy('Внутрішня різьба; Зовнішня…'),'Внутрішня різьба');
  assert.equal(withoutUnprovenMaterialCopy('Корпус виготовлено з латуні, гільзу — з нержавіючої сталі AISI 304.'),'Гільзу виготовлено з нержавіючої сталі AISI 304.');
  assert.equal(materialRow({label:'Матеріал напрямної за паспортом',value:'Оцинкована сталь'}),false);
  console.log(JSON.stringify({status:'PASS',selfTests:10}));
  if(process.argv.includes('--self-test-only'))process.exit(0);
}

const coverage=read('imports/overnight-audit/source-reconciliation/coverage.json');
const scope=read('imports/overnight-audit/source-reconciliation/correction-female-scope.json');
const ambiguity=read('imports/overnight-audit/source-reconciliation/ambiguities.json');
const heads=read('imports/overnight-audit/source-reconciliation/correction-plan.json');
assert.equal(heads.summary.products,326);assert.equal(heads.summary.headProducts,306);assert.equal(heads.summary.categoryMoves,33);
const headMap=new Map(heads.products.map(p=>[p.id,p]));
const beforeBytes=fs.readFileSync(path.join(OUT,'correction-public-before.json')),before=JSON.parse(beforeBytes);
assert.equal(before.activeVersion,heads.activeVersion);assert.equal(before.products.length,595);
const publicMap=new Map(before.products.map(p=>[p.legacy_id,p]));
const taxonomy=read('backups/overnight-2026-11-26/live/taxonomy.json')[0].data;
const defs=new Map(taxonomy.attribute_definitions.map(x=>[x.internal_id,x.stable_id]));
const female=scope.products.filter(x=>! /UNION|\bNIPPLE\b|\bMALE\b|[MF]\s*[/\-]\s*[MF]/.test(x.source));
assert.equal(female.length,587);const females=new Set(female.map(x=>x.id));
const materials=ambiguity.filter(x=>x.code==='model-vs-series-material-conflict');assert.equal(materials.length,6);
const materialIds=new Set(materials.map(x=>x.id));
const boxes=ambiguity.filter(x=>x.code==='accessory-material-inheritance-not-proven');assert.equal(boxes.length,2);
const boxIds=new Set(boxes.map(x=>x.id));
const wanted=new Set([...females,...materialIds,...boxIds]);assert.equal(wanted.size,595);
const pages=new Map(),products=[],unresolved=[];

for(const entry of coverage.filter(x=>wanted.has(x.id))) {
  if(!pages.has(entry.backupFile))pages.set(entry.backupFile,read(entry.backupFile));
  const record=JSON.parse(Buffer.from(pages.get(entry.backupFile).rows[entry.rowIndex].row_base64,'base64').toString('utf8')),original=record.product,p=clone(original);
  for(const change of headMap.get(entry.id)?.productChanges||[])p[change.field]=clone(change.new);
  const kind=females.has(entry.id)?'gf-female-only-connection':boxIds.has(entry.id)?'gf-nonfluid-installation-box':'gf-unproven-material';
  const source=record.sources.find(s=>s.active),ev=source.raw_payload.sourceEvidence;
  assert.equal(ev.manufacturerDescription,entry.sourceName,'Exact manufacturer role/source binding');
  assert.ok(ev.manufacturerForm&&ev.familyUrl);assert.equal(source.payload_checksum,null);
  const old=source.raw_payload.characteristics;assert.ok(Array.isArray(old));
  let next,removed;
  if(kind==='gf-female-only-connection') {const result=withoutExternalFeature(old);next=result.rows;removed=result.removed;assert.equal(removed,1,entry.sku);}
  else {const predicate=kind==='gf-nonfluid-installation-box'?boxFluidRow:materialRow;next=old.filter(r=>!predicate(r)).map(clone);removed=old.length-next.length;assert.ok(removed>=2,entry.sku);if(boxIds.has(entry.id))assert.deepEqual(next.map(x=>x.label),['Розмір приєднання']);}
  const proof={kind,sourceName:entry.sourceName,sourceUrl:entry.proof.url,file:entry.proof.file,pointer:entry.proof.pointer,
    decision:kind==='gf-female-only-connection'?'Remove only the unproven external-thread token generated by matching MALE within FEMALE; preserve inner thread, every other feature and all original manufacturer evidence.':kind==='gf-nonfluid-installation-box'?'Withdraw fluid pressure/temperature/glycol and specific material inherited from series3300 fluid fittings; keep model/SKU/variant and do not infer a box material.':'Exact model says BRONZE while generic series sheet says brass; withdraw unproven specific body material, do not assert bronze or plastic.'};
  const sourceChange={group:'manufacturer-claims',proofKind:kind,sourceRecordId:source.internal_id,sourceId:source.source_id,sourceUrl:source.source_url,supplierId:source.supplier_id,importRunId:source.import_run_id,payloadChecksumBefore:source.payload_checksum,
    rawGuardPaths:['manufacturerDescription','manufacturerForm','familyUrl'].map(k=>({path:['sourceEvidence',k],expected:clone(ev[k])})),oldCharacteristics:clone(old),newCharacteristics:next,
    changes:old.flatMap((r,index)=>kind==='gf-female-only-connection'?(same(r,next[index])?[]:[{action:'replace',index,oldRow:clone(r),newRow:clone(next[index])}]):((kind==='gf-nonfluid-installation-box'?boxFluidRow:materialRow)(r)?[{action:'delete',index,oldRow:clone(r),newRow:null}]:[])),proof,
    invariant:'Only derived raw_payload.characteristics changes. Complete sourceEvidence and all original manufacturer/HTML/table identities, URLs, media, price and document evidence remain unchanged.'};
  const item={id:p.legacy_id,internalId:p.internal_id,sku:p.sku,expectedStatus:p.publication_status,productMd5AtAudit:record.product_md5,sourceBackup:{file:entry.backupFile,rowIndex:entry.rowIndex},guardProduct:{legacy_id:p.legacy_id,sku:p.sku,brand_id:p.brand_id,last_import_run_id:p.last_import_run_id},productChanges:[],attributeChanges:[],sourceChanges:[sourceChange],displayChanges:[],proofs:[proof]};
  const publicBefore=publicMap.get(entry.id);assert.ok(publicBefore);assert.equal(publicBefore.source_attribute_rows.length,0,'Do not rewrite original private manufacturer attributes');
  for(const [key,arrayPath]of [['source_attributes',['sourceAttributes']],['unmapped_attributes',['unmappedAttributes']],['nested_source_characteristics',['source','characteristics']]]) {
    const oldRows=publicBefore[key];if(oldRows===null||oldRows===undefined)continue;assert.ok(Array.isArray(oldRows));
    const newRows=kind==='gf-female-only-connection'?withoutExternalFeature(oldRows).rows:oldRows.filter(r=>! (kind==='gf-nonfluid-installation-box'?boxFluidRow:materialRow)(r)).map(clone);
    if(!same(oldRows,newRows))item.displayChanges.push({group:'manufacturer-claims',sourceRecordId:source.internal_id,path:arrayPath,oldRows:clone(oldRows),newRows,proof});
  }
  assert.equal(item.displayChanges.length,2,'Two exact live public source arrays must change');
  if(kind!=='gf-female-only-connection') {
    for(const attr of record.attributes)if(defs.get(attr.attribute_id)==='material'||boxIds.has(entry.id)&&defs.get(attr.attribute_id)==='pressureBar') {
      assert.equal(attr.provenance,'source-confirmed');assert.equal(attr.normalization_rule,'import-standard-v1');
      item.attributeChanges.push({group:'manufacturer-claims',action:'delete',attributeId:attr.attribute_id,stableId:defs.get(attr.attribute_id),oldRow:clone(attr),proof});
    }
    assert.equal(item.attributeChanges.length,boxIds.has(entry.id)?2:1);
  }
  if(boxIds.has(entry.id)) {
    const title=`Монтажна коробка для кутника General Fittings ${p.sku}, єдиний розмір`;
    const intro=`${title} призначена для встановлення сумісного кутника.`,mount='Перед монтажем звірте сумісність кутника та монтажне розташування за документацією виробника.';
    const replacement={title,short_title:title,description:intro,short_description:intro,full_description:intro+'\n\n'+mount,description_sections:[{title:'Застосування',paragraphs:[intro]},{title:'Монтаж і сумісність',paragraphs:[mount]}],seo_title:title,seo_description:`${title}. Фото й документація виробника для перевірки сумісності.`};
    for(const [field,value]of Object.entries(replacement))if(!same(p[field],value))item.productChanges.push({group:'manufacturer-claims',field,old:clone(p[field]),new:value,proof});
  } else {
    const transform=kind==='gf-female-only-connection'?withoutExternalCopy:withoutUnprovenMaterialCopy;
    for(const field of copyFields){if(p[field]===undefined||p[field]===null)continue;const matches=[],nextCopy=walk(p[field],transform,field,matches);if(!same(p[field],nextCopy))item.productChanges.push({group:'manufacturer-claims',field,old:clone(p[field]),new:nextCopy,proof,matches});}
  }
  if(females.has(entry.id))for(const field of copyFields) {
    const value=item.productChanges.find(c=>c.field===field)?.new??p[field];
    if(JSON.stringify(value).includes('Зовнішня різьба'))unresolved.push({id:entry.id,sku:entry.sku,field,reason:'Unsupported external thread literal remains; manual exact text rule required.'});
  }
  products.push(item);
}
assert.equal(products.length,595);assert.equal(unresolved.length,0,JSON.stringify(unresolved));
products.sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
const contentSha256=sha(JSON.stringify(products));
const plan={format:'sofiivka-catalog-repair-plan-v1',status:'SOURCE-REVIEWED-CLAIMS-STAGED-NOT-APPLIED',jobId:'manufacturer-claims-20261126-'+contentSha256.slice(0,12),projectRef:'fkjarsouuchjiedrrblc',activeVersion:before.activeVersion,contentSha256,
  requiresJobId:heads.jobId,requiresHeadPlanSha256:sha(fs.readFileSync(path.join(OUT,'correction-plan.json'))),sourcePublicArraysSha256:sha(beforeBytes),
  guardContract:'Exact SKU/brand/import ownership and full selected old field/PAV/source character arrays, immutable original evidence paths, exact active public arrays. Product copy old values include the frozen head job desired state. No commercial or identity changes.',
  preserve:['amount','old_amount','currency','price_status','inventory_status','SKU','slug','model','publication_status','primary_category_id','manufacturer original sourceEvidence/HTML/table rows/URLs','all original private source attributes','media','documents','source ownership'],
  summary:{products:products.length,femaleOnlySourceProducts:587,unprovenMaterialProducts:6,nonfluidBoxProducts:2,sourceChanges:products.reduce((n,p)=>n+p.sourceChanges.length,0),displayChanges:products.reduce((n,p)=>n+p.displayChanges.length,0),pavDeletes:products.reduce((n,p)=>n+p.attributeChanges.length,0),productCopyChanges:products.reduce((n,p)=>n+p.productChanges.length,0),originalSourceAttributeChanges:0,unresolved:unresolved.length},products};
write('correction-claims-plan.json',plan);
write('correction-claims-review.json',{status:plan.status,summary:plan.summary,excludedMixedOrUnprovenUnions:scope.products.filter(p=>!females.has(p.id)),unresolved,originalManufacturerEvidencePreserved:true,requiresHeadJob:heads.jobId});
console.log(JSON.stringify({status:plan.status,jobId:plan.jobId,summary:plan.summary,sha256:sha(fs.readFileSync(path.join(OUT,'correction-claims-plan.json'))),file:'imports/overnight-audit/source-reconciliation/correction-claims-plan.json',hostedConnections:0}));
