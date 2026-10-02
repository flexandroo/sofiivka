import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002000100_taxonomy_admin_v1.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const view = read("admin/admin-taxonomy.mjs");

// Database contract: RPC-only writes, editor roles, guarded catalogue removal, release patching.
assert.match(migration, /alter table public\.taxonomy_admin_audit enable row level security/);
assert.match(migration, /revoke all on table public\.taxonomy_admin_audit from public, anon, authenticated/);
assert.match(migration, /can_manage_content\(\)/, "owner/admin/content_manager edit taxonomy");
for (const rpc of ["admin_list_brands()", "admin_get_brand(text)", "admin_update_brand(text, jsonb, timestamptz)",
  "admin_list_categories()", "admin_get_category(text)", "admin_update_category(text, jsonb, timestamptz)"]) {
  const escaped = rpc.replace(/[()]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon`), `${rpc} hidden from anon`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated`), `${rpc} for staff`);
}
assert.match(migration, /_taxonomy_patch_release\('brands'/);
assert.match(migration, /_taxonomy_patch_release\('categories'/);
assert.match(migration, /catalog_admin_cache_revision/, "saves bump the public cache revision");
assert.match(migration, /expected_updated_at/, "optimistic concurrency");
assert.doesNotMatch(migration, /set\s+(stable_id|slug|parent_id|level|name)\s*=/i, "identity fields stay read-only");
assert.doesNotMatch(migration, /^begin;|^commit;/m);

// Admin UI wiring.
for (const rpc of ["admin_list_brands", "admin_get_brand", "admin_update_brand", "admin_list_categories", "admin_get_category", "admin_update_category"]) {
  assert.match(api, new RegExp(`"${rpc}"`), `${rpc} is exposed by the admin API`);
}
assert.match(app, /createBrandsListView/);
assert.match(app, /createCategoryDetailView/);
assert.match(app, /\\\/admin\\\/brands\\\/\(\[\^\/\]\+\)/);
assert.match(view, /api\.taxonomy\.updateBrand\(brand\.id, patch, brand\.updatedAt\)/);
assert.match(view, /api\.taxonomy\.updateCategory\(category\.id, patch, category\.updatedAt\)/);
assert.doesNotMatch(view, /innerHTML\s*=/, "views render through escaped templates");

console.log(JSON.stringify({ status: "ok", checks: "taxonomy-static" }));
