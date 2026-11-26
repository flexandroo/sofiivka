"""Regression examples from real manufacturer SKU, including model-token guards."""
import importlib.util
import ast
import json
import re
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

# Technical values use this same translator; a removed minus reverses the lower
# bound rather than merely changing presentation. Exercise the actual adapter
# clean_value function without importing its cache-reading/batch-writing module.
batch_path=Path(__file__).with_name('rehau-batch.py')
batch_ast=ast.parse(batch_path.read_text(encoding='utf-8'))
clean_node=next(node for node in batch_ast.body if isinstance(node,ast.FunctionDef)and node.name=='clean_value')
namespace={'titles':titles,'re':re,'values':json.loads(Path(__file__).with_name('rehau-value-translations.json').read_text(encoding='utf-8'))}
exec(compile(ast.Module(body=[clean_node],type_ignores=[]),str(batch_path),'exec'),namespace)
clean_value=namespace['clean_value']
signed_cases=[
    ('-70...90','-70...90'),
    ('-20...120','-20...120'),
    ('-40...90 °C','-40...90 °C'),
    ('-70 ... 90 ° C','-70... 90 °C'),
    ('-0,5...+0,5 bar','-0,5...+0,5 бар'),
    ('-10 - -5 °C','-10 - -5 °C'),
    ('-5 V','-5 В'),
    ('-.5...+.5 bar','-.5...+.5 бар'),
    ('- 20...+70 °C','- 20...+70 °C'),
    ('−20...+70 °C','−20...+70 °C'),
    ('–20...+70 °C','–20...+70 °C'),
    ('+5...+60 °C','+5...+60 °C'),
    ('0-8 l/min','0-8 л/хв'),
    ('20-25 mm','20-25 мм'),
]
for raw,expected in signed_cases:
    actual=clean_value(raw)
    assert actual==expected,(raw,actual,expected)
assert titles.translate(' ,; --- Rohr ;,-')=='труба','Decorative heading punctuation is still trimmed'
assert titles.translate(' - RAUTHERM S 17 x 2 ;-')=='RAUTHERM S 17 × 2','Heading hyphen is not a model character'
assert titles.translate(' ; -20...+90 ; -')=='-20...+90','Outer punctuation must not expose and then strip a numeric sign'
assert titles.translate('SDS-max D10-25')=='SDS-max D10-25','Internal model hyphens and positive ranges survive'
assert clean_value('NEA SMART 2.0 24 V')=='NEA SMART 2.0 24 В','Positive model/version numbers and their unit survive'
print('REHAU actual-source title regressions: 7 SKU heads, model/unit guards, 14 signed/range values, heading/model punctuation PASS')
