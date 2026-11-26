// Finite review of the provided REHAU workbook only. New artifacts; no frozen job/workbook/database changes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'imports/rehau-prices-2026-11-26');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const evidence=read('imports/overnight-prices/rehau-alias-evidence.json'),baseline=read('imports/overnight-prices/rehau-name-compatible-aliases.json');
const originalHashes={evidence:sha('imports/overnight-prices/rehau-alias-evidence.json'),baseline:sha('imports/overnight-prices/rehau-name-compatible-aliases.json')};
const ref=read('imports/rehau-prices-2026-11-26/catalog-reference.json');
const current=new Map(ref.rows.map(row=>Object.fromEntries(ref.columns.map((key,i)=>[key,row[i]]))).filter(x=>x.brand==='rehau').map(x=>[x.sku,x]));
const products=new Map(read('imports/rehau-no-tools-2026-11-26.json').products.map(p=>[p.sku,p]));
const baselineSkus=new Set(baseline.map(x=>x.sourceSku)),bySource=new Map();
for(const row of evidence.rows){if(!bySource.has(row.sourceSku))bySource.set(row.sourceSku,[]);bySource.get(row.sourceSku).push(row);}
const conflictRows=new Map([
 [396,'Source calls the lubricant250g while the current manufacturer material is250ml. Mass and volume are not interchangeable; no conversion is invented.'],
 [300,'Source names125mm but the current catalogue title says25mm. Hold until the exact manufacturer variant/public-title inconsistency is resolved.'],
 [322,'The source tee description specifies63x8.8 while SDR11/current material identifies63. Do not silently reinterpret a contradictory wall/series detail.'],
 [358,'The source tee description specifies63x8.8 while SDR11/current material identifies63. Do not silently reinterpret a contradictory wall/series detail.'],
 [923,'Source explicitly says non-original, without rubbers/bolts. Do not apply this offer to an original complete manufacturer article.'],
 [976,'Source specifies20mm but the current catalogue title says16mm. The primary variant needs separate manufacturer/public-title adjudication.'],
 [1233,'Source explicitly says internal thread but the current catalogue title says external. Hold the conflicting role rather than guessing.'],
 [1234,'Source explicitly says internal thread but the current catalogue title says external. Hold the conflicting role rather than guessing.'],
 [1375,'The source labels UNO but describes63+63, while the current manufacturer article is DUO. Do not guess which source label is wrong.'],
 [1381,'Source wall seal size200/234 differs from the current manufacturer202/234; no nominal-to-outer-diameter equivalence is assumed.'],
 [1390,'Source pre-insulated bend125/182 differs from the current manufacturer125/200; do not substitute a different outer-casing variant.'],
 [1452,'Source says manifold with flowmeters but the current catalogue title says without flowmeters. Hold the unresolved kit/variant conflict.'],
 [778,'Source model NeaHT differs from the current manufacturer NeaH designation. No controller-function equivalence is assumed.']
]);
const legacyOuterBendRows=new Set([1384,1385,1386,1387,1388,1389,1391,1392,1393,1394,1395,1396]);
const className=p=>p?.sourceEvidence?.sourceEtim?.class?.name||'';
function physicalPipe(row,p){
 const c=className(p),name=[row.sourceName,p?.sourceEvidence?.sourceTitle].filter(Boolean).join(' ');
 const fitting=/^Fitting mit|Anschlussgarnitur|Heizkörperanschluss|Rohranschlussgarnitur/i.test(c);
 if(fitting)return false;
 if(p?.category?.endsWith('-pipes')||p?.category==='ventilation-ducts')return true;
 if(/Kunststoffrohr|Mehrschichtrohr|Vorisoliertes.*rohr|Installationsrohr|Elektroinstallationsrohr/i.test(c))return true;
 return /^(?:Універсальна\s+)?(?:Труба|Гофротруба)(?:\s|$)/iu.test(row.sourceName)&&!/^Труба.*для унітаза/iu.test(row.sourceName);
}
function otherMeasureBasis(row,p){
 const units=[...new Set((p?.sourceEvidence?.sourcePrices||[]).map(x=>x.unit).filter(Boolean))];
 if(units.some(x=>/EUR\/(?:м[²2]?|кг|kg|m[²2]?)$/i.test(x)))return{reason:'Official manufacturer prices use a length/area/mass unit, while the workbook does not declare its price basis. No pack/measure conversion is assumed.',units};
 if(/(?:мат\b|панел|плівк|ізоляці.*рулон|ізоляц.*р\.|каністр|пакет\s*\d+\s*кг)/iu.test(row.sourceName)&&!units.some(x=>/EUR\/(?:шт|St|Stk|pc|pce)$/i.test(x)))return{reason:'A sheet/mat/roll/container may be priced by piece or measured contents; the supplied row/header does not declare that basis. No area/length/pack multiplier is used.',units};
 return null;
}
const decisions=[],additional=[],accepted=[];
for(const row of evidence.rows){
 const product=current.get(row.catalogSku),p=products.get(row.catalogSku),old=row.sourceSku,newSku=/^\d{9}$/.test(old)?`1${old.slice(0,6)}1${old.slice(6)}`:null;
 let decision,reason;const duplicates=bySource.get(old),prices=new Set(duplicates.filter(x=>x.sourcePrice!==null).map(x=>x.sourcePrice));
 if(!newSku||newSku!==row.catalogSku){decision='blocked-no-documented-nine-digit-article';reason='No exact application of the documented six-digit+suffix SAP conversion.';}
 else if(!product){decision='blocked-no-current-product';reason='The documented transformed material number is not an existing current REHAU product. No replacement or new card is inferred.';}
 else if(product.publicationStatus!=='published'){decision='excluded-nonpublic-scope';reason='The current product is not published, including the excluded REHAU tool scope; pricing does not republish it.';}
 else if(row.sourcePrice===null){decision='blocked-missing-source-price';reason='The source cell has no price; zero is not substituted.';}
 else if(physicalPipe(row,p)){decision='hold-pipe-unit-basis';reason='The provided workbook has no price-unit column/row declaration. Metres versus complete roll/cut must be confirmed; amount is not multiplied or divided by length.';}
 else if(prices.size>1){decision='blocked-conflicting-duplicate-source-article';reason='The workbook quotes this article more than once with conflicting prices/variants. A SKU-only alias would also select the inconsistent row.';}
 else if(conflictRows.has(row.source.row)){decision='blocked-explicit-variant-or-role-conflict';reason=conflictRows.get(row.source.row);}
 else if(legacyOuterBendRows.has(row.source.row)){decision='blocked-outer-casing-diameter-conflict';reason='The workbook and current pre-insulated fitting name give different outer-casing diameters. No OD/nominal correspondence or material substitution is assumed.';}
 else if(otherMeasureBasis(row,p)){decision='hold-nonpipe-measure-or-pack-basis';reason=otherMeasureBasis(row,p).reason;}
 else if(!p||p.sourceEvidence?.exactSku!==product.sku){decision='blocked-missing-exact-manufacturer-binding';reason='No preserved exact-SKU manufacturer record is bound to this current catalogue product.';}
 else{
  decision=baselineSkus.has(old)?'eligible-original-discrete':'eligible-additional-discrete';
  reason='Documented old9→new11 conversion resolves exactly one existing published material; preserved exact-SKU manufacturer identity/physical role supports the discrete article. Source descriptive shortening, repeated equal connectors, family headings and added compatible dimensions do not select a different SKU. Price stays exactly as quoted for that article; no stock, length or pack factor is applied.';
 }
 const secondaryBlockers=[];
 if(prices.size>1)secondaryBlockers.push({kind:'conflicting-duplicate-source-article',sourceRows:duplicates.map(x=>x.source.row),prices:[...prices],reason:'A unit answer alone cannot disambiguate conflicting prices/variants sharing the same quoted article.'});
 if(conflictRows.has(row.source.row))secondaryBlockers.push({kind:'explicit-variant-or-role-conflict',reason:conflictRows.get(row.source.row)});
 if(legacyOuterBendRows.has(row.source.row))secondaryBlockers.push({kind:'outer-casing-diameter-conflict',reason:'Different outer-casing dimensions are not automatically nominal/OD aliases.'});
 const record={quoteId:row.quoteId,sourceSku:old,catalogSku:row.catalogSku,sourceRow:row.source.row,sourceName:row.sourceName,sourcePrice:row.sourcePrice,
  catalogue:product?{legacyId:product.legacyId,sku:product.sku,title:product.title,publicationStatus:product.publicationStatus}:null,
  originalBaseline:baselineSkus.has(old),decision,reason,secondaryBlockers,
  ...(decision==='hold-pipe-unit-basis'?{pipeUnitConfirmationAloneSufficient:secondaryBlockers.length===0}:{}),
  manufacturer:p?{exactSku:p.sourceEvidence?.exactSku,sourceId:p.sourceId,sourceUrl:p.sourceUrl,
   originalTitle:p.sourceEvidence?.sourceTitle,etimClass:p.sourceEvidence?.sourceEtim?.class||null,priceUnitEvidence:p.sourceEvidence?.sourcePrices||[],category:p.category}:null,
  source:{...row.source,rawRow:undefined},officialRule:row.officialRule};
 decisions.push(record);
 if(decision.startsWith('eligible-')){
  assert.ok(Number(row.sourcePrice)>0,'An eligible quoted price must be a positive source amount');
  const alias={brand:'rehau',sourceSku:old,catalogSku:row.catalogSku,quoteId:row.quoteId,acceptedQuoteIds:[row.quoteId],sourceUrl:row.officialRule.sourceUrl,
   manufacturerUrl:p.sourceUrl,proof:`${row.officialRule.proof} Exact current published material ${row.catalogSku}: ${p.sourceEvidence.sourceTitle}. Provided row${row.source.row}: ${row.sourceName}. ${reason}`};
  accepted.push(alias);if(decision==='eligible-additional-discrete')additional.push(alias);
 }
}
assert.equal(decisions.length,1408);assert.equal(new Set(decisions.map(x=>x.quoteId)).size,1408);
const consolidate=rows=>{const m=new Map();for(const row of rows){if(m.has(row.sourceSku)){const prior=m.get(row.sourceSku);assert.equal(prior.catalogSku,row.catalogSku);prior.acceptedQuoteIds.push(row.quoteId);}else m.set(row.sourceSku,structuredClone(row));}return[...m.values()];};
const eligible=consolidate(accepted),extra=consolidate(additional),holds=decisions.filter(x=>x.decision==='hold-pipe-unit-basis'),counts={};
assert.equal(eligible.length,new Set(eligible.map(x=>x.catalogSku)).size,'One source alias must map one-to-one to a current material');
for(const row of decisions)counts[row.decision]=(counts[row.decision]||0)+1;
fs.mkdirSync(out,{recursive:true});const write=(file,value)=>fs.writeFileSync(path.join(out,file),JSON.stringify(value,null,2)+'\n');
write('reviewed-additional-discrete-aliases.json',extra);write('reviewed-all-discrete-aliases.json',eligible);
write('reviewed-pipe-unit-holds.json',{status:'HELD-PENDING-USER-PRICE-BASIS',count:holds.length,original569Held:holds.filter(x=>x.originalBaseline).length,rows:holds});
write('reviewed-alias-decisions.json',{status:'FINITE-ALL-1408-QUOTE-DECISIONS-NO-WRITES',counts,rows:decisions});
const summary={status:'FINITE-DISCRETE-SUPPLEMENT-READY-PIPE-BASIS-HELD',totalQuoteRows:1408,counts,
 original569DiscreteQuotes:decisions.filter(x=>x.decision==='eligible-original-discrete').length,additionalEligibleQuotes:additional.length,
 additionalEligibleAliases:extra.length,allEligibleAliases:eligible.length,pipeHoldQuotes:holds.length,original569PipeHoldQuotes:holds.filter(x=>x.originalBaseline).length,
 workbookPriceUnitColumnAbsent:true,quantityOrPackConversionApplied:false,unreviewedQuoteRows:0,originalHashes,
 files:{additional:'reviewed-additional-discrete-aliases.json',allDiscrete:'reviewed-all-discrete-aliases.json',pipeHold:'reviewed-pipe-unit-holds.json',decisions:'reviewed-alias-decisions.json'}};
for(const [key,file]of Object.entries(summary.files))summary.files[key]={file,sha256:sha(path.relative(root,path.join(out,file)))};
write('reviewed-alias-summary.json',summary);assert.equal(sha('imports/overnight-prices/rehau-alias-evidence.json'),originalHashes.evidence);assert.equal(sha('imports/overnight-prices/rehau-name-compatible-aliases.json'),originalHashes.baseline);
console.log(JSON.stringify(summary));
