const requiredSnapshotKeys = Object.freeze([
  "version",
  "products",
  "categories",
  "brands",
  "attributeDefinitions"
]);

export class CatalogDataSource {
  async getCatalogVersion() {
    throw new Error("CatalogDataSource.getCatalogVersion() must be implemented");
  }

  async loadBootstrap() {
    throw new Error("CatalogDataSource.loadBootstrap() must be implemented");
  }

  async listProducts(_query = {}) {
    throw new Error("CatalogDataSource.listProducts() must be implemented");
  }

  async loadFacets(_query = {}) {
    throw new Error("CatalogDataSource.loadFacets() must be implemented");
  }

  async getProductById(_legacyId) {
    throw new Error("CatalogDataSource.getProductById() must be implemented");
  }

  async getProductBySlug(_slug) {
    throw new Error("CatalogDataSource.getProductBySlug() must be implemented");
  }

  async getProductsByIds(_legacyIds) {
    throw new Error("CatalogDataSource.getProductsByIds() must be implemented");
  }

  async search(_query, _options = {}) {
    throw new Error("CatalogDataSource.search() must be implemented");
  }

  async getCollection(_id) {
    throw new Error("CatalogDataSource.getCollection() must be implemented");
  }

  // Debug/parity only. Storefront code must use the scoped methods above.
  async loadCatalogSnapshot() {
    throw new Error("CatalogDataSource.loadCatalogSnapshot() must be implemented");
  }
}

export function assertCatalogSnapshot(snapshot, label = "CatalogSnapshot") {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError(`${label} must be an object`);
  }
  const missing = requiredSnapshotKeys.filter(key => !(key in snapshot));
  if (missing.length) throw new Error(`${label} is missing: ${missing.join(", ")}`);
  if (typeof snapshot.version !== "string" || !snapshot.version.trim()) {
    throw new Error(`${label}.version must be a non-empty string`);
  }
  for (const key of ["products", "categories", "brands"]) {
    if (!Array.isArray(snapshot[key])) throw new Error(`${label}.${key} must be an array`);
  }
  if (!snapshot.attributeDefinitions || typeof snapshot.attributeDefinitions !== "object" || Array.isArray(snapshot.attributeDefinitions)) {
    throw new Error(`${label}.attributeDefinitions must be an object`);
  }
  return snapshot;
}

export function publicCatalogProjection(snapshot) {
  assertCatalogSnapshot(snapshot);
  return Object.freeze({
    ...snapshot,
    products: Object.freeze(snapshot.products.filter(product => product.publicationStatus === "published"))
  });
}

export const estimateSnapshotBytes = snapshot => new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;

export function normalizeScopedQuery(query = {}) {
  const strings = value => [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))];
  const technicalFilters = Object.fromEntries(Object.entries(query.technicalFilters || {})
    .map(([key, values]) => [key, strings(values)])
    .filter(([, values]) => values.length));
  const finiteOrNull = value => value === null || value === undefined || value === ""
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null;
  return Object.freeze({
    scopeCategory: String(query.scopeCategory || ""),
    scopeBrand: String(query.scopeBrand || ""),
    categoryIds: strings(query.categoryIds),
    brandIds: strings(query.brandIds),
    availabilityIds: strings(query.availabilityIds),
    technicalFilters,
    minPrice: finiteOrNull(query.minPrice),
    maxPrice: finiteOrNull(query.maxPrice),
    sort: ["price-asc", "price-desc"].includes(query.sort) ? query.sort : "default",
    page: Math.max(1, Math.trunc(Number(query.page) || 1)),
    pageSize: Math.min(96, Math.max(1, Math.trunc(Number(query.pageSize) || 24))),
    productIds: strings(query.productIds),
    q: String(query.q || "").trim()
  });
}
