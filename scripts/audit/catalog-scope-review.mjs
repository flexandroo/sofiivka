// Exhaustive local source-role detector, followed by explicit dispositions. Never changes product data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'imports/overnight-audit');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=read('backups/overnight-2026-11-26/live-manifest.json');
const taxonomy=read('backups/overnight-2026-11-26/live/taxonomy.json')[0].data;
const brand=taxonomy.brands.find(x=>x.stable_id==='rehau').internal_id;
const categories=new Map(taxonomy.categories.map(x=>[x.internal_id,x.stable_id]));
const previous=read('imports/rehau-no-tools-exclusions.json'),excluded=new Map(previous.products.map(x=>[x.sku,x]));
const toolWords=/(?:werkzeug|schwei[ßs]|schweiss|rauto[o]?l|montageger[aä]t|adapterkabel|br[uü]ckungskabel|prüfger[aä]t|testger[aä]t|druckprüf|schl[uü]ssel|schneid|fräs|einzieh|klemme|gleitmittel|tacker|інструмент|зварювальн|зварюван|розмотувач|розширювач|прес-інструмент|оснастк|перетиск|випробуван|термоплівк|ключ\b)/iu;
const classWords=/(?:Werkzeug|Prüfgerät|Schweißgerät|Schneidgerät|Bearbeitungsgerät)/iu;
const descriptionsWithToolPurpose=/(?:zum Anschluss des Manometers bei der Druckprüfung|zur Druckprüfung|zur temporären|zum temporären|для тимчасового|Інструмент для|інструмент для)/iu;
const candidates=[],existing=[],originalAbsent=new Set(excluded.keys());let products=0,withOriginalTitle=0,withEtimClass=0,withOriginalDescription=0;
for(const page of manifest.files){
  const file=path.join(root,'backups/overnight-2026-11-26/live',page.file),bytes=fs.readFileSync(file);assert.equal(sha(bytes),page.sha256);
  for(const [rowIndex,row]of JSON.parse(bytes).rows.entries()){
    const record=JSON.parse(Buffer.from(row.row_base64,'base64').toString('utf8')),p=record.product;if(p.brand_id!==brand)continue;
    products++;originalAbsent.delete(p.sku);
    if(excluded.has(p.sku)){assert.equal(p.publication_status,'draft');existing.push({sku:p.sku,id:p.legacy_id,status:p.publication_status});continue;}
    for(const source of record.sources){
      const e=source.raw_payload?.sourceEvidence||{},originalTitle=e.sourceTitle||source.raw_payload?.officialTitle||'',cl=e.sourceEtim?.class||{};
      const description=[e.sourceDescriptionUa,e.sourceDescriptionDe].filter(Boolean).join('\n');
      if(originalTitle)withOriginalTitle++;if(cl.code)withEtimClass++;if(description)withOriginalDescription++;
      const titleMatch=toolWords.test(originalTitle),classMatch=classWords.test(cl.name||''),purposeMatch=descriptionsWithToolPurpose.test(description);
      if(!titleMatch&&!classMatch&&!purposeMatch)continue;
      let decision,reason;
      if(p.sku==='10013181001'){
        assert.equal(originalTitle,'AWADUKT PP Überbrückungskabel für Schweißadapter');
        decision='exclude-dedicated-tool-accessory';reason='The article is the welding-adapter jumper cable itself; not an installed pipeline fitting.';
      }else if(p.sku==='13524301002'){
        assert.equal(cl.code,'EC004314');decision='keep-permanent-geothermal-mount';reason='Dual-purpose flat-steel set mounts the permanent geothermal probe weight as well as an insertion aid; do not infer a removable tool only from ETIM.';
      }else if(['14710531001','14710571001','14710581001'].includes(p.sku)){
        decision='keep-primary-valve-kit';reason='The primary articles are installed thermostat/air-vent valves; an included removal tool does not turn the kit into tooling.';
      }else if(cl.code==='EC010292'&&/RAUTHERM SPEED HKV-D P/iu.test(originalTitle)&&/Розподіл та балансування теплоносія/iu.test(description)){
        decision='keep-primary-hydraulic-manifold';reason='The source application is distribution and balancing of heating/cooling fluid. A supplied calibration/removal tool is only a kit accessory.';
      }else if((cl.code==='EC011343'&&/Absperrarmatur/iu.test(originalTitle)||/^Запірна арматура INPX/iu.test(originalTitle))&&/Kugelhahn|шаровим краном/iu.test(description)){
        decision='keep-installed-shutoff-valve';reason='Installed pre-insulated ball-valve assembly for isolating a network section. Temporary shutoff is its operating function, not temporary tool installation.';
      }else if(/Tackerplatte|Tacker-Thermo|Tackernadel|Tackernadeln|гарпун-скоб|скоб.*RAUTAC/iu.test(originalTitle)){
        decision='keep-installed-underfloor-system';reason='Installed insulation/pipe panels or fixing staples; Tacker names the fixing method, not an installation device.';
      }else if(/Gleitmittel für Steckmuffenverbindungen/iu.test(originalTitle)){
        decision='keep-installation-consumable';reason='Joint lubricant is a system installation consumable, not an instrument or dedicated tool part.';
      }else if(/RAUSIKKO Paket.*Kabelverlängerung/iu.test(originalTitle)&&cl.code==='EC003496'){
        decision='keep-permanent-automation-cabling';reason='Cable extensions/junctions for the installed pump and level probe; not a tooling lead.';
      }else if(/Set PVC-Klemmen für REHAU Konsole Q/iu.test(originalTitle)&&cl.code==='EC010383'){
        decision='keep-permanent-manifold-console-clips';reason='PVC clips for the installed manifold console are permanent system mounts.';
      }else if(/Vorschweißbund|Elektroschweißmuffe|Anschweißsattel|eingeschweißt|^AWADUKT PP Schweißadapter|Übergang mit Schweißende/iu.test(originalTitle)&&!classWords.test(cl.name||'')){
        decision='keep-installed-welded-system-part';reason='The source names the installed pipe connection/plate/saddle or welded assembly; a welding process does not make the permanent component a tool.';
      }else if(/Schutzhandschuhe/iu.test(originalTitle)){
        decision='keep-previous-explicit-PPE-scope';reason='The preceding scope adjudication explicitly retained protective gloves; do not silently broaden the no-tools rule.';
      }else{
        decision='unresolved-source-role-review';reason='A tool-related source token alone is insufficient to exclude a product.';
      }
      candidates.push({sku:p.sku,id:p.legacy_id,status:p.publication_status,category:categories.get(p.primary_category_id),sourceRecordId:source.internal_id,
        sourceId:source.source_id,sourceUrl:source.source_url,originalTitle,etimClass:cl,titleMatch,classMatch,purposeMatch,decision,reason,
        manufacturerPurpose:description,backup:{file:page.file,rowIndex}});
    }
  }
}
assert.equal(products,7835);assert.equal(existing.length,196);assert.equal(originalAbsent.size,70);
const additional=candidates.filter(x=>x.decision==='exclude-dedicated-tool-accessory'),unresolved=candidates.filter(x=>x.decision==='unresolved-source-role-review');
assert.equal(additional.length,1);
const groups={};for(const c of candidates)groups[c.decision]=(groups[c.decision]||0)+1;
const result={status:unresolved.length?'SOURCE-ROLE-REVIEW-PENDING':'DETECTOR-CANDIDATES-SOURCE-ADJUDICATED-NOT-APPLIED',sourceManifestSha256:sha(fs.readFileSync(path.join(root,'backups/overnight-2026-11-26/live-manifest.json'))),
  coverage:{rehauCurrentRecords:products,originalExcluded:266,retainedDraft:existing.length,originalNeverImported:originalAbsent.size,eligibleRecordsScanned:products-existing.length,
    withOriginalTitle,withEtimClass,withOriginalDescription,candidates:candidates.length},decisionCounts:groups,
  additionalExclusions:additional.map(({manufacturerPurpose,...x})=>x),totalExcludedAfterApprovedCorrection:267,
  limitations:['Every current REHAU record was scanned; source-token and ETIM-class detection is not a proof that every unstructured purpose is exhaustive.',
    'Manufacturer welding fittings, permanent clips, cable extensions and primary valve kits are not excluded solely because their source mentions tools.'],candidates,unresolved};
fs.writeFileSync(path.join(out,'rehau-scope-extension-review.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,coverage:result.coverage,decisionCounts:groups,additional:additional.map(x=>x.sku),unresolved:unresolved.length,unresolvedSample:unresolved.slice(0,5).map(x=>({sku:x.sku,title:x.originalTitle,class:x.etimClass}))}));
