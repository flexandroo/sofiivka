"""Verify legacy official PDF-only SKU facts; keep outside the current import.

These records must not be published until a current official catalogue or SKU
record confirms the exact model. Text hidden by PDF layout is evidence only.
"""
import hashlib,json,sys
from pathlib import Path
import pdfplumber
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[2];TMP=ROOT/'tmp/rehau-source/pdf-only-audit';TMP.mkdir(parents=True,exist_ok=True)
records=[
 {'sku':'11696111001','document':'10253450','page':3,'title':'Муфта рівнопрохідна REHAU SDR 11, 75 × 6,8 мм','model':'SDR 11 75 × 6,8','series':'RAUVITHERM','category':'district-heating-components','characteristics':[{'label':'Розмір','value':'75 × 6,8','unit':'мм'},{'label':'Розмір a','value':'131,5','unit':'мм'},{'label':'Розмір z','value':'31,5','unit':'мм'},{'label':'Маса','value':'1,480','unit':'кг'},{'label':'Матеріал','value':'Червона латунь'}],'imageCrop':[399,531,481,598]},
 {'sku':'11696211001','document':'10253450','page':3,'title':'Муфта рівнопрохідна REHAU SDR 11, 90 × 8,2 мм','model':'SDR 11 90 × 8,2','series':'RAUVITHERM','category':'district-heating-components','characteristics':[{'label':'Розмір','value':'90 × 8,2','unit':'мм'},{'label':'Розмір a','value':'131,5','unit':'мм'},{'label':'Розмір z','value':'31,5','unit':'мм'},{'label':'Маса','value':'2,400','unit':'кг'},{'label':'Матеріал','value':'Червона латунь'}],'imageCrop':[399,531,481,598]},
 {'sku':'13200311001','document':'10253450','page':5,'title':'Гумовий торцевий ковпак REHAU RAUVITHERM UNO, для розмірів 75 і 90 мм','model':'RAUVITHERM UNO 75/90','series':'RAUVITHERM','category':'district-heating-components','characteristics':[{'label':'Сумісні розміри RAUVITHERM UNO','value':'75; 90','unit':'мм'},{'label':'Маса','value':'0,30','unit':'кг'}],'imageIssue':'Source group shows a collection of five caps, with no unambiguous association of an individual pictured cap to this exact SKU. No picture assigned.'},
 {'sku':'13280081001','document':'10250428','page':40,'title':'Шинний датчик температури й вологості REHAU NEA SMART 2.0 HBW, білий','model':'HBW','series':'NEA SMART 2.0','category':'heating-sensors-modules','characteristics':[{'label':'Зв’язок','value':'Дротова двопровідна шина, із захистом від переполюсовки'},{'label':'Вимірювання','value':'Температура та відносна вологість повітря'},{'label':'Застосування','value':'Регулювання кімнатної температури при панельному опаленні й охолодженні'},{'label':'Монтаж','value':'На підштукатурну розетку або безпосередньо на стіну'},{'label':'Ступінь захисту','value':'IP20'},{'label':'Клас захисту','value':'III'},{'label':'Ширина × висота × глибина','value':'86 × 86 × 21','unit':'мм'},{'label':'Маса','value':'71','unit':'г'},{'label':'Колір','value':'Білий, аналог RAL 9003'},{'label':'Додатковий датчик','value':'Можливе підключення віддаленого датчика NEA SMART 2.0 для контролю температури підлоги'}],'imageCrop':[303,64,422,181]},
 {'sku':'13280141001','document':'10250428','page':42,'title':'Радіодатчик температури REHAU NEA SMART 2.0 TRW, білий','model':'TRW','series':'NEA SMART 2.0','category':'heating-sensors-modules','characteristics':[{'label':'Зв’язок','value':'Радіозв’язок'},{'label':'Частота передачі','value':'869','unit':'МГц'},{'label':'Вимірювання','value':'Температура'},{'label':'Живлення','value':'2 × LR03, лужні батарейки AAA'},{'label':'Радіус дії в будівлях','value':'25','unit':'м'},{'label':'Термін служби батарейок за джерелом','value':'Понад 2 роки'},{'label':'Ступінь захисту','value':'IP20'},{'label':'Клас захисту','value':'III'},{'label':'Ширина × висота × глибина','value':'86 × 86 × 21','unit':'мм'},{'label':'Маса','value':'101','unit':'г'},{'label':'Колір','value':'Білий, аналог RAL 9003'},{'label':'Монтаж','value':'На підштукатурну розетку або безпосередньо на стіну'},{'label':'Застосування','value':'Панельне опалення й охолодження'},{'label':'Додатковий датчик','value':'Можливе підключення віддаленого датчика NEA SMART 2.0 для контролю температури підлоги'}],'imageCrop':[303,64,422,181]},
 {'sku':'13280161001','document':'10250428','page':44,'title':'Радіодатчик температури й вологості REHAU NEA SMART 2.0 HRW, білий','model':'HRW','series':'NEA SMART 2.0','category':'heating-sensors-modules','characteristics':[{'label':'Зв’язок','value':'Радіозв’язок'},{'label':'Вимірювання','value':'Температура та відносна вологість повітря'},{'label':'Застосування','value':'Регулювання кімнатної температури при панельному опаленні й охолодженні'},{'label':'Ширина × висота × глибина','value':'86 × 86 × 21','unit':'мм'},{'label':'Маса','value':'101','unit':'г'},{'label':'Колір','value':'Білий'}],'imageCrop':[303,78,422,195],'hiddenTextPolicy':'The page text layer contains additional properties not shown in the rendered page; they are retained as raw evidence only and not asserted as visible specifications.'},
]
rawrows=json.loads((ROOT/'tmp/rehau-source/pdf-sku-rows.json').read_text(encoding='utf8'))
for r in records:
    pdf=ROOT/f"assets/products/rehau/documents/{r['document']}.pdf"
    r.update({'sourceUrl':f"https://oxomi.com/portals/api/v1/documents/download?portal=3001044&document={r['document']}",'localPdf':pdf.relative_to(ROOT).as_posix(),'documentSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'exactRows':[x for x in rawrows[r['sku']]if x['document']==r['document']],'publish':False,'reason':'Актуальність цієї моделі у поточному асортименті офіційно не підтверджена: обидва поточні API не resolve точний SKU, чинного переліку 2026 із цим SKU не виявлено. Не позначено як знятий з виробництва.'})
    with pdfplumber.open(pdf)as doc:
        page=doc.pages[r['page']-1]
        r['rawPdfText']=page.extract_text()
        if r.get('imageCrop'):
            path=TMP/(r['sku']+'-source-illustration.png')
            page.crop(tuple(r['imageCrop'])).to_image(resolution=360,antialias=True).save(path)
            r['auditImage']=path.relative_to(ROOT).as_posix()
(ROOT/'scripts/import/rehau-pdf-only-recoveries.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
(ROOT/'imports/rehau-pdf-only-qa.json').write_text(json.dumps({'verifiedPdfRows':6,'recoverableIllustrations':5,'published':0,'records':records},ensure_ascii=False,indent=2),encoding='utf8')
print('Verified PDF-only facts6; illustrations5; publish0 (currentness gate)')
