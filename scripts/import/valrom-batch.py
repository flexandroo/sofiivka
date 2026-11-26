"""Build VALROM's additive import batch from official UA XLS and RO catalogue.

Run valrom-collect.py fetch, xls, ro, pdf-images first. Then run this script.
Also run valrom-collect.py 4silence to reconcile legacy Ukrainian acoustic SKUs.
The source collector uses Python's standard library; PDF rendering and WebP
conversion use bundled pdfplumber/Pillow. XLS extraction uses xlrd installed
only into tmp/valrom-python. Run valrom-audit.py and the repository import-check
against the latest reference after generation. imports/ remains ignored.
Only brand-owned media and ignored imports/tmp files are written. No DB writes.
The manufacturer's Ukrainian list is primary; current official Romanian
sewerage/drainage ranges supplement it. Store inventory is never imported.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import Counter, defaultdict
import hashlib
import html
import io
import json
import math
import re
import shutil
import sys
from pathlib import Path
import importlib.util

sys.stdout.reconfigure(encoding='utf-8')
spec = importlib.util.spec_from_file_location('valrom_collect', Path(__file__).with_name('valrom-collect.py'))
collector = importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
ROOT,CACHE,MEDIA,SITE = collector.ROOT,collector.CACHE,collector.MEDIA,collector.SITE
DATE='2026-11-25'
PRICE_URL=SITE+'/sites/default/files/price/Price%20Valrom%20Ukraine.xls'
EXCLUDED=[]

def clean(value):
    return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',str(value or '')))).strip()

def num(value):
    try:
        return float(re.sub(r'[^\d.,-]','',str(value)).replace(',','.'))
    except ValueError:
        return None

def fmt(value):
    return f'{float(value):g}'.replace('.',',') if isinstance(value,(int,float)) else str(value)

def sku_value(value):
    if isinstance(value,(int,float)):
        return str(int(value)) if value>1e9 else ''
    value=clean(value).rstrip('*')
    return value if re.fullmatch(r'(?:[A-ZА-ЯІЇЄҐ]{0,5})?\d{8,}[A-ZА-ЯІЇЄҐ\d]*',value) else ''

GROUPS={
 'fitinguri-canalizare-exterioara':('external-sewer-fittings','VALPlast','Фітинги зовнішньої каналізації'),
 'tevi-pvc-canalizare-exterioara':('external-sewer-pipes','VALPlast','Труби ПВХ зовнішньої каналізації'),
 'tevi-pehd-canalizare-exterioara':('external-sewer-pipes','VALPlast','Труби ПЕ зовнішньої каналізації'),
 'tevi-pehd-rc-pro-canalizare-exterioara':('external-sewer-pipes','VALPlast','Захищені труби ПЕ зовнішньої каналізації'),
 'tevi-pp-canalizare-exterioara':('external-sewer-pipes','VALPlast','Труби ПП зовнішньої каналізації'),
 'camine-canalizare-exterioara':('inspection-chambers','VALPlast','Каналізаційні колодязі'),
 'capace-gratare-canalizare-exterioara':('inspection-chambers','VALPlast','Кришки та решітки колодязів'),
 'dispozitive-canalizare-exterioara':('sewer-installation-components','VALPlast','Монтаж каналізаційних колодязів'),
 'tevi-canalizare-interioara':('internal-sewer-pipes','VALEasy','Труби внутрішньої каналізації'),
 'fitinguri-canalizare-interioara':('internal-sewer-fittings','VALEasy','Фітинги внутрішньої каналізації'),
 'accesorii-canalizare-interioara':('internal-sewer-fittings','VALEasy','Комплектуючі внутрішньої каналізації'),
 'tevi-pvc-canalizare-fonoabsorbanta':('internal-sewer-pipes','4SILENCE','Шумопоглинальна каналізація ПВХ'),
 'fitinguri-pvc-canalizare-fonoabsorbanta':('internal-sewer-fittings','4SILENCE','Шумопоглинальні фітинги ПВХ'),
 'tevi-pp-canalizare-fonoabsorbanta':('internal-sewer-pipes','EasyFONO','Шумопоглинальна каналізація ПП'),
 'fitinguri-pp-canalizare-fonoabsorbanta':('internal-sewer-fittings','EasyFONO','Шумопоглинальні фітинги ПП'),
 'tevi-pehd-canalizare-pluviala':('drainage-pipes','VALRain','Труби ПЕ водовідведення'),
 'fitinguri-canalizare-pluviala':('external-sewer-fittings','VALRain','Фітинги ПЕ водовідведення'),
 'sistem-pvc-drenaj':('drainage-pipes','VALDrain','Дренажні системи ПВХ'),
 'sistem-pehd-drenaj':('drainage-pipes','VALDrain','Дренажні системи ПЕ'),
 'canale-accesorii-canalizare-pluviala':('drainage-pipes','VALRain','Водовідвідні канали й комплектуючі'),
 'sifoane-accesorii-canalizare-pluviala':('internal-sewer-fittings','VALRain','Водоприймальні воронки й сифони'),
 'accesorii-retele-canalizare-exterioara-valrain':('sewer-installation-components','VALRain','Комплектуючі водовідведення'),
 'statii-unitati-epurare':('wastewater-treatment','VALCleanio','Очищення стічних вод'),
 'separatoare-grasimi-hidrocarburi':('wastewater-treatment','VALCleanio','Сепаратори жирів і нафтопродуктів'),
 'statii-pompare-canalizare':('sewage-lifting-units','VALPlast','Каналізаційні насосні станції'),
 'fose-septice':('wastewater-treatment','VALCleanio','Септики'),
 'camine-pluviale':('inspection-chambers','VALRain','Колодязі водовідведення'),
 'geotextil-pentru-drenaj':('drainage-pipes','VALDrain','Геотекстиль для дренажу'),
}

TYPE_WORDS=[
 ('TRANSPORTATOR CU SNEC','Шнековий транспортер стічних вод'),('STAVILAR','Щитовий затвор каналізаційний'),
 ('GRATAR MECANIC','Механічна решітка очищення стічних вод'),('GR?TAR MECANIC','Механічна решітка очищення стічних вод'),
 ('GRATAR MANUAL','Ручна решітка очищення стічних вод'),('GR?TAR MANUAL','Ручна решітка очищення стічних вод'),
 ('GRATAR','Решітка водовідведення'),('DISPOZITIV','Пристрій монтажу каналізації'),
 ('BARA FILETATA','Різьбова шпилька каналізаційного кріплення'),('PERECHE DIAFRAGME','Комплект мембран повітродувки'),
 ('MAGNET','Магніт повітродувки'),('AERATOR','Аератор очисної станції'),('BIO-ACTIVATOR','Біоактиватор очисної станції'),
 ('PROFIL','Монтажний профіль каналізації'),('CHEIE','Монтажний ключ каналізації'),('FIR PP','Зварювальний пруток поліпропіленовий'),
 ('RAMIFICATIE DUBLA','Хрестовина каналізаційна'),('TUB TELESCOPIC','Телескопічний патрубок колодязя'),
 ('PIESA INSPECTIE','Ревізія каналізаційна'),('GEOTEXTIL','Геотекстиль дренажний'),
 ('CABLU','Кабель каналізаційної установки'),('PICIOR','Опора каналізаційної установки'),
 ('LANT','Ланцюг каналізаційного насоса'),('SONDA','Зонд контролю каналізації'),
 ('SENZOR','Датчик каналізаційної установки'),('PIULITA','Гайка каналізаційна'),
 ('SAIBA','Шайба монтажу каналізації'),('SURUB','Гвинт монтажу каналізації'),
 ('CAPAC+RAMA','Кришка з рамою'),('BAZA CAMIN','Основа оглядового колодязя'),
 ('STATIE EPURARE','Станція очищення стічних вод'),('UNITATE EPURARE','Установка очищення стічних вод'),
 ('TUB TELESCOPIC','Телескопічний патрубок колодязя'),('SA BRANSAMENT','Сідло каналізаційне'),
 ('GRATAR+RAMA','Решітка з рамою'),('KIT MONTAJ','Монтажний комплект каналізації'),
 ('CAPAT FLANSA','Буртова втулка каналізаційна'),('SET REDUCTII','Комплект перехідників'),
 ('TUB','Труба каналізаційна'),('TEAVA','Труба каналізаційна'),('COT','Коліно каналізаційне'),
 ('CURBA','Коліно каналізаційне'),('RAMIFICATIE','Трійник каналізаційний'),('REDUCTIE','Перехід каналізаційний'),
 ('MUFA','Муфта каналізаційна'),('MANSON','Муфта каналізаційна'),('DOP','Заглушка каналізаційна'),
 ('SIFON','Сифон каналізаційний'),('CAMIN','Колодязь каналізаційний'),('CAPAC','Кришка колодязя'),
 ('GARNITURA','Ущільнення каналізаційне'),('COLIER','Хомут каналізаційний'),('INEL','Кільце каналізаційне'),
 ('RECEPTOR','Водоприймальна воронка'),('ADAPTOR','Адаптер каналізаційний'),('RACORD','З’єднувач каналізаційний'),
 ('PIESA','Деталь каналізаційна'),('ELEMENT','Подовжувальний елемент каналізації'),('GRILAJ','Решітка водовідведення'),
 ('CANAL','Канал водовідведення'),('CLAPETA','Зворотний клапан каналізації'),('SUPAPA','Клапан каналізації'),
 ('AERISITOR','Аератор каналізаційний'),('VENTIL','Випуск каналізаційний'),('BANDA','Стрічка монтажна'),
 ('FREZA','Фреза для каналізаційних колодязів'),('ADEZIV','Клей для каналізаційних труб'),
 ('PROTECTIE','Захисний елемент каналізації'),('PARAFRUNZAR','Листовловлювач водовідведення'),
 ('PRELUNGIRE','Подовжувач каналізаційний'),('FLANSA','Фланець каналізаційний'),('TEU','Трійник каналізаційний'),
 ('CONECTOR','З’єднувач каналізаційний'),('SUFLANTA','Повітродувка очисної станції'),
 ('POMPA','Каналізаційний насос'),('ELECTROPOMPA','Каналізаційний насос'),('STATIE','Насосна станція каналізації'),
 ('TABLOU','Шафа керування каналізацією'),('PANOU','Панель керування каналізацією'),
 ('SEPARATOR','Сепаратор стічних вод'),('FILTRU','Фільтр очисної станції'),('MODUL','Модуль очисної станції'),
 ('BAZIN','Резервуар очисної станції'),('UNITATE','Установка очищення стічних вод'),
 ('UNITATI','Комплект очищення стічних вод'),('GRUP','Насосний вузол каналізації'),
 ('SISTEM','Система водовідведення'),('REZERVOR','Резервуар каналізаційний'),
 ('CONEXIUNE','З’єднання каналізаційне'),('KIT','Комплект каналізації'),
]

LABELS={
 'pa_thickness':'Товщина стінки','pa_grosime':'Товщина стінки','pa_nominal-pressure':'Номінальний тиск',
 'pa_presiune-nominala':'Номінальний тиск','pa_sdr':'SDR','pa_perioada-garantie':'Гарантія',
 'pa_unghi':'Кут','pa_diametru':'Діаметр','pa_diametrumm':'Діаметр','pa_tip-sn':'Клас кільцевої жорсткості',
 'pa_culoare':'Колір','pa_valplast-type':'Тип конструкції','pa_tip-valplast':'Тип конструкції',
 'pa_durata-medie-de-utilizare':'Розрахунковий строк використання','pa_material':'Матеріал','pa_debit':'Продуктивність',
 'pa_fanta':'Ширина щілини','pa_garantie-2':'Гарантія','pa_lungime':'Довжина','pa_inaltime':'Висота',
 'pa_durata-estimata-de-viata':'Розрахунковий строк служби',
}
LABEL_NAMES={'Thickness':'Товщина стінки','Grosime perete':'Товщина стінки','Nominal pressure':'Номінальний тиск','Valplast type':'Тип конструкції','Diametru(mm)':'Діаметр','Perioadă garanție':'Гарантія','Durata medie de utilizare':'Розрахунковий строк використання','Durata estimată de viață':'Розрахунковий строк служби','Filet':'Різьба','Racorduri':'Підключення'}
DROP_ATTR=re.compile(r'colet|ambal|cpv|vamal|origine|dzp|subclasa|tip-articol|echipament',re.I)
VALUE_WORDS={'NEGRU':'чорний','NEAGRA':'чорний','GRI':'сірий','MARO':'коричневий','PORTOCALIU':'помаранчевий','ALB':'білий','ALBA':'білий','VERDE':'зелений','ALBASTRU':'синій','ROSU':'червоний','COMPACT':'компактна','MULTISTRAT':'багатошарова','FONTA':'чавун','CAUCIUC':'гума','INOX':'нержавіюча сталь','BETON':'бетон','COMPOZIT':'композит','OTEL':'сталь','GALBEN':'жовтий','ALAMA':'латунь'}

def value_uk(value):
    value=clean(value)
    if value.upper() in VALUE_WORDS:return VALUE_WORDS[value.upper()]
    for source,target in {'BAZA':'основа','CAMIN':'колодязь','CAM':'колодязь','TREC':'прохідний','GEIGER':'дощоприймач','SIFON':'сифон','CAPAC':'кришка','CLAPET':'зворотний клапан','CURBA':'коліно','CANAL':'каналізаційний','DOP':'заглушка','EXTERIOR':'зовнішній','FILTRU':'фільтр','COMPLET':'комплект','GRATAR':'решітка','MUFA':'муфта','CU':'з','OPRITOR':'упор','PIESA':'деталь','INSPECTIE':'ревізія','PRELUNGIRE':'подовжувач','PT':'для','CAPACE':'кришки','RAM':'трійник','REDUCTIE':'перехід','SA':'сідло','TEAVA':'труба','PROT':'захисна','PROTECTIE':'захисна','FARA':'без','DRENAJ':'дренажна','ADAPTOR':'адаптер'}.items():
        value=re.sub(r'\b'+source+r'\b',target,value)
    value=re.sub(r'\b(?:Grade|GRD|grd)\b','°',value)
    value=re.sub(r'\b(?:Luni|luni|LUNI)\b','місяців',value)
    value=re.sub(r'\b(?:ani|Ani|ANI)\b','років',value)
    value=value.replace('mm','мм').replace('bar','бар').replace('mc/h','м³/год').replace('m3/h','м³/год').replace('m³/h','м³/год')
    value=re.sub(r'(\d+)IN',r'\1 вхід',value)
    value=re.sub(r'(\d+)OUT',r'\1 вихід',value)
    value=re.sub(r'(?<=\d)\s*m\b',' м',value)
    value=re.sub(r'(?<=\d)\.(?=\d)',',',value)
    return value

def attrs_ro(row):
    result=[]
    for attribute in row.get('attributes',[]):
        taxonomy=attribute.get('taxonomy','')
        if DROP_ATTR.search(taxonomy):continue
        label=LABELS.get(taxonomy) or LABEL_NAMES.get(attribute.get('name'))
        if not label:
            continue
        value='; '.join(value_uk(term['name']) for term in attribute['terms'])
        if not value or re.fullmatch(r'0(?:[.,]0+)?(?:\s*(?:мм|°|м|бар|місяців|л/хв|l/min|m|mm))?',value):
            continue
        result.append({'label':label,'value':value})
    return result

def type_ro(row,category):
    name=clean(row['name']).upper()
    # VALDrain FILTRU articles here are slotted drainage pipes, not the filters
    # of a sewage treatment station. Do not change generic FILTRU elsewhere.
    if category == 'drainage-pipes' and re.match(r'^FILTRU VALDRAIN\b',name) and re.search(r'Tevi din PVC cu fante transversale',row.get('description',''),re.I):
        return 'Дренажна фільтрувальна труба'
    for word,translated in TYPE_WORDS:
        if name.startswith(word):return translated
    typed=[clean(t['name']).upper() for a in row.get('attributes',[]) if a.get('taxonomy')=='pa_tip-articol' for t in a['terms']]
    for word,translated in TYPE_WORDS:
        if word in typed:return translated
    return {'inspection-chambers':'Комплектуюча каналізаційного колодязя','wastewater-treatment':'Комплектуюча очисної станції','sewage-lifting-units':'Комплектуюча каналізаційної установки','internal-sewer-fittings':'Фітинг внутрішньої каналізації','external-sewer-fittings':'Фітинг зовнішньої каналізації','drainage-pipes':'Комплектуюча дренажної системи','sewer-installation-components':'Монтажна комплектуюча каналізації'}.get(category,'Труба каналізаційна')

def dimensions_from_name(name,is_pipe=False):
    result=[]
    name=clean(name).replace('х','x').replace('Х','x').replace('×','x').replace('X','x')
    d=re.search(r'(?:\bD[. =]*|\bД[. =]*)(\d+(?:[.,]\d+)?(?:\s*[/x]\s*\d+(?:[.,]\d+)?)*)',name,re.I)
    if d:
        dims=re.sub(r'\s+','',d[1]).split('x')
        result.append({'label':'Діаметр','value':dims[0].replace('.',',')+' мм'})
        if is_pipe and len(dims)>1:result.append({'label':'Товщина стінки','value':dims[1].replace('.',',')+' мм'})
        elif len(dims)>1:result[-1]['value']=' × '.join(dims)+' мм'
    dn=re.search(r'\bDN[. =]*(\d+(?:\s*/\s*\d+)*)',name,re.I)
    if dn:result.append({'label':'Умовний діаметр','value':re.sub(r'\s+','',dn[1])+' мм'})
    if not d:
        geometry=re.search(r'\b(\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?(?:\s*x\s*\d+(?:[.,]\d+)?)?)\b',name,re.I)
        if geometry:result.append({'label':'Розміри','value':re.sub(r'\s+','',geometry[1]).replace('x',' × ').replace('.',',')})
    length=re.search(r'\bL\s*[=.]*\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|м|m)?\b',name,re.I)
    if length:
        value=num(length[1])
        if length[2] and length[2].lower() in ('m','м'):value*=1000
        result.append({'label':'Довжина','value':fmt(value)+' мм'})
    angle=re.search(r'(\d+(?:[.,]\d+)?)\s*(?:°|º|GRD|grd)(?:\s*(30)\s*[\'′])?',name)
    if angle:result.append({'label':'Кут','value':fmt(num(angle[1])+(.5 if angle[2] else 0))+' °'})
    sn=re.search(r'\bSN\s*(\d+)',name,re.I)
    if sn:result.append({'label':'Клас кільцевої жорсткості','value':'SN'+sn[1]})
    height=re.search(r'[HН]\s*(?:max|заг[.]?)?\s*[.=]*\s*(\d+(?:[.,]\d+)?(?:-\d+)?)\s*(мм|mm|м|m)?',name,re.I)
    if height:
        value=height[1]
        if height[2] and height[2].lower() in ('m','м') and '-' not in value:value=fmt(num(value)*1000)
        result.append({'label':'Висота','value':str(value).replace('.',',')+' мм'})
    return result

def source_images(row):
    return [i['src'] for i in row.get('images',[]) if i.get('src') and not re.search(r'placeholder|logo|icon-',i['src'],re.I)]

def parse_ua():
    sheets=json.loads((CACHE/'price-rows.json').read_text(encoding='utf-8'))
    result=[]
    for sheet,rows in sheets.items():
        for ri,row in enumerate(rows):
            columns=[0,6] if len(row)>9 else [0]
            for ci in columns:
                sku=sku_value(row[ci])
                if not sku:continue
                name=clean(row[ci+1])
                if re.search('водопровід|свердлов|водомір|підземного бака',name,re.I):
                    EXCLUDED.append({'source':'ua-xls','sku':sku,'name':name,'reason':'не каналізаційний виріб'})
                    continue
                if sheet=='Aqua Clean':
                    price=row[8];name=clean(row[1]);category='wastewater-treatment';series='AquaClean'
                    typ='Станція очищення стічних вод' if ri<9 else 'Жировловлювач' if ri<16 else 'Мішок для відходів жировловлювача' if ri==16 else 'Повітродувка очисної станції'
                    model=re.sub(r'Валром.*','',name,flags=re.I).strip() if ri<16 else 'NG0,3' if ri==16 else 'JDK 40'
                    characteristics=[]
                    labels=['Діаметр','Висота','Продуктивність','Кількість користувачів'] if ri<9 else ['Габарити','Об’єм','Об’єм відстійника','Об’єм для жирів']
                    for label,value in zip(labels,row[2:6]):
                        if clean(value):characteristics.append({'label':label,'value':fmt(value)+(' мм' if label in ('Діаметр','Висота','Габарити') else ' л/добу' if label=='Продуктивність' else ' л' if 'Об’єм' in label else '')})
                else:
                    price=row[ci+4];characteristics=[]
                    if sheet=='Труба ПВХ':category='external-sewer-pipes';series='KompactKit';typ='Труба каналізаційна ПВХ';name='Труба ПВХ '+name
                    elif sheet=='Фітинги ПВХ':category='external-sewer-fittings';series='KompactKit';typ=''
                    elif sheet=='Труба та фітинг ПВХ шумопогл':category='internal-sewer-pipes' if re.match('Труба ',name,re.I) else 'internal-sewer-fittings';series='4SILENCE';typ=''
                    elif sheet=='Труба та фітинг ПП':category='internal-sewer-pipes' if re.match('Труба ',name,re.I) else 'internal-sewer-fittings';series='EasyKit';typ=''
                    else:category='inspection-chambers';series='KompactKit';typ=''
                    upper=name.upper()
                    if re.search(r'ХОМУТ|ВАЗЕЛІН|ФРЕЗА|СВЕРДЛО',upper):category='sewer-installation-components'
                    if not typ:
                        for pattern,label in [('ТРУБА','Труба каналізаційна'),('КОЛІНО','Коліно каналізаційне'),('ТРІЙНИК','Трійник каналізаційний'),('ХРЕСТОВИНА','Хрестовина каналізаційна'),('РЕВІЗІЯ','Ревізія каналізаційна'),('ЗАГЛУШКА','Заглушка каналізаційна'),('МУФТА','Муфта каналізаційна'),('ЗВОРОТН','Зворотний клапан каналізації'),('СІДЛО','Сідло каналізаційне'),('ПЕРЕХІД ЧЕРЕЗ','Перехід каналізації у бетонний колодязь'),('ВТУЛКА','Втулка каналізаційна ексцентрична'),('ПЕРЕХІД','Перехід каналізаційний'),('КОЛОДЯЗЬ','Колодязь каналізаційний'),('МАНЖЕТА','Манжета каналізаційна'),('ПОДОВЖУВАЧ','Подовжувач колодязя'),('ПРОКЛАДКА','Ущільнення каналізаційне'),('ФРЕЗА','Фреза для каналізаційних колодязів'),('СВЕРДЛО','Центрувальне свердло фрези'),('ХОМУТ','Хомут каналізаційний'),('ВАЗЕЛІН','Монтажний вазелін каналізації'),('ВИПУСК','Вентиляційний випуск каналізації'),('ПАТРУБОК','Компенсаційний патрубок')]:
                            if pattern in upper:typ=label;break
                    if 'ХОМУТ' in upper:typ='Хомут каналізаційний'
                    if not typ:raise ValueError('Unknown UA type: '+name)
                    material='ПВХ' if 'ПВХ' in upper else 'ПП' if 'ПП' in upper else 'ПЕ' if category=='inspection-chambers' and 'КОЛОДЯЗЬ' in upper else None
                    if material:characteristics.append({'label':'Матеріал','value':material})
                    if 'ШУМОПОГЛ' in upper:characteristics.append({'label':'Виконання','value':'шумопоглинальне'})
                    if 'ОЦИНКОВАН' in upper:characteristics.append({'label':'Матеріал','value':'оцинкована сталь'})
                    if 'ДЮБЕЛ' in upper:characteristics.append({'label':'Комплектація','value':'з дюбелем'})
                    if 'БЕЗ КРИШКИ' in upper:characteristics.append({'label':'Комплектація','value':'без кришки'})
                    elif 'З КРИШКОЮ' in upper:characteristics.append({'label':'Комплектація','value':'з кришкою'})
                    if 'ЗАКРИТ' in upper:characteristics.append({'label':'Тип основи','value':'закрита'})
                    for match in re.finditer(r'(\d+)\s*(?:вх[іи]д|вход)',name,re.I):characteristics.append({'label':'Кількість входів','value':match[1]})
                    if 'ЧУГУН' in upper:characteristics.append({'label':'Призначення переходу','value':'з поліпропілену на чавун'})
                    if 'ВАЗЕЛІН' in upper:
                        mass=re.search(r'(\d+)\s*г',name,re.I)
                        if mass:characteristics.append({'label':'Маса','value':mass[1]+' г'})
                    characteristics.extend(dimensions_from_name(name,'pipes' in category))
                    model=series
                result.append({'sku':sku,'name':name,'type':typ,'category':category,'series':series,'model':model,'characteristics':characteristics,'price':int(math.floor(float(price)+.5)) if isinstance(price,(int,float)) and price>0 else None,'sourcePrice':{'amount':row[7] if sheet=='Aqua Clean' else row[ci+3],'currency':'EUR','uahAmount':price,'vatIncluded':None,'sheet':sheet,'row':ri+1,'column':ci+5},'sourceUrl':PRICE_URL,'sourceId':f'ua-{sku}','sourceCategory':sheet,'primary':'ua-xls'})
    return result

def fallback_pdf(item):
    name=item['name'].upper();typ=item['type'];cat=item['category'];file=None
    if item['series']=='4SILENCE':return None
    if item['series']=='EasyKit':
        mapping={'Труба каналізаційна':'2-1','Коліно каналізаційне':'2-3','Трійник каналізаційний':'3-4','Хрестовина каналізаційна':'4-1','Ревізія каналізаційна':'5-1','Заглушка каналізаційна':'5-8','Муфта каналізаційна':'4-2','Перехід каналізаційний':'4-5','Втулка каналізаційна ексцентрична':'4-6','Вентиляційний випуск каналізації':'5-7','Компенсаційний патрубок':'3-12','Хомут каналізаційний':'9-10','Зворотний клапан каналізації':'9-7','Монтажний вазелін каналізації':'9-8'}
        code=mapping.get(typ)
        if code:file='easykit-'+code+'.webp'
    elif item['series']=='KompactKit':
        mapping={'Труба каналізаційна ПВХ':'3-3','Коліно каналізаційне':'6-5','Трійник каналізаційний':'5-4','Ревізія каналізаційна':'7-5','Заглушка каналізаційна':'8-4','Муфта каналізаційна':'5-3','Перехід каналізаційний':'7-4','Перехід каналізації у бетонний колодязь':'8-5','Сідло каналізаційне':'10-3','Ущільнення каналізаційне':'27-5','Манжета каналізаційна':'27-3','Фреза для каналізаційних колодязів':'27-4','Центрувальне свердло фрези':'27-4','Хомут каналізаційний':'24-7','Подовжувач колодязя':'24-6','Колодязь каналізаційний':'24-4','Зворотний клапан каналізації':'14-6'}
        code=mapping.get(typ)
        if code:file='kompactkit-'+code+'.webp'
    return CACHE/'pdf-images'/file if file else None

def unique_chars(rows):
    result={}
    for row in rows:
        label=clean(row['label']);value=value_uk(row['value'])
        if label and value:
            if label in result and value!=result[label]:
                if num(value)==num(result[label]) and re.fullmatch(r'[\d.,]+',result[label]) and not re.fullmatch(r'[\d.,]+',value):result[label]=value
                continue
            result[label]=value
    return [{'label':k,'value':v} for k,v in result.items()]

def product_title(item):
    chars={r['label']:r['value'] for r in item['characteristics']}
    parts=[item['type'],'VALROM',item['series']]
    if item['primary']=='ua-xls' and item['series']=='AquaClean':parts.append(item['model'])
    else:
        diameter=chars.get('Діаметр') or chars.get('Умовний діаметр')
        if diameter:
            if chars.get('Товщина стінки'):
                parts.append(re.sub(r'\s*мм$','',diameter)+' × '+chars['Товщина стінки'])
            else:parts.append(diameter)
        for label,prefix in [('Довжина','L='),('Кут',''),('Клас кільцевої жорсткості',''),('Висота','H='),('Маса','')]:
            if chars.get(label):parts.append(prefix+chars[label])
    return clean(' '.join(parts))

def describe(item,title):
    category=item['category']
    applications={'internal-sewer-pipes':'відведення стічних вод у внутрішніх каналізаційних мережах','internal-sewer-fittings':'з’єднання та облаштування внутрішніх каналізаційних мереж','external-sewer-pipes':'транспортування стічних вод у зовнішніх каналізаційних мережах','external-sewer-fittings':'з’єднання й зміни конфігурації зовнішніх каналізаційних мереж','drainage-pipes':'відведення води в дренажних і водовідвідних системах','inspection-chambers':'облаштування, огляду й обслуговування каналізаційних колодязів','wastewater-treatment':'очищення стічних вод та обслуговування очисних систем','sewage-lifting-units':'перекачування стічних вод у каналізаційних системах','sewage-pumps':'перекачування стічних вод','sewer-installation-components':'монтажу й обслуговування каналізаційних систем'}
    facts=[f'{r["label"].lower()} — {r["value"]}' for r in item['characteristics'] if r['label'] not in ('Розрахунковий строк використання','Розрахунковий строк служби')]
    first=item['type'].split()[0]
    form='призначена' if first in ('Труба','Кришка','Решітка','Муфта','Хрестовина','Манжета','Втулка','Станція','Установка','Повітродувка','Шафа','Панель','Деталь','Стрічка','Система','Комплектуюча','Основа') else 'призначене' if first in ('Коліно','Ущільнення','Кільце','З’єднання','Сідло','Свердло') else 'призначений'
    if item['type'] == 'Дренажна фільтрувальна труба':
        form='використовується'
    intro=f'{title} {form} для {applications[category]}.'
    technical='Технічні параметри: '+('; '.join(facts)+'.' if facts else 'виконання '+item['series']+'.')
    manufacturer=item.get('ukDescription','')
    description=intro+' '+manufacturer+' '+technical if manufacturer else intro+' '+technical
    short=intro if len(intro)<=300 else intro[:297]+'…'
    sections=[{'title':'Застосування','paragraphs':[intro]}]
    if manufacturer:sections.append({'title':'Опис виробника','paragraphs':[p.strip() for p in manufacturer.split('\n') if p.strip()]})
    sections.append({'title':'Конструкція й параметри','paragraphs':[technical]})
    return short,description,sections


def manufacturer_text(markup):
    text=re.sub(r'</(?:p|div|li|h[1-6])>|<br\s*/?>','\n',markup,flags=re.I)
    text=html.unescape(re.sub('<[^>]+>',' ',text))
    paragraphs=[clean(p) for p in text.split('\n')]
    return '\n'.join(p for p in paragraphs if p and not re.search(r'https?://|www\.|\+40\s|transport gratuit|livrare|comercial|pret[ui]|stoc',p,re.I))


def technical_translation(text,item):
    """Ukrainian factual rendering of the source, without untranslated marketing.

    Source wording remains verbatim in the audit evidence. Claims below are
    emitted only when that exact construction/property appears in the source.
    """
    lower=text.lower();paragraphs=[]
    if 'policlorura de vinil neplastifiata' in lower or 'pvc-u' in lower:
        paragraphs.append('Виріб належить до каналізаційної системи з непластифікованого полівінілхлориду PVC-U.')
    if 'multistrat' in lower and 'strat intermediar' in lower:
        paragraphs.append('Багатошарова конструкція має проміжний шар спіненого PVC-U між внутрішнім і зовнішнім шарами компактного матеріалу.')
    elif 'perete compact' in lower or 'material pvc-u omogen' in lower:
        paragraphs.append('Стінка має одношарову компактну конструкцію з однорідного PVC-U.')
    if 'polipropilena' in lower and 'minerale' in lower:
        paragraphs.append('Поліпропілен із мінеральними добавками застосовано для зменшення шуму від протікання стічних вод.')
    elif 'polipropilena' in lower:
        paragraphs.append('У конструкції використано поліпропілен для систем каналізації будівель.')
    if 'formare rotationala' in lower or 'rotomolding' in lower:
        paragraphs.append('Поліетиленовий корпус виготовлено методом ротаційного формування; ребра забезпечують конструктивну жорсткість колодязя.')
    if 'mufa si garnitura' in lower or 'mufa cu garnitura' in lower or 'mufa și garnitura' in lower:
        paragraphs.append('З’єднання виконують за допомогою розтруба й ущільнювальної прокладки.')
    if 'sudura cap la cap' in lower or 'electrosud' in lower:
        paragraphs.append('Джерело передбачає зварне з’єднання елементів; відповідний спосіб залежить від виконання виробу.')
    if 'fante transversale' in lower:
        paragraphs.append('Поперечні щілини забезпечують надходження води в підземну дренажну мережу.')
    if 'strat protector' in lower and 'pe100rc' in lower:
        paragraphs.append('Труба PE100RC має додатковий захисний шар для монтажу зовнішніх напірних каналізаційних мереж.')
    if 'fir de detectie' in lower:
        paragraphs.append('Під захисним шаром передбачено дріт для визначення розташування підземної труби.')
    if 'sbr' in lower and item['category']=='wastewater-treatment':
        paragraphs.append('Для очищення стічних вод застосовано послідовну циклічну біологічну обробку SBR.')
    standards=list(dict.fromkeys(re.findall(r'(?:(?:SR\s+)?EN\s*(?:ISO\s*)?\d{3,5}(?:[-:]\d{1,4})?|DIN\s*\d{3,5}(?:[-:]\d{1,4})?|ISO\s*\d{3,5}(?:[-:]\d{1,4})?)',text,re.I)))
    if standards:paragraphs.append('Нормативні документи, наведені виробником: '+', '.join(standards)+'.')
    temps=list(dict.fromkeys(re.findall(r'\+?\d+(?:[.,]\d+)?\s*(?:°\s*[CcС]|[Cc](?![a-z]))',text)))
    if temps:paragraphs.append('Температурні значення, зазначені виробником для відповідних режимів застосування: '+', '.join(t.replace('C','°C').replace('°°','°') for t in temps)+'. Режими тривалої та короткочасної роботи слід звіряти з документацією системи.')
    acoustics=list(dict.fromkeys(re.findall(r'\d+(?:[.,]\d+)?\s*dB(?:\s*\(A\))?',text,re.I)))
    if acoustics:paragraphs.append('Заявлені виробником акустичні показники системи: '+', '.join(acoustics)+'. Значення залежать від витрати та умов випробування системи.')
    return '\n'.join(paragraphs)

def picture_task(url):
    from PIL import Image
    token=hashlib.sha256(url.encode()).hexdigest()[:20]
    filename='manufacturer-'+token+'.webp'
    if (MEDIA/filename).exists():
        with Image.open(MEDIA/filename) as existing:
            if max(existing.size)<=1600 and existing.format=='WEBP':return 'assets/products/valrom/'+filename
    raw=collector.fetch(url,CACHE/'photo-originals'/token)
    image=Image.open(io.BytesIO(raw));image.load()
    if image.mode not in ('RGB','RGBA'):image=image.convert('RGB')
    image.thumbnail((1600,1600))
    MEDIA.mkdir(parents=True,exist_ok=True)
    image.save(MEDIA/filename,'WEBP',quality=90,method=6)
    return 'assets/products/valrom/'+filename

def build():
    from PIL import Image
    ua=parse_ua();ro=json.loads((CACHE/'ro-products.json').read_text(encoding='utf-8'))
    english=json.loads((CACHE/'4silence-en.json').read_text(encoding='utf-8')) if (CACHE/'4silence-en.json').exists() else []
    ro_by_sku={r['sku']:r for r in ro+english}
    by_sku={};ua_duplicates=[]
    for item in ua:
        if item['sku'] in by_sku:
            ua_duplicates.append(item['sku']);continue
        by_sku[item['sku']]=item
    family_images=defaultdict(list)
    for row in ro:
        category=next((c['slug'] for c in row['categories'] if c['slug'] in GROUPS),None)
        if category and source_images(row):
            family_images[(category,type_ro(row,GROUPS[category][0]))].extend(source_images(row))
    for row in ro:
        source_category=next((c['slug'] for c in row['categories'] if c['slug'] in GROUPS),None)
        if not source_category:
            EXCLUDED.append({'source':'ro-api','sku':row['sku'],'name':row['name'],'reason':'поза каналізаційною номенклатурою для імпорту','categories':[c['slug'] for c in row['categories']]});continue
        if re.search(r'(SCOS DIN|DEZAFECTAT|DISCONTINUED|OBSOLETE)',row['name'],re.I):
            EXCLUDED.append({'source':'ro-api','sku':row['sku'],'reason':'позначено як знятий з виробництва'});continue
        if not clean(row.get('sku')):
            EXCLUDED.append({'source':'ro-api','sourceId':row['id'],'reason':'немає артикула'});continue
        if row['sku'] in by_sku:continue
        category,series,source_category_uk=GROUPS[source_category]
        if re.search(r'APARAT SUDURA|TERMOPLACA|SET REDUCTII|TRUSA SCULE|STRUNG|VALNetline|PROTECTIE CABL|REZERVOR WC|\bHL\d|\bVALSIR\b|\bZENIT\b|\bDAB\b|\bSECOH\b',row['name'],re.I):
            EXCLUDED.append({'source':'ro-api','sku':row['sku'],'name':row['name'],'reason':'кабелі або універсальне зварювальне обладнання'});continue
        chars=attrs_ro(row)
        # Named dimensions supplement genuine API attributes, never overwrite them.
        chars=unique_chars(chars+dimensions_from_name(row['name'],'pipes' in category))
        typ=type_ro(row,category)
        if category=='sewage-lifting-units' and typ=='Каналізаційний насос':category='sewage-pumps'
        if re.search(r'TRANSPORTATOR|GR.?TAR (?:MECANIC|MANUAL)|STAVILAR',row['name'],re.I):category='wastewater-treatment'
        if re.search(r'FILETATA|PROFIL|CONEXIUNE.*SINA|KIT SURUBURI|SET FIXARE|FIR PP',row['name'],re.I):category='sewer-installation-components'
        by_sku[row['sku']]={'sku':row['sku'],'name':clean(row['name']),'type':typ,'category':category,'series':series,'model':series,'characteristics':chars,'price':None,'sourcePrice':None,'sourceUrl':row['permalink'],'sourceId':str(row['id']),'sourceCategory':source_category_uk,'primary':'ro-api','roCategory':source_category,'record':row}
    # Exact Romanian SKU enrichment is kept separate from UA factory-suffixed SKUs.
    for item in by_sku.values():
        row=item.get('record') or ro_by_sku.get(item['sku'])
        item['pictures']=source_images(row) if row else []
        if row:
            item['characteristics']=unique_chars(item['characteristics']+attrs_ro(row))
            item['detailUrl']=row['permalink']
        if not item['pictures'] and item['primary']=='ua-xls':
            base=re.sub(r'(?:ПБК|П)$','',item['sku'])
            family=ro_by_sku.get(base)
            if family and source_images(family):
                item['pictures']=source_images(family);item['imageIsFamilyIllustration']=True
        if not item['pictures'] and item.get('roCategory'):
            item['pictures']=family_images.get((item['roCategory'],item['type']),[])[:1]
            if item['pictures']:item['imageIsFamilyIllustration']=True
        if not item['pictures'] and item['series']=='4SILENCE':
            if item['type']=='Хомут каналізаційний':
                item['pdfFallback']='easykit-9-2.webp'
            else:
                kind='MUFA' if item['type']=='Муфта каналізаційна' else None
                candidates=[r for r in english if kind and kind in r['name'].upper() and source_images(r)]
                if candidates:item['pictures']=source_images(candidates[0]);item['imageIsFamilyIllustration']=True
    for item in by_sku.values():
        text=manufacturer_text((item.get('record') or ro_by_sku.get(item['sku']) or {}).get('description',''))
        item['sourceDescription']=text
        item['ukDescription']=technical_translation(text,item)
        if not item['characteristics']:
            item['characteristics']=[{'label':'Система','value':item['series']}]
    tasks={url for item in by_sku.values() for url in item['pictures']}
    images={};failed={}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures={pool.submit(picture_task,url):url for url in tasks}
        for index,future in enumerate(as_completed(futures),1):
            url=futures[future]
            try:images[url]=future.result()
            except Exception as exc:failed[url]=str(exc)
            if index%100==0:print('photos',index,'/',len(tasks),'failed',len(failed),flush=True)
    MEDIA.mkdir(parents=True,exist_ok=True)
    for source in json.loads((CACHE/'sources.json').read_text(encoding='utf-8')):
        if source['file'].endswith('.pdf'):
            shutil.copyfile(CACHE/source['file'],MEDIA/source['file'])
    products=[];titles=Counter();source_counts=Counter()
    for item in by_sku.values():
        local_images=[images[url] for url in item['pictures'] if url in images]
        image_sources=[{'url':url,'local':images[url],'type':'manufacturer-family-illustration' if item.get('imageIsFamilyIllustration') else 'manufacturer-product'} for url in item['pictures'] if url in images]
        if not local_images:
            pdf_image=CACHE/'pdf-images'/item['pdfFallback'] if item.get('pdfFallback') else fallback_pdf(item)
            if pdf_image and pdf_image.exists():
                local='assets/products/valrom/'+pdf_image.name
                shutil.copyfile(pdf_image,ROOT/local)
                local_images=[local];image_sources=[{'type':'manufacturer-catalogue-family-illustration','url':SITE+'/catalog/'+('easykit' if item['series']=='EasyKit' else 'kompactkit'),'local':local,'extractedFrom':pdf_image.name}]
        if not local_images:
            EXCLUDED.append({'source':item['primary'],'sku':item['sku'],'name':item['name'],'reason':'немає перевіреного фото або відповідної ілюстрації виробника'});continue
        item['characteristics']=unique_chars(item['characteristics'])
        title=product_title(item)
        titles[title]+=1
        # Generic catalogue models sometimes have the same dimensions but distinct
        # manufacturer SKUs/material/connection variants. Preserve actual identity.
        if titles[title]>1 or len(item['characteristics'])==0:
            title=clean(title+' '+item['sku'])
        model=item['model'] if item['primary']=='ua-xls' and item['series']=='AquaClean' else item['series']+' '+item['sku']
        short,description,sections=describe(item,title)
        docs=[]
        if item['series']=='EasyKit':docs=[{'title':'Каталог внутрішньої каналізації','type':'catalog','url':'assets/products/valrom/easykit-1.pdf'}]
        elif item['series'] in ('KompactKit','VALPlast') and not re.search(r'PE100|PEHD|ПЕ\b',item['name'],re.I):docs=[{'title':'Каталог зовнішньої каналізації','type':'catalog','url':'assets/products/valrom/kompactkit-1.pdf'}]
        elif item['series']=='AquaClean':docs=[{'title':'Каталог очищення стічних вод','type':'catalog','url':'assets/products/valrom/aquaclean-1.pdf'}]
        filters={};chars={r['label']:r['value'] for r in item['characteristics']}
        # D/DN values from general RO attributes do not prove outside diameter;
        # only the documented UA plastic-pipe D tables populate the OD facet.
        if item['primary']=='ua-xls' and item['category'] in ('internal-sewer-pipes','external-sewer-pipes') and re.fullmatch(r'[\d.,]+ мм',chars.get('Діаметр','')):
            filters['pipeDiameterMm']=num(chars['Діаметр'])
        if 'pipes' in item['category'] and re.fullmatch(r'[\d.,]+ мм',chars.get('Довжина','')):
            filters['pipeLengthMm']=num(chars['Довжина'])
        elif 'pipes' in item['category'] and re.fullmatch(r'[\d.,]+ м',chars.get('Довжина','')):
            filters['pipeLengthMm']=num(chars['Довжина'])*1000
        if item['category'] in ('internal-sewer-fittings','external-sewer-fittings') and re.fullmatch(r'[\d.,]+ °',chars.get('Кут','')):
            filters['angleDegrees']=num(chars['Кут'])
        seo=title+' — купити в ТД «Софіївка»'
        if len(seo)>70:seo=title if len(title)<=70 else title[:67].rsplit(' ',1)[0]+'…'
        seo_desc=title+'. Характеристики, фото й документація для підбору каналізаційного обладнання. ТД «Софіївка».'
        if len(seo_desc)<120:seo_desc+=' Технічний підбір.'
        if len(seo_desc)>160:seo_desc=seo_desc[:157].rsplit(' ',1)[0]+'…'
        products.append({'sourceId':item['sourceId'],'sourceUrl':item.get('detailUrl',item['sourceUrl']),'sourceCategory':item['sourceCategory'],'sku':item['sku'],'model':model,'brand':'valrom','series':item['series'],'title':title,'category':item['category'],'price':item['price'],'priceCurrency':'UAH','vatIncluded':None,'shortDescription':short,'description':description,'sections':sections,'characteristics':item['characteristics'],'filters':filters,'images':local_images,'documents':docs,'seoTitle':seo,'seoDescription':seo_desc,'sourceEvidence':{'primary':item['primary'],'officialSourceUrl':item['sourceUrl'],'sourceName':item['name'],'sourceDescription':item['sourceDescription'],'sourcePrice':item.get('sourcePrice'),'imageSources':image_sources}})
        source_counts[item['primary']]+=1
    output=ROOT/'imports'/f'valrom-{DATE}.json';output.parent.mkdir(exist_ok=True)
    batch={'supplier':'valrom','brand':'valrom','supplierName':'VALROM Україна / VALROM Industrie','collectedAt':DATE,'sourceSite':SITE,'products':products}
    output.write_text(json.dumps(batch,ensure_ascii=False,indent=1),encoding='utf-8')
    report={'officialSites':[SITE,'https://produse.valrom.ro'],'uaRows':len(ua),'uaDuplicateSkus':ua_duplicates,'romanianApiRecords':len(ro),'importProducts':len(products),'sources':source_counts,'categories':Counter(p['category'] for p in products),'photoDownloads':len(images),'photoFailures':failed,'excluded':EXCLUDED,'notes':['UA published XLS is primary; exact manufacturer SKUs are preserved including Ukrainian factory suffixes.','Only source UAH price column is assigned to price; Romanian price defaults and unproven prices remain null.','Global-only cable protection, WC cisterns, vacuum installations and welding machinery are excluded.','PDF images are manufacturer family illustrations, never presented as unique SKU photographs.','SafeKit UA category has no published SKU table; current HDPE sewerage/water-drainage official ranges are represented when data and imagery exist.','Ukrainian descriptions render source applications, construction and documented technical claims. Full original manufacturer descriptions remain in sourceEvidence.sourceDescription for editorial audit; this is not a verbatim translation of every marketing paragraph.','Some official complete pumping-station product pages illustrate the pump rather than the complete chamber assembly; exact source imagery is retained without inventing replacement assemblies.']}
    (ROOT/'imports'/f'valrom-{DATE}.coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=1),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('excluded','photoFailures')},ensure_ascii=False,indent=2))


if __name__=='__main__':build()
