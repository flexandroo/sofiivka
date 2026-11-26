// Stage the three authorized user price lists; this module has no hosted client or SQL writer.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OUTPUT=path.join(ROOT,'imports/overnight-prices');
const SOURCE=path.join(ROOT,'backups/pricing-2026-11-26/source');
const RUNTIME=process.env.PRICE_BUNDLED_RUNTIME||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies';
const AS_OF='2026-11-26';
const HASHES={
  '1.10.2026_ПРАЙС GF.xls':'0806480b2554eca0c032bf3957f13f6de7cdeca5220edca3cf1dea8df912da49',
  '16.11.2026_Прайс.xls':'d0a968b79bd68a9fcf6ccee72db5e82ee6ece13686b1728fec2456494885fce4',
  'Price 2026.xlsx':'87b54accc2a982504496ca90c065c3937cf55cf4ae925b3ae73290b9dde377c1'
};
const PRIOR_LISTS=new Map([
  ['wilo',['Wilo Domestic 22.06.2026']],['ecosoft',['Ecosoft POU/POE 09.2026 РРЦ']],
  ['altep',['Прайс Альтеп 27.08.2026']],['buderus',['Buderus 01.09.2026']],
  ['feniks',['Feniks прайс 04.12.2025']],['grundfos',['Grundfos E-price list 2026-06-01']],
  ['tech',['TECH Price 01.10.2024']],['termojet',['Прайс-лист TERMOJET 08.09.2026']]
]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=async(file,data)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');};
const clean=value=>String(value??'').trim();
const columnName=number=>{let result='';for(;number;number=Math.floor((number-1)/26))result=String.fromCharCode(65+(number-1)%26)+result;return result;};
const normalizeSku=value=>clean(value).normalize('NFKC').toUpperCase();
const cellAt=(row,column)=>row.cells.find(cell=>cell.column===column);
const cellText=(row,column)=>clean(cellAt(row,column)?.value);

export function rational(value){
  const text=String(value).trim();
  const match=/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if(!match)throw new Error(`Not a plain decimal: ${text.slice(0,60)}`);
  const exponent=Number(match[4]||0)-(match[3]?.length||0);
  assert.ok(Math.abs(exponent)<=30,'Decimal exponent is outside the supported price/SKU range');
  let numerator=BigInt(match[2]+(match[3]||''));if(match[1]==='-')numerator=-numerator;
  return exponent>=0?{n:numerator*10n**BigInt(exponent),d:1n}:{n:numerator,d:10n**BigInt(-exponent)};
}
const times=(left,right)=>({n:left.n*right.n,d:left.d*right.d});
const onePlusPercent=value=>{const r=rational(value);return{n:100n*r.d+r.n,d:100n*r.d};};

export function sourceSku(cell){
  if(!cell)return null;
  if(cell.numericText!==undefined){const r=rational(cell.numericText);if(r.n<0||r.n%r.d!==0n)return null;return(r.n/r.d).toString();}
  return clean(cell.value)||null;
}

export function decimalPrice(cell){
  const raw=clean(cell?.numericText??cell?.value);
  if(!raw)return{amount:null,status:'missing',raw};
  if(/за\s*запитом|договір|уточн|по\s*запросу/i.test(raw))return{amount:null,status:'on_request',raw};
  let r;try{r=rational(raw.replace(',','.'));}catch{return{amount:null,status:'invalid',raw};}
  if(r.n<=0)return{amount:null,status:r.n===0n?'on_request':'invalid',raw};
  const centsNumerator=r.n*100n;
  const cents=(2n*centsNumerator+r.d)/(2n*r.d);
  const exact=centsNumerator%r.d===0n;
  // Excel's binary doubles sometimes serialize 9.05 as 9.050000000000001. Record that harmless tail.
  const difference=centsNumerator>=cents*r.d?centsNumerator-cents*r.d:cents*r.d-centsNumerator;
  if(!exact&&difference*1000000000n>r.d)return{amount:null,status:'too_precise',raw};
  const whole=cents/100n,rest=cents%100n;
  const amount=`${whole}.${String(rest).padStart(2,'0')}`;
  return{amount,status:'quoted',raw,binaryFloatTailNormalized:!exact};
}

export function sitePrice(baseAmount,currency,vatIncluded,policy){
  assert.ok(['UAH','EUR','USD'].includes(currency),'Unsupported/custom source currency');
  assert.ok(vatIncluded===true||vatIncluded===false||vatIncluded===null,'Invalid VAT state');
  let amount=rational(baseAmount);assert.ok(amount.n>0,'A positive source price is required');
  if(vatIncluded===false)amount=times(amount,onePlusPercent(policy.settings.vat_percent));
  if(currency!=='UAH'){
    const rate=policy.latestRates.find(row=>row.currency===currency);assert.ok(rate,'Missing NBU rate');
    amount=times(times(amount,rational(rate.rate)),onePlusPercent(policy.settings.markup_percent));
  }
  const rounded=(2n*amount.n+amount.d)/(2n*amount.d);
  assert.ok(rounded>0&&rounded<=BigInt(Number.MAX_SAFE_INTEGER),'Site price outside the safe whole-UAH range');
  return Number(rounded);
}

export function parseWorkbooks(workbooks){
  const quotes=[],nonProducts=[],summaries=[];
  for(const workbook of workbooks){
    assert.equal(workbook.sha256,HASHES[workbook.file],'Unapproved or changed source workbook');
    assert.equal(workbook.safety.macrosExecuted,false);assert.equal(workbook.safety.recalculated,false);
    for(const sheet of workbook.sheets){
      const isLegacy=workbook.file.endsWith('.xls');
      let brand=workbook.file.includes('GF')?'general-fittings':isLegacy?'rehau':sheet.name.toLowerCase();
      if(sheet.name==='ODEMADAS')brand='ode';
      let section='',count=0;
      for(const row of sheet.rows){
        const sku=sourceSku(cellAt(row,1));const name=cellText(row,2);
        if(!name||/^(артикул|номенклатура|товар)$/i.test(name)||/^(артикул)$/i.test(sku||'')){
          const heading=cellText(row,1)||name;
          if(heading&&row.row>(isLegacy?5:1)){section=heading.trim();if(sheet.name==='ODEMADAS'&&/^MADAS$/i.test(section))brand='madas';}
          nonProducts.push({file:workbook.file,sheet:sheet.name,row:row.row,reason:'header_or_section',text:heading});continue;
        }
        if(isLegacy&&row.row<=5){nonProducts.push({file:workbook.file,sheet:sheet.name,row:row.row,reason:'workbook_header',text:name});continue;}
        // In the XLSX a section can occupy column B without a SKU, discount group or price.
        const priceColumns=brand==='madas'?[4,5]:[isLegacy?3:4];
        if(!sku&&!cellText(row,isLegacy?3:4)&&!cellText(row,3)){
          section=name;nonProducts.push({file:workbook.file,sheet:sheet.name,row:row.row,reason:'section',text:name});continue;
        }
        let selectedColumn=priceColumns[0];
        let override=null;
        if(sheet.name==='Tervix'&&AS_OF>='2026-11-01'&&cellText(row,5)){
          selectedColumn=5;override={effectiveDate:'2026-11-01',supersededPrice:cellText(row,4),reason:'Explicit newer price column, not a discount'};
        }
        for(const priceColumn of brand==='madas'?priceColumns:[selectedColumn]){
          const priceCell=cellAt(row,priceColumn);const price=decimalPrice(priceCell);
          const sourceDate=workbook.file.includes('GF')?'2026-10-01':isLegacy?'2026-11-16':null;
          const customRehau=isLegacy&&!workbook.file.includes('GF');
          const currency=customRehau?'UNRESOLVED_REHAU_EURO':'EUR';
          const vatIncluded=isLegacy?null:true;
          const pressure=brand==='madas'?(priceColumn===4?'500 мбар':'6 бар'):null;
          const source={file:workbook.file,fileSha256:workbook.sha256,sheet:sheet.name,row:row.row,
            skuCell:`A${row.row}`,nameCell:`B${row.row}`,priceCell:`${columnName(priceColumn)}${row.row}`,
            sourceDate,currencyLabel:customRehau?'Евро Рехау':'EUR',
            priceHeader:isLegacy?(customRehau?'Рекомендована (Евро Рехау)':'Рекомендована (EUR)')
              :selectedColumn===5&&sheet.name==='Tervix'?'Ціна з ПДВ, Євро з 01.11.2026':'Ціна з ПДВ, Євро',
            vatStatement:isLegacy?'not stated':'Ціна з ПДВ',rawPrice:price.raw,
            ...(override?{override}:{}),...(pressure?{variantHeader:pressure}:{}),
            ...(priceCell?.formula?{formula:priceCell.formula,cachedValueUsed:true}:{}),
            rawRow:row.cells.map(cell=>({column:columnName(cell.column),value:cell.value,numericText:cell.numericText}))};
          const blockers=[];if(!sku)blockers.push('missing_source_sku');
          if(customRehau)blockers.push('custom_rehau_euro_currency_unverified');
          if(price.status==='invalid'||price.status==='too_precise')blockers.push(`source_price_${price.status}`);
          if(row.hidden||sheet.state!=='visible')blockers.push('hidden_source_row_or_sheet');
          if(pressure)blockers.push('model_code_not_unique_variant_sku');
          quotes.push({quoteId:`${workbook.sha256.slice(0,12)}:${sheet.name}:${row.row}:${columnName(priceColumn)}`,
            brand:customRehau&&section==='MEPA'?'mepa':brand,sku,name,section,sourcePrice:price.amount,
            priceStatus:price.status,currency,vatIncluded,
            vatTreatment:vatIncluded===null?'unstated_as_quoted':'explicitly_included',
            priceKind:isLegacy?'recommended_retail':'user_supplied_list',
            discountGroup:isLegacy?null:cellText(row,3)||null,
            sourceStockQuantity:isLegacy?cellText(row,4)||null:null,
            discountApplied:false,variant:pressure?{pressure}:null,blockers,source});
          count++;
        }
      }
      summaries.push({file:workbook.file,sheet:sheet.name,sourceRows:sheet.rowCount,quoteRows:count});
    }
  }
  return{quotes,nonProducts,summaries};
}

export function reconcile(parsed,reference,policy,aliases=[]){
  const products=reference.rows.map(row=>Object.fromEntries(reference.columns.map((column,index)=>[column,row[index]])));
  assert.equal(new Set(products.map(p=>p.legacyId)).size,products.length,'Duplicate catalogue IDs');
  const catalogue=new Map(),sourceGroups=new Map(),aliasMap=new Map();
  for(const product of products){const key=product.brand+'\0'+normalizeSku(product.sku);if(!catalogue.has(key))catalogue.set(key,[]);catalogue.get(key).push(product);}
  for(const alias of aliases){
    assert.ok(alias.brand&&alias.sourceSku&&alias.catalogSku&&/^https:\/\//.test(alias.sourceUrl)&&clean(alias.proof).length>=30,'An alias needs exact manufacturer evidence');
    const key=alias.brand+'\0'+normalizeSku(alias.sourceSku);assert.ok(!aliasMap.has(key),'Duplicate alias');aliasMap.set(key,alias);
  }
  for(const quote of parsed.quotes){if(!quote.sku)continue;const key=quote.brand+'\0'+normalizeSku(quote.sku);if(!sourceGroups.has(key))sourceGroups.set(key,[]);sourceGroups.get(key).push(quote);}
  const matches=parsed.quotes.map(quote=>{
    const blockers=[...quote.blockers];let candidates=[];let method='exact_brand_sku',alias=null;
    if(quote.sku){const key=quote.brand+'\0'+normalizeSku(quote.sku);candidates=catalogue.get(key)||[];
      if(!candidates.length&&aliasMap.has(key)){alias=aliasMap.get(key);candidates=catalogue.get(quote.brand+'\0'+normalizeSku(alias.catalogSku))||[];method='manufacturer_proven_exact_alias';}
      const duplicates=sourceGroups.get(key)||[];
      if(duplicates.length>1){const facts=new Set(duplicates.map(row=>JSON.stringify([row.name,row.sourcePrice,row.priceStatus,row.currency,row.vatIncluded,row.variant])));if(facts.size>1)blockers.push('ambiguous_duplicate_source_sku');}
    }
    if(candidates.length===0)blockers.push('no_exact_catalogue_counterpart');
    if(candidates.length>1)blockers.push('ambiguous_catalogue_brand_sku');
    const product=candidates.length===1?candidates[0]:null;
    if(quote.priceStatus==='missing')blockers.push('missing_list_price');
    let targetAmount=null;
    if(product&&!blockers.length&&quote.priceStatus==='quoted')targetAmount=sitePrice(quote.sourcePrice,quote.currency,quote.vatIncluded,policy);
    const ready=Boolean(product&&!blockers.length&&['quoted','on_request'].includes(quote.priceStatus));
    return{...quote,blockers:[...new Set(blockers)],match:product?{legacyId:product.legacyId,sku:product.sku,brand:product.brand,title:product.title,method,...(alias?{aliasEvidence:alias}:{} )}:null,
      readiness:ready?'ready':'blocked',targetAmount,requiresNullableVatMigration:ready&&quote.vatIncluded===null};
  });
  const readyByProduct=new Map();
  for(const match of matches.filter(m=>m.readiness==='ready')){
    const id=match.match.legacyId;
    if(!readyByProduct.has(id))readyByProduct.set(id,[]);readyByProduct.get(id).push(match);
  }
  const rows=products.map(product=>{
    const source=product.priceSource;
    const priorApproved=Boolean(source?.active&&PRIOR_LISTS.get(product.brand)?.includes(source.source));
    const ready=readyByProduct.get(product.legacyId)||[];
    const unique=new Set(ready.map(q=>JSON.stringify([q.sourcePrice,q.currency,q.vatIncluded,q.priceStatus])));
    const base={legacyId:product.legacyId,sku:product.sku,brand:product.brand,title:product.title,internalId:product.internalId,
      expected:{amount:product.amount,oldAmount:product.oldAmount,currency:product.currency,priceStatus:product.priceStatus,
        publicationStatus:product.publicationStatus,updatedAt:product.updatedAt,priceSource:source}};
    if(ready.length&&unique.size===1){
      const quote=ready[0];const amount=quote.targetAmount;
      const provenance={kind:'user_price_list',file:quote.source.file,fileSha256:quote.source.fileSha256,
        sheet:quote.source.sheet,row:quote.source.row,priceCell:quote.source.priceCell,sourceSku:quote.sku,
        currency:quote.currency,vat:quote.vatIncluded===null?'unstated':quote.vatIncluded?'included':'excluded',
        vatTreatment:quote.vatTreatment,effectiveDate:quote.source.override?.effectiveDate||quote.source.sourceDate,
        quoteIds:ready.map(q=>q.quoteId),...(quote.match.aliasEvidence?{aliasEvidence:quote.match.aliasEvidence}:{})};
      return{...base,action:amount===null?'list_on_request':'apply_user_price_list',
        target:{amount,oldAmount:null,currency:'UAH',priceStatus:amount===null?'on_request':'known'},
        priceSource:amount===null?null:{baseAmount:quote.sourcePrice,currency:quote.currency,vatIncluded:quote.vatIncluded,
          active:true,source:`User list: ${quote.source.file}`,sourceRef:JSON.stringify(provenance)},
        provenance,requiresNullableVatMigration:quote.vatIncluded===null};
    }
    if(priorApproved){
      const amount=sitePrice(source.baseAmount,source.currency,source.vatIncluded,policy);
      // None of the approved sources records an authoritative crossed-out price.
      const oldAmount=null;
      return{...base,action:'retain_prior_price_list',target:{amount,oldAmount,currency:'UAH',priceStatus:'known'},
        priceSource:source,provenance:{kind:'previously_approved_stored_price_list',source:source.source,sourceRef:source.sourceRef,
          originalWorkbookAvailable:false},fxResultAlreadyCurrent:Number(product.amount)===amount,
        unsupportedOldPriceCleared:product.oldAmount!==null};
    }
    const hasPrice=product.amount!==null||product.oldAmount!==null||product.priceStatus==='known';
    return{...base,action:hasPrice?'clear_non_list_price':'already_unpriced',
      target:{amount:null,oldAmount:null,currency:'UAH',priceStatus:hasPrice?'on_request':product.priceStatus},
      deactivateUnapprovedPriceSource:Boolean(source?.active),
      ...(ready.length&&unique.size!==1?{blockedReason:'conflicting_ready_quotes_for_product'}:{})};
  });
  const actions={},blocked={},byBrand={};
  for(const row of rows){actions[row.action]=(actions[row.action]||0)+1;if(!byBrand[row.brand])byBrand[row.brand]={};byBrand[row.brand][row.action]=(byBrand[row.brand][row.action]||0)+1;}
  for(const match of matches)for(const reason of match.blockers)blocked[reason]=(blocked[reason]||0)+1;
  return{rows,matches,summary:{catalogueProducts:products.length,parsedQuotes:parsed.quotes.length,
    readyQuotes:matches.filter(m=>m.readiness==='ready').length,blockedQuotes:matches.filter(m=>m.readiness==='blocked').length,
    actions,blockedReasons:blocked,byBrand,
    priorPriceListsRetained:rows.filter(r=>r.action==='retain_prior_price_list').length,
    priorFxMismatches:rows.filter(r=>r.action==='retain_prior_price_list'&&!r.fxResultAlreadyCurrent).length,
    sourceInventoryImported:false,productContentModified:false,hostedWrites:0}};
}

async function artifactAudit(cached){
  // A junction to the bundled dependencies was denied by Windows ACLs. Resolve the public package export
  // directly from that same read-only bundle instead; never install/modify repository spreadsheet dependencies.
  const require=createRequire(pathToFileURL(path.join(RUNTIME,'node/node_modules/_price_loader.cjs')));
  const{FileBlob,SpreadsheetFile}=await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
  const workbook=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(SOURCE,'Price 2026.xlsx')));
  const source=cached.workbooks.find(w=>w.file==='Price 2026.xlsx');const sheets=[];
  for(const sheet of source.sheets){
    const worksheet=workbook.worksheets.getItem(sheet.name);
    const range=worksheet.getRange(`A1:${columnName(sheet.columnCount)}${sheet.rowCount}`);
    const values=range.values,formulas=range.formulas;let checked=0,formulaCount=0;
    for(const row of sheet.rows)for(const cell of row.cells){
      const actual=values[row.row-1]?.[cell.column-1];
      const expected=cell.numericText!==undefined?Number(cell.numericText):cell.value;
      assert.equal(actual,expected,`Artifact/OOXML cached-cell mismatch ${sheet.name}!${cell.address}`);checked++;
    }
    for(const row of formulas)for(const formula of row)if(formula)formulaCount++;
    assert.equal(formulaCount,0,'Formula cache requires an explicit additional audit');
    sheets.push({sheet:sheet.name,checkedNonemptyCells:checked,formulas:formulaCount});
  }
  return{reader:'Bundled @oai/artifact-tool public import/read API',sourceSha256:source.sha256,sheets,
    cachedCellsAgree:true,recalculated:false,exported:false,macrosExecuted:false};
}

export async function stage({extract=false,referenceFile=path.join(OUTPUT,'catalog-reference.json'),aliasesFile=null}={}){
  await fs.mkdir(OUTPUT,{recursive:true});
  const originalProof=[];
  for(const[file,expected]of Object.entries(HASHES)){const bytes=await fs.readFile(path.join(SOURCE,file));assert.equal(sha(bytes),expected,'Original source copy changed');originalProof.push({file,sha256:expected,bytes:bytes.length});}
  if(extract){const python=path.join(RUNTIME,'python/python.exe');
    execFileSync(python,['-X','utf8',path.join(ROOT,'scripts/pricing/read-user-prices.py'),'--source',SOURCE,
      '--output',path.join(OUTPUT,'workbooks-cached.json'),'--xls-lib',path.join(ROOT,'tmp/valrom-python')],{cwd:ROOT,encoding:'utf8'});
  }
  const cachedBytes=await fs.readFile(path.join(OUTPUT,'workbooks-cached.json'));const cached=JSON.parse(cachedBytes.toString('utf8'));
  const artifact=await artifactAudit(cached);await save(path.join(OUTPUT,'artifact-reader-audit.json'),artifact);
  const parsed=parseWorkbooks(cached.workbooks);const referenceBytes=await fs.readFile(referenceFile);
  const reference=JSON.parse(referenceBytes.toString('utf8'));
  const policyBytes=await fs.readFile(path.join(OUTPUT,'price-policy-reference.json'));const policy=JSON.parse(policyBytes.toString('utf8'));
  assert.equal(reference.projectRef,'fkjarsouuchjiedrrblc');assert.equal(reference.rows.length,19629,'Fresh full catalogue reference required');
  assert.equal(policy.settings.enabled,true,'Approved FX policy is disabled');
  const aliases=aliasesFile?JSON.parse(await fs.readFile(aliasesFile,'utf8')):[];
  const plan=reconcile(parsed,reference,policy,aliases);
  await save(path.join(OUTPUT,'source-manifest.json'),{format:'user-price-source-manifest-v1',asOf:AS_OF,files:originalProof,
    worksheets:parsed.summaries,formulaCount:cached.workbooks.reduce((n,w)=>n+w.safety.formulaCount,0),
    originalWorkbooksUnchanged:true,readOnly:true,cachedSourceSha256:sha(cachedBytes),artifactAudit:artifact,
    referenceSha256:sha(referenceBytes),policySha256:sha(policyBytes),requiresMigration:'20261126033003_user_price_vat_unstated_as_quoted'});
  await save(path.join(OUTPUT,'parsed-rows.json'),parsed);
  await save(path.join(OUTPUT,'matched-rows.json'),{matches:plan.matches});
  const manifest={format:'user-price-staged-plan-v1',status:'STAGED_NOT_APPLIED',projectRef:reference.projectRef,asOf:AS_OF,
    referenceFile:path.relative(ROOT,referenceFile).replaceAll('\\','/'),referenceSha256:sha(referenceBytes),policySha256:sha(policyBytes),
    files:originalProof,summary:plan.summary,nullableVatMigrationRequired:true,
    currencyPolicy:'UAH as quoted; EUR/USD use current configured NBU rate and FX spread; custom Rehau euro blocked',
    vatPolicy:'Explicit false adds configured VAT; explicit true and unstated NULL are quoted without uplift; NULL is not an inclusion assertion',
    matchingPolicy:'Exact brand+SKU only; optional explicitly evidenced manufacturer alias pairs; no fuzzy/9-to-11 digit rules',
    priorSourcesPolicy:'Retain the eight explicitly approved stored named price-list sources separately from file-verified quotes',
    productFieldsAllowed:['amount','old_amount','currency','price_status'],inventoryFieldsAllowed:[],rows:plan.rows};
  await save(path.join(OUTPUT,'price-plan.json'),manifest);
  await save(path.join(OUTPUT,'summary.json'),{...plan.summary,planSha256:sha(await fs.readFile(path.join(OUTPUT,'price-plan.json')))});
  for(const proof of originalProof)assert.equal(sha(await fs.readFile(path.join(SOURCE,proof.file))),proof.sha256,'Source changed during staging');
  return plan.summary;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);const ref=args.find(a=>a.startsWith('--reference='));const aliases=args.find(a=>a.startsWith('--aliases='));
  if(args.includes('--help'))console.log('node scripts/pricing/user-prices.mjs [--extract] [--reference=path] [--aliases=manufacturer-evidence-pairs.json]');
  else{assert.ok(args.every(a=>a==='--extract'||a.startsWith('--reference=')||a.startsWith('--aliases=')),'Unknown argument');
    console.log(JSON.stringify(await stage({extract:args.includes('--extract'),...(ref?{referenceFile:path.resolve(ROOT,ref.slice(12))}:{}),...(aliases?{aliasesFile:path.resolve(ROOT,aliases.slice(10))}:{})})));}
}
