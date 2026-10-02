// Static contract for related products and series admin v1 (migration, storefront, admin wiring).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002001000_related_series_admin_v1.sql");
const api = read("admin/admin-api.mjs");
const products = read("admin/admin-products.mjs");
const relations = read("admin/admin-product-relations.mjs");
const taxonomy = read("admin/admin-taxonomy.mjs");
const series = read("admin/admin-series.mjs");
const css = read("admin/admin.css");
const pdp = read("catalog/pdp-engine.js");
const bundle = read("catalog-data.js");
const shell = read("page-shell.js");
const validator = read("catalog/validate-catalog.js");
const pkg = JSON.parse(read("package.json"));

// Database: RPC-only access, private helpers, pinned search_path, Ukrainian errors.
assert.match(migration, /create table if not exists public\.product_relations/);
assert.match(migration, /relation_kind in \('accessory', 'compatible', 'similar'\)/);
assert.match(migration, /primary key \(product_id, relation_kind, related_product_id\)/);
assert.match(migration, /product_id <> related_product_id/);
assert.match(migration, /alter table public\.product_relations enable row level security;/);
assert.match(migration, /revoke all on table public\.product_relations from public, anon, authenticated;/);
assert.match(migration, /до 24 товарів/);
assert.match(migration, /can_manage_content\(\)/, "relations follow the product editor's content role");
assert.match(migration, /_taxonomy_require_editor\(\)/, "series follow the brand editor role");
assert.match(migration, /is_active_admin\(\)/, "every staff role can read");
const RPCS = ["admin_get_product_relations(text)", "admin_set_product_relations(text, jsonb, jsonb)",
  "admin_list_brand_series(text)", "admin_create_series(text, jsonb)", "admin_update_series(text, jsonb, timestamptz)",
  "admin_delete_series(text, timestamptz, boolean)"];
for (const rpc of RPCS) {
  const escaped = rpc.replace(/[()[\]]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon;`), `${rpc} hidden from anon`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`), `${rpc} for staff`);
}
for (const helper of migration.matchAll(/create or replace function public\.(_[a-z0-9_]+)\(/g)) {
  assert.match(migration, new RegExp(`revoke all on function public\\.${helper[1]}\\([^)]*\\) from public, anon, authenticated;`), `${helper[1]} hidden from clients`);
}
for (const fn of migration.matchAll(/create or replace function public\.([a-z0-9_]+)\([\s\S]*?\$\$;/g)) {
  assert.match(fn[0], /set search_path = ''/, `${fn[1]} pins search_path`);
  if (/^admin_/.test(fn[1]) || /^_(series|product_relation|related_require|admin_product_payload|catalog_product)/.test(fn[1])) {
    assert.match(fn[0], /security definer/, `${fn[1]} is security definer`);
  }
}
for (const message of migration.matchAll(/message = (?:format\()?'([^']+)'/g)) {
  if (message[1] === "Not authorized") continue;
  assert.match(message[1], /[а-яіїєґ]/i, `Ukrainian error: ${message[1]}`);
}
assert.match(migration, /expected_state is not null and expected_state <> before_state/, "relations: optimistic concurrency");
assert.match(migration, /expected_updated_at is not null and target\.updated_at <> expected_updated_at/, "series: optimistic concurrency");
assert.match(migration, /'relatedProductIds', public\._product_relation_legacy_ids/, "release payload carries the lists");
assert.match(migration, /_collection_publish\(array\[target\.internal_id\]\)/, "relation change refreshes the product card");
assert.match(migration, /_collection_publish\(public\._series_member_ids/, "rename refreshes member cards");
assert.match(migration, /insert into public\.taxonomy_admin_audit/);
assert.match(migration, /insert into public\.product_admin_audit/);
assert.match(migration, /'brand', 'category', 'homepage', 'collection', 'attribute', 'series'/, "audit types keep every earlier entity");
assert.doesNotMatch(migration, /set\s+(stable_id|slug)\s*=/i, "series code stays read-only");
assert.doesNotMatch(migration, /create (or replace )?trigger|drop trigger/i, "no triggers (Supabase connector limitation)");
assert.doesNotMatch(migration, /^begin;|^commit;/m);
const deletes = [...migration.matchAll(/^\s*delete from public\.([a-z_]+)/gm)].map(match => match[1]);
assert.deepEqual(deletes, ["product_relations", "product_series"]);
assert.match(migration.split("\n").slice(0, 25).join("\n"), /delete from public\.product_relations[\s\S]*delete from public\.product_series/, "connector-unsafe statements named in the header");

// Storefront: the PDP engine fills the three rails; the bundle is rebuilt from the source module.
assert.match(pdp, /function accessoryProducts\(/);
assert.match(pdp, /function compatibleProducts\(/);
assert.match(pdp, /relatedProductIds/);
assert.ok(bundle.includes(pdp.trim()), "catalog-data.js rebuilt from catalog/pdp-engine.js");
assert.match(shell, /accessoryProducts\?\.\(product, 8\)/);
assert.match(shell, /compatibleProducts\?\.\(product, 8\)/);
assert.match(validator, /"relatedProductIds"/, "payload key is part of the canonical contract");

const card = (id, extra = {}) => ({ id, primaryCategoryId: "boilers", brandId: "b", normalizedAttributes: {}, price: 100, publicationStatus: "published", ...extra });
const sandbox = { window: {}, Map, Set, Object, Array, Number, String, Math };
sandbox.window.sofievkaCatalog = {
  attributeSchema: {}, attributeDefinitions: {}, brands: [],
  products: [
    card("p-1", { relatedProductIds: { accessory: ["a-1", "missing", "draft", "a-1", "p-1"], compatible: ["c-1"], similar: ["s-1"] } }),
    card("a-1", { primaryCategoryId: "chimneys" }), card("c-1", { primaryCategoryId: "boilers" }), card("s-1"),
    card("draft", { publicationStatus: "draft" }), card("auto-1"), card("auto-2"), card("auto-3"), card("auto-4")
  ]
};
vm.runInNewContext(pdp, sandbox);
const engine = sandbox.window.sofievkaPdp;
const product = sandbox.window.sofievkaCatalog.products[0];
assert.deepEqual(engine.accessoryProducts(product).map(item => item.id), ["a-1"], "missing, draft, duplicate and self skipped");
assert.deepEqual(engine.compatibleProducts(product).map(item => item.id), ["c-1"]);
const similar = engine.relatedProducts(product, 4).map(item => item.id);
assert.equal(similar[0], "s-1", "manual similar first");
assert.equal(similar.length, 4);
assert.ok(!similar.includes("c-1"), "automatic similar skip manually related products");
assert.equal(engine.accessoryProducts(card("x")).length, 0, "no lists, no rail");

// Admin wiring.
for (const rpc of ["admin_get_product_relations", "admin_set_product_relations", "admin_list_brand_series",
  "admin_create_series", "admin_update_series", "admin_delete_series"]) {
  assert.match(api, new RegExp(`"${rpc}"`), `${rpc} is exposed by the admin API`);
}
assert.match(products, /tab\("relations", "Пов’язані товари"\)/);
assert.match(products, /relationsPanel\(\)/);
assert.match(products, /bindRelationsPanel\(/);
assert.match(relations, /api\.relations\.set\(legacyId, lists, state\.token\)/);
assert.match(relations, /api\.collections\.searchProducts/);
assert.match(relations, /event\.stopPropagation\(\)/, "relation controls do not dirty the main product form");
assert.match(taxonomy, /seriesPanel\(canEdit\)/);
assert.match(taxonomy, /bindSeriesPanel\(container, \{ api, brandId: brand\.id \}\)/);
assert.match(series, /api\.series\.remove\(series\.id, series\.updatedAt, series\.productCount > 0\)/);
assert.match(series, /api\.series\.update\(state\.editing\.id, \{ name \}, state\.editing\.updatedAt\)/);
assert.match(series, /resetProductsCache\(\)/, "product editor sees new series");
for (const view of [relations, series]) assert.doesNotMatch(view, /innerHTML\s*=/, "views render through escaped templates and DOM nodes");
assert.match(css, /\/\* Related products and series \*\//);
assert.match(pkg.scripts["db:local:test"], /related-series-scenarios\.mjs/);
assert.equal(pkg.scripts["related:qa"], "node tests/related-series-qa.mjs");

console.log(JSON.stringify({ status: "ok", checks: "related-series-static" }));
