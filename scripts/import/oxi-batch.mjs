// Official OXI collector. Public source reads and local files only; never writes a database.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import childProcess from 'node:child_process';
import {manuals,passportSpecifications} from './oxi-specifications.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..');
const require=createRequire(path.join(ROOT,'tmp/tervix-tools/package.json'));
const {load}=require('cheerio');
const sharp=require(path.join(ROOT,'tmp/import-tools/node_modules/sharp'));
const BASE='https://oxi.ua';
const CACHE=path.join(ROOT,'tmp/oxi-source');
const refresh=process.argv.includes('--refresh');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const unique=v=>[...new Set(v.filter(Boolean))];
async function writeJson(file,data){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');}
async function request(url){
  for(let attempt=0;attempt<3;attempt+=1){try{
    const response=await fetch(url,{headers:{'User-Agent':'SofiivkaCatalogImport/1.0 (public manufacturer catalogue)','Accept-Language':'uk'},signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw Error(`HTTP ${response.status}: ${url}`);
    return {bytes:Buffer.from(await response.arrayBuffer()),contentType:response.headers.get('content-type'),finalUrl:response.url};
  }catch(error){if(attempt===2)throw error;}}
}
async function cached(url,extension='html'){
  const file=path.join(CACHE,`${digest(url).slice(0,20)}.${extension}`);
  if(!refresh){try{return await fs.readFile(file);}catch{}}
  const {bytes}=await request(url);await fs.mkdir(CACHE,{recursive:true});await fs.writeFile(file,bytes);return bytes;
}
async function discover(){
  const pages=[];
  for(const route of ['/catalogue','/tech','/company','/evo-26','/sitemap.xml']){
    const url=new URL(route,BASE).href;
    const html=(await cached(url)).toString();const $=load(html);
    const links=unique($('a[href]').map((_,el)=>$(el).attr('href')).get());
    pages.push({url,title:clean($('title').text()),links,storeHints:unique(html.match(/.{0,75}(?:storepartuid|storepart|storefeed|store-feed|t-store|storeparts|productslist).{0,125}/g)||[]).slice(0,25)});
  }
  await writeJson(path.join(ROOT,'imports/oxi-discovery.json'),pages);
  await cached('https://static.tildacdn.one/js/tilda-catalog-1.1.min.js','js');
  const xml=(await cached(`${BASE}/sitemap.xml`)).toString();
  const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]).filter(u=>/^https:\/\/oxi\.ua\/(evo-\d+|cp-\d+)$/.test(u));
  const items=[];
  for(const url of urls){
    const html=(await cached(url)).toString();const $=load(html);
    const text=clean($('body').text());
    const table=$('[data-content],.t-text').map((_,el)=>({class:$(el).attr('class'),text:clean($(el).text())})).get().filter(r=>/Номінальна теплова|Максимальна теплова|Електроспоживання/.test(r.text));
    items.push({url,title:clean($('title').text()),skuHints:unique(html.match(/.{0,70}(?:EVO-\d+|CP-\d+|data-product-sku|data-product-uid).{0,100}/g)||[]).slice(0,8),table,images:unique($('[data-img-zoom-url]').map((_,e)=>$(e).attr('data-img-zoom-url')).get()),docs:$('a[href*="drive.google"]').map((_,e)=>({title:clean($(e).text()),url:$(e).attr('href')})).get()});
  }
  await writeJson(path.join(ROOT,'imports/oxi-source-pages.json'),items);
  console.log(JSON.stringify(items.map(p=>({url:p.url,title:p.title,skuHints:p.skuHints,table:p.table,images:p.images.length,docs:p.docs.length})),null,2));
  const feedUrl='https://store.tildaapi.one/api/getproductslist/?storepartuid=472470845441&recid=415104181&getparts=true&getoptions=true&size=100';
  try{const feed=JSON.parse((await cached(feedUrl,'json')).toString());await writeJson(path.join(ROOT,'imports/oxi-feed.json'),feed);console.log(JSON.stringify({feedKeys:Object.keys(feed),count:feed.products?.length,products:feed.products?.map(p=>({uid:p.uid,title:p.title,sku:p.sku,price:p.price,editions:p.editions}))},null,2));}catch(error){console.log(JSON.stringify({feedFailure:error.message}));}
  const documents=unique(items.flatMap(p=>p.docs.map(d=>d.url))).map(url=>({url,id:url.match(/\/d\/([^/]+)/)?.[1]}));
  for(const doc of documents.filter(d=>['1wFMykPMbkdjltjrYZoCS65k2lwQZt9k1','1TnsSi7Y1cBW4K_AK-0QCiB_jfuk-mo95','1XifZiN1cslBuqbOLZ3kz_GImlIIsDhNz'].includes(d.id))){
    try{const bytes=await cached(`https://drive.google.com/uc?export=download&id=${doc.id}`,'bin');console.log(JSON.stringify({document:doc.id,bytes:bytes.length,magic:bytes.subarray(0,12).toString()}));}catch(error){console.log(JSON.stringify({document:doc.id,error:error.message}));}
  }
  try{const price=await cached('https://docs.google.com/spreadsheets/d/1dlxiaArHS-g9EuPGj1fZBP-BjiHOJqGQW5N8L9oNics/export?format=csv','csv');console.log(JSON.stringify({priceBytes:price.length,pricePreview:price.toString().slice(0,1800)}));}catch(error){console.log(JSON.stringify({priceFailure:error.message}));}
}

const relative=file=>path.relative(ROOT,file).replaceAll('\\','/');
const num=value=>Number(String(value).replaceAll(' ','').replace(',','.'));
async function mapLimit(items,limit,callback){let next=0;const output=new Array(items.length);await Promise.all(Array.from({length:limit},async()=>{while(next<items.length){const i=next++;output[i]=await callback(items[i],i);}}));return output;}

async function collect(){
  const feed=JSON.parse(await fs.readFile(path.join(ROOT,'imports/oxi-feed.json'),'utf8'));
  if(feed.total!==feed.products.length||feed.nextslice)throw Error('Incomplete official catalogue feed');
  const pages=JSON.parse(await fs.readFile(path.join(ROOT,'imports/oxi-source-pages.json'),'utf8'));
  const mediaRoot=path.join(ROOT,'assets/products/oxi');await fs.mkdir(mediaRoot,{recursive:true});
  const mediaEvidence=[];const documentEvidence=[];const issues=[];const products=[];
  for(const manual of Object.values(manuals)){
    const source=`https://drive.google.com/uc?export=download&id=${manual.id}`;
    const bytes=await cached(source,'bin');if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error(`Not PDF: ${source}`);
    const target=path.join(mediaRoot,manual.file);await fs.writeFile(target,bytes);
    const info=childProcess.execFileSync('pdfinfo',[target],{encoding:'utf8'});
    if(Number(info.match(/Pages:\s*(\d+)/)?.[1])!==manual.pages)throw Error(`Unexpected manual pages ${manual.file}`);
    documentEvidence.push({sourcePage:`${BASE}/tech`,sourceUrl:`https://drive.google.com/file/d/${manual.id}/view`,downloadUrl:source,path:relative(target),bytes:bytes.length,sha256:digest(bytes),pages:manual.pages,revision:manual.revision});
  }
  const logoSource='https://static.tildacdn.one/tild3064-3738-4135-b438-633265303466/logo.svg';
  const logo=await cached(logoSource,'svg');if(!logo.toString().includes('<svg')||/<script|<foreignObject|https?:\/\//i.test(logo.toString().replace(/xmlns(?:\:\w+)?="[^"]+"/g,'')))throw Error('Unexpected active/external content in official SVG');
  await fs.writeFile(path.join(ROOT,'assets/brands/oxi.svg'),logo.toString().trimEnd()+'\n');
  const sourceBurners=feed.products.filter(p=>/^Пелетний пальник OXI /u.test(p.title));
  for(const source of sourceBurners){
    const page=pages.find(p=>p.url===source.url);if(!page)throw Error(`No official page ${source.url}`);
    const $=load((await cached(source.url)).toString());
    const rawRows=$('.t431__data-part2').text().split(/\r?\n/).map(line=>line.split(';').map(clean)).filter(row=>row.length>=3&&row[0]);
    const table=Object.fromEntries(rawRows.map(([label,unit,value])=>[label,{label,unit,value}]));
    const family=/EVO/.test(source.title)?'EVO':'Ceramic PRO';
    const power=num(source.characteristics.find(c=>c.title==='Номінальна потужність').value.replace(/\s*кВт/,''));
    const max=num(table['Максимальна теплова потужність']?.value),min=num(table['Мінімальна теплова потужність']?.value);
    if(!power||!max||!min)throw Error(`No model-specific power table: ${source.url}`);
    const drawings=unique($('[class*="t853__"][data-original]').map((_,e)=>$(e).attr('data-original')).get());
    const configurations=(source.properties||[]).map(p=>({label:clean(p.title),options:p.values.split('\n').map(option=>{const[value,surcharge]=option.split('=');return {value:clean(value),sourceSurcharge:surcharge?num(surcharge):0,currency:'EUR'};})}));
    for(const edition of source.editions){
      const sku=edition.sku.replace(/С$/u,'C'); // Official PDP writes Latin C; the raw feed spelling is retained below.
      const lined=edition['Футерування']==='Топка із футеруванням';
      const model=sku;
      const title=family==='EVO'?`Пелетний пальник OXI EVO ${power} кВт, ${lined?'шамотована':'сталева'} камера`:`Пелетний пальник OXI Ceramic PRO ${power} кВт`;
      const passport=passportSpecifications(family,power,lined);
      const weights=table['Маса комплекту сталь/шамот']?.value.split('/')||[table['Маса комплекту']?.value];
      const weight=num(weights.length>1?weights[lined?1:0]:weights[0]);
      const selectedImages=family==='EVO'&&source.editions.length===2?page.images.slice(lined?7:0,lined?14:7):page.images;
      const standCode=({200:'22',250:'22',300:'34',400:'34',500:'56',600:'56',800:'800',1000:'1000'})[power];
      const verifiedImage=address=>decodeURIComponent(address).includes(family==='EVO'?`EVO_${power}_`:`CeramicPRO_${power}_`)
        ||(family!=='EVO'&&standCode&&decodeURIComponent(address).includes(`OXI_PB-${standCode}_`));
      if(!selectedImages.length||selectedImages.some(address=>!verifiedImage(address)))throw Error(`Gallery model mismatch ${sku}`);
      const drawing=family==='EVO'&&source.editions.length===2?drawings[lined?1:0]:drawings[0];
      const photos=selectedImages.map(url=>({url,kind:url.includes('OXI_PB-')?'mounting-component':'photo'}));if(drawing)photos.push({url:drawing,kind:'drawing'});
      const images=await mapLimit(photos,4,async({url,kind},i)=>{
        const bytes=await cached(url,'image');const original=await sharp(bytes).metadata();
        const file=path.join(mediaRoot,`${sku.toLowerCase()}-${String(i+1).padStart(2,'0')}.webp`);
        await sharp(bytes).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:88,effort:5}).toFile(file);
        const out=await fs.readFile(file),meta=await sharp(out).metadata();
        mediaEvidence.push({sku,sourcePage:source.url,variantSourceUid:String(edition.uid),kind,sourceUrl:url,path:relative(file),sourceSha256:digest(bytes),sha256:digest(out),sourceWidth:original.width,sourceHeight:original.height,width:meta.width,height:meta.height,bytes:out.length});
        return relative(file);
      });
      const unitRaw=table['Електроспоживання в розпалюванні/в роботі'];
      const electricRaw=unitRaw?.value;
      const fuel=lined?'Деревні й агропелети':'Деревні пелети';
      const material=lined?'Нержавіюча сталь / шамот':'Нержавіюча сталь';
      const dimension=`${passport.length} × ${passport.width} × ${passport.height}`;
      const characteristics=rawRows.filter(([label])=>!/^Маса комплекту|^Електроспоживання/.test(label)).map(([label,unit,value])=>({label,value:value==='✓'?'Так':value,unit:clean(unit)}));
      characteristics.push({label:'Маса комплекту',value:String(weight).replace('.',','),unit:'кг'},
        {label:'Виконання камери згоряння',value:lined?'Шамотована':'Сталева'},
        {label:'Паливо',value:fuel},{label:'Матеріал колосників',value:'Нержавіюча сталь AISI 310S'},
        {label:'Частота електроживлення за паспортом',value:'50',unit:'Гц'},
        {label:`Габарити Д×Ш×В без коліна за паспортом ${passport.manual.revision}`,value:dimension,unit:'мм'},
        {label:`Середня споживана потужність за паспортом ${passport.manual.revision}`,value:String(passport.runW),unit:'Вт'},
        {label:`Потужність розпалювання за паспортом ${passport.manual.revision}`,value:String(passport.ignitionW),unit:'Вт'},
        {label:`Маса пальника за паспортом ${passport.manual.revision}`,value:String(passport.burnerWeight),unit:'кг'},
        {label:`Розміри топки Ш×В за паспортом ${passport.manual.revision}`,value:`${passport.fireboxWidth} × ${passport.fireboxHeight}`,unit:'мм'},
        {label:`Мінімальне розрідження в котлі за паспортом ${passport.manual.revision}`,value:String(passport.vacuumPa),unit:'Па'},
        {label:`Діаметр комплектного шнека за паспортом ${passport.manual.revision}`,value:String(passport.augerDiameter),unit:'мм'},
        {label:'Енергоспоживання під час розпалювання / роботи за таблицею сторінки',value:electricRaw,unit:'Вт·год'},
        {label:'Керування',value:'Автоматичне розпалювання, гасіння, модуляція потужності'},
        {label:'Сумісність',value:'Водогрійні пелетні котли'},
        {label:'Гарантія виробника за паспортом',value:'24 місяці, за умовами паспорта'});
      const standardAuger=configurations.find(c=>c.label==='Довжина шнека')?.options[0]?.value;
      const standardController=configurations.find(c=>c.label==='Контролер')?.options[0]?.value;
      characteristics.push({label:'Контролер базової комплектації',value:standardController},{label:'Довжина шнека базової комплектації',value:standardAuger.replace(/(\d)м/g,'$1 м')});
      const sections=[
        {title:'Застосування',paragraphs:[`${title} призначений для водогрійних пелетних котлів. Номінальна теплова потужність становить ${power} кВт; за таблицею цієї моделі робочий діапазон складає ${min}–${max} кВт.`,lined?'Камера з вогнетривким футеруванням передбачена для деревних і агропелет. Якість та калорійність палива впливають на фактичну теплову продуктивність.':'Сталева камера згоряння призначена для деревних пелет. Виробник пов’язує номінальну потужність із використанням палива стандарту ENplus.']},
        {title:'Принцип роботи',paragraphs:['Контролер узгоджує дозовану подачу палива шнеком і подачу повітря в зону горіння. Автоматичні розпалювання, гасіння та модуляція підтримують роботу пальника в заданому режимі.','Рухомі колосники очищуються автоматично. Розподіл первинного та вторинного повітря налаштовують відповідно до властивостей палива; колосниковий вузол виготовлений із жароміцної нержавіючої сталі AISI 310S.']},
        {title:'Комплектація',paragraphs:[`Базова конфігурація каталогу містить пальник, контролер ${standardController} та паливний шнек довжиною ${standardAuger.replace(/(\d)м/g,'$1 м')}. Паспорт також передбачає кабелі підключення, датчик температури котла, коліно живильника та плавкий гофрований рукав.`,power>=200?(power<=300?'За паспортом Ceramic PRO до стандартного комплекту також входить опорна нога пальника.':'За паспортом Ceramic PRO до стандартного комплекту також входить візок пальника.'):'Перехідні фланці та дверцята котла добирають відповідно до монтажу.']},
        {title:'Доступні конфігурації',paragraphs:configurations.map(c=>`${c.label}: ${c.options.map(o=>o.value.replace(/(\d)м/g,'$1 м')).join('; ')}. Комплектацію узгоджують під час підбору.`)},
        {title:'Монтаж і технічні дані',paragraphs:[`Розміри та електричні параметри наведені окремо за паспортом ${passport.manual.revision}; таблиця на сторінці моделі містить інші значення електроспоживання та одиницю Вт·год. Перед підключенням слід звірити виконання пальника, його паспорт і приєднувальне креслення. Монтаж та налаштування виконує кваліфікований спеціаліст.`]}
      ];
      const description=sections.flatMap(s=>s.paragraphs).join('\n\n');
      const shortDescription=`${power} кВт, діапазон ${min}–${max} кВт. ${lined?'Шамотована':'Сталева'} камера, автоматичне очищення колосників. У базовій конфігурації — контролер ${standardController} і шнек ${standardAuger.replace(/(\d)м/g,'$1 м')}.`;
      const seoSuffix=' — купити в ТД «Софіївка»';
      const seoTitle=title.length+seoSuffix.length<=70?title+seoSuffix:title;
      let seoDescription=`${title}. Діапазон ${min}–${max} кВт, автоматичне очищення колосників. Характеристики, паспорт і підбір у ТД «Софіївка».`;
      if(seoDescription.length>160)seoDescription=`${title}. ${min}–${max} кВт, автоматичне очищення. Характеристики, паспорт і підбір у ТД «Софіївка».`;
      const sourceIssues=[{code:'electrical-unit-and-version-conflict',detail:`PDP: ${electricRaw} ${unitRaw.unit}; ${passport.manual.revision}, с.7: ${passport.ignitionW}/${passport.runW} Вт. consumptionPowerW не заповнюється.`,sourceUrl:source.url,manualId:passport.manual.id},
        {code:'warranty-general-vs-specific',detail:'Загальний каталог обіцяє 3 роки; конкретна сторінка та паспорт містять 24 місяці. Використано умови паспорта.'},
        {code:family==='EVO'?'manual-grouped-power-nomenclature':'minimum-power-version-conflict',detail:`Поточна сторінка моделі: номінальна ${power} кВт, мінімальна ${min} кВт; паспорт ${passport.manual.revision}, с.7: номінальна групи ${passport.nominalGroupKw} кВт, мінімальна ${passport.minKw} кВт. Для діапазону використано окрему актуальну сторінку моделі.`,sourceUrl:source.url,manualId:passport.manual.id},
        {code:'weight-definition-and-version',detail:`PDP називає ${weight} кг масою комплекту; паспорт ${passport.manual.revision}, с.8 окремо називає ${passport.burnerWeight} кг масою пальника. Ці величини не підсумовуються й не вважаються однаковим складом поставки.`}];
      if(power===100||power===150)sourceIssues.push({code:'dimension-version-conflict',detail:`Висота на кресленні поточної сторінки: ${power===100?530:538} мм; висота без коліна у паспорті ${passport.manual.revision}, с.7: ${passport.height} мм. У таблиці явно позначено паспортну версію; остаточний монтаж звіряють з виконанням виробу.`});
      if(power>=250)sourceIssues.push({code:'manual-auger-length-internal-conflict',detail:`Паспорт Ceramic PRO 200/1000, с.5 і активний каталог дають ${standardAuger} для цієї моделі; загальний абзац с.8 помилково однаково називає 2,0 м. Використано модельну комплектацію каталогу.`});
      issues.push({sku,sourceUrl:source.url,sourceIssues});
      products.push({sourceId:String(edition.uid),sourceProductId:String(source.uid),sourceUrl:source.url,sourceCategory:`Пелетні пальники OXI ${family}`,sku,sourceSku:edition.sku,model,series:family,brand:'oxi',title,category:'pellet-burners',price:null,sourcePrice:num(edition.price),priceCurrency:'EUR',vatIncluded:null,shortDescription,description,sections,characteristics,
        filters:{heatOutputKw:power,weightKg:weight,voltage:'230 В ±5%, 50 Гц',material,fuel,productType:'Пелетний пальник',type:'Факельний, автоматичний',compatibility:'Водогрійні пелетні котли'},images,
        documents:[{title:`Паспорт та інструкція OXI ${passport.manual.revision}`,type:'manual',url:`assets/products/oxi/${passport.manual.file}`}],seoTitle,seoDescription,
        sourceConfigurations:configurations,sourceCharacteristics:rawRows.map(([label,unit,value])=>({label,unit,value})),sourceIssues,sourceEvidence:{feedUrl:'https://store.tildaapi.one/api/getproductslist/?storepartuid=472470845441&recid=415104181&getparts=true&getoptions=true&size=100',editionUid:String(edition.uid),pageUrl:source.url,manualId:passport.manual.id,manualDimensionReference:passport.dimensionReference,
          sourcePrice:num(edition.price),priceCurrency:'EUR',vatIncluded:null,rawSku:edition.sku,canonicalSku:sku,configurations,rawCharacteristics:rawRows.map(([label,unit,value])=>({label,unit,value})),conflicts:sourceIssues,passportSpecifications:passport,manufacturerGallery:photos}});
      console.log(JSON.stringify({collected:sku,photos:images.length,characteristics:characteristics.length}));
    }
  }
  if(products.length!==21)throw Error(`Expected 21 verified manufacturer variants, got ${products.length}`);
  const brand={id:'oxi',name:'OXI',website:BASE,logo:'assets/brands/oxi.svg',description:'OXI — український виробник автоматичних пелетних пальників для побутових і промислових систем опалення.',sourceUrl:`${BASE}/company`,logoSourceUrl:logoSource};
  const omitted=[{sku:'CP-1200',title:'Пелетний пальник OXI Ceramic PRO 1200 кВт',sourceUrl:`${BASE}/cp-1200`,reason:'Сторінка є в sitemap, але модель відсутня в активному каталозі; немає таблиці технічних характеристик, документації та edition SKU. Не запозичено параметри CP-1000.'},
    ...feed.products.filter(p=>!sourceBurners.includes(p)).map(p=>({sku:p.sku,title:p.title,sourceUrl:p.url,reason:'Контролер або шнек; поза замовленим обсягом пальників.'}))];
  await writeJson(path.join(ROOT,'imports/oxi-2026-11-25.json'),{supplier:'oxi',brand:'oxi',collectedAt:'2026-11-25',sourceSite:BASE,products});
  await writeJson(path.join(ROOT,'imports/oxi-source-audit.json'),{brand,activeFeedMasterCount:feed.total,burnerMasters:sourceBurners.length,verifiedVariants:products.length,sourceSkus:products.map(p=>({sku:p.sku,sourceSku:p.sourceSku,sourceId:p.sourceId,sourceUrl:p.sourceUrl})),omitted,issues,media:mediaEvidence.sort((a,b)=>a.path.localeCompare(b.path)),documents:documentEvidence,configurationPolicy:'Окремі товари лише за manufacturer edition SKU/UID; опції довжини шнека та контролера не мають окремих артикулів і збережені у sourceConfigurations.'});
  await writeJson(path.join(ROOT,'imports/oxi-brand.json'),brand);
  console.log(JSON.stringify({status:'collected',products:products.length,media:mediaEvidence.length,documents:documentEvidence.length,omitted}));
}

if(process.argv.includes('--discover'))await discover();else await collect();
