// CRM notifications v1: the trigger never breaks an order, logs why it skipped, queues pg_net when
// configured; owner/admin read the status and send a test message.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000051",
  manager: "00000000-0000-4000-8000-000000000052"
};
const SECRET = "test-secret-0123456789abcdef";

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
const call = (db, userId, sql, params = []) => as(db, "authenticated", userId, async () => (await db.query(sql, params)).rows[0]?.r);
const lastLog = db => one(db, "select * from public.crm_notification_log order by id desc limit 1");
let phoneSeq = 1000;
const order = db => as(db, "anon", null, () => one(db, "select public.crm_submit_order($1) r", [{
  name: "Покупець", phone: `050111${phoneSeq++}`, delivery: "pickup", pickupStore: "Житомир", items: [{ id: "n-1", quantity: 2 }]
}])).then(row => row.r);
const setNotifications = (db, value) => call(db, STAFF.owner, "select public.admin_update_settings('notifications', $1, null) r", [value]);

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager')`, [STAFF.owner, STAFF.manager]);
  const brand = await one(db, "select internal_id from public.brands order by stable_id limit 1");
  const category = await one(db, "select internal_id from public.categories where level = 3 and status = 'active' order by stable_id limit 1");
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status)
    values ('n-1', 'NSKU-1', 'n-1', 'Котел тестовий', 'Котел', 'N1', $1, $2, 1500, 'known', 'in_stock', 'published')`, [brand.internal_id, category.internal_id]);

  // 1. Private tables stay closed to clients.
  await expectError(as(db, "anon", null, () => db.query("select * from public.crm_notify_config")), /permission denied/, "anon config");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select * from public.crm_notification_log")), /permission denied/, "staff log table");
  await expectError(as(db, "anon", null, () => db.query("select public._crm_notify_enqueue('order', 1, null)")), /permission denied/, "anon enqueue");

  // 2. No recipients, then no config, then no pg_net: the order is saved, the log says why.
  const first = await order(db);
  assert.ok(first.number > 0);
  let log = await lastLog(db);
  assert.equal(log.kind, "order");
  assert.equal(Number(log.entity_number), first.number);
  assert.equal(log.status, "skipped");
  assert.match(log.reason, /отримувачів/);

  await setNotifications(db, { emails: [], telegramChatIds: ["-100123456", "777000"], notifyOrders: true, notifyLeads: true });
  await order(db);
  assert.match((await lastLog(db)).reason, /не налаштовано/);

  await db.query("update public.crm_notify_config set function_url = 'https://example.supabase.co/functions/v1/crm-notify', secret = $1", [SECRET]);
  await order(db);
  assert.match((await lastLog(db)).reason, /pg_net/);
  let status = await call(db, STAFF.owner, "select public.admin_notifications_status() r");
  assert.equal(status.configured, false);
  assert.equal(status.pgNet, false);
  assert.equal(status.functionUrlSet, true);
  assert.equal(JSON.stringify(status).includes(SECRET), false, "status never exposes the secret");

  // 3. With a pg_net look-alike the request is queued with the secret header and the log id.
  await db.exec(`
    create schema net;
    create table net.captured (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb);
    create table net._http_response (id bigint primary key, status_code integer, error_msg text);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
    returns bigint language sql as $$ insert into net.captured (url, body, headers) values (url, body, headers) returning id $$;
  `);
  const queuedOrder = await order(db);
  log = await lastLog(db);
  assert.equal(log.status, "queued");
  const captured = await one(db, "select * from net.captured order by id desc limit 1");
  assert.equal(Number(log.request_id), Number(captured.id));
  assert.equal(captured.url, "https://example.supabase.co/functions/v1/crm-notify");
  assert.equal(captured.headers["x-crm-notify-secret"], SECRET);
  assert.deepEqual(captured.body, { kind: "order", number: queuedOrder.number, logId: Number(log.id) });

  // Manual orders and leads are announced too; disabled kinds are skipped.
  await call(db, STAFF.manager, "select public.admin_crm_create_order($1) r", [{ name: "Сергій", phone: "+380677654321", delivery: "pickup", lines: [{ title: "Монтаж", quantity: 1, unitAmount: 500 }] }]);
  assert.equal((await lastLog(db)).status, "queued");
  await setNotifications(db, { telegramChatIds: ["-100123456"], notifyOrders: true, notifyLeads: false });
  const lead = (await as(db, "anon", null, () => one(db, "select public.crm_submit_lead($1) r", [{ type: "callback", name: "Олег", phone: "0931234567", message: "Передзвоніть" }]))).r;
  log = await lastLog(db);
  assert.equal(log.kind, "lead");
  assert.equal(Number(log.entity_number), lead.number);
  assert.equal(log.status, "skipped");
  assert.match(log.reason, /заявки вимкнено/);

  // 4. A failing pg_net call or a broken log never fails the order.
  await db.exec(`create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
    returns bigint language plpgsql as $$ begin raise exception 'queue is full'; end $$;`);
  const failed = await order(db);
  log = await lastLog(db);
  assert.equal(Number(log.entity_number), failed.number);
  assert.equal(log.status, "error");
  assert.match(log.reason, /queue is full/);
  await db.exec("alter table public.crm_notification_log add constraint crm_notification_log_broken check (false) not valid");
  const survived = await order(db);
  assert.ok(await one(db, "select 1 from public.crm_orders where number = $1", [survived.number]), "order kept despite a broken log");
  await db.exec("alter table public.crm_notification_log drop constraint crm_notification_log_broken");
  await db.exec(`create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
    returns bigint language sql as $$ insert into net.captured (url, body, headers) values (url, body, headers) returning id $$;`);

  // 5. Status and test message: owner/admin only, rate limited, pg_net answers surface in the log.
  await expectError(call(db, STAFF.manager, "select public.admin_notifications_status() r"), /власник і адміністратор/, "manager status");
  await expectError(call(db, STAFF.manager, "select public.admin_notifications_send_test() r"), /власник і адміністратор/, "manager test");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_notifications_status()")), /permission denied/, "anon status");
  const test = await call(db, STAFF.owner, "select public.admin_notifications_send_test() r");
  assert.equal(test.status, "queued");
  const testLog = await one(db, "select * from public.crm_notification_log where id = $1", [test.id]);
  assert.equal(testLog.kind, "test");
  assert.equal(testLog.actor_id, STAFF.owner);
  await db.query("insert into net._http_response (id, status_code) values ($1, 401)", [testLog.request_id]);
  status = await call(db, STAFF.owner, "select public.admin_notifications_status() r");
  assert.equal(status.configured, true);
  assert.equal(status.log[0].kind, "test");
  assert.equal(status.log[0].status, "error");
  assert.match(status.log[0].reason, /HTTP 401/);
  assert.ok(status.log.length <= 20);
  await call(db, STAFF.owner, "select public.admin_notifications_send_test() r");
  await call(db, STAFF.owner, "select public.admin_notifications_send_test() r");
  await expectError(call(db, STAFF.owner, "select public.admin_notifications_send_test() r"), /Забагато/, "test rate limit");

  // 6. The edge function (service role) marks the row sent.
  await as(db, "service_role", null, () => db.query("update public.crm_notification_log set status = 'sent', reason = '', updated_at = now() where id = $1", [test.id]));
  assert.equal((await one(db, "select status from public.crm_notification_log where id = $1", [test.id])).status, "sent");

  console.log(JSON.stringify({ status: "ok", scenarios: 6, suite: "notifications" }));
}
