"""Whole-batch data gate: provenance, metadata, language, units and real media."""
import collections,hashlib,json,math,re,sys
from pathlib import Path
from PIL import Image
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[2]
batch_path=ROOT/'imports/rehau-2026-11-25.json'
batch=json.loads(batch_path.read_text(encoding='utf8'))
reference=json.loads((ROOT/'imports/reference-wave2-staged.json').read_text(encoding='utf8'))
categories={c['id']:c for c in reference['categories']};attributes=reference['attributes']
errors=[];warnings=[];images={};documents={};seen_skus=set();seen_titles=set();image_types=collections.Counter();filters=collections.Counter()
def error(sku,reason):errors.append({'sku':sku,'reason':reason})
policy=re.compile(r'[^\s@]+@[^\s@]+\.[^\s@]+|https?://|\bBAFA\b|поверненню не підляг|термін поставки|строк поставки|термін постачання|(?:ціна|ціни).{0,20}(?:за|на)\s+запит|^(?:Телефон|Phone|Факс|Fax|Електронна пошта)\s*:',re.I|re.M)
for p in batch['products']:
    sku=p['sku'];title=p['title'];cat=categories.get(p['category'])
    if sku in seen_skus:error(sku,'duplicate SKU')
    if title.casefold()in seen_titles:error(sku,'duplicate title')
    seen_skus.add(sku);seen_titles.add(title.casefold())
    if not re.fullmatch(r'\d{11}',sku):error(sku,'manufacturer SKU is not an exact 11-digit article')
    if not p.get('sourceId')or not p.get('sourceUrl'):error(sku,'missing source identity')
    if not p['sourceEvidence'].get('exactSku')==sku:error(sku,'provenance exact-SKU mismatch')
    if title.upper().count('REHAU')!=1:error(sku,'brand must occur once in title')
    if not p['description'].startswith(title+'.'):error(sku,'description does not begin with the actual title')
    public='\n'.join([title,p['model'],p['description'],p['shortDescription'],p['seoTitle'],p['seoDescription']]+[c['label']+' '+str(c['value'])for c in p['characteristics']])
    # TÜV is the certifier's proper name, not untranslated product prose.
    language_copy=public.replace('TÜV','').replace('Sanitärbox','')
    if re.search('[ыэъёЫЭЪЁäöüÄÖÜßłŁżŻźŹćĆńŃęĘąĄ]',language_copy):error(sku,'untranslated foreign letters in public copy')
    if re.search(r'\b(?:das|des|der|die|als|holder)\b|\bl/min\b',title,re.I):error(sku,'untranslated ordinary source term in title')
    if policy.search(public):error(sku,'contact, source availability/return policy or price promotion in public copy')
    if len(p['shortDescription'])>300:error(sku,'short description exceeds 300 characters')
    if len(p['seoTitle'])>70 or not 120<=len(p['seoDescription'])<=160:error(sku,'SEO length outside standard')
    if p['price']is not None or p['priceCurrency']!='UAH':error(sku,'unverified source price reached UAH storefront field')
    if not cat or not cat.get('leaf')or cat.get('status')!='active':error(sku,'category is not an active leaf')
    for key,value in p['filters'].items():
        filters[key]+=1
        definition=attributes.get(key,{})
        if key not in(cat or{}).get('facets',[]):error(sku,'unsupported category facet '+key)
        if definition.get('type')=='number'and(not isinstance(value,(float,int))or not math.isfinite(value)):error(sku,'invalid numeric filter '+key)
        if definition.get('type')=='select'and value not in definition.get('values',[]):error(sku,'unknown enum '+key+'='+str(value))
        if key in ['pipeLengthMm','pipeDiameterMm','pipeWallThicknessMm','angleDegrees','voltage','outlets','weightKg','flowM3h']and key not in p['sourceEvidence']['normalizedFilterSources']:error(sku,'normalized numeric/variant filter lacks source proof '+key)
    if not p['images']:error(sku,'no verified product illustration')
    for path in p['images']:images.setdefault(path,[]).append(sku)
    for doc in p['documents']:documents.setdefault(doc['url'],[]).append(sku)
    for item in p['sourceEvidence']['gallery']:
        if item.get('path')in p['images']:image_types[item['type']]+=1
    if not p['characteristics']:error(sku,'no technical/catalogue variant characteristics')
for path,skus in images.items():
    file=ROOT/path.lstrip('/')
    if not file.exists():error(skus[0],'missing local image '+path);continue
    with Image.open(file)as im:
        if im.format!='WEBP'or max(im.size)>1600 or file.stat().st_size<1024:error(skus[0],'invalid WebP/dimension/real-media constraint '+path)
for path,skus in documents.items():
    file=ROOT/path.lstrip('/')
    if not file.exists():error(skus[0],'missing local PDF '+path);continue
    with file.open('rb')as stream:
        if stream.read(5)!=b'%PDF-':error(skus[0],'invalid PDF signature '+path)
coverage=json.loads((ROOT/'imports/rehau-coverage-audit.json').read_text(encoding='utf8'))
exclusions={e['sku']for e in coverage['exclusions']}
if exclusions&seen_skus:errors.append({'reason':'published/excluded SKU sets overlap'})
if len(seen_skus)+len(exclusions)!=coverage['sourceUnion']:errors.append({'reason':'resolved source union arithmetic incomplete'})
if coverage['translationGaps']:errors.append({'reason':'unresolved translation gaps remain'})
report={'batchSha256':hashlib.sha256(batch_path.read_bytes()).hexdigest(),'products':len(seen_skus),'resolvedUnion':coverage['sourceUnion'],'excludedResolvedSku':len(exclusions),'errors':errors,'warnings':warnings,'images':len(images),'pdfs':len(documents),'gallerySourceTypes':dict(image_types),'normalizedFilters':dict(filters)}
(ROOT/'imports/rehau-quality-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({**report,'errors':errors[:15]},ensure_ascii=False))
if errors:raise SystemExit(1)
