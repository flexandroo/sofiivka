"""Finite source-semantic regression: never publish a contradicted lower bound as MAX."""
import ast,base64,copy,html,importlib.util,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
file=ROOT/'scripts/import/rehau-batch.py';tree=ast.parse(file.read_text(encoding='utf-8'))
nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef)and node.name=='unreliable_max_scalar'
    or isinstance(node,ast.Assign)and any(isinstance(target,ast.Name)and target.id=='MAX_SCALAR_CONFLICT_SKUS'for target in node.targets)]
assert len(nodes)==2
namespace={'re':re};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(file),'exec'),namespace)
should_withdraw=namespace['unreliable_max_scalar'];allowed=namespace['MAX_SCALAR_CONFLICT_SKUS']
spec=importlib.util.spec_from_file_location('rehau_titles_max_qa',ROOT/'scripts/import/rehau-titles.py')
titles=importlib.util.module_from_spec(spec);spec.loader.exec_module(titles)
reference=json.loads((ROOT/'imports/reference-wave2-staged.json').read_text(encoding='utf-8'))
class Taxonomy:
    @staticmethod
    def is_pipe_product(*args):return False
namespace.update({'html':html,'titles':titles,'taxonomy':Taxonomy,'de':{},'q':lambda value:value,'TRANSLATION_GAPS':[],'OMISSIONS':[],
    'labels':json.loads((ROOT/'scripts/import/rehau-label-translations.json').read_text(encoding='utf-8')),
    'values':json.loads((ROOT/'scripts/import/rehau-value-translations.json').read_text(encoding='utf-8')),
    'categories':{c['id']:c for c in reference['categories']},'attributes':reference['attributes'],
    'pdfrows':{},'title_recoveries':{},'norm':lambda value:re.sub(r'\s+',' ',str(value or '')).strip()})
integration_names={'german_number','decimal','clean_value','sealing_cone_angle','variant_bend_angle','build_characteristics','raw_description'}
integration_nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef)and node.name in integration_names]
exec(compile(ast.Module(body=integration_nodes,type_ignores=[]),str(file),'exec'),namespace)
plan=json.loads((ROOT/'imports/overnight-audit/rehau-max-temperature-correction-plan.json').read_text(encoding='utf-8'))
assert {p['sku']for p in plan['products']}==allowed
checked=set();checks=0
for page in sorted((ROOT/'backups/overnight-2026-11-26/live').glob('page-*.json')):
    for encoded in json.loads(page.read_text(encoding='utf-8'))['rows']:
        record=json.loads(base64.b64decode(encoded['row_base64']));sku=record['product']['sku']
        if sku not in allowed:continue
        original=copy.deepcopy(record['sources'][0]['raw_payload']['sourceEvidence'])
        matches=[f for f in original['sourceEtim']['features']if should_withdraw(sku,f,original['sourceDescriptionDe'])]
        assert len(matches)==1 and matches[0]['code']=='EF020023'
        item=next(p for p in plan['products']if p['sku']==sku);source=item['sourceChanges'][0]
        removed=[row for row in source['oldCharacteristics']if row not in source['newCharacteristics']]
        assert removed==[{'label':'Максимальна температура середовища за тривалої роботи','value':'-10 °C'}]
        assert source['newCharacteristics']==[row for row in source['oldCharacteristics']if row not in removed]
        assert item['attributeChanges']==item['productChanges']==[]
        assert record['sources'][0]['raw_payload']['sourceEvidence']==original
        namespace['de'][sku]={'features':{'features':original['sourceEtim']['features']},'texts':{'texts':[{'type':'DESCRIPTION_PLAIN','normalizedText':original['sourceDescriptionDe']}]}}
        rows,filters,_,_=namespace['build_characteristics'](sku,{'shortText':original['sourceTitle']},[],original['sourceEtim']['class']['name'],'district-heating-pipes')
        assert not any(row['label']=='Максимальна температура середовища за тривалої роботи'for row in rows),'Actual collector must omit the contradicted derived row'
        assert not any(key.lower().startswith('maxtemp')for key in filters),'Do not invent a replacement maximum facet'
        assert namespace['de'][sku]['features']['features']==original['sourceEtim']['features'],'Original manufacturer features stay intact'
        checked.add(sku);checks+=8
assert checked==allowed
feature={'code':'EF020023','name':'Max. Mediumtemperatur (Dauerbetrieb)','value':'-10 °C'}
prose='geeignet von -10 °C bis max. 95 °C (gleitend) und 6 bar'
assert should_withdraw('14410171001',feature,prose)
assert not should_withdraw('another-cold-system',feature,prose),'No blanket rule against negative maxima'
assert not should_withdraw('14410171001',{**feature,'value':'95 °C'},prose),'A future corrected manufacturer field must remain usable'
assert not should_withdraw('14410171001',feature,'negative max valid in a different cooling condition'),'Exact contradicting source context is required'
assert not should_withdraw('14410171001',{**feature,'code':'another-code'},prose)
assert not should_withdraw('14410171001',{**feature,'name':'Mediumtemperatur (Dauerbetrieb)','value':'-40 - 50 °C'},prose),'Preserve genuine signed ranges'
checks+=6
print(json.dumps({'status':'PASS','checks':checks,'exactSourceSkus':len(checked),'noInventedMaximum':True,'originalSourceEvidencePreserved':True,'hostedConnections':0}))
