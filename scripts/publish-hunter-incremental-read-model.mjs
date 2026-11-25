import path from 'node:path';
import {
  PROJECT_ROOT,
  SupabaseRestClient,
  cloneJson,
  loadCatalogRuntime,
  resolveLinkedProject,
  resolveProjectApiKeys,
  sha256,
  sortedLinesHash,
  stableStringify,
  writeJson,
} from './catalog-db-utils.mjs';

const argumentsMap = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...parts] = argument.split('=');
  return [key, parts.join('=')];
}));
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const projectRef = argumentsMap.get('--project-ref') || '';
const reportDir = path.resolve(PROJECT_ROOT, argumentsMap.get('--report-dir') || 'reports');
if (projectRef !== 'fkjarsouuchjiedrrblc') throw new Error('This incremental publisher is restricted to the approved production project.');

const project = resolveLinkedProject(projectRef);
const keys = resolveProjectApiKeys(projectRef);
const service = new SupabaseRestClient({ projectRef, apiKey: keys.serviceRoleKey });
const publicClient = new SupabaseRestClient({ projectRef, apiKey: keys.publishableKey });
const state = loadCatalogRuntime();
const hunterProducts = state.sofievkaCatalogSnapshot.products.filter((product) => product.brandId === 'hunter');
if (hunterProducts.length !== 962 || !hunterProducts.every((product) => product.publicationStatus === 'published' && product.images.length)) {
  throw new Error(`Expected 962 published Hunter articles with photos, received ${hunterProducts.length}.`);
}

const [pointer] = await service.fetchAll('catalog_snapshot_pointer', { select: 'snapshot_version' });
if (!pointer?.snapshot_version) throw new Error('Production has no active catalog snapshot pointer.');
const [baseRelease] = await service.fetchAll('catalog_snapshot_releases', {
  select: 'snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready',
  query: { snapshot_version: `eq.${pointer.snapshot_version}` },
});
if (!baseRelease?.ready) throw new Error('The active production catalog release is not ready.');

const baseRows = await service.fetchAll('catalog_product_snapshots', {
  select: 'legacy_id,sort_order,payload',
  query: { snapshot_version: `eq.${pointer.snapshot_version}` },
  pageSize: 250,
});
baseRows.sort((left, right) => left.sort_order - right.sort_order);
if (baseRows.length !== baseRelease.product_count) {
  throw new Error(`Active release row mismatch: release=${baseRelease.product_count}, rows=${baseRows.length}.`);
}
const oldHunterRows = baseRows.filter((row) => row.payload?.brandId === 'hunter');
if (oldHunterRows.length !== 65 || !oldHunterRows.every((row) => row.legacy_id.startsWith('hunter-'))) {
  throw new Error(`Expected exactly 65 replaceable legacy Hunter family cards, received ${oldHunterRows.length}.`);
}
const nonHunterRows = baseRows.filter((row) => row.payload?.brandId !== 'hunter');
const nonHunterIds = new Set(nonHunterRows.map((row) => row.legacy_id));
const collision = hunterProducts.find((product) => nonHunterIds.has(product.id));
if (collision) throw new Error(`Hunter ID collides with another brand: ${collision.id}.`);

const irrigationCategoryIds = new Set(['irrigation']);
for (let level = 0; level < 3; level += 1) {
  for (const category of state.sofievkaCatalogSnapshot.categories) {
    if (irrigationCategoryIds.has(category.parentId)) irrigationCategoryIds.add(category.id);
  }
}
const irrigationCategories = state.sofievkaCatalogSnapshot.categories.filter((category) => irrigationCategoryIds.has(category.id));
if (irrigationCategories.length !== 17) throw new Error(`Expected 17 irrigation categories, received ${irrigationCategories.length}.`);
const hunterBrand = state.sofievkaCatalogSnapshot.brands.find((brand) => brand.id === 'hunter');
if (!hunterBrand) throw new Error('Hunter brand metadata is missing.');
const radiusDefinition = state.sofievkaCatalogSnapshot.attributeDefinitions.radiusM;
if (!radiusDefinition) throw new Error('radiusM attribute metadata is missing.');

const mergeById = (existing, additions) => {
  const result = existing.map(cloneJson);
  const ids = new Set(result.map((item) => item.id));
  for (const item of additions) if (!ids.has(item.id)) result.push(cloneJson(item));
  return result;
};
const categories = mergeById(baseRelease.categories, irrigationCategories);
const brands = mergeById(baseRelease.brands, [hunterBrand]);
const attributeDefinitions = {
  ...cloneJson(baseRelease.attribute_definitions),
  radiusM: cloneJson(radiusDefinition),
};

const mergedProducts = [
  ...nonHunterRows.map((row) => cloneJson(row.payload)),
  ...hunterProducts.map(cloneJson),
];
const snapshotVersion = sha256(stableStringify({
  baseSnapshotVersion: pointer.snapshot_version,
  hunterProducts: hunterProducts.map((product) => [product.id, product.images, product.shortDescription]),
  categories,
  brands,
  attributeDefinitions,
}));
const now = new Date().toISOString();
const productRows = mergedProducts.map((product, sortOrder) => ({
  snapshot_version: snapshotVersion,
  legacy_id: product.id,
  sort_order: sortOrder,
  payload: product,
  updated_at: now,
}));
const expectedPublicProducts = baseRelease.public_product_count - oldHunterRows.filter((row) => row.payload.publicationStatus === 'published').length + hunterProducts.length;
const release = {
  snapshot_version: snapshotVersion,
  contract_version: baseRelease.contract_version,
  categories,
  brands,
  attribute_definitions: attributeDefinitions,
  product_count: productRows.length,
  public_product_count: expectedPublicProducts,
  product_id_hash: sortedLinesHash(productRows.map((row) => row.legacy_id)),
  ready: false,
  updated_at: now,
};

const preflight = {
  reportVersion: 'hunter-sku-replacement-read-model-v2',
  mode,
  project: { ref: project.ref, name: project.name, environment: project.environment },
  baseSnapshotVersion: pointer.snapshot_version,
  targetSnapshotVersion: snapshotVersion,
  baseProducts: baseRows.length,
  replacedHunterFamilies: oldHunterRows.length,
  hunterProducts: hunterProducts.length,
  targetProducts: productRows.length,
  basePublicProducts: baseRelease.public_product_count,
  targetPublicProducts: expectedPublicProducts,
  categories: categories.length,
  brands: brands.length,
  attributes: Object.keys(attributeDefinitions).length,
};
writeJson(path.join(reportDir, 'hunter-incremental-read-model-preflight.json'), preflight);
console.log(JSON.stringify(preflight, null, 2));
if (mode === 'dry-run') process.exit(0);

await service.upsert('catalog_snapshot_releases', [release], { onConflict: 'snapshot_version' });
await service.upsert('catalog_product_snapshots', productRows, {
  onConflict: 'snapshot_version,legacy_id',
  batchSize: 150,
  maxBytes: 1_500_000,
  onProgress: ({ completed, total, batch, batches }) => {
    if (batch === 1 || batch === batches || batch % 10 === 0) console.log(`[catalog_product_snapshots] ${completed}/${total}`);
  },
});
const finalized = await service.request('/rest/v1/rpc/finalize_catalog_snapshot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ target_snapshot_version: snapshotVersion }),
});
if (finalized.payload !== expectedPublicProducts) {
  throw new Error(`Snapshot finalization returned ${JSON.stringify(finalized.payload)} instead of ${expectedPublicProducts}.`);
}
await service.upsert('catalog_snapshot_pointer', [{ singleton: true, snapshot_version: snapshotVersion, updated_at: new Date().toISOString() }], {
  onConflict: 'singleton',
});

const rpc = async (name, body) => (await publicClient.request(`/rest/v1/rpc/${name}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(body),
})).payload;
const bootstrap = await rpc('get_catalog_bootstrap', {});
const irrigation = await rpc('get_catalog_products', { scope_category: 'irrigation', page_size: 96 });
const pdp = await rpc('get_catalog_product', { legacy_id: 'hunter-pgp-04' });
if (bootstrap.totalProducts !== expectedPublicProducts || bootstrap.brandCounts?.hunter !== 962
    || bootstrap.categoryCounts?.irrigation !== 962 || irrigation.total !== 962
    || pdp?.product?.id !== 'hunter-pgp-04' || !pdp.product.images?.length) {
  throw new Error(`Public Hunter verification failed: total=${bootstrap.totalProducts}, brand=${bootstrap.brandCounts?.hunter}, irrigation=${irrigation.total}, pdp=${pdp?.product?.id}.`);
}

const report = {
  ...preflight,
  status: 'ok',
  publicTotalProducts: bootstrap.totalProducts,
  publicHunterProducts: bootstrap.brandCounts.hunter,
  publicIrrigationProducts: irrigation.total,
  publicPdp: pdp.product.id,
};
writeJson(path.join(reportDir, 'hunter-incremental-read-model-publish.json'), report);
console.log(JSON.stringify(report, null, 2));
