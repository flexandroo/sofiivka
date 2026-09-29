import assert from 'node:assert/strict';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { LocalCatalogDataSource } from '../catalog/local-data-source.mjs';
import { SupabaseCatalogDataSource } from '../catalog/supabase-data-source.mjs';
import { createSofievkaSupabasePublicClient } from '../lib/supabase-client.mjs';
import {
  PROJECT_ROOT,
  loadCatalogRuntime,
  resolveLinkedDevProject,
  resolveProjectPublishableKey,
  writeJson,
} from '../scripts/catalog-db-utils.mjs';

const PROJECT_REF = 'wfxcklglujgramasdzyr';
const ACCESS_TOKEN = process.env.SOFIEVKA_SUPABASE_ACCESS_TOKEN;
const REPORT_PATH = path.join(PROJECT_ROOT, 'reports', 'catalog-performance-baseline-v2.json');

if (!ACCESS_TOKEN) throw new Error('SOFIEVKA_SUPABASE_ACCESS_TOKEN is required for the Postgres execution measurement.');

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

function measure(label, operation) {
  const startedAt = performance.now();
  const value = operation();
  return { label, value, durationMs: performance.now() - startedAt };
}

function prepareRepresentativeFacets(catalog) {
  const categoryIds = [
    'gas-boilers', 'solid-fuel-boilers', 'system-circulation-pumps',
    'borehole-pumps', 'sewage-pumps', 'reverse-osmosis',
    'water-softening', 'smart-lighting', 'feed-grinders',
  ];
  let checksum = 0;
  for (const categoryId of categoryIds) {
    const products = catalog.productsForCategory(categoryId);
    const category = catalog.categoryById[categoryId];
    const facets = (category?.facetIds || [])
      .filter(id => catalog.attributeDefinitions[id]?.filterable)
      .slice(0, 9);
    const counts = new Map();
    for (const product of products) {
      counts.set(`brand:${product.brandId}`, (counts.get(`brand:${product.brandId}`) || 0) + 1);
      counts.set(`availability:${product.availability}`, (counts.get(`availability:${product.availability}`) || 0) + 1);
      for (const facetId of facets) {
        const value = catalog.filterValue(catalog.attributeDefinitions[facetId], product.normalizedAttributes?.[facetId]);
        if (value !== undefined && value !== null && value !== '') {
          const key = `${facetId}:${value}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    checksum += products.length + counts.size;
  }
  return checksum;
}

const startedAt = new Date().toISOString();
const project = resolveLinkedDevProject(PROJECT_REF);
assert.equal(project.name, 'sofievka');

const explainPayload = await runSql('explain (analyze, buffers, format json) select public.get_catalog_snapshot()');
const explain = explainRoot(explainPayload);
const postgresExecutionMs = explain?.['Execution Time'];
assert.ok(Number.isFinite(postgresExecutionMs), 'Postgres execution time is unavailable');

const runtime = loadCatalogRuntime();
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
const supabaseSource = new SupabaseCatalogDataSource({ client: publicClient, cacheTtlMs: 0 });
const remoteSnapshot = await supabaseSource.loadCatalogSnapshot();
const network = supabaseSource.lastMetrics;
assert.equal(remoteSnapshot.products.length, 3214);

const adapterFactory = runtime.sofievkaProductLegacyAdapter.createLegacyAdapter;
const adapter = adapterFactory({
  taxonomy: runtime.sofievkaTaxonomy,
  brands: remoteSnapshot.brands,
  rawCatalog: null,
});
const legacy = measure('LegacyAdapter transformation', () => adapter.adaptProducts(remoteSnapshot.products, { useRawCatalog: false }));
assert.equal(legacy.value.length, 3214);

runtime.sofievkaInstallCatalogSnapshot(remoteSnapshot, { useRawCatalog: false });
const searchBuild = measure('browser search-index build', () => runtime.sofievkaInstallCatalogSearch());
assert.equal(searchBuild.value.index.products.length, 3214);
const facets = measure('representative filter/facet preparation', () => prepareRepresentativeFacets(runtime.sofievkaCatalog));
assert.ok(facets.value > 0);

const serverSerializationUpperBoundMs = network.headersMs >= postgresExecutionMs
  ? network.headersMs - postgresExecutionMs
  : null;
const report = {
  reportVersion: 'catalog-performance-baseline-v2',
  status: 'ok',
  startedAt,
  finishedAt: new Date().toISOString(),
  project: { name: project.name, ref: project.ref, status: project.status },
  dataset: { localProducts: localSnapshot.products.length, publicProducts: remoteSnapshot.products.length },
  fullSnapshot: {
    bytes: network.snapshotBytes,
    totalLoadMs: network.durationMs,
    stages: {
      A_postgresExecution: { durationMs: postgresExecutionMs, source: 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)' },
      B_serverSerializationGatewayAndRttUpperBound: {
        durationMs: serverSerializationUpperBoundMs,
        formula: 'responseHeadersMs - postgresExecutionMs, only when separately sampled timings are comparable',
        caveat: serverSerializationUpperBoundMs === null
          ? 'Not separable in this cold-run: the independent EXPLAIN sample was slower than the RPC TTFB. No negative or zero serialization claim is inferred.'
          : 'Includes PostgREST/gateway work and network round-trip; it is not a pure server-serialization measurement.',
      },
      C_networkTransferAndDecompression: { durationMs: network.bodyReadMs },
      D_jsonParse: { durationMs: network.parseMs },
      E_canonicalObjectAssembly: { durationMs: network.assemblyMs },
      F_legacyAdapterTransformation: { durationMs: legacy.durationMs },
      G_searchIndexBuild: { durationMs: searchBuild.durationMs },
      H_filterFacetPreparation: { durationMs: facets.durationMs, scopes: 9 },
    },
    response: {
      headersMs: network.headersMs,
      contentEncoding: network.contentEncoding,
      contentLength: network.contentLength,
    },
  },
  interpretation: [
    'A and B are measured separately to avoid attributing the entire delay to transfer.',
    'The 45 MB JSON parse and browser object/index construction remain material client costs after bytes arrive.',
    'This baseline intentionally exercises the debug-only full snapshot before the scoped read model is introduced.',
  ],
};

writeJson(REPORT_PATH, report);
console.log(JSON.stringify({ reportPath: REPORT_PATH, fullSnapshot: report.fullSnapshot }, null, 2));
