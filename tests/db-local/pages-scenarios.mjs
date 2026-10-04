// Site pages v1: seed equals the storefront's built-in texts, public reads, roles, block
// validation (no HTML, safe links only), optimistic locking, publish switch, FAQ list editing, audit.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS_DIR } from "./database.mjs";
import { PAGE_SOURCES, extractFallbackPages, extractFallbackFaq, extractStaticSeo } from "../site-pages-fallback.mjs";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000041",
  manager: "00000000-0000-4000-8000-000000000042",
  content: "00000000-0000-4000-8000-000000000043"
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
const asUser = (db, who, sql, params) => as(db, "authenticated", STAFF[who], async () => (await one(db, sql, params)).r);
const anon = async (db, sql, params) => (await as(db, "anon", null, () => one(db, sql, params))).r;
const savePage = (db, who, slug, payload, expected = null) =>
  asUser(db, who, "select public.admin_save_site_page($1, $2, $3) r", [slug, payload, expected]);
const saveFaq = (db, who, items, expected = null) =>
  asUser(db, who, "select public.admin_save_site_faq($1, $2) r", [JSON.stringify(items), expected]);
const auditCount = async (db, entity) => (await one(db, "select count(*)::int c from public.site_pages_audit where entity = $1", [entity])).c;

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  // 1. The seed is exactly what page-shell.js renders without the database (and the static SEO tags).
  const fallback = extractFallbackPages();
  assert.equal(fallback.length, 14);
  for (const page of fallback) {
    const stored = await anon(db, "select public.get_site_page($1) r", [page.slug]);
    assert.ok(stored, `${page.slug}: seeded`);
    assert.deepEqual({ kicker: stored.kicker, title: stored.title, lead: stored.lead },
      { kicker: page.kicker, title: page.title, lead: page.lead }, `${page.slug}: first screen`);
    assert.deepEqual(stored.body, page.hasBody ? page.body : null, `${page.slug}: body`);
    assert.deepEqual(stored.seo, extractStaticSeo(page.slug), `${page.slug}: seo`);
  }
  assert.deepEqual(await anon(db, "select public.get_site_faq() r"), extractFallbackFaq());
  assert.equal(extractFallbackFaq().length, 9);
  assert.equal(await anon(db, "select public.get_site_page('checkout') r"), null, "layout pages are not stored");
  // The seed passes the same validation as admin saves.
  for (const page of fallback.filter(item => item.hasBody)) {
    const cleaned = (await one(db, "select public._site_pages_clean_body($1) r", [JSON.stringify(page.body)])).r;
    assert.deepEqual(cleaned, page.body, `${page.slug}: seed is clean`);
  }
  assert.equal(PAGE_SOURCES.filter(page => page.hasBody).length, 9);

  // 2. Tables and staff RPCs are closed to visitors.
  for (const table of ["site_pages", "site_faq_items", "site_faq_state", "site_pages_audit"]) {
    await expectError(as(db, "anon", null, () => db.query(`select * from public.${table}`)), /permission denied/, `anon ${table}`);
    await expectError(as(db, "authenticated", STAFF.owner, () => db.query(`select * from public.${table}`)), /permission denied/, `staff ${table}`);
  }
  await expectError(as(db, "anon", null, () => db.query("select public.admin_list_site_pages()")), /permission denied/, "anon list");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_save_site_page('about', '{}', null)")), /permission denied/, "anon save");
  await expectError(as(db, "anon", null, () => db.query("select public._site_pages_clean_body('[]')")), /permission denied/, "anon helper");

  // 3. Roles: every staff member reads; owner/admin/content manager write; manager is read-only.
  const managerList = await asUser(db, "manager", "select public.admin_list_site_pages() r");
  assert.equal(managerList.canEdit, false);
  assert.equal(managerList.pages.length, 14);
  assert.deepEqual(managerList.faq, { total: 9, active: 9, updatedAt: managerList.faq.updatedAt });
  assert.equal((await asUser(db, "content", "select public.admin_list_site_pages() r")).canEdit, true);
  await expectError(savePage(db, "manager", "about", { title: "Інше" }), /власник, адміністратор і контент-менеджер/, "manager save");
  await expectError(saveFaq(db, "manager", []), /власник, адміністратор і контент-менеджер/, "manager faq");
  const managerDetail = await asUser(db, "manager", "select public.admin_get_site_page('faq') r");
  assert.equal(managerDetail.faq.items.length, 9);
  assert.equal(await asUser(db, "manager", "select public.admin_get_site_page('missing') r"), null);

  // 4. Saving a page: cleaned text, safe links only, unknown keys dropped, audited, public sees it.
  const about = (await asUser(db, "content", "select public.admin_get_site_page('about') r")).page;
  const body = [
    { type: "heading", text: "  Хто   ми ", extra: "drop" },
    { type: "paragraph", text: "Див. [доставку](/delivery.html) і [закон](https://zakon.rada.gov.ua/go/1023-12).\n<b>не HTML</b>" },
    { type: "list", ordered: true, items: [" Перший ", "", "Другий [лист](mailto:info@example.com)"] }
  ];
  const saved = await savePage(db, "content", "about", { title: "Про нас", lead: "Новий вступ", body, seoTitle: "Про нас | ТД", seoDescription: "Опис" }, about.updatedAt);
  assert.deepEqual(saved.page.body, [
    { type: "heading", text: "Хто ми" },
    { type: "paragraph", text: "Див. [доставку](/delivery.html) і [закон](https://zakon.rada.gov.ua/go/1023-12). <b>не HTML</b>" },
    { type: "list", ordered: true, items: ["Перший", "Другий [лист](mailto:info@example.com)"] }
  ]);
  assert.equal(saved.page.updatedBy, "Контент");
  assert.equal(saved.history.length, 1);
  assert.deepEqual(saved.history[0].fields, ["body", "lead", "seo_description", "seo_title", "title"]);
  const publicAbout = await anon(db, "select public.get_site_page('about') r");
  assert.equal(publicAbout.title, "Про нас");
  assert.equal(publicAbout.seo.title, "Про нас | ТД");
  assert.equal(publicAbout.body.length, 3);
  assert.equal(publicAbout.kicker, "Про компанію", "keys left out keep their value");

  // A save without changes neither bumps the version nor writes audit.
  const auditBefore = await auditCount(db, "page");
  const unchanged = await savePage(db, "content", "about", { title: "Про нас" }, saved.page.updatedAt);
  assert.equal(unchanged.page.updatedAt, saved.page.updatedAt);
  assert.equal(await auditCount(db, "page"), auditBefore);

  // 5. Optimistic lock.
  await expectError(savePage(db, "owner", "about", { title: "Пізно" }, about.updatedAt), /інший працівник/, "stale page save");

  // 6. Validation errors in Ukrainian, with the block number.
  const current = saved.page.updatedAt;
  await expectError(savePage(db, "owner", "about", { title: "  " }, current), /Заголовок: поле обов/, "empty title");
  await expectError(savePage(db, "owner", "about", { body: [{ type: "html", text: "<script>" }] }, current), /Блок 1: невідомий тип/, "html block");
  await expectError(savePage(db, "owner", "about", { body: [{ type: "heading", text: "Ок" }, { type: "paragraph", text: " " }] }, current), /Блок 2 \(абзац\): поле обов/, "empty paragraph");
  await expectError(savePage(db, "owner", "about", { body: [{ type: "list", items: ["", " "] }] }, current), /хоча б один пункт/, "empty list");
  await expectError(savePage(db, "owner", "about", { body: [{ type: "list", items: "a" }] }, current), /перелік пунктів/, "list not array");
  await expectError(savePage(db, "owner", "about", { body: "текст" }, current), /список блоків/, "body not array");
  for (const url of ["javascript:alert(1)", "//evil.example", "http://insecure.example", "/\\evil.example", "data:text/html,x"]) {
    await expectError(savePage(db, "owner", "about", { body: [{ type: "paragraph", text: `[тиць](${url})` }] }, current), /посилання/, `link ${url}`);
  }
  await expectError(savePage(db, "owner", "about", { published: "так" }, current), /так або ні/, "published type");
  await expectError(savePage(db, "owner", "about", { title: "x".repeat(201) }, current), /не довше 200/, "long title");
  await expectError(savePage(db, "owner", "missing", { title: "x" }), /не знайдено/, "unknown page");

  // 7. Layout pages: first screen and SEO only.
  await expectError(savePage(db, "owner", "services", { body: [{ type: "paragraph", text: "Текст" }] }), /блоки макета/, "layout body");
  const services = await savePage(db, "owner", "services", { lead: "Оновлений вступ", body: [] });
  assert.equal(services.page.lead, "Оновлений вступ");
  assert.equal((await anon(db, "select public.get_site_page('services') r")).body, null);

  // 8. Publish switch: off means the storefront keeps its built-in text.
  await savePage(db, "owner", "privacy", { published: false });
  assert.equal(await anon(db, "select public.get_site_page('privacy') r"), null);
  assert.equal((await asUser(db, "manager", "select public.admin_get_site_page('privacy') r")).page.published, false);
  await savePage(db, "owner", "privacy", { published: true });
  assert.ok(await anon(db, "select public.get_site_page('privacy') r"));

  // 9. FAQ: reorder, edit, hide, add, delete in one save; public order follows; audited.
  const faq = (await asUser(db, "content", "select public.admin_get_site_page('faq') r")).faq;
  const [first, second, third, ...rest] = faq.items;
  const nextItems = [
    { ...third, question: "  Чи можна   аналог? " },
    first,
    { ...second, active: false },
    ...rest.slice(0, -1),
    { group: "Нове", question: "Нове питання?", answer: "Так, див. [контакти](/contact.html)." }
  ];
  const savedFaq = await saveFaq(db, "content", nextItems, faq.updatedAt);
  assert.equal(savedFaq.items.length, 9, "one deleted, one added");
  assert.equal(savedFaq.items[0].id, third.id);
  assert.equal(savedFaq.items[0].question, "Чи можна аналог?");
  assert.equal(savedFaq.items[2].active, false);
  assert.equal(savedFaq.items.some(item => item.id === rest.at(-1).id), false);
  assert.equal(savedFaq.history.length, 1);
  const publicFaq = await anon(db, "select public.get_site_faq() r");
  assert.equal(publicFaq.length, 8, "hidden question stays off the site");
  assert.equal(publicFaq[0].question, "Чи можна аналог?");
  assert.deepEqual(publicFaq.at(-1), { group: "Нове", question: "Нове питання?", answer: "Так, див. [контакти](/contact.html)." });
  assert.equal(Object.keys(publicFaq[0]).sort().join(), "answer,group,question", "no ids or flags in public");

  // Same list again: no new version, no audit.
  const faqAudit = await auditCount(db, "faq");
  const again = await saveFaq(db, "content", savedFaq.items, savedFaq.updatedAt);
  assert.equal(again.updatedAt, savedFaq.updatedAt);
  assert.equal(await auditCount(db, "faq"), faqAudit);

  await expectError(saveFaq(db, "content", savedFaq.items, faq.updatedAt), /інший працівник/, "stale faq");
  await expectError(saveFaq(db, "content", [{ group: "А", question: "Б?", answer: " " }]), /Запитання 1: відповідь: поле обов/, "empty answer");
  await expectError(saveFaq(db, "content", [{ id: "00000000-0000-4000-8000-000000000999", group: "А", question: "Б?", answer: "В" }]), /не знайдено/, "unknown id");
  await expectError(saveFaq(db, "content", [savedFaq.items[0], savedFaq.items[0]]), /повторюється/, "duplicate id");
  await expectError(saveFaq(db, "content", [{ group: "А", question: "Б?", answer: "[x](javascript:alert(1))" }]), /посилання/, "faq link");
  await expectError(saveFaq(db, "content", { items: [] }), /Некоректний список/, "faq not array");

  // FAQ page switched off: the storefront keeps its built-in questions.
  await savePage(db, "content", "faq", { published: false });
  assert.equal(await anon(db, "select public.get_site_faq() r"), null);
  await savePage(db, "content", "faq", { published: true });
  assert.equal((await anon(db, "select public.get_site_faq() r")).length, 8);

  // Empty list is allowed (the page then shows no questions).
  const emptied = await saveFaq(db, "owner", [], again.updatedAt);
  assert.equal(emptied.items.length, 0);
  assert.deepEqual(await anon(db, "select public.get_site_faq() r"), []);

  // 10. 20261005000300_about_text: the «Про нас» text saved on the live sites loses «Гарантія на всі товари»
  // and gets the /contact spelling of the address; other blocks and a re-run stay untouched.
  const aboutSql = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261005000300_about_text.sql"), "utf8");
  const liveAbout = [
    { type: "heading", text: "Що ми гарантуємо" },
    { type: "list", ordered: false, items: ["Лише офіційна продукція з гарантією та сервісною підтримкою в Україні.", "Гарантія на всі товари, гарантійне й післягарантійне обслуговування."] },
    { type: "heading", text: "Магазини" },
    { type: "list", ordered: false, items: ["Київська обл., с. Софіївська Борщагівка, вул. Київська, 3. Пн–Пт 9:00–18:00, Сб 9:00–14:00.", "м. Житомир, проспект Незалежності, 79. Пн–Пт 8:30–17:00, Сб 8:30–14:00."] }
  ];
  await db.query("update public.site_pages set body = $1 where slug = 'about'", [JSON.stringify(liveAbout)]);
  await db.exec(aboutSql);
  const fixedAbout = (await one(db, "select body from public.site_pages where slug = 'about'")).body;
  assert.deepEqual(fixedAbout[1].items, ["Лише офіційна продукція з гарантією та сервісною підтримкою в Україні.", "Гарантія виробника, допомога з гарантійним зверненням, гарантійне й післягарантійне обслуговування."]);
  assert.deepEqual(fixedAbout[3].items[0], "с. Софіївська Борщагівка, вул. Київська, 3. Пн–Пт 9:00–18:00, Сб 9:00–14:00.");
  assert.deepEqual([fixedAbout[0], fixedAbout[2], fixedAbout[3].items[1]], [liveAbout[0], liveAbout[2], liveAbout[3].items[1]]);
  const stamp = (await one(db, "select updated_at from public.site_pages where slug = 'about'")).updated_at;
  await db.exec(aboutSql);
  assert.deepEqual((await one(db, "select updated_at from public.site_pages where slug = 'about'")).updated_at, stamp, "re-run is a no-op");

  console.log(JSON.stringify({ status: "ok", scenarios: 10, suite: "pages" }));
}
