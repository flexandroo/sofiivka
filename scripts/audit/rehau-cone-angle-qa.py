"""Exercise actual adapter functions without importing its batch-writing module."""
import ast,copy,html,importlib.util,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
batch_path=ROOT/'scripts/import/rehau-batch.py'
tree=ast.parse(batch_path.read_text(encoding='utf-8'))
spec=importlib.util.spec_from_file_location('rehau_titles',ROOT/'scripts/import/rehau-titles.py')
titles=importlib.util.module_from_spec(spec);spec.loader.exec_module(titles)
labels=json.loads((ROOT/'scripts/import/rehau-label-translations.json').read_text(encoding='utf-8'))
values=json.loads((ROOT/'scripts/import/rehau-value-translations.json').read_text(encoding='utf-8'))
reference=json.loads((ROOT/'imports/reference-wave2-staged.json').read_text(encoding='utf-8'))
class Taxonomy:
    @staticmethod
    def is_pipe_product(*args):return False
namespace={'re':re,'html':html,'titles':titles,'labels':labels,'values':values,'taxonomy':Taxonomy,'de':{},'q':lambda x:x,
    'TRANSLATION_GAPS':[],'OMISSIONS':[],'pdfrows':{},'title_recoveries':{},'norm':lambda value:re.sub(r'\s+',' ',str(value or '')).strip(),
    'categories':{c['id']:c for c in reference['categories']},'attributes':reference['attributes']}
names={'german_number','decimal','clean_value','sealing_cone_angle','variant_bend_angle','build_characteristics','unreliable_max_scalar','raw_description'}
nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef)and node.name in names
    or isinstance(node,ast.Assign)and any(isinstance(target,ast.Name)and target.id=='MAX_SCALAR_CONFLICT_SKUS'for target in node.targets)]
assert len(nodes)==len(names)+1
exec(compile(ast.Module(body=nodes,type_ignores=[]),str(batch_path),'exec'),namespace)
checks=0
for text in ['Трійник з конусом SDR 11 32 - G 1/2 - 32, 60°','Eurokonus 60 Grad','Adapter mit Konus 60°']:
    assert namespace['sealing_cone_angle'](text)==60
    assert namespace['variant_bend_angle'](text)is None;checks+=2
assert namespace['variant_bend_angle']('RAUPIANO PLUS Відвід DN 50, 87,5°')['value']==87.5;checks+=1
assert namespace['variant_bend_angle']('AWADUKT PP Abzweig DN 250/200, 90 Grad')['value']==90;checks+=1
targets={'11691691001','12446161001','12446661001'};covered=set()
for page in sorted((ROOT/'backups/overnight-2026-11-26/live').glob('page-*.json')):
    import base64
    for encoded in json.loads(page.read_text(encoding='utf-8'))['rows']:
        record=json.loads(base64.b64decode(encoded['row_base64']))
        sku=record['product']['sku']
        if sku not in targets:continue
        e=record['sources'][0]['raw_payload']['sourceEvidence'];features=e['sourceEtim']['features']
        original=copy.deepcopy(features);namespace['de'][sku]={'features':{'features':features}}
        rows,filters,_,proof=namespace['build_characteristics'](sku,{'shortText':e['sourceTitle']},[],e['sourceEtim']['class']['name'],'pipe-fittings')
        assert features==original
        assert next(row['value']for row in rows if row['label']=='Кут конуса')=='60 °'
        assert all(not(row['label']in ['Кут','Кут відводу']and row['value']=='60 °')for row in rows)
        if sku=='12446661001':
            assert 'angleDegrees'not in filters
            assert not any(row['label']in [labels['Winkel'],labels['Winkel des Bogens']]for row in rows)
        else:
            assert filters['angleDegrees']==90
            assert proof['angleDegrees']['source']=='ETIM exact SKU'
            assert next(row['value']for row in rows if row['label']==labels['Winkel'])=='90 °'
        covered.add(sku);checks+=7
assert covered==targets
print(json.dumps({'status':'PASS','checks':checks,'exactManufacturerSkus':sorted(covered),'frozenBatchRegenerated':False,'hostedConnections':0}))
