import { CatalogDataSource, assertCatalogSnapshot, estimateSnapshotBytes, normalizeScopedQuery } from "./data-source.mjs";

export class SupabaseCatalogDataSource extends CatalogDataSource {
  #client;
  #cacheTtlMs;
  #cache = null;
  #inFlight = null;
  #scopedCache = new Map();
  #catalogVersion = "";
  #lastMetrics = null;

  constructor(options = {}) {
    super();
    if (!options.client || typeof options.client.rpc !== "function") {
      throw new TypeError("SupabaseCatalogDataSource requires a public RPC client");
    }
    this.#client = options.client;
    this.#cacheTtlMs = Math.max(0, Number(options.cacheTtlMs ?? 300_000));
  }

  get lastMetrics() { return this.#lastMetrics; }

  clearCache() {
    this.#cache = null;
    this.#inFlight = null;
    this.#scopedCache.clear();
  }

  async getCatalogVersion(options = {}) {
    return this.#read("getCatalogVersion", "get_catalog_version", {}, options);
  }

  async loadBootstrap(options = {}) {
    return this.#read("loadBootstrap", "get_catalog_bootstrap", {}, { ...options, ttlMs: options.ttlMs ?? this.#cacheTtlMs });
  }

  async listProducts(query = {}, options = {}) {
    const value = normalizeScopedQuery(query);
    return this.#read("listProducts", "get_catalog_products", scopedParameters(value, true), options);
  }

  async loadFacets(query = {}, options = {}) {
    const value = normalizeScopedQuery(query);
    return this.#read("loadFacets", "get_catalog_facets", scopedParameters(value, false), options);
  }

  async getProductById(legacyId, options = {}) {
    const id = String(legacyId || "").trim();
    if (!id) throw new TypeError("A product legacy ID is required");
    const result = await this.#read("getProductById", "get_catalog_product", { legacy_id: id }, options);
    if (!result) return null;
    return Object.freeze({
      ...result,
      product: restoreProductMap(result.product),
      relatedProducts: Object.freeze((result.relatedProducts || []).map(freezeCard))
    });
  }

  async getProductBySlug(slug, options = {}) {
    const value = String(slug || "").trim().toLowerCase();
    if (!value) throw new TypeError("A product slug is required");
    const result = await this.#read("getProductBySlug", "get_catalog_product_by_slug", { product_slug: value }, options);
    if (!result) return null;
    return Object.freeze({
      ...result,
      product: restoreProductMap(result.product),
      relatedProducts: Object.freeze((result.relatedProducts || []).map(freezeCard))
    });
  }

  async getProductsByIds(legacyIds = [], options = {}) {
    const ids = [...new Set((Array.isArray(legacyIds) ? legacyIds : []).map(String).map(value => value.trim()).filter(Boolean))].slice(0, 96);
    if (!ids.length) return Object.freeze({ version: this.#catalogVersion || null, total: 0, products: Object.freeze([]) });
    const value = normalizeScopedQuery({ productIds: ids, page: 1, pageSize: ids.length });
    const result = await this.#read("getProductsByIds", "get_catalog_products", scopedParameters(value, true), options);
    const productsById = new Map((result?.products || []).map(product => [product.id, product]));
    const products = Object.freeze(ids.map(id => productsById.get(id)).filter(Boolean));
    return Object.freeze({ version: result?.version || this.#catalogVersion || null, total: products.length, products });
  }

  async search(query, options = {}) {
    const text = String(query || "").trim();
    if (text.length < 2) return Object.freeze({ query: text, totalProducts: 0, products: Object.freeze([]), productHits: Object.freeze([]), categories: Object.freeze([]), brands: Object.freeze([]), series: Object.freeze([]) });
    return this.#read("search", "search_catalog", {
      query_text: text,
      product_limit: bounded(options.productLimit, 12, 48),
      category_limit: bounded(options.categoryLimit, 6, 12),
      brand_limit: bounded(options.brandLimit, 6, 12),
      series_limit: bounded(options.seriesLimit, 6, 12)
    }, options);
  }

  async getCollection(id, options = {}) {
    const collectionId = String(id || "").trim();
    if (!collectionId) throw new TypeError("A collection ID is required");
    return this.#read("getCollection", "get_catalog_collection", { collection_id: collectionId }, options);
  }

  async loadCatalogSnapshot(options = {}) {
    const now = Date.now();
    if (!options.force && this.#cache && now - this.#cache.loadedAt < this.#cacheTtlMs) {
      this.#lastMetrics = Object.freeze({ ...this.#cache.metrics, cacheHit: true, requestCount: 0 });
      return this.#cache.snapshot;
    }
    if (!options.force && this.#inFlight) return this.#inFlight;

    this.#inFlight = this.#load(options.signal).finally(() => { this.#inFlight = null; });
    return this.#inFlight;
  }

  async #load(signal) {
    const assemblyStartedAt = performanceNow();
    const result = await this.#client.rpc("get_catalog_snapshot", {}, { signal });
    const snapshot = restoreOrderedMaps(assertCatalogSnapshot(result?.data, "Supabase CatalogSnapshot"));
    const assemblyMs = performanceNow() - assemblyStartedAt - Number(result.metrics?.durationMs || 0);
    const metrics = Object.freeze({
      ...(result.metrics || {}),
      cacheHit: false,
      assemblyMs: Math.max(0, assemblyMs),
      snapshotBytes: estimateSnapshotBytes(snapshot),
      productCount: snapshot.products.length
    });
    this.#cache = { snapshot, metrics, loadedAt: Date.now() };
    this.#lastMetrics = metrics;
    return snapshot;
  }

  async #read(method, rpcName, parameters, options = {}) {
    const ttlMs = Math.max(0, Number(options.ttlMs ?? 60_000));
    const key = `${this.#catalogVersion || "unversioned"}:${method}:${stableStringify(parameters)}`;
    const cached = this.#scopedCache.get(key);
    if (!options.force && cached && Date.now() - cached.loadedAt < ttlMs) {
      this.#lastMetrics = Object.freeze({ ...cached.metrics, cacheHit: true, requestCount: 0, operation: method });
      return cached.value;
    }
    const result = await this.#client.rpc(rpcName, parameters, { signal: options.signal });
    const value = freezeResponse(result?.data);
    const responseVersion = String(value?.version || "");
    if (responseVersion && this.#catalogVersion && responseVersion !== this.#catalogVersion) this.#scopedCache.clear();
    if (responseVersion) this.#catalogVersion = responseVersion;
    const versionedKey = `${this.#catalogVersion || "unversioned"}:${method}:${stableStringify(parameters)}`;
    const metrics = Object.freeze({ ...(result.metrics || {}), cacheHit: false, operation: method, version: responseVersion || null });
    this.#scopedCache.set(versionedKey, { value, metrics, loadedAt: Date.now() });
    this.#lastMetrics = metrics;
    return value;
  }
}

const performanceNow = () => globalThis.performance?.now?.() ?? Date.now();

// PostgreSQL jsonb deliberately normalizes object-key order. The contract treats
// normalizedAttributes as a map, but the legacy PDP historically used insertion
// order for its final catch-all group. Rebuild that order from catalogAttributes,
// whose array ordering is preserved end-to-end.
function restoreOrderedMaps(snapshot) {
  return Object.freeze({
    ...snapshot,
    products: Object.freeze(snapshot.products.map(product => {
      const original = product.normalizedAttributes || {};
      const ordered = {};
      for (const attribute of product.catalogAttributes || []) {
        if (attribute?.id && Object.prototype.hasOwnProperty.call(original, attribute.id)) {
          ordered[attribute.id] = original[attribute.id];
        }
      }
      for (const key of Object.keys(original)) {
        if (!Object.prototype.hasOwnProperty.call(ordered, key)) ordered[key] = original[key];
      }
      return Object.freeze({ ...product, normalizedAttributes: Object.freeze(ordered) });
    }))
  });
}

function restoreProductMap(product) {
  if (!product) return null;
  const original = product.normalizedAttributes || {};
  const ordered = {};
  for (const attribute of product.catalogAttributes || []) {
    if (attribute?.id && Object.prototype.hasOwnProperty.call(original, attribute.id)) ordered[attribute.id] = original[attribute.id];
  }
  for (const key of Object.keys(original)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) ordered[key] = original[key];
  }
  return Object.freeze({ ...product, normalizedAttributes: Object.freeze(ordered) });
}

function freezeCard(card) {
  return Object.freeze({ ...card, normalizedAttributes: Object.freeze(card?.normalizedAttributes || {}) });
}

function freezeResponse(value) {
  if (!value || typeof value !== "object") return value;
  const result = { ...value };
  if (Array.isArray(result.products)) result.products = Object.freeze(result.products.map(freezeCard));
  if (Array.isArray(result.relatedProducts)) result.relatedProducts = Object.freeze(result.relatedProducts.map(freezeCard));
  if (Array.isArray(result.productHits)) result.productHits = Object.freeze(result.productHits.map(hit => Object.freeze({ ...hit, product: freezeCard(hit.product) })));
  return Object.freeze(result);
}

function scopedParameters(value, includePage) {
  return {
    scope_category: value.scopeCategory || null,
    scope_brand: value.scopeBrand || null,
    category_ids: value.categoryIds.length ? value.categoryIds : null,
    brand_ids: value.brandIds.length ? value.brandIds : null,
    availability_ids: value.availabilityIds.length ? value.availabilityIds : null,
    technical_filters: value.technicalFilters,
    minimum_price: value.minPrice,
    maximum_price: value.maxPrice,
    ...(includePage ? {
      sort_mode: value.sort,
      page_number: value.page,
      page_size: value.pageSize,
      product_ids: value.productIds.length ? value.productIds : null,
    } : {}),
    query_text: value.q || null
  };
}

function bounded(value, fallback, maximum) {
  return Math.min(maximum, Math.max(1, Math.trunc(Number(value) || fallback)));
}

function stableStringify(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
