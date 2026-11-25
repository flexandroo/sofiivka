// Promo codes v1 (20261125170000): staff management, the /checkout preview, the discount on submitted orders,
// the recount after a manager edits the lines, use limits and the brute-force guard.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000001",
  manager: "00000000-0000-4000-8000-000000000002",
  content: "00000000-0000-4000-8000-000000000003"
};

async function as(db, role, userId, fn, address = "203.0.113.9") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "x-forwarded-for": address })]);
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
const anon = (db, sql, params, address) => as(db, "anon", null, () => one(db, sql, params), address);
const check = (db, payload, address) => anon(db, "select public.crm_check_promo_code($1) r", [payload], address).then(row => row.r);
const save = (db, userId, payload, expected = null) => staff(db, userId, "select public.admin_save_promo_code($1, $2) r", [payload, expected]).then(row => row.r);
let phoneNumber = 0;
const order = (db, extra) => anon(db, "select public.crm_submit_order($1) r", [{
  name: "Ірина Коваль", phone: `067 555 ${String(10 + (phoneNumber += 1)).padStart(2, "0")} 00`, delivery: "carrier", city: "Київ",
  items: [{ id: "p-known", quantity: 2 }, { id: "p-request", quantity: 1 }], ...extra
}]).then(row => row.r);

export async function run(db) {
  const brand = await one(db, "select internal_id from public.brands order by stable_id limit 1");
  const category = await one(db, "select internal_id from public.categories where level = (select max(level) from public.categories) order by stable_id limit 1");
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status, archived_at)
    values ('p-known', 'SKU-1', 'p-known', 'Насос тестовий', 'Насос', 'M1', $1, $2, 1250.50, 'known', 'in_stock', 'published', null),
           ('p-request', 'SKU-2', 'p-request', 'Котел за запитом', 'Котел', 'M2', $1, $2, null, 'on_request', 'unknown', 'published', null)`,
    [brand.internal_id, category.internal_id]);
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  // 1. No codes yet: the field stays hidden. The table is closed to the public roles.
  assert.deepEqual(await check(db, { code: "", items: [] }), { available: false });
  await expectError(anon(db, "select * from public.crm_promo_codes"), /permission denied/, "anon reads codes");
  await expectError(staff(db, STAFF.owner, "select * from public.crm_promo_codes"), /permission denied/, "staff reads the table directly");

  // 2. Management: owner only (managers and content managers are refused); validation messages.
  await expectError(save(db, STAFF.manager, { code: "SALE10", kind: "percent", value: 10 }), /власник і адміністратор/, "manager creates");
  await expectError(save(db, STAFF.content, { code: "SALE10", kind: "percent", value: 10 }), /власник і адміністратор/, "content manager creates");
  await expectError(anon(db, "select public.admin_list_promo_codes()"), /permission denied/, "anon lists");
  await expectError(save(db, STAFF.owner, { code: "ab", kind: "percent", value: 10 }), /від 3 до 40/, "short code");
  await expectError(save(db, STAFF.owner, { code: "ЗНИЖКА", kind: "percent", value: 10 }), /латинських/, "Cyrillic code");
  await expectError(save(db, STAFF.owner, { code: "BIG", kind: "percent", value: 95 }), /від 1 до 90/, "percent over 90");
  await expectError(save(db, STAFF.owner, { code: "ZERO", kind: "fixed", value: "0" }), /більше нуля/, "zero amount");
  await expectError(save(db, STAFF.owner, { code: "DATES", kind: "fixed", value: 10, startsAt: "2026-12-10", endsAt: "2026-12-01" }), /пізніше/, "end before start");

  const sale = await save(db, STAFF.owner, { code: " sale10 ", kind: "percent", value: "10", note: "Розсилка" });
  assert.equal(sale.code, "SALE10");
  assert.equal(sale.state, "active");
  const fixed = await save(db, STAFF.owner, { code: "FIX500", kind: "fixed", value: "500", minOrderTotal: "2 000" });
  assert.equal(Number(fixed.minOrderTotal), 2000);
  const once = await save(db, STAFF.owner, { code: "ONCE", kind: "fixed", value: 100, maxUses: 1 });
  const future = await save(db, STAFF.owner, { code: "FUTURE", kind: "percent", value: 5, startsAt: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(future.state, "scheduled");
  await save(db, STAFF.owner, { code: "OFF", kind: "percent", value: 5, active: false });
  await expectError(save(db, STAFF.owner, { code: "SALE10", kind: "fixed", value: 1 }), /уже є/, "duplicate code");
  await expectError(save(db, STAFF.owner, { ...sale, value: 15 }, "2020-01-01T00:00:00Z"), /інший працівник/, "stale edit");
  assert.equal((await staff(db, STAFF.owner, "select public.admin_list_promo_codes() r")).r.length, 5);

  // 3. Preview on /checkout: the server prices the cart; «за запитом» lines are not discounted.
  assert.equal((await check(db, { code: "", items: [] })).available, true);
  const preview = await check(db, { code: "sale10", items: [{ id: "p-known", quantity: 2 }, { id: "p-request", quantity: 1 }, { id: "missing", quantity: 3 }] });
  assert.equal(preview.valid, true);
  assert.equal(preview.code, "SALE10");
  assert.equal(Number(preview.itemsTotal), 2501);
  assert.equal(Number(preview.discount), 250.1);
  assert.equal(preview.id, undefined, "the code id stays on the server");
  assert.match((await check(db, { code: "FIX500", items: [{ id: "p-known", quantity: 1 }] })).message, /від 2000 грн/);
  assert.equal(Number((await check(db, { code: "FIX500", items: [{ id: "p-known", quantity: 2 }] })).discount), 500);
  assert.match((await check(db, { code: "SALE10", items: [{ id: "p-request", quantity: 1 }] })).message, /товари з ціною/);
  for (const code of ["FUTURE", "OFF", "NOPE"]) {
    assert.match((await check(db, { code, items: [{ id: "p-known", quantity: 1 }] })).message, /немає або він уже не діє/, code);
  }

  // 4. Order with a code: discount stored, used_count grows, the activity names the code.
  const placed = await order(db, { promoCode: "sale10" });
  assert.equal(placed.promoCode, "SALE10");
  assert.equal(Number(placed.itemsTotal), 2501);
  assert.equal(Number(placed.discount), 250.1);
  assert.equal(Number(placed.total), 2250.9);
  let detail = (await staff(db, STAFF.manager, "select public.admin_crm_get_order($1) r", [placed.number])).r;
  assert.equal(detail.order.promoCode, "SALE10");
  assert.equal(Number(detail.order.discountAmount), 250.1);
  assert.equal(Number(detail.order.totalDue), 2250.9);
  assert.match(detail.activity.map(entry => entry.body).join(" "), /промокод SALE10/);
  assert.equal((await staff(db, STAFF.owner, "select public.admin_list_promo_codes() r")).r.find(item => item.code === "SALE10").usedCount, 1);
  const listed = (await staff(db, STAFF.manager, "select public.admin_crm_list_orders() r")).r.orders.find(item => item.number === placed.number);
  assert.equal(Number(listed.discountAmount), 250.1);

  // 5. A manager changes the lines: the percent is applied to the new total.
  await staff(db, STAFF.manager, "select public.admin_crm_update_order_items($1, $2, null)", [placed.number,
    detail.items.map(item => ({ id: item.id, quantity: item.legacyId === "p-known" ? 4 : item.quantity, unitAmount: item.legacyId === "p-request" ? 1000 : undefined }))]);
  detail = (await staff(db, STAFF.manager, "select public.admin_crm_get_order($1) r", [placed.number])).r;
  assert.equal(Number(detail.order.itemsTotal), 6002);
  assert.equal(Number(detail.order.discountAmount), 600.2);

  // 6. Without a code nothing changes.
  const plain = await order(db, {});
  assert.equal(plain.promoCode, null);
  assert.equal(Number(plain.discount), 0);
  assert.equal(Number(plain.total), Number(plain.itemsTotal));

  // 7. Use limit: the second order with ONCE is refused and not created.
  assert.equal(Number((await order(db, { promoCode: "ONCE" })).discount), 100);
  const before = await one(db, "select count(*)::int c from public.crm_orders");
  await expectError(order(db, { promoCode: "once" }), /уже використано.*Приберіть промокод/, "second use of ONCE");
  assert.equal((await one(db, "select count(*)::int c from public.crm_orders")).c, before.c, "refused order is rolled back");
  assert.equal((await check(db, { code: "", items: [] })).available, true, "other codes still active");
  await expectError(order(db, { promoCode: "NOPE" }), /немає або він уже не діє/, "unknown code on submit");

  // 8. A used code cannot be renamed; deleting it switches it off, an unused one is deleted.
  await expectError(save(db, STAFF.owner, { ...sale, code: "SALE11", id: sale.id }), /не можна перейменувати/, "rename a used code");
  assert.deepEqual((await staff(db, STAFF.owner, "select public.admin_delete_promo_code($1) r", [sale.id])).r, { deleted: false, deactivated: true });
  assert.deepEqual((await staff(db, STAFF.owner, "select public.admin_delete_promo_code($1) r", [future.id])).r, { deleted: true, deactivated: false });
  await expectError(staff(db, STAFF.manager, "select public.admin_delete_promo_code($1) r", [fixed.id]), /власник і адміністратор/, "manager deletes");
  const edited = await save(db, STAFF.owner, { id: once.id, code: "ONCE", kind: "fixed", value: 100, maxUses: 5 }, once.updatedAt);
  assert.equal(edited.state, "active", "raising the limit re-opens the code");

  // 9. Brute force: ten wrong codes per hour from one address, then no answers (another address is not affected).
  for (let i = 0; i < 10; i += 1) await check(db, { code: `GUESS${i}`, items: [{ id: "p-known", quantity: 1 }] }, "198.51.100.40");
  const blocked = await check(db, { code: "FIX500", items: [{ id: "p-known", quantity: 2 }] }, "198.51.100.40");
  assert.match(blocked.message, /Забагато спроб/);
  assert.equal((await check(db, { code: "FIX500", items: [{ id: "p-known", quantity: 2 }] }, "198.51.100.41")).valid, true);

  // 10. Customer order view carries the discount.
  const customerView = (await one(db, "select public._customer_order_json(o, false) r from public.crm_orders o where number = $1", [placed.number])).r;
  assert.equal(Number(customerView.discountAmount), 600.2);
  assert.equal(Number(customerView.totalDue), 5401.8);

  console.log(JSON.stringify({ status: "ok", suite: "promo-scenarios" }));
}
