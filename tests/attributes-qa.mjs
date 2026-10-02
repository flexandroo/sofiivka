import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002000600_attributes_admin_v1.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const view = read("admin/admin-attributes.mjs");
const taxonomy = read("admin/admin-taxonomy.mjs");
const css = read("admin/admin.css");
const pkg = JSON.parse(read("package.json"));

// Database contract: RPC-only writes, editor roles, guarded type change and deletion, release sync.
assert.match(migration, /can_manage_content\(\)|_taxonomy_require_editor\(\)/, "owner/admin/content_manager edit characteristics");
assert.match(migration, /is_active_admin\(\)/, "any active staff may read");
const rpcs = ["admin_list_attributes()", "admin_get_attribute(text)", "admin_update_attribute(text, jsonb, timestamptz)",
  "admin_create_attribute(jsonb)", "admin_delete_attribute(text, timestamptz)",
  "admin_get_category_attributes(text)", "admin_set_category_attributes(text, jsonb, text)"];
for (const rpc of rpcs) {
  const escaped = rpc.replace(/[()]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon;`), `${rpc} hidden from anon`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`), `${rpc} for staff`);
}
for (const helper of migration.matchAll(/create or replace function public\.(_attributes_[a-z_]+)\(/g)) {
  assert.match(migration, new RegExp(`revoke all on function public\\.${helper[1]}\\(.*\\) from public, anon, authenticated;`), `${helper[1]} stays private`);
}
assert.equal((migration.match(/security definer/g) || []).length, (migration.match(/create or replace function/g) || []).length - 2,
  "every function except the two immutable text helpers is security definer");
assert.equal((migration.match(/set search_path = ''/g) || []).length, (migration.match(/create or replace function/g) || []).length, "pinned search_path");
assert.match(migration, /'facetIds'/);
assert.match(migration, /'allowedFacetIds'/);
assert.match(migration, /attribute_definitions = case/, "definition entries are patched in the release");
assert.match(migration, /_taxonomy_bump_revision/, "saves bump the public cache revision");
assert.match(migration, /expected_updated_at/, "optimistic concurrency for definitions");
assert.match(migration, /expected_version/, "optimistic concurrency for category filters");
assert.match(migration, /Тип значення не можна змінити/, "type is locked once products have values");
assert.match(migration, /заповнено в товарах/);
assert.match(migration, /прив’язана до категорій/);
assert.match(migration, /'attribute'\)\)/, "audit accepts attribute entries");
assert.doesNotMatch(migration, /set\s+stable_id\s*=/i, "the code stays read-only");
assert.doesNotMatch(migration, /create trigger/i, "no new triggers (Supabase connector cannot apply them)");
assert.doesNotMatch(migration, /^begin;|^commit;/m);

// Admin API and routing.
for (const rpc of rpcs.map(item => item.split("(")[0])) assert.match(api, new RegExp(`"${rpc}"`), `${rpc} is exposed by the admin API`);
assert.match(api, /payload: \{ items \}/, "category filters are sent as a jsonb object");
assert.match(app, /createAttributesListView/);
assert.match(app, /createAttributeDetailView/);
assert.match(app, /\\\/admin\\\/attributes\\\/\(\[\^\/\]\+\)/);
assert.doesNotMatch(app, /eyebrow: "64 визначення"/, "attributes placeholder removed");

// Views.
assert.match(view, /api\.attributes\.update\(attribute\.id, patch, attribute\.updatedAt\)/);
assert.match(view, /api\.attributes\.setCategoryFilters\(config\.category\.id, items, config\.version\)/);
assert.match(view, /export async function createCategoryFiltersPanel/);
assert.match(taxonomy, /createCategoryFiltersPanel\(\{ api, categoryId, signal \}\)/, "category page hosts the filters panel");
assert.match(taxonomy, /filters\.bind\(container\)/);
for (const source of [view, taxonomy]) assert.doesNotMatch(source, /innerHTML\s*=/, "views render through escaped templates or DOM nodes");
assert.match(view, /function escape\(/);
assert.match(css, /\.admin-attribute-filter \{/);

// Local suites wired.
assert.match(pkg.scripts["db:local:test"], /attributes-scenarios\.mjs/);
assert.equal(pkg.scripts["attributes:qa"], "node tests/attributes-qa.mjs");

console.log(JSON.stringify({ status: "ok", checks: "attributes-static" }));
