// Server first paint (api/seo-page.mjs): page content, escaping, real 404s, and that a catalogue API failure never
// becomes a 404. Runs on fake responses, no network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler, { applyToShell, createTaxonomy, displaySku, hasFilterParams, productGtin, renderBrand, renderCategory, renderProduct, resetMemory, resolvePage, shortSeoTitle } from "../api/seo-page.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const origin = "https://shop.test";

const categories = [
  { id: "heating", slug: "heating", title: "Опалення", parentId: null, status: "active", visibility: "catalog", order: 1, metaTitle: "Опалення | ТД", description: "Опис опалення" },
  { id: "boilers", slug: "boilers", title: "Котли", parentId: "heating", status: "active", visibility: "catalog", order: 1 },
  { id: "old", slug: "old", title: "Старий", parentId: "heating", status: "archived", visibility: "catalog", order: 2 },
  { id: "empty", slug: "empty", title: "Порожній", parentId: "heating", status: "active", visibility: "catalog", order: 3 }
];
const bootstrap = {
  categories,
  brands: [{ id: "wilo", name: "Wilo", description: "Насоси", seo: {} }, { id: "ghost", name: "Ghost" }],
  categoryCounts: { heating: 5, boilers: 5 },
  brandCounts: { wilo: 5 }
};
const product = {
  id: "P-1", slug: "kotel-1", sku: "SKU<1>", title: 'Котел "A" <script>alert(1)</script>', brandId: "wilo", primaryCategoryId: "boilers",
  seo: { title: "Котел А | ТД", description: "Опис котла" },
  pricing: { amount: 1000, oldAmount: 1200, currency: "UAH", priceStatus: "known" },
  inventory: { status: "in_stock" },
  images: ["/assets/a.webp"],
  descriptionSections: [{ title: "Опис", paragraphs: ["Перший абзац"] }],
  catalogAttributes: [
    { id: "productType", label: "Тип", value: "Котел", unit: "" },
    { id: "power", label: "Потужність, кВт", value: 24, unit: "кВт" }
  ]
};
const shell = '<!doctype html><html><head><title>Товар</title><meta name="description" content="старий"></head><body data-page="product"><div data-page-root></div></body></html>';

// Product page: head, schema, content.
const page = renderProduct({ product, relatedProducts: [{ slug: "kotel-2", title: "Котел 2" }], bootstrap, origin });
const html = applyToShell(shell, page);
assert.match(html, /<title>Котел А \| ТД<\/title>/);
assert.match(html, /<meta name="description" content="Опис котла">/);
assert.doesNotMatch(html, /content="старий"/);
assert.match(html, /<link rel="canonical" href="https:\/\/shop\.test\/product\/kotel-1">/);
assert.match(html, /property="og:image" content="https:\/\/shop\.test\/assets\/a\.webp"/);
assert.match(html, /<h1>Котел &quot;A&quot; &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/h1>/, "title is escaped in the body");
assert.doesNotMatch(html, /<script>alert/, "catalogue text cannot open a script tag");
assert.match(html, /data-page-root data-prerendered/);
assert.match(html, /1 000 грн|1\s000 грн/);
assert.match(html, /<s>1\s200 грн<\/s>/);
assert.match(html, /Перший абзац/);
assert.match(html, /<dt>Потужність<\/dt><dd>24 кВт<\/dd>/);
assert.doesNotMatch(html, /<dt>Тип<\/dt>/, "the internal product type is not a specification");
assert.match(html, /href="\/product\/kotel-2"/);
const schema = JSON.parse(/id="schema-product">(.*?)<\/script>/.exec(html)[1]);
assert.equal(schema.offers.price, "1000");
assert.equal(schema.offers.availability, "https://schema.org/InStock");
assert.equal(schema.brand.name, "Wilo");
// The quoted metre price has one explicit machine-readable basis, matching /м.
// Piece/absent/unknown unit codes preserve the previous Offer without guesses.
{
  const metrePage=renderProduct({product:{...product,pricing:{...product.pricing,unit:"m"}},bootstrap,origin});
  const metreHtml=applyToShell(shell,metrePage);
  const metreSchema=JSON.parse(/id="schema-product">(.*?)<\/script>/.exec(metreHtml)[1]);
  assert.deepEqual(metreSchema.offers.priceSpecification,{
    "@type":"UnitPriceSpecification",price:metreSchema.offers.price,priceCurrency:metreSchema.offers.priceCurrency,
    referenceQuantity:{"@type":"QuantitativeValue",value:1,unitText:"м"}
  });
  assert.match(metrePage.body,/1\s000 грн\/м/);
  for(const unit of [undefined,"piece","roll"]){
    const other=renderProduct({product:{...product,pricing:{...product.pricing,unit}},bootstrap,origin});
    assert.deepEqual(other.schemas["schema-product"].offers,schema.offers);
  }
  const unknown=renderProduct({product:{...product,pricing:{amount:null,priceStatus:"unknown",unit:"m"}},bootstrap,origin});
  assert.equal(unknown.schemas["schema-product"].offers,undefined);
}
const crumbs = JSON.parse(/id="schema-breadcrumbs">(.*?)<\/script>/.exec(html)[1]);
assert.deepEqual(crumbs.itemListElement.map(item => item.name).slice(0, 4), ["Головна", "Каталог", "Опалення", "Котли"]);

// Compiled shells have generic social metadata before the runtime page metadata. Link-preview crawlers may
// use the first value, so the rendered head must own one complete, current set, also after another application.
{
  const companyTags = `<meta property="og:site_name" content="ТД «Софіївка»">
<meta property="og:locale" content="uk_UA"><meta property="og:type" content="website">
<meta property="og:title" content="Товар | ТД «Софіївка»"><meta property="og:description" content="Загальний опис">
<meta property="og:url" content="https://shop.test/product"><meta property="og:image" content="https://shop.test/assets/og-image.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">`;
  const unrelated = `<meta name="theme-color" content="#fff"><meta name="google-site-verification" content="verify-123">
<meta data-property="og:title" content="not an Open Graph tag"><meta name="custom" content="property='og:title' > example">
<link rel="stylesheet" href="/site.css"><script src="/page-shell.js" defer></script>`;
  const compiledShell = shell.replace("</head>", `${companyTags}${unrelated}</head>`);
  const social = value => [...value.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)">/g)].map(([, name, content]) => [name, content]);
  const expected = [
    ["og:site_name", "ТД «Софіївка»"], ["og:locale", "uk_UA"], ["og:type", "product"],
    ["og:title", page.title], ["og:description", page.description], ["og:url", page.canonical],
    ["og:image", "https://shop.test/assets/a.webp"], ["twitter:card", "summary_large_image"]
  ];
  const rendered = applyToShell(compiledShell, page);
  assert.deepEqual(social(rendered), expected, "generic build metadata is replaced by exactly one product set");
  assert.ok(rendered.includes(unrelated), "unrelated meta, quoted content, stylesheets and scripts remain byte-identical");
  assert.deepEqual(social(applyToShell(rendered, page)), expected, "reapplying metadata does not duplicate social tags");
  const attributeVariants = `<META CONTENT='stale title' data-extra='x' PROPERTY = 'OG:TITLE' />
<meta content="stale description" property='og:description'><meta content='stale image' name=og:image>
<meta content='summary' NAME = 'TWITTER:CARD'><meta content='old tweet' property="twitter:title">
<meta content='uk_UA' property=og:locale><meta content='1200' property='og:image:width'>`;
  const variantsHtml = applyToShell(shell.replace("</head>", `${attributeVariants}</head>`), page);
  assert.deepEqual(social(variantsHtml), expected,
    "ownership follows name/property for either quote style, unquoted values, casing and attribute order");
  for (const originalTag of attributeVariants.split("\n")) assert.ok(!variantsHtml.includes(originalTag), `stale tag removed: ${originalTag}`);

  const categoryPage = renderCategory({ category: categories[0], bootstrap, origin });
  assert.equal(categoryPage.image, "");
  const categoryHtml = applyToShell(compiledShell, categoryPage);
  const categorySocial = social(categoryHtml);
  assert.equal(categorySocial.length, expected.length);
  for (const [name, content] of [["og:title", categoryPage.title], ["og:description", categoryPage.description],
    ["og:type", "website"], ["og:url", categoryPage.canonical], ["og:locale", "uk_UA"],
    ["og:image", "https://shop.test/assets/og-image.jpg"], ["twitter:card", "summary_large_image"]]) {
    assert.deepEqual(categorySocial.filter(([key]) => key === name), [[name, content]], `${name}: category uses its own metadata and company image`);
  }
  assert.deepEqual(social(applyToShell(rendered, categoryPage)), categorySocial,
    "a page without an image cannot inherit a previous product image on reapplication");
  const emptyDescription = applyToShell(compiledShell, { ...categoryPage, description: "" });
  assert.deepEqual(social(emptyDescription).filter(([key]) => key === "og:description"), [["og:description", ""]],
    "an empty page description replaces the generic company description without inventing content");
  const noLogoBrand = renderBrand({ brand: bootstrap.brands[0], bootstrap, origin });
  assert.equal(noLogoBrand.image, "", "a brand without a logo must not use the homepage HTML URL as an image");
  assert.deepEqual(social(applyToShell(compiledShell, noLogoBrand)).filter(([key]) => key === "og:image"),
    [["og:image", "https://shop.test/assets/og-image.jpg"]], "a brand without a logo uses the corporate image");
  const withLogoBrand = renderBrand({ brand: { ...bootstrap.brands[0], logo: "assets/brands/wilo.svg" }, bootstrap, origin });
  assert.equal(withLogoBrand.image, "https://shop.test/assets/brands/wilo.svg");
  assert.deepEqual(social(applyToShell(compiledShell, withLogoBrand)).filter(([key]) => key === "og:image"),
    [["og:image", "https://shop.test/assets/brands/wilo.svg"]], "a verified brand logo remains the page image");
}

// A framed shell (the build's header, placeholders and footer): the content goes into <main> at the slot, the frame
// stays around it, and the content is hidden until the client render (shown by the shell's <noscript> style).
{
  const framed = '<!doctype html><html><head><title>Товар</title></head><body data-page="product"><div data-page-root data-page-frame><header class="site-header"></header><main id="main" class="page-main" aria-busy="true"><div class="container page-frame" aria-hidden="true"></div><!--first-paint--></main><footer class="footer"></footer></div></body></html>';
  const filled = applyToShell(framed, page);
  assert.match(filled, /<div data-page-root data-prerendered data-page-frame><header class="site-header"><\/header><main[^>]*><div class="container page-frame" aria-hidden="true"><\/div><article class="ssr-page">/);
  assert.match(filled, /<\/article><\/main><footer class="footer"><\/footer><\/div>/, "the content closes before the footer");
  assert.doesNotMatch(filled, /<!--first-paint-->/);
  assert.match(filled, /\[data-page-frame\] \.ssr-page\{display:none\}/);
}

// A product on request has no price in the schema or the page.
const onRequest = renderProduct({ product: { ...product, pricing: { amount: null, priceStatus: "on_request" }, inventory: { status: "unknown" } }, bootstrap, origin });
assert.equal(onRequest.schemas["schema-product"].offers, undefined);
assert.match(onRequest.body, /Ціну уточнюйте/);
assert.match(onRequest.body, /Наявність уточнюйте/);

// Taxonomy follows the client: hidden categories do not resolve, hierarchy must match.
const taxonomy = createTaxonomy(categories);
assert.equal(taxonomy.resolve(["heating", "boilers"]).id, "boilers");
assert.equal(taxonomy.resolve(["heating", "old"]), null);
assert.equal(taxonomy.resolve(["boilers"]), null);
assert.equal(taxonomy.pathOf(categories[1]), "/catalog/heating/boilers");

assert.equal(hasFilterParams("?utm_source=x&gclid=1"), false);
assert.equal(hasFilterParams("?brand=wilo"), true);

// Routing decisions.
const rpcWith = overrides => async (name, body) => {
  if (overrides[name]) return overrides[name](body);
  if (name === "get_catalog_bootstrap") return bootstrap;
  if (name === "get_catalog_products") return { products: [{ slug: "kotel-1", title: "Котел 1", pricing: { priceStatus: "on_request" } }], total: 1 };
  return null;
};
const resolve = async (args, overrides = {}) => { resetMemory(); return resolvePage({ origin, rpc: rpcWith(overrides), ...args }); };

assert.equal((await resolve({ kind: "product", slug: "none" })).missing, true);
assert.equal((await resolve({ kind: "product", slug: "P-1" }, { get_catalog_product: body => body.legacy_id === "P-1" ? { product } : null })).redirect, "/product/kotel-1");
assert.ok((await resolve({ kind: "product", slug: "kotel-1" }, { get_catalog_product_by_slug: () => ({ product }) })).page);
assert.equal((await resolve({ kind: "catalog", path: "heating/none" })).missing, true);
assert.equal((await resolve({ kind: "catalog", path: "heating/old" })).missing, true);
assert.equal((await resolve({ kind: "catalog", path: "heating/boilers" })).page.robots, "index,follow");
assert.equal((await resolve({ kind: "catalog", path: "heating/boilers", search: "?brand=wilo" })).page.robots, "noindex,follow");
assert.equal((await resolve({ kind: "catalog", path: "heating/empty" })).page.robots, "noindex,follow");
assert.match((await resolve({ kind: "catalog", path: "heating" })).page.body, /href="\/catalog\/heating\/boilers"/);
assert.equal((await resolve({ kind: "catalog", path: "heating/gas-boilers" })).plainShell, true, "old addresses still resolve in the browser");
assert.equal((await resolve({ kind: "catalog", path: "water-supply/water-treatment/anything" })).plainShell, true);
assert.equal((await resolve({ kind: "catalog", path: ":path+" })).plainShell, true, "an unsubstituted rewrite is not a 404");
assert.equal((await resolve({ kind: "catalog" })).plainShell, true);
assert.equal((await resolve({ kind: "brand", slug: "none" })).missing, true);
assert.equal((await resolve({ kind: "brand", slug: "wilo" })).page.robots, "index,follow");
assert.equal((await resolve({ kind: "brand", slug: "ghost" })).page.robots, "noindex,follow", "a brand without products stays out of the index");

// Every old address catalog/routing.js resolves must not answer 404.
const legacyInRouting = [...read("catalog/routing.js").matchAll(/"(\/catalog\/[^"]+)":\s*"/g)].map(match => match[1]);
assert.ok(legacyInRouting.length > 20);
for (const legacy of legacyInRouting) {
  const result = await resolve({ kind: "catalog", path: legacy.slice("/catalog/".length) });
  assert.notEqual(result.missing, true, `${legacy} answers 404`);
}

// HTTP behaviour of the handler.
async function request(query, { apiFails = false, url = "/api/seo-page" } = {}) {
  resetMemory();
  const fetchImpl = async target => {
    const address = String(target);
    if (address.includes("/rest/v1/rpc/")) {
      if (apiFails) return new Response("down", { status: 500 });
      const name = address.split("/").pop();
      if (name === "get_catalog_bootstrap") return Response.json(bootstrap);
      if (name === "get_catalog_product_by_slug" || name === "get_catalog_product") return Response.json(null);
      return Response.json({ products: [], total: 0 });
    }
    return new Response(address.endsWith("/404.html") ? '<body data-page="not-found"><div data-page-root></div>' : shell, { status: address.endsWith("/404.html") ? 404 : 200 });
  };
  const headers = {};
  const res = { statusCode: 0, setHeader: (name, value) => { headers[name.toLowerCase()] = value; }, end(body) { this.body = body; } };
  const realError = console.error;
  console.error = () => {};
  try {
    await handler({ query, url, headers: { "x-forwarded-host": "shop.test" } }, res, {
      fetchImpl, env: { SUPABASE_URL: "https://db.test", SUPABASE_PUBLISHABLE_KEY: "key", SOFIEVKA_SITE_URL: origin }
    });
  } finally { console.error = realError; }
  return { status: res.statusCode, body: res.body, headers };
}

const missing = await request({ kind: "product", slug: "none" });
assert.equal(missing.status, 404, "an unknown product answers 404");
assert.match(missing.body, /data-page="not-found"/);
assert.match(missing.headers["cache-control"], /s-maxage=60/);

const failed = await request({ kind: "product", slug: "kotel-1" }, { apiFails: true });
assert.equal(failed.status, 200, "an API failure is not a 404");
assert.match(failed.headers["cache-control"], /s-maxage=30/);
assert.match(failed.body, /<div data-page-root><\/div>/, "an API failure serves the plain shell");

const category = await request({ kind: "catalog", path: "heating/boilers" });
assert.equal(category.status, 200);
assert.match(category.body, /<h1>Котли<\/h1>/);
assert.match(category.headers["cache-control"], /s-maxage=300/);

const multiSegment = await request({ kind: "catalog", path: ["heating", "boilers"] });
assert.match(multiSegment.body, /<h1>Котли<\/h1>/, "a path given as segments works too");

// Routing config.
const vercel = JSON.parse(read("vercel.json"));
const destination = source => vercel.rewrites.find(rule => rule.source === source)?.destination;
assert.equal(destination("/product/:slug"), "/api/seo-page?kind=product&slug=:slug");
assert.equal(destination("/brands/:slug"), "/api/seo-page?kind=brand&slug=:slug");
assert.equal(destination("/catalog/:path(.+)"), "/api/seo-page?kind=catalog&path=:path");
assert.equal(destination("/catalog"), "/catalog.html", "the shells stay static: the function reads them");
assert.equal(destination("/product"), "/product.html");
assert.equal(destination("/brand"), "/brand.html");

// The server first paint and page-shell.js apply the same SKU, title and GTIN rules (product card audit 2026-11-11).
{
  const shell = read("page-shell.js");
  const pick = name => {
    const start = shell.indexOf(`  function ${name}(`);
    assert.ok(start >= 0, `page-shell.js: ${name}`);
    return shell.slice(start, shell.indexOf("\n  }\n", start) + 4);
  };
  const browser = new Function(`${pick("displaySku")}
${pick("shortSeoTitle")}
${pick("productGtin")}
return { displaySku, shortSeoTitle, productGtin };`)();
  const skus = [{ sku: "99199593", brandId: "grundfos", title: "Насос" }, { sku: "altep-p20-5", brandId: "altep" }, { sku: "baxi-аксесуари-для-котлів", brandId: "baxi" },
    { sku: "TJ-new_15", brandId: "termojet" }, { sku: "Датчик Холла", brandId: "tech" }, { sku: "КПЛ50-20(ПГ17)ПН", brandId: "focus" }, { sku: "Насос", title: "насос" }];
  for (const item of skus) assert.equal(displaySku(item), browser.displaySku(item), item.sku);
  assert.equal(displaySku(skus[1]), "", "placeholder hidden");
  assert.equal(displaySku(skus[5]), "КПЛ50-20(ПГ17)ПН", "a Cyrillic manufacturer code stays");
  const titles = ["Насос Wilo Actun FIRST SPU 4.01-10-B/XI4-50-1-230 — характеристики | ТД «Софіївка»", "Котел А — характеристики | ТД «Софіївка»", "Котел — характеристики та ціна | ТД «Софіївка» котел котел котел котел котел"];
  for (const title of titles) assert.equal(shortSeoTitle(title), browser.shortSeoTitle(title), title);
  assert.equal(shortSeoTitle(titles[0]), "Насос Wilo Actun FIRST SPU 4.01-10-B/XI4-50-1-230 | ТД «Софіївка»");
  assert.equal(shortSeoTitle(titles[1]), titles[1], "short titles stay as written");
  const gtins = [{ unmappedAttributes: [{ label: "EAN номер", value: "5712608550331" }] }, { unmappedAttributes: [{ label: "EAN номер", value: "123" }] }, {}];
  for (const item of gtins) assert.equal(productGtin(item), browser.productGtin(item));
  assert.equal(productGtin(gtins[0]), "5712608550331");
  const page = renderProduct({ product: { ...product, sku: "wilo-nasos-dlia-svердловини", unmappedAttributes: gtins[0].unmappedAttributes }, bootstrap, origin });
  assert.equal(page.schemas["schema-product"].gtin, "5712608550331");
}

console.log(JSON.stringify({ status: "ok", legacyAddresses: legacyInRouting.length }));
