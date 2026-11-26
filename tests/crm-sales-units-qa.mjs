// Render actual CRM templates with the shared unit helper, without network/DOM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argument=process.argv.find(x=>x.startsWith('--built-dir='));
const root=argument?path.resolve(project,argument.slice('--built-dir='.length)):project;
assert.ok(root===project||root.startsWith(project+path.sep));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
// Start from the real admin entry's imports, with no catalogue bundle and no
// manually initialized helper. Bundle/evaluate the real CRM dependency graph:
// removal of its explicit helper import must fail at the rendering assertions.
const adminHtml=read('admin/index.html');
assert.match(adminHtml,/<script\b[^>]*type=["']module["'][^>]*src=["']\/admin\/admin\.mjs(?:\?[^"']*)?["']/);
assert.doesNotMatch(adminHtml,/<script\b[^>]*src=["'][^"']*catalog-data\.js/);
assert.match(read('admin/admin.mjs'),/from\s*["']\/admin\/admin-crm\.mjs(?:\?[^"']*)?["']/);
const hooks=argument?'createOrderPrintView,createOrderDetailView,toCsv':'createOrderPrintView,createOrderDetailView,lineRowHtml,itemsDiff,toCsv,columns:ORDER_CSV_COLUMNS';
const bundled=await build({stdin:{contents:read('admin/admin-crm.mjs')+
 `\nwindow.unitQa={${hooks}};`,
 resolveDir:path.join(root,'admin'),sourcefile:'admin-crm-unit-qa.mjs'},bundle:true,write:false,format:'iife',platform:'browser',metafile:true,
 plugins:[{name:'same-site-browser-imports',setup(builder){builder.onResolve({filter:/^(?:\/|\.)/},args=>{
   const local=args.path.split('?')[0];
   const resolved=local.startsWith('/')?path.join(root,local):path.resolve(args.resolveDir,local);
   assert.ok(resolved.startsWith(root+path.sep),'Dependency stays inside static site');return{path:resolved};
 });}}]});
assert.ok(Object.keys(bundled.metafile.inputs).some(p=>/(?:^|\/)catalog\/sales-units\.js$/.test(p.replaceAll('\\','/'))),
 'CRM explicitly imports the small helper without catalogue-data');
const context=vm.createContext({window:{},Intl,Date,URLSearchParams,console});
assert.equal(context.window.sofievkaSalesUnits,undefined);
vm.runInContext(bundled.outputFiles[0].text,context);
assert.equal(context.window.sofievkaCatalog,undefined,'Admin does not need the full catalogue bundle');
const qa=context.window.unitQa;
const items=[{id:'m',title:'Труба',sku:'M',quantity:3,unitAmount:100,lineTotal:300,saleUnit:'m',priceStatus:'known'},
 {id:'p',title:'Муфта',sku:'P',quantity:2,unitAmount:50,lineTotal:100,saleUnit:'piece',priceStatus:'known'}];
const order={number:1,status:'new',source:'website',createdAt:'2026-11-26T12:00:00Z',updatedAt:'2026-11-26T12:00:00Z',
 contactName:'Покупець',contactPhone:'+380675558100',deliveryMethod:'pickup',itemsCount:5,itemsTotal:400,itemsEditable:true};
const detail={order,items,customer:{},activity:[],staff:[]};
const print=(await qa.createOrderPrintView({api:{crm:{getOrder:async()=>detail}},orderNumber:1})).html;
assert.match(print,/3 м/);assert.match(print,/2 шт\./);assert.match(print,/100,00\/м/);
assert.doesNotMatch(print,/5 шт\./);assert.match(print,/2 поз\./);
const normal=(await qa.createOrderDetailView({api:{crm:{getOrder:async()=>detail}},orderNumber:1})).html;
assert.match(normal,/3 м ×/);assert.match(normal,/грн\/м/);assert.doesNotMatch(normal,/5 шт\./);
if(!argument){
const editor=qa.lineRowHtml({...items[0],quantity:'3',unitAmount:'100'},0);
assert.match(editor,/К-сть, м/);assert.match(editor,/Ціна, грн\/м/);
const csv=qa.toCsv(qa.columns,[{...order,items}]);
assert.match(csv,/Труба × 3 м по 100,00 грн\/м/);assert.match(csv,/Муфта × 2 шт\./);
assert.doesNotMatch(csv,/Кількість, шт\./);
const activity=qa.itemsDiff({items:{changed:[{title:'Труба',saleUnit:'m',from:{quantity:3,unitAmount:100},to:{quantity:4,unitAmount:100}}]}});
assert.match(activity,/3 → 4 м/);assert.doesNotMatch(activity,/шт\./);
}
console.log(JSON.stringify({status:'PASS',realModuleDependencies:true,manuallyInjectedHelper:false,built:!!argument,
 rendered:argument?['CRM detail','print']:['CRM detail','print','CSV','line editor','activity'],network:0}));
