"""Remove only unreferenced files inside this import's own REHAU asset folder.

Original remote public sources remain reproducible in rehau-collect.py. The
batch, exact title/image recovery proofs and audit documents determine keepers.
"""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];ASSETS=(ROOT/'assets/products/rehau').resolve()
batch=json.loads((ROOT/'imports/rehau-2026-11-25.json').read_text(encoding='utf8'))
keep=set()
def retain(path):
    if not path:return
    file=(ROOT/path.lstrip('/')).resolve()
    if not file.is_relative_to(ASSETS):raise ValueError('Asset reference outside own REHAU folder: '+str(file))
    keep.add(file)
for p in batch['products']:
    for image in p['images']:retain(image)
    for doc in p['documents']:retain(doc['url'])
for name in ['rehau-image-recoveries.json','rehau-recovered-title-image-recoveries.json','rehau-new24-image-recoveries.json']:
    file=ROOT/'scripts/import'/name
    if file.exists():
        for r in json.loads(file.read_text(encoding='utf8')):
            retain(r.get('proposedImage',{}).get('path'));retain(r.get('localPdf'))
file=ROOT/'scripts/import/rehau-title-recoveries.json'
if file.exists():
    for r in json.loads(file.read_text(encoding='utf8')).values():
        retain(r.get('localPdf'))
        for e in r.get('evidence',[]):retain(e.get('localPdf'))
removed=[];manifest=[]
for file in ASSETS.rglob('*'):
    if not file.is_file():continue
    resolved=file.resolve()
    if not resolved.is_relative_to(ASSETS):raise ValueError('Resolved target outside own REHAU folder')
    entry={'path':file.relative_to(ROOT).as_posix(),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
    if resolved not in keep:
        removed.append(entry)
        if '--apply'in sys.argv:file.unlink()
    else:manifest.append(entry)
report={'applied':'--apply'in sys.argv,'referencedAssets':len(manifest),'referencedBytes':sum(x['bytes']for x in manifest),'prunedAssets':len(removed),'prunedBytes':sum(x['bytes']for x in removed),'assets':manifest,'removedSourceDuplicatesOrOutOfScopeAssets':removed}
(ROOT/'imports/rehau-assets-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items()if not isinstance(v,list)}))
