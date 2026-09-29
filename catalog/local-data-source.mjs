import { CatalogDataSource, assertCatalogSnapshot, normalizeScopedQuery, publicCatalogProjection } from "./data-source.mjs";

export class LocalCatalogDataSource extends CatalogDataSource {
  #snapshotProvider;
  #publicOnly;

  constructor(options = {}) {
    super();
    this.#snapshotProvider = options.snapshotProvider || (() => globalThis.window?.sofievkaCatalogSnapshot);
    this.#publicOnly = options.publicOnly === true;
  }

  async loadCatalogSnapshot() {
    const snapshot = assertCatalogSnapshot(await this.#snapshotProvider(), "Local CatalogSnapshot");
    return this.#publicOnly ? publicCatalogProjection(snapshot) : snapshot;
  }

  async getCatalogVersion() {
    const snapshot = await this.loadCatalogSnapshot();
    return Object.freeze({ version: snapshot.version, updated_at: null });
  }

  async loadBootstrap() {
    const snapshot = await this.loadCatalogSnapshot();
    const children = new Map();
    snapshot.categories.forEach(category => {
      const list = children.get(category.parentId) || [];
      list.push(category.id);
      children.set(category.parentId, list);
    });
    const descendants = id => {
      const result = [id];
      for (const child of children.get(id) || []) result.push(...descendants(child));
      return result;
    };
    const categoryCounts = Object.fromEntries(snapshot.categories.map(category => {
      const ids = new Set(descendants(category.id));
      return [category.id, snapshot.products.filter(product => ids.has(product.primaryCategoryId)).length];
    }));
    const brandCounts = countBy(snapshot.products, product => product.brandId);
    const collectionCounts = countBy(snapshot.products.flatMap(product => product.collections || []), value => value);
    return Object.freeze({
      version: snapshot.version,
      updated_at: null,
      totalProducts: snapshot.products.length,
      categories: snapshot.categories,
      brands: snapshot.brands,
      attributeDefinitions: snapshot.attributeDefinitions,
      collections: Object.freeze(Object.entries(collectionCounts).map(([id, count]) => Object.freeze({ id, slug: id, title: id, count }))),
      categoryCounts: Object.freeze(categoryCounts),
      brandCounts: Object.freeze(brandCounts)
    });
  }

  async listProducts(query = {}) {
    const snapshot = await this.loadCatalogSnapshot();
    const normalized = normalizeScopedQuery(query);
    let products = scopedProducts(snapshot, normalized).filter(product => matches(product, normalized));
    if (normalized.productIds.length) {
      const ids = new Set(normalized.productIds);
      products = products.filter(product => ids.has(product.id));
    }
    if (normalized.sort !== "default") products.sort(priceComparator(normalized.sort));
    const total = products.length;
    const start = (normalized.page - 1) * normalized.pageSize;
    return Object.freeze({
      version: snapshot.version,
      total,
      page: normalized.page,
      pageSize: normalized.pageSize,
      hasMore: start + normalized.pageSize < total,
      products: Object.freeze(products.slice(start, start + normalized.pageSize).map(product => productCard(product, snapshot.brands)))
    });
  }

  async loadFacets(query = {}) {
    const snapshot = await this.loadCatalogSnapshot();
    const normalized = normalizeScopedQuery(query);
    const products = scopedProducts(snapshot, normalized);
    const counts = (key, omit) => countBy(products.filter(product => matches(product, normalized, omit)), product => productValue(product, key));
    const categoryIds = new Set(products.map(product => product.primaryCategoryId));
    const allowed = [...new Set(snapshot.categories
      .filter(category => categoryIds.has(category.id))
      .flatMap(category => category.facetIds || []))]
      .filter(id => snapshot.attributeDefinitions[id]?.filterable)
      .sort((left, right) => (snapshot.attributeDefinitions[left]?.rank || 999) - (snapshot.attributeDefinitions[right]?.rank || 999));
    const technicalCounts = {};
    for (const id of allowed) {
      const values = counts(id, id);
      if (Object.keys(values).filter(key => key !== "").length >= 2 || normalized.technicalFilters[id]) technicalCounts[id] = values;
      if (Object.keys(technicalCounts).length >= 9) break;
    }
    const priceProducts = products.filter(product => matches(product, normalized, "price"))
      .map(product => product.pricing?.amount).filter(amount => Number.isFinite(amount) && amount > 0);
    return Object.freeze({
      version: snapshot.version,
      total: products.filter(product => matches(product, normalized)).length,
      brandCounts: Object.freeze(counts("brand", "brand")),
      availabilityCounts: Object.freeze(counts("availability", "availability")),
      categoryCounts: Object.freeze(counts("category", "category")),
      technicalCounts: Object.freeze(technicalCounts),
      priceBounds: Object.freeze({ min: priceProducts.length ? Math.min(...priceProducts) : null, max: priceProducts.length ? Math.max(...priceProducts) : null })
    });
  }

  async getProductById(legacyId) {
    const snapshot = await this.loadCatalogSnapshot();
    const product = snapshot.products.find(item => item.id === String(legacyId));
    if (!product) return null;
    const relatedProducts = snapshot.products
      .filter(candidate => candidate.id !== product.id && candidate.primaryCategoryId === product.primaryCategoryId)
      .map((candidate, index) => ({ candidate, index, score: relatedScore(product, candidate), distance: priceDistance(product, candidate) }))
      .sort((left, right) => right.score - left.score || left.distance - right.distance || left.index - right.index)
      .slice(0, 4)
      .map(item => productCard(item.candidate, snapshot.brands));
    return Object.freeze({ version: snapshot.version, product, relatedProducts: Object.freeze(relatedProducts) });
  }

  async getProductsByIds(legacyIds = []) {
    const ids = [...new Set((Array.isArray(legacyIds) ? legacyIds : []).map(String).map(value => value.trim()).filter(Boolean))].slice(0, 96);
    const snapshot = await this.loadCatalogSnapshot();
    if (!ids.length) return Object.freeze({ version: snapshot.version, total: 0, products: Object.freeze([]) });
    const productsById = new Map(snapshot.products.map(product => [product.id, product]));
    return Object.freeze({
      version: snapshot.version,
      total: ids.filter(id => productsById.has(id)).length,
      products: Object.freeze(ids.map(id => productsById.get(id)).filter(Boolean).map(product => productCard(product, snapshot.brands)))
    });
  }

  async search(query, options = {}) {
    const snapshot = await this.loadCatalogSnapshot();
    const text = normalizeText(query);
    if (text.length < 2) return emptySearch(snapshot.version, query);
    const tokens = text.split(/\s+/).filter(Boolean);
    const productHits = snapshot.products.map((product, index) => ({ product, index, score: searchScore(product, text, tokens, snapshot) }))
      .filter(hit => hit.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const entityHits = (items, value, limit) => items.map(entity => {
      const label = normalizeText(value(entity));
      const score = label === text ? 10000 : label.startsWith(text) ? 4800 : label.includes(text) ? 2600 : 0;
      return { entity, score };
    }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    const productLimit = Math.min(48, Math.max(1, Number(options.productLimit) || 12));
    const categories = entityHits(snapshot.categories, item => `${item.title} ${item.shortTitle || ""} ${item.id}`, Number(options.categoryLimit) || 6)
      .map(hit => ({ ...hit, count: snapshot.products.filter(product => product.primaryCategoryId === hit.entity.id).length }));
    const brands = entityHits(snapshot.brands, item => `${item.name} ${item.id}`, Number(options.brandLimit) || 6)
      .map(hit => ({ ...hit, count: snapshot.products.filter(product => product.brandId === hit.entity.id).length }));
    const seriesIds = [...new Set(snapshot.products.map(product => product.seriesId).filter(Boolean))];
    const series = entityHits(seriesIds.map(id => ({ id, name: id, label: id })), item => item.name, Number(options.seriesLimit) || 6)
      .map(hit => ({ ...hit, count: snapshot.products.filter(product => product.seriesId === hit.entity.id).length }));
    const selected = productHits.slice(0, productLimit).map(hit => ({ product: productCard(hit.product, snapshot.brands), score: hit.score }));
    return Object.freeze({
      version: snapshot.version, query: String(query ?? ""), totalProducts: productHits.length,
      products: Object.freeze(selected.map(hit => hit.product)), productHits: Object.freeze(selected),
      categories: Object.freeze(categories), brands: Object.freeze(brands), series: Object.freeze(series)
    });
  }

  async getCollection(id) {
    const snapshot = await this.loadCatalogSnapshot();
    const collectionId = String(id || "");
    const products = snapshot.products.filter(product => (product.collections || []).includes(collectionId));
    return Object.freeze({
      version: snapshot.version,
      collection: Object.freeze({ id: collectionId, slug: collectionId, title: collectionId }),
      products: Object.freeze(products.map(product => productCard(product, snapshot.brands)))
    });
  }
}

function countBy(values, selector) {
  const result = {};
  values.forEach(value => {
    const key = selector(value);
    if (key !== undefined && key !== null && key !== "") result[String(key)] = (result[String(key)] || 0) + 1;
  });
  return result;
}

function descendants(snapshot, id) {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    snapshot.categories.forEach(category => {
      if (result.has(category.parentId) && !result.has(category.id)) { result.add(category.id); changed = true; }
    });
  }
  return result;
}

function scopedProducts(snapshot, query) {
  const categoryIds = query.scopeCategory && query.scopeCategory !== "all" ? descendants(snapshot, query.scopeCategory) : null;
  return snapshot.products.filter(product => (!categoryIds || categoryIds.has(product.primaryCategoryId)) && (!query.scopeBrand || product.brandId === query.scopeBrand));
}

function filterValue(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return value;
}

function productValue(product, key) {
  if (key === "brand") return product.brandId;
  if (key === "availability") return product.inventory?.status;
  if (["category", "subcategory"].includes(key)) return product.primaryCategoryId;
  return filterValue(product.normalizedAttributes?.[key]);
}

function matches(product, query, omit = "") {
  if (query.q && !normalizeText(`${product.title} ${product.shortTitle || ""} ${product.sku} ${product.model} ${product.brandId}`).includes(normalizeText(query.q))) return false;
  if (omit !== "price" && (query.minPrice !== null || query.maxPrice !== null)) {
    const amount = product.pricing?.amount;
    if (!Number.isFinite(amount) || amount <= 0 || (query.minPrice !== null && amount < query.minPrice) || (query.maxPrice !== null && amount > query.maxPrice)) return false;
  }
  const groups = { category: query.categoryIds, brand: query.brandIds, availability: query.availabilityIds, ...query.technicalFilters };
  return Object.entries(groups).every(([key, values]) => !values.length || key === omit || ((key === "category" && omit === "subcategory") || (key === "subcategory" && omit === "category")) || values.includes(String(productValue(product, key))));
}

function priceComparator(sort) {
  return (left, right) => {
    const a = Number.isFinite(left.pricing?.amount) && left.pricing.amount > 0 ? left.pricing.amount : null;
    const b = Number.isFinite(right.pricing?.amount) && right.pricing.amount > 0 ? right.pricing.amount : null;
    if (a === null || b === null) return a === null && b === null ? 0 : a === null ? 1 : -1;
    return sort === "price-desc" ? b - a : a - b;
  };
}

function productCard(product, brands) {
  return Object.freeze({
    id: product.id, slug: product.slug, sku: product.sku, title: product.title,
    shortTitle: product.shortTitle, model: product.model, brandId: product.brandId,
    brand: brands.find(brand => brand.id === product.brandId)?.name || product.brandId,
    primaryCategoryId: product.primaryCategoryId, seriesId: product.seriesId || null,
    pricing: product.pricing, inventory: product.inventory, publicationStatus: product.publicationStatus,
    images: Object.freeze((product.images || []).slice(0, 1)), normalizedAttributes: product.normalizedAttributes || {},
    tags: product.tags || [], collections: product.collections || [], badges: product.badges || [],
    source: Object.freeze({ sourceCategory: product.source?.sourceCategory || "" })
  });
}

function relatedScore(product, candidate) {
  let score = product.seriesId && product.seriesId === candidate.seriesId ? 40 : 0;
  if (product.brandId === candidate.brandId) score += 12;
  Object.entries(product.normalizedAttributes || {}).forEach(([key, value]) => {
    if (candidate.normalizedAttributes?.[key] === value) score += 5;
  });
  return score;
}

function priceDistance(product, candidate) {
  const left = product.pricing?.amount;
  const right = candidate.pricing?.amount;
  return Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left - right) : Number.POSITIVE_INFINITY;
}

const normalizeText = value => String(value || "").toLocaleLowerCase("uk").replace(/[оo](?=\d)|(?<=\d)[оo]/gu, "0").replace(/\s+/g, " ").trim();

function searchScore(product, query, tokens, snapshot) {
  const sku = normalizeText(product.sku).replace(/\s+/g, "");
  const compact = query.replace(/\s+/g, "");
  const title = normalizeText(product.title);
  const model = normalizeText(product.model);
  const brand = normalizeText(snapshot.brands.find(item => item.id === product.brandId)?.name || product.brandId);
  const category = normalizeText(snapshot.categories.find(item => item.id === product.primaryCategoryId)?.title || product.primaryCategoryId);
  const haystack = normalizeText(`${title} ${model} ${brand} ${category} ${product.seriesId || ""} ${JSON.stringify(product.normalizedAttributes || {})}`);
  if (sku === compact) return 100000;
  if (model === query) return 90000;
  if (title === query) return 85000;
  if (!tokens.every(token => haystack.includes(token) || levenshteinWord(token, haystack))) return 0;
  return (sku.startsWith(compact) ? 18000 : 0) + (title.startsWith(query) ? 8000 : title.includes(query) ? 4200 : 0) + 1000;
}

function levenshteinWord(token, haystack) {
  if (token.length < 4) return false;
  const limit = token.length >= 8 ? 2 : 1;
  return haystack.split(/[^a-zа-яіїєґ0-9]+/iu).some(word => Math.abs(word.length - token.length) <= limit && levenshtein(token, word, limit) <= limit);
}

function levenshtein(left, right, limit) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(left[i - 1] !== right[j - 1]));
    if (Math.min(...current) > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

function emptySearch(version, query) {
  return Object.freeze({ version, query: String(query || ""), totalProducts: 0, products: Object.freeze([]), productHits: Object.freeze([]), categories: Object.freeze([]), brands: Object.freeze([]), series: Object.freeze([]) });
}
