"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const baseline = JSON.parse(fs.readFileSync(path.join(projectRoot, "catalog", "catalog-contract-baseline-v1.json"), "utf8"));
const categoryReview = JSON.parse(fs.readFileSync(path.join(projectRoot, "catalog", "category-mapping-review.json"), "utf8"));
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
  "tekkhaus-products-data.js",
  "tech-products-data.js",
  "heating-brands-products-data.js",
  "baxi-buderus-products-data.js",
  "catalog-data.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), "utf8"), context, { filename: file });
}

const state = context.window;
const catalog = state.sofievkaCatalog;
const canonical = catalog.canonicalProducts;
const legacy = catalog.products;
const raw = state.sofievkaRawSupplierProducts;
const search = state.sofievkaCatalogSearch;
const adapter = state.sofievkaProductLegacyAdapter;
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const sortedLines = values => [...values].sort().join("\n");

assert.equal(canonical.length, baseline.counts.products, "canonical product count changed");
assert.equal(legacy.length, baseline.counts.products, "legacy adapter product count changed");
assert.equal(raw.length, baseline.counts.products, "raw supplier product count changed");
assert.equal(catalog.catalogProducts.length, baseline.counts.catalogProducts, "PLP product count changed");
assert.equal(catalog.serviceItems.length, baseline.counts.serviceItems, "service item count changed");
assert.equal(catalog.brands.length, baseline.counts.brands, "brand count changed");
assert.equal(catalog.taxonomy.nodes.length, baseline.counts.categories, "category count changed");

const productIdHash = hash(sortedLines(legacy.map(product => product.id)));
assert.equal(productIdHash, baseline.hashes.productIds, "public product IDs changed");
assert.equal(hash(sortedLines(legacy.map(product => product.sku))), baseline.hashes.skus, "SKU set changed");
assert.equal(hash(sortedLines(legacy.map(product => product.slug))), baseline.hashes.slugs, "slug set changed");
assert.equal(hash(sortedLines(legacy.map(product => `${product.id}|${product.brandId}|${product.primaryCategoryId}`))), baseline.hashes.brandCategoryAssignments, "brand/category assignments changed");
assert.equal(hash(sortedLines(catalog.brands.map(brand => brand.id))), baseline.hashes.brandIds, "brand IDs changed");
assert.equal(hash(sortedLines(catalog.taxonomy.nodes.map(category => category.id))), baseline.hashes.categoryIds, "category IDs changed");

const publicUrls = [
  ...legacy.map(product => `/product?id=${encodeURIComponent(product.id)}`),
  ...catalog.taxonomy.nodes.map(category => catalog.getCategoryPath(category.id)),
  ...catalog.brands.map(brand => catalog.brandUrl(brand.id))
];
assert.equal(hash(sortedLines(publicUrls)), baseline.hashes.publicUrls, "public URL contract changed");

const plpCounts = [
  ...catalog.taxonomy.nodes.map(category => `${category.id}|${catalog.productsForCategory(category.id).length}`),
  ...catalog.sections.map(section => `${section.id}|${catalog.productsForSection(section.id).length}`)
];
assert.equal(hash(sortedLines(plpCounts)), baseline.hashes.plpCounts, "PLP category or section counts changed");

const facetAvailability = catalog.taxonomy.nodes.map(category => {
  const products = catalog.productsForCategory(category.id);
  const categoryIds = category.level > 1 ? [category.id] : [...new Set(products.map(product => product.primaryCategoryId))];
  const allowed = [...new Set(categoryIds.flatMap(id => catalog.categoryById[id]?.facetIds || []))];
  const available = allowed.filter(id => {
    const definition = catalog.attributeDefinitions[id];
    if (!definition?.filterable) return false;
    const values = new Set(products.map(product => product.normalizedAttributes?.[id]).filter(value => value !== undefined && value !== null && value !== ""));
    return values.size >= 2;
  }).sort();
  return `${category.id}|${available.join(",")}`;
});
assert.equal(hash(sortedLines(facetAvailability)), baseline.hashes.facetAvailability, "effective facet availability changed");

const searchSnapshot = baseline.searchQueries.map(query => {
  const result = search.search(query);
  const top = search.search(query, { productLimit: 5 });
  return `${query}|${result.totalProducts}|${top.products.map(product => product.id).join(",")}`;
}).join("\n");
assert.equal(hash(searchSnapshot), baseline.hashes.searchAvailability, "search availability changed");

const storageSource = ["script.js", "page-shell.js"]
  .map(file => fs.readFileSync(path.join(projectRoot, file), "utf8"))
  .join("\n");
const storageKeys = [...new Set([...storageSource.matchAll(/localStorage\.(?:getItem|setItem)\(["']([^"']+)["']/g)].map(match => match[1]))].sort();
assert.deepEqual(storageKeys, [...baseline.localStorageKeys].sort(), "public localStorage keys changed");

const canonicalById = new Map(canonical.map(product => [product.id, product]));
const legacyById = new Map(legacy.map(product => [product.id, product]));
assert.ok(legacy.every(product => canonicalById.has(product.id)), "PDP lookup lost a canonical product");
assert.ok(canonical.every(product => legacyById.has(product.id)), "legacy adapter lost a public product");
assert.ok(canonical.every((product, index) => product.id === legacy[index].id), "adapter changed product order or IDs");
assert.ok(canonical.every(product => !Object.hasOwn(product, "manufacturerUrl") && !Object.hasOwn(product, "technicalDetails") && !Object.hasOwn(product, "price") && !Object.hasOwn(product, "availability")), "supplier or legacy fields leaked into CanonicalProduct");

for (let index = 0; index < canonical.length; index += 1) {
  const adapted = adapter.adaptProduct(canonical[index]);
  const current = legacy[index];
  for (const field of ["id", "slug", "sku", "brandId", "primaryCategoryId", "sectionId", "price", "availability", "image", "compareType"]) {
    assert.deepEqual(adapted[field], current[field], `${current.id}: legacy field ${field} is not deterministic`);
  }
}

const knownPriceCount = canonical.filter(product => product.pricing.priceStatus === "known").length;
const unknownPriceCount = canonical.filter(product => product.pricing.priceStatus === "unknown").length;
const onRequestPriceCount = canonical.filter(product => product.pricing.priceStatus === "on_request").length;
assert.equal(knownPriceCount, 631, "known price count changed");
assert.equal(unknownPriceCount, 2584, "unknown price count changed");
assert.equal(onRequestPriceCount, 0, "on-request prices must not be inferred without evidence");
assert.ok(canonical.filter(product => product.pricing.amount === null).every(product => product.pricing.priceStatus !== "known"), "null prices cannot be known");

for (const direction of ["asc", "desc"]) {
  const sorted = [...legacy].sort((first, second) => catalog.compareProductsByPrice(first, second, direction));
  const firstUnknownIndex = sorted.findIndex(product => product.pricing.amount === null);
  assert.equal(firstUnknownIndex, knownPriceCount, `${direction} price sorting must place unknown prices after known prices`);
}

assert.equal(canonical.filter(product => product.publicationStatus === "published").length, 3214, "catalog publication mapping changed");
assert.equal(canonical.filter(product => product.publicationStatus === "hidden").length, 1, "service publication mapping changed");
assert.equal(state.sofievkaCatalogValidation.validateCatalog(catalog).valid, true, "full validator must pass in dual snapshot QA");

const reviewProducts = canonical.filter(product => product.source?.mappingStatus === "review");
const reviewProductIds = [...reviewProducts.map(product => product.id)].sort();
const reportProductIds = [...categoryReview.items.map(item => item.productId)].sort();
assert.equal(categoryReview.version, "category-mapping-review-v1", "category review version changed");
assert.equal(categoryReview.categoryAssignmentsChanged, false, "category review must not mutate assignments");
assert.equal(categoryReview.productCount, 29, "category review declared count changed");
assert.equal(categoryReview.items.length, categoryReview.productCount, "category review item count is inconsistent");
assert.deepEqual(reportProductIds, reviewProductIds, "category review must cover every review mapping exactly once");
assert.equal(new Set(reportProductIds).size, reportProductIds.length, "category review contains duplicate product IDs");

for (const item of categoryReview.items) {
  const product = canonicalById.get(item.productId);
  assert.ok(product, `${item.productId}: category review references a missing product`);
  assert.equal(item.currentCategory, product.primaryCategoryId, `${item.productId}: category review current category is stale`);
  assert.equal(item.sourceCategory, product.source.sourceCategory, `${item.productId}: category review source category is stale`);
  assert.ok(catalog.categoryById[item.suggestedCategory], `${item.productId}: suggested category does not exist`);
  assert.ok(Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1, `${item.productId}: invalid category review confidence`);
  assert.equal(item.status, "review", `${item.productId}: category review status must remain review`);
}

console.log(JSON.stringify({
  status: "ok",
  baseline: baseline.version,
  productsBefore: baseline.counts.products,
  productsAfter: canonical.length,
  productIdHashBefore: baseline.hashes.productIds,
  productIdHashAfter: productIdHash,
  knownPrices: knownPriceCount,
  unknownPrices: unknownPriceCount,
  publication: { published: 3214, hidden: 1 },
  categoryReview: {
    products: categoryReview.items.length,
    highConfidenceSuggestions: categoryReview.items.filter(item => item.confidence >= 0.85 && item.suggestedCategory !== item.currentCategory).length,
    assignmentsChanged: categoryReview.categoryAssignmentsChanged
  },
  localStorageKeys: storageKeys,
  publicUrlContractChanged: false
}, null, 2));
