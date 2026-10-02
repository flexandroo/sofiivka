// SEO and integrations settings: public read, validation of analytics ids and page overrides.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000041",
  manager: "00000000-0000-4000-8000-000000000042"
};

async function as(db, role, userId, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  if (role) await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec("reset role"); }
}

async function expectError(promise, pattern, label) {
  try { await promise; } catch (error) {
    assert.match(error.message, pattern, `${label}: unexpected error ${error.message}`);
    return error;
  }
  assert.fail(`${label}: expected an error`);
}

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const update = (db, section, value) => as(db, "authenticated", STAFF.owner,
  () => one(db, "select public.admin_update_settings($1, $2, null) r", [section, value]));
const publicSettings = async db => (await as(db, "anon", null, () => one(db, "select public.get_site_settings() r"))).r;

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager')`,
    [STAFF.owner, STAFF.manager]);

  // 1. Seeded empty sections are public; notifications stay private; unknown keys still refused.
  let settings = await publicSettings(db);
  assert.deepEqual(settings.integrations, { ga4MeasurementId: "", gtmContainerId: "", metaPixelId: "", searchConsoleToken: "" });
  assert.deepEqual(settings.seo, { pages: [] });
  assert.equal("notifications" in settings, false);
  await expectError(db.query("insert into public.site_settings (key, value) values ('secrets', '{}')"), /site_settings_key_check/, "unknown key");

  // 2. Integrations: ids normalised, junk keys dropped, bad formats refused, manager cannot write.
  const saved = (await update(db, "integrations", {
    ga4MeasurementId: " g-abc123def4 ", gtmContainerId: "gtm-k7xq2p", metaPixelId: "123456789012345",
    searchConsoleToken: "AbC_def-1234567890xyz", script: "<script>alert(1)</script>"
  })).r.sections.integrations.value;
  assert.deepEqual(saved, { ga4MeasurementId: "G-ABC123DEF4", gtmContainerId: "GTM-K7XQ2P", metaPixelId: "123456789012345", searchConsoleToken: "AbC_def-1234567890xyz" });
  assert.deepEqual((await publicSettings(db)).integrations, saved);
  await expectError(update(db, "integrations", { ga4MeasurementId: "UA-12345-1" }), /G-XXXX/, "universal analytics id");
  await expectError(update(db, "integrations", { gtmContainerId: "GTM-<x>" }), /GTM-XXXX/, "bad gtm");
  await expectError(update(db, "integrations", { metaPixelId: "12ab" }), /лише цифри/, "bad pixel");
  await expectError(update(db, "integrations", { searchConsoleToken: '"><script>' }), /content/, "bad verification token");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_update_settings('integrations', $1, null)", [{}])),
    /власник і адміністратор/, "manager write");
  const cleared = (await update(db, "integrations", {})).r.sections.integrations.value;
  assert.deepEqual(cleared, { ga4MeasurementId: "", gtmContainerId: "", metaPixelId: "", searchConsoleToken: "" });

  // 3. SEO page overrides: paths normalised, catalogue/product/brand templates and duplicates refused.
  const pages = (await update(db, "seo", { pages: [
    { path: "/Delivery.html", title: " Доставка по Україні ", description: "Як ми доставляємо.", extra: 1 },
    { path: "/index", title: "Головна", description: "" },
    { path: "/about/", title: "", description: "Про компанію" }
  ] })).r.sections.seo.value.pages;
  assert.deepEqual(pages.map(page => page.path), ["/delivery", "/", "/about"]);
  assert.equal(pages[0].title, "Доставка по Україні");
  assert.equal("extra" in pages[0], false);
  assert.equal((await publicSettings(db)).seo.pages.length, 3);
  await expectError(update(db, "seo", { pages: [{ path: "/delivery" }, { path: "/delivery.html" }] }), /повторюється/, "duplicate path");
  await expectError(update(db, "seo", { pages: [{ path: "/catalog" }] }), /картках/, "catalog path");
  await expectError(update(db, "seo", { pages: [{ path: "/brands/wilo" }] }), /першого рівня/, "nested path");
  await expectError(update(db, "seo", { pages: [{ path: "https://evil.example/" }] }), /першого рівня/, "absolute url");
  await expectError(update(db, "seo", { pages: [{ path: "/faq", title: "x".repeat(121) }] }), /120/, "long title");
  await expectError(update(db, "seo", { pages: "nope" }), /Некоректні/, "pages not a list");

  // 4. Audit rows for both new sections.
  const audit = await one(db, "select count(*) filter (where key = 'integrations')::int i, count(*) filter (where key = 'seo')::int s from public.site_settings_audit");
  assert.equal(audit.i, 2);
  assert.equal(audit.s, 1);

  console.log(JSON.stringify({ status: "ok", scenarios: 4, suite: "seo" }));
}
