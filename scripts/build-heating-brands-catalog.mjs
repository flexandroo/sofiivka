import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_FILE = path.join(ROOT, "tmp", "heating-brands-source", "products.json");
const OUT_FILE = path.join(ROOT, "heating-brands-products-data.js");
const REPORT_FILE = path.join(ROOT, "tmp", "heating-brands-source", "report.json");
const MEDIA_ROOT = path.join(ROOT, "assets", "products");
const ALTEP_LOGO_FILE = path.join(ROOT, "assets", "brands", "altep.webp");
const ALTEP_LOGO_URL = "https://altep.ua/assets/css/static/pic/logo-wide.png";
const VERIFIED_ON = "2026-09-21";
const SITEMAPS = Object.freeze({
  Altep: "https://altep.ua/sitemap.xml",
  FENIKS: "https://feniks.ua/sitemap-product.xml",
  FOCUS: "https://firebox.com.ua/sitemap_index.xml"
});
const UNAVAILABLE_DOCUMENT_URLS = new Set([
  "https://firebox.com.ua/wp-content/uploads/tehnichnij-pasport-gidravlichnogo-vuzla-monopelet.pdf",
  "https://firebox.com.ua/wp-content/uploads/tehnichnij-pasport-gidravlichnogo-vuzla-1.pdf",
  "https://firebox.com.ua/wp-content/uploads/bunker-bpl30-2.pdf",
  "https://firebox.com.ua/wp-content/uploads/kerivnictvo-z-ekspluatacii-100-150kvt.pdf",
  "https://firebox.com.ua/wp-content/uploads/rukovodstvo-jekspluatacii-700-900kvt.pdf",
  "https://firebox.com.ua/wp-content/uploads/instrukciya-z-ekspluatacii-1000-kvt.pdf",
  "https://firebox.com.ua/wp-content/uploads/ecomax260_mini_dtr_ru_wydanie_1.2.pdf",
  "https://firebox.com.ua/wp-content/uploads/tp-kgg-150-1000-19.01.2024.pdf"
]);

function clean(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "–")
    .replace(/&deg;/gi, "°")
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
  return [...new Set(values.filter(Boolean).map(clean))];
}

function uniquePairs(pairs) {
  const seen = new Set();
  return pairs.flatMap(pair => {
    const label = clean(pair?.[0]);
    const value = clean(pair?.[1]);
    const key = `${label.toLocaleLowerCase("uk")}\u0000${value.toLocaleLowerCase("uk")}`;
    if (!label || !value || seen.has(key)) return [];
    seen.add(key);
    return [[label, value]];
  });
}

function normalizedBrand(value) {
  if (/^altep$/i.test(value)) return "Altep";
  if (/^feniks$/i.test(value)) return "FENIKS";
  return "FOCUS";
}

function sourceText(record) {
  return clean([
    record.title,
    record.series,
    record.sourceCategory,
    ...(record.categoryTrail || []),
    ...(record.sourceCategorySlugs || []),
    record.manufacturerUrl
  ].join(" ")).toLocaleLowerCase("uk");
}

function classify(record) {
  const source = sourceText(record);
  const pathName = new URL(record.manufacturerUrl).pathname.toLocaleLowerCase("uk");
  if (/\/sistemy-tumanoobrazovaniya-focus\/|\/komplektujushie-tuman\//.test(pathName)) {
    return { categoryId: "humidification", sourceCategoryId: `${slugify(record.brand)}-humidification`, type: /комплект|форсунк|магістрал|трійник|муфт|коліно/i.test(record.title) ? "Комплектуючі системи туманоутворення" : "Система туманоутворення" };
  }
  if (/теплоакумулятор|teploakkum/.test(source)) {
    return { categoryId: "heat-accumulators", sourceCategoryId: `${slugify(record.brand)}-heat-accumulators`, type: "Теплоакумулятор" };
  }
  if (/parogenerator|парогенератор|teplogenerator|теплогенератор|\/gas-[hp]\//.test(source)) {
    return { categoryId: "industrial-heating", sourceCategoryId: `${slugify(record.brand)}-industrial-heating`, type: /парогенератор/i.test(record.title) ? "Пелетний парогенератор" : "Промисловий теплогенератор" };
  }
  if (/pelletnye-gorelki-focus/.test(pathName) || /peletnyj-palnyk-feniks/.test(pathName) || /fakelniy-palnik/.test(pathName)) {
    return { categoryId: "pellet-burners", sourceCategoryId: `${slugify(record.brand)}-pellet-burners`, type: "Пелетний пальник" };
  }
  if (/пелетн.*пальник|пальник.*пелет|pellet.*burner/i.test(record.title) && !/комплект|запчаст|двер|сопло|колосник/i.test(record.title)) {
    return { categoryId: "pellet-burners", sourceCategoryId: `${slugify(record.brand)}-pellet-burners`, type: "Пелетний пальник" };
  }
  const boilerPath = /samoochistnye-pelletnye-kotly|tverdotoplivnye-pelletnye-kotly|mini-kotelnye-focus|kotly-s-|tverdotoplivnye-kotly-dlya-gorelok|piroliznye-tverdotoplivnye-kotly-focus/.test(pathName);
  const isBoiler = boilerPath || /котел|boiler/.test(source);
  const isPellet = /пелет|pellet|автоматичн.*подач|самоочис|золовидален|mini-kotelnye/.test(source);
  if (isBoiler && isPellet) {
    return { categoryId: "pellet-boilers", sourceCategoryId: `${slugify(record.brand)}-pellet-boilers`, type: /міні-котельн/i.test(record.title) ? "Пелетна міні-котельня" : "Пелетний котел" };
  }
  if (isBoiler) {
    return { categoryId: "solid-fuel-boilers", sourceCategoryId: `${slugify(record.brand)}-solid-fuel-boilers`, type: /піроліз/i.test(record.title) ? "Піролізний твердопаливний котел" : "Твердопаливний котел" };
  }
  let type = "Комплектуючі для котельного обладнання";
  if (/бункер/i.test(record.title)) type = "Пелетний бункер";
  else if (/вентилятор/i.test(record.title)) type = "Вентилятор для котла";
  else if (/двер|лутк/i.test(record.title)) type = "Двері або лутка для котла";
  else if (/пневмоочищ/i.test(record.title)) type = "Система пневмоочищення котла";
  else if (/гідравліч|насосн.*груп|клапан/i.test(record.title)) type = "Гідравлічний вузол котельні";
  else if (/колосник|зачеп/i.test(record.title)) type = "Колосник або зачеп";
  else if (/шнек/i.test(record.title)) type = "Компонент шнекової подачі";
  return { categoryId: "boiler-accessories", sourceCategoryId: `${slugify(record.brand)}-boiler-accessories`, type };
}

function findDetail(details, patterns) {
  return details.find(([label]) => patterns.some(pattern => pattern.test(label)));
}

function numberFrom(value = "") {
  const match = clean(value).replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function exactPowerFromTitle(value = "") {
  const text = clean(value);
  if (/\d\s*[–—-]\s*\d+\s*квт/i.test(text)) return undefined;
  const match = text.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*квт\b/i);
  return match ? Number(match[1].replace(",", ".")) : undefined;
}

function featuresFor(record, classification, details) {
  const features = { productType: classification.type };
  const setText = (id, patterns) => {
    const row = findDetail(details, patterns);
    if (row) features[id] = row[1];
  };
  const setNumber = (id, patterns) => {
    const row = findDetail(details, patterns);
    const value = numberFrom(row?.[1]);
    if (Number.isFinite(value)) features[id] = value;
  };
  const heatPowerRow = findDetail(details, [/номінальн.*потужн.*котла/i, /^потужність(?: котла)?(?:,| \(|$)/i, /теплова потужність/i, /діапазон потужності/i]);
  const heatPower = numberFrom(heatPowerRow?.[1]);
  const titlePower = exactPowerFromTitle(record.title);
  if (Number.isFinite(heatPower)) features.heatOutputKw = heatPower;
  else if (Number.isFinite(titlePower) && ["solid-fuel-boilers", "pellet-boilers", "pellet-burners", "industrial-heating"].includes(classification.categoryId)) features.heatOutputKw = titlePower;
  setText("fuel", [/^паливо$/i, /вид палива/i, /основне паливо/i]);
  setNumber("efficiencyPercent", [/ккд/i, /коефіцієнт корисної дії/i]);
  setNumber("waterVolumeL", [/водян.*ємн.*котла/i, /об.?єм води/i]);
  setNumber("fireboxVolumeL", [/топк.*об.?єм|об.?єм.*топк/i]);
  setNumber("chimneyDiameterMm", [/внутрішн.*діаметр/i, /діаметр.*димоход/i, /приєднувальн.*димоход/i]);
  setNumber("chimneyHeightM", [/висота.*мінімально допустима/i, /мінімальн.*висота.*димоход/i]);
  setNumber("consumptionPowerW", [/споживан.*електроенергі/i, /електричн.*потужн/i]);
  setNumber("maxWaterTemperatureC", [/максимальн.*температур.*води/i, /макс.*температур.*теплонос/i]);
  setNumber("widthMm", [/^ширина(?:\s*\(|$)/i, /габарит.*ширина/i]);
  setNumber("heightMm", [/^висота(?:\s*\(|$)/i, /габарит.*висота/i]);
  setNumber("depthMm", [/^глибина(?:\s*\(|$)/i, /габарит.*глибина/i]);
  setNumber("weightKg", [/маса.*без води/i, /вага.*без води/i, /^маса(?:\s*\(|$)/i, /^вага(?:\s*\(|$)/i]);
  setText("connection", [/діаметр патрубків.*мереж/i, /підключення.*систем/i, /приєднан.*опален/i]);
  const pressure = findDetail(details, [/максимальн.*робоч.*тиск/i, /номінальн.*тиск води/i, /робоч.*тиск/i]);
  if (pressure) features.pressureBar = pressure[1];
  const volume = findDetail(details, [/^об.?єм(?:,| \(|$)/i, /місткість бункера/i]);
  if (classification.categoryId === "heat-accumulators" || /бункер/i.test(classification.type)) {
    const value = numberFrom(volume?.[1] || record.title.match(/(\d+)\s*(?:л|літр)/i)?.[1]);
    if (Number.isFinite(value)) features.volumeL = value;
  }
  return features;
}

function applicationsFor(classification) {
  const applications = {
    "solid-fuel-boilers": ["Водяні системи опалення приватних, комерційних або виробничих об’єктів відповідно до потужності моделі", "Котельні з ручним завантаженням твердого палива"],
    "pellet-boilers": ["Автоматизовані водяні системи опалення на пелетах", "Котельні житлових, комерційних або виробничих об’єктів відповідно до потужності моделі"],
    "pellet-burners": ["Автоматичне спалювання пелет у сумісному котельному обладнанні", "Модернізація котла лише за підтвердженої виробником сумісності"],
    "heat-accumulators": ["Акумулювання теплової енергії у водяній системі опалення", "Стабілізація режиму роботи котельного обладнання"],
    "boiler-accessories": ["Комплектування, монтаж або сервіс котельного обладнання", "Застосування у складі сумісної системи, зазначеної виробником"],
    "industrial-heating": ["Виробництво тепла або пари для технологічних та опалювальних потреб", "Промислові й комерційні об’єкти відповідно до продуктивності виконання"],
    humidification: ["Туманоутворення, зволоження або охолодження повітря", "Комплектування систем туманоутворення відповідно до призначення позиції"]
  };
  return applications[classification.categoryId] || [];
}

function technicalDetailsFor(record, classification) {
  return uniquePairs([
    ...(record.technicalDetails || []),
    ["Модель", clean(record.model)],
    ["Тип обладнання", classification.type],
    ["Серія", clean(record.series)],
    ["Категорія виробника", (record.categoryTrail || []).join(" › ") || clean(record.sourceCategory)]
  ]);
}

function contentFacts(record) {
  const values = unique([...(record.content?.bullets || []), ...(record.content?.paragraphs || [])]);
  return values
    .map(value => clean(value).replace(/^[•–—-]\s*/, "").replace(/[.;]+$/, ""))
    .filter(value => value.length >= 20 && value.length <= 260)
    .filter(value => !/^(?:купити|замовити|ціна|телефонуйте|проконсультуйтеся)/i.test(value));
}

function keyFeaturesFor(record, classification, details) {
  const preferredPatterns = [
    /потужн/i, /паливо/i, /ккд/i, /об.?єм/i, /робоч.*тиск/i, /максимальн.*температур/i,
    /діаметр.*димоход/i, /маса|вага/i, /габарит|ширина|висота|глибина/i, /продуктивн/i
  ];
  const result = [];
  for (const pattern of preferredPatterns) {
    const row = details.find(([label]) => pattern.test(label) && !/^(?:модель|тип обладнання|серія|категорія)/i.test(label));
    if (row) {
      const fact = `${row[0]}: ${row[1]}`;
      if (!result.includes(fact)) result.push(fact);
    }
    if (result.length >= 8) break;
  }
  for (const value of contentFacts(record).slice(0, 4)) {
    if (!result.some(item => item.toLocaleLowerCase("uk") === value.toLocaleLowerCase("uk"))) result.push(value);
    if (result.length >= 8) break;
  }
  const fallback = [
    `Тип обладнання: ${classification.type}`,
    `Серія: ${record.series}`,
    `Модель: ${record.model}`,
    `Виробник: ${normalizedBrand(record.brand)}`,
    `Призначення: ${applicationsFor(classification)[0]}`,
    `Офіційна категорія: ${clean(record.sourceCategory) || classification.type}`
  ];
  for (const value of fallback) {
    if (!result.some(item => item.toLocaleLowerCase("uk") === value.toLocaleLowerCase("uk"))) result.push(value);
    if (result.length >= 5) break;
  }
  return result.slice(0, 8);
}

function sentenceList(values) {
  return values.map(value => clean(value).replace(/[.;]+$/, "").replace(/^./u, first => first.toLocaleLowerCase("uk"))).join("; ");
}

function editorialDescription(record, classification, details, applications) {
  const brand = normalizedBrand(record.brand);
  const model = clean(record.model);
  const series = clean(record.series);
  const parameters = details.filter(([label]) => !/^(?:модель|тип обладнання|серія|категорія)/i.test(label)).slice(0, 12);
  const officialFacts = contentFacts(record).slice(0, 6);
  const intro = `${brand} ${model} — ${classification.type.toLocaleLowerCase("uk")}. Виробник відносить це виконання до серії «${series}».`;
  const purpose = applications.length
    ? `Модель призначена для таких задач: ${sentenceList(applications)}.`
    : `Призначення моделі визначене виробником у категорії «${clean(record.sourceCategory) || series}».`;
  const construction = officialFacts.length
    ? `В офіційній картці для цього виконання зазначено: ${sentenceList(officialFacts)}.`
    : `Окремий перелік конструктивних особливостей для цього виконання на офіційній сторінці не опублікований; тому непідтверджені переваги не додавалися.`;
  const parameterText = parameters.length
    ? `Підтверджені параметри конкретної моделі: ${parameters.map(([label, value]) => `${label.toLocaleLowerCase("uk")}: ${value}`).join("; ")}.`
    : `Окрема таблиця технічних параметрів для цієї позиції на офіційній сторінці відсутня. У картці збережено лише підтверджені назву, серію, призначення, фото та документи.`;
  const selection = classification.categoryId === "boiler-accessories"
    ? "Перед замовленням потрібно звірити сумісність комплектуючої з конкретною моделлю та потужністю обладнання. Сумісність вважається підтвердженою лише тоді, коли її прямо вказує виробник."
    : "Для підбору потрібно звірити розрахункове теплове навантаження, вид палива, робочий тиск, температурний режим, габарити, підключення та вимоги до димоходу або суміжного обладнання. Непідтверджені значення до картки не додавалися.";
  const sections = [
    { title: "Опис", paragraphs: [intro] },
    { title: "Призначення", paragraphs: [purpose] },
    { title: "Конструкція та функції", paragraphs: [construction] },
    { title: "Параметри конкретного виконання", paragraphs: [parameterText] },
    { title: "Підбір і монтаж", paragraphs: [selection] }
  ];
  return {
    sections,
    shortDescription: `${brand} ${model} — ${classification.type.toLocaleLowerCase("uk")} серії «${series}» для ${sentenceList(applications.slice(0, 1)) || "застосування за офіційним призначенням виробника"}.`,
    fullDescription: sections.flatMap(section => section.paragraphs).join("\n\n")
  };
}

function selectDocuments(record) {
  const documents = [...new Map((record.documents || []).filter(document => !UNAVAILABLE_DOCUMENT_URLS.has(document.url)).map(document => [document.url, {
    type: "PDF",
    title: clean(document.title) || decodeURIComponent(path.basename(new URL(document.url).pathname)),
    language: "Українська",
    url: document.url
  }])).values()];
  const signature = document => `${document.title} ${document.url}`;
  const certificate = documents.find(document => /сертиф|certificate|sv_ua|відповідност/i.test(signature(document)));
  const declaration = documents.find(document => /декларац|declaration|dv_ua/i.test(signature(document)));
  const manual = documents.find(document => /паспорт|інструкц|manual|tp-|seria_|ecomax/i.test(signature(document))) || documents[0];
  const datasheet = documents.find(document => /характерист|datasheet|catalog|каталог/i.test(signature(document))) || manual;
  return { documents, manual, datasheet, certificate: certificate || declaration };
}

function imageFileName(url) {
  const parsed = new URL(url);
  const base = decodeURIComponent(path.basename(parsed.pathname)).replace(/\.(?:avif|webp|png|jpe?g|gif)$/i, "");
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 10);
  const asciiBase = slugify(base)
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${asciiBase.slice(0, 72) || "image"}-${hash}.webp`;
}

async function migrateLegacyImage(url, target) {
  const directory = path.dirname(target);
  const expectedName = path.basename(target);
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 10);
  try {
    const names = await fs.readdir(directory);
    const legacyName = names.find(name => name !== expectedName && name.endsWith(`-${hash}.webp`));
    if (!legacyName) return;
    await fs.rename(path.join(directory, legacyName), target);
  } catch {}
}

function imageType(url, record) {
  if ((record.dimensionImages || []).map(normalizeImageUrl).includes(url)) return "dimensions";
  return /gabar|габар|dimension|dimens|schema|схем|rysun|pasport.*ris/i.test(url) ? "dimensions" : "product";
}

function normalizeImageUrl(url) {
  return String(url || "").replace(/^http:\/\/dev\.altep\.ua\//i, "https://altep.ua/");
}

async function downloadAndConvert(url, target) {
  try {
    const metadata = await sharp(target).metadata();
    if (metadata.width && metadata.height) return { ok: true, width: metadata.width, height: metadata.height, cached: true };
  } catch {}
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*", "user-agent": "Mozilla/5.0 TD-Sofiivka-Catalog/1.0" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const input = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(input).metadata();
      if (!metadata.width || !metadata.height) throw new Error("Invalid image");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await sharp(input)
        .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 89, alphaQuality: 94, effort: 5 })
        .toFile(target);
      const output = await sharp(target).metadata();
      return { ok: true, width: output.width, height: output.height, cached: false };
    } catch (error) {
      if (attempt === 4) return { ok: false, error: String(error) };
      await new Promise(resolve => setTimeout(resolve, attempt * 500));
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
      if ((index + 1) % 100 === 0 || index + 1 === items.length) console.log(`Processed ${index + 1}/${items.length} images`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

function modelName(record) {
  const brand = normalizedBrand(record.brand);
  let model = clean(record.model || record.title);
  model = model.replace(new RegExp(`^(?:${brand}|Feniks|Фенікс|Altep|Альтеп|FOCUS)\\s+`, "iu"), "");
  model = model.replace(/^(?:Котел|Твердопаливний котел|Пелетний котел)\s+/iu, "");
  return model || clean(record.title);
}

async function main() {
  const payload = JSON.parse(await fs.readFile(SOURCE_FILE, "utf8"));
  if (payload.failures?.length) throw new Error(`Source fetch contains ${payload.failures.length} failures`);
  if (payload.products.length !== 864) throw new Error(`Expected 864 source records, received ${payload.products.length}`);

  const imageUrls = unique(payload.products.flatMap(product => (product.gallery || []).map(normalizeImageUrl)));
  const imageResults = new Map();
  await mapLimit(imageUrls, 10, async url => {
    const brandRecord = payload.products.find(product => (product.gallery || []).map(normalizeImageUrl).includes(url));
    const brandFolder = slugify(normalizedBrand(brandRecord.brand));
    const fileName = imageFileName(url);
    const target = path.join(MEDIA_ROOT, brandFolder, fileName);
    await migrateLegacyImage(url, target);
    const result = await downloadAndConvert(url, target);
    imageResults.set(url, { ...result, fileName, brandFolder });
    return result;
  });
  await fs.mkdir(path.dirname(ALTEP_LOGO_FILE), { recursive: true });
  const altepLogo = await downloadAndConvert(ALTEP_LOGO_URL, ALTEP_LOGO_FILE);
  if (!altepLogo.ok) throw new Error(`Altep logo download failed: ${altepLogo.error}`);

  const idCounts = new Map();
  const products = payload.products.map(record => {
    const brand = normalizedBrand(record.brand);
    const model = modelName(record);
    const classification = classify(record);
    const details = technicalDetailsFor({ ...record, model }, classification);
    const applications = applicationsFor(classification);
    const editorial = editorialDescription({ ...record, model }, classification, details, applications);
    const keyFeatures = keyFeaturesFor({ ...record, model }, classification, details);
    const features = featuresFor(record, classification, details);
    const docs = selectDocuments(record);
    const localImages = (record.gallery || []).flatMap(rawUrl => {
      const url = normalizeImageUrl(rawUrl);
      const result = imageResults.get(url);
      if (!result?.ok) return [];
      return [{
        local: `/assets/products/${result.brandFolder}/${result.fileName}`,
        source: url,
        original: url,
        type: imageType(url, record),
        width: result.width,
        height: result.height
      }];
    });
    const images = localImages.map(image => image.local);
    const dimensionDiagram = localImages.find(image => image.type === "dimensions")?.local || "";
    const series = clean(record.series) || brand;
    const seriesId = `${slugify(brand)}-${slugify(series)}`;
    const sourceSlug = new URL(record.manufacturerUrl).pathname.split("/").filter(Boolean).at(-1) || model;
    const baseId = `${slugify(brand)}-${slugify(record.manufacturerCode || sourceSlug || model)}`;
    const ordinal = (idCounts.get(baseId) || 0) + 1;
    idCounts.set(baseId, ordinal);
    const id = ordinal === 1 ? baseId : `${baseId}-${ordinal}`;
    const manufacturerCode = clean(record.manufacturerCode);
    const title = new RegExp(`\\b${brand}\\b`, "iu").test(record.title) ? clean(record.title) : `${classification.type} ${brand} ${model}`;
    const manufacturerUrl = record.manufacturerUrl;
    const sourceUrls = unique([
      manufacturerUrl,
      record.requestedUrl,
      SITEMAPS[brand],
      ...localImages.map(image => image.source),
      ...docs.documents.map(document => document.url)
    ]);
    const compatibility = findDetail(details, [/сумісн/i, /підходить для/i])?.[1] || "";
    const seoTitle = `${title} — характеристики | ТД «Софіївка»`;
    const seoDescription = `${title}: підтверджені характеристики, офіційні фото та документи ${brand}. Допомога з підбором для системи опалення.`;
    return {
      id,
      sku: manufacturerCode || id,
      manufacturerCode,
      manufacturer_code: manufacturerCode,
      ean: clean(record.ean),
      EAN: clean(record.ean),
      brand,
      category: classification.categoryId === "humidification" ? "climate" : "heating",
      sourceCategoryId: classification.sourceCategoryId,
      typeSlug: classification.sourceCategoryId,
      type: classification.type,
      subcategory: classification.categoryId,
      series,
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
      keyFeatures,
      key_features: keyFeatures,
      applications,
      compatibility,
      technicalDetails: details,
      features,
      attributes: [],
      tags: unique([brand.toLocaleLowerCase("uk"), series, classification.type]),
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
      seo: { title: seoTitle, description: seoDescription },
      seoTitle,
      seo_title: seoTitle,
      seoDescription,
      seo_description: seoDescription,
      price: 0,
      currency: "UAH",
      availability: "unknown",
      availabilityLabel: "Наявність уточнюйте",
      condition: "new",
      conditionLabel: "Новий",
      officialCatalogEdition: `Офіційний каталог ${brand}, перевірено ${VERIFIED_ON}`
    };
  });

  const ids = products.map(product => product.id);
  if (new Set(ids).size !== ids.length) throw new Error("Heating-brand product IDs are not unique");
  products.sort((a, b) => a.brand.localeCompare(b.brand, "uk") || a.series.localeCompare(b.series, "uk") || a.model.localeCompare(b.model, "uk", { numeric: true }));
  const seriesLabels = Object.fromEntries([...new Map(products.map(product => [product.seriesId, product.series])).entries()]);
  const output = `(function(){"use strict";const PRODUCTS=${JSON.stringify(products)};window.sofievkaHeatingBrandsSeriesLabels=Object.freeze(${JSON.stringify(seriesLabels)});window.sofievkaHeatingBrandsProducts=Object.freeze(PRODUCTS.map(product=>Object.freeze(product)));})();\n`;
  await fs.writeFile(OUT_FILE, output);

  const byBrand = Object.entries(Object.groupBy(products, product => product.brand)).map(([brand, rows]) => ({
    brand,
    skuCount: rows.length,
    seriesCount: new Set(rows.map(product => product.series)).size,
    categories: Object.entries(Object.groupBy(rows, product => product.subcategory)).map(([category, items]) => ({ category, skuCount: items.length })),
    withImages: rows.filter(product => product.images.length).length,
    withDocuments: rows.filter(product => product.documents.length).length,
    withManufacturerCode: rows.filter(product => product.manufacturerCode).length,
    withEan: rows.filter(product => product.ean).length
  }));
  const report = {
    verifiedOn: VERIFIED_ON,
    sourcePageCounts: payload.urlCounts,
    productCount: products.length,
    byBrand,
    seriesCount: new Set(products.map(product => `${product.brand}:${product.series}`)).size,
    uniqueImageSources: imageUrls.length,
    localizedImages: imageUrls.filter(url => imageResults.get(url)?.ok).length,
    imageReferences: products.reduce((total, product) => total + product.images.length, 0),
    multiImageProducts: products.filter(product => product.images.length > 1).length,
    productsWithoutImage: products.filter(product => !product.images.length).map(product => ({ id: product.id, url: product.manufacturerUrl })),
    productsWithoutTechnicalTable: products.filter(product => product.technicalDetails.length <= 4).map(product => ({ id: product.id, url: product.manufacturerUrl })),
    failedImageDownloads: [...imageResults.entries()].filter(([, result]) => !result.ok).map(([url, result]) => ({ url, error: result.error }))
  };
  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

await main();
