"""Read-only reproducible REHAU official OXOMI source collector.

The UA portal is linked by water.rehau.com/ua-uk/poshuk-produktiv.
No credentials, stock or remote mutations are used. Cached public responses are
kept in ignored tmp/rehau-source; publication is handled separately.
"""
import concurrent.futures as cf
import hashlib, html, json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.stdout.reconfigure(encoding='utf-8')
CACHE = ROOT / 'tmp/rehau-source'
OUT = ROOT / 'imports'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(exist_ok=True)
HOST = 'https://oxomi.com'
PORTALS = {'ua': '3001044', 'de': '3000126'}
QUERIES = ['base-info', 'texts', 'features', 'product-images', 'attachments', 'measurements', 'pages', 'relationships']

def scrub(value):
    if isinstance(value, dict):
        return {k: scrub(v) for k,v in value.items() if not re.search(r'token|licenseKey|aiAssistantUrl', k, re.I)}
    if isinstance(value, list): return [scrub(v) for v in value]
    return value

def request(path, params, cachefile, body=None):
    target = CACHE / cachefile
    if target.exists(): return json.loads(target.read_text(encoding='utf-8-sig'))
    url = HOST + path + '?' + urllib.parse.urlencode(params, doseq=True)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                headers={'User-Agent':'Mozilla/5.0', **({'Content-Type':'application/json'} if body is not None else {})})
            with urllib.request.urlopen(req, timeout=60) as r: result = json.load(r)
            if result.get('error') or not result.get('success', True): raise ValueError(str(result.get('message')))
            result = scrub(result)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
            return result
        except Exception:
            if attempt == 3: raise
            time.sleep(1 + attempt * 2)

def extract_products(result):
    records = {}
    for section in result.get('sections', []):
        markup = html.unescape(section.get('parameters', {}).get('html', ''))
        for product_id, sku in re.findall(r"productId: '([^']+)', supplierItemNumber: '([^']+)'", markup):
            records[sku] = {'sku':sku, 'productId':product_id}
    return records

def inventory():
    ua = request('/portals/api/v1/universal-search/search', {'portal':PORTALS['ua'], 'query':'REHAU', 'hint':'PRODUCTS', 'displayedResults':'catalogs,items', 'limit':5000}, 'ua-index.json')
    de = request('/portals/api/v1/navigator-pro/search', {'portal':PORTALS['de'], 'query':'', 'hint':'PRODUCTS', 'page':1}, 'de-index-1.json')
    pages = next(s['parameters']['totalPages'] for s in de['sections'] if s['type']=='paging')
    records = extract_products(de)
    def page(n):
        return n, request('/portals/api/v1/navigator-pro/search', {'portal':PORTALS['de'], 'query':'', 'hint':'PRODUCTS', 'page':n}, f'de-index-{n}.json')
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for n,result in pool.map(page, range(2,pages+1)):
            records.update(extract_products(result))
            print('DE page',n,'unique',len(records),flush=True)
    # UA legacy search clips variant cards. Family queries only seed discovery;
    # the independent source-word/variant closure must prove completeness later.
    ua_records = extract_products(ua)
    families = ['RAUTITAN','FASTLOC','RAUPIANO','RAUSILENTO','RAUTHERM','NEA','RAUVIPEX','RAUVITHERM','RAUTOOL','RAUPEX','FUSAPEX','AWADUKT','AWASCHACHT','AWADOCK','AWACONNECT','RAUSIKKO','RAINSPOT','RAUGEO','RAUVIA','RAUBIOXON','SMARTFUSE','CLIP-FLEX','NEXUS','RE.GUARD','RE.SOURCE','THERMO']
    def ua_query(q):
        return q, request('/portals/api/v1/universal-search/search', {'portal':PORTALS['ua'], 'query':q, 'hint':'PRODUCTS', 'displayedResults':'catalogs,items', 'limit':5000}, 'ua-query-'+re.sub(r'[^a-z0-9]','-',q.lower())+'.json')
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for q,result in pool.map(ua_query, families):
            found=extract_products(result); ua_records.update(found)
            print('UA family',q,'matched',result.get('metadata',{}).get('products'),'cards',len(found),'unique',len(ua_records),flush=True)
    docids={}
    for section in ua['sections']:
        markup=html.unescape(section.get('parameters',{}).get('html',''))
        for doc in re.findall(r"openDocument\(\{document: '([0-9]+)'",markup): docids[doc]=True
    (CACHE/'inventory.json').write_text(json.dumps({'uaExpected':ua['metadata']['products'],'deExpected':de['metadata']['products'],'de':list(records.values()),'ua':list(ua_records.values()),'uaDocuments':list(docids)},ensure_ascii=False,indent=2),encoding='utf-8')
    print('INVENTORY',len(records),'DE;',len(ua_records),'UA;',len(docids),'UA documents',flush=True)

def docs():
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf-8'))
    infos=[]
    def one(doc):
        r=request('/portals/api/v1/document/details',{'portal':PORTALS['ua'],'document':doc},f'documents/{doc}.json')
        return {'id':doc,'name':r['common']['contentName'],'type':r['common']['contentType'],'archived':r['common']['archived'],'pages':r['specific']['numberOfPages'],'downloadUrl':r['specific'].get('downloadUrl'),'toc':r['specific'].get('toc',[])}
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for info in pool.map(one,inv['uaDocuments']): infos.append(info)
    (CACHE/'documents.json').write_text(json.dumps(infos,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(infos,ensure_ascii=False,indent=2),flush=True)

def details():
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf-8'))
    skus=sorted({r['sku'] for r in inv['ua']+inv['de']})
    # Same SKU, same manufacturer; UA text is primary, DE ETIM is enrichment.
    def batch(job):
        lang,index,subset=job
        params={'portal':PORTALS[lang],'queries':QUERIES,'language':'uk' if lang=='ua' else 'de'}
        for i,sku in enumerate(subset,1): params['itemNumber'+str(i)]=sku;params['supplierNumber'+str(i)]='-'
        result=request('/portals/api/v1/product/data',params,f'details-{lang}/{index:04}.json')
        return lang,index,len(result['products']),sum(bool(p.get('resolved')) for p in result['products'])
    jobs=[(lang,i,skus[i*29:(i+1)*29]) for lang in ['ua','de'] for i in range((len(skus)+28)//29)]
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for lang,i,count,resolved in pool.map(batch,jobs):
            if i%10==0:print('DETAILS',lang,i,count,resolved,flush=True)

def complete_inventory():
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf-8'))
    ua_records={r['sku']:r for r in inv['ua']}
    de_records={r['sku']:r for r in inv['de']}
    def de_page(n):
        return request('/portals/api/v1/navigator-pro/search',{'portal':PORTALS['de'],'query':'','hint':'PRODUCTS','page':n,'outputMode':'TABLE','hideStories':'true'},f'de-table-{n}.json')
    first=de_page(1)
    pages=next(s['parameters']['totalPages'] for s in first['sections'] if s['type']=='paging')
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for n,result in enumerate(pool.map(de_page,range(1,pages+1)),1):
            de_records.update(extract_products(result))
            if n%10==0:print('DE table',n,'unique',len(de_records),flush=True)
    # Prefix searches expand discovery where cards clip. The server normalizes
    # wildcards fuzzily: these counts are not an additive SKU partition.
    queue=[str(n) for n in range(100,200)]
    stats=[]
    def ua_prefix(prefix):
        result=request('/portals/api/v1/universal-search/search',{'portal':PORTALS['ua'],'query':prefix+'*','hint':'PRODUCTS','displayedResults':'catalogs,items','limit':5000,'hideStories':'true'},f'ua-prefix/{prefix}.json')
        return prefix,result
    for depth in range(3,8):
        next_queue=[]
        with cf.ThreadPoolExecutor(max_workers=4) as pool:
            for prefix,result in pool.map(ua_prefix,queue):
                found=extract_products(result);ua_records.update(found)
                total=result.get('metadata',{}).get('products',0)
                stats.append({'prefix':prefix,'matched':total,'cards':len(found)})
                if total>len(found):next_queue.extend(prefix+str(d) for d in range(10))
        print('UA prefixes depth',depth,'queries',len(queue),'unique',len(ua_records),'split',len(next_queue)//10,flush=True)
        queue=next_queue
        if not queue:break
    inv.update({'ua':list(ua_records.values()),'de':list(de_records.values()),'uaPrefixChecks':stats})
    (CACHE/'inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2),encoding='utf-8')
    print('COMPLETE INVENTORY',len(ua_records),len(de_records),flush=True)

def complete_details():
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf-8'))
    skus={r['sku'] for r in inv['ua']+inv['de']}
    jobs=[]
    for lang in ['ua','de']:
        seen=set()
        for f in (CACHE/f'details-{lang}').glob('*.json'):
            seen.update(p['itemNumber'] for p in json.loads(f.read_text(encoding='utf-8-sig'))['products'])
        missing=sorted(skus-seen)
        print('Missing details',lang,len(missing),flush=True)
        for i in range(0,len(missing),29):jobs.append((lang,missing[i:i+29]))
    def batch(job):
        lang,subset=job
        params={'portal':PORTALS[lang],'queries':QUERIES,'language':'uk' if lang=='ua' else 'de'}
        for i,sku in enumerate(subset,1):params['itemNumber'+str(i)]=sku;params['supplierNumber'+str(i)]='-'
        result=request('/portals/api/v1/product/data',params,f'details-{lang}/extra-{hashlib.sha256(chr(10).join(subset).encode()).hexdigest()[:20]}.json')
        if len(result['products'])!=len(subset):raise ValueError('Truncated product-data batch')
        return lang,len(subset)
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for n,result in enumerate(pool.map(batch,jobs),1):
            if n%10==0:print('EXTRA DETAILS',n,result,flush=True)

def download_docs():
    infos=json.loads((CACHE/'documents.json').read_text(encoding='utf-8'))
    dest=ROOT/'assets/products/rehau/documents';dest.mkdir(parents=True,exist_ok=True)
    def one(info):
        if 'MEPA' in info['name'] or 'Unimont' in info['name']:return None
        if info['type'] not in ['pricelist','technical_information','instruction','manual','certificate','catalog']:return None
        url=info['downloadUrl']
        path=dest/(info['id']+'.pdf')
        if not path.exists():
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=120) as r:data=r.read()
                    if not data.startswith(b'%PDF'):raise ValueError('not PDF')
                    path.write_bytes(data);break
                except Exception:
                    if attempt==2:raise
                    time.sleep(2+attempt)
        if not path.read_bytes().startswith(b'%PDF'):raise ValueError('invalid cached PDF')
        info.update({'localPath':path.relative_to(ROOT).as_posix(),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        return info
    results=[]
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(one,infos):
            if result:results.append(result);print('PDF',result['id'],result['bytes'],result['name'],flush=True)
    (CACHE/'documents-downloaded.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')

def pdf_inventory():
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf-8'))
    records={p['sku']:p for p in inv['ua']}
    evidence={}
    for file in CACHE.glob('*.txt'):
        if not file.stem.isdigit():continue
        for page_no,page in enumerate(file.read_text(encoding='utf-8').split('\f'),1):
            for line in page.splitlines():
                match=re.match(r'^\s*(\d{11})\s+(.+)',line)
                if match:
                    sku=match[1]
                    evidence.setdefault(sku,[]).append({'document':file.stem,'page':page_no,'row':line.strip()})
                    records.setdefault(sku,{'sku':sku,'productId':None})
    (CACHE/'pdf-sku-rows.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    inv['ua']=list(records.values());inv['uaPdfSkus']=len(evidence)
    (CACHE/'inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2),encoding='utf-8')
    print('UA inventory with official PDF rows',len(records),'PDF',len(evidence),flush=True)

def all_records(lang):
    records={}
    for f in sorted((CACHE/f'details-{lang}').glob('*.json')):
        for p in json.loads(f.read_text(encoding='utf-8-sig'))['products']:
            if p.get('resolved'):records[p['itemNumber']]=p
    return records

def product_queries(product):return {q['name']:q for q in product.get('queries',[])}

def media():
    from PIL import Image,ImageOps
    import io
    ua,de=all_records('ua'),all_records('de')
    jobs={}
    for sku in sorted(ua.keys()|de.keys()):
        for lang,product in [('ua',ua.get(sku)),('de',de.get(sku))]:
            if not product:continue
            q=product_queries(product)
            for item in q.get('product-images',{}).get('images',[]):
                url=item.get('downloadUrl') or item.get('hdImageUrl')
                if not url:continue
                key=item.get('fingerprint') or hashlib.sha256(url.encode()).hexdigest()[:24]
                jobs.setdefault(key,{'key':key,'url':url,'filename':item.get('filename'),'type':item.get('type'),'references':[]})['references'].append({'sku':sku,'lang':lang})
    dest=ROOT/'assets/products/rehau/images';dest.mkdir(parents=True,exist_ok=True)
    def one(item):
        path=dest/(item['key'].lower()+'.webp')
        try:
            if not path.exists():
                for attempt in range(4):
                    try:
                        with urllib.request.urlopen(urllib.request.Request(item['url'],headers={'User-Agent':'Mozilla/5.0'}),timeout=60) as r:data=r.read()
                        if data.startswith(b'%PDF'):
                            docpath=ROOT/'assets/products/rehau/documents'/('gallery-'+item['key'].lower()+'.pdf')
                            docpath.parent.mkdir(parents=True,exist_ok=True);docpath.write_bytes(data)
                            item.update({'documentPath':docpath.relative_to(ROOT).as_posix(),'note':'official gallery entry is a PDF technical drawing, retained as a document rather than an image','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
                            return item
                        im=ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
                        im.thumbnail((1600,1600),Image.Resampling.LANCZOS)
                        if im.mode not in ['RGB','RGBA']:im=im.convert('RGBA' if 'transparency' in im.info else 'RGB')
                        im.save(path,'WEBP',quality=90,method=6)
                        break
                    except Exception:
                        if attempt==3:raise
                        time.sleep(1+attempt)
            with Image.open(path) as im:
                if max(im.size)>1600 or im.format!='WEBP':raise ValueError('image constraints')
                item.update({'path':path.relative_to(ROOT).as_posix(),'width':im.width,'height':im.height,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        except Exception as e:item['error']=str(e)
        return item
    results=[]
    print('UNIQUE GALLERY MEDIA',len(jobs),flush=True)
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        for n,result in enumerate(pool.map(one,jobs.values()),1):
            results.append(result)
            if n%100==0:print('MEDIA',n,'of',len(jobs),'errors',sum('error'in r for r in results),flush=True)
    (CACHE/'media.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')

def global_docs():
    de=all_records('de');docrefs={}
    for sku,p in de.items():
        for doc in product_queries(p).get('pages',{}).get('documents',[]):
            if not doc.get('outdated'):docrefs.setdefault(doc['id'],{'doc':doc,'skus':[]})['skus'].append(sku)
    print('Unique global linked documents',len(docrefs),flush=True)
    dest=ROOT/'assets/products/rehau/documents';dest.mkdir(parents=True,exist_ok=True)
    def one(item):
        doc_id,item=item
        try:
            r=request('/portals/api/v1/document/details',{'portal':PORTALS['de'],'document':doc_id},f'documents-de/{doc_id}.json')
            if r['common'].get('archived'):return None
            url=r['specific'].get('downloadUrl')
            if not url:return {**item,'error':'download disabled'}
            path=dest/(doc_id+'.pdf')
            if not path.exists():
                with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=180) as response:data=response.read()
                if not data.startswith(b'%PDF'):raise ValueError('not PDF')
                path.write_bytes(data)
            return {'id':doc_id,'name':r['common']['contentName'],'type':r['common']['contentType'],'sourceUrl':url,'path':path.relative_to(ROOT).as_posix(),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'skus':item['skus']}
        except Exception as e:return {'id':doc_id,'name':item['doc'].get('name'),'error':str(e),'skus':item['skus']}
    results=[]
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for n,item in enumerate(pool.map(one,docrefs.items()),1):
            if item:results.append(item);print('GLOBAL PDF',n,item.get('id'),item.get('bytes'),item.get('error',''),flush=True)
    (CACHE/'documents-global-downloaded.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')

def recovery_media():
    from PIL import Image,ImageOps
    import subprocess
    from pypdf import PdfReader
    entries=json.loads((ROOT/'scripts/import/rehau-image-recoveries.json').read_text(encoding='utf8'))
    for name in ['rehau-recovered-title-image-recoveries.json','rehau-new24-image-recoveries.json']:
        extra=ROOT/'scripts/import'/name
        if extra.exists():entries+=json.loads(extra.read_text(encoding='utf8'))
    results=[]
    for item in entries:
        original=ROOT/(item.get('localOriginal')or item.get('localPreview'));path=ROOT/item['proposedImage']['path'];path.parent.mkdir(parents=True,exist_ok=True)
        # Recoveries remain reproducible when ignored review previews are absent.
        if not original.exists():
            original.parent.mkdir(parents=True,exist_ok=True)
            proposed=item['proposedImage']
            if proposed['kind']=='original':
                with urllib.request.urlopen(item['originalUrl'],timeout=60)as response:original.write_bytes(response.read())
            else:
                pdf=ROOT/item['localPdf']
                if not pdf.exists():
                    pdf.parent.mkdir(parents=True,exist_ok=True)
                    with urllib.request.urlopen(item['originalUrl'],timeout=120)as response:data=response.read()
                    if not data.startswith(b'%PDF-'):raise ValueError('Recovery source is not PDF')
                    pdf.write_bytes(data)
                if proposed['kind']=='pdf-embedded':
                    page=PdfReader(pdf).pages[proposed['page']-1]
                    image=next(i for i in page.images if i.indirect_reference.idnum==proposed['xref'])
                    original.write_bytes(image.data)
                elif proposed['kind']=='pdf-crop':
                    scale=proposed['renderScale'];x0,y0,x1,y1=proposed['bbox'];prefix=original.with_suffix('')
                    subprocess.run(['pdftoppm','-f',str(proposed['page']),'-l',str(proposed['page']),'-r',str(72*scale),'-x',str(round(x0*scale)),'-y',str(round(y0*scale)),'-W',str(round((x1-x0)*scale)),'-H',str(round((y1-y0)*scale)),'-singlefile','-png',str(pdf),str(prefix)],check=True)
                else:raise ValueError('Unsupported verified recovery kind')
        im=ImageOps.exif_transpose(Image.open(original));im.thumbnail((1600,1600),Image.Resampling.LANCZOS)
        if im.mode not in ['RGB','RGBA']:im=im.convert('RGB')
        lossless='lossless'in str(item.get('proposedImage',{}).get('encoder','')).lower()or item['sku']=='15562281002'
        if not path.exists():
            im.save(path,'WEBP',quality=90,method=6,lossless=lossless)
            if path.stat().st_size<1024:im.save(path,'WEBP',lossless=True,method=6)
        if path.stat().st_size<1024:raise ValueError('Verified drawing below importer size heuristic: '+str(path))
        results.append({**item,'path':path.relative_to(ROOT).as_posix(),'width':im.width,'height':im.height,'bytes':path.stat().st_size,'outputSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    (CACHE/'recovery-media.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
    print('Recovered image entries',len(results),'SKU',len({r['sku']for r in results}),'files',len({r['path']for r in results}),flush=True)

def ua_variants():
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf8'))
    records={p['sku']:p for p in inv['ua']}
    known=all_records('ua');checked=set()
    for file in (CACHE/'ua-variants').glob('*.json'):
        checked.update(p['itemNumber']for p in json.loads(file.read_text(encoding='utf8'))['products'])
    skus=sorted(known.keys()-checked)
    jobs=[skus[i:i+29]for i in range(0,len(skus),29)]
    found={};relations={}
    def absorb(result):
        for p in result.get('products',[]):
            for query in p.get('queries',[]):
                markup=html.unescape(query.get('html',''))
                for variant in re.findall(r'oxomi-product-item-number-js[^>]*>\s*(\d{11})\s*<',markup):
                    found.setdefault(variant,{'sku':variant,'productId':None});relations.setdefault(variant,[]).append(p['itemNumber'])
    for file in (CACHE/'ua-variants').glob('*.json'):absorb(json.loads(file.read_text(encoding='utf8')))
    def one(subset):
        params={'portal':PORTALS['ua'],'queries':'variants-html'}
        for i,sku in enumerate(subset,1):params['itemNumber'+str(i)]=sku;params['supplierNumber'+str(i)]='-'
        return request('/portals/api/v1/product/data',params,'ua-variants/'+hashlib.sha256('\n'.join(subset).encode()).hexdigest()[:24]+'.json')
    with cf.ThreadPoolExecutor(max_workers=4)as pool:
        for n,result in enumerate(pool.map(one,jobs),1):
            absorb(result)
            if n%20==0:print('UA VARIANT BATCH',n,'unique',len(found),flush=True)
    new=sorted(found.keys()-known.keys())
    records.update(found)
    all_new=sorted(set(inv.get('uaVariantExpansion',{}).get('newSkus',[]))|set(new))
    inv['ua']=list(records.values());inv['uaVariantExpansion']={'knownResolved':len(known),'variantsUnique':len(found),'newSkus':all_new,'lastNewSkus':new,'checkedSkus':len(checked)+len(skus)}
    (CACHE/'inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2),encoding='utf8')
    (CACHE/'ua-variant-relations.json').write_text(json.dumps({'newSkus':new,'relations':{k:sorted(set(v))for k,v in relations.items()}},ensure_ascii=False,indent=2),encoding='utf8')
    print('UA VARIANT COMPLETE','unique',len(found),'new',len(new),flush=True)

def additional_media():
    from PIL import Image,ImageOps
    import io
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf8'))
    cached=json.loads((CACHE/'media.json').read_text(encoding='utf8'));existing={m['key']:m for m in cached}
    ua,de=all_records('ua'),all_records('de');jobs={}
    for sku in sorted(set(inv.get('uaVariantExpansion',{}).get('newSkus',[]))|set(inv.get('uaCompletenessExpansion',{}).get('engineeringSkus',[]))):
        product=ua.get(sku)or de.get(sku)
        if not product:continue
        fields=product_queries(product)
        if any('MEPA'in d['name']for d in fields.get('pages',{}).get('documents',[])):continue
        for lang,p in [('ua',ua.get(sku)),('de',de.get(sku))]:
            if not p:continue
            for item in product_queries(p).get('product-images',{}).get('images',[]):
                url=item.get('downloadUrl')or item.get('hdImageUrl')
                key=item.get('fingerprint')or hashlib.sha256(url.encode()).hexdigest()[:24]
                record=existing.get(key)or{'key':key,'url':url,'filename':item.get('filename'),'type':item.get('type'),'references':[]}
                ref={'sku':sku,'lang':lang}
                if ref not in record['references']:record['references'].append(ref)
                existing[key]=record
                path=ROOT/record.get('path',f'assets/products/rehau/images/{key.lower()}.webp')
                if not path.exists():jobs[key]=(record,path)
    def one(job):
        item,path=job
        path.parent.mkdir(parents=True,exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(item['url'],headers={'User-Agent':'Mozilla/5.0'}),timeout=60)as response:data=response.read()
        im=ImageOps.exif_transpose(Image.open(io.BytesIO(data)));im.thumbnail((1600,1600),Image.Resampling.LANCZOS)
        if im.mode not in ['RGB','RGBA']:im=im.convert('RGB')
        im.save(path,'WEBP',quality=90,method=6)
        if path.stat().st_size<1024:im.save(path,'WEBP',lossless=True,method=6)
        item.update({'path':path.relative_to(ROOT).as_posix(),'width':im.width,'height':im.height,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()});item.pop('error',None)
        return item
    with cf.ThreadPoolExecutor(max_workers=4)as pool:
        for item in pool.map(one,jobs.values()):existing[item['key']]=item
    (CACHE/'media.json').write_text(json.dumps(list(existing.values()),ensure_ascii=False,indent=2),encoding='utf8')
    print('Additional source images downloaded',len(jobs),flush=True)

def ingest_ua_completeness():
    """Import independently verified public packets without querying or inventing records."""
    option=next((a.split('=',1)[1]for a in sys.argv[2:]if a.startswith('--proof=')),'imports/rehau-ua-completeness-qa.json')
    proof_path=ROOT/option
    proof=json.loads(proof_path.read_text(encoding='utf-8-sig'))
    # The reusable fresh collector and the frozen historical audit have explicit
    # source packets but slightly different report shapes. Normalize the report,
    # never the manufacturer's product objects.
    if proof.get('status')in ['PASS_COMPLETE_SOURCE_PARTITION','PASS_CACHED_SOURCE_PARTITION_SNAPSHOT']:
        target=proof['metadataBefore']['target'];count=proof['counts']['allResolvedUniqueUA']
        if proof['metadataAfter']['target']!=target:raise ValueError('Source changed during discovery')
        proof['counts'].update({'portalMetadataProducts':target,'totalResolvedUniqueUA':count,'counterDifference':target-count,'variantClosureUnqueried':0})
        grouped={}
        for entry in proof['engineeringRecoveries']:grouped.setdefault(entry['fullProductDataPath'],[]).append(entry['sku'])
        proof['fullEngineeringResponses']=[{'path':path,'skus':skus}for path,skus in grouped.items()]
        proof['partition']['allMepaOutOfScopeSkus']=sorted(sku for key in ['baselineUASkus','newMepaOutOfScopeSkus']for sku in proof['partition'][key]if sku.startswith('1896'))
    counts=proof['counts']
    if counts['totalResolvedUniqueUA']!=counts['portalMetadataProducts']or counts['counterDifference']or counts['variantClosureUnqueried']:raise ValueError('UA completeness proof is not closed')
    recovered={}
    for entry in proof['fullEngineeringResponses']:
        path=ROOT/entry['path'];packet=scrub(json.loads(path.read_text(encoding='utf-8-sig')))
        if {p['itemNumber']for p in packet['products']}!=set(entry['skus']):raise ValueError('Engineering packet SKU mismatch')
        target=CACHE/'details-ua'/('ua-completeness-full-'+hashlib.sha256(path.read_bytes()).hexdigest()[:20]+'.json')
        target.write_text(json.dumps(packet,ensure_ascii=False),encoding='utf8')
        recovered.update({p['itemNumber']:p for p in packet['products']})
    grouped={}
    for entry in proof['mepaOutOfScopeRecoveries']:grouped.setdefault(entry['sourceCache'],set()).add(entry['sku'])
    for filename,skus in grouped.items():
        path=ROOT/filename;packet=scrub(json.loads(path.read_text(encoding='utf-8-sig')))
        products=[p for p in packet['products']if p['itemNumber']in skus]
        if {p['itemNumber']for p in products}!=skus or not all(p.get('resolved')for p in products):raise ValueError('MEPA source packet mismatch')
        # This is explicitly a derivative cache; every product is an unchanged official record.
        derived={'sourceCache':filename,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'products':products}
        (CACHE/'details-ua'/('ua-completeness-outscope-'+hashlib.sha256(filename.encode()).hexdigest()[:20]+'.json')).write_text(json.dumps(derived,ensure_ascii=False),encoding='utf8')
        recovered.update({p['itemNumber']:p for p in products})
    expected=set(proof['partition']['newEngineeringSkus'])|set(proof['partition']['newMepaOutOfScopeSkus'])
    if set(recovered)!=expected:raise ValueError('UA completeness recovered set mismatch')
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf8'));records={r['sku']:r for r in inv['ua']}
    records.update({sku:{'sku':sku,'productId':p['productId']}for sku,p in recovered.items()})
    inv['ua']=list(records.values());inv['uaCompletenessExpansion']={'engineeringSkus':proof['partition']['newEngineeringSkus'],'mepaSkus':proof['partition']['newMepaOutOfScopeSkus'],'proof':proof_path.relative_to(ROOT).as_posix(),'proofSha256':hashlib.sha256(proof_path.read_bytes()).hexdigest()}
    (CACHE/'inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2),encoding='utf8')
    (CACHE/'ua-completeness-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf8')
    if len(all_records('ua'))!=counts['portalMetadataProducts']:raise ValueError('Ingested UA count is not portal metadata total')
    print('UA completeness ingested',len(recovered),'records; UA',len(all_records('ua')),flush=True)

def attachment_pdfs():
    """Download actual PDF attachments bound to eligible exact product records."""
    ua,de=all_records('ua'),all_records('de')
    eligible={p['sku']for p in json.loads((OUT/'rehau-2026-11-25.json').read_text(encoding='utf8'))['products']}
    jobs={}
    for sku in sorted(eligible):
        for lang,record in [('ua',ua.get(sku)),('de',de.get(sku))]:
            if not record:continue
            for item in product_queries(record).get('attachments',{}).get('attachments',[]):
                if not item.get('filename','').lower().endswith('.pdf'):continue
                key=item.get('fingerprint')or hashlib.sha256(item['downloadUrl'].encode()).hexdigest()[:24]
                entry=jobs.setdefault(key,{'key':key,'sourceUrl':item['downloadUrl'],'type':item['type'],'description':item.get('description'),'filename':item['filename'],'references':[]})
                entry['references'].append({'sku':sku,'locale':lang})
    def one(entry):
        path=ROOT/'assets/products/rehau/documents'/('attachment-'+entry['key'].lower()+'.pdf')
        if not path.exists():
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(urllib.request.Request(entry['sourceUrl'],headers={'User-Agent':'Mozilla/5.0'}),timeout=120)as response:data=response.read()
                    if not data.startswith(b'%PDF-'):raise ValueError('Attachment is not PDF')
                    path.write_bytes(data);break
                except Exception:
                    if attempt==3:raise
                    time.sleep(1+attempt)
        with path.open('rb')as stream:
            if stream.read(5)!=b'%PDF-':raise ValueError('Invalid cached PDF attachment')
        return {**entry,'path':path.relative_to(ROOT).as_posix(),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    result=[]
    with cf.ThreadPoolExecutor(max_workers=4)as pool:
        for index,entry in enumerate(pool.map(one,jobs.values()),1):
            result.append(entry)
            if index%20==0:print('PDF ATTACHMENTS',index,'/',len(jobs),flush=True)
    (CACHE/'attachment-pdfs.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    # Two current UA flyers are authoritative linked series documents, not ads.
    extra=[]
    for doc_id in ['10226505','10711160']:
        metadata=request('/portals/api/v1/document/details',{'portal':PORTALS['ua'],'document':doc_id},f'documents/{doc_id}.json')
        if metadata['common'].get('archived'):raise ValueError('Current linked flyer is archived')
        path=ROOT/'assets/products/rehau/documents'/(doc_id+'.pdf');url=metadata['specific']['downloadUrl']
        if not path.exists():
            with urllib.request.urlopen(url,timeout=120)as response:data=response.read()
            if not data.startswith(b'%PDF-'):raise ValueError('Series document not PDF')
            path.write_bytes(data)
        extra.append({'id':doc_id,'name':metadata['common']['contentName'],'type':'flyer','sourceUrl':url,'path':path.relative_to(ROOT).as_posix(),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    (CACHE/'documents-additional.json').write_text(json.dumps(extra,ensure_ascii=False,indent=2),encoding='utf8')
    print('PDF attachments verified',len(result),'bytes',sum(d['bytes']for d in result),'additional linked flyers',len(extra),flush=True)

def mepa_outscope_inventory():
    import subprocess
    url=HOST+'/portals/api/v1/documents/download?portal=3001044&document=10673436'
    path=CACHE/'mepa-2026-outscope.pdf'
    if not path.exists():
        with urllib.request.urlopen(url,timeout=120)as response:data=response.read()
        if not data.startswith(b'%PDF'):raise ValueError('not PDF')
        path.write_bytes(data)
    subprocess.run(['pdftotext','-layout',str(path),str(CACHE/'mepa-2026-outscope.txt')],check=True)
    rows={}
    for page_num,page in enumerate((CACHE/'mepa-2026-outscope.txt').read_text(encoding='utf8').split('\f'),1):
        for line in page.splitlines():
            match=re.match(r'^\s*(\d{11})\s+',line)
            if match:rows.setdefault(match[1],[]).append({'page':page_num,'row':line.strip()})
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf8'))
    inv['mepaOutOfScopeSkus']=sorted(rows)
    (CACHE/'inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2),encoding='utf8')
    (CACHE/'mepa-outscope-rows.json').write_text(json.dumps({'sourceUrl':url,'document':'10673436','reason':'separate MEPA sanitary brand, outside REHAU engineering import','rows':rows},ensure_ascii=False,indent=2),encoding='utf8')
    print('Official MEPA-only current PDF SKU',len(rows),'not in resolved UA',len(rows.keys()-all_records('ua').keys()),flush=True)

def ua_span_inventory():
    records={};files=list(CACHE.glob('ua-*.json'))+list((CACHE/'ua-prefix').glob('*.json'))
    for n,file in enumerate(files,1):
        data=json.loads(file.read_text(encoding='utf-8-sig'))
        if not isinstance(data,dict):continue
        for section in data.get('sections',[]):
            markup=html.unescape(section.get('parameters',{}).get('html',''))
            for sku in re.findall(r'oxomi-product-item-number-js[^>]*>\s*(\d{11})\s*<',markup):records.setdefault(sku,{'sku':sku,'sourceCache':file.relative_to(ROOT).as_posix()})
        if n%25==0:print('UA SPAN FILES',n,'SKU',len(records),flush=True)
    known=all_records('ua');new=sorted(records.keys()-known.keys())
    inv=json.loads((CACHE/'inventory.json').read_text(encoding='utf8'));current={p['sku']:p for p in inv['ua']}
    for sku in new:current[sku]={'sku':sku,'productId':None}
    inv['ua']=list(current.values());inv['uaSpanExpansion']={'newSkus':new,'spanSkus':len(records)}
    (CACHE/'inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2),encoding='utf8')
    (CACHE/'ua-span-skus.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
    print('UA SPANS COMPLETE',len(records),'new',len(new),new,flush=True)

if __name__=='__main__':
    {'inventory':inventory,'docs':docs,'details':details,'complete-inventory':complete_inventory,'complete-details':complete_details,'download-docs':download_docs,'pdf-inventory':pdf_inventory,'media':media,'global-docs':global_docs,'recovery-media':recovery_media,'ua-variants':ua_variants,'additional-media':additional_media,'mepa-outscope-inventory':mepa_outscope_inventory,'ua-span-inventory':ua_span_inventory,'ingest-ua-completeness':ingest_ua_completeness,'attachment-pdfs':attachment_pdfs}[sys.argv[1]]()
