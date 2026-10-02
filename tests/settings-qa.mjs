import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002000300_site_settings_v1.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const view = read("admin/admin-settings.mjs");
const runtime = read("site-settings.js");
const build = read("scripts/build-static-site.mjs");

// Database contract: table closed to clients, RPC writes for owner/admin only, public read hides recipients.
assert.match(migration, /alter table public\.site_settings enable row level security/);
assert.match(migration, /revoke all on table public\.site_settings from public, anon, authenticated/);
assert.match(migration, /can_admin_catalog\(\)/, "owner/admin edit settings");
assert.match(migration, /grant execute on function public\.get_site_settings\(\) to anon, authenticated/);
assert.match(migration, /revoke all on function public\.admin_update_settings\(text, jsonb, timestamptz\) from public, anon/);
assert.match(migration, /setting\.key in \('stores', 'checkout', 'social', 'company'\)/, "notifications stay private");
assert.match(migration, /pickupStore/, "pickup orders keep the chosen shop");
assert.doesNotMatch(migration, /^begin;|^commit;/m);

// Admin wiring.
assert.match(api, /"admin_get_settings"/);
assert.match(api, /"admin_update_settings"/);
assert.match(app, /path === "\/admin\/settings" \? \(\) => createSettingsView/);
assert.doesNotMatch(app, /settings: \{\s*eyebrow/, "settings placeholder removed");
assert.match(view, /api\.settings\.update\(key, READERS\[key\]\(form\), sections\?\.\[key\]\?\.updatedAt/);
assert.doesNotMatch(view, /innerHTML\s*=/, "views render through escaped templates");

// Storefront runtime.
assert.match(runtime, /rpc\/get_site_settings/);
assert.doesNotMatch(runtime, /innerHTML/, "settings never render as HTML");
assert.match(build, /site-settings\.js\?v=/);

console.log(JSON.stringify({ status: "ok", suite: "settings-qa" }));
