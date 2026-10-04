// Product import check (docs/product-import-standard.md).
// Checks an import batch against the rules and the current catalogue, then writes next to the batch:
//   <batch>.report.md  what is new, what already exists, errors and warnings;
//   <batch>.sql        one transaction that adds only the new error-free products as drafts;
//   <batch>.prices.csv price differences for existing products (for Admin → Products → Price import).
// Usage: node scripts/import-check.mjs imports/<batch>.json --reference=imports/reference-prod.json [--check-links]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const batchPath = args.find(arg => !arg.startsWith("--"));
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const referencePath = option("reference") || "imports/reference-prod.json";
const checkLinks = args.includes("--check-links");
if (!batchPath) {
  console.error("Usage: node scripts/import-check.mjs imports/<batch>.json --reference=imports/reference-prod.json [--check-links]");
  process.exit(2);
}

const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
const reference = JSON.parse(fs.readFileSync(referencePath, "utf8"));
const outBase = batchPath.replace(/\.json$/, "");

// ---------- Rules ----------
const FOREIGN_LETTERS = /[ыэъёЫЭЪЁąćęłńśźżĄĆĘŁŃŚŹŻ]/u;
const RUSSIAN_WORDS = /(?<!\p{L})(что|который|которая|которые|также|если|только|можно|нужно|работы|после|и)(?!\p{L})/iu;
const UNITS = new Set(["kw", "kwt", "w", "mm", "bar", "rpm", "ip", "v", "hz", "pn", "dn", "led", "lcd", "wifi", "wi-fi", "inox", "pro", "plus", "max", "mini", "eco", "smart", "auto"]);
const LOGISTICS_LABELS = /штрих|\bean\b|упаков|палет|брутто|артикул|офіційна назва|категорія виробника|країна реєстрації бренду/i;
const SHOP_TEXT = /оплата частинами|доставк|\+?38\s?\(?0\d{2}|(?:https?:\/\/|www\.)\S+/i;
const SEO_SUFFIX = " — купити в ТД «Софіївка»";
// Rules from the 2026-10-05 catalogue cleanup (AUD-032/033/035/037, AUD-050/052): what was fixed on PROD by SQL
// must not come back with the next import.
const SERVICE_LABELS = /^(qt|ean номер|посилання на групу товарів|вартість системи|схема (?:електричного )?підключення|розрахунок числа|об['’]єм пакування|код модельного ряду двигунів|№ структурного файла|fiktiv frekvens|сфера продажів|зображення продукту|main pump pn)$/i;
const RAW_KEY = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;
const CODE_LABEL = /модел|сері|символ|верс|позначенн|артикул|код|стандарт|протокол|назва|найменування/i;
const SERVICE_TEXT = /артикул виробника|офіційна назва|категорія виробника|(?<![\p{L}])(?:qT|eAN номер):/iu;
const CASE_GLITCH = /(?<![\p{L}\d])[a-z][A-Z]{2,}(?![\p{L}\d])/u;
const CASE_ALLOWED = new Set(["iOS", "iPWM", "iPad", "iPhone"]);
const LOOKALIKES = "АВСЕНІКМОРТХаеорсіх";
const UNIT_NAMES = { kW: "кВт", W: "Вт", V: "В", Hz: "Гц", GHz: "ГГц", bar: "бар", mm: "мм", m: "м", kg: "кг", "µF": "мкФ", uF: "мкФ" };
const MEASURE = /^([<>≤≥~±]?\s?\d+(?:[.,]\d+)?(?:\s?[-–…÷]\s?\d+(?:[.,]\d+)?)?)\s?(kW|W|V|Hz|GHz|bar|mm|m|kg|µF|uF|[А-Яа-яІіЇїЄєҐґ°³²/%]+)?$/u;

// Spelling that is safe in any value, then units of values that are only numbers with units («1.5 kW» → «1,5 кВт»).
function normalizeValue(label, value) {
  let text = value
    .replace(/°\s?С/g, "°C")
    .replace(/дм ?3(?!\d)/g, "дм³")
    .replace(/м ?3 ?\/ ?(?:год|час)/g, "м³/год")
    .replace(/[mм][3³] ?\/ ?h/gi, "м³/год")
    .replace(/(\d) ?l\/min/g, "$1 л/хв")
    .replace(/(\d) ?l\/h/g, "$1 л/год");
  if (CODE_LABEL.test(label)) return text;
  const parts = text.split(/(\s?[\/;]\s?)/);
  const converted = parts.map((part, index) => {
    if (index % 2) return part;
    const match = part.trim().match(MEASURE);
    if (!match) return null;
    const unit = match[2] ? UNIT_NAMES[match[2]] || match[2] : "";
    return `${match[1].replace(/(\d)\.(\d)/g, "$1,$2")}${unit ? ` ${unit}` : ""}`;
  });
  return converted.includes(null) || !/[A-Za-zµ.]/.test(text) ? text : converted.join("");
}

// «CE,EAC,UKCA» → «CE,UKCA»; «CE / VDE / EAC» → «CE / VDE»; «EAC-UPA» → «» (the row is dropped).
const withoutEac = value => value
  .replace(/(^|,|;\s|\s\/\s)EAC(?:-[A-Za-z]+)?(?=,|;\s|\s\/\s|$)/g, "")
  .replace(/^(?:,|;\s|\s\/\s)/, "")
  .trim();

// Codes written in Latin letters must not hide a Cyrillic look-alike («F.FBnА10», «TJ-MU-40А»).
function checkCodes(item, problems) {
  for (const [field, value] of [["артикул", item.sku], ["модель", item.model], ["назва", item.title]]) {
    for (const token of norm(value).split(/\s+/)) {
      if (!/[A-Za-z]/.test(token)) continue;
      if (!new RegExp(`^[A-Za-z\\d\\p{P}\\p{S}${LOOKALIKES}]+$`, "u").test(token)) continue;
      const letter = token.match(new RegExp(`[${LOOKALIKES}]`, "u"));
      if (letter) problems.errors.push(`${field}: кирилична літера «${letter[0]}» у латинському коді «${token}»`);
    }
  }
}

const norm = value => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = value => norm(value).toLocaleLowerCase("uk");
const escapeMd = value => norm(value).replace(/\|/g, "\\|");

const brands = new Map((reference.brands || []).map(brand => [brand.id, brand]));
const categories = new Map((reference.categories || []).map(category => [category.id, category]));
const attributes = reference.attributes || {};
const existingBySku = new Map();
const existingBySource = new Map();
const publishedTitles = new Map();
for (const product of reference.products || []) {
  existingBySku.set(lower(product.sku), product);
  for (const source of product.sources || []) existingBySource.set(source, product);
  existingBySource.set(`${batch.supplier}:${product.id}`, product);
  if (product.status === "published") publishedTitles.set(lower(product.title), product);
}

function textProblems(field, value, problems) {
  if (!value) return;
  if (FOREIGN_LETTERS.test(value)) problems.errors.push(`${field}: російські або польські літери («${value.match(FOREIGN_LETTERS)[0]}»)`);
  else if (RUSSIAN_WORDS.test(value)) problems.errors.push(`${field}: схоже на російське слово («${value.match(RUSSIAN_WORDS)[0]}»)`);
}

function checkTitle(item, brand, problems) {
  const title = norm(item.title);
  if (!title) { problems.errors.push("немає назви"); return; }
  textProblems("назва", title, problems);
  if (!/^\p{Script=Cyrillic}/u.test(title)) problems.errors.push("назва не починається з типу товару");
  if (brand) {
    const brandName = lower(brand.name);
    const occurrences = lower(title).split(brandName).length - 1;
    if (occurrences === 0) problems.warnings.push("у назві немає бренду");
    if (occurrences > 1) problems.errors.push("бренд у назві двічі");
  }
  const allowed = new Set([...lower(brand?.name).split(/[^\p{L}\p{N}-]+/u), ...lower(item.model).split(/[^\p{L}\p{N}-]+/u)].filter(Boolean));
  const latinWords = (title.match(/(?<![\p{L}\d])[A-Za-z]{3,}(?![\p{L}\d])/gu) || []).filter(word => !allowed.has(word.toLowerCase()) && !UNITS.has(word.toLowerCase()));
  if (latinWords.length) problems.warnings.push(`англійські слова в назві: ${[...new Set(latinWords)].join(", ")}`);
  if (/[,;:\-–]\s*$/.test(title) || /\s{2,}/.test(item.title)) problems.errors.push("технічне сміття в кінці назви або подвійні пробіли");
  if (title.length > 120) problems.warnings.push(`довга назва (${title.length} знаків)`);
}

function checkDescriptions(item, problems) {
  const description = norm(item.description);
  const short = norm(item.shortDescription);
  textProblems("опис", item.description, problems);
  textProblems("короткий опис", item.shortDescription, problems);
  for (const section of item.sections || []) {
    textProblems(`розділ «${section.title}»`, `${section.title || ""} ${(section.paragraphs || []).join(" ")}`, problems);
  }
  if (!description) problems.warnings.push("немає опису");
  else if (description.length < 120) problems.warnings.push("дуже короткий опис");
  if (short.length > 300) problems.warnings.push(`короткий опис довший за 300 знаків (${short.length})`);
  if (SHOP_TEXT.test(`${description} ${short}`)) problems.warnings.push(`в описі текст магазину або посилання («${`${description} ${short}`.match(SHOP_TEXT)[0]}»)`);
  if (description && !lower(description).startsWith(lower(item.title).slice(0, 20))) problems.warnings.push("опис не починається з назви товару");
  const texts = [item.description, item.shortDescription, ...(item.sections || []).flatMap(section => section.paragraphs || [])].map(norm).join(" ");
  if (SERVICE_TEXT.test(texts)) problems.errors.push(`службовий текст постачальника в описі («${texts.match(SERVICE_TEXT)[0]}»)`);
  const glitch = (texts.match(new RegExp(CASE_GLITCH.source, "gu")) || []).find(word => !CASE_ALLOWED.has(word));
  if (glitch) problems.warnings.push(`зламаний регістр в описі («${glitch}»)`);
  if (/(?<![A-Za-z])EAC(?![A-Za-z])/.test(texts)) problems.warnings.push("маркування EAC в описі");
}

function seoFor(item, characteristics) {
  const title = norm(item.title);
  const seoTitle = norm(item.seoTitle) || ((title + SEO_SUFFIX).length <= 70 ? title + SEO_SUFFIX : title);
  let seoDescription = norm(item.seoDescription);
  if (!seoDescription) {
    const facts = characteristics.slice(0, 2).map(row => `${lower(row.label)} ${row.value}`);
    seoDescription = `${title}${facts.length ? `: ${facts.join(", ")}` : ""}. Офіційна продукція, характеристики й документи виробника.`;
    if (seoDescription.length > 160) seoDescription = `${seoDescription.slice(0, 157).replace(/\s+\S*$/, "")}…`;
  }
  return { seoTitle, seoDescription, generated: !item.seoTitle || !item.seoDescription };
}

function cleanCharacteristics(item, problems) {
  const seen = new Set();
  let dropped = 0;
  const rows = [];
  let merged = 0;
  for (const row of item.characteristics || []) {
    const label = norm(row.label);
    let value = norm(`${row.value ?? ""}${row.unit ? ` ${row.unit}` : ""}`);
    if (/(?<![A-Za-z])EAC(?![A-Za-z])/.test(value)) value = withoutEac(value);
    value = normalizeValue(label, value);
    const key = `${lower(label)}\u0000${lower(value)}`;
    if (!label || !value || LOGISTICS_LABELS.test(label) || SERVICE_LABELS.test(label) || RAW_KEY.test(value)
        || (lower(label) === "параметр" && lower(value) === "значення") || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    textProblems(`характеристика «${label}»`, `${label} ${value}`, problems);
    if (/^[A-Za-z][A-Za-z .()[\]/-]+$/.test(label) && /[A-Za-z]{4,}/.test(label)) problems.warnings.push(`англійська назва характеристики «${label}»`);
    // One label = one row on the product page: values of a repeated label are joined with «; ».
    const same = rows.find(other => lower(other.label) === lower(label));
    if (same) {
      merged += 1;
      if (lower(value).startsWith(lower(same.value))) same.value = value;
      else if (!lower(same.value).startsWith(lower(value))) same.value = `${same.value}; ${value}`;
      continue;
    }
    rows.push({ label, value });
  }
  if (dropped) problems.notes.push(`прибрано ${dropped} службових або повторених характеристик`);
  if (merged) problems.warnings.push(`${merged} характеристик з однаковою назвою зведено в один рядок — перевірте значення`);
  if (!rows.length) problems.warnings.push("немає характеристик");
  return rows;
}

function cleanFilters(item, category, problems) {
  const result = {};
  for (const [id, raw] of Object.entries(item.filters || {})) {
    if (raw === null || raw === undefined || raw === "") continue;
    const definition = attributes[id];
    if (!definition) { problems.warnings.push(`фільтр ${id} не існує, пропущено`); continue; }
    if (category && !(category.facets || []).includes(id)) continue;
    if (definition.type === "number") {
      const value = Number(raw);
      if (Number.isFinite(value)) result[id] = value; else problems.warnings.push(`фільтр «${definition.label}»: не число «${raw}», пропущено`);
    } else if (definition.type === "boolean") {
      result[id] = Boolean(raw);
    } else {
      const value = norm(raw);
      const known = (definition.values || []).find(option => lower(option) === lower(value));
      if (known) result[id] = known;
      else problems.warnings.push(`нове значення фільтра «${definition.label}»: «${value}», пропущено`);
    }
  }
  return result;
}

async function linkWorks(url) {
  try {
    const response = await fetch(url, { method: "GET", headers: { range: "bytes=0-1023" }, redirect: "follow" });
    const type = response.headers.get("content-type") || "";
    return response.ok && (/pdf|octet-stream/i.test(type) || /\.pdf(?:$|\?)/i.test(url));
  } catch { return false; }
}

// A real photo is never under 1 KB (the 8×8 Grundfos placeholders were 46 bytes). A Git LFS pointer of a
// checkout without LFS files is not an empty photo.
function isEmptyImage(file) {
  if (fs.statSync(file).size >= 1024) return false;
  return !fs.readFileSync(file, "utf8").startsWith("version https://git-lfs.github.com/spec/");
}

async function checkMedia(item, problems) {
  const images = (item.images || []).map(norm).filter(Boolean);
  if (!images.length) problems.errors.push("немає фото");
  for (const image of images) {
    if (/^https?:/i.test(image)) problems.errors.push(`фото з чужого сайту: ${image}`);
    else if (!fs.existsSync(path.join(ROOT, image.replace(/^\//, "")))) problems.errors.push(`немає файлу фото: ${image}`);
    else if (isEmptyImage(path.join(ROOT, image.replace(/^\//, "")))) problems.errors.push(`порожній файл фото (менше 1 КБ): ${image}`);
    else if (!/\.webp$/i.test(image)) problems.warnings.push(`фото не WebP: ${image}`);
  }
  const documents = [];
  for (const document of item.documents || []) {
    const url = norm(document.url);
    if (!url) continue;
    if (!/^https?:/i.test(url)) {
      if (!fs.existsSync(path.join(ROOT, url.replace(/^\//, "")))) { problems.errors.push(`немає файлу документа: ${url}`); continue; }
    } else if (checkLinks && !(await linkWorks(url))) { problems.warnings.push(`документ не відкривається, пропущено: ${url}`); continue; }
    if (!/^\p{Script=Cyrillic}/u.test(norm(document.title))) problems.warnings.push(`назва документа не українською: ${document.title}`);
    documents.push({ title: norm(document.title) || "Документ", type: document.type || "other", url: /^https?:/i.test(url) ? url : `/${url.replace(/^\//, "")}` });
  }
  if (!documents.length) problems.warnings.push("немає документів");
  if (documents.length && !checkLinks && documents.some(document => /^https?:/i.test(document.url))) problems.notes.push("посилання на документи не перевірялись (--check-links)");
  return { images: images.filter(image => !/^https?:/i.test(image)).map(image => `/${image.replace(/^\//, "")}`), documents };
}

// ---------- Check every product ----------
const results = [];
const batchSkus = new Map();
const batchTitles = new Map();
for (const item of batch.products || []) {
  batchSkus.set(lower(item.sku), (batchSkus.get(lower(item.sku)) || 0) + 1);
  batchTitles.set(lower(item.title), (batchTitles.get(lower(item.title)) || 0) + 1);
}

for (const item of batch.products || []) {
  const problems = { errors: [], warnings: [], notes: [] };
  const existing = existingBySku.get(lower(item.sku)) || existingBySource.get(`${batch.supplier}:${item.sourceId}`);
  const brand = brands.get(item.brand);
  const category = categories.get(item.category);
  if (!norm(item.sku)) problems.errors.push("немає артикула");
  if (!norm(item.model)) problems.errors.push("немає моделі");
  if (!norm(item.sourceId)) problems.errors.push("немає ідентифікатора джерела");
  if (batchSkus.get(lower(item.sku)) > 1) problems.errors.push("артикул повторюється в партії");
  if (!brand) problems.errors.push(`бренду «${item.brand}» немає в каталозі`);
  else if (brand.status && brand.status !== "active") problems.errors.push(`бренд «${brand.name}» неактивний`);
  if (!category) problems.errors.push(`немає категорії «${item.category || item.sourceCategory || "—"}»`);
  else if (category.status !== "active" || !category.leaf || category.visibility !== "catalog") problems.errors.push(`категорія «${category.title}» не кінцева або неактивна`);
  checkTitle(item, brand, problems);
  checkCodes(item, problems);
  if (batchTitles.get(lower(item.title)) > 1) problems.errors.push("назва повторюється в партії");
  const titleOwner = publishedTitles.get(lower(item.title));
  if (!existing && titleOwner) problems.errors.push(`така назва вже є в каталозі (артикул ${titleOwner.sku})`);
  checkDescriptions(item, problems);
  const characteristics = cleanCharacteristics(item, problems);
  const filters = cleanFilters(item, category, problems);
  const media = await checkMedia(item, problems);
  let price = item.price === null || item.price === undefined || item.price === "" ? null : Number(item.price);
  if (price !== null && !(price > 0)) { problems.warnings.push(`неправильна ціна «${item.price}», буде без ціни`); price = null; }
  if (price !== null && !Number.isInteger(price)) { problems.notes.push(`ціну округлено ${price} → ${Math.round(price)}`); price = Math.round(price); }
  if (price === null) problems.warnings.push("без ціни (на сайті «Ціну уточнюйте»)");
  const seo = seoFor(item, characteristics);
  if (seo.generated) problems.notes.push("SEO-поля заповнено за шаблоном");
  for (const kind of ["errors", "warnings", "notes"]) problems[kind] = [...new Set(problems[kind])];
  results.push({ item, existing, brand, category, problems, characteristics, filters, media, price, seo });
}

const fresh = results.filter(result => !result.existing);
const ready = fresh.filter(result => !result.problems.errors.length);
const blocked = fresh.filter(result => result.problems.errors.length);
const existing = results.filter(result => result.existing);
const priceChanges = existing.filter(result => result.price !== null && Number(result.existing.amount || 0) !== result.price);

// ---------- SQL ----------
function sqlFor(rows) {
  const payload = rows.map(({ item, characteristics, filters, media, price, seo }) => ({
    legacyId: `${batch.supplier}-${norm(item.sourceId).replace(new RegExp(`^${batch.supplier}-`), "")}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-"),
    sourceId: norm(item.sourceId),
    sourceUrl: norm(item.sourceUrl),
    sourceCategory: norm(item.sourceCategory || item.category),
    sku: norm(item.sku),
    model: norm(item.model),
    title: norm(item.title),
    brand: item.brand,
    category: item.category,
    amount: price,
    shortDescription: norm(item.shortDescription),
    description: norm(item.shortDescription) || norm(item.description).slice(0, 300),
    fullDescription: String(item.description || "").trim(),
    sections: item.sections || [],
    seoTitle: seo.seoTitle,
    seoDescription: seo.seoDescription,
    characteristics,
    filters,
    images: media.images,
    documents: media.documents
  }));
  const json = JSON.stringify(payload);
  if (/\$sofimport/.test(JSON.stringify(batch))) throw new Error("Batch text contains the SQL quote tag");
  return `-- Product import: ${path.basename(batchPath)} (${payload.length} new products as drafts).
-- Generated by scripts/import-check.mjs; see ${path.basename(outBase)}.report.md. Existing products are never changed.
begin;

do $sofimport_do$
declare
  item jsonb;
  supplier_value uuid;
  run_value uuid;
  product_value uuid;
  slug_value text;
  added uuid[] := '{}';
  skipped integer := 0;
  filter_key text;
  attribute_row record;
  option_value uuid;
  position_value integer;
begin
  insert into public.suppliers (stable_id, name, website_url)
  values (${JSON.stringify(batch.supplier).replace(/"/g, "'")}, $sofimport$${batch.supplierName || batch.supplier}$sofimport$, $sofimport$${batch.sourceSite || ""}$sofimport$)
  on conflict (stable_id) do nothing;
  select internal_id into supplier_value from public.suppliers where stable_id = ${JSON.stringify(batch.supplier).replace(/"/g, "'")};

  insert into public.import_runs (supplier_id, status, source_ref, started_at, records_seen, metadata)
  values (supplier_value, 'running', $sofimport$${path.basename(batchPath)}$sofimport$, now(), ${payload.length},
    jsonb_build_object('standard', 'docs/product-import-standard.md', 'collectedAt', $sofimport$${batch.collectedAt || ""}$sofimport$))
  returning internal_id into run_value;

  for item in select value from jsonb_array_elements($sofimport$${json}$sofimport$::jsonb) loop
    if exists (select 1 from public.products where legacy_id = item ->> 'legacyId' or lower(sku) = lower(item ->> 'sku')) then
      skipped := skipped + 1;
      continue;
    end if;

    slug_value := public._catalog_slugify(item ->> 'title');
    if exists (select 1 from public.products where lower(slug) = slug_value) then
      slug_value := slug_value || '-' || public._catalog_slugify(item ->> 'sku');
    end if;
    if exists (select 1 from public.products where lower(slug) = slug_value) then
      slug_value := slug_value || '-' || public._catalog_slugify(item ->> 'legacyId');
    end if;

    insert into public.products (
      legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
      amount, price_status, inventory_status, publication_status,
      description, short_description, full_description, description_sections,
      seo_title, seo_description, last_import_run_id, last_imported_at
    ) values (
      item ->> 'legacyId', item ->> 'sku', slug_value, item ->> 'title', item ->> 'title', item ->> 'model',
      (select internal_id from public.brands where stable_id = item ->> 'brand'),
      (select internal_id from public.categories where stable_id = item ->> 'category'),
      (item ->> 'amount')::numeric, case when item ->> 'amount' is null then 'unknown' else 'known' end::public.product_price_status,
      'unknown', 'draft',
      item ->> 'description', item ->> 'shortDescription', item ->> 'fullDescription', item -> 'sections',
      item ->> 'seoTitle', item ->> 'seoDescription', run_value, now()
    ) returning internal_id into product_value;

    insert into public.product_media (product_id, media_type, role, url, alt_text, sort_order)
    select product_value, 'image', case when image.ordinality = 1 then 'primary' else 'gallery' end::public.media_role,
      image.value, item ->> 'title', image.ordinality::integer - 1
    from jsonb_array_elements_text(item -> 'images') with ordinality image;

    insert into public.product_documents (product_id, title, document_type, url, source_url, sort_order)
    select product_value, document.value ->> 'title',
      case when document.value ->> 'type' in ('manual', 'datasheet', 'certificate', 'instruction') then document.value ->> 'type' else 'other' end::public.document_type,
      document.value ->> 'url', case when document.value ->> 'url' like 'http%' then document.value ->> 'url' end,
      document.ordinality::integer - 1
    from jsonb_array_elements(item -> 'documents') with ordinality document;

    for filter_key in select jsonb_object_keys(item -> 'filters') loop
      select internal_id, value_type into attribute_row from public.attribute_definitions where stable_id = filter_key and status = 'active';
      continue when attribute_row.internal_id is null;
      option_value := null;
      if attribute_row.value_type = 'select' then
        select internal_id into option_value from public.attribute_options
        where attribute_id = attribute_row.internal_id and active and lower(value) = lower(item -> 'filters' ->> filter_key) limit 1;
      end if;
      insert into public.product_attribute_values (
        product_id, attribute_id, value_number, value_text, value_boolean, option_id, provenance, normalization_rule
      ) values (
        product_value, attribute_row.internal_id,
        case when attribute_row.value_type = 'number' then (item -> 'filters' ->> filter_key)::numeric end,
        case when attribute_row.value_type in ('string', 'select') and option_value is null then item -> 'filters' ->> filter_key end,
        case when attribute_row.value_type = 'boolean' then (item -> 'filters' ->> filter_key)::boolean end,
        option_value, 'source-confirmed', 'import-standard-v1'
      );
    end loop;

    insert into public.product_source_records (product_id, supplier_id, source_id, source_category, source_url, mapping_status, raw_payload, import_run_id)
    values (product_value, supplier_value, item ->> 'sourceId', item ->> 'sourceCategory', nullif(item ->> 'sourceUrl', ''), 'mapped',
      jsonb_build_object('characteristics', item -> 'characteristics'), run_value);

    added := added || product_value;
  end loop;

  if cardinality(added) > 0 then
    perform public._admin_refresh_catalog(added);
    -- Supplier characteristics are shown on the product page from the snapshot payload; later refreshes keep them.
    update public.catalog_product_snapshots snapshot
    set payload = snapshot.payload || jsonb_build_object(
        'source', jsonb_build_object('supplier', ${JSON.stringify(batch.supplier).replace(/"/g, "'")}, 'sourceId', item_row.value ->> 'sourceId',
          'sourceCategory', item_row.value ->> 'sourceCategory', 'mappingStatus', 'mapped'),
        'sourceAttributes', item_row.value -> 'characteristics',
        'unmappedAttributes', item_row.value -> 'characteristics'),
      updated_at = now()
    from jsonb_array_elements($sofimport$${json}$sofimport$::jsonb) item_row
    where snapshot.legacy_id = item_row.value ->> 'legacyId'
      and snapshot.snapshot_version = (select snapshot_version from public.catalog_snapshot_pointer where singleton)
      and exists (select 1 from public.products product where product.legacy_id = snapshot.legacy_id and product.internal_id = any(added));
  end if;

  update public.import_runs
  set status = 'succeeded', finished_at = now(), records_succeeded = cardinality(added),
    metadata = metadata || jsonb_build_object('skippedExisting', skipped)
  where internal_id = run_value;
  raise notice 'Imported % new draft products, skipped % existing', cardinality(added), skipped;
end;
$sofimport_do$;

commit;
`;
}

// ---------- Report ----------
const list = (items, limit = 6) => items.slice(0, limit).join("; ") + (items.length > limit ? `; ще ${items.length - limit}` : "");
const table = (headers, rows) => rows.length ? [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${row.map(escapeMd).join(" | ")} |`)].join("\n") : "Немає.";
const errorCounts = {};
for (const result of blocked) for (const error of result.problems.errors) {
  const key = error.replace(/\s*«[^»]*»/g, "").replace(/\s*\(.*?\)/g, "").replace(/: .*/, m => m.includes("«") ? "" : m).trim();
  errorCounts[key] = (errorCounts[key] || 0) + 1;
}

const report = `# Перевірка імпорту: ${path.basename(batchPath)}

Постачальник: ${batch.supplierName || batch.supplier}. Зібрано: ${batch.collectedAt || "—"}.
Порівняно з каталогом: ${reference.source === "prod" ? "робоча база (PROD)" : "файлами репозиторію (не з робочою базою: назви й ціни можуть бути старі)"}, ${reference.exportedAt?.slice(0, 16).replace("T", " ") || ""}.

## Підсумок

| | Товарів |
| --- | --- |
| Усього в партії | ${results.length} |
| Уже є в каталозі (не змінюються) | ${existing.length} |
| Нові, готові до імпорту як чернетки | ${ready.length} |
| Нові з помилками (не потрапляють у SQL) | ${blocked.length} |
| Ціна на сайті виробника відрізняється від нашої | ${priceChanges.length} |

${ready.length ? `SQL для ${ready.length} чернеток: \`${path.basename(outBase)}.sql\`.` : "Нових товарів для імпорту немає, SQL порожній."}
${priceChanges.length ? `Нові ціни для адмінки (Товари → Імпорт цін): \`${path.basename(outBase)}.prices.csv\`.` : ""}

## Нові товари з помилками

${Object.keys(errorCounts).length ? table(["Помилка", "Товарів"], Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).map(([key, count]) => [key, String(count)])) + "\n\n" : ""}${table(["Артикул", "Назва", "Помилки"], blocked.map(result => [result.item.sku, result.item.title, list(result.problems.errors)]))}

## Нові товари, готові до імпорту

${table(["Артикул", "Назва", "Категорія", "Ціна", "Зауваження"], ready.map(result => [result.item.sku, result.item.title, result.category?.title || "", result.price ? String(result.price) : "—", list(result.problems.warnings, 4) || "—"]))}

## Ціни, що відрізняються

${table(["Артикул", "Назва в нас", "Наша ціна", "Ціна виробника"], priceChanges.map(result => [result.item.sku, result.existing.title, result.existing.amount ? String(result.existing.amount) : "—", String(result.price)]))}

## Уже є в каталозі

${existing.length} товарів знайдено за артикулом або джерелом. Імпорт їх не змінює.
${table(["Артикул", "Назва в нас", "Назва зі збору", "Категорія в нас → у зборі"], existing.filter(result => result.existing.category !== result.item.category).map(result => [result.item.sku, result.existing.title, result.item.title, `${result.existing.category} → ${result.item.category}`]))}
`;

fs.writeFileSync(`${outBase}.report.md`, report);
fs.writeFileSync(`${outBase}.sql`, ready.length ? sqlFor(ready) : "-- No new products to import.\n");
if (priceChanges.length) {
  fs.writeFileSync(`${outBase}.prices.csv`, ["SKU;Ціна", ...priceChanges.map(result => `${result.item.sku};${result.price}`)].join("\n") + "\n");
}
console.log(JSON.stringify({ total: results.length, existing: existing.length, ready: ready.length, blocked: blocked.length, priceChanges: priceChanges.length, report: `${outBase}.report.md` }, null, 2));
