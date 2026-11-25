"""Extract explicit columns from current Ukrainian manufacturer price tables.

Only tables with a verified header/value column count are accepted. Ambiguous
rows remain in source evidence and the audit, never guessed into attributes.
"""
import collections,json,re,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[2];CACHE=ROOT/'tmp/rehau-source'
docs=json.loads((CACHE/'documents-downloaded.json').read_text(encoding='utf8'))
results={};ambiguous=[]
def split(line):return re.split(r'\s{2,}',line.strip())
def header_fix(line):
    return re.sub(r'(Вага)\s+(О\.П\.)',r'\1  \2',line)
SYMBOLS=re.compile(r'^(?:[a-zA-ZαβλΔ][a-zA-ZαβλΔ\d,./-]{0,12}|DN/OD|DN/ID|DN|SDR|PN|О\.П\.|Ціна)(?:\*\d+)?$')
NAMES={'Опис','Вага','Тип','Висота','Довжина','Довжина поставки','Ширина','Глибина','Обсяг','Діаметр','Товщина','Розміри','Кут','Колір','Найменування','Напруга','Максимальна кількість каналів','Діаметр свердловини Da','Кількість'}
for doc in docs:
    file=CACHE/(doc['id']+'.txt')
    if not file.exists():continue
    for page_num,page in enumerate(file.read_text(encoding='utf8').split('\f'),1):
        header=None;units=None;heading=[]
        for line in page.splitlines():
            if re.search(r'№[-–]?арт\.|№\s*арт\.',line,re.I):
                header=split(header_fix(line));units=None;continue
            if header and not units and re.search(r'\bEUR|грн|\bмм\b|\bшт\b|\bкг\b',line):
                units=split(line)
            m=re.match(r'^\s*(\d{11})\s+',line)
            if not m:continue
            cells=split(line)
            sku=m[1]
            row={'document':doc['id'],'page':page_num,'row':line.strip(),'header':header,'unitRow':units,'fields':[]}
            if header and len(cells)==len(header) and all(SYMBOLS.fullmatch(h)or h in NAMES for h in header[1:]):
                unit_map={len(header)-len(units)+i:u for i,u in enumerate(units or [])} if units else {}
                for col,(label,value) in enumerate(zip(header[1:],cells[1:]),1):
                    if label in ['О.П.','О. П.','Ціна','Вага О.П.']:continue
                    if label=='Опис':label='Виконання'
                    if label in ['VPE','Кількість']:continue
                    unit=unit_map.get(col)
                    if unit and not re.fullmatch(r'мм|м|л/м|г/м|кг/шт|кг/м|г/шт|л|В|м²|м³|бар|шт|°|Вт|кВт',unit):unit=None
                    row['fields'].append({'label':re.sub(r'\*\d+','',label).strip(),'value':value,**({'unit':unit}if unit and label not in ['Виконання','Тип','Колір','Найменування']else{})})
                if header[-1]=='Ціна' and 'EUR' in page:
                    raw=cells[-1].replace(' ','')
                    if re.fullmatch(r'\d{1,3}(?:\.\d{3})+(?:,\d+)?',raw):raw=raw.replace('.','')
                    raw=raw.replace(',','.')
                    if re.fullmatch(r'\d+(?:\.\d+)?',raw):
                        price_units=re.findall(r'EUR/[^\s]+',page)
                        row['sourcePrice']={'amount':float(raw),'currency':'EUR','unit':price_units[-1]if price_units else None,'vatIncluded':False if re.search(r'без ПДВ',page,re.I)else None}
            else:
                row['reason']='ambiguous table column count; original row retained without guessed technical fields'
                ambiguous.append({'sku':sku,'sourceUrl':'https://oxomi.com/portals/api/v1/documents/download?portal=3001044&document='+doc['id'],**row})
            results.setdefault(sku,[]).append(row)
(CACHE/'pdf-table-rows.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
(ROOT/'imports/rehau-pdf-table-omissions.json').write_text(json.dumps(ambiguous,ensure_ascii=False,indent=2),encoding='utf8')
print('PDF SKU rows',len(results),'rows',sum(map(len,results.values())),'parsed',sum(bool(r['fields'])for rows in results.values()for r in rows),'ambiguous',len(ambiguous))
print('Labels',collections.Counter(f['label']for rows in results.values()for r in rows for f in r['fields']))
