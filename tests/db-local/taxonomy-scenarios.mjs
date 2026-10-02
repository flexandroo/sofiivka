// Taxonomy Admin v1 scenarios: brand and category editing, guards and release patching.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000011",
  manager: "00000000-0000-4000-8000-000000000012",
  content: "00000000-0000-4000-8000-000000000013"
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

export async function run(db) {
  // Fixtures (superuser): staff, one published product, an active release built from the tables.
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  const brand = await one(db, "select internal_id, stable_id from public.brands order by stable_id limit 1");
  const emptyBrand = await one(db, "select internal_id, stable_id from public.brands where stable_id <> $1 order by stable_id limit 1", [brand.stable_id]);
  const leaf = await one(db, `select category.internal_id, category.stable_id, parent.stable_id parent_id
    from public.categories category join public.categories parent on parent.internal_id = category.parent_id
    where category.level = (select max(level) from public.categories) and category.status = 'active' and category.visibility = 'catalog'
    order by category.stable_id limit 1`);
  const emptyLeaf = await one(db, `select stable_id from public.categories
    where level = (select max(level) from public.categories) and status = 'active' and visibility = 'catalog' and stable_id <> $1
    order by stable_id limit 1`, [leaf.stable_id]);
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status)
    values ('t-1', 'TSKU-1', 't-1', 'Тестовий товар', 'Товар', 'T1', $1, $2, 100, 'known', 'in_stock', 'published')`,
    [brand.internal_id, leaf.internal_id]);
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-test', 'test',
      (select jsonb_agg(jsonb_build_object('id', stable_id, 'title', title, 'name', title, 'slug', slug, 'facetIds', '[]'::jsonb, 'sectionId', 'keep-me') order by stable_id) from public.categories),
      (select jsonb_agg(jsonb_build_object('id', stable_id, 'name', name, 'type', 'catalog', 'futurePath', '/brands/' || slug || '/') order by stable_id) from public.brands),
      '{}'::jsonb, 1, 1, repeat('0', 64), true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-test')");
  await db.query("insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-test') on conflict (singleton) do nothing");

  // 1. Access: anon blocked, any active staff may read, only owner/admin/content_manager may write.
  await expectError(as(db, "anon", null, () => db.query("select public.admin_list_brands()")), /permission denied/, "anon list");
  await expectError(as(db, "authenticated", "00000000-0000-4000-8000-0000000000ff", () => db.query("select public.admin_list_categories()")), /Not authorized/, "non-staff list");
  const managerList = await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_list_brands() r"));
  assert.equal(managerList.r.canEdit, false);
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_update_brand($1, $2, null)", [brand.stable_id, { country: "Німеччина" }])),
    /Недостатньо прав/, "manager write");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select * from public.taxonomy_admin_audit")), /permission denied/, "audit direct read");

  // 2. Lists carry counts.
  const brands = (await owner(db, "select public.admin_list_brands() r")).r;
  assert.equal(brands.canEdit, true);
  const listedBrand = brands.brands.find(item => item.id === brand.stable_id);
  assert.equal(listedBrand.publishedCount, 1);
  const categories = (await owner(db, "select public.admin_list_categories() r")).r.categories;
  assert.equal(categories.find(item => item.id === leaf.stable_id).publishedCount, 1);
  assert.equal(categories.find(item => item.id === leaf.parent_id).publishedCount, 1, "parent rolls up descendants");

  // 3. Brand edit by a content manager: saved, audited, patched into the release, cache bumped.
  const brandBefore = (await owner(db, "select public.admin_get_brand($1) r", [brand.stable_id])).r.brand;
  const savedBrand = (await as(db, "authenticated", STAFF.content, () => one(db, "select public.admin_update_brand($1, $2, $3) r",
    [brand.stable_id, { description: "  Опис  ", country: "Італія", featured: true, featuredOrder: "3", seoTitle: "SEO бренду", websiteUrl: "https://example.com" }, brandBefore.updatedAt]))).r;
  assert.equal(savedBrand.brand.description, "Опис");
  assert.equal(savedBrand.brand.country, "Італія");
  assert.equal(savedBrand.brand.featuredOrder, 3);
  assert.equal(savedBrand.history.length, 1);
  assert.equal(savedBrand.history[0].actor, "Контент");
  assert.deepEqual(savedBrand.history[0].changes.country, { from: null, to: "Італія" });
  let release = await one(db, "select brands, categories from public.catalog_snapshot_releases where snapshot_version = 'v-test'");
  const releaseBrand = release.brands.find(item => item.id === brand.stable_id);
  assert.equal(releaseBrand.country, "Італія");
  assert.equal(releaseBrand.featured, true);
  assert.equal(releaseBrand.seo.title, "SEO бренду");
  assert.equal(releaseBrand.futurePath, `/brands/${releaseBrand.futurePath.split("/")[2]}/`, "untouched keys survive");
  assert.equal(release.brands.length, (await one(db, "select count(*)::int c from public.brands")).c, "other brands untouched");
  assert.equal((await one(db, "select revision from public.catalog_admin_cache_revision")).revision, 1);

  // Unfeaturing clears the order; a no-op save adds no audit row and no revision.
  const unfeatured = (await owner(db, "select public.admin_update_brand($1, $2, null) r", [brand.stable_id, { featured: false }])).r;
  assert.equal(unfeatured.brand.featuredOrder, null);
  await owner(db, "select public.admin_update_brand($1, $2, null) r", [brand.stable_id, { country: "Італія" }]);
  assert.equal((await owner(db, "select public.admin_get_brand($1) r", [brand.stable_id])).r.history.length, 2);
  assert.equal((await one(db, "select revision from public.catalog_admin_cache_revision")).revision, 2);

  // 4. Brand guards.
  await expectError(owner(db, "select public.admin_update_brand($1, $2, $3)", [brand.stable_id, { country: "X" }, brandBefore.updatedAt]),
    /інший працівник/, "stale brand save");
  await expectError(owner(db, "select public.admin_update_brand($1, $2, null)", [brand.stable_id, { visibility: "hidden" }]),
    /опубліковані товари \(1\)/, "hide brand with products");
  await expectError(owner(db, "select public.admin_update_brand($1, $2, null)", [brand.stable_id, { websiteUrl: "javascript:alert(1)" }]),
    /http/, "bad website");
  await expectError(owner(db, "select public.admin_update_brand($1, $2, null)", [brand.stable_id, { logoUrl: "data:image/png;base64,x" }]),
    /Логотип/, "bad logo");
  await expectError(owner(db, "select public.admin_update_brand($1, $2, null)", [brand.stable_id, { visibility: "secret" }]),
    /видимість/, "bad visibility");
  await expectError(owner(db, "select public.admin_update_brand($1, $2, null)", ["no-such-brand", { country: "X" }]),
    /не знайдено/, "missing brand");
  const hidden = (await owner(db, "select public.admin_update_brand($1, $2, null) r", [emptyBrand.stable_id, { visibility: "hidden" }])).r;
  assert.equal(hidden.brand.visibility, "hidden", "brand without published products can be hidden");
  assert.equal((await owner(db, "select public.admin_get_brand($1) r", ["no-such-brand"])).r, null);

  // 5. Category edit: content saved, metaTitle derived, other release keys kept.
  const categoryBefore = (await owner(db, "select public.admin_get_category($1) r", [leaf.stable_id])).r;
  assert.equal(categoryBefore.path.at(-1).id, leaf.parent_id);
  assert.equal(categoryBefore.category.publishedCount, 1);
  const savedCategory = (await as(db, "authenticated", STAFF.content, () => one(db, "select public.admin_update_category($1, $2, $3) r",
    [leaf.stable_id, { title: "Нова назва", menuDescription: "Коротко", sortOrder: "7" }, categoryBefore.category.updatedAt]))).r;
  assert.equal(savedCategory.category.title, "Нова назва");
  assert.equal(savedCategory.category.sortOrder, 7);
  release = await one(db, "select categories from public.catalog_snapshot_releases where snapshot_version = 'v-test'");
  const releaseCategory = release.categories.find(item => item.id === leaf.stable_id);
  assert.equal(releaseCategory.title, "Нова назва");
  assert.equal(releaseCategory.name, "Нова назва");
  assert.equal(releaseCategory.order, 7);
  assert.equal(releaseCategory.metaTitle, "Нова назва | ТД «Софіївка»");
  assert.equal(releaseCategory.sectionId, "keep-me");
  await owner(db, "select public.admin_update_category($1, $2, null)", [leaf.stable_id, { seoTitle: "Свій SEO" }]);
  release = await one(db, "select categories from public.catalog_snapshot_releases where snapshot_version = 'v-test'");
  assert.equal(release.categories.find(item => item.id === leaf.stable_id).metaTitle, "Свій SEO");

  // 6. Category guards: cannot take a category (or its parent) with published products out of the catalogue.
  await expectError(owner(db, "select public.admin_update_category($1, $2, null)", [leaf.stable_id, { status: "archived" }]),
    /опубліковані товари \(1\)/, "archive leaf with products");
  await expectError(owner(db, "select public.admin_update_category($1, $2, null)", [leaf.parent_id, { visibility: "hidden" }]),
    /опубліковані товари \(1\)/, "hide parent with products in subtree");
  await expectError(owner(db, "select public.admin_update_category($1, $2, null)", [leaf.stable_id, { title: "   " }]),
    /обов/, "empty title");
  await expectError(owner(db, "select public.admin_update_category($1, $2, null)", [leaf.stable_id, { sortOrder: "-1" }]),
    /Порядок/, "negative order");
  const archived = (await owner(db, "select public.admin_update_category($1, $2, null) r", [emptyLeaf.stable_id, { status: "future" }])).r;
  assert.equal(archived.category.status, "future", "empty category can leave the catalogue");

  // 7. Identity fields are not editable through the patch.
  const slugBefore = (await one(db, "select slug from public.categories where stable_id = $1", [leaf.stable_id])).slug;
  await owner(db, "select public.admin_update_category($1, $2, null)", [leaf.stable_id, { slug: "hacked", parentId: null, level: 1 }]);
  assert.equal((await one(db, "select slug from public.categories where stable_id = $1", [leaf.stable_id])).slug, slugBefore);

  console.log(JSON.stringify({ status: "ok", scenarios: 7, suite: "taxonomy" }));
}
