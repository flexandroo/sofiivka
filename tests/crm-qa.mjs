import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261001000200_crm_v1.sql");
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
