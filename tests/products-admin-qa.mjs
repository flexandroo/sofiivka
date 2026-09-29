import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const app = read("admin/admin.mjs");
const api = read("admin/admin-api.mjs");
const products = read("admin/admin-products.mjs");
const css = read("admin/admin.css");
const html = read("admin/index.html");
const migration = [
  read("supabase/migrations/20260929000600_products_admin_v1.sql"),
  read("supabase/migrations/20260929000700_products_admin_cache_revision.sql"),
  read("supabase/migrations/20260929000800_products_admin_pdp_wrapper_fix.sql"),
  read("supabase/migrations/20260929000900_products_admin_attribute_metadata.sql"),
  read("supabase/migrations/20260929001000_products_admin_relation_safety.sql")
].join("\n");

assert.ok(app.includes("path.match(/^\\/admin\\/products\\/([^/]+)$/)"));
assert.match(app, /createProductsListView/);
assert.match(app, /createProductEditorView/);
assert.match(products, /pageSize:\s*50/);
assert.match(products, /Назва, SKU, модель або бренд/);
for (const label of ["Основне", "Контент", "Характеристики", "Медіа", "Документи", "SEO"]) assert.match(products, new RegExp(label));
for (const action of ["publish", "hide", "category", "brand", "archive"]) assert.match(products, new RegExp(`value=\\"${action}\\"|\\"${action}\\"`));
assert.match(migration, /manual_' \|\| substr/);
assert.match(products, /Змін немає/);
assert.match(products, /beforeunload/);
assert.match(products, /data-mobile-filters/);
assert.match(products, /Source \/ unmapped evidence/);
assert.match(products, /Фільтр каталогу/);
assert.match(products, /categoryAttributes/);
assert.match(products, /AbortSignal|signal/);
assert.match(products, /Дублювання заплановане після v1/);

for (const rpc of ["admin_product_reference_data", "admin_list_products", "admin_get_product", "admin_create_product", "admin_save_product", "admin_bulk_products"]) {
  assert.match(api, new RegExp(rpc));
}
assert.match(api, /storage\/v1\/object/);
assert.doesNotMatch(`${app}\n${api}\n${products}\n${html}`, /service[_-]?role|sb_secret_|SUPABASE_ACCESS_TOKEN|DB_PASSWORD/i);
assert.doesNotMatch(api, /rest\/v1\/(products|product_media|product_documents)\?[^`]*method:\s*"(?:PATCH|POST|DELETE)"/i);

for (const functionName of ["admin_list_products", "admin_get_product", "admin_create_product", "admin_save_product", "admin_bulk_products", "_admin_refresh_catalog"]) {
  assert.match(migration, new RegExp(`function public\\.${functionName.replace("_", "_")}`));
}
assert.match(migration, /legacy_id is immutable/);
assert.match(migration, /Content manager cannot change product commercial/);
assert.match(migration, /Manager cannot change editorial content/);
assert.match(migration, /product_admin_audit/);
assert.match(migration, /catalog_admin_cache_revision/);
assert.match(migration, /Bulk brand change requires clearing or choosing series per product/);
assert.match(migration, /grant execute on function public\.admin_save_product\(jsonb\) to authenticated/);
assert.doesNotMatch(migration, /grant execute on function public\.admin_(?:save|create|bulk)[^;]+to anon/i);

assert.match(css, /\.admin-products-table/);
assert.match(css, /\.admin-editor-tabs/);
assert.match(css, /@media \(max-width: 620px\)/);
assert.doesNotMatch(css, /!important|linear-gradient|radial-gradient|backdrop-filter:\s*blur/i);
assert.match(html, /noindex,nofollow,noarchive/);

console.log(JSON.stringify({
  status: "ok",
  list: ["server-pagination", "search", "filters", "sorting", "bulk-actions"],
  editor: ["core", "content", "attributes", "media", "documents", "seo"],
  security: ["rpc-only-mutations", "role-contract", "immutable-legacy-id", "no-browser-secrets"],
  productionChanged: false
}));
