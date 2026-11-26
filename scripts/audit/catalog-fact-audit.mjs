// Full local audit of a hash-bound live export. Produces proposals only; no hosted or Git access.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {auditTaxonomy,candidateValues,classifyFromManufacturer,collectFacts,convertForAttribute,equivalentCharacteristic,fold,isPhysicalPipe,logisticalLabel,matchesParameter,near,normalizedTechnicalText,parseScalar,quantityClaims,text} from './catalog-fact-rules.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..');
const DEFAULT_EXPORT=path.join(ROOT,'backups/overnight-2026-11-26');
const DEFAULT_OUTPUT=path.join(ROOT,'imports/overnight-audit');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const md5=b=>crypto.createHash('md5').update(b).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const TECHNICAL_FIELDS=['sku','title','short_title','model','brand_id','primary_category_id','series_id','description','short_description','full_description','description_sections','seo_title','seo_description','publication_status'];
const SOURCE_NUMERIC_PREFERENCE={'manufacturer-exact-title':4,'manufacturer-ETIM-exact-SKU':3,'manufacturer-page-table':3,'preserved-manufacturer-table':2,'normalized-source-characteristic':0};
const SOURCE_TEXT_KEYS=['sourceTitle','sourceModel','sourceName','sourceDescription','sourceDescriptionUa','sourceDescriptionDe','manufacturerDescription'];
const definitionsById=data=>new Map(data.attribute_definitions.map(x=>[x.internal_id,x]));
const writable=async(stream,row)=>{if(!stream.write(JSON.stringify(row)+'\n'))await once(stream,'drain');};
const writeJson=async(file,value)=>fsp.writeFile(file,JSON.stringify(value,null,2)+'\n');

function publicText(product){
  const paragraphs=[product.title,product.short_description,product.description,product.full_description];
  for(const section of product.description_sections||[])paragraphs.push(section.title,...section.paragraphs||[]);
  return [...new Set(paragraphs.filter(Boolean).map(text))].join('\n');
}
function sourceText(source,facts){
  const p=source.raw_payload||{},e=p.sourceEvidence||{};
  return [p.officialTitle,p.manufacturerCode,p.model,...SOURCE_TEXT_KEYS.map(k=>e[k]),...facts.map(f=>`${f.label} ${f.value} ${f.unit}`)].filter(Boolean).join('\n');
}
function sourceEvidence(source,extra={}){
  return {sourceRecordId:source.internal_id,sourceId:source.source_id,sourceUrl:source.source_url,
    payloadChecksum:source.payload_checksum||null,...extra};
}
function preservedItemUrl(source){
  const raw=source.raw_payload||{},e=raw.sourceEvidence||{};
  return [source.source_url,raw.sourceUrl,raw.link,e.sourceUrl,e.officialUrl,e.itemUrl].find(value=>typeof value==='string'&&/^https?:\/\/[^\s]+$/i.test(value))||null;
}
function sourceIdentity(product,source){
  const raw=source.raw_payload||{},e=raw.sourceEvidence||{};
  const explicit=[e.exactSku,e.canonicalSku,raw.manufacturerCode,raw.manufacturer_code,raw.sku].filter(Boolean).map(x=>fold(x));
  return explicit.includes(fold(product.sku))||fold(source.source_id)===fold(product.sku)||fold(source.source_url).includes(fold(product.sku));
}
function guardedProposal(record,field,oldValue,proposedValue,reason,evidence,confidence='source-exact'){
  return {id:record.product.legacy_id,internalId:record.product.internal_id,sku:record.product.sku,
    brandId:record.product.brand_id,publicationStatus:record.product.publication_status,
    productMd5AtAudit:record.product_md5,commercialFieldsExcludedFromGuard:true,
    guard:{technicalFields:Object.fromEntries(TECHNICAL_FIELDS.map(k=>[k,record.product[k]??null]))},
    field,old:oldValue,proposed:proposedValue,reason,evidence,confidence,applied:false};
}
function characteristicRows(source){return Array.isArray(source.raw_payload?.characteristics)?source.raw_payload.characteristics:[];}
function titleScalarEvidence(source,key,categoryId,definitionUnit){
  const e=source.raw_payload?.sourceEvidence||{},title=e.sourceTitle||source.raw_payload?.officialTitle||'';
  let raw;
  if(key==='angleDegrees'){
    const values=[...title.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:[°º]|Grad\b|град\b)/gi)];if(values.length===1)raw=values[0][1]+' °';
  }else if(['pipeDiameterMm','pipeWallThicknessMm'].includes(key)&&isPhysicalPipe({title},categoryId,[],[source])===true){
    const match=/(?<![\p{L}\d])(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)/iu.exec(title);
    if(match)raw=match[key==='pipeDiameterMm'?1:2]+' mm';
  }
  if(!raw)return null;
  return {label:key==='angleDegrees'?'Exact original article title angle':'Exact original article title pipe dimensions',value:raw,kind:'manufacturer-exact-title',
    parsed:convertForAttribute(key,parseScalar(raw),definitionUnit),url:source.source_url,path:'sourceEvidence.sourceTitle',originalTitle:title};
}

export function inspectRecord(record,context){
  const p=record.product,category=context.taxonomy.byUuid.get(p.primary_category_id),categoryId=category?.stable_id||null;
  const sources=record.sources||[],facts=sources.flatMap(s=>collectFacts(s.raw_payload,s.source_url,`sources[${s.internal_id}].raw_payload`));
  const findings=[],proposals=[],verified=[],ambiguous=[],stats={typedTotal:record.attributes?.length||0,typedNumericChecked:0,typedSourceVerified:0,etimFacts:0,etimProjected:0,descriptionClaims:0,descriptionSupported:0};
  const issue=(kind,detail,severity='review')=>findings.push({kind,severity,...detail});
  if(!category)issue('missing-primary-category',{categoryUuid:p.primary_category_id},'error');
  else{
    if(category.status!=='active'&&p.publication_status==='published')issue('published-in-inactive-category',{category:categoryId},'error');
    if(context.children.get(category.internal_id)?.some(c=>c.status==='active'))issue('assigned-to-nonleaf-category',{category:categoryId},'error');
  }
  if(!sources.length)issue('missing-source-record',{},'error');
  if(sources.length&&!sources.some(s=>s.source_url)){
    const nested=sources.map(preservedItemUrl).filter(Boolean);
    if(nested.length)issue('source-url-preserved-in-nested-original-field',{urls:nested,reason:'The canonical source_url field is empty, but original sourceUrl/link remains preserved. No source evidence is missing and no data write is proposed.'},'info');
    else issue('missing-preserved-source-url',{reason:'An item-level manufacturer URL is absent from canonical and original URL fields. Image URLs do not prove a source product page.'});
  }
  for(const source of sources){
    const classification=classifyFromManufacturer(source,categoryId,context.taxonomy);
    if(classification){
      issue('manufacturer-category-context',{category:categoryId,proposedCategory:classification.proposed,evidence:classification.evidence});
      if(p.publication_status==='published')proposals.push(guardedProposal(record,'primary_category_id',p.primary_category_id,
        context.taxonomy.byId.get(classification.proposed).internal_id,classification.reason,{...classification.evidence,
          oldCategory:categoryId,proposedCategory:classification.proposed},'manufacturer-class-and-context'));
    }
    const e=source.raw_payload?.sourceEvidence||{};
    // Manufacturer original text, not a generated public prefix, defines the article's role.
    if(context.brands.get(p.brand_id)?.stable_id==='rehau'&&/brückenkabel\s+für\s+schwei(?:ß|ss)adapter/i.test(e.sourceTitle||'')){
      issue('additional-REHAU-tool-accessory-scope-review',{evidence:sourceEvidence(source,{originalTitle:e.sourceTitle,
        sourceDescriptionUa:e.sourceDescriptionUa||'',sourceDescriptionDe:e.sourceDescriptionDe||''}),
        reason:'A bridge lead for a welding adapter is dedicated tooling; not included in the frozen 266 list. No status change is proposed by this audit.'},'high');
    }
    // Compare every usable exact-SKU manufacturer ETIM row to its preserved Ukrainian projection.
    const chars=characteristicRows(source);
    if(chars.length&&e.sourceEtim?.features?.length){
      const byLabel=new Map();for(const c of chars){const label=normalizedTechnicalText(c.label);if(!byLabel.has(label))byLabel.set(label,[]);byLabel.get(label).push(c);}
      for(const feature of e.sourceEtim.features){
        if(!feature.name||feature.value===null||feature.value===undefined||text(feature.value)===''||/^[-–—/]$/.test(text(feature.value))||logisticalLabel(feature.name))continue;
        stats.etimFacts++;
        const label=context.labels[feature.name],value=/^(?:Ja|true)$/i.test(String(feature.value))?'Так':/^(?:Nein|false)$/i.test(String(feature.value))?'Ні':context.values[feature.value]??String(feature.value);
        if(!label){ambiguous.push({kind:'ETIM-label-translation-not-in-frozen-map',label:feature.name});continue;}
        const matches=byLabel.get(normalizedTechnicalText(label))||[];
        const exact=matches.some(c=>equivalentCharacteristic(`${c.value} ${c.unit||''}`,value));
        if(exact){stats.etimProjected++;continue;}
        const evidence=sourceEvidence(source,{etimCode:feature.code,sourceLabel:feature.name,sourceValue:feature.value,translatedLabel:label,expectedTranslatedValue:value,currentRows:matches});
        issue(matches.length?'ETIM-characteristic-value-disagreement':'ETIM-characteristic-not-projected',{evidence},'review');
      }
    }
  }
  for(const attr of record.attributes||[]){
    const def=context.defs.get(attr.attribute_id);
    if(!def){issue('unknown-attribute-definition',{attributeUuid:attr.attribute_id},'error');continue;}
    const key=def.stable_id,current=attr.value_number??attr.value_text??attr.value_boolean??context.options.get(attr.option_id)?.value;
    if(current===null||current===undefined||current===''){issue('empty-typed-attribute',{attribute:key},'error');continue;}
    const allowed=context.taxonomy.facets.get(categoryId);
    if(allowed&&!allowed.has(key))issue('typed-detail-not-configured-as-category-facet',{attribute:key,category:categoryId,value:current,
      reason:'Informational only: a legitimate detail need not be a filter. No removal is proposed.'},'info');
    if(key==='pipeLengthMm'){
      const physical=isPhysicalPipe(p,categoryId,facts,sources);
      if(physical===false)issue('pipe-length-on-proven-nonpipe',{attribute:key,value:current,category:categoryId},'high');
      if(physical===null)ambiguous.push({kind:'pipe-length-physical-product-type-needs-review',attribute:key,value:current,category:categoryId});
    }
    if(key==='pipeDiameterMm'&&/^\s*(?:dn|номінальн)/iu.test(attr.source_label||''))issue('DN-is-not-proof-of-outer-diameter',{value:current,sourceLabel:attr.source_label,sourceValue:attr.source_value},'high');
    if(key==='outlets'&&/max\.?\s*anzahl zusätzlicher|максимальна кількість додаткових/i.test(attr.source_label||''))issue('additional-circuit-capacity-is-not-installed-outlets',{value:current,sourceLabel:attr.source_label},'high');
    if(def.value_type!=='number'&&key!=='outlets')continue;
    if(!Number.isFinite(Number(current))){
      if(def.value_type==='number')issue('nonnumeric-value-in-numeric-attribute',{attribute:key,value:current},'error');
      else ambiguous.push({kind:'compound-count-select-retained-without-summing',attribute:key,value:current});
      continue;
    }
    let candidates=candidateValues(key,facts,def.unit);
    if(attr.source_label&&attr.source_value&&matchesParameter(key,attr.source_label)){
      const parsed=convertForAttribute(key,parseScalar(attr.source_value,attr.source_unit||'',{locale:'unknown'}),def.unit);
      candidates.push({label:attr.source_label,value:attr.source_value,unit:attr.source_unit,kind:'typed-original-provenance',parsed,url:sources[0]?.source_url,path:'product_attribute_values.source_value'});
    }
    for(const source of sources){
      const fromTitle=titleScalarEvidence(source,key,categoryId,def.unit);if(fromTitle)candidates.push(fromTitle);
      const proof=source.raw_payload?.sourceEvidence?.normalizedFilterSources?.[key];
      if(proof?.raw){const parsed=convertForAttribute(key,parseScalar(proof.raw,'',{locale:/ETIM/i.test(proof.source||'')?'de':'unknown'}),def.unit);
        candidates.push({label:proof.field,value:proof.raw,kind:'manufacturer-ETIM-exact-SKU',parsed,url:source.source_url,path:`sourceEvidence.normalizedFilterSources.${key}`});}
    }
    const strong=candidates.filter(c=>c.parsed.ok&&(SOURCE_NUMERIC_PREFERENCE[c.kind]||0)>0);
    const available=strong.length?strong:candidates.filter(c=>c.parsed.ok&&c.kind==='typed-original-provenance');
    if(!available.length){ambiguous.push({kind:'numeric-source-not-independently-resolvable',attribute:key,current,reasons:[...new Set(candidates.map(c=>c.parsed.reason).filter(Boolean))]});continue;}
    stats.typedNumericChecked++;
    const distinct=[];for(const c of available)if(!distinct.some(v=>near(v,c.parsed.converted)))distinct.push(c.parsed.converted);
    if(available.some(c=>near(Number(current),c.parsed.converted))){
      if(strong.length)stats.typedSourceVerified++;verified.push(key);
      if(distinct.length>1)issue('manufacturer-source-conflict-current-supported',{attribute:key,current,evidence:available.map(c=>({label:c.label,value:c.value,converted:c.parsed.converted,url:c.url,path:c.path}))});
      continue;
    }
    if(distinct.length!==1){issue('conflicting-manufacturer-numeric-facts',{attribute:key,current,evidence:available.map(c=>({label:c.label,value:c.value,converted:c.parsed.converted,url:c.url,path:c.path}))});continue;}
    const source=available[0],value=distinct[0];
    const evidence={attribute:key,sourceLabel:source.label,sourceValue:source.value,sourceUnit:source.unit||source.parsed.unit,
      normalizedValue:value,targetUnit:source.parsed.targetUnit||def.unit,sourceUrl:source.url,sourcePath:source.path,allSupportingFacts:available.map(c=>({label:c.label,value:c.value,url:c.url,path:c.path}))};
    issue('numeric-source-disagreement-needs-adjudication',{attribute:key,current,expected:value,evidence},'review');
    const owner=sources.find(s=>s.source_url===source.url);
    if(p.publication_status==='published'&&owner&&sourceIdentity(p,owner)&&strong.length&&context.approvedNumeric.has(p.legacy_id+':'+key)){
      const proposed=key==='outlets'?String(value):value;
      proposals.push({...guardedProposal(record,`attributes.${key}`,current,proposed,'One unambiguous independent manufacturer scalar, with explicit compatible units, differs from the current typed value.',evidence),
        attributeId:attr.attribute_id,attributeGuard:attr});
    }
  }
  const body=publicText(p);
  if(!text(p.description)&&!text(p.full_description)&&!(p.description_sections||[]).some(s=>s.paragraphs?.some(v=>text(v))))issue('missing-public-description',{},'high');
  if(text(p.short_description).length>300)issue('short-description-over-300',{length:text(p.short_description).length},'editorial');
  if(/[ыэъёłżźćńąę]/iu.test(body))issue('non-Ukrainian-public-copy-marker',{tokens:[...new Set(body.match(/\S*[ыэъёłżźćńąę]\S*/giu)||[])].slice(0,12)},'editorial');
  if(/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|BAFA|поверненню не підлягає|термін поставки.*за запитом|ціни за запитом)/iu.test(body))issue('manufacturer-contact-or-commercial-policy-in-public-copy',{matches:(body.match(/[^\n.]{0,70}(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|BAFA|поверненню не підлягає|термін поставки.*за запитом|ціни за запитом)[^\n.]{0,80}/giu)||[]).slice(0,5)},'review');
  const claims=quantityClaims(body),sourceClaims=sources.flatMap(s=>quantityClaims(sourceText(s,facts)));
  const seenClaims=new Set();for(const claim of claims){const signature=claim.family+':'+claim.value;if(seenClaims.has(signature))continue;seenClaims.add(signature);stats.descriptionClaims++;
    if(sourceClaims.some(c=>c.family===claim.family&&near(c.value,claim.value)))stats.descriptionSupported++;
    else ambiguous.push({kind:'public-quantity-not-located-in-preserved-original-text',claim:claim.text,value:claim.value,physicalFamily:claim.family});
  }
  const protectedTool=context.exclusions.get(p.legacy_id);
  if(protectedTool&&p.publication_status==='published')issue('protected-excluded-REHAU-tool-is-published',{sku:protectedTool.sku},'error');
  if(protectedTool&&proposals.length)proposals.length=0;
  return {id:p.legacy_id,sku:p.sku,title:p.title,brand:context.brands.get(p.brand_id)?.stable_id||p.brand_id,category:categoryId,status:p.publication_status,
    productMd5AtAudit:record.product_md5,sourceCount:sources.length,sourceWithUrl:sources.filter(s=>s.source_url).length,
    sourceFactRows:facts.length,stats,findings,proposals,ambiguous,protectedExcludedTool:!!protectedTool};
}

export async function auditCatalog({exportDirectory=DEFAULT_EXPORT,outputDirectory=DEFAULT_OUTPUT,stage='full'}={}){
  assert.ok(['full','categories'].includes(stage));
  const manifestFile=path.join(exportDirectory,'live-manifest.json'),taxonomyFile=path.join(exportDirectory,'live/taxonomy.json');
  const manifestBytes=await fsp.readFile(manifestFile),manifest=JSON.parse(manifestBytes),taxonomyBytes=await fsp.readFile(taxonomyFile);
  const root=JSON.parse(taxonomyBytes),data=Array.isArray(root)?root[0].data:root.data||root,taxonomy=auditTaxonomy(data);
  const context={taxonomy,defs:definitionsById(data),brands:new Map(data.brands.map(b=>[b.internal_id,b])),options:new Map(data.attribute_options.map(o=>[o.internal_id,o])),children:new Map(),
    labels:read(path.join(ROOT,'scripts/import/rehau-label-translations.json')),values:read(path.join(ROOT,'scripts/import/rehau-value-translations.json')),
    approvedNumeric:new Set(),
    exclusions:new Map(read(path.join(ROOT,'imports/rehau-no-tools-exclusions.json')).products.map(p=>[p.legacyId,p]))};
  for(const c of data.categories){if(!context.children.has(c.parent_id))context.children.set(c.parent_id,[]);context.children.get(c.parent_id).push(c);}
  await fsp.mkdir(outputDirectory,{recursive:true});
  const results=fs.createWriteStream(path.join(outputDirectory,stage==='full'?'products.ndjson':'category-scan.ndjson'));
  const proposals=[],findings=[],ambiguous=[],seen=new Set(),md5Pairs=[],pages=[];
  const counts={products:0,attributes:0,sources:0,statuses:{},brands:{},typedTotal:0,typedNumericChecked:0,typedSourceVerified:0,etimFacts:0,etimProjected:0,descriptionClaims:0,descriptionSupported:0};
  try{
    for(const file of manifest.files){
      const absolute=path.join(exportDirectory,'live',file.file),bytes=await fsp.readFile(absolute);
      assert.equal(bytes.length,file.bytes,'Export page size differs');assert.equal(sha(bytes),file.sha256,'Export page SHA differs');
      const page=JSON.parse(bytes);assert.equal(page.offset,counts.products,'Export offset gap');assert.equal(page.rows.length,file.rows,'Export row count differs');
      pages.push({file:file.file,sha256:file.sha256,rows:file.rows});
      for(const row of page.rows){
        const decoded=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(row.row_base64.replace(/\s/g,''),'base64'));
        const record=JSON.parse(decoded),p=record.product;assert.ok(p?.internal_id&&p?.legacy_id&&/^[a-f0-9]{32}$/.test(record.product_md5),'Expected full canonical row and product guard');
        assert.ok(!seen.has(p.legacy_id),'Duplicate live ID');seen.add(p.legacy_id);md5Pairs.push([p.legacy_id,record.product_md5]);
        counts.products++;counts.attributes+=record.attributes.length;counts.sources+=record.sources.length;counts.statuses[p.publication_status]=(counts.statuses[p.publication_status]||0)+1;
        const brand=context.brands.get(p.brand_id)?.stable_id||p.brand_id;counts.brands[brand]=(counts.brands[brand]||0)+1;
        let inspected;
        if(stage==='full')inspected=inspectRecord(record,context);
        else{
          const category=taxonomy.byUuid.get(p.primary_category_id)?.stable_id;const proposed=[];
          for(const source of record.sources){const c=classifyFromManufacturer(source,category,taxonomy);if(c&&p.publication_status==='published')proposed.push(guardedProposal(record,'primary_category_id',p.primary_category_id,taxonomy.byId.get(c.proposed).internal_id,c.reason,{...c.evidence,oldCategory:category,proposedCategory:c.proposed},'manufacturer-class-and-context'));}
          inspected={id:p.legacy_id,sku:p.sku,title:p.title,brand,category,status:p.publication_status,proposals:proposed,findings:[],ambiguous:[],stats:{}};
        }
        for(const [key,value]of Object.entries(inspected.stats))counts[key]=(counts[key]||0)+value;
        for(const item of inspected.proposals)proposals.push(item);
        for(const item of inspected.findings)findings.push({id:p.legacy_id,sku:p.sku,brand,status:p.publication_status,...item});
        for(const item of inspected.ambiguous)ambiguous.push({id:p.legacy_id,sku:p.sku,brand,status:p.publication_status,...item});
        const {proposals:discarded,...line}=inspected;await writable(results,line);
      }
    }
  }finally{results.end();await once(results,'finish');}
  assert.equal(counts.products,manifest.products);assert.equal(counts.attributes,manifest.attributes);assert.equal(counts.sources,manifest.sources);
  const pairHash=md5(md5Pairs.sort((a,b)=>Buffer.compare(Buffer.from(a[0]),Buffer.from(b[0]))).map(([,hash])=>hash).join(''));
  assert.equal(pairHash,manifest.productMd5ByLegacyId,'Full product MD5-by-ID binding differs');
  const group=rows=>rows.reduce((out,r)=>(out[r.kind]=(out[r.kind]||0)+1,out),{});
  const report={status:'AUDIT-COMPLETE-NOT-APPLIED',stage,auditedAt:new Date().toISOString(),projectRef:'fkjarsouuchjiedrrblc',
    exportManifestSha256:sha(manifestBytes),taxonomySha256:sha(taxonomyBytes),productMd5Aggregate:pairHash,
    coverage:{...counts,pages:pages.length,categories:data.categories.length,attributeDefinitions:data.attribute_definitions.length},taxonomyIssues:taxonomy.issues,
    counts:{proposals:proposals.length,findings:findings.length,ambiguousChecks:ambiguous.length},findingGroups:group(findings),ambiguousGroups:group(ambiguous),
    scopeProtection:{excludedTools:context.exclusions.size,existingExcludedTools:[...context.exclusions.keys()].filter(id=>seen.has(id)).length,neverImported:[...context.exclusions.keys()].filter(id=>!seen.has(id)).length,
      proposedExcludedTools:proposals.filter(p=>context.exclusions.has(p.id)).length},
    limitations:['Machine coverage is not a claim that every unstructured technical sentence is independently verified.','Ambiguous units, conflicting source variants, absent source facts and editorial language require source review; no facts are invented.','Product MD5 is audit provenance. Proposal guards intentionally exclude commercial fields and updated_at so separately authorized price updates do not overwrite technical data.'],
    outputs:{proposals:stage==='full'?'proposed-corrections.json':'category-proposals-preliminary.json',findings:'findings.json',ambiguous:'ambiguous-checks.json'}};
  await writeJson(path.join(outputDirectory,report.outputs.proposals),{status:'PROPOSED-ONLY-NOT-APPLIED',count:proposals.length,pricesAndPublicationUnchanged:true,products:proposals});
  if(stage==='full'){await writeJson(path.join(outputDirectory,'findings.json'),{count:findings.length,findings});await writeJson(path.join(outputDirectory,'ambiguous-checks.json'),{count:ambiguous.length,checks:ambiguous});}
  await writeJson(path.join(outputDirectory,stage==='full'?'audit-summary.json':'category-summary-preliminary.json'),report);
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=Object.fromEntries(process.argv.slice(2).map(a=>{const match=/^--(export|output|stage)=(.+)$/.exec(a);assert.ok(match,'Use --export=... --output=... --stage=full|categories');return [match[1],match[2]];}));
    const report=await auditCatalog({exportDirectory:args.export?path.resolve(ROOT,args.export):DEFAULT_EXPORT,outputDirectory:args.output?path.resolve(ROOT,args.output):DEFAULT_OUTPUT,stage:args.stage||'full'});
    console.log(JSON.stringify({status:report.status,stage:report.stage,products:report.coverage.products,pages:report.coverage.pages,counts:report.counts,findingGroups:report.findingGroups,scopeProtection:report.scopeProtection,hostedConnections:0}));
  }catch(error){console.error(JSON.stringify({status:'FAIL',error:error.message,hostedConnections:0}));process.exitCode=1;}
}
