import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const ROOT=process.cwd();
const require=createRequire(path.join(ROOT,'tmp/tervix-tools/package.json'));
const cheerio=require('cheerio');
const cache=path.join(ROOT,'tmp/tweetop-source');
const base='https://www.tweetop.pl';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,12);
await fs.mkdir(cache,{recursive:true});
async function get(url){const file=path.join(cache,hash(url)+'.html');try{return await fs.readFile(file,'utf8')}catch{} const r=await fetch(url);if(!r.ok)throw Error(`${r.status} ${url}`);const html=await r.text();await fs.writeFile(file,html);return html;}
const start=base+'/produkty/system-tweetop/';
const html=await get(start);const $=cheerio.load(html);
const urls=[...new Set($('a[href]').map((i,e)=>new URL($(e).attr('href'),base).href).get().filter(u=>u.startsWith(start)&&u!==start))];
const pages=[],technicalTables={},originalImages=[];
for(const url of urls){const h=await get(url),p=cheerio.load(h);pages.push({url,title:p('h1').first().text().trim(),tables:p('table').length,headings:p('h2,h3').map((i,e)=>p(e).text().trim()).get(),images:p('img').map((i,e)=>({src:p(e).attr('src'),alt:p(e).attr('alt')})).get(),documents:p('a[href$=".pdf"]').map((i,e)=>({url:p(e).attr('href'),label:p(e).text().trim()})).get()});technicalTables[url]=p('table').map((i,t)=>[p(t).find('tr').map((i,e)=>[p(e).find('td,th').map((j,c)=>p(c).text().replace(/\s+/g,' ').trim()).get()]).get()]).get();originalImages.push(...[...h.replaceAll('\\/','/').matchAll(/https:\/\/www\.tweetop\.pl\/wp-content\/uploads\/[^\s'"<>\)]+\.(?:png|jpe?g|webp)/g)].map(x=>({page:url,url:x[0]})).filter(x=>!/-\d+x\d+\.|logo|loga\.png|logos|headphone|android-chrome/.test(x.url)));console.log(url,p('table').length,p('h2').length);}
await fs.mkdir(path.join(ROOT,'imports'),{recursive:true});
await fs.writeFile(path.join(ROOT,'imports/tweetop-pages.json'),JSON.stringify(pages,null,2));
await fs.writeFile(path.join(ROOT,'imports/tweetop-technical-source.json'),JSON.stringify(technicalTables,null,2));
await fs.writeFile(path.join(ROOT,'imports/tweetop-original-images.json'),JSON.stringify([...new Map(originalImages.map(x=>[x.page+x.url,x])).values()],null,2));
const d=cheerio.load(await get(base+'/do-pobrania/'));
const downloads=d('a[href]').map((i,e)=>({url:d(e).attr('href'),label:d(e).text().replace(/\s+/g,' ').trim()})).get().filter(x=>/\.(pdf|xlsx)$/i.test(x.url));
await fs.writeFile(path.join(ROOT,'imports/tweetop-downloads.json'),JSON.stringify(downloads,null,2));
console.log(JSON.stringify(downloads.filter(x=>/Katalog Tweetop|Arkusz ofertowy|rury typu|Certyfikat WRAS|EVOH|kształtki/i.test(x.label)),null,2));
for(const x of downloads.filter(x=>/Katalog Tweetop|Arkusz ofertowy/.test(x.label))){const file=path.join(cache,path.basename(new URL(x.url).pathname));try{await fs.stat(file)}catch{const r=await fetch(x.url);if(!r.ok)throw Error(`${r.status} ${x.url}`);await fs.writeFile(file,Buffer.from(await r.arrayBuffer()));}console.log('DOWNLOADED',file);}
