// Lead/order rate limit by the real client address (20261005000400, AUD-019): the address comes from
// the right end of x-forwarded-for, a spoofed leading value does not reset the limit, and a site-wide
// backstop stops address rotation.
import assert from "node:assert/strict";

const OWNER = "00000000-0000-4000-8000-000000000001";
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];

async function anonLead(db, forwardedFor, phone, extraHeaders = {}) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.query("select set_config('request.headers', $1, false)",
    [JSON.stringify({ "x-forwarded-for": forwardedFor, ...extraHeaders })]);
  await db.exec("set role anon");
  try {
    return (await one(db, "select public.crm_submit_lead($1) r", [{ type: "callback", name: "Тест", phone }])).r;
  } finally {
    await db.exec("reset role");
  }
}

async function expectCode(promise, code, label) {
  try { await promise; } catch (error) {
    assert.equal(error.code, code, `${label}: unexpected error ${error.code} ${error.message}`);
    return error;
  }
  assert.fail(`${label}: expected error ${code}`);
}

const address = headers => one(db_, "select public._crm_client_address($1::jsonb) a", [JSON.stringify(headers)]).then(row => row.a);
let db_;
const phone = n => `09312${String(n).padStart(5, "0")}`;

export async function run(db) {
  db_ = db;

  // 1. Which address is chosen.
  assert.equal(await address({ "x-forwarded-for": "198.51.100.20" }), "198.51.100.20");
  assert.equal(await address({ "x-forwarded-for": "1.2.3.4, 198.51.100.20" }), "198.51.100.20", "client-supplied first value ignored");
  assert.equal(await address({ "x-forwarded-for": "1.2.3.4,198.51.100.20, 10.0.3.7" }), "198.51.100.20", "internal hop skipped");
  assert.equal(await address({ "x-forwarded-for": "1.2.3.4, 198.51.100.20, 172.70.12.9" }), "198.51.100.20", "Cloudflare edge hop skipped");
  assert.equal(await address({ "x-forwarded-for": "garbage, 2001:db8::5" }), "2001:db8::5");
  assert.equal(await address({ "x-forwarded-for": "1.2.3.4, [2001:db8::5]:443" }), "2001:db8::5");
  assert.equal(await address({ "x-forwarded-for": "1.2.3.4, 198.51.100.20:5050" }), "198.51.100.20");
  assert.equal(await address({ "x-forwarded-for": "127.0.0.1" }), "127.0.0.1", "local QA still gets an address");
  assert.equal(await address({ "x-forwarded-for": "8.8.8.8, 127.0.0.1" }), "8.8.8.8");
  assert.equal(await address({ "x-real-ip": "198.51.100.30" }), "198.51.100.30");
  assert.equal(await address({ "x-forwarded-for": "not-an-ip" }), null);
  assert.equal(await address({}), null);

  // 2. 20 leads from one real address, each with a different spoofed first value and a different phone:
  //    all accepted; the 21st is rejected with 54000 although its spoofed value is new too.
  const real = "198.51.100.77";
  for (let i = 1; i <= 20; i += 1) {
    const result = await anonLead(db, `10.${i}.${i}.${i}, 203.0.113.${i}, ${real}`, phone(i));
    assert.ok(result.number || result.accepted, `lead ${i} accepted`);
  }
  await expectCode(anonLead(db, `203.0.113.250, ${real}`, phone(21)), "54000", "21st lead from the same real IP");
  // Same real address behind another internal / Cloudflare hop: still the same client.
  await expectCode(anonLead(db, `5.6.7.8, ${real}, 162.158.1.1`, phone(22)), "54000", "same IP through the CDN hop");
  // Putting another address last is not possible for a client; a different real address passes.
  const other = await anonLead(db, `${real}, 198.51.100.78`, phone(23));
  assert.ok(other.number, "another real address is not limited");

  const fingerprints = await one(db, `select count(distinct client_fingerprint)::int c from public.crm_submission_log`);
  assert.equal(fingerprints.c, 2, "one fingerprint per real address");

  // 3. Site-wide backstop: 60 submissions in 10 minutes from anywhere.
  await db.query(`insert into public.crm_submission_log (kind, phone, client_fingerprint)
    select 'lead', '+38093' || lpad(g::text, 7, '0'), md5(g::text) from generate_series(1, 60 - 21) g`);
  assert.equal((await one(db, "select count(*)::int c from public.crm_submission_log where created_at > now() - interval '10 minutes'")).c, 60);
  await expectCode(anonLead(db, "198.51.100.90", phone(90)), "54000", "global limit");
  await db.query("update public.crm_submission_log set created_at = now() - interval '11 minutes'");
  assert.ok((await anonLead(db, "198.51.100.90", phone(91))).number, "accepted again after 10 minutes");

  // 4. Probe: admins only.
  await db.query("insert into auth.users (id, email) values ($1, 'owner@example.test')", [OWNER]);
  await db.query("insert into public.admin_profiles (user_id, name, role) values ($1, 'Owner', 'owner')", [OWNER]);
  await db.query("select set_config('request.headers', $1, false)",
    [JSON.stringify({ "x-forwarded-for": "1.2.3.4, 198.51.100.5, 10.0.0.1", "cf-connecting-ip": "198.51.100.5", authorization: "x" })]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [OWNER]);
  await db.exec("set role authenticated");
  try {
    const probe = (await one(db, "select public.crm_client_address_probe() p")).p;
    assert.equal(probe.chosen, "198.51.100.5");
    assert.deepEqual(probe.chain.map(entry => entry.proxy), [false, false, true]);
    assert.equal(probe.headers["cf-connecting-ip"], "198.51.100.5");
    assert.equal(probe.headers.authorization, undefined, "probe does not echo other headers");
  } finally {
    await db.exec("reset role");
  }
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.exec("set role anon");
  try {
    await expectCode(db.query("select public.crm_client_address_probe()"), "42501", "anon probe");
    await expectCode(db.query("select public._crm_client_address('{}'::jsonb)"), "42501", "anon helper");
  } finally {
    await db.exec("reset role");
  }

  console.log(JSON.stringify({ status: "ok", scenarios: 4, suite: "crm-rate-limit" }));
}
