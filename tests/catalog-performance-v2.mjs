import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SupabaseCatalogDataSource } from '../catalog/supabase-data-source.mjs';
import { createSofievkaSupabasePublicClient } from '../lib/supabase-client.mjs';
import {
  PROJECT_ROOT,
  resolveLinkedProject,
  resolveProjectPublishableKey,
  writeJson,
} from '../scripts/catalog-db-utils.mjs';

const PROJECT_REF = process.argv.find(argument => argument.startsWith('--project-ref='))?.slice('--project-ref='.length)
  || 'wfxcklglujgramasdzyr';
const ACCESS_TOKEN = process.env.SOFIEVKA_SUPABASE_ACCESS_TOKEN;
const REPORT_PATH = path.join(PROJECT_ROOT, 'reports', `catalog-performance-v2-${PROJECT_REF}.json`);
const BASELINE_PATH = path.join(PROJECT_ROOT, 'reports', 'catalog-performance-baseline-v2.json');
const SAMPLE_COUNT = 5;

if (!ACCESS_TOKEN) throw new Error('SOFIEVKA_SUPABASE_ACCESS_TOKEN is required for EXPLAIN ANALYZE.');

async function runSql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Management SQL failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

function explainRoot(payload) {
  const value = payload?.[0]?.['QUERY PLAN'];
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function summarizeSamples(samples) {
  const field = key => samples.map(sample => Number(sample[key] || 0));
  const durations = field('durationMs');
  return {
    samples: samples.length,
    responseBytes: Math.round(percentile(field('responseBytes'), 0.5)),
    contentLengthMedian: Math.round(percentile(field('contentLength'), 0.5)),
    durationMs: {
      min: Number(Math.min(...durations).toFixed(3)),
      median: Number(percentile(durations, 0.5).toFixed(3)),
      p95: Number(percentile(durations, 0.95).toFixed(3)),
    },
    headersMsMedian: Number(percentile(field('headersMs'), 0.5).toFixed(3)),
    bodyReadMsMedian: Number(percentile(field('bodyReadMs'), 0.5).toFixed(3)),
    parseMsMedian: Number(percentile(field('parseMs'), 0.5).toFixed(3)),
    contentEncoding: samples.at(-1)?.contentEncoding || 'identity',
  };
}

async function sampleEndpoint(source, operation, call) {
  const samples = [];
  let value;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    value = await call();
    assert.equal(source.lastMetrics?.cacheHit, false, `${operation} unexpectedly used client cache`);
    samples.push(source.lastMetrics);
  }
  return { value, metrics: summarizeSamples(samples) };
}

const project = resolveLinkedProject(PROJECT_REF);
assert.deepEqual(
  { ref: project.ref, status: project.status, linked: project.linked },
  { ref: PROJECT_REF, status: 'ACTIVE_HEALTHY', linked: true },
  'remote performance checks are restricted to a linked approved Sofievka project',
);

const publishableKey = resolveProjectPublishableKey(PROJECT_REF);
const client = createSofievkaSupabasePublicClient({
  url: `https://${PROJECT_REF}.supabase.co`,
  publishableKey,
});
const source = new SupabaseCatalogDataSource({ client, cacheTtlMs: 0 });

const endpointCalls = {
  version: () => source.getCatalogVersion({ force: true, ttlMs: 0 }),
  bootstrap: () => source.loadBootstrap({ force: true, ttlMs: 0 }),
  plpCategory: () => source.listProducts({ scopeCategory: 'gas-boilers', pageSize: 24 }, { force: true, ttlMs: 0 }),
  plpCategoryBrand: () => source.listProducts({ scopeCategory: 'gas-boilers', brandIds: ['baxi'], pageSize: 24 }, { force: true, ttlMs: 0 }),
  plpPriceAscending: () => source.listProducts({ scopeCategory: 'reverse-osmosis', sort: 'price-asc', pageSize: 24 }, { force: true, ttlMs: 0 }),
  plpPageTwo: () => source.listProducts({ scopeCategory: 'gas-boilers', page: 2, pageSize: 24 }, { force: true, ttlMs: 0 }),
  facets: () => source.loadFacets({ scopeCategory: 'reverse-osmosis' }, { force: true, ttlMs: 0 }),
  pdp: () => source.getProductById('MO550MECOSTD', { force: true, ttlMs: 0 }),
  search: () => source.search('MO550MECOSTD', { productLimit: 12, force: true, ttlMs: 0 }),
  collection: () => source.getCollection('sale', { force: true, ttlMs: 0 }),
};

const endpoints = {};
const endpointValues = {};
for (const [operation, call] of Object.entries(endpointCalls)) {
  const sampled = await sampleEndpoint(source, operation, call);
  endpoints[operation] = sampled.metrics;
  endpointValues[operation] = sampled.value;
}

assert.equal(endpointValues.bootstrap.totalProducts, 3214);
assert.equal(endpointValues.plpCategory.total, 57);
assert.equal(endpointValues.plpCategory.products.length, 24);
assert.equal(endpointValues.plpCategoryBrand.total, 52);
assert.equal(endpointValues.plpPageTwo.page, 2);
assert.equal(endpointValues.plpPageTwo.products.length, 24);
assert.equal(endpointValues.facets.total, 19);
assert.equal(endpointValues.pdp.product.id, 'MO550MECOSTD');
assert.equal(endpointValues.pdp.relatedProducts.length, 4);
assert.equal(endpointValues.search.products[0].id, 'MO550MECOSTD');
assert.equal(endpointValues.collection.products.length, 18);

const explains = {
  category: `select public.get_catalog_products(scope_category => 'gas-boilers', page_size => 24)`,
  categoryBrand: `select public.get_catalog_products(scope_category => 'gas-boilers', brand_ids => array['baxi']::text[], page_size => 24)`,
  facets: `select public.get_catalog_facets(scope_category => 'reverse-osmosis')`,
  priceSort: `select public.get_catalog_products(scope_category => 'reverse-osmosis', sort_mode => 'price-asc', page_size => 24)`,
  pagination: `select public.get_catalog_products(scope_category => 'gas-boilers', page_number => 2, page_size => 24)`,
  pdp: `select public.get_catalog_product('MO550MECOSTD')`,
  related: `with active_release as (
    select release.snapshot_version from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ), target as (
    select card.* from active_release release join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.legacy_id = 'MO550MECOSTD'
  ) select candidate.legacy_id from target join public.catalog_product_cards candidate
      on candidate.snapshot_version = target.snapshot_version and candidate.category_id = target.category_id
     and candidate.legacy_id <> target.legacy_id
    order by (case when candidate.series_id is not null and candidate.series_id = target.series_id then 40 else 0 end)
      + (case when candidate.brand_id = target.brand_id then 12 else 0 end) desc,
      candidate.sort_order, candidate.legacy_id limit 4`,
  search: `select public.search_catalog('MO550MECOSTD', 12, 6, 6, 6)`,
  collection: `select public.get_catalog_collection('sale')`,
};

const explainResults = {};
for (const [operation, sql] of Object.entries(explains)) {
  const root = explainRoot(await runSql(`explain (analyze, buffers, format json) ${sql}`));
  assert.ok(Number.isFinite(root?.['Execution Time']), `${operation} EXPLAIN execution time is unavailable`);
  explainResults[operation] = {
    planningMs: root['Planning Time'],
    executionMs: root['Execution Time'],
    sharedHitBlocks: root.Plan?.['Shared Hit Blocks'] ?? null,
    sharedReadBlocks: root.Plan?.['Shared Read Blocks'] ?? null,
    tempReadBlocks: root.Plan?.['Temp Read Blocks'] ?? null,
    tempWrittenBlocks: root.Plan?.['Temp Written Blocks'] ?? null,
    topNode: root.Plan?.['Node Type'] || null,
    planRows: root.Plan?.['Plan Rows'] ?? null,
    actualRows: root.Plan?.['Actual Rows'] ?? null,
  };
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const fullSnapshotBytes = baseline.fullSnapshot.bytes;
const firstPlpJourneyBytes = endpoints.bootstrap.responseBytes + endpoints.plpCategory.responseBytes + endpoints.facets.responseBytes;
const repeatPlpJourneyBytes = endpoints.plpCategory.responseBytes + endpoints.facets.responseBytes;
const firstPdpJourneyBytes = endpoints.bootstrap.responseBytes + endpoints.pdp.responseBytes;
const payloadReductionPercent = Number(((1 - firstPlpJourneyBytes / fullSnapshotBytes) * 100).toFixed(3));
const payloadRatio = Number((fullSnapshotBytes / firstPlpJourneyBytes).toFixed(1));
const explainTimes = Object.values(explainResults).map(result => result.executionMs);
const acceptance = {
  publicProducts: endpointValues.bootstrap.totalProducts === 3214,
  firstPlpJourneyUnderOneMegabyte: firstPlpJourneyBytes < 1_000_000,
  pdpUnderOneMegabyte: endpoints.pdp.responseBytes < 1_000_000,
  exactSkuFirst: endpointValues.search.products[0].id === 'MO550MECOSTD',
  allExplainUnderOneSecond: Math.max(...explainTimes) < 1000,
};
const status = Object.values(acceptance).every(Boolean) ? 'ok' : 'failed';

const report = {
  reportVersion: 'catalog-performance-v2',
  status,
  measuredAt: new Date().toISOString(),
  project: { name: project.name, ref: project.ref, status: project.status, linked: project.linked },
  dataset: { databaseProducts: 3215, publicProducts: endpointValues.bootstrap.totalProducts },
  sampleCount: SAMPLE_COUNT,
  endpoints,
  journeys: {
    firstPlp: { requests: 3, bytes: firstPlpJourneyBytes, includes: ['bootstrap', 'products', 'facets'] },
    repeatedPlp: { requests: 2, bytes: repeatPlpJourneyBytes, includes: ['products', 'facets'], bootstrapCacheHit: true },
    firstPdp: { requests: 2, bytes: firstPdpJourneyBytes, includes: ['bootstrap', 'pdp+related'] },
  },
  explainAnalyze: explainResults,
  comparison: {
    fullSnapshotBytes,
    firstPlpJourneyBytes,
    payloadReductionPercent,
    payloadRatio,
    avoidedNormalLoadBytes: fullSnapshotBytes - firstPlpJourneyBytes,
    fullSnapshotPostgresExecutionMs: baseline.fullSnapshot.stages.A_postgresExecution.durationMs,
    slowestScopedExplainMs: Math.max(...explainTimes),
  },
  acceptance,
  caveats: [
    `HTTP timings are five external ${project.environment} samples and include gateway and network latency.`,
    'responseBytes is decoded JSON text size; contentLength reflects the transport header when supplied.',
    'Browser heap reduction is not claimed as an exact measurement; normal routes no longer allocate the 45 MB full JSON or a 3214-product client search index.',
  ],
};

writeJson(REPORT_PATH, report);
console.log(JSON.stringify({ status, reportPath: REPORT_PATH, journeys: report.journeys, comparison: report.comparison, explainAnalyze: report.explainAnalyze, acceptance }, null, 2));
if (status !== 'ok') throw new Error('Scoped performance acceptance failed.');
