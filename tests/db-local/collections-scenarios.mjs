// Collections Admin v1 scenarios: access by role, membership and order, storefront visibility,
// schedule window, guards, audit and cache revision.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000031",
  manager: "00000000-0000-4000-8000-000000000032",
  content: "00000000-0000-4000-8000-000000000033"
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
const owner = async (db, sql, params) => (await as(db, "authenticated", STAFF.owner, () => one(db, sql, params))).r;
const content = async (db, sql, params) => (await as(db, "authenticated", STAFF.content, () => one(db, sql, params))).r;
const publicCollection = async (db, id) => (await as(db, "anon", null, () => one(db, "select public.get_catalog_collection($1) r", [id]))).r;
const publicIds = async (db, id) => ((await publicCollection(db, id))?.products || []).map(product => product.id);
const revision = async db => Number((await one(db, "select revision from public.catalog_admin_cache_revision")).revision);
const cardCollections = async (db, legacyId) => (await one(db,
  "select card -> 'collections' c from public.catalog_product_cards where snapshot_version = 'v-col' and legacy_id = $1", [legacyId]))?.c;

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  const brand = await one(db, "select internal_id from public.brands where status = 'active' order by stable_id limit 1");
  const leaf = await one(db, `select internal_id from public.categories
    where level = 3 and status = 'active' and visibility = 'catalog' order by stable_id limit 1`);
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, old_amount, price_status, inventory_status, publication_status)
    values ('c-1', 'CSKU-1', 'c-1', 'Котел Альфа', 'Альфа', 'A1', $1, $2, 1000, null, 'known', 'in_stock', 'published'),
           ('c-2', 'CSKU-2', 'c-2', 'Бойлер Бета', 'Бета', 'B2', $1, $2, 900, 1200, 'known', 'in_stock', 'published'),
           ('c-3', 'CSKU-3', 'c-3', 'Насос Гамма', 'Гамма', 'G3', $1, $2, 500, null, 'known', 'in_stock', 'published'),
           ('c-4', 'CSKU-4', 'c-4', 'Фільтр Дельта', 'Дельта', 'D4', $1, $2, 300, null, 'known', 'in_stock', 'draft')`,
    [brand.internal_id, leaf.internal_id]);
  await db.query("insert into public.tags (stable_id, slug, name) values ('sale', 'sale', 'Акція')");
  await db.query(`insert into public.product_tags (product_id, tag_id)
    select product.internal_id, tag.internal_id from public.products product, public.tags tag
    where product.legacy_id = 'c-3' and tag.stable_id = 'sale'`);

  // Active release with cards for the published products.
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-col', 'test', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 4, 3, repeat('0', 64), true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-col')");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-col')
    on conflict (singleton) do update set base_snapshot_version = 'v-col', revision = 0`);
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id order by legacy_id)) from public.products where legacy_id like 'c-%'");
  assert.equal((await one(db, "select count(*)::int c from public.catalog_product_cards where snapshot_version = 'v-col'")).c, 3);

  // 1. The migration provides both homepage blocks with readable titles.
  const listed = await owner(db, "select public.admin_list_collections() r");
  assert.equal(listed.canEdit, true);
  assert.deepEqual(listed.collections.slice(0, 2).map(item => [item.id, item.title, item.homepageBlock]),
    [["homepage-products", "Хіти продажів", "popular"], ["homepage-sale-products", "Акційні пропозиції", "sale"]]);

  // 2. Access: anon none, manager reads only, content manager edits.
  await expectError(as(db, "anon", null, () => db.query("select public.admin_list_collections()")), /permission denied/, "anon list");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_set_collection_products('homepage-products', '{}', null)")), /permission denied/, "anon set");
  await expectError(as(db, "authenticated", "00000000-0000-4000-8000-0000000000ff", () => db.query("select public.admin_list_collections()")), /Not authorized/, "no profile");
  const managerView = (await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_get_collection('homepage-products') r"))).r;
  assert.equal(managerView.canEdit, false);
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_set_collection_products('homepage-products', $1, null)", [["c-1"]])),
    /Недостатньо прав/, "manager set");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_update_collection('homepage-products', $1, null)", [{ title: "X" }])),
    /Недостатньо прав/, "manager update");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_create_collection($1)", [{ title: "X" }])),
    /Недостатньо прав/, "manager create");

  // 3. Membership and order; the storefront follows, drafts stay off the site.
  let revisionBefore = await revision(db);
  let detail = await content(db, "select public.admin_get_collection('homepage-products') r");
  assert.deepEqual(detail.items, []);
  detail = await content(db, "select public.admin_set_collection_products('homepage-products', $1, $2) r", [["c-3", "c-1", "c-4"], detail.collection.updatedAt]);
  assert.deepEqual(detail.items.map(item => item.legacyId), ["c-3", "c-1", "c-4"]);
  assert.equal(detail.items[2].publicationStatus, "draft");
  assert.equal(detail.items[2].inCatalog, false);
  assert.deepEqual(detail.items[0].tags, ["sale"]);
  assert.equal(detail.collection.itemCount, 3);
  assert.equal(detail.collection.publishedCount, 2);
  assert.deepEqual(await publicIds(db, "homepage-products"), ["c-3", "c-1"]);
  assert.ok(await revision(db) > revisionBefore, "membership change bumps the cache revision");
  assert.match((await publicCollection(db, "homepage-products")).version, /:admin:/);
  assert.deepEqual(await cardCollections(db, "c-1"), ["homepage-products"], "card lists its collections");

  // Reorder only, then replace (c-1 leaves, c-2 joins).
  revisionBefore = await revision(db);
  detail = await content(db, "select public.admin_set_collection_products('homepage-products', $1, $2) r", [["c-1", "c-4", "c-3"], detail.collection.updatedAt]);
  assert.deepEqual(await publicIds(db, "homepage-products"), ["c-1", "c-3"]);
  assert.ok(await revision(db) > revisionBefore, "reorder bumps the cache revision");
  detail = await content(db, "select public.admin_set_collection_products('homepage-products', $1, $2) r", [["c-2", "c-3"], detail.collection.updatedAt]);
  assert.deepEqual(detail.items.map(item => item.legacyId), ["c-2", "c-3"]);
  assert.deepEqual(await publicIds(db, "homepage-products"), ["c-2", "c-3"]);
  assert.deepEqual(await cardCollections(db, "c-1"), [], "removed product card no longer lists the collection");
  assert.deepEqual(await cardCollections(db, "c-2"), ["homepage-products"]);

  // Saving the same list is a no-op: no audit row, no revision bump.
  const auditCount = async () => (await one(db, "select count(*)::int c from public.taxonomy_admin_audit where entity_type = 'collection'")).c;
  const auditBefore = await auditCount();
  revisionBefore = await revision(db);
  detail = await content(db, "select public.admin_set_collection_products('homepage-products', $1, null) r", [["c-2", "c-3"]]);
  assert.equal(await auditCount(), auditBefore);
  assert.equal(await revision(db), revisionBefore);
  assert.ok(detail.history.some(entry => entry.changes.products), "membership changes are audited");

  // 4. Guards.
  await expectError(content(db, "select public.admin_set_collection_products('homepage-products', $1, null) r", [["c-1", "c-1"]]), /повторюється/, "duplicate product");
  await expectError(content(db, "select public.admin_set_collection_products('homepage-products', $1, null) r", [["c-1", "nope"]]), /«nope» не знайдено/, "missing product");
  await expectError(content(db, "select public.admin_set_collection_products('homepage-products', $1, null) r", [Array.from({ length: 101 }, (_, i) => `x-${i}`)]), /до 100/, "too many");
  await expectError(content(db, "select public.admin_set_collection_products('no-such', $1, null) r", [[]]), /Підбірку не знайдено/, "missing collection");
  await expectError(content(db, "select public.admin_set_collection_products('homepage-products', $1, $2) r", [["c-1"], "2000-01-01T00:00:00Z"]), /інший працівник/, "stale set");
  assert.deepEqual(await publicIds(db, "homepage-products"), ["c-2", "c-3"], "failed saves change nothing");

  // 5. Visibility: switching off hides the block; schedule window is honoured.
  detail = await content(db, "select public.admin_update_collection('homepage-products', $1, $2) r", [{ active: false }, detail.collection.updatedAt]);
  assert.equal(detail.collection.active, false);
  assert.equal(detail.collection.live, false);
  assert.equal(await publicCollection(db, "homepage-products"), null);
  assert.deepEqual(await cardCollections(db, "c-2"), [], "inactive collection leaves member cards");
  detail = await content(db, "select public.admin_update_collection('homepage-products', $1, null) r", [{ active: true, dateFrom: "2099-01-01T00:00:00Z" }]);
  assert.equal(detail.collection.live, false);
  assert.equal(await publicCollection(db, "homepage-products"), null, "future start hides the block");
  detail = await content(db, "select public.admin_update_collection('homepage-products', $1, null) r", [{ dateFrom: "2020-01-01T00:00:00Z", dateTo: "2020-02-01T00:00:00Z" }]);
  assert.equal(await publicCollection(db, "homepage-products"), null, "past end hides the block");
  detail = await content(db, "select public.admin_update_collection('homepage-products', $1, null) r", [{ dateFrom: "", dateTo: null }]);
  assert.equal(detail.collection.dateFrom, null);
  assert.equal(detail.collection.live, true);
  assert.deepEqual(await publicIds(db, "homepage-products"), ["c-2", "c-3"]);
  assert.deepEqual(await cardCollections(db, "c-2"), ["homepage-products"]);
  await expectError(content(db, "select public.admin_update_collection('homepage-products', $1, null) r", [{ dateFrom: "2026-05-02", dateTo: "2026-05-01" }]), /раніша/, "inverted window");
  await expectError(content(db, "select public.admin_update_collection('homepage-products', $1, null) r", [{ dateFrom: "завтра" }]), /Некоректна дата/, "bad date");
  await expectError(content(db, "select public.admin_update_collection('homepage-products', $1, null) r", [{ title: "  " }]), /обов/, "empty title");
  await expectError(content(db, "select public.admin_update_collection('homepage-products', $1, null) r", [{ type: "weird" }]), /тип/, "bad type");
  await expectError(content(db, "select public.admin_update_collection('homepage-products', $1, null) r", [{ active: "yes" }]), /Показувати/, "bad active");
  revisionBefore = await revision(db);
  detail = await content(db, "select public.admin_update_collection('homepage-products', $1, null) r", [{ title: "Хіти сезону", description: "Добірка менеджера" }]);
  assert.equal(detail.collection.title, "Хіти сезону");
  assert.equal((await publicCollection(db, "homepage-products")).collection.title, "Хіти сезону");
  assert.ok(await revision(db) > revisionBefore, "metadata change bumps the cache revision");

  // 6. Create, fill and delete a custom collection; homepage blocks cannot be deleted.
  const created = await content(db, "select public.admin_create_collection($1) r", [{ title: "Зимовий сезон", type: "promotion" }]);
  assert.equal(created.collection.id, "zymovyi-sezon");
  assert.equal(created.collection.type, "promotion");
  assert.equal(created.collection.homepageBlock, null);
  await expectError(content(db, "select public.admin_create_collection($1)", [{ title: "Інша", slug: "zymovyi-sezon" }]), /зайнятий/, "duplicate code");
  await expectError(content(db, "select public.admin_create_collection($1)", [{ title: "Bad", slug: "Bad Code" }]), /латинські/, "bad code");
  await expectError(content(db, "select public.admin_create_collection($1)", [{ title: "Bad date", dateFrom: "x" }]), /Некоректна дата/, "bad create rolls back");
  assert.equal((await one(db, "select count(*)::int c from public.product_collections where title = 'Bad date'")).c, 0);
  await content(db, "select public.admin_set_collection_products('zymovyi-sezon', $1, null) r", [["c-1", "c-2"]]);
  assert.deepEqual(await publicIds(db, "zymovyi-sezon"), ["c-1", "c-2"]);
  assert.deepEqual(await cardCollections(db, "c-2"), ["homepage-products", "zymovyi-sezon"]);
  await expectError(content(db, "select public.admin_delete_collection('homepage-sale-products', null)"), /головна сторінка/, "homepage block delete");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_delete_collection('zymovyi-sezon', null)")), /Недостатньо прав/, "manager delete");
  await content(db, "select public.admin_delete_collection('zymovyi-sezon', null) r");
  assert.equal(await publicCollection(db, "zymovyi-sezon"), null);
  assert.equal((await one(db, "select count(*)::int c from public.product_collection_items item join public.product_collections c on c.internal_id = item.collection_id where c.stable_id = 'zymovyi-sezon'")).c, 0);
  assert.deepEqual(await cardCollections(db, "c-2"), ["homepage-products"], "deleted collection leaves member cards");
  assert.equal((await one(db, "select count(*)::int c from public.taxonomy_admin_audit where stable_id = 'zymovyi-sezon'")).c, 4, "audit kept");

  // 7. Product picker: matches title/SKU, published first, carries tags for the sale rule.
  const hits = await content(db, "select public.admin_search_collection_products($1, 10) r", ["CSKU"]);
  assert.equal(hits.length, 4);
  assert.equal(hits.at(-1).legacyId, "c-4", "drafts sort last");
  assert.deepEqual((await content(db, "select public.admin_search_collection_products($1) r", ["Гамма"])).map(item => [item.legacyId, item.tags]), [["c-3", ["sale"]]]);
  assert.equal(Number((await content(db, "select public.admin_search_collection_products($1) r", ["CSKU-2"]))[0].oldAmount), 1200);
  assert.deepEqual(await content(db, "select public.admin_search_collection_products($1) r", ["a"]), []);
  await expectError(as(db, "anon", null, () => db.query("select public.admin_search_collection_products('CSKU')")), /permission denied/, "anon search");

  // 8. Internal helpers are not callable by clients.
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select public._collection_publish('{}')")), /permission denied/, "helper hidden");

  console.log(JSON.stringify({ status: "ok", scenarios: 8, suite: "collections" }));
}
