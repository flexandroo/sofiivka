/**
 * Official Tervix Ukrainian anti-flood catalogue collector and import adapter.
 * Install isolated tooling (does not change site dependencies):
 * npm install --prefix tmp/tervix-tools --no-save --no-package-lock --ignore-scripts sharp@0.34.5 cheerio@1.1.2
 * node scripts/import/tervix-batch.mjs --discover
 * node scripts/import/tervix-batch.mjs
 * Cached HTML/raw records and source-media provenance remain in imports/ and tmp/tervix-source/.
 * Re-run with --refresh to request the source again. No database or remote writes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { curateTervixSpecifications } from './tervix-specification-quality.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const require = createRequire(path.join(ROOT, 'tmp', 'tervix-tools', 'package.json'));
const { load } = require('cheerio');
const sharp = require('sharp');
const BASE = 'https://tervix.ua';
const DATE = '2026-11-25';
const CACHE = path.join(ROOT, 'tmp', 'tervix-source');
const IMPORTS = path.join(ROOT, 'imports');
const MEDIA = path.join(ROOT, 'assets', 'products', 'tervix');
const refresh = process.argv.includes('--refresh');
const discoverOnly = process.argv.includes('--discover');
let documentIndex = {}; try { documentIndex = JSON.parse(await fs.readFile(path.join(CACHE,'document-index.json'),'utf8')); } catch {}
const SKIP_LABEL = /^(?:артикул|бренд|модель|тип\/модель|вага упаковки|кількість у палеті)$/i;
const SEEDS = [
  '/product/Tervix/rozumniy_budinok/sistemi_zakhistu_vid_zatoplennya/',
  '/product/Tervix/rozumniy_budinok/datchiki_dlya_rozumnogo_budinku/',
  '/product/Tervix/rozumniy_budinok/kontroleri_ta_rozshiryuvachi_merezhi/',
  '/product/Tervix/armatura_ta_avtomatika_dlya_regulyuvannya/klapani_ta_elektroprivodi/kulovi_klapani_z_elektroprivodom/'
];
const unique = a => [...new Set(a.filter(Boolean))];
const clean = s => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const key = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const url = s => new URL(s, BASE).href;
async function writeJson(file, data) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n'); }
async function request(address, binary = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(address, { headers: { 'User-Agent': 'SofiivkaCatalogImport/1.0 (public manufacturer catalogue)', 'Accept-Language': 'uk' }, signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${address}`);
      return binary ? Buffer.from(await response.arrayBuffer()) : await response.text();
    } catch (error) { if (attempt === 2) throw error; }
  }
}
async function html(address) {
  const file = path.join(CACHE, `${key(address)}.html`);
  if (!refresh) { try { return await fs.readFile(file, 'utf8'); } catch {} }
  const text = await request(address); await fs.mkdir(CACHE, { recursive: true }); await fs.writeFile(file, text); return text;
}
function scope(title, seed) {
  if (/sistemi_zakhistu_vid_zatoplennya/.test(seed)) return true;
  if (/datchiki/.test(seed)) return /затоп|протік|flood|water.?leak|дротов.*вод/i.test(title);
  if (/kontroleri/.test(seed)) return /контролер|шлюз|розширювач|ретранслятор/i.test(title) && /zigbee|rf|gateway/i.test(title);
  return /кульов.*клапан|електропривід/i.test(title) && /2.?ходов|ZEVS|ZigBee|Water Stop/i.test(title) && !/3.?ходов|термостат|змішуваль/i.test(title);
}
async function discover() {
  const cards = new Map(); const listings = []; const excluded = [];
  for (const seed of SEEDS) {
    const queue = [url(seed)]; const visited = new Set();
    while (queue.length) {
      const address = queue.shift(); if (visited.has(address)) continue; visited.add(address);
      const $ = load(await html(address));
      const categoryTitle = clean($('h1').first().text()).replace(/\s*-\s*сторінка\s*\d+$/i, ''); let count = 0;
      $('.catalog.item-views .item[data-item]').each((_, e) => {
        let data; try { data = JSON.parse($(e).attr('data-item')); } catch { return; }
        if (!data.DETAIL_PAGE_URL || !data.NAME || !data.ID) return;
        count++;
        const card = { sourceId: String(data.ID), sourceUrl: url(data.DETAIL_PAGE_URL), sourceTitle: clean(data.NAME), sourceCategory: categoryTitle, listingUrl: address, listingPrice: Number(String(data.PROPERTY_FILTER_PRICE_VALUE ?? '').replace(',', '.')) || null,listingPriceText:clean(data.PROPERTY_PRICE_VALUE),listingPriceCurrency:/грн|UAH/i.test(String(data.PROPERTY_PRICE_VALUE))?'UAH':null };
        if (scope(card.sourceTitle, seed)) cards.set(card.sourceId, card); else excluded.push(card);
      });
      const pagination = unique($('a[href]').map((_, e) => $(e).attr('href')).get().filter(x => x?.startsWith(seed) && /[?&]PAGEN_1=\d+/.test(x)).map(x => `${seed}?PAGEN_1=${new URL(x,BASE).searchParams.get('PAGEN_1')}`));
      for (const next of pagination) if (!visited.has(url(next))) queue.push(url(next));
      listings.push({ url: address, category: categoryTitle, count });
    }
  }
  const data = { sourceSite: BASE, collectedAt: DATE, listings, candidates: [...cards.values()], excluded: [...new Map(excluded.map(x => [x.sourceId, x])).values()] };
  await writeJson(path.join(IMPORTS, `tervix-${DATE}.discovery.json`), data);
  return data;
}
function normalized(s) {
  return clean(s).replace(/Безпровідний/gi, 'Бездротовий').replace(/безпровідний/gi, 'бездротовий')
    .replace(/датчику/gi, 'датчика').replace(/клапану/gi, 'клапана').replace(/гліколя/gi, 'гліколю')
    .replace(/м3\/год/g, 'м³/год').replace(/МГц|MГц|Мгц/g, 'МГц').replace(/\bIP\s+(\d+)/g, 'IP$1')
    .replace(/(?<=\d)\s*(?:ºC|°С|° C)/g, ' °C').replace(/(\d)В\b/g, '$1 В').replace(/(\d)Вт\b/g, '$1 Вт');
}
function characteristics($) {
  const result = []; const seen = new Set(); const labels = new Map();
  $('.props_table tr').each((_, row) => {
    const cells = $(row).find('td'); if (cells.length < 2) return;
    let label = normalized($(cells[0]).text()); let value = normalized($(cells[cells.length - 1]).text());
    if (!label || !value || SKIP_LABEL.test(label) || /палет|упаков|EAN|штрих/i.test(label)) return;
    if (/^Робоча температура$/i.test(label) && labels.has(label)) label = 'Робоча температура датчика';
    const k = `${label}:${value}`; if (seen.has(k)) return; seen.add(k); labels.set(label, value);
    result.push({ label, value });
  });
  // Specifications embedded in the manufacturer's description are product data too.
  $('#desc table tr').each((_, row) => {
    const cells = $(row).find('td'); if (cells.length !== 2) return;
    const label = normalized($(cells[0]).text()); const value = normalized($(cells[1]).text());
    if (!label || !value || label.length > 130 || value.length > 500 || SKIP_LABEL.test(label) || seen.has(`${label}:${value}`)) return;
    seen.add(`${label}:${value}`); result.push({ label, value });
  });
  return result;
}
function descriptionBlocks($) {
  const clone = $('#desc .content').first().clone();
  clone.find('script,style,img,iframe,table').remove();
  clone.find('br').replaceWith('\n');
  clone.find('p,li,ul,ol,div,h1,h2,h3,h4').each((_, e) => { $(e).append('\n'); });
  return clone.text().split(/\n/).map(normalized).filter(x => x && !/^Опис$/.test(x));
}
async function rawProduct(card) {
  const $ = load(await html(card.sourceUrl)); const sourceTitle = clean($('h1').first().text());
  if (!sourceTitle) throw new Error(`Missing H1 ${card.sourceUrl}`);
  const sourceProps = characteristics($);
  const sku = clean($('.props_table tr').map((_, row) => { const td = $(row).find('td'); return /^Артикул$/i.test(clean($(td[0]).text())) ? $(td[1]).text() : ''; }).get().find(Boolean)) || sourceTitle.match(/^([\dA-Za-z]+(?:-\d+)?)\s/)?.[1];
  if (!sku) throw new Error(`Missing SKU ${card.sourceUrl}`);
  const { characteristics: props, sourceIssues } = curateTervixSpecifications(sourceProps, { sku, sourceUrl: card.sourceUrl });
  const gallery = unique($('a.fancybox[href]').map((_, e) => $(e).attr('href')).get().filter(x => /\/upload\/.*\.(?:jpg|png|jpeg|webp)(?:\?|$)/i.test(x)).map(url));
  const documentLinks = unique($('#inst a[href], #desc a[href]').map((_, e) => $(e).attr('href')).get().filter(x => /\.pdf(?:\?|$)/i.test(x)).map(url));
  const modelRow = $('.props_table tr').map((_, row) => { const td = $(row).find('td'); return /Тип\/модель|Модель/i.test(clean($(td[0]).text())) ? clean($(td[1]).text()) : ''; }).get().find(Boolean);
  const description = descriptionBlocks($);
  // Two maker pages contain conflicting nominal-pressure rows; do not pick one arbitrarily.
  const nominal = props.filter(x=>/^Номінальний тиск$/i.test(x.label));
  if (unique(nominal.map(x=>x.value)).length > 1) {
    sourceIssues.push({field:'Номінальний тиск',values:nominal.map(x=>x.value),resolution:'Не переноситься до картки до уточнення виробником'});
    for(let i=props.length-1;i>=0;i--)if(/^Номінальний тиск$/i.test(props[i].label))props.splice(i,1);
  }
  const types=props.filter(x=>/^Тип$/i.test(x.label));if(types.length>1)for(const row of types)row.label=/НВ|НЗ|нормально/i.test(row.value)?'Тип клапана':'Серія';
  if(!props.length && /411971/.test(sku))props.push({label:'Спосіб зв’язку',value:'Дротовий'},{label:'Довжина кабелю',value:'3000',unit:'мм'},{label:'Сумісність',value:'Tervix ZEVS'});
  const warranty=description.join(' ').match(/гарантія[:\s—-]*(\d+)\s*(місяц|рок)/i);if(warranty&&!props.some(x=>/гарантія/i.test(x.label)))props.push({label:'Гарантія виробника',value:`${warranty[1]} ${/рок/.test(warranty[2])?'роки':'місяців'}`});
  const kitOnly=/продається тільки в комплекті систем/i.test(description.join(' '));if(kitOnly)props.push({label:'Постачання',value:'У складі комплектів системи'});
  const priceText = clean($('.catalog.detail .price,.catalog.detail .price_value,.catalog.detail .prices').first().text());
  return { ...card, sourceTitle, sku, modelRow, characteristics: props, descriptionBlocks: description, gallery, documentLinks, priceText,sourceIssues,kitOnly,
    discontinued: /знят[а-яіїє]* з виробництва|більше не виробляється|снят[а-я]* с производства/i.test(sourceTitle + ' ' + description.join(' ')),
    relatedLinks: unique($('#desc a[href]').map((_,e)=>$(e).attr('href')).get().filter(x=>/\/product\/Tervix\//i.test(x)).map(url)) };
}
function kind(raw) {
  const s = raw.sourceTitle;
  if (/система захисту/i.test(s)) return 'kit';
  if (/датчик/i.test(s)) return 'sensor';
  if (/розширювач|ретранслятор/i.test(s)) return 'repeater';
  if (/контролер|шлюз/i.test(s)) return 'controller';
  if (/клапан/i.test(s)) return 'valve';
  if (/електропривід/i.test(s)) return 'actuator';
  return 'accessory';
}
function editorial(raw) {
  const k = kind(raw); const s = raw.sourceTitle;
  const diameter = s.match(/(?:^|\s)(1 1\/2|1 1\/4|1\/2|3\/4|2|1)\s*(?:''|"|″|&quot;|дюйм)/)?.[1] || '';
  const pipes = s.match(/на\s+([12])\s+труб/i)?.[1];
  const family = /ZEVS/i.test(s) ? `ZEVS ${/Wired/i.test(s) ? 'Wired' : /ZigBee/i.test(s) ? 'ZigBee' : /RF/i.test(s) ? 'RF' : ''}`.trim() : /Water Stop/i.test(s) ? `ZigBee Water Stop${/Premium/i.test(s) ? ' Premium' : ''}` : /ORC2/i.test(s)?'Pro Line ORC2':/ORC/i.test(s)?'Pro Line ORC':normalized(raw.modelRow || 'Pro Line').replace(/Tervix\s*/gi,'');
  let model = family;
  let type = 'Аксесуар системи захисту від затоплення';
  if (k === 'kit') { type = 'Система захисту від затоплення'; model = `${family}${pipes ? `, ${pipes} ${pipes === '1' ? 'труба' : 'труби'}` : ''}${diameter ? `, ${diameter}″` : ''}`; }
  if (k === 'sensor') { type = /дротовий|провідний/i.test(s) && !/без[дп]ровід/i.test(s) ? 'Дротовий датчик протікання' : 'Бездротовий датчик протікання'; model = /ZigBee/i.test(s) ? 'Pro Line ZigBee Flood Sensor' : /RF/i.test(s) ? 'Pro Line RF Flood Sensor' : normalized(raw.modelRow || 'Pro Line Flood Sensor Wired'); const cable=s.match(/(\d+)\s*мм/i)?.[1];if(cable)model+=`, кабель ${cable} мм`; }
  if (k === 'controller') { type = 'Контролер розумного будинку'; model = normalized(s.replace(/^\S+\s+/, '').replace(/^.*?Tervix\s*/i, '')).replace(/безпровідний|бездротовий/gi, '').trim(); }
  if (k === 'repeater') { type = 'Ретранслятор мережі'; model = normalized(s.replace(/^\S+\s+/, '').replace(/^.*?Tervix\s*/i, '')); }
  if (k === 'valve') { type = 'Кульовий клапан з електроприводом'; model = `${/ZEVS/i.test(s) ? 'Pro Line ZEVS' : /ORC2/i.test(s)?'Pro Line ORC2':/ORC/i.test(s)?'Pro Line ORC':/ZigBee/i.test(s)?'Pro Line ZigBee':'Pro Line'}${diameter ? ` ${diameter}″` : ''}${/н\/з/i.test(s)?', НЗ':/н\/в/i.test(s)?', НВ':''}`; }
  if (k === 'actuator') { type = 'Електропривід кульового клапана'; model = /ZEVS/i.test(s) ? 'Pro Line ZEVS' : normalized(raw.modelRow || 'Pro Line'); }
  let title = `${type} Tervix ${model}`;
  // The maker uses several generations with otherwise identical model names.
  title = normalized(`${title} (${raw.sku})`).replace(/\s+,/g, ',');
  const intro = `${title} ${k === 'kit' ? 'призначена для автоматичного перекриття води у разі виявлення протікання.' : k === 'sensor' ? 'виявляє воду в місці встановлення та передає сигнал до сумісної системи захисту.' : k === 'controller' ? 'об’єднує сумісні пристрої в керовану систему автоматизації.' : k === 'repeater' ? 'розширює покриття сумісної бездротової мережі.' : k === 'valve' ? 'керує подачею води в трубопроводі за командою сумісної автоматики.' : k === 'actuator' ? 'забезпечує автоматичне керування сумісним кульовим клапаном.' : 'використовується як компонент сумісної системи захисту.'}`;
  // Write original Ukrainian product prose from verified facts. The source text is retained
  // separately as audit evidence, never pasted wholesale into the storefront description.
  const facts=raw.descriptionBlocks.join(' ');const block=[];
  const sections = [{ title: 'Застосування', paragraphs: [intro] }];
  if(k==='kit'){
    block.push(`${/Wired/i.test(s)?'Дротові датчики':/RF/i.test(s)?'Радіодатчики RF':'Датчики ZigBee'} контролюють місця можливого витоку. Сигнал про воду запускає закривання сумісного електроприводного клапана.`);
    if(pipes)block.push(`Комплект розрахований на ${pipes==='1'?'одну трубу':'дві труби'}${diameter?` з підключенням ${diameter}″`:''}. Варіант слід вибирати відповідно до кількості вводів водопостачання та діаметра трубопроводу.`);
  }
  if(k==='sensor'){
    block.push(`${/RF/i.test(s)?'Для передавання тривоги використовується радіозв’язок RF.':/ZigBee/i.test(s)?'Сигнал передається через сумісну мережу ZigBee.':'Сигнал від чутливого елемента передається дротом.'} Датчик призначений для контролю протікання у вибраній точці.`);
    const cable=s.match(/(\d+)\s*мм/i)?.[1];if(cable)block.push(`Довжина з’єднувального кабелю становить ${cable} мм. Це дає змогу розмістити чутливу частину окремо від місця підключення.`);
    if(/ZEVS/i.test(s))block.push('Виробник указує сумісність цієї моделі із системою Tervix ZEVS.');
  }
  if(k==='valve'){
    block.push(`Двоходовий клапан відкриває або перекриває потік води; переміщення запірного елемента виконує електричний привід.${diameter?` Розмір приєднання цієї моделі — ${diameter}″.`:''}`);
    if(/н\/з/i.test(s))block.push('Виконання НЗ означає нормально закритий клапан. Логіку підключення приводу необхідно узгодити з цим вихідним положенням.');
    if(/н\/в/i.test(s))block.push('Виконання НВ означає нормально відкритий клапан. Для правильної роботи автоматики слід урахувати це вихідне положення.');
    if(/нержавіюч|AISI 304/i.test(s+' '+facts))block.push('У цьому виконанні використовується корпус із нержавіючої сталі.');
  }
  if(k==='actuator')block.push('Привід перетворює команду автоматики на поворот запірного механізму. Ця позиція постачається як компонент для сумісного кульового клапана.');
  if(k==='controller')block.push(/Wired|Ethernet/i.test(s)?'Підключення до локальної мережі виконується через Ethernet. Шлюз забезпечує обмін із сумісними пристроями ZigBee.':'Шлюз об’єднує сумісні пристрої ZigBee для спільного керування та сценаріїв автоматизації. Параметри підключення наведені в характеристиках.');
  if(k==='repeater')block.push('Ретранслятор повторює сигнал ZigBee та допомагає розширити зону зв’язку між сумісними пристроями. Його використовують як елемент бездротової мережі.');
  if(block.length)sections.push({title:'Принцип роботи та підключення',paragraphs:block});
  const capabilities=[];
  if(/без (?:Wi-Fi|інтернет)|навіть.*інтернет/i.test(facts))capabilities.push('Опис виробника передбачає виконання захисної функції без постійного інтернет-з’єднання. Умови віддаленого керування залежать від комплектації.');
  if(/до\s*12\s*місяц/i.test(facts))capabilities.push('Для автономного режиму виробник указує ресурс акумуляторного живлення до 12 місяців. Фактичний строк залежить від режиму роботи.');
  if(/антизалипан|анти.?закисан|прокручуван/i.test(facts))capabilities.push('У сумісній конфігурації можна використовувати періодичне перемикання клапана для профілактики його заїдання.');
  if(/Google|Alexa/i.test(facts))capabilities.push(`Підтримка голосового керування заявлена для ${/Google/i.test(facts)?'Google Assistant':''}${/Google/i.test(facts)&&/Alexa/i.test(facts)?' та ':''}${/Alexa/i.test(facts)?'Amazon Alexa':''}; можливості залежать від сумісного шлюзу та налаштувань.`);
  if(/застосунок|додаток/i.test(facts))capabilities.push('За наявності передбаченого виробником шлюзу та мережевого підключення доступні відповідні функції мобільного застосунку Tervix.');
  if(raw.kitOnly)capabilities.push('Виробник постачає артикул 401211 тільки у складі комплектів системи. Для окремого придбання в офіційному описі вказано шлюз 401210.');
  if(capabilities.length)sections.push({title:'Можливості та сумісність',paragraphs:capabilities});
  const important=raw.characteristics.filter(x=>/живлення|напруга|тиск|час|крутний|потужність|радіус|кабелю|клас захисту|робоча температура|сумісність/i.test(x.label));
  if(important.length)sections.push({title:'Технічні параметри',paragraphs:important.map(x=>`${x.label}: ${x.value}${x.unit?' '+x.unit:''}.`)});
  const composition = raw.characteristics.find(x=>/комплектація/i.test(x.label));
  if (composition && !sections.some(x=>/комплект/i.test(x.title))) sections.push({ title: 'Комплектація', paragraphs: [composition.value] });
  const shortDescription = clean(`${type} ${model}. ${/ZigBee/i.test(s) ? 'Зв’язок ZigBee. ' : /RF/i.test(s) ? 'Радіозв’язок RF. ' : ''}${diameter ? `Підключення ${diameter}″. ` : ''}${pipes ? `Для ${pipes === '1' ? 'однієї труби' : 'двох труб'}.` : ''}`).slice(0, 300);
  let seoTitle = `${title} — купити в ТД «Софіївка»`; if (seoTitle.length > 70) seoTitle = `${k==='kit'?'Антипотоп':k==='sensor'?'Датчик протікання':k==='valve'?'Електроклапан':k==='controller'?'Шлюз':type} Tervix ${family}${diameter?` ${diameter}″`:''} ${raw.sku}`.slice(0,70);
  let seoDescription = `${title}. ${k==='kit' ? 'Автоматичне перекриття води при протіканні.' : 'Для сумісної системи автоматизації та захисту водопостачання.'} Характеристики та підбір у ТД «Софіївка».`;
  if (seoDescription.length > 160) seoDescription = `${title}. Характеристики, документи та підбір у ТД «Софіївка».`;
  if (seoDescription.length < 120) seoDescription += ' Технічний підбір обладнання.';
  return { title, model, series: family, shortDescription, description: intro+'\n\n'+sections.slice(1).map(x=>`${x.title}\n${x.paragraphs.join('\n\n')}`).join('\n\n'), sections, seoTitle, seoDescription: seoDescription.slice(0,160), k, diameter };
}
async function images(raw) {
  const result = []; const provenance = [];
  for (let i=0;i<raw.gallery.length;i++) {
    const address=raw.gallery[i]; const filename=`${raw.sku.toLowerCase().replace(/[^a-z0-9-]/g,'-')}-${i+1}.webp`; const file=path.join(MEDIA,filename);
    try {
      try { await fs.access(file); } catch { const data=await request(address,true); await sharp(data).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:86,effort:5}).toFile(file); }
      const metadata=await sharp(file).metadata(); if(metadata.format!=='webp'||Math.max(metadata.width,metadata.height)>1600)throw new Error('Invalid WebP dimensions');
      result.push(`assets/products/tervix/${filename}`); provenance.push({url:address,file:result.at(-1),width:metadata.width,height:metadata.height});
    } catch(error) { console.error(`IMAGE ${raw.sku} ${address}: ${error.message}`); }
  }
  return {result,provenance};
}
async function documents(raw) {
  const result=[];const provenance=[];
  for(const address of raw.documentLinks){
    const legacyFile=path.join(MEDIA,`document-${key(address)}.pdf`);
    try { let data; try{data=await fs.readFile(path.join(MEDIA,documentIndex[address]||path.basename(legacyFile)));}catch{data=await request(address,true);}
      if(data.subarray(0,5).toString()!=='%PDF-')throw new Error('Not a PDF');
      // The maker uploads byte-identical manuals under different product URLs.
      // Preserve every source link in provenance but ship one content-addressed PDF.
      const filename=`manual-${crypto.createHash('sha256').update(data).digest('hex').slice(0,16)}.pdf`;
      const file=path.join(MEDIA,filename);try{await fs.access(file);}catch{await fs.writeFile(file,data);}documentIndex[address]=filename;
      const entry={title:'Інструкція',type:'manual',url:`assets/products/tervix/${filename}`};result.push(entry);provenance.push({url:address,file:entry.url,bytes:data.length});
    }catch(error){console.error(`PDF ${raw.sku} ${address}: ${error.message}`);}
  }
  return {result,provenance};
}
function filters(raw,ed,reference){
  const result={};const attrs=reference.attributes;const put=(k,v)=>{if(v===undefined||v===null||v==='')return;if(attrs[k]?.type==='number'||attrs[k]?.values?.includes(v))result[k]=v;};
  const text=raw.characteristics.map(x=>`${x.label}: ${x.value}`).join('\n');
  const controlRows=raw.characteristics.filter(x=>/керування|управління|тип під.?єднання|спосіб зв/i.test(x.label)).map(x=>x.value).join(' ');
  if(/(?:^|\s)(?:провідний|дротовий)|\bWired\b|Ethernet/i.test(raw.sourceTitle))put('control','Дротове');
  else if(/ZigBee|\bRF\b|Wi-?Fi/i.test(raw.sourceTitle))put('control','Бездротове');
  else if(/3.?точ|дротов|кабель|провод/i.test(controlRows))put('control','Дротове');
  if(ed.diameter)put('connection',`${ed.diameter}″`);
  const ip=text.match(/\bIP\s?(\d{2})/i)?.[1];if(ip)put('protectionClass',`IP${ip}`);
  const pressure=raw.characteristics.find(x=>/^Робочий тиск$/i.test(x.label))?.value.match(/[\d.,]+/)?.[0];if(pressure)put('pressureBar',Number(pressure.replace(',','.')));
  if(/5\s*В\s*DC|5V\s*DC/i.test(text))put('voltage','5 В DC');else if(/12\s*В\s*DC/i.test(text))put('voltage','12 В DC');else if(/CR2032/i.test(text)&&ed.k==='sensor')put('voltage','батарея CR2032');
  const productTypes={sensor:'Датчики',controller:'Модуль дистанційного керування',repeater:'Ретранслятори сигналу',kit:'Керування клапанами й приводами',valve:'Керування клапанами й приводами',actuator:'Керування клапанами й приводами',accessory:'Додаткове обладнання'};
  put('productType',productTypes[ed.k]);
  return result;
}
await fs.mkdir(IMPORTS,{recursive:true});await fs.mkdir(MEDIA,{recursive:true});
const discovery=await discover();console.error(`Tervix: ${discovery.candidates.length} scoped candidates from ${discovery.listings.length} catalogue pages`);
if(discoverOnly){console.log(JSON.stringify(discovery,null,2));process.exit(0);}
const reference=JSON.parse(await fs.readFile(path.join(IMPORTS,'reference-prod.json'),'utf8'));
const products=[];const sourceRecords=[];const failures=[];const mediaEvidence=[];
for(const card of discovery.candidates){
  try{
    const raw=await rawProduct(card);sourceRecords.push(raw);if(raw.discontinued){console.error(`SKIP discontinued ${raw.sku}`);continue;}
    const ed=editorial(raw);const image=await images(raw);const pdf=await documents(raw);
    if(!image.result.length)throw new Error(`NO_SOURCE_IMAGES: ${raw.sku}: виробник не опублікував фото; без підміни зображення іншою версією`);
    const price=raw.kitOnly||raw.listingPriceCurrency!=='UAH'?null:raw.listingPrice?Math.round(raw.listingPrice):null;
    products.push({sourceId:raw.sourceId,sourceUrl:raw.sourceUrl,sourceCategory:raw.sourceCategory,sku:raw.sku,model:ed.model,series:ed.series,brand:'tervix',title:ed.title,category:'leak-protection',price,priceCurrency:'UAH',vatIncluded:null,shortDescription:ed.shortDescription,description:ed.description,sections:ed.sections,characteristics:raw.characteristics,filters:filters(raw,ed,reference),images:image.result,documents:pdf.result,related:[],seoTitle:ed.seoTitle,seoDescription:ed.seoDescription});
    mediaEvidence.push({sku:raw.sku,sourceUrl:raw.sourceUrl,images:image.provenance,documents:pdf.provenance});
    console.error(`OK ${raw.sku}: ${image.result.length} photos, ${pdf.result.length} PDF, ${raw.characteristics.length} specifications`);
  }catch(error){failures.push({sourceId:card.sourceId,sourceTitle:card.sourceTitle,sourceUrl:card.sourceUrl,error:error.message});console.error(`FAILED ${card.sourceUrl}: ${error.message}`);}
}
const skuByUrl=new Map(sourceRecords.map(x=>[x.sourceUrl,x.sku]));const rawBySku=new Map(sourceRecords.map(x=>[x.sku,x]));
for(const p of products)p.related=unique(rawBySku.get(p.sku).relatedLinks.map(x=>skuByUrl.get(x)).filter(x=>x&&x!==p.sku));
const homepage=load(await html(BASE));const logoSource=homepage('.logo img').first().attr('src');
if(logoSource){await fs.mkdir(path.join(ROOT,'assets','brands'),{recursive:true});const logoFile=path.join(ROOT,'assets','brands','tervix.png');let exists=false;try{await fs.access(logoFile);exists=true;}catch{}if(refresh||!exists){const logo=await request(url(logoSource),true);await sharp(logo).resize({width:1000,height:400,fit:'inside',withoutEnlargement:true}).png().toFile(logoFile);}}
await writeJson(path.join(IMPORTS,`tervix-${DATE}.source.json`),sourceRecords);
await writeJson(path.join(CACHE,'document-index.json'),documentIndex);
await writeJson(path.join(IMPORTS,`tervix-${DATE}.media.json`),mediaEvidence);
await writeJson(path.join(IMPORTS,`tervix-${DATE}.failures.json`),failures);
const batch={supplier:'tervix',supplierName:'Офіційний український каталог Tervix',brand:'tervix',collectedAt:DATE,sourceSite:BASE,products};
await writeJson(path.join(IMPORTS,`tervix-${DATE}.json`),batch);
await writeJson(path.join(IMPORTS,`tervix-${DATE}.brand.json`),{id:'tervix',name:'Tervix',site:BASE,logo:'assets/brands/tervix.png',description:'Tervix — системи захисту від затоплення, автоматика та компоненти розумного будинку.'});
// Remove only this collector's obsolete generated URL-addressed PDF copies.
// All referenced canonical files remain; each removed file is reproducible from the recorded source URL.
for(const filename of await fs.readdir(MEDIA))if(/^document-[a-f0-9]{16}\.pdf$/.test(filename))await fs.unlink(path.join(MEDIA,filename));
console.log(JSON.stringify({products:products.length,sourceExceptions:failures.filter(x=>x.error.startsWith('NO_SOURCE_IMAGES')).length,unexpectedFailures:failures.filter(x=>!x.error.startsWith('NO_SOURCE_IMAGES')).length,images:mediaEvidence.reduce((n,x)=>n+x.images.length,0),documents:mediaEvidence.reduce((n,x)=>n+x.documents.length,0)},null,2));
if(failures.some(x=>!x.error.startsWith('NO_SOURCE_IMAGES')))process.exitCode=1;
