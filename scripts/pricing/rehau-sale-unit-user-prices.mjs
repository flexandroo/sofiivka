// Separate stage after the frozen923 release. Explicit per-item sale units; source amounts are never scaled by length/pack.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {priceChunkSql} from './prepare-user-price-release.mjs';
import {approvedCurrency,convertAsQuotedToUah,documentedRehauMaterial,REHAU_WORKBOOK_SHA,CURRENCY_PRICE_POLICY} from './currency-pricing-policy.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIR='imports/rehau-pipe-prices-2026-11-26';
const ACTIVE='ae5db3f38bc5df72c2d0ea11bf95eefaf589867ff011bfa82dd17e1f3805e564';
const sha=value=>createHash('sha256').update(value).digest('hex');
const sqlJson=value=>`convert_from(decode('${Buffer.from(JSON.stringify(value)).toString('base64')}','base64'),'UTF8')::jsonb`;
const comparable=source=>source?Object.fromEntries(Object.entries(source).filter(([key])=>key!=='updatedAt')):null;
export const SALE_UNIT_PRICE_POLICY=Object.freeze({authorizedOn:'2026-11-26',pipePriceQuantity:1,pipePriceUnit:'m',pipeBasis:'User explicitly confirmed the quoted pipe prices are for one metre',lengthOrRollConversionApplied:false,endcaps:'Only independently verified piece articles from the finite new alias list'});

export function saleUnitGuardSql(items,{activeVersion=ACTIVE,afterPrice=false}={}){
 assert.match(activeVersion,/^[a-f\d]{64}$/);const rows=items.map(item=>({id:item.legacyId,uuid:item.internalId,sku:item.sku,unit:item.expectedSaleUnit}));
 assert.ok(rows.length>0&&rows.length<=75&&rows.every(row=>['m','piece'].includes(row.unit)));
 return `do $rehau_sale_unit_guard$
declare expected jsonb:=${sqlJson(rows)};item jsonb;unit_value text;version_value text;snapshot_unit text;card_unit text;
begin
 if current_user not in('postgres','service_role','supabase_admin')then raise exception 'Privileged sale-unit importer required';end if;
 select snapshot_version into version_value from public.catalog_snapshot_pointer where singleton for update;
 if version_value is distinct from '${activeVersion}'then raise exception 'Sale-unit catalogue pointer changed';end if;
 perform 1 from public.catalog_snapshot_releases where snapshot_version=version_value and ready for update;
 if not found then raise exception 'Sale-unit ready release missing';end if;
 perform 1 from public.price_fx_settings where singleton for share;
 for item in select value from jsonb_array_elements(expected)loop
  select p.sale_unit into unit_value from public.products p join public.brands b on b.internal_id=p.brand_id
   where p.internal_id=(item->>'uuid')::uuid and p.legacy_id=item->>'id'and p.sku=item->>'sku'and b.stable_id='rehau'and p.publication_status='published'for update of p;
  if not found or unit_value is distinct from item->>'unit'then raise exception 'Canonical sale-unit guard failed for %',item->>'id';end if;
  select s.payload#>>'{pricing,unit}',c.card#>>'{pricing,unit}'into snapshot_unit,card_unit from public.catalog_product_snapshots s
   join public.catalog_product_cards c using(snapshot_version,legacy_id)where s.snapshot_version=version_value and s.legacy_id=item->>'id';
  if not found or ${afterPrice?"snapshot_unit is distinct from item->>'unit'or card_unit is distinct from item->>'unit'":"coalesce(snapshot_unit,'piece')is distinct from item->>'unit'or coalesce(card_unit,'piece')is distinct from item->>'unit'"}
  then raise exception 'Public pricing sale-unit ${afterPrice?'postcondition':'precondition'} failed for %',item->>'id';end if;
 end loop;
end;
$rehau_sale_unit_guard$;
`;
}

export function saleUnitPriceChunkSql(items,options){
 const original=priceChunkSql(items,options),before='do $user_price_chunk$',after='end $user_price_chunk$;\ncommit;';
 assert.equal(original.split(before).length-1,1);assert.equal(original.split(after).length-1,1);
 const sql=original.replace(before,saleUnitGuardSql(items,{activeVersion:options.activeVersion})+'\n'+before)
  .replace(after,'end $user_price_chunk$;\n'+saleUnitGuardSql(items,{activeVersion:options.activeVersion,afterPrice:true})+'\ncommit;');
 assert.equal(sql.split('perform public._admin_refresh_catalog(').length-1,1,'The price transaction keeps exactly one refresh');return sql;
}

export function makeSaleUnitPricePlan({reference,policy,parsed,aliases}){
 assert.equal(reference.projectRef,'fkjarsouuchjiedrrblc');assert.equal(policy.projectRef,reference.projectRef);assert.ok(reference.columns.includes('saleUnit'),'Fresh canonical saleUnit is required');
 assert.equal(policy.settings.enabled,true);assert.equal(Number(policy.settings.markup_percent),2.5);
 const products=reference.rows.map(row=>Object.fromEntries(reference.columns.map((column,index)=>[column,row[index]])));
 assert.equal(new Set(products.map(p=>p.legacyId)).size,products.length);const bySku=new Map();for(const p of products)if(p.brand==='rehau'){assert.ok(!bySku.has(p.sku));bySku.set(p.sku,p);}
 const quotes=new Map(parsed.quotes.map(q=>[q.quoteId,q])),seen=new Set(),items=[],coverage=[];
 for(const alias of aliases){
  assert.equal(alias.brand,'rehau');assert.equal(alias.catalogSku,documentedRehauMaterial(alias.sourceSku));assert.ok(!seen.has(alias.catalogSku),'A finite sale-unit job cannot choose multiple rows for the same material');seen.add(alias.catalogSku);
  assert.ok(['m','piece'].includes(alias.expectedSaleUnit),'Sale unit must be explicitly proved; never infer it from a title');assert.ok(alias.quoteId&&alias.proof?.length>=30);
  assert.ok(/^https:\/\/(?:(?:www\.)?rehau\.com\/|water\.rehau\.com\/|oxomi\.com\/p\/(?:3001044|3000126)\/)/.test(alias.sourceUrl));
  const quote=quotes.get(alias.quoteId);assert.ok(quote&&quote.brand==='rehau'&&quote.sku===alias.sourceSku);assert.equal(quote.source.fileSha256,REHAU_WORKBOOK_SHA);
  assert.equal(quote.source.file,'16.11.2026_Прайс.xls');assert.equal(quote.source.sheet,'TDSheet');assert.equal(quote.source.priceCell,`C${quote.source.row}`);
  assert.equal(quote.priceStatus,'quoted');assert.ok(quote.sourcePrice);assert.equal(quote.vatIncluded,null);assert.equal(approvedCurrency(quote),'EUR');
  for(const id of alias.acceptedQuoteIds??[alias.quoteId]){const extra=quotes.get(id);assert.ok(extra&&extra.sku===quote.sku);assert.equal(extra.sourcePrice,quote.sourcePrice);}
  const product=bySku.get(alias.catalogSku),blockers=[];if(!product)blockers.push('no_exact_current_product');
  else{if(product.publicationStatus!=='published')blockers.push('outside_published_scope');if(product.amount!==null||product.oldAmount!==null||product.priceStatus!=='unknown'||product.priceSource!==null)blockers.push('existing_price_or_source_preserved');if(product.saleUnit!==alias.expectedSaleUnit)blockers.push('sale_unit_not_prepared');}
  coverage.push({quoteId:quote.quoteId,sourceSku:quote.sku,catalogSku:alias.catalogSku,expectedSaleUnit:alias.expectedSaleUnit,blockers});if(blockers.length)continue;
  const amount=convertAsQuotedToUah(quote.sourcePrice,'EUR',policy);
  const provenance={kind:'user_price_list',source:quote.source,quoteId:quote.quoteId,sourceSku:quote.sku,catalogueSku:product.sku,
   currencyLabel:quote.source.currencyLabel,interpretedCurrency:'EUR',currencyAuthorization:CURRENCY_PRICE_POLICY,vat:'unstated_as_quoted',
   saleUnit:alias.expectedSaleUnit,priceQuantity:1,unitAuthorization:alias.expectedSaleUnit==='m'?SALE_UNIT_PRICE_POLICY.pipeBasis:'Exact discrete endcap article independently verified by manufacturer source',
   quantityOrPackConversionApplied:false,manufacturerAlias:{sourceUrl:alias.sourceUrl,proof:alias.proof,quoteId:alias.quoteId,acceptedQuoteIds:alias.acceptedQuoteIds??[alias.quoteId]}};
  const afterSource={baseAmount:quote.sourcePrice,currency:'EUR',vatIncluded:null,active:true,source:'REHAU рекомендований прайс 16.11.2026',sourceRef:JSON.stringify(provenance)};
  items.push({legacyId:product.legacyId,internalId:product.internalId,sku:product.sku,brand:'rehau',publicationStatus:product.publicationStatus,expectedSaleUnit:alias.expectedSaleUnit,
   before:{amount:product.amount,oldAmount:product.oldAmount,currency:product.currency,priceStatus:product.priceStatus},after:{amount,oldAmount:null,currency:'UAH',priceStatus:'known'},
   beforeSource:comparable(product.priceSource),afterSource,originalSourceUpdatedAt:product.priceSource?.updatedAt??null,sourceChanged:true,provenance});
 }
 items.sort((a,b)=>a.legacyId<b.legacyId?-1:a.legacyId>b.legacyId?1:0);
 const baselinePositive=products.filter(p=>p.priceStatus==='known'&&p.amount>0).length;
 return{items,coverage,summary:{catalogueProducts:products.length,selectedProducts:items.length,perMetre:items.filter(i=>i.expectedSaleUnit==='m').length,pieceEndcaps:items.filter(i=>i.expectedSaleUnit==='piece').length,
  baselinePositive,expectedPositive:baselinePositive+items.length,blockedRows:coverage.filter(r=>r.blockers.length).length,stockImported:false,quantityOrPackConversionApplied:false}};
}

export async function prepareSaleUnitPrices({referenceFile=`${DIR}/catalog-reference.json`,policyFile=`${DIR}/price-policy-reference.json`,
 aliasFiles=[`${DIR}/reviewed-per-metre-pipe-aliases.json`,`${DIR}/reviewed-additional-endcap-aliases.json`],outputDirectory=DIR,chunkSize=50}={}){
 assert.ok(Number.isInteger(chunkSize)&&chunkSize>0&&chunkSize<=50);const bytes=await fs.readFile(path.resolve(ROOT,referenceFile)),policyBytes=await fs.readFile(path.resolve(ROOT,policyFile));
 const parsedFile='imports/overnight-prices/parsed-rows.json',parsedBytes=await fs.readFile(path.resolve(ROOT,parsedFile)),aliases=[],aliasInputs=[];
 for(const file of aliasFiles){const data=await fs.readFile(path.resolve(ROOT,file)),rows=JSON.parse(data);assert.ok(Array.isArray(rows));aliases.push(...rows);aliasInputs.push({file,sha256:sha(data),rows:rows.length});}
 assert.equal(sha(await fs.readFile(path.join(ROOT,'backups/pricing-2026-11-26/source/16.11.2026_Прайс.xls'))),REHAU_WORKBOOK_SHA);
 const reference=JSON.parse(bytes),policy=JSON.parse(policyBytes),result=makeSaleUnitPricePlan({reference,policy,parsed:JSON.parse(parsedBytes),aliases});
 assert.ok(result.items.length);assert.equal(result.summary.blockedRows,0,'Complete canonical/public sale-unit preparation and refresh the reference before freezing prices');
 const plan={format:'rehau-sale-unit-price-plan-v1',status:'STAGED_NOT_APPLIED',projectRef:reference.projectRef,activeVersion:ACTIVE,
  referenceFile,referenceSha256:sha(bytes),policyFile,policySha256:sha(policyBytes),parsedFile,parsedSha256:sha(parsedBytes),aliasInputs,
  currencyPolicy:CURRENCY_PRICE_POLICY,saleUnitPolicy:SALE_UNIT_PRICE_POLICY,...result};
 const text=JSON.stringify(plan,null,2)+'\n',planSha256=sha(text),jobId=`rehau-sale-unit-prices-20261126-${planSha256.slice(0,12)}`,directory=path.resolve(ROOT,outputDirectory,'releases',jobId);await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'plan.json'),text);
 const chunks=[];let offset=0;while(offset<result.items.length){let count=Math.min(chunkSize,result.items.length-offset),selected,sql,rollback;const label=String(chunks.length+1).padStart(3,'0'),sourceRef=`${jobId}/apply/${label}`,recoveryRef=`${jobId}/rollback/${label}`;
  for(;;){selected=result.items.slice(offset,offset+count);const options={sourceRef,jobId,planSha256,policy,productCount:reference.rows.length,activeVersion:ACTIVE};sql=saleUnitPriceChunkSql(selected,options);rollback=saleUnitPriceChunkSql(selected,{...options,sourceRef:recoveryRef,direction:'rollback'});if(Math.max(Buffer.byteLength(sql),Buffer.byteLength(rollback))<650000)break;assert.ok(count>1);count=Math.ceil(count/2);}
  const file=path.join(directory,`${label}-apply.sql`),rollbackFile=path.join(directory,`${label}-rollback.sql`);await fs.writeFile(file,sql);await fs.writeFile(rollbackFile,rollback);
  chunks.push({index:chunks.length+1,rows:selected.length,ids:selected.map(i=>i.legacyId),sourceRef,recoveryRef,file:path.relative(ROOT,file).replaceAll('\\','/'),rollbackFile:path.relative(ROOT,rollbackFile).replaceAll('\\','/'),sha256:sha(sql),rollbackSha256:sha(rollback),bytes:Buffer.byteLength(sql),rollbackBytes:Buffer.byteLength(rollback)});offset+=count;
 }
 const manifest={format:'rehau-sale-unit-price-release-v1',status:'PREPARED_NOT_APPLIED',jobId,projectRef:reference.projectRef,activeVersion:ACTIVE,planFile:path.relative(ROOT,path.join(directory,'plan.json')).replaceAll('\\','/'),planSha256,
  referenceFile,referenceSha256:plan.referenceSha256,policyFile,policySha256:plan.policySha256,canonicalProducts:reference.rows.length,changedProducts:result.items.length,summary:result.summary,
  canonicalAndPublicSaleUnitGuardedInSameTransaction:true,singleRefreshPerChunk:true,quantityOrPackConversionApplied:false,chunks,hostedWrites:0};
 await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(path.resolve(ROOT,outputDirectory,'release-pointer.json'),JSON.stringify({jobId,manifest:path.relative(ROOT,path.join(directory,'manifest.json')).replaceAll('\\','/'),planSha256},null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(const argument of process.argv.slice(2)){const[key,...rest]=argument.replace(/^--/,'').split('='),value=rest.join('=');if(key==='reference')options.referenceFile=value;else if(key==='policy')options.policyFile=value;else if(key==='output')options.outputDirectory=value;else if(key==='aliases'){options.aliasFiles??=[];options.aliasFiles.push(value);}else throw Error(`Unknown argument ${argument}`);}
 const result=await prepareSaleUnitPrices(options);console.log(JSON.stringify({status:result.status,jobId:result.jobId,changedProducts:result.changedProducts,chunks:result.chunks.length,summary:result.summary,hostedWrites:0}));
}
