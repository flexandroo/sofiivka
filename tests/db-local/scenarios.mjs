import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000001",
  manager: "00000000-0000-4000-8000-000000000002",
  content: "00000000-0000-4000-8000-000000000003"
};

async function as(db, role, userId, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "x-forwarded-for": "203.0.113.7" })]);
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

export async function run(db) {
  // Fixtures (superuser).
  const brand = await one(db, "select internal_id from public.brands order by stable_id limit 1");
  const category = await one(db, "select internal_id from public.categories where level = (select max(level) from public.categories) order by stable_id limit 1");
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status)
    values ('p-known', 'SKU-1', 'p-known', 'Насос тестовий', 'Насос', 'M1', $1, $2, 1250.50, 'known', 'in_stock', 'published'),
           ('p-unknown', 'SKU-2', 'p-unknown', 'Котел тестовий', 'Котел', 'M2', $1, $2, null, 'unknown', 'unknown', 'published'),
           ('p-draft', 'SKU-3', 'p-draft', 'Чернетка', 'Чернетка', 'M3', $1, $2, 10, 'known', 'in_stock', 'draft')`,
    [brand.internal_id, category.internal_id]);
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  // 1. Anonymous order: server-side pricing.
  const order = await as(db, "anon", null, () => one(db, "select public.crm_submit_order($1) as r", [{
    name: "Іван Петренко", phone: "050 123 45 67", email: "Ivan@Example.com", delivery: "carrier", city: "Київ",
    deliveryPoint: "НП 12", comment: "Передзвоніть", items: [{ id: "p-known", quantity: 2, price: 1 }, { id: "p-unknown", quantity: 1 }]
  }]));
  assert.equal(order.r.number, 1001);
  assert.equal(Number(order.r.itemsTotal), 2501);
  assert.equal(order.r.hasUnpricedItems, true);
  assert.equal(order.r.itemsCount, 3);
  const customer = await one(db, "select * from public.crm_customers");
  assert.equal(customer.phone, "+380501234567");
  assert.equal(customer.email, "ivan@example.com");
  assert.equal(customer.orders_count, 1);

  // 2. Validation.
  await expectError(as(db, "anon", null, () => db.query("select public.crm_submit_order($1)", [{ name: "Іван", phone: "123", items: [{ id: "p-known", quantity: 1 }] }])), /телефону/, "bad phone");
  await expectError(as(db, "anon", null, () => db.query("select public.crm_submit_order($1)", [{ name: "Іван", phone: "0501234567", items: [{ id: "p-draft", quantity: 1 }] }])), /недоступні/, "draft product");
  await expectError(as(db, "anon", null, () => db.query("select public.crm_submit_order($1)", [{ name: "Іван", phone: "0501234567", items: [{ id: "p-known", quantity: 0 }] }])), /кількість/, "zero qty");
  await expectError(as(db, "anon", null, () => db.query("select public.crm_submit_order($1)", [{ name: "Іван", phone: "0501234567", items: [] }])), /порожній/, "empty cart");

  // 3. Honeypot is silently accepted and stores nothing.
  const before = await one(db, "select count(*)::int c from public.crm_orders");
  const bot = await as(db, "anon", null, () => one(db, "select public.crm_submit_order($1) as r", [{ name: "Bot", phone: "0501112233", website: "x", items: [{ id: "p-known", quantity: 1 }] }]));
  assert.equal(bot.r.accepted, true);
  assert.equal((await one(db, "select count(*)::int c from public.crm_orders")).c, before.c);

  // 4. Anonymous users cannot read CRM tables or staff RPCs.
  await expectError(as(db, "anon", null, () => db.query("select * from public.crm_orders")), /permission denied/, "anon table read");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_crm_list_orders()")), /permission denied/, "anon staff rpc");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select * from public.crm_customers")), /permission denied/, "staff direct table read");

  // 5. Rate limit per phone (5 per hour).
  for (let index = 0; index < 4; index += 1) {
    await as(db, "anon", null, () => db.query("select public.crm_submit_order($1)", [{ name: "Іван Петренко", phone: "+380501234567", delivery: "pickup", items: [{ id: "p-known", quantity: 1 }] }]));
  }
  await expectError(as(db, "anon", null, () => db.query("select public.crm_submit_order($1)", [{ name: "Іван Петренко", phone: "+380501234567", delivery: "pickup", items: [{ id: "p-known", quantity: 1 }] }])), /Забагато/, "rate limit");

  // 6. Leads.
  const lead = await as(db, "anon", null, () => one(db, "select public.crm_submit_lead($1) as r", [{
    type: "partner_spec", name: "ТОВ Монтаж", phone: "+380671234567", company: "Монтаж", message: "Прорахуйте",
    specLines: [{ code: "SKU-1", quantity: 10 }, { code: "  ", quantity: 1 }, { code: "ABC", quantity: "x" }]
  }]));
  assert.equal(lead.r.number, 1001);
  const leadRow = await one(db, "select spec_lines from public.crm_leads");
  assert.equal(leadRow.spec_lines.length, 2);
  await expectError(as(db, "anon", null, () => db.query("select public.crm_submit_lead($1)", [{ type: "contact", name: "Олег", phone: "0931234567" }])), /Опишіть/, "empty lead");
  const callback = await as(db, "anon", null, () => one(db, "select public.crm_submit_lead($1) as r", [{ type: "callback", name: "Олег", phone: "0931234567" }]));
  assert.equal(callback.r.number, 1002);

  // 7. Staff access by role.
  await expectError(as(db, "authenticated", STAFF.content, () => db.query("select public.admin_crm_list_orders()")), /Not authorized/, "content manager");
  await expectError(as(db, "authenticated", "00000000-0000-4000-8000-0000000000ff", () => db.query("select public.admin_crm_overview()")), /Not authorized/, "no profile");
  const overview = await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_crm_overview() as r"));
  assert.equal(overview.r.newOrders, 5);
  assert.equal(overview.r.newLeads, 2);
  assert.equal(overview.r.customers, 3);

  const list = await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_crm_list_orders('0501234', null, 1, 2) as r"));
  assert.equal(list.r.total, 5);
  assert.equal(list.r.orders.length, 2);
  const byNumber = await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_crm_list_orders('1001') as r"));
  assert.equal(byNumber.r.total, 1);

  const detail = await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_crm_get_order(1001) as r"));
  assert.equal(detail.r.items.length, 2);
  assert.equal(detail.r.items[0].title, "Насос тестовий");
  assert.equal(Number(detail.r.items[0].lineTotal), 2501);
  assert.equal(detail.r.items[1].lineTotal, null);
  assert.equal(detail.r.staff.length, 2);

  const updated = await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_crm_update_order(1001, $1, $2) as r", [
    { status: "confirmed", managerComment: "Погоджено", assignedTo: STAFF.manager }, detail.r.order.updatedAt
  ]));
  assert.equal(updated.r.order.status, "confirmed");
  assert.equal(updated.r.order.assignedName, "Менеджер");
  assert.equal(updated.r.activity[0].kind, "status");
  assert.equal(updated.r.activity[0].actor, "Менеджер");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_crm_update_order(1001, $1, $2)", [{ status: "processing" }, detail.r.order.updatedAt])), /інший працівник/, "stale order update");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_crm_update_order(1001, $1, null)", [{ assignedTo: STAFF.content }])), /Відповідального/, "assign content manager");
  await expectError(as(db, "authenticated", STAFF.manager, () => db.query("select public.admin_crm_update_order(1001, $1, null)", [{ status: "lost" }])), /статус/, "bad status");

  const notes = await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_crm_add_note('order', '1001', 'Клієнт просить рахунок') as r"));
  assert.equal(notes.r[0].kind, "note");

  const leadDetail = await as(db, "authenticated", STAFF.owner, () => one(db, "select public.admin_crm_get_lead(1001) as r"));
  const leadUpdated = await as(db, "authenticated", STAFF.owner, () => one(db, "select public.admin_crm_update_lead(1001, $1, $2) as r", [{ status: "in_progress" }, leadDetail.r.lead.updatedAt]));
  assert.equal(leadUpdated.r.lead.status, "in_progress");
  const leads = await as(db, "authenticated", STAFF.owner, () => one(db, "select public.admin_crm_list_leads(null, null, 'partner_spec') as r"));
  assert.equal(leads.r.total, 1);
  assert.equal(leads.r.leads[0].specLinesCount, 2);

  const customers = await as(db, "authenticated", STAFF.owner, () => one(db, "select public.admin_crm_list_customers() as r"));
  assert.equal(customers.r.total, 3);
  const ivan = customers.r.customers.find(item => item.phone === "+380501234567");
  assert.equal(ivan.ordersCount, 5);
  const card = await as(db, "authenticated", STAFF.owner, () => one(db, "select public.admin_crm_get_customer($1) as r", [ivan.id]));
  assert.equal(card.r.orders.length, 5);
  const cardUpdated = await as(db, "authenticated", STAFF.owner, () => one(db, "select public.admin_crm_update_customer($1, $2, $3) as r", [ivan.id, { notes: "VIP", company: "ФОП Петренко" }, card.r.customer.updatedAt]));
  assert.equal(cardUpdated.r.customer.notes, "VIP");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select public.admin_crm_update_customer($1, $2, null)", [ivan.id, { email: "not-an-email" }])), /email/, "bad email");

  // Cancelled orders leave the customer's revenue total.
  await as(db, "authenticated", STAFF.owner, () => db.query("select public.admin_crm_update_order(1001, $1, null)", [{ status: "cancelled" }]));
  const ivanAfter = await one(db, "select orders_total from public.crm_customers where phone = '+380501234567'");
  assert.equal(Number(ivanAfter.orders_total), 4 * 1250.5);

  // 8. Write consistency: direct staff writes and legacy RPCs are audited.
  const product = await one(db, "select internal_id from public.products where legacy_id = 'p-known'");
  await as(db, "authenticated", STAFF.owner, () => db.query("update public.products set title = 'Насос оновлений' where legacy_id = 'p-known'"));
  await as(db, "authenticated", STAFF.manager, () => db.query("select public.update_product_commercial($1, 1300, null, 'UAH', 'known', 'in_stock')", [product.internal_id]));
  const audit = (await db.query("select action from public.product_admin_audit where legacy_id = 'p-known' order by created_at")).rows.map(row => row.action);
  assert.deepEqual(audit, ["direct_write", "legacy_rpc"]);
  await expectError(as(db, "anon", null, () => db.query("select public.update_product_commercial($1, 1, null, 'UAH', 'known', 'in_stock')", [product.internal_id])), /permission denied/, "anon legacy rpc");
  // Service-role/import writes are not audited as staff writes.
  await db.query("update public.products set title = 'Імпорт' where legacy_id = 'p-unknown'");
  assert.equal((await one(db, "select count(*)::int c from public.product_admin_audit where legacy_id = 'p-unknown'")).c, 0);

  // Unprofiled users: RLS hides rows, statements are silent no-ops (no trigger error).
  const stranger = "00000000-0000-4000-8000-0000000000aa";
  await db.query("insert into auth.users (id, email) values ($1, 'x@example.test')", [stranger]);
  await as(db, "authenticated", stranger, () => db.query("update public.products set title = 'Хак' where legacy_id = 'p-known'"));
  await as(db, "authenticated", stranger, () => db.query("delete from public.products where legacy_id = 'p-known'"));
  assert.equal((await one(db, "select title from public.products where legacy_id = 'p-known'")).title, "Насос оновлений");
  await expectError(as(db, "authenticated", stranger, () => db.query("select public._admin_external_write_refresh(array[$1]::uuid[], 'direct_write')", [product.internal_id])), /Not authorized/, "stranger refresh rpc");
  // Content manager writes media directly → audited.
  await as(db, "authenticated", STAFF.content, () => db.query("insert into public.product_media (product_id, url) values ($1, 'https://example.test/a.png')", [product.internal_id]));
  assert.equal((await one(db, "select count(*)::int c from public.product_admin_audit where legacy_id = 'p-known'")).c, 3);

  console.log(JSON.stringify({ status: "ok", scenarios: 9 }));
}
