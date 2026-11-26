// Real storefront renderers, isolated in Node VM: no browser/network/hosted writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { renderProduct } from "../api/seo-page.mjs";
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const pipe = { id: "pipe", sku: "11111111001", slug: "pipe", title: "Труба REHAU 100 м", brandId: "rehau", brand: "REHAU", primaryCategoryId: "pipes", price: 100, pricing: { amount: 100, oldAmount: null, currency: "UAH", priceStatus: "known", unit: "m" }, inventory: { status: "unknown" }, publicationStatus: "published", normalizedAttributes: {}, images: [], source: {} };
const piece = { ...pipe, id: "fitting", sku: "11111111002", slug: "fitting", title: "Муфта REHAU", price: 50, pricing: { amount: 50, oldAmount: null, currency: "UAH", priceStatus: "known" } };
const storage = new Map([["sofievka-cart", JSON.stringify({ pipe: 3 })]]);
function sandbox() {
  const context = vm.createContext({ console, URL, URLSearchParams, Intl, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {}, location: { search: "", pathname: "/cart", href: "https://example.test/cart", origin: "https://example.test" }, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, document: { body: { dataset: { page: "unit-test" } }, documentElement: { classList: { add() {} } }, hidden: true, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} }, window: { setTimeout: () => 0, sofievkaCatalog: { products: [pipe, piece], brands: [], attributeSchema: {}, attributeDefinitions: {}, productUrl: p => `/product/${p.slug}`, brandUrl: id => `/brands/${id}`, slugify: x => x, valueLabel: (d, v) => String(v) } } });
  vm.runInContext(read("catalog/sales-units.js"), context);
  return context;
}
const ctx = sandbox(), units = ctx.window.sofievkaSalesUnits;
assert.equal(units.code(pipe), "m");
assert.equal(units.code(piece), "piece");
assert.equal(units.code({ title: "Труба 100 м", pricing: { unit: "roll" } }), "piece", "No guessed unit from title/length/unknown code");
assert.equal(units.label({ saleUnit: "m" }), "м", "Order snapshot uses same explicit code");
assert.equal(units.price(100, pipe, n => `${n} грн`), "100 грн/м");
assert.equal(units.wholeQuantity(3), 3); assert.equal(units.wholeQuantity(1000), 999);

// Run complete production modules with only automatic page startup disabled.
let shell = read("page-shell.js").replace('  if (!root || !PAGES[page]) return;', "");
shell = shell.replace("  initialize();\n})();", "  window.__unitHooks = {cart, cartTotals, cartLineMarkup, checkoutItemsMarkup, renderPdpPrice, renderPdpPurchase, renderPdpMobileBuybar, cartSummaryRows, checkoutTotalsRows, addToCart, ensureSalesUnits, loadAccountScripts, initialize, stubBootChrome() { PAGES['unit-test']=()=>'<article>account page</article>'; headerExtended=()=>''; footerExtended=()=>''; bindGlobal=()=>{}; bindExtendedPage=()=>loadAccountScripts(); }};\n})();");
assert.ok(shell.includes("window.__unitHooks"));
vm.runInContext(shell, ctx);
const h = ctx.window.__unitHooks;
assert.equal(h.cart().pipe, 3, "Stored quantity reloads as metres without coil multiplication");
const totals = h.cartTotals([["pipe", 3]]);
assert.equal(totals.total, 300); assert.equal(totals.quantityLabel, "3 м");
assert.match(h.cartLineMarkup("pipe", 3), /300 грн/);
assert.match(h.cartLineMarkup("pipe", 3), /100 грн\/м × 3 м/);
assert.match(h.cartLineMarkup("pipe", 3), /aria-label="Кількість, м"/);
assert.match(h.checkoutItemsMarkup([["pipe", 3]]), /3 м × 100 грн\/м/);
assert.match(h.checkoutItemsMarkup([["pipe", 3]]), /300 грн/);
const view = { product: pipe, purchase: { amount: 100, oldAmount: null, purchasable: true, status: "unknown", statusLabel: "Наявність уточнюйте" }, cartQuantity: 3 };
assert.match(h.renderPdpPrice(view), /100 грн\/м/);
assert.match(h.renderPdpPurchase(view), /class="pdp-unit">м</);
assert.match(h.renderPdpPurchase(view), /step="1"/);
assert.match(h.renderPdpMobileBuybar(view), /100 грн\/м/);
assert.match(h.renderPdpPurchase(view), /У кошику 3 м Додати ще/);
const mixed = h.cartTotals([["pipe", 3], ["fitting", 2]]);
assert.equal(mixed.total, 400); assert.equal(mixed.quantityLabel, "2 поз.");
assert.match(h.cartSummaryRows(mixed), /Товари, 2 поз\./);
assert.equal(h.cartTotals([["fitting", 2]]).quantityLabel, "2 шт.");
assert.match(h.checkoutItemsMarkup([["fitting", 2]]), /2 шт\. × 50 грн/);
assert.doesNotMatch(h.renderPdpPrice({ ...view, product: piece, purchase: { ...view.purchase, amount: 50 } }), /грн\/м/);
h.addToCart("pipe", 2); assert.equal(JSON.parse(storage.get("sofievka-cart")).pipe, 5);
const reloaded = sandbox(); vm.runInContext(shell, reloaded); assert.equal(reloaded.window.__unitHooks.cart().pipe, 5);
assert.equal(reloaded.window.__unitHooks.cartTotals([["pipe", 5]]).total, 500);

vm.runInContext(read("catalog-ui.js"), ctx);
await ctx.window.sofievkaCatalogUIReady;
const card = ctx.window.sofievkaCatalogUI.renderProductCard(pipe, { cart: { pipe: 3 } });
assert.match(card, /100 грн\/м/); assert.match(card, /У кошику 3 м Додати ще/);
assert.doesNotMatch(ctx.window.sofievkaCatalogUI.renderProductCard(piece), /грн\/м/);
const oldUi=sandbox();delete oldUi.window.sofievkaSalesUnits;
vm.runInContext(read('catalog-ui.js'),oldUi);await oldUi.window.sofievkaCatalogUIReady;
vm.runInContext(read('catalog/sales-units.js'),oldUi);
assert.match(oldUi.window.sofievkaCatalogUI.renderProductCard(pipe),/100 грн\/м/,'Preloaded new UI resolves a subsequently loaded helper at render time');

// Local normalization and legacy projection carry the explicit unit as well.
ctx.window.sofievkaTaxonomy = { byId: { pipes: { id: "pipes", title: "Труби", status: "active", visibility: "catalog" } } };
ctx.window.sofievkaAttributeSchema = { definitions: {} };
ctx.window.sofievkaSourceMappings = { supplierFor: () => "audit", resolve: () => ({ categoryId: "pipes", tags: [], collectionIds: [] }), suppliers: { audit: { brandId: "rehau" } } };
vm.runInContext(read("catalog/normalize-products.js"), ctx);
assert.equal(ctx.window.sofievkaProductNormalizer.normalizeProduct(pipe).pricing.unit, "m");
assert.equal(ctx.window.sofievkaProductNormalizer.normalizeProduct(piece).pricing.unit, "piece");
vm.runInContext(read("catalog/legacy-adapter.js"), ctx);
const adapter = ctx.window.sofievkaProductLegacyAdapter.createLegacyAdapter({ taxonomy: ctx.window.sofievkaTaxonomy });
assert.equal(adapter.adaptProduct(pipe, {}).pricing.unit, "m");
assert.equal(adapter.adaptProduct(piece, {}).pricing.unit, "piece");

const ssr = renderProduct({ product: pipe, bootstrap: { categories: [], brands: [] }, origin: "https://example.test" });
assert.match(ssr.body, /100 грн\/м/);
assert.ok(read("catalog-data.js").includes(read("catalog/sales-units.js").trim()), "Bundle contains shared helper");

// Exercise the real initializer and account loader, not an assumed script order.
// Only unrelated header/footer/interaction chrome is stubbed for this Node DOM.
async function bootWithoutBundledHelper({ rejectCatalogue }) {
  const boot=sandbox(),scripts=[],root={innerHTML:""};
  delete boot.window.sofievkaSalesUnits;
  boot.document.querySelector=selector=>selector==='[data-page-root]'?root:null;
  boot.document.readyState='complete';
  boot.document.createElement=tag=>({tagName:tag.toUpperCase()});
  boot.window.sofievkaBrands=[];
  boot.window.sofievkaCatalogUI={trackProductImages(){}};
  boot.window.sofievkaAccount={decorateHeader(){}};
  boot.window.sofievkaCatalogRemoteRequested=true;
  const errors=[];boot.console={...console,error:(...args)=>errors.push(args[0])};
  let rejectReady;
  boot.window.sofievkaCatalogDataReady=rejectCatalogue?new Promise((resolve,reject)=>{rejectReady=reject;}):Promise.resolve();
  boot.document.head={append(script){
    scripts.push(script.src);
    if(script.src==='/catalog/sales-units.js')queueMicrotask(()=>{
      vm.runInContext(read('catalog/sales-units.js'),boot);
      if(rejectReady)rejectReady(new Error('Fixture late catalogue rejection'));
      script.onload();
    });
    else if(script.src.startsWith('/account-page.js')){
      assert.ok(boot.window.sofievkaSalesUnits,'Account module executes only after its small unit dependency');
      boot.window.sofievkaAccountPage={};script.onload();
    }else throw Error('Unexpected bootstrap dependency '+script.src);
  }};
  vm.runInContext(shell,boot);
  boot.window.__unitHooks.stubBootChrome();
  await Promise.all([boot.window.__unitHooks.initialize(),boot.window.__unitHooks.loadAccountScripts()]);
  assert.deepEqual(scripts,['/catalog/sales-units.js','/account-page.js?v=20261002-account-1'],'One lightweight helper, then account; no catalogue bundle required');
  assert.ok(root.innerHTML.includes('account page'));
  assert.equal(boot.window.__unitHooks.cartTotals([['pipe',3]]).total,300);
  assert.equal(boot.window.__unitHooks.cartTotals([['pipe',3]]).quantityLabel,'3 м','Local helper capture survives catalogue failure');
  assert.equal(errors.length,rejectCatalogue?1:0);
}
await bootWithoutBundledHelper({rejectCatalogue:false});
await bootWithoutBundledHelper({rejectCatalogue:true});
console.log(JSON.stringify({ status: "PASS", wholeMetres: "3 × 100 = 300", mixedBasket: "2 поз.", realRenderers: ["card", "PDP", "mobileBar", "cart", "checkout", "SSR"], reload: true, legacyPiece: true, localAdapter: true, oldPreloadedCatalogBootstrap: true, lateCatalogRejectionAccountBootstrap: true, dedupedLightweightUnitDependency: true, hostedConnections: 0 }));
