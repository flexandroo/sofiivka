// Homepage banners v1: seed, public read, roles, validation, optimistic locks, reorder, delete, audit.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000071",
  manager: "00000000-0000-4000-8000-000000000072",
  content: "00000000-0000-4000-8000-000000000073"
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
const publicBanners = async db => (await as(db, "anon", null, () => one(db, "select public.get_homepage_banners() r"))).r;
const list = (db, user = STAFF.content) => as(db, "authenticated", user, () => one(db, "select public.admin_list_banners() r")).then(row => row.r);
const save = (db, id, payload, expected, user = STAFF.content) => as(db, "authenticated", user,
  () => one(db, "select public.admin_save_banner($1, $2, $3) r", [id, payload, expected])).then(row => row.r);
const remove = (db, id, expected, user = STAFF.content) => as(db, "authenticated", user,
  () => one(db, "select public.admin_delete_banner($1, $2) r", [id, expected])).then(row => row.r);
const reorder = (db, placement, ids, user = STAFF.content) => as(db, "authenticated", user,
  () => one(db, "select public.admin_reorder_banners($1, $2) r", [placement, ids])).then(row => row.r);

const editable = banner => ({
  placement: banner.placement, layout: banner.layout, imageUrl: banner.imageUrl, mobileImageUrl: banner.mobileImageUrl,
  imageAlt: banner.imageAlt, imageFocus: banner.imageFocus, logoUrl: banner.logoUrl, logoAlt: banner.logoAlt,
  kicker: banner.kicker, title: banner.title, text: banner.text, buttonLabel: banner.buttonLabel, linkUrl: banner.linkUrl,
  active: banner.active, dateFrom: banner.dateFrom, dateTo: banner.dateTo
});

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@banners.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  // 1. Seed matches index.html: three slides and two promo tiles, in order.
  let shown = await publicBanners(db);
  assert.deepEqual(shown.hero.map(item => item.title), [
    "Насоси для стабільної роботи системи", "Чиста вода для щоденного використання", "Автоматика, що керує комфортом"]);
  assert.deepEqual(shown.promo.map(item => item.title), ["Чиста вода у вашому домі", "Комфорт у будь-який сезон"]);
  assert.equal(shown.hero[0].imageUrl, "assets/images/home-hero-termojet-pumps-v1.jpg");
  assert.equal(shown.hero[0].kicker, "Насосне обладнання\nдля систем опалення");
  assert.equal(shown.hero[0].logoUrl, "assets/brands/termojet.png");
  assert.equal(shown.hero[1].linkUrl, "/search.html?q=Ecosoft");
  assert.equal(shown.promo[0].layout, "product");
  assert.equal(shown.promo[0].linkUrl, "/product.html?id=MO650MECOSTD");
  assert.equal(shown.promo[1].imageAlt, "");
  assert.equal("updatedAt" in shown.hero[0], false, "public shape has no staff fields");

  // 2. Table closed to clients; admin RPCs closed to anon.
  await expectError(as(db, "anon", null, () => db.query("select * from public.homepage_banners")), /permission denied/, "anon table read");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select * from public.homepage_banners")), /permission denied/, "staff table read");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select * from public.homepage_banners_audit")), /permission denied/, "audit read");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_list_banners()")), /permission denied/, "anon admin list");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_save_banner(null, '{}', null)")), /permission denied/, "anon save");

  // 3. Roles: manager reads only; content manager edits.
  const managerView = await list(db, STAFF.manager);
  assert.equal(managerView.canEdit, false);
  assert.equal(managerView.banners.length, 5);
  const contentView = await list(db);
  assert.equal(contentView.canEdit, true);
  const [first, second, third] = contentView.banners.filter(item => item.placement === "hero");
  await expectError(save(db, first.id, editable(first), first.updatedAt, STAFF.manager), /власник, адміністратор і контент-менеджер/, "manager save");
  await expectError(remove(db, first.id, first.updatedAt, STAFF.manager), /контент-менеджер/, "manager delete");
  await expectError(reorder(db, "hero", [first.id], STAFF.manager), /контент-менеджер/, "manager reorder");

  // 4. Validation.
  const base = { placement: "hero", imageUrl: "https://cdn.example.com/hero.jpg", title: "Новий слайд", linkUrl: "/catalog/heating" };
  await expectError(save(db, null, { ...base, title: "  " }, null), /Заголовок: поле обов/, "empty title");
  await expectError(save(db, null, { ...base, imageUrl: "" }, null), /Зображення: поле обов/, "no image");
  for (const bad of ["http://cdn.example.com/a.jpg", "javascript:alert(1)", "//evil.example/a.jpg", "data:image/png;base64,AA", "images/a.jpg", "https://", "/a b.jpg", "/x\"onerror=.jpg"]) {
    await expectError(save(db, null, { ...base, imageUrl: bad }, null), /https:\/\/… або шлях сайту/, `bad image ${bad}`);
  }
  await expectError(save(db, null, { ...base, linkUrl: "javascript:alert(1)" }, null), /Посилання: потрібна адреса/, "bad link");
  await expectError(save(db, null, { ...base, mobileImageUrl: "ftp://x" }, null), /Зображення для телефона/, "bad mobile");
  await expectError(save(db, null, { ...base, layout: "product" }, null), /на всю площу/, "hero product layout");
  await expectError(save(db, null, { ...base, placement: "sidebar" }, null), /місце показу/, "bad placement");
  await expectError(save(db, null, { ...base, imageFocus: 140 }, null), /від 0 до 100/, "bad focus");
  await expectError(save(db, null, { ...base, title: "x".repeat(161) }, null), /не довше 160/, "long title");
  await expectError(save(db, null, { ...base, kicker: "a\nb\nc\nd" }, null), /3 рядків/, "kicker lines");
  await expectError(save(db, null, { ...base, active: "yes" }, null), /Показувати на сайті/, "bad active");
  await expectError(save(db, null, { ...base, dateFrom: "2026-10-10T00:00:00Z", dateTo: "2026-10-01T00:00:00Z" }, null), /раніша/, "bad period");
  await expectError(save(db, null, { ...base, dateFrom: "not a date" }, null), /Некоректна дата/, "bad date");

  // 5. Create: cleaned, appended to the end, audited, public once live.
  const created = (await save(db, null, { ...base, title: " Новий\n слайд ", kicker: "Рядок 1\r\nРядок 2", imageUrl: "assets/images/new.jpg",
    logoUrl: "https://cdn.example.com/logo.svg", unknown: "drop me" }, null)).banner;
  assert.equal(created.title, "Новий слайд");
  assert.equal(created.kicker, "Рядок 1\nРядок 2");
  assert.equal(created.sortOrder, 40);
  assert.equal(created.layout, "cover");
  assert.equal(created.imageFocus, 50);
  assert.equal(created.live, true);
  shown = await publicBanners(db);
  assert.equal(shown.hero.length, 4);
  assert.equal(shown.hero[3].title, "Новий слайд");
  const promo = (await save(db, null, { placement: "promo", layout: "product", imageUrl: "/assets/x.webp", title: "Третя плитка",
    linkUrl: "https://example.com/promo", logoUrl: "assets/brands/x.png" }, null)).banner;
  assert.equal(promo.logoUrl, "", "promo tiles carry no logo");
  assert.equal((await publicBanners(db)).promo.length, 2, "only two promo tiles reach the storefront");

  // 6. Update: optimistic lock, audit only on change, dates and active hide from the storefront.
  await expectError(save(db, created.id, { ...editable(created), title: "Інший" }, "2000-01-01T00:00:00Z"), /інший працівник/, "stale save");
  await expectError(save(db, created.id, { ...editable(created), title: "Інший" }, null), /інший працівник/, "save without lock");
  const unchanged = (await save(db, created.id, editable(created), created.updatedAt)).banner;
  assert.equal(unchanged.updatedAt, created.updatedAt, "no-op save keeps updatedAt");
  const scheduled = (await save(db, created.id, { ...editable(created), dateFrom: "2999-01-01T00:00:00Z" }, created.updatedAt)).banner;
  assert.notEqual(scheduled.updatedAt, created.updatedAt);
  assert.equal(scheduled.live, false);
  assert.equal((await publicBanners(db)).hero.length, 3, "future banner hidden");
  const off = (await save(db, created.id, { ...editable(scheduled), dateFrom: null, active: false }, scheduled.updatedAt)).banner;
  assert.equal(off.live, false);
  assert.equal((await publicBanners(db)).hero.length, 3, "inactive banner hidden");
  const ended = (await save(db, second.id, { ...editable(second), dateTo: "2001-01-01T00:00:00Z" }, second.updatedAt)).banner;
  assert.equal(ended.live, false);
  assert.deepEqual((await publicBanners(db)).hero.map(item => item.id), [first.id, third.id], "ended banner hidden");
  const restored = (await save(db, second.id, { ...editable(ended), dateTo: null }, ended.updatedAt)).banner;
  assert.equal(restored.live, true);

  // 7. Reorder: whole placement only, stale lists refused.
  await expectError(reorder(db, "hero", [first.id, second.id]), /Список банерів змінився/, "partial reorder");
  await expectError(reorder(db, "hero", [first.id, first.id, second.id, third.id]), /повторюється/, "duplicate reorder");
  await expectError(reorder(db, "hero", [promo.id, first.id, second.id, third.id]), /Список банерів змінився/, "foreign id");
  const reordered = await reorder(db, "hero", [third.id, created.id, first.id, second.id]);
  assert.deepEqual(reordered.banners.filter(item => item.placement === "hero").map(item => item.id), [third.id, created.id, first.id, second.id]);
  assert.deepEqual((await publicBanners(db)).hero.map(item => item.id), [third.id, first.id, second.id]);

  // 8. Moving a banner between placements puts it last there; delete needs the lock; audit trail.
  const moved = (await save(db, off.id, { ...editable(off), placement: "promo", layout: "cover" }, off.updatedAt)).banner;
  assert.equal(moved.placement, "promo");
  assert.ok(moved.sortOrder > promo.sortOrder);
  await expectError(remove(db, moved.id, "2000-01-01T00:00:00Z"), /інший працівник/, "stale delete");
  assert.deepEqual((await remove(db, moved.id, moved.updatedAt)).deleted, moved.id);
  await expectError(remove(db, moved.id, moved.updatedAt), /не знайдено/, "double delete");
  const audit = (await db.query("select action, count(*)::int c from public.homepage_banners_audit group by action order by action")).rows;
  assert.deepEqual(Object.fromEntries(audit.map(row => [row.action, row.c])), { create: 2, delete: 1, reorder: 1, update: 5 });
  const history = (await list(db, STAFF.manager)).history;
  assert.equal(history[0].action, "delete");
  assert.equal(history[0].actor, "Контент");
  assert.equal(history[0].title, "Новий слайд");
  const moveEntry = history.find(entry => entry.action === "update" && entry.fields.includes("placement"));
  assert.equal(moveEntry.title, "Новий слайд", "untouched title still names the banner");
  assert.equal(moveEntry.fields.includes("title"), false, "untouched title is not listed as changed");

  // 9. Owner and admin may edit too; content written through the RPC never escapes the escaping contract.
  const owned = (await save(db, first.id, { ...editable(first), title: "<img src=x onerror=alert(1)>" }, first.updatedAt, STAFF.owner)).banner;
  assert.equal(owned.title, "<img src=x onerror=alert(1)>", "text is stored as text; the storefront renders it with textContent");
  assert.equal(owned.updatedBy, "Власник");

  console.log(JSON.stringify({ status: "ok", scenarios: 9, suite: "banners" }));
}
