// Taxonomy Admin v2 scenarios: creating and deleting brands and categories, homepage selection.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000021",
  manager: "00000000-0000-4000-8000-000000000022",
  content: "00000000-0000-4000-8000-000000000023"
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
const owner = (db, sql, params) => as(db, "authenticated", STAFF.owner, () => one(db, sql, params));
const release = db => one(db, "select brands, categories from public.catalog_snapshot_releases where snapshot_version = 'v-test'");
const revision = async db => (await one(db, "select revision from public.catalog_admin_cache_revision")).revision;

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  const brand = await one(db, "select internal_id, stable_id from public.brands order by stable_id limit 1");
  const leaf = await one(db, `select internal_id, stable_id from public.categories
    where level = 3 and status = 'active' and visibility = 'catalog' order by stable_id limit 1`);
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status)
    values ('t-2', 'TSKU-2', 't-2', 'Тестовий товар', 'Товар', 'T2', $1, $2, 100, 'known', 'in_stock', 'draft')`,
    [brand.internal_id, leaf.internal_id]);
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-test', 'test',
      (select jsonb_agg(jsonb_build_object('id', stable_id, 'title', title, 'facetIds', '[]'::jsonb) order by stable_id) from public.categories),
      (select jsonb_agg(jsonb_build_object('id', stable_id, 'name', name) order by stable_id) from public.brands),
      '{}'::jsonb, 1, 1, repeat('0', 64), true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-test')");
  await db.query("insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-test') on conflict (singleton) do nothing");

  // 1. Migration seeded the homepage with the active top-level sections, in catalogue order.
  const seeded = (await owner(db, "select public.admin_get_homepage_categories() r")).r;
  const roots = (await db.query(`select stable_id from public.categories
    where parent_id is null and status = 'active' and visibility = 'catalog' order by sort_order, stable_id`)).rows.map(row => row.stable_id);
  assert.deepEqual(seeded.categoryIds, roots);
  assert.ok(roots.length > 0);

  // 2. Access: managers read only, anon nothing.
  await expectError(as(db, "anon", null, () => db.query("select public.admin_create_brand('{}')")), /permission denied/, "anon create");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_create_brand($1)", [{ name: "X" }])),
    /Недостатньо прав/, "manager create brand");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_set_homepage_categories($1)", [[roots[0]]])),
    /Недостатньо прав/, "manager homepage");
  assert.equal((await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_get_homepage_categories() r"))).r.canEdit, false);

  // 3. Brand create: slug from Ukrainian name, extra fields validated by the editor, release entry appended.
  const revisionBefore = await revision(db);
  const created = (await as(db, "authenticated", STAFF.content, () => one(db, "select public.admin_create_brand($1) r",
    [{ name: "Щедрий Жар", country: "Україна", websiteUrl: "https://example.com" }]))).r;
  assert.equal(created.brand.id, "shchedryi-zhar");
  assert.equal(created.brand.country, "Україна");
  assert.equal(created.history.find(item => item.changes.created)?.changes.created.to, "Щедрий Жар");
  let snapshot = await release(db);
  const entry = snapshot.brands.find(item => item.id === "shchedryi-zhar");
  assert.equal(entry.name, "Щедрий Жар");
  assert.equal(entry.type, "catalog");
  assert.equal(entry.futurePath, "/brands/shchedryi-zhar/");
  assert.equal(entry.country, "Україна");
  assert.ok(await revision(db) > revisionBefore);

  await expectError(owner(db, "select public.admin_create_brand($1)", [{ name: "щедрий жар" }]), /такою назвою/, "duplicate name");
  await expectError(owner(db, "select public.admin_create_brand($1)", [{ name: "Інший", slug: "shchedryi-zhar" }]), /зайнята/, "duplicate slug");
  await expectError(owner(db, "select public.admin_create_brand($1)", [{ name: "Bad", slug: "Bad Slug" }]), /латинські/, "bad slug");
  await expectError(owner(db, "select public.admin_create_brand($1)", [{ name: "   " }]), /обов/, "empty name");
  await expectError(owner(db, "select public.admin_create_brand($1)", [{ name: "Bad url", websiteUrl: "ftp://x" }]), /http/, "bad website rolls back");
  assert.equal((await one(db, "select count(*)::int c from public.brands where name = 'Bad url'")).c, 0, "failed create leaves nothing");

  // 4. Brand delete: blocked by products, allowed when unused.
  await expectError(owner(db, "select public.admin_delete_brand($1, null)", [brand.stable_id]), /товари \(1\)/, "brand with products");
  await expectError(owner(db, "select public.admin_delete_brand($1, $2)", ["shchedryi-zhar", "2000-01-01T00:00:00Z"]), /інший працівник/, "stale delete");
  await owner(db, "select public.admin_delete_brand($1, null)", ["shchedryi-zhar"]);
  assert.equal((await one(db, "select count(*)::int c from public.brands where stable_id = 'shchedryi-zhar'")).c, 0);
  snapshot = await release(db);
  assert.equal(snapshot.brands.some(item => item.id === "shchedryi-zhar"), false);
  assert.equal((await one(db, "select count(*)::int c from public.taxonomy_admin_audit where stable_id = 'shchedryi-zhar'")).c, 3, "audit kept");

  // 5. Category create under a section: level, section and order derived, release entry appended.
  const section = await one(db, `select internal_id, stable_id from public.categories where parent_id is null order by sort_order limit 1`);
  const sub = (await owner(db, "select public.admin_create_category($1) r", [{ title: "Теплі підлоги", parentId: section.stable_id, menuDescription: "Мати й кабелі" }])).r;
  assert.equal(sub.category.slug, "tepli-pidlohy");
  assert.equal(sub.category.level, 2);
  assert.equal(sub.category.status, "active");
  assert.equal(sub.category.menuDescription, "Мати й кабелі");
  assert.equal(sub.path[0].id, section.stable_id);
  snapshot = await release(db);
  const subEntry = snapshot.categories.find(item => item.id === sub.category.id);
  assert.equal(subEntry.parentId, section.stable_id);
  assert.equal(subEntry.sectionId, section.stable_id);
  assert.equal(subEntry.level, 2);
  assert.deepEqual(subEntry.facetIds, []);
  assert.equal(subEntry.metaTitle, "Теплі підлоги | ТД «Софіївка»");
  assert.equal(subEntry.menuDescription, "Мати й кабелі");

  const leafChild = (await owner(db, "select public.admin_create_category($1) r", [{ title: "Мати", parentId: sub.category.id }])).r;
  assert.equal(leafChild.category.level, 3);
  assert.equal((await release(db)).categories.find(item => item.id === leafChild.category.id).sectionId, section.stable_id);
  await expectError(owner(db, "select public.admin_create_category($1)", [{ title: "Глибше", parentId: leafChild.category.id }]), /три рівні/, "fourth level");
  await expectError(owner(db, "select public.admin_create_category($1)", [{ title: "Мати", parentId: sub.category.id }]), /уже є на цьому рівні/, "duplicate sibling slug");
  await expectError(owner(db, "select public.admin_create_category($1)", [{ title: "X", parentId: "no-such" }]), /не знайдено/, "missing parent");

  // Same slug under another parent gets a distinct stable id.
  const otherSection = await one(db, `select stable_id from public.categories where parent_id is null and stable_id <> $1 order by sort_order limit 1`, [section.stable_id]);
  const twin = (await owner(db, "select public.admin_create_category($1) r", [{ title: "Теплі підлоги", parentId: otherSection.stable_id }])).r;
  assert.equal(twin.category.slug, "tepli-pidlohy");
  assert.notEqual(twin.category.id, sub.category.id);

  const root = (await owner(db, "select public.admin_create_category($1) r", [{ title: "Сантехніка 2", status: "future" }])).r;
  assert.equal(root.category.level, 1);
  assert.equal(root.category.status, "future");

  // 6. Category delete: blocked by children and products, allowed for empty leaves.
  await expectError(owner(db, "select public.admin_delete_category($1, null)", [sub.category.id]), /підкатегорії \(1\)/, "delete with child");
  await expectError(owner(db, "select public.admin_delete_category($1, null)", [leaf.stable_id]), /товари \(1\)/, "delete with draft product");
  await owner(db, "select public.admin_delete_category($1, null)", [leafChild.category.id]);
  await owner(db, "select public.admin_delete_category($1, null)", [sub.category.id]);
  snapshot = await release(db);
  assert.equal(snapshot.categories.some(item => item.id === sub.category.id || item.id === leafChild.category.id), false);

  // 7. Homepage selection: order kept, others cleared, release carries homepageOrder.
  const picked = [leaf.stable_id, roots[0]];
  const saved = (await owner(db, "select public.admin_set_homepage_categories($1) r", [picked])).r;
  assert.deepEqual(saved.categoryIds, picked);
  snapshot = await release(db);
  const order = id => snapshot.categories.find(item => item.id === id).homepageOrder;
  assert.ok(order(leaf.stable_id) < order(roots[0]));
  if (roots[1]) assert.equal(order(roots[1]), null);
  await expectError(owner(db, "select public.admin_set_homepage_categories($1)", [[]]), /від 1 до 8/, "empty homepage");
  await expectError(owner(db, "select public.admin_set_homepage_categories($1)", [[roots[0], roots[0]]]), /повторюється/, "duplicate homepage");
  await expectError(owner(db, "select public.admin_set_homepage_categories($1)", [["no-such"]]), /не знайдено/, "missing homepage");
  const listed = (await owner(db, "select public.admin_list_categories() r")).r.categories;
  assert.equal(listed.find(item => item.id === leaf.stable_id).homepageOrder, 10);

  console.log(JSON.stringify({ status: "ok", scenarios: 7, suite: "taxonomy-v2" }));
}
