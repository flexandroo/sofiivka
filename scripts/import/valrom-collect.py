"""Collect the official Ukrainian VALROM sewerage catalogue without remote writes.

Use the bundled Python runtime (Pillow/pdfplumber) and optional xlrd for the
manufacturer's legacy XLS price list. Downloaded source files are cached in tmp.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'tmp' / 'valrom-source'
MEDIA = ROOT / 'assets' / 'products' / 'valrom'
SITE = 'https://www.valrom.com.ua'
SYSTEMS = ('easykit', 'safekit', 'kompactkit', 'drainkit', 'aquaclean')


def fetch(url: str, target: Path) -> bytes:
    if target.exists() and target.stat().st_size:
        return target.read_bytes()
    req = urllib.request.Request(url, headers={'User-Agent': 'Sofiivka catalog import/1.0'})
    with urllib.request.urlopen(req, timeout=90) as response:
        body = response.read()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(body)
    return body


def collect_sources() -> list[dict]:
    manifest = []
    for system in SYSTEMS:
        url = f'{SITE}/catalog/{system}'
        html = fetch(url, CACHE / f'{system}.html').decode('utf-8')
        links = list(dict.fromkeys(re.findall(r'href=["\']([^"\']+\.pdf(?:\?[^"\']*)?)["\']', html)))
        for index, link in enumerate(links):
            source = urllib.parse.urljoin(SITE, link)
            filename = f'{system}-{index + 1}.pdf'
            body = fetch(source, CACHE / filename)
            if not body.startswith(b'%PDF-'):
                raise ValueError(f'Not PDF: {source}')
            manifest.append({'system': system, 'sourceUrl': source, 'file': filename, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
    price_url = f'{SITE}/sites/default/files/price/Price%20Valrom%20Ukraine.xls'
    body = fetch(price_url, CACHE / 'price.xls')
    manifest.append({'system': 'price', 'sourceUrl': price_url, 'file': 'price.xls', 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
    fetch(f'{SITE}/sites/default/files/other_images/logo-inside.svg', ROOT / 'assets' / 'brands' / 'valrom-official.svg')
    (CACHE / 'sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest


def inspect_sources():
    import pdfplumber
    report = []
    for source in json.loads((CACHE / 'sources.json').read_text(encoding='utf-8')):
        if source['system'] == 'price':
            print('PRICE HEADER', (CACHE / source['file']).read_bytes()[:80])
            continue
        with pdfplumber.open(CACHE / source['file']) as pdf:
            texts = []
            for index, page in enumerate(pdf.pages):
                text = page.extract_text(layout=False) or ''
                texts.append(f'\n=== PAGE {index + 1} ===\n{text}')
            (CACHE / source['file'].replace('.pdf', '.txt')).write_text('\n'.join(texts), encoding='utf-8')
            report.append({'file': source['file'], 'pages': len(pdf.pages), 'textLength': sum(map(len, texts)), 'first': texts[:2]})
    (CACHE / 'pdf-inspection.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps([{k:v for k,v in row.items() if k != 'first'} for row in report], ensure_ascii=False, indent=2))


def inspect_xls():
    sys.path.insert(0, str(ROOT / 'tmp' / 'valrom-python'))
    import xlrd
    workbook = xlrd.open_workbook(CACHE / 'price.xls')
    sheets = {}
    for sheet in workbook.sheets():
        if not any(part in sheet.name for part in ['Труба ПВХ', 'Фітинги ПВХ', 'ПВХ шумопогл', 'Труба та фітинг ПП', 'Колодязі', 'Aqua Clean']):
            continue
        sheets[sheet.name] = [sheet.row_values(index) for index in range(sheet.nrows)]
    (CACHE / 'price-rows.json').write_text(json.dumps(sheets, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({name:len(rows) for name,rows in sheets.items()}, ensure_ascii=False, indent=2))
    for name,rows in sheets.items():
        print('\nSHEET', name)
        for index,row in enumerate(rows):
            if any(isinstance(v, (int,float)) and v > 1e9 or isinstance(v,str) and re.match(r'^(?:VLP)?\d{9}',v) for v in row):
                print(index, json.dumps(row, ensure_ascii=False))


def biff_records(data):
    at = 0
    while at + 4 <= len(data):
        kind, size = struct.unpack_from('<HH', data, at)
        yield at, kind, data[at + 4:at + 4 + size]
        at += 4 + size


def escher_records(data, depth=0):
    at = 0
    while at + 8 <= len(data):
        options, kind, size = struct.unpack_from('<HHI', data, at)
        body = data[at + 8:at + 8 + size]
        yield depth, options, kind, body
        if options & 15 == 15:
            yield from escher_records(body, depth + 1)
        at += 8 + size


def inspect_xls_images():
    sys.path.insert(0, str(ROOT / 'tmp' / 'valrom-python'))
    import xlrd
    from xlrd.compdoc import CompDoc
    from PIL import Image, ImageDraw
    book = xlrd.open_workbook(CACHE / 'price.xls')
    stream = CompDoc((CACHE / 'price.xls').read_bytes()).get_named_stream('Workbook')
    records = list(biff_records(stream))
    grouped = []
    for offset, kind, data in records:
        if kind in (0xEB, 0xEC):
            grouped.append([offset, kind, bytearray(data)])
        elif kind == 0x3C and grouped:
            grouped[-1][2].extend(data)
    images = []
    for offset, kind, data in grouped:
        if kind != 0xEB:
            continue
        for depth, options, rec_kind, body in escher_records(data):
            if rec_kind != 0xF007:
                continue
            images.append(None)
            for magic, extension in [(b'\x89PNG\r\n\x1a\n', 'png'), (b'\xff\xd8\xff', 'jpg')]:
                start = body.find(magic)
                if start < 0:
                    continue
                file = CACHE / 'xls-images' / f'{len(images)}.{extension}'
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(body[start:])
                images[-1] = str(file.relative_to(CACHE))
                break
    bounds = []
    for offset, kind, data in records:
        if kind == 0x85:
            start = struct.unpack_from('<I', data)[0]
            bounds.append(start)
    shapes = []
    for offset, kind, data in grouped:
        if kind != 0xEC:
            continue
        sheet_index = max((i for i,b in enumerate(bounds) if b <= offset), default=0)
        shape = {'sheet': book.sheet_by_index(sheet_index).name}
        for depth, options, rec_kind, body in escher_records(data):
            if rec_kind == 0xF00B:
                for index in range(options >> 4):
                    if index * 6 + 6 > len(body):
                        break
                    prop, value = struct.unpack_from('<HI', body, index * 6)
                    if prop & 0x3fff == 0x104:
                        shape['image'] = value
            if rec_kind == 0xF010 and len(body) >= 18:
                _, col1, dx1, row1, dy1, col2, dx2, row2, dy2 = struct.unpack_from('<9H', body)
                shape.update({'col1':col1, 'row1':row1, 'col2':col2, 'row2':row2})
        if 'image' in shape:
            shapes.append(shape)
    result = {'images':images, 'shapes':shapes}
    (CACHE / 'xls-images.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    tiles = []
    for index,file in enumerate(images, 1):
        if not file:
            continue
        try:
            image = Image.open(CACHE / file).convert('RGB')
            image.thumbnail((140,120))
            tile = Image.new('RGB',(160,150),'white')
            tile.paste(image, ((160-image.width)//2,0))
            ImageDraw.Draw(tile).text((5,125),str(index),fill='black')
            tiles.append(tile)
        except Exception:
            continue
    for batch_index in range(0,len(tiles),80):
        batch = tiles[batch_index:batch_index+80]
        contact = Image.new('RGB',(160*8,150*((len(batch)+7)//8)), '#dddddd')
        for index,tile in enumerate(batch):
            contact.paste(tile,((index%8)*160,(index//8)*150))
        contact.save(CACHE/f'xls-contact-{batch_index//80+1}.jpg')
    print(json.dumps({'imageCount':len(images), 'shapeCount':len(shapes), 'shapes':shapes},ensure_ascii=False,indent=2))


def inspect_pdf_images():
    import pdfplumber
    from PIL import Image, ImageDraw
    image_directory = CACHE / 'pdf-images'
    image_directory.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source in json.loads((CACHE / 'sources.json').read_text(encoding='utf-8')):
        if source['system'] == 'price':
            continue
        with pdfplumber.open(CACHE/source['file']) as pdf:
            print(source['system'], 'pages', len(pdf.pages), flush=True)
            for page_number,page in enumerate(pdf.pages,1):
                candidates = [i for i in page.images if i['width'] > 20 and i['height'] > 20 and i['width'] < page.width * .85]
                if not candidates:
                    continue
                render = None
                for image_number,image in enumerate(candidates,1):
                    file = image_directory / f'{source["system"]}-{page_number}-{image_number}.webp'
                    if not file.exists():
                        if render is None:
                            render = page.to_image(resolution=220).original.convert('RGB')
                        scale = render.width / page.width
                        box = (max(0,int(image['x0']*scale)), max(0,int(image['top']*scale)), min(render.width,int(image['x1']*scale)), min(render.height,int(image['bottom']*scale)))
                        if box[2] <= box[0] or box[3] <= box[1]:
                            continue
                        crop = render.crop(box)
                        crop.thumbnail((1600,1600))
                        crop.save(file,'WEBP',quality=90)
                    manifest.append({'file':str(file.relative_to(CACHE)), 'system':source['system'], 'page':page_number,'image':image_number,'bbox':[image[k] for k in ['x0','top','x1','bottom']]})
                if source['system'] in ('easykit','kompactkit') and page_number==3:
                    page.to_image(resolution=110).save(CACHE/f'{source["system"]}-page-3.png')
    (CACHE / 'pdf-images.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    for system in SYSTEMS:
        entries = [entry for entry in manifest if entry['system']==system]
        for batch_index in range(0,len(entries),64):
            batch = entries[batch_index:batch_index+64]
            contact = Image.new('RGB',(160*8,150*((len(batch)+7)//8)), '#dddddd')
            for index,entry in enumerate(batch):
                image = Image.open(CACHE/entry['file']).convert('RGB');image.thumbnail((148,120))
                tile = Image.new('RGB',(160,150),'white');tile.paste(image,((160-image.width)//2,0))
                ImageDraw.Draw(tile).text((3,125),f'{entry["page"]}-{entry["image"]}',fill='black')
                contact.paste(tile,((index%8)*160,(index//8)*150))
            contact.save(CACHE/f'{system}-contact-{batch_index//64+1}.jpg')
    print(json.dumps({system:len([i for i in manifest if i['system']==system]) for system in SYSTEMS}))


def collect_ro():
    api = 'https://produse.valrom.ro/wp-json/wc/store/v1/products'
    products = []
    page = 1
    while True:
        url = f'{api}?category=303&per_page=100&page={page}'
        rows = json.loads(fetch(url,CACHE/'ro-pages'/f'{page}.json'))
        if not isinstance(rows,list):
            raise ValueError(rows)
        products.extend(rows)
        print('Romanian official sewerage API page',page,'records',len(rows),flush=True)
        if len(rows)<100:
            break
        page += 1
    (CACHE/'ro-products.json').write_text(json.dumps(products,ensure_ascii=False),encoding='utf-8')
    from collections import Counter
    counts = Counter()
    for row in products:
        counts.update(category['slug'] for category in row['categories'])
    print(json.dumps({'total':len(products),'categories':counts},ensure_ascii=False,indent=2))


def collect_4silence():
    import html
    parent=fetch('https://produse.valrom.ro/en/sewage/4silence/',CACHE/'4silence-parent.html').decode('utf-8')
    categories=list(dict.fromkeys(re.findall(r'https://produse\.valrom\.ro/en/product-category/sewage/4silence/([^/"\']+)/',parent)))
    if 'sound-absorbing-pvc-pipes' not in categories:categories.append('sound-absorbing-pvc-pipes')
    products=[]
    for category in categories:
        url='https://produse.valrom.ro/en/product-category/sewage/4silence/'+category+'/'
        page=fetch(url,CACHE/f'4silence-{category}.html').decode('utf-8')
        for row in re.findall(r'<tr\b[^>]*id=["\']product-row-\d+["\'][^>]*>.*?</tr>',page,re.S):
            cells=re.findall(r'<td\b[^>]*>(.*?)</td>',row,re.S)
            if len(cells)<4:continue
            sku=re.sub('<[^>]+>','',cells[2]).strip()
            name=html.unescape(re.sub('<[^>]+>','',cells[3])).strip()
            image=re.search(r'data-data-src=["\']([^"\']+)',cells[0])
            link=re.search(r'href=["\']([^"\']+)["\'][^>]*class=["\'][^"\']*product-details',row)
            if sku and image and link and 'placeholder' not in image[1]:
                products.append({'sku':sku,'name':name,'images':[{'src':html.unescape(image[1])}],'permalink':html.unescape(link[1]),'attributes':[]})
    (CACHE/'4silence-en.json').write_text(json.dumps(products,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'english4SilenceRows':len(products)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['fetch', 'inspect', 'xls', 'xls-images', 'pdf-images', 'ro', '4silence'], default='fetch', nargs='?')
    args = parser.parse_args()
    if args.command == 'fetch':
        print(json.dumps(collect_sources(), ensure_ascii=False, indent=2))
    elif args.command == 'inspect':
        inspect_sources()
    elif args.command == 'xls':
        inspect_xls()
    elif args.command == 'xls-images':
        inspect_xls_images()
    elif args.command == 'pdf-images':
        inspect_pdf_images()
    elif args.command == 'ro':
        collect_ro()
    else:
        collect_4silence()
