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
  "wilo-products-data.js",
  "grundfos-products-data.js",
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

assert.equal(routingAssertions, 115, "taxonomy/route regression suite must retain 115 checks");

assert.equal(products.length, 1852, "catalog must contain 1852 products");
assert.equal(state.sofievkaNormalizationReport.waterSourceCount, 176, "water product count changed");
assert.equal(state.sofievkaNormalizationReport.heatingSourceCount, 343, "Termojet product count changed");
assert.equal(state.sofievkaNormalizationReport.wiloSourceCount, 1020, "Wilo product count changed");
assert.equal(state.sofievkaNormalizationReport.grundfosSourceCount, 313, "Grundfos domestic range count changed");
assert.equal(state.sofievkaNormalizationReport.normalizationErrors.length, 0, "catalog validation errors found");
assert.equal(new Set(products.map(product => product.id)).size, products.length, "product IDs must be unique");

const productIdHash = crypto.createHash("sha256").update(products.map(product => product.id).sort().join("\n")).digest("hex");
assert.equal(productIdHash, "adb7c65186c4d1f1884fe9c7eae7f6d90b80d860062ccc731f256a30d80f93e3", "product IDs changed");

assert.ok(catalog.brands.every(brand => catalog.brandUrl(brand.id) === `/brands/${brand.slug}`), "brand URLs must be canonical");

const exactSku = "MO550MECOSTD";
assert.equal(search.search(exactSku).products[0]?.id, exactSku, "exact SKU search must rank the product first");
for (const query of ["Termojet", "Ecosoft", "зворотний осмос", "Termojet насос"]) {
  assert.ok(search.search(query).totalProducts > 0, `search returned no products for: ${query}`);
}
assert.equal(search.search("4248082").products[0]?.id, "4248082", "exact Wilo article search must rank the product first");
assert.ok(search.search("Wilo Stratos MAXO").totalProducts >= 4, "Wilo series search failed");
const termojetModel = products.find(product => product.brand === "Termojet")?.model;
assert.ok(termojetModel && search.search(termojetModel).totalProducts > 0, "exact model search failed");

const auditedPump = products.find(product => product.id === "termojet-wp_20506");
assert.ok(auditedPump, "audited Termojet pump is missing");
assert.ok(!/системах системах|виборо$|мінеральнихолій|характеристиками,близькими|ізмагнітним/iu.test(JSON.stringify(auditedPump)), "audited pump still contains damaged copy");

const auditedFilter = products.find(product => product.id === "MO650MECOSTD");
assert.ok(auditedFilter, "audited Ecosoft filter is missing");
assert.ok(!auditedFilter.sourceAttributes.some(attribute => /\*+$/.test(attribute.label) || /\*+$/.test(attribute.value)), "supplier footnote markers leak into product specifications");

const auditedDimensions = products.find(product => product.id === "termojet-wp_20369");
assert.equal(auditedDimensions.normalizedAttributes.dimensions, "390*250*455мм", "product dimensions must remain in the dimensions field");
assert.notEqual(auditedDimensions.normalizedAttributes.connection, "390*250*455мм", "product dimensions must not be exposed as a connection facet");

const auditedSaleProduct = products.find(product => product.id === "termojet-new_41020110");
assert.ok(auditedSaleProduct && auditedSaleProduct.type !== "Акція", "sale collection must not replace the equipment type");

const wiloProducts = products.filter(product => product.brandId === "wilo");
assert.equal(wiloProducts.length, 1020, "Wilo domestic catalog must retain 1020 SKU");
assert.equal(new Set(wiloProducts.map(product => product.seriesId)).size, 56, "Wilo domestic catalog must retain 56 active series");
assert.ok(wiloProducts.every(product => product.manufacturerUrl?.startsWith("https://wilo.com/ua/uk/")), "every Wilo SKU must retain its official manufacturer URL");
assert.ok(wiloProducts.every(product => product.images.length >= 1 && product.images.every(image => image.startsWith("/assets/products/wilo/"))), "Wilo product images must be local");
assert.equal(wiloProducts.filter(product => product.imageSources?.[0]?.type === "product").length, 1014, "Wilo SKU-specific primary image coverage changed");
assert.ok(wiloProducts.every(product => product.imageSources?.length === product.images.length), "Wilo gallery sources must map one-to-one to local images");
assert.ok(wiloProducts.every(product => product.imageSources.every(image => /^https:\/\/cms\.media\.wilo\.com\/dcipicpfinder\/.+_5\.(?:png|jpe?g|webp)$/i.test(image.source))), "Wilo galleries must use the highest official image variant");
assert.ok(wiloProducts.filter(product => product.images.length > 1).length >= 898, "Wilo multi-image gallery coverage changed");
assert.ok(wiloProducts.every(product => product.documents.length >= 1 && product.documents.every(document => /^https:\/\/cms\.media\.wilo\.com\//.test(document.url))), "Wilo documents must use official media URLs");
assert.ok(wiloProducts.every(product => Array.isArray(product.sourceUrls) && product.sourceUrls.length >= 4 && product.dateVerified === "2026-09-21"), "Wilo source provenance is incomplete");
assert.ok(wiloProducts.every(product => product.manufacturerCode && product.seo?.title && product.seo?.description && product.technicalDetails.length >= 20), "Wilo commerce metadata is incomplete");
assert.equal(wiloProducts.filter(product => product.ean).length, 1019, "confirmed Wilo EAN coverage changed");
assert.ok(wiloProducts.every(product => product.shortDescription.length <= 220 && !/…$/.test(product.shortDescription)), "Wilo short descriptions must be complete sentences without UI truncation");
assert.ok(wiloProducts.every(product => product.fullDescription.length >= 900 && product.descriptionSections.length >= 6), "Wilo full descriptions must retain official technical depth");
assert.ok(wiloProducts.every(product => product.descriptionSourceUrl && product.sourceUrls.includes(product.descriptionSourceUrl)), "Wilo description provenance is incomplete");
assert.ok(wiloProducts.every(product => !product.fullDescription.includes("Конкретне виконання слід підбирати")), "legacy generic Wilo descriptions remain");

const grundfosProducts = products.filter(product => product.brandId === "grundfos");
assert.equal(grundfosProducts.length, 313, "Grundfos domestic catalog must retain all 313 official positions");
assert.equal(new Set(grundfosProducts.map(product => product.seriesId)).size, 42, "Grundfos domestic catalog must retain 42 series and product groups");
assert.ok(grundfosProducts.every(product => product.manufacturerUrl?.startsWith("https://product-selection.grundfos.com/ua/products/")), "every Grundfos SKU must retain its official manufacturer URL");
assert.ok(grundfosProducts.every(product => product.images.length >= 1 && product.images.every(image => image.startsWith("/assets/products/grundfos/"))), "Grundfos images must be local");
assert.ok(grundfosProducts.every(product => product.imageSources?.[0]?.source?.startsWith("https://api.grundfos.com/gpi/imaging/product")), "Grundfos product image provenance is incomplete");
assert.ok(grundfosProducts.every(product => product.dimensionDiagram?.startsWith("/assets/products/grundfos/")), "Grundfos dimension diagrams must be local");
assert.equal(grundfosProducts.filter(product => product.documents.length >= 1).length, 295, "confirmed Grundfos document coverage changed");
assert.ok(grundfosProducts.every(product => product.documents.every(document => /^https:\/\/api\.grundfos\.com\/literature\//.test(document.url))), "Grundfos documents must use official literature URLs");
assert.ok(grundfosProducts.every(product => Array.isArray(product.sourceUrls) && product.sourceUrls.length >= 6 && product.dateVerified === "2026-09-21"), "Grundfos source provenance is incomplete");
assert.equal(grundfosProducts.filter(product => product.ean).length, 312, "confirmed Grundfos EAN coverage changed");
assert.ok(grundfosProducts.every(product => product.manufacturerCode && product.seo?.title && product.technicalDetails.length >= 4), "Grundfos commerce metadata is incomplete");
assert.ok(grundfosProducts.every(product => product.shortDescription.length <= 220 && !/…$/.test(product.shortDescription)), "Grundfos short descriptions must be complete sentences without UI truncation");
assert.ok(grundfosProducts.every(product => product.fullDescription.length >= 600 && product.descriptionSections.length >= 5), "Grundfos descriptions must retain technical depth");
assert.ok(search.search("93013252").products[0]?.id === "grundfos-93013252", "exact Grundfos article search must rank the product first");
assert.ok(search.search("Grundfos ALPHA3").totalProducts >= 11, "Grundfos series search failed");
assert.equal(search.search("мембранний бак Grundfos").totalProducts, 87, "Grundfos pressure tank search failed");
assert.ok(search.search("Grundfos PM 1").totalProducts >= 3, "Grundfos pressure manager search failed");

const reviewMappings = products.filter(product => product.source?.mappingStatus === "review").length;
const unmappedAttributeProducts = products.filter(product => product.unmappedAttributes?.length).length;
const brandsWithProducts = new Set(products.map(product => product.brandId));
const brandsWithoutProducts = catalog.brands.filter(brand => !brandsWithProducts.has(brand.id)).length;
assert.equal(reviewMappings, 29, "review mapping debt changed unexpectedly");
assert.equal(unmappedAttributeProducts, 1743, "unmapped attribute debt changed unexpectedly");

const shellSource = fs.readFileSync(path.join(projectRoot, "page-shell.js"), "utf8");
const uiSource = fs.readFileSync(path.join(projectRoot, "catalog-ui.js"), "utf8");
const pagesCss = fs.readFileSync(path.join(projectRoot, "pages.css"), "utf8");
assert.ok(shellSource.includes('return `/product?id=${encodeURIComponent(product.id)}`;'), "product links must remain shareable and deterministic");
assert.ok(!/function header\s*\(/.test(shellSource), "dead legacy header renderer remains");
assert.ok(!/renderProductExtended|renderCategoryExtended/.test(shellSource), "dead PDP/category renderer remains");
assert.ok(!/catalog\.html\?category=/.test(shellSource + uiSource), "active legacy category link remains");
assert.equal((uiSource.match(/function renderProductCard\s*\(/g) || []).length, 1, "duplicate Product Card renderer found");
assert.ok(shellSource.includes('localStorage.getItem("sofievka-cart")'), "cart storage key changed");
assert.ok(shellSource.includes('localStorage.getItem("sofievka-favorites")'), "favorites storage key changed");
assert.ok(shellSource.includes('localStorage.getItem("sofievka-compare")'), "compare storage key changed");
assert.match(pagesCss, /\.pdp__media\s*>\s*img\s*\{[^}]*object-fit:\s*contain/si, "PDP gallery image must fit inside its frame");
assert.match(pagesCss, /\.pdp__media\s*>\s*img\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0/si, "PDP gallery image must be allowed to shrink within the grid cell");
assert.doesNotMatch(pagesCss, /\.pdp__media(?:\s*>)?\s*img\s*\{[^}]*transform:\s*scale/si, "PDP gallery image must not be scaled beyond its frame");

console.log(JSON.stringify({
  status: "ok",
  routingAssertions,
  products: products.length,
  validationErrors: state.sofievkaNormalizationReport.normalizationErrors.length,
  reviewMappings,
  unmappedAttributeProducts,
  brandsWithoutProducts,
  productIdHash,
  searchCases: 10
}, null, 2));
