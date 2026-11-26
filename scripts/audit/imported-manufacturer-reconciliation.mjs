// Offline, read-only reconciliation with independently captured manufacturer rows.
// This deliberately does not import any brand collector/normalizer or propose
// missing attributes as wrong facts. All reports stay in ignored imports/.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith('--') && x.includes('=')).map(x => x.slice(2).split(/=(.*)/s).slice(0,2)));
const live = path.resolve(root, args.live || 'backups/overnight-2026-11-26/live');
const output = path.resolve(root, args.output || 'imports/overnight-audit/source-reconciliation');
const expected = {'general-fittings':3524, valrom:3615, tweetop:345, tervix:56, oxi:21};
const clean = v => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const fold = v => clean(v).toLocaleLowerCase('uk').normalize('NFD').replace(/\p{Diacritic}/gu,'');
const skuKey = v => clean(v).toUpperCase();
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = file => path.relative(root,file).replaceAll('\\','/');
const inputs = new Map();
async function read(file) { const absolute=path.resolve(root,file); const bytes=await fs.readFile(absolute); inputs.set(relative(absolute),{bytes:bytes.length,sha256:digest(bytes)}); return JSON.parse(bytes); }
function put(map,key,value) { const k=skuKey(key); if(!k)return; const list=map.get(k)||[];list.push(value);map.set(k,list); }
function num(value) {
  const text=clean(value).replace(/−/g,'-');
  if(!/^[+-]?\d+(?:[.,]\d+)?$/.test(text))return null;
  return Number(text.replace(',','.'));
}
function scalar(value,unit='') {
  const text=clean(value);const match=text.match(/^([+-]?\d+(?:[.,]\d+)?)\s*([^\d]*)$/);
  return match ? {value:num(match[1]),unit:clean(match[2]||unit)} : null;
}
const equal=(a,b)=>typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<=Math.max(1e-8,Math.abs(b)*1e-8):fold(a)===fold(b);
const uniq = list => [...new Set(list)];
function excerpt(v,n=220){return clean(v).slice(0,n);}
function connectionDimensions(value) {
  // Exclude inch fractions and quoted integers before collecting the metric
  // connection ends. This does not convert DN into OD or bag count into size.
  const metric=clean(value).replace(/\d+(?:\s+\d+)?\s*\/\s*\d+\s*["”″]?/g,'').replace(/\d+(?:[.,]\d+)?\s*["”″]/g,'');
  return [...metric.matchAll(/(?:^|[x×\s–-])(\d+(?:[.,]\d+)?)(?=$|[x×\s–-])/g)].map(m=>num(m[1]));
}

if(process.argv.includes('--self-test')) {
  assert.equal(num('87,5'),87.5); assert.equal(num('-20'),-20);
  assert.equal(num('1/2'),null); assert.equal(num('PN20 - PN40'),null);
  assert.equal(num('16x20'),null); assert.equal(num('10/16'),null);
  assert.deepEqual(scalar('3,5 m'),{value:3.5,unit:'m'});
  assert.equal(scalar('1/2 inch'),null);
  assert.deepEqual(connectionDimensions('1/2”x16'),[16]);
  assert.deepEqual(connectionDimensions('16x20'),[16,20]);
  assert.deepEqual(connectionDimensions('3/4”x1/2”'),[]);
  console.log(JSON.stringify({selfTests:11,status:'PASS'}));
  if(process.argv.includes('--self-test-only'))process.exit(0);
}

const taxonomyRaw=await read(path.join(live,'taxonomy.json'));
const taxonomy=taxonomyRaw[0].data;
const brands=new Map(taxonomy.brands.map(x=>[x.internal_id,x.stable_id]));
const categories=new Map(taxonomy.categories.map(x=>[x.internal_id,x.stable_id]));
const definitions=new Map(taxonomy.attribute_definitions.map(x=>[x.internal_id,x.stable_id]));
const options=new Map(taxonomy.attribute_options.map(x=>[x.internal_id,x.value]));
const current=[];
for(const file of (await fs.readdir(live)).filter(f=>/^page-.*\.json$/.test(f)).sort()) {
  const parsed=await read(path.join(live,file));
  for(let index=0;index<parsed.rows.length;index++) {
    const row=JSON.parse(Buffer.from(parsed.rows[index].row_base64,'base64').toString('utf8'));
    const brand=brands.get(row.product.brand_id); if(!Object.hasOwn(expected,brand))continue;
    current.push({brand,category:categories.get(row.product.primary_category_id),...row,backupFile:relative(path.join(live,file)),rowIndex:index,
      typed:Object.fromEntries(row.attributes.map(a=>[definitions.get(a.attribute_id),a.value_number??a.value_text??a.value_boolean??options.get(a.option_id)]))});
  }
}
for(const [brand,n]of Object.entries(expected))assert.equal(current.filter(x=>x.brand===brand).length,n,`${brand} exact snapshot coverage`);
assert.equal(current.length,7561);

const gf=await read('imports/general-fittings-source.json');
const gfFamilies=new Map(gf.families.map(x=>[x.id,x]));
const gfBySku=new Map();
gf.forms.forEach((form,fi)=>form.tables.forEach((table,ti)=>{
  const code=table.headings.findIndex(x=>fold(x)==='code');
  if(code<0)return;
  table.rows.forEach((row,ri)=>put(gfBySku,row[code],{form,family:gfFamilies.get(form.familyId),table,row,
    file:'imports/general-fittings-source.json',pointer:`forms[${fi}].tables[${ti}].rows[${ri}]`,url:form.link}));
}));
const ro=await read('tmp/valrom-source/ro-products.json');
const valromBySku=new Map();ro.forEach((product,index)=>put(valromBySku,product.sku,{product,file:'tmp/valrom-source/ro-products.json',pointer:`[${index}]`,url:product.permalink}));
const price=await read('tmp/valrom-source/price-rows.json');
const priceBySku=new Map();
for(const [sheet,rows]of Object.entries(price))rows.forEach((row,index)=>{
  // The published price workbook has two side-by-side article blocks. A cell
  // is an identity only when followed by an article description, never a price.
  for(const col of [0,6])if(row[col]!==undefined && typeof row[col+1]==='string' && /\d/.test(String(row[col])) && !/\s/.test(String(row[col]))) {
    const item={row,col,sheet,name:row[col+1],rawSku:String(row[col]),file:'tmp/valrom-source/price-rows.json',pointer:`${JSON.stringify(sheet)}[${index}][${col}]`,url:'https://valrom.ua/'};
    put(priceBySku,row[col],item);
  }
});
const workbook=await read('imports/tweetop-workbook.json');
const tweetopBySku=new Map();
workbook.forEach(sheet=>sheet.rows.forEach(row=>{
  const cell=Object.keys(row).find(x=>/^E\d+$/.test(x));if(!cell)return;
  const number=cell.slice(1),sku=row[cell],name=row['F'+number];
  if(!sku||!name)return;
  put(tweetopBySku,sku,{row:number,sheet:sheet.sheet,sku,name,group:row['A'+number],discount:row['B'+number],ean:row['C'+number],pack:row['G'+number],unit:row['H'+number],file:'imports/tweetop-workbook.json',pointer:`${sheet.sheet}!E${number}:H${number}`,url:'https://www.tweetop.pl/'});
}));
const tweetopPdf=await read('imports/tweetop-pdf-source.json');
const tweetopTables=await read('imports/tweetop-technical-source.json');
const tervix=await read('imports/tervix-2026-11-25.source.json');
const tervixBySku=new Map();tervix.forEach((product,index)=>put(tervixBySku,product.sku,{product,file:'imports/tervix-2026-11-25.source.json',pointer:`[${index}]`,url:product.sourceUrl}));
const oxiAudit=await read('imports/oxi-source-audit.json');
const oxiPages=await read('imports/oxi-source-pages.json');
const oxiFeed=await read('imports/oxi-feed.json');
const oxiBySku=new Map();oxiFeed.products.forEach((product,pi)=>(product.editions||[]).forEach((edition,ei)=>{
  const sku=String(edition.sku||'').replace(/С$/u,'C');
  put(oxiBySku,sku,{product,edition,page:oxiPages.find(x=>x.url===product.url),rawSku:edition.sku,file:'imports/oxi-feed.json',pointer:`products[${pi}].editions[${ei}]`,url:product.url});
}));

const coverage=[],findings=[],ambiguities=[],factChecks=[];
function base(row){return {brand:row.brand,sku:row.product.sku,id:row.product.legacy_id,currentTitle:row.product.title,currentCategory:row.category,backupFile:row.backupFile,rowIndex:row.rowIndex,productMd5:row.product_md5};}
function proof(source,more={}) {return {file:source.file,pointer:source.pointer,url:source.url,...more};}
function issue(row,code,detail,source,extra={}) {findings.push({...base(row),code,detail,proof:proof(source),...extra});}
function ambiguous(row,code,detail,source,extra={}) {ambiguities.push({...base(row),code,detail,proof:proof(source),...extra});}
function check(row,attribute,values,source,detail,{strict=true}={}) {
  if(!Object.hasOwn(row.typed,attribute))return;
  const candidates=uniq(values.filter(x=>x!==null&&x!==undefined));if(!candidates.length)return;
  const actual=row.typed[attribute],match=candidates.some(x=>equal(actual,x));
  factChecks.push({brand:row.brand,sku:row.product.sku,attribute,current:actual,sourceValues:candidates,match,proof:proof(source,{detail})});
  if(!match)(strict?issue:ambiguous)(row,`attribute-${attribute}`,detail,source,{attribute,current:actual,sourceValues:candidates});
}
function category(row,allowed,source,detail) {if(!allowed.includes(row.category))issue(row,'physical-role-category',detail,source,{allowedCategories:allowed});}

function matchSource(row,index,{id,url}={}) {
  const list=index.get(skuKey(row.product.sku))||[];
  if(!list.length)return null;
  return list.find(s=>url && clean(s.url).replace(/\/$/,'')===clean(url).replace(/\/$/,'')) || list.find(s=>id && String(s.product?.id??s.product?.sourceId??s.edition?.uid)===String(id)) || list[0];
}

// Separate source-specific extractors are below. Unknown and multi-condition
// quantities remain explicit gaps; an absent normalized value is never an error.
function auditGf(row,source) {
  const {form,family,table}=source;
  const fields=Object.fromEntries(table.headings.map((h,i)=>[h,source.row[i]]));
  const sourceRole=clean(form.content).toUpperCase();
  const properties=(family?.properties||[]).filter(p=>/^(?:Max\. pressure|Press\.max with gasket|Press\.max without gasket)$/.test(p.label));
  const pressure=uniq(properties.filter(p=>/^\s*[\d.,]+\s*bar\s*$/i.test(p.value)).map(p=>num(p.value.replace(/bar/i,''))));
  if(pressure.length===1)check(row,'pressureBar',pressure,source,`${family?.title}: ${properties.map(x=>x.label+'='+x.value).join('; ')}`);
  else if(properties.length&&row.typed.pressureBar!==undefined)ambiguous(row,'family-pressure-conditions','Family gives several conditions/PN ratings; a single unconditional pressure must not be inferred.',source,{current:row.typed.pressureBar,sourceProperties:properties});
  const size=fields.Size;
  // A plain variant size can corroborate a connection dimension. Fractions,
  // DN, fitting body dimensions, manifold ways and bag/box quantities cannot.
  if(size && !/MACHINE|JAW|BOX|HANDLE|BATTERY|TOOL|BRACKET/.test(sourceRole))check(row,'pipeDiameterMm',connectionDimensions(size),source,`Exact SKU row connection Size=${size}; fractions and quoted inch ends excluded, no OD-from-DN inference`,{strict:false});
  if(row.typed.angleDegrees!==undefined) {
    const angle=sourceRole.match(/(?:^|\D)(\d+(?:[.,]\d+)?)\s*(?:°|DEGREE)/);
    if(angle)check(row,'angleDegrees',[num(angle[1])],source,`Exact manufacturer form: ${sourceRole}`);
  }
  if(/^(?:BIG |MINI |AUTOMATIC )?(?:PRESS(?:ING)? MACHINE)|^JAW FOR|^PLASTIC CASE WITH DEBURRING/.test(sourceRole))category(row,['pipe-installation-tools'],source,`The actual article is a tool: ${sourceRole}`);
  else {
    const valve=/\b(?:VALVE|TAP|GATE|LOCKSHIELD)\b/.exec(sourceRole),part=/\b(?:ADAPTER|ADAPTOR|FITTING|EXTENSION|HANDLE|PLATE|BRACKET|NUT|WASHER|SEAL|RING|ROSETTE|BOX)\b/.exec(sourceRole);
    if((valve&&! /SHUT FOR/.test(sourceRole)&&(!part||part.index>valve.index))||sourceRole==='M/F ANGLE WITH NUT AND TAIL WITH BUTTERFLY')category(row,['shutoff-valves'],source,`The actual article is a complete valve (component words after its head are features): ${sourceRole}`);
  }
  if(/^NICKEL PLATED VALVE 90/.test(sourceRole)&&!/^Кран|^Кульов|^Кутов|^Клапан/.test(row.product.title))issue(row,'physical-role-title',`Exact form describes a complete valve, not a loose nut: ${sourceRole}`,source,{sourceTitle:sourceRole,proposedHead:'Кутовий кран з накидною гайкою'});
  if(/^Гайка(?=\s|$)/u.test(row.product.title)&&/^(?:(?:CHROME|NICKEL)[ -]PLATED )?(?:STRAIGHT FITTING|ELBOW) WITH LOOSE NUT/.test(sourceRole))issue(row,'complete-fitting-misnamed-nut',`The manufacturer's grammatical head is a complete fitting/elbow; its loose nut is a feature, not the article itself: ${sourceRole}`,source,{sourceTitle:sourceRole,proposedHead:/ELBOW/.test(sourceRole)?'Кутовий фітинг з накидною гайкою':'Прямий фітинг з накидною гайкою'});
  if(sourceRole==='BOX FOR ELBOW'&&/^Кутник(?=\s|$)/u.test(row.product.title))issue(row,'elbow-box-misnamed-elbow','Official article is the installation box FOR an elbow, not a fluid-carrying elbow.',source,{sourceTitle:sourceRole,proposedHead:'Монтажна коробка для кутника',allowedCategories:['pipe-installation-components']});
  if(sourceRole==='TEE ELBOW'&&/^Кутник(?=\s|$)/u.test(row.product.title))issue(row,'tee-elbow-misnamed-two-port-elbow','Exact manufacturer form is TEE ELBOW and its SKU row has three connection sizes, not a two-port elbow.',source,{sourceTitle:sourceRole,variantSize:fields.Size,proposedHead:'Кутовий трійник'});
  if(sourceRole==='M/F ANGLE WITH NUT AND TAIL WITH BUTTERFLY'&&family?.title==='LINE 7100') {
    if(/^Гайка(?=\s|$)/u.test(row.product.title))issue(row,'butterfly-valve-misnamed-nut','Exact angle article belongs to manufacturer LINE 7100 full-bore ball valves; nut and tail are components, not the whole article.',source,{proposedHead:'Кутовий кульовий кран з накидною гайкою',extraProof:{file:'imports/general-fittings-source.json',pointer:`families[id=${family.id}].sourceText`,url:family.link,quote:'Full bore ball valves - ISO 228/1'}});
  }
  if(sourceRole==='EXTENSION FOR IN-WALL BALL-VALVE'&&/^Кран прихованого монтажу/u.test(row.product.title))issue(row,'valve-extension-misnamed-valve','The exact article is the extension FOR a valve, not a complete valve.',source,{proposedHead:'Подовжувач для крана прихованого монтажу'});
  if(sourceRole==='BRACKET AND END FITTINGS'&&/^Прямий фітинг/u.test(row.product.title))issue(row,'mounting-bracket-kit-misnamed-single-fitting','The exact article combines a bracket and end fittings, rather than a single straight fitting.',source,{proposedHead:'Монтажна планка з фітингами'});
  if(/\bFEMALE STRAIGHT(?: FITTING| TIN PLATED)/.test(sourceRole)&&/^Ніпель/u.test(row.product.title))issue(row,'female-fitting-misnamed-nipple','MALE was matched inside FEMALE. The source identifies the threaded connection as female.',source,{proposedHead:'Прямий фітинг із внутрішньою різьбою'});
  if(/STRAIGHT FITTING.*\bO-RING\b/.test(sourceRole)&&/^Ущільнювальне кільце/u.test(row.product.title))issue(row,'complete-fitting-misnamed-oring','O-ring is a seal of the complete radiator fitting, not the article itself.',source,{proposedHead:'Прямий радіаторний фітинг з ущільнювальним кільцем'});
  if(sourceRole==='CONICAL SEAT ADAPTOR (O-RING INCLUDED)'&&/^Ущільнювальне кільце/u.test(row.product.title))issue(row,'complete-adaptor-misnamed-oring','The manufacturer identifies an adaptor with an included O-ring, not a spare O-ring.',source,{proposedHead:'Адаптер з конічним сідлом та ущільнювальним кільцем'});
  if(/^(?:EUROCONE )?FLAT SEAL ADAPTER/.test(sourceRole)&&/^Ущільнювальна прокладка/u.test(row.product.title))issue(row,'complete-adaptor-misnamed-gasket','The exact article is the adapter; its flat seal describes its connection.',source,{proposedHead:'Адаптер з плоским ущільненням'});
  if(/\bADAPTER\b.*\b(?:COPPER AND STEEL|COPPER\/STEEL) PIPE/.test(sourceRole)&&/^Трійник/u.test(row.product.title))issue(row,'steel-adaptor-misnamed-tee','TEE was matched inside STEEL. The exact article is an adapter for copper/steel pipe, not a tee.',source,{proposedHead:/EUROCONE/.test(sourceRole)?'Адаптер євроконус для мідної та сталевої труби':'Адаптер для мідної та сталевої труби'});
  if(/^(?:PLASTIC )?BEND FOR PE-X PIPE$/.test(sourceRole)&&/^Кутник(?=\s|$)/u.test(row.product.title)) {
    const plastic=/^PLASTIC/.test(sourceRole);
    const pdf=plastic?'assets/products/general-fittings/dts_ac00.70_eng-f1585988c6.pdf':'assets/products/general-fittings/dts_ac00.80_eng-5872c4b132.pdf';
    const pdfUrl=`https://www.generalfittings.it/wp-content/uploads/2026/01/DTS_AC00.${plastic?'70':'80'}_ENG.pdf`;
    issue(row,'pipe-guide-misnamed-fluid-elbow','The manufacturer identifies a holder for cold bending, supporting and protecting the pipe, rather than a fluid-carrying elbow.',source,{proposedHead:'Напрямна для згину труби',extraProof:{file:pdf,url:pdfUrl,page:3,quote:'The pipe holder bend is used for cold bending of pipes. It is also used to support the pipes and protect them from possible impacts.'},allowedCategories:['pipe-installation-components']});
  }
  if(/BRONZE/.test(sourceRole)&&row.typed.material!==undefined)ambiguous(row,'model-vs-series-material-conflict','Exact model name says BRONZE; generic series body table says brass CW617N(/CW612N). No unilateral material substitution.',source,{current:row.typed.material,sourceTitle:sourceRole});
  if(sourceRole==='BOX FOR ELBOW'&&row.typed.material!==undefined)ambiguous(row,'accessory-material-inheritance-not-proven','Generic brass fluid-fitting body table does not independently prove the material of an installation box. Do not guess plastic from appearance.',source,{current:row.typed.material,sourceTitle:sourceRole});
  if(sourceRole==='PLASTIC SLEEVE'||sourceRole==='PLASTIC BEND FOR PE-X PIPE')check(row,'material',['Пластик'],source,`Exact source form: ${sourceRole}`);
  return {sourceName:form.content,variant:fields,role:sourceRole};
}
function valromTerms(product,name){return(product.attributes||[]).filter(a=>a.taxonomy===name).flatMap(a=>(a.terms||[]).map(t=>t.name));}
function auditValrom(row,source) {
  if(!source.product)return auditValromWorkbook(row,source);
  const p=source.product,name=clean(p.name),type=valromTerms(p,'pa_tip-articol').join('; '),attr=Object.fromEntries((p.attributes||[]).map(a=>[a.taxonomy,(a.terms||[]).map(t=>t.name)]));
  const drainageFilterPipe=/^FILTRU VALDrain/i.test(name)&&/Tevi din PVC cu fante transversale/i.test(p.description||'');
  const flexibleSanitaryConnector=/FLEX\.|FLEXIBIL|GOFRAT/i.test(name)&&/ACCESORII CANALIZARE INTERIOARA/i.test(valromTerms(p,'pa_subclasa').join(' '));
  const pipe=(/^(?:TUB|TEAVA|ȚEAVĂ|RULOU)\b/i.test(name)||/^(?:TUB|TEAVA)$/i.test(type)||drainageFilterPipe)&&!flexibleSanitaryConnector;
  if(pipe) {
    const lengths=valromTerms(p,'pa_lungime').map(x=>scalar(x)).filter(Boolean).filter(x=>x.value>0).map(x=>x.value*(/^m$/i.test(x.unit)?1000:/^mm$/i.test(x.unit)?1:NaN)).filter(Number.isFinite);
    const titleLength=name.match(/\bL\s*=?\s*(\d+(?:[.,]\d+)?)\s*(mm|m)\b/i);
    const fromTitle=titleLength?[num(titleLength[1])*(titleLength[2].toLowerCase()==='m'?1000:1)]:[];
    const candidates=uniq([...lengths,...fromTitle]);
    if(lengths.length&&fromTitle.length&&!lengths.some(x=>equal(x,fromTitle[0])))ambiguous(row,'manufacturer-length-conflict','Exact item title and API length attribute disagree; do not overwrite either automatically.',source,{titleLengthMm:fromTitle[0],apiLengthMm:lengths});
    check(row,'pipeLengthMm',candidates,source,`Exact pipe article length; title=${name}; API=${valromTerms(p,'pa_lungime').join('; ')}`);
    category(row,['external-sewer-pipes','internal-sewer-pipes','drainage-pipes'],source,`Source article is a pipe (${type}): ${name}`);
  } else if(row.typed.pipeLengthMm!==undefined)issue(row,'non-pipe-length','Normalized pipe length is assigned to an article not identified as a pipe.',source,{sourceType:type,sourceTitle:name,current:row.typed.pipeLengthMm});
  const angles=valromTerms(p,'pa_unghi').map(x=>scalar(x)).filter(Boolean).map(x=>x.value).filter(x=>x>0);
  const titleAngle=name.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:GRD|GRADE|°)/i);
  const titleAngles=titleAngle?[num(titleAngle[1])]:[];
  const uaWorkbook=(priceBySku.get(skuKey(row.product.sku))||[])[0];
  const uaAngle=uaWorkbook?.name.match(/(\d+(?:[.,]\d+)?)\s*[°º]\s*(?:(\d+)\s*['′])?/);
  const workbookAngles=uaAngle?[num(uaAngle[1])+(uaAngle[2]?Number(uaAngle[2])/60:0)]:[];
  if(angles.length&&titleAngles.length&&!angles.some(x=>equal(x,titleAngles[0])))ambiguous(row,'manufacturer-angle-conflict','Exact SKU title angle and API angle field differ (often nominal vs coarse option); current may legitimately preserve the article title.',source,{apiAngles:angles,titleAngle:titleAngles[0],current:row.typed.angleDegrees});
  if(workbookAngles.length&&[...angles,...titleAngles].some(x=>!equal(x,workbookAngles[0])))ambiguous(row,'ua-ro-angle-precision-conflict','Official UA workbook carries degrees and arcminutes, while RO uses coarse whole degrees. Both source variants retained; no automatic overwrite.',source,{roAngles:uniq([...angles,...titleAngles]),workbookAngles,uaProof:proof(uaWorkbook,{name:uaWorkbook.name})});
  check(row,'angleDegrees',uniq([...angles,...titleAngles,...workbookAngles]),source,`Exact article: ${name}; API pa_unghi=${valromTerms(p,'pa_unghi').join('; ')}${uaWorkbook?'; UA workbook='+uaWorkbook.name:''}`);
  // An unqualified Diametru, DN or a fitting main dimension cannot prove OD.
  if(row.typed.pipeDiameterMm!==undefined) {
    const explicit=name.match(/\bD\.?\s*(\d+(?:[.,]\d+)?)(?=\s*(?:[xX×]|mm\b|$|\s))/);
    if(explicit&&!/\bDN\b/.test(name))check(row,'pipeDiameterMm',[num(explicit[1])],source,`Explicit D in exact article name: ${name}`,{strict:false});
    else ambiguous(row,'diameter-domain-not-proven','API Diametru alone does not distinguish DN, OD or a fitting connection; no numeric correction inferred.',source,{sourceTitle:name,apiDiameter:attr.pa_diametru,current:row.typed.pipeDiameterMm});
  }
  if(drainageFilterPipe&&/Фільтр очисної станції/.test(row.product.title))issue(row,'drainage-filter-pipe-misnamed-treatment-filter','Manufacturer describes PVC pipes with transverse slots for draining soil water, not a sewage treatment station filter.',source,{sourceName:name,sourceDescription:excerpt(p.description,350),proposedHead:'Дренажна фільтрувальна труба'});
  return {sourceName:name,sourceType:type,availableAttributeKeys:Object.keys(attr),role:pipe?'pipe':flexibleSanitaryConnector?'flexible-sanitary-connector':type||'manufacturer-category',sourceCategories:(p.categories||[]).map(c=>c.slug),...(uaWorkbook?{uaWorkbookProof:proof(uaWorkbook,{name:uaWorkbook.name})}:{})};
}
function auditValromWorkbook(row,source) {
  const name=clean(source.name),pipe=/^Труба(?=\s|$)/iu.test(name)||/^Труба/.test(source.sheet);
  if(pipe) {
    const l=name.match(/\bL\s*=?\s*(\d+(?:[.,]\d+)?)(?:\s*(мм|mm|м|m))?/i);
    if(l)check(row,'pipeLengthMm',[num(l[1])*(l[2]&&/^(?:м|m)$/.test(l[2])?1000:1)],source,`Workbook exact SKU pipe: ${name}`);
  }
  return {sourceName:name,role:pipe?'pipe':'manufacturer-workbook-article',rawSku:source.rawSku,sheet:source.sheet};
}
function auditTweetop(row,source) {
  const pipe=/^Rura\b/i.test(source.name),name=clean(source.name);
  if(pipe) {
    const dimension=name.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
    const length=name.match(/(\d+(?:[.,]\d+)?)\s*mb$/i);
    if(dimension){check(row,'pipeDiameterMm',[num(dimension[1])],source,`Exact workbook pipe D×s: ${name}`);check(row,'pipeWallThicknessMm',[num(dimension[2])],source,`Exact workbook pipe D×s: ${name}`);}
    if(length)check(row,'pipeLengthMm',[num(length[1])*1000],source,`Exact workbook pipe length in metres: ${name}`);
    category(row,['water-heating-pipes'],source,`Actual pipe, ${source.name}`);
  } else if(row.typed.pipeLengthMm!==undefined)issue(row,'non-pipe-length','Non-pipe article has normalized pipe length.',source,{sourceName:name,current:row.typed.pipeLengthMm});
  const angle=name.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*°/);
  if(angle)check(row,'angleDegrees',[num(angle[1])],source,`Exact workbook item angle: ${name}`);
  const tool=/^(?:Szczęka|Zaciskarka|Kamienie do zaciskarki|Nożyce|Obcinak|Ostrze do nożyc|Kalibrator|Uchwyt ręczny do kalibratora|Zestaw kalibratorów|Giętarka|Sprężyna|Taker$|Rozwijak)/i.test(name);
  if(tool)category(row,['pipe-installation-tools'],source,`Actual reusable installation tool: ${name}`);
  if(!pipe&&!tool&&/^(?:Złączka|Kolano|Trójnik|Zaślepka|Półśrubunek)/i.test(name))category(row,['pipe-fittings'],source,`Actual fitting: ${name}`);
  if(source.ean){const currentEan=row.sources.find(s=>s.raw_payload?.ean)?.raw_payload.ean;if(currentEan&&String(currentEan)!==String(source.ean))issue(row,'ean-exact-variant',`Workbook EAN differs from stored source EAN.`,source,{current:currentEan,sourceEan:source.ean});}
  return {sourceName:name,role:pipe?'pipe':tool?'installation-tool':source.group,workbookRow:source.row,availableFields:['name','sku','ean','pack','unit'],cataloguePages:tweetopPdf.filter(p=>p.lines.some(l=>l.text===row.product.sku)).map(p=>p.page)};
}
function auditTervix(row,source) {
  const p=source.product,chars=p.characteristics||[],title=p.sourceTitle;
  category(row,['leak-protection'],source,`Official leak-protection component/system: ${title}`);
  const pressure=chars.filter(c=>/робочий тиск|максимальний.*тиск|номінальний тиск/i.test(c.label));
  const pressureIssues=(p.sourceIssues||[]).filter(x=>/pressure|тиск/i.test(typeof x==='string'?x:JSON.stringify(x)));
  if(pressureIssues.length&&row.typed.pressureBar!==undefined)ambiguous(row,'manufacturer-pressure-conflict','Manufacturer source captures a pressure conflict; no inferred overwrite.',source,{current:row.typed.pressureBar,sourceIssues:pressureIssues});
  else check(row,'pressureBar',pressure.map(c=>scalar(c.value)).filter(Boolean).filter(x=>/бар|bar/i.test(x.unit)).map(x=>x.value),source,pressure.map(x=>x.label+'='+x.value).join('; '));
  const ip=chars.filter(c=>/захист|клас.*ip/i.test(c.label)).flatMap(c=>c.value.match(/IP\d{2}/gi)||[]);
  check(row,'protectionClass',ip.map(x=>x.toUpperCase()),source,chars.filter(c=>/IP\d{2}/i.test(c.value)).map(x=>x.label+'='+x.value).join('; '));
  if(row.typed.control==='Бездротове'&&!/zigbee|wi[ -]?fi|rf\b|бездротов|безпровід|безпровод/i.test(title+' '+chars.map(c=>c.label+' '+c.value).join(' ')))issue(row,'wireless-without-source','Current wireless control lacks an explicit protocol/wiring claim in exact source title/table.',source,{sourceTitle:title});
  return {sourceName:title,role:/Система захисту/i.test(title)?'kit':/датчик/i.test(title)?'sensor':/контролер/i.test(title)?'controller':'component',availableAttributeLabels:chars.map(c=>c.label),sourceIssueCodes:(p.sourceIssues||[]).map(x=>x.code||x)};
}
function auditOxi(row,source) {
  const {product,edition,page}=source;
  const nominal=product.characteristics?.find(x=>x.title==='Номінальна потужність')?.value;
  if(nominal)check(row,'heatOutputKw',[scalar(nominal)?.value],source,`Exact product feed power: ${nominal}`);
  category(row,['pellet-burners'],source,`Exact burner master ${product.title}, edition ${edition.sku}`);
  const text=page?.table?.map(x=>x.text).join(' ')||'';
  const weight=text.match(/Маса комплекту(?: сталь\/шамот)?;кг;\s*([\d.,]+(?:\s*\/\s*[\d.,]+)?)/);
  if(weight){const weights=weight[1].split('/').map(num);check(row,'weightKg',[weights.length>1?weights[/футеруванням/i.test(edition['Футерування']||'')?1:0]:weights[0]],source,`Exact page set weight: ${weight[0]}`);}
  if(row.typed.consumptionPowerW!==undefined)issue(row,'versioned-electrical-quantity','Generic consumptionPowerW must not conflate PDP Wh and versioned passport W.',source,{current:row.typed.consumptionPowerW});
  const issues=oxiAudit.issues.find(x=>x.sku===row.product.sku)?.sourceIssues||[];
  if(issues.length)ambiguous(row,'known-versioned-manufacturer-conflicts','Edition/PDP/manual version conflicts are retained as evidence rather than resolved by guesswork.',source,{sourceIssueCodes:issues.map(x=>x.code)});
  return {sourceName:product.title,variantUid:String(edition.uid),rawSku:edition.sku,variantLining:edition['Футерування']||null,role:'pellet-burner',pageTablePresent:Boolean(text),sourceIssueCodes:issues.map(x=>x.code)};
}

for(const row of current) {
  const existingSource=row.sources.find(s=>s.active)||row.sources[0];
  const map={'general-fittings':gfBySku,valrom:valromBySku,tweetop:tweetopBySku,tervix:tervixBySku,oxi:oxiBySku}[row.brand];
  let source=matchSource(row,map,{id:existingSource?.source_id,url:existingSource?.source_url});
  if(!source&&row.brand==='valrom')source=matchSource(row,priceBySku);
  if(!source) {
    coverage.push({...base(row),identity:'unmatched',sourceUrl:existingSource?.source_url});
    findings.push({...base(row),code:'source-identity-unmatched',detail:'No exact SKU row in independent manufacturer caches. No approximate variant substitution.'});continue;
  }
  const sourceId=source.edition?.uid??source.product?.sourceId??source.product?.id;
  const legitimateUaIdentity=row.brand==='valrom'&&/^ua-/.test(existingSource?.source_id||'')&&Boolean(priceBySku.get(skuKey(row.product.sku))?.length);
  if(sourceId!==undefined&&String(sourceId)!==String(existingSource?.source_id)&&!legitimateUaIdentity)issue(row,'source-id-mismatch','Exact SKU matches, but manufacturer row identity differs from current source_id.',source,{current:existingSource?.source_id,manufacturer:String(sourceId)});
  const audit={'general-fittings':auditGf,valrom:auditValrom,tweetop:auditTweetop,tervix:auditTervix,oxi:auditOxi}[row.brand];
  const details=audit(row,source);
  coverage.push({...base(row),identity:'exact-sku',sourceRecordId:existingSource?.source_id,sourceUrl:existingSource?.source_url,proof:proof(source),...(legitimateUaIdentity?{alternateManufacturerId:String(sourceId)}:{}),...details});
}

const byBrand=Object.fromEntries(Object.entries(expected).map(([brand,n])=>[brand,{expected:n,records:coverage.filter(x=>x.brand===brand).length,exactSku:coverage.filter(x=>x.brand===brand&&x.identity==='exact-sku').length,unmatched:coverage.filter(x=>x.brand===brand&&x.identity!=='exact-sku').length,numericOrSelectComparisons:factChecks.filter(x=>x.brand===brand).length,matchedComparisons:factChecks.filter(x=>x.brand===brand&&x.match).length,findings:findings.filter(x=>x.brand===brand).length,ambiguities:ambiguities.filter(x=>x.brand===brand).length,categories:Object.fromEntries(uniq(coverage.filter(x=>x.brand===brand).map(x=>x.currentCategory)).map(c=>[c,coverage.filter(x=>x.brand===brand&&x.currentCategory===c).length]))}]));
const typedCoverage=current.flatMap(row=>Object.entries(row.typed).map(([attribute,value])=>{
  const comparison=factChecks.find(x=>x.brand===row.brand&&x.sku===row.product.sku&&x.attribute===attribute);
  const conflict=ambiguities.filter(x=>x.id===row.product.legacy_id&&(x.attribute===attribute||x.code.includes(attribute.replace(/(?:Mm|Bar|Degrees|Kg)$/,''))));
  return {brand:row.brand,sku:row.product.sku,attribute,current:value,status:comparison?(comparison.match?'source-corroborated':'source-contradiction'):conflict.length?'source-conflict':'not-independently-compared',reason:comparison?comparison.proof.detail:conflict.length?conflict.map(x=>x.code).join('; '):'Exact SKU row is covered, but this field needs a separate semantic/manual source assertion. Absence of an automated proof is not a declared data error.'};
}));
const summary={generatedAt:new Date().toISOString(),status:'offline-source-reconciliation-review',scope:'All 7,561 current records of General Fittings, Valrom, Tweetop, Tervix and OXI; no hosted/Git/catalog mutations.',snapshot:{directory:relative(live),pages:197},total:coverage.length,byBrand,findings:findings.length,ambiguities:ambiguities.length,comparisons:factChecks.length,limitations:['Exact SKU/variant coverage is not a claim that every prose sentence was manually retranslated.','Only independently available, semantically comparable source quantities are compared. Missing typed attributes are opportunities, not errors.','DN, OD, body dimensions, pipe length, packaging, P1/P2 and edition/manual quantities are not interchanged.','Manufacturer conflicts and multi-condition properties require explicit adjudication; no automatic overwrite.','Cached manufacturer capture is evidence for that capture, not a claim that 7,561 pages were freshly fetched.'],inputs:Object.fromEntries(inputs)};
await fs.mkdir(output,{recursive:true});
summary.typedFieldCoverage=Object.fromEntries(uniq(typedCoverage.map(x=>x.status)).map(s=>[s,typedCoverage.filter(x=>x.status===s).length]));
for(const [file,data]of Object.entries({'summary.json':summary,'coverage.json':coverage,'findings.json':findings,'ambiguities.json':ambiguities,'fact-checks.json':factChecks,'typed-field-coverage.json':typedCoverage}))await fs.writeFile(path.join(output,file),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({status:summary.status,total:summary.total,byBrand,findings:findings.length,ambiguities:ambiguities.length,comparisons:factChecks.length,output:relative(output)},null,2));
