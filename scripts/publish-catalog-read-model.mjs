import path from 'node:path';
import {
  PROJECT_ROOT,
  SupabaseRestClient,
  buildSnapshotBaseline,
  cloneJson,
  loadCatalogRuntime,
  loadHomepageCollections,
  readCategoryReview,
  resolveLinkedProject,
  resolveMigrationHistory,
  resolveProjectApiKeys,
  sha256,
  stableStringify,
  sortedLinesHash,
  writeJson,
} from './catalog-db-utils.mjs';

const APPROVED_PROJECT_REFS = new Set(['wfxcklglujgramasdzyr', 'fkjarsouuchjiedrrblc']);
const EXPECTED_MIGRATIONS = [
  '20260928000100',
  '20260928000200',
  '20260928000300',
  '20260928000400',
  '20260928000500',
  '20260929000100',
  '20260929000200',
  '20260929000300',
  '20260929000400',
  '20260929000500',
  '20260929000600',
  '20260929000700',
  '20260929000800',
  '20260929000900',
  '20260929001000',
];

const argumentsMap = new Map(process.argv.slice(2).map(argument => {
  const [key, ...parts] = argument.split('=');
  return [key, parts.join('=')];
}));
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--verify') ? 'verify' : 'dry-run';
const projectRef = argumentsMap.get('--project-ref') || '';
const reportDir = path.resolve(PROJECT_ROOT, argumentsMap.get('--report-dir') || 'reports');
if (!APPROVED_PROJECT_REFS.has(projectRef)) throw new Error(`Refusing unapproved project ${projectRef || '(missing)'}.`);

const project = resolveLinkedProject(projectRef);
const migrationHistory = resolveMigrationHistory();
const remoteVersions = migrationHistory.pairs.map(pair => pair.remote);
if (remoteVersions.join(',') !== EXPECTED_MIGRATIONS.join(',')) {
  throw new Error(`Read-model migration history mismatch: ${remoteVersions.join(',')}.`);
}

const keys = resolveProjectApiKeys(projectRef);
const serviceClient = new SupabaseRestClient({ projectRef, apiKey: keys.serviceRoleKey });
const publicClient = new SupabaseRestClient({ projectRef, apiKey: keys.publishableKey });
const state = loadCatalogRuntime();
const snapshot = state.sofievkaCatalogSnapshot;
const baseline = buildSnapshotBaseline({
  state,
  homepage: loadHomepageCollections(),
  categoryReview: readCategoryReview(),
});
const snapshotVersion = sha256(stableStringify(snapshot));
const remoteProducts = await serviceClient.fetchAll('products', { select: 'legacy_id,publication_status' });
const remoteIdHash = sortedLinesHash(remoteProducts.map(product => product.legacy_id));
const remotePublished = remoteProducts.filter(product => product.publication_status === 'published').length;
const remoteHidden = remoteProducts.filter(product => product.publication_status === 'hidden').length;
if (remoteProducts.length !== 3215 || remotePublished !== 3214 || remoteHidden !== 1 || remoteIdHash !== baseline.productIdHash) {
  throw new Error(`Catalogue preflight failed: products=${remoteProducts.length}, published=${remotePublished}, hidden=${remoteHidden}, hash=${remoteIdHash}.`);
}

const now = new Date().toISOString();
const release = {
  snapshot_version: snapshotVersion,
  contract_version: snapshot.version,
  categories: cloneJson(snapshot.categories),
  brands: cloneJson(snapshot.brands),
  attribute_definitions: cloneJson(snapshot.attributeDefinitions),
  product_count: snapshot.products.length,
  public_product_count: snapshot.products.filter(product => product.publicationStatus === 'published').length,
  product_id_hash: baseline.productIdHash,
  ready: false,
  updated_at: now,
};
const productSnapshots = snapshot.products.map((product, sortOrder) => ({
  snapshot_version: snapshotVersion,
  legacy_id: product.id,
  sort_order: sortOrder,
  payload: cloneJson(product),
  updated_at: now,
}));

const preflight = {
  reportVersion: 'catalog-public-read-model-preflight-v1',
  mode,
  project: { name: project.name, ref: project.ref, region: project.region, status: project.status },
  migrationVersions: remoteVersions,
  remoteProducts: remoteProducts.length,
  remotePublished,
  remoteHidden,
  snapshotVersion,
  productIdHash: baseline.productIdHash,
  readModelRows: productSnapshots.length,
  estimatedPayloadBytes: Buffer.byteLength(JSON.stringify({
    version: snapshotVersion,
    products: snapshot.products.filter(product => product.publicationStatus === 'published'),
    categories: snapshot.categories,
    brands: snapshot.brands,
    attributeDefinitions: snapshot.attributeDefinitions,
  })),
};
writeJson(path.join(reportDir, 'catalog-read-model-preflight.json'), preflight);
console.log(JSON.stringify(preflight, null, 2));
if (mode === 'dry-run') process.exit(0);

if (mode === 'apply') {
  await serviceClient.upsert('catalog_snapshot_releases', [release], { onConflict: 'snapshot_version' });
  await serviceClient.upsert('catalog_product_snapshots', productSnapshots, {
    onConflict: 'snapshot_version,legacy_id',
    batchSize: 150,
    maxBytes: 1_500_000,
    onProgress: ({ completed, total, batch, batches }) => {
      if (batch === 1 || batch === batches || batch % 10 === 0) console.log(`[catalog_product_snapshots] ${completed}/${total}`);
    },
  });
  const finalized = await serviceClient.request('/rest/v1/rpc/finalize_catalog_snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ target_snapshot_version: snapshotVersion }),
  });
  if (finalized.payload !== 3214) throw new Error(`Snapshot finalization returned ${JSON.stringify(finalized.payload)} instead of 3214.`);
  await serviceClient.upsert('catalog_snapshot_pointer', [{
    singleton: true,
    snapshot_version: snapshotVersion,
    updated_at: new Date().toISOString(),
  }], { onConflict: 'singleton' });
}

const scopedMetrics = [];
async function verifyPublicRpc(name, body = {}) {
  const startedAt = performance.now();
  const { response, payload } = await publicClient.request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  scopedMetrics.push({
    rpc: name,
    durationMs: performance.now() - startedAt,
    responseBytes: Buffer.byteLength(JSON.stringify(payload)),
    compressedContentLength: Number(response.headers.get('content-length')) || null,
  });
  return payload;
}

const representativeProduct = snapshot.products.find(product => product.publicationStatus === 'published' && product.sku);
const hiddenProduct = snapshot.products.find(product => product.publicationStatus !== 'published');
if (!representativeProduct || !hiddenProduct) throw new Error('Canonical snapshot is missing public/hidden verification fixtures.');

const bootstrap = await verifyPublicRpc('get_catalog_bootstrap');
const productPage = await verifyPublicRpc('get_catalog_products', { page_number: 1, page_size: 24 });
const facets = await verifyPublicRpc('get_catalog_facets');
const product = await verifyPublicRpc('get_catalog_product', { legacy_id: representativeProduct.id });
const search = await verifyPublicRpc('search_catalog', {
  query_text: representativeProduct.sku,
  product_limit: 12,
  category_limit: 6,
  brand_limit: 6,
  series_limit: 6,
});
const hidden = await verifyPublicRpc('get_catalog_product', { legacy_id: hiddenProduct.id });
const collection = snapshot.collections?.[0]
  ? await verifyPublicRpc('get_catalog_collection', { collection_id: snapshot.collections[0].id })
  : null;

if (bootstrap?.totalProducts !== 3214 || productPage?.total !== 3214 || facets?.total !== 3214) {
  throw new Error(`Scoped public counts failed: bootstrap=${bootstrap?.totalProducts}, products=${productPage?.total}, facets=${facets?.total}.`);
}
if (product?.product?.id !== representativeProduct.id) throw new Error('Scoped PDP verification failed.');
if (!search?.products?.some(item => item.id === representativeProduct.id)) throw new Error('Scoped exact-SKU search verification failed.');
if (hidden !== null) throw new Error(`Hidden product leaked through scoped PDP: ${hiddenProduct.id}.`);
if (collection && collection.collection?.id !== snapshot.collections[0].id) throw new Error('Scoped collection verification failed.');

const report = {
  reportVersion: 'catalog-public-scoped-read-model-verify-v2',
  status: 'ok',
  project: preflight.project,
  catalogVersion: bootstrap.version,
  products: productPage.total,
  categories: bootstrap.categories.length,
  brands: bootstrap.brands.length,
  attributes: Object.keys(bootstrap.attributeDefinitions).length,
  canonicalProductIdHash: baseline.productIdHash,
  representativeProduct: representativeProduct.id,
  searchResults: search.products.length,
  collection: collection?.collection?.id || null,
  hiddenLeaks: [],
  requestCount: scopedMetrics.length,
  maximumResponseBytes: Math.max(...scopedMetrics.map(metric => metric.responseBytes)),
  durationMs: scopedMetrics.reduce((sum, metric) => sum + metric.durationMs, 0),
  scopedMetrics,
  fullSnapshotRequested: false,
};
writeJson(path.join(reportDir, 'catalog-read-model-publish.json'), report);
console.log(JSON.stringify(report, null, 2));
