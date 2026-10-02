// Attributes Admin v1 scenarios: characteristic definitions, category filters, guards and
// release patching (attribute_definitions entries, category facetIds / allowedFacetIds).
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
const release = db => one(db, "select categories, attribute_definitions from public.catalog_snapshot_releases where snapshot_version = 'v-attr'");
const revision = async db => (await one(db, "select revision from public.catalog_admin_cache_revision")).revision;

export async function run(db) {
  // Fixtures (superuser): staff, a leaf category with seeded filters, one product with a value,
  // and an active release built from the tables.
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  const leaf = await one(db, `select category.internal_id, category.stable_id from public.categories category
    where exists (select 1 from public.category_attributes relation where relation.category_id = category.internal_id and relation.facet_enabled)
      and exists (select 1 from public.category_attributes relation where relation.category_id = category.internal_id and not relation.facet_enabled)
    order by category.level desc, category.stable_id limit 1`);
  assert.ok(leaf, "seed has a category with filter and non-filter characteristics");
  const brand = await one(db, "select internal_id from public.brands order by stable_id limit 1");
  const product = await one(db, `insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status)
    values ('a-1', 'ASKU-1', 'a-1', 'Тестовий товар', 'Товар', 'A1', $1, $2, 100, 'known', 'in_stock', 'published') returning internal_id`,
    [brand.internal_id, leaf.internal_id]);
  const filled = await one(db, `select definition.internal_id, definition.stable_id, definition.value_type from public.category_attributes relation
    join public.attribute_definitions definition on definition.internal_id = relation.attribute_id
    where relation.category_id = $1 and definition.value_type = 'number' order by relation.sort_order limit 1`, [leaf.internal_id]);
  await db.query("insert into public.product_attribute_values (product_id, attribute_id, value_number) values ($1, $2, 42)", [product.internal_id, filled.internal_id]);

  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-attr', 'test',
      (select jsonb_agg(jsonb_build_object('id', category.stable_id, 'title', category.title, 'sectionId', 'keep-me',
        'facetIds', coalesce((select jsonb_agg(definition.stable_id order by relation.sort_order) from public.category_attributes relation
          join public.attribute_definitions definition on definition.internal_id = relation.attribute_id where relation.category_id = category.internal_id), '[]'::jsonb),
        'allowedFacetIds', coalesce((select jsonb_agg(definition.stable_id order by relation.sort_order) from public.category_attributes relation
          join public.attribute_definitions definition on definition.internal_id = relation.attribute_id where relation.category_id = category.internal_id), '[]'::jsonb))
        order by category.stable_id) from public.categories category),
      '[]'::jsonb,
      (select jsonb_object_agg(stable_id, jsonb_build_object('id', stable_id, 'label', label, 'type', value_type, 'unit', coalesce(unit, ''),
        'filterable', filterable, 'sortable', sortable, 'rank', sort_order, 'aliases', '[{}]'::jsonb, 'options', null)) from public.attribute_definitions),
      1, 1, repeat('0', 64), true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-attr')");
  await db.query("insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-attr') on conflict (singleton) do update set base_snapshot_version = 'v-attr', revision = 0");
  const startRevision = await revision(db);

  // 1. Access: anon blocked, any active staff may read, only owner/admin/content_manager may write.
  await expectError(as(db, "anon", null, () => db.query("select public.admin_list_attributes()")), /permission denied/, "anon list");
  await expectError(as(db, "authenticated", "00000000-0000-4000-8000-0000000000ff", () => db.query("select public.admin_list_attributes()")), /Not authorized/, "non-staff list");
  const managerList = await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_list_attributes() r"));
  assert.equal(managerList.r.canEdit, false);
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_update_attribute($1, $2, null)", [filled.stable_id, { label: "X" }])),
    /Недостатньо прав/, "manager write");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_set_category_attributes($1, $2, null)", [leaf.stable_id, { items: [] }])),
    /Недостатньо прав/, "manager filters write");

  // 2. List carries usage counts.
  const list = (await owner(db, "select public.admin_list_attributes() r")).r;
  assert.equal(list.canEdit, true);
  const listed = list.attributes.find(item => item.id === filled.stable_id);
  assert.equal(listed.productCount, 1);
  assert.ok(listed.categoryCount >= 1);
  const detail = (await owner(db, "select public.admin_get_attribute($1) r", [filled.stable_id])).r;
  assert.ok(detail.categories.some(item => item.id === leaf.stable_id && item.productCount === 1));
  assert.equal(detail.topValues[0].value, "42");
  assert.equal((await owner(db, "select public.admin_get_attribute($1) r", ["noSuchAttribute"])).r, null);

  // 3. Definition edit by a content manager: saved, audited, patched into the release, cache bumped.
  const saved = (await as(db, "authenticated", STAFF.content, () => one(db, "select public.admin_update_attribute($1, $2, $3) r",
    [filled.stable_id, { label: "  Нова назва  ", unit: "кВт·год", sortOrder: "3.5", sortable: true }, detail.attribute.updatedAt]))).r;
  assert.equal(saved.attribute.label, "Нова назва");
  assert.equal(saved.attribute.unit, "кВт·год");
  assert.equal(Number(saved.attribute.sortOrder), 3.5);
  assert.equal(saved.history[0].actor, "Контент");
  assert.deepEqual(saved.history[0].changes.label.to, "Нова назва");
  let snapshot = await release(db);
  const entry = snapshot.attribute_definitions[filled.stable_id];
  assert.equal(entry.label, "Нова назва");
  assert.equal(entry.unit, "кВт·год");
  assert.equal(Number(entry.rank), 3.5);
  assert.equal(entry.sortable, true);
  assert.deepEqual(entry.aliases, [{}], "keys the admin does not own survive");
  assert.equal(await revision(db), startRevision + 1);

  // No-op save: no audit row, no revision bump.
  await owner(db, "select public.admin_update_attribute($1, $2, null)", [filled.stable_id, { label: "Нова назва" }]);
  assert.equal((await owner(db, "select public.admin_get_attribute($1) r", [filled.stable_id])).r.history.length, 1);
  assert.equal(await revision(db), startRevision + 1);

  // 4. Definition guards.
  await expectError(owner(db, "select public.admin_update_attribute($1, $2, $3)", [filled.stable_id, { label: "X" }, detail.attribute.updatedAt]),
    /інший працівник/, "stale save");
  await expectError(owner(db, "select public.admin_update_attribute($1, $2, null)", [filled.stable_id, { valueType: "string" }]),
    /заповнено в товарах \(1\)/, "type change with values");
  await expectError(owner(db, "select public.admin_update_attribute($1, $2, null)", [filled.stable_id, { label: "  " }]), /обов/, "empty label");
  await expectError(owner(db, "select public.admin_update_attribute($1, $2, null)", [filled.stable_id, { sortOrder: "-1" }]), /Порядок/, "bad order");
  await expectError(owner(db, "select public.admin_update_attribute($1, $2, null)", [filled.stable_id, { filterable: "yes" }]), /Фільтр/, "bad flag");
  await expectError(owner(db, "select public.admin_update_attribute($1, $2, null)", [filled.stable_id, { options: [{ value: "a" }] }]),
    /Список значень/, "options on a number");
  await expectError(owner(db, "select public.admin_update_attribute($1, $2, null)", ["noSuchAttribute", { label: "X" }]), /не знайдено/, "missing");

  // 5. Create: code from the label, release entry with full storefront shape, options for select.
  const created = (await owner(db, "select public.admin_create_attribute($1) r", [{ label: "Тип теплообмінника", valueType: "select", unit: "", filterable: true }])).r;
  assert.equal(created.attribute.id, "typTeploobminnyka");
  assert.equal(created.attribute.valueType, "select");
  await expectError(owner(db, "select public.admin_create_attribute($1)", [{ label: "Тип теплообмінника" }]), /такою назвою/, "duplicate label");
  await expectError(owner(db, "select public.admin_create_attribute($1)", [{ label: "Інша", id: "Bad-Code" }]), /Код/, "bad code");
  await expectError(owner(db, "select public.admin_create_attribute($1)", [{ label: "Інша", id: filled.stable_id }]), /зайнятий/, "taken code");
  await expectError(owner(db, "select public.admin_create_attribute($1)", [{ label: "Інша", valueType: "date" }]), /тип/, "bad type");
  const withOptions = (await owner(db, "select public.admin_update_attribute($1, $2, null) r",
    [created.attribute.id, { options: [{ value: "plate", label: "Пластинчастий" }, { value: "coil", label: "" }] }])).r;
  assert.deepEqual(withOptions.options.map(item => [item.value, item.label, item.active]), [["plate", "Пластинчастий", true], ["coil", "coil", true]]);
  await expectError(owner(db, "select public.admin_update_attribute($1, $2, null)", [created.attribute.id, { options: [{ value: "a" }, { value: "a" }] }]),
    /повторюється/, "duplicate option");
  const trimmed = (await owner(db, "select public.admin_update_attribute($1, $2, null) r", [created.attribute.id, { options: [{ value: "coil", label: "Змійовик" }] }])).r;
  assert.deepEqual(trimmed.options.map(item => [item.value, item.active]), [["coil", true], ["plate", false]], "removed options are deactivated");
  snapshot = await release(db);
  const createdEntry = snapshot.attribute_definitions[created.attribute.id];
  assert.equal(createdEntry.type, "select");
  assert.equal(createdEntry.filterable, true);
  assert.deepEqual(createdEntry.options, [{ value: "coil", label: "Змійовик" }]);
  assert.deepEqual(createdEntry.booleanValues, { true: [], false: [] });
  assert.deepEqual(createdEntry.aliases, []);
  const flag = (await owner(db, "select public.admin_create_attribute($1) r", [{ label: "Wi-Fi модуль", valueType: "boolean", sortOrder: "40" }])).r;
  assert.equal(flag.attribute.id, "wiFiModul");
  assert.equal(Number(flag.attribute.sortOrder), 40);
  assert.deepEqual((await release(db)).attribute_definitions.wiFiModul.legacyValues, { true: "yes", false: "no" });
  // Type changes freely while no product has a value.
  const retyped = (await owner(db, "select public.admin_update_attribute($1, $2, null) r", [flag.attribute.id, { valueType: "string" }])).r;
  assert.equal(retyped.attribute.valueType, "string");

  // 6. Category filters: add, toggle, reorder, remove; release facetIds / allowedFacetIds follow.
  const config = (await owner(db, "select public.admin_get_category_attributes($1) r", [leaf.stable_id])).r;
  assert.ok(config.items.length >= 2);
  assert.ok(config.available.some(item => item.id === created.attribute.id));
  const nonFilterable = config.items.find(item => !item.filterable);
  const reordered = [
    { id: created.attribute.id, facetEnabled: true, required: false },
    ...config.items.filter(item => item.id !== config.items[0].id).reverse()
      .map(item => ({ id: item.id, facetEnabled: item.facetEnabled, required: item.id === filled.stable_id }))
  ];
  const savedConfig = (await as(db, "authenticated", STAFF.content, () => one(db, "select public.admin_set_category_attributes($1, $2, $3) r",
    [leaf.stable_id, { items: reordered }, config.version]))).r;
  assert.deepEqual(savedConfig.items.map(item => item.id), reordered.map(item => item.id));
  assert.equal(savedConfig.items[0].facetEnabled, true);
  assert.notEqual(savedConfig.version, config.version);
  snapshot = await release(db);
  const releaseCategory = snapshot.categories.find(item => item.id === leaf.stable_id);
  assert.deepEqual(releaseCategory.allowedFacetIds, reordered.map(item => item.id));
  assert.deepEqual(releaseCategory.facetIds, reordered.filter(item => item.facetEnabled).map(item => item.id));
  assert.equal(releaseCategory.sectionId, "keep-me", "other release keys survive");
  assert.ok(!releaseCategory.allowedFacetIds.includes(config.items[0].id), "left-out characteristic is unlinked");
  const categoryHistory = (await owner(db, "select public.admin_get_category($1) r", [leaf.stable_id])).r.history;
  assert.ok(categoryHistory[0].changes.filters, "filter changes appear in the category history");

  await expectError(owner(db, "select public.admin_set_category_attributes($1, $2, $3)", [leaf.stable_id, { items: reordered }, config.version]),
    /інший працівник/, "stale filters");
  if (nonFilterable) {
    await expectError(owner(db, "select public.admin_set_category_attributes($1, $2, null)",
      [leaf.stable_id, { items: [{ id: nonFilterable.id, facetEnabled: true }] }]), /не може бути фільтром/, "facet on non-filterable");
  }
  await expectError(owner(db, "select public.admin_set_category_attributes($1, $2, null)",
    [leaf.stable_id, { items: [{ id: filled.stable_id }, { id: filled.stable_id }] }]), /повторюється/, "duplicate item");
  await expectError(owner(db, "select public.admin_set_category_attributes($1, $2, null)",
    [leaf.stable_id, { items: [{ id: "noSuchAttribute" }] }]), /не знайдено/, "unknown item");
  await expectError(owner(db, "select public.admin_set_category_attributes($1, $2, null)", [leaf.stable_id, { items: "x" }]), /Некоректний/, "bad payload");
  const revisionBefore = await revision(db);
  await owner(db, "select public.admin_set_category_attributes($1, $2, null)", [leaf.stable_id, { items: reordered }]);
  assert.equal(await revision(db), revisionBefore, "no-op filter save does not bump the cache");

  // 7. Switching the filter off globally drops it from every category's facetIds.
  await owner(db, "select public.admin_update_attribute($1, $2, null)", [created.attribute.id, { filterable: false }]);
  snapshot = await release(db);
  assert.ok(!snapshot.categories.find(item => item.id === leaf.stable_id).facetIds.includes(created.attribute.id));
  assert.ok(snapshot.categories.find(item => item.id === leaf.stable_id).allowedFacetIds.includes(created.attribute.id));
  assert.equal(snapshot.attribute_definitions[created.attribute.id].filterable, false);

  // 8. Delete only without product values and category links; release entry leaves.
  await expectError(owner(db, "select public.admin_delete_attribute($1, null)", [filled.stable_id]), /заповнено в товарах \(1\)/, "delete with values");
  await expectError(owner(db, "select public.admin_delete_attribute($1, null)", [created.attribute.id]), /прив’язана до категорій \(1\)/, "delete with links");
  await owner(db, "select public.admin_set_category_attributes($1, $2, null)",
    [leaf.stable_id, { items: reordered.filter(item => item.id !== created.attribute.id).map(item => ({ ...item, facetEnabled: false })) }]);
  const deleted = (await owner(db, "select public.admin_delete_attribute($1, null) r", [created.attribute.id])).r;
  assert.equal(deleted.deleted, created.attribute.id);
  assert.equal((await one(db, "select count(*)::int c from public.attribute_options where value = 'coil'")).c, 0, "options go with the definition");
  snapshot = await release(db);
  assert.equal(snapshot.attribute_definitions[created.attribute.id], undefined);
  assert.deepEqual(snapshot.categories.find(item => item.id === leaf.stable_id).facetIds, []);
  const history = (await owner(db, "select public._taxonomy_audit_json('attribute', $1::uuid) r", [created.attribute.internalId]).catch(() => null));
  assert.equal(history, null, "private helpers stay private");

  // 9. Identity: the code cannot change through the patch.
  await owner(db, "select public.admin_update_attribute($1, $2, null)", [filled.stable_id, { id: "hacked", stableId: "hacked" }]);
  assert.ok(await one(db, "select 1 from public.attribute_definitions where stable_id = $1", [filled.stable_id]));

  console.log(JSON.stringify({ status: "ok", scenarios: 9, suite: "attributes" }));
}
