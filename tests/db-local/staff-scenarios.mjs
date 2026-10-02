// Staff admin v1: who manages staff, role limits, self-protection, last owner, audit.
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000041",
  admin: "00000000-0000-4000-8000-000000000042",
  manager: "00000000-0000-4000-8000-000000000043"
};
const NEWCOMER = "00000000-0000-4000-8000-000000000044";

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

const call = (db, userId, sql, params = []) => as(db, "authenticated", userId, async () => (await db.query(sql, params)).rows[0]?.r);
const update = (db, actor, target, patch) => call(db, actor, "select public.admin_update_staff($1, $2, null) r", [target, patch]);

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query("insert into auth.users (id, email) values ($1, 'New.Person@Example.test')", [NEWCOMER]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Адмін', 'admin'), ($3, 'Менеджер', 'manager')`, [STAFF.owner, STAFF.admin, STAFF.manager]);

  // 1. Only owner/admin see and manage staff; anon has no access at all.
  const list = await call(db, STAFF.owner, "select public.admin_list_staff() r");
  assert.equal(list.staff.length, 3);
  assert.equal(list.staff[0].role, "owner");
  assert.equal(list.staff[0].email, "owner@example.test");
  await expectError(call(db, STAFF.manager, "select public.admin_list_staff() r"), /власник і адміністратор/, "manager list");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_list_staff()")), /permission denied/, "anon list");
  await expectError(as(db, "authenticated", STAFF.owner, () => db.query("select * from public.admin_staff_audit")), /permission denied/, "audit table");

  // 2. Adding: missing account asks for one; existing account attaches by case-insensitive email.
  assert.equal((await call(db, STAFF.admin, "select public.admin_add_staff('nobody@example.test', 'Хтось', 'manager') r")).status, "needs_account");
  await expectError(call(db, STAFF.admin, "select public.admin_add_staff('new.person@example.test', 'Новий', 'admin') r"), /лише менеджерів/, "admin adds admin");
  await expectError(call(db, STAFF.owner, "select public.admin_add_staff('bad', 'Новий', 'manager') r"), /email/, "bad email");
  const added = await call(db, STAFF.admin, "select public.admin_add_staff(' new.person@example.test ', '  Нова   Людина ', 'content_manager') r");
  assert.equal(added.status, "added");
  assert.equal(added.staff.name, "Нова Людина");
  assert.equal(added.staff.role, "content_manager");
  await expectError(call(db, STAFF.owner, "select public.admin_add_staff('new.person@example.test', 'Ще раз', 'manager') r"), /вже є/, "duplicate");

  // 3. Admin limits.
  await expectError(update(db, STAFF.admin, NEWCOMER, { role: "admin" }), /лише власник/, "admin promotes to admin");
  await expectError(update(db, STAFF.admin, STAFF.owner, { name: "X" }), /лише менеджерів/, "admin edits owner");
  const renamed = await update(db, STAFF.admin, NEWCOMER, { name: "Оксана", role: "manager" });
  assert.equal(renamed.role, "manager");

  // 4. Nobody changes their own role or access; the last owner stays.
  await expectError(update(db, STAFF.owner, STAFF.owner, { active: false }), /Власну роль/, "self deactivate");
  await expectError(update(db, STAFF.admin, STAFF.admin, { role: "manager" }), /Власну роль/, "self demote");
  assert.equal((await update(db, STAFF.owner, STAFF.owner, { name: "Олександр" })).name, "Олександр");
  await update(db, STAFF.owner, STAFF.admin, { role: "owner" });
  await expectError(update(db, STAFF.owner, STAFF.admin, { active: "no" }), /так або ні/, "bad active");
  // Two owners now: one can switch the other off, but not the last one standing.
  const off = await update(db, STAFF.owner, STAFF.admin, { active: false });
  assert.equal(off.active, false);
  await db.exec("reset role");
  await db.query("update public.admin_profiles set active = true where user_id = $1", [STAFF.admin]);
  await db.query("update public.admin_profiles set role = 'admin' where user_id = $1", [STAFF.admin]);

  // 5. Deactivated staff lose access, and history records every change.
  await update(db, STAFF.owner, STAFF.manager, { active: false });
  await expectError(call(db, STAFF.manager, "select public.admin_get_settings() r"), /Not authorized/, "inactive manager");
  const history = (await call(db, STAFF.owner, "select public.admin_list_staff() r")).history;
  assert.ok(history.some(entry => entry.changes.created), "creation logged");
  assert.ok(history.some(entry => entry.changes.active?.to === false), "deactivation logged");

  // 6. Stale writes are refused.
  await expectError(call(db, STAFF.owner, "select public.admin_update_staff($1, $2, '2000-01-01T00:00:00Z') r", [NEWCOMER, { name: "Y" }]), /вже змінили/, "stale");

  console.log(JSON.stringify({ status: "ok", scenarios: 6, suite: "staff" }));
}
