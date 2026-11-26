// Additive, selected-SKU-only follow-up. Never calls the historical whole-catalogue reconciler or a hosted service.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {priceChunkSql} from './prepare-user-price-release.mjs';
import {sitePrice} from './user-prices.mjs';
import {approvedCurrency,convertAsQuotedToUah,documentedRehauMaterial,CURRENCY_PRICE_POLICY,REHAU_WORKBOOK_SHA} from './currency-pricing-policy.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIRECTORY='imports/rehau-prices-2026-11-26';
const ACTIVE='ae5db3f38bc5df72c2d0ea11bf95eefaf589867ff011bfa82dd17e1f3805e564';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const comparable=source=>source?Object.fromEntries(Object.entries(source).filter(([key])=>key!=='updatedAt')):null;
const PIPE_CLASSES=new Set(['Kunststoffrohr glatt','Mehrschichtrohr glatt','Vorisoliertes Kunststoffrohr','Kunststoffrohr gerippt','Drainage-/Infiltrationsrohr','Schutzrohr für Kunststoff-Rohrsystem']);
const key=quote=>JSON.stringify([quote.name,quote.sourcePrice,quote.currency,quote.variant]);
const read=async file=>JSON.parse(await fs.readFile(path.resolve(ROOT,file),'utf8'));
export function isHeldPipe(product){
 if(!product)return false;const className=product.sourceEvidence?.sourceEtim?.class?.name;
 return product.category.endsWith('-pipes')||product.category==='ventilation-ducts'||PIPE_CLASSES.has(className)
  ||(!className&&[product.sourceEvidence?.sourceTitle,product.title,product.model].some(text=>/(?:^|\s)труба(?=[\s,.;]|$)/iu.test(String(text??''))));
}
export function makeRehauPricePlan({reference,policy,parsed,aliases,manufacturerProducts,review}){
 assert.equal(reference.projectRef,'fkjarsouuchjiedrrblc');assert.equal(policy.projectRef,reference.projectRef);assert.equal(policy.settings.enabled,true);assert.equal(Number(policy.settings.markup_percent),2.5);
 for(const currency of ['EUR','USD'])assert.ok(policy.latestRates.some(rate=>rate.currency===currency&&rate.source==='NBU'));
 const products=reference.rows.map(row=>Object.fromEntries(reference.columns.map((column,index)=>[column,row[index]])));
 assert.equal(new Set(products.map(p=>p.legacyId)).size,products.length);
 const catalogue=new Map();for(const product of products){const index=product.brand+'\0'+product.sku;if(!catalogue.has(index))catalogue.set(index,[]);catalogue.get(index).push(product);}
 const manufacturer=new Map(manufacturerProducts.map(p=>[p.sku,p]));const quotes=parsed.quotes.filter(q=>q.brand==='rehau');
 const decisions=review?new Map(review.rows.map(row=>[row.quoteId,row])):null;if(decisions){assert.equal(decisions.size,quotes.length);for(const quote of quotes)assert.equal(decisions.get(quote.quoteId)?.sourceSku,quote.sku);}
 const groups=new Map();for(const quote of quotes){if(!groups.has(quote.sku))groups.set(quote.sku,[]);groups.get(quote.sku).push(quote);}
 const quoteById=new Map(quotes.map(quote=>[quote.quoteId,quote]));
 const acceptedReferences=new Map(),aliasMap=new Map();for(const alias of aliases){
  assert.equal(alias.brand,'rehau');assert.equal(alias.catalogSku,documentedRehauMaterial(alias.sourceSku));
  assert.ok(/^https:\/\/(?:(?:www\.)?rehau\.com\/|water\.rehau\.com\/|oxomi\.com\/p\/(?:3001044|3000126)\/)/.test(alias.sourceUrl));assert.ok(alias.proof?.length>=30);
  if(alias.acceptedQuoteIds){assert.ok(alias.quoteId&&alias.acceptedQuoteIds.includes(alias.quoteId));const primary=quoteById.get(alias.quoteId);assert.ok(primary);
   for(const id of alias.acceptedQuoteIds){const other=quoteById.get(id);assert.ok(other&&other.sku===alias.sourceSku);assert.equal(other.sourcePrice,primary.sourcePrice,'Grouped reference rows must quote the identical amount');if(id!==alias.quoteId)acceptedReferences.set(id,alias.quoteId);}
  }
  if(!aliasMap.has(alias.sourceSku))aliasMap.set(alias.sourceSku,[]);aliasMap.get(alias.sourceSku).push(alias);
 }
 const selected=new Map(),quarantinedProductIds=new Set(),coverage=[];
 for(const quote of quotes){
  const available=(aliasMap.get(quote.sku)??[]).filter(a=>!a.quoteId||a.quoteId===quote.quoteId);
  const exact=available.filter(a=>a.quoteId===quote.quoteId),alias=exact[0]??available[0],blockers=[];
  const decision=decisions?.get(quote.quoteId);if(decision&&!decision.decision.startsWith('eligible-'))blockers.push('review:'+decision.decision);
  if(!alias)blockers.push('no_verified_exact_alias');
  if(available.some(a=>a.catalogSku!==alias?.catalogSku))blockers.push('conflicting_alias_targets');
  const group=groups.get(quote.sku);if(new Set(group.map(key)).size>1&&!alias?.quoteId)blockers.push('duplicate_source_sku_requires_exact_quote_proof');
  if(!alias&&acceptedReferences.has(quote.quoteId)){coverage.push({quoteId:quote.quoteId,sourceSku:quote.sku,sourceRow:quote.source.row,referenceOnlyFor:acceptedReferences.get(quote.quoteId),blockers:[]});continue;}
  if(quote.source.fileSha256!==REHAU_WORKBOOK_SHA||quote.source.file!=='16.11.2026_Прайс.xls'||quote.source.sheet!=='TDSheet'||quote.source.priceCell!==`C${quote.source.row}`)blockers.push('wrong_source_workbook_or_cell');
  if(quote.priceStatus!=='quoted'||quote.sourcePrice===null)blockers.push('not_a_positive_quoted_price');
  for(const blocker of quote.blockers??[])if(blocker!=='custom_rehau_euro_currency_unverified')blockers.push(blocker);
  const matches=alias?catalogue.get('rehau\0'+alias.catalogSku)??[]:[];if(alias&&matches.length!==1)blockers.push('current_catalogue_identity_not_unique');
  const product=matches[0],official=product?manufacturer.get(product.sku):null;
  if(product&&quarantinedProductIds.has(product.legacyId))blockers.push('multiple_quoted_rows_for_current_variant');
  if(product?.publicationStatus!=='published'&&product)blockers.push('outside_current_published_scope');
  if(product&&(product.amount!==null||product.oldAmount!==null||product.priceStatus!=='unknown'||product.priceSource!==null))blockers.push('existing_price_or_price_source_preserved');
  if(product&&!official)blockers.push('manufacturer_variant_proof_missing');
  if(official&&isHeldPipe(official))blockers.push('pipe_price_unit_pending_user_confirmation');
  const row={quoteId:quote.quoteId,sourceSku:quote.sku,catalogSku:alias?.catalogSku??null,legacyId:product?.legacyId??null,sourceName:quote.name,sourceRow:quote.source.row,sourcePrice:quote.sourcePrice,blockers:[...new Set(blockers)]};
  coverage.push(row);if(row.blockers.length)continue;
  const currency=approvedCurrency(quote);assert.equal(currency,'EUR');assert.equal(quote.vatIncluded,null);assert.equal(quote.priceKind,'recommended_retail');
  const amount=convertAsQuotedToUah(quote.sourcePrice,currency,policy);assert.equal(amount,sitePrice(quote.sourcePrice,'EUR',null,policy),'The shared stored-price engine must apply the markup once');
  const provenance={kind:'user_price_list',source:quote.source,quoteId:quote.quoteId,sourceSku:quote.sku,catalogueSku:product.sku,catalogueTitleAtMatch:product.title,
    currencyLabel:quote.source.currencyLabel,interpretedCurrency:'EUR',currencyAuthorization:CURRENCY_PRICE_POLICY,vat:'unstated_as_quoted',
    manufacturerAlias:{sourceUrl:alias.sourceUrl,proof:alias.proof,quoteId:alias.quoteId??null,acceptedQuoteIds:alias.acceptedQuoteIds??[quote.quoteId]},
    priceBasis:'Quoted amount for this exact discrete article; no bag/stock/roll multiplier',stockImported:false};
  const afterSource={baseAmount:quote.sourcePrice,currency:'EUR',vatIncluded:null,active:true,source:'REHAU рекомендований прайс 16.11.2026',sourceRef:JSON.stringify(provenance)};
  const item={legacyId:product.legacyId,sku:product.sku,brand:'rehau',internalId:product.internalId,publicationStatus:product.publicationStatus,
   before:{amount:product.amount,oldAmount:product.oldAmount,currency:product.currency,priceStatus:product.priceStatus},
   after:{amount,oldAmount:null,currency:'UAH',priceStatus:'known'},beforeSource:comparable(product.priceSource),afterSource,
   originalSourceUpdatedAt:product.priceSource?.updatedAt??null,sourceChanged:true,provenance};
  const prior=selected.get(item.legacyId);if(prior){
   if(prior.provenance.quoteId===quote.quoteId)continue;
   // The same material must never silently select one of two independently quoted rows.
   row.blockers.push('multiple_quoted_rows_for_current_variant');const previous=coverage.find(r=>r.quoteId===prior.provenance.quoteId);previous.blockers.push('multiple_quoted_rows_for_current_variant');quarantinedProductIds.add(item.legacyId);selected.delete(item.legacyId);continue;
  }
  selected.set(item.legacyId,item);
 }
 const items=[...selected.values()].sort((a,b)=>a.legacyId<b.legacyId?-1:a.legacyId>b.legacyId?1:0);
 const baselinePositive=products.filter(p=>p.priceStatus==='known'&&p.amount>0).length;
 return{items,coverage,summary:{catalogueProducts:products.length,sourceRehauQuotes:quotes.length,selectedProducts:items.length,
  heldPipeRows:review?review.rows.filter(row=>row.decision==='hold-pipe-unit-basis').length:coverage.filter(r=>r.blockers.includes('pipe_price_unit_pending_user_confirmation')).length,
  otherMeasureOrPackHolds:review?review.rows.filter(row=>row.decision==='hold-nonpipe-measure-or-pack-basis').length:0,
  blockedRows:coverage.filter(r=>r.blockers.length).length,referenceOnlyRows:coverage.filter(r=>r.referenceOnlyFor).length,baselinePositive,expectedPositive:baselinePositive+items.filter(i=>!(i.before.priceStatus==='known'&&i.before.amount>0)).length,
  otherProductsTouched:0,stockImported:false,pricesFromForeignSourceAsUAH:false,currencyPolicy:CURRENCY_PRICE_POLICY}};
}

export async function prepareRehauPrices({referenceFile=`${DIRECTORY}/catalog-reference.json`,policyFile=`${DIRECTORY}/price-policy-reference.json`,
 parsedFile='imports/overnight-prices/parsed-rows.json',aliasFiles=[`${DIRECTORY}/reviewed-all-discrete-aliases.json`],outputDirectory=DIRECTORY,chunkSize=50}={}){
 assert.ok(Number.isInteger(chunkSize)&&chunkSize>0&&chunkSize<=75);
 const referenceBytes=await fs.readFile(path.resolve(ROOT,referenceFile)),policyBytes=await fs.readFile(path.resolve(ROOT,policyFile)),parsedBytes=await fs.readFile(path.resolve(ROOT,parsedFile));
 const inputs=[];const aliases=[];for(const file of aliasFiles){const bytes=await fs.readFile(path.resolve(ROOT,file)),rows=JSON.parse(bytes);assert.ok(Array.isArray(rows));aliases.push(...rows);inputs.push({file,sha256:sha(bytes),rows:rows.length});}
 const original=await fs.readFile(path.join(ROOT,'backups/pricing-2026-11-26/source/16.11.2026_Прайс.xls'));assert.equal(sha(original),REHAU_WORKBOOK_SHA);
 const manufacturerFile='imports/rehau-no-tools-2026-11-26.json',manufacturerBytes=await fs.readFile(path.resolve(ROOT,manufacturerFile)),manufacturer=JSON.parse(manufacturerBytes);
 const reference=JSON.parse(referenceBytes),policy=JSON.parse(policyBytes),parsed=JSON.parse(parsedBytes);
 const reviewInputs=[];let review;
 if(aliasFiles.some(file=>file.endsWith('/reviewed-all-discrete-aliases.json'))){for(const name of ['reviewed-alias-decisions.json','reviewed-pipe-unit-holds.json','reviewed-alias-summary.json']){const file=`${DIRECTORY}/${name}`,bytes=await fs.readFile(path.resolve(ROOT,file));reviewInputs.push({file,sha256:sha(bytes)});if(name==='reviewed-alias-decisions.json')review=JSON.parse(bytes);}}
 const result=makeRehauPricePlan({reference,policy,parsed,aliases,manufacturerProducts:manufacturer.products,review});assert.ok(result.items.length,'No safe discrete REHAU prices');
 if(review){const held=new Set(review.rows.filter(row=>row.decision.startsWith('hold-')).map(row=>row.quoteId));assert.ok(result.items.every(item=>!held.has(item.provenance.quoteId)));}
 const plan={format:'rehau-eur-user-price-plan-v1',status:'STAGED_NOT_APPLIED',projectRef:reference.projectRef,activeVersion:ACTIVE,
  referenceFile,referenceSha256:sha(referenceBytes),policyFile,policySha256:sha(policyBytes),parsedFile,parsedSha256:sha(parsedBytes),
  originalWorkbookSha256:REHAU_WORKBOOK_SHA,manufacturerFile,manufacturerSha256:sha(manufacturerBytes),aliasInputs:inputs,reviewInputs,...result};
 const planText=JSON.stringify(plan,null,2)+'\n',planSha256=sha(planText),jobId=`rehau-eur-user-prices-20261126-${planSha256.slice(0,12)}`;
 const output=path.resolve(ROOT,outputDirectory,'releases',jobId);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'plan.json'),planText);
 const chunks=[];let offset=0;
 while(offset<result.items.length){let count=Math.min(chunkSize,result.items.length-offset),rows,sql,recovery;const label=String(chunks.length+1).padStart(3,'0'),sourceRef=`${jobId}/apply/${label}`,recoveryRef=`${jobId}/rollback/${label}`;
  for(;;){rows=result.items.slice(offset,offset+count);const options={sourceRef,jobId,planSha256,policy,productCount:reference.rows.length,activeVersion:ACTIVE};sql=priceChunkSql(rows,options);recovery=priceChunkSql(rows,{...options,sourceRef:recoveryRef,direction:'rollback'});
   if(Math.max(Buffer.byteLength(sql),Buffer.byteLength(recovery))<650000)break;assert.ok(count>1);count=Math.ceil(count/2);}
  const file=path.join(output,`${label}-apply.sql`),rollbackFile=path.join(output,`${label}-rollback.sql`);await fs.writeFile(file,sql);await fs.writeFile(rollbackFile,recovery);
  chunks.push({index:chunks.length+1,rows:rows.length,ids:rows.map(r=>r.legacyId),sourceRef,recoveryRef,file:path.relative(ROOT,file).replaceAll('\\','/'),rollbackFile:path.relative(ROOT,rollbackFile).replaceAll('\\','/'),bytes:Buffer.byteLength(sql),rollbackBytes:Buffer.byteLength(recovery),sha256:sha(sql),rollbackSha256:sha(recovery)});offset+=count;
 }
 const manifest={format:'rehau-eur-user-price-release-v1',status:'PREPARED_NOT_APPLIED',jobId,projectRef:reference.projectRef,activeVersion:ACTIVE,planFile:path.relative(ROOT,path.join(output,'plan.json')).replaceAll('\\','/'),planSha256,
  referenceFile,referenceSha256:plan.referenceSha256,policyFile,policySha256:plan.policySha256,canonicalProducts:reference.rows.length,changedProducts:result.items.length,summary:result.summary,
  sourceCurrency:'EUR',vatIncluded:null,markupPercent:2.5,markupApplications:1,selectedOnly:true,singleRefreshPerChunk:true,chunks,hostedWrites:0};
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.resolve(ROOT,outputDirectory,'release-pointer.json'),JSON.stringify({jobId,manifest:path.relative(ROOT,path.join(output,'manifest.json')).replaceAll('\\','/'),planSha256},null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(const argument of process.argv.slice(2)){const[key,...rest]=argument.replace(/^--/,'').split('='),value=rest.join('=');if(key==='aliases'){options.aliasFiles??=[];options.aliasFiles.push(value);}else if(key==='reference')options.referenceFile=value;else if(key==='policy')options.policyFile=value;else if(key==='output')options.outputDirectory=value;else if(key==='chunk-size')options.chunkSize=Number(value);else throw Error(`Unknown argument ${argument}`);}
 const manifest=await prepareRehauPrices(options);console.log(JSON.stringify({status:manifest.status,jobId:manifest.jobId,changedProducts:manifest.changedProducts,chunks:manifest.chunks.length,summary:manifest.summary,hostedWrites:0}));
}
