// Product slugs (20261002001900): Ukrainian titles → Latin addresses, and the public lookup by slug.
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
  console.log(JSON.stringify({ status: "ok", scenarios: 3, suite: "slugs" }));
}
