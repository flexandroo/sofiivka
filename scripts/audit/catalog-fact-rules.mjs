// Deterministic local evidence checks. Source strings are data, never instructions or executable code.
export const text=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export const fold=value=>text(value).normalize('NFKC').toLocaleLowerCase('uk-UA').replace(/[’`]/g,"'");
export const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*1e-9;

const UNIT_DEFINITIONS=[
  ['m3/h',/^(?:м[³3]\s*\/\s*(?:год|ч|h)|m[³3]\s*\/\s*h)$/i,'flow',1],
  ['l/h',/^(?:л\s*\/\s*(?:год|ч)|l\s*\/\s*h)$/i,'flow',0.001],
  ['l/min',/^(?:л\s*\/\s*(?:хв|мин)|l\s*\/\s*min|lpm)$/i,'flow',0.06],
  ['kg/h',/^(?:кг\s*\/\s*(?:год|ч)|kg\s*\/\s*h)$/i,'mass-flow',1],
  ['mm',/^(?:мм|mm)$/i,'length',1],['cm',/^(?:см|cm)$/i,'length',10],['m',/^(?:м|m)$/i,'length',1000],
  ['kg',/^(?:кг|kg)$/i,'mass',1],['g',/^(?:г|g)$/i,'mass',0.001],
  ['kW',/^(?:квт|kw)$/i,'power',1],['W',/^(?:вт|w)$/i,'power',0.001],
  ['bar',/^(?:бар|bar)$/i,'pressure',1],['MPa',/^(?:мпа|mpa)$/i,'pressure',10],['kPa',/^(?:кпа|kpa)$/i,'pressure',0.01],['Pa',/^(?:па|pa)$/i,'pressure',0.00001],
  ['l',/^(?:л|l)$/i,'volume',1],['m3',/^(?:м[³3]|m[³3])$/i,'volume',1000],
  ['V',/^(?:в|v)$/i,'voltage',1],['C',/^(?:°\s*[cс]|град\.?\s*[cс])$/i,'temperature',1],
  ['deg',/^(?:°|град\.?|deg)$/i,'angle',1],['%',/^%$/,'percent',1],
  ['m2',/^(?:м[²2]|m[²2])$/i,'area',1],['rpm',/^(?:об\s*\/\s*(?:хв|мин)|rpm|1\s*\/\s*min)$/i,'rotation',1]
];
export function unitInfo(value){const unit=text(value).replace(/\.$/,'');return UNIT_DEFINITIONS.find(([,pattern])=>pattern.test(unit));}
const UNIT_TOKEN='(?:м[³3]\\s*\\/\\s*(?:год|ч|h)|m[³3]\\s*\\/\\s*h|л\\s*\\/\\s*(?:год|ч|хв|мин)|l\\s*\\/\\s*(?:h|min)|lpm|кг\\s*\\/\\s*(?:год|ч)|kg\\s*\\/\\s*h|мпа|mpa|кпа|kpa|па|pa|бар|bar|квт|kw|вт|w|мм|mm|см|cm|кг|kg|rpm|об\\s*\\/\\s*(?:хв|мин)|°\\s*[cс]|deg|град\\.?|м[²2³3]|m[²2³3]|м|m|л|l|г|g|в|v|°|%)';
const NUMBER_TOKEN='[+-]?(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)(?:[.,]\\d+)*(?:[eE][+-]?\\d+)?';
const scalarPattern=new RegExp(`^\\s*(${NUMBER_TOKEN})\\s*(${UNIT_TOKEN})?\\s*$`,'iu');

// Deliberately refuses ambiguous DE three-digit grouping outside the two proven unit contexts.
export function parseScalar(raw,explicitUnit='',{locale='unknown'}={}){
  const source=text(raw).replace(/−/g,'-');
  if(!source)return {ok:false,reason:'empty'};
  const match=scalarPattern.exec(source);if(!match)return {ok:false,reason:'not-one-explicit-scalar'};
  let number=match[1].replace(/[ \u00a0\u202f]/g,'');
  const supplied=unitInfo(explicitUnit),embedded=unitInfo(match[2]||'');
  if(supplied&&embedded&&supplied[0]!==embedded[0])return {ok:false,reason:'conflicting-unit-fields'};
  const unit=embedded||supplied;
  if(number.includes(',')&&number.includes('.')){
    if(/^[-+]?\d{1,3}(?:\.\d{3})+,\d+$/.test(number))number=number.replaceAll('.','').replace(',','.');
    else if(/^[-+]?\d{1,3}(?:,\d{3})+\.\d+$/.test(number))number=number.replaceAll(',','');
    else return {ok:false,reason:'ambiguous-number-separators'};
  }else if(number.includes(','))number=number.replace(',','.');
  else if(/^[-+]?[1-9]\d{0,2}\.\d{3}$/.test(number)&&locale==='de'){
    if(unit&&['mm','g'].includes(unit[0]))number=number.replace('.','');
    else if(unit?.[0]!=='m')return {ok:false,reason:'ambiguous-DE-grouping'};
    // A single point in metres is kept decimal: exact REHAU 4.825/4.800 m exceptions.
  }else if(/^[-+]?\d{1,3}(?:\.\d{3}){2,}$/.test(number)){
    if(locale==='de'&&unit&&['mm','g'].includes(unit[0]))number=number.replaceAll('.','');
    else return {ok:false,reason:'ambiguous-grouping'};
  }
  const value=Number(number);if(!Number.isFinite(value))return {ok:false,reason:'nonfinite'};
  return {ok:true,value,unit:unit?.[0]||'',family:unit?.[2]||'',factor:unit?.[3]||1,raw:source,locale};
}

const TARGET_UNITS={
  headM:'m',flowM3h:'m3/h',capacityLh:'l/h',capacityKgh:'kg/h',powerKw:'kW',heatOutputKw:'kW',coolingCapacityKw:'kW',consumptionPowerW:'W',
  weightKg:'kg',widthMm:'mm',heightMm:'mm',depthMm:'mm',mountingLengthMm:'mm',installationLengthMm:'mm',diameterMm:'mm',pipeDiameterMm:'mm',
  pipeWallThicknessMm:'mm',pipeLengthMm:'mm',freePassageMm:'mm',chimneyDiameterMm:'mm',cableLengthM:'m',chimneyHeightM:'m',radiusM:'m',
  maxImmersionDepthM:'m',pressureBar:'bar',volumeL:'l',waterVolumeL:'l',fireboxVolumeL:'l',collectorAreaM2:'m2',efficiencyPercent:'%',
  maxWaterTemperatureC:'C',rotationRpm:'rpm',angleDegrees:'deg'
};
export function convertForAttribute(key,parsed,definitionUnit=''){
  if(!parsed.ok)return parsed;
  const target=unitInfo(TARGET_UNITS[key]||definitionUnit);
  if(!target)return parsed.unit?{ok:false,reason:'unexpected-unit-for-unitless-attribute'}:{...parsed,converted:parsed.value};
  if(!parsed.unit)return {ok:false,reason:'source-unit-not-explicit'};
  if(target[2]!==parsed.family)return {ok:false,reason:'physical-dimension-mismatch'};
  return {...parsed,converted:parsed.value*parsed.factor/target[3],targetUnit:target[0]};
}

const LABELS={
  headM:/^(?:макс(?:имальн(?:а|ий|ої))?\.?\s*(?:напір|висота (?:подачі|підйому))|h\s*max|maximum head|max\.?\s*förderhöhe)/iu,
  flowM3h:/^(?:макс(?:имальн(?:а|ий))?\.?\s*(?:подача|подачі|продуктивність|витрата)|q\s*max|maximum flow|max\.?\s*förderstrom)/iu,
  powerKw:/^(?:(?:макс(?:имальн(?:а|ий))?\.?\s*)?(?:споживана|електрична|номінальна) потужність(?:\s|,|$)|потужність двигуна|споживання електроенергії|leistungsaufnahme|motorleistung)/iu,
  consumptionPowerW:/^(?:споживання електроенергії|електрична потужність|споживана електрична потужність|leistungsaufnahme)/iu,
  heatOutputKw:/^(?:номінальна теплова потужність|теплова потужність|потужність опалення|nennwärmeleistung)/iu,
  coolingCapacityKw:/^(?:потужність охолодження|холодопродуктивність|номінальна потужність охолодження)/iu,
  weightKg:/^(?:маса|вага|weight|gewicht)(?:\s*(?:[, (]|$))/iu,
  pipeDiameterMm:/^(?:зовнішній діаметр(?: труби| приєднання)?|діаметр труби зовнішній|rohraussendurchmesser|rohraußendurchmesser|aussendurchmesser|außendurchmesser)/iu,
  pipeWallThicknessMm:/^(?:товщина стінки(?: труби| приєднання)?|wandstärke|wanddicke)/iu,
  pipeLengthMm:/^(?:довжина(?: труби)?|länge|length)(?:\s*(?:[, (]|$))/iu,
  widthMm:/^(?:ширина|breite|width)(?:\s*(?:[, (]|$))/iu,
  heightMm:/^(?:висота|höhe|height)(?:\s*(?:[, (]|$))/iu,
  depthMm:/^(?:глибина|tiefe|depth)(?:\s*(?:[, (]|$))/iu,
  mountingLengthMm:/^(?:монтажна довжина|довжина насоса|einbaulänge|port-to-port length)/iu,
  cableLengthM:/^(?:довжина кабелю|kabellänge|cable length)/iu,
  pressureBar:/^(?:максимальний робочий тиск|робочий тиск|макс\.? тиск|макс\.? робочий тиск|max\.? arbeitsdruck|maximaler betriebsdruck)/iu,
  volumeL:/^(?:об'єм(?: бойлера| бака)?|місткість|объем)(?:\s*(?:[, (]|$))/iu,
  waterVolumeL:/^(?:водяна ємність|об'єм води)/iu,
  fireboxVolumeL:/^(?:об'єм топки|топка.*об'єм)/iu,
  efficiencyPercent:/^(?:ккд|коефіцієнт корисної дії|wirkungsgrad)/iu,
  angleDegrees:/^(?:кут(?: відводу| вигину| коліна)?|winkel des bogens|winkel)(?:\s*(?:[, (]|$))/iu,
  outlets:/^(?:кількість (?:виходів|контурів|опалювальних контурів|груп вторинного контуру)|anzahl der gruppen sekundär|anzahl der abzweige)(?:\s*(?:[, (]|$))/iu,
  zones:/^(?:кількість зон|зони|кількість приміщень)(?:\s*(?:[, (]|$))/iu,
  voltage:/^(?:номінальна напруга|напруга живлення|робоча напруга|живлення|напруга|versorgungsspannung|netzspannung|nennspannung|betriebsspannung|art der spannungsversorgung)/iu,
  chimneyDiameterMm:/^(?:діаметр димоходу|приєднувальні розміри димоходу)/iu,
  maxImmersionDepthM:/^(?:максимальна глибина занурення|maximale eintauchtiefe)/iu,
  freePassageMm:/^(?:вільний(?: сферичний)? прохід)/iu,
  maxWaterTemperatureC:/^(?:максимальна температура води|макс\.? температура теплоносія)/iu
};
export const logisticalLabel=value=>/(?:упаков|упакован|палет|пакув|штрихкод|артикул|код товару|ean|gtin|verpack|versand|palette|lieferzeit|gewicht.*verpack)/iu.test(text(value));
export function matchesParameter(key,label){
  const s=fold(label);if(logisticalLabel(s)||/(?:групи за паспортом|номінальна групова|максимальна кількість додаткових|max\.?\s*anzahl zusätzlicher)/iu.test(s))return false;
  // A flattened boiler table can contain chimney minimum height beside body dimensions.
  if(['heightMm','widthMm','depthMm'].includes(key)&&/(?:м[іи]н[іи]маль|максималь|minimum|maximum|димоход|chimney|патруб|приєднан|монтаж|installation|упаков)/iu.test(s))return false;
  return LABELS[key]?.test(s)||false;
}
export function collectFacts(payload,url,pathPrefix='raw_payload'){
  const facts=[];const push=(label,value,unit,path,kind,locale='unknown')=>{
    if(!label||value===null||value===undefined||typeof value==='object')return;
    facts.push({label:text(label),value:text(value),unit:text(unit),url,path,kind,locale});
  };
  const rows=(value,path,kind)=>{
    if(Array.isArray(value))for(let i=0;i<value.length;i++){
      const row=value[i];if(Array.isArray(row)&&row.length>=2)push(row[0],row[1],row[2],`${path}[${i}]`,kind);
      else if(row&&typeof row==='object'){
        if(row.label||row.name)push(row.label||row.name,row.value??row.text,row.unit,`${path}[${i}]`,kind);
        if(row.items)rows(row.items,`${path}[${i}].items`,kind);
        if(row.rows)rows(row.rows,`${path}[${i}].rows`,kind);
      }
    }
    else if(value&&typeof value==='object')for(const [label,v]of Object.entries(value))if(v===null||typeof v!=='object')push(label,v,'',`${path}.${label}`,kind);
  };
  for(const key of ['technicalDetails','technical_details','attributes','sourceAttributes','unmappedAttributes','characteristics','sourceCharacteristics'])rows(payload?.[key],`${pathPrefix}.${key}`,key==='characteristics'?'normalized-source-characteristic':'preserved-manufacturer-table');
  const e=payload?.sourceEvidence||{};
  for(const [i,row]of (e.sourceEtim?.features||[]).entries())push(row.name,row.value,row.unit,`${pathPrefix}.sourceEvidence.sourceEtim.features[${i}]`,'manufacturer-ETIM-exact-SKU','de');
  rows(e.rawCharacteristics,`${pathPrefix}.sourceEvidence.rawCharacteristics`,'manufacturer-page-table');
  return facts;
}
export function candidateValues(key,facts,definitionUnit=''){
  return facts.filter(f=>matchesParameter(key,f.label)).map(f=>{
    const labelUnit=/[,()]\s*([^(),]+)\)?$/.exec(f.label)?.[1]||'';
    return {...f,parsed:convertForAttribute(key,parseScalar(f.value,f.unit||unitInfo(labelUnit)?.[0]||'',{locale:f.locale}),definitionUnit)};
  });
}

export function normalizedTechnicalText(value){
  return fold(value).replace(/m[³3]\s*\/\s*h/g,'м³/год').replace(/(?<![a-z])l\s*\/\s*h(?![a-z])/g,'л/год')
    .replace(/(?<![a-z])l\s*\/\s*m(?![a-z])/g,'л/м').replace(/(?<![a-z])hz(?![a-z])/g,'гц')
    .replace(/(?<![a-z])a(?![a-z])/g,'а').replace(/(?<![a-z])n(?![a-z])/g,'н')
    .replace(/(?<=\d)\s*[xх×]\s*(?=\d)/g,'×').replace(/(?<![a-z])mm(?![a-z])/g,'мм').replace(/(?<![a-z])cm(?![a-z])/g,'см')
    .replace(/(?<![a-z])kg(?![a-z])/g,'кг').replace(/(?<![a-z])bar(?![a-z])/g,'бар').replace(/(?<![a-z])kw(?![a-z])/g,'квт')
    .replace(/(?<![a-z])w(?![a-z])/g,'вт').replace(/(?<![a-z])v(?![a-z])/g,'в').replace(/(?<![a-z])m(?![a-z])/g,'м').replace(/(?<![a-z])g(?![a-z])/g,'г').replace(/°\s*с/g,'°c')
    .replace(/[−–—]/g,'-').replace(/(?<=\d),(?=\d)/g,'.').replace(/\s+/g,'');
}
export function equivalentCharacteristic(current,original){
  const candidates=String(current).split(/;\s*/);
  const canonical=value=>normalizedTechnicalText(value).replace(/(?<![\p{L}\d])([+-]?\d+\.\d+)(?!\d)/gu,(_,n)=>String(Number(n)));
  if(candidates.some(value=>canonical(value)===canonical(original)))return true;
  const expected=parseScalar(original,'',{locale:'de'});
  if(!expected.ok)return false;
  return candidates.some(value=>{const actual=parseScalar(value);return actual.ok&&actual.family===expected.family&&near(actual.value*actual.factor,expected.value*expected.factor);});
}
export function quantityClaims(value){
  const regex=new RegExp(`(?<![\\p{L}\\d])(${NUMBER_TOKEN})\\s*(${UNIT_TOKEN})(?![\\p{L}])`,'giu');
  const claims=[];for(const m of text(value).matchAll(regex)){
    const p=parseScalar(m[1]+' '+m[2]);if(p.ok&&p.unit)claims.push({text:m[0],value:p.value*p.factor,family:p.family,unit:p.unit,index:m.index});
  }return claims;
}

export function auditTaxonomy(data){
  const byUuid=new Map(data.categories.map(c=>[c.internal_id,c])),byId=new Map(data.categories.map(c=>[c.stable_id,c]));
  const issues=[],paths=new Map();
  for(const category of data.categories){
    const chain=[],seen=new Set();let current=category;
    while(current){
      if(seen.has(current.internal_id)){issues.push({kind:'category-parent-cycle',category:category.stable_id,chain:chain.map(c=>c.stable_id)});break;}
      seen.add(current.internal_id);chain.unshift(current);
      if(current.parent_id&&!byUuid.has(current.parent_id)){issues.push({kind:'category-parent-missing',category:current.stable_id,parent:current.parent_id});break;}
      current=current.parent_id?byUuid.get(current.parent_id):null;
    }
    paths.set(category.internal_id,chain.map(c=>c.stable_id));
    if(category.level!==chain.length)issues.push({kind:'category-level-mismatch',category:category.stable_id,level:category.level,expected:chain.length});
    if(category.status==='active'&&chain.some(c=>c.status!=='active'))issues.push({kind:'active-category-under-inactive-parent',category:category.stable_id});
  }
  const facets=new Map();for(const f of data.effective_category_facets||[]){if(!facets.has(f.category_id))facets.set(f.category_id,new Set());facets.get(f.category_id).add(f.attribute_id);}
  return {byUuid,byId,paths,facets,issues};
}

const PIPE_LEAVES=new Set(['water-heating-pipes','internal-sewer-pipes','external-sewer-pipes','district-heating-pipes','drainage-pipes','ventilation-ducts']);
export function isPhysicalPipe(product,category,facts,sources=[]){
  if(PIPE_LEAVES.has(category))return true;
  if(category==='geothermal-systems'||category==='underfloor-heating'){
    if(sources.some(s=>['EC010882','EC010225','EC010339','EC011704'].includes(s.raw_payload?.sourceEvidence?.sourceEtim?.class?.code)))return true;
    if(/^(?:труба|універсальна труба|композитна труба|геотермальний зонд|зонд)/iu.test(text(product.title)))return true;
    if(sources.some(s=>/^(?:REHAU\s+)?(?:RAUTHERM\b.*\bRohr|RAUGEO\b.*\b(?:Sonde|Rohre)|Геотерм.*зонд)/iu.test(s.raw_payload?.sourceEvidence?.sourceTitle||'')))return true;
  }
  if(/^(?:фіксувальна стрічка|крайова ізоляція|монтажна рейка|теплоізоляційна плита|колектор|кліпса|ковпачок|кран)/iu.test(text(product.title)))return false;
  return null; // No negative physical claim from a generic translated prefix alone.
}

export function classifyFromManufacturer(source,currentCategory,taxonomy){
  const e=source?.raw_payload?.sourceEvidence||{},etim=e.sourceEtim?.class||{};
  const original=text(e.sourceTitle||source.raw_payload?.officialTitle||source.raw_payload?.title);
  const context=fold([original,e.sourceModel,source.source_category,e.sourceDescriptionUa,e.sourceDescriptionDe,source.raw_payload?.series].filter(Boolean).join(' '));
  let proposed,reason;
  if(etim.code==='EC010383'&&currentCategory==='pipe-installation-components'){
    proposed='distribution-manifolds';reason='Exact manufacturer ETIM class is dedicated heating manifold accessories, not generic pipe installation.';
  }else if(etim.code==='EC011711'&&currentCategory==='pipe-installation-components'&&/rauthermex|rauvitherm|insulpex/i.test(context)){
    proposed='district-heating-components';reason='Exact pre-insulated pipe accessory class and named district-network family.';
  }else if(etim.code==='EC003496'&&currentCategory==='pipe-installation-components'&&/rausikko|rainwater|infiltration|дощов|інфільтрац/i.test(context)){
    proposed='stormwater-infiltration-components';reason='Exact infiltration-unit accessory class and manufacturer rainwater context.';
  }else if(etim.code==='EC011735'&&currentCategory==='pipe-fittings'){
    if(/awadukt|awadock|awaschacht|rauvia|rauplen/i.test(context))proposed='external-sewer-fittings';
    if(/raupiano|rausilento/i.test(context))proposed='internal-sewer-fittings';
    reason='Exact sewer transition-ring class and named sewer family; not pressure-pipe fittings.';
  }
  if(proposed&&taxonomy.byId.get(proposed)?.status==='active')return {proposed,reason,evidence:{etimCode:etim.code,etimName:etim.name,originalTitle:original,sourceUrl:source.source_url,sourceId:source.source_id}};
  return null;
}
