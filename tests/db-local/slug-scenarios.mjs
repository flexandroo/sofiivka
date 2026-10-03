// Product slugs (20261002001900): Ukrainian titles → Latin addresses, and the public lookup by slug.
// Admin-created products get their slug from the title too (20261002002100).
import assert from "node:assert/strict";

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const slugify = async (db, value) => (await one(db, "select public._catalog_slugify($1) s", [value])).s;

export async function run(db) {
  // 1. KMU 2010 transliteration, word-initial forms, units, fractions, apostrophes.
  const cases = [
    ["Насос циркуляційний Termojet AUTO енергозберігаючий APM 32/12/180 мм", "nasos-tsyrkuliatsiinyi-termojet-auto-enerhozberihaiuchyi-apm-32-12-180-mm"],
    ["Дренажний насос TEKK HAUS SDP-1", "drenazhnyi-nasos-tekk-haus-sdp-1"],
    ["Ємність для води 500 л", "yemnist-dlia-vody-500-l"],
    ["Активоване вугілля Filtrasorb 300 25 кг", "aktyvovane-vuhillia-filtrasorb-300-25-kg"],
    ["Фільтр для гарячої води BWT PROTECTOR MINI HWS ¾\" HR", "filtr-dlia-hariachoi-vody-bwt-protector-mini-hws-3-4-hr"],
    ["Зворотний клапан зі з’єднанням", "zvorotnyi-klapan-zi-ziednanniam"],
    ["Згін латунний", "zghin-latunnyi"],
    ["", "product"]
  ];
  for (const [title, expected] of cases) assert.equal(await slugify(db, title), expected, title);

  // 2. Long titles are cut at a word boundary, at most 80 characters.
  const long = await slugify(db, "Аксесуари керування температурою BAXI для LUNA Platinum, NUVOLA Platinum, LUNA Duo-tec MP+, POWER HT+, POWER HT 115-650 кВт");
  assert.ok(long.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(long), long);
  assert.equal(long, "aksesuary-keruvannia-temperaturoiu-baxi-dlia-luna-platinum-nuvola-platinum-luna");

  // 3. The lookup is public and returns nothing for an unknown slug.
  await db.exec("set role anon");
  try {
    assert.equal((await one(db, "select public.get_catalog_product_by_slug('no-such-product') r")).r, null);
    await assert.rejects(db.query("select public._catalog_slugify('x')"), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
  // 4. Products created in the admin get a slug from the title; a taken slug gets the SKU, then the legacy id.
  const OWNER = "00000000-0000-4000-8000-0000000000e1";
  await db.query("insert into auth.users (id, email) values ($1, 'slug-owner@example.test')", [OWNER]);
  await db.query("insert into public.admin_profiles (user_id, name, role) values ($1, 'Власник', 'owner')", [OWNER]);
  // The harness has no published catalogue release; card refresh is covered elsewhere, so stub it here.
  await db.exec("create or replace function public._admin_refresh_catalog(target_product_ids uuid[]) returns text language sql as $$ select 'test'::text $$");
  const brand = await one(db, "select internal_id from public.brands order by stable_id limit 1");
  const category = await one(db, "select internal_id from public.categories where status <> 'archived' order by level desc, stable_id limit 1");
  const create = async sku => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [OWNER]);
    await db.exec("set role authenticated");
    try {
      const created = (await one(db, "select public.admin_create_product($1) r", [{ title: "Насос циркуляційний Тест 25/60", sku, brandId: brand.internal_id, categoryId: category.internal_id }])).r;
      await db.exec("reset role");
      return (await one(db, "select slug from public.products where legacy_id = $1", [created.legacyId])).slug;
    } finally {
      await db.exec("reset role");
    }
  };
  assert.equal(await create("T-25/60"), "nasos-tsyrkuliatsiinyi-test-25-60");
  assert.equal(await create("T-25/60 B"), "nasos-tsyrkuliatsiinyi-test-25-60-t-25-60-b");
  const third = await create("T 25 60 B");
  assert.match(third, /^nasos-tsyrkuliatsiinyi-test-25-60-t-25-60-b-[a-z0-9-]+$/);
  console.log(JSON.stringify({ status: "ok", scenarios: 4, suite: "slugs" }));
}
