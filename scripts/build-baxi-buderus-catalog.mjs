import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_FILE = path.join(ROOT, "tmp", "baxi-buderus-source", "products.json");
const OUT_FILE = path.join(ROOT, "baxi-buderus-products-data.js");
const REPORT_FILE = path.join(ROOT, "tmp", "baxi-buderus-source", "report.json");
const MEDIA_ROOT = path.join(ROOT, "assets", "products");
const VERIFIED_ON = "2026-09-21";

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
  return (pairs || []).flatMap(pair => {
    const label = clean(pair?.[0]);
    const value = clean(pair?.[1]);
    const key = `${label.toLocaleLowerCase("uk")}\u0000${value.toLocaleLowerCase("uk")}`;
    if (!label || !value || value === "-" || seen.has(key)) return [];
    seen.add(key);
    return [[label, value]];
  });
}

function translateBaxi(value = "") {
  return clean(value)
    .replace(/Конденсационный/giu, "Конденсаційний")
    .replace(/Традиционный/giu, "Традиційний")
    .replace(/открытой камерой сгорания/giu, "відкритою камерою згоряння")
    .replace(/дымоходный/giu, "димохідний")
    .replace(/Настенный/giu, "Настінний")
    .replace(/Одноконтурный котел/giu, "Одноконтурний котел")
    .replace(/Двухконтурный с проточным теплообменником ГВС/giu, "Двоконтурний із проточним теплообмінником ГВП")
    .replace(/Двухконтурный котел со встроенным бойлером/giu, "Двоконтурний котел із вбудованим бойлером")
    .replace(/Зависит от мощности и емкости внешнего бойлера/giu, "Залежить від потужності та місткості зовнішнього бойлера")
    .replace(/Ванна или душ и мойка/giu, "Ванна або душ і мийка")
    .replace(/Душ или мойка и умывальник/giu, "Душ або мийка та умивальник")
    .replace(/кв\.м/giu, "м²");
}

function normalizeDetails(record) {
  const translated = uniquePairs((record.technicalDetails || []).map(([label, value]) => [
    translateBaxi(label)
      .replace(/^Потужність по опаленню, кВт$/i, "Потужність опалення")
      .replace(/^Ефективність \(ККД\),?%$/i, "ККД")
      .replace(/^Тип установки котла$/i, "Монтаж")
      .replace(/^Кількість гарячої води при Δt = 25°C, л\/хв$/i, "Продуктивність ГВП при Δt = 25 °C")
      .replace(/^Розміри \(ВхШхГ\), мм$/i, "Габарити (В×Ш×Г)"),
    translateBaxi(value),
  ]));
  const standard = [
    ["Тип обладнання", record.productType],
    ["Модель", record.model],
    ["Серія", record.series],
    ["Категорія виробника", record.sourceCategory],
  ];
  if (record.manufacturerCode && !translated.some(([label]) => /артикул|артикуляр/i.test(label))) {
    standard.splice(2, 0, ["Артикул виробника", record.manufacturerCode]);
  }
  return uniquePairs([...translated, ...standard]);
}

const APPLICATIONS = Object.freeze({
  "gas-boilers": ["опалення квартири або приватного будинку", "приготування гарячої води — якщо це передбачено конкретним виконанням"],
  "industrial-heating": ["опалення об’єктів із підвищеним тепловим навантаженням", "побудова одиночної або каскадної котельні згідно з документацією виробника"],
  "heat-pumps": ["водяне опалення житлового будинку", "охолодження та приготування гарячої води — якщо функцію підтверджено для моделі"],
  "hot-water-tanks": ["приготування та накопичення побутової гарячої води", "робота разом із сумісним котлом або тепловим насосом"],
  "heat-accumulators": ["акумулювання тепла у водяній системі", "стабілізація роботи джерела тепла та опалювальних контурів"],
  "solar-thermal": ["приготування гарячої води від сонячної енергії", "підтримка низькотемпературного опалення або підігріву басейну — якщо це вказано виробником"],
  automation: ["керування домашньою системою опалення", "регулювання температури та взаємодія із сумісним обладнанням"],
  "boiler-accessories": ["монтаж і комплектація сумісного котельного обладнання", "застосування лише з моделями, зазначеними виробником"],
  "flue-systems": ["відведення продуктів згоряння від сумісних газових котлів", "монтаж димохідної системи відповідно до схеми виробника"],
  "air-conditioners": ["охолодження житлових приміщень", "обігрівання у межах підтвердженого виробником температурного діапазону"],
});

function applicationsFor(record) {
  return [...(APPLICATIONS[record.subcategory] || ["застосування у складі інженерної системи відповідно до документації виробника"])]
    .filter(value => record.subcategory !== "gas-boilers" || !/приготування гарячої води/i.test(value) || (record.technicalDetails || []).some(([label, detail]) => /ГВП|гаряч/i.test(`${label} ${detail}`)));
}

function factCandidates(record, details) {
  const source = [...(record.content?.bullets || []), ...(record.content?.paragraphs || [])]
    .map(translateBaxi)
    .map(value => value.replace(/^[•–—-]\s*/, "").replace(/[.;]+$/, ""))
    .filter(value => 18 <= value.length && value.length <= 280)
    .filter(value => !/^(?:Компанія|Група|Copyright|Підтримка|Контакти)/i.test(value));
  const technical = details
    .filter(([label]) => !/^(?:Модель|Серія|Категорія виробника)$/i.test(label))
    .map(([label, value]) => `${label}: ${value}`);
  return unique([...technical, ...source]);
}

function keyFeaturesFor(record, details) {
  const preferred = [/потужн/i, /об.?єм|містк/i, /ккд|ефективн/i, /продуктивн/i, /енергоспожив|клас енерг/i, /тиск/i, /температур/i, /габарит|розмір/i, /захист/i, /холодоагент/i, /модуляц/i, /керув/i];
  const candidates = factCandidates(record, details);
  const result = [];
  for (const pattern of preferred) {
    const fact = candidates.find(value => pattern.test(value));
    if (fact && !result.includes(fact)) result.push(fact);
    if (result.length >= 8) break;
  }
  for (const fact of candidates) {
    if (!result.includes(fact)) result.push(fact);
    if (result.length >= 8) break;
  }
  for (const fallback of [`Тип обладнання: ${record.productType}`, `Серія: ${record.series}`, `Модель: ${record.model}`, `Виробник: ${record.brand}`]) {
    if (!result.includes(fallback)) result.push(fallback);
    if (result.length >= 5) break;
  }
  return result.slice(0, 8);
}

function sentenceList(values) {
  return values.map(value => clean(value).replace(/[.;]+$/, "").replace(/^./u, first => first.toLocaleLowerCase("uk"))).join("; ");
}

function editorialDescription(record, details, applications, keyFeatures) {
  const type = clean(record.productType).toLocaleLowerCase("uk");
  const intro = `${record.brand} ${record.model} — ${type} серії «${record.series}». Наведені параметри та сумісність стосуються цього виконання або продуктової лінійки й підтверджені офіційним каталогом ${record.brand}.`;
  const purpose = `Обладнання розраховане на такі задачі: ${sentenceList(applications)}.`;
  const confirmed = keyFeatures.filter(value => !/^(?:Тип обладнання|Серія|Модель|Виробник):/i.test(value)).slice(0, 5);
  const construction = confirmed.length
    ? `Серед підтверджених виробником особливостей: ${sentenceList(confirmed)}.`
    : "Окремий перелік конструктивних особливостей для цього виконання виробник не публікує; непідтверджені переваги до опису не додавалися.";
  const parameters = details.filter(([label]) => !/^(?:Тип обладнання|Модель|Серія|Категорія виробника)$/i.test(label)).slice(0, 12);
  const parameterText = parameters.length
    ? `Для цієї моделі підтверджено такі дані: ${parameters.map(([label, value]) => `${label.toLocaleLowerCase("uk")}: ${value}`).join("; ")}.`
    : "Числову таблицю параметрів для цієї продуктової сторінки виробник не опублікував у текстовому вигляді. Непідтверджені дані до картки не додавалися.";
  let selection = "Перед замовленням потрібно звірити теплове навантаження, схему системи, габарити, підключення, електроживлення та вимоги до монтажу з документацією виробника.";
  if (["automation", "boiler-accessories", "flue-systems"].includes(record.subcategory)) {
    selection = "Перед замовленням потрібно звірити сумісність із точною моделлю та виконанням основного обладнання. Сумісність вважається підтвердженою лише тоді, коли її прямо вказує виробник.";
  }
  const sections = [
    { title: "Опис", paragraphs: [intro] },
    { title: "Призначення", paragraphs: [purpose] },
    { title: "Конструкція та функції", paragraphs: [construction] },
    { title: "Параметри конкретного виконання", paragraphs: [parameterText] },
    { title: "Підбір і монтаж", paragraphs: [selection] },
  ];
  return {
    sections,
    shortDescription: `${record.brand} ${record.model} — ${type} для ${sentenceList(applications.slice(0, 1))}.`,
    fullDescription: sections.flatMap(section => section.paragraphs).join("\n\n"),
  };
}

function selectDocuments(record) {
  const documents = [...new Map((record.documents || []).map(document => [document.url, {
    type: "PDF",
    title: clean(document.title) || decodeURIComponent(path.basename(new URL(document.url).pathname)),
    language: "Українська",
    url: document.url,
  }])).values()];
  const signature = document => `${document.title} ${document.url}`;
  const certificate = documents.find(document => /сертиф|certificate|відповідност/i.test(signature(document)));
  const manual = documents.find(document => /інструкц|монтаж|експлуатац|manual|installation|operation/i.test(signature(document))) || documents[0];
  const datasheet = documents.find(document => /характерист|datasheet|catalog|каталог|product|erp|energy/i.test(signature(document))) || documents[0];
  return { documents, manual, datasheet, certificate };
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

function imageType(url) {
  if (/\/table(?:_|\/)|tables|schema|scheme|dimens|diagram|accessor/i.test(url)) return "dimensions";
  return "product";
}

function productImageUrls(record) {
  return unique((record.gallery || []).filter(url => {
    if (record.brand === "BAXI") {
      return /\/assets\/uploads\/images\/image_boiler\/e-catalog\//i.test(url);
    }
    return !/(?:award|diplom|certificate|badge|medal)/i.test(url);
  }));
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
        headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*", "user-agent": "Mozilla/5.0 TD-Sofiivka-Catalog/1.0" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const input = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(input).metadata();
      if (!metadata.width || !metadata.height) throw new Error("Invalid image");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await sharp(input)
        .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90, alphaQuality: 95, effort: 5 })
        .toFile(target);
      const output = await sharp(target).metadata();
      return { ok: true, width: output.width, height: output.height, cached: false };
    } catch (error) {
      if (attempt === 4) return { ok: false, error: String(error) };
      await new Promise(resolve => setTimeout(resolve, attempt * 700));
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
      if ((index + 1) % 25 === 0 || index + 1 === items.length) console.log(`Processed ${index + 1}/${items.length} images`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

function compatibilityFor(record, details) {
  const detail = details.find(([label]) => /сумісн|підходить|для котл/i.test(label));
  if (detail) return detail[1];
  return [...(record.content?.bullets || []), ...(record.content?.paragraphs || [])]
    .map(translateBaxi)
    .find(value => /(?:сумісн|підключ.*(?:котл|бак|бойлер)|для котлів)/i.test(value)) || "";
}

async function main() {
  const payload = JSON.parse(await fs.readFile(SOURCE_FILE, "utf8"));
  if (payload.failures?.length) throw new Error(`Source fetch contains ${payload.failures.length} failures`);
  const imageUrls = unique(payload.products.flatMap(productImageUrls));
  const imageResults = new Map();
  await mapLimit(imageUrls, 8, async url => {
    const record = payload.products.find(product => productImageUrls(product).includes(url));
    const brandFolder = slugify(record.brand);
    const fileName = imageFileName(url);
    const target = path.join(MEDIA_ROOT, brandFolder, fileName);
    const result = await downloadAndConvert(url, target);
    imageResults.set(url, { ...result, fileName, brandFolder });
    return result;
  });

  const idCounts = new Map();
  const products = payload.products.map(sourceRecord => {
    const record = sourceRecord.brand === "BAXI" ? {
      ...sourceRecord,
      model: clean(sourceRecord.model).replace(/\bDou-tec\b/gi, "Duo-tec"),
      series: clean(sourceRecord.series).replace(/\bDou-tec\b/gi, "Duo-tec"),
      title: clean(sourceRecord.title).replace(/\bDou-tec\b/gi, "Duo-tec"),
    } : sourceRecord;
    const details = normalizeDetails(record);
    const applications = applicationsFor(record);
    const keyFeatures = keyFeaturesFor(record, details);
    const editorial = editorialDescription(record, details, applications, keyFeatures);
    const docs = selectDocuments(record);
    const localImages = productImageUrls(record).flatMap(url => {
      const result = imageResults.get(url);
      if (!result?.ok) return [];
      return [{
        local: `/assets/products/${result.brandFolder}/${result.fileName}`,
        source: url,
        original: url,
        type: imageType(url),
        width: result.width,
        height: result.height,
      }];
    }).sort((a, b) => (a.type === "product" ? 0 : 1) - (b.type === "product" ? 0 : 1));
    const images = localImages.map(image => image.local);
    const seriesId = `${slugify(record.brand)}-${slugify(record.series)}`;
    const pathSlug = new URL(record.manufacturerUrl).pathname.split("/").filter(Boolean).at(-1) || record.model;
    const baseId = `${slugify(record.brand)}-${slugify(record.manufacturerCode || record.model || pathSlug)}`;
    const ordinal = (idCounts.get(baseId) || 0) + 1;
    idCounts.set(baseId, ordinal);
    const id = ordinal === 1 ? baseId : `${baseId}-${ordinal}`;
    const sourceCategoryId = `${slugify(record.brand)}-${record.subcategory}`;
    const manufacturerUrl = record.manufacturerUrl;
    const sourceUrls = unique([
      manufacturerUrl,
      record.requestedUrl,
      record.ecatalogUrl,
      payload.sources?.[record.brand === "BAXI" ? "baxiSitemap" : "buderusSitemap"],
      ...localImages.map(image => image.source),
      ...docs.documents.map(document => document.url),
    ]);
    const compatibility = compatibilityFor(record, details);
    const seoTitle = `${record.title} — характеристики | ТД «Софіївка»`;
    const seoDescription = `${record.title}: підтверджені характеристики, офіційні фото та документи ${record.brand}. Підбір обладнання для інженерної системи.`;
    const availability = record.archived ? "discontinued" : "unknown";
    return {
      id,
      sku: clean(record.manufacturerCode) || id,
      manufacturerCode: clean(record.manufacturerCode),
      manufacturer_code: clean(record.manufacturerCode),
      ean: clean(record.ean),
      EAN: clean(record.ean),
      brand: record.brand,
      category: record.category,
      sourceCategoryId,
      typeSlug: sourceCategoryId,
      type: record.productType,
      subcategory: record.subcategory,
      series: record.series,
      seriesId,
      model: record.model,
      title: record.title,
      productName: record.title,
      product_name: record.title,
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
      features: {},
      attributes: [],
      tags: unique([record.brand.toLocaleLowerCase("uk"), record.series, record.productType, record.domesticConfirmed ? "побутове" : ""]),
      image: images[0] || "",
      mainImage: images[0] || "",
      main_image: images[0] || "",
      images,
      galleryImages: images,
      gallery_images: images,
      dimensionDiagram: localImages.find(image => image.type === "dimensions")?.local || "",
      dimension_diagram: localImages.find(image => image.type === "dimensions")?.local || "",
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
      availability,
      availabilityLabel: record.archived ? "Знято з виробництва" : "Наявність уточнюйте",
      condition: "new",
      conditionLabel: "Новий",
      domestic: record.brand === "Buderus" ? true : undefined,
      officialCatalogEdition: `Офіційний каталог ${record.brand}, перевірено ${VERIFIED_ON}`,
    };
  });

  const ids = products.map(product => product.id);
  if (new Set(ids).size !== ids.length) throw new Error("BAXI/Buderus product IDs are not unique");
  products.sort((a, b) => a.brand.localeCompare(b.brand, "uk") || Number(Boolean(b.image)) - Number(Boolean(a.image)) || a.series.localeCompare(b.series, "uk") || a.model.localeCompare(b.model, "uk", { numeric: true }));
  const seriesLabels = Object.fromEntries([...new Map(products.map(product => [product.seriesId, product.series])).entries()]);
  const output = `(function(){"use strict";const PRODUCTS=${JSON.stringify(products)};window.sofievkaBaxiBuderusSeriesLabels=Object.freeze(${JSON.stringify(seriesLabels)});window.sofievkaBaxiBuderusProducts=Object.freeze(PRODUCTS.map(product=>Object.freeze(product)));})();\n`;
  await fs.writeFile(OUT_FILE, output);

  const byBrand = Object.entries(Object.groupBy(products, product => product.brand)).map(([brand, rows]) => ({
    brand,
    skuCount: rows.length,
    seriesCount: new Set(rows.map(product => product.series)).size,
    categories: Object.entries(Object.groupBy(rows, product => product.subcategory)).map(([category, items]) => ({ category, skuCount: items.length })),
    withImages: rows.filter(product => product.images.length).length,
    withDocuments: rows.filter(product => product.documents.length).length,
    withManufacturerCode: rows.filter(product => product.manufacturerCode).length,
    withEan: rows.filter(product => product.ean).length,
    discontinued: rows.filter(product => product.availability === "discontinued").length,
  }));
  const report = {
    verifiedOn: VERIFIED_ON,
    sourceScope: payload.scope,
    productCount: products.length,
    byBrand,
    seriesCount: new Set(products.map(product => `${product.brand}:${product.series}`)).size,
    uniqueImageSources: imageUrls.length,
    localizedImages: imageUrls.filter(url => imageResults.get(url)?.ok).length,
    imageReferences: products.reduce((total, product) => total + product.images.length, 0),
    multiImageProducts: products.filter(product => product.images.length > 1).length,
    productsWithoutImage: products.filter(product => !product.images.length).map(product => ({ id: product.id, url: product.manufacturerUrl })),
    productsWithoutDocuments: products.filter(product => !product.documents.length).map(product => ({ id: product.id, url: product.manufacturerUrl })),
    productsWithoutManufacturerCode: products.filter(product => !product.manufacturerCode).length,
    productsWithoutEan: products.filter(product => !product.ean).length,
    failedImageDownloads: [...imageResults.entries()].filter(([, result]) => !result.ok).map(([url, result]) => ({ url, error: result.error })),
  };
  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.failedImageDownloads.length) throw new Error(`${report.failedImageDownloads.length} image downloads failed`);
}

await main();
