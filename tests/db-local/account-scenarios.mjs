// Customer accounts v1: profile, order history, signed-in checkout, admin "has account", and the
// guarantee that a customer (an authenticated user without admin_profiles) never gets staff access.
import assert from "node:assert/strict";

const OWNER = "00000000-0000-4000-8000-0000000000b1";
const IVAN = "00000000-0000-4000-8000-0000000000c1";
const OKSANA = "00000000-0000-4000-8000-0000000000c2";
const GHOST = "00000000-0000-4000-8000-0000000000c9"; // a token subject without an auth.users row

async function as(db, role, userId, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "x-forwarded-for": "198.51.100.7" })]);
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
const customer = (db, userId, sql, params) => as(db, "authenticated", userId, () => one(db, sql, params));
const anon = (db, sql, params) => as(db, "anon", null, () => one(db, sql, params));

export async function run(db) {
  const brand = await one(db, "select internal_id from public.brands order by stable_id limit 1");
  const category = await one(db, "select internal_id from public.categories where level = (select max(level) from public.categories) order by stable_id limit 1");
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status, archived_at)
    values ('acc-pump', 'SKU-P', 'acc-pump', 'Насос циркуляційний', 'Насос', 'P1', $1, $2, 4200, 'known', 'in_stock', 'published', null),
           ('acc-boiler', 'SKU-B', 'acc-boiler', 'Котел газовий', 'Котел', 'B1', $1, $2, null, 'on_request', 'unknown', 'published', null)`,
    [brand.internal_id, category.internal_id]);
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'owner@example.test', now())", [OWNER]);
  await db.query("insert into public.admin_profiles (user_id, name, role) values ($1, 'Власник', 'owner')", [OWNER]);

  // 1. Anonymous checkout is unchanged and is not attached to any account.
  const anonymous = (await anon(db, "select public.crm_submit_order($1) as r", [{
    name: "Іван Коваль", phone: "067 111 22 33", email: "Ivan@Example.test", delivery: "carrier", city: "Київ", deliveryPoint: "Відділення 5",
    items: [{ id: "acc-pump", quantity: 2 }]
  }])).r;
  assert.deepEqual(Object.keys(anonymous).sort(), ["accepted", "currency", "hasUnpricedItems", "itemsCount", "itemsTotal", "number"]);
  const anonymousRow = await one(db, "select customer_user_id, customer_id from public.crm_orders where number = $1", [anonymous.number]);
  assert.equal(anonymousRow.customer_user_id, null);
  assert.equal((await one(db, "select body from public.crm_activity where order_id = (select internal_id from public.crm_orders where number = $1)", [anonymous.number])).body, "Замовлення з сайту");

  // 2. Anonymous callers cannot use customer RPCs; customers cannot read tables directly.
  await expectError(anon(db, "select public.customer_get_account() as r"), /permission denied/, "anon account");
  await expectError(anon(db, "select public.customer_get_order(1001) as r"), /permission denied/, "anon order");
  await expectError(anon(db, "select public.customer_update_profile('{}') as r"), /permission denied/, "anon profile");
  await expectError(customer(db, GHOST, "select public.customer_get_account() as r"), /Увійдіть/, "token without a user");

  // 3. Sign-up with the same email, not yet confirmed: profile is created from sign-up metadata, history stays hidden.
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ivan@example.test', '{"name":"  Іван Коваль  "}')`, [IVAN]);
  let account = (await customer(db, IVAN, "select public.customer_get_account() as r")).r;
  assert.equal(account.profile.name, "Іван Коваль");
  assert.equal(account.profile.email, "ivan@example.test");
  assert.equal(account.profile.emailConfirmed, false);
  assert.equal(account.orders.length, 0, "unconfirmed email unlocks nothing");
  assert.equal((await one(db, "select crm_customer_id from public.customer_profiles where user_id = $1", [IVAN])).crm_customer_id, null);

  // Email confirmed: the earlier order appears and the CRM card is linked.
  await db.query("update auth.users set email_confirmed_at = now() where id = $1", [IVAN]);
  account = (await customer(db, IVAN, "select public.customer_get_account() as r")).r;
  assert.equal(account.profile.emailConfirmed, true);
  assert.equal(account.orders.length, 1);
  const [first] = account.orders;
  assert.equal(Number(first.number), Number(anonymous.number));
  assert.equal(first.status, "new");
  assert.equal(Number(first.itemsTotal), 8400);
  assert.equal(first.items[0].productId, "acc-pump");
  assert.equal(first.items[0].quantity, 2);
  assert.equal(first.items[0].available, true);
  assert.equal(first.contactPhone, undefined, "list rows carry no contact data");
  assert.equal(first.managerComment, undefined);
  assert.equal((await one(db, "select crm_customer_id from public.customer_profiles where user_id = $1", [IVAN])).crm_customer_id, anonymousRow.customer_id);

  // 4. Signed-in checkout (no email typed): order is recorded on the account, profile gaps are filled.
  const signedIn = (await customer(db, IVAN, "select public.crm_submit_order($1) as r", [{
    name: "Іван Коваль", phone: "+380671112233", delivery: "pickup", pickupStore: "Софіївка",
    items: [{ id: "acc-boiler", quantity: 1 }, { id: "acc-pump", quantity: 1 }]
  }])).r;
  assert.deepEqual(Object.keys(signedIn).sort(), Object.keys(anonymous).sort(), "response shape unchanged");
  assert.equal(signedIn.hasUnpricedItems, true);
  const signedRow = await one(db, "select customer_user_id, contact_email, customer_id from public.crm_orders where number = $1", [signedIn.number]);
  assert.equal(signedRow.customer_user_id, IVAN);
  assert.equal(signedRow.contact_email, null);
  assert.equal(signedRow.customer_id, anonymousRow.customer_id, "CRM dedup by phone is unchanged");
  assert.match((await one(db, "select body from public.crm_activity where order_id = (select internal_id from public.crm_orders where number = $1)", [signedIn.number])).body, /особистий кабінет/);
  account = (await customer(db, IVAN, "select public.customer_get_account() as r")).r;
  assert.deepEqual(account.orders.map(order => Number(order.number)), [Number(signedIn.number), Number(anonymous.number)]);
  assert.equal(account.profile.phone, "+380671112233", "phone copied from the order");
  assert.equal(account.profile.deliveryCity, null, "pickup orders do not set a delivery city");

  // 5. Order detail: contacts and delivery, never staff fields.
  await db.query("update public.crm_orders set manager_comment = 'Внутрішня примітка', status = 'confirmed' where number = $1", [signedIn.number]);
  const detail = (await customer(db, IVAN, "select public.customer_get_order($1) as r", [signedIn.number])).r.order;
  assert.equal(detail.status, "confirmed");
  assert.equal(detail.deliveryMethod, "pickup");
  assert.equal(detail.deliveryPoint, "Софіївка");
  assert.equal(detail.contactPhone, "+380671112233");
  assert.equal(detail.items.length, 2);
  assert.equal(detail.items[0].unitAmount, null);
  assert.ok(!JSON.stringify(detail).includes("Внутрішня примітка"), "manager comment is hidden");
  assert.equal(detail.assignedTo, undefined);

  // Unpublished product: still listed, but not available for "repeat order".
  await db.query("update public.products set publication_status = 'hidden' where legacy_id = 'acc-boiler'");
  const hiddenDetail = (await customer(db, IVAN, "select public.customer_get_order($1) as r", [signedIn.number])).r.order;
  assert.equal(hiddenDetail.items.find(item => item.productId === "acc-boiler").available, false);
  await db.query("update public.products set publication_status = 'published' where legacy_id = 'acc-boiler'");

  // 6. Another customer sees nothing of Ivan's.
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'oksana@example.test', now())", [OKSANA]);
  const oksana = (await customer(db, OKSANA, "select public.customer_get_account() as r")).r;
  assert.equal(oksana.orders.length, 0);
  assert.equal(oksana.profile.name, "");
  await expectError(customer(db, OKSANA, "select public.customer_get_order($1) as r", [signedIn.number]), /Замовлення не знайдено/, "foreign order");
  await expectError(customer(db, OKSANA, "select public.customer_get_order($1) as r", [anonymous.number]), /Замовлення не знайдено/, "foreign order by email");
  await expectError(customer(db, OKSANA, "select public.customer_get_order(999999) as r"), /Замовлення не знайдено/, "missing order");
  // A self-entered phone does not unlock someone else's history.
  await customer(db, OKSANA, "select public.customer_update_profile($1) as r", [{ phone: "067 111 22 33" }]);
  assert.equal((await customer(db, OKSANA, "select public.customer_get_account() as r")).r.orders.length, 0);

  // 7. Profile updates.
  let profile = (await customer(db, OKSANA, "select public.customer_update_profile($1) as r", [{
    name: "  Оксана  Мельник ", phone: "(050) 765-43-21", deliveryCity: "Львів", deliveryPoint: "Відділення 12",
    marketingConsent: true, email: "hacker@example.test", ignored: 1
  }])).r.profile;
  assert.equal(profile.name, "Оксана  Мельник");
  assert.equal(profile.phone, "+380507654321");
  assert.equal(profile.deliveryCity, "Львів");
  assert.equal(profile.marketingConsent, true);
  assert.equal(profile.email, "oksana@example.test", "email changes only through Supabase Auth");
  const consentAt = (await one(db, "select marketing_consent_at from public.customer_profiles where user_id = $1", [OKSANA])).marketing_consent_at;
  assert.ok(consentAt, "consent time is recorded");
  profile = (await customer(db, OKSANA, "select public.customer_update_profile($1) as r", [{ marketingConsent: false, phone: "" }])).r.profile;
  assert.equal(profile.marketingConsent, false);
  assert.equal(profile.phone, null);
  assert.equal((await one(db, "select marketing_consent_at from public.customer_profiles where user_id = $1", [OKSANA])).marketing_consent_at, null);
  assert.equal(profile.deliveryCity, "Львів", "omitted fields are kept");
  await expectError(customer(db, OKSANA, "select public.customer_update_profile($1) as r", [{ phone: "12" }]), /коректний номер/, "bad phone");
  await expectError(customer(db, OKSANA, "select public.customer_update_profile($1) as r", [{ marketingConsent: "yes" }]), /згоди/, "bad consent");
  await expectError(customer(db, OKSANA, "select public.customer_update_profile($1) as r", [[1]]), /Некоректні дані профілю/, "array patch");
  const clipped = (await customer(db, OKSANA, "select public.customer_update_profile($1) as r", [{ name: "x".repeat(400) }])).r.profile;
  assert.equal(clipped.name.length, 160, "long names are clipped");

  // Profile fields that are already set are not overwritten by a later order.
  await customer(db, IVAN, "select public.customer_update_profile($1) as r", [{ name: "Іван К.", deliveryCity: "Одеса" }]);
  await customer(db, IVAN, "select public.crm_submit_order($1) as r", [{
    name: "Інше Ім’я", phone: "067 111 22 33", delivery: "carrier", city: "Харків", items: [{ id: "acc-pump", quantity: 1 }]
  }]);
  profile = (await customer(db, IVAN, "select public.customer_get_account() as r")).r.profile;
  assert.equal(profile.name, "Іван К.");
  assert.equal(profile.deliveryCity, "Одеса");

  // Ambiguous email (two CRM cards) links nothing on sign-in.
  await db.query(`insert into public.crm_customers (phone, name, email) values ('+380930000001', 'A', 'twin@example.test'), ('+380930000002', 'B', 'twin@example.test')`);
  const TWIN = "00000000-0000-4000-8000-0000000000c3";
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'twin@example.test', now())", [TWIN]);
  await customer(db, TWIN, "select public.customer_get_account() as r");
  assert.equal((await one(db, "select crm_customer_id from public.customer_profiles where user_id = $1", [TWIN])).crm_customer_id, null);

  // A forged subject without an auth.users row checks out anonymously.
  const ghostOrder = (await customer(db, GHOST, "select public.crm_submit_order($1) as r", [{
    name: "Гість", phone: "063 000 00 01", delivery: "carrier", items: [{ id: "acc-pump", quantity: 1 }]
  }])).r;
  assert.equal((await one(db, "select customer_user_id from public.crm_orders where number = $1", [ghostOrder.number])).customer_user_id, null);
  assert.equal((await one(db, "select count(*)::int c from public.customer_profiles where user_id = $1", [GHOST])).c, 0);

  // 8. Staff see whether a CRM card has an account.
  const list = (await customer(db, OWNER, "select public.admin_crm_list_customers(null, 1, 50) as r")).r;
  const ivanCard = list.customers.find(row => row.phone === "+380671112233");
  assert.equal(ivanCard.hasAccount, true);
  assert.equal(list.customers.find(row => row.phone === "+380630000001").hasAccount, false);
  const card = (await customer(db, OWNER, "select public.admin_crm_get_customer($1) as r", [ivanCard.id])).r.customer;
  assert.equal(card.hasAccount, true);
  assert.ok(card.accountSince);

  // 9. Customers never get staff access: helpers, every admin_* RPC, staff tables.
  const helpers = (await customer(db, IVAN, `select public.is_active_admin() a, public.current_admin_role() r, public.can_manage_crm() c,
    public.can_admin_catalog() k, public.can_manage_products() p, public.can_manage_content() t`));
  assert.deepEqual(helpers, { a: false, r: null, c: false, k: false, p: false, t: false });
  const adminFunctions = (await db.query(`select p.proname, array(select format_type(t, null) from unnest(p.proargtypes) t) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\\_%' order by p.proname`)).rows;
  assert.ok(adminFunctions.length > 50, "admin RPC sweep found the admin API");
  for (const fn of adminFunctions) {
    const call = `select public.${fn.proname}(${fn.types.map(type => `null::${type}`).join(", ")}) as r`;
    await expectError(customer(db, IVAN, call), /Not authorized|Недостатньо прав|можуть|Немає доступу|бачать|доступний|permission denied/, `customer calls ${fn.proname}`);
  }
  // Valid payloads too: the NULL role must not pass a NOT IN check.
  await expectError(customer(db, IVAN, "select public.admin_create_product($1) as r", [{
    title: "Чужий товар", sku: "HACK-1", model: "H1", brandId: brand.internal_id, categoryId: category.internal_id
  }]), /Not authorized/, "customer creates a product");
  assert.equal((await one(db, "select count(*)::int c from public.products where sku = 'HACK-1'")).c, 0);
  await expectError(customer(db, IVAN, "select public.admin_add_staff('ivan@example.test', 'Іван', 'owner') as r"), /можуть/, "customer adds self as staff");
  await expectError(customer(db, IVAN, "select public.admin_crm_get_order($1) as r", [signedIn.number]), /Not authorized/, "customer opens staff order view");
  assert.equal((await as(db, "authenticated", IVAN, () => one(db, "select count(*)::int c from public.admin_profiles"))).c, 0);
  await expectError(as(db, "authenticated", IVAN, () => db.query("insert into public.admin_profiles (user_id, name, role) values ($1, 'Я', 'owner')", [IVAN])), /row-level security|permission denied/, "customer inserts an admin profile");
  for (const table of ["customer_profiles", "crm_orders", "crm_customers", "crm_order_items"]) {
    await expectError(as(db, "authenticated", IVAN, () => db.query(`select * from public.${table}`)), /permission denied/, `customer reads ${table}`);
  }
  // RLS either rejects or silently filters a direct price update; the price must be unchanged either way.
  try { await as(db, "authenticated", IVAN, () => db.query("update public.products set amount = 1")); } catch { /* rejected */ }
  assert.equal(Number((await one(db, "select amount from public.products where legacy_id = 'acc-pump'")).amount), 4200);
  // Helper functions are not callable directly.
  for (const helper of ["_customer_ensure_profile($1)", "_customer_confirmed_email($1)", "_customer_profile_json($1)"]) {
    await expectError(customer(db, IVAN, `select public.${helper} as r`, [OKSANA]), /permission denied/, helper);
  }

  // 10. Deleting the auth user removes the profile and keeps the CRM order.
  await db.query("delete from auth.users where id = $1", [IVAN]);
  assert.equal((await one(db, "select count(*)::int c from public.customer_profiles where user_id = $1", [IVAN])).c, 0);
  assert.equal((await one(db, "select customer_user_id from public.crm_orders where number = $1", [signedIn.number])).customer_user_id, null);

  console.log(JSON.stringify({ status: "ok", suite: "account-scenarios", adminFunctionsChecked: adminFunctions.length }));
}
