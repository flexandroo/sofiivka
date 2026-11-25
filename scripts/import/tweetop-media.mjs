// Public manufacturer assets only. Source cache and embedded photos are reproducible.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from '../../tmp/import-tools/node_modules/sharp/lib/index.js';
const root=process.cwd(), dest='assets/products/tweetop';
await fs.mkdir(dest,{recursive:true});await fs.mkdir('assets/brands',{recursive:true});
const pages=JSON.parse(await fs.readFile('imports/tweetop-pdf-source.json','utf8'));
const downloads=JSON.parse(await fs.readFile('imports/tweetop-downloads.json','utf8'));
const pageMeta=JSON.parse(await fs.readFile('imports/tweetop-pages.json','utf8'));
const images=[...new Map(pages.flatMap(p=>p.images.map(i=>[i.xref,{...i,page:p.page}]))).values()];
const map={images:{},documents:{}};
for(const i of images){
 const out=`${dest}/catalogue-photo-${i.xref}.webp`;
 // PDF rotation is presentation metadata, not embedded in the original pixels.
 const angle=Math.atan2(i.transform[1],i.transform[0])*180/Math.PI;
 await sharp(i.file).rotate(angle,{background:'#fff'}).flatten({background:'#fff'}).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({lossless:true}).toFile(out);
 map.images[i.xref]={path:out,page:i.page,xref:i.xref,source:'https://www.tweetop.pl/wp-content/uploads/2026/06/Katalog_v3.98_web.pdf',width:i.width,height:i.height};
}
async function binary(url,file){try{await fs.stat(file);return}catch{}const r=await fetch(url);if(!r.ok)throw Error(`${r.status}: ${url}`);await fs.writeFile(file,Buffer.from(await r.arrayBuffer()));}
// General system documents are intentionally separate from model/series-specific sheets.
const docUrls=new Set([
 ...pageMeta.filter(p=>/alpert\/|zaprasowywane-tweetop-pert\//.test(p.url)).flatMap(p=>p.documents.map(x=>x.url)),
 ...downloads.filter(x=>!/archiwum/.test(x.label)&&(/Katalog Tweetop|rury typu PERT|rur typu PERT|rury PERT II|Certyfikat WRAS/.test(x.label))).map(x=>x.url)
]);
for(const url of docUrls){const basename=path.basename(new URL(url).pathname);const out=`${dest}/${basename.replace(/\.pdf$/i,'').toLowerCase().replace(/[^a-z0-9.-]+/g,'-')}-${crypto.createHash('sha256').update(url).digest('hex').slice(0,8)}.pdf`;
 const cached=path.join('tmp/tweetop-source',basename);try{await fs.copyFile(cached,out)}catch{await binary(url,out)}
 const bytes=await fs.readFile(out);if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Not PDF '+url);
 const info=execFileSync('pdfinfo',[out],{encoding:'utf8'});if(!/Pages:\s+[1-9]/.test(info))throw Error('Invalid PDF '+url);
 map.documents[url]={path:out,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 console.log('PDF',basename,bytes.length);
}
const diagram='https://www.tweetop.pl/wp-content/uploads/2025/02/budowa-rur-PERT-scaled.png';const tmp='tmp/tweetop-source/pipe-al-construction.png';await binary(diagram,tmp);const diagOut=`${dest}/pipe-al-construction.webp`;await sharp(tmp).flatten({background:'#fff'}).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toFile(diagOut);map.images.alConstruction={path:diagOut,source:diagram};
const originals={alWhiteCoil:'PERT-AL-PERT-WHITE.png',evohRedCoil:'PERT-AL-CZERWONY.png',insBlue:'rura-w-otulinie-niebieska_nowa.png',insRed:'rura-w-otulinie-czerwona_nowa.png',evohConstruction:'budowa-rur-EVOH-scaled.png',insConstruction:'budowa-rur-IZOLACJA-scaled.png',pressElbow:'kol-rownoprzelotowe-1.png',pressConstruction:'zapras_new.png',connectorBrass:'24_zlaczka_podejsciowa-mosiadz-1.png',connectorNickel:'24_zlaczka_podejsciowa-nikiel-1.png'};
for(const[id,name]of Object.entries(originals)){const url='https://www.tweetop.pl/wp-content/uploads/2025/02/'+name;const file='tmp/tweetop-source/'+name;await binary(url,file);const metadata=await sharp(file).metadata();const out=`${dest}/${id.toLowerCase()}.webp`;await sharp(file).flatten({background:'#fff'}).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({lossless:true}).toFile(out);map.images[id]={path:out,source:url,width:metadata.width,height:metadata.height};console.log('ORIGINAL',id,metadata.width,metadata.height);}
await binary('https://www.tweetop.pl/wp-content/uploads/2024/11/tweetop-logo.svg','assets/brands/tweetop.svg');
await fs.writeFile('imports/tweetop-media.json',JSON.stringify(map,null,2));
console.log(JSON.stringify({images:Object.keys(map.images).length,documents:Object.keys(map.documents).length,logo:'assets/brands/tweetop.svg'}));
