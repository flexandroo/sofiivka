// Static contract for CRM notifications v1 (migration, edge function, admin wiring, setup docs).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002001200_crm_notifications_v1.sql");
const fn = read("supabase/functions/crm-notify/index.ts");
const config = read("supabase/config.toml");
const api = read("admin/admin-api.mjs");
const view = read("admin/admin-settings.mjs");
const css = read("admin/admin.css");
const docs = read("docs/notifications-setup.md");

// Migration: private config and log, guarded pg_net, safe triggers, owner/admin RPCs.
assert.match(migration, /SQL Editor/, "header says which statements need the SQL Editor");
assert.match(migration, /create extension if not exists pg_net with schema extensions/);
assert.match(migration, /pg_available_extensions/, "extension creation is guarded");
assert.match(migration, /alter table public\.crm_notify_config enable row level security/);
assert.match(migration, /revoke all on table public\.crm_notify_config from public, anon, authenticated/);
assert.match(migration, /alter table public\.crm_notification_log enable row level security/);
assert.match(migration, /revoke all on table public\.crm_notification_log from public, anon, authenticated/);
assert.match(migration, /execute 'select net\.http_post\(/, "pg_net is called through dynamic SQL");
assert.match(migration, /_crm_has_pg_net\(\)/);
assert.match(migration, /create trigger crm_orders_notify after insert on public\.crm_orders/);
assert.match(migration, /create trigger crm_leads_notify after insert on public\.crm_leads/);
const trigger = migration.slice(migration.indexOf("function public._crm_notify_after_insert()"));
assert.match(trigger.slice(0, 900), /exception when others then/, "trigger swallows every error");
assert.match(migration, /x-crm-notify-secret/);
assert.match(migration, /notifyOrders/);
assert.match(migration, /notifyLeads/);
assert.match(migration, /can_admin_catalog\(\)/, "status and test for owner/admin");
assert.match(migration, /revoke all on function public\._crm_notify_enqueue\(text, bigint, uuid\) from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.admin_notifications_status\(\) to authenticated/);
assert.match(migration, /grant execute on function public\.admin_notifications_send_test\(\) to authenticated/);
assert.doesNotMatch(migration, /'secret', config\.secret|'secret', /, "status never returns the secret");
assert.doesNotMatch(migration, /^begin;|^commit;/m);

// Edge function: shared secret, service role summary, escaped HTML, Telegram only, email disabled.
assert.match(fn, /from "jsr:@supabase\/supabase-js@2"/);
assert.match(fn, /x-crm-notify-secret/);
assert.match(fn, /CRM_NOTIFY_SECRET/);
assert.match(fn, /TELEGRAM_BOT_TOKEN/);
assert.match(fn, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(fn, /ADMIN_BASE_URL/);
assert.match(fn, /https:\/\/sofievka\.vercel\.app/);
assert.match(fn, /parse_mode: "HTML"/);
assert.match(fn, /\/admin\/orders\//);
assert.match(fn, /\/admin\/leads\//);
assert.match(fn, /const EMAIL_ENABLED = false/);
assert.match(fn, /crm_notification_log/);
assert.doesNotMatch(fn, /\$\{order\.contact_name\}|\$\{lead\.message\}/, "customer text is always escaped");
assert.match(config, /\[functions\.crm-notify\]\s*\n(#.*\n)?verify_jwt = false/);

// Admin: real status instead of the old "not connected" note, test button, no innerHTML writes.
assert.match(api, /"admin_notifications_status"/);
assert.match(api, /"admin_notifications_send_test"/);
assert.doesNotMatch(view, /відправку ще не підключено/);
assert.match(view, /Надіслати тестове повідомлення/);
assert.match(view, /data-notify-test/);
assert.doesNotMatch(view, /innerHTML\s*=/);
assert.match(css, /\.admin-notify-status/);
const opens = (css.match(/{/g) || []).length;
const closes = (css.match(/}/g) || []).length;
assert.equal(opens, closes, "admin.css braces balanced");

// Owner how-to.
assert.match(docs, /@BotFather/);
assert.match(docs, /CRM_NOTIFY_SECRET/);
assert.match(docs, /crm_notify_config/);
assert.match(docs, /--no-verify-jwt/);
assert.match(docs, /getUpdates/);

console.log(JSON.stringify({ status: "ok", suite: "notifications-qa" }));
