"""Summarise cached authoritative REHAU source data without network access."""
import collections, html, json, re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'tmp/rehau-source'
def load(lang):
    records={}
    for path in sorted((CACHE/f'details-{lang}').glob('*.json')):
        for p in json.loads(path.read_text(encoding='utf-8-sig'))['products']:
            if p.get('resolved'):records[p['itemNumber']]=p
    return records
def queries(p):return {q['name']:q for q in p.get('queries',[])}
def text(p):
    q=queries(p)
    return next((t.get('normalizedText') or html.unescape(re.sub('<[^>]+>','',t.get('optimizedText',''))) for t in q.get('texts',{}).get('texts',[]) if t['type']=='DESCRIPTION_PLAIN'),'')
if __name__=='__main__':
    ua,de=load('ua'),load('de')
    print('Resolved UA',len(ua),'DE',len(de),'union',len(ua.keys()|de.keys()),'UAonly',len(ua.keys()-de.keys()),flush=True)
    for lang,items in [('ua',ua),('de',de)]:
        print(lang,'brand',collections.Counter(queries(p).get('base-info',{}).get('baseInfo',{}).get('brandName') for p in items.values()),flush=True)
        print(lang,'classes',collections.Counter(queries(p).get('features',{}).get('class',{}).get('name') for p in items.values()),flush=True)
        stems=collections.Counter(re.split(r'\s+\d',queries(p).get('base-info',{}).get('baseInfo',{}).get('shortText',''))[0] for p in items.values())
        (CACHE/f'{lang}-stems.tsv').write_text('\n'.join(str(n)+'\t'+s for s,n in stems.most_common()),encoding='utf-8')
        (CACHE/f'{lang}-texts.json').write_text(json.dumps(list({text(p) for p in items.values()}),ensure_ascii=False,indent=2),encoding='utf-8')
    features=collections.Counter((f['name'],f['value']) for p in de.values() for f in queries(p).get('features',{}).get('features',[]))
    names=collections.Counter(f['name'] for p in de.values() for f in queries(p).get('features',{}).get('features',[]))
    (CACHE/'feature-labels.tsv').write_text('\n'.join(str(n)+'\t'+s for s,n in names.most_common()),encoding='utf-8')
    (CACHE/'feature-values.tsv').write_text('\n'.join(str(n)+'\t'+s+'\t'+v for (s,v),n in features.most_common()),encoding='utf-8')
    print('Distinct ETIM labels',len(names),'values',len(features),'DE descriptions',len({text(p) for p in de.values()}),'UA descriptions',len({text(p) for p in ua.values()}),flush=True)
