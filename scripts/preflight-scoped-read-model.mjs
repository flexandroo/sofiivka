import assert from 'node:assert/strict';
import path from 'node:path';
import { PROJECT_ROOT, resolveLinkedDevProject, resolveMigrationHistory, writeJson } from './catalog-db-utils.mjs';

const PROJECT_REF = 'wfxcklglujgramasdzyr';
const accessToken = process.env.SOFIEVKA_SUPABASE_ACCESS_TOKEN;
if (!accessToken) throw new Error('SOFIEVKA_SUPABASE_ACCESS_TOKEN is required in process memory.');

async function runSql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Read-only preflight SQL failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

const project = resolveLinkedDevProject(PROJECT_REF);
const migrationHistory = resolveMigrationHistory();
const rows = await runSql(`
  select
    (select count(*) from auth.users)::integer as auth_users,
    (select count(*) from public.admin_profiles)::integer as admin_profiles,
    (select count(*) from public.products)::integer as products,
    (select count(*) from public.products where publication_status = 'published')::integer as published_products,
    (select count(*) from public.products where publication_status = 'hidden')::integer as hidden_products,
    coalesce((select jsonb_agg(table_name order by table_name)
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
        and table_name ~* '(customer|order|payment|checkout|invoice)'), '[]'::jsonb) as production_business_tables,
    (select count(*) from storage.objects)::integer as storage_objects
`);
const state = rows[0];
assert.equal(project.name, 'sofievka');
assert.equal(project.ref, PROJECT_REF);
assert.equal(project.status, 'ACTIVE_HEALTHY');
assert.equal(project.linked, true);
assert.equal(state.auth_users, 0);
assert.equal(state.admin_profiles, 0);
assert.deepEqual(state.production_business_tables, []);

const report = {
  reportVersion: 'catalog-scoped-read-model-preflight-v2',
  status: 'ok',
  checkedAt: new Date().toISOString(),
  project: { name: project.name, ref: project.ref, region: project.region, status: project.status, linked: project.linked },
  noProductionDataEvidence: state,
  migrationHistory: migrationHistory.pairs,
  pendingMigration: '20260929000500_catalog_facets_object_length_fix.sql',
  readOnly: true,
};
writeJson(path.join(PROJECT_ROOT, 'reports', 'catalog-scoped-read-model-preflight.json'), report);
console.log(JSON.stringify(report, null, 2));
