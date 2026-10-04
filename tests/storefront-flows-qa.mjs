// Storefront regression flows (local only): header cart link, cart/checkout prices, compare, contact-with-product,
// /buyers links, robots meta, catalogue-outage resilience, related-products quantity.
//
//   npm run -s storefront:qa                     # builds tmp/storefront-qa-dist, then runs every check
//   node tests/storefront-flows-qa.mjs --no-build --dist=dist
//   node tests/storefront-flows-qa.mjs --serve   # only start the servers (debugging), Ctrl+C to stop
//
// The PGlite-backed tests/db-local/qa-server.mjs answers /auth and /rest; a small front server in this file serves the
// build with the vercel.json rewrites (qa-server.mjs itself has no /catalog/*, /brands/:slug, /product/:slug rewrites)
// and falls back to the repo's /assets when the build was made with --skip-assets.
// Prints one JSON line {status:"ok", checks:[...]} on success; exits 1 with the failing assertion otherwise.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = name => process.argv.find(item => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = name => process.argv.includes(`--${name}`);
const distDir = path.resolve(root, argument("dist") || "tmp/storefront-qa-dist");
const apiPort = Number(argument("api-port") || 4391);
const frontPort = Number(argument("port") || 4390);
const base = `http://localhost:${frontPort}`;
const onlyChecks = (argument("only") || "").split(",").filter(Boolean);
const keepGoing = flag("keep-going");

function loadPlaywright() {
  for (const dir of ["/opt/node-tools/node_modules/", "/opt/npm-tools/node_modules/", path.join(root, "node_modules/")]) {
    if (fs.existsSync(path.join(dir, "playwright"))) return createRequire(dir)("playwright");
  }
  throw new Error("Playwright not found in /opt/node-tools, /opt/npm-tools or node_modules.");
}
function chromiumExecutable() {
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(browsers)) return undefined;
  const dir = fs.readdirSync(browsers).filter(name => /^chromium-\d+$/.test(name)).sort().pop();
  const executable = dir && path.join(browsers, dir, "chrome-linux/chrome");
  return executable && fs.existsSync(executable) ? executable : undefined;
}

// ---------- servers ----------
if (!flag("no-build")) {
  const build = spawnSync(process.execPath, ["scripts/build-static-site.mjs", `--output-dir=${path.relative(root, distDir)}`, "--skip-assets"], { cwd: root, encoding: "utf8" });
  if (build.status !== 0) throw new Error(`Build failed:\n${build.stderr || build.stdout}`);
}
assert.ok(fs.existsSync(path.join(distDir, "index.html")), `No build in ${distDir}; run without --no-build or build it first.`);

const api = spawn(process.execPath, ["tests/db-local/qa-server.mjs", `--port=${apiPort}`], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let apiLog = "";
process.on("exit", () => api.kill());
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`qa-server did not start:\n${apiLog}`)), 180_000);
  api.stdout.on("data", chunk => { apiLog += chunk; if (apiLog.includes('"listening"')) { clearTimeout(timer); resolve(); } });
  api.stderr.on("data", chunk => { apiLog += chunk; });
  api.on("exit", code => { clearTimeout(timer); reject(new Error(`qa-server exited (${code}):\n${apiLog}`)); });
});

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const rewrites = vercel.rewrites.map(rule => ({
  pattern: new RegExp(`^${rule.source.replace(/:[a-z]+\*/gi, ".*").replace(/:[a-z]+/gi, "[^/]+")}$`),
  destination: rule.destination
}));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".ttf": "font/ttf", ".woff2": "font/woff2",
  ".woff": "font/woff", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml", ".pdf": "application/pdf" };
const assetFallbacks = new Set();

function proxy(request, response) {
  const upstream = http.request({ host: "127.0.0.1", port: apiPort, path: request.url, method: request.method, headers: request.headers }, reply => {
    response.writeHead(reply.statusCode, reply.headers);
    reply.pipe(response);
  });
  upstream.on("error", error => { response.writeHead(502); response.end(error.message); });
  request.pipe(upstream);
}
function resolveFile(pathname) {
  let target = pathname === "/" ? "/index.html" : pathname;
  // Like Vercel: an existing file wins over the rewrites (/catalog/*.mjs modules vs the /catalog/:path* rewrite).
  const direct = path.join(distDir, decodeURIComponent(pathname));
  if (direct.startsWith(distDir) && path.extname(pathname) && fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  const rule = rewrites.find(item => item.pattern.test(pathname));
  if (rule) target = rule.destination;
  else if (!path.extname(target)) target = `${target}.html`;
  const file = path.join(distDir, decodeURIComponent(target));
  if (!file.startsWith(distDir)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (target.startsWith("/assets/")) {
    const fallback = path.join(root, decodeURIComponent(target));
    if (fallback.startsWith(path.join(root, "assets")) && fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
      assetFallbacks.add(target.split("/").slice(0, 3).join("/"));
      return fallback;
    }
  }
  return null;
}
const front = http.createServer((request, response) => {
  const url = new URL(request.url, base);
  if (/^\/(auth|rest)\/v1\//.test(url.pathname) || url.pathname.startsWith("/__qa/") || url.pathname === "/catalog-runtime-config.js") return proxy(request, response);
  const file = resolveFile(url.pathname);
  if (!file) {
    const notFound = path.join(distDir, "404.html");
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    return response.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : "not found");
  }
  response.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => front.listen(frontPort, resolve));

function stopServers() {
  front.close();
  api.kill();
}
if (flag("serve")) {
  console.log(JSON.stringify({ status: "serving", front: base, api: `http://localhost:${apiPort}`, dist: distDir }));
  process.on("SIGINT", () => { stopServers(); process.exit(0); });
  await new Promise(() => {});
}

// ---------- browser ----------
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: chromiumExecutable() });
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } };
const pageErrors = [];

async function newPage(viewport = VIEWPORTS.desktop) {
  const context = await browser.newContext({ viewport, locale: "uk-UA" });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(`${page.url()} :: ${error.message}`));
  // Never let a real lead or order reach any server from this test.
  await page.route(/\/rest\/v1\/rpc\/crm_submit_(lead|order)$/, route => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"blocked by storefront-flows-qa"}' }));
  return page;
}
async function open(page, pathname, options = {}) {
  const response = await page.goto(`${base}${pathname}`, { waitUntil: "networkidle" });
  assert.ok(response && response.status() < 400, `${pathname}: HTTP ${response?.status()}`);
  // page-shell.js builds the whole page (header included) into [data-page-root] once the catalogue scripts have run,
  // which is after "networkidle"; the toast container is the last thing it appends.
  if (options.waitForShell !== false && await page.locator("[data-page-root]").count()) {
    await page.waitForSelector("[data-page-toast]", { state: "attached", timeout: 30000 })
      .catch(() => { throw new Error(`${pathname}: page-shell did not render [data-page-root] within 30 s`); });
  }
  return response;
}
async function seedStorage(page, values) {
  if (!page.url().startsWith(base)) await open(page, "/about");
  await page.evaluate(entries => { localStorage.clear(); for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value)); }, values);
}
const formatMoney = value => `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(value))} грн`;
const normalize = text => String(text || "").replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
async function visibleBox(locator) {
  if (!(await locator.count())) return null;
  const box = await locator.first().boundingBox();
  const visible = await locator.first().isVisible();
  return visible && box && box.width > 0 && box.height > 0 ? box : null;
}

// Catalogue facts, read once from the local build (the storefront runs on the local catalogue snapshot here).
const facts = await (async () => {
  const page = await newPage();
  await open(page, "/catalog");
  const data = await page.evaluate(() => {
    const catalog = window.sofievkaCatalog;
    const products = catalog?.catalogProducts || [];
    const amount = product => Number(product.pricing?.amount ?? product.price) || 0;
    const pick = product => product && ({ id: product.id, slug: product.slug || "", sku: product.sku || "", title: product.title,
      amount: amount(product), compareType: product.compareType || "", category: product.primaryCategoryId || "",
      categoryUrl: product.primaryCategoryId ? catalog.categoryUrl(product.primaryCategoryId) : "", brand: product.brandId || "" });
    const priced = products.filter(product => amount(product) > 0 && product.slug);
    const unpriced = products.filter(product => !(amount(product) > 0) && product.slug);
    const groups = new Map();
    for (const product of products) {
      if (!product.compareType || !product.primaryCategoryId) continue;
      const key = `${product.compareType}|${product.primaryCategoryId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(product);
    }
    // Compare pair: same type and category, one priced + one unpriced when such a pair exists (exercises «0 грн»).
    const mixed = [...groups.values()].filter(list => list.some(item => amount(item) > 0) && list.some(item => !(amount(item) > 0)));
    const group = mixed.sort((a, b) => b.length - a.length)[0] || [...groups.values()].filter(list => list.length > 1).sort((a, b) => b.length - a.length)[0] || [];
    const pair = mixed.length ? [group.find(item => amount(item) > 0), group.find(item => !(amount(item) > 0))] : group.slice(0, 2);
    const other = products.find(item => item.compareType && item.compareType !== pair[0]?.compareType && item.primaryCategoryId && catalog.categoryUrl(item.primaryCategoryId));
    // A brand + category combination with products, for the filtered-listing robots check.
    const brandProduct = priced.find(item => item.brandId && catalog.countForBrand?.(item.brandId) > 0) || priced[0];
    return {
      total: products.length,
      priced: priced.length,
      unpriced: unpriced.length,
      pricedProducts: priced.slice(0, 60).map(pick),
      unpricedProduct: pick(unpriced[0]),
      compare: pair.filter(Boolean).map(pick),
      compareMixed: mixed.length > 0,
      otherTypeProduct: pick(other),
      brand: brandProduct ? { id: brandProduct.brandId, url: catalog.brandUrl(brandProduct.brandId), categoryUrl: catalog.categoryUrl(brandProduct.primaryCategoryId) } : null
    };
  });
  // Supabase-mode fixtures: the bootstrap and canonical products (pricing.amount, images[]) the scoped pages receive.
  const wanted = [data.pricedProducts[0]?.id, data.unpricedProduct?.id, ...data.compare.map(item => item.id)].filter(Boolean);
  data.scoped = await page.evaluate(ids => {
    const catalog = window.sofievkaCatalog;
    const snapshot = window.sofievkaCatalogSnapshot;
    const categories = snapshot.categories || [];
    const brands = snapshot.brands || [];
    return {
      bootstrap: {
        version: "storefront-flows-qa", categories, brands, attributeDefinitions: snapshot.attributeDefinitions || [],
        totalProducts: snapshot.products.length,
        categoryCounts: Object.fromEntries(categories.map(category => [category.id, catalog.countForCategory(category.id)])),
        brandCounts: Object.fromEntries(brands.map(brand => [brand.id, catalog.countForBrand(brand.id)])),
        collections: snapshot.collections || []
      },
      products: Object.fromEntries(snapshot.products.filter(product => ids.includes(product.id)).map(product => [product.id, JSON.parse(JSON.stringify(product))]))
    };
  }, wanted);
  await page.context().close();
  assert.ok(data.total > 0, "local catalogue has no products");
  assert.ok(data.priced > 0, "local catalogue has no priced products (pricing.amount > 0)");
  assert.ok(data.unpricedProduct, "local catalogue has no product without a price");
  assert.equal(data.compare.length, 2, "no two products of the same compare type and category");
  assert.ok(data.otherTypeProduct, "no product of another compare type");
  assert.ok(data.brand?.url, "no brand with products");
  return data;
})();
const pricedProduct = facts.pricedProducts[0];
const productPath = product => product.slug ? `/product/${encodeURIComponent(product.slug)}` : `/product?id=${encodeURIComponent(product.id)}`;

// ---------- checks ----------
const checks = [];
const failures = [];
async function check(name, fn) {
  if (onlyChecks.length && !onlyChecks.some(item => name.startsWith(item))) return;
  const started = Date.now();
  try {
    const detail = await fn();
    checks.push({ name, ok: true, ms: Date.now() - started, ...(detail ? { detail } : {}) });
  } catch (error) {
    const entry = { name, ok: false, ms: Date.now() - started, error: error.message.split("\n").slice(0, 6).join("\n") };
    checks.push(entry);
    failures.push(entry);
    if (!keepGoing) {
      stopServers();
      await browser.close();
      console.error(`storefront-flows-qa: check "${name}" failed\n${error.stack || error.message}`);
      process.exit(1);
    }
  }
}

// 1. Header cart link: visible with a non-zero box and pointing to /cart on every page type and width.
for (const [label, viewport] of [["mobile", VIEWPORTS.mobile], ["tablet", VIEWPORTS.tablet], ["desktop", VIEWPORTS.desktop]]) {
  await check(`header-cart-link-${label}`, async () => {
    const page = await newPage(viewport);
    const pages = [productPath(pricedProduct), pricedProduct.categoryUrl, facts.brand.url, "/contact", "/cart"];
    for (const pathname of pages) {
      await open(page, pathname);
      const link = page.locator("header a[data-cart], a[data-cart]").first();
      assert.ok(await link.count(), `${pathname} @${viewport.width}: no a[data-cart] in the header`);
      const box = await visibleBox(link);
      assert.ok(box, `${pathname} @${viewport.width}: a[data-cart] is not visible (box ${JSON.stringify(await link.boundingBox())})`);
      const href = await link.evaluate(node => new URL(node.getAttribute("href") || "", location.href).pathname);
      assert.equal(href, "/cart", `${pathname} @${viewport.width}: a[data-cart] links to ${href}`);
    }
    await page.context().close();
    return { pages };
  });
}

// 2. Cart and checkout prices.
for (const [label, viewport] of [["desktop", VIEWPORTS.desktop], ["mobile", VIEWPORTS.mobile]]) {
  await check(`cart-prices-${label}`, async () => {
    const page = await newPage(viewport);
    await seedStorage(page, { "sofievka-cart": { [pricedProduct.id]: 2 } });
    await open(page, "/cart");
    const line = page.locator(".cart-item").first();
    assert.ok(await line.count(), "/cart: no .cart-item for a seeded priced product");
    const expectedLine = normalize(formatMoney(pricedProduct.amount * 2));
    const lineText = normalize(await line.innerText());
    assert.ok(!lineText.includes("Ціну уточнюйте"), `/cart: priced product ${pricedProduct.id} (${pricedProduct.amount} грн) shows «Ціну уточнюйте»: ${lineText}`);
    const linePrice = normalize(await line.locator(".cart-item__price strong").innerText());
    assert.equal(linePrice, expectedLine, `/cart: line price for ${pricedProduct.id} ×2`);
    const src = await line.locator("img").first().getAttribute("src");
    assert.ok(src && src.trim(), `/cart: line image src is empty for ${pricedProduct.id}`);
    const total = normalize(await page.locator(".order-summary__total dd").first().innerText());
    assert.equal(total, expectedLine, "/cart: «До оплати» total");
    assert.match(normalize(await page.locator(".order-summary__total dt").first().innerText()), /До оплати/);

    await open(page, "/checkout");
    const summary = normalize(await page.locator(".order-summary").first().innerText());
    assert.ok(summary.includes(expectedLine), `/checkout: total ${expectedLine} not in the order summary: ${summary.slice(0, 300)}`);

    await seedStorage(page, { "sofievka-cart": { [facts.unpricedProduct.id]: 1 } });
    await open(page, "/cart");
    const unpricedText = normalize(await page.locator(".cart-item .cart-item__price").first().innerText());
    assert.match(unpricedText, /Ціну уточнюйте/, `/cart: unpriced product ${facts.unpricedProduct.id} line`);
    await page.context().close();
    return { product: pricedProduct.id, amount: pricedProduct.amount, line: expectedLine };
  });
}

// 2b. The same cart/compare pages in Supabase scoped mode (Preview/Production): the runtime config is switched to
// Supabase and the catalogue RPCs are answered from the local snapshot, so products arrive in the canonical shape
// (pricing.amount, images[]) instead of the legacy local shape (price, image). PGlite has no published catalogue release.
async function useScopedCatalog(page) {
  await page.route(/\/catalog-runtime-config\.js(\?|$)/, route => route.fulfill({ contentType: "text/javascript",
    body: `window.SOFIEVKA_CATALOG_CONFIG=Object.freeze(${JSON.stringify({ source: "supabase", environment: "preview",
      supabase: { url: `http://localhost:${apiPort}`, publishableKey: "sb_publishable_local_qa", projectRef: "wfxcklglujgramasdzyr" } })});` }));
  await page.route(/\/rest\/v1\/rpc\/get_catalog_bootstrap$/, route => route.fulfill({ contentType: "application/json", body: JSON.stringify(facts.scoped.bootstrap) }));
  await page.route(/\/rest\/v1\/rpc\/get_catalog_products$/, route => {
    const body = JSON.parse(route.request().postData() || "{}");
    const products = (body.product_ids || []).map(id => facts.scoped.products[id]).filter(Boolean);
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: "storefront-flows-qa", total: products.length, page: 1, pageSize: products.length, products }) });
  });
}
for (const [label, viewport] of [["desktop", VIEWPORTS.desktop], ["mobile", VIEWPORTS.mobile]]) {
  await check(`scoped-cart-compare-${label}`, async () => {
    const page = await newPage(viewport);
    await useScopedCatalog(page);
    await seedStorage(page, { "sofievka-cart": { [pricedProduct.id]: 2, [facts.unpricedProduct.id]: 1 } });
    await open(page, "/cart");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.catalogDataSource), "supabase-scoped", "/cart (scoped): catalogue source did not switch to supabase-scoped");
    const expectedLine = normalize(formatMoney(pricedProduct.amount * 2));
    const lines = page.locator(".cart-item");
    assert.equal(await lines.count(), 2, "/cart (scoped): expected 2 lines");
    const pricedLine = lines.filter({ hasText: pricedProduct.sku }).first();
    const pricedText = normalize(await pricedLine.locator(".cart-item__price strong").innerText());
    assert.equal(pricedText, expectedLine, `/cart (scoped): priced product ${pricedProduct.id} (pricing.amount ${pricedProduct.amount}) ×2`);
    const src = await pricedLine.locator("img").first().getAttribute("src");
    assert.ok(src && src.trim() && src !== "undefined", `/cart (scoped): image src «${src}»`);
    const unpricedText = normalize(await lines.filter({ hasText: facts.unpricedProduct.sku }).first().locator(".cart-item__price").innerText());
    assert.match(unpricedText, /Ціну уточнюйте/, "/cart (scoped): unpriced line");
    const total = normalize(await page.locator(".order-summary__total dd").first().innerText());
    assert.ok(total.startsWith(expectedLine), `/cart (scoped): «До оплати» «${total}», expected ${expectedLine} (+ уточнення)`);
    await open(page, "/checkout");
    const summary = normalize(await page.locator(".order-summary").first().innerText());
    assert.ok(summary.includes(expectedLine), `/checkout (scoped): ${expectedLine} not in the order summary: ${summary.slice(0, 300)}`);

    await seedStorage(page, { "sofievka-compare": facts.compare.map(item => item.id) });
    await open(page, "/compare");
    const h1 = normalize(await page.locator("main h1").first().innerText());
    assert.ok(h1 && !/undefined|null/i.test(h1), `/compare (scoped): H1 is «${h1}»`);
    const table = page.locator(".compare-table");
    assert.ok(await table.count(), "/compare (scoped): no .compare-table");
    assert.equal(await table.locator("thead [data-compare-remove]").count(), 2, "/compare (scoped): expected 2 product columns");
    const tableText = normalize(await table.innerText());
    const zeroPrices = [...tableText.matchAll(/(\d[\d ]*) грн/g)].filter(match => Number(match[1].replace(/ /g, "")) === 0);
    assert.equal(zeroPrices.length, 0, "/compare (scoped): «0 грн» shown");
    assert.ok(!/undefined/.test(tableText), "/compare (scoped): «undefined» in the table");
    const rowLabels = (await table.locator("tbody tr > th").allInnerTexts()).map(normalize);
    assert.ok(rowLabels.filter(text => !["Код товару", "Наявність", "Ціна", "Дія"].includes(text)).length >= 1, `/compare (scoped): no characteristic rows (rows: ${rowLabels.join(", ")})`);
    await page.context().close();
    return { line: expectedLine, h1 };
  });
}

// 3. Compare.
for (const [label, viewport] of [["desktop", VIEWPORTS.desktop], ["mobile", VIEWPORTS.mobile]]) {
  await check(`compare-${label}`, async () => {
    const page = await newPage(viewport);
    const ids = facts.compare.map(item => item.id);
    await seedStorage(page, { "sofievka-compare": ids });
    await open(page, "/compare");
    const h1 = normalize(await page.locator("main h1").first().innerText());
    assert.ok(h1 && !/undefined|null/i.test(h1), `/compare: H1 is «${h1}»`);
    const table = page.locator(".compare-table");
    assert.ok(await table.count(), "/compare: no .compare-table for two products of one type");
    assert.equal(await table.locator("thead [data-compare-remove]").count(), 2, "/compare: expected 2 product columns");
    const tableText = normalize(await table.innerText());
    const zeroPrices = [...tableText.matchAll(/(\d[\d ]*) грн/g)].filter(match => Number(match[1].replace(/ /g, "")) === 0);
    assert.equal(zeroPrices.length, 0, `/compare: «0 грн» shown (unpriced product in the pair: ${facts.compareMixed})`);
    const rowLabels = (await table.locator("tbody tr > th").allInnerTexts()).map(normalize);
    const characteristic = rowLabels.filter(text => !["Код товару", "Наявність", "Ціна", "Дія"].includes(text));
    assert.ok(characteristic.length >= 1, `/compare: no characteristic rows besides the code (rows: ${rowLabels.join(", ")})`);
    await table.locator("[data-compare-remove]").first().click();
    await page.waitForFunction(() => document.querySelectorAll(".compare-table thead [data-compare-remove]").length === 1, null, { timeout: 5000 })
      .catch(() => { throw new Error("/compare: «Прибрати» did not remove a column"); });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sofievka-compare") || "[]"));
    assert.equal(stored.length, 1, "/compare: «Прибрати» did not update sofievka-compare");
    await page.getByRole("button", { name: "Очистити порівняння" }).click();
    await page.waitForFunction(() => !document.querySelector(".compare-table"), null, { timeout: 5000 })
      .catch(() => { throw new Error("/compare: «Очистити порівняння» left the table"); });
    assert.ok(await page.locator('main a[href="/catalog"]').count(), "/compare: empty state has no link to /catalog");
    assert.equal(await page.evaluate(() => localStorage.getItem("sofievka-compare")), "[]", "/compare: storage not cleared");

    // A card of another type: toast, not added.
    const other = facts.otherTypeProduct;
    await seedStorage(page, { "sofievka-compare": ids });
    await open(page, other.categoryUrl);
    const button = page.locator(`[data-compare="${other.id}"]`).first();
    await button.waitFor({ state: "attached", timeout: 10000 }).catch(() => { throw new Error(`${other.categoryUrl}: no [data-compare="${other.id}"] card button`); });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const toast = page.locator("[data-page-toast].is-visible, [data-toast].is-visible");
    await toast.first().waitFor({ state: "visible", timeout: 5000 }).catch(() => { throw new Error(`${other.categoryUrl}: no toast after comparing a product of another type`); });
    const toastText = normalize(await toast.first().innerText());
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("sofievka-compare") || "[]"));
    assert.deepEqual(after, ids, `${other.categoryUrl}: product of another type was added to compare (toast «${toastText}»)`);
    await page.context().close();
    return { ids, other: other.id, toast: toastText };
  });
}

// 4. Contact form pre-filled from ?product=.
for (const [label, viewport] of [["desktop", VIEWPORTS.desktop], ["mobile", VIEWPORTS.mobile]]) {
  await check(`contact-product-${label}`, async () => {
    const page = await newPage(viewport);
    const product = facts.unpricedProduct;
    let payload = null;
    await page.route(/\/rest\/v1\/rpc\/crm_submit_lead$/, async route => {
      payload = JSON.parse(route.request().postData() || "{}").payload || null;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "00000000-0000-4000-8000-00000000qa01", number: "QA-1" }) });
    });
    await open(page, `/contact?product=${encodeURIComponent(product.id)}`);
    const form = page.locator('[data-lead-form="contact"]');
    const message = await form.locator('textarea[name="message"]').inputValue();
    assert.ok(message.includes(product.title), `/contact?product=: message lacks the title «${product.title}»: «${message}»`);
    assert.ok(message.includes(product.sku), `/contact?product=: message lacks the code ${product.sku}: «${message}»`);
    assert.ok(await visibleBox(page.locator(".lead-product")), "/contact?product=: .lead-product note is not visible");
    await form.locator('input[name="name"]').fill("QA Тест");
    await form.locator('input[name="phone"]').fill("067 123 45 67");
    await form.locator('[type="submit"]').click();
    await form.locator(".lead-success").waitFor({ timeout: 10000 }).catch(() => { throw new Error("/contact?product=: no success state after the faked crm_submit_lead"); });
    assert.ok(payload, "/contact?product=: crm_submit_lead was not called");
    assert.ok(String(payload.pageUrl || "").includes("?product="), `/contact?product=: payload.pageUrl is «${payload.pageUrl}»`);
    await page.context().close();
    return { product: product.id, pageUrl: payload.pageUrl };
  });
}

// 5. /buyers links.
await check("buyers-links", async () => {
  const page = await newPage();
  await open(page, "/buyers");
  const protocolRelative = await page.$$eval('a[href^="//"]', links => links.map(link => link.getAttribute("href")));
  assert.deepEqual(protocolRelative, [], `/buyers: protocol-relative links ${protocolRelative.join(", ")}`);
  const cards = await page.$$eval(".buyer-help-grid a", links => links.map(link => link.getAttribute("href")));
  assert.deepEqual(cards, ["/delivery", "/payment", "/warranty", "/returns", "/faq", "/contact"], "/buyers: card links");
  await page.context().close();
  return { cards };
});

// 6. Robots meta.
await check("robots-meta", async () => {
  const page = await newPage();
  const compact = value => String(value || "").replace(/\s+/g, "").toLowerCase();
  // The listing scripts set robots after rendering; poll briefly for the expected value, then report what is there.
  const robots = async (pathname, expected) => {
    await open(page, pathname);
    const read = () => page.evaluate(() => [...document.querySelectorAll('meta[name="robots"]')].map(meta => meta.content).join(" | "));
    await page.waitForFunction(want => [...document.querySelectorAll('meta[name="robots"]')].some(meta => meta.content.replace(/\s+/g, "").toLowerCase().startsWith(want)), expected, { timeout: 8000 }).catch(() => {});
    return read();
  };
  const results = {};
  for (const pathname of ["/catalog", facts.brand.url]) {
    results[pathname] = await robots(pathname, "index,follow");
    assert.equal(compact(results[pathname]), "index,follow", `${pathname}: meta robots «${results[pathname]}»`);
  }
  const filtered = `${facts.brand.categoryUrl}?brand=${encodeURIComponent(facts.brand.id)}`;
  for (const pathname of [filtered, "/brands/does-not-exist"]) {
    results[pathname] = await robots(pathname, "noindex");
    assert.ok(compact(results[pathname]).startsWith("noindex") && !compact(results[pathname]).includes("|index"), `${pathname}: meta robots «${results[pathname]}», expected noindex`);
  }
  await page.context().close();
  return results;
});

// 7. Catalogue outage: the storefront is switched to the Supabase source (as on Preview/Production) and the bootstrap
// RPC is aborted. In the local build the catalogue never calls the RPC, so the runtime config is overridden here.
for (const [label, viewport] of [["desktop", VIEWPORTS.desktop], ["mobile", VIEWPORTS.mobile]]) {
  await check(`catalog-outage-${label}`, async () => {
    const page = await newPage(viewport);
    await page.route(/\/catalog-runtime-config\.js(\?|$)/, route => route.fulfill({ contentType: "text/javascript",
      body: `window.SOFIEVKA_CATALOG_CONFIG=Object.freeze(${JSON.stringify({ source: "supabase", environment: "preview",
        supabase: { url: `http://localhost:${apiPort}`, publishableKey: "sb_publishable_local_qa", projectRef: "wfxcklglujgramasdzyr" } })});` }));
    let aborted = 0;
    await page.route(/\/rest\/v1\/rpc\/get_catalog_bootstrap$/, route => { aborted += 1; return route.abort("failed"); });
    await open(page, "/contact");
    const h1 = normalize(await page.locator("main h1").first().innerText().catch(() => ""));
    assert.ok(h1, "/contact (catalogue down): no H1");
    assert.ok(await page.locator('main a[href^="tel:"], a[href^="tel:"]').count(), "/contact (catalogue down): no tel: link");
    await open(page, pricedProduct.categoryUrl);
    await page.waitForFunction(() => document.body.innerText.includes("Каталог тимчасово недоступний"), null, { timeout: 10000 })
      .catch(async () => { throw new Error(`${pricedProduct.categoryUrl} (catalogue down): no «Каталог тимчасово недоступний»; main text: ${normalize(await page.locator("main").innerText().catch(() => "")).slice(0, 200)}`); });
    const text = await page.evaluate(() => document.body.innerText);
    assert.ok(!/development/i.test(text), `${pricedProduct.categoryUrl} (catalogue down): page text mentions «development»`);
    assert.ok(aborted > 0, "get_catalog_bootstrap was never requested (the override did not switch the source)");
    await page.context().close();
    return { contactH1: h1, aborted };
  });
}

// 8. Related products: the PDP quantity applies to the main product only.
for (const [label, viewport] of [["desktop", VIEWPORTS.desktop], ["mobile", VIEWPORTS.mobile]]) {
  await check(`related-add-qty-${label}`, async () => {
    const page = await newPage(viewport);
    await seedStorage(page, { "sofievka-cart": {} });
    let chosen = null;
    for (const product of facts.pricedProducts) {
      await open(page, productPath(product));
      if (await page.locator(".pdp-related-section [data-add]").count() && await page.locator("[data-product-qty]").count()) { chosen = product; break; }
    }
    assert.ok(chosen, `none of ${facts.pricedProducts.length} priced products has a related section with a «До кошика» button`);
    const qty = page.locator("[data-product-qty]").first();
    await qty.evaluate(node => { node.value = "3"; node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(await qty.inputValue(), "3");
    const add = page.locator(".pdp-related-section [data-add]").first();
    const relatedId = await add.getAttribute("data-add");
    assert.notEqual(relatedId, chosen.id, "related «До кошика» button adds the page product itself");
    await add.scrollIntoViewIfNeeded();
    await add.click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sofievka-cart") || "{}"));
    assert.equal(stored[relatedId], 1, `related product ${relatedId} added with quantity ${stored[relatedId]} (PDP quantity was 3); cart ${JSON.stringify(stored)}`);
    assert.ok(!stored[chosen.id], `page product ${chosen.id} was added too: ${JSON.stringify(stored)}`);
    await page.context().close();
    return { product: chosen.id, related: relatedId };
  });
}

// 9. Wave 2 page-shell (final audit 2026-10-04): footer contacts, JSON-LD locality, /about, synthetic SKUs,
// PDP #documents, lightbox arrows, checkout carrier city, search «Показати ще» past the 48 loaded products.
const shellFacts = await (async () => {
  const page = await newPage();
  await open(page, "/catalog");
  const data = await page.evaluate(() => {
    const products = window.sofievkaCatalog?.catalogProducts || [];
    const images = product => (window.sofievkaPdp?.images?.(product) || []).length;
    const docs = product => (window.sofievkaPdp?.documents?.(product) || []).length;
    const synthetic = products.find(product => product.slug && /^(baxi|altep|buderus|focus)-/i.test(String(product.sku || "")));
    const withDocs = products.find(product => product.slug && docs(product) > 0 && (product.description || product.fullDescription));
    const gallery = products.find(product => product.slug && images(product) > 2);
    const snapshot = window.sofievkaCatalogSnapshot?.products || [];
    return {
      synthetic: synthetic && { id: synthetic.id, slug: synthetic.slug, sku: synthetic.sku, title: synthetic.title },
      withDocs: withDocs && { id: withDocs.id, slug: withDocs.slug },
      gallery: gallery && { id: gallery.id, slug: gallery.slug, count: images(gallery) },
      searchProducts: JSON.parse(JSON.stringify(snapshot.slice(0, 30)))
    };
  });
  await page.context().close();
  return data;
})();
const contactStores = [
  { phone: "+38 (050) 358-22-84", address: "с. Софіївська Борщагівка, вул. Київська, 3" },
  { phone: "+38 (067) 726-00-00", address: "м. Житомир, проспект Незалежності, 79" }
];

for (const [label, viewport] of [["mobile", VIEWPORTS.mobile], ["desktop", VIEWPORTS.desktop]]) {
  await check(`footer-contacts-${label}`, async () => {
    const page = await newPage(viewport);
    const pages = ["/", "/brands", "/about", "/delivery", pricedProduct.categoryUrl, productPath(pricedProduct), "/cart"];
    for (const pathname of pages) {
      await open(page, pathname);
      const footer = page.locator("footer.footer");
      const text = normalize(await footer.innerText());
      for (const store of contactStores) {
        assert.ok(text.includes(store.address), `${pathname} @${viewport.width}: footer lacks «${store.address}»`);
        const tel = footer.locator(`a[href="tel:+${store.phone.replace(/\D/g, "")}"]`);
        assert.ok(await visibleBox(tel), `${pathname} @${viewport.width}: footer phone ${store.phone} is not a visible tel: link`);
      }
      // One footer template everywhere: accordion columns (AUD-044).
      assert.ok(await footer.locator("[data-footer-section] .footer__toggle").count() >= 5, `${pathname}: footer is not the accordion template`);
      if (viewport.width <= 640) {
        const services = footer.locator("[data-footer-section]", { hasText: "Послуги" }).first();
        assert.equal(await visibleBox(services.locator(".footer__links a").first()), null, `${pathname} @390: «Послуги» column is not folded`);
        await services.locator(".footer__toggle").click();
        assert.ok(await visibleBox(services.locator(".footer__links a").first()), `${pathname} @390: «Послуги» does not open`);
      }
    }
    await page.context().close();
    return { pages: pages.length };
  });
}

await check("contact-jsonld-locality", async () => {
  const page = await newPage();
  await open(page, "/contact");
  await page.waitForFunction(() => document.getElementById("schema-organization"), null, { timeout: 5000 });
  const schema = await page.evaluate(() => JSON.parse(document.getElementById("schema-organization").textContent));
  const localities = schema.department.map(store => store.address.addressLocality);
  assert.deepEqual(localities, ["Софіївська Борщагівка", "Житомир"], `JSON-LD localities ${localities}`);
  const text = normalize(await page.locator("main").innerText());
  assert.ok(text.includes(contactStores[0].address), "/contact: address spelling changed");
  await page.context().close();
  return { localities };
});

await check("about-no-template-block", async () => {
  const page = await newPage();
  await open(page, "/about");
  const text = normalize(await page.locator("main").innerText());
  assert.ok(!/Спочатку задача|Гарантія на всі товари/.test(text), "/about still has the 01–03 block or the blanket warranty claim");
  assert.equal(await page.locator(".about-principles").count(), 0);
  await page.context().close();
});

await check("synthetic-sku-hidden", async () => {
  assert.ok(shellFacts.synthetic, "local catalogue has no product with a slug-like SKU");
  const product = shellFacts.synthetic;
  const page = await newPage();
  await open(page, `/product/${encodeURIComponent(product.slug)}`);
  const heading = normalize(await page.locator(".pdp-heading").innerText());
  assert.ok(!heading.includes(product.sku), `PDP shows the synthetic SKU ${product.sku}`);
  assert.equal(await page.locator("[data-copy-sku]").count(), 0, "PDP offers to copy a synthetic SKU");
  const schema = await page.evaluate(() => window.sofievkaProductSchema);
  assert.equal(schema?.sku, undefined, "Product JSON-LD carries the synthetic SKU");
  await seedStorage(page, { "sofievka-cart": { [product.id]: 1 } });
  await open(page, "/cart");
  const cartText = normalize(await page.locator(".cart-items").innerText());
  assert.ok(cartText.includes(product.title) && !cartText.includes(product.sku), `/cart shows the synthetic SKU ${product.sku}`);
  await page.context().close();
  return { sku: product.sku };
});

await check("pdp-documents-hash-mobile", async () => {
  assert.ok(shellFacts.withDocs, "local catalogue has no product with documents");
  const page = await newPage(VIEWPORTS.mobile);
  await open(page, `/product/${encodeURIComponent(shellFacts.withDocs.slug)}#documents`);
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const target = document.getElementById("documents");
    const box = target?.getBoundingClientRect();
    return { scrollY: window.scrollY, top: box?.top, bottom: box?.bottom, height: innerHeight, active: document.querySelector("[data-pdp-tab].is-active")?.dataset.pdpTab };
  });
  assert.ok(state.scrollY > 0, `#documents: page did not scroll (${JSON.stringify(state)})`);
  assert.ok(state.top < state.height && state.bottom > 0, `#documents: section is not in the viewport (${JSON.stringify(state)})`);
  await page.context().close();
  return state;
});

await check("pdp-lightbox-arrows", async () => {
  assert.ok(shellFacts.gallery, "local catalogue has no product with 3+ photos");
  const page = await newPage();
  await open(page, `/product/${encodeURIComponent(shellFacts.gallery.slug)}`);
  await page.locator("[data-gallery-zoom]").click();
  const dialog = page.locator("[data-gallery-dialog]");
  await dialog.waitFor({ state: "visible" });
  const image = () => page.locator("[data-gallery-dialog-image]").getAttribute("src");
  const first = await image();
  await dialog.locator("[data-gallery-next]").click();
  await page.waitForTimeout(100);
  const second = await image();
  assert.notEqual(second, first, "lightbox «next» did not change the photo");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  assert.notEqual(await image(), second, "ArrowRight in the lightbox did not change the photo");
  await dialog.locator("[data-gallery-prev]").click();
  await page.waitForTimeout(100);
  assert.equal(await image(), second, "lightbox «previous» did not go back");
  assert.match(normalize(await page.locator("[data-gallery-counter]").innerText()), /^2 \//);
  await page.context().close();
  return { photos: shellFacts.gallery.count };
});

await check("checkout-carrier-city", async () => {
  const page = await newPage(VIEWPORTS.mobile);
  let payload = null;
  await page.route(/\/rest\/v1\/rpc\/crm_submit_order$/, async route => {
    payload = JSON.parse(route.request().postData() || "{}").payload || null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "00000000-0000-4000-8000-00000000qa02", number: "QA-2" }) });
  });
  await seedStorage(page, { "sofievka-cart": { [pricedProduct.id]: 1 } });
  await open(page, "/checkout");
  const form = page.locator("[data-checkout]");
  await form.locator('input[name="delivery"][value="carrier"]').check();
  assert.equal(await visibleBox(form.locator('select[name="pickupStore"]')), null, "carrier chosen, but the pickup store list is visible");
  await form.locator('input[name="name"]').fill("QA Тест");
  await form.locator('input[name="phone"]').fill("12345");
  await form.locator("[data-checkout-submit]").click();
  assert.equal(payload, null, "checkout sent a 5-digit phone");
  await form.locator('input[name="phone"]').fill("067 123 45 67");
  await form.locator("[data-checkout-submit]").click();
  assert.equal(payload, null, "checkout sent a carrier order without a city");
  assert.equal(await form.locator('input[name="city"]').evaluate(input => input.validity.valid), false, "city is not flagged");
  await form.locator('input[name="city"]').fill("Житомир");
  await form.locator("[data-checkout-submit]").click();
  await page.locator(".checkout-success").waitFor({ timeout: 10000 }).catch(() => { throw new Error("checkout: no success after filling the city"); });
  assert.equal(payload.city, "Житомир");
  assert.equal("pickupStore" in payload, false, "carrier order still carries pickupStore");
  await page.context().close();
  return { delivery: payload.delivery };
});

await check("home-callback-form", async () => {
  const page = await newPage();
  await open(page, "/", { waitForShell: false });
  const form = page.locator("[data-home-contact-form]");
  assert.equal(await form.getAttribute("action"), null, "homepage form still has a mailto: action");
  assert.ok(await form.locator('a[href="/privacy"]').count(), "homepage form has no privacy link");
  await form.locator('input[name="name"]').fill("QA");
  await form.locator('input[name="phone"]').fill("12345");
  assert.equal(await form.locator('input[name="phone"]').evaluate(input => input.checkValidity()), false, "«12345» passes the phone check");
  await form.locator('input[name="phone"]').fill("067 123 45 67");
  assert.equal(await form.locator('input[name="phone"]').evaluate(input => input.checkValidity()), true, "a real phone fails the check");
  await page.context().close();
});

await check("home-cart-count-stale", async () => {
  const page = await newPage();
  await useScopedCatalog(page);
  await seedStorage(page, { "sofievka-cart": { [pricedProduct.id]: 1, "removed-product-qa": 3 } });
  await open(page, "/", { waitForShell: false });
  await page.waitForFunction(() => document.querySelector("[data-cart-count]")?.textContent === "1", null, { timeout: 10000 })
    .catch(async () => { throw new Error(`homepage cart count is ${await page.locator("[data-cart-count]").first().textContent()}, /cart shows 1`); });
  await page.context().close();
});

await check("search-show-more-limit", async () => {
  const products = shellFacts.searchProducts;
  assert.ok(products.length >= 25, "not enough products for the search check");
  const page = await newPage();
  await useScopedCatalog(page);
  await page.route(/\/rest\/v1\/rpc\/search_catalog$/, route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify({ version: "storefront-flows-qa", query: "qa", totalProducts: 500, products, productHits: [], categories: [], brands: [], series: [] }) }));
  await open(page, "/search?q=qa");
  await page.locator("[data-search-more]").click();
  await page.waitForFunction(count => document.querySelectorAll("[data-search-page-results] .catalog-products > *").length === count, products.length, { timeout: 5000 });
  assert.equal(await page.locator("[data-search-more]").count(), 0, "«Показати ще» stays after every loaded product is shown");
  assert.match(normalize(await page.locator("[data-search-more-hint]").innerText()), new RegExp(`Показано ${products.length} з 500`));
  await page.context().close();
  return { loaded: products.length };
});

await browser.close();
stopServers();
if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures, checks, pageErrors: pageErrors.slice(0, 20) }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", checks: checks.map(item => item.name), timings: Object.fromEntries(checks.map(item => [item.name, item.ms])),
  facts: { products: facts.total, priced: facts.priced, unpriced: facts.unpriced }, assetFallbacks: [...assetFallbacks] }));
