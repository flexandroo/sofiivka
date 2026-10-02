// CRM orders v2: line editing, manual orders, product search and CSV export sources.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000001",
  manager: "00000000-0000-4000-8000-000000000002",
  content: "00000000-0000-4000-8000-000000000003"
};

async function as(db, role, userId, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "x-forwarded-for": "203.0.113.9" })]);
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
const staff = (db, userId, sql, params) => as(db, "authenticated", userId, () => one(db, sql, params));

export async function run(db) {
  const brand = await one(db, "select internal_id from public.brands order by stable_id limit 1");
  const category = await one(db, "select internal_id from public.categories where level = (select max(level) from public.categories) order by stable_id limit 1");
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status, archived_at)
    values ('p-known', 'SKU-1', 'p-known', 'Насос тестовий', 'Насос', 'M1', $1, $2, 1250.50, 'known', 'in_stock', 'published', null),
           ('p-request', 'SKU-2', 'p-request', 'Котел за запитом', 'Котел', 'M2', $1, $2, null, 'on_request', 'unknown', 'published', null),
           ('p-hidden', 'SKU-3', 'p-hidden', 'Фільтр прихований', 'Фільтр', 'M3', $1, $2, 99.90, 'known', 'in_stock', 'hidden', null),
           ('p-archived', 'SKU-4', 'p-archived', 'Архівний насос', 'Архів', 'M4', $1, $2, 10, 'known', 'in_stock', 'archived', now())`,
    [brand.internal_id, category.internal_id]);
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  // Website order to edit.
  const submitted = await as(db, "anon", null, () => one(db, "select public.crm_submit_order($1) as r", [{
    name: "Іван Петренко", phone: "050 123 45 67", delivery: "carrier", city: "Київ",
    items: [{ id: "p-known", quantity: 2 }, { id: "p-request", quantity: 1 }]
  }]));
  assert.equal(Number(submitted.r.itemsTotal), 2501);
  let detail = (await staff(db, STAFF.manager, "select public.admin_crm_get_order(1001) as r")).r;
  assert.equal(detail.items.length, 2);
  assert.ok(detail.items[0].id, "line ids are exposed");
  assert.equal(detail.items[0].priceSource, "catalogue");
  assert.equal(detail.order.itemsEditable, true);
  const [pump, boiler] = detail.items;

  // 1. Access: content managers, anonymous users.
  await expectError(staff(db, STAFF.content, "select public.admin_crm_update_order_items(1001, $1, null)", [[{ id: pump.id, quantity: 1 }]]), /Not authorized/, "content manager edits");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_crm_update_order_items(1001, $1, null)", [[{ id: pump.id, quantity: 1 }]])), /permission denied/, "anon edits");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_crm_create_order($1)", [{}])), /permission denied/, "anon creates");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_crm_export_orders()")), /permission denied/, "anon export");
  await expectError(staff(db, STAFF.content, "select public.admin_crm_export_customers() as r"), /Not authorized/, "content export");
  await expectError(staff(db, STAFF.content, "select public.admin_crm_search_products('Насос') as r"), /Not authorized/, "content search");

  // 2. Edit: confirm the "on request" price, change quantity, add catalogue + free-text lines. Client totals are ignored.
  const edited = (await staff(db, STAFF.manager, "select public.admin_crm_update_order_items(1001, $1, $2) as r", [[
    { id: pump.id, quantity: 3, unitAmount: 1250.5, lineTotal: 1 },
    { id: boiler.id, quantity: 1, unitAmount: "18 500,00" },
    { productId: "p-hidden", quantity: 2 },
    { title: "Монтаж котла", sku: "", quantity: 1, unitAmount: 3000 }
  ], detail.order.updatedAt])).r;
  assert.equal(edited.items.length, 4);
  assert.equal(Number(edited.items[0].lineTotal), 3751.5);
  assert.equal(Number(edited.items[1].unitAmount), 18500);
  assert.equal(edited.items[1].priceSource, "manager");
  assert.equal(edited.items[1].priceStatus, "on_request", "catalogue price status is kept for reference");
  assert.equal(edited.items[2].priceSource, "catalogue");
  assert.equal(Number(edited.items[2].lineTotal), 199.8);
  assert.equal(edited.items[3].custom, true);
  assert.equal(edited.items[3].productAvailable, false);
  assert.equal(Number(edited.order.itemsTotal), 3751.5 + 18500 + 199.8 + 3000);
  assert.equal(edited.order.itemsCount, 7);
  assert.equal(edited.order.hasUnpricedItems, false);
  const audit = edited.activity[0];
  assert.equal(audit.kind, "update");
  assert.equal(audit.body, "Склад замовлення змінено");
  assert.equal(audit.actor, "Менеджер");
  assert.equal(audit.data.items.added.length, 2);
  assert.equal(audit.data.items.changed.length, 2);
  assert.equal(audit.data.items.removed.length, 0);
  assert.equal(Number(audit.data.total.from), 2501);
  const customerAfterEdit = await one(db, "select orders_total from public.crm_customers where phone = '+380501234567'");
  assert.equal(Number(customerAfterEdit.orders_total), Number(edited.order.itemsTotal));

  // Stale edit is rejected.
  await expectError(staff(db, STAFF.manager, "select public.admin_crm_update_order_items(1001, $1, $2) as r", [[{ id: pump.id, quantity: 1 }], detail.order.updatedAt]), /інший працівник/, "stale lines edit");

  // 3. Remove a line, clear a price (back to "to be clarified"), keep omitted prices.
  const removeResult = (await staff(db, STAFF.owner, "select public.admin_crm_update_order_items(1001, $1, $2) as r", [[
    { id: edited.items[0].id, quantity: 3 },
    { id: edited.items[1].id, quantity: 1, unitAmount: null },
    { id: edited.items[3].id, quantity: 2 }
  ], edited.order.updatedAt])).r;
  assert.equal(removeResult.items.length, 3);
  assert.deepEqual(removeResult.items.map(item => item.position), [0, 1, 2]);
  assert.equal(removeResult.items[1].unitAmount, null);
  assert.equal(removeResult.items[1].lineTotal, null);
  assert.equal(removeResult.order.hasUnpricedItems, true);
  assert.equal(Number(removeResult.order.itemsTotal), 3751.5 + 6000);
  assert.equal(removeResult.activity[0].data.items.removed[0].title, "Фільтр прихований");
  assert.equal(removeResult.activity[0].actor, "Власник");

  // No-op edit writes nothing.
  const activityBefore = (await one(db, "select count(*)::int c from public.crm_activity")).c;
  const noop = (await staff(db, STAFF.owner, "select public.admin_crm_update_order_items(1001, $1, $2) as r", [
    removeResult.items.map(item => ({ id: item.id, quantity: item.quantity })), removeResult.order.updatedAt])).r;
  assert.equal(noop.order.updatedAt, removeResult.order.updatedAt);
  assert.equal((await one(db, "select count(*)::int c from public.crm_activity")).c, activityBefore);

  // 4. Validation.
  const current = removeResult.order.updatedAt;
  const edit = lines => staff(db, STAFF.manager, "select public.admin_crm_update_order_items(1001, $1, $2) as r", [lines, current]);
  await expectError(edit([]), /хоча б одну/, "empty lines");
  await expectError(edit([{ id: pump.id, quantity: 0 }]), /Кількість/, "zero qty");
  await expectError(edit([{ id: pump.id, quantity: 1000 }]), /Кількість/, "qty too large");
  await expectError(edit([{ id: pump.id, quantity: "abc" }]), /Кількість/, "qty text");
  await expectError(edit([{ id: pump.id, quantity: 1, unitAmount: -5 }]), /Ціна/, "negative price");
  await expectError(edit([{ id: pump.id, quantity: 1, unitAmount: 1.234 }]), /Ціна/, "three decimals");
  await expectError(edit([{ id: pump.id, quantity: 1, unitAmount: 10000000 }]), /Ціна/, "price too large");
  await expectError(edit([{ id: "00000000-0000-4000-8000-00000000dead", quantity: 1 }]), /Позицію не знайдено/, "foreign line id");
  await expectError(edit([{ id: "not-a-uuid", quantity: 1 }]), /Позицію не знайдено/, "bad line id");
  await expectError(edit([{ id: pump.id, quantity: 1 }, { id: pump.id, quantity: 2 }]), /повторюється/, "duplicate line");
  await expectError(edit([{ id: pump.id, quantity: 1 }, { productId: "p-known", quantity: 1 }]), /уже є/, "duplicate product");
  await expectError(edit([{ productId: "p-archived", quantity: 1 }]), /не знайдено в каталозі/, "archived product");
  await expectError(edit([{ productId: "nope", quantity: 1 }]), /не знайдено в каталозі/, "unknown product");
  await expectError(edit([{ title: " ", quantity: 1 }]), /назву/, "empty free-text title");
  await expectError(edit(Array.from({ length: 101 }, (_, index) => ({ title: `Позиція ${index}`, quantity: 1 }))), /максимум 100/, "too many lines");
  await expectError(edit({ id: pump.id }), /хоча б одну/, "lines not an array");

  // Lines of another order cannot be pulled in.
  await as(db, "anon", null, () => db.query("select public.crm_submit_order($1)", [{ name: "Олег", phone: "0931112233", delivery: "pickup", items: [{ id: "p-known", quantity: 1 }] }]));
  const other = (await staff(db, STAFF.manager, "select public.admin_crm_get_order(1002) as r")).r;
  await expectError(edit([{ id: other.items[0].id, quantity: 1 }]), /Позицію не знайдено/, "line from another order");

  // Completed / cancelled orders are locked.
  const completed = (await staff(db, STAFF.manager, "select public.admin_crm_update_order(1002, $1, null) as r", [{ status: "completed" }])).r;
  await expectError(staff(db, STAFF.manager, "select public.admin_crm_update_order_items(1002, $1, null) as r", [[{ id: other.items[0].id, quantity: 2 }]]), /Виконане або скасоване/, "completed order locked");
  assert.equal(completed.order.itemsEditable, false);

  // 5. Manual order (phone call).
  const manual = (await staff(db, STAFF.manager, "select public.admin_crm_create_order($1) as r", [{
    name: "ТОВ Будмонтаж — Сергій", phone: "+380 67 765 43 21", email: "Serhii@Example.com", company: "Будмонтаж",
    delivery: "pickup", deliveryPoint: "Магазин на Софіївській", comment: "Дзвінок 02.10", managerComment: "Рахунок на ТОВ",
    lines: [{ productId: "p-known", quantity: 4, unitAmount: 1200 }, { productId: "p-request", quantity: 1 }, { title: "Доставка по місту", quantity: 1, unitAmount: "450" }],
    itemsTotal: 1
  }])).r;
  assert.equal(manual.order.number, 1003);
  assert.equal(manual.order.source, "manual");
  assert.equal(manual.order.status, "new");
  assert.equal(manual.order.contactPhone, "+380677654321");
  assert.equal(manual.order.contactEmail, "serhii@example.com");
  assert.equal(manual.order.deliveryMethod, "pickup");
  assert.equal(manual.order.deliveryPoint, "Магазин на Софіївській");
  assert.equal(manual.order.deliveryCity, null);
  assert.equal(manual.order.assignedName, "Менеджер", "the creator is assigned by default");
  assert.equal(Number(manual.order.itemsTotal), 4800 + 450);
  assert.equal(manual.order.hasUnpricedItems, true);
  assert.equal(manual.items[0].priceSource, "manager");
  assert.equal(manual.activity[0].kind, "created");
  assert.equal(manual.activity[0].body, "Замовлення створено вручну");
  assert.equal(manual.activity[0].actor, "Менеджер");
  assert.equal(manual.customer.company, "Будмонтаж");
  const manualCustomer = await one(db, "select orders_count, orders_total from public.crm_customers where phone = '+380677654321'");
  assert.equal(manualCustomer.orders_count, 1);
  assert.equal(Number(manualCustomer.orders_total), 5250);

  // Manual orders bypass the anonymous rate limit but validate input.
  const create = payload => staff(db, STAFF.owner, "select public.admin_crm_create_order($1) as r", [payload]);
  const base = { name: "Клієнт", phone: "0501234567", delivery: "carrier", lines: [{ productId: "p-known", quantity: 1 }] };
  await expectError(create({ ...base, name: "" }), /ім’я/, "manual no name");
  await expectError(create({ ...base, phone: "12" }), /телефону/, "manual bad phone");
  await expectError(create({ ...base, email: "bad" }), /email/, "manual bad email");
  await expectError(create({ ...base, delivery: "drone" }), /спосіб/, "manual bad delivery");
  await expectError(create({ ...base, status: "completed" }), /статус/, "manual bad status");
  await expectError(create({ ...base, assignedTo: STAFF.content }), /Відповідального/, "manual assign content");
  await expectError(create({ ...base, assignedTo: "x" }), /Відповідального/, "manual assign garbage");
  await expectError(create({ ...base, lines: [] }), /хоча б одну/, "manual no lines");
  await expectError(create({ ...base, lines: [{ id: pump.id, quantity: 1 }] }), /Позицію не знайдено/, "manual cannot reuse line ids");
  const failedCount = (await one(db, "select count(*)::int c from public.crm_orders")).c;
  assert.equal(failedCount, 3, "failed manual orders leave nothing behind");
  const confirmed = (await create({ ...base, status: "confirmed", assignedTo: "" })).r;
  assert.equal(confirmed.order.status, "confirmed");
  assert.equal(confirmed.order.assignedTo, null);
  assert.equal(confirmed.order.deliveryPoint, null);

  // 6. Product search.
  const search = (await staff(db, STAFF.manager, "select public.admin_crm_search_products('насос') as r")).r;
  assert.deepEqual(search.map(item => item.legacyId), ["p-known"], "archived products are not offered");
  const bySku = (await staff(db, STAFF.manager, "select public.admin_crm_search_products('sku-2') as r")).r;
  assert.equal(bySku[0].legacyId, "p-request");
  assert.equal(bySku[0].amount, null);
  assert.equal((await staff(db, STAFF.manager, "select public.admin_crm_search_products('н') as r")).r.length, 0);
  const hidden = (await staff(db, STAFF.manager, "select public.admin_crm_search_products('Фільтр') as r")).r;
  assert.equal(hidden[0].publicationStatus, "hidden");

  // 7. Export sources follow list filters and paginate.
  const exportAll = (await staff(db, STAFF.manager, "select public.admin_crm_export_orders() as r")).r;
  assert.equal(exportAll.total, 4);
  assert.deepEqual(exportAll.rows.map(row => row.number), [1004, 1003, 1002, 1001]);
  assert.equal(exportAll.rows[1].items.length, 3);
  assert.equal(exportAll.rows[1].source, "manual");
  const exportFiltered = (await staff(db, STAFF.manager, "select public.admin_crm_export_orders('Петренко', 'new') as r")).r;
  assert.equal(exportFiltered.total, 1);
  assert.equal(exportFiltered.rows[0].number, 1001);
  const exportPage = (await staff(db, STAFF.manager, "select public.admin_crm_export_orders(null, null, 2, 3) as r")).r;
  assert.equal(exportPage.rows.length, 1);
  assert.equal(exportPage.rows[0].number, 1001);
  const capped = (await staff(db, STAFF.manager, "select public.admin_crm_export_orders(null, null, 1, 50000) as r")).r;
  assert.equal(capped.pageSize, 1000);
  const customers = (await staff(db, STAFF.owner, "select public.admin_crm_export_customers() as r")).r;
  assert.equal(customers.total, 3);
  assert.ok(customers.rows.every(row => "notes" in row && "phone" in row));
  const customersFiltered = (await staff(db, STAFF.owner, "select public.admin_crm_export_customers('Будмонтаж') as r")).r;
  assert.equal(customersFiltered.total, 1);

  // 8. Storefront orders still work and free-text lines need no product.
  const constraint = await one(db, "select count(*)::int c from public.crm_order_items where legacy_id is null and product_id is not null");
  assert.equal(constraint.c, 0);

  console.log(JSON.stringify({ status: "ok", scenarios: "crm-v2", checks: 8 }));
}
