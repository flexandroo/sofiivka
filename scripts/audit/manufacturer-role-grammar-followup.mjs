// Copy-only follow-up. Never changes either frozen source-correction plan.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const ROOT=path.resolve(import.meta.dirname,'../..'),OUT=path.join(ROOT,'imports/overnight-audit/source-reconciliation');
const read=p=>JSON.parse(fs.readFileSync(path.resolve(ROOT,p),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const clone=v=>structuredClone(v),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=['description','short_description','full_description','description_sections','seo_title','seo_description'];
const numbers=v=>JSON.stringify(v).match(/\d+(?:[.,]\d+)?/g)||[];
function replace(value,oldSentence,newSentence,prefix,matches){
  if(typeof value==='string'){const next=value.replaceAll(oldSentence,newSentence);if(next!==value)matches.push({path:prefix,before:value,after:next});return next;}
  if(Array.isArray(value))return value.map((x,i)=>replace(x,oldSentence,newSentence,`${prefix}[${i}]`,matches));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v,oldSentence,newSentence,`${prefix}.${k}`,matches)]));
  return value;
}
const heads=read('imports/overnight-audit/source-reconciliation/correction-plan.json'),claims=read('imports/overnight-audit/source-reconciliation/correction-claims-plan.json');
const headHash=sha(fs.readFileSync(path.join(OUT,'correction-plan.json'))),claimHash=sha(fs.readFileSync(path.join(OUT,'correction-claims-plan.json')));
assert.equal(headHash,'e5f34b6c9e0c4c80528e3df56659ef9930a7a62d435e036a1034f684b21a6bd9');assert.equal(claimHash,'e77407d6269cca4f4b343c980062ad95736d8890392e4650e0c962ad0ed98757');
const byClaim=new Map(claims.products.map(x=>[x.id,x])),pages=new Map(),products=[],reviewed=[];
const candidates=heads.products.filter(p=>p.proofs.some(x=>['drainage-filter-pipe-misnamed-treatment-filter','pipe-guide-misnamed-fluid-elbow','elbow-box-misnamed-elbow'].includes(x.code)));
assert.equal(candidates.length,17);
for(const item of candidates){
  const location=item.sourceBackup;if(!pages.has(location.file))pages.set(location.file,read(location.file));
  const record=JSON.parse(Buffer.from(pages.get(location.file).rows[location.rowIndex].row_base64,'base64').toString('utf8')),p=clone(record.product);
  for(const c of item.productChanges)p[c.field]=clone(c.new);
  for(const c of byClaim.get(item.id)?.productChanges||[])p[c.field]=clone(c.new);
  const oldSentence=p.title+' призначений для ',newSentence=p.title+' використовується для ';
  const next={...clone(item),productChanges:[],attributeChanges:[],sourceChanges:[],displayChanges:[],proofs:[{kind:'narrow-post-role-grammar',expectedTitle:p.title,oldSentence,newSentence,sourceAuthority:item.proofs,reason:'Use a gender-neutral verb after the verified feminine physical article head; preserve its exact purpose and every number.'}]};
  for(const field of fields){if(p[field]===undefined||p[field]===null)continue;const matches=[],value=replace(p[field],oldSentence,newSentence,field,matches);if(eq(value,p[field]))continue;assert.deepEqual(numbers(value),numbers(p[field]));next.productChanges.push({group:'base',field,old:clone(p[field]),new:value,matches,proof:next.proofs[0]});}
  reviewed.push({id:item.id,sku:item.sku,title:p.title,changes:next.productChanges.length});
  if(next.productChanges.length)products.push(next);
}
assert.equal(products.length,8);assert.ok(products.every(x=>x.sku.startsWith('DRN')));
assert.equal(products.reduce((n,p)=>n+p.productChanges.length,0),32);
const contentSha256=sha(JSON.stringify(products));
const plan={format:'sofiivka-catalog-repair-plan-v1',status:'REVIEWED-GROUPS-STAGED-NOT-APPLIED',jobId:'manufacturer-role-grammar-20261126-'+contentSha256.slice(0,12),projectRef:heads.projectRef,activeVersion:heads.activeVersion,sourceManifestSha256:heads.sourceManifestSha256,sourceProductMd5Aggregate:heads.sourceProductMd5Aggregate,contentSha256,requiresJobs:[heads.jobId,claims.jobId],requiresPlanHashes:{heads:headHash,claims:claimHash},guardContract:'Exact post-head/post-claim old technical copy fields and exact new head/brand/model/title + old verb sentence. No arbitrary global verb replacement.',preserve:heads.preserve,summary:{products:8,baseProductCopyFields:32,categoryMoves:0,baseAttributeChanges:0,sourceChanges:0,displayChanges:0,signedSourceProducts:0,scopeDrafts:0,reviewedFeminineHeads:17},products};
fs.writeFileSync(path.join(OUT,'correction-grammar-followup-plan.json'),JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(path.join(OUT,'correction-grammar-review.json'),JSON.stringify({status:'PASS',reviewed,unchangedFrozenPlanHashes:{heads:headHash,claims:claimHash},numbersPreserved:true},null,2)+'\n');
console.log(JSON.stringify({status:plan.status,jobId:plan.jobId,summary:plan.summary,sha256:sha(fs.readFileSync(path.join(OUT,'correction-grammar-followup-plan.json'))),hostedConnections:0}));
