// Promo codes v1 (20261125170000): staff management, Kyiv calendar days, the /checkout preview, the discount on
// submitted orders (a refused code returns { accepted: false, promoError } and writes nothing), the discount base
// after a manager edits the lines, removing a code from an order, customer totals net of the discount, use limits
// and the brute-force guard (per address and site-wide).
import assert from "node:assert/strict";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000001",
  manager: "00000000-0000-4000-8000-000000000002",
  content: "00000000-0000-4000-8000-000000000003"
};
const TOO_MANY = "Забагато спроб. Спробуйте пізніше або зателефонуйте нам.";

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
const order = (db, extra, address) => anon(db, "select public.crm_submit_order($1) r", [{
  name: "Ірина Коваль", phone: `067 555 ${String(10 + (phoneNumber += 1)).padStart(2, "0")} 00`, delivery: "carrier", city: "Київ",
  items: [{ id: "p-known", quantity: 2 }, { id: "p-request", quantity: 1 }], ...extra
}], address).then(row => row.r);
const getOrder = (db, number) => staff(db, STAFF.manager, "select public.admin_crm_get_order($1) r", [number]).then(row => row.r);
const editLines = (db, number, lines) => staff(db, STAFF.manager, "select public.admin_crm_update_order_items($1, $2, null) r", [number, lines]).then(row => row.r);
const removePromo = (db, userId, number, expected = null) =>
  staff(db, userId, "select public.admin_crm_remove_order_promo($1, $2) r", [number, expected]).then(row => row.r);
const usedCount = async (db, code) => (await one(db, "select used_count from public.crm_promo_codes where code = $1", [code])).used_count;
// Everything a refused submission must leave untouched, plus the brute-force log.
const counts = db => one(db, `select (select count(*) from public.crm_orders)::int orders,
  (select count(*) from public.crm_customers)::int customers, (select count(*) from public.crm_submission_log)::int submissions,
  (select count(*) from public.crm_promo_attempts)::int attempts`);
// Stored instants of a code: UTC, the Kyiv wall clock of ends_at and the length in hours.
const stored = (db, code) => one(db, `select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') starts,
  to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') ends,
  to_char(ends_at at time zone 'Europe/Kyiv', 'YYYY-MM-DD HH24:MI') ends_kyiv,
  (extract(epoch from ends_at - starts_at) / 3600)::int hours
  from public.crm_promo_codes where code = $1`, [code]);

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
  for (const helper of ["_crm_promo_blocked('x')", "_crm_promo_record_failure('x')"]) {
    await expectError(anon(db, `select public.${helper}`), /permission denied/, `anon calls ${helper}`);
    await expectError(staff(db, STAFF.owner, `select public.${helper}`), /permission denied/, `staff calls ${helper}`);
  }

  // 2. Management: owner only (managers and content managers are refused); validation messages.
  await expectError(save(db, STAFF.manager, { code: "SALE10", kind: "percent", value: 10 }), /власник і адміністратор/, "manager creates");
  await expectError(save(db, STAFF.content, { code: "SALE10", kind: "percent", value: 10 }), /власник і адміністратор/, "content manager creates");
  await expectError(anon(db, "select public.admin_list_promo_codes()"), /permission denied/, "anon lists");
  await expectError(save(db, STAFF.owner, { code: "ab", kind: "percent", value: 10 }), /від 3 до 40/, "short code");
  await expectError(save(db, STAFF.owner, { code: "ЗНИЖКА", kind: "percent", value: 10 }), /латинських/, "Cyrillic code");
  await expectError(save(db, STAFF.owner, { code: "BIG", kind: "percent", value: 95 }), /від 1 до 90/, "percent over 90");
  await expectError(save(db, STAFF.owner, { code: "ZERO", kind: "fixed", value: "0" }), /більше нуля/, "zero amount");
  await expectError(save(db, STAFF.owner, { code: "DATES", kind: "fixed", value: 10, startsAt: "2026-12-10", endsAt: "2026-12-01" }), /пізніше/, "end before start (ISO)");
  await expectError(save(db, STAFF.owner, { code: "DATES", kind: "fixed", value: 10, startsOn: "2026-12-10", endsOn: "2026-12-09" }), /«Діє до» не може бути раніше/, "last day before first day");
  await expectError(save(db, STAFF.owner, { code: "DATES", kind: "fixed", value: 10, startsOn: "10.12.2026" }), /Перевірте дати/, "day in another format");
  await expectError(save(db, STAFF.owner, { code: "DATES", kind: "fixed", value: 10, endsOn: "2027-02-30" }), /Перевірте дати/, "day that does not exist");

  const sale = await save(db, STAFF.owner, { code: " sale10 ", kind: "percent", value: "10", note: "Розсилка" });
  assert.equal(sale.code, "SALE10");
  assert.equal(sale.state, "active");
  assert.equal(sale.startsOn, null);
  assert.equal(sale.endsOn, null);
  const fixed = await save(db, STAFF.owner, { code: "FIX500", kind: "fixed", value: "500", minOrderTotal: "2 000" });
  assert.equal(Number(fixed.minOrderTotal), 2000);
  const once = await save(db, STAFF.owner, { code: "ONCE", kind: "fixed", value: 100, maxUses: 1 });
  const tomorrow = (await one(db, "select to_char((now() at time zone 'Europe/Kyiv')::date + 1, 'YYYY-MM-DD') d")).d;
  const future = await save(db, STAFF.owner, { code: "FUTURE", kind: "percent", value: 5, startsOn: tomorrow });
  assert.equal(future.state, "scheduled");
  assert.equal(future.startsOn, tomorrow);
  await save(db, STAFF.owner, { code: "OFF", kind: "percent", value: 5, active: false });
  await expectError(save(db, STAFF.owner, { code: "SALE10", kind: "fixed", value: 1 }), /уже є/, "duplicate code");
  await expectError(save(db, STAFF.owner, { ...sale, value: 15 }, "2020-01-01T00:00:00Z"), /інший працівник/, "stale edit");
  assert.equal((await staff(db, STAFF.owner, "select public.admin_list_promo_codes() r")).r.length, 5);

  // 2b. Kyiv calendar days: starts_at is the first day's 00:00 in Kyiv, ends_at the Kyiv midnight after the last
  //     day, also across the DST switches (2027-03-28 lasts 23 hours, 2026-10-25 lasts 25).
  let season = await save(db, STAFF.owner, { code: "SEASON", kind: "percent", value: 5, startsOn: "2027-03-28", endsOn: "2027-03-28" });
  assert.deepEqual([season.startsOn, season.endsOn], ["2027-03-28", "2027-03-28"]);
  assert.deepEqual(await stored(db, "SEASON"), { starts: "2027-03-27T22:00Z", ends: "2027-03-28T21:00Z", ends_kyiv: "2027-03-29 00:00", hours: 23 });
  season = await save(db, STAFF.owner, { id: season.id, code: "SEASON", kind: "percent", value: 5, startsOn: "2027-03-01", endsOn: "2027-03-27" });
  assert.deepEqual([season.startsOn, season.endsOn], ["2027-03-01", "2027-03-27"]);
  assert.deepEqual(await stored(db, "SEASON"), { starts: "2027-02-28T22:00Z", ends: "2027-03-27T22:00Z", ends_kyiv: "2027-03-28 00:00", hours: 27 * 24 });
  season = await save(db, STAFF.owner, { id: season.id, code: "SEASON", kind: "percent", value: 5, startsOn: "2026-10-25", endsOn: "2026-10-25" });
  assert.deepEqual([season.startsOn, season.endsOn], ["2026-10-25", "2026-10-25"]);
  assert.deepEqual(await stored(db, "SEASON"), { starts: "2026-10-24T21:00Z", ends: "2026-10-25T22:00Z", ends_kyiv: "2026-10-26 00:00", hours: 25 });
  // Older clients: ISO startsAt / endsAt are stored as they are; endsOn is the last day the code works.
  season = await save(db, STAFF.owner, { id: season.id, code: "SEASON", kind: "percent", value: 5, startsAt: "2026-12-01T10:00:00Z", endsAt: "2026-12-01T22:00:00Z" });
  assert.deepEqual([season.startsOn, season.endsOn], ["2026-12-01", "2026-12-01"]);
  assert.deepEqual(await stored(db, "SEASON"), { starts: "2026-12-01T10:00Z", ends: "2026-12-01T22:00Z", ends_kyiv: "2026-12-02 00:00", hours: 12 });
  // "" clears a day.
  season = await save(db, STAFF.owner, { id: season.id, code: "SEASON", kind: "percent", value: 5, startsOn: "", endsOn: "2026-12-31" });
  assert.deepEqual([season.startsOn, season.endsOn, season.startsAt], [null, "2026-12-31", null]);
  season = await save(db, STAFF.owner, { id: season.id, code: "SEASON", kind: "percent", value: 5, startsOn: "", endsOn: "" });
  assert.deepEqual([season.startsOn, season.endsOn, season.endsAt, season.state], [null, null, null, "active"]);
  assert.deepEqual((await staff(db, STAFF.owner, "select public.admin_delete_promo_code($1) r", [season.id])).r, { deleted: true, deactivated: false });

  // 3. Preview on /checkout: the server prices the cart; «за запитом» lines are not discounted. Only unknown codes
  //    are logged as guesses; a real code that does not apply yet is not.
  assert.equal((await check(db, { code: "", items: [] })).available, true);
  const preview = await check(db, { code: "sale10", items: [{ id: "p-known", quantity: 2 }, { id: "p-request", quantity: 1 }, { id: "missing", quantity: 3 }] });
  assert.equal(preview.valid, true);
  assert.equal(preview.code, "SALE10");
  assert.equal(Number(preview.itemsTotal), 2501);
  assert.equal(Number(preview.discount), 250, "whole hryvnias");
  assert.equal(preview.id, undefined, "the code id stays on the server");
  let before = await counts(db);
  const belowMinimum = await check(db, { code: "FIX500", items: [{ id: "p-known", quantity: 1 }] });
  assert.match(belowMinimum.message, /від 2000 грн/);
  assert.equal(belowMinimum.reason, undefined, "the reason stays on the server");
  assert.equal(Number((await check(db, { code: "FIX500", items: [{ id: "p-known", quantity: 2 }] })).discount), 500);
  assert.match((await check(db, { code: "SALE10", items: [{ id: "p-request", quantity: 1 }] })).message, /товари з ціною/);
  assert.equal((await counts(db)).attempts, before.attempts, "codes that merely do not apply are not guesses");
  for (const code of ["FUTURE", "OFF", "NOPE"]) {
    assert.match((await check(db, { code, items: [{ id: "p-known", quantity: 1 }] })).message, /немає або він уже не діє/, code);
  }
  assert.equal((await counts(db)).attempts, before.attempts + 3, "unknown codes are logged");

  // 4. Order with a code: discount stored with its base, used_count grows, the activity names the code.
  const placed = await order(db, { promoCode: "sale10" });
  assert.equal(placed.promoCode, "SALE10");
  assert.equal(Number(placed.itemsTotal), 2501);
  assert.equal(Number(placed.discount), 250);
  assert.equal(Number(placed.total), 2251);
  assert.equal(Number((await one(db, "select discount_base from public.crm_orders where number = $1", [placed.number])).discount_base), 2501);
  let detail = await getOrder(db, placed.number);
  assert.equal(detail.order.promoCode, "SALE10");
  assert.equal(Number(detail.order.discountAmount), 250);
  assert.equal(Number(detail.order.totalDue), 2251);
  assert.match(detail.activity.map(entry => entry.body).join(" "), /промокод SALE10/);
  assert.equal((await staff(db, STAFF.owner, "select public.admin_list_promo_codes() r")).r.find(item => item.code === "SALE10").usedCount, 1);
  const listed = (await staff(db, STAFF.manager, "select public.admin_crm_list_orders() r")).r.orders.find(item => item.number === placed.number);
  assert.equal(Number(listed.discountAmount), 250);

  // 5. A manager prices the «за запитом» line or adds more: the percent stays on the lines that had a price when
  //    the code was accepted, up to the total it was accepted for. Removing those lines removes the discount; it
  //    never moves to the formerly «за запитом» line.
  detail = await editLines(db, placed.number, detail.items.map(item => ({ id: item.id, quantity: item.quantity,
    unitAmount: item.legacyId === "p-request" ? 1000 : undefined })));
  assert.equal(Number(detail.order.itemsTotal), 3501);
  assert.equal(Number(detail.order.discountAmount), 250, "pricing an on-request line does not grow the discount");
  assert.equal(Number(detail.order.totalDue), 3251);
  detail = await editLines(db, placed.number, detail.items.map(item => ({ id: item.id, quantity: item.legacyId === "p-known" ? 4 : item.quantity })));
  assert.equal(Number(detail.order.itemsTotal), 6002);
  assert.equal(Number(detail.order.discountAmount), 250, "more of the product does not grow the discount");
  detail = await editLines(db, placed.number, detail.items.filter(item => item.legacyId !== "p-known").map(item => ({ id: item.id, quantity: item.quantity })));
  assert.equal(Number(detail.order.itemsTotal), 1000);
  assert.equal(Number(detail.order.discountAmount), 0, "removing the discounted line does not move the discount to the other line");
  assert.equal(Number(detail.order.totalDue), 1000);

  // 6. Without a code nothing changes.
  const plain = await order(db, {});
  assert.equal(plain.promoCode, null);
  assert.equal(Number(plain.discount), 0);
  assert.equal(Number(plain.total), Number(plain.itemsTotal));
  assert.equal((await one(db, "select discount_base from public.crm_orders where number = $1", [plain.number])).discount_base, null);

  // 7. A code that does not apply: HTTP 200 { accepted: false, promoError }, no order, no customer card, no
  //    rate-limit slot. A used-up code or a cart below the minimum is not a guess; an unknown code is logged.
  assert.equal(Number((await order(db, { promoCode: "ONCE" })).discount), 100);
  before = await counts(db);
  const usedUp = await order(db, { promoCode: "once" });
  assert.deepEqual(Object.keys(usedUp).sort(), ["accepted", "promoError"]);
  assert.equal(usedUp.accepted, false);
  assert.match(usedUp.promoError, /уже використано.*Приберіть промокод/);
  assert.match((await order(db, { promoCode: "FIX500", items: [{ id: "p-known", quantity: 1 }] })).promoError, /від 2000 грн.*Приберіть промокод/);
  assert.deepEqual(await counts(db), before, "refused orders write nothing; real codes are not guesses");
  assert.equal(await usedCount(db, "ONCE"), 1);
  const unknownCode = await order(db, { promoCode: "NOPE" });
  assert.deepEqual(unknownCode, { accepted: false, promoError: "Такого промокоду немає або він уже не діє. Приберіть промокод або введіть інший." });
  assert.deepEqual(await counts(db), { ...before, attempts: before.attempts + 1 }, "the unknown code is logged and the log is kept");
  assert.equal((await check(db, { code: "", items: [] })).available, true, "other codes still active");

  // 8. A used code cannot be renamed; deleting it switches it off, an unused one is deleted.
  await expectError(save(db, STAFF.owner, { ...sale, code: "SALE11", id: sale.id }), /не можна перейменувати/, "rename a used code");
  assert.deepEqual((await staff(db, STAFF.owner, "select public.admin_delete_promo_code($1) r", [sale.id])).r, { deleted: false, deactivated: true });
  assert.deepEqual((await staff(db, STAFF.owner, "select public.admin_delete_promo_code($1) r", [future.id])).r, { deleted: true, deactivated: false });
  await expectError(staff(db, STAFF.manager, "select public.admin_delete_promo_code($1) r", [fixed.id]), /власник і адміністратор/, "manager deletes");
  const edited = await save(db, STAFF.owner, { id: once.id, code: "ONCE", kind: "fixed", value: 100, maxUses: 5 }, once.updatedAt);
  assert.equal(edited.state, "active", "raising the limit re-opens the code");

  // 9. Brute force: 20 unknown codes per hour from one address, from the preview and the submission alike; then
  //    neither checks codes for it (an order without a code still goes through). Other addresses are not affected.
  const guesser = "198.51.100.40";
  const fix500 = { code: "FIX500", items: [{ id: "p-known", quantity: 2 }] };
  await db.query("insert into public.crm_promo_attempts (client_fingerprint, created_at) values ('stale', now() - interval '2 days')");
  for (let i = 0; i < 19; i += 1) await check(db, { code: `GUESS${i}`, items: [{ id: "p-known", quantity: 1 }] }, guesser);
  assert.equal((await one(db, "select count(*)::int c from public.crm_promo_attempts where client_fingerprint = 'stale'")).c, 0, "day-old attempts are removed");
  assert.equal((await check(db, fix500, guesser)).valid, true, "19 guesses: still answering");
  assert.match((await order(db, { promoCode: "GUESS19" }, guesser)).promoError, /немає або він уже не діє/);
  assert.deepEqual(await check(db, fix500, guesser), { available: true, valid: false, message: TOO_MANY });
  before = await counts(db);
  assert.deepEqual(await order(db, { promoCode: "FIX500" }, guesser), { accepted: false, promoError: TOO_MANY });
  assert.deepEqual(await counts(db), before, "a blocked submission writes nothing");
  assert.equal((await order(db, {}, guesser)).accepted, true, "an order without a code still goes through");
  assert.equal((await check(db, fix500, "198.51.100.41")).valid, true, "another address");
  assert.equal(Number((await order(db, { promoCode: "FIX500" }, "198.51.100.41")).discount), 500);

  // A real code below its minimum is never a guess: an office keeps trying without being locked out.
  before = await counts(db);
  for (let i = 0; i < 25; i += 1) {
    assert.match((await check(db, { code: "FIX500", items: [{ id: "p-known", quantity: 1 }] }, "198.51.100.42")).message, /від 2000 грн/);
  }
  assert.equal((await counts(db)).attempts, before.attempts);

  // Site-wide backstop: 200 unknown codes in 10 minutes from any addresses stop every check.
  const recent = (await one(db, "select count(*)::int c from public.crm_promo_attempts where created_at > now() - interval '10 minutes'")).c;
  await db.query("insert into public.crm_promo_attempts (client_fingerprint) select 'bot-' || n from generate_series(1, $1::int) n", [199 - recent]);
  assert.equal((await check(db, fix500, "198.51.100.50")).valid, true, "199 guesses across the site: still answering");
  await db.query("insert into public.crm_promo_attempts (client_fingerprint) values ('bot-last')");
  assert.deepEqual(await check(db, fix500, "198.51.100.50"), { available: true, valid: false, message: TOO_MANY });
  assert.deepEqual(await order(db, { promoCode: "FIX500" }, "198.51.100.50"), { accepted: false, promoError: TOO_MANY });
  await db.query("update public.crm_promo_attempts set created_at = now() - interval '11 minutes' where client_fingerprint like 'bot-%'");
  assert.equal((await check(db, fix500, "198.51.100.50")).valid, true, "the backstop lifts after 10 minutes");
  assert.match((await check(db, fix500, guesser)).message, /Забагато спроб/, "the address limit runs for an hour");

  // 10. Customer order view carries the discount.
  const customerView = (await one(db, "select public._customer_order_json(o, false) r from public.crm_orders o where number = $1", [placed.number])).r;
  assert.equal(Number(customerView.discountAmount), 0);
  assert.equal(Number(customerView.totalDue), 1000);
  assert.equal(customerView.promoCode, "SALE10");

  // 11. Staff remove the code from an open order: no discount, the use goes back, the timeline names the code.
  await save(db, STAFF.owner, { code: "MINUS5", kind: "percent", value: 5 });
  const minus = await order(db, { promoCode: "MINUS5" }, "203.0.113.20");
  assert.equal(Number(minus.discount), 125);
  assert.equal(await usedCount(db, "MINUS5"), 1);
  detail = await getOrder(db, minus.number);
  await expectError(anon(db, "select public.admin_crm_remove_order_promo($1, null)", [minus.number]), /permission denied/, "anon removes");
  await expectError(removePromo(db, STAFF.content, minus.number), /Not authorized/, "content manager removes");
  await expectError(removePromo(db, STAFF.manager, 999999), /Замовлення не знайдено/, "unknown order");
  await expectError(removePromo(db, STAFF.manager, minus.number, "2020-01-01T00:00:00Z"), /інший працівник/, "stale order");
  await expectError(removePromo(db, STAFF.manager, plain.number), /Замовлення без промокоду/, "order without a code");
  const removed = await removePromo(db, STAFF.manager, minus.number, detail.order.updatedAt);
  assert.equal(removed.order.promoCode, null);
  assert.equal(removed.order.promoKind, null);
  assert.equal(Number(removed.order.discountAmount), 0);
  assert.equal(Number(removed.order.totalDue), 2501);
  assert.ok(removed.order.updatedAt !== detail.order.updatedAt, "updated_at moves");
  assert.equal(removed.activity[0].kind, "update");
  assert.equal(removed.activity[0].body, "Прибрано промокод MINUS5 (знижка 125,00 грн)");
  assert.equal(await usedCount(db, "MINUS5"), 0);
  assert.deepEqual(await one(db, "select promo_value, discount_base from public.crm_orders where number = $1", [minus.number]), { promo_value: null, discount_base: null });
  assert.equal(Number((await one(db, "select orders_total from public.crm_customers where phone = $1", [removed.order.contactPhone])).orders_total), 2501);
  await expectError(removePromo(db, STAFF.manager, minus.number), /Замовлення без промокоду/, "second removal");
  // A completed order keeps its discount; a cancelled one may give its use of the code back.
  const done = await order(db, { promoCode: "MINUS5" }, "203.0.113.20");
  const cancelled = await order(db, { promoCode: "MINUS5" }, "203.0.113.20");
  await staff(db, STAFF.manager, "select public.admin_crm_update_order($1, $2, null)", [done.number, { status: "completed" }]);
  await staff(db, STAFF.manager, "select public.admin_crm_update_order($1, $2, null)", [cancelled.number, { status: "cancelled" }]);
  await expectError(removePromo(db, STAFF.manager, done.number), /виконаного замовлення не змінюють/, "remove from a completed order");
  assert.equal(await usedCount(db, "MINUS5"), 2);
  const released = await removePromo(db, STAFF.manager, cancelled.number);
  assert.equal(released.order.promoCode, null);
  assert.equal(await usedCount(db, "MINUS5"), 1, "the cancelled order gave its use back");
  // used_count never drops below zero.
  const reset = await order(db, { promoCode: "MINUS5" }, "203.0.113.20");
  await db.query("update public.crm_promo_codes set used_count = 0 where code = 'MINUS5'");
  await removePromo(db, STAFF.owner, reset.number);
  assert.equal(await usedCount(db, "MINUS5"), 0);

  // 12. Customer totals are net of the discount: the CRM card, its order rows and the 30-day revenue.
  const placedCustomer = (await one(db, "select customer_id from public.crm_orders where number = $1", [placed.number])).customer_id;
  const card = (await staff(db, STAFF.manager, "select public.admin_crm_get_customer($1) r", [placedCustomer])).r;
  assert.equal(Number(card.customer.ordersTotal), 1000);
  const cardOrder = card.orders.find(row => row.number === placed.number);
  assert.equal(cardOrder.promoCode, "SALE10");
  assert.equal(Number(cardOrder.discountAmount), 0);
  assert.equal(Number(cardOrder.itemsTotal), 1000);
  const plainCustomer = (await one(db, "select customer_id from public.crm_orders where number = $1", [plain.number])).customer_id;
  const plainRow = (await staff(db, STAFF.manager, "select public.admin_crm_get_customer($1) r", [plainCustomer])).r.orders[0];
  assert.deepEqual([plainRow.promoCode, Number(plainRow.discountAmount)], [null, 0]);
  const doneCustomer = await one(db, "select c.orders_total from public.crm_customers c join public.crm_orders o on o.customer_id = c.internal_id where o.number = $1", [done.number]);
  assert.equal(Number(doneCustomer.orders_total), 2376);
  const cancelledCustomer = await one(db, "select c.orders_total from public.crm_customers c join public.crm_orders o on o.customer_id = c.internal_id where o.number = $1", [cancelled.number]);
  assert.equal(Number(cancelledCustomer.orders_total), 0, "cancelled orders stay out");
  const overview = (await staff(db, STAFF.manager, "select public.admin_crm_overview() r")).r;
  assert.equal(Number(overview.revenue30d), 2376, "only the completed order, net of its discount");

  // 13. A fixed code worth more than the priced part of the cart: the discount stays at what the customer was shown
  //     when a manager prices the «за запитом» line, and goes when the priced line goes.
  const cheap = await one(db, "select brand_id, primary_category_id from public.products where legacy_id = 'p-known'");
  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status, archived_at)
    values ('p-cheap', 'SKU-C', 'p-cheap', 'Кран дешевий', 'Кран', 'MC', $1, $2, 300, 'known', 'in_stock', 'published', null)`,
    [cheap.brand_id, cheap.primary_category_id]);
  await save(db, STAFF.owner, { code: "BIG500", kind: "fixed", value: 500 });
  const big = await order(db, { promoCode: "BIG500", items: [{ id: "p-cheap", quantity: 1 }, { id: "p-request", quantity: 1 }] }, "203.0.113.30");
  assert.deepEqual([Number(big.itemsTotal), Number(big.discount), Number(big.total)], [300, 300, 0]);
  detail = await getOrder(db, big.number);
  detail = await editLines(db, big.number, detail.items.map(item => ({ id: item.id, quantity: item.quantity,
    unitAmount: item.legacyId === "p-request" ? 20000 : undefined })));
  assert.equal(Number(detail.order.itemsTotal), 20300);
  assert.equal(Number(detail.order.discountAmount), 300, "a fixed code does not grow onto the priced «за запитом» line");
  detail = await editLines(db, big.number, [...detail.items.map(item => ({ id: item.id, quantity: item.quantity })), { productId: "p-known", quantity: 1 }]);
  assert.equal(Number(detail.order.discountAmount), 300, "an added line does not grow it either");
  detail = await editLines(db, big.number, detail.items.filter(item => item.legacyId !== "p-cheap").map(item => ({ id: item.id, quantity: item.quantity })));
  assert.equal(Number(detail.order.discountAmount), 0, "without the discounted line there is no discount");

  // 14. IPv6: guesses count per /64, so one host cannot rotate addresses inside its own network.
  await db.query("delete from public.crm_promo_attempts");
  for (let i = 1; i <= 20; i += 1) await check(db, { code: `V6GUESS${i}`, items: [{ id: "p-known", quantity: 1 }] }, `2001:db8:1:2::${i.toString(16)}`);
  assert.match((await check(db, { code: "SALE11", items: [{ id: "p-known", quantity: 2 }] }, "2001:db8:1:2::ffff")).message, /Забагато спроб/, "same /64");
  await save(db, STAFF.owner, { code: "OTHERNET", kind: "percent", value: 5 });
  assert.equal((await check(db, { code: "OTHERNET", items: [{ id: "p-known", quantity: 2 }] }, "2001:db8:1:3::1")).valid, true, "another /64 is not blocked");

  console.log(JSON.stringify({ status: "ok", suite: "promo-scenarios" }));
}
