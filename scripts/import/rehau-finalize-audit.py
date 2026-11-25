"""Read-only final source/content/media reconciliation; writes only audit reports."""
import collections,hashlib,importlib.util,json,logging,sys
from pathlib import Path
from pypdf import PdfReader
sys.stdout.reconfigure(encoding='utf8')
logging.getLogger('pypdf').setLevel(logging.ERROR)
ROOT=Path(__file__).resolve().parents[2]
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8-sig'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('rehau_source',Path(__file__).with_name('rehau-collect.py'))
source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
q=source.product_queries
batch_path=ROOT/'imports/rehau-2026-11-25.json';batch=read('imports/rehau-2026-11-25.json');products=batch['products']
coverage=read('imports/rehau-coverage-audit.json');proof=read('tmp/rehau-source/ua-completeness-proof.json')if(ROOT/'tmp/rehau-source/ua-completeness-proof.json').exists()else read('imports/rehau-ua-completeness-qa.json')
ua,de=source.all_records('ua'),source.all_records('de');published={p['sku']for p in products};excluded={e['sku']for e in coverage['exclusions']}
errors=[]
def check(condition,message):
    if not condition:errors.append(message)
source_union=ua.keys()|de.keys()
check(not published&excluded,'published/excluded intersection')
check(published|excluded==source_union,'resolved union is not exactly partitioned')
expected_ua=set(proof['partition']['baselineUASkus'])|set(proof['partition']['newEngineeringSkus'])|set(proof['partition']['newMepaOutOfScopeSkus'])
check(set(ua)==expected_ua,'UA exact SKU set differs from independent source completeness proof')
check(len(ua)==proof['counts']['portalMetadataProducts']==len({p['productId']for p in ua.values()}),'UA SKU/ID/metadata counts differ')
check(len(de)==read('tmp/rehau-source/inventory.json')['deExpected'],'DE table snapshot differs from its official metadata target')
mepa=set(proof['partition']['allMepaOutOfScopeSkus'])
check(not mepa&published and mepa<=excluded,'MEPA partition leaked or was not accounted')
legacy=read('scripts/import/rehau-pdf-only-recoveries.json')
check(not {p['sku']for p in legacy}&source_union,'Legacy PDF-only currentness classification must be reviewed')
check(all(not p['publish']for p in legacy),'Legacy PDF-only model passed currentness gate without current proof')

assets={};pdf_results=[]
previous=read('imports/rehau-final-qa.json')if(ROOT/'imports/rehau-final-qa.json').exists()else{}
validated_pdfs={d['path']:d for d in previous.get('media',{}).get('pdfParseResults',[])}if previous.get('status')=='PASS'else{}
for file in sorted((ROOT/'assets/products/rehau').rglob('*')):
    if file.is_file():assets[file.relative_to(ROOT).as_posix()]={'bytes':file.stat().st_size,'sha256':sha(file)}
referenced=set();doc_shas={}
for p in products:
    referenced.update(p['images']);referenced.update(d['url']for d in p['documents'])
for path in sorted({d['url']for p in products for d in p['documents']}):
    try:
        file=ROOT/path;prior=validated_pdfs.get(path,{})
        if prior.get('sha256')==assets[path]['sha256']and prior.get('pages',0)>0:pages=prior['pages'];validation='unchanged SHA of previously parsed complete PDF'
        else:pages=len(PdfReader(file).pages);validation='complete PDF opened with pypdf'
        check(pages>0,'Empty PDF '+path)
        pdf_results.append({'path':path,'pages':pages,'validation':validation,**assets[path]})
        doc_shas[path]=assets[path]['sha256']
    except Exception as error:errors.append('PDF parse failed '+path+': '+str(error))
media={m['key']:m for m in read('tmp/rehau-source/media.json')}
attachments={a['key']:a for a in read('tmp/rehau-source/attachment-pdfs.json')}
known_docs={d['id']:d for name in ['documents-downloaded.json','documents-global-downloaded.json','documents-additional.json']for d in read('tmp/rehau-source/'+name)if not d.get('error')}
gallery_bindings=attachment_bindings=page_bindings=0
for p in products:
    sku=p['sku'];local_doc_shas={doc_shas[d['url']]for d in p['documents']};local_image_shas={assets[path]['sha256']for path in p['images']}
    for lang,record in [('ua',ua.get(sku)),('de',de.get(sku))]:
        if not record:continue
        fields=q(record)
        for image in fields.get('product-images',{}).get('images',[]):
            key=image.get('fingerprint')or hashlib.sha256((image.get('downloadUrl')or image['hdImageUrl']).encode()).hexdigest()[:24]
            local=media.get(key,{})
            check(local.get('sha256')in(local_doc_shas|local_image_shas),'Unrepresented own gallery asset '+sku+' '+key)
            gallery_bindings+=1
        for item in fields.get('attachments',{}).get('attachments',[]):
            if not item.get('filename','').lower().endswith('.pdf'):continue
            key=item.get('fingerprint')or hashlib.sha256(item['downloadUrl'].encode()).hexdigest()[:24]
            check(attachments.get(key,{}).get('sha256')in local_doc_shas,'Unrepresented exact-SKU PDF attachment '+sku+' '+key)
            attachment_bindings+=1
        for doc in fields.get('pages',{}).get('documents',[]):
            if doc.get('outdated'):continue
            check(known_docs.get(doc['id'],{}).get('sha256')in local_doc_shas,'Unrepresented current linked PDF '+sku+' '+doc['id'])
            page_bindings+=1

base=read('imports/rehau-assets-manifest.json')if(ROOT/'imports/rehau-assets-manifest.json').exists()else{};frozen=base.get('assets',[])
check(all(assets.get(a['path'],{}).get('sha256')==a['sha256']for a in frozen),'Previously frozen base asset changed or disappeared')
asset_report={'files':len(assets),'bytes':sum(a['bytes']for a in assets.values()),'referencedByPublishedProducts':len(referenced),'unchangedFrozenBaseFiles':len(frozen),'unreferencedPreservedAssets':[{'path':path,**entry,'reason':'Frozen source/recovery audit asset or source-content duplicate; not assigned to published products.'}for path,entry in assets.items()if path not in referenced],'assets':[{'path':path,**entry,'publishedReference':path in referenced}for path,entry in assets.items()]}
(ROOT/'imports/rehau-final-assets-manifest.json').write_text(json.dumps(asset_report,ensure_ascii=False,indent=2),encoding='utf8')
omission_counts=collections.Counter(x['kind']for x in coverage['fieldOmissions'])
report={'status':'PASS'if not errors else'FAIL','batchSha256':sha(batch_path),'products':len(products),'source':{'uaExactSku':len(ua),'uaExactInternalIds':len({p['productId']for p in ua.values()}),'uaMetadata':proof['counts']['portalMetadataProducts'],'deExactSku':len(de),'resolvedUnion':len(source_union),'uaDeIntersection':len(ua.keys()&de.keys()),'engineeringResolved':len(source_union-mepa),'mepaOutsideScope':len(mepa),'publishedEngineering':len(products),'excludedResolved':len(excluded),'exclusionsByReason':dict(collections.Counter(e['reason']for e in coverage['exclusions'])),'legacyPdfOnlyOutsideCurrentResolvedUnion':len(legacy),'allKnownSkuEvidenceUnionIncludingLegacy':len(source_union)+len(legacy)},'categories':coverage['categories'],'sourceBindings':{'gallery':gallery_bindings,'pdfAttachments':attachment_bindings,'currentLinkedPdfPages':page_bindings,'relatedProducts':sum(bool(p['related'])for p in products),'relatedLinks':sum(len(p['related'])for p in products),'validGtinProducts':sum(bool(p['ean'])for p in products)},'fieldOmissionCounts':dict(omission_counts),'normalizedFacetOmissions':[x for x in coverage['fieldOmissions']if x['kind']=='normalized filter'],'media':{'referencedUniqueImages':len({path for p in products for path in p['images']}),'referencedUniquePdfs':len(pdf_results),'pdfParseResults':pdf_results,'files':len(assets),'bytes':asset_report['bytes'],'unchangedFrozenBaseFiles':len(frozen)},'prices':{'verifiedStorefrontUah':0,'nullUah':len(products),'inventory':'unknown','existingProductsOverwritten':0,'priceChanges':0},'errors':errors}
(ROOT/'imports/rehau-final-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items()if k not in ['categories','media','normalizedFacetOmissions']},ensure_ascii=False))
print('PDFs parsed',len(pdf_results),'asset files',len(assets),'bytes',asset_report['bytes'],'base unchanged',len(frozen),flush=True)
if errors:raise SystemExit(1)
