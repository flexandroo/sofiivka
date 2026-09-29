import path from 'node:path';
import {
  PROJECT_ROOT,
  buildSnapshotBaseline,
  loadCatalogRuntime,
  loadHomepageCollections,
  readCategoryReview,
  writeJson,
} from './catalog-db-utils.mjs';

const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const outputPath = path.resolve(PROJECT_ROOT, outputArgument?.slice('--output='.length) || 'reports/catalog-migration-baseline.json');
const state = loadCatalogRuntime();
const homepage = loadHomepageCollections();
const categoryReview = readCategoryReview();
const baseline = buildSnapshotBaseline({ state, homepage, categoryReview });

writeJson(outputPath, baseline);
console.log(JSON.stringify({
  status: 'ok',
  output: path.relative(PROJECT_ROOT, outputPath).replaceAll('\\', '/'),
  snapshotHash: baseline.snapshotHash,
  productIdHash: baseline.productIdHash,
  counts: baseline.counts,
  pricing: baseline.pricing,
  inventory: baseline.inventory,
  publication: baseline.publication,
}, null, 2));
