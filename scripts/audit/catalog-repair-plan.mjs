// Prepare reviewable technical-only repair manifests from the frozen live export. Never connects to a database.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {equivalentCharacteristic,fold,normalizedTechnicalText,parseScalar,text} from './catalog-fact-rules.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..'),OUT=path.join(ROOT,'imports/overnight-audit');
const EXPORT=path.join(ROOT,'backups/overnight-2026-11-26'),ACTIVE='ae5db3f38bc5df72c2d0ea11bf95eefaf589867ff011bfa82dd17e1f3805e564';
const read=file=>JSON.parse(fs.readFileSync(path.resolve(ROOT,file),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const clone=v=>structuredClone(v),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const COPY_FIELDS=['description','short_description','full_description','description_sections','seo_title','seo_description'];
const write=(name,data)=>fs.writeFileSync(path.join(OUT,name),JSON.stringify(data,null,2)+'\n');

// Match a whole, labelled source quantity; never replace arbitrary occurrences of its number.
function flexibleLiteral(s){
  let out='';const chars=[...String(s)];
  for(let i=0;i<chars.length;i++){
    const c=chars[i];if(/\s/.test(c)){if(!out.endsWith('\\s*'))out+='\\s*';}
    else if(/[.,]/.test(c)&&/\d/.test(chars[i-1]||'')&&/\d/.test(chars[i+1]||''))out+='[.,]';
    else if(/[-–—]/.test(c))out+='[-–—]';
    else if(/[°º]/.test(c))out+='[°º]';else out+=esc(c);
  }return out;
}
export function repairSignedText(input,label,oldValue){
  const pattern=new RegExp(`(${flexibleLiteral(label)}\\s*(?::|：)?\\s*)(${flexibleLiteral(oldValue)})(?![\\d])`,'giu');
  let count=0;const value=String(input).replace(pattern,(_,prefix,original)=>{count++;return prefix+'-'+original;});
  return {value,count};
}
export function qualifyDepthText(input,number){
  const n=String(number),label='(?<![\\p{L}])(?:глубина|глибина)(?![\\p{L}])';
  const patterns=[new RegExp(`(${label})(\\s*(?::|：)?\\s*${esc(n)}(?:[.,]0+)?\\s*(?:мм|mm)(?![\\p{L}\\d]))`,'giu'),
    new RegExp(`(${label})(\\s*,?\\s*(?:мм|mm)\\s*[:：]?\\s*${esc(n)}(?:[.,]0+)?(?![\\d]))`,'giu')];
  let value=String(input),count=0;for(const pattern of patterns)value=value.replace(pattern,(_,unused,suffix)=>{count++;return 'Глибина топки'+suffix;});
  return {value,count};
}
export function correctFlowText(input){
  const pattern=/(?<![\d.,])25(?:[ \u00a0\u202f]?000)(?:[.,]0+)?(\s*(?:м[³3]\s*\/\s*год|m[³3]\s*\/\s*h))(?![\p{L}])/giu;
  let count=0;const value=String(input).replace(pattern,(_,unit)=>{count++;return '25'+unit;});return {value,count};
}
function mapStrings(value,transform,pathPrefix='',matches=[]){
  if(typeof value==='string'){const result=transform(value);if(result.count)matches.push({path:pathPrefix,count:result.count,before:value,after:result.value});return result.value;}
  if(Array.isArray(value))return value.map((v,i)=>mapStrings(v,transform,`${pathPrefix}[${i}]`,matches));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mapStrings(v,transform,pathPrefix?`${pathPrefix}.${k}`:k,matches)]));
  return value;
}
function addCopyChanges(item,record,group,transform,proof){
  for(const field of COPY_FIELDS){
    const old=record.product[field];if(old===null||old===undefined)continue;
    const matches=[],next=mapStrings(old,transform,field,matches);if(equal(old,next))continue;
    const previous=item.productChanges.find(c=>c.field===field);
    assert.ok(!previous,'Two independent rules attempted to change one product field; merge explicitly');
    item.productChanges.push({group,field,old:clone(old),new:next,proof,matches});
  }
}
function ensureItem(items,record,location){
  const p=record.product;if(!items.has(p.legacy_id))items.set(p.legacy_id,{id:p.legacy_id,internalId:p.internal_id,sku:p.sku,expectedStatus:p.publication_status,
    productMd5AtAudit:record.product_md5,sourceBackup:location,guardProduct:{legacy_id:p.legacy_id,sku:p.sku,brand_id:p.brand_id,last_import_run_id:p.last_import_run_id},
    productChanges:[],attributeChanges:[],sourceChanges:[],displayChanges:[],proofs:[]});
  return items.get(p.legacy_id);
}

export function deriveSignedSourceChanges(record,labels){
  const sourceChanges=[];
  for(const source of record.sources||[]){
    const features=source.raw_payload?.sourceEvidence?.sourceEtim?.features||[],chars=source.raw_payload?.characteristics;
    if(!Array.isArray(chars)||!features.length)continue;
    const changes=[];const next=clone(chars),used=new Set();
    for(const [featureIndex,feature]of features.entries()){
      const original=String(feature.value??'');if(!/^\s*[-−–]\s*\d/.test(original))continue;
      const label=labels[feature.name];if(!label)continue;
      const positive=original.replace(/^\s*[-−–]\s*/,'');
      const candidates=chars.map((row,index)=>({row,index})).filter(({row})=>fold(row.label)===fold(label)&&/^\s*\d/.test(String(row.value))&&equivalentCharacteristic(`${row.value} ${row.unit||''}`,positive));
      if(!candidates.length)continue;assert.equal(candidates.length,1,'Ambiguous source-sign row binding');
      const {row,index}=candidates[0];assert.ok(!used.has(index),'Multiple negative source features bound one row');used.add(index);
      assert.ok(!String(row.value).includes(';'),'Combined sign values need manual review');
      next[index]={...next[index],value:'-'+row.value};
      changes.push({index,label:row.label,oldValue:row.value,newValue:next[index].value,featureIndex,feature:clone(feature),
        sourceLabel:feature.name,rawSignedValue:original,sourceUrl:source.source_url});
    }
    if(!changes.length)continue;
    assert.equal(source.payload_checksum,null,'A nonnull source checksum needs an explicit upstream/current-payload contract');
    sourceChanges.push({group:'signed',sourceRecordId:source.internal_id,sourceId:source.source_id,sourceUrl:source.source_url,
      supplierId:source.supplier_id,importRunId:source.import_run_id,payloadChecksumBefore:source.payload_checksum,
      checksumContract:'Original normalized import supplied NULL; remain NULL, do not mislabel a current payload as an unchanged upstream capture.',
      oldCharacteristics:clone(chars),newCharacteristics:next,changes,
      featureGuards:changes.map(c=>({index:c.featureIndex,feature:c.feature})),
      invariant:'Only raw_payload.characteristics changes. The complete sourceEvidence/ETIM, URLs, IDs, price/media/FX evidence and every other raw key remain unchanged.'});
  }return sourceChanges;
}

export function preparePlan(){
  const manifestBytes=fs.readFileSync(path.join(EXPORT,'live-manifest.json')),exportManifest=JSON.parse(manifestBytes);
  const labels=read('scripts/import/rehau-label-translations.json'),taxonomy=read('backups/overnight-2026-11-26/live/taxonomy.json')[0].data;
  const defs=new Map(taxonomy.attribute_definitions.map(d=>[d.internal_id,d]));
  const categories=read('imports/overnight-audit/category-proposals-preliminary.json').products;
  assert.equal(categories.length,94,'Root-approved category subset changed');
  const categoryById=new Map(categories.map(p=>[p.id,p]));
  const base=read('imports/overnight-audit/base-review/reviewed-corrections.json');assert.equal(base.length,19);
  const baseById=new Map();for(const p of base){if(!baseById.has(p.id))baseById.set(p.id,[]);baseById.get(p.id).push(p);}
  const depthById=new Map(read('imports/overnight-audit/base-review/approved-copy-labels.json').map(p=>[p.id,p]));assert.equal(depthById.size,13);
  const publicBefore=read('imports/overnight-audit/base-snapshot-arrays-before.json');assert.equal(publicBefore.activeVersion,ACTIVE);
  const publicById=new Map(publicBefore.products.map(p=>[p.legacy_id,p]));assert.equal(publicById.size,13);
  const items=new Map(),signed=[],unresolvedCopy=[],typedSignChecks=[],scope=[];let records=0;
  for(const file of exportManifest.files){
    const absolute=path.join(EXPORT,'live',file.file),bytes=fs.readFileSync(absolute);assert.equal(hash(bytes),file.sha256,'Live source page changed');
    const page=JSON.parse(bytes);assert.equal(page.offset,records,'Live page offset gap');
    for(const [rowIndex,row]of page.rows.entries()){
      records++;const record=JSON.parse(Buffer.from(row.row_base64.replace(/\s/g,''),'base64').toString('utf8')),p=record.product;
      const location={file:path.relative(ROOT,absolute).replaceAll('\\','/'),rowIndex};
      const category=categoryById.get(p.legacy_id);
      if(category){
        assert.equal(p.primary_category_id,category.old);assert.equal(p.publication_status,'published');
        const item=ensureItem(items,record,location);item.productChanges.push({group:'categories',field:'primary_category_id',old:category.old,new:category.proposed,proof:category.evidence});
        item.proofs.push({kind:'manufacturer-class-and-context',...category.evidence});
      }
      if(baseById.has(p.legacy_id)){
        const item=ensureItem(items,record,location);
        for(const approved of baseById.get(p.legacy_id)){
          const oldRow=record.attributes.find(a=>a.attribute_id===approved.currentAttributeRow.attribute_id);
          assert.deepEqual(oldRow,approved.currentAttributeRow,'Reviewed PAV changed');
          const change={group:'base',action:approved.action==='remove-invalid-typed-attribute'?'delete':'replace',attributeId:oldRow.attribute_id,stableId:approved.attribute,oldRow:clone(oldRow),proof:approved};
          if(change.action==='replace')change.newValues={value_number:approved.proposedValue,
            source_label:approved.attribute==='flowM3h'?'Максимальна продуктивність':'Габаритна довжина L (як глибина корпусу)',
            source_value:approved.attribute==='flowM3h'?'25000 l/h':`${approved.proposedValue} мм`,source_unit:approved.attribute==='flowM3h'?'l/h':'мм',
            normalization_rule:approved.attribute==='flowM3h'?'overnight-audit-lph-to-m3h':'overnight-audit-drawing-L-to-body-depth',unit_status:'normalized',provenance:'source-confirmed'};
          item.attributeChanges.push(change);item.proofs.push({kind:'source-reviewed-base-field',attribute:approved.attribute,proofs:approved.proofs,liveProof:approved.liveProof});
        }
        const depth=depthById.get(p.legacy_id);
        if(depth){
          addCopyChanges(item,record,'base',s=>qualifyDepthText(s,depth.fireboxDepthMm),depth);
          const before=publicById.get(p.legacy_id);assert.equal(before.snapshot_version,ACTIVE);
          const paths=[];
          for(const [key,path]of [['source_attributes',['sourceAttributes']],['unmapped_attributes',['unmappedAttributes']],['nested_source_characteristics',['source','characteristics']]]){
            if(before[key]===null&&path.length>1)continue;
            const oldRows=before[key];assert.ok(Array.isArray(oldRows),'Expected exact existing public source array');
            let changed=0;const newRows=oldRows.map(row=>{
              if(!['глубина','глибина'].includes(fold(row.label)))return clone(row);
              const parsed=parseScalar(`${row.value??''} ${row.unit||''}`);
              if(parsed.ok&&parsed.unit==='mm'&&parsed.value===depth.fireboxDepthMm){changed++;return {...clone(row),label:'Глибина топки'};}
              return clone(row);
            });
            // The original normalizer removed the firebox row into the incorrect depth PAV.
            // Restore that proven fact under its correct label in the derived source table.
            if(!newRows.some(row=>fold(row.label)==='глибина топки'&&equivalentCharacteristic(`${row.value} ${row.unit||''}`,`${depth.fireboxDepthMm} мм`))){
              newRows.push({label:'Глибина топки',value:`${depth.fireboxDepthMm} мм`});changed++;
            }
            paths.push({path,oldRows:clone(oldRows),newRows,changedRows:changed});
          }
          item.displayChanges.push({group:'base',kind:'qualify-depth-label',oldLabels:['глубина','глибина'],number:depth.fireboxDepthMm,unit:'мм',newLabel:'Глибина топки',paths,proof:depth.proof,
            preserveRawManufacturerTable:true,reason:'Preserve the proven firebox depth in the public technical table while body depth PAV uses drawing L.'});
        }
        if(p.sku==='1000124')addCopyChanges(item,record,'base',correctFlowText,baseById.get(p.legacy_id)[0].liveProof);
      }
      const sourceChanges=deriveSignedSourceChanges(record,labels);
      if(sourceChanges.length){
        const item=ensureItem(items,record,location);assert.equal(sourceChanges.length,1,'Expected one source per sign repair product');
        item.sourceChanges.push(...sourceChanges);
        for(const source of sourceChanges){
          item.displayChanges.push({group:'signed',kind:'replace-characteristics',sourceRecordId:source.sourceRecordId,oldRows:source.oldCharacteristics,newRows:source.newCharacteristics});
          let changedFields=0;
          for(const correction of source.changes){
            const before=item.productChanges.length;
            addCopyChanges(item,record,'signed',s=>repairSignedText(s,correction.label,correction.oldValue),correction);
            changedFields+=item.productChanges.length-before;
            for(const attr of record.attributes){
              const d=defs.get(attr.attribute_id);if(d?.stable_id==='temperature'&&equivalentCharacteristic(attr.value_text||'',correction.oldValue))typedSignChecks.push({id:p.legacy_id,sku:p.sku,attribute:d.stable_id,oldRow:attr,source:correction,decision:'manual-proof-required-before-any-PAV-change'});
            }
            const unqualified=new RegExp(`(?<![\\p{L}\\d.\\-−–])${flexibleLiteral(correction.oldValue)}(?![\\p{L}\\d])`,'u');
            for(const field of COPY_FIELDS.filter(f=>typeof p[f]==='string'))if(unqualified.test(p[field])&&!item.productChanges.some(c=>c.group==='signed'&&c.field===field)){
              unresolvedCopy.push({id:p.legacy_id,sku:p.sku,field,label:correction.label,oldValue:correction.oldValue,
                reason:'Literal occurs without the exact parameter label; do not globally replace its number.',snippet:p[field].slice(Math.max(0,p[field].indexOf(correction.oldValue)-70),p[field].indexOf(correction.oldValue)+correction.oldValue.length+70)});
            }
          }
          signed.push({id:item.id,internalId:item.internalId,sku:item.sku,expectedStatus:item.expectedStatus,productMd5AtAudit:item.productMd5AtAudit,
            sourceBackup:location,sourceChanges:[source],displayChanges:item.displayChanges.filter(c=>c.group==='signed'),productChanges:item.productChanges.filter(c=>c.group==='signed'),typedPavChanges:0});
        }
      }
      if(p.sku==='10013181001'){
        const source=record.sources.find(s=>s.source_id==='PRGLROUUC03STEMJ19SIEQ4934');assert.ok(source,'Approved scope source absent');
        assert.equal(source.raw_payload?.sourceEvidence?.sourceTitle,'AWADUKT PP Überbrückungskabel für Schweißadapter');assert.equal(p.publication_status,'published');
        const item=ensureItem(items,record,location);const proof={sourceRecordId:source.internal_id,sourceId:source.source_id,sourceUrl:source.source_url,
          exactSku:p.sku,originalTitle:source.raw_payload.sourceEvidence.sourceTitle,reason:'Dedicated jumper cable for a welding adapter; tool accessory excluded by the user no-tools scope.'};
        item.productChanges.push({group:'scope',field:'publication_status',old:'published',new:'draft',proof});item.proofs.push({kind:'approved-no-tools-scope-extension',...proof});scope.push(proof);
      }
    }
  }
  assert.equal(records,19629);assert.equal(signed.length,401,'Signed source repair count differs from independent review');assert.equal(scope.length,1);
  assert.equal(typedSignChecks.length,0,'A signed typed attribute requires an additional reviewed patch');
  const products=[...items.values()].sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
  const contentHash=hash(JSON.stringify(products)),jobId='overnight-catalog-repair-20261126-'+contentHash.slice(0,12);
  const plan={format:'sofiivka-catalog-repair-plan-v1',status:'REVIEWED-GROUPS-STAGED-NOT-APPLIED',jobId,projectRef:'fkjarsouuchjiedrrblc',activeVersion:ACTIVE,
    sourceManifestSha256:hash(manifestBytes),sourceProductMd5Aggregate:exportManifest.productMd5ByLegacyId,contentSha256:contentHash,
    guardContract:'Exact identity/selected technical old values/PAV/source evidence; commercial fields and updated_at are excluded. Replays may no-op only when selected desired values are exact.',
    preserve:['amount','old_amount','currency','price_status','inventory_status','SKU','slug','manufacturer original ETIM/evidence/URLs','media','documents','source ownership','all secondary category links'],
    summary:{products:products.length,categoryMoves:categories.length,baseAttributeChanges:base.length,baseDepthDisplayRules:depthById.size,
      baseProductCopyFields:products.reduce((n,p)=>n+p.productChanges.filter(c=>c.group==='base').length,0),
      signedSourceProducts:signed.length,signedSourceCharacteristicChanges:signed.reduce((n,p)=>n+p.sourceChanges.reduce((s,c)=>s+c.changes.length,0),0),
      signedProductCopyFields:signed.reduce((n,p)=>n+p.productChanges.length,0),signedTypedPavChanges:0,scopeDrafts:scope.length,unqualifiedCopyOccurrences:unresolvedCopy.length},
    products};
  write('catalog-repair-plan.json',plan);
  write('signed-source-repairs.json',{status:'EXACT-SOURCE-SIGN-REPAIRS-STAGED-NOT-APPLIED',count:signed.length,checksumBeforeAllNull:true,originalManufacturerEvidencePreserved:true,products:signed});
  write('signed-publiccopy-review.json',{typedSignChecks,unresolvedCopy,scopeExtension:scope});
  return plan;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const plan=preparePlan();console.log(JSON.stringify({status:plan.status,jobId:plan.jobId,summary:plan.summary,plan:'imports/overnight-audit/catalog-repair-plan.json',hostedConnections:0}));}
  catch(error){console.error(JSON.stringify({status:'FAIL',error:error.message,hostedConnections:0}));process.exitCode=1;}
}
