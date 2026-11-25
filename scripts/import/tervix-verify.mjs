// Offline QA of the official Tervix batch, source evidence and every generated media file.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'../..');
const require=createRequire(path.join(root,'tmp/tervix-tools/package.json'));
const sharp=require('sharp');
const read=async name=>JSON.parse(await fs.readFile(path.join(root,'imports',name),'utf8'));
const batch=await read('tervix-2026-11-25.json');
const sources=await read('tervix-2026-11-25.source.json');
const media=await read('tervix-2026-11-25.media.json');
const exceptions=await read('tervix-2026-11-25.failures.json');
const discovery=await read('tervix-2026-11-25.discovery.json');
assert.equal(batch.products.length+exceptions.length,discovery.candidates.length,'All discovered candidates accounted for');
assert.equal(new Set(batch.products.map(p=>p.sku)).size,batch.products.length);
assert.equal(new Set(batch.products.map(p=>p.title)).size,batch.products.length);
const bySku=new Map(sources.map(p=>[p.sku,p]));const evidence=new Map(media.map(p=>[p.sku,p]));
const files=new Set();const pdfs=new Set();let imageCount=0;
for(const p of batch.products){
  assert.equal(p.brand,'tervix');assert.equal(p.category,'leak-protection');
  assert.equal((p.title.match(/Tervix/gi)||[]).length,1,`${p.sku}: one brand occurrence`);
  assert.ok(p.description.startsWith(p.title),`${p.sku}: original description starts with product title`);
  assert.ok(p.description.length>=120&&p.sections.length>=2,`${p.sku}: substantive description`);
  assert.ok(p.characteristics.length>0,`${p.sku}: source-confirmed specifications`);
  assert.ok(p.shortDescription.length<=300);assert.ok(p.seoTitle.length<=70);
  assert.ok(p.seoDescription.length>=120&&p.seoDescription.length<=160,`${p.sku}: SEO length`);
  assert.ok(p.images.length>0);assert.equal(p.images.length,bySku.get(p.sku).gallery.length,`${p.sku}: entire source gallery`);
  assert.equal(p.images.length,evidence.get(p.sku).images.length);
  assert.equal(p.documents.length,bySku.get(p.sku).documentLinks.length,`${p.sku}: all published source PDFs`);
  if(p.price!==null){assert.equal(bySku.get(p.sku).listingPriceCurrency,'UAH');assert.equal(p.price,Math.round(bySku.get(p.sku).listingPrice));}
  assert.ok(!/[ыэъёЫЭЪЁąćęłńśźżĄĆĘŁŃŚŹŻ]/u.test(JSON.stringify([p.title,p.description,p.characteristics])));
  if(/ORC/i.test(bySku.get(p.sku).sourceTitle))assert.notEqual(p.filters.control,'Бездротове',`${p.sku}: no inferred wireless control`);
  for(const file of p.images){
    assert.ok(file.startsWith('assets/products/tervix/'));files.add(file);imageCount++;
    const metadata=await sharp(path.join(root,file)).metadata();assert.equal(metadata.format,'webp');assert.ok(Math.max(metadata.width,metadata.height)<=1600);
  }
  for(const doc of p.documents){
    assert.ok(doc.url.startsWith('assets/products/tervix/'));files.add(doc.url);pdfs.add(doc.url);
    const data=await fs.readFile(path.join(root,doc.url));assert.equal(data.subarray(0,5).toString(),'%PDF-');
  }
}
for(const file of pdfs)execFileSync('pdfinfo',[path.join(root,file)],{stdio:'pipe'});
for(const sku of ['201164','201165'])assert.ok(!batch.products.find(p=>p.sku===sku).characteristics.some(x=>x.label==='Номінальний тиск'));
assert.equal(batch.products.find(p=>p.sku==='401211').price,null);
assert.equal(exceptions.length,1);assert.match(exceptions[0].error,/401112/);
const picks=[0,6,7,8,9,10,12,14,21,22,23,24,25,29,38,47].map(i=>batch.products[i]);
const cells=[];const cellWidth=240,cellHeight=230;
for(let i=0;i<picks.length;i++){
  const p=picks[i];const photo=await sharp(path.join(root,p.images[0])).resize({width:220,height:195,fit:'contain',background:'#ffffff'}).png().toBuffer();
  cells.push({input:photo,left:(i%4)*cellWidth+10,top:Math.floor(i/4)*cellHeight+4});
  const caption=Buffer.from(`<svg width="240" height="28"><rect width="240" height="28" fill="white"/><text x="120" y="20" text-anchor="middle" font-family="Arial" font-size="16" fill="#222">${p.sku}</text></svg>`);
  cells.push({input:caption,left:(i%4)*cellWidth,top:Math.floor(i/4)*cellHeight+200});
}
await sharp({create:{width:4*cellWidth,height:4*cellHeight,channels:3,background:'#e5e5e5'}}).composite(cells).jpeg({quality:90}).toFile(path.join(root,'imports/tervix-2026-11-25.contact-sheet.jpg'));
let assetBytes=0;for(const f of files)assetBytes+=(await fs.stat(path.join(root,f))).size;
const result={status:'ok',products:batch.products.length,candidates:discovery.candidates.length,sourceExceptions:exceptions.length,imageCount,uniquePDFs:pdfs.size,pdfReferences:batch.products.reduce((n,p)=>n+p.documents.length,0),assetBytes,allSourceGalleryImagesRetained:true,allSourcePdfLinksVerified:true,pdfinfo:'all passed',sourceIssues:sources.filter(p=>p.sourceIssues.length).map(p=>({sku:p.sku,issues:p.sourceIssues}))};
await fs.writeFile(path.join(root,'imports/tervix-2026-11-25.qa.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
