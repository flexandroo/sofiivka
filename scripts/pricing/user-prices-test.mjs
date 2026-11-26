import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {decimalPrice,sourceSku,sitePrice,parseWorkbooks,reconcile} from './user-prices.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIR=path.join(ROOT,'imports/overnight-prices');
const cached=JSON.parse(await fs.readFile(path.join(DIR,'workbooks-cached.json'),'utf8'));
const reference=JSON.parse(await fs.readFile(path.join(DIR,'catalog-reference.json'),'utf8'));
const policy=JSON.parse(await fs.readFile(path.join(DIR,'price-policy-reference.json'),'utf8'));
const parsed=parseWorkbooks(cached.workbooks),result=reconcile(parsed,reference,policy);
assert.equal(sourceSku({numericText:'1.20000001E8'}),'120000001');
assert.equal(sourceSku({value:'00123'}),'00123','Leading zero identifiers are not normalized away');
assert.equal(sourceSku({numericText:'12.5'}),null,'Fractional SKU is not invented');
assert.deepEqual(decimalPrice({value:'за запитом'}),{amount:null,status:'on_request',raw:'за запитом'});
assert.equal(decimalPrice({numericText:'9.050000000000001'}).amount,'9.05');
assert.equal(decimalPrice({numericText:'1.234'}).status,'too_precise');
assert.equal(sitePrice('100','EUR',null,policy),5085);assert.equal(sitePrice('100','EUR',true,policy),5085);
assert.equal(sitePrice('100','EUR',false,policy),6102);assert.equal(sitePrice('100','UAH',null,policy),100);
assert.throws(()=>sitePrice('100','PLN',true,policy),/Unsupported/);
const tervix=result.matches.filter(row=>row.brand==='tervix');
const override=tervix.find(row=>row.sku==='303012');assert.equal(override.source.priceCell,`E${override.source.row}`);assert.equal(override.sourcePrice,'11.50');
const fallback=tervix.find(row=>row.sku==='351022');assert.equal(fallback.source.priceCell,`D${fallback.source.row}`);assert.equal(fallback.sourcePrice,'56.00');
const madas=result.matches.filter(row=>row.brand==='madas');assert.ok(madas.length>0&&madas.length%2===0);
assert.ok(madas.every(row=>row.blockers.includes('model_code_not_unique_variant_sku')));
for(let i=0;i<madas.length;i+=2){assert.equal(madas[i].source.row,madas[i+1].source.row);assert.equal(madas[i].variant.pressure,'500 мбар');assert.equal(madas[i+1].variant.pressure,'6 бар');}
assert.ok(result.matches.filter(row=>row.brand==='rehau').every(row=>row.blockers.includes('custom_rehau_euro_currency_unverified')));
assert.equal(result.rows.length,19629);assert.equal(new Set(result.rows.map(row=>row.legacyId)).size,19629);
assert.equal(result.summary.readyQuotes,278);assert.equal(result.summary.priorPriceListsRetained,1683);
assert.equal(result.summary.priorFxMismatches,0);assert.equal(result.summary.actions.clear_non_list_price,560);
assert.ok(result.rows.every(row=>row.target.oldAmount===null),'All unsupported crossed-out prices are cleared');
assert.ok(result.rows.filter(row=>row.action==='apply_user_price_list'&&row.brand==='general-fittings').every(row=>row.priceSource.vatIncluded===null&&row.provenance.vat==='unstated'));
assert.ok(result.rows.filter(row=>row.action==='apply_user_price_list'&&row.brand==='tervix').every(row=>row.priceSource.vatIncluded===true));
assert.ok(result.rows.every(row=>Object.keys(row.target).every(key=>['amount','oldAmount','currency','priceStatus'].includes(key))));
// A same-brand source SKU with another name/variant/price cannot silently select one row.
const duplicate=structuredClone(parsed);const sample=duplicate.quotes.find(row=>row.brand==='tervix'&&row.sku==='303012');
duplicate.quotes.push({...sample,quoteId:sample.quoteId+'-conflict',sourcePrice:'99.00'});
const conflict=reconcile(duplicate,reference,policy);
assert.ok(conflict.matches.filter(row=>row.brand==='tervix'&&row.sku==='303012').every(row=>row.readiness==='blocked'&&row.blockers.includes('ambiguous_duplicate_source_sku')));
const report={status:'PASS',suite:'user-price-parser',workbooks:3,sheets:7,quotes:parsed.quotes.length,readyQuotes:278,
  priorSources:1683,unsupportedPrices:560,numericSkuAndLeadingZeros:true,datedColumnOverride:true,madasPressureVariantsSeparated:true,
  duplicateSkuConflictBlocked:true,unknownVatPreserved:true,customFxBlocked:true,sourceStockNotImported:true,
  unprovenOldPricesCleared:true,hostedConnections:0};
await fs.writeFile(path.join(DIR,'parser-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
