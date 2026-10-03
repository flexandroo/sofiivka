// Builds an import reference (same shape as scripts/import/reference.sql) from the repo data files.
// Fallback for sessions without PROD read access: titles, prices and admin-created products may be stale.
// Usage: node scripts/import/reference-local.mjs > imports/reference-local.json
import { loadCatalogRuntime } from "../catalog-db-utils.mjs";

const state = loadCatalogRuntime();
const nodes = state.sofievkaTaxonomy.nodes;
const definitions = state.sofievkaAttributeSchema.definitions;
const products = state.sofievkaCanonicalProducts;
const registry = state.sofievkaBrandRegistry;

const knownValues = {};
for (const product of products) {
  for (const [id, value] of Object.entries(product.normalizedAttributes || {})) {
    if (definitions[id]?.type !== "select" && definitions[id]?.type !== "string") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === null || item === undefined || item === "") continue;
      (knownValues[id] ||= new Set()).add(String(item));
    }
  }
}

const reference = {
  source: "local",
  exportedAt: new Date().toISOString(),
  brands: [...registry].map(brand => ({ id: brand.slug || brand.id, name: brand.name, status: "active" })),
  suppliers: Object.keys(state.sofievkaSourceMappings.suppliers || {}),
  categories: nodes.map(node => ({
    id: node.id,
    title: node.title,
    status: node.status,
    visibility: node.visibility,
    leaf: !nodes.some(child => child.parentId === node.id && child.status === "active"),
    facets: node.facetIds || node.allowedFacetIds || []
  })),
  attributes: Object.fromEntries(Object.entries(definitions).map(([id, definition]) => [id, {
    type: definition.type,
    unit: definition.unit || "",
    label: definition.label,
    values: [...(knownValues[id] || [])].sort()
  }])),
  products: products.map(product => ({
    id: product.id,
    sku: product.sku,
    title: product.title,
    status: product.publicationStatus,
    brand: product.brandId,
    category: product.primaryCategoryId,
    amount: product.pricing?.amount ?? null,
    sources: product.source ? [`${product.source.supplier}:${product.source.sourceId}`] : []
  }))
};

process.stdout.write(JSON.stringify(reference, null, 1));
