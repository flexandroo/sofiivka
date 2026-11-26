// Offline source audit of the original 4,233 identities. Does not write SQL or call hosted services.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const referenceFile = "imports/reference-prod.json";
const backupDirectory = "backups/overnight-2026-11-26/live";
const output = path.join(root, "imports/overnight-audit/base-review");
const referenceBytes = await fs.readFile(path.join(root, referenceFile));
const reference = JSON.parse(referenceBytes.toString("utf8"));
const originals = new Map(reference.products.map(product => [String(product.id), product]));
if (originals.size !== 4233) throw new Error(`Expected exactly 4233 baseline identities; found ${originals.size}.`);
const taxonomy = JSON.parse(await fs.readFile(path.join(root, backupDirectory, "taxonomy.json"), "utf8"))[0].data;
const definitions = new Map(taxonomy.attribute_definitions.map(attribute => [attribute.internal_id, attribute]));
const definitionsById = new Map(taxonomy.attribute_definitions.map(attribute => [attribute.stable_id, attribute]));
const categories = new Map(taxonomy.categories.map(category => [category.internal_id, category.stable_id]));
const brands = new Map(taxonomy.brands.map(brand => [brand.internal_id, brand.stable_id]));
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const normalized = value => String(value ?? "").normalize("NFKC").replaceAll("\u00a0", " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("uk");
const equal = (left, right) => Math.abs(Number(left) - Number(right)) <= Math.max(1e-8, Math.abs(Number(right)) * 1e-7);
const officialDomains = {
  wilo: ["wilo.com"], grundfos: ["grundfos.com"], hunter: ["hunterirrigation.com", "hunterindustries.com"],
  altep: ["altep.ua"], feniks: ["feniks.ua"], focus: ["firebox.com.ua"], baxi: ["baxi.ua"], buderus: ["buderus.com"],
  tech: ["tech-controllers.com", "techsterowniki.pl"], tekk: ["tekk.haus"], ecosoft: ["ecosoft.com", "ecosoft.ua"], termojet: ["termojet.com.ua", "termojet.ua"]
};
function sourceUrl(source, raw) {
  return source.source_url || raw.manufacturerUrl || raw.manufacturer_url || raw.sourceUrl || raw.link || null;
}
function official(brand, address) {
  try {
    const host = new URL(address).hostname.toLowerCase();
    return (officialDomains[brand] || []).some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}
function tableRows(raw) {
  const result = [];
  for (const key of ["technicalDetails", "technical_details", "attributes", "characteristics"]) {
    if (!Array.isArray(raw[key])) continue;
    raw[key].forEach((row, index) => {
      const label = Array.isArray(row) ? row[0] : row?.label ?? row?.name;
      const value = Array.isArray(row) ? row[1] : row?.value;
      if (typeof label === "string" && ["string", "number"].includes(typeof value)) result.push({ label, value, rawPath: `${key}[${index}]` });
    });
  }
  const seen = new Set();
  return result.filter(row => { const key = `${row.label}\0${row.value}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
// Deliberately accepts one scalar only. Ranges, fractions, inequalities, model codes and lists are not guessed.
function scalar(value, label, dimension) {
  const text = normalized(value);
  const nominalPressure = /^pn\s*(\d+(?:[.,]\d+)?)$/.exec(text);
  if (dimension === "bar" && nominalPressure) return { value: Number(nominalPressure[1].replace(",", ".")), unit: "PN nominal", context: normalized(label) };
  const match = /^([+-]?\d+(?:[.,]\d+)?)(?:\s*([^\d]*))?$/.exec(text);
  if (!match || /[<>≤≥±~]/.test(text)) return null;
  let numeric = match[1];
  const explicit = normalized(match[2]);
  const context = `${normalized(label)} ${explicit}`;
  let unit = explicit;
  if (!unit) {
    const units = dimension === "mm" ? ["мм", "mm", "см", "cm", "м", "m"]
      : dimension === "m" ? ["мм", "mm", "см", "cm", "м", "m"]
      : dimension === "W" || dimension === "kW" ? ["квт", "kw", "вт", "w"]
      : dimension === "kg" ? ["кг", "kg", "г", "g"]
      : dimension === "bar" ? ["бар", "bar", "мпа", "mpa", "кпа", "kpa"]
      : dimension === "m3h" ? ["м3/год", "м³/год", "m3/h", "л/хв", "l/min", "л/год", "l/h"]
      : dimension === "l" ? ["л", "l", "літр"] : dimension === "%" ? ["%"] : [];
    unit = units.find(candidate => new RegExp(`(?:^|[\\s,(])${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[\\s,)])`, "i").test(normalized(label))) || "";
  }
  // A dot group is a thousands separator only in unambiguously integral mm/g source columns.
  if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(numeric) && /^(мм|mm|г|g)$/.test(unit)) numeric = numeric.replaceAll(".", "");
  else if ((numeric.match(/\./g) || []).length > 1 || (numeric.includes(".") && numeric.includes(","))) return null;
  const number = Number(numeric.replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return null;
  const factors = dimension === "mm" ? { мм: 1, mm: 1, см: 10, cm: 10, м: 1000, m: 1000 }
    : dimension === "m" ? { мм: .001, mm: .001, см: .01, cm: .01, м: 1, m: 1 }
    : dimension === "W" ? { вт: 1, w: 1, квт: 1000, kw: 1000 }
    : dimension === "kW" ? { вт: .001, w: .001, квт: 1, kw: 1 }
    : dimension === "kg" ? { кг: 1, kg: 1, г: .001, g: .001 }
    : dimension === "bar" ? { бар: 1, bar: 1, мпа: 10, mpa: 10, кпа: .01, kpa: .01 }
    : dimension === "m3h" ? { "м3/год": 1, "m3/h": 1, "м³/год": 1, "л/хв": .06, "l/min": .06, "л/год": .001, "l/h": .001 }
    : dimension === "l" ? { л: 1, l: 1, літр: 1 } : dimension === "%" ? { "%": 1 } : {};
  if (!(unit in factors)) return null;
  return { value: number * factors[unit], unit, context };
}
function targets(label) {
  const text = normalized(label).replace(/[рp]\s*([12])/g, "p$1");
  const result = [];
  const add = (attribute, unit, reason) => result.push({ attribute, unit, reason });
  const qualifiedDimension = /дим|дым|chimney|топк|камер|пакув|упаков|packing|мінім|minim|макс|maxim|подач|напір|всмок|всас|занур|погруж|монтаж|установ|кроншт|бункер/i.test(text);
  if (!qualifiedDimension) {
    if (/^(габаритна |габаритная )?(висота|высота|height|höhe)(?:\s+h)?(?:\s*[,()]?\s*(мм|mm|см|cm|м|m)\s*\)?)?$/u.test(text)) add("heightMm", "mm", "explicit unqualified body height");
    if (/^(габаритна |габаритная )?(ширина|width|breite)(?:\s+w)?(?:\s*[,()]?\s*(мм|mm|см|cm|м|m)\s*\)?)?$/u.test(text)) add("widthMm", "mm", "explicit unqualified body width");
    if (/^(габаритна |габаритная )?(глибина|глубина|depth|tiefe)(?:\s+d)?(?:\s*[,()]?\s*(мм|mm|см|cm|м|m)\s*\)?)?$/u.test(text)) add("depthMm", "mm", "explicit unqualified body depth");
  }
  if (/(монтажн.{0,5}довжин|монтажн.{0,5}длин|installation length|довжина насоса)/i.test(text)) add("mountingLengthMm", "mm", "explicit pump installation length");
  if (/(димох|дымоход|chimney)/.test(text) && /(діаметр|диаметр|diameter)/.test(text) && !/рекоменд|внутріш|внутрен|recommended|internal/.test(text)) add("chimneyDiameterMm", "mm", "explicit chimney connection diameter, not a recommended internal chimney diameter");
  if (/(димох|дымоход|chimney)/.test(text) && /(висота|высота|height)/.test(text)) add("chimneyHeightM", "m", "explicit chimney height, not body height");
  if (/(кабел|cable)/.test(text) && /(довжин|длин|length)/.test(text)) add("cableLengthM", "m", "explicit cable length");
  if (/(максимальн.{0,5}(висота подач|напір|напор)|макс\.? напір|maximum head|hmax|h qmin)/.test(text)) add("headM", "m", "explicit maximum hydraulic head");
  if (/(максимальн.{0,5}(подач|продуктив)|qmax|maximum flow)/.test(text)) add("flowM3h", "m3h", "explicit maximum flow");
  if (/(робоч.{0,5}тиск|рабоч.{0,5}давлен|operating pressure)/.test(text) && !/мін|minim|випроб|испыт|test/.test(text)) add("pressureBar", "bar", "explicit operating pressure");
  if (!/кількість|количеств|number of pumps|×/.test(text) && ((/p1/.test(text) && !/min|мін|миним/.test(text)) || (/(споживан|потребляем|споживча|consumption|input power)/.test(text) && /(потужн|мощност|power)/.test(text) && !/min|мін|миним/.test(text)))) add("consumptionPowerW", "W", "electrical input P1; never substituted with P2");
  if (/(номінальн.{0,7}потужність котла|теплова потужн|тепловая мощност|heat output)/.test(text)) add("heatOutputKw", "kW", "explicit nominal boiler/thermal output");
  if (/^(вага|маса|вес|weight|net weight|вага нетто|маса нетто)(?:$|[\s,(])/.test(text) && !/брутто|gross|упаков|палив|топлив/.test(text)) add("weightKg", "kg", "product/net weight; gross weight excluded");
  if (/(водян.{0,5}ємніст|об.?єм води|объем воды|water (content|volume))/.test(text)) add("waterVolumeL", "l", "explicit boiler water volume");
  if (/^(ккд|к\.к\.д|efficiency)(?:$|[\s,(])/.test(text) && !/min|max|мін|макс/.test(text)) add("efficiencyPercent", "%", "explicit efficiency percentage");
  return result;
}

if (process.argv.includes("--self-test")) {
  assert.equal(scalar("25000 l/h", "Максимальна продуктивність", "m3h").value, 25);
  assert.equal(scalar("125 л/хв", "Максимальна продуктивність", "m3h").value, 7.5);
  assert.equal(scalar("360 360", "ширина, мм", "mm"), null, "duplicate table cells are not thousands");
  assert.equal(scalar("150-300 кВт", "Потужність", "kW"), null);
  assert.equal(scalar("105 Вт", "P1 max", "W").value, 105);
  assert.equal(scalar("60 Вт", "P2", "kW").value, .06);
  assert.equal(scalar("PN 10", "Робочий тиск", "bar").value, 10);
  assert.equal(targets("висота (мінимально допустима)").some(item => item.attribute === "heightMm"), false);
  assert.equal(targets("Висота радіатора").some(item => item.attribute === "heightMm"), false);
  assert.equal(targets("Рекомендовані параметри димоходу: внутрішній діаметр").some(item => item.attribute === "chimneyDiameterMm"), false);
  assert.equal(targets("Споживана потужність P1 × кількість насосів").some(item => item.attribute === "consumptionPowerW"), false);
  console.log(JSON.stringify({ status: "ok", selfTests: 11, hostedWrites: 0 }));
  process.exit(0);
}

// Curated corrections require the exact manufacturer table AND its variant column, not a sibling's value.
const proofManifest = JSON.parse(await fs.readFile(path.join(output, "sources/manifest.json"), "utf8").catch(() => "[]"));
const proofCache = new Map();
const cleanCell = value => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
for (const source of proofManifest.filter(item => item.file?.endsWith(".html"))) {
  const bytes = await fs.readFile(path.join(root, source.file));
  assert.equal(sha(bytes), source.sha256, `Live source cache changed: ${source.file}`);
  const html = bytes.toString("utf8");
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(table => [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => cleanCell(cell[1]))));
  proofCache.set(path.basename(source.file), { ...source, html, tables });
}
const reviewedCorrections = [], rejectedReplacements = [], approvedCopyLabels = [];
function curatedReview(row, attributes, brand, category, relative, rowIndex, rowSha256) {
  const product = row.product, id = product.legacy_id;
  const source = row.sources.find(item => item.active) || row.sources[0];
  if (!source) return;
  const table = tableRows(source.raw_payload || {});
  const common = { id, sku: product.sku, title: product.title, brand, category, productMd5: row.product_md5, sourceRowSha256: rowSha256, status: "source-reviewed-requires-root-approval" };
  const savedProof = entry => ({ sourceUrl: source.source_url, sourceRecordId: source.internal_id, backupFile: relative, rowIndex, rawPath: `sources[${row.sources.indexOf(source)}].raw_payload.${entry.rawPath}`, label: entry.label, rawValue: entry.value });
  if (brand === "altep" && /\/(p5|p29)$/.test(source.source_url || "")) {
    const industrial = source.source_url.endsWith("/p29");
    const live = proofCache.get(industrial ? "altep-duo-industrial.html" : "altep-duo-uni-plus.html");
    if (!live) return;
    const nominal = table.find(entry => /номінальна\s*потужність котла/i.test(entry.label));
    const firebox = table.find(entry => normalized(entry.label) === "глубина");
    const overall = table.find(entry => entry.label === "L");
    if (!nominal || !firebox || !overall) return;
    const power = scalar(nominal.value, nominal.label, "kW")?.value;
    const nominalCells = live.tables[0].find(cells => /номінальна\s*потужність котла/i.test(cells[0] || ""));
    const bodyHeader = live.tables[1].find(cells => /габаритні розміри/i.test(cells[0] || ""));
    const column = nominalCells?.findIndex((value, index) => index >= 2 && Number(value) === power);
    assert.ok(column >= 2, `${id}: exact nominal power column is required`);
    assert.equal(Number(bodyHeader[column]), power);
    const liveFirebox = live.tables[0].find(cells => normalized(cells[0]) === "глубина");
    const liveOverall = live.tables[1].find(cells => cells[0] === "L");
    const depth = attributes.get("depthMm");
    assert.equal(scalar(firebox.value, firebox.label, "mm")?.value, Number(liveFirebox[column]));
    assert.equal(scalar(overall.value, overall.label, "mm")?.value, Number(liveOverall[column]));
    if (depth && equal(depth.value_number, Number(liveFirebox[column])) && !equal(depth.value_number, Number(liveOverall[column]))) {
      const drawingName = industrial ? power <= 150 ? "altep-duo-industrial-drawing.jpg" : "altep-duo-200-250-drawing.jpg" : power <= 40 ? "altep-duo-15-40-drawing.jpg" : power <= 62 ? "altep-duo-50-62-drawing.jpg" : "altep-duo-75-drawing.jpg";
      const drawing = proofManifest.find(item => path.basename(item.file || "") === drawingName);
      assert.ok(drawing, `${id}: matching model-range drawing is required`);
      reviewedCorrections.push({ ...common, attribute: "depthMm", action: "replace-numeric-value", oldValue: depth.value_number, proposedValue: Number(liveOverall[column]), unit: "мм", currentAttributeRow: depth, reason: "The saved generic depth is the firebox depth. Manufacturer body-dimension table L and side-elevation drawing prove the overall front-to-back dimension.", proofs: [savedProof(firebox), savedProof(overall)], liveProof: { file: live.file, sha256: live.sha256, at: live.at, sourceUrl: live.url, nominalPowerKw: power, sourceColumnIndex: column, sourceTables: [{ table: 0, group: "Розміри топки", label: "глубина", value: liveFirebox[column] }, { table: 1, group: bodyHeader[0], label: "L", value: liveOverall[column] }], drawing: { ...drawing, visualReview: "L is the outer front-to-back extent on the side elevation; L1 is the smaller body/base extent. All five model-range drawings inspected." } } });
      approvedCopyLabels.push({ ...common, powerKw: power, fireboxDepthMm: depth.value_number, overallDepthMm: Number(liveOverall[column]), oldSourceLabel: firebox.label, approvedLabel: "Глибина топки", allowedPublicFields: ["description", "short_description", "full_description", "description_sections", "seo_title", "seo_description"], exactPairOnly: true, rule: "Qualify only the generic depth label paired with this exact firebox value and mm unit. Keep the firebox number. Do not globally replace it with overall L. Preserve explicit body-L facts.", proof: savedProof(firebox) });
    }
    const dimensions = attributes.get("dimensions");
    if (dimensions && new RegExp(`^${power}\\s*кВт$`, "i").test(dimensions.value_text || "")) {
      reviewedCorrections.push({ ...common, attribute: "dimensions", action: "remove-invalid-typed-attribute", oldValue: dimensions.value_text, proposedValue: null, currentAttributeRow: dimensions, reason: "The dimension-table model/power column heading was imported as a dimension. kW is a power unit, not an equipment size.", liveProof: { file: live.file, sha256: live.sha256, at: live.at, sourceUrl: live.url, table: 1, row: bodyHeader, sourceColumnIndex: column }, publicCopyRule: "Remove only the exact false dimensions-label + power-value pair. Preserve the actual nominal boiler output and all original source evidence." });
    }
  }
  if (brand === "altep" && /^altep-p3(?:-[2-6])?$/.test(id)) {
    const live = proofCache.get("altep-classic-plus.html");
    if (!live) return;
    const power = attributes.get("heatOutputKw")?.value_number;
    const nominal = live.tables[0].find(cells => /номінальна.*потужність котла/i.test(cells[0] || ""));
    const column = nominal.findIndex((value, index) => index >= 2 && Number(value) === power);
    const connection = live.tables[0].find(cells => /приєднувальні розміри димоходу/i.test(cells[0] || ""));
    const recommended = live.tables[0].find(cells => normalized(cells[0]) === "внутрішній діаметр");
    const current = attributes.get("chimneyDiameterMm")?.value_number;
    assert.equal(current, Number(connection[column]));
    rejectedReplacements.push({ ...common, attribute: "chimneyDiameterMm", currentValue: current, rejectedProposedValue: Number(recommended[column]), decision: "retain-current", reason: "Boiler flue connection and recommended chimney internal diameter are distinct manufacturer quantities.", liveProof: { sourceUrl: live.url, file: live.file, sha256: live.sha256, nominalPowerKw: power, sourceColumnIndex: column, connectionValue: connection[column], recommendedInnerValue: recommended[column] } });
  }
  if (["grundfos-529972", "grundfos-99672022"].includes(id)) {
    const nominal = table.find(entry => normalized(entry.label) === "робочий тиск" && /^pn\s*10$/i.test(entry.value));
    const maximum = table.find(entry => normalized(entry.label) === "максимальний робочий тиск");
    assert.ok(nominal && maximum);
    rejectedReplacements.push({ ...common, attribute: "pressureBar", currentValue: attributes.get("pressureBar")?.value_number, rejectedProposedValue: 25, decision: "retain-current-source-context", reason: "The same manufacturer source publishes nominal operating PN10 and maximum pressure 25 bar. There is no evidence that the existing nominal value is incorrect.", proofs: [savedProof(nominal), savedProof(maximum)], externalVerification: "retained original manufacturer table; latest dynamic page not fetched" });
  }
}

const coverage = [], proposals = [], opportunities = [], unverified = [], numericFacts = [], powerRoles = [];
const seen = new Set(), pages = [];
const files = (await fs.readdir(path.join(root, backupDirectory))).filter(name => /^page-\d+\.json$/.test(name)).sort();
for (const file of files) {
  const relative = `${backupDirectory}/${file}`;
  const bytes = await fs.readFile(path.join(root, relative));
  pages.push({ file: relative, sha256: sha(bytes) });
  const page = JSON.parse(bytes.toString("utf8"));
  for (const [rowIndex, encoded] of page.rows.entries()) {
    const rawRow = Buffer.from(encoded.row_base64, "base64");
    const row = JSON.parse(rawRow.toString("utf8"));
    const product = row.product, id = product.legacy_id;
    if (!originals.has(id)) continue;
    if (seen.has(id)) throw new Error(`Repeated baseline identity ${id}`);
    seen.add(id);
    const brand = brands.get(product.brand_id) || originals.get(id).brand;
    const category = categories.get(product.primary_category_id) || originals.get(id).category;
    const attributes = new Map(row.attributes.map(attribute => [definitions.get(attribute.attribute_id)?.stable_id || attribute.attribute_id, attribute]));
    const facts = [], issues = [];
    let originalTableRows = 0, officialSource = false;
    for (const [sourceIndex, source] of row.sources.entries()) {
      const raw = source.raw_payload || {};
      const url = sourceUrl(source, raw);
      const authority = official(brand, url);
      const table = tableRows(raw);
      originalTableRows += table.length;
      officialSource ||= authority;
      for (const tableRow of table) {
        const proof = { sourceUrl: url, officialDomain: authority, sourceRecordId: source.internal_id, backupFile: relative, rowIndex, rawPath: `sources[${sourceIndex}].raw_payload.${tableRow.rawPath}`, label: tableRow.label, rawValue: tableRow.value };
        for (const target of targets(tableRow.label)) {
          if (brand === "altep" && target.attribute === "depthMm") { issues.push({ reason: "Flattened boiler depth requires group context: firebox depth is not overall equipment depth", attribute: "depthMm", proof }); continue; }
          const parsed = scalar(tableRow.value, tableRow.label, target.unit);
          if (!parsed) { issues.push({ reason: "source value is not an unambiguous scalar with a confirmed unit", attribute: target.attribute, proof }); continue; }
          facts.push({ attribute: target.attribute, value: parsed.value, canonicalUnit: target.unit, reason: target.reason, proof });
        }
        // Explicitly preserve review-only P2 and ambiguous boiler/chimney context; features are never proof.
        if (/[рp]\s*2\b/i.test(tableRow.label)) {
          const parsed = scalar(tableRow.value, tableRow.label, "kW");
          const current = attributes.get("powerKw")?.value_number ?? null;
          powerRoles.push({ id, sku: product.sku, brand, currentPowerKw: current, sourceP2Kw: parsed?.value ?? null, typedMatchesP2: parsed && current !== null ? equal(current, parsed.value) : null, proof });
          if (parsed && current !== null && !equal(current, parsed.value)) issues.push({ reason: "generic powerKw differs from explicit P2; do not overwrite it with P1/P2 without resolving field semantics", attribute: "powerKw", current, sourceP2Kw: parsed.value, proof });
        }
        if (/[рp]\s*1\b/i.test(tableRow.label) && /кількість|количеств|number of pumps|×/.test(tableRow.label)) issues.push({ reason: "P1 source is qualified by impeller/pump-count context; aggregate consumption requires model-level review", attribute: "consumptionPowerW", current: attributes.get("consumptionPowerW")?.value_number ?? null, proof });
        if (/(висот|высот|height)/i.test(tableRow.label) && !targets(tableRow.label).some(target => ["heightMm", "chimneyHeightM", "headM"].includes(target.attribute))) issues.push({ reason: "qualified height may refer to chimney/installation/another product; do not map to body heightMm", attribute: "heightMm", current: attributes.get("heightMm")?.value_number ?? null, proof });
        if (/(димох|дымоход|chimney)/i.test(tableRow.label) && /рекоменд|внутріш|внутрен|recommended|internal/i.test(tableRow.label) && /діаметр|диаметр|diameter/i.test(tableRow.label)) issues.push({ reason: "recommended chimney internal diameter is a different quantity from the boiler flue connection; do not replace existing connection diameter", attribute: "chimneyDiameterMm", current: attributes.get("chimneyDiameterMm")?.value_number ?? null, proof });
      }
    }
    const grouped = Map.groupBy(facts, fact => fact.attribute);
    let supported = 0, proposed = 0;
    for (const [attribute, candidates] of grouped) {
      const values = candidates.reduce((all, candidate) => { if (!all.some(value => equal(value, candidate.value))) all.push(candidate.value); return all; }, []);
      const current = attributes.get(attribute);
      numericFacts.push({ id, sku: product.sku, brand, attribute, current: current?.value_number ?? null, candidates });
      if (values.length !== 1) {
        issues.push({ reason: "multiple original table values disagree for this generic target; preserve context rather than selecting one", attribute, current: current?.value_number ?? null, candidates });
        continue;
      }
      if (!candidates.some(candidate => candidate.proof.officialDomain)) {
        issues.push({ reason: "source URL is absent or not a confirmed manufacturer domain", attribute, current: current?.value_number ?? null, candidates });
        continue;
      }
      if (current && equal(current.value_number, values[0])) { supported++; continue; }
      const proposal = { id, sku: product.sku, title: product.title, brand, category, attribute, action: current ? "replace-numeric-value" : "add-numeric-attribute", oldValue: current?.value_number ?? null, proposedValue: values[0], unit: definitionsById.get(attribute)?.unit || candidates[0].canonicalUnit, reason: candidates[0].reason, proofs: candidates.filter(candidate => candidate.proof.officialDomain).map(candidate => candidate.proof), currentAttributeRow: current || null, productMd5: row.product_md5, sourceRowSha256: sha(rawRow), status: current ? "proposal-only-requires-review" : "optional-enrichment-not-requested" };
      (current ? proposals : opportunities).push(proposal);
      proposed++;
    }
    if (!originalTableRows) issues.push({ reason: "no original technicalDetails/attributes table in saved source; normalized features are not independent evidence" });
    curatedReview(row, attributes, brand, category, relative, rowIndex, sha(rawRow));
    if (!officialSource) issues.push({ reason: "manufacturer authority not established by the saved source URL; no external verification performed yet" });
    if (issues.length) unverified.push({ id, sku: product.sku, title: product.title, brand, category, issues });
    coverage.push({ id, sku: product.sku, brand, category, backupFile: relative, rowIndex, sourceRowSha256: sha(rawRow), sourceRecords: row.sources.length, originalTableRows, officialSource, typedAttributeRows: row.attributes.length, recognizedNumericFacts: facts.length, matchedCurrentAttributes: supported, proposedAttributes: proposed, unverifiedItems: issues.length });
  }
}
const missing = [...originals.keys()].filter(id => !seen.has(id));
if (missing.length) throw new Error(`Baseline coverage is incomplete: ${missing.length} missing identities.`);
const countBy = (items, key) => Object.fromEntries([...Map.groupBy(items, item => item[key])].map(([value, rows]) => [value, rows.length]));
const tekkProof = proofCache.get("tekk-1000124.html");
const tekk = proposals.find(item => item.id === "tekkhaus-1000124" && item.attribute === "flowM3h");
if (tekk && tekkProof) {
  const text = cleanCell(tekkProof.html);
  assert.match(text, /1000124/);
  assert.match(text, /SDF 2\.5-18/);
  assert.match(text, /25000\s*l\/h/);
  tekk.status = "source-reviewed-requires-root-approval";
  tekk.liveProof = { file: tekkProof.file, sha256: tekkProof.sha256, sourceUrl: tekkProof.url, at: tekkProof.at, exactSku: "1000124", exactModel: "SDF 2.5-18", quantity: "25000 l/h", conversion: "25000 / 1000 = 25 m³/h", publicCopyRule: "Change only statements actually labelled m³/h or м³/год from 25000 to 25. Keep original 25000 l/h source rows unchanged. Never globally replace the number." };
}
proposals.push(...reviewedCorrections);
const summary = { status: "offline-source-review-complete-proposals-not-applied", at: new Date().toISOString(), reference: referenceFile, referenceSha256: sha(referenceBytes), backupDirectory, backupPages: pages.length, expectedBaselineIdentities: originals.size, covered: coverage.length, missing, brands: countBy(coverage, "brand"), productsWithOriginalTables: coverage.filter(item => item.originalTableRows).length, productsWithRecognizedNumericFacts: coverage.filter(item => item.recognizedNumericFacts).length, productsWithOfficialSourceUrl: coverage.filter(item => item.officialSource).length, matchingTypedAttributes: coverage.reduce((sum, item) => sum + item.matchedCurrentAttributes, 0), proposalCount: proposals.length, proposedProducts: new Set(proposals.map(item => item.id)).size, proposedFields: countBy(proposals, "attribute"), proposedActions: countBy(proposals, "action"), enrichmentOpportunities: opportunities.length, enrichmentPolicy: "Missing typed attributes remain optional gaps, not incorrect facts; no bulk enrichment SQL is produced.", unverifiedProducts: unverified.length, sourcePolicy: "Original saved source table rows only. raw_payload.features are not independent proof. Ranges, context-qualified body heights, gross weights, ambiguous duplicate facts and unconfirmed source domains are not auto-selected. P1 consumption is separate from P2 motor output. Nominal PN and maximum pressure remain distinct; recommended internal chimney and boiler connection diameters remain distinct.", hostedWrites: 0, externalVerification: "not yet performed; candidates require source spot checks and root review", pages };
await fs.mkdir(output, { recursive: true });
summary.externalVerification = { liveSourceFiles: proofCache.size, sourceManifest: "imports/overnight-audit/base-review/sources/manifest.json", reviewedCorrectionFields: proposals.filter(item => item.status === "source-reviewed-requires-root-approval").length, rejectedInitialReplacements: rejectedReplacements.length, allEightInitialCandidatesReviewed: rejectedReplacements.length === 8 };
const p1Facts = new Map(numericFacts.filter(item => item.attribute === "consumptionPowerW").map(item => [item.id, item]));
const powerSummary = { rows: powerRoles.length, typedMatchesP2: powerRoles.filter(item => item.typedMatchesP2 === true).length, typedDiffersP2: powerRoles.filter(item => item.typedMatchesP2 === false).length, differingButMatchesSourceP1: powerRoles.filter(item => item.typedMatchesP2 === false && p1Facts.get(item.id)?.candidates.some(fact => equal(fact.value / 1000, item.currentPowerKw))).length, decision: "Do not overwrite generic powerKw with P1/P2. The frontend labels generic power and consumption separately; original role-labelled table rows remain authoritative. Role consistency is a separate model/label improvement, not a proven numeric correction." };
for (const [name, value] of Object.entries({ summary, coverage, proposals, "reviewed-corrections": proposals.filter(item => item.status === "source-reviewed-requires-root-approval"), "rejected-replacements": rejectedReplacements, "approved-copy-labels": approvedCopyLabels, "enrichment-opportunities": opportunities, unverified, "numeric-facts": numericFacts, "power-roles": powerRoles, "power-review-summary": powerSummary })) await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify(value, null, 2) + "\n");
console.log(JSON.stringify({ covered: coverage.length, expected: originals.size, proposals: proposals.length, proposedProducts: summary.proposedProducts, fields: summary.proposedFields, unverifiedProducts: unverified.length, output: path.relative(root, output).replaceAll("\\", "/"), hostedWrites: 0 }));
