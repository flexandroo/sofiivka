import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "catalog", "catalog-contract-baseline-v1.json");
const previous = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const searchQueries = [...new Set([...previous.searchQueries, "Hunter PGP Ultra"])];
const runtimeFiles = [
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
  "hunter-products-data.js",
  "catalog-data.js"
];

const context = { window: {}, console, URLSearchParams, Intl };
context.window.window = context.window;
vm.createContext(context);
for (const file of runtimeFiles) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const catalog = context.window.sofievkaCatalog;
const legacy = catalog.products;
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const sortedLines = values => [...values].sort().join("\n");

const publicUrls = [
  ...legacy.map(product => `/product?id=${encodeURIComponent(product.id)}`),
  ...catalog.taxonomy.nodes.map(category => catalog.getCategoryPath(category.id)),
  ...catalog.brands.map(brand => catalog.brandUrl(brand.id))
];
const plpCounts = [
  ...catalog.taxonomy.nodes.map(category => `${category.id}|${catalog.productsForCategory(category.id).length}`),
  ...catalog.sections.map(section => `${section.id}|${catalog.productsForSection(section.id).length}`)
];
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
const searchSnapshot = searchQueries.map(query => {
  const result = context.window.sofievkaCatalogSearch.search(query);
  const top = context.window.sofievkaCatalogSearch.search(query, { productLimit: 5 });
  return `${query}|${result.totalProducts}|${top.products.map(product => product.id).join(",")}`;
}).join("\n");

const next = {
  ...previous,
  capturedAt: "2026-11-25",
  counts: {
    products: legacy.length,
    catalogProducts: catalog.catalogProducts.length,
    serviceItems: catalog.serviceItems.length,
    brands: catalog.brands.length,
    categories: catalog.taxonomy.nodes.length
  },
  hashes: {
    productIds: hash(sortedLines(legacy.map(product => product.id))),
    skus: hash(sortedLines(legacy.map(product => product.sku))),
    slugs: hash(sortedLines(legacy.map(product => product.slug))),
    brandCategoryAssignments: hash(sortedLines(legacy.map(product => `${product.id}|${product.brandId}|${product.primaryCategoryId}`))),
    brandIds: hash(sortedLines(catalog.brands.map(brand => brand.id))),
    categoryIds: hash(sortedLines(catalog.taxonomy.nodes.map(category => category.id))),
    publicUrls: hash(sortedLines(publicUrls)),
    plpCounts: hash(sortedLines(plpCounts)),
    facetAvailability: hash(sortedLines(facetAvailability)),
    searchAvailability: hash(searchSnapshot)
  },
  searchQueries
};

fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ counts: next.counts, hashes: next.hashes, searchQueries: next.searchQueries.length }, null, 2));
