import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261001000200_crm_v1.sql");
const ordersV2 = read("supabase/migrations/20261002000700_crm_orders_v2.sql");
const css = read("admin/admin.css");
const packageJson = JSON.parse(read("package.json"));
const consistency = read("supabase/migrations/20261001000100_admin_write_consistency.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const crm = read("admin/admin-crm.mjs");
const env = read("admin/admin-env.mjs");
const client = read("crm-client.js");
const shell = read("page-shell.js");
const home = read("script.js");
const build = read("scripts/build-static-site.mjs");

// Database contract.
for (const table of ["crm_customers", "crm_orders", "crm_order_items", "crm_leads", "crm_activity", "crm_submission_log"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must have RLS`);
}
assert.match(migration, /revoke all on table public\.crm_customers[\s\S]+from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.crm_submit_order\(jsonb\) to anon, authenticated/);
assert.match(migration, /grant execute on function public\.crm_submit_lead\(jsonb\) to anon, authenticated/);
assert.match(migration, /current_admin_role\(\) in \('owner', 'admin', 'manager'\)/, "content managers stay out of CRM");
assert.match(migration, /case when product\.price_status = 'known' then product\.amount end/, "prices come from the catalogue");
assert.match(migration, /publication_status = 'published'/, "only published products can be ordered");
assert.match(migration, /_crm_enforce_rate_limit/);
assert.match(migration, /payload ->> 'website'/, "honeypot");
assert.doesNotMatch(migration, /^begin;|^commit;/m);
assert.match(consistency, /current_user <> 'authenticated'/);
assert.match(consistency, /is_active_admin\(\)/);

// Admin UI wiring.
for (const rpc of ["admin_crm_overview", "admin_crm_list_orders", "admin_crm_get_order", "admin_crm_update_order",
  "admin_crm_list_leads", "admin_crm_get_lead", "admin_crm_update_lead", "admin_crm_list_customers",
  "admin_crm_get_customer", "admin_crm_update_customer", "admin_crm_add_note"]) {
  assert.match(api, new RegExp(`"${rpc}"`), `${rpc} is exposed by the admin API`);
}
for (const route of ["/admin/orders", "/admin/leads", "/admin/customers"]) assert.ok(app.includes(`"${route}"`), `${route} route`);
assert.match(crm, /expected_updated_at|updatedAt/);
assert.doesNotMatch(app, /assertDevRuntime|DEV_PROJECT_REF/);
assert.match(env, /fkjarsouuchjiedrrblc/);
assert.match(env, /isProduction && runtime\.environment !== "production"/);

// Orders v2: line editing, manual orders, export, print.
for (const signature of ["admin_crm_update_order_items(bigint, jsonb, timestamptz)", "admin_crm_create_order(jsonb)",
  "admin_crm_search_products(text, integer)", "admin_crm_export_orders(text, public.crm_order_status, integer, integer)",
  "admin_crm_export_customers(text, integer, integer)", "admin_crm_get_order(bigint)"]) {
  assert.ok(ordersV2.includes(`'public.${signature}'`), `${signature} is granted to authenticated only`);
}
assert.match(ordersV2, /revoke all on function %s from public, anon/);
assert.match(ordersV2, /grant execute on function %s to authenticated/);
for (const helper of ["_crm_parse_quantity(jsonb)", "_crm_parse_amount(jsonb)", "_crm_resolve_order_lines(uuid, jsonb)",
  "_crm_order_lines_json(uuid)", "_crm_order_lines_diff(jsonb, jsonb)", "_crm_write_order_lines(uuid, jsonb)"]) {
  assert.ok(ordersV2.includes(`revoke all on function public.${helper} from public, anon, authenticated`), `${helper} is internal`);
}
const v2Functions = ordersV2.split(/create or replace function /).slice(1);
for (const body of v2Functions) {
  assert.match(body, /set search_path = ''/, `${body.slice(0, 40)} pins search_path`);
  if (body.startsWith("public.admin_crm_")) {
    assert.match(body, /security definer/, `${body.slice(0, 40)} is security definer`);
    assert.match(body, /_crm_require_staff\(\)/, `${body.slice(0, 40)} checks the CRM role`);
  }
}
assert.match(ordersV2, /round\(\(entry\.line ->> 'unit_amount'\)::numeric \* \(entry\.line ->> 'quantity'\)::integer, 2\)/, "line totals are computed on the server");
assert.match(ordersV2, /expected_updated_at is not null and target\.updated_at <> expected_updated_at/, "optimistic concurrency for line edits");
assert.match(ordersV2, /'manual'/, "manual orders are marked as such");
assert.match(ordersV2, /'Склад замовлення змінено'/, "line edits are audited");
assert.match(ordersV2, /least\(coalesce\(page_size, 500\), 1000\)/, "export pages are capped");
assert.doesNotMatch(ordersV2, /create or replace function public\.crm_submit_order/, "storefront checkout is untouched");
assert.doesNotMatch(ordersV2, /^begin;|^commit;|create trigger/m);
for (const method of ["updateOrderItems", "createOrder", "searchProducts", "exportOrders", "exportCustomers"]) assert.match(api, new RegExp(`${method}:`));
for (const rpc of ["admin_crm_update_order_items", "admin_crm_create_order", "admin_crm_search_products", "admin_crm_export_orders", "admin_crm_export_customers"]) {
  assert.match(api, new RegExp(`"${rpc}"`), `${rpc} is exposed by the admin API`);
}
assert.ok(app.includes('"/admin/orders/new"'), "manual order route");
assert.match(app, /\\\/print\$/, "print route");
assert.match(crm, /\\uFEFF/, "CSV starts with a UTF-8 BOM");
assert.match(crm, /join\(";"\)/, "CSV uses a semicolon separator");
assert.match(crm, /\[=\+\\-@/, "CSV guards against formula injection");
assert.match(crm, /\[ЗАПОВНИТИ/, "seller requisites are explicit placeholders");
assert.doesNotMatch(crm, /UA\d{27}/, "no invented IBAN");
assert.match(crm, /Магазин самовивозу/, "pickup store label");
assert.match(css, /@media print/);
assert.match(css, /@page \{ size: A4/);
assert.match(packageJson.scripts["db:local:test"], /crm-v2-scenarios\.mjs/);

// Storefront.
assert.match(client, /crm_submit_order/);
assert.match(client, /crm_submit_lead/);
assert.doesNotMatch(client, /service_role|sb_secret_/);
assert.doesNotMatch(shell, /Замовлення не надсилається/);
assert.match(shell, /sofievkaCrm\.submitOrder/);
assert.match(shell, /data-lead-form="partner_spec"/);
assert.match(shell, /data-lead-form="contact"/);
assert.match(home, /crm\.submitLead/);
assert.match(build, /crm-client\.js/);

console.log(JSON.stringify({ status: "ok", checks: "crm-static" }));
