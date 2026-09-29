import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  SOFIEVKA_PROJECTS,
  resolveMigrationHistory,
  resolveProjectApiKeys,
  sha256,
  stableStringify,
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
  '20260929000600',
  '20260929000700',
  '20260929000800',
  '20260929000900',
  '20260929001000',
];

function normalizeTimestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

const TABLE_SPECS = [
  {
    label: 'suppliers', table: 'suppliers', key: 'internal_id',
    expected: 'supplierRows', fields: ['internal_id', 'stable_id', 'name', 'website_url', 'active'],
  },
  {
    label: 'series', table: 'product_series', key: 'internal_id', expected: 'seriesRows',
    fields: ['internal_id', 'stable_id', 'brand_id', 'slug', 'name', 'description', 'seo_title', 'seo_description', 'status'],
  },
  {
    label: 'products', table: 'products', key: 'internal_id', expected: 'productRows',
    fields: [
      'internal_id', 'legacy_id', 'sku', 'slug', 'title', 'short_title', 'model', 'brand_id',
      'primary_category_id', 'series_id', 'amount', 'old_amount', 'currency', 'price_status',
      'inventory_status', 'publication_status', 'description', 'short_description', 'full_description',
      'description_sections', 'badges', 'seo_title', 'seo_description', 'archived_at', 'last_verified_at',
    ],
    normalize: (row) => ({
      ...row,
      archived_at: row.publication_status === 'archived' ? '<present>' : null,
      last_verified_at: normalizeTimestamp(row.last_verified_at),
    }),
  },
  {
    label: 'secondary product categories', table: 'product_categories', key: ['product_id', 'category_id'],
    expected: 'productCategoryRows', fields: ['product_id', 'category_id', 'sort_order'],
  },
  {
    label: 'typed product attributes', table: 'product_attribute_values', key: ['product_id', 'attribute_id'],
    expected: 'productAttributeRows',
    fields: [
      'product_id', 'attribute_id', 'value_number', 'value_text', 'value_boolean', 'option_id',
      'source_label', 'source_value', 'provenance', 'normalization_rule', 'source_unit',
      'unit_override', 'unit_status',
    ],
  },
  {
    label: 'source records', table: 'product_source_records', key: 'internal_id', expected: 'sourceRecordRows',
    fields: [
      'internal_id', 'product_id', 'supplier_id', 'source_id', 'source_category', 'source_url',
      'mapping_status', 'raw_payload', 'payload_checksum', 'verified_at', 'active',
    ],
    normalize: (row) => ({ ...row, verified_at: normalizeTimestamp(row.verified_at) }),
  },
  {
    label: 'source attributes', table: 'product_source_attributes', key: 'internal_id', expected: 'sourceAttributeRows',
    fields: [
      'internal_id', 'product_id', 'source_record_id', 'ordinal', 'label', 'source_value',
      'normalized_attribute_id', 'mapping_status', 'mapping_notes', 'source_metadata',
    ],
  },
  {
    label: 'media', table: 'product_media', key: 'internal_id', expected: 'mediaRows',
    fields: ['internal_id', 'product_id', 'media_type', 'role', 'url', 'storage_path', 'source_url', 'alt_text', 'sort_order', 'active'],
  },
  {
    label: 'documents', table: 'product_documents', key: 'internal_id', expected: 'documentRows',
    fields: ['internal_id', 'product_id', 'title', 'document_type', 'url', 'storage_path', 'source_url', 'sort_order', 'active'],
  },
  {
    label: 'tags', table: 'tags', key: 'internal_id', expected: 'tagRows',
    fields: ['internal_id', 'stable_id', 'slug', 'name', 'origin', 'status'],
  },
  {
    label: 'product tags', table: 'product_tags', key: ['product_id', 'tag_id'], expected: 'productTagRows',
    fields: ['product_id', 'tag_id', 'provenance'],
  },
  {
    label: 'collections', table: 'product_collections', key: 'internal_id', expected: 'collectionRows',
    fields: [
      'internal_id', 'stable_id', 'slug', 'title', 'description', 'collection_type', 'active',
      'date_from', 'date_to', 'sort_order', 'seo_title', 'seo_description',
    ],
  },
  {
    label: 'collection items', table: 'product_collection_items', key: ['collection_id', 'product_id'],
    expected: 'collectionItemRows', fields: ['collection_id', 'product_id', 'sort_order'],
  },
  {
    label: 'category mapping reviews', table: 'category_mapping_reviews', key: 'internal_id',
    expected: 'categoryReviewRows',
    fields: [
      'internal_id', 'product_id', 'source_record_id', 'current_category_id', 'suggested_category_id',
      'source_category', 'reason', 'confidence', 'status', 'resolved_at',
    ],
  },
];

function parseArguments(argumentsList) {
  const options = { projectRef: '', reportDir: 'reports' };
  for (const argument of argumentsList) {
    if (argument.startsWith('--project-ref=')) options.projectRef = argument.slice('--project-ref='.length);
    else if (argument.startsWith('--report-dir=')) options.reportDir = argument.slice('--report-dir='.length);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.projectRef) throw new Error('--project-ref is required.');
  return options;
}

function pick(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}

function rowKey(row, key) {
  return (Array.isArray(key) ? key : [key]).map((field) => String(row[field])).join('|');
}

function projection(rows, spec) {
  return rows
    .map((row) => spec.normalize ? spec.normalize(pick(row, spec.fields)) : pick(row, spec.fields))
    .sort((left, right) => rowKey(left, spec.key).localeCompare(rowKey(right, spec.key), 'en'));
}

function projectionHash(rows, spec) {
  return sha256(stableStringify(projection(rows, spec)));
}

function addCheck(checks, { label, passed, expected, actual, severity = 'critical', detail = null }) {
  checks.push({ label, severity, passed: Boolean(passed), expected, actual, ...(detail ? { detail } : {}) });
}

async function verifyPublicApi({ publicClient, plan, core, checks }) {
  const publishedIds = new Set(plan.productRows
    .filter((row) => row.publication_status === 'published')
    .map((row) => row.internal_id));
  const activeCollectionIds = new Set(plan.collectionRows.filter((row) => row.active).map((row) => row.internal_id));
  const expectedCounts = {
    products: publishedIds.size,
    catalog_products: publishedIds.size,
    product_attribute_values: plan.productAttributeRows.filter((row) => publishedIds.has(row.product_id)).length,
    product_media: plan.mediaRows.filter((row) => row.active && publishedIds.has(row.product_id)).length,
    product_documents: plan.documentRows.filter((row) => row.active && publishedIds.has(row.product_id)).length,
    product_tags: 0,
    tags: 0,
    product_collections: plan.collectionRows.filter((row) => row.active).length,
    product_collection_items: plan.collectionItemRows.filter((row) => publishedIds.has(row.product_id) && activeCollectionIds.has(row.collection_id)).length,
  };

  for (const [table, expected] of Object.entries(expectedCounts)) {
    const actual = await publicClient.count(table);
    addCheck(checks, { label: `public RLS count: ${table}`, passed: actual === expected, expected, actual });
  }

  const hidden = plan.productRows.find((row) => row.publication_status !== 'published');
  const hiddenRows = await publicClient.fetchAll('products', {
    select: 'legacy_id', query: { legacy_id: `eq.${hidden.legacy_id}` },
  });
  addCheck(checks, {
    label: 'hidden service item is absent from public API', passed: hiddenRows.length === 0,
    expected: 0, actual: hiddenRows.length,
  });

  const representative = plan.productRows.find((row) => row.publication_status === 'published');
  const publicRows = await publicClient.fetchAll('catalog_products', {
    select: 'id,sku,slug,title,brand_id,primary_category_id,price_status,inventory_status',
    query: { id: `eq.${representative.legacy_id}` },
  });
  const publicRow = publicRows[0] ?? null;
  addCheck(checks, {
    label: 'representative public catalog projection',
    passed: Boolean(publicRow)
      && publicRow.id === representative.legacy_id
      && publicRow.sku === representative.sku
      && publicRow.slug === representative.slug
      && publicRow.brand_id === core.brandRows.find((row) => row.internal_id === representative.brand_id)?.stable_id
      && publicRow.primary_category_id === core.categoryRows.find((row) => row.internal_id === representative.primary_category_id)?.stable_id,
    expected: representative.legacy_id,
    actual: publicRow?.id ?? null,
  });

  const denied = await publicClient.request('/rest/v1/product_source_records?select=raw_payload&limit=1', { allowFailure: true });
  addCheck(checks, {
    label: 'raw supplier payload is denied to anon',
    passed: [401, 403].includes(denied.response.status),
    expected: 'HTTP 401/403', actual: `HTTP ${denied.response.status}`,
  });

  const skuRows = await publicClient.fetchAll('catalog_products', {
    select: 'id,sku', query: { sku: `eq.${representative.sku}` },
  });
  addCheck(checks, {
    label: 'exact SKU lookup through public catalog view',
    passed: skuRows.length === 1 && skuRows[0].id === representative.legacy_id,
    expected: representative.legacy_id, actual: skuRows.map((row) => row.id),
  });

  const brandStableId = core.brandRows.find((row) => row.internal_id === representative.brand_id)?.stable_id;
  const categoryStableId = core.categoryRows.find((row) => row.internal_id === representative.primary_category_id)?.stable_id;
  const apiCases = [
    ['brand filter', { brand_id: `eq.${brandStableId}`, limit: '20' }, (rows) => rows.length > 0 && rows.every((row) => row.brand_id === brandStableId)],
    ['category filter', { primary_category_id: `eq.${categoryStableId}`, limit: '20' }, (rows) => rows.length > 0 && rows.every((row) => row.primary_category_id === categoryStableId)],
    ['inventory filter', { inventory_status: 'eq.in_stock', limit: '20' }, (rows) => rows.length > 0 && rows.every((row) => row.inventory_status === 'in_stock')],
    ['price sort', { amount: 'not.is.null', order: 'amount.asc', limit: '20' }, (rows) => rows.length > 1 && rows.every((row, index) => index === 0 || rows[index - 1].amount <= row.amount)],
  ];
  for (const [label, query, assertion] of apiCases) {
    const rows = await publicClient.fetchAll('catalog_products', {
      select: 'id,brand_id,primary_category_id,inventory_status,amount', query,
    });
    addCheck(checks, { label: `public API sanity: ${label}`, passed: assertion(rows), expected: 'valid non-empty result', actual: rows.length });
  }

  const childCases = [
    ['media', 'product_media', plan.mediaRows.find((row) => publishedIds.has(row.product_id))?.product_id],
    ['typed attributes', 'product_attribute_values', plan.productAttributeRows.find((row) => publishedIds.has(row.product_id))?.product_id],
  ];
  for (const [label, table, productId] of childCases) {
    const rows = await publicClient.fetchAll(table, { select: 'product_id', query: { product_id: `eq.${productId}`, limit: '20' } });
    addCheck(checks, {
      label: `public API sanity: ${label}`, passed: rows.length > 0 && rows.every((row) => row.product_id === productId),
      expected: 'valid non-empty child result', actual: rows.length,
    });
  }

  const collectionItem = plan.collectionItemRows.find((row) => publishedIds.has(row.product_id));
  const collectionRows = await publicClient.fetchAll('product_collection_items', {
    select: 'collection_id,product_id,sort_order', query: { collection_id: `eq.${collectionItem.collection_id}`, order: 'sort_order.asc' },
  });
  addCheck(checks, {
    label: 'public API sanity: ordered collection items',
    passed: collectionRows.length > 0 && collectionRows.every((row, index) => index === 0 || collectionRows[index - 1].sort_order <= row.sort_order),
    expected: 'non-empty ordered result', actual: collectionRows.length,
  });
}

async function verifySearch({ publicClient, plan, checks }) {
  const candidates = plan.productRows.filter((row) => row.publication_status === 'published' && row.title.length > 12);
  const representative = candidates[Math.floor(candidates.length / 2)];
  const token = representative.title.split(/\s+/).find((value) => value.length >= 5) || representative.model;
  const parameters = new URLSearchParams({
    select: 'id,title,sku',
    or: `(title.ilike.*${token}*,short_title.ilike.*${token}*,model.ilike.*${token}*,sku.ilike.*${token}*)`,
    limit: '20',
  });
  const startedAt = performance.now();
  const { payload } = await publicClient.request(`/rest/v1/catalog_products?${parameters}`);
  const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
  addCheck(checks, {
    label: 'representative public search query returns results',
    passed: Array.isArray(payload) && payload.length > 0,
    expected: '>0', actual: Array.isArray(payload) ? payload.length : null,
    detail: { token, elapsedMs },
  });
  addCheck(checks, {
    label: 'representative public search HTTP latency',
    passed: elapsedMs < 2000,
    expected: '<2000ms', actual: `${elapsedMs}ms`, severity: 'informational',
  });
}

export async function runVerification({ projectRef, reportDir = 'reports' }) {
  const startedAt = new Date().toISOString();
  const project = resolveLinkedProject(projectRef);
  const migrationHistory = resolveMigrationHistory();
  const localMigrations = migrationHistory.pairs.map((pair) => pair.local);
  const remoteMigrations = migrationHistory.pairs.map((pair) => pair.remote);
  if (stableStringify(localMigrations) !== stableStringify(EXPECTED_MIGRATIONS)
      || stableStringify(remoteMigrations) !== stableStringify(EXPECTED_MIGRATIONS)) {
    throw new Error('Refusing verification: local/remote migration history does not match the approved migration chain.');
  }

  const keys = resolveProjectApiKeys(projectRef);
  const serviceClient = new SupabaseRestClient({ projectRef, apiKey: keys.serviceRoleKey });
  const publicClient = new SupabaseRestClient({ projectRef, apiKey: keys.publishableKey });
  const state = loadCatalogRuntime();
  const homepage = loadHomepageCollections();
  const categoryReview = readCategoryReview();
  const baseline = buildSnapshotBaseline({ state, homepage, categoryReview });
  const core = await loadCoreLookup(serviceClient);
  const plan = buildImportPlan({
    state, homepage, categoryReview, core,
    importRunId: uuidFromKey('catalog-verification-placeholder'),
    startedAt: '2000-01-01T00:00:00.000Z',
    snapshotBaseline: baseline,
  });

  const checks = [];
  const expectedProject = SOFIEVKA_PROJECTS[projectRef];
  addCheck(checks, { label: `${project.environment} project identity`, passed: project.ref === projectRef && project.name === expectedProject.name, expected: `${expectedProject.name}/${projectRef}`, actual: `${project.name}/${project.ref}` });
  addCheck(checks, { label: 'migration parity', passed: true, expected: EXPECTED_MIGRATIONS, actual: remoteMigrations });
  addCheck(checks, { label: 'core brands', passed: core.brandRows.length === 36, expected: 36, actual: core.brandRows.length });
  addCheck(checks, { label: 'core categories', passed: core.categoryRows.length === 87, expected: 87, actual: core.categoryRows.length });
  addCheck(checks, { label: 'core attribute definitions', passed: core.attributeRows.length === 64, expected: 64, actual: core.attributeRows.length });

  const reconciliation = {};
  for (const spec of TABLE_SPECS) {
    const expectedRows = plan[spec.expected];
    const actualRows = await serviceClient.fetchAll(spec.table, {
      select: spec.fields.join(','), query: { order: `${Array.isArray(spec.key) ? spec.key[0] : spec.key}.asc` },
      pageSize: spec.table === 'product_source_records' ? 100 : 1000,
    });
    const expectedHash = projectionHash(expectedRows, spec);
    const actualHash = projectionHash(actualRows, spec);
    reconciliation[spec.table] = {
      expected: expectedRows.length,
      actual: actualRows.length,
      expectedHash,
      actualHash,
    };
    addCheck(checks, {
      label: `${spec.label}: exact row count`, passed: actualRows.length === expectedRows.length,
      expected: expectedRows.length, actual: actualRows.length,
    });
    addCheck(checks, {
      label: `${spec.label}: lossless projection hash`, passed: actualHash === expectedHash,
      expected: expectedHash, actual: actualHash,
    });
  }

  const importRuns = await serviceClient.fetchAll('import_runs', {
    select: 'internal_id,status,source_ref,records_seen,records_succeeded,records_failed',
    query: { source_ref: `eq.${baseline.snapshotHash}`, order: 'started_at.desc' },
  });
  addCheck(checks, {
    label: 'successful import run recorded',
    passed: importRuns.some((run) => run.status === 'succeeded'
      && run.records_seen === 3215 && run.records_succeeded === 3215 && run.records_failed === 0),
    expected: 'at least one succeeded 3215/3215 run',
    actual: importRuns.map((run) => ({ status: run.status, seen: run.records_seen, succeeded: run.records_succeeded, failed: run.records_failed })),
  });

  const productIds = (await serviceClient.fetchAll('products', { select: 'legacy_id' }))
    .map((row) => row.legacy_id)
    .sort();
  addCheck(checks, {
    label: 'legacy product ID set hash', passed: sha256(productIds.join('\n')) === baseline.productIdHash,
    expected: baseline.productIdHash, actual: sha256(productIds.join('\n')),
  });

  await verifyPublicApi({ publicClient, plan, core, checks });
  await verifySearch({ publicClient, plan, checks });

  const criticalFailures = checks.filter((check) => check.severity === 'critical' && !check.passed);
  const expectedDifferences = checks.filter((check) => check.severity === 'expected' && !check.passed);
  const informational = checks.filter((check) => check.severity === 'informational');
  const report = {
    reportVersion: 'catalog-migration-verification-v1',
    status: criticalFailures.length === 0 ? 'ok' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    project: { name: project.name, ref: project.ref, region: project.region, status: project.status },
    snapshotHash: baseline.snapshotHash,
    productIdHash: baseline.productIdHash,
    reconciliation,
    summary: {
      totalChecks: checks.length,
      passed: checks.filter((check) => check.passed).length,
      criticalFailures: criticalFailures.length,
      expectedDifferences: expectedDifferences.length,
      informational: informational.length,
    },
    checks,
  };
  const reportPath = path.resolve(PROJECT_ROOT, reportDir, 'catalog-migration-verification.json');
  writeJson(reportPath, report);
  console.log(JSON.stringify({ status: report.status, reportPath, summary: report.summary }, null, 2));
  if (criticalFailures.length) {
    const labels = criticalFailures.map((check) => check.label).join('; ');
    throw new Error(`Catalog verification failed: ${labels}`);
  }
  return report;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  await runVerification(options);
}
