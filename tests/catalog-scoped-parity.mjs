import assert from 'node:assert/strict';
import path from 'node:path';
import { LocalCatalogDataSource } from '../catalog/local-data-source.mjs';
import { SupabaseCatalogDataSource } from '../catalog/supabase-data-source.mjs';
import { createSofievkaSupabasePublicClient } from '../lib/supabase-client.mjs';
import {
  PROJECT_ROOT, loadCatalogRuntime, resolveLinkedProject, resolveProjectPublishableKey,
  sha256, stableStringify, writeJson,
} from '../scripts/catalog-db-utils.mjs';

const PROJECT_REF = process.argv.find(argument => argument.startsWith('--project-ref='))?.slice('--project-ref='.length)
  || 'wfxcklglujgramasdzyr';
const REPORT_PATH = path.join(PROJECT_ROOT, 'reports', `catalog-scoped-parity-v2-${PROJECT_REF}.json`);
const project = resolveLinkedProject(PROJECT_REF);
const runtime = loadCatalogRuntime();
const local = new LocalCatalogDataSource({ snapshotProvider: () => runtime.sofievkaCatalogSnapshot, publicOnly: true });
const publishableKey = resolveProjectPublishableKey(PROJECT_REF);
const client = createSofievkaSupabasePublicClient({ url: `https://${PROJECT_REF}.supabase.co`, publishableKey });
const remote = new SupabaseCatalogDataSource({ client, cacheTtlMs: 300_000 });
const requestMetrics = [];

async function remoteCall(operation, call) {
  const value = await call();
  requestMetrics.push({ operation, ...remote.lastMetrics });
  return value;
}

const bootstrapLocal = await local.loadBootstrap();
const bootstrapRemote = await remoteCall('bootstrap', () => remote.loadBootstrap());
assert.match(bootstrapRemote.version, /^[a-f0-9]{64}$/);
assert.equal(bootstrapRemote.totalProducts, bootstrapLocal.totalProducts);
for (const layer of ['categories', 'brands', 'attributeDefinitions', 'categoryCounts', 'brandCounts']) {
  assert.equal(sha256(stableStringify(bootstrapRemote[layer])), sha256(stableStringify(bootstrapLocal[layer])), `bootstrap ${layer} parity failed`);
}

const scopes = [
  'gas-boilers', 'solid-fuel-boilers', 'system-circulation-pumps', 'borehole-pumps',
  'sewage-pumps', 'reverse-osmosis', 'water-softening', 'smart-lighting', 'feed-grinders',
  'heating', 'water-supply', 'all',
];
const plp = {};
let criticalDiffs = 0;
for (const scopeCategory of scopes) {
  plp[scopeCategory] = {};
  for (const sort of ['default', 'price-asc', 'price-desc']) {
    const query = { scopeCategory, sort, pageSize: 24 };
    const [expected, actual] = await Promise.all([
      local.listProducts(query), remoteCall(`plp:${scopeCategory}:${sort}`, () => remote.listProducts(query)),
    ]);
    const expectedIds = expected.products.map(product => product.id);
    const actualIds = actual.products.map(product => product.id);
    const equal = expected.total === actual.total && stableStringify(expectedIds) === stableStringify(actualIds);
    if (!equal) criticalDiffs += 1;
    plp[scopeCategory][sort] = { total: actual.total, firstPageIds: actualIds, equal };
  }

  const [expectedFacets, actualFacets] = await Promise.all([
    local.loadFacets({ scopeCategory }),
    remoteCall(`facets:${scopeCategory}`, () => remote.loadFacets({ scopeCategory })),
  ]);
  const facetLayers = ['brandCounts', 'availabilityCounts', 'categoryCounts', 'technicalCounts', 'priceBounds'];
  const facetDiffs = facetLayers.filter(layer => stableStringify(expectedFacets[layer]) !== stableStringify(actualFacets[layer]));
  if (expectedFacets.total !== actualFacets.total || facetDiffs.length) criticalDiffs += 1;
  plp[scopeCategory].facets = { total: actualFacets.total, facetDiffs };

  const selectedBrand = Object.keys(expectedFacets.brandCounts)[0];
  if (selectedBrand) {
    const filterQuery = { scopeCategory, brandIds: [selectedBrand] };
    const [expectedFiltered, actualFiltered, expectedFilteredFacets, actualFilteredFacets] = await Promise.all([
      local.listProducts(filterQuery), remoteCall(`plp-filter:${scopeCategory}`, () => remote.listProducts(filterQuery)),
      local.loadFacets(filterQuery), remoteCall(`facets-filter:${scopeCategory}`, () => remote.loadFacets(filterQuery)),
    ]);
    const selfExclusionEqual = stableStringify(expectedFilteredFacets.brandCounts) === stableStringify(actualFilteredFacets.brandCounts);
    const productsEqual = expectedFiltered.total === actualFiltered.total
      && stableStringify(expectedFiltered.products.map(item => item.id)) === stableStringify(actualFiltered.products.map(item => item.id));
    if (!selfExclusionEqual || !productsEqual) criticalDiffs += 1;
    plp[scopeCategory].brandFilter = { selectedBrand, total: actualFiltered.total, selfExclusionEqual, productsEqual };
  }
}

const snapshot = await local.loadCatalogSnapshot();
const pdpIds = [];
const addPdp = product => { if (product && !pdpIds.includes(product.id)) pdpIds.push(product.id); };
for (const scope of scopes.slice(0, 9)) addPdp(snapshot.products.find(product => product.primaryCategoryId === scope));
addPdp(snapshot.products.find(product => product.pricing.amount === null));
addPdp(snapshot.products.find(product => product.inventory.status === 'discontinued'));
addPdp(snapshot.products.find(product => product.images.length > 4));
addPdp(snapshot.products.find(product => product.documents.length > 0));
addPdp(snapshot.products.find(product => product.unmappedAttributes.length > 20));
for (let index = 0; pdpIds.length < 36 && index < snapshot.products.length; index += Math.max(1, Math.floor(snapshot.products.length / 40))) addPdp(snapshot.products[index]);
assert.ok(pdpIds.length >= 30);
const pdp = [];
for (const id of pdpIds) {
  const [expected, actual] = await Promise.all([local.getProductById(id), remoteCall(`pdp:${id}`, () => remote.getProductById(id))]);
  const productEqual = stableStringify(expected.product) === stableStringify(actual.product);
  const expectedRelated = expected.relatedProducts.map(product => product.id);
  const actualRelated = actual.relatedProducts.map(product => product.id);
  const relatedEqual = stableStringify(expectedRelated) === stableStringify(actualRelated);
  if (!productEqual) criticalDiffs += 1;
  pdp.push({ id, productEqual, relatedEqual, expectedRelated, actualRelated });
}

const regressionQueries = [
  'MO550MECOSTD', 'Termojet', 'Ecosoft', 'зворотний осмос', 'Termojet насос',
  '4248082', 'Wilo Stratos MAXO', '93013252', 'Grundfos ALPHA3', 'мембранний бак Grundfos',
  'Grundfos PM 1', '1000116', 'TEKK HAUS ECS', 'кормоподрібнювач TEKK HAUS',
  'L-5s', 'TECH Sinum', 'кімнатний термостат TECH', 'Altep Classic Plus',
  'FENIKS Серія C 12 кВт', 'FOCUS пелетний котел 120 кВт', 'BAXI DUO-TEC Compact E 24',
  '7736901204', 'Buderus Logalux', 'циркуляцыйний насос', 'power 0.37 кВт',
];
const exactCases = snapshot.products.slice(0, 10).flatMap(product => [
  { query: product.sku, expectedId: product.id, type: 'sku' },
  { query: product.model, expectedId: product.id, type: 'model' },
]);
const search = [];
for (const test of [...regressionQueries.map(query => ({ query, type: 'regression' })), ...exactCases]) {
  const legacy = runtime.sofievkaCatalogSearch.search(test.query, { productLimit: 30, categoryLimit: 8, brandLimit: 8, seriesLimit: 8 });
  const actual = await remoteCall(`search:${test.query}`, () => remote.search(test.query, { productLimit: 30, categoryLimit: 8, brandLimit: 8, seriesLimit: 8 }));
  const actualIds = actual.products.map(product => product.id);
  const expectedIds = legacy.products.map(product => product.id);
  const critical = Boolean(test.expectedId) && !actualIds.includes(test.expectedId);
  if (critical) criticalDiffs += 1;
  search.push({ query: test.query, type: test.type, expectedId: test.expectedId || null, critical, legacyTop: expectedIds.slice(0, 10), serverTop: actualIds.slice(0, 10), rankingEqual: stableStringify(expectedIds) === stableStringify(actualIds) });
}

const collections = [];
for (const metadata of bootstrapRemote.collections || []) {
  const result = await remoteCall(`collection:${metadata.id}`, () => remote.getCollection(metadata.id));
  assert.ok(result && result.collection?.id === metadata.id);
  assert.equal(result.products.length, metadata.count);
  collections.push({ id: metadata.id, count: result.products.length });
}

const hidden = await remoteCall('pdp:hidden', () => remote.getProductById('grundfos-98377171'));
assert.equal(hidden, null, 'hidden product leaked through PDP');
const headers = { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` };
const [cardsTable, sourceTable, finalize] = await Promise.all([
  fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/catalog_product_cards?select=legacy_id&limit=1`, { headers }),
  fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/product_source_records?select=raw_payload&limit=1`, { headers }),
  fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/rpc/finalize_catalog_snapshot`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }),
]);
for (const response of [cardsTable, sourceTable, finalize]) assert.ok([401, 403, 404].includes(response.status));
const forbiddenPattern = /raw_payload|payload_checksum|mapping_notes|error_summary|internal_id|service_role|sb_secret_/i;
assert.doesNotMatch(JSON.stringify({ bootstrapRemote, plp, pdp, search, collections }), forbiddenPattern);

const relatedDifferences = pdp.filter(item => !item.relatedEqual);
const rankingDifferences = search.filter(item => !item.rankingEqual);
const report = {
  reportVersion: 'catalog-scoped-parity-v2',
  status: criticalDiffs === 0 ? 'ok' : 'failed',
  project: { name: project.name, ref: project.ref, status: project.status },
  version: bootstrapRemote.version,
  bootstrap: { bytes: requestMetrics.find(metric => metric.operation === 'bootstrap')?.responseBytes, totalProducts: bootstrapRemote.totalProducts, categories: bootstrapRemote.categories.length, brands: bootstrapRemote.brands.length, attributes: Object.keys(bootstrapRemote.attributeDefinitions).length },
  plp,
  pdp: { cases: pdp.length, productPayloadDiffs: pdp.filter(item => !item.productEqual), relatedDifferences },
  search: { cases: search.length, criticalDiffs: search.filter(item => item.critical), rankingDifferences },
  collections,
  security: { hiddenPdp: hidden, privateCardsStatus: cardsTable.status, sourceRecordsStatus: sourceTable.status, anonFinalizeStatus: finalize.status, forbiddenLeaks: 0 },
  performance: { requestMetrics },
  criticalDiffs,
};
writeJson(REPORT_PATH, report);
console.log(JSON.stringify({ status: report.status, reportPath: REPORT_PATH, criticalDiffs, plpScopes: scopes.length, pdpCases: pdp.length, relatedDifferences: relatedDifferences.length, searchCases: search.length, searchCriticalDiffs: report.search.criticalDiffs.length, rankingDifferences: rankingDifferences.length, collections }, null, 2));
if (criticalDiffs) throw new Error(`Scoped parity has ${criticalDiffs} critical differences.`);
