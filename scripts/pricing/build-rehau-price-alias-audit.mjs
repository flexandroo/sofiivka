// Supplemental evidence only: this does not modify the frozen price plan or authorize a custom exchange rate.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIR=path.join(ROOT,'imports/overnight-prices');
const official='https://www.rehau.com/downloads/385692/technische-information-systemgrundlagen.pdf';
const proof='REHAU documents the SAP 2012 conversion on page 2: old six-digit article plus three-digit suffix becomes an eleven-digit material number by inserting a leading 1 and another 1 before the unchanged suffix. The transformed material number must exist exactly in the REHAU catalogue; name compatibility is checked separately.';
export function documentedMaterialNumber(sku){return /^\d{9}$/.test(sku)?`1${sku.slice(0,6)}1${sku.slice(6)}`:null;}
const text=value=>String(value??'').normalize('NFKC').toUpperCase().replaceAll('⁄','/').replace(/(\d),(\d)/g,'$1.$2');
const numbers=value=>(text(value).match(/\d+(?:\.\d+)?/g)??[]).map(n=>String(Number(n))).sort().join('|');
const families=value=>[...new Set(text(value).match(/FASTLOC|RAUTITAN|RAUPIANO\s*PLUS|RAUTHERMEX|RAUVITHERM|RAUTHERM\s*S|RAUBASIC|RAUPEX|RE\.?GUARD|SMART\s*LX|TITAN\s*LX/g)??[])].map(s=>s.replace(/\s|\./g,''));
const types=[['cap',/ЗАГЛУШ/],['elbow',/КУТНИК|ВІДВІД|КОЛІНО/],['tee',/ТРІЙНИК/],['sleeve',/ГІЛЬЗ/],['coupler',/МУФТ/],
 ['adapter',/ПЕРЕХІДНИК|РЕДУКЦ/],['nipple',/НІПЕЛ/],['pipe',/ТРУБ/],['clamp',/ХОМУТ/],['manifold',/КОЛЕКТОР|РОЗПОДІЛЬНИК/],
 ['cabinet',/ШАФ/],['thermostat',/ТЕРМОСТАТ/],['connector',/З['’ʼ]?ЄДНУВАЧ/],['valve',/КЛАПАН|ВЕНТИЛЬ|КРАН/]];
export function nameCompatibility(sourceName,catalogueName){
  const a=text(sourceName),b=text(catalogueName),typeMatches=types.filter(([,r])=>r.test(a)).map(([type])=>type);
  const targetTypes=types.filter(([,r])=>r.test(b)).map(([type])=>type);
  const sourceFamilies=families(a),targetFamilies=families(b);
  const qualifiers=['RX+','RX','PX'].filter(q=>new RegExp(`(?:^|[^A-Z])${q.replace('+','\\+')}([^A-Z+]|$)`).test(a));
  const checks={sameNumericVariant:numbers(a)===numbers(b),numbersPresent:numbers(a).length>0,
    sameProductType:typeMatches.some(type=>targetTypes.includes(type)),
    familyPresent:sourceFamilies.length>0&&sourceFamilies.every(f=>targetFamilies.includes(f)),
    variantQualifierPresent:qualifiers.every(q=>b.includes(q))};
  return{compatible:Object.values(checks).every(Boolean),checks,sourceNumbers:numbers(a),catalogueNumbers:numbers(b),sourceFamilies,targetFamilies};
}
assert.equal(documentedMaterialNumber('123456789'),'11234561789');
assert.equal(documentedMaterialNumber('001234001'),'10012341001');
assert.equal(documentedMaterialNumber('12345678'),null);
assert.equal(nameCompatibility('Заглушка FASTLOC 16','Заглушка REHAU FASTLOC LX 16').compatible,true);
assert.equal(nameCompatibility('Труба RAUTITAN 16 x 2,2, 50 м','Труба REHAU RAUTITAN 20 x 2,8, 50 м').compatible,false);
assert.equal(nameCompatibility('Муфта RAUTITAN 16','Муфта REHAU FASTLOC 16').compatible,false);
assert.equal(nameCompatibility('Заглушка FASTLOC 16','Кутник REHAU FASTLOC 16').compatible,false);
const parsed=JSON.parse(await fs.readFile(path.join(DIR,'parsed-rows.json'),'utf8'));
const reference=JSON.parse(await fs.readFile(path.join(DIR,'catalog-reference.json'),'utf8'));
const products=reference.rows.map(row=>Object.fromEntries(reference.columns.map((key,index)=>[key,row[index]])));
const bySku=new Map(products.filter(p=>p.brand==='rehau').map(p=>[p.sku,p]));
const source=parsed.quotes.filter(q=>q.brand==='rehau');
const grouped=new Map();for(const row of source){const group=grouped.get(row.sku)??[];group.push(row);grouped.set(row.sku,group);}
const rows=source.map(q=>{
  const catalogSku=documentedMaterialNumber(q.sku??''),product=bySku.get(catalogSku);
  const aliases=grouped.get(q.sku),uniqueSource=new Set(aliases.map(row=>JSON.stringify([row.name,row.sourcePrice,row.currency,row.variant]))).size===1;
  const compatibility=product?nameCompatibility(q.name,product.title):null;
  const blockers=['custom_rehau_euro_currency_unverified'];
  if(!catalogSku)blockers.push('not_a_documented_nine_digit_article');
  else if(!product)blockers.push('no_exact_current_rehau_material');
  if(product&&product.publicationStatus!=='published')blockers.push('not_in_current_public_scope');
  if(product&&!compatibility.compatible)blockers.push('variant_name_needs_manual_review');
  if(!uniqueSource)blockers.push('conflicting_duplicate_price_list_article');
  return{quoteId:q.quoteId,sourceSku:q.sku,catalogSku,sourceName:q.name,section:q.section,source:q.source,
    sourcePrice:q.sourcePrice,currency:q.currency,vatIncluded:q.vatIncluded,
    catalogue:product?{legacyId:product.legacyId,sku:product.sku,title:product.title,model:product.model,publicationStatus:product.publicationStatus}:null,
    aliasStatus:product&&product.publicationStatus==='published'&&uniqueSource&&compatibility.compatible?'name-compatible':'needs-review',
    compatibility,priceReadiness:'blocked',blockers,officialRule:{sourceUrl:official,page:2,proof}};
});
const aliases=[...new Map(rows.filter(row=>row.aliasStatus==='name-compatible').map(row=>[row.sourceSku,{
  brand:'rehau',sourceSku:row.sourceSku,catalogSku:row.catalogSku,sourceUrl:official,
  proof:`${proof} Exact catalogue name: ${row.catalogue.title}; price-list name: ${row.sourceName}.`,
}])).values()];
const counts={rehauPriceRows:rows.length,exactCurrentMaterialRows:rows.filter(r=>r.catalogue).length,
  nameCompatibleAliasRows:rows.filter(r=>r.aliasStatus==='name-compatible').length,uniqueNameCompatibleAliases:aliases.length,
  nonPublicMaterialRows:rows.filter(r=>r.catalogue&&r.catalogue.publicationStatus!=='published').length,
  stillBlockedByCustomCurrency:rows.length,hostedWrites:0,frozenMainPlanModified:false};
await fs.writeFile(path.join(DIR,'rehau-alias-evidence.json'),JSON.stringify({format:'rehau-price-alias-evidence-v1',asOf:'2026-11-26',
  officialEvidence:{sourceUrl:official,page:2,access:'Official PDF indexed text verified via web search; binary direct download denied by manufacturer.',
    example:{oldArticle:'123456-789',newMaterial:'11234561789'},proof},counts,rows},null,2)+'\n');
await fs.writeFile(path.join(DIR,'rehau-name-compatible-aliases.json'),JSON.stringify(aliases,null,2)+'\n');
const hash=createHash('sha256').update(await fs.readFile(path.join(DIR,'rehau-alias-evidence.json'))).digest('hex');
console.log(JSON.stringify({status:'SUPPLEMENTAL_BLOCKED',...counts,evidenceSha256:hash}));
