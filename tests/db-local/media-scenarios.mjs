// Media library v1: roles, register validation, search and paging, alt edits with optimistic lock,
// usage detection (banners, products, brands) blocking delete, audit. The PGlite harness has no
// storage schema, so the "object exists in Storage" check is skipped here (covered on DEV).
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000081",
  manager: "00000000-0000-4000-8000-000000000082",
  content: "00000000-0000-4000-8000-000000000083"
};
const BASE = "https://wfxcklglujgramasdzyr.supabase.co/storage/v1/object/public/site-media/";

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
const list = (db, search = null, page = 1, user = STAFF.content) => as(db, "authenticated", user,
  () => one(db, "select public.admin_list_media($1, $2) r", [search, page])).then(row => row.r);
const register = (db, payload, user = STAFF.content) => as(db, "authenticated", user,
  () => one(db, "select public.admin_register_media($1) r", [payload])).then(row => row.r.item);
const update = (db, id, alt, expected, user = STAFF.content) => as(db, "authenticated", user,
  () => one(db, "select public.admin_update_media($1, $2, $3) r", [id, alt, expected])).then(row => row.r.item);
const remove = (db, id, user = STAFF.content) => as(db, "authenticated", user,
  () => one(db, "select public.admin_delete_media($1) r", [id])).then(row => row.r);

const file = (name, extra = {}) => {
  const path = `library/${name}`;
  return { path, url: `${BASE}${path}`, name, mimeType: "image/webp", size: 120000, width: 1600, height: 900, ...extra };
};

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@media.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  // 1. Tables closed to clients; admin RPCs closed to anon; empty library.
  await expectError(as(db, "anon", null, () => db.query("select * from public.media_assets")), /permission denied/, "anon table read");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select * from public.media_assets")), /permission denied/, "staff table read");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select * from public.media_assets_audit")), /permission denied/, "audit read");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_list_media(null, 1)")), /permission denied/, "anon list");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_register_media('{}')")), /permission denied/, "anon register");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_delete_media(gen_random_uuid())")), /permission denied/, "anon delete");
  await expectError(as(db, "authenticated", "00000000-0000-4000-8000-000000000089", () => db.query("select public.admin_list_media(null, 1)")), /Not authorized/, "non-staff list");
  let view = await list(db);
  assert.equal(view.canEdit, true);
  assert.equal(view.total, 0);
  assert.deepEqual(view.items, []);
  assert.equal(view.limits.maxBytes, 5242880);

  // 2. Roles: the manager reads only.
  assert.equal((await list(db, null, 1, STAFF.manager)).canEdit, false);
  await expectError(register(db, file("a.webp"), STAFF.manager), /власник, адміністратор і контент-менеджер/, "manager register");

  // 3. Register validation.
  await expectError(register(db, file("a.webp", { path: "banners/a.webp", url: `${BASE}banners/a.webp` })), /папці library/, "outside library");
  await expectError(register(db, file("a.webp", { path: "library/../x.webp", url: `${BASE}library/../x.webp` })), /папці library/, "dot-dot");
  await expectError(register(db, file("a.webp", { path: "library/A B.webp", url: `${BASE}library/A B.webp` })), /папці library/, "unsafe chars");
  await expectError(register(db, file("a.webp", { url: `${BASE}library/other.webp` })), /не відповідає сховищу/, "url of another object");
  await expectError(register(db, file("a.webp", { url: "http://wfxcklglujgramasdzyr.supabase.co/storage/v1/object/public/site-media/library/a.webp" })), /не відповідає сховищу/, "http url");
  await expectError(register(db, file("a.webp", { url: "https://evil.example/x/storage/v1/object/public/product-media/library/a.webp" })), /не відповідає сховищу/, "other bucket");
  await expectError(register(db, file("a.gif", { mimeType: "image/gif" })), /JPG, PNG, WebP або SVG/, "gif");
  await expectError(register(db, file("a.mp4", { mimeType: "video/mp4" })), /JPG, PNG, WebP або SVG/, "video");
  await expectError(register(db, file("a.webp", { size: 5242881 })), /більший за 5 МБ/, "too big");
  await expectError(register(db, file("a.webp", { size: 0 })), /більший за 5 МБ/, "empty");
  await expectError(register(db, file("a.webp", { size: "12kb" })), /розмір файлу/, "bad size");
  await expectError(register(db, file("a.webp", { width: 0 })), /Ширина/, "bad width");
  await expectError(register(db, file("a.webp", { height: "x" })), /Висота/, "bad height");
  await expectError(register(db, file("a.webp", { alt: "x".repeat(301) })), /не довше 300/, "long alt");
  await expectError(register(db, null), /Некоректні дані/, "null payload");

  // 4. Register: stored, audited, uploader named; duplicates refused; SVG without size is fine.
  const hero = await register(db, file("11111111-hero.webp", { name: "Котельня Hero.webp", alt: "  Котельня  " }));
  assert.equal(hero.name, "Котельня Hero.webp");
  assert.equal(hero.alt, "Котельня");
  assert.equal(hero.bucket, "site-media");
  assert.equal(hero.uploadedBy, "Контент");
  assert.deepEqual(hero.usage, { banners: 0, products: 0, brands: 0 });
  await expectError(register(db, file("11111111-hero.webp")), /уже є в медіатеці/, "duplicate");
  const logo = await register(db, file("22222222-logo.svg", { mimeType: "image/svg+xml", width: null, height: null, size: 900 }), STAFF.owner);
  assert.equal(logo.width, null);
  for (let index = 0; index < 41; index += 1) await register(db, file(`bulk-${String(index).padStart(2, "0")}.png`, { mimeType: "image/png", name: `bulk ${index}.png` }));

  // 5. List: newest first, 40 per page, search by name / alt / path, LIKE wildcards are literal.
  view = await list(db);
  assert.equal(view.total, 43);
  assert.equal(view.items.length, 40);
  assert.equal(view.items[0].name, "bulk 40.png");
  const second = await list(db, null, 2);
  assert.equal(second.page, 2);
  assert.equal(second.items.length, 3);
  assert.equal(second.items.at(-1).id, hero.id, "oldest last");
  assert.equal((await list(db, null, 0)).page, 1, "page clamps to 1");
  assert.deepEqual((await list(db, "котельня")).items.map(item => item.id), [hero.id], "alt / name search");
  assert.deepEqual((await list(db, "logo.svg")).items.map(item => item.id), [logo.id], "path search");
  assert.equal((await list(db, "%")).total, 0, "% is literal");
  assert.equal((await list(db, "bulk_0")).total, 0, "_ is literal");
  assert.equal((await list(db, "bulk 0")).total, 1);

  // 6. Alt edits: lock, no-op keeps updatedAt, line breaks folded, audited.
  await expectError(update(db, hero.id, "Інше", "2000-01-01T00:00:00Z"), /інший працівник/, "stale alt");
  await expectError(update(db, hero.id, "Інше", null), /інший працівник/, "alt without lock");
  await expectError(update(db, hero.id, "Інше", hero.updatedAt, STAFF.manager), /контент-менеджер/, "manager alt");
  await expectError(update(db, "00000000-0000-4000-8000-0000000000ff", "x", hero.updatedAt), /не знайдено/, "missing alt");
  const same = await update(db, hero.id, "Котельня", hero.updatedAt);
  assert.equal(same.updatedAt, hero.updatedAt, "no-op save keeps updatedAt");
  const edited = await update(db, hero.id, "Котельня\r\nз котлом", hero.updatedAt);
  assert.equal(edited.alt, "Котельня з котлом");
  assert.notEqual(edited.updatedAt, hero.updatedAt);

  // 7. Usage: banners, product images and brand logos block delete.
  const brand = await one(db, "select internal_id from public.brands order by stable_id limit 1");
  const category = await one(db, "select internal_id from public.categories order by level desc, stable_id limit 1");
  const product = await one(db, `insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status)
    values ('m-1', 'MSKU-1', 'm-1', 'Медіа-товар', 'Товар', 'M1', $1, $2, 100, 'known', 'in_stock', 'published') returning internal_id`,
    [brand.internal_id, category.internal_id]);
  await db.query("insert into public.product_media (product_id, url, role) values ($1, $2, 'gallery'), ($1, $2, 'other')", [product.internal_id, hero.url]);
  await db.query("update public.homepage_banners set mobile_image_url = $1 where internal_id = (select internal_id from public.homepage_banners order by sort_order limit 1)", [hero.url]);
  await db.query("update public.brands set logo_url = $1 where internal_id = $2", [logo.url, brand.internal_id]);
  const used = (await list(db, "котельня")).items[0];
  assert.deepEqual(used.usage, { banners: 1, products: 1, brands: 0 }, "a product counts once");
  await expectError(remove(db, hero.id), /використовується \(банери: 1, товари: 1\)/, "used by banner and product");
  await expectError(remove(db, logo.id), /бренди: 1/, "used by brand");
  await expectError(remove(db, logo.id, STAFF.manager), /контент-менеджер/, "manager delete");

  // 8. Delete an unused file: returns the Storage location; gone afterwards; audited.
  await db.query("update public.brands set logo_url = null where internal_id = $1", [brand.internal_id]);
  const removed = await remove(db, logo.id);
  assert.deepEqual(removed, { deleted: logo.id, bucket: "site-media", path: "library/22222222-logo.svg" });
  await expectError(remove(db, logo.id), /не знайдено/, "double delete");
  assert.equal((await list(db)).total, 42);
  const audit = (await db.query("select action, count(*)::int c from public.media_assets_audit group by action order by action")).rows;
  assert.deepEqual(Object.fromEntries(audit.map(row => [row.action, row.c])), { create: 43, delete: 1, update: 1 });
  const lastUpdate = await one(db, "select changes from public.media_assets_audit where action = 'update'");
  assert.deepEqual(lastUpdate.changes.alt, { from: "Котельня", to: "Котельня з котлом" });

  console.log(JSON.stringify({ status: "ok", scenarios: 8, suite: "media" }));
}
