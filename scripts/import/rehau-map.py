"""Deterministic engineering taxonomy routing from official model text/ETIM class."""
import re

PIPE_CLASSES={'Kunststoffrohr glatt','Mehrschichtrohr glatt','Vorisoliertes Kunststoffrohr','Kunststoffrohr gerippt','Drainage-/Infiltrationsrohr','Schutzrohr für Kunststoff-Rohrsystem'}
def is_pipe_product(title,class_name=''):
    if class_name in ['Anschlussgarnitur Wand-WC','Mauerdurchführung für Kabel und Rohre','Durchführformstück','Rohrführungsbogen','Abstandshalter für Installationsrohre/Kabelschutzrohre']:return False
    if class_name in PIPE_CLASSES:return True
    head=re.sub(r'^(?:REHAU\s+)?(?:RAU[A-Za-z0-9_+-]+|AWADUKT)(?:\s+(?:PLUS|flex|stabil|PP|HPP|Thermo|UNO|DUO|S))?\s+','',title,flags=re.I)
    return bool(re.match(r'^(?:REHAU\s+)?(?:Універсальна\s+|Каналізаційна\s+|Композитна\s+|Вентиляційна\s+|Дренажна\s+)?(?:труба|труби|Rohr|Universalrohr|Abflussrohr|Verbundrohr|Lüftungsrohr|Dränrohr|Drainagerohr)\b',head,re.I))

def category(title, class_name='', description=''):
    t=(title+' '+class_name).lower()
    d=description.lower()
    # The official portal also hosts sanitary articles under the separate MEPA brand.
    if re.search(r'\bmepa\b|\borbit\b|varivit|sanicontrol|unimont|air-wc|air wc',t):return None,'separate MEPA sanitary range'
    if class_name=='Dokumentation':return None,'documentation, not a physical engineering product'
    if re.search(r'vorbemerkung|anfahrt|inbetriebnahme|einweisung|dokumentation|statischer nachweis|prüffähige statik|anmeldung für|монтажні послуги',t):return None,'service, calculation or tender text, not a physical engineering product'
    ready_unit=bool(re.match(r'^(?:REHAU\s+)?RAUTHERM\s+Unit\b',title,re.I))
    if not ready_unit and(class_name in ['Schrank für Heizungsverteiler/-sammler','Rahmen für Verteilerschrank','Tür für Verteilerschrank']or re.search(r'verteilerschrank|колекторн[аіу]\s+шаф|розподільч[аіу]\s+шаф|шафа.*колектор|шафа для (?:закритого|відкритого) монтажу|дверцята.*шаф|рам[аик].*шаф',t)):return 'manifold-cabinets',None
    is_pipe=is_pipe_product(title,class_name)
    tool=bool(re.search(r'rautool|aufweitkopf|aufweitzange|presswerkzeug|pressback|pressmansch|schiebegabel|rohrschere|rohrschneider|rohrbieger|lochsäge|bohrkrone|schaber|werkzeug|ladegerät|akku\b|ersatz-messerklinge|drehmoment|gripzange|maulring|bohrständer|rohrschraubstock|abrollvorrichtung|abwickelvorrichtung|aufroller|abroller|schwei(?:ß|ss)(?:gerät|transformator)|drillapparat|розмотувач|розширювач|розширювальн|інструмент|пресувальн|насадк|труборіз|ножиц|скребок|калібруван|зварювальний апарат',t))
    if tool or re.search(r'\bрулетка\b',t):return 'pipe-installation-tools',None
    if class_name=='Anschlussgarnitur Wand-WC':return 'internal-sewer-fittings',None
    if class_name=='Mauerdurchführung für Kabel und Rohre'and not re.search(r'rauvipex|rauvitherm|rauthermex',t):return 'pipe-installation-components',None
    if 'raumat'in t and re.search(r'vlies|геотекст|неткан|geotext|regenwasser|дощов',t+' '+d):return 'stormwater-infiltration-components',None
    if class_name=='Rohrmatte':return 'underfloor-heating',None
    if class_name in ['Kanaldeckel mit Rahmen','Deckel/Gitter für Fahr- und Fußgängerbereiche']:return 'inspection-chambers',None
    # Physical product class wins over accessory mentions such as a sensor port.
    if class_name in ['Kugelhahn','Absperrventil','Strangregulierventil','Elektrisch betätigtes Dreiwegeregelventil','Elektrisch betätigtes Zweiwegeregelventil']:return 'shutoff-valves',None
    if re.search(r'systemsockel|базова станція|системна основа|nea.*basis|nea.*блок',t):return 'zone-control',None
    if re.search(r'taupunkt|точки роси|контролер.*роси',t):return 'heating-sensors-modules',None
    if 'awadukt thermo' in t or 'lüftung' in t or 'lewt ' in t or 'повітр' in t or 'ansaugturm' in t:
        return ('ventilation-ducts' if is_pipe else 'ventilation-components'),None
    if 'raubioxon' in t:return 'wastewater-treatment',None
    if 'rausikko' in t or 'rainspot' in t:
        return ('drainage-pipes' if is_pipe else 'stormwater-infiltration-components'),None
    if 'awaschacht' in t or 'raudren schacht' in t:return 'inspection-chambers',None
    if re.search(r'raupiano|rausilento|rauclamp',t):
        if is_pipe:return 'internal-sewer-pipes',None
        if re.search(r'schelle|хомут|кріплен|манжет|brandmansch|dichtring|lub|мастил|befestig',t):return 'sewer-installation-components',None
        return 'internal-sewer-fittings',None
    if re.search(r'awadukt|awadock|awaconnect|rauvia|nevo',t):
        if is_pipe:return 'external-sewer-pipes',None
        if class_name in ['Kunststoffschacht','Kunststoff-Schachtboden','Schaft für Kunststoffschacht','Schachterhöhung/-reduktion']:return 'inspection-chambers',None
        return 'external-sewer-fittings',None
    if 'raugeo' in t or 'геотерм' in t:return 'geothermal-systems',None
    if re.search(r'rauth ermex|rauthermex|rauvipex|rauvitherm|insulpex|\binpx\b|clip-flex|nexus|raufrigo',t):
        if re.search(r'домовий ввід|будинкове введ|hauseinführung',t):return 'district-heating-components',None
        return ('district-heating-pipes' if is_pipe else 'district-heating-components'),None
    if 're.guard' in t:return 'leak-protection',None
    if class_name=='Raumthermostat' or re.search(r'кімнатн.*регулятор|терморегулятор|raumregler|raumbediengerät',t):return 'room-thermostats',None
    if class_name in ['Thermischer Servomotor','Zonenregler'] or re.search(r'servomotor|сервопривід|nea.*basis|nea.*блок|nea.*r-modul|nea.*u-modul|клемн',t):return 'zone-control',None
    if re.search(r'nea|датчик|fühler|knx|комунікац|sensor',t):return 'heating-sensors-modules',None
    if class_name=='Hydronische Regelstation' or 'насосна група' in t:return 'pump-groups',None
    if class_name in ['Kugelhahn','Absperrventil','Strangregulierventil','Elektrisch betätigtes Dreiwegeregelventil','Elektrisch betätigtes Zweiwegeregelventil'] or re.search(r'кульов.*кран|запірн.*кран',t):return 'shutoff-valves',None
    if class_name in ['Verteiler für hydraulischen Heiz-/Kühlkreislauf','Verteiler (Flüssigkeiten/Gas)'] or re.search(r'колектор|verteiler.*hkv|heizleitungsverteiler',t):return 'distribution-manifolds',None
    if re.search(r'rautherm|raumat|varionova|raufix|rautac|flächenheizung|bodenheiz|verlegeplatte|tacker|тепла підлога|підлогов|стельов|стінов|панель з фіксаторами basic|сухого монтажу на (?:стелі|стіні)',t):return 'underfloor-heating',None
    if is_pipe:return 'water-heating-pipes',None
    if re.search(r'радіатор|heizkörper|радіатор',t):return 'heating-fittings',None
    if class_name.startswith('Fitting') or class_name in ['Anbohrschelle','Wandscheibe','Wandscheibe auf Montageschiene','Aufsteckflansch','Klemmringsatz','Schweißsattel','Schnellkupplung/-gewinde','Kreuzungsfitting'] or re.search(r'кутник|трійник|перехідник|\bмуфта\b|\bзаглушка\b|\bфланець\b|fasupex|smartfuse|schiebehülse|насувна гільза|reduzier|t-stück|kupplung|übergang|winkel',t):return 'pipe-fittings',None
    if class_name in ['Flüssigkeitsströmungsmesser','Wärmezähler','Rohrfedermanometer','Sensor (HVAC)']:return 'pipe-installation-components',None
    return 'pipe-installation-components',None
