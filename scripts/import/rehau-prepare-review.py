"""Prepare unique manufacturer text/field translation review, with exact SKU refs."""
import collections, html, importlib.util, json, re, sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('rehau_source',Path(__file__).with_name('rehau-collect.py'))
source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
ROOT=source.ROOT;CACHE=source.CACHE
def q(p):return source.product_queries(p or {})
def description(p):
    return next((t.get('normalizedText') or html.unescape(re.sub('<[^>]*>','',t.get('optimizedText',''))) for t in q(p).get('texts',{}).get('texts',[]) if t['type']=='DESCRIPTION_PLAIN'),'').replace('\u00a0',' ')
def template(text):return re.sub(r'\d+(?:[.,]\d+)*','{N}',text)
ua,de=source.all_records('ua'),source.all_records('de')
aligned={};aligned_template={}
for sku in ua.keys()&de.keys():
    a,b=description(ua[sku]),description(de[sku])
    if a and b and re.search('[А-Яа-яІіЇїЄєҐґ]',a):
        aligned.setdefault(b,{'ua':a,'sku':sku})
        an,bn=re.findall(r'\d+(?:[.,]\d+)*',a),re.findall(r'\d+(?:[.,]\d+)*',b)
        if an==bn:aligned_template.setdefault(template(b),{'ua':template(a),'sku':sku,'de':b})
unmapped={};mapped=0
for sku,p in de.items():
    if sku in ua and description(ua[sku]):continue
    text=description(p)
    if text in aligned or template(text) in aligned_template:mapped+=1;continue
    if text:unmapped.setdefault(text,{'de':text,'skus':[],'examples':[]})['skus'].append(sku)
    if text and len(unmapped[text]['examples'])<3:unmapped[text]['examples'].append(q(p).get('base-info',{}).get('baseInfo',{}).get('shortText'))
review={'source':'Official REHAU DE OXOMI3000126, UA3001044','instructions':'Translate the full manufacturer facts faithfully into Ukrainian; keep model/series names and standards. Do not invent performance or promises. Return a JSON map of de text to ua text. Exact same-SKU official UA texts are already preferred.','families':sorted(unmapped.values(),key=lambda v:-len(v['skus']))}
(ROOT/'imports/rehau-translation-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding='utf-8')
(CACHE/'aligned-texts.json').write_text(json.dumps({'exact':aligned,'templates':aligned_template},ensure_ascii=False,indent=2),encoding='utf-8')
print('UA',len(ua),'DE',len(de),'aligned exact',len(aligned),'templates',len(aligned_template),'DEonly auto-mapped products',mapped,'remaining families',len(unmapped),'products',sum(len(v['skus'])for v in unmapped.values()),flush=True)
labels=collections.Counter(f['name'] for p in de.values() for f in q(p).get('features',{}).get('features',[]))
values=collections.Counter(f['value'] for p in de.values() for f in q(p).get('features',{}).get('features',[]) if re.search(r'[a-zäöüß]{3}',f['value'],re.I) and not re.fullmatch(r'(?:DN|PN|SDR|PE|PP|PVC|EPDM|PPSU|PVDF|NBR|PE-Xa|PE-Xc|PE-Xe|SBR|POM|FKM|PE-RT|FPM|PE-HD|PE100|ABS|HDPE|VPE|PTFE|PPO|PBT|PFA|VA|GRP|TPE|FKM|EVOH|Al|IP|RAL|CC|CW|Cu|Sn|Zn|Ni|DIN|ISO|EN|BSP|R|Rp|G|DN/OD|DN/ID)[\s\d.,xX×/()+-]*',f['value']))
(ROOT/'imports/rehau-field-translation-review.json').write_text(json.dumps({'labels':[{'de':s,'count':n}for s,n in labels.most_common()],'values':[{'de':s,'count':n}for s,n in values.most_common()]},ensure_ascii=False,indent=2),encoding='utf-8')
print('Labels',len(labels),'textvalues',len(values),flush=True)
spec=importlib.util.spec_from_file_location('title_map',Path(__file__).with_name('rehau-titles.py'))
titles=importlib.util.module_from_spec(spec);spec.loader.exec_module(titles)
spec=importlib.util.spec_from_file_location('taxonomy',Path(__file__).with_name('rehau-map.py'))
taxonomy=importlib.util.module_from_spec(spec);spec.loader.exec_module(taxonomy)
rows=[];words=collections.Counter()
for sku in sorted(ua.keys()|de.keys()):
    p=ua.get(sku)or de[sku];base=q(p).get('base-info',{}).get('baseInfo',{});original=base.get('shortText','')
    cat,reason=taxonomy.category(original,q(de.get(sku)).get('features',{}).get('class',{}).get('name',''))
    if not cat:continue
    translated=titles.title(original,cat)
    rows.append({'sku':sku,'source':original,'title':translated,'category':cat,'sourceUrl':base.get('datasheetUrl')})
    for token in re.findall('[A-Za-zÄÖÜäöüß]+',translated):
        if len(token)>2 and not token.isupper():words[token]+=1
(ROOT/'imports/rehau-title-review.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
(CACHE/'title-residual-words.tsv').write_text('\n'.join(str(n)+'\t'+s for s,n in words.most_common()),encoding='utf-8')
print('Title review',len(rows),'Latin tokens',len(words),flush=True)
