import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_FILE = path.join(ROOT, "tmp", "tekkhaus-source", "products.json");
const OUT_FILE = path.join(ROOT, "tekkhaus-products-data.js");
const MEDIA_DIR = path.join(ROOT, "assets", "products", "tekkhaus");
const VERIFIED_ON = "2026-09-21";
const STORE_URL = "https://shop.tekk.haus/shop-ua/";
const API_URL = "https://shop.tekk.haus/wp-json/wc/store/v1/products";

function decodeEntities(value = "") {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;|\u00a0/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "–")
    .replace(/&times;/gi, "×")
    .replace(/&deg;/gi, "°")
    .replace(/&hellip;/gi, "…")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function clean(value = "") {
  return decodeEntities(String(value))
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function slugify(value = "") {
  return clean(value)
    .toLocaleLowerCase("uk")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function htmlMatches(html, pattern) {
  return [...String(html || "").matchAll(pattern)].map(match => clean(match[1])).filter(Boolean);
}

function extractListItems(html) {
  return htmlMatches(html, /<li\b[^>]*>([\s\S]*?)<\/li>/gi)
    .map(value => value.replace(/^[-–—•]\s*/, "").replace(/\s+/g, " ").trim())
    .filter(value => value.length >= 3);
}

function extractParagraphs(html) {
  return htmlMatches(html, /<(?:p|h[2-4])\b[^>]*>([\s\S]*?)<\/(?:p|h[2-4])>/gi)
    .filter(value => value.length >= 24 && !/оплата частинами|youtube|browser does not support/i.test(value));
}

function extractTableRows(html) {
  const rows = [];
  for (const match of String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = htmlMatches(match[1], /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi);
    if (cells.length >= 2 && cells[0] && cells[1]) rows.push([cells[0].replace(/:$/, ""), cells.slice(1).join("; ")]);
  }
  return rows;
}

function detailFromBullet(value) {
  const normalized = clean(value).replace(/^[–—-]\s*/, "");
  const match = normalized.match(/^([^:]{2,80}):\s*(.+)$/);
  if (!match) return null;
  const label = clean(match[1]).replace(/[.;]+$/, "");
  const result = clean(match[2]).replace(/[.;]+$/, "");
  if (!label || !result || /^(?:основні переваги|увага|важливо|примітка)$/i.test(label)) return null;
  return [label, result];
}

function officialAttributes(record) {
  return (record.attributes || []).flatMap(attribute => {
    const value = unique((attribute.terms || []).map(term => clean(term.name))).join(", ");
    return clean(attribute.name) && value ? [[clean(attribute.name), value]] : [];
  });
}

function technicalDetails(record) {
  const html = `${record.short_description || ""}\n${record.description || ""}`;
  const rows = [
    ...officialAttributes(record),
    ...extractTableRows(html),
    ...extractListItems(html).map(detailFromBullet).filter(Boolean),
    ["Артикул виробника", clean(record.sku)],
    ["Офіційна назва", clean(record.name)],
    ["Категорія виробника", unique((record.categories || []).map(category => clean(category.name))).join(", ")]
  ];
  const seen = new Set();
  return rows.filter(([label, value]) => {
    const key = `${label.toLocaleLowerCase("uk")}\u0000${value.toLocaleLowerCase("uk")}`;
    if (!label || !value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findDetail(details, patterns) {
  return details.find(([label]) => patterns.some(pattern => pattern.test(label)));
}

function numeric(value) {
  const normalized = clean(value).replace(/(?<=\d)[\s\u00a0](?=\d{3}(?:\D|$))/g, "").replace(/,/g, ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function normalizedFeatures(details, classification) {
  const result = { productType: classification.type };
  const numberFeature = (id, patterns, convert = value => value) => {
    const row = findDetail(details, patterns);
    const value = numeric(row?.[1]);
    if (Number.isFinite(value)) result[id] = Number(convert(value, row[1]).toFixed(4));
  };
  if (!["accessory", "tank", "controller", "feed-grinder"].includes(classification.kind)) {
    numberFeature("headM", [/максимальн.*(?:тиск|напір)/i, /^Hmax/i], (value, source) => /бар/i.test(source) && !/\d+\s*м(?:\s|$|\/)/iu.test(source) ? value * 10.197 : value);
    numberFeature("flowM3h", [/максимальн.*продуктив/i, /максимальн.*проток/i, /^Qmax/i], (value, source) => /л\s*\/\s*(?:хв|мин)/i.test(source) ? value * 0.06 : /л\s*\/\s*год/i.test(source) ? value / 1000 : value);
  }
  numberFeature("powerKw", [/максимальн.*потуж/i, /споживан.*потуж/i, /^потужність$/i], (value, source) => /(?:^|\s)вт(?:\s|$)/iu.test(source) && !/квт/iu.test(source) ? value / 1000 : value);
  numberFeature("pressureBar", [/максимальн.*робоч.*тиск/i, /робоч.*тиск/i], (value, source) => /мпа/i.test(source) ? value * 10 : value);
  numberFeature("mountingLengthMm", [/монтажн.*довжин/i, /довжин.*насос/i]);
  numberFeature("maxImmersionDepthM", [/максимальн.*глибин.*занур/i]);
  numberFeature("freePassageMm", [/вільн.*прохід/i, /максимальн.*частин/i]);
  numberFeature("cableLengthM", [/кабель/i, /довжин.*кабел/i]);
  numberFeature("volumeL", [/об.?єм.*бак/i, /бак.*літр/i]);
  numberFeature("weightKg", [/^вага$/i, /^маса$/i]);
  numberFeature("filtrationMicron", [/тонкість.*фільтр/i, /частк.*мікрон/i]);
  const capacityRow = details.find(([label, value]) => /^\s*(?:макс\.?\s*)?продуктивність/iu.test(label) && /кг\s*\/\s*год/iu.test(value));
  if (capacityRow && Number.isFinite(numeric(capacityRow[1]))) result.capacityKgh = numeric(capacityRow[1]);
  numberFeature("rotationRpm", [/частот.*обертан/i, /число.*оберт/i, /оберт.*двигун/i]);
  const textFeatures = {
    connection: [/діаметр.*підключ/i, /^підключення$/i, /^різьба/i],
    voltage: [/^напруга/i, /^живлення/i],
    protectionClass: [/клас захист/i, /ступінь захист/i],
    temperature: [/температур.*ріди/i, /температур.*вод/i, /робоч.*температур/i],
    compatibility: [/^сумісність$/i, /^підходить до$/i],
    material: [/матеріал.*корпус/i, /^матеріал$/i],
    control: [/керуван/i, /плавн.*змін/i],
    floatSwitch: [/поплав/i],
    selfPriming: [/самовсмокт/i]
  };
  for (const [id, patterns] of Object.entries(textFeatures)) {
    const row = findDetail(details, patterns);
    if (row) result[id] = row[1];
  }
  return result;
}

function extractModel(record, classification) {
  const source = clean(record.name).replace(/\bTEKK[ .]?HAUS\b/gi, "").replace(/\s{2,}/g, " ").trim();
  if (["accessory", "tank"].includes(classification?.kind)) return source.replace(/[.]+$/, "");
  const token = source.match(/\b(?:AG\s*2500|SFP|EPC[- ]?[1-4]|PS[- ]?[12]R|PGR5|E(?:260|520|720)|EMB\s*500|MBS\s*370|BSG|BS|JP|4SKM|3SKM|4QGD|3QGD|4SDM|3SDM|ECS|ECM|EC|CP|KSL|EPB|PB|SDF|SDP|VP[- ]?65|QB\s*60)\b.*$/i);
  if (token) return clean(token[0]).replace(/[.]+$/, "");
  return source.replace(/^(?:енергозберігаюч(?:ий|а)|автоматичн(?:ий|а)|багатофункціональний|електронний|електроний)\s+/i, "").replace(/[.]+$/, "");
}

function seriesName(record) {
  const name = clean(record.name).toUpperCase();
  const patterns = [
    [/\bAG\s*2500\b/, "AG 2500"], [/\bSFP\b/, "SFP"], [/\bEPC[- ]?4\b/, "EPC-4"], [/\bEPC[- ]?3\b/, "EPC-3"],
    [/\bEPC[- ]?2\b/, "EPC-2"], [/\bEPC[- ]?1\b/, "EPC-1"], [/\bPS[- ]?2R\b/, "PS-2R"], [/\bPS[- ]?1R\b/, "PS-1R"],
    [/\bPGR5\b/, "PGR5"], [/\bE(?:260|520|720)\b/, "E Series"], [/\bEMB\s*500\b/, "EMB 500"], [/\bMBS\s*370\b/, "MBS 370"],
    [/\bBSG\b/, "BSG"], [/\bBS\b/, "BS"], [/\bJP\b/, "JP"], [/\b4SKM\b/, "4SKM"], [/\b3SKM\b/, "3SKM"],
    [/\b4QGD\b/, "4QGD"], [/\b3QGD\b/, "3QGD"], [/\b4SDM\b/, "4SDM"], [/\b3SDM\b/, "3SDM"],
    [/\bECS\b/, "ECS"], [/\bECM\b/, "ECM"], [/\bEC\b/, "EC"], [/\bCP\b/, "CP"], [/\bKSL\b/, "KSL"],
    [/\bEPB\b/, "EPB"], [/\bPB\b/, "PB"], [/\bSDF\b/, "SDF"], [/\bSDP\b/, "SDP"], [/\bVP[- ]?65\b/, "VP-65"], [/\bQB\s*60\b/, "QB 60"]
  ];
  for (const [pattern, label] of patterns) if (pattern.test(name)) return label;
  if (/ГІДРОАКУМУЛЯТОР|МЕМБРАНА/.test(name)) return "Гідроакумулятори";
  if (/КЛАПАН/.test(name)) return "Клапани";
  if (/ШЛАНГ|П.?ЯТЕРНИК|МАНОМЕТР/.test(name)) return "Монтажні комплектуючі";
  return "Комплектуючі TEKK HAUS";
}

function classify(record) {
  const name = clean(record.name);
  const lower = name.toLocaleLowerCase("uk");
  const categoryText = (record.categories || []).map(category => clean(category.name)).join(" ").toLocaleLowerCase("uk");
  const series = seriesName(record);
  if (/кормоподрібнювач|зерноподрібнювач/.test(lower)) return { category: "household-equipment", sourceCategoryId: "tekkhaus-feed-grinders", type: "Кормоподрібнювач", series, kind: "feed-grinder" };
  if (/басейн/.test(lower)) return { category: "water-supply", sourceCategoryId: "tekkhaus-pool", type: /фільтруюча станція/.test(lower) ? "Фільтрувальна станція для басейну" : "Насос для басейну", series, kind: "pool" };
  if (/^бак |гідроакумулятор/.test(lower) && !/мембрана/.test(lower)) return { category: "water-supply", sourceCategoryId: "tekkhaus-pressure-tanks", type: "Гідроакумулятор", series, kind: "tank" };
  if (/робоче колесо|крильчатк|дифузор|ежектор|шнек у зборі|зворотний клапан|антивібраційний шланг|п.?ятерник|манометр|змінна мембрана/.test(lower)) return { category: "water-supply", sourceCategoryId: "tekkhaus-accessories", type: /мембрана/.test(lower) ? "Мембрана гідроакумулятора" : "Комплектуючі для насосів", series, kind: "accessory" };
  if (/автоматика та комплектуючі/.test(categoryText) && /контролер тиску|реле тиску|пресконтрол|\b(?:epc|ps-?\d)/i.test(name) || /апгрейд станції/.test(lower)) return { category: "water-supply", sourceCategoryId: "tekkhaus-automation", type: "Автоматика насосів", series, kind: "controller" };
  if (/циркуляційн|для котла/.test(lower)) return { category: "heating", sourceCategoryId: "tekkhaus-circulation", type: "Циркуляційний насос", series, kind: "circulation" };
  if (/\b(?:epb|pb)\b/i.test(name)) return { category: "water-supply", sourceCategoryId: "tekkhaus-pressure", type: "Насос підвищення тиску", series, kind: "pressure" };
  if (/насосн.*станц|апгрейд станції/.test(lower)) return { category: "water-supply", sourceCategoryId: "tekkhaus-pressure", type: "Насосна станція", series, kind: "station" };
  if (/дренажно-фекальн|\bsdf\b/i.test(name)) return { category: "water-supply", sourceCategoryId: "tekkhaus-sewage", type: "Дренажно-фекальний насос", series, kind: "sewage" };
  if (/дренажн|\bsdp\b/i.test(name)) return { category: "water-supply", sourceCategoryId: "tekkhaus-drainage", type: "Дренажний насос", series, kind: "drainage" };
  if (/глибинн|шнеков|вібраційн|\b(?:3|4)(?:skm|sdm|qgd)\b/i.test(name)) return { category: "water-supply", sourceCategoryId: "tekkhaus-borehole", type: "Свердловинний насос", series, kind: "borehole" };
  if (/поверхнев|відцентров|вихров|водяний насос|\b(?:jp|qb)\b/i.test(name)) return { category: "water-supply", sourceCategoryId: "tekkhaus-surface", type: "Поверхневий насос", series, kind: "surface" };
  return { category: "water-supply", sourceCategoryId: "tekkhaus-accessories", type: "Комплектуючі для насосів", series, kind: "accessory" };
}

const applicationByKind = Object.freeze({
  circulation: ["Циркуляція теплоносія в системах опалення", "Контури охолодження або кондиціювання, якщо це допускають параметри моделі"],
  pressure: ["Локальне підвищення тиску у побутовій системі водопостачання"],
  station: ["Автоматичне водопостачання приватного будинку", "Полив і подача чистої води з доступного джерела"],
  surface: ["Подача чистої води з колодязя або резервуара", "Побутове водопостачання та полив"],
  borehole: ["Подача води зі свердловин і колодязів", "Побутове водопостачання та полив"],
  drainage: ["Відведення дренажної та забрудненої води в межах параметрів моделі"],
  sewage: ["Відведення забрудненої та стічної води", "Перекачування середовища з допустимими для моделі включеннями"],
  pool: ["Циркуляція та механічне очищення води у приватних басейнах і SPA"],
  controller: ["Автоматизація запуску, зупинки та захисту сумісного насоса"],
  tank: ["Стабілізація тиску та накопичення запасу води в насосній системі"],
  accessory: ["Ремонт, монтаж або обслуговування сумісного насосного обладнання TEKK HAUS"],
  "feed-grinder": ["Подрібнення кормової сировини в особистому або фермерському господарстві"]
});

const purposeByKind = Object.freeze({
  circulation: "насос з мокрим ротором для примусової циркуляції в побутових інженерних контурах",
  pressure: "компактний насос для підвищення тиску у водопроводі",
  station: "комплектна насосна станція для автоматичного водопостачання",
  surface: "поверхневий насос для подачі чистої води",
  borehole: "занурювальний насос для подачі води з колодязя або свердловини",
  drainage: "занурювальний насос для відведення дренажної та забрудненої води",
  sewage: "занурювальний насос для стічної води",
  pool: "обладнання для циркуляції або фільтрації води в басейні",
  controller: "пристрій автоматичного керування побутовим насосом",
  tank: "гідроакумулятор для побутової системи водопостачання",
  accessory: "фірмова комплектуюча для монтажу або обслуговування насосного обладнання",
  "feed-grinder": "електричний подрібнювач кормової сировини"
});

function extractApplications(record, classification) {
  const text = clean(record.description);
  const confirmed = [...(applicationByKind[classification.kind] || [])];
  if (/гарячої води|гвп/i.test(text) && classification.kind === "circulation") confirmed.push("Циркуляція гарячої води");
  if (/тепл[аої] підлог/i.test(text) && classification.kind === "circulation") confirmed.push("Контури водяної теплої підлоги");
  if (/коренеплод/i.test(text) && classification.kind === "feed-grinder") confirmed.push("Подрібнення коренеплодів, зазначених виробником");
  if (/зернов/i.test(text) && classification.kind === "feed-grinder") confirmed.push("Подрібнення зернових культур, зазначених виробником");
  return unique(confirmed);
}

function keyFeatures(record, details, classification) {
  const preferred = classification.kind === "feed-grinder"
    ? [/потуж/i, /продуктив/i, /оберт/i, /сит/i, /захист/i, /напруг/i, /ваг/i]
    : classification.kind === "controller"
      ? [/тиск/i, /напруг/i, /струм/i, /проток/i, /підключ/i, /сухого ходу/i, /кабель/i, /гаранті/i]
      : [/максимальн.*тиск/i, /максимальн.*продуктив/i, /максимальн.*потуж/i, /діаметр.*підключ/i, /кабель/i, /глибина/i, /клас захист/i, /температур/i, /гаранті/i];
  const rows = [];
  for (const pattern of preferred) {
    const row = details.find(item => pattern.test(item[0]));
    if (row && !rows.some(item => item[0] === row[0])) rows.push(row);
  }
  const bullets = extractListItems(record.short_description).filter(item => !/оплата частинами/i.test(item));
  const result = rows.map(([label, value]) => `${label}: ${value}`);
  for (const bullet of bullets) {
    if (!result.some(value => value.toLocaleLowerCase("uk") === bullet.toLocaleLowerCase("uk"))) result.push(bullet.replace(/[.!]+$/, ""));
    if (result.length >= 8) break;
  }
  for (const [label, value] of details) {
    if (!result.some(item => item.startsWith(`${label}:`))) result.push(`${label}: ${value}`);
    if (result.length >= 5) break;
  }
  const confirmedFallbacks = [
    `Артикул виробника: ${clean(record.sku)}`,
    `Тип обладнання: ${classification.type}`,
    `Серія: ${classification.series}`,
    "Бренд: TEKK HAUS",
    `Категорія виробника: ${unique((record.categories || []).map(category => clean(category.name))).join(", ")}`
  ];
  for (const item of confirmedFallbacks) {
    if (!result.some(value => value.toLocaleLowerCase("uk") === item.toLocaleLowerCase("uk"))) result.push(item);
    if (result.length >= 5) break;
  }
  return result.slice(0, 8);
}

function compatibility(record, classification, details) {
  const explicit = findDetail(details, [/^сумісність$/i, /^підходить до$/i])?.[1];
  if (explicit) return explicit;
  const name = clean(record.name);
  if (classification.kind !== "accessory") return "";
  const match = name.match(/(?:для|\()\s*((?:3|4)?(?:SKM|QGD|SDM|JP|GP|GPL)[^)]*)/i);
  return clean(match?.[1]);
}

function description(record, classification, details, features, applications) {
  const model = extractModel(record, classification);
  const purpose = purposeByKind[classification.kind] || classification.type.toLocaleLowerCase("uk");
  const parameterText = features.slice(0, 8).map(value => value.charAt(0).toLocaleLowerCase("uk") + value.slice(1)).join("; ");
  const sourceBullets = extractListItems(`${record.short_description || ""}\n${record.description || ""}`)
    .filter(item => !detailFromBullet(item) && item.length >= 15 && item.length <= 240 && !/:\s*$|гарантія\s*\d|оплата частинами/i.test(item));
  const construction = unique(sourceBullets).slice(0, 5);
  const paragraphs = extractParagraphs(record.description);
  const confirmedMechanics = paragraphs.find(value => /оснащ|конструк|двигун|робоче колесо|захист|керуван|мембран|клапан|ріжуч/i.test(value));
  const sections = [
    { title: "Опис", paragraphs: [`TEKK HAUS ${model} — ${purpose}. Дані для цього виконання звірені з офіційною товарною карткою виробника.`] },
    { title: "Призначення", paragraphs: [`Модель застосовують у таких задачах: ${applications.map(item => item.charAt(0).toLocaleLowerCase("uk") + item.slice(1)).join("; ")}.`] },
    { title: "Конструкція та оснащення", paragraphs: [construction.length ? `Для цієї моделі виробник зазначає: ${construction.map(item => (item.charAt(0).toLocaleLowerCase("uk") + item.slice(1)).replace(/[.;:]+$/, "")).join("; ")}.` : confirmedMechanics ? `В офіційному описі зазначено: ${confirmedMechanics.replace(/[.;:]+$/, "")}.` : `Виконання та комплектність відповідають офіційній картці артикулу ${record.sku}.`] },
    { title: "Параметри конкретної моделі", paragraphs: [`Підтверджені характеристики TEKK HAUS ${model}: ${parameterText}.`] },
    { title: "Підбір і монтаж", paragraphs: [classification.kind === "accessory" ? "Перед замовленням потрібно звірити модель насоса, виконання деталі та приєднувальні розміри. Сумісність вказана лише там, де її прямо підтверджує виробник." : classification.kind === "feed-grinder" ? "Перед роботою потрібно перевірити допустиму сировину, встановити потрібний робочий елемент і дотримуватися інструкції виробника щодо безпеки та тривалості циклу." : "Перед замовленням потрібно звірити робочу точку, тип приєднання, електроживлення, допустиме середовище та умови монтажу з характеристиками конкретної системи."] }
  ];
  const shortDescription = `TEKK HAUS ${model} — ${purpose}.`;
  return {
    sections,
    shortDescription: shortDescription.length <= 220 ? shortDescription : `${classification.type} TEKK HAUS ${model} для відповідної побутової системи.`,
    fullDescription: sections.flatMap(section => section.paragraphs).join("\n\n")
  };
}

function extractDocuments(record) {
  const html = `${record.short_description || ""}\n${record.description || ""}`;
  const links = [...html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map(match => decodeEntities(match[1]));
  const documents = unique(links).map(url => ({ type: "PDF", title: /manual|instruk|інструк/i.test(url) ? "Інструкція TEKK HAUS" : "Технічний документ TEKK HAUS", url }));
  const manual = documents.find(item => /manual|instruk|інструк/i.test(item.url)) || documents[0];
  const datasheet = documents.find(item => /datasheet|data-sheet|catalog|passport|spec/i.test(item.url));
  const certificate = documents.find(item => /cert|certificate|declaration/i.test(item.url));
  return { documents, manual, datasheet, certificate };
}

async function downloadImage(url, target) {
  try {
    const metadata = await sharp(target).metadata();
    if (metadata.width && metadata.height) return { ok: true, width: metadata.width, height: metadata.height, cached: true };
  } catch {}
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*", "user-agent": "Mozilla/5.0 TD-Sofiivka-Catalog/1.0" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const input = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(input).metadata();
      if (!metadata.width || !metadata.height) throw new Error("Invalid image");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await sharp(input).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 91, alphaQuality: 96, effort: 6 }).toFile(target);
      const output = await sharp(target).metadata();
      return { ok: true, width: output.width, height: output.height, cached: false };
    } catch (error) {
      if (attempt === 4) return { ok: false, error: String(error) };
      await new Promise(resolve => setTimeout(resolve, 400 * attempt));
    }
  }
  return { ok: false, error: "Unknown image error" };
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
      if ((index + 1) % 30 === 0) console.log(`Processed ${index + 1}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

function imageFileName(image) {
  const sourceName = path.basename(new URL(image.src).pathname).replace(/\.[^.]+$/, "");
  return `${image.id || slugify(image.src)}-${slugify(sourceName).slice(0, 72)}.webp`;
}

function isDimensionImage(image) {
  return /розмір|размер|dimension|drawing|schema|схем|креслен|габарит/i.test(`${image.name || ""} ${image.alt || ""} ${image.src || ""}`);
}

async function main() {
  const payload = JSON.parse(await fs.readFile(SOURCE_FILE, "utf8"));
  const grouped = new Map();
  for (const product of payload.products || []) {
    const sku = clean(product.sku);
    if (!sku) continue;
    if (!grouped.has(sku)) grouped.set(sku, []);
    grouped.get(sku).push(product);
  }
  const selected = [...grouped.values()].flatMap(group => {
    if (group.some(product => /gardia/i.test(clean(product.name)))) return [];
    return [group.find(product => !String(product.permalink || "").includes("/ru/")) || group[0]];
  });
  if (selected.length !== 112) throw new Error(`Expected 112 TEKK HAUS SKU, received ${selected.length}`);

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const imageRows = [...new Map(selected.flatMap(product => product.images || []).map(image => [image.src, image])).values()];
  const imageResults = new Map();
  await mapLimit(imageRows, 8, async image => {
    const fileName = imageFileName(image);
    const result = await downloadImage(image.src, path.join(MEDIA_DIR, fileName));
    imageResults.set(image.src, { ...result, fileName });
    return result;
  });

  const products = selected.map(record => {
    const classification = classify(record);
    const model = extractModel(record, classification);
    const details = technicalDetails(record);
    const features = keyFeatures(record, details, classification);
    const normalized = normalizedFeatures(details, classification);
    const applications = extractApplications(record, classification);
    const editorial = description(record, classification, details, features, applications);
    const docs = extractDocuments(record);
    const localImages = (record.images || []).flatMap(image => {
      const result = imageResults.get(image.src);
      return result?.ok ? [{ local: `/assets/products/tekkhaus/${result.fileName}`, source: image.src, original: image.src, type: isDimensionImage(image) ? "dimensions" : "product", width: result.width, height: result.height }] : [];
    });
    const images = localImages.map(image => image.local);
    const dimensionDiagram = localImages.find(image => image.type === "dimensions")?.local || "";
    const manufacturerUrl = clean(record.permalink);
    const title = `${classification.type} TEKK HAUS ${model}`.replace(/\s{2,}/g, " ").trim();
    const seriesId = `tekkhaus-${slugify(classification.series)}`;
    const compatibilityValue = compatibility(record, classification, details);
    const price = Number(record.prices?.price || 0);
    const sourceUrls = unique([manufacturerUrl, STORE_URL, `${API_URL}/${record.id}`, ...localImages.map(image => image.source), ...docs.documents.map(document => document.url)]);
    const seoDescription = `${classification.type} TEKK HAUS ${model}: офіційні характеристики, ціна, фото, застосування та документи виробника.`;
    return {
      id: `tekkhaus-${record.sku}`,
      sku: clean(record.sku),
      manufacturerCode: clean(record.sku),
      manufacturer_code: clean(record.sku),
      ean: "",
      EAN: "",
      brand: "TEKK HAUS",
      category: classification.category,
      sourceCategoryId: classification.sourceCategoryId,
      typeSlug: classification.sourceCategoryId,
      type: classification.type,
      subcategory: classification.type,
      series: classification.series,
      seriesId,
      model,
      title,
      productName: title,
      product_name: title,
      shortDescription: editorial.shortDescription,
      short_description: editorial.shortDescription,
      fullDescription: editorial.fullDescription,
      full_description: editorial.fullDescription,
      description: editorial.fullDescription,
      descriptionSections: editorial.sections,
      keyFeatures: features,
      key_features: features,
      applications,
      compatibility: compatibilityValue,
      technicalDetails: details,
      features: normalized,
      attributes: officialAttributes(record),
      tags: ["tekkhaus", "tekk haus"],
      image: images[0] || "",
      mainImage: images[0] || "",
      main_image: images[0] || "",
      images,
      galleryImages: images,
      gallery_images: images,
      dimensionDiagram,
      dimension_diagram: dimensionDiagram,
      imageSourceUrl: localImages[0]?.source || "",
      image_source_url: localImages[0]?.source || "",
      imageSources: localImages,
      image_sources: localImages,
      documents: docs.documents,
      manualPdf: docs.manual?.url || "",
      manual_pdf: docs.manual?.url || "",
      datasheetPdf: docs.datasheet?.url || "",
      datasheet_pdf: docs.datasheet?.url || "",
      certificatePdf: docs.certificate?.url || "",
      certificate_pdf: docs.certificate?.url || "",
      manufacturerUrl,
      manufacturer_url: manufacturerUrl,
      descriptionSourceUrl: manufacturerUrl,
      description_source_url: manufacturerUrl,
      sourceUrls,
      source_urls: sourceUrls,
      dateVerified: VERIFIED_ON,
      date_verified: VERIFIED_ON,
      seo: { title: `${title} — характеристики та ціна | ТД «Софіївка»`, description: seoDescription },
      seoTitle: `${title} — характеристики та ціна | ТД «Софіївка»`,
      seo_title: `${title} — характеристики та ціна | ТД «Софіївка»`,
      seoDescription,
      seo_description: seoDescription,
      price,
      oldPrice: Number(record.prices?.regular_price || 0) > price ? Number(record.prices.regular_price) : undefined,
      currency: clean(record.prices?.currency_code) || "UAH",
      availability: record.is_in_stock ? "in_stock" : "out_of_stock",
      availabilityLabel: record.is_in_stock ? "В наявності" : "Немає в наявності",
      condition: "new",
      conditionLabel: "Новий",
      officialCatalogEdition: `Офіційний магазин TEKK HAUS, перевірено ${VERIFIED_ON}`
    };
  });

  products.sort((a, b) => a.series.localeCompare(b.series, "uk") || a.model.localeCompare(b.model, "uk", { numeric: true }));
  const seriesLabels = Object.fromEntries([...new Map(products.map(product => [product.seriesId, product.series])).entries()]);
  const output = `(function(){"use strict";const PRODUCTS=${JSON.stringify(products)};window.sofievkaTekkhausSeriesLabels=Object.freeze(${JSON.stringify(seriesLabels)});window.sofievkaTekkhausProducts=Object.freeze(PRODUCTS.map(product=>Object.freeze(product)));})();\n`;
  await fs.writeFile(OUT_FILE, output);
  const report = {
    verifiedOn: VERIFIED_ON,
    source: STORE_URL,
    officialApiRecords: payload.total,
    uniqueOfficialSku: grouped.size,
    excludedGardiaSku: grouped.size - products.length,
    skuCount: products.length,
    seriesCount: new Set(products.map(product => product.series)).size,
    categories: Object.entries(products.reduce((all, product) => ({ ...all, [product.sourceCategoryId]: (all[product.sourceCategoryId] || 0) + 1 }), {})).map(([id, skuCount]) => ({ id, skuCount })),
    imageReferences: products.reduce((total, product) => total + product.images.length, 0),
    uniqueImages: new Set(products.flatMap(product => product.images)).size,
    multiImageProducts: products.filter(product => product.images.length > 1).length,
    documentProducts: products.filter(product => product.documents.length).length,
    eanCoverage: products.filter(product => product.ean).length,
    missingImages: products.filter(product => !product.images.length).map(product => product.sku),
    failedImageDownloads: [...imageResults.entries()].filter(([, result]) => !result.ok).map(([url, result]) => ({ url, error: result.error }))
  };
  await fs.writeFile(path.join(ROOT, "tmp", "tekkhaus-source", "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

await main();
