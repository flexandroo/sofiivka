// Resolve only the finite151 held rows using the user's explicit PER1METRE instruction.
// Existing923 aliases/jobs and all other unverified units remain unchanged.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'imports/rehau-pipe-prices-2026-11-26');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const holdFile='imports/rehau-prices-2026-11-26/reviewed-pipe-unit-holds.json',heldHash=sha(holdFile);
assert.equal(heldHash,'b5b80d7de1c6f27216acb7c7b29ed650c7fa4568f401d37fc6db10605b76a01b');
const rows=read(holdFile).rows;assert.equal(rows.length,151);
const discreteFile='imports/rehau-prices-2026-11-26/reviewed-all-discrete-aliases.json',discreteHash=sha(discreteFile),discrete=new Set(read(discreteFile).map(x=>x.catalogSku));
assert.equal(discreteHash,'e3bf7046d954ffae01c4c3dd44a058fea5522e17fe580efb6ecc4b06cc86451e');
const refFile=fs.existsSync(path.join(out,'catalog-reference.json'))?'imports/rehau-pipe-prices-2026-11-26/catalog-reference.json':'imports/rehau-prices-2026-11-26/catalog-reference.json';
const ref=read(refFile),current=new Map(ref.rows.map(row=>Object.fromEntries(ref.columns.map((k,i)=>[k,row[i]]))).filter(p=>p.brand==='rehau').map(p=>[p.sku,p]));
const sourceProducts=new Map(read('imports/rehau-no-tools-2026-11-26.json').products.map(p=>[p.sku,p]));
const variantConflicts=new Map([
 [825,'Provided row says10.1x1mm; current exact manufacturer material says10.1x1.1mm. A metre-unit answer does not establish that different wall thicknesses are equivalent.'],
 [828,'Provided row says10x1.1; current exact manufacturer material says10.1x1.1. The diameter shorthand has not been authoritatively reconciled.'],
 [829,'Provided row says10x1.1; current exact manufacturer material says10.1x1.1. The diameter shorthand has not been authoritatively reconciled.'],
 [1414,'Provided row says RAUVIPEX UNO110/175; current exact manufacturer material is110/200. Different outer casing dimensions are not interchangeable.']
]);
const userConfirmation={date:'2026-11-26',authority:'Explicit user confirmation relayed by coordinating agent',priceBasis:'PER_1_METRE',currency:'EUR (custom Евро Рехау authorized)',conversionPolicy:'NBU EUR/UAH plus2.5%, applied once by the separate price producer',amountMultiplier:1};
function actualPipe(row){
 const c=row.manufacturer.etimClass;
 if(c?.code==='EC011711'||/^Zubehör\/Ersatzteile|^Fitting mit|Anschlussgarnitur/i.test(c?.name||''))return false;
 if(/^(?:Kunststoffrohr|Mehrschichtrohr|Vorisoliertes Kunststoffrohr|Schutzrohr für Kunststoff-Rohrsystem)/i.test(c?.name||''))return true;
 return !c?.code&&/^(?:Універсальна\s+)?(?:Труба|Гофротруба)(?:\s|$)/iu.test(row.sourceName)
  &&/\b(?:ROHR|RAUTHERM|RAUTITAN|RAUPEX)|ТРУБ/iu.test(row.manufacturer.originalTitle);
}
const decisions=[],aliases=[],endcaps=[];
for(const row of rows){
 const p=current.get(row.catalogSku),source=sourceProducts.get(row.catalogSku);assert.ok(p&&source);assert.equal(p.publicationStatus,'published');
 assert.equal(source.sourceEvidence.exactSku,row.catalogSku);assert.equal(row.catalogSku,`1${row.sourceSku.slice(0,6)}1${row.sourceSku.slice(6)}`);
 assert.ok(!discrete.has(row.catalogSku),'Pipe phase cannot overlap the frozen923 discrete phase');
 let decision,reason;
 if(!actualPipe(row)){decision='excluded-not-an-actual-pipe';reason='Exact manufacturer class describes a pre-insulated-pipe accessory/endcap, not pipe. The user per-metre confirmation is inapplicable; it is not activated as a metre article.';}
 else if(row.secondaryBlockers.length){decision='blocked-existing-secondary-conflict';reason='The existing conflicting duplicate price/variant survives the unit clarification. No quote or replacement variant is chosen.';}
 else if(variantConflicts.has(row.sourceRow)){decision='blocked-unresolved-pipe-variant';reason=variantConflicts.get(row.sourceRow);}
 else{decision='eligible-per-metre-pipe';reason='Exact documented material alias and preserved manufacturer pipe identity match the current published item; the user explicitly confirms the quoted price is for1metre. The source amount is unchanged; roll/cut length is not a factor.';}
 const result={...row,decision,reason,previousDecision:row.decision,userConfirmation,canonicalPriceUnitRequired:'m',
  sourcePriceAmountAsQuoted:row.sourcePrice,sourcePriceCurrency:'EUR',metresPerPriceUnit:1,priceMultiplier:1,
  ...(variantConflicts.has(row.sourceRow)?{additionalVariantBlocker:variantConflicts.get(row.sourceRow)}:{})};
 decisions.push(result);
 if(decision==='eligible-per-metre-pipe')aliases.push({brand:'rehau',sourceSku:row.sourceSku,catalogSku:row.catalogSku,quoteId:row.quoteId,acceptedQuoteIds:[row.quoteId],
  sourceUrl:row.officialRule.sourceUrl,manufacturerUrl:row.manufacturer.sourceUrl,sourceUnit:'m',canonicalSaleUnitRequired:'m',expectedSaleUnit:'m',priceMultiplier:1,
  proof:`${row.officialRule.proof} Exact preserved manufacturer SKU ${row.catalogSku}: ${row.manufacturer.originalTitle}. Source row${row.sourceRow}: ${row.sourceName}. ${reason}`,
  userConfirmation});
 if(decision==='excluded-not-an-actual-pipe'&&!row.secondaryBlockers.length){
  const unitEvidence=source.sourceEvidence.sourcePrices||[];
  assert.ok(unitEvidence.length&&unitEvidence.every(price=>price.unit==='EUR/шт'),'A discrete cap needs exact manufacturer per-piece price-unit evidence');
  assert.equal(row.manufacturer.etimClass?.code,'EC011711');
  endcaps.push({brand:'rehau',sourceSku:row.sourceSku,catalogSku:row.catalogSku,quoteId:row.quoteId,acceptedQuoteIds:[row.quoteId],sourceUrl:row.officialRule.sourceUrl,
   manufacturerUrl:row.manufacturer.sourceUrl,sourceUnit:'piece',canonicalSaleUnitRequired:'piece',expectedSaleUnit:'piece',priceMultiplier:1,
   proof:`${row.officialRule.proof} Exact current manufacturer endcap ${row.catalogSku}: ${row.manufacturer.originalTitle}. Source row${row.sourceRow}: ${row.sourceName}. Manufacturer classEC011711 is a discrete accessory, and its preserved exact-item official price-unit evidence is EUR/шт. The described carrier/casing configuration lies within the named compatible range. Quote amount is retained per piece, with no metre/pack multiplication.`,
   officialManufacturerUnitEvidence:unitEvidence});
 }
}
assert.equal(aliases.length,129);assert.equal(new Set(aliases.map(x=>x.catalogSku)).size,129);assert.equal(new Set(decisions.map(x=>x.quoteId)).size,151);
assert.equal(endcaps.length,11,'The contradictory UNO/DUO source row remains excluded');
const counts={};for(const row of decisions)counts[row.decision]=(counts[row.decision]||0)+1;
assert.deepEqual(counts,{'blocked-existing-secondary-conflict':6,'eligible-per-metre-pipe':129,'blocked-unresolved-pipe-variant':4,'excluded-not-an-actual-pipe':12});
fs.mkdirSync(out,{recursive:true});const write=(f,v)=>fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n');
write('reviewed-per-metre-pipe-aliases.json',aliases);
write('reviewed-additional-endcap-aliases.json',endcaps);
write('reviewed-per-metre-pipe-decisions.json',{status:'FINITE151-REVIEW-UNIT-RESOLVED-OTHER-CONFLICTS-RETAINED',userConfirmation,counts,rows:decisions});
const summary={status:'READY129-ACTUAL-PIPE-ALIASES-REQUIRE-CANONICAL-m-UNIT',reviewedRows:151,eligibleAliases:129,counts,
 additionalConfirmedPieceEndcaps:11,stillBlockedEndcaps:1,mixedSecondPhaseEligible:140,
 original569EligiblePipeAliases:decisions.filter(x=>x.originalBaseline&&x.decision==='eligible-per-metre-pipe').length,
 additionalEligiblePipeAliases:decisions.filter(x=>!x.originalBaseline&&x.decision==='eligible-per-metre-pipe').length,
 parentHoldFile:holdFile,parentHoldSha256:heldHash,frozen923Sha256:discreteHash,reference:refFile,referenceSha256:sha(refFile),
 noRollOrPackArithmetic:true,unrelated26MeasureHoldsUnchanged:true,existing923Unchanged:true,hostedWrites:0,
 aliases:{file:'reviewed-per-metre-pipe-aliases.json',sha256:sha(path.relative(root,path.join(out,'reviewed-per-metre-pipe-aliases.json')))},
 endcaps:{file:'reviewed-additional-endcap-aliases.json',sha256:sha(path.relative(root,path.join(out,'reviewed-additional-endcap-aliases.json')))},
 decisions:{file:'reviewed-per-metre-pipe-decisions.json',sha256:sha(path.relative(root,path.join(out,'reviewed-per-metre-pipe-decisions.json')))}};
write('reviewed-per-metre-pipe-summary.json',summary);
assert.equal(sha(holdFile),heldHash);assert.equal(sha(discreteFile),discreteHash);
console.log(JSON.stringify(summary));
