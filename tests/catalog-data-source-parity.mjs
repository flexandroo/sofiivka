import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { LocalCatalogDataSource } from '../catalog/local-data-source.mjs';
import { SupabaseCatalogDataSource } from '../catalog/supabase-data-source.mjs';
import { createSofievkaSupabasePublicClient } from '../lib/supabase-client.mjs';
import {
  PROJECT_ROOT,
  loadCatalogRuntime,
  resolveLinkedDevProject,
  resolveProjectPublishableKey,
  sha256,
  sortedLinesHash,
  stableStringify,
  writeJson,
} from '../scripts/catalog-db-utils.mjs';

const PROJECT_REF = 'wfxcklglujgramasdzyr';
const reportPath = path.join(PROJECT_ROOT, 'reports', 'catalog-data-source-parity.json');
const project = resolveLinkedDevProject(PROJECT_REF);
assert.equal(project.name, 'sofievka');

const runtime = loadCatalogRuntime();
const localFullProductCount = runtime.sofievkaCatalogSnapshot.products.length;
const localSource = new LocalCatalogDataSource({
  snapshotProvider: () => runtime.sofievkaCatalogSnapshot,
  publicOnly: true,
});
const localSnapshot = await localSource.loadCatalogSnapshot();
const publishableKey = resolveProjectPublishableKey(PROJECT_REF);
const publicClient = createSofievkaSupabasePublicClient({
  url: `https://${PROJECT_REF}.supabase.co`,
  publishableKey,
});
const supabaseSource = new SupabaseCatalogDataSource({ client: publicClient, cacheTtlMs: 300_000 });

globalThis.gc?.();
const heapBefore = process.memoryUsage().heapUsed;
const supabaseSnapshot = await supabaseSource.loadCatalogSnapshot();
globalThis.gc?.();
const heapAfter = process.memoryUsage().heapUsed;

const canonicalLayers = ['products', 'categories', 'brands', 'attributeDefinitions'];
const canonicalHashes = {};
for (const layer of canonicalLayers) {
  const localHash = sha256(stableStringify(localSnapshot[layer]));
  const supabaseHash = sha256(stableStringify(supabaseSnapshot[layer]));
  assert.equal(supabaseHash, localHash, `${layer} canonical parity failed`);
  canonicalHashes[layer] = localHash;
}
assert.equal(localSnapshot.products.length, 3214);
assert.equal(supabaseSnapshot.products.length, 3214);
assert.equal(localSnapshot.categories.length, 87);
assert.equal(localSnapshot.brands.length, 36);
assert.equal(Object.keys(localSnapshot.attributeDefinitions).length, 64);

const hiddenId = 'grundfos-98377171';
assert.ok(!supabaseSnapshot.products.some(product => product.id === hiddenId), 'hidden product leaked into public snapshot');
const forbiddenKeys = new Set([
  'internal_id', 'internalId', 'raw_payload', 'rawPayload', 'payload_checksum',
  'mapping_notes', 'error_summary', 'import_run_id', 'created_by', 'updated_by'
]);
const forbiddenFound = [];
const inspect = (value, trail = '$') => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach((item, index) => inspect(item, `${trail}[${index}]`));
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) forbiddenFound.push(`${trail}.${key}`);
    inspect(item, `${trail}.${key}`);
  }
};
inspect(supabaseSnapshot);
assert.deepEqual(forbiddenFound, [], 'private DB/import keys leaked into public snapshot');
assert.doesNotMatch(JSON.stringify(supabaseSnapshot), /sb_secret_|service_role/i, 'privileged credentials leaked into snapshot');

const localPublicProducts = localSnapshot.products;
const adapterFactory = runtime.sofievkaProductLegacyAdapter.createLegacyAdapter;
const localLegacy = adapterFactory({
  taxonomy: runtime.sofievkaTaxonomy,
  brands: localSnapshot.brands,
  rawCatalog: runtime.sofievkaRawSupplierCatalog,
}).adaptProducts(localPublicProducts, { useRawCatalog: true });
const supabaseLegacy = adapterFactory({
  taxonomy: runtime.sofievkaTaxonomy,
  brands: supabaseSnapshot.brands,
  rawCatalog: null,
}).adaptProducts(supabaseSnapshot.products, { useRawCatalog: false });

const legacyUiProjection = product => ({
  id: product.id, slug: product.slug, sku: product.sku, title: product.title,
  shortTitle: product.shortTitle, model: product.model, brandId: product.brandId,
  brand: product.brand, primaryCategoryId: product.primaryCategoryId,
  primaryCategory: product.primaryCategory, primaryCategoryName: product.primaryCategoryName,
  category: product.category, categoryGroup: product.categoryGroup, sectionId: product.sectionId,
  price: product.price, oldPrice: product.oldPrice ?? null, currency: product.currency,
  availability: product.availability, availabilityLabel: product.availabilityLabel,
  image: product.image, images: product.images, documents: product.documents,
  pricing: product.pricing, inventory: product.inventory, publicationStatus: product.publicationStatus,
  normalizedAttributes: product.normalizedAttributes, catalogAttributes: product.catalogAttributes,
  sourceAttributes: product.sourceAttributes, unmappedAttributes: product.unmappedAttributes,
  description: product.description, shortDescription: product.shortDescription,
  fullDescription: product.fullDescription, descriptionSections: product.descriptionSections,
  tags: product.tags, collections: product.collections, badges: product.badges, source: product.source,
  seo: product.seo, compareType: product.compareType,
});
assert.equal(
  sha256(stableStringify(localLegacy.map(legacyUiProjection))),
  sha256(stableStringify(supabaseLegacy.map(legacyUiProjection))),
  'LegacyAdapter UI projection parity failed'
);

const requiredCategories = [
  'gas-boilers', 'borehole-pumps', 'reverse-osmosis', 'smart-lighting', 'feed-grinders',
  'circulation-pumps', 'mainline-cartridges', 'automation'
];
const searchQueries = [
  'MO550MECOSTD', 'Termojet', 'Ecosoft', 'зворотний осмос', 'Termojet насос',
  '4248082', 'Wilo Stratos MAXO', '93013252', 'Grundfos ALPHA3', 'мембранний бак Grundfos',
  'Grundfos PM 1', '1000116', 'TEKK HAUS ECS', 'кормоподрібнювач TEKK HAUS',
  'L-5s', 'TECH Sinum', 'кімнатний термостат TECH', 'Altep Classic Plus',
  'FENIKS Серія C 12 кВт', 'FOCUS пелетний котел 120 кВт', 'BAXI DUO-TEC Compact E 24',
  '7736901204', 'Buderus Logalux', 'циркуляцыйний насос', 'power 0.37 кВт'
];

function facetSignature(catalog, products, categoryId) {
  const category = catalog.categoryById[categoryId];
  const counts = key => Object.fromEntries([...products.reduce((map, product) => {
    const value = key === 'brand' ? product.brandId
      : key === 'availability' ? product.availability
      : catalog.filterValue(catalog.attributeDefinitions[key], product.normalizedAttributes?.[key]);
    if (value !== undefined && value !== null && value !== '') map.set(String(value), (map.get(String(value)) || 0) + 1);
    return map;
  }, new Map())].sort(([left], [right]) => left.localeCompare(right, 'uk', { numeric: true })));
  const technical = (category?.facetIds || [])
    .filter(id => catalog.attributeDefinitions[id]?.filterable)
    .filter(id => new Set(products.map(product => product.normalizedAttributes?.[id]).filter(value => value !== undefined && value !== null && value !== '')).size >= 2)
    .slice(0, 9);
  return {
    brand: counts('brand'),
    availability: counts('availability'),
    technical: Object.fromEntries(technical.map(id => [id, counts(id)])),
  };
}

function choosePdpProducts(catalog) {
  const chosen = [];
  const add = product => { if (product && !chosen.includes(product.id)) chosen.push(product.id); };
  requiredCategories.forEach(categoryId => add(catalog.productsForCategory(categoryId)[0]));
  const products = catalog.catalogProducts;
  add(products.find(product => product.pricing.amount === null));
  add(products.find(product => product.inventory.status === 'discontinued'));
  add(products.find(product => product.images.length > 1));
  add(products.find(product => product.documents.length > 0));
  add(products.find(product => product.unmappedAttributes.length > 10));
  add(products.find(product => product.sourceAttributes.length > 20));
  for (const brandId of [...new Set(products.map(product => product.brandId))]) add(products.find(product => product.brandId === brandId));
  const stride = Math.max(1, Math.floor(products.length / 24));
  for (let index = 0; chosen.length < 20 && index < products.length; index += stride) add(products[index]);
  return chosen.slice(0, 20);
}

function uiSignature(state) {
  const catalog = state.sofievkaCatalog;
  const pdp = state.sofievkaPdp;
  const search = state.sofievkaCatalogSearch;
  const categoryCounts = catalog.categories
    .map(category => [category.id, catalog.productsForCategory(category.id).length])
    .sort((left, right) => right[1] - left[1]);
  const categoryIds = [...new Set([...requiredCategories, ...categoryCounts.slice(0, 5).map(([id]) => id)])];
  const plp = Object.fromEntries(categoryIds.map(categoryId => {
    const products = catalog.productsForCategory(categoryId);
    return [categoryId, {
      count: products.length,
      firstItems: products.slice(0, 12).map(product => product.id),
      priceAsc: [...products].sort((a, b) => catalog.compareProductsByPrice(a, b, 'asc')).slice(0, 12).map(product => product.id),
      priceDesc: [...products].sort((a, b) => catalog.compareProductsByPrice(a, b, 'desc')).slice(0, 12).map(product => product.id),
      facets: facetSignature(catalog, products, categoryId),
    }];
  }));
  const pdpIds = choosePdpProducts(catalog);
  const pdpState = Object.fromEntries(pdpIds.map(id => {
    const product = catalog.catalogProducts.find(item => item.id === id);
    return [id, {
      keySpecs: pdp.keySpecs(product), specificationGroups: pdp.specificationGroups(product),
      images: pdp.images(product), documents: pdp.documents(product), model: pdp.model(product),
      purchase: pdp.purchase(product), related: pdp.relatedProducts(product).map(item => item.id),
      brand: pdp.brand(product)?.id || null, installationRelevant: pdp.installationRelevant(product),
    }];
  }));
  const searchState = Object.fromEntries(searchQueries.map(query => {
    const result = search.search(query, { productLimit: 30, categoryLimit: 8, brandLimit: 8, seriesLimit: 8 });
    return [query, {
      totalProducts: result.totalProducts,
      products: result.products.map(product => product.id),
      categories: result.categories.map(item => item.entity.id),
      brands: result.brands.map(item => item.entity.id),
      series: result.series.map(item => item.entity.id),
    }];
  }));
  const routes = {
    root: catalog.sectionUrl('all'),
    sections: Object.fromEntries(catalog.sections.map(section => [section.id, catalog.sectionUrl(section.id)])),
    categories: Object.fromEntries(catalog.categories.map(category => [category.id, catalog.categoryUrl(category.id)])),
    brands: Object.fromEntries(catalog.brands.map(brand => [brand.id, catalog.brandUrl(brand.id)])),
    products: catalog.catalogProducts.slice(0, 30).map(product => `/product?id=${encodeURIComponent(product.id)}`),
    search: '/search?q=насос',
    filtered: `${catalog.categoryUrl('borehole-pumps')}?brand=grundfos&availability=in_stock&sort=price-asc`,
  };
  return { plp, pdpIds, pdp: pdpState, search: searchState, routes };
}

const localUi = uiSignature(runtime);
runtime.sofievkaInstallCatalogSnapshot(supabaseSnapshot, { useRawCatalog: false });
runtime.sofievkaInstallPdp();
runtime.sofievkaInstallCatalogSearch();
const supabaseUi = uiSignature(runtime);
for (const layer of ['plp', 'pdp', 'search', 'routes']) {
  const actualHash = sha256(stableStringify(supabaseUi[layer]));
  const expectedHash = sha256(stableStringify(localUi[layer]));
  if (layer === 'pdp' && actualHash !== expectedHash) {
    const differences = [];
    for (const id of [...new Set([...Object.keys(localUi.pdp), ...Object.keys(supabaseUi.pdp)])]) {
      const localProduct = localUi.pdp[id];
      const remoteProduct = supabaseUi.pdp[id];
      for (const field of [...new Set([...Object.keys(localProduct || {}), ...Object.keys(remoteProduct || {})])]) {
        if (stableStringify(localProduct?.[field]) !== stableStringify(remoteProduct?.[field])) differences.push({ id, field });
      }
    }
    console.error(JSON.stringify({ pdpDifferences: differences }, null, 2));
  }
  assert.equal(actualHash, expectedHash, `${layer} UI parity failed`);
}
assert.equal(localUi.pdpIds.length, 20, 'PDP parity set must contain 20 representative products');

const directHeaders = { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` };
const [privateTableResponse, finalizeResponse] = await Promise.all([
  fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/catalog_product_snapshots?select=legacy_id&limit=1`, { headers: directHeaders }),
  fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/rpc/finalize_catalog_snapshot`, {
    method: 'POST', headers: { ...directHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_snapshot_version: supabaseSnapshot.version }),
  }),
]);
assert.ok([401, 403, 404].includes(privateTableResponse.status), `anon read-model table status=${privateTableResponse.status}`);
assert.ok([401, 403, 404].includes(finalizeResponse.status), `anon finalize RPC status=${finalizeResponse.status}`);

const serialized = JSON.stringify(supabaseSnapshot);
const compressedBytes = zlib.gzipSync(serialized, { level: 6 }).byteLength;
const sourceMetrics = supabaseSource.lastMetrics;
const cachedSnapshot = await supabaseSource.loadCatalogSnapshot();
assert.equal(cachedSnapshot, supabaseSnapshot, 'in-memory source cache must reuse the snapshot object');
assert.equal(supabaseSource.lastMetrics.requestCount, 0, 'cache hit must not issue a second request');

const report = {
  reportVersion: 'catalog-data-source-parity-v1',
  status: 'ok',
  project: { name: project.name, ref: project.ref, status: project.status },
  dataSources: ['LocalCatalogDataSource', 'SupabaseCatalogDataSource'],
  snapshot: {
    version: supabaseSnapshot.version,
    localCanonicalProducts: localFullProductCount,
    publicProducts: supabaseSnapshot.products.length,
    publicProductIdHash: sortedLinesHash(supabaseSnapshot.products.map(product => product.id)),
    fullLegacyProductIdHash: '215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733',
    categories: supabaseSnapshot.categories.length,
    brands: supabaseSnapshot.brands.length,
    attributes: Object.keys(supabaseSnapshot.attributeDefinitions).length,
    canonicalHashes,
    criticalDiffs: 0,
  },
  legacyAdapter: { productsCompared: localLegacy.length, criticalDiffs: 0 },
  uiParity: {
    plpCategories: Object.keys(localUi.plp),
    pdpProducts: localUi.pdpIds,
    searchCases: searchQueries.length,
    filterParity: 'covered by PLP facet/value/count signatures',
    routeParity: 'green',
    criticalDiffs: 0,
  },
  security: {
    hiddenLeaks: 0,
    forbiddenKeyLeaks: forbiddenFound.length,
    directReadModelTableStatus: privateTableResponse.status,
    anonFinalizeStatus: finalizeResponse.status,
    privilegedCredentialLeaks: 0,
  },
  performance: {
    requestCount: sourceMetrics.requestCount,
    uncompressedBytes: sourceMetrics.snapshotBytes,
    gzipBytes: compressedBytes,
    headersMs: sourceMetrics.headersMs,
    bodyReadMs: sourceMetrics.bodyReadMs,
    jsonParseMs: sourceMetrics.parseMs,
    totalLoadMs: sourceMetrics.durationMs,
    adapterAssemblyMs: sourceMetrics.assemblyMs,
    measuredNodeHeapDeltaBytes: Math.max(0, heapAfter - heapBefore),
    cacheHitRequestCount: supabaseSource.lastMetrics.requestCount,
  },
};
writeJson(reportPath, report);
console.log(JSON.stringify(report, null, 2));
