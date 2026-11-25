import fs from 'node:fs';
import path from 'node:path';
import {
  PROJECT_ROOT,
  SupabaseRestClient,
  loadCatalogRuntime,
  resolveLinkedProject,
  resolveProjectApiKeys,
  writeJson,
} from './catalog-db-utils.mjs';

const argumentsMap = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...parts] = argument.split('=');
  return [key, parts.join('=')];
}));
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const projectRef = argumentsMap.get('--project-ref') || '';
const reportDir = path.resolve(PROJECT_ROOT, argumentsMap.get('--report-dir') || 'reports');
if (projectRef !== 'fkjarsouuchjiedrrblc') throw new Error('This Hunter archive is restricted to the approved production project.');

const project = resolveLinkedProject(projectRef);
const publish = JSON.parse(fs.readFileSync(path.join(reportDir, 'hunter-incremental-read-model-publish.json'), 'utf8'));
if (publish.status !== 'ok' || publish.project?.ref !== projectRef || publish.publicHunterProducts !== 962) {
  throw new Error('A successful Hunter storefront publish report is required before archiving legacy family records.');
}
const keys = resolveProjectApiKeys(projectRef);
const service = new SupabaseRestClient({ projectRef, apiKey: keys.serviceRoleKey });
const [pointer] = await service.fetchAll('catalog_snapshot_pointer', { select: 'snapshot_version' });
if (pointer?.snapshot_version !== publish.targetSnapshotVersion) {
  throw new Error('The expected Hunter SKU snapshot is not active in production.');
}
const activeRows = await service.fetchAll('catalog_product_snapshots', {
  select: 'legacy_id,payload', query: { snapshot_version: `eq.${pointer.snapshot_version}` }, pageSize: 250,
});
const activeHunterIds = new Set(activeRows.filter((row) => row.payload?.brandId === 'hunter').map((row) => row.legacy_id));
const localHunterIds = new Set(loadCatalogRuntime().sofievkaCatalogSnapshot.products
  .filter((product) => product.brandId === 'hunter').map((product) => product.id));
if (activeHunterIds.size !== 962 || [...localHunterIds].some((id) => !activeHunterIds.has(id))) {
  throw new Error('The active Hunter storefront snapshot differs from the verified 962-SKU catalog.');
}
const baseRows = await service.fetchAll('catalog_product_snapshots', {
  select: 'legacy_id,payload', query: { snapshot_version: `eq.${publish.baseSnapshotVersion}` }, pageSize: 250,
});
const oldHunterIds = baseRows.filter((row) => row.payload?.brandId === 'hunter').map((row) => row.legacy_id);
const obsoleteIds = oldHunterIds.filter((id) => !activeHunterIds.has(id));
if (oldHunterIds.length !== 65 || obsoleteIds.length !== 59) {
  throw new Error(`Expected 65 legacy Hunter families and 59 obsolete IDs; got ${oldHunterIds.length} and ${obsoleteIds.length}.`);
}
const canonicalRows = await service.fetchAll('products', {
  select: 'legacy_id,publication_status,archived_at', query: { legacy_id: `in.(${obsoleteIds.join(',')})` },
});
if (canonicalRows.length !== 59 || canonicalRows.some((row) => !['published', 'archived'].includes(row.publication_status))) {
  throw new Error('Obsolete Hunter records are missing or have an unexpected publication state.');
}
const activeObsoleteIds = canonicalRows.filter((row) => row.publication_status === 'published').map((row) => row.legacy_id);
const report = {
  reportVersion: 'hunter-legacy-family-archive-v1',
  mode,
  project: { ref: project.ref, name: project.name, environment: project.environment },
  activeSnapshotVersion: pointer.snapshot_version,
  oldHunterFamilies: oldHunterIds.length,
  obsoleteFamilyRecords: obsoleteIds.length,
  toArchive: activeObsoleteIds.length,
};
writeJson(path.join(reportDir, 'hunter-legacy-families-preflight.json'), report);
console.log(JSON.stringify(report, null, 2));
if (mode === 'dry-run') process.exit(0);

if (activeObsoleteIds.length) {
  await service.patch('products', { legacy_id: `in.(${activeObsoleteIds.join(',')})` }, {
    publication_status: 'archived', archived_at: new Date().toISOString(),
  });
}
const verified = await service.fetchAll('products', {
  select: 'legacy_id,publication_status,archived_at', query: { legacy_id: `in.(${obsoleteIds.join(',')})` },
});
if (verified.length !== 59 || verified.some((row) => row.publication_status !== 'archived' || !row.archived_at)) {
  throw new Error('Legacy Hunter family archive verification failed.');
}
const success = { ...report, status: 'ok', archivedRecords: verified.length };
writeJson(path.join(reportDir, 'hunter-legacy-families-publish.json'), success);
console.log(JSON.stringify(success, null, 2));
