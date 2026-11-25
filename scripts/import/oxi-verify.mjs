// Local authenticity, completeness, media, PDF and copy checks for the official OXI batch.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=path.resolve(import.meta.dirname,'../..');
const require=createRequire(path.join(ROOT,'tmp/import-tools/package.json'));
const sharp=require('sharp');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const batch=JSON.parse(await fs.readFile(path.join(ROOT,'imports/oxi-2026-11-25.json'),'utf8'));
const audit=JSON.parse(await fs.readFile(path.join(ROOT,'imports/oxi-source-audit.json'),'utf8'));
const feed=JSON.parse(await fs.readFile(path.join(ROOT,'imports/oxi-feed.json'),'utf8'));
const expected=feed.products.filter(p=>/^Пелетний пальник OXI /u.test(p.title)).flatMap(p=>p.editions.map(e=>({uid:String(e.uid),sku:e.sku.replace(/С$/u,'C')})));
assert.equal(batch.products.length,21);assert.equal(audit.burnerMasters,17);
assert.deepEqual(batch.products.map(p=>({uid:p.sourceId,sku:p.sku})),expected);
assert.equal(new Set(batch.products.map(p=>p.title)).size,21);
assert.equal(new Set(batch.products.map(p=>p.sourceId)).size,21);
for(const p of batch.products){
  assert.equal(p.price,null);assert.equal(p.priceCurrency,'EUR');assert.ok(p.sourcePrice>0);
  assert.ok(p.description.startsWith(p.title));assert.ok(p.shortDescription.length<=300);
  assert.ok(p.seoTitle.length<=70);assert.ok(p.seoDescription.length>=120&&p.seoDescription.length<=160);
  assert.ok(p.images.length>=8);assert.equal(p.documents.length,1);assert.ok(p.characteristics.length>=25);
  assert.ok(!('consumptionPowerW' in p.filters));assert.ok(!('protectionClass' in p.filters));
  assert.deepEqual(p.sourceEvidence.conflicts,p.sourceIssues);assert.deepEqual(p.sourceEvidence.configurations,p.sourceConfigurations);
  assert.deepEqual(p.sourceEvidence.rawCharacteristics,p.sourceCharacteristics);
  assert.equal(p.sourceEvidence.sourcePrice,p.sourcePrice);assert.equal(p.sourceEvidence.rawSku,p.sourceSku);
  assert.ok(!/[ыэъёЫЭЪЁąćęłńśźżĄĆĘŁŃŚŹŻ]/u.test([p.title,p.description,p.shortDescription,p.seoTitle,p.seoDescription].join(' ')));
  const own=audit.media.filter(m=>m.sku===p.sku);assert.equal(own.length,p.images.length);
  assert.deepEqual(new Set(own.map(m=>m.path)),new Set(p.images));
  for(const media of own){
    const bytes=await fs.readFile(path.join(ROOT,media.path));assert.equal(hash(bytes),media.sha256);
    const meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();
    assert.equal(meta.format,'webp');assert.ok(meta.width<=1600&&meta.height<=1600);
    assert.ok(Math.min(meta.width,meta.height)>=100&&bytes.length>=1024,'no tiny placeholders');
    assert.ok(stats.entropy>.1&&stats.channels.some(c=>c.stdev>1),'no blank images');
    assert.equal(media.sourcePage,p.sourceUrl);assert.equal(media.variantSourceUid,p.sourceId);
  }
}
for(const d of audit.documents){const b=await fs.readFile(path.join(ROOT,d.path));assert.equal(hash(b),d.sha256);assert.equal(b.subarray(0,5).toString(),'%PDF-');}
const counts=Object.fromEntries(['photo','mounting-component','drawing'].map(kind=>[kind,audit.media.filter(m=>m.kind===kind).length]));
const report={status:'PASS',products:21,burnerMasters:17,media:audit.media.length,mediaByKind:counts,uniquePdfs:3,pdfAssignments:21,pricesUAH:0,pricesSourceEUR:21,
  characteristics:batch.products.reduce((n,p)=>n+p.characteristics.length,0),omitted:audit.omitted,sourceConflictCodes:[...new Set(audit.issues.flatMap(i=>i.sourceIssues.map(s=>s.code)))],
  batchSha256:hash(await fs.readFile(path.join(ROOT,'imports/oxi-2026-11-25.json')))};
await fs.writeFile(path.join(ROOT,'imports/oxi-quality-report.json'),JSON.stringify(report,null,2)+'\n');

// Contact sheet shows every model's original primary gallery photo for a separate visual pass.
const cells=await Promise.all(batch.products.map(async(p,i)=>{
  const picture=await sharp(path.join(ROOT,p.images[0])).resize({width:300,height:220,fit:'contain',background:'#fff'}).png().toBuffer();
  const label=Buffer.from(`<svg width="300" height="35"><rect width="300" height="35" fill="white"/><text x="8" y="25" font-family="Arial" font-size="20">${p.sku}</text></svg>`);
  return [{input:picture,left:(i%4)*300,top:Math.floor(i/4)*255},{input:label,left:(i%4)*300,top:Math.floor(i/4)*255+220}];
}));
await sharp({create:{width:1200,height:Math.ceil(batch.products.length/4)*255,channels:3,background:'#fff'}}).composite(cells.flat()).png().toFile(path.join(ROOT,'tmp/oxi-source/primary-gallery-qa.png'));
console.log(JSON.stringify(report));
