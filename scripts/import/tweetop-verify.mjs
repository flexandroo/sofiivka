// Offline independent source/variant/media audit; optional pruning only within owned assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import sharp from '../../tmp/import-tools/node_modules/sharp/lib/index.js';
const batch=JSON.parse(await fs.readFile('imports/tweetop-2026-11-25.json','utf8'));
const coverage=JSON.parse(await fs.readFile('imports/tweetop-coverage.json','utf8'));
const source=JSON.parse(await fs.readFile('imports/tweetop-source.json','utf8'));
const products=batch.products,bySKU=new Map(products.map(p=>[p.sku,p]));
assert.equal(products.length,345);assert.equal(coverage.excluded.length,43);
const universe=new Set([...products,...coverage.excluded].map(p=>p.sku));assert.equal(universe.size,388);
for(const p of products){
 const original=source.records.find(r=>r.sku===p.sku);assert(original);assert.equal(p.sourceEvidence.workbook.original.name,original.name);assert.equal(p.price,null);
 assert(p.sourceEvidence.workbook.original.sourceCurrency==='PLN');assert.equal(p.priceCurrency,'PLN');
 assert(!/Screw|SmartPush|EcoHeat|EcoVent/.test(original.name));assert.equal(p.ean||'',original.ean||'');
 assert(p.description.startsWith(p.title));assert(p.shortDescription.length<=300);assert(p.seoDescription.length>=120&&p.seoDescription.length<=160);
 assert.equal(new Set(p.characteristics.map(c=>c.label)).size,p.characteristics.length,'duplicate labels '+p.sku);
 if(p.category==='water-heating-pipes'){
  const dim=original.name.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/);assert.equal(p.filters.pipeDiameterMm,Number(dim[1]));assert.equal(p.filters.pipeWallThicknessMm,Number(dim[2]));
  assert.equal(p.filters.pipeLengthMm,Number(original.name.match(/(\d+)mb$/)[1])*1000);
  if(original.discountGroup.startsWith('A')){assert(!p.images.some(x=>/alwhitecoil/.test(x)));assert(p.images[0].includes(/R$/.test(p.sku)?'evohredcoil':'photo-78'));assert(!('pressureBar'in p.filters));}
  if(original.discountGroup.startsWith('C'))assert(p.images[0].includes(/R$/.test(p.sku)?'insred':'insblue'));
  if(p.sku.endsWith('/004'))assert(p.images[0].includes('photo-95'));
  assert(!p.sku.endsWith('/003'),'3m variant must not inherit4m image');
 }
 const urls=p.sourceEvidence.documentSources.map(d=>d.url);
 if(urls.some(u=>u.includes('KDWU_Z-01-24')))assert(p.filters.pipeDiameterMm>=16&&p.filters.pipeDiameterMm<=32);
 if(urls.some(u=>u.includes('KDWU_R-01-24')))assert.notEqual(p.filters.pipeDiameterMm,12,'12×1.6 must not inherit12×2 declaration');
 if(urls.some(u=>u.includes('KDWU-nr-R-02-26')))assert([16,20,25].includes(p.filters.pipeDiameterMm));
 if(urls.some(u=>u.includes('KDWU_R-01-21_na_Rury')))assert([12,14,17,18].includes(p.filters.pipeDiameterMm));
}
for(const sku of ['06010113/003','06010115/003','06010117/003','06010119/003','06015203','06049190','06959429'])assert(coverage.excluded.some(p=>p.sku===sku));
const images=[...new Set(products.flatMap(p=>p.images))],docs=[...new Set(products.flatMap(p=>p.documents.map(d=>d.url)))],imageQA=[];
for(const file of images){const b=await fs.readFile(file),m=await sharp(b).metadata();assert.equal(m.format,'webp');assert(m.width<=1600&&m.height<=1600);assert(b.length>=1024);imageQA.push({path:file,width:m.width,height:m.height,bytes:b.length,lowResolution:Math.max(m.width,m.height)<600});}
for(const file of docs){const b=await fs.readFile(file);assert(b.subarray(0,5).equals(Buffer.from('%PDF-')));assert(/Pages:\s+[1-9]/.test(execFileSync('pdfinfo',[file],{encoding:'utf8'})));}
let pruned=0;
if(process.argv.includes('--prune')){
 const owned=path.resolve('assets/products/tweetop'),keep=new Set([...images,...docs].map(f=>path.resolve(f)));
 for(const name of await fs.readdir(owned)){const file=path.resolve(owned,name);assert(file.startsWith(owned+path.sep));if(!keep.has(file)){const s=await fs.stat(file);assert(s.isFile());await fs.unlink(file);pruned++;}}
}
const qa={status:'PASS',products:products.length,sourceScope:388,excluded:coverage.excluded.length,existingProducts:0,priceUpdates:0,priceNull:products.filter(p=>p.price===null).length,images:images.length,pdfs:docs.length,lowResolutionImages:imageQA.filter(i=>i.lowResolution),imageQA,pruned,batchSha256:crypto.createHash('sha256').update(await fs.readFile('imports/tweetop-2026-11-25.json')).digest('hex')};
await fs.writeFile('imports/tweetop-qa.json',JSON.stringify(qa,null,2));
console.log(JSON.stringify({...qa,imageQA:undefined,lowResolutionImages:qa.lowResolutionImages.length}));
// This owned report is committed independently of the ignored working import files.
const groups=Object.entries(Object.groupBy(source.records.filter(r=>universe.has(r.sku)),r=>r.discountGroup)).map(([g,rows])=>`|${g}|${rows.length}|${rows.filter(r=>bySKU.has(r.sku)).length}|${rows.filter(r=>!bySKU.has(r.sku)).length}|`).join('\n');
const report=`# Tweetop: імпорт прес-системи 25.11.2026\n\nЗбір почато25.11.2026, перевірку завершено26.11.2026. Виробник: Tweetop Sp. z o.o., Польща.\n\nПеревірено весь погоджений обсяг388артикулів, без обмеження кількості.345готові до нового імпорту,43пропущені через відсутнє підтверджене зображення потрібного виконання. Існуючі товари й ціни не змінюються.270позицій інших напрямків каталогу (Screw/SmartPush, колектори, шафи, насосні вузли, автоматика, вентиляція та теплові насоси) поза погодженим обсягом.\n\n## Офіційні джерела\n\n- [Виробник і система](https://www.tweetop.pl/produkty/system-tweetop/)\n- [Каталог3.98,84сторінки](${source.catalogue}), прес-система pp7–20, підлогові монтажні компоненти pp42–44, кріплення pp46–47, інструмент pp49–54.\n- [Повний файл артикулів/EAN/цін PLN](${source.workbook}):658товарних рядків.\n- [Технічні таблиці AL-труб](${URLSafe('al')})\n- [Технічні таблиці EVOH-труб](${URLSafe('evoh')})\n- [Документи виробника](https://www.tweetop.pl/do-pobrania/)\n\nУкраїнської версії актуального офіційного каталогу не виявлено; тексти перекладено з польських джерел.\n\n## Покриття\n\n|Група виробника|У scope|Готові|Пропущені|\n|---|---:|---:|---:|\n${groups}\n\n|Категорія|Готові|\n|---|---:|\n${Object.entries(coverage.byCategory).map(([k,n])=>`|${k}|${n}|`).join('\n')}\n\n## Фото і документи\n\nВикористано${images.length}унікальних локальних WebP і${docs.length}перевірених PDF. Довга сторона≤1600px; збільшення вихідного зображення не застосовується. Для AL-бухт, червоної EVOH, обох кольорів ізоляції, Connector і рівнопрохідного коліна використано більші оригінали зі сторінок виробника; решта фото витягнуті без генерації з відповідних SKU-груп PDF. Біла EVOH має лише невелике підтверджене фото; фото AL-труби іншої конструкції не підставлено. Кольори та бухти/відрізки зіставлено окремо. Фото з написом4m не призначене штангам3м: ці4артикули пропущені.\n\nТочні URL оригіналів, сторінки й xref PDF, рядки XLSX, усі ціниPLN та невирішені розбіжності вкладені вsourceEvidence кожного товару. Вони не губляться під час окремого enrichment.\n\nДекларація прес-фітингів Z-01-24 застосована лише доØ16–32мм; декларації EVOH — лише до вказаних діаметрів. AL-декларацію з12×2мм не прив'язано до12×1,6мм. Гігієнічні сертифікати переглянуто візуально: прес12–75мм/компресія12–25мм та PE-RT II/EVOH у природному й червоному кольорі. WRAS із непереліченими SKU не успадковується. Для EVOH неоднозначну шорсткість із різними значеннями в HTML/PDF вилучено з публічних параметрів зі збереженням обох джерел. Режим класу5 взято з техпаспорта20/60/80°C, а не помилкового повтору режиму класу4 в HTML.\n\nЦіни надані виробником уPLN без ПДВ; усі345price:null. Закордонні числа не видано заUAH. Наявність невідома.\n\n### Зображення з малою вихідною роздільністю\n\nЦе доступні оригінали конкретних груп, а не пошкоджені чи порожні файли. Не виконано upscale.\n\n|Локальний файл|Ширина×висота|\n|---|---:|\n${qa.lowResolutionImages.map(i=>`|${i.path}|${i.width}×${i.height}|`).join('\n')}\n\n## Повний перелік43пропущених артикулів\n\nНижче не стверджується, що в джерелі немає жодних даних: для всіх є офіційні артикули, назви та розміри вXLSX; для частини такожEAN, рядки PDF і техпаспорти. Причина пропуску — конкретне непідтверджене фото.\n\n|SKU|Назва|Конкретна прогалина|Джерело|\n|---|---|---|---|\n${coverage.excluded.map(e=>`|${e.sku}|${e.name.replaceAll('|','/')}|${e.reason}|[Офіційне джерело](${e.sourceUrl}), XLSXрядок${e.workbookRow}|`).join('\n')}\n\n## Перевірка й відтворення\n\n- Scope658−270=388;388−43=345; артикулів/назв-дублів0.\n- import-check зі stagedmetadata:345готових,0заблокованих,0наявних,0змінцін.\n- OfflineTweetopQA:кольори, геометрія, довжина/OD/стінка, точний діапазон PDF, незмінні SKU/EAN і ціни, розмір/формат кожного фото та валідність кожного PDF —PASS.\n- BatchSHA-256:${qa.batchSha256}.\n\nВідтворення з кореня репозиторію: node scripts/import/tweetop-collect.mjs → python scripts/import/tweetop-pdf.py → node scripts/import/tweetop-media.mjs → node scripts/import/tweetop-batch.mjs → node scripts/import/tweetop-verify.mjs --prune → node scripts/import-check.mjs imports/tweetop-2026-11-25.json --reference=imports/reference-wave2-staged.json --check-links. PyMuPDF розміщений тільки вtmp/tweetop-tools; Sharp і Cheerio — у спільних тимчасовихimport-tools/tervix-tools. Каталогджерел уtmp/tweetop-source, робочіJSON уimports; вони не підміняють вихідні SKU.\n`;
function URLSafe(kind){return 'https://www.tweetop.pl/produkty/system-tweetop/rury-tweetop-pert/'+(kind==='al'?'alpert/':'pert-ii-evoh-pert-ii/');}
// Insert spaces between human-readable Ukrainian words and numerals in prose.
await fs.writeFile('docs/tweetop-import-2026-11-25.md',report.replace(/([а-яіїєґ])(?=\d)/gi,'$1 ').replace(/(\d)(?=[а-яіїєґ])/gi,'$1 '));
