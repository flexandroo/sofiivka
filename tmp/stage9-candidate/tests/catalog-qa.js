"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = { window: {}, console, URLSearchParams, Intl };
context.window.window = context.window;
vm.createContext(context);

for (const file of [
  "brands-data.js",
  "products-data.js",
  "water-catalog-data.js",
  "termojet-products-data.js",
  "catalog-data.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), "utf8"), context, { filename: file });
}

const state = context.window;
const catalog = state.sofievkaCatalog;
const routing = state.sofievkaCatalogRouting;
const search = state.sofievkaCatalogSearch;
const products = catalog.products;
let routingAssertions = 0;

const routeCheck = (condition, message) => {
  assert.ok(condition, message);
  routingAssertions += 1;
};

for (const category of state.sofievkaTaxonomy.nodes) {
  const canonicalPath = catalog.getCategoryPath(category.id);
  const resolved = routing.resolveCatalogPath(canonicalPath);
  routeCheck(canonicalPath.startsWith("/catalog/"), `${category.id}: canonical path must use /catalog`);
  routeCheck(!resolved.notFound && resolved.categoryId === category.id, `${category.id}: canonical path must resolve to the same category`);
  routeCheck(resolved.canonicalPath === canonicalPath, `${category.id}: resolved canonical path must be stable`);
}

const canonicalCases = [
  ["/catalog", "", "catalog", "all"],
  ["/catalog/heating", "", "catalog", "heating"],
  ["/catalog/heating/circulation-pumps", "", "catalog", "circulation-pumps"],
  ["/catalog/water-supply", "", "catalog", "water-supply"],
  ["/catalog/water-supply/water-treatment", "", "catalog", "water-treatment"],
  ["/catalog/water-supply/water-treatment/reverse-osmosis", "", "catalog", "reverse-osmosis"],
  ["/catalog/plumbing", "", "catalog", "plumbing"],
  ["/catalog/climate", "", "catalog", "climate"]
];
for (const [pathname, query, pageName, expected] of canonicalCases) {
  const resolved = routing.resolveLocation(pathname, query, pageName);
  routeCheck(!resolved.notFound && (expected === "all" ? resolved.catalogState === "all" : resolved.categoryId === expected), `${pathname}: canonical route failed`);
}

routeCheck(routing.resolveLocation("/catalog/not-a-category", "", "catalog").notFound, "invalid category must be controlled");
routeCheck(routing.resolveLocation("/catalog", "?category=heating", "catalog").redirectTo === "/catalog/heating", "legacy heating query must canonicalize");
routeCheck(routing.resolveLocation("/catalog", "?category=water", "catalog").redirectTo === "/catalog/water-supply", "legacy water query must canonicalize");
routeCheck(routing.resolveLocation("/catalog/water-treatment", "", "catalog").redirectTo === "/catalog/water-supply/water-treatment", "legacy water root must canonicalize");
routeCheck(routing.resolveLocation("/catalog/water-treatment/reverse-osmosis", "", "catalog").redirectTo === "/catalog/water-supply/water-treatment/reverse-osmosis", "legacy water category must canonicalize");

assert.equal(routingAssertions, 76, "taxonomy/route regression suite must retain 76 checks");

assert.equal(products.length, 519, "catalog must contain 519 products");
assert.equal(state.sofievkaNormalizationReport.waterSourceCount, 176, "water product count changed");
assert.equal(state.sofievkaNormalizationReport.heatingSourceCount, 343, "Termojet product count changed");
assert.equal(state.sofievkaNormalizationReport.normalizationErrors.length, 0, "catalog validation errors found");
assert.equal(new Set(products.map(product => product.id)).size, products.length, "product IDs must be unique");

const productIdHash = crypto.createHash("sha256").update(products.map(product => product.id).sort().join("\n")).digest("hex");
assert.equal(productIdHash, "48f7e7e60940ac12c2be5923cb2fe6c93cb382337b3593dfb4c9780baf7757d3", "product IDs changed");

assert.ok(catalog.brands.every(brand => catalog.brandUrl(brand.id) === `/brands/${brand.slug}`), "brand URLs must be canonical");
assert.ok(products.every(product => catalog.productUrl(product) === `/products/${encodeURIComponent(product.slug)}`), "product URLs must use canonical static paths");
assert.ok(products.every(product => !catalog.productUrl(product).includes("?")), "product canonical URLs must not use query state");
assert.equal(catalog.formatPrice(6418), new Intl.NumberFormat("uk-UA").format(6418) + " грн", "price formatter mismatch");
assert.equal(catalog.availabilityState("in_stock").label, "В наявності", "availability label mismatch");
assert.equal(catalog.availabilityState("out_of_stock").label, "Немає в наявності", "out-of-stock label mismatch");
assert.equal(catalog.availabilityState("unexpected").label, "Наявність уточнюйте", "unknown availability label mismatch");

const exactSku = "MO550MECOSTD";
assert.equal(search.search(exactSku).products[0]?.id, exactSku, "exact SKU search must rank the product first");
assert.equal(catalog.featuredProducts(4).length, 4, "homepage must have four deterministic featured products");
assert.deepEqual([...new Set(catalog.featuredProducts(4).map(product => product.sectionId))].sort(), ["heating", "water-supply"], "homepage featured products must represent the available business directions");
for (const query of ["Termojet", "Ecosoft", "зворотний осмос", "Termojet насос"]) {
  assert.ok(search.search(query).totalProducts > 0, `search returned no products for: ${query}`);
}
const termojetModel = products.find(product => product.brand === "Termojet")?.model;
assert.ok(termojetModel && search.search(termojetModel).totalProducts > 0, "exact model search failed");

const reviewMappings = products.filter(product => product.source?.mappingStatus === "review").length;
const unmappedAttributeProducts = products.filter(product => product.unmappedAttributes?.length).length;
const brandsWithProducts = new Set(products.map(product => product.brandId));
const brandsWithoutProducts = catalog.brands.filter(brand => !brandsWithProducts.has(brand.id)).length;
assert.equal(reviewMappings, 29, "review mapping debt changed unexpectedly");
assert.equal(unmappedAttributeProducts, 312, "unmapped attribute debt changed unexpectedly");

const shellSource = fs.readFileSync(path.join(projectRoot, "page-shell.js"), "utf8");
const uiSource = fs.readFileSync(path.join(projectRoot, "catalog-ui.js"), "utf8");
assert.ok(!/function header\s*\(/.test(shellSource), "dead legacy header renderer remains");
assert.ok(!/renderProductExtended|renderCategoryExtended/.test(shellSource), "dead PDP/category renderer remains");
assert.ok(!/catalog\.html\?category=/.test(shellSource + uiSource), "active legacy category link remains");
assert.equal((uiSource.match(/function renderProductCard\s*\(/g) || []).length, 1, "duplicate Product Card renderer found");
assert.ok(shellSource.includes('localStorage.getItem("sofievka-cart")'), "cart storage key changed");
assert.ok(shellSource.includes('localStorage.getItem("sofievka-favorites")'), "favorites storage key changed");
assert.ok(shellSource.includes('localStorage.getItem("sofievka-compare")'), "compare storage key changed");

console.log(JSON.stringify({
  status: "ok",
  routingAssertions,
  products: products.length,
  validationErrors: state.sofievkaNormalizationReport.normalizationErrors.length,
  reviewMappings,
  unmappedAttributeProducts,
  brandsWithoutProducts,
  productIdHash,
  searchCases: 6
}, null, 2));
