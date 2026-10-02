// Static contract for CRM notifications v1 (migration, edge function, admin wiring, setup docs).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

// Edge function: shared secret, service role summary, escaped HTML, Telegram and email (Resend).
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
assert.doesNotMatch(fn, /EMAIL_ENABLED/, "email is no longer switched off in code");
assert.match(fn, /https:\/\/api\.resend\.com\/emails/);
assert.match(fn, /RESEND_API_KEY/);
assert.match(fn, /NOTIFY_EMAIL_FROM/);
assert.match(fn, /crm_notification_log/);
// Plain-text subject lines aside, customer values only reach the HTML body through html().
const fnBodies = fn.split("\n").filter(line => !line.includes("subjectText(")).join("\n");
assert.doesNotMatch(fnBodies, /\$\{order\.contact_name\}|\$\{lead\.message\}/, "customer text is always escaped");
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
assert.match(docs, /Resend/);
assert.match(docs, /RESEND_API_KEY/);
assert.match(docs, /NOTIFY_EMAIL_FROM/);
assert.match(docs, /onboarding@resend\.dev/);
assert.doesNotMatch(docs, /Email-сповіщення поки \*\*не надсилаються\*\*/);
assert.doesNotMatch(view, /Email поки не надсилається/);

// Edge function at runtime (Node strips the TypeScript types): Deno, Supabase and the two HTTP APIs
// are stubbed, so the channel logic and the email payload are checked without any network.
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-notify-qa-"));
try {
  const source = fn.replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";$/m, "const createClient = globalThis.__crmNotifyCreateClient;");
  assert.notEqual(source, fn, "import line replaced for the stub");
  fs.writeFileSync(path.join(runtimeDir, "crm-notify.mts"), source);
  const env = {};
  let handler = null;
  let logUpdate = null;
  let settings = {};
  const sent = [];
  globalThis.Deno = { env: { get: name => env[name] }, serve: fn => { handler = fn; } };
  const order = { number: 42, source: "site", contact_name: "Іван <b>Петренко</b>", contact_phone: "+380501112233", contact_email: "",
    delivery_method: "carrier", delivery_city: "Київ", delivery_point: "НП №1", customer_comment: "Подзвоніть & уточніть", items_count: 2, items_total: 1500, has_unpriced_items: false };
  globalThis.__crmNotifyCreateClient = () => ({
    from(table) {
      const query = {
        select: () => query,
        eq: () => query,
        update: values => { logUpdate = values; return { eq: async () => ({}) }; },
        maybeSingle: async () => ({ data: table === "site_settings" ? { value: settings } : table === "crm_orders" ? order : null, error: null })
      };
      return query;
    }
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sent.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
    const resend = String(url).startsWith("https://api.resend.com/");
    return { ok: true, status: 200, json: async () => (resend ? { id: "email-1" } : { ok: true }) };
  };
  try {
    await import(pathToFileURL(path.join(runtimeDir, "crm-notify.mts")).href);
    assert.equal(typeof handler, "function", "Deno.serve received the handler");
    const call = body => handler(new Request("https://fn.test/crm-notify", {
      method: "POST", headers: { "x-crm-notify-secret": "s".repeat(24), "Content-Type": "application/json" }, body: JSON.stringify(body)
    }));
    Object.assign(env, { CRM_NOTIFY_SECRET: "s".repeat(24), SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" });

    // Telegram only, no email secrets: email is skipped and the reason says so; Telegram still sends.
    env.TELEGRAM_BOT_TOKEN = "123:abc";
    settings = { telegramChatIds: ["111"], emails: ["boss@example.com"] };
    let response = await call({ kind: "order", number: 42, logId: 7 });
    assert.equal(response.status, 200);
    assert.equal(logUpdate.status, "sent");
    assert.equal(logUpdate.details.email, "skipped");
    assert.match(logUpdate.reason, /Email пропущено: не задано секрети RESEND_API_KEY і NOTIFY_EMAIL_FROM/);
    assert.equal(sent.length, 1);
    assert.match(sent[0].body.text, /Іван &lt;b&gt;Петренко&lt;\/b&gt;/, "telegram text escaped");

    // Both channels: one Resend request with the same escaped content as HTML and as plain text.
    sent.length = 0;
    Object.assign(env, { RESEND_API_KEY: "re_test", NOTIFY_EMAIL_FROM: "Софіївка <orders@example.com>" });
    settings = { telegramChatIds: ["111"], emails: ["boss@example.com", "sales@example.com"] };
    response = await call({ kind: "order", number: 42, logId: 8 });
    assert.equal(response.status, 200);
    assert.equal(logUpdate.status, "sent");
    assert.equal(logUpdate.reason, "");
    const email = sent.find(item => item.url === "https://api.resend.com/emails");
    assert.ok(email, "Resend called");
    assert.equal(email.headers.Authorization, "Bearer re_test");
    assert.equal(email.headers["Idempotency-Key"], "crm-notify-8");
    assert.deepEqual(email.body.to, ["boss@example.com", "sales@example.com"]);
    assert.equal(email.body.from, "Софіївка <orders@example.com>");
    assert.match(email.body.subject, /^Нове замовлення №42/);
    assert.doesNotMatch(email.body.subject, /\n/);
    assert.match(email.body.html, /<b>Нове замовлення №42<\/b>/);
    assert.match(email.body.html, /Іван &lt;b&gt;Петренко&lt;\/b&gt;/, "customer markup stays escaped in the email");
    assert.match(email.body.html, /Подзвоніть &amp; уточніть/);
    assert.match(email.body.html, /<br>/);
    assert.match(email.body.html, /href="https:\/\/sofievka\.vercel\.app\/admin\/orders\/42"/);
    assert.match(email.body.text, /Іван <b>Петренко<\/b>/, "plain text shows the literal value");
    assert.match(email.body.text, /Відкрити в адмінці: https:\/\/sofievka\.vercel\.app\/admin\/orders\/42/);
    assert.doesNotMatch(email.body.text, /<a |&amp;|&lt;/);
    assert.deepEqual(logUpdate.details.email, { ok: true, recipients: 2, id: "email-1" });

    // Email only (no bot token, no chat ids) still sends; nothing configured is an error with a reason.
    sent.length = 0;
    delete env.TELEGRAM_BOT_TOKEN;
    settings = { telegramChatIds: [], emails: ["boss@example.com"] };
    response = await call({ kind: "test", logId: 9 });
    assert.equal(response.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.subject, "Тестове повідомлення — сповіщення сайту");
    delete env.RESEND_API_KEY;
    response = await call({ kind: "test", logId: 10 });
    assert.equal(response.status, 500);
    assert.equal(logUpdate.status, "error");
    assert.match(logUpdate.reason, /RESEND_API_KEY/);
    settings = { telegramChatIds: ["111"], emails: [] };
    response = await call({ kind: "test", logId: 11 });
    assert.match(logUpdate.reason, /TELEGRAM_BOT_TOKEN/);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.Deno;
    delete globalThis.__crmNotifyCreateClient;
  }
} finally {
  fs.rmSync(runtimeDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ status: "ok", suite: "notifications-qa" }));
