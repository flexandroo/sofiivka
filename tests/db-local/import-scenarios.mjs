// Product import standard (docs/product-import-standard.md): scripts/import/reference.sql exports the
// reference, scripts/import-check.mjs checks a batch and writes SQL that adds only new products as drafts.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];

export async function run(db) {
  const brand = await one(db, "select internal_id, stable_id, name from public.brands where status = 'active' order by stable_id limit 1");
  const leaf = await one(db, `select c.internal_id, c.stable_id from public.categories c
    where c.status = 'active' and c.visibility = 'catalog'
      and not exists (select 1 from public.categories child where child.parent_id = c.internal_id and child.status = 'active')
      and exists (select 1 from public.category_attributes ca join public.attribute_definitions d on d.internal_id = ca.attribute_id
        where ca.category_id = c.internal_id and d.value_type = 'number')
    order by c.stable_id limit 1`);
  const numberAttribute = await one(db, `select d.stable_id from public.category_attributes ca
    join public.attribute_definitions d on d.internal_id = ca.attribute_id
    where ca.category_id = $1 and d.value_type = 'number' order by d.stable_id limit 1`, [leaf.internal_id]);

  await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id, publication_status)
    values ('old-1', 'OLD-1', 'old-1', 'Насос Старий', 'Старий', 'S1', $1, $2, 'published')`, [brand.internal_id, leaf.internal_id]);
  await db.query(`insert into public.catalog_snapshot_releases
      (snapshot_version, contract_version, categories, brands, attribute_definitions, product_count, public_product_count, product_id_hash, ready)
    values ('v-import', 'test', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 1, 1, repeat('0', 64), true)`);
  await db.query("insert into public.catalog_snapshot_pointer (singleton, snapshot_version) values (true, 'v-import')");
  await db.query(`insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version) values (true, 'v-import')
    on conflict (singleton) do update set base_snapshot_version = 'v-import', revision = 0`);
  await db.query("select public._admin_refresh_catalog(array_agg(internal_id)) from public.products");

  // 1. The reference export runs on the real schema.
  const reference = (await one(db, fs.readFileSync(path.join(ROOT, "scripts/import/reference.sql"), "utf8"))).reference;
  assert.equal(reference.source, "prod");
  assert.ok(reference.categories.some(category => category.id === leaf.stable_id && category.leaf));
  assert.equal(reference.products[0].sku, "OLD-1");

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sofiivka-import-"));
  const image = path.relative(ROOT, path.join(ROOT, "assets/products/tekkhaus", fs.readdirSync(path.join(ROOT, "assets/products/tekkhaus")).find(name => name.endsWith(".webp"))));
  const description = "Насос Новий 100 — модель для подачі води з колодязя. Корпус з нержавіючої сталі, вбудований захист від перегріву та сухого ходу.";
  const good = (sku, title, extra = {}) => ({
    sourceId: `src-${sku}`, sourceUrl: `https://example.test/${sku}`, sku, model: sku, brand: brand.stable_id,
    title, category: leaf.stable_id, price: 1234.4, shortDescription: "Насос для подачі води.", description,
    sections: [{ title: "Застосування", paragraphs: ["Подача води з колодязя."] }],
    characteristics: [{ label: "Потужність", value: "750", unit: "Вт" }, { label: "Штрихкод", value: "482000" }, { label: "Потужність", value: "750", unit: "Вт" }],
    filters: { [numberAttribute.stable_id]: 0.75, missingAttribute: 1 },
    images: [image, image], documents: [{ title: "Інструкція", type: "manual", url: image }],
    ...extra
  });
  const batch = {
    supplier: "test-supplier", supplierName: "Тестовий постачальник", collectedAt: "2026-10-03", sourceSite: "https://example.test",
    products: [
      good("NEW-1", `Насос ${brand.name} Новий 100`),
      good("OLD-1", `Насос ${brand.name} Старий`, { price: 999 }),
      good("BAD-1", `${brand.name} Помилковий, `, { images: ["https://example.test/a.jpg"], description: "Это насос." })
    ]
  };
  const batchPath = path.join(directory, "batch.json");
  fs.writeFileSync(batchPath, JSON.stringify(batch));
  fs.writeFileSync(path.join(directory, "reference.json"), JSON.stringify(reference));

  // 2. The check sorts products into new, existing and blocked.
  const summary = JSON.parse(childProcess.execFileSync("node", [path.join(ROOT, "scripts/import-check.mjs"), batchPath, `--reference=${path.join(directory, "reference.json")}`], { cwd: ROOT, encoding: "utf8" }));
  assert.deepEqual([summary.total, summary.existing, summary.ready, summary.blocked, summary.priceChanges], [3, 1, 1, 1, 1]);
  const report = fs.readFileSync(path.join(directory, "batch.report.md"), "utf8");
  assert.match(report, /BAD-1/);
  assert.match(report, /назва не починається з типу товару/);
  assert.match(report, /фото з чужого сайту/);
  assert.match(report, /російські або польські літери/);
  assert.equal(fs.readFileSync(path.join(directory, "batch.prices.csv"), "utf8"), "SKU;Ціна\nOLD-1;999\n");

  // 3. The SQL adds the new product as a draft with media, documents, filters, source and page characteristics.
  const sql = fs.readFileSync(path.join(directory, "batch.sql"), "utf8");
  await db.exec(sql);
  const added = await one(db, `select p.internal_id, p.legacy_id, p.slug, p.title, p.publication_status::text status, p.amount::float8 amount,
      p.price_status::text price_status, p.seo_title, p.seo_description, p.last_import_run_id is not null has_run
    from public.products p where p.sku = 'NEW-1'`);
  assert.equal(added.status, "draft");
  assert.equal(added.legacy_id, "test-supplier-src-new-1");
  assert.equal(added.amount, 1234);
  assert.equal(added.price_status, "known");
  assert.match(added.slug, /^nasos-.*novyi-100$/);
  assert.ok(added.seo_title.endsWith("— купити в ТД «Софіївка»") && added.seo_description.length <= 160 && added.has_run);
  const media = (await db.query("select role::text role, url from public.product_media where product_id = $1 order by sort_order", [added.internal_id])).rows;
  assert.deepEqual(media.map(row => row.role), ["primary", "gallery"]);
  assert.ok(media[0].url.startsWith("/assets/"));
  assert.equal((await one(db, "select count(*)::int n from public.product_documents where product_id = $1 and document_type = 'manual'", [added.internal_id])).n, 1);
  assert.equal((await one(db, "select value_number::float8 v from public.product_attribute_values where product_id = $1", [added.internal_id])).v, 0.75);
  assert.equal((await one(db, "select source_id from public.product_source_records where product_id = $1", [added.internal_id])).source_id, "src-NEW-1");
  const payload = (await one(db, "select payload from public.catalog_product_snapshots where legacy_id = $1", [added.legacy_id])).payload;
  assert.equal(payload.publicationStatus, "draft");
  assert.deepEqual(payload.unmappedAttributes, [{ label: "Потужність", value: "750 Вт" }]);
  assert.equal(payload.source.supplier, "test-supplier");
  assert.equal((await one(db, "select count(*)::int n from public.catalog_product_cards where legacy_id = $1", [added.legacy_id])).n, 0, "drafts get no public card");
  const run = await one(db, "select status::text status, records_succeeded, metadata from public.import_runs order by created_at desc limit 1");
  assert.deepEqual([run.status, run.records_succeeded, run.metadata.skippedExisting], ["succeeded", 1, 0]);

  // 4. Existing products are untouched; blocked products are absent; publishing keeps the characteristics.
  assert.equal((await one(db, "select title from public.products where sku = 'OLD-1'")).title, "Насос Старий");
  assert.equal((await one(db, "select count(*)::int n from public.products where sku = 'BAD-1'")).n, 0);
  await db.query("update public.products set publication_status = 'published' where internal_id = $1", [added.internal_id]);
  await db.query("select public._admin_refresh_catalog(array[$1::uuid])", [added.internal_id]);
  assert.deepEqual((await one(db, "select payload from public.catalog_product_snapshots where legacy_id = $1", [added.legacy_id])).payload.unmappedAttributes, [{ label: "Потужність", value: "750 Вт" }]);
  assert.equal((await one(db, "select count(*)::int n from public.catalog_product_cards where legacy_id = $1", [added.legacy_id])).n, 1);

  // 5. Running the same SQL again changes nothing.
  await db.exec(sql);
  assert.equal((await one(db, "select count(*)::int n from public.products where sku = 'NEW-1'")).n, 1);
  assert.equal((await one(db, "select metadata from public.import_runs order by created_at desc, started_at desc limit 1")).metadata.skippedExisting, 1);

  // 6. Rules from the 2026-10-05 catalogue cleanup: service rows, units, EAC, repeated labels, look-alike letters.
  const batch2 = {
    supplier: "test-supplier", supplierName: "Тестовий постачальник", collectedAt: "2026-10-05", sourceSite: "https://example.test",
    products: [
      good("SVC-1", `Насос ${brand.name} Сервіс 1`, {
        description: `Насос ${brand.name} Сервіс 1 — модель серії dUO для подачі води з колодязя, з корпусом з нержавіючої сталі та захистом від перегріву.`,
        characteristics: [
          { label: "QT", value: "acc_pump" }, { label: "EAN номер", value: "5700000000000" }, { label: "Параметр", value: "Значення" },
          { label: "Потужність", value: "1.5 kW" }, { label: "Температура", value: "5…90 °С" }, { label: "Подача", value: "4 m3/h" },
          { label: "Сертифікати", value: "CE,EAC,UKCA" }, { label: "Маркування", value: "EAC-UPA" }, { label: "Тип", value: "pump_type_x" },
          { label: "Витрата", value: "31 л/хв" }, { label: "Витрата", value: "32 л/хв" }, { label: "Pump type", value: "Відцентровий" },
          { label: "Модель", value: "X.1 W" }
        ]
      }),
      good("TJ-MU-40А", `Змішувальний вузол ${brand.name} TJ-MU-40А`, { model: "TJ-MU-40А", description: "Змішувальний вузол для теплої підлоги." })
    ]
  };
  const batch2Path = path.join(directory, "batch2.json");
  fs.writeFileSync(batch2Path, JSON.stringify(batch2));
  const summary2 = JSON.parse(childProcess.execFileSync("node", [path.join(ROOT, "scripts/import-check.mjs"), batch2Path, `--reference=${path.join(directory, "reference.json")}`], { cwd: ROOT, encoding: "utf8" }));
  assert.deepEqual([summary2.total, summary2.ready, summary2.blocked], [2, 1, 1]);
  const report2 = fs.readFileSync(path.join(directory, "batch2.report.md"), "utf8");
  assert.match(report2, /кирилична літера «А» у латинському коді «TJ-MU-40А»/);
  assert.match(report2, /зламаний регістр в описі/);
  const sql2 = fs.readFileSync(path.join(directory, "batch2.sql"), "utf8");
  const rows2 = JSON.parse(sql2.match(/jsonb_array_elements\(\$sofimport\$(.*?)\$sofimport\$::jsonb\)/s)[1])[0].characteristics;
  assert.deepEqual(rows2, [
    { label: "Потужність", value: "1,5 кВт" }, { label: "Температура", value: "5…90 °C" }, { label: "Подача", value: "4 м³/год" },
    { label: "Сертифікати", value: "CE,UKCA" }, { label: "Витрата", value: "31 л/хв; 32 л/хв" }, { label: "Pump type", value: "Відцентровий" },
    { label: "Модель", value: "X.1 W" }
  ]);

  fs.rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify({ status: "ok", checks: "product-import" }));
}
