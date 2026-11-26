// Meaningful finite checks for the reviewed alias set; no workbook/job/hosted mutations.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const all=read('imports/rehau-prices-2026-11-26/reviewed-all-discrete-aliases.json'),extra=read('imports/rehau-prices-2026-11-26/reviewed-additional-discrete-aliases.json');
const decisions=read('imports/rehau-prices-2026-11-26/reviewed-alias-decisions.json').rows,summary=read('imports/rehau-prices-2026-11-26/reviewed-alias-summary.json');
const byQuote=new Map(decisions.map(x=>[x.quoteId,x])),original=new Set(read('imports/overnight-prices/rehau-name-compatible-aliases.json').map(x=>x.sourceSku));
const excluded=new Set([...read('imports/rehau-no-tools-exclusions.json').products.map(x=>x.sku),'10013181001']);
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
check(decisions.length===1408&&byQuote.size===1408,'Every original REHAU quote has one explicit decision');
check(all.length===923&&extra.length===465,'The frozen discrete alias scope is exact');
check(new Set(all.map(x=>x.sourceSku)).size===923&&new Set(all.map(x=>x.catalogSku)).size===923,'One-to-one material aliases');
let quotes=0;
for(const alias of all){
 check(alias.catalogSku===`1${alias.sourceSku.slice(0,6)}1${alias.sourceSku.slice(6)}`&&/^\d{9}$/.test(alias.sourceSku),'Exact documented SAP conversion, not a fuzzy SKU match');
 check(!excluded.has(alias.catalogSku),'No excluded REHAU tool is priced or republished');
 for(const id of alias.acceptedQuoteIds){
  const d=byQuote.get(id);check(d?.decision.startsWith('eligible-'),'Only explicitly reviewed quote IDs may be selected');
  check(d.catalogSku===alias.catalogSku&&d.sourceSku===alias.sourceSku,'Quote binds exactly to its approved material');
  check(d.catalogue.publicationStatus==='published'&&d.manufacturer.exactSku===d.catalogSku,'Published current product with preserved exact-SKU manufacturer record');
  check(Number(d.sourcePrice)>0,'No missing/zero source price becomes a price');
  check(!d.secondaryBlockers.length,'No conflicting duplicate/variant is accepted');
  check(!(d.manufacturer.priceUnitEvidence||[]).some(x=>x.unit&&!/EUR\/(?:шт|St|Stk|pc|pce)$/i.test(x.unit)),'No measured manufacturer price unit is silently treated as a piece');
  const pipeNamed=/^(?:Універсальна\s+)?(?:Труба|Гофротруба)(?:\s|$)/iu.test(d.sourceName);
  check(!pipeNamed||d.manufacturer.etimClass?.name==='Anschlussgarnitur Wand-WC','Cyrillic pipe names fail closed; WC installation fittings require their explicit class');
  quotes++;
 }
}
check(quotes===925,'Two same-price source duplicates are retained as traceable quotes for one SKU each');
check(extra.every(x=>!original.has(x.sourceSku)),'The supplemental file is disjoint from the original569 aliases');
const pipes=decisions.filter(x=>x.decision==='hold-pipe-unit-basis');
check(pipes.length===151&&pipes.filter(x=>x.originalBaseline).length===111,'Pipe hold includes original569 and remaining review, including class-null UA-only pipes');
for(const sku of ['120184005','120944222','160250240'])for(const d of decisions.filter(x=>x.sourceSku===sku))check(d.secondaryBlockers.some(x=>x.kind==='conflicting-duplicate-source-article')&&!d.pipeUnitConfirmationAloneSufficient,'A pipe-unit answer cannot release a conflicting duplicate');
for(const row of [396,923,976,1233,1234,1375,1381,1390])check(!decisions.find(d=>d.sourceRow===row).decision.startsWith('eligible'),'Known mass/volume, originality, thread, size and UNO/DUO conflicts remain blocked');
check(Object.values(summary.counts).reduce((a,b)=>a+b,0)===1408,'Full decision partition reconciles independently');
for(const [name,file]of Object.entries({evidence:'imports/overnight-prices/rehau-alias-evidence.json',baseline:'imports/overnight-prices/rehau-name-compatible-aliases.json'})){
 const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');check(hash===summary.originalHashes[name],'Frozen evidence/baseline files are unchanged');
}
console.log(JSON.stringify({status:'PASS',checks,discreteAliases:923,eligibleQuotes:quotes,additionalAliases:465,heldPipeQuotes:151,heldOriginal569Pipes:111,allQuoteDecisions:1408,hostedConnections:0,filesWritten:0}));
