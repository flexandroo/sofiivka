"""Regression examples from real manufacturer SKU, including model-token guards."""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('titles',Path(__file__).with_name('rehau-titles.py'))
titles=importlib.util.module_from_spec(spec);spec.loader.exec_module(titles)
cases=[
 ('12075581001','REHAU Durchflussmesser DFM 0-6 l/min f. Heizkreisverteiler HKV-D Ms','distribution-manifolds','','Витратомір REHAU'),
 ('14403501001','RAUTHERM NEO Contact Panel Asymmetrical holder 333','underfloor-heating','Zubehör/Ersatzteile für Flächenheizung','Асиметричний тримач панелі REHAU'),
 ('14403601001','RAUTHERM NEO Contact Panel Deflector holder','underfloor-heating','Zubehör/Ersatzteile für Flächenheizung','Поворотний тримач труб панелі REHAU'),
 ('12242441001','RAUDREN Schacht DN 315 Sandfangeinsatz zum Verschließen des Sandfangs','inspection-chambers','','Вставка пісковловлювача REHAU'),
 ('12695861001','REHAU Dränschacht Schachtmuffe DN 315 zur Verbindung von Reststücken der SV','pipe-fittings','Fitting mit 2 Anschlüssen','Муфта колодязя REHAU'),
 ('12196021001','RAUSIKKO SediClean Zulage Mehrhöhe >0,4-1,0 m zum Zu-/Ablaufschacht DN1000','inspection-chambers','Schaft für Kunststoffschacht','Шахта колодязя REHAU'),
 ('12861511002','REHAU Abrollvorrichtung für die Kaltverlegung D10-25 mm','pipe-installation-tools','','Розмотувач REHAU'),
]
for sku,raw,category,kind,head in cases:
    title=titles.title(raw,category,kind)
    assert title.startswith(head),(sku,title)
    assert title.count('REHAU')==1,(sku,title)
    assert not any(word in title.split()for word in ['das','des','der','die','holder']),(sku,title)
model=titles.translate('Durchflussmesser DFM IM S 32 0-8 l/min f.')
assert 'DFM IM S 32'in model and '0-8 л/хв'in model and not model.endswith('f.'),model
assert titles.translate('4.825 m')=='4.825 м','Decimal physical length must not change during title translation'
assert '250 м'in titles.translate('Сигнальна стрічка INSULPEX 250 m'),'A metre unit is not the German abbreviation m. (mit)'
assert 'SDS-max'in titles.translate('Adapter m. SDS-max Aufnahmen'),'Authentic tool interface model survives'
print('REHAU actual-source title regressions: 7 SKU heads, model/unit guards PASS')
