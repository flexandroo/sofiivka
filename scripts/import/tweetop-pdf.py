"""Extract authoritative SKU table geometry and original embedded catalogue photos.
Run from repository root after tweetop-collect.mjs. No generated/composite photos.
"""
import sys, pathlib, json, zipfile, xml.etree.ElementTree as E
sys.path.insert(0,str(pathlib.Path('tmp/tweetop-tools').resolve()))
import pymupdf as fitz
root=pathlib.Path.cwd(); out=root/'tmp/tweetop-source/extracted';out.mkdir(parents=True,exist_ok=True)
doc=fitz.open(root/'tmp/tweetop-source/Katalog_v3.98_web.pdf');pages=[]
for idx in range(6,54):
 p=doc[idx]; text=[]
 for b in p.get_text('dict')['blocks']:
  if b['type']==0:
   for ln in b['lines']:
    text.append({'bbox':list(ln['bbox']),'text':''.join(s['text'] for s in ln['spans'])})
 images=[]
 for info in p.get_image_info(xrefs=True):
  xref=info['xref'];bbox=list(info['bbox'])
  if not xref or bbox[2]-bbox[0]<25 or bbox[3]-bbox[1]<25:continue
  raw=doc.extract_image(xref);file=out/f'image-{xref}.png'
  # Preserve the embedded soft mask: extract_image alone produces black surrounds.
  pix=fitz.Pixmap(doc,xref)
  image_def=next((im for im in p.get_images(full=True) if im[0]==xref),None)
  if image_def and image_def[1]:pix=fitz.Pixmap(pix,fitz.Pixmap(doc,image_def[1]))
  pix.save(str(file))
  images.append({'xref':xref,'bbox':bbox,'transform':list(info['transform']),'file':str(file.relative_to(root)).replace('\\','/'),'width':raw['width'],'height':raw['height']})
 pages.append({'page':idx+1,'width':p.rect.width,'height':p.rect.height,'lines':text,'images':images})
 # Contact sheet-ready page previews for exact image-to-SKU audits.
 if idx+1 in [8,9,10,11,12,13,14,15,16,17,18,19,20,43,44,46,47,49,50,51,52,53,54]:
  p.get_pixmap(matrix=fitz.Matrix(1,1)).save(str(out/f'page-{idx+1}.png'))
(root/'imports/tweetop-pdf-source.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2),encoding='utf8')
# Workbook records keep exact manufacturer identifiers and EAN, including leading zeroes.
z=zipfile.ZipFile(root/'tmp/tweetop-source/Arkusz_ofertowy_Tweetop_2026_05.xlsx');ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
strings=[''.join(e.itertext()) for e in E.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)];records=[]
for row in E.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('m:sheetData/m:row',ns):
 r={}
 for c in row.findall('m:c',ns):
  v=c.find('m:v',ns);value=v.text if v is not None else ''
  r[''.join(ch for ch in c.attrib['r'] if ch.isalpha())]=strings[int(value)] if c.attrib.get('t')=='s' and value else value
 if r.get('E') and len(r.get('D',''))>2 and r['D'][1]=='.':
  records.append({'row':int(row.attrib['r']),'sourceGroup':r.get('A'),'discountGroup':r.get('B'),'ean':r.get('C'),'index':r.get('D'),'sku':r.get('E'),'name':r.get('F'),'pack':r.get('G'),'unit':r.get('H'),'sourcePrice':r.get('I'),'sourceCurrency':'PLN'})
(root/'imports/tweetop-source.json').write_text(json.dumps({'catalogue':'https://www.tweetop.pl/wp-content/uploads/2026/06/Katalog_v3.98_web.pdf','workbook':'https://www.tweetop.pl/wp-content/uploads/2026/04/Arkusz_ofertowy_Tweetop_2026_05.xlsx','records':records},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pages':len(pages),'embeddedImages':len(set(i['xref'] for p in pages for i in p['images'])),'workbookSKUs':len(records)}))
