import path from 'node:path';
import {
  PROJECT_ROOT,
  SupabaseRestClient,
  buildImportPlan,
  buildSnapshotBaseline,
  loadCatalogRuntime,
  loadCoreLookup,
  loadHomepageCollections,
  readCategoryReview,
  resolveLinkedProject,
  resolveMigrationHistory,
  resolveProjectApiKeys,
  uuidFromKey,
  writeJson,
} from './catalog-db-utils.mjs';

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
];

function parseArguments(argumentsList) {
  const options = {
    mode: null,
    projectRef: '',
    reportDir: 'reports',
    batchSize: 250,
  };
  for (const argument of argumentsList) {
    if (['--dry-run', '--apply', '--verify'].includes(argument)) {
      if (options.mode) throw new Error('Choose exactly one of --dry-run, --apply, or --verify.');
      options.mode = argument.slice(2);
    } else if (argument.startsWith('--project-ref=')) options.projectRef = argument.slice('--project-ref='.length);
    else if (argument.startsWith('--report-dir=')) options.reportDir = argument.slice('--report-dir='.length);
    else if (argument.startsWith('--batch-size=')) options.batchSize = Number(argument.slice('--batch-size='.length));
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.mode) throw new Error('Choose one of --dry-run, --apply, or --verify.');
  if (!options.projectRef) throw new Error('--project-ref is required.');
  if (!Number.isInteger(options.batchSize) || options.batchSize < 25 || options.batchSize > 500) {
    throw new Error('--batch-size must be an integer from 25 to 500.');
  }
  return options;
}

function assertMigrationHistory(history) {
  const local = history.pairs.map((pair) => pair.local);
  const remote = history.pairs.map((pair) => pair.remote);
  const expected = EXPECTED_MIGRATIONS.join(',');
  if (local.join(',') !== expected || remote.join(',') !== expected) {
    throw new Error(`Migration history mismatch. Expected local/remote ${expected}; got ${local.join(',')} / ${remote.join(',')}.`);
  }
}

function entityCounts(plan) {
  return {
    suppliers: plan.supplierRows.length,
    series: plan.seriesRows.length,
    products: plan.productRows.length,
    productCategories: plan.productCategoryRows.length,
    attributeOptions: plan.attributeOptionRows.length,
    productAttributeValues: plan.productAttributeRows.length,
    productSourceRecords: plan.sourceRecordRows.length,
    productSourceAttributes: plan.sourceAttributeRows.length,
    productMedia: plan.mediaRows.length,
    productDocuments: plan.documentRows.length,
    tags: plan.tagRows.length,
    productTags: plan.productTagRows.length,
    collections: plan.collectionRows.length,
    collectionItems: plan.collectionItemRows.length,
    categoryMappingReviews: plan.categoryReviewRows.length,
  };
}

function validatePlan(plan, baseline) {
  const counts = entityCounts(plan);
  const assertions = [
    [counts.products === 3215, `products=${counts.products}`],
    [counts.series === 368, `series=${counts.series}`],
    [counts.productCategories === 0, `secondary categories=${counts.productCategories}`],
    [counts.productAttributeValues === baseline.counts.typedAttributeRows, `typed attributes=${counts.productAttributeValues}`],
    [counts.productSourceRecords === 3215, `source records=${counts.productSourceRecords}`],
    [counts.productSourceAttributes === baseline.counts.sourceEvidenceRows, `source attributes=${counts.productSourceAttributes}`],
    [counts.productMedia === baseline.counts.mediaRows, `media=${counts.productMedia}`],
    [counts.productDocuments === baseline.counts.documentRows, `documents=${counts.productDocuments}`],
    [counts.categoryMappingReviews === 29, `reviews=${counts.categoryMappingReviews}`],
    [plan.productRows.filter((row) => row.publication_status === 'published').length === 3214, 'published product count'],
    [plan.productRows.filter((row) => row.publication_status === 'hidden').length === 1, 'hidden product count'],
    [plan.productRows.filter((row) => row.price_status === 'known').length === 631, 'known price count'],
    [plan.productRows.filter((row) => row.price_status === 'unknown').length === 2584, 'unknown price count'],
  ];
  const failures = assertions.filter(([passed]) => !passed).map(([, label]) => label);
  if (failures.length) throw new Error(`Import plan validation failed: ${failures.join('; ')}.`);
  return counts;
}

function progressLogger({ table, completed, total, batch, batches }) {
  if (batch === 1 || batch === batches || batch % 10 === 0) {
    console.log(`[${table}] ${completed}/${total} rows (${batch}/${batches} batches)`);
  }
}

async function assertSafeExistingProducts(client, plan) {
  const existing = await client.fetchAll('products', { select: 'legacy_id,internal_id' });
  if (existing.length === 0) return { productsBefore: 0, state: 'empty' };
  const expected = new Map(plan.productRows.map((row) => [row.legacy_id, row.internal_id]));
  const unexpected = existing.filter((row) => !expected.has(row.legacy_id) || expected.get(row.legacy_id) !== row.internal_id);
  if (unexpected.length || existing.length !== plan.productRows.length) {
    throw new Error(`Refusing non-empty catalog import: existing products are not the exact deterministic catalog set (${existing.length} rows, ${unexpected.length} unexpected).`);
  }
  return { productsBefore: existing.length, state: 'same-catalog' };
}

async function clearManagedChildren(client, plan) {
  const productIds = plan.managedProductIds;
  await client.deleteByValues('category_mapping_reviews', 'product_id', productIds);
  await client.deleteByValues('product_source_attributes', 'product_id', productIds);
  await client.deleteByValues('product_source_records', 'product_id', productIds);
  await client.deleteByValues('product_collection_items', 'collection_id', plan.managedCollectionIds);
  await client.deleteByValues('product_tags', 'product_id', productIds);
  await client.deleteByValues('product_documents', 'product_id', productIds);
  await client.deleteByValues('product_media', 'product_id', productIds);
  await client.deleteByValues('product_attribute_values', 'product_id', productIds);
  await client.deleteByValues('product_categories', 'product_id', productIds);
}

async function applyPlan(client, plan, options) {
  const results = {};
  let importedProducts = 0;
  let importRunCreated = false;
  try {
    results.suppliers = await client.upsert('suppliers', plan.supplierRows, {
      onConflict: 'stable_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    await client.insert('import_runs', plan.importRun);
    importRunCreated = true;
    results.series = await client.upsert('product_series', plan.seriesRows, {
      onConflict: 'stable_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.products = await client.upsert('products', plan.productRows, {
      onConflict: 'legacy_id', batchSize: options.batchSize,
      onProgress: (progress) => { importedProducts = progress.completed; progressLogger(progress); },
    });

    console.log('[cleanup] replacing managed child projections');
    await clearManagedChildren(client, plan);

    results.productCategories = await client.upsert('product_categories', plan.productCategoryRows, {
      onConflict: 'product_id,category_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.attributeOptions = await client.upsert('attribute_options', plan.attributeOptionRows, {
      onConflict: 'internal_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.productAttributeValues = await client.upsert('product_attribute_values', plan.productAttributeRows, {
      onConflict: 'product_id,attribute_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.productSourceRecords = await client.upsert('product_source_records', plan.sourceRecordRows, {
      onConflict: 'supplier_id,source_id', batchSize: Math.min(options.batchSize, 100), maxBytes: 1_500_000, onProgress: progressLogger,
    });
    results.productSourceAttributes = await client.upsert('product_source_attributes', plan.sourceAttributeRows, {
      onConflict: 'internal_id', batchSize: options.batchSize, maxBytes: 1_500_000, onProgress: progressLogger,
    });
    results.productMedia = await client.upsert('product_media', plan.mediaRows, {
      onConflict: 'internal_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.productDocuments = await client.upsert('product_documents', plan.documentRows, {
      onConflict: 'internal_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.tags = await client.upsert('tags', plan.tagRows, {
      onConflict: 'stable_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.productTags = await client.upsert('product_tags', plan.productTagRows, {
      onConflict: 'product_id,tag_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.collections = await client.upsert('product_collections', plan.collectionRows, {
      onConflict: 'stable_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.collectionItems = await client.upsert('product_collection_items', plan.collectionItemRows, {
      onConflict: 'collection_id,product_id', batchSize: options.batchSize, onProgress: progressLogger,
    });
    results.categoryMappingReviews = await client.upsert('category_mapping_reviews', plan.categoryReviewRows, {
      onConflict: 'internal_id', batchSize: options.batchSize, onProgress: progressLogger,
    });

    const finishedAt = new Date().toISOString();
    await client.patch('import_runs', { internal_id: `eq.${plan.importRun.internal_id}` }, {
      status: 'succeeded',
      finished_at: finishedAt,
      records_succeeded: plan.productRows.length,
      records_failed: 0,
      error_summary: null,
      metadata: {
        ...plan.importRun.metadata,
        entityCounts: entityCounts(plan),
        diagnostics: plan.diagnostics,
      },
    });
    return { status: 'succeeded', finishedAt, results };
  } catch (error) {
    if (importRunCreated) {
      try {
        await client.patch('import_runs', { internal_id: `eq.${plan.importRun.internal_id}` }, {
          status: importedProducts > 0 ? 'partial' : 'failed',
          finished_at: new Date().toISOString(),
          records_succeeded: importedProducts,
          records_failed: Math.max(0, plan.productRows.length - importedProducts),
          error_summary: String(error.message).slice(0, 1000),
          metadata: { ...plan.importRun.metadata, diagnostics: plan.diagnostics },
        });
      } catch {
        // Preserve the original import failure; the failed status update is reported by the caller.
      }
    }
    throw error;
  }
}

const options = parseArguments(process.argv.slice(2));
if (options.mode === 'verify') {
  const child = await import('./verify-supabase-catalog.mjs');
  await child.runVerification({ projectRef: options.projectRef, reportDir: options.reportDir });
  process.exit(0);
}

const project = resolveLinkedProject(options.projectRef);
const migrationHistory = resolveMigrationHistory();
assertMigrationHistory(migrationHistory);
const keys = resolveProjectApiKeys(options.projectRef);
const client = new SupabaseRestClient({ projectRef: options.projectRef, apiKey: keys.serviceRoleKey });
const exactProductsBefore = await client.count('products');
const state = loadCatalogRuntime();
const homepage = loadHomepageCollections();
const categoryReview = readCategoryReview();
const baseline = buildSnapshotBaseline({ state, homepage, categoryReview });
const reportDirectory = path.resolve(PROJECT_ROOT, options.reportDir);
writeJson(path.join(reportDirectory, 'catalog-migration-baseline.json'), baseline);
const core = await loadCoreLookup(client);
const startedAt = new Date().toISOString();
const importRunId = uuidFromKey(`import-run:${startedAt}:${baseline.snapshotHash}`);
const plan = buildImportPlan({ state, homepage, categoryReview, core, importRunId, startedAt, snapshotBaseline: baseline });
const counts = validatePlan(plan, baseline);
const safety = await assertSafeExistingProducts(client, plan);
plan.importRun.metadata.productWriteSummary = {
  inserted: safety.productsBefore === 0 ? plan.productRows.length : 0,
  updated: safety.productsBefore === 0 ? 0 : plan.productRows.length,
  failed: 0,
};
plan.importRun.metadata.warnings = [
  `${plan.diagnostics.seriesNameFallbacks.length} series use their stable ID as a missing display-name fallback.`,
  `${plan.diagnostics.tags.supplierReview} supplier tags remain in review status.`,
  `${plan.diagnostics.selectValues.storedAsReviewedText} select values are stored as reviewed text because no curated options exist.`,
];

const preflight = {
  status: 'ok',
  mode: options.mode,
  project: { name: project.name, ref: project.ref, region: project.region, status: project.status },
  migrationVersions: migrationHistory.pairs.map((pair) => pair.remote),
  exactProductsBefore,
  existingCatalogState: safety,
  snapshotHash: baseline.snapshotHash,
  productIdHash: baseline.productIdHash,
  entityCounts: counts,
  diagnostics: plan.diagnostics,
};
writeJson(path.join(reportDirectory, 'catalog-migration-dry-run.json'), preflight);
console.log(JSON.stringify(preflight, null, 2));

if (options.mode === 'dry-run') process.exit(0);

const applyResult = await applyPlan(client, plan, options);
const applyReport = {
  reportVersion: 'catalog-migration-apply-v1',
  project: preflight.project,
  importRunId,
  startedAt,
  ...applyResult,
  snapshotHash: baseline.snapshotHash,
  productIdHash: baseline.productIdHash,
  entityCounts: counts,
  diagnostics: plan.diagnostics,
};
writeJson(path.join(reportDirectory, `catalog-migration-apply-${importRunId}.json`), applyReport);
writeJson(path.join(reportDirectory, 'catalog-migration-apply-latest.json'), applyReport);
console.log(JSON.stringify({
  status: applyResult.status,
  importRunId,
  entityCounts: counts,
  finishedAt: applyResult.finishedAt,
}, null, 2));
