// Rebuilds Ukrainian Tweetop press-system batch exclusively from cached manufacturer data.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const src=JSON.parse(await fs.readFile('imports/tweetop-source.json','utf8'));
const pdf=JSON.parse(await fs.readFile('imports/tweetop-pdf-source.json','utf8'));
const media=JSON.parse(await fs.readFile('imports/tweetop-media.json','utf8'));
const tables=JSON.parse(await fs.readFile('imports/tweetop-technical-source.json','utf8'));
const base='https://www.tweetop.pl/produkty/system-tweetop/';
const URLS={al:base+'rury-tweetop-pert/alpert/',evoh:base+'rury-tweetop-pert/pert-ii-evoh-pert-ii/',ins:base+'rury-tweetop-pert/pert-ii-al-pert-ii-w-izolacji/',press:base+'ksztaltki-systemu-tweetop/zaprasowywane-tweetop-pert/',connector:base+'ksztaltki-systemu-tweetop/tweetop-connector/',mount:base+'akcesoria-montazowe/'};
const scope=r=>/^[ABCTIRN]|^P50|^P60/.test(r.discountGroup);
const isPipe=r=>/^[ABC]/.test(r.discountGroup),isPress=r=>/^T/.test(r.discountGroup),isTool=r=>/^N/.test(r.discountGroup),isConnector=r=>/^R/.test(r.discountGroup);
const products=[],excluded=[],outside=[],bindings=[];
const doc=(pattern,title,type)=>{const e=Object.entries(media.documents).find(([u])=>pattern.test(u));assert(e,'Missing PDF '+pattern);return {title,type,url:e[1].path};};
const catdoc=doc(/Katalog_v3/,'Каталог Tweetop, версія 3.98','catalog');
const install=doc(/Poradnik_Instalatora/,'Посібник монтажника систем Tweetop','manual');
const design=doc(/Poradnik_Projektanta/,'Посібник проєктувальника систем Tweetop','manual');
const img=(...ids)=>ids.flat().map(id=>{assert(media.images[id],'No image '+id);return media.images[id].path});
const ownLines=(r)=>pdf.flatMap(p=>p.lines.filter(l=>l.text.trim().replace(/\*$/,'')===r.sku&&l.bbox[0]>275).map(l=>({page:p.page,line:l,raw:p.lines.filter(x=>Math.abs(x.bbox[1]-l.bbox[1])<9).map(x=>x.text).join(' | ')})));
function photoIds(r){
 const s=r.sku,n=r.name||'',pos=ownLines(r).filter(x=>[8,9,10,11,12,13,14,15,16,17,18,19,20,42,43,44,46,47,49,50,51,52,53,54].includes(x.page));
 if(!pos.length)return [];
 if(/^A/.test(r.discountGroup))return [/R$/.test(s)?'evohRedCoil':78,'evohConstruction'];
 if(/^B/.test(r.discountGroup))return /\/003$/.test(s)?[]:[/\/004$/.test(s)?95:'alWhiteCoil','alConstruction'];
 if(/^C/.test(r.discountGroup))return [/R$/.test(s)?'insRed':'insBlue','insConstruction'];
 if(isPress(r)){
  const family=s.slice(0,6), map={'060110':124,'060111':145,'060112':158,'060113':181,'060114':179,'060120':202,'060121':204,'060122':225,'060123':227,'060130':271,'060131':284,'060132':313,'060133':315,'060118':317,'060117':346};
  if(map[family])return family==='060120'?['pressElbow','pressConstruction']:[map[family]];
  if(family==='060124')return [s==='06012404'?269:267];
  if(s==='06015103')return [350];if(s==='06015403')return [352];
  // These illustrations are explicitly captioned with two individual SKU identifiers.
  if(s==='06049224')return [389];if(s==='06049229')return [387];
  return [];
 }
 if(isConnector(r))return [/nikiel/.test(n)?'connectorNickel':'connectorBrass'];
 if(/^I/.test(r.discountGroup)){
  if(s==='06049201')return [1339,1343];if(s==='06049292')return [1335];if(s==='06049205')return [1347];
  if(s==='06049207')return [1351];if(s==='06049209')return [1353];if(s==='06049240')return [1355];
  if(/^Hak/.test(n))return [/podwójny/.test(n)?1250:1246];
  if(/^Uchwyt podwójny/.test(n))return [1258,1254];if(/^Uchwyt pojedynczy/.test(n))return [1262,1266];
  return [];
 }
 if(/^P/.test(r.discountGroup)){
  if(/^060371/.test(s))return [1023,1027];if(/^0604921/.test(s))return [1270];
  if(s==='06037201')return [1066];if(s==='06037204')return [1070];if(s==='06037301')return [1062];if(s==='06037402')return [1074];if(/^060375/.test(s))return [1159];
  return ({'06037702':[1135],'06037704':[1147],'06037708':[1151],'06037710':[1155]})[s]||[];
 }
 if(isTool(r)){
  if(s==='06059301')return [1405];if(s==='06059303')return [1401];if(/^060593/.test(s))return [1409];
  if(s==='06959427')return [1436]; // ACO103 jaws are not pictured separately: never substitute a standard jaw.
  if(/^069594/.test(s))return [];
  if(s==='06959521')return [1432];if(/^0695952/.test(s))return [1438];if(s==='06959531')return [1486];if(/^0695953/.test(s))return [1504];
  const special={'06059601':1498,'06059603':1490,'06059605':1502,'06059607':1494,'06059704':1558,'06059707':1558,'06059720':1566,'06059722':1564,'06059801':1593,'06059901':1632,'06059902':1624,'06059904':1628};
  if(special[s])return [special[s]];
  if(/^060597(28|30|32)$/.test(s))return [1562];if(/^060597/.test(s))return [1554];
  if(/^060598/.test(s))return [1589];
 }
 return [];
}
const normalize=s=>s.replace(/(\d),(\d)/g,'$1.$2').replace(/\s*[x×]\s*/g,'×').replace(/11\/4/g,'1 1/4').replace(/11\/2/g,'1 1/2').replace(/21\/2/g,'2 1/2');
function naming(r){
 const n=r.name||'',s=r.sku;let type='',detail='';
 if(isPipe(r)){
  type=/^A/.test(r.discountGroup)?'Труба з кисневим бар’єром':'Багатошарова труба';
  const dim=n.match(/\d+(?:\.\d+)?x\d+(?:\.\d+)?/)[0],len=Number(n.match(/(\d+)mb$/)[1]);
  detail=`${normalize(dim)} мм, ${len} м`;
  if(/^A/.test(r.discountGroup))detail+=/czerwona/.test(n)?', червона':', біла';
  if(/^C/.test(r.discountGroup))detail+=/czerwonej/.test(n)?', червона ізоляція 9 мм':', синя ізоляція 9 мм';
 }else{
 const rules=[
  [/^Złączka prosta zaprasowywana /,'Муфта пресова'],[/^Złączka redukcyjna zaprasowywana /,'Муфта пресова перехідна'],[/^Złączka GZ zaprasowywana /,'Перехідник пресовий із зовнішньою різьбою'],[/^Złączka GW zaprasowywana /,'Перехідник пресовий із внутрішньою різьбою'],[/^Złączka półśrubunek GW zaprasowywany /,'Напівзгін пресовий із внутрішньою різьбою'],[/^Złączka śrubunek zaprasowywany /,'Згін пресовий рознімний'],
  [/^Kolano 90° zaprasowywane /,'Коліно пресове 90°'],[/^Kolano GZ zaprasowywane /,'Коліно пресове із зовнішньою різьбою'],[/^Kolano GW zaprasowywane /,'Коліно пресове із внутрішньою різьбою'],[/^Kolano 90° redukcyjne zaprasowywane /,'Коліно пресове перехідне 90°'],[/^Kolano ustalone cyrkulacyjne zaprasowywane /,'Водорозетка пресова циркуляційна'],[/^Kolano ustalone zaprasowywane /,'Водорозетка пресова'],
  [/^Trójnik prosty zaprasowywany /,'Трійник пресовий'],[/^Trójnik redukcyjny zaprasowywany /,'Трійник пресовий перехідний'],[/^Trójnik GW zaprasowywany /,'Трійник пресовий із внутрішньою різьбою'],[/^Trójnik GZ zaprasowywany /,'Трійник пресовий із зовнішньою різьбою'],[/^Zaślepka zaprasowywana /,'Заглушка пресова'],[/^Złączka przejściowa do łączenia z systemem miedzianym zaprasowywana /,'Перехідник пресовий на мідну трубу'],
  [/^Złączka podejściowa do grzejnika z rurką niklowaną typ kolano /,'Радіаторне прес-підключення кутове'],[/^Złączka podejściowa do grzejnika z rurką niklowaną typ trójnik /,'Радіаторне прес-підключення трійникове'],[/^Złączka podejściowa do grzejnika z rurką niklowaną typ pętla /,'Радіаторне прес-підключення з петлею'],
  [/^Korek do prób szczelności /,'Заглушка для випробування герметичності'],[/^Rozetka uniwersalna podwójna plastikowa do rur /,'Розетка для труб подвійна пластикова'],[/^Rozetka uniwersalna pojedyncza plastikowa do rur /,'Розетка для труб одинарна пластикова'],[/^Hak do rur pojedynczy /,'Гак для труб одинарний'],[/^Hak do rur podwójny /,'Гак для труб подвійний'],[/^Uchwyt pojedynczy ze śrubą i kołkiem /,'Кріплення труби одинарне з гвинтом і дюбелем'],[/^Uchwyt podwójny ze śrubą i kołkiem /,'Кріплення труби подвійне з гвинтом і дюбелем'],
  [/^Półśrubunek zaciskowy do rozdzielacza i zaworu zespolonego grzejnikowego /,'Євроконус компресійний'],[/^Łuk prowadzący do rur EVOH-PERT /,'Напрямна дуга для труби PE-RT/EVOH'],
  [/^Pierścień do kształtek zaprasowywanych /,'Кільце для прес-фітинга'],[/^Uszczelka oring /,'Ущільнювальне кільце'],[/^Szczęka do zaciskarki akumulatorowej Novopress ACO103 U /,'Прес-кліщі профілю U для Novopress ACO103'],
  [/^Folia TT Floor szerokość /,'Фольгована плівка для теплої підлоги TT Floor'],[/^Taśma brzegowa z zakładką nacięciami wymiar /,'Демпферна стрічка з фартухом і надрізами'],[/^Profil dylatacyjny z pianką długość /,'Деформаційний профіль із піною'],
  [/^Listwa montażowa do ogrzewania podłogowego z taśmą samoprzylepną /,'Планка для труб теплої підлоги самоклейна'],[/^Listwa montażowa do ogrzewania podłogowego /,'Планка для труб теплої підлоги'],
  [/^Szczęka zaciskowa do zaciskarki elektrycznej i akumulatorowej Rems U /,'Прес-кліщі профілю U для REMS'],[/^Szczęka zaciskowa do zaciskarki elektrycznej i akumulatorowej U /,'Прес-кліщі профілю U'],
  [/^Zaciskarka elektryczna Novopress EFP203 zakres /,'Прес-інструмент електричний Novopress EFP203'],[/^Zaciskarka akumulatorowa Rems Aku Press zakres /,'Прес-інструмент акумуляторний REMS Aku Press'],[/^Zaciskarka akumulatorowa Novopress ACO103 komplet ze szczękami U /,'Прес-інструмент акумуляторний Novopress ACO103 з кліщами U'],
  [/^Zaciskarka ręczna typ DM1620B komplet z kamieniami U /,'Прес-інструмент ручний DM1620B зі вставками U'],[/^Zaciskarka ręczna typ DM1632B komplet z kamieni U /,'Прес-інструмент ручний DM1632B зі вставками U'],[/^Kamienie do zaciskarki typ DM1620B U /,'Вставки профілю U для DM1620B'],[/^Kamienie do zaciskarki typ DM1632B U /,'Вставки профілю U для DM1632B'],
  [/^Nożyce zapadkowe /,'Ножиці для труб із храповим механізмом'],[/^Obcinak krążkowy /,'Труборіз роликовий'],[/^Nożyce do rur /,'Ножиці для труб'],[/^Ostrze do nożyc /,'Лезо ножиць для труб'],[/^Kalibrator typ Kalistar /,'Калібратор Kalistar'],[/^Kalibrator pod wiertarkę z prowadzeniem /,'Калібратор для дриля з напрямною'],[/^Uchwyt ręczny do kalibratora pod wiertarkę /,'Руків’я калібратора для дриля'],[/^Zestaw kalibratorów pod wiertarkę z uchwytem w walizce /,'Набір калібраторів для дриля з руків’ям у валізі'],[/^Kalibrator /,'Калібратор-розгортка'],[/^Giętarka /,'Трубогиб'],[/^Sprężyna wewnętrzna /,'Пружина для згинання труб внутрішня'],[/^Sprężyna zewnętrzna /,'Пружина для згинання труб зовнішня'],[/^Taker\s*$/,'Такер для кріплення труб'],[/^Rozwijak do rur typ poziomy$/,'Розмотувач труб горизонтальний'],[/^Rozwijak do rur typ pionowy$/,'Розмотувач труб вертикальний']
 ];
 const hit=rules.find(([re])=>re.test(n));if(hit){type=hit[1];detail=n.replace(hit[0],'').trim();}
 if(/^Listwa bateryjna/.test(n)){
  type=/łamana/.test(n)?'Монтажна планка змішувача кутова':'Монтажна планка змішувача пряма';
  if(isPress(r))type+=' з прес-водорозетками';
  detail=n.replace(/^Listwa bateryjna (?:prosta|łamana) /,'').replace(/z kolanem ustalonym|z kolanami ustalonymi/g,'');
 }
 if(/^060371/.test(s)){type='Кліпса для труб теплої підлоги';detail=({'06037101':'A=45 мм, B=25 мм, Ø18 мм','06037102':'A=50 мм, B=30 мм, Ø20 мм','06037103':'A=59 мм, B=38 мм, Ø18 мм','06037105':'для такера, A=41 мм, B=22 мм, Ø20 мм','06037106':'для такера, A=50 мм, B=30 мм, Ø20 мм','06037107':'для такера, A=60 мм, B=38 мм, Ø20 мм'})[s];}
 if(s==='06037204'){type='Профільована плита для теплої підлоги';detail='N-PS, 1450×850×20 мм';}
 if(/^060377/.test(s)){type='Ремонтна плита теплої підлоги';detail=/warstwą aluminiową/.test(n)?'алюмінієва, ':'';detail+=/skrajna/.test(n)?'крайова':'внутрішня';detail+=', 1000×500×25 мм';}
 if(!type)throw Error('Untranslated product '+s+' '+n);
 detail=normalize(detail).replace(/mosiądz\s*-\s*nikiel/g,'нікельована латунь').replace(/mosiądz/g,'латунь').replace(/rozstaw/g,'міжосьова відстань').replace(/lub/g,'або').replace(/mm/g,' мм').replace(/mb/g,' м').replace(/\(1 sztuka = 2 м\)/,'').replace(/Cu/g,'Cu').replace(/\s+/g,' ').trim();
 if(detail&&!/[а-яієїґ]/i.test(detail)&&/\d/.test(detail)&&!/[мm\"]/.test(detail))detail+=' мм';
 }
 const title=`${type} Tweetop ${r.sku}${detail?', '+detail:''}`;
 return {type,detail,title};
}
const rowTranslations={
 'Średnica wewnętrzna Dw [mm]':['Внутрішній діаметр','мм'],
 'Masa jednostkowa rury w odcinkach / w zwoju [g/m]':['Маса погонного метра труби','г/м'],
 'Masa jednostkowa rury w zwoju [g/m]':['Маса погонного метра труби','г/м'],
 'Masa jednostkowa w odcinkach / w zwoju z wodą o temperaturze 10°C [g/m]':['Маса погонного метра з водою за 10 °C','г/м'],
 'Masa jednostkowa w zwoju z wodą o temperaturze 10°C [g/m]':['Маса погонного метра з водою за 10 °C','г/м'],
 'Pojemność jednostkowa rury [dm³/m]':['Об’єм води на метр труби','л/м'],
 'Minimalny promień gięcia ręcznego [mm]':['Мінімальний радіус згинання вручну','мм'],
 'Minimalny promień gięcia przy użyciu sprężyny [mm]':['Мінімальний радіус згинання з пружиною','мм'],
 'Minimalny promień gięcia przy użyciu giętarki ręcznej [mm]':['Мінімальний радіус згинання ручним трубогибом','мм'],
 'Minimalny promień gięcia przy użyciu giętarki maszynowej [mm]':['Мінімальний радіус згинання машинним трубогибом','мм'],
 'Maksymalna odległość między podporami [m]':['Максимальна відстань між опорами','м'],
 'Chropowatość bezwzględna [mm]':['Абсолютна шорсткість','мм'],
 'Przewodność cieplna [W/mK]':['Теплопровідність','Вт/(м·К)'],
 'Przewodność cieplna [W/mk]':['Теплопровідність','Вт/(м·К)'],
 'Współczynnik rozszerzalności liniowej [mm/mK]':['Коефіцієнт лінійного розширення','мм/(м·К)'],
 'Moduł sprężystości [MPa]':['Модуль пружності','МПа'],
 'Gęstość [g/cm3]':['Густина','г/см³'],
 'Maksymalna wytrzymałość na rozciąganie [MPa]':['Максимальна міцність на розтяг','МПа'],
 'Wydłużenie całkowite [%]':['Відносне подовження','%'],
 'Odkształcenie przy rozciąganiu [MPa]':['Напруження за деформації розтягу','МПа'],
 'Temperatura mięknięcia wg Vicat’a [°C]':['Температура розм’якшення за Віка','°C'],
 'Szczelność tlenowa [mg/(m2d)]':['Киснепроникність','мг/(м²·добу)'],
 'Temperatura otoczenia dla pracy instalacji [°C]':['Температура навколишнього середовища','°C']
};
function pipeFacts(r,add,issues){
 const evoh=/^A/.test(r.discountGroup), ins=/^C/.test(r.discountGroup),n=r.name;
 const [,od,thick]=n.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/),d=Number(od),wall=Number(thick),length=Number(n.match(/(\d+)mb$/)[1]);
 const material=evoh?'PE-RT II/EVOH/PE-RT II':'PE-RT II/AL/PE-RT II';
 add('Зовнішній діаметр',od,'мм');add('Товщина стінки',thick,'мм');add('Довжина труби',String(length),'м');add('Матеріал',material);add('Форма постачання',/\/00[34]$/.test(r.sku)?'Відрізок':'Бухта');
 if(evoh)add('Колір',/czerwona/.test(n)?'Червоний':'Білий');
 const sourceTable=tables[evoh?URLS.evoh:URLS.al],t=sourceTable[0];let col=t[0].findIndex(x=>Number(x.split('x')[0])===d);
 assert(col>0,'No technical column '+r.sku);
 for(const row of t.slice(1)){
  if(!rowTranslations[row[0]])continue;let val=row[col];if(!val||val==='-')continue;
  if(val.includes(' / ')){val=val.split(' / ')[/\/00[34]$/.test(r.sku)?0:1];if(val==='-')continue;}
  const [label,unit]=rowTranslations[row[0]];add(label,normalize(val),unit);
 }
 if(evoh){
  for(const row of sourceTable[1].slice(1))if(rowTranslations[row[0]]){const [label,unit]=rowTranslations[row[0]];add(label,row[1].replace(/ do /,'…'),unit);}
  issues.push({type:'source_disagreement',parameter:'Абсолютна шорсткість',action:'omitted',evidence:'Website: 0.0004 m; PDF datasheet: 0.007 m. Neither ambiguous value is published.'});
  const pressures=({10:[8,8,6],12:[8,8,6],14:[6,8,6],16:[6,8,6],17:[6,6,6],18:[4,6,4],20:[4,6,4],25:[6,6,4]})[d];
  add('Режим експлуатації, клас 2',`70 °C; ${pressures[0]} бар`);add('Режим експлуатації, клас 4',`20/40/60 °C; ${pressures[1]} бар`);add('Режим експлуатації, клас 5',`20/60/80 °C; ${pressures[2]} бар`);
 }else{
  add('Робочий тиск',ins?'Водопостачання — 10; опалення — 6':'10','бар');
  if(!ins){add('Температура розрахункового режиму, тепла підлога','20/40/60','°C');add('Температура розрахункового режиму, водопостачання','70','°C');add('Температура розрахункового режиму, радіатори','20/40/80','°C');}
  if(ins){add('Товщина теплоізоляції','9','мм');add('Матеріал теплоізоляції','Спінений поліетилен (PE)');add('Колір теплоізоляції',/czerwonej/.test(n)?'Червоний':'Синій');add('Теплопровідність ізоляції за 40 °C','0.039','Вт/(м·К)');add('Товщина алюмінієвого шару',({16:'0.2',20:'0.23',25:'0.23',32:'0.3'})[d],'мм');add('Температура гарячого водопостачання','65','°C');add('Періодичне нагрівання проти Legionella','70–80','°C');add('Періодична температура теплоносія','90 °C, сумарно не довше 1 року');if(d===20)issues.push({type:'source_disagreement',parameter:'Внутрішній діаметр ізольованої труби20×2',evidence:'Insulated datasheet has26mm for20×2, contradicting geometry and official AL pipe table16mm.',action:'official AL pipe table16mm retained; source typo not copied'});}
 }
 return {pipeDiameterMm:d,pipeWallThicknessMm:wall,pipeLengthMm:length*1000,material,productType:evoh?'Труба з кисневим бар’єром':'Багатошарова труба',...(!evoh&&!ins?{pressureBar:10}:{})};
}
function documents(r,od){
 const docs=[catdoc];
 if(isPipe(r)){
  const evoh=/^A/.test(r.discountGroup),ins=/^C/.test(r.discountGroup);
  docs.push(evoh?doc(/Karta-katalogowa-rury-typu-PERT-II-EVOH/,'Технічний паспорт труб PE-RT II/EVOH/PE-RT II','datasheet'):ins?doc(/KARTAK1-2/,'Технічний паспорт труб PE-RT II/AL/PE-RT II в ізоляції','datasheet'):doc(/Karta-katalogowa-rury-typu-PERT-II-AL/,'Технічний паспорт труб PE-RT II/AL/PE-RT II','datasheet'));
  if(evoh){docs.push(doc(/Atest-higieniczny-dla-rur/,'Гігієнічний сертифікат труб PE-RT II/EVOH/PE-RT II','certificate'));if([12,14,17,18].includes(od))docs.push(doc(/KDWU_R-01-21_na_Rury/,'Декларація характеристик труб EVOH, Ø12, 14, 17, 18 мм','certificate'));if([16,20,25].includes(od))docs.push(doc(/KDWU-nr-R-02-26/,'Декларація характеристик труб EVOH, Ø16, 20, 25 мм','certificate'));}
  else{docs.push(doc(/Atest_higieniczny_RURY_ALU/,'Гігієнічний сертифікат труб PE-RT II/AL/PE-RT II','certificate'));if(od!==12)docs.push(doc(/KDWU_R-01-24/,'Декларація характеристик труб PE-RT II/AL/PE-RT II','certificate'));}
  docs.push(install,design);
 }else if(isPress(r)&&!r.sku.startsWith('060492')){
  docs.push(doc(/ATESTH1/,'Гігієнічний сертифікат пресових і компресійних фітингів для питної води','certificate'),doc(/ATESTH4/,'Гігієнічний сертифікат фітингів для води систем опалення','certificate'));
  const ds=(r.name.match(/\d+(?:x\d+)*(?:x\d+\/\d+)?/)||[])[0];
  if(od>=16&&od<=32)docs.push(doc(/KDWU_Z-01-24/,'Декларація характеристик пресових фітингів Ø16–32 мм','certificate'));
  docs.push(install,design);
 }else if(isConnector(r))docs.push(doc(/ATESTH1/,'Гігієнічний сертифікат пресових і компресійних фітингів для питної води','certificate'),doc(/ATESTH4/,'Гігієнічний сертифікат фітингів для води систем опалення','certificate'),install,design);
 else if(!isTool(r))docs.push(install);
 else docs.push(install);
 return docs;
}
function sectionsFor(r,title,detail,chars){
 let intro='',sections=[];
 if(isPipe(r)){
  const evoh=/^A/.test(r.discountGroup),ins=/^C/.test(r.discountGroup);
  intro=evoh?'використовується у водяних системах опалення та водопостачання. П’ятишарова конструкція поєднує внутрішній і зовнішній шари термостійкого поліетилену PE-RT II з кисневим бар’єром EVOH та двома адгезійними шарами.':'використовується для внутрішніх водопровідних і опалювальних мереж. Алюмінієвий шар зварений ультразвуком із поздовжнім напуском; з обох боків до нього через адгезійні шари приєднаний термостійкий поліетилен PE-RT II.';
  sections.push({title:'Застосування',paragraphs:['Труба призначена для водяного радіаторного та підлогового опалення, холодного й гарячого водопостачання та систем охолодженої води. Температура і тиск мають відповідати класу експлуатації та технічним даним виробника.']});
  sections.push({title:'Конструкція та властивості',paragraphs:[evoh?'Кисневий бар’єр EVOH обмежує проникнення кисню до теплоносія та захищає металеві компоненти системи від корозії. Матеріал легкий, гнучкий і стійкий до корозії; після згинання труба прагне повернутися до початкової форми.':'Алюмінієвий шар обмежує температурне подовження та дифузію кисню. Труба зберігає надану під час згинання форму, що спрощує прокладання траси. Внутрішній PE-RT II хімічно нейтральний щодо води.',...(ins?['Заводська оболонка зі спіненого поліетилену завтовшки 9 мм зменшує теплові втрати, обмежує конденсацію та захищає поверхню труби під час монтажу. Ізоляцію обраного варіанта постачають разом із трубою.']:[])]});
  sections.push({title:'Монтаж',paragraphs:['Трубу відрізають перпендикулярно до осі, калібрують і знімають фаску відповідним інструментом. Фітинг підбирають за зовнішнім діаметром і товщиною стінки; пресування виконують профілем, зазначеним для конкретного фітинга. Після складання проводять випробування герметичності за інструкцією системи.']});
 }else if(isPress(r)){
  intro='використовується для з’єднання труб у системі Tweetop Press. Геометрія та приєднувальні розміри відповідають окремому артикулу виробника.';
  sections.push({title:'Конструкція',paragraphs:['Пресові фітинги системи виготовляють із латуні CW617N. З’єднання утворюють обтисканням гільзи з нержавіючої сталі; герметичність забезпечують два ущільнювальні кільця. Пластиковий напрямний елемент фіксує положення гільзи та ізолює алюмінієвий шар труби від латунного корпуса.']});
  sections.push({title:'Застосування та монтаж',paragraphs:['З’єднання застосовують у холодному й гарячому водопостачанні, радіаторному та підлоговому опаленні. Виробник допускає прихований монтаж у стяжці або стіні з дотриманням вимог монтажної інструкції. Трубу вставляють до упору, перевіряють її положення через оглядові отвори та обтискають кліщами відповідного профілю і діаметра.']});
 }else if(isConnector(r)){
  intro='використовується для приєднання труби до колектора або комбінованого радіаторного клапана з різьбою 3/4″. Компресійне з’єднання збирають затягуванням накидної гайки.';
  sections.push({title:'Застосування',paragraphs:[r.sku==='06015000'?'Варіант Ø12 мм призначений лише для труб PE-RT/EVOH відповідного типорозміру. Перед монтажем перевіряють сумісність труби та приєднувального вузла.':'Розмір обтискного вузла має відповідати трубі. Компресійне приєднання використовують у доступних для контролю та обслуговування місцях.']});
 }else if(isTool(r)){
  intro='використовується під час монтажу трубних систем Tweetop. Тип виконуваної операції та робочий діапазон визначаються моделлю інструмента.';
  sections.push({title:'Призначення та сумісність',paragraphs:[/Szczęka|Kamienie/.test(r.name)?'Кліщі або вставки добирають до зазначеної моделі прес-інструмента, профілю U та діаметра фітинга. Сумісність із приводом перевіряють перед виконанням з’єднання.':/Kalibrator|Nożyce|Obcinak|Ostrze/.test(r.name)?'Інструмент застосовують на етапі підготовки труби: відрізання або калібрування відповідно до його типу. Робочий діаметр має входити до вказаного виробником діапазону.':/Sprężyna|Giętarka/.test(r.name)?'Пристрій допомагає сформувати вигин труби відповідного діаметра. Мінімальний радіус згинання визначають за технічними даними конкретної труби.':/Zaciskarka/.test(r.name)?'Прес-інструмент застосовують разом із кліщами або вставками зазначеного профілю. Перед пресуванням перевіряють підготовку труби, положення фітинга та відповідність діаметра інструмента.':'Монтажне оснащення застосовують за призначенням, наведеним у технічних характеристиках. Воно входить до офіційного переліку інструментів систем Tweetop.']});
 }else{
  intro='використовується як монтажний компонент трубної системи Tweetop. Виконання та розміри відповідають окремому артикулу виробника.';
  sections.push({title:'Призначення',paragraphs:[/^P/.test(r.discountGroup)?'Компонент застосовують під час облаштування водяної теплої підлоги або фіксації труб. Його розміри та конструкцію підбирають до способу укладання і діаметра труби.':'Компонент застосовують для кріплення, приєднання або оздоблення трубопроводу відповідно до його типу. Монтаж виконують з урахуванням геометрії траси та приєднувальних розмірів.']});
 }
 const first=`${title} ${intro}`;sections.unshift({title:'Опис',paragraphs:[first]});
 sections.push({title:'Технічні характеристики',paragraphs:chars.map(c=>`${c.label}: ${c.value}${c.unit?' '+c.unit:''}.`)});
 return {sections,description:sections.map((s,i)=>`${i?s.title+'\n':''}${s.paragraphs.join('\n')}`).join('\n\n'),shortDescription:(`${title} ${intro.split('. ')[0]}.`).slice(0,300)};
}
for(const r of src.records){
 if(!scope(r)){outside.push({sku:r.sku,name:r.name,sourceGroup:r.discountGroup,reason:'Окремий напрямок поза прес-системою: Screw/SmartPush, колектори, шафи, насосні вузли, автоматика, вентиляція або теплові насоси.'});continue;}
 const ids=photoIds(r),lines=ownLines(r),sourceUrl=isPipe(r)?(/^A/.test(r.discountGroup)?URLS.evoh:/^C/.test(r.discountGroup)?URLS.ins:URLS.al):isPress(r)?URLS.press:isConnector(r)?URLS.connector:/^P/.test(r.discountGroup)?URLS.mount:src.catalogue;
 if(!ids.length){let reason=/\/003$/.test(r.sku)?'Для штанги завдовжки 3 м немає підтвердженого фото: доступне фото має напис 4m і належить виконанню 4 м. Загальну схему труби не використано як заміну фото.':/^069594/.test(r.sku)?'У каталозі є фото преса Novopress ACO103, але немає окремого зображення його кліщів. Зображення стандартних кліщів іншого типу не підставлено.':/^060491/.test(r.sku)?'У XLSX є артикул, назва та діаметр кільця; окремих фото цих кілець у зібраних офіційних матеріалах немає. Фото готового фітинга не використано замість кільця.':lines.length?'Немає окремого підтвердженого фото цього виконання: фотографії в каталозі підписані іншими артикулами або зображають іншу конструкцію.':'Артикул є в XLSX, але немає його в SKU-таблицях і відповідних фото актуального PDF-каталогу. Зображення іншого виробу не підставлено.';excluded.push({sku:r.sku,name:naming(r).title,originalName:r.name,sourceUrl,workbookRow:r.row,reason,missing:['Підтверджене зображення конкретного виконання'],present:['Офіційний артикул','Назва й розмір у XLSX',...(r.ean?['EAN']:[]),...(lines.length?['Рядок у PDF-каталозі']:[]),...(isPipe(r)?['Технічний паспорт сімейства труб']:[])]});continue;}
 const {title,type,detail}=naming(r),chars=[],issues=[];const add=(label,value,unit)=>{if(value!==''&&value!=null&&!chars.some(c=>c.label===label&&c.value===String(value)))chars.push({label,value:String(value),...(unit?{unit}:{})});};
 add('Тип виробу',type);
 let filters={},od=null;
 if(isPipe(r))filters=pipeFacts(r,add,issues);
 else{
  const dim=r.name.match(/(?:\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?|x\d+\/\d+|x\d+Cu)+|\d+(?:-\d+)+|\d+)(?:\")?/g);
  if(detail)add('Виконання та розміри',detail);
  const m=r.name.match(/(?:zaprasowywan\w*|zaciskowy.*grzejnikowego)\s+(\d+)/);od=m?Number(m[1]):null;
  if(isPress(r)&&!r.sku.startsWith('060492')){
   add('Матеріал корпуса','Латунь CW617N');add('Матеріал прес-гільзи','Нержавіюча сталь');add('Матеріал ущільнень','EPDM');add('Тип з’єднання','Пресове');
   const profile=lines.map(l=>l.raw).join(' ').match(/U\s*\/\s*TH\s*(?:LBP)?|U\s+LBP|\bU\b/);
   if(profile)add('Профіль пресування',profile[0].replace(/\s+/g,' ').trim());
   if(/LBP/.test(lines.map(l=>l.raw).join(' ')))add('Функція контролю непресованого з’єднання','LBP');
   add('Максимальна робоча температура','95','°C');add('Максимальний робочий тиск','10','бар');
   filters={material:'Латунь CW617N',pressureBar:10,...(od?{pipeDiameterMm:od}:{})};
   if(/^Kolano/.test(r.name)){filters.angleDegrees=90;add('Кут','90','°');}
   if(['06015103','06015403'].includes(r.sku)){od=16;filters.pipeDiameterMm=16;add('Матеріал трубки підключення','Нікельована мідь');add('Діаметр трубки підключення','15','мм');add('Довжина трубки підключення','300','мм');}
   if(/GZ/.test(r.name))add('Тип різьби','Зовнішня');if(/GW/.test(r.name))add('Тип різьби','Внутрішня');
  }else if(isConnector(r)){od=Number(r.name.match(/grzejnikowego (\d+)/)[1]);add('Матеріал','Латунь');add('Приєднання','3/4″');add('Покриття',/nikiel/.test(r.name)?'Нікель':'Без нікелювання');add('Діаметр труби',String(od),'мм');if(r.sku==='06015000')add('Сумісність','Лише труби PE-RT/EVOH');filters={material:'Латунь',pipeDiameterMm:od};}
  else if(isTool(r)){filters={productType:'Інструмент для монтажу труб'};if(/ U |каміні/.test(r.name))add('Профіль','U');}
  else if(/^P/.test(r.discountGroup)){
   filters={productType:'Комплектуючі теплої підлоги'};
   if(/^060377/.test(r.sku)){filters.material='Пінополістирол';add('Матеріал','Пінополістирол');add('Діаметри труб','14–16','мм');add('Крок труб','125','мм');if(/warstwą aluminiową/.test(r.name))add('Поверхневий шар','Алюміній');}
   if(r.sku==='06037201'){add('Виконання плівки','Металізований ламінат із розміткою');add('Ширина','1050','мм');}
   if(r.sku==='06037204'){issues.push({type:'source_disagreement',parameter:'Розміри профільованої плити',evidence:'XLSX: EPS DUO 1400×850×20; active manufacturer page/PDF: N-PS 1450×850×20; product uses active page/PDF geometry.',action:'current catalogue/page selected'});add('Товщина пластикового шару','1.1','мм');}
   if(/^060371/.test(r.sku)){const fact=({'06037101':[45,25,18],'06037102':[50,30,20],'06037103':[59,38,18],'06037105':[41,22,20],'06037106':[50,30,20],'06037107':[60,38,20]})[r.sku];add('Розмір A',fact[0],'мм');add('Розмір B',fact[1],'мм');add('Діаметр',fact[2],'мм');}
   if(/^060375/.test(r.sku)){add('Довжина однієї планки','1','м');add('Діаметри труб','14–20','мм');issues.push({type:'source_disagreement',parameter:'Діапазон діаметрів монтажної планки',evidence:'Current PDF catalogue and XLSX: 14–20 mm; website: 14–22 /16–22 mm.',action:'current catalogue and workbook selected'});}
  }else{filters={productType:'Монтажні комплектуючі для труб'};if(/plastikowa/.test(r.name)){filters.material='Пластик';add('Матеріал','Пластик');}}
 }
 const category=isPipe(r)?'water-heating-pipes':isPress(r)||isConnector(r)?'pipe-fittings':isTool(r)?'pipe-installation-tools':/^P/.test(r.discountGroup)?'underfloor-heating':'pipe-installation-components';
 const text=sectionsFor(r,title,detail,chars),docs=documents(r,filters.pipeDiameterMm??od);
 let series=isPipe(r)?(/^A/.test(r.discountGroup)?'PE-RT II/EVOH/PE-RT II':/^C/.test(r.discountGroup)?'PE-RT II/AL/PE-RT II в ізоляції':'PE-RT II/AL/PE-RT II'):isPress(r)?'Tweetop Press':isConnector(r)?'Tweetop Connector':null;
 let seoDescription=`${title}. ${isPipe(r)?'Для водопостачання та опалення':isPress(r)?'З’єднання труб у системі Tweetop Press':'Для монтажу трубної системи'}. Характеристики та документи виробника.`;
 if(seoDescription.length>160)seoDescription=seoDescription.slice(0,157).replace(/[\s,;:.]+$/,'')+'...';
 while(seoDescription.length<120)seoDescription+=' Технічні дані виробника.';
 if(seoDescription.length>160)seoDescription=seoDescription.slice(0,157).replace(/[\s,;:.]+$/,'')+'...';
 const seoTitle=title.length+25<=70?title+' — купити в ТД «Софіївка»':title.length<=70?title:`${type} Tweetop ${r.sku}`.slice(0,70);
 const sourceEvidence={manufacturer:'Tweetop Sp. z o.o.',sourceSite:'https://www.tweetop.pl',collectedAt:'2026-11-25',workbook:{url:src.workbook,row:r.row,index:r.index,original:r},catalogue:{url:src.catalogue,version:'3.98',rows:lines},photos:ids.map(id=>media.images[id]),documentSources:docs.map(d=>({title:d.title,url:Object.entries(media.documents).find(([u,x])=>x.path===d.url)?.[0],local:d.url})),...(isPipe(r)?{technicalTables:tables[/^A/.test(r.discountGroup)?URLS.evoh:URLS.al]}:{}),...(issues.length?{sourceIssues:issues}:{})};
 products.push({sourceId:r.sku,sourceUrl,sourceCategory:r.sourceGroup,sku:r.sku,model:r.sku,series,brand:'tweetop',title,category,price:null,priceCurrency:'PLN',vatIncluded:false,...text,characteristics:chars,filters,images:img(ids),documents:docs,...(r.ean?{ean:r.ean}:{}),seoTitle,seoDescription,sourceEvidence});
 bindings.push({sku:r.sku,images:ids,pages:lines.map(x=>x.page),category});
}
assert.equal(src.records.length,658);assert.equal(src.records.filter(scope).length,388);assert.equal(products.length+excluded.length,388);
assert.equal(new Set(products.map(x=>x.sku)).size,products.length);assert.equal(new Set(products.map(x=>x.title)).size,products.length);
for(const p of products){assert(!/[ąćęłńóśźżыэъё]/i.test([p.title,p.description,p.seoTitle,p.seoDescription,...p.characteristics.flatMap(c=>[c.label,c.value])].join(' ')),p.sku+' untranslated');assert(p.images.length);assert.equal(p.price,null);assert(p.seoTitle.length<=70);assert(p.seoDescription.length>=120&&p.seoDescription.length<=160);}
const batch={supplier:'tweetop',brand:'tweetop',collectedAt:'2026-11-25',sourceSite:'https://www.tweetop.pl',products};
await fs.writeFile('imports/tweetop-2026-11-25.json',JSON.stringify(batch,null,2));
const coverage={collectedAt:'2026-11-25',officialSources:[src.catalogue,src.workbook,'https://www.tweetop.pl/produkty/system-tweetop/'],totalOfficialWorkbook:658,scopeSKU:388,included:products.length,excludedCount:excluded.length,outsideScopeCount:outside.length,byCategory:Object.fromEntries(Object.entries(Object.groupBy(products,p=>p.category)).map(([k,a])=>[k,a.length])),excluded,outsideScope:outside,photoBindings:bindings};
await fs.writeFile('imports/tweetop-coverage.json',JSON.stringify(coverage,null,2));
console.log(JSON.stringify({scope:388,included:products.length,excluded:excluded.length,categories:coverage.byCategory,selectValues:Object.fromEntries(['material','productType','connection','compatibility'].map(k=>[k,[...new Set(products.flatMap(p=>p.filters[k]?[p.filters[k]]:[]))]]))},null,2));
