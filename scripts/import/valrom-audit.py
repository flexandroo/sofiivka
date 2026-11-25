"""Verify the complete collected VALROM batch and render representative media."""
import collections
import hashlib
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[2]
batch_path=ROOT/'imports'/'valrom-2026-11-25.json'
batch=json.loads(batch_path.read_text(encoding='utf-8'))
products=batch['products']
issues=[];media={};documents={};small=[]
for key in ('sku','title','sourceId'):
    duplicates=[value for value,count in collections.Counter(p[key] for p in products).items() if count>1]
    if duplicates:issues.append({'duplicate':key,'values':duplicates})
for product in products:
    if not product['images']:issues.append({'sku':product['sku'],'issue':'no images'})
    if len(product['shortDescription'])>300:issues.append({'sku':product['sku'],'issue':'long short description'})
    if not product['description'].startswith(product['title']):issues.append({'sku':product['sku'],'issue':'description title prefix'})
    if product['price'] is not None and (not isinstance(product['price'],int) or product['price']<=0):issues.append({'sku':product['sku'],'issue':'invalid UAH price'})
    text=product['title']+' '+product['description']+' '+json.dumps(product['characteristics'],ensure_ascii=False)
    if re.search(r'[ыэъёЫЭЪЁąćęłńśźżĄĆĘŁŃŚŹŻăâîșşțţ]',text):issues.append({'sku':product['sku'],'issue':'foreign letters'})
    for image_path in product['images']:
        if image_path in media:continue
        path=ROOT/image_path
        with Image.open(path) as image:
            image.load()
            if image.format!='WEBP' or max(image.size)>1600:issues.append({'image':image_path,'issue':'invalid image format or dimensions'})
            if min(image.size)<40:small.append({'image':image_path,'size':image.size})
            media[image_path]={'width':image.width,'height':image.height,'bytes':path.stat().st_size}
    for doc in product['documents']:
        doc_path=ROOT/doc['url']
        if doc_path.read_bytes()[:5]!=b'%PDF-':issues.append({'pdf':doc['url'],'issue':'invalid PDF signature'})
        documents[doc['url']]={'bytes':doc_path.stat().st_size,'sha256':hashlib.sha256(doc_path.read_bytes()).hexdigest()}

# One sample for every category and source, then extra shapes; never use covers as photos.
samples=[]
for category in sorted({p['category'] for p in products}):
    for source in ('ua-xls','ro-api'):
        sample=next((p for p in products if p['category']==category and p['sourceEvidence']['primary']==source),None)
        if sample:samples.append(sample)
for index in range(0,len(samples),16):
    selected=samples[index:index+16]
    contact=Image.new('RGB',(1200,((len(selected)+3)//4)*280),'#ddd')
    for i,product in enumerate(selected):
        photo=Image.open(ROOT/product['images'][0]).convert('RGB');photo.thumbnail((280,230))
        tile=Image.new('RGB',(300,280),'white');tile.paste(photo,((300-photo.width)//2,0))
        draw=ImageDraw.Draw(tile);draw.text((5,235),product['sku'],fill='black');draw.text((5,253),product['category'],fill='black')
        contact.paste(tile,((i%4)*300,(i//4)*280))
    contact.save(ROOT/'tmp'/'valrom-source'/f'batch-media-qa-{index//16+1}.jpg')

summary={'status':'ok' if not issues else 'failed','products':len(products),'imageFiles':len(media),'imageBytes':sum(v['bytes'] for v in media.values()),'largestSide':max(max(v['width'],v['height']) for v in media.values()),'pdfs':documents,'priceCount':sum(p['price'] is not None for p in products),'noPriceCount':sum(p['price'] is None for p in products),'smallIllustrations':small,'issues':issues,'batchSha256':hashlib.sha256(batch_path.read_bytes()).hexdigest()}
(ROOT/'imports'/'valrom-2026-11-25.audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
if issues:raise SystemExit(1)
