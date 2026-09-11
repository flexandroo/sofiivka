"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { window: {}, console, URLSearchParams, Intl };
context.window.window = context.window;
vm.createContext(context);
for (const file of ["brands-data.js", "products-data.js", "water-catalog-data.js", "termojet-products-data.js", "catalog-data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const catalog = context.window.sofievkaCatalog;
const taxonomy = context.window.sofievkaTaxonomy;
const productFiles = fs.readdirSync(path.join(root, "products"), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, "products", entry.name, "index.html")));
const categoryRoutes = taxonomy.nodes.filter(category => category.status === "active" && (category.level === 1 || catalog.productsForCategory(category.id).length > 0));
const brandsWithProducts = catalog.brands.filter(brand => catalog.products.some(product => product.brandId === brand.id));

assert.equal(productFiles.length, catalog.products.length, "each product must have a prerendered page");
assert.equal(categoryRoutes.length, 21, "active category route count changed");
assert.equal(brandsWithProducts.length, 2, "brand facet route count changed");

const samples = [
  "index.html",
  "about.html",
  "catalog.html",
  path.join("catalog", "heating", "index.html"),
  path.join("catalog", "water-supply", "water-treatment", "reverse-osmosis", "index.html"),
  path.join("brands", "ecosoft", "index.html"),
  path.join("products", catalog.products[0].slug, "index.html"),
  path.join("products", catalog.products[Math.floor(catalog.products.length / 2)].slug, "index.html"),
  path.join("products", catalog.products.at(-1).slug, "index.html")
];

for (const sample of samples) {
  const html = fs.readFileSync(path.join(root, sample), "utf8");
  assert.match(html, /<h1(?:\s|>)/i, `${sample}: H1 missing from raw HTML`);
  assert.match(html, /<link rel="canonical" href="https:\/\/sofievka\.vercel\.app\//i, `${sample}: canonical missing`);
  assert.doesNotMatch(html, /data-page-root><\/div>/i, `${sample}: page root is empty`);
  assert.doesNotMatch(html, /\+38 \(050\) 123 45 67|info@sofievka\.ua|partner@sofievka\.ua|Соборна, 45/i, `${sample}: placeholder contact leaked`);
}

const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(home, /Комплексне інженерне оснащення будинків, бізнесу та промислових об’єктів/, "homepage positioning missing");
assert.ok((home.match(/data-product-card=/g) || []).length >= 4, "homepage products are not prerendered");
assert.ok((home.match(/class="category-card /g) || []).length >= 2, "homepage categories are not prerendered");

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const sitemapCount = (sitemap.match(/<url>/g) || []).length;
assert.equal(sitemapCount, 562, "sitemap URL count changed");
assert.match(sitemap, new RegExp(`<loc>https://sofievka\\.vercel\\.app${catalog.productUrl(catalog.products[0]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`), "product missing from sitemap");

const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.equal(new Set(sitemapLocations).size, sitemapLocations.length, "sitemap contains duplicate URLs");
const canonicalLocations = new Set();
const titles = new Map();
const routeToFile = location => {
  const pathname = new URL(location).pathname.replace(/\/$/, "");
  if (!pathname) return path.join(root, "index.html");
  const nested = path.join(root, pathname.replace(/^\//, ""), "index.html");
  return fs.existsSync(nested) ? nested : path.join(root, `${pathname.replace(/^\//, "")}.html`);
};
for (const location of sitemapLocations) {
  const file = routeToFile(location);
  assert.ok(fs.existsSync(file), `${location}: sitemap route has no prerendered file`);
  const html = fs.readFileSync(file, "utf8");
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  assert.equal(canonical, location, `${location}: canonical does not match sitemap URL`);
  assert.ok(!canonicalLocations.has(canonical), `${location}: duplicate canonical`);
  canonicalLocations.add(canonical);
  assert.ok(title, `${location}: title is empty`);
  if (!titles.has(title)) titles.set(title, []);
  titles.get(title).push(location);
  assert.match(html, /<h1(?:\s|>)/i, `${location}: H1 missing from raw HTML`);
  assert.doesNotMatch(html, /<meta name="robots" content="noindex/i, `${location}: sitemap URL is noindex`);
  for (const script of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    assert.doesNotThrow(() => JSON.parse(script[1]), `${location}: invalid JSON-LD`);
  }
  if (location.includes("/products/")) {
    assert.match(html, /"@type"\s*:\s*"Product"/, `${location}: Product schema missing`);
    assert.match(html, /<meta property="og:type" content="product">/i, `${location}: product OG type missing`);
  }
}
const duplicateTitles = [...titles].filter(([, locations]) => locations.length > 1);
assert.deepEqual(duplicateTitles, [], "indexable titles must be unique");

const activeSource = ["index.html", "brands.html", "page-shell.js", "catalog-ui.js", "catalog-data.js", "site-config.js"]
  .map(file => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
assert.doesNotMatch(activeSource, /\+38 \(050\) 123 45 67|info@sofievka\.ua|partner@sofievka\.ua|Соборна, 45/i, "placeholder contacts remain in active source");
assert.doesNotMatch(activeSource, /\/product\?id=/, "legacy product URLs remain in active source");

console.log(JSON.stringify({
  status: "ok",
  prerenderedProducts: productFiles.length,
  prerenderedCategories: categoryRoutes.length,
  prerenderedBrands: brandsWithProducts.length,
  sitemapUrls: sitemapCount,
  sampledPages: samples.length,
  fullyAuditedIndexablePages: sitemapLocations.length,
  uniqueCanonicals: canonicalLocations.size
}, null, 2));
