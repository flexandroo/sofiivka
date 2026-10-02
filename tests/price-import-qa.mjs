// Price import v1 (npm run prices:qa): CSV/XLSX parsing units plus static wiring of the migration,
// API, route and products-list link. Database behaviour is covered by
// tests/db-local/price-import-scenarios.mjs (npm run db:local:test).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  parseCsv, detectDelimiter, cleanCell, parseAmount, parseStatus, guessMapping, findHeaderRow, buildImportRows,
  toCsv, EXPORT_COLUMNS, decodeText, readXlsx, readTableFile
} from "../admin/admin-price-csv.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

// --- CSV parser ---------------------------------------------------------------------------------
assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
assert.equal(detectDelimiter("a,b,c\n1,2,3"), ",");
assert.equal(detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
assert.equal(detectDelimiter('"x;y",b,c\n1,2,3'), ",", "separators inside quotes do not count");
assert.equal(detectDelimiter("sku;price\nA;1,5"), ";", "comma decimals do not beat ;");

let parsed = parseCsv('﻿SKU;Назва;Ціна\r\nA-1;"Котел ""Альфа""; 24 кВт";1 250,50\r\n"B-2";"Два\nрядки";99\r\n');
assert.equal(parsed.delimiter, ";");
assert.deepEqual(parsed.rows, [["SKU", "Назва", "Ціна"], ["A-1", 'Котел "Альфа"; 24 кВт', "1 250,50"], ["B-2", "Два\nрядки", "99"]], "BOM, quotes, escaped quotes, newlines in quotes");
parsed = parseCsv("sku,price,old\nA,\"1,5\",\nB,2,3");
assert.equal(parsed.delimiter, ",");
assert.deepEqual(parsed.rows, [["sku", "price", "old"], ["A", "1,5", ""], ["B", "2", "3"]], "comma separator with quoted comma decimal");
parsed = parseCsv("a;b\n\n1;2\n");
assert.deepEqual(parsed.rows, [["a", "b"], [""], ["1", "2"]], "blank lines kept as empty rows (line numbers stay true)");
assert.deepEqual(parseCsv("a;b").rows, [["a", "b"]], "no trailing newline");
assert.equal(cleanCell('="00123"'), "00123", "Excel text guard is undone");
assert.equal(cleanCell("'=SUM(A1)"), "=SUM(A1)", "formula-injection apostrophe is undone");
assert.equal(cleanCell("  x "), "x");

// --- encodings ------------------------------------------------------------------------------------
assert.equal(decodeText(new TextEncoder().encode("﻿Ціна")), "Ціна");
const cp1251 = Uint8Array.from([0xD6, 0xB3, 0xED, 0xE0]); // "Ціна" in Windows-1251
assert.equal(decodeText(cp1251), "Ціна", "Windows-1251 fallback");

// --- numbers --------------------------------------------------------------------------------------
const amount = text => parseAmount(text).value;
assert.equal(amount("1 250,50"), 1250.5);
assert.equal(amount("1250.5"), 1250.5);
assert.equal(amount("1.250,50"), 1250.5);
assert.equal(amount("1,250.50"), 1250.5);
assert.equal(amount("1 250"), 1250);
assert.equal(amount("1 234 567"), 1234567);
assert.equal(amount("1.234.567"), 1234567);
assert.equal(amount("999,999"), 1000, "rounded to kopecks");
assert.equal(amount("12 500 грн"), 12500);
assert.equal(amount("₴ 300"), 300);
assert.equal(amount("0"), 0);
assert.equal(parseAmount("").empty, true);
assert.equal(parseAmount("   ").empty, true);
assert.match(parseAmount("-5").error, /від’ємною/);
assert.match(parseAmount("12a").error, /не є числом/);
assert.match(parseAmount("за запитом").error, /не є числом/);

// --- statuses -------------------------------------------------------------------------------------
assert.equal(parseStatus("price", "Вказана").value, "known");
assert.equal(parseStatus("price", "за запитом").value, "on_request");
assert.equal(parseStatus("price", "unknown").value, "unknown");
assert.match(parseStatus("price", "free").error, /невідомий статус ціни/);
assert.equal(parseStatus("inventory", "В наявності").value, "in_stock");
assert.equal(parseStatus("inventory", "Немає").value, "out_of_stock");
assert.equal(parseStatus("inventory", "під замовлення").value, "preorder");
assert.equal(parseStatus("inventory", "Знято").value, "discontinued");
assert.equal(parseStatus("inventory", "12").value, "in_stock", "quantity > 0");
assert.equal(parseStatus("inventory", "0").value, "out_of_stock", "quantity 0");
assert.equal(parseStatus("inventory", "").empty, true);
assert.match(parseStatus("inventory", "багато").error, /невідомий статус наявності/);

// --- columns and rows -----------------------------------------------------------------------------
const exportHeaders = EXPORT_COLUMNS.map(([title]) => title);
assert.deepEqual(guessMapping(exportHeaders), { sku: 0, legacyId: 1, price: 4, oldPrice: 5, priceStatus: 6, inventoryStatus: 7 }, "export round-trips");
assert.deepEqual(guessMapping(["Артикул", "Найменування", "Ціна, грн", "Залишок"]), { sku: 0, price: 2, inventoryStatus: 3 });
assert.equal(findHeaderRow([["Прайс ТОВ Постачальник"], [""], ["Артикул", "Ціна"], ["A", "1"]]), 2);

const table = [
  ["SKU", "Ціна", "Стара ціна", "Статус ціни", "Наявність"],
  ["A-1", "1 250,50", "", "", "В наявності"],
  ["a-1", "10", "", "", ""],
  ["", "5", "", "", ""],
  ["B-2", "abc", "", "", ""],
  ["C-3", "", "", "За запитом", "0"],
  ["D-4", "0", "", "", ""],
  ["", "", "", "", ""],
  ["E-5", "100", "150", "", "lots"],
  ["F-6", "", "", "", ""]
];
const built = buildImportRows(table, 0, { key: 0, price: 1, oldPrice: 2, priceStatus: 3, inventoryStatus: 4 }, "sku");
assert.deepEqual(built.rows, [
  { line: 2, key: "A-1", price: 1250.5, oldPrice: null, inventoryStatus: "in_stock" },
  { line: 6, key: "C-3", oldPrice: null, priceStatus: "on_request", inventoryStatus: "out_of_stock" },
  { line: 10, key: "F-6", oldPrice: null }
]);
assert.deepEqual(built.problems.map(item => [item.line, item.status]), [[3, "invalid"], [4, "invalid"], [5, "invalid"], [7, "invalid"], [9, "invalid"]]);
assert.match(built.problems[0].message, /SKU повторюється у файлі \(рядок 2\)/, "SKU duplicates are case-insensitive");
assert.match(built.problems[1].message, /Порожній SKU/);
assert.match(built.problems[2].message, /Ціна: «abc» не є числом/);
assert.match(built.problems[3].message, /більшою за 0/);
assert.match(built.problems[4].message, /Невідомий статус наявності «lots»/);
const legacy = buildImportRows([["Legacy ID", "Ціна"], ["p-1", "5"], ["P-1", "6"]], 0, { key: 0, price: 1 }, "legacy_id");
assert.equal(legacy.rows.length, 2, "legacy ids are case-sensitive");

// --- CSV writer -----------------------------------------------------------------------------------
const csv = toCsv(EXPORT_COLUMNS, [
  { sku: "00123", legacyId: "p-1", title: '=HYPERLINK("x")', brand: "Baxi; Italy", amount: 1250.5, oldAmount: null, priceStatus: "known", inventoryStatus: "in_stock", publicationStatus: "published" },
  { sku: "AB-1", legacyId: "p-2", title: "Насос", brand: "Grundfos", amount: null, oldAmount: null, priceStatus: "on_request", inventoryStatus: "unknown", publicationStatus: "draft" }
]);
assert.ok(csv.startsWith("﻿SKU;Legacy ID;Назва;Бренд;Ціна, грн;Стара ціна, грн;Статус ціни;Наявність;Публікація\r\n"), "BOM + ; header");
const [, first, second] = csv.split("\r\n");
assert.equal(first, `"=""00123""";p-1;"'=HYPERLINK(""x"")";"Baxi; Italy";1250,50;;Вказана;В наявності;Опубліковано`);
assert.equal(second, "AB-1;p-2;Насос;Grundfos;;;За запитом;Невідомо;Чернетка");
// Round trip: exported file reads back to the same values.
const back = parseCsv(csv);
assert.equal(back.delimiter, ";");
assert.deepEqual(back.rows[1].slice(0, 5), ["00123", "p-1", '=HYPERLINK("x")', "Baxi; Italy", "1250,50"]);
const roundTrip = buildImportRows(back.rows, 0, guessMapping(back.rows[0]), "sku");
assert.deepEqual(roundTrip.rows[0], { line: 2, key: "00123", price: 1250.5, oldPrice: null, priceStatus: "known", inventoryStatus: "in_stock" });
assert.deepEqual(roundTrip.rows[1], { line: 3, key: "AB-1", oldPrice: null, priceStatus: "on_request", inventoryStatus: "unknown" });

// --- XLSX (stored and deflated entries, shared + inline strings, gaps) -----------------------------
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text, deflate] of entries) {
    const raw = Buffer.from(text, "utf8");
    const data = deflate ? zlib.deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}
const xlsx = zip([
  ["[Content_Types].xml", "<Types/>", false],
  ["xl/workbook.xml", '<workbook><sheets><sheet name="Прайс" sheetId="1" r:id="rId7"/></sheets></workbook>', true],
  ["xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId7" Type="worksheet" Target="worksheets/price.xml"/></Relationships>', true],
  ["xl/sharedStrings.xml", '<sst><si><t>Артикул</t></si><si><r><t>Ці</t></r><r><t>на</t></r></si><si><t>A&amp;B-1</t></si><si><t xml:space="preserve">В наявності</t></si></sst>', true],
  ["xl/worksheets/price.xml", `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Наявність</t></is></c></row>
    <row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>1250.5</v></c><c r="D3" t="s"><v>3</v></c></row>
    <row r="4"><c r="A4" t="str"><v>00777</v></c><c r="B4"><v>1.5E3</v></c></row>
  </sheetData></worksheet>`, true]
]);
const sheet = await readXlsx(xlsx);
assert.deepEqual(sheet, [["Артикул", "Ціна", "", "Наявність"], [], ["A&B-1", "1250.5", "", "В наявності"], ["00777", "1500"]]);
const fromXlsx = buildImportRows(sheet, 0, guessMapping(sheet[0]), "sku");
assert.deepEqual(fromXlsx.rows, [{ line: 3, key: "A&B-1", price: 1250.5, inventoryStatus: "in_stock" }, { line: 4, key: "00777", price: 1500 }], "Excel row numbers are kept");
assert.equal((await readTableFile("prices.xlsx", xlsx.buffer)).format, "xlsx");
assert.equal((await readTableFile("prices.csv", new TextEncoder().encode("a;b\n1;2").buffer)).delimiter, ";");
await assert.rejects(readTableFile("old.xls", new Uint8Array([1, 2, 3]).buffer), /\.xls не підтримується/);
await assert.rejects(readXlsx(zip([["x.txt", "hi", false]])), /не схожий на Excel/);

// --- static wiring --------------------------------------------------------------------------------
const migration = read("supabase/migrations/20261002001100_price_import_v1.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const products = read("admin/admin-products.mjs");
const view = read("admin/admin-prices.mjs");
const pkg = JSON.parse(read("package.json"));

for (const fn of ["admin_apply_price_updates(jsonb)",
  "admin_export_products(text, uuid, uuid, public.product_publication_status, public.product_inventory_status, public.product_price_status, integer, integer)"]) {
  const escaped = fn.replace(/[().]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon;`), `${fn} revoked from anon`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`), `${fn} granted to authenticated`);
}
assert.match(migration, /revoke all on function public\._price_import_number\(jsonb, text\) from public, anon, authenticated/);
for (const body of migration.split(/create or replace function /).slice(1)) {
  assert.match(body, /set search_path = ''/, `${body.slice(0, 40)} pins search_path`);
  if (body.startsWith("public.admin_")) assert.match(body, /security definer/, `${body.slice(0, 40)} is security definer`);
}
assert.match(migration, /if not public\.can_manage_products\(\) then/, "same role as the other commercial edits");
assert.match(migration, /public\._admin_refresh_catalog\(changed_ids\)/, "product cards refresh like admin_bulk_products");
assert.match(migration, /insert into public\.product_admin_audit/);
assert.match(migration, /insert into public\.import_runs/);
assert.match(migration, /enum_range\(null::public\.product_price_status\)/);
assert.match(migration, /enum_range\(null::public\.product_inventory_status\)/);
assert.doesNotMatch(migration, /^\s*delete from|create trigger|drop trigger|^begin;|^commit;/im, "connector-safe migration");
assert.match(api, /"admin_apply_price_updates", \{ payload \}/);
assert.match(api, /"admin_export_products"/);
assert.match(app, /const priceImport = path === "\/admin\/products\/import"/);
assert.match(app, /productEditorMatch = !priceImport &&/, "import route is not taken for a product id");
assert.match(products, /priceImportHref\(search\)/, "products list links to the import with its filters");
assert.match(view, /dryRun: true/);
assert.match(view, /dryRun: false, runId/);
assert.match(view, /PRICE_IMPORT_BATCH = 100/);
assert.ok(pkg.scripts["prices:qa"], "prices:qa script");
assert.match(pkg.scripts["db:local:test"], /price-import-scenarios\.mjs/);

const css = read("admin/admin.css").replace(/\/\*[\s\S]*?\*\//g, "");
assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, "admin.css braces balanced");

console.log(JSON.stringify({ status: "ok", suite: "price-import-qa" }));
