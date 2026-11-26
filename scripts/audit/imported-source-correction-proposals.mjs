// Prepare exact technical-role repairs from the independent offline source audit.
// No hosted connections, mutations, frozen-batch rebuilds, commits or media writes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {classify} from '../import/general-fittings-editorial.mjs';
import {manufacturerClaimPolicy} from '../import/general-fittings-batch.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..');
const OUT=path.join(ROOT,'imports/overnight-audit/source-reconciliation');
const read=p=>JSON.parse(fs.readFileSync(path.resolve(ROOT,p),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=v=>structuredClone(v);
const numericTokens=v=>JSON.stringify(v).match(/\d+(?:[.,]\d+)?/g)||[];
const fields=['title','short_title','description','short_description','full_description','description_sections','seo_title','seo_description'];
const write=(name,data)=>fs.writeFileSync(path.join(OUT,name),JSON.stringify(data,null,2)+'\n');

export function swapHead(text,oldHead,newHead,identityContext) {
  const pattern=new RegExp(`(?<![\\p{L}])${esc(oldHead)}(?= ${esc(identityContext)})`,'gu');
  let count=0;
  const value=String(text).replace(pattern,()=>{count++;return newHead;});
  return {value,count};
}
function mapStrings(value,transform,prefix,matches=[]) {
  if(typeof value==='string'){const next=transform(value);if(next.count)matches.push({path:prefix,count:next.count,before:value,after:next.value});return next.value;}
  if(Array.isArray(value))return value.map((v,i)=>mapStrings(v,transform,`${prefix}[${i}]`,matches));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mapStrings(v,transform,`${prefix}.${k}`,matches)]));
  return value;
}
function selfTests() {
  const cases=[
    ['STRAIGHT FITTING WITH LOOSE NUT AND FLAT WASHER','Прямий фітинг з накидною гайкою','pipe-fittings'],
    ['ELBOW WITH LOOSE NUT','Кутовий фітинг з накидною гайкою','pipe-fittings'],
    ['NUT','Гайка','pipe-fittings'],['NICKEL-PLATED NUT WITH SEAL FOR COPPER PIPE','Гайка','pipe-fittings'],
    ['BOX FOR ELBOW','Монтажна коробка для кутника','pipe-installation-components'],
    ['BEND FOR PE-X PIPE','Напрямна для згину труби','pipe-installation-components'],
    ['PLASTIC BEND FOR PE-X PIPE','Напрямна для згину труби','pipe-installation-components'],
    ['TEE ELBOW','Кутовий трійник','pipe-fittings'],
    ['NICKEL PLATED VALVE 90° WITH LOOSE NUT AND FLAT WASHER','Кутовий кран з накидною гайкою','shutoff-valves'],
    ['M/F ANGLE WITH NUT AND TAIL WITH BUTTERFLY','Кутовий кульовий кран з накидною гайкою','shutoff-valves'],
    ['EXTENSION FOR IN-WALL BALL-VALVE','Подовжувач для крана прихованого монтажу','pipe-fittings'],
    ['BRACKET AND END FITTINGS','Монтажна планка з фітингами','pipe-fittings'],
    ['FEMALE STRAIGHT FITTING','Прямий фітинг із внутрішньою різьбою','pipe-fittings'],
    ['NICKEL-PLATED FEMALE STRAIGHT FITTING','Прямий фітинг із внутрішньою різьбою','pipe-fittings'],
    ['MALE STRAIGHT FITTING','Ніпель','pipe-fittings'],
    ['M/F STRAIGHT FITTING FOR RADIATOR WITH O-RING','Прямий радіаторний фітинг з ущільнювальним кільцем','pipe-fittings'],
    ['O-RING','Ущільнювальне кільце','pipe-fittings'],
    ['CONICAL SEAT ADAPTOR (O-RING INCLUDED)','Адаптер з конічним сідлом та ущільнювальним кільцем','pipe-fittings'],
    ['FLAT SEAL ADAPTER- 1/2”x16 connection','Адаптер з плоским ущільненням','pipe-fittings'],
    ['FLAT WASHER','Ущільнювальна прокладка','pipe-fittings'],
    ['STRAIGHT FITTING ADAPTER FOR COPPER AND STEEL PIPE','Адаптер для мідної та сталевої труби','pipe-fittings'],
    ['NICKEL-PLATED EUROCONE ADAPTER FOR COPPER/STEEL PIPE- 3/4”x18 connection','Адаптер євроконус для мідної та сталевої труби','pipe-fittings'],
    ['TEE','Трійник','pipe-fittings'],
    ['CHROME-PLATED ANGLE VALVE WITH ROSETTE','Кутовий кран','shutoff-valves'],
    ['CHROME-PLATED ANGLE VALVE WITH ROSETTE AND TRIANGULAR HANDLE','Кутовий кран','shutoff-valves'],
    ['H STRAIGHT VALVE WITH NIPPLES/ADAPTERS KIT','Прямий вентиль','shutoff-valves'],
  ];
  for(const [source,type,category]of cases){const actual=classify(source,'valves/valves-and-taps');assert.equal(actual.type,type,source);assert.equal(actual.category,category,source);}
  for(const source of ['PLATE AND LEVER FOR BUILT-IN VALVE','ADAPTER FOR BALL VALVE','CHROME-PLATED COVER PLATE'])assert.equal(classify(source,'fittings').category,'pipe-fittings',source);
  const female=classify('FEMALE STRAIGHT FITTING','fittings').features;
  assert.ok(female.includes('Внутрішня різьба'));assert.ok(!female.includes('Зовнішня різьба'));
  const mixed=classify('MALE AND FEMALE CONNECTION','fittings').features;
  assert.ok(mixed.includes('Внутрішня різьба')&&mixed.includes('Зовнішня різьба'));
  const input='Гайка General Fittings 3400C7H041622A 1/2"×16. З’єднання з накидною гайкою. Інша гайка General Fittings X.';
  const repaired=swapHead(input,'Гайка','Прямий фітинг з накидною гайкою','General Fittings 3400C7H041622A');
  assert.equal(repaired.count,1);assert.deepEqual(numericTokens(input),numericTokens(repaired.value));
  assert.ok(repaired.value.includes('З’єднання з накидною гайкою. Інша гайка General Fittings X.'));
  const python="import importlib.util\np='scripts/import/valrom-batch.py'\ns=importlib.util.spec_from_file_location('valrom_batch_test',p)\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\na={'name':'FILTRU VALDrain PVC MUFA LISA D125X6 L5M F0,5MM','description':'<p>Tevi din PVC cu fante transversale pentru drenarea apei din sol.</p>'}\nassert m.type_ro(a,'drainage-pipes')=='Дренажна фільтрувальна труба'\nassert m.type_ro({'name':'FILTRU AQUACLEAN','description':''},'wastewater-treatment')=='Фільтр очисної станції'\nassert m.type_ro({'name':'FILTRU VALDrain','description':''},'drainage-pipes')=='Фільтр очисної станції'\nprint('valrom-three-context-cases-PASS')";
  const describedPython=python+"\nitem={'type':'Дренажна фільтрувальна труба','category':'drainage-pipes','characteristics':[],'series':'VALDrain'}\nassert 'використовується для' in m.describe(item,'Дренажна фільтрувальна труба VALROM test')[0]\nitem={'type':'Фільтр очисної станції','category':'wastewater-treatment','characteristics':[],'series':'AquaClean'}\nassert 'призначений для' in m.describe(item,'Фільтр очисної станції VALROM test')[0]\n";
  execFileSync('python',['-c',describedPython],{cwd:ROOT,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8'});
  const capture=read('imports/general-fittings-source.json');
  const fluidRows=[{label:'Максимальний робочий тиск: питне водопостачання',value:'10 бар'},{label:'Мінімальна температура: питне водопостачання',value:'-20°C'}];
  const boxForm=capture.forms.find(f=>f.content==='BOX FOR ELBOW'),bronzeForm=capture.forms.find(f=>f.content==='DOUBLE WALLPLATE ELBOW IN BRONZE WITH 3 HOLES'),ordinary=capture.forms.find(f=>f.content==='DOUBLE STRAIGHT FITTING');
  assert.ok(boxForm&&bronzeForm&&ordinary);
  const boxPolicy=manufacturerClaimPolicy(boxForm,fluidRows,'Compression brass fluid fittings');assert.deepEqual(boxPolicy.familyRows,[]);assert.equal(boxPolicy.allowGenericBodyMaterial,false);assert.ok(!boxPolicy.construction.includes('fluid'));
  const bronzePolicy=manufacturerClaimPolicy(bronzeForm,fluidRows,'Корпус виготовлено з латуні, гільзу — з нержавіючої сталі AISI 304.');assert.equal(bronzePolicy.allowGenericBodyMaterial,false);assert.deepEqual(bronzePolicy.familyRows,fluidRows);assert.equal(bronzePolicy.construction,'Гільзу виготовлено з нержавіючої сталі AISI 304.');
  const ordinaryPolicy=manufacturerClaimPolicy(ordinary,fluidRows,'Ordinary brass compression fitting body');assert.equal(ordinaryPolicy.allowGenericBodyMaterial,true);assert.deepEqual(ordinaryPolicy.familyRows,fluidRows);assert.equal(ordinaryPolicy.construction,'Ordinary brass compression fitting body');
  assert.deepEqual(fluidRows,[{label:'Максимальний робочий тиск: питне водопостачання',value:'10 бар'},{label:'Мінімальна температура: питне водопостачання',value:'-20°C'}]);
  const approved=read('imports/overnight-audit/source-reconciliation/correction-plan.json');
  const expectedById=new Map(approved.products.map(x=>[x.id,x]));
  const current=read('imports/overnight-audit/source-reconciliation/coverage.json').filter(x=>x.brand==='general-fittings');
  assert.equal(current.length,3524);
  for(const entry of current) {
    const form=capture.forms.find(x=>x.link===entry.proof.url&&x.content===entry.sourceName);assert.ok(form,entry.sku);
    const actual=classify(form.content,form.scope),planned=expectedById.get(entry.id);
    const desiredTitle=planned?.productChanges.find(c=>c.field==='title')?.new||entry.currentTitle;
    const desiredCategory=planned?.productChanges.find(c=>c.field==='primary_category_id')?.stableCategory||entry.currentCategory;
    assert.equal(actual.type,desiredTitle.split(' General Fittings ')[0],entry.sku+' physical head');
    assert.equal(actual.category,desiredCategory,entry.sku+' category');
  }
  const report={status:'PASS',physicalRoleCases:cases.length,spareCategoryCases:3,genderCases:2,predicateNumericCase:1,valromContextCases:3,valromVerbCases:2,manufacturerClaimPolicyCases:3,allCurrentGfVariantRoles:current.length,headPlanSha256:sha(fs.readFileSync(path.join(OUT,'correction-plan.json'))),claimsPlanSha256:sha(fs.readFileSync(path.join(OUT,'correction-claims-plan.json')))};
  write('correction-future-regression.json',report);
  return report;
}

async function spotchecks(coverage) {
  const examples=['3400C7H041622A','5300M8N052020A','7100M8N040400A','AC0090H161001H','DRN221041255003','120002H041200A'];
  // Include the audited source heads with the strongest substring traps.
  for(const role of ['FEMALE STRAIGHT FITTING','CONICAL SEAT ADAPTOR (O-RING INCLUDED)','STRAIGHT FITTING ADAPTER FOR COPPER AND STEEL PIPE']) {
    const item=coverage.find(x=>x.sourceName===role);if(item)examples.push(item.sku);
  }
  const work=examples.map(sku=>coverage.find(x=>x.sku===sku)).filter(Boolean),result=[];
  for(let start=0;start<work.length;start+=2) {
    const pair=await Promise.all(work.slice(start,start+2).map(async item=>{
      const response=await fetch(item.proof.url,{headers:{'User-Agent':'SofiivkaSourceAudit/1.0'},signal:AbortSignal.timeout(30000)});
      const bytes=Buffer.from(await response.arrayBuffer()),html=bytes.toString('utf8');
      const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&#(?:x([\da-f]+)|(\d+));/gi,(_,hex,dec)=>String.fromCodePoint(parseInt(hex||dec,hex?16:10))).replace(/&(?:nbsp|amp);/g,' ').replace(/\s+/g,' ');
      const skuPresent=html.includes(item.sku),position=text.indexOf(item.sourceName);
      return {sku:item.sku,url:item.proof.url,httpStatus:response.status,fetchedAt:new Date().toISOString(),bytes:bytes.length,sha256:sha(bytes),exactSkuPresent:skuPresent,sourceHeadPresent:position>=0,sourceHead:item.sourceName,proofExcerpt:position>=0?text.slice(Math.max(0,position-25),position+item.sourceName.length+180):null};
    }));result.push(...pair);
  }
  write('correction-live-spotchecks.json',{status:result.every(x=>x.httpStatus===200&&x.exactSkuPresent&&x.sourceHeadPresent)?'PASS':'REVIEW',checks:result});
  console.log(JSON.stringify({liveSpotchecks:result.length,pass:result.filter(x=>x.httpStatus===200&&x.exactSkuPresent&&x.sourceHeadPresent).length}));
}

export function prepareHeadPlan() {
  const coverage=read('imports/overnight-audit/source-reconciliation/coverage.json');
  const findings=read('imports/overnight-audit/source-reconciliation/findings.json');
  const taxonomy=read('backups/overnight-2026-11-26/live/taxonomy.json')[0].data;
  const cat=new Map(taxonomy.categories.map(x=>[x.stable_id,x.internal_id]));
  const manifestBytes=fs.readFileSync(path.join(ROOT,'backups/overnight-2026-11-26/live-manifest.json'));
  const exportManifest=JSON.parse(manifestBytes),pages=new Map(),items=[];
  for(const entry of coverage) {
    const facts=findings.filter(f=>f.id===entry.id),heads=facts.filter(f=>f.proposedHead),categories=facts.flatMap(f=>f.allowedCategories||[]);
    if(!heads.length&&!categories.length)continue;
    assert.ok(new Set(heads.map(x=>x.proposedHead)).size<=1,'Conflicting source head corrections');
    assert.ok(new Set(categories).size<=1,'Conflicting category corrections');
    if(!pages.has(entry.backupFile))pages.set(entry.backupFile,read(entry.backupFile));
    const record=JSON.parse(Buffer.from(pages.get(entry.backupFile).rows[entry.rowIndex].row_base64,'base64').toString('utf8')),p=record.product;
    assert.equal(p.legacy_id,entry.id);assert.equal(p.sku,entry.sku);assert.equal(record.product_md5,entry.productMd5);
    const item={id:p.legacy_id,internalId:p.internal_id,sku:p.sku,expectedStatus:p.publication_status,productMd5AtAudit:record.product_md5,
      sourceBackup:{file:entry.backupFile,rowIndex:entry.rowIndex},guardProduct:{legacy_id:p.legacy_id,sku:p.sku,brand_id:p.brand_id,last_import_run_id:p.last_import_run_id},
      productChanges:[],attributeChanges:[],sourceChanges:[],displayChanges:[],proofs:facts};
    if(heads.length) {
      const newHead=heads[0].proposedHead;
      const oldHead=entry.brand==='general-fittings'?p.title.split(' General Fittings ')[0]:'Фільтр очисної станції';
      const context=entry.brand==='general-fittings'?`General Fittings ${p.sku}`:'VALROM VALDrain';
      for(const field of fields) {
        if(p[field]===null||p[field]===undefined)continue;
        const matches=[],next=mapStrings(p[field],s=>swapHead(s,oldHead,newHead,context),field,matches);
        if(eq(next,p[field]))continue;
        assert.deepEqual(numericTokens(next),numericTokens(p[field]),`Numeric variant changed: ${p.sku}/${field}`);
        item.productChanges.push({group:'base',field,old:clone(p[field]),new:next,proof:heads,matches,predicate:{kind:'exact-head-and-brand-model-context',oldHead,newHead,identityContext:context}});
      }
      assert.ok(item.productChanges.some(c=>c.field==='title'),`No exact title predicate for ${p.sku}`);
      assert.ok(item.productChanges.every(c=>!eq(c.old,c.new)));
    }
    if(categories.length&&cat.get(categories[0])!==p.primary_category_id)item.productChanges.push({group:'categories',field:'primary_category_id',old:p.primary_category_id,new:cat.get(categories[0]),proof:facts.filter(f=>f.allowedCategories),stableCategory:categories[0]});
    if(item.productChanges.length)items.push(item);
  }
  items.sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
  const headProducts=items.filter(x=>x.productChanges.some(c=>c.field==='title')).length;
  const categoryMoves=items.filter(x=>x.productChanges.some(c=>c.field==='primary_category_id')).length;
  assert.equal(headProducts,306,'Root-approved finite physical-role head subset changed');
  assert.equal(categoryMoves,33,'Root-approved24completevalves+9guides/boxes changed');
  const contentSha256=sha(JSON.stringify(items));
  const plan={format:'sofiivka-catalog-repair-plan-v1',status:'REVIEWED-GROUPS-STAGED-NOT-APPLIED',jobId:'manufacturer-role-repair-20261126-'+contentSha256.slice(0,12),projectRef:'fkjarsouuchjiedrrblc',activeVersion:'ae5db3f38bc5df72c2d0ea11bf95eefaf589867ff011bfa82dd17e1f3805e564',sourceManifestSha256:sha(manifestBytes),sourceProductMd5Aggregate:exportManifest.productMd5ByLegacyId,contentSha256,
    guardContract:'Exact identity and selected old technical fields; predicate-only old head + manufacturer + exact model context. Every numeric token is invariant. Commercial fields excluded from guards and updates.',
    preserve:['amount','old_amount','currency','price_status','inventory_status','SKU','slug','model','manufacturer original sourceEvidence/HTML/rows/URLs','media','documents','source ownership','secondary categories'],
    summary:{products:items.length,headProducts,categoryMoves,baseAttributeChanges:0,baseProductCopyFields:items.reduce((n,p)=>n+p.productChanges.filter(c=>c.group==='base').length,0),signedSourceProducts:0,scopeDrafts:0,sourceChanges:0,displayChanges:0},products:items};
  write('correction-plan.json',plan);
  return {plan,coverage};
}

if(process.argv.includes('--self-test'))console.log(JSON.stringify(selfTests()));
if(!process.argv.includes('--self-test-only')) {
  fs.mkdirSync(OUT,{recursive:true});
  const {plan,coverage}=prepareHeadPlan();
  console.log(JSON.stringify({status:plan.status,jobId:plan.jobId,summary:plan.summary,file:'imports/overnight-audit/source-reconciliation/correction-plan.json',sha256:sha(fs.readFileSync(path.join(OUT,'correction-plan.json'))),hostedConnections:0}));
  if(process.argv.includes('--fetch-spotchecks'))await spotchecks(coverage);
}
