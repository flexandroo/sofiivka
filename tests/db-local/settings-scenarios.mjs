// Shop settings v1: public read, owner/admin editing, validation, pickup shop on orders.
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
const owner = (db, sql, params) => as(db, "authenticated", STAFF.owner, () => one(db, sql, params));
const update = (db, section, value) => owner(db, "select public.admin_update_settings($1, $2, null) r", [section, value]);

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  // 1. Public read exposes shop data but not notification recipients.
  const publicSettings = (await as(db, "anon", null, () => one(db, "select public.get_site_settings() r"))).r;
  assert.equal(publicSettings.stores.length, 2);
  assert.equal(publicSettings.stores[0].city, "Київ");
  assert.equal(publicSettings.checkout.deliveryMethods.length, 2);
  assert.equal("notifications" in publicSettings, false);
  await expectError(as(db, "anon", null, () => db.query("select * from public.site_settings")), /permission denied/, "anon table read");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_get_settings()")), /permission denied/, "anon admin read");

  // 2. Roles: any staff reads, only owner/admin writes.
  const managerView = (await as(db, "authenticated", STAFF.manager, () => one(db, "select public.admin_get_settings() r"))).r;
  assert.equal(managerView.canEdit, false);
  assert.ok(managerView.sections.notifications);
  await expectError(as(db, "authenticated", STAFF.content, () => db.query("select public.admin_update_settings('company', $1, null)", [{ name: "X" }])),
    /власник і адміністратор/, "content write");

  // 3. Stores: cleaned, validated, audited.
  const stores = publicSettings.stores.map(store => ({ ...store }));
  stores[1] = { ...stores[1], phones: ["  +38 (067) 726-00-00 ", ""], hours: ["Пн–Пт 9:00–18:00"], unknown: "drop me", pickup: false };
  const saved = (await update(db, "stores", stores)).r.sections.stores.value;
  assert.deepEqual(saved[1].phones, ["+38 (067) 726-00-00"]);
  assert.equal(saved[1].pickup, false);
  assert.equal("unknown" in saved[1], false);
  assert.equal((await one(db, "select count(*)::int c from public.site_settings_audit where key = 'stores'")).c, 1);
  await expectError(update(db, "stores", []), /від 1 до 10/, "no stores");
  await expectError(update(db, "stores", [{ ...stores[0], phones: ["123"] }]), /некоректно/, "bad phone");
  await expectError(update(db, "stores", [{ ...stores[0], email: "nope" }]), /некоректно/, "bad email");
  await expectError(update(db, "stores", [stores[0], { ...stores[1], id: stores[0].id }]), /повторюється/, "duplicate id");
  await expectError(update(db, "stores", [{ ...stores[0], address: " " }]), /обов/, "empty address");

  // 4. Optimistic concurrency.
  await expectError(owner(db, "select public.admin_update_settings('company', $1, '2000-01-01T00:00:00Z')", [{ name: "Інша назва" }]),
    /інший працівник/, "stale write");

  // 5. Checkout, social, notifications validation.
  await expectError(update(db, "checkout", { ...publicSettings.checkout, deliveryMethods: publicSettings.checkout.deliveryMethods.map(method => ({ ...method, enabled: false })) }),
    /хоча б один/, "no delivery");
  await expectError(update(db, "checkout", { ...publicSettings.checkout, deliveryMethods: [{ id: "drone", title: "Дрон" }] }), /Невідомий/, "unknown delivery");
  await expectError(update(db, "social", { instagram: "http://insecure" }), /https/, "insecure social");
  const social = (await update(db, "social", { instagram: "https://instagram.com/sofievka", extra: "x" })).r.sections.social.value;
  assert.equal(social.instagram, "https://instagram.com/sofievka");
  assert.equal(social.facebook, "");
  assert.equal("extra" in social, false);
  await expectError(update(db, "notifications", { telegramChatIds: ["abc"] }), /лише цифри/, "bad chat id");
  const notifications = (await update(db, "notifications", { emails: ["boss@example.com"], telegramChatIds: ["-100123456"], notifyLeads: false })).r.sections.notifications.value;
  assert.equal(notifications.notifyLeads, false);
  assert.deepEqual(notifications.telegramChatIds, ["-100123456"]);

  // 6. Pickup orders remember the chosen shop; carrier orders keep their address.
  const brand = await one(db, "select internal_id from public.brands order by stable_id limit 1");
  const category = await one(db, "select internal_id from public.categories where level = 3 and status = 'active' order by stable_id limit 1");
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status)
    values ('s-1', 'SSKU-1', 's-1', 'Тестовий товар', 'Товар', 'S1', $1, $2, 100, 'known', 'in_stock', 'published')`, [brand.internal_id, category.internal_id]);
  const submit = payload => as(db, "anon", null, () => one(db, "select public.crm_submit_order($1) r", [{ name: "Покупець", phone: "0501112233", items: [{ id: "s-1", quantity: 1 }], ...payload }]));
  const pickup = (await submit({ delivery: "pickup", pickupStore: "Житомир", city: "ignored" })).r;
  let stored = await one(db, "select delivery_method, delivery_city, delivery_point from public.crm_orders where number = $1", [pickup.number]);
  assert.equal(stored.delivery_method, "pickup");
  assert.equal(stored.delivery_point, "Житомир");
  assert.equal(stored.delivery_city, null);
  const carrier = (await submit({ delivery: "carrier", city: "Львів", deliveryPoint: "Відділення 5", pickupStore: "Житомир", phone: "0501112244" })).r;
  stored = await one(db, "select delivery_city, delivery_point from public.crm_orders where number = $1", [carrier.number]);
  assert.equal(stored.delivery_city, "Львів");
  assert.equal(stored.delivery_point, "Відділення 5");

  console.log(JSON.stringify({ status: "ok", scenarios: 6, suite: "settings" }));
}
