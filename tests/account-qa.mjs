// Customer accounts: static contract checks (npm run account:qa). Database behaviour is covered by
// tests/db-local/account-scenarios.mjs; this file checks wiring, security boundaries and conventions.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002001700_customer_accounts_v1.sql");
const client = read("customer-account.js");
const accountPage = read("account-page.js");
const crmClient = read("crm-client.js");
const shell = read("page-shell.js");
const build = read("scripts/build-static-site.mjs");
const adminAuth = read("admin/admin-auth.mjs");
const adminApp = read("admin/admin.mjs");
const adminCrm = read("admin/admin-crm.mjs");
const packageJson = JSON.parse(read("package.json"));
const pagesCss = read("pages.css");
const index = read("index.html");

// --- Migration -------------------------------------------------------------
assert.match(migration, /create table public\.customer_profiles \(\s*user_id uuid primary key references auth\.users \(id\) on delete cascade/);
assert.match(migration, /crm_customer_id uuid references public\.crm_customers \(internal_id\) on delete set null/);
assert.match(migration, /alter table public\.customer_profiles enable row level security/);
assert.match(migration, /revoke all on table public\.customer_profiles from public, anon, authenticated/);
assert.match(migration, /add column customer_user_id uuid references auth\.users \(id\) on delete set null/);
assert.doesNotMatch(migration, /^begin;|^commit;/m, "migrations run inside the runner's transaction");

// Every function: security definer + empty search_path.
const functions = [...migration.matchAll(/create or replace function (public\.[a-z_]+)\(([\s\S]*?)\)\s*returns[\s\S]*?as \$\$/g)];
assert.ok(functions.length >= 14, "migration defines the customer and admin functions");
for (const [definition, name] of functions) {
  assert.match(definition, /security definer/, `${name} is security definer`);
  assert.match(definition, /set search_path = ''/, `${name} pins search_path`);
}
// Customer RPCs: authenticated only.
for (const signature of ["customer_get_account()", "customer_get_order(bigint)", "customer_update_profile(jsonb)"]) {
  assert.ok(migration.includes(`revoke all on function public.${signature} from public, anon;`), `${signature} revoked from anon`);
  assert.ok(migration.includes(`grant execute on function public.${signature} to authenticated;`), `${signature} granted to authenticated`);
}
// Helpers are never callable from the API.
for (const helper of ["_customer_require_user()", "_customer_confirmed_email(uuid)", "_customer_ensure_profile(uuid)",
  "_customer_profile_json(uuid)", "_customer_visible_order(uuid, public.crm_orders)", "_customer_order_items_json(uuid)",
  "_customer_order_json(public.crm_orders, boolean)", "_customer_link_order(uuid, uuid, text, text, text, text)"]) {
  assert.ok(migration.includes(`revoke all on function public.${helper} from public, anon, authenticated;`), `${helper} is private`);
}
// History is unlocked only by the signed-in user id or the CONFIRMED email, never by a typed phone.
assert.match(migration, /email_confirmed_at is not null/);
assert.match(migration, /coalesce\(target_order\.customer_user_id = target_user, false\)/, "NULL never means visible");
assert.doesNotMatch(migration.match(/function public\._customer_visible_order[\s\S]*?\$\$;/)[0], /phone/);
// Staff-only order fields stay private.
const orderJson = migration.match(/function public\._customer_order_json[\s\S]*?\$\$;/)[0];
for (const field of ["manager_comment", "assigned_to", "client_fingerprint", "crm_activity"]) assert.ok(!orderJson.includes(field), `${field} is not exposed`);
// Messages for customers are Ukrainian.
for (const message of migration.matchAll(/message = '([^']+)'/g)) assert.match(message[1], /[А-Яа-яІіЇїЄєҐґ]|Not authorized/, `Ukrainian message: ${message[1]}`);

// crm_submit_order keeps its contract: same signature, grants, anonymous path, plus the signed-in link.
assert.match(migration, /create or replace function public\.crm_submit_order\(payload jsonb\)\s*returns jsonb/);
assert.match(migration, /grant execute on function public\.crm_submit_order\(jsonb\) to anon, authenticated/);
assert.match(migration, /signed_in_user uuid := \(select account\.id from auth\.users account where account\.id = auth\.uid\(\)\)/);
assert.match(migration, /if signed_in_user is not null then\s*perform public\._customer_link_order/);
for (const kept of ["_crm_enforce_rate_limit('order'", "payload ->> 'website'", "publication_status = 'published'",
  "case when product.price_status = 'known' then product.amount end", "payload ->> 'pickupStore'"]) {
  assert.ok(migration.includes(kept), `crm_submit_order keeps ${kept}`);
}
// The redefinition must start from the latest version (site_settings_v1 added pickupStore).
const settingsMigration = read("supabase/migrations/20261002000300_site_settings_v1.sql");
const latestBefore = settingsMigration.match(/create or replace function public\.crm_submit_order[\s\S]*?\$\$;/)[0];
const ours = migration.match(/create or replace function public\.crm_submit_order[\s\S]*?\$\$;/)[0];
const strip = sql => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ")
  .replace(" signed_in_user uuid := (select account.id from auth.users account where account.id = auth.uid());", "")
  .replace(", customer_user_id )", " )").replace(", signed_in_user )", " )")
  .replace("case when signed_in_user is null then 'Замовлення з сайту' else 'Замовлення з сайту (особистий кабінет)' end", "'Замовлення з сайту'")
  .replace(/ if signed_in_user is not null then perform public\._customer_link_order\([^;]*\); end if;/, "");
assert.equal(strip(ours), strip(latestBefore), "crm_submit_order differs from the 0300 version only by the account link");
for (const later of fs.readdirSync(path.join(root, "supabase/migrations")).filter(name => name.slice(0, 14) > "20261002000300" && name.slice(0, 14) < "20261002001700")) {
  assert.ok(!read(`supabase/migrations/${later}`).includes("function public.crm_submit_order"), `${later} does not redefine crm_submit_order`);
}
// Admin: "has account" + the NOT IN / NULL hardening.
assert.match(migration, /'hasAccount', exists \(select 1 from public\.customer_profiles/);
assert.match(migration, /perform public\._crm_require_staff\(\);[\s\S]*'hasAccount'/);
assert.match(migration, /if role_value is null or role_value not in \('owner', 'admin', 'manager'\)/);
assert.match(adminCrm, /customer\.hasAccount/);
assert.match(adminCrm, /function accountBadge\(\)/);

// --- Storefront auth client ---------------------------------------------------
assert.match(client, /sofievka\.customer\.session\.\$\{projectRef\}/, "customer session key");
assert.match(adminAuth, /sofievka\.admin\.session\.\$\{projectRef\}/, "staff session key stays separate");
for (const endpoint of ["/auth/v1/token?grant_type=password", "/auth/v1/token?grant_type=refresh_token", "/auth/v1/signup?redirect_to=",
  "/auth/v1/recover?redirect_to=", "/auth/v1/user", "/auth/v1/logout"]) assert.ok(client.includes(endpoint), `uses ${endpoint}`);
assert.match(client, /returnAddress\("\/account"\)/, "email links return to /account");
assert.match(client, /history\.replaceState\(null, "", location\.pathname \+ location\.search\)/, "tokens are removed from the URL");
assert.doesNotMatch(client, /service_role|sb_secret_/);
assert.doesNotMatch(client, /\/rest\/v1\/(?!rpc\/)/, "no direct table access");
for (const rpc of ["customer_get_account", "customer_get_order", "customer_update_profile"]) assert.ok(client.includes(`"${rpc}"`), `${rpc} wired`);
assert.doesNotMatch(client, /["`']admin_|rpc\/admin_/, "customer client never calls admin RPCs");
assert.doesNotMatch(client, /\bimport\b|require\(/, "no dependencies");

// Behaviour of the client in a sandbox: header decoration and session storage.
const storage = new Map();
const header = [{ classes: new Set(), attrs: {}, label: { textContent: "Увійти" } }];
const sandbox = {
  window: { SOFIEVKA_CATALOG_CONFIG: { supabase: { url: "https://wfxcklglujgramasdzyr.supabase.co", publishableKey: "sb_publishable_x", projectRef: "wfxcklglujgramasdzyr" } }, addEventListener() {} },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  document: {
    readyState: "complete",
    addEventListener() {},
    querySelectorAll: () => header.map(link => ({
      classList: { toggle: (name, on) => on ? link.classes.add(name) : link.classes.delete(name) },
      setAttribute: (name, value) => { link.attrs[name] = value; },
      querySelector: () => link.label
    }))
  },
  location: { origin: "https://sofievka.vercel.app", pathname: "/account", search: "", hash: "" },
  history: { replaceState() {} },
  URL, URLSearchParams, AbortSignal, Date, JSON, Math, Number, String, Boolean, Promise, Error, Set, Map, Object, console,
  fetch: async () => { throw new Error("no network in static QA"); }
};
vm.createContext(sandbox);
vm.runInContext(client, sandbox);
const account = sandbox.window.sofievkaAccount;
assert.equal(account.available, true);
assert.equal(account.storageKey, "sofievka.customer.session.wfxcklglujgramasdzyr");
assert.equal(account.currentUser(), null);
assert.equal(header[0].label.textContent, "Увійти");
storage.set(account.storageKey, JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: 9999999999, user: { id: "u1", email: "ivan@example.test" } }));
account.decorateHeader(sandbox.document);
assert.equal(header[0].label.textContent, "Кабінет");
assert.ok(header[0].classes.has("is-signed-in"));
assert.equal(account.currentUser().email, "ivan@example.test");
await account.signOut();
assert.equal(storage.has(account.storageKey), false, "sign-out clears the session even offline");
assert.equal(header[0].label.textContent, "Увійти");

// --- Account page, checkout, header ---------------------------------------------
for (const view of ["data-account-form=\"signin\"", "data-account-form=\"signup\"", "data-account-form=\"reset\"", "data-account-recovery",
  "data-account-profile", "data-account-password", "data-account-repeat", "data-account-signout"]) {
  assert.ok(accountPage.includes(view), `account page has ${view}`);
}
assert.match(accountPage, /const CART_KEY = "sofievka-cart"/, "repeat order uses the storefront cart storage");
assert.match(accountPage, /Math\.min\(999,/, "cart quantities stay within the checkout limit");
assert.match(accountPage, /item\.available && item\.productId/, "only products still on sale are re-added");
assert.match(accountPage, /\^\\\/\(\?!\\\/\)/, "next= accepts same-site paths only");
assert.ok((accountPage.match(/\besc\(/g) || []).length >= 30, "account page escapes server data");
assert.match(shell, /data-account-link/, "page header has the account entry");
assert.match(index, /data-account-link/, "homepage header has the account entry");
assert.match(shell, /if\(name==="account"\) bindAccountPage\(\)/);
assert.doesNotMatch(shell, /Авторизація ще не підключена/, "the visual stub is gone");
assert.match(shell, /prefillCheckout\(form\)/);
assert.match(shell, /if\(input&&!input\.value&&value\) input\.value=value/, "prefill never overwrites typed values");
assert.match(shell, /window\.sofievkaAccount\?\.decorateHeader\(root\)/);
assert.match(crmClient, /if \(accessToken && response\.status === 401\) return call\(name, payload, null\)/, "expired customer token falls back to anonymous checkout");
assert.match(crmClient, /submitLead: payload => call\("crm_submit_lead", payload\)/, "leads stay anonymous");
assert.match(build, /customer-account\.js\?v=/, "build injects the customer client into storefront pages");
assert.ok(fs.existsSync(path.join(root, "customer-account.js")) && fs.existsSync(path.join(root, "account-page.js")));

// --- Admin SPA rejects customers ---------------------------------------------
assert.match(adminApp, /function isAuthorizedProfile\(profile\) \{\s*return Boolean\(profile\?\.active && ROLES\.has\(profile\.role\)\);/);
assert.match(adminApp, /if \(!isAuthorizedProfile\(profile\)\) return renderAccessDenied\(profile\)/);
assert.match(adminApp, /Обліковий запис покупця/);
assert.doesNotMatch(read("admin/index.html"), /customer-account\.js/, "admin never loads the customer client");

// --- Styles and scripts -------------------------------------------------------------
const css = pagesCss.replace(/\/\*[\s\S]*?\*\//g, "");
assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, "pages.css: balanced braces");
for (const selector of [".account-layout", ".account-orders", ".account-items", ".account-status--done", ".checkout-account"]) assert.ok(pagesCss.includes(selector), `${selector} styled`);
assert.equal(packageJson.scripts["account:qa"], "node tests/account-qa.mjs");
assert.match(packageJson.scripts["db:local:test"], /harness\.mjs account-scenarios\.mjs/);

console.log(JSON.stringify({ status: "ok", suite: "account-qa", functions: functions.length }));
