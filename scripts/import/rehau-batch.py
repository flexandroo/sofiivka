"""Build a new-products-only REHAU batch from cached official manufacturer data.

Run rehau-collect.py inventory/complete-inventory/docs/download-docs/details/
pdf-inventory/complete-details/global-docs/media first. Translation dictionaries
are reviewed Ukrainian renditions; original exact-SKU evidence is retained.
"""
import collections,hashlib,html,importlib.util,json,re,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[2];CACHE=ROOT/'tmp/rehau-source';OUT=ROOT/'imports'
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
source=module('rehau_source','rehau-collect.py');taxonomy=module('rehau_taxonomy','rehau-map.py');titles=module('rehau_titles','rehau-titles.py')
def read(path,default=None):
    p=ROOT/path
    return json.loads(p.read_text(encoding='utf-8-sig'))if p.exists()else default
ua,de=source.all_records('ua'),source.all_records('de');q=source.product_queries
reference=read('imports/reference-wave2-staged.json');categories={c['id']:c for c in reference['categories']};attributes=reference['attributes']
labels=read('scripts/import/rehau-label-translations.json',{});values=read('scripts/import/rehau-value-translations.json',{})
descriptions=read('scripts/import/rehau-description-translations.json',{})
title_recoveries=read('scripts/import/rehau-title-recoveries.json',{})
ua_completeness=read('tmp/rehau-source/ua-completeness-proof.json')or read('imports/rehau-ua-completeness-qa.json',{})
mepa_skus=set(ua_completeness.get('partition',{}).get('allMepaOutOfScopeSkus',[]))
recovery_images=read('tmp/rehau-source/recovery-media.json',[])
aligned=read('tmp/rehau-source/aligned-texts.json',{'exact':{},'templates':{}})
media={m['key']:m for m in read('tmp/rehau-source/media.json',[])}
pdfrows=read('tmp/rehau-source/pdf-table-rows.json',{})
attachment_pdfs={d['key']:d for d in read('tmp/rehau-source/attachment-pdfs.json',[])}
docs={d['id']:{**d,'path':d.get('localPath')or d.get('path')} for d in read('tmp/rehau-source/documents-downloaded.json',[])+read('tmp/rehau-source/documents-global-downloaded.json',[])+read('tmp/rehau-source/documents-additional.json',[])if not d.get('error')}
SHA_BY_PATH={d['path']:d['sha256']for d in docs.values()}
SHA_BY_PATH.update({d['path']:d['sha256']for d in attachment_pdfs.values()})
SHA_BY_PATH.update({m['documentPath']:m['sha256']for m in media.values()if m.get('documentPath')})
EXCLUSIONS=[];OMISSIONS=[];TEMPLATE_REFS={};TRANSLATION_GAPS=[]

def norm(s):return re.sub(r'\s+',' ',str(s or '')).strip()
def raw_description(p):
    return next((t.get('normalizedText')or html.unescape(re.sub('<[^>]*>','',t.get('optimizedText','')))for t in q(p or {}).get('texts',{}).get('texts',[])if t['type']=='DESCRIPTION_PLAIN'),'').replace('\u00a0',' ')
def de_template(s):return re.sub(r'\d+(?:[.,]\d+)*','{N}',s)
def description_for(sku):
    a,b=raw_description(ua.get(sku)),raw_description(de.get(sku))
    if not a and not b:return '', 'manufacturer provides no prose; Ukrainian summary uses exact-SKU technical features and official variant title'
    if a and re.search('[А-Яа-яІіЇїЄєҐґ]',a):return a,'official UA exact SKU'
    if b in descriptions:return descriptions[b],'reviewed DE exact source description'
    if b in aligned['exact']:
        entry=aligned['exact'][b];TEMPLATE_REFS[sku]=entry['sku'];return entry['ua'],'official identical DE-family text with same-SKU UA alignment'
    key=de_template(b)
    if key in aligned['templates']:
        entry=aligned['templates'][key];numbers=iter(re.findall(r'\d+(?:[.,]\d+)*',b))
        text=re.sub(r'\{N\}',lambda _:next(numbers),entry['ua']);TEMPLATE_REFS[sku]=entry['sku'];return text,'official same-family UA template; only ordered source numeric literals substituted'
    return None,'missing reviewed Ukrainian description'

def clean_sections(text):
    sections=[];current={'title':'Опис','paragraphs':[]};dropped=[];company_footer=False
    for line in text.splitlines():
        line=html.unescape(line).strip().strip('-▪• ').strip()
        if not line:continue
        # GPSR company/address/footer blocks follow the product's safety facts.
        # Keep H/P safety statements; do not publish third-party contacts.
        if re.match(r'^(?:Відповідальна особа (?:в|для) ЄС|Відповідальна особа в Європейському Союзі|Verantwortliche Person für die EU)',line,re.I):company_footer=True
        if company_footer:dropped.append(line);continue
        if re.search(r'BAFA|BEG-Förder|[Ff]örderung|субсид|німецьк.*програм.*фінанс|http[s]?://|www\.|\bдоставк|\bнаявн|Lieferzeit|Liefertermin|verfügbar|skonto',line):dropped.append(line);continue
        if re.search(r'поверненню не підляг|не підляга.*повернен|термін поставки|строк поставки|термін постачання|строк постачання|Rückgabe|Lieferfrist',line,re.I):dropped.append(line);continue
        if re.match(r'^(?:Phone|Telefon|Tel\.?|Телефон|Факс|Fax|E-?mail|mail|Електронна пошта)\s*:',line,re.I)or re.search(r'\b[^\s@]+@[^\s@]+\.[^\s@]+',line):dropped.append(line);continue
        if re.search(r'доступн(?:ий|а|е|і)\s+(?:до|з)\s+.*(?:квартал|\d{4})',line,re.I):dropped.append(line);continue
        cleaned=re.sub(r'(?:[;,]\s*)?цін[аи]\s*[—-]?\s*(?:(?:за|на)\s+)?запит(?:ом|у)?.*$','',line,flags=re.I).rstrip(' ,;')
        if cleaned!=line:dropped.append(line);line=cleaned
        if not line:continue
        if re.fullmatch(r'[^:]{3,85}:',line):
            if current['paragraphs']:sections.append(current)
            current={'title':line[:-1],'paragraphs':[]}
        else:current['paragraphs'].append(re.sub(r'\bÜW\b','накидна гайка',line))
    if current['paragraphs']:sections.append(current)
    return sections,dropped

def decimal(value):
    m=re.fullmatch(r'\s*(-?\d+(?:[.,]\d+)?)\s*(?:мм|mm|бар|bar|м|m|°|В|V)?\s*',str(value))
    return german_number(m[1])if m else None
def german_number(value,thousands=False):
    value=value.strip()
    if thousands and re.fullmatch(r'[1-9]\d{0,2}(?:\.\d{3})+',value):value=value.replace('.','')
    return float(value.replace(',','.'))
def clean_value(value):
    if value=='Ja':return 'Так'
    if value in values:return values[value]
    value=titles.translate(str(value))
    value=value.replace('° C','°C').replace('m³/h','м³/год').replace('m3/h','м³/год').replace('l/h','л/год').replace('l/min','л/хв').replace('kg','кг')
    units={'mm':'мм','cm':'см','dm':'дм','km':'км','m²':'м²','m³':'м³','m2':'м²','m3':'м³','m':'м','g':'г','l':'л','kW':'кВт','W':'Вт','kWh':'кВт·год','V':'В','mA':'мА','A':'А','Hz':'Гц','MHz':'МГц','kHz':'кГц','kPa':'кПа','MPa':'МПа','Pa':'Па','N':'Н','Nm':'Н·м','µm':'мкм','μm':'мкм','dB':'дБ','rpm':'об/хв'}
    value=re.sub(r'(?<![A-Za-zА-Яа-яІіЇїЄє])(?:'+('|'.join(re.escape(k)for k in sorted(units,key=len,reverse=True)))+r')(?![A-Za-zА-Яа-яІіЇїЄє])',lambda m:units[m[0]],value)
    return value

SERIES=re.compile(r'(RAUTITAN(?:\s+(?:stabil|flex|RX\+|PX|LX|SX)(?:\s+stabil)?)?|RAUTHERM(?:\s+(?:NEO-X5(?:\s+K)?|SPEED(?:\s+(?:plus(?:\s+renova)?|silent))?|S|ML|Unit))?|RAUTHERMEX|RAUVIPEX|RAUVITHERM|INSULPEX|INPX|RAUPEX(?:-[A-ZА-Я])?|RAUBASIC|RAUPIANO\s+PLUS|RAUSILENTO|RAUSIKKO|RAINSPOT|RAUVIA|AWASCHACHT(?:\s+nevoPP)?|AWADUKT(?:\s+(?:Thermo|HPP|PP))?|AWADOCK|AWACONNECT\s+Flex\+|RAUGEO|RAUFRIGO|RAUTOOL|SMARTFUSE|FUSAPEX|CLIP-FLEX|NEXUS|NEA\s+SMART\s*2\.0|NEA\s+SMART|NEA|RE\.GUARD(?:\s+2\.0)?)',re.I)
def series_for(text):
    m=SERIES.search(text)
    return norm(m[0])if m else None

def build_characteristics(sku,base,sections,class_name,category):
    rows=[];rawfeatures=q(de.get(sku,{})).get('features',{}).get('features',[])
    byname={f['name']:f['value']for f in rawfeatures}
    for f in rawfeatures:
        if f['name']not in labels:
            TRANSLATION_GAPS.append({'sku':sku,'kind':'feature label','de':f['name']});continue
        rows.append({'label':labels[f['name']],'value':clean_value(f['value'])})
    for section in sections:
        if section['title'].lower()in ['матеріал','колір','сертифікація','допуск','гарантія','комплектація']:
            rows.append({'label':section['title'],'value':'; '.join(section['paragraphs'])})
    table_refs=[]
    for row in pdfrows.get(sku,[]):
        table_refs.append({k:v for k,v in row.items()if k!='fields'})
        for field in row.get('fields',[]):
            label=field['label'];value=field['value'];unit=field.get('unit')
            if re.fullmatch(r'[A-Za-zαβλΔ][A-Za-zαβλΔ\d,./-]{0,12}',label):label='Розмір '+label
            if label=='Вага' and not unit:continue
            # The source table's literal d/s are only semantically normalized for pipes.
            if category.endswith('-pipes')or class_name in ['Kunststoffrohr glatt','Mehrschichtrohr glatt','Vorisoliertes Kunststoffrohr','Kunststoffrohr gerippt']:
                if field['label']=='d'and unit=='мм':label='Зовнішній діаметр'
                if field['label']=='s'and unit=='мм':label='Товщина стінки'
            rows.append({'label':label,'value':value,**({'unit':unit}if unit else{})})
    # Keep source dimensions in their actual units; never mistake DN for OD.
    filters={}
    numeric_sources={}
    candidates={'pipeDiameterMm':['Rohraußendurchmesser','Rohraußendurchmesser Anschluss 1'],'angleDegrees':['Winkel des Bogens','Winkel'],'pressureBar':['Max. Arbeitsdruck bei 20 °C'],'outlets':['Anzahl der Heizkreise','Anzahl Heizkreise','Anzahl der Abgänge','Anzahl Ausgänge'],'zones':['Anzahl der Zonen','Anzahl Zonen']}
    if taxonomy.is_pipe_product(base['shortText'],class_name):candidates['pipeWallThicknessMm']=['Wandstärke','Wanddicke']
    if category=='distribution-manifolds':candidates['outlets']+=['Anzahl der Gruppen sekundär','Anzahl der Abzweige']
    for key,names in candidates.items():
        for name in names:
            if name in byname:
                value=decimal(byname[name])
                if key=='pipeDiameterMm'and re.fullmatch(r'\s*[1-9]\d{0,2}(?:\.\d{3})+\s*mm\s*',byname[name]):value=german_number(byname[name].strip()[:-2].strip(),thousands=True)
                if value is not None and key in ['pipeDiameterMm','pipeWallThicknessMm']:
                    unit_match=re.search(r'\s(mm|cm|m)\s*$',byname[name])
                    if unit_match:value*={'mm':1,'cm':10,'m':1000}[unit_match[1]]
                if value is not None and value>0:filters[key]=int(value)if value.is_integer()else value;numeric_sources[key]={'source':'ETIM exact SKU','field':name,'raw':byname[name]};break
    is_pipe=taxonomy.is_pipe_product(base['shortText'],class_name)
    if is_pipe:
        raw_length=byname.get('Länge')
        if raw_length:
            lm=re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|km)\s*',raw_length)
            if lm:
                filters['pipeLengthMm']=german_number(lm[1],thousands=lm[2]=='mm')*{'mm':1,'cm':10,'m':1000,'km':1000000}[lm[2]]
                numeric_sources['pipeLengthMm']={'source':'ETIM exact pipe SKU length with explicit conversion to millimetres','raw':raw_length}
        text=base['shortText']
        dims=re.search(r'(?<![\d,])(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?!\d)',text)
        if dims:
            # An explicit pipe diameter x wall variant is more exact than rounded ETIM OD.
            od,wall=[float(x.replace(',','.'))for x in dims.groups()]
            if 3<=od<=2000 and 0<wall<od/2:
                filters['pipeDiameterMm']=od;filters['pipeWallThicknessMm']=wall
                numeric_sources['pipeDiameterMm']={'source':'official exact pipe variant diameter × wall','raw':dims[0]};numeric_sources['pipeWallThicknessMm']=numeric_sources['pipeDiameterMm']
        length=re.search(r'(?:Bund|Stange[n]?|бухт(?:а|ах)|відріз(?:ок|ках)|довжина|\bL\s*=?)\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|м|m)\b',text,re.I)
        if length:
            value=float(length[1].replace(',','.'))*(1000 if length[2]in ['м','m']else 1)
            filters['pipeLengthMm']=value;numeric_sources['pipeLengthMm']={'source':'official supply length in exact pipe variant','raw':length[0]}
    angle=re.search(r'(\d+(?:[.,]\d+)?)\s*(?:°|Grad\b)',base['shortText'],re.I)
    if angle:
        angle_value=float(angle[1].replace(',','.'))
        if 0<angle_value<=180:
            prior=filters.get('angleDegrees');filters['angleDegrees']=angle_value
            numeric_sources['angleDegrees']={'source':'exact manufacturer variant angle','raw':angle[0],**({'sourceConflict':{'roundedEtim':prior,'exactVariant':angle_value}}if prior is not None and prior!=angle_value else{})}
    if category=='distribution-manifolds':
        circuit_match=re.search(r'(\d+)\s*(?:Kreise|Heizkreise|контур(?:и|ів)?|виход(?:и|ів)?)\b',base['shortText'],re.I)
        if sku in title_recoveries:
            n=title_recoveries[sku]['heatingCircuits'];filters['outlets']=n;numeric_sources['outlets']={'source':'exact-SKU manufacturer PDF matrix row','raw':title_recoveries[sku]['proof']}
        elif circuit_match:
            filters['outlets']=int(circuit_match[1]);numeric_sources['outlets']={'source':'explicit heating circuits in official exact-SKU title','raw':circuit_match[0]}
    for key,names in {'weightKg':['Gewicht','Nettogewicht','Trockengewicht'],'flowM3h':['Durchflussleistung','Volumenstrom','Kontinuierlicher Volumenstrom (Q3)']}.items():
        for name in names:
            if name not in byname:continue
            raw=byname[name]
            m=re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*(kg|g|m³/h|m3/h|l/h|l/min|l/s)\s*',raw)
            if m:
                if m[2]and key=='weightKg':continue
                unit=m[3];n=german_number(m[2]or m[1],thousands=unit=='g')
                if key=='weightKg'and unit in ['kg','g']:n*=1 if unit=='kg'else 0.001
                elif key=='flowM3h'and unit in ['m³/h','m3/h','l/h','l/min','l/s']:n*={'m³/h':1,'m3/h':1,'l/h':0.001,'l/min':0.06,'l/s':3.6}[unit]
                else:continue
                filters[key]=n;numeric_sources[key]={'source':'ETIM exact SKU with explicit physical unit conversion'+(' (upper bound of adjustable flow range)'if m[2]else''),'field':name,'raw':raw};break
    # Explicit body material takes precedence; mixed connection materials are not flattened.
    material=byname.get('Werkstoffgüte')
    if material not in ['PE-Xa','PE-Xc','PE-Xe','PE-100','PP-MD','PVDF','PPSU']:material=byname.get('Werkstoff')or byname.get('Werkstoff des Gehäuses')
    if not material:
        mats={byname[n]for n in ['Werkstoff des Anschlusses 1','Werkstoff des Anschlusses 2','Werkstoff des Anschlusses 3']if n in byname}
        if len(mats)==1:material=next(iter(mats))
    material=clean_value(material)if material else None
    if material=='Етилен-пропілен-дієновий каучук (EPDM)':material='EPDM'
    if not material or material=='Інше':
        material_text='; '.join(paragraph for section in sections if section['title'].lower()=='матеріал'for paragraph in section['paragraphs'])
        precise=[('PE-Xc/Al/PE-RT',r'PE-Xc\s*/\s*Al\s*/\s*PE-RT'),('PE-Xa/Al/PE',r'PE-Xa\s*/\s*Al\s*/\s*(?:PE|ПЕ)'),('PE-Xa',r'\bPE-Xa\b'),('PE-Xc',r'\bPE-Xc\b'),('PE-Xe',r'\bPE-Xe\b'),('PE-100',r'\bPE-?100\b'),('PP-MD',r'\bPP-MD\b'),('Поліфенілсульфон (PPSU)',r'\bPPSU\b'),('Полівініліденфторид (PVDF)',r'\bPVDF\b')]
        candidates_material=[name for name,pattern in precise if re.search(pattern,material_text,re.I)]
        if candidates_material and candidates_material[0]in ['PE-Xc/Al/PE-RT','PE-Xa/Al/PE']:candidates_material=candidates_material[:1]
        generic=[('Нержавіюча сталь',r'нержавіюч|неіржавн'),('Сталь',r'(?<![А-Яа-яІі])сталь\b|сталев'),('Латунь',r'латун'),('Поліетилен (PE)',r'поліетилен'),('Поліпропілен (PP)',r'поліпропілен'),('EPDM',r'\bEPDM\b'),('Нітрильний каучук NBR',r'\bNBR\b'),('SBR',r'\bSBR\b'),('Поліамід (PA)',r'поліамід'),('Бетон',r'бетон'),('Полівінілхлорид (PVC)',r'полівінілхлорид|\bPVC\b')]
        candidates_material += [name for name,pattern in generic if re.search(pattern,material_text,re.I)]
        if any(x.startswith('PE-')for x in candidates_material):candidates_material=[x for x in candidates_material if x!='Поліетилен (PE)']
        if 'PP-MD'in candidates_material:candidates_material=[x for x in candidates_material if x!='Поліпропілен (PP)']
        if 'Нержавіюча сталь'in candidates_material:candidates_material=[x for x in candidates_material if x!='Сталь']
        if len(set(candidates_material))==1:
            material=candidates_material[0];numeric_sources['material']={'source':'explicit unambiguous material section in official exact-SKU description','raw':material_text}
        elif len(set(candidates_material))>1:
            OMISSIONS.append({'sku':sku,'kind':'material filter','reason':'multiple explicitly stated materials; not flattened into an unproven single body material','value':material_text})
    if material in attributes.get('material',{}).get('values',[]):filters['material']=material
    elif material and material!='Інше':OMISSIONS.append({'sku':sku,'kind':'material filter','reason':'no exact normalized select option','value':material})
    voltage=next((byname[n]for n in ['Versorgungsspannung','Netzspannung','Betriebsspannung','Art der Spannungsversorgung','Nennspannung','Anschlussspannung']if n in byname),None)
    if voltage:
        vm=re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*V(?:\s*(AC|DC))?\s*',voltage)
        if vm:
            value=german_number(vm[1])
            if value>0:
                normalized_voltage=format(value,'g').replace('.',',')+' В'
                if vm[2]and normalized_voltage+' '+vm[2]in attributes.get('voltage',{}).get('values',[]):normalized_voltage+=' '+vm[2]
                filters['voltage']=normalized_voltage;numeric_sources['voltage']={'source':'ETIM exact SKU nominal supply voltage; AC/DC retained in full characteristic','raw':voltage}
    elif category in ['room-thermostats','zone-control','heating-sensors-modules']:
        vm=re.search(r'\b(230|24)\s*(?:V|В)\b',base['shortText'])
        if vm:filters['voltage']=vm[1]+' В';numeric_sources['voltage']={'source':'official exact-SKU voltage variant','raw':vm[0]}
    ip=byname.get('Schutzart (IP)')
    if ip:filters['protectionClass']=ip
    if category=='manifold-cabinets':
        for key,name in [('widthMm','Breite'),('heightMm','Höhe'),('depthMm','Tiefe')]:
            raw=byname.get(name,'');dm=re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\s*',raw)
            if dm:
                filters[key]=german_number(dm[1],thousands=dm[2]=='mm')*{'mm':1,'cm':10,'m':1000}[dm[2]]
                numeric_sources[key]={'source':'explicit exact-SKU ETIM cabinet dimension with unit conversion, not inferred from model code','field':name,'raw':raw}
        mounting=byname.get('Montageart','')
        if re.search(r'Unterputz|прихован|закритого монтажу',mounting+' '+base['shortText'],re.I):filters['installation']='Прихований монтаж'
        elif re.search(r'Aufputz|накладн|відкритого монтажу',mounting+' '+base['shortText'],re.I):filters['installation']='Накладний'
        filters['productType']='Комплектуючі колекторних шаф'if class_name in ['Rahmen für Verteilerschrank','Tür für Verteilerschrank']or re.search(r'дверцята|рама|\bTür\b|\bRahmen\b',base['shortText'],re.I)else'Колекторна шафа'
    allowed=categories.get(category,{}).get('facets',[])
    for key in list(filters):
        if key not in allowed:
            OMISSIONS.append({'sku':sku,'kind':'normalized filter','attribute':key,'value':filters[key],'reason':'category does not expose this facet','evidence':numeric_sources.get(key)});del filters[key];continue
        definition=attributes.get(key,{})
        if definition.get('type')=='select':
            if isinstance(filters[key],(int,float))and float(filters[key]).is_integer():filters[key]=str(int(filters[key]))
            if filters[key]not in definition.get('values',[]):
                OMISSIONS.append({'sku':sku,'kind':'normalized filter','attribute':key,'value':filters[key],'reason':'no exact existing select option','evidence':numeric_sources.get(key)});del filters[key]
    # Preserve original rounded ETIM values privately; public exact dimensions
    # follow the manufacturer's more precise variant identity, never both.
    overrides={'Rohraußendurchmesser':('pipeDiameterMm','мм'),'Wandstärke':('pipeWallThicknessMm','мм'),'Winkel des Bogens':('angleDegrees','°'),'Winkel':('angleDegrees','°')}
    for feature_name,(key,unit)in overrides.items():
        if key in filters and feature_name in labels and (key=='angleDegrees'or is_pipe):
            for row in rows:
                if row['label']==labels[feature_name]:row['value']=str(filters[key]).removesuffix('.0')+' '+unit;row.pop('unit',None)
    for key,label,unit in [('pipeDiameterMm','Зовнішній діаметр труби','мм'),('pipeWallThicknessMm','Товщина стінки труби','мм'),('pipeLengthMm','Довжина труби','мм')]:
        if key in filters:rows.insert(0,{'label':label,'value':str(filters[key]).removesuffix('.0'),'unit':unit})
    rows.append({'label':'Виконання за каталогом','value':norm(titles.translate(re.sub(r'\bREHAU\b','',base['shortText'],flags=re.I)))})
    merged={}
    for row in rows:
        label=norm(row['label']);value=norm(str(row['value'])+(' '+row['unit']if row.get('unit')else''))
        if not label or not value:continue
        if re.search(r'пакув|палл?ет|упаков|артикул упаков|кількість.*пак|обсяг.*упак',label,re.I):continue
        bucket=merged.setdefault(label,[])
        if value not in bucket:bucket.append(value)
    return [{'label':label,'value':'; '.join(v)}for label,v in merged.items()],filters,table_refs,numeric_sources

def media_for(sku):
    images=[];documents=[];seen=set();gallery_evidence=[]
    for lang,p in [('ua',ua.get(sku)),('de',de.get(sku))]:
        if not p:continue
        for image in q(p).get('product-images',{}).get('images',[]):
            key=image.get('fingerprint')or hashlib.sha256((image.get('downloadUrl')or image.get('hdImageUrl')).encode()).hexdigest()[:24]
            local=media.get(key,{})
            gallery_evidence.append({'language':lang,'type':image['type'],'sourceUrl':image.get('downloadUrl'),'path':local.get('path')or local.get('documentPath'),'sha256':local.get('sha256')})
            if local.get('path')and local.get('sha256')not in seen:
                images.append(local['path']);seen.add(local.get('sha256'))
            if local.get('documentPath'):documents.append({'title':'Креслення '+sku,'type':'drawing','url':local['documentPath']})
    for recovered in recovery_images:
        if recovered['sku']!=sku:continue
        if recovered['outputSha256']not in seen:
            images.append(recovered['path']);seen.add(recovered['outputSha256'])
        gallery_evidence.append({'language':'official source','type':recovered['sourceType'],'sourceUrl':recovered['originalUrl'],'path':recovered['path'],'sha256':recovered['outputSha256'],'recoveryProof':recovered['proof']})
    doc_ids=[]
    for lang,p in [('ua',ua.get(sku)),('de',de.get(sku))]:
        if not p:continue
        for doc in q(p).get('pages',{}).get('documents',[]):
            if not doc.get('outdated')and doc['id']in docs and doc['id']not in doc_ids:
                d=docs[doc['id']];doc_ids.append(doc['id'])
                name={'catalog':'Каталог','pricelist':'Каталог і прайс-лист','technical_information':'Технічна інформація','instruction':'Інструкція з монтажу','manual':'Інструкція','certificate':'Сертифікат','declaration':'Декларація'}.get(d['type'],'Документ виробника')
                documents.append({'title':name+' '+(series_for(d['name'])or'REHAU'),'type':{'technical_information':'datasheet','instruction':'manual','pricelist':'catalog'}.get(d['type'],d['type']),'url':d['path']})
        for attachment in q(p).get('attachments',{}).get('attachments',[]):
            key=attachment.get('fingerprint')or hashlib.sha256(attachment.get('downloadUrl','').encode()).hexdigest()[:24]
            if key not in attachment_pdfs:continue
            local=attachment_pdfs[key];kind=attachment['type'];name,doc_type={'USER_MANUAL':('Інструкція','manual'),'MSDS':('Паспорт безпеки','datasheet'),'CERTIFICATE':('Сертифікат','certificate'),'ENVIRONMENTAL_PRODUCT_DECLARATION':('Екологічна декларація продукції','declaration'),'MEASURED_DRAWING':('Креслення','drawing')}.get(kind,('Документ виробника','document'))
            if kind=='DOC'and re.search(r'REVIT',attachment.get('description',''),re.I):name,doc_type='Інструкція REHAU для Revit','manual'
            else:name+=' '+(series_for(attachment.get('description',''))or'REHAU')
            documents.append({'title':name,'type':doc_type,'url':local['path']})
    for row in pdfrows.get(sku,[]):
        if row['document']in docs and row['document']not in doc_ids:
            doc_ids.append(row['document']);documents.append({'title':'Каталог REHAU','type':'catalog','url':docs[row['document']]['path']})
    unique=[];seen_docs=set()
    for doc in documents:
        sha=SHA_BY_PATH[doc['url']]
        if sha not in seen_docs:unique.append(doc);seen_docs.add(sha)
    canonical={}
    for entry in gallery_evidence:
        if entry.get('path')in images:canonical.setdefault(entry.get('sha256'),entry['path'])
    for entry in gallery_evidence:
        if entry.get('sha256')in canonical:entry['path']=canonical[entry['sha256']]
    return images,unique,gallery_evidence,doc_ids

def seo(title,characteristics):
    suffix=' — купити в ТД «Софіївка»'
    seo_title=title+suffix if len(title+suffix)<=70 else title
    if len(seo_title)>70:seo_title=seo_title[:69].rsplit(' ',1)[0]
    facts='; '.join(c['label'].lower()+': '+c['value']for c in characteristics[:2])
    result=title+'. '+facts+'. Характеристики, фото та документи виробника у каталозі ТД «Софіївка».'
    if len(result)>160:result=result[:157].rsplit(' ',1)[0]+'…'
    if len(result)<120:result+=' Технічні параметри й сумісність для добору інженерних систем.'
    if len(result)>160:result=result[:157].rsplit(' ',1)[0]+'…'
    return seo_title,result

def valid_gtin(raw):
    value=str(raw or'').strip()
    if not re.fullmatch(r'(?:\d{8}|\d{12}|\d{13}|\d{14})',value)or not value.strip('0'):return None
    total=sum(int(d)*(3 if i%2==0 else 1)for i,d in enumerate(reversed(value[:-1])))
    return value if (10-total%10)%10==int(value[-1])else None

def source_relationships(sku):
    return [{'locale':lang,**group}for lang,record in [('ua',ua.get(sku)),('de',de.get(sku))]if record for group in q(record).get('relationships',{}).get('relationshipTypes',[])]

products=[]
for sku in sorted(ua.keys()|de.keys()):
    primary=ua.get(sku)or de[sku];base=q(primary).get('base-info',{}).get('baseInfo',{})
    if not base.get('shortText','').strip()and q(de.get(sku,{})).get('base-info',{}).get('baseInfo',{}).get('shortText','').strip():
        primary=de[sku];base=q(primary)['base-info']['baseInfo']
    if sku in ['12446511001','14503901001','11072421001','11072431001']and sku in de:primary=de[sku];base=q(primary)['base-info']['baseInfo']
    if sku in title_recoveries:
        r=title_recoveries[sku];base={**base,'shortText':r['title'],'model':r['model'],'datasheetUrl':r['sourceUrl']}
    original=base.get('shortText','');source_url=base.get('datasheetUrl');class_info=q(de.get(sku,{})).get('features',{}).get('class',{});class_name=class_info.get('name','')
    cat,reason=taxonomy.category(original,class_name,raw_description(primary))
    source_docs=q(primary).get('pages',{}).get('documents',[])
    if sku in mepa_skus or(any('MEPA'in d['name']for d in source_docs)and not any('MEPA'not in d['name']and d['type']in ['pricelist','catalog']for d in source_docs)):cat=None;reason='exact SKU belongs to separate MEPA sanitary range, outside REHAU engineering import'
    if not original.strip()and sku not in mepa_skus:cat=None;reason='manufacturer supplied no product title'
    source_url=source_url or 'https://oxomi.com/p/'+('3001044'if sku in ua else'3000126')+'/datasheet/-/'+sku
    if not cat:EXCLUSIONS.append({'sku':sku,'sourceUrl':source_url,'reason':reason,'sourceTitle':original});continue
    translated,how=description_for(sku)
    if translated is None:
        TRANSLATION_GAPS.append({'sku':sku,'sourceUrl':source_url,'kind':'description','de':raw_description(de.get(sku))});continue
    sections,dropped=clean_sections(translated)
    variant_conflict=None
    if re.search(r'ohne\s+Schnellkuppl\.?/Blindstopfen',q(de.get(sku,{})).get('base-info',{}).get('baseInfo',{}).get('shortText',''),re.I):
        removed=[]
        for section in sections:
            kept=[]
            for paragraph in section['paragraphs']:
                if re.search(r'швидкорознімн|швидкознімн|заглушк|Schnellkuppl|Blindstopfen',paragraph,re.I):removed.append(paragraph)
                else:kept.append(paragraph)
            section['paragraphs']=kept
        sections=[s for s in sections if s['paragraphs']]
        sections.append({'title':'Варіант комплектації','paragraphs':['Без швидкорознімної муфти та заглушки.']})
        variant_conflict={'exactVariantTitle':q(de[sku])['base-info']['baseInfo']['shortText'],'familyIncludedPartsClaimsRemoved':removed,'resolution':'exact variant explicitly excludes the coupler and plug; conflicting general family inclusion is not applied to this SKU'}
    chars,filters,table_evidence,numeric_sources=build_characteristics(sku,base,sections,class_name,cat)
    if not sections:
        sections=[{'title':'Технічні параметри','paragraphs':[c['label']+': '+c['value']for c in chars]}]
        OMISSIONS.append({'sku':sku,'sourceUrl':source_url,'kind':'source prose','reason':'manufacturer supplies no prose; all available exact-SKU technical facts retained and used for factual Ukrainian description'})
    images,documents,gallery_evidence,doc_ids=media_for(sku)
    if not images:EXCLUSIONS.append({'sku':sku,'sourceUrl':source_url,'reason':'manufacturer has no usable verified product image','sourceTitle':original});continue
    title=norm(titles.title(original,cat,class_name))
    intro=sections[0]['paragraphs'][0]if sections and sections[0]['paragraphs']else''
    short=(title+'. '+intro).strip()
    if len(short)>300:short=short[:297].rsplit(' ',1)[0]+'…'
    full=title+'.\n\n'+'\n\n'.join(s['title']+'\n'+'\n'.join(s['paragraphs'])for s in sections)
    series=series_for(titles.translate(original))or series_for(q(de.get(sku,{})).get('base-info',{}).get('baseInfo',{}).get('shortText',''))
    st,sd=seo(title,chars)
    evidence={'manufacturer':'REHAU','officialUaIndex':'https://water.rehau.com/ua-uk/poshuk-produktiv','uaPortal':'https://oxomi.com/p/3001044','dePortal':'https://gebaeudetechnik.rehau.de/epaper','sourceLocale':'uk-UA'if sku in ua else'de-DE','exactSku':sku,'uaProductId':ua.get(sku,{}).get('productId'),'deProductId':de.get(sku,{}).get('productId'),'sourceTitle':original,'sourceModel':base.get('model'),'descriptionMethod':how,'sourceDescriptionUa':raw_description(ua.get(sku))or None,'sourceDescriptionDe':raw_description(de.get(sku))or None,'sourceEtim':q(de.get(sku,{})).get('features'),'pdfTables':table_evidence,'documentIds':doc_ids,'gallery':gallery_evidence,'normalizedFilterSources':numeric_sources,'excludedNontechnicalSourceLines':dropped,'sourcePrices':[r['sourcePrice']for r in pdfrows.get(sku,[])if r.get('sourcePrice')],'inventoryPolicy':'unknown; manufacturer stock is not imported'}
    evidence['sourceGtin']=base.get('gtin');evidence['sourceRelationships']=source_relationships(sku)
    evidence['sourcePdfAttachments']=[{'locale':lang,**a,'localPath':attachment_pdfs.get(a.get('fingerprint'),{}).get('path'),'sha256':attachment_pdfs.get(a.get('fingerprint'),{}).get('sha256')}for lang,record in [('ua',ua.get(sku)),('de',de.get(sku))]if record for a in q(record).get('attachments',{}).get('attachments',[])if a.get('filename','').lower().endswith('.pdf')]
    evidence['uaTechnicalFieldAvailability']={'features':len(q(ua.get(sku,{})).get('features',{}).get('features',[])),'productMeasurements':q(ua.get(sku,{})).get('measurements',{}).get('measurements',{}).get('product',{}),'policy':'Exact-SKU DE ETIM and explicit linked PDF tables enrich empty UA technical fields; absent values are not inferred.'}
    if base.get('gtin')and not valid_gtin(base['gtin']):OMISSIONS.append({'sku':sku,'sourceUrl':source_url,'kind':'ean','reason':'manufacturer GTIN fails length/digits/checksum validation; original retained in sourceEvidence','value':base['gtin']})
    if sku in TEMPLATE_REFS:evidence['uaTemplateExactSku']=TEMPLATE_REFS[sku]
    if sku in title_recoveries:evidence['verifiedTitleRecovery']=title_recoveries[sku]
    if variant_conflict:evidence['variantFamilyConflict']=variant_conflict
    if sku=='12446511001':evidence['sourceTitleConflict']={'ua':q(ua.get(sku,{})).get('base-info',{}).get('baseInfo',{}).get('shortText'),'de':q(de[sku])['base-info']['baseInfo']['shortText'],'resolution':'canonical physical type from exact-SKU DE title and manufacturer drawing: locking pins, not screws'}
    if sku in ['14503901001','11072421001','11072431001']:evidence['sourceTitleConflict']={'ua':q(ua.get(sku,{})).get('base-info',{}).get('baseInfo',{}).get('shortText'),'de':q(de[sku])['base-info']['baseInfo']['shortText'],'resolution':'canonical physical head and dimensions from exact-SKU DE title and ETIM class; original UA wording retained privately'}
    if not documents:OMISSIONS.append({'sku':sku,'sourceUrl':source_url,'kind':'documents','reason':'no current exact-SKU or series PDF linked by manufacturer'})
    public_model=titles.translate(base.get('model')or original)
    if re.search('[äöüÄÖÜß]',public_model.replace('TÜV','').replace('Sanitärbox','')):public_model=titles.translate(re.sub(r'\bREHAU\b','',original,flags=re.I)).strip()
    products.append({'sourceId':primary['productId'],'sourceUrl':source_url,'sourceCategory':norm(' / '.join([d['name']for d in source_docs if not d.get('outdated')][:2]))or class_name or cat,'sku':sku,'model':public_model,'title':title,'brand':'rehau','series':series,'category':cat,'price':None,'priceCurrency':'UAH','vatIncluded':None,'shortDescription':short,'description':full,'sections':sections,'characteristics':chars,'filters':filters,'images':images,'documents':documents,'ean':valid_gtin(base.get('gtin')),'related':[],'seoTitle':st,'seoDescription':sd,'sourceEvidence':evidence})

published_skus={p['sku']for p in products}
for p in products:
    related=[]
    for group in p['sourceEvidence']['sourceRelationships']:
        for item in group.get('relationships',[]):
            other=item.get('itemNumber')
            if other==p['sku']:continue
            if other in published_skus:
                if other not in related:related.append(other)
            else:OMISSIONS.append({'sku':p['sku'],'sourceUrl':p['sourceUrl'],'kind':'related','reason':'official linked article is not eligible in this batch; original manufacturer binding retained in sourceEvidence','relatedSku':other,'relationshipType':group.get('typeCode')})
    p['related']=related
source_urls={sku:'https://oxomi.com/p/'+('3001044'if sku in ua else'3000126')+'/datasheet/-/'+sku for sku in ua.keys()|de.keys()}
for omission in OMISSIONS:
    if omission.get('sku'):omission.setdefault('sourceUrl',source_urls[omission['sku']])

duplicates=collections.defaultdict(list)
for p in products:duplicates[p['title'].lower()].append(p)
title_aliases=[]
for group in duplicates.values():
    if len(group)>1:
        for p in group:
            title_aliases.append({'sku':p['sku'],'title':p['title'],'reason':'distinct official SKU has an identical manufacturer title; retaining visible SKU to distinguish without inventing a physical difference'})
            p['title']+=' (арт. '+p['sku']+')'
            p['description']=p['title']+'.\n\n'+p['description'].split('\n\n',1)[1]
            p['shortDescription']=(p['title']+'. '+p['shortDescription'].split('. ',1)[-1])[:300]
            p['seoTitle'],p['seoDescription']=seo(p['title'],p['characteristics'])
batch={'supplier':'rehau','brand':'rehau','collectedAt':'2026-11-25','sourceSite':'https://water.rehau.com/ua-uk','products':products}
(OUT/'rehau-2026-11-25.json').write_text(json.dumps(batch,ensure_ascii=False,indent=2),encoding='utf8')
report={'sourceUnion':len(ua.keys()|de.keys()),'uaResolved':len(ua),'deResolved':len(de),'products':len(products),'categories':dict(collections.Counter(p['category']for p in products)),'exclusions':EXCLUSIONS,'fieldOmissions':OMISSIONS,'translationGaps':TRANSLATION_GAPS,'titleAliases':title_aliases,'prices':'All storefront prices null. Official source EUR values, units and VAT evidence are private sourceEvidence.','media':{'localImages':len({i for p in products for i in p['images']}),'localDocuments':len({d['url']for p in products for d in p['documents']})}}
(OUT/'rehau-coverage-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items()if k not in ['exclusions','fieldOmissions','translationGaps','titleAliases']},ensure_ascii=False))
print('Exclusions',len(EXCLUSIONS),'translation gaps',len(TRANSLATION_GAPS),'field omissions',len(OMISSIONS),'title alias variants',len(title_aliases),flush=True)
