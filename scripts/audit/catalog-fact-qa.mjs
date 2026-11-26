// Offline engineering/source regression checks. No hosted calls or output mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {convertForAttribute,equivalentCharacteristic,isPhysicalPipe,matchesParameter,near,parseScalar} from './catalog-fact-rules.mjs';
import {correctFlowText,deriveSignedSourceChanges,qualifyDepthText,repairSignedText} from './catalog-repair-plan.mjs';

let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
const scalar=(raw,key,unit='',options={})=>convertForAttribute(key,parseScalar(raw,unit,options));
check(near(scalar('25000 l/h','flowM3h').converted,25),'litres/hour are not cubic metres/hour');
check(near(scalar('600 W','powerKw').converted,0.6),'watts convert to kW without changing the physical quantity');
check(near(scalar('1.000 mm','pipeLengthMm','',{locale:'de'}).converted,1000),'proven German millimetre grouping');
check(near(scalar('2.000 g','weightKg','',{locale:'de'}).converted,2),'proven German gram grouping');
check(near(scalar('4.825 m','pipeLengthMm','',{locale:'de'}).converted,4825),'effective 4.825 metres must not become 4825 metres');
check(near(scalar('4.800 m','pipeLengthMm','',{locale:'de'}).converted,4800),'effective 4.800 metre exception');
check(near(parseScalar('3,60 V').value,3.6),'decimal voltage is not truncated');
check(!parseScalar('1.234 kg','',{locale:'de'}).ok,'unproven grouping context stays ambiguous');
for(const value of ['DN 25','1 1/4"','10 - 95 °C','230/400 V','2+1 вгору','407 Вт·год'])check(!parseScalar(value).ok,`not one scalar with proven units: ${value}`);
check(!scalar('25 bar','pipeDiameterMm').ok,'pressure cannot become diameter');
for(const label of ['висота (мінімально допустима)','висота (мінимально допустима)','Висота димоходу, м'])check(!matchesParameter('heightMm',label),'chimney/installation minimum is not body height');
check(!matchesParameter('outlets','Max.Anzahl zusätzlicher Heizkreise'),'capacity for additional circuits is not installed circuit count');
check(equivalentCharacteristic('1000 мм','1.000 mm'),'unit-aware representation equivalence');
check(equivalentCharacteristic('2 кг','2.000 g'),'mass representation equivalence');
for(const [ua,source]of [['8 А','8 A'],['110 Н','110 N'],['50 Гц','50 Hz'],['0,113 л/м','0,113 l/m'],['48,00 - 225,00 л/год','48,00 - 225,00 l/h'],['M30 × 1,5','M30 x 1,5']])check(equivalentCharacteristic(ua,source),'exact localized unit/multiplication representation is not a factual disagreement');
check(equivalentCharacteristic('Поліпропілен (PP); Поліпропілен (PP 2300)','Поліпропілен (PP)'),'a merged source row still contains its exact coarse material fact');
check(!equivalentCharacteristic('40 - 50 °C','-40 - 50 °C'),'a lost negative sign is a real change');
check(!equivalentCharacteristic('0,91','-0,91'),'negative dimensionless Zeta remains signed');
check(isPhysicalPipe({title:'Система'},'underfloor-heating',[],[{raw_payload:{sourceEvidence:{sourceEtim:{class:{code:'EC010882'}}}}}])===true,'exact pipe class proves physical type');
check(isPhysicalPipe({title:'Монтажна комплектуюча'},'underfloor-heating',[])===null,'generic translated prefix does not prove a nonpipe');

const label='Температура середовища за тривалої роботи';
const copy=`${label}: 40 - 50 °C. Монтажний розмір 40 мм.`;
const repaired=repairSignedText(copy,label,'40 - 50 °C');
check(repaired.value===`${label}: -40 - 50 °C. Монтажний розмір 40 мм.`,'only the labelled quantity changes');
check(repairSignedText(repaired.value,label,'40 - 50 °C').count===0,'signed copy rule is idempotent');
check(repairSignedText(`${label}: -10 °C`,label,'10 °C').count===0,'do not double an already preserved minus');
check(repairSignedText('DIN SPEC 2701','Коефіцієнт ζ','1').count===0,'do not alter digits in standards');
check(qualifyDepthText('Глубина: 950 мм; довжина 1660 мм.',950).value==='Глибина топки: 950 мм; довжина 1660 мм.','preserve firebox number, qualify its actual parameter');
check(qualifyDepthText('Глибина корпусу 950 мм; Глибина топки 950 мм.',950).count===0,'do not reclassify already qualified body/firebox claims');
check(qualifyDepthText('Глубина, мм: 950; інший розмір 950 мм.',950).value==='Глибина топки, мм: 950; інший розмір 950 мм.','unit-in-heading case remains bounded');
check(correctFlowText('Подача 25000 м³/год; джерело 25000 л/год; модель SDF 2.5-18.').value==='Подача 25 м³/год; джерело 25000 л/год; модель SDF 2.5-18.','repair the wrong unit claim without changing a correct source quantity');
check(correctFlowText('125000 м³/год та 25000 мм').count===0,'do not replace larger values or another physical dimension');

const sample={sources:[{internal_id:'source',source_id:'SKU',source_url:'https://manufacturer.test/SKU',supplier_id:'supplier',import_run_id:'run',payload_checksum:null,
  raw_payload:{sourceEvidence:{sourceEtim:{features:[{code:'EF',name:'Mediumtemperatur (Dauerbetrieb)',value:'-40 - 50 °C',system:'metaclass'}]}},characteristics:[{label,value:'40 - 50 °C'}]}}]};
const original=structuredClone(sample),derived=deriveSignedSourceChanges(sample,{'Mediumtemperatur (Dauerbetrieb)':label});
check(derived.length===1&&derived[0].newCharacteristics[0].value==='-40 - 50 °C','exact manufacturer feature repairs one actual projected row');
assert.deepEqual(sample,original);checks++;
const checksumCase=structuredClone(sample);checksumCase.sources[0].payload_checksum='non-null-upstream-hash';
assert.throws(()=>deriveSignedSourceChanges(checksumCase,{'Mediumtemperatur (Dauerbetrieb)':label}),/checksum/);checks++;
const duplicate=structuredClone(sample);duplicate.sources[0].raw_payload.characteristics.push({...duplicate.sources[0].raw_payload.characteristics[0]});
assert.throws(()=>deriveSignedSourceChanges(duplicate,{'Mediumtemperatur (Dauerbetrieb)':label}),/Ambiguous/);checks++;

const plan=JSON.parse(fs.readFileSync(new URL('../../imports/overnight-audit/catalog-repair-plan.json',import.meta.url),'utf8'));
check(plan.products.length===510,'the reviewed combined scope remains exactly bound');
let signed=0;const forbidden=new Set(['amount','old_amount','currency','price_status','inventory_status','sku','slug','updated_at']);
for(const product of plan.products){
  for(const change of product.productChanges)check(!forbidden.has(change.field),'no commercial/identity fields are written');
  for(const source of product.sourceChanges){
    signed++;check(source.payloadChecksumBefore===null,'do not retain a falsely named nonnull source checksum');
    check(source.changes.length===1,'one exact signed feature per source record');
    check(source.oldCharacteristics.length===source.newCharacteristics.length,'no characteristic is added or removed by sign repair');
    for(let i=0;i<source.oldCharacteristics.length;i++){
      const old=source.oldCharacteristics[i],next=source.newCharacteristics[i];
      if(i===source.changes[0].index){check(next.value==='-'+old.value,'only the missing leading sign changes');assert.deepEqual({...old,value:next.value},next);checks++;}
      else{assert.deepEqual(old,next);checks++;}
    }
  }
  for(const display of product.displayChanges.filter(d=>d.group==='base'))for(const entry of display.paths){
    check(entry.newRows.length===entry.oldRows.length+1,'qualified firebox fact is retained after it leaves the mistaken typed body depth');
    assert.deepEqual(entry.newRows.slice(0,-1),entry.oldRows);checks++;
    check(entry.newRows.at(-1).label==='Глибина топки','never call a firebox depth the body depth');
  }
}
check(signed===401,'all 401 signed source records are covered');
console.log(JSON.stringify({status:'PASS',checks,products:plan.products.length,signedSources:signed,hostedConnections:0,filesWritten:0}));
