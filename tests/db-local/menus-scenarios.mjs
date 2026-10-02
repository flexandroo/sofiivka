// Menus and cookie consent settings: seeds, public read, link and limit validation, older sections intact.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000051",
  manager: "00000000-0000-4000-8000-000000000052"
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
const link = (label, href) => ({ label, href });

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager')`,
    [STAFF.owner, STAFF.manager]);

  // 1. Seeds are public and equal the menus the storefront showed before; every older key still public/private as before.
  let settings = await publicSettings(db);
  assert.deepEqual(settings.menus.header.map(item => [item.label, item.href]), [
    ["Про нас", "/about.html"], ["Рішення", "/solutions.html"], ["Монтаж", "/installation.html"],
    ["Сервіс", "/service-center.html"], ["Доставка й оплата", "/delivery.html"], ["Контакти", "/contact.html"]
  ]);
  assert.deepEqual(settings.menus.footer.map(column => [column.title, column.links.length]), [["Послуги", 4], ["Покупцям", 5], ["Компанія", 5]]);
  assert.deepEqual(settings.cookies, {
    enabled: false,
    text: "Ми використовуємо cookie, щоб сайт працював, а з вашої згоди — ще й для аналітики та реклами.",
    privacyHref: "/privacy.html"
  });
  for (const key of ["stores", "checkout", "social", "company", "integrations", "seo", "menus", "cookies"]) assert.ok(key in settings, `${key} is public`);
  assert.equal("notifications" in settings, false, "notification recipients stay private");
  // Seeds pass their own validator unchanged (saving them as-is is a no-op).
  const reSaved = (await update(db, "menus", settings.menus)).r.sections.menus.value;
  assert.deepEqual(reSaved, settings.menus);
  assert.equal((await one(db, "select count(*)::int c from public.site_settings_audit where key = 'menus'")).c, 0, "no-op save writes no audit row");

  // 2. Menus: trimmed, unknown keys dropped, children kept in order, https links allowed.
  const menus = (await update(db, "menus", {
    header: [
      { label: "  Каталог ", href: "/catalog", extra: "x", children: [link("Опалення", "/catalog/heating"), link("Блог партнера", "https://example.com/blog?a=1")] },
      { label: "Контакти", href: "/contact.html" }
    ],
    footer: [{ title: " Покупцям ", links: [link("Доставка", "/delivery.html"), link("Ціни", "/product.html?id=a&b=1")], hidden: true }]
  })).r.sections.menus.value;
  assert.deepEqual(menus, {
    header: [
      { label: "Каталог", href: "/catalog", children: [link("Опалення", "/catalog/heating"), link("Блог партнера", "https://example.com/blog?a=1")] },
      { label: "Контакти", href: "/contact.html", children: [] }
    ],
    footer: [{ title: "Покупцям", links: [link("Доставка", "/delivery.html"), link("Ціни", "/product.html?id=a&b=1")] }]
  });
  assert.deepEqual((await publicSettings(db)).menus, menus);
  const empty = (await update(db, "menus", { header: [], footer: [] })).r.sections.menus.value;
  assert.deepEqual(empty, { header: [], footer: [] }, "empty menus are allowed (nav hidden)");

  // 3. Unsafe or malformed links are refused.
  for (const href of ["javascript:alert(1)", "//evil.example", "http://insecure.example", "/\\evil.example", "data:text/html,x",
    "about.html", "/a b", '/x"onmouseover=1', "https://", "mailto:a@b.c"]) {
    await expectError(update(db, "menus", { header: [{ label: "X", href }] }), /починатися з \/ .*https:\/\//, `header href ${href}`);
  }
  await expectError(update(db, "menus", { header: [{ label: "X", href: "/x", children: [link("Y", "ftp://x")] }] }), /Посилання підпункту/, "child href");
  await expectError(update(db, "menus", { footer: [{ title: "A", links: [link("Y", "//x")] }] }), /Посилання в підвалі/, "footer href");
  await expectError(update(db, "menus", { header: [{ label: "", href: "/x" }] }), /обов’язкове/, "empty label");
  await expectError(update(db, "menus", { header: [{ label: "X", href: "" }] }), /обов’язкове/, "empty href");
  await expectError(update(db, "menus", { header: [{ label: "x".repeat(41), href: "/x" }] }), /40/, "long label");
  await expectError(update(db, "menus", { header: [{ label: "X", href: `/${"a".repeat(300)}` }] }), /300/, "long href");

  // 4. Limits and shapes.
  await expectError(update(db, "menus", { header: Array.from({ length: 11 }, (_, i) => link(`P${i}`, `/p${i}`)) }), /10 пунктів/, "11 header items");
  await expectError(update(db, "menus", { header: [{ label: "X", href: "/x", children: Array.from({ length: 11 }, (_, i) => link(`C${i}`, `/c${i}`)) }] }), /10 підпунктів/, "11 children");
  await expectError(update(db, "menus", { footer: Array.from({ length: 4 }, (_, i) => ({ title: `C${i}`, links: [link("a", "/a")] })) }), /3 колонок/, "4 footer columns");
  await expectError(update(db, "menus", { footer: [{ title: "A", links: [] }] }), /від 1 до 12/, "empty column");
  await expectError(update(db, "menus", { footer: [{ title: "A", links: Array.from({ length: 13 }, () => link("a", "/a")) }] }), /від 1 до 12/, "13 links");
  await expectError(update(db, "menus", { header: "nope" }), /Некоректні дані меню/, "header not a list");
  await expectError(update(db, "menus", { header: [{ label: "X", href: "/x", children: {} }] }), /Некоректний пункт/, "children not a list");
  await expectError(update(db, "menus", []), /Некоректні дані меню/, "menus not an object");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_update_settings('menus', $1, null)", [{ header: [] }])),
    /власник і адміністратор/, "manager write");

  // 5. Cookies: booleans checked, text required, privacy link optional but safe.
  const cookies = (await update(db, "cookies", { enabled: true, text: "  Cookie для аналітики. ", privacyHref: "", junk: 1 })).r.sections.cookies.value;
  assert.deepEqual(cookies, { enabled: true, text: "Cookie для аналітики.", privacyHref: "" });
  assert.deepEqual((await publicSettings(db)).cookies, cookies);
  await expectError(update(db, "cookies", { enabled: "yes", text: "x" }), /так або ні/, "enabled not boolean");
  await expectError(update(db, "cookies", { enabled: true, text: " " }), /обов’язкове/, "empty text");
  await expectError(update(db, "cookies", { enabled: true, text: "x".repeat(401) }), /400/, "long text");
  await expectError(update(db, "cookies", { enabled: true, text: "x", privacyHref: "javascript:alert(1)" }), /Посилання на політику/, "bad privacy link");

  // 6. Older sections still validate through the redefined function; unknown keys still refused.
  const integrations = (await update(db, "integrations", { ga4MeasurementId: "g-abc123def4" })).r.sections.integrations.value;
  assert.equal(integrations.ga4MeasurementId, "G-ABC123DEF4");
  await expectError(update(db, "social", { instagram: "http://x" }), /https:\/\//, "social still validated");
  await expectError(update(db, "seo", { pages: [{ path: "/catalog" }] }), /картках/, "seo still validated");
  const stores = (await as(db, "authenticated", STAFF.owner, () => one(db, "select public.admin_get_settings() r"))).r.sections.stores.value;
  assert.equal((await update(db, "stores", stores)).r.sections.stores.value.length, stores.length);
  await expectError(db.query("insert into public.site_settings (key, value) values ('secrets', '{}')"), /site_settings_key_check/, "unknown key");

  // 7. Audit rows for both new sections.
  const audit = await one(db, "select count(*) filter (where key = 'menus')::int m, count(*) filter (where key = 'cookies')::int c from public.site_settings_audit");
  assert.equal(audit.m, 2);
  assert.equal(audit.c, 1);

  console.log(JSON.stringify({ status: "ok", scenarios: 7, suite: "menus" }));
}
