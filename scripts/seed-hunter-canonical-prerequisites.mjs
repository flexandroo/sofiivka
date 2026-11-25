import path from 'node:path';
import {
  PROJECT_ROOT,
  SupabaseRestClient,
  buildImportPlan,
  buildSnapshotBaseline,
  loadCatalogRuntime,
  loadCoreLookup,
  resolveLinkedProject,
  resolveProjectApiKeys,
  uuidFromKey,
  writeJson,
} from './catalog-db-utils.mjs';

const argumentsMap = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...parts] = argument.split('=');
  return [key, parts.join('=')];
}));
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const projectRef = argumentsMap.get('--project-ref') || '';
const reportDir = path.resolve(PROJECT_ROOT, argumentsMap.get('--report-dir') || 'reports');
if (projectRef !== 'fkjarsouuchjiedrrblc') throw new Error('This Hunter canonical seed is restricted to the approved production project.');

const project = resolveLinkedProject(projectRef);
const keys = resolveProjectApiKeys(projectRef);
const service = new SupabaseRestClient({ projectRef, apiKey: keys.serviceRoleKey });
const state = loadCatalogRuntime();
const hunterProducts = state.sofievkaCatalogSnapshot.products.filter((product) => product.brandId === 'hunter');
const hunterIds = new Set(hunterProducts.map((product) => product.id));
if (hunterProducts.length !== 962 || !hunterProducts.every((product) => product.images.length)) {
  throw new Error(`Expected 962 Hunter articles with images, received ${hunterProducts.length}.`);
}
const scopedState = {
  ...state,
  sofievkaCatalogSnapshot: { ...state.sofievkaCatalogSnapshot, products: hunterProducts },
  sofievkaRawSupplierProducts: state.sofievkaRawSupplierProducts.filter((product) => hunterIds.has(product.id)),
};
const homepage = { homepageProductIds: [], homepageSaleProductIds: [] };
const categoryReview = { items: [] };
const snapshotBaseline = buildSnapshotBaseline({ state: scopedState, homepage, categoryReview });
const core = await loadCoreLookup(service);
const [existingProducts, existingSeries, existingSuppliers, existingMedia] = await Promise.all([
  service.fetchAll('products', { select: 'internal_id,legacy_id,sku,slug' }),
  service.fetchAll('product_series', { select: 'internal_id,stable_id' }),
  service.fetchAll('suppliers', { select: 'internal_id,stable_id' }),
  service.fetchAll('product_media', { select: 'internal_id,product_id,role' }),
]);
const hunterBrand = core.brands.get('hunter');
if (!hunterBrand) throw new Error('Hunter is missing from the production brand registry.');

const irrigationCategoryIds = new Set(['irrigation']);
for (let level = 0; level < 3; level += 1) {
  for (const category of state.sofievkaCatalogSnapshot.categories) {
    if (irrigationCategoryIds.has(category.parentId)) irrigationCategoryIds.add(category.id);
  }
}
const missingCategories = state.sofievkaCatalogSnapshot.categories
  .filter((category) => irrigationCategoryIds.has(category.id) && !core.categories.has(category.id))
  .sort((left, right) => left.level - right.level);
const expectedNewCategories = new Set(['irrigation-water-delivery', 'irrigation-valves', 'irrigation-drip', 'irrigation-installation', 'irrigation-tools']);
if (missingCategories.some((category) => !expectedNewCategories.has(category.id))) {
  throw new Error(`Unexpected missing Hunter categories: ${missingCategories.map((category) => category.id)}.`);
}
const categoryRows = missingCategories.map((category) => {
  const parent = core.categories.get(category.parentId);
  if (!parent) throw new Error(`${category.id}: parent category is missing in production.`);
  const row = {
    internal_id: uuidFromKey(`category:${category.id}`),
    stable_id: category.id,
    slug: category.slug,
    parent_id: parent.internal_id,
    level: category.level,
    title: category.title,
    short_title: category.shortTitle || null,
    description: category.description || '',
    menu_description: category.menuDescription || '',
    sort_order: category.order || 0,
    status: category.status,
    visibility: category.visibility,
    seo_title: category.seo?.title || null,
    seo_description: category.seo?.description || null,
  };
  core.categories.set(row.stable_id, row);
  return row;
});

const usedAttributeIds = new Set(hunterProducts.flatMap((product) => (product.catalogAttributes ?? []).map((attribute) => attribute.id)));
const missingAttributes = [...usedAttributeIds].filter((id) => !core.attributes.has(id));
if (missingAttributes.some((id) => id !== 'radiusM')) {
  throw new Error(`Unexpected missing Hunter attributes: ${missingAttributes.join(', ') || 'none'}.`);
}
const radius = state.sofievkaCatalogSnapshot.attributeDefinitions.radiusM;
const attributeRow = {
  internal_id: uuidFromKey('attribute:radiusM'),
  stable_id: radius.id,
  label: radius.label,
  value_type: radius.type,
  unit: radius.unit || null,
  filterable: Boolean(radius.filterable),
  sortable: Boolean(radius.sortable),
  sort_order: Math.round(radius.rank || 0),
  aliases: [],
  normalization_config: { booleanValues: radius.booleanValues, legacyValues: radius.legacyValues },
  status: 'active',
};
if (missingAttributes.length) core.attributes.set(attributeRow.stable_id, attributeRow);

const importRunId = uuidFromKey(`import-run:hunter-canonical:${snapshotBaseline.snapshotHash}`);
const startedAt = new Date().toISOString();
const plan = buildImportPlan({ state: scopedState, homepage, categoryReview, core, importRunId, startedAt, snapshotBaseline });
const productById = new Map(existingProducts.map((row) => [row.legacy_id, row]));
const skuOwner = new Map(existingProducts.map((row) => [row.sku.toLowerCase(), row.legacy_id]));
const slugOwner = new Map(existingProducts.map((row) => [row.slug.toLowerCase(), row.legacy_id]));
for (const row of plan.productRows) {
  const existing = productById.get(row.legacy_id);
  if (existing && existing.internal_id !== row.internal_id) throw new Error(`${row.legacy_id}: existing product UUID differs from the deterministic import UUID.`);
  if (skuOwner.has(row.sku.toLowerCase()) && skuOwner.get(row.sku.toLowerCase()) !== row.legacy_id) throw new Error(`${row.legacy_id}: SKU collides with another product.`);
  if (slugOwner.has(row.slug.toLowerCase()) && slugOwner.get(row.slug.toLowerCase()) !== row.legacy_id) throw new Error(`${row.legacy_id}: slug collides with another product.`);
}
const seriesById = new Map(existingSeries.map((row) => [row.stable_id, row]));
const supplierById = new Map(existingSuppliers.map((row) => [row.stable_id, row]));
for (const row of plan.seriesRows) {
  const existing = seriesById.get(row.stable_id);
  if (existing && existing.internal_id !== row.internal_id) throw new Error(`${row.stable_id}: existing series UUID differs from the deterministic import UUID.`);
}
for (const row of plan.supplierRows) {
  const existing = supplierById.get(row.stable_id);
  if (existing && existing.internal_id !== row.internal_id) throw new Error(`${row.stable_id}: existing supplier UUID differs from the deterministic import UUID.`);
}
const newSuppliers = plan.supplierRows.filter((row) => !supplierById.has(row.stable_id));
const newSeries = plan.seriesRows.filter((row) => !seriesById.has(row.stable_id));
const existingPrimaryMedia = new Map(existingMedia.filter((row) => row.role === 'primary').map((row) => [row.product_id, row.internal_id]));
const mediaRows = plan.mediaRows.map((row) => ({
  ...row,
  internal_id: existingPrimaryMedia.get(row.product_id) || row.internal_id,
}));
const report = {
  reportVersion: 'hunter-canonical-prerequisites-v1',
  mode,
  project: { ref: project.ref, name: project.name, environment: project.environment },
  hunterProducts: plan.productRows.length,
  existingHunterProducts: plan.productRows.filter((row) => productById.has(row.legacy_id)).length,
  newHunterProducts: plan.productRows.filter((row) => !productById.has(row.legacy_id)).length,
  newCategories: categoryRows.map((row) => row.stable_id),
  newAttributes: missingAttributes,
  newSeries: newSeries.length,
  newSuppliers: newSuppliers.length,
  mediaRows: plan.mediaRows.length,
  updatedPrimaryMedia: plan.mediaRows.filter((row) => existingPrimaryMedia.has(row.product_id)).length,
  sourceRecords: plan.sourceRecordRows.length,
  attributeValues: plan.productAttributeRows.length,
};
writeJson(path.join(reportDir, 'hunter-canonical-prerequisites-preflight.json'), report);
console.log(JSON.stringify(report, null, 2));
if (mode === 'dry-run') process.exit(0);

for (const level of [...new Set(categoryRows.map((row) => row.level))]) {
  await service.insert('categories', categoryRows.filter((row) => row.level === level));
}
if (missingAttributes.length) await service.insert('attribute_definitions', [attributeRow]);
if (newSuppliers.length) await service.insert('suppliers', newSuppliers);
if (newSeries.length) await service.upsert('product_series', newSeries, { onConflict: 'stable_id', batchSize: 100 });
await service.upsert('import_runs', [plan.importRun], { onConflict: 'internal_id' });
await service.upsert('products', plan.productRows, {
  onConflict: 'legacy_id', batchSize: 100, maxBytes: 1_500_000,
  onProgress: ({ completed, total, batch, batches }) => {
    if (batch === 1 || batch === batches || batch % 5 === 0) console.log(`[products] ${completed}/${total}`);
  },
});
await service.upsert('product_media', mediaRows, { onConflict: 'internal_id', batchSize: 150 });
await service.upsert('product_attribute_values', plan.productAttributeRows, { onConflict: 'product_id,attribute_id', batchSize: 150 });
await service.upsert('product_source_records', plan.sourceRecordRows, { onConflict: 'supplier_id,source_id', batchSize: 80, maxBytes: 1_500_000 });
await service.upsert('product_source_attributes', plan.sourceAttributeRows, { onConflict: 'internal_id', batchSize: 150, maxBytes: 1_500_000 });

const [persistedProducts, persistedMedia] = await Promise.all([
  service.fetchAll('products', { select: 'legacy_id', query: { brand_id: `eq.${hunterBrand.internal_id}` } }),
  service.fetchAll('product_media', { select: 'product_id', query: { media_type: 'eq.image', active: 'eq.true' } }),
]);
const mediaIds = new Set(persistedMedia.map((row) => row.product_id));
const productIds = new Map(plan.productRows.map((row) => [row.legacy_id, row.internal_id]));
if (persistedProducts.filter((row) => productIds.has(row.legacy_id)).length !== 962
    || [...productIds.values()].some((id) => !mediaIds.has(id))) {
  throw new Error('Hunter canonical product or image verification failed.');
}
await service.patch('import_runs', { internal_id: `eq.${importRunId}` }, {
  status: 'succeeded', finished_at: new Date().toISOString(), records_succeeded: 962,
});
const success = { ...report, status: 'ok', verifiedProducts: 962, verifiedProductsWithImages: 962 };
writeJson(path.join(reportDir, 'hunter-canonical-prerequisites-publish.json'), success);
console.log(JSON.stringify(success, null, 2));
