import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002000500_collections_admin_v1.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const view = read("admin/admin-collections.mjs");
const css = read("admin/admin.css");
const storefront = read("script.js");
const pkg = JSON.parse(read("package.json"));

// Database contract: RPC-only writes for content editors, staff-only reads, hidden helpers.
assert.match(migration, /can_manage_content\(\)/, "owner/admin/content_manager edit collections");
assert.match(migration, /is_active_admin\(\)/, "every staff role can read");
const RPCS = ["admin_list_collections()", "admin_get_collection(text)", "admin_search_collection_products(text, integer)",
  "admin_update_collection(text, jsonb, timestamptz)", "admin_set_collection_products(text, text[], timestamptz)",
  "admin_create_collection(jsonb)", "admin_delete_collection(text, timestamptz)"];
for (const rpc of RPCS) {
  const escaped = rpc.replace(/[()[\]]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon;`), `${rpc} hidden from anon`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`), `${rpc} for staff`);
}
for (const helper of migration.matchAll(/create or replace function public\.(_[a-z_]+)\(/g)) {
  assert.match(migration, new RegExp(`revoke all on function public\\.${helper[1]}\\([^)]*\\) from public, anon, authenticated;`), `${helper[1]} hidden from clients`);
}
for (const fn of migration.matchAll(/create or replace function public\.([a-z_]+)\([\s\S]*?\$\$;/g)) {
  assert.match(fn[0], /set search_path = ''/, `${fn[1]} pins search_path`);
}
assert.match(migration, /expected_updated_at is not null and target\.updated_at <> expected_updated_at/, "optimistic concurrency");
assert.match(migration, /_admin_refresh_catalog\(target_product_ids\)/, "membership changes refresh product cards");
assert.match(migration, /_taxonomy_bump_revision\(active_version\)/, "every save bumps the public cache revision");
assert.match(migration, /insert into public\.taxonomy_admin_audit/, "changes are audited");
assert.match(migration, /'homepage-products' then 'popular'/);
assert.match(migration, /'homepage-sale-products' then 'sale'/);
assert.match(migration, /головна сторінка, її не можна видалити/, "homepage blocks cannot be deleted");
assert.doesNotMatch(migration, /set\s+(stable_id|slug)\s*=/i, "collection code stays read-only");
assert.doesNotMatch(migration, /create (or replace )?trigger|drop trigger/i, "no triggers (Supabase connector limitation)");
assert.doesNotMatch(migration, /^begin;|^commit;/m);
// The deletes are documented in the header so whoever applies the migration uses the SQL Editor.
const deletes = [...migration.matchAll(/^\s*delete from public\.([a-z_]+)/gm)].map(match => match[1]);
assert.deepEqual(deletes, ["product_collection_items", "product_collections"]);
assert.match(migration.split("\n").slice(0, 15).join("\n"), /delete from public\.product_collection_items[\s\S]*delete from public\.product_collections/);

// Storefront contract the editor mirrors in its per-item warnings.
assert.match(storefront, /source\.getCollection\("homepage-products"\)/);
assert.match(storefront, /source\.getCollection\("homepage-sale-products"\)/);
assert.match(storefront, /product\.tags\.includes\("sale"\)/);
assert.match(storefront, /oldAmount/);
assert.match(view, /item\.tags\.includes\("sale"\)/);
assert.match(view, /Number\(item\.oldAmount\) > Number\(item\.amount\)/);
assert.match(view, /item\.inventoryStatus !== "in_stock"/);

// Admin UI wiring.
for (const rpc of ["admin_list_collections", "admin_get_collection", "admin_update_collection", "admin_set_collection_products",
  "admin_search_collection_products", "admin_create_collection", "admin_delete_collection"]) {
  assert.match(api, new RegExp(`"${rpc}"`), `${rpc} is exposed by the admin API`);
}
assert.match(app, /createCollectionsListView/);
assert.match(app, /createCollectionDetailView/);
assert.match(app, /\\\/admin\\\/collections\\\/\(\[\^\/\]\+\)/);
assert.doesNotMatch(app, /Керовані добірки/, "collections placeholder removed");
assert.match(view, /api\.collections\.setProducts\(state\.collection\.id, ids\(state\.items\), state\.collection\.updatedAt\)/);
assert.match(view, /api\.collections\.update\(state\.collection\.id, patch, state\.collection\.updatedAt\)/);
assert.doesNotMatch(view, /innerHTML\s*=/, "views render through escaped templates and DOM nodes");
assert.match(css, /\/\* Collections \*\//);
assert.match(pkg.scripts["db:local:test"], /collections-scenarios\.mjs/);

console.log(JSON.stringify({ status: "ok", checks: "collections-static" }));
