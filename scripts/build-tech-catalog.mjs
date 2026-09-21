import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_FILE = path.join(ROOT, "tmp", "tech-source", "products.json");
const OUT_FILE = path.join(ROOT, "tech-products-data.js");
const REPORT_FILE = path.join(ROOT, "tmp", "tech-source", "report.json");
const MEDIA_DIR = path.join(ROOT, "assets", "products", "tech");
const BRAND_LOGO_FILE = path.join(ROOT, "assets", "brands", "tech.webp");
const BRAND_LOGO_URL = "https://tech-controllers.com/views/images/logo_lang.png";
const CATALOG_URL = "https://tech-controllers.com/ua/k/kontroleri";
const SITEMAP_URL = "https://tech-controllers.com/ua/sitemap.xml";
const VERIFIED_ON = "2026-09-21";

function clean(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/&divide;/gi, "÷")
    .replace(/&plusmn;/gi, "±")
    .replace(/&Omega;/gi, "Ω")
    .replace(/&micro;/gi, "µ")
    .replace(/&sup2;/gi, "²")
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

function uniquePairs(pairs) {
  const seen = new Set();
  return pairs.filter(([label, value]) => {
    const key = `${clean(label).toLocaleLowerCase("uk")}\u0000${clean(value).toLocaleLowerCase("uk")}`;
    if (!label || !value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedModel(value) {
  return clean(value).toLocaleLowerCase("uk").replace(/[^a-z0-9а-яіїєґ]+/giu, "");
}

function richness(product) {
  return product.technicalDetails.length * 12 + product.gallery.length * 3 + product.documents.length * 2 + product.content.bullets.length + product.content.paragraphs.length + product.breadcrumbs.length * 4;
}

function mergeProducts(records) {
  const selected = [...records].sort((a, b) => richness(b) - richness(a))[0];
  const breadcrumbs = [...records].sort((a, b) => b.breadcrumbs.length - a.breadcrumbs.length)[0]?.breadcrumbs || [];
  return {
    ...selected,
    requestedUrls: unique(records.flatMap(record => [record.requestedUrl, record.finalUrl, record.canonicalUrl])),
    breadcrumbs,
    gallery: unique(records.flatMap(record => record.gallery)),
    technicalDetails: uniquePairs(records.flatMap(record => record.technicalDetails)),
    documents: [...new Map(records.flatMap(record => record.documents).map(document => [document.url, document])).values()],
    content: {
      headings: unique(records.flatMap(record => record.content.headings)),
      paragraphs: unique(records.flatMap(record => record.content.paragraphs)),
      bullets: unique(records.flatMap(record => record.content.bullets))
    }
  };
}

function classify(product) {
  const root = product.breadcrumbs[0]?.title || "";
  const leaf = (product.breadcrumbs.at(-1)?.title || "Інші пристрої TECH").replace(/^Серія\s+/iu, "");
  if (/^sinum$/i.test(root)) return { sourceCategoryId: "tech-sinum", category: "heating", kind: "sinum", series: leaf };
  if (/додаткове обладнання/i.test(root)) return { sourceCategoryId: "tech-accessories", category: "heating", kind: "accessory", series: leaf };
  return { sourceCategoryId: "tech-automation", category: "heating", kind: "controller", series: leaf };
}

function deriveType(product, classification) {
  const model = clean(product.model);
  let type = clean(product.subtitle)
    .replace(new RegExp(`\\s*[-–—]\\s*${escapeRegExp(model)}\\s*$`, "iu"), "")
    .replace(new RegExp(`\\b${escapeRegExp(model)}\\b`, "iu"), "")
    .replace(/\s*[-–—:]\s*$/, "")
    .trim();
  if (!type || normalizedModel(type) === normalizedModel(model)) type = classification.series;
  if (/^серія\s+/iu.test(type) || /^інші пристрої/iu.test(type)) {
    type = classification.kind === "sinum" ? "Компонент системи автоматизації Sinum" : classification.kind === "accessory" ? "Компонент автоматики" : "Контролер системи опалення";
  }
  return type;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findDetail(details, patterns) {
  return details.find(([label]) => patterns.some(pattern => pattern.test(label)));
}

function numeric(value) {
  const match = clean(value).replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function inferInstallation(product, details) {
  const explicit = findDetail(details, [/монтаж/i, /спосіб встановлення/i])?.[1];
  if (explicit) return explicit;
  const source = `${product.subtitle} ${product.breadcrumbs.map(item => item.title).join(" ")} ${product.content.bullets.join(" ")}`;
  if (/din[- ]?рейк/i.test(source)) return "DIN-рейка";
  if (/підрозетник|прихован/i.test(source)) return "Прихований монтаж";
  if (/поверхнев|настін/i.test(source)) return "Накладний / настінний монтаж";
  return "";
}

function normalizedFeatures(product, details, type) {
  const features = { productType: type };
  const textFeature = (id, patterns) => {
    const row = findDetail(details, patterns);
    if (row) features[id] = clean(row[1]);
  };
  textFeature("voltage", [/електроживлення/i, /^живлення$/i, /^напруга$/i]);
  textFeature("protectionClass", [/ступінь захисту/i, /клас захисту/i, /^ip$/i]);
  textFeature("temperature", [/діапазон.*температур/i, /робоча температура/i, /температура.*налаштування/i]);
  textFeature("communication", [/комунікац/i, /тип зв.?язку/i, /^зв.?язок$/i]);
  textFeature("compatibility", [/сумісн/i, /взаємодіє з/i, /працює з/i]);
  textFeature("dimensions", [/розмір/i, /габарит/i]);
  const installation = inferInstallation(product, details);
  if (installation) features.installation = installation;
  const source = `${product.subtitle} ${product.breadcrumbs.map(item => item.title).join(" ")} ${product.content.bullets.join(" ")}`;
  if (/бездротов/i.test(source)) features.control = "Бездротове";
  else if (/дротов/i.test(source)) features.control = "Дротове";
  else if (/wi-?fi/i.test(source)) features.control = "Wi-Fi";
  const zonesRow = findDetail(details, [/кількість зон/i, /кількість.*приміщ/i]);
  const zonesFromText = source.match(/(?:контроль температури (?:у|в)|керува(?:ти|ння)|контролювати)\s*(?:температур(?:ою|и)\s*)?(?:до\s*)?(\d+)\s*(?:різн\w+\s*)?(?:приміщ|зон|кол)/iu)?.[1]
    || source.match(/(?:до\s*)?(\d+)\s*(?:приміщ|зон|кол)/iu)?.[1];
  const zones = numeric(zonesRow?.[1] || zonesFromText || "");
  if (Number.isFinite(zones)) features.zones = zones;
  const outputs = numeric(findDetail(details, [/кількість виходів/i, /виходи.*кількість/i])?.[1]);
  if (Number.isFinite(outputs)) features.outlets = outputs;
  return features;
}

function applications(product, classification) {
  const leaf = classification.series;
  const values = [];
  if (classification.kind === "sinum") values.push("Автоматизація будинку в екосистемі TECH Sinum");
  else if (classification.kind === "accessory") values.push(`Комплектування систем TECH: ${leaf.toLocaleLowerCase("uk")}`);
  else values.push(`Керування системою опалення: ${leaf.toLocaleLowerCase("uk")}`);
  const source = `${product.subtitle} ${leaf} ${product.content.bullets.join(" ")}`;
  if (/підлогов/i.test(source)) values.push("Зональне керування водяною теплою підлогою");
  if (/радіатор/i.test(source)) values.push("Керування радіаторним опаленням");
  if (/насос/i.test(source)) values.push("Керування насосом системи опалення або ГВП відповідно до функцій моделі");
  if (/змішувальн.*клапан/i.test(source)) values.push("Керування змішувальним клапаном");
  if (/освітлен/i.test(source)) values.push("Керування освітленням у системі Sinum");
  if (/ролет/i.test(source)) values.push("Керування ролетами у системі Sinum");
  if (/якість повітря|co2|волог/i.test(source)) values.push("Контроль параметрів повітря");
  return unique(values);
}

function confirmedFunctionBullets(product) {
  return unique(product.content.bullets
    .map(value => clean(value).replace(/^[•–—-]\s*/, "").replace(/[.;]+$/, ""))
    .filter(value => value.length >= 5 && value.length <= 280 && !/^(?:завантажити|home)$/iu.test(value)))
    .slice(0, 12);
}

function technicalDetails(product, classification, type) {
  return uniquePairs([
    ...product.technicalDetails.map(([label, value]) => [clean(label), clean(value)]),
    ["Модель", clean(product.model)],
    ["Тип обладнання", type],
    ["Серія / група", classification.series],
    ["Категорія виробника", product.breadcrumbs.map(item => item.title).join(" › ") || "TECH Controllers"]
  ]);
}

function keyFeatures(product, details, classification, type) {
  const preferred = [
    /електроживлення/i, /комунікац/i, /ступінь захисту/i, /діапазон.*температур/i,
    /вихідн.*навантаж/i, /контакт/i, /розмір/i, /кількість зон/i, /точність/i
  ];
  const result = [];
  for (const pattern of preferred) {
    const row = details.find(([label]) => pattern.test(label));
    if (row && !result.some(value => value.startsWith(`${row[0]}:`))) result.push(`${row[0]}: ${row[1]}`);
    if (result.length >= 8) break;
  }
  for (const bullet of confirmedFunctionBullets(product)) {
    if (!result.some(value => value.toLocaleLowerCase("uk") === bullet.toLocaleLowerCase("uk"))) result.push(bullet);
    if (result.length >= 8) break;
  }
  const fallback = [`Тип обладнання: ${type}`, `Серія / група: ${classification.series}`, `Модель: ${product.model}`];
  for (const value of fallback) {
    if (!result.some(item => item.toLocaleLowerCase("uk") === value.toLocaleLowerCase("uk"))) result.push(value);
    if (result.length >= 5) break;
  }
  return result.slice(0, 8);
}

function description(product, classification, type, details, featureList, applicationList) {
  const model = clean(product.model);
  const functions = confirmedFunctionBullets(product).slice(0, 6);
  const parameterRows = details.filter(([label]) => !/^(?:модель|тип обладнання|серія|категорія)/i.test(label)).slice(0, 9);
  const functionsText = functions.length
    ? `За офіційною карткою модель підтримує такі функції: ${functions.map(value => value.charAt(0).toLocaleLowerCase("uk") + value.slice(1)).join("; ")}.`
    : `Функціональне призначення моделі визначене виробником у групі «${classification.series}».`;
  const parametersText = parameterRows.length
    ? `Для конкретного виконання TECH ${model} виробник наводить: ${parameterRows.map(([label, value]) => `${label.toLocaleLowerCase("uk")}: ${value}`).join("; ")}.`
    : `На офіційній сторінці TECH ${model} окрема таблиця електричних або монтажних параметрів не опублікована; тому непідтверджені значення не додавались.`;
  const sections = [
    { title: "Опис", paragraphs: [`TECH ${model} — ${type.charAt(0).toLocaleLowerCase("uk") + type.slice(1)}. Модель належить до офіційної групи «${classification.series}».`] },
    { title: "Призначення", paragraphs: [`Обладнання застосовують для таких задач: ${applicationList.map(value => value.charAt(0).toLocaleLowerCase("uk") + value.slice(1)).join("; ")}.`] },
    { title: "Функції", paragraphs: [functionsText] },
    { title: "Параметри конкретної моделі", paragraphs: [parametersText] },
    { title: "Підбір і сумісність", paragraphs: ["Перед замовленням потрібно звірити спосіб зв’язку, напругу живлення, монтажне виконання, кількість зон і сумісність з іншими компонентами системи. Значення сумісності вказуються лише тоді, коли їх прямо підтверджує TECH Controllers."] }
  ];
  return {
    sections,
    shortDescription: `TECH ${model} — ${type.charAt(0).toLocaleLowerCase("uk") + type.slice(1)} для ${classification.series.toLocaleLowerCase("uk")}.`,
    fullDescription: sections.flatMap(section => section.paragraphs).join("\n\n")
  };
}

function isUkrainianDocument(document) {
  const value = `${document.title} ${new URL(document.url).pathname}`;
  return /(?:^|[_\s.-])ua(?:[_\s.-]|$)|ukr|україн|гарант/i.test(value);
}

function isDeclaration(document) {
  return /declar|deklar|відповідност|certyf|certificate/i.test(`${document.title} ${document.url}`);
}

function selectDocuments(product) {
  const official = [...new Map(product.documents.map(document => [document.url, document])).values()];
  const selected = official.filter(document => isUkrainianDocument(document) || isDeclaration(document));
  const documents = (selected.length ? selected : official.slice(0, 1)).map(document => ({
    type: "PDF",
    title: /гарант/i.test(document.title) ? "Гарантійний талон TECH" : clean(document.title),
    language: isUkrainianDocument(document) ? "Українська" : "",
    url: document.url
  }));
  const manual = documents.find(document => !/гарант|declar|deklar|відповідност/i.test(document.title));
  const datasheet = documents.find(document => /karta|datasheet|specification|технічн.*дан/i.test(`${document.title} ${document.url}`));
  const certificate = documents.find(document => isDeclaration(document));
  return { documents, manual, datasheet, certificate };
}

function imageFileName(url) {
  const parsed = new URL(url);
  const base = path.basename(parsed.pathname).replace(/\.(?:avif|webp|png|jpe?g)(?:\.webp)?$/i, "");
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 10);
  return `${slugify(base).slice(0, 64) || "image"}-${hash}.webp`;
}

function imageType(url) {
  return /wymiar|rozmiar|dimension|rysunek|schemat|schema|podlaczen|podłączeń|габарит|розмір|схем/i.test(url) ? "dimensions" : "product";
}

async function downloadAndConvert(url, target) {
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
      await sharp(input).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 89, alphaQuality: 94, effort: 5 }).toFile(target);
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
      if ((index + 1) % 100 === 0) console.log(`Processed ${index + 1}/${items.length} images`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

async function main() {
  const payload = JSON.parse(await fs.readFile(SOURCE_FILE, "utf8"));
  const grouped = Object.groupBy(payload.products, product => normalizedModel(product.model));
  const merged = Object.values(grouped).map(mergeProducts);
  if (merged.length !== 257) throw new Error(`Expected 257 unique TECH models, received ${merged.length}`);

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const imageUrls = unique(merged.flatMap(product => product.gallery));
  const imageResults = new Map();
  await mapLimit(imageUrls, 10, async url => {
    const fileName = imageFileName(url);
    const result = await downloadAndConvert(url, path.join(MEDIA_DIR, fileName));
    imageResults.set(url, { ...result, fileName });
    return result;
  });
  await fs.mkdir(path.dirname(BRAND_LOGO_FILE), { recursive: true });
  const logoResult = await downloadAndConvert(BRAND_LOGO_URL, BRAND_LOGO_FILE);
  if (!logoResult.ok) throw new Error(`TECH logo download failed: ${logoResult.error}`);

  const products = merged.map(record => {
    const classification = classify(record);
    const type = deriveType(record, classification);
    const details = technicalDetails(record, classification, type);
    const featureList = keyFeatures(record, details, classification, type);
    const applicationList = applications(record, classification);
    const editorial = description(record, classification, type, details, featureList, applicationList);
    const docs = selectDocuments(record);
    const localImages = record.gallery.flatMap(url => {
      const result = imageResults.get(url);
      return result?.ok ? [{
        local: `/assets/products/tech/${result.fileName}`,
        source: url,
        original: url,
        type: imageType(url),
        width: result.width,
        height: result.height
      }] : [];
    });
    const images = localImages.map(image => image.local);
    const dimensionDiagram = localImages.find(image => image.type === "dimensions")?.local || "";
    const features = normalizedFeatures(record, details, type);
    const compatibility = features.compatibility || "";
    const seriesId = `tech-${slugify(classification.series)}`;
    const title = `${type} TECH ${clean(record.model)}`.replace(/\s{2,}/g, " ").trim();
    const manufacturerUrl = record.canonicalUrl;
    const sourceUrls = unique([
      manufacturerUrl,
      ...record.requestedUrls,
      CATALOG_URL,
      SITEMAP_URL,
      ...localImages.map(image => image.source),
      ...docs.documents.map(document => document.url)
    ]);
    const seoDescription = `${title}: офіційні характеристики, функції, фото та документи TECH Controllers українською.`;
    return {
      id: `tech-${slugify(record.model)}`,
      sku: clean(record.model),
      manufacturerCode: clean(record.model),
      manufacturer_code: clean(record.model),
      ean: "",
      EAN: "",
      brand: "TECH",
      category: classification.category,
      sourceCategoryId: classification.sourceCategoryId,
      typeSlug: classification.sourceCategoryId,
      type,
      subcategory: classification.series,
      series: classification.series,
      seriesId,
      model: clean(record.model),
      title,
      productName: title,
      product_name: title,
      shortDescription: editorial.shortDescription,
      short_description: editorial.shortDescription,
      fullDescription: editorial.fullDescription,
      full_description: editorial.fullDescription,
      description: editorial.fullDescription,
      descriptionSections: editorial.sections,
      keyFeatures: featureList,
      key_features: featureList,
      applications: applicationList,
      compatibility,
      technicalDetails: details,
      features,
      attributes: [],
      tags: ["tech", "tech controllers", "tech sterowniki", ...(classification.kind === "sinum" ? ["sinum"] : [])],
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
      seo: { title: `${title} — характеристики | ТД «Софіївка»`, description: seoDescription },
      seoTitle: `${title} — характеристики | ТД «Софіївка»`,
      seo_title: `${title} — характеристики | ТД «Софіївка»`,
      seoDescription,
      seo_description: seoDescription,
      price: 0,
      currency: "UAH",
      availability: "unknown",
      availabilityLabel: "Наявність уточнюйте",
      condition: "new",
      conditionLabel: "Новий",
      officialCatalogEdition: `Офіційний каталог TECH Controllers, перевірено ${VERIFIED_ON}`
    };
  });

  const ids = products.map(product => product.id);
  if (new Set(ids).size !== ids.length) throw new Error("TECH product IDs are not unique");
  products.sort((a, b) => a.series.localeCompare(b.series, "uk") || a.model.localeCompare(b.model, "uk", { numeric: true }));
  const seriesLabels = Object.fromEntries([...new Map(products.map(product => [product.seriesId, product.series])).entries()]);
  const output = `(function(){"use strict";const PRODUCTS=${JSON.stringify(products)};window.sofievkaTechSeriesLabels=Object.freeze(${JSON.stringify(seriesLabels)});window.sofievkaTechProducts=Object.freeze(PRODUCTS.map(product=>Object.freeze(product)));})();\n`;
  await fs.writeFile(OUT_FILE, output);

  const report = {
    verifiedOn: VERIFIED_ON,
    source: CATALOG_URL,
    sitemapUrlCount: payload.sitemapUrlCount,
    uniqueModelCount: products.length,
    duplicatePagesMerged: payload.products.length - products.length,
    seriesCount: new Set(products.map(product => product.series)).size,
    sourceCategories: Object.entries(Object.groupBy(products, product => product.sourceCategoryId)).map(([id, rows]) => ({ id, skuCount: rows.length })),
    withOfficialTechnicalTable: merged.filter(product => product.technicalDetails.length).length,
    withLocalImages: products.filter(product => product.images.length).length,
    imageReferences: products.reduce((total, product) => total + product.images.length, 0),
    uniqueLocalImages: new Set(products.flatMap(product => product.images)).size,
    multiImageProducts: products.filter(product => product.images.length > 1).length,
    withDocuments: products.filter(product => product.documents.length).length,
    manualCoverage: products.filter(product => product.manualPdf).length,
    certificateCoverage: products.filter(product => product.certificatePdf).length,
    eanCoverage: products.filter(product => product.ean).length,
    missingImages: products.filter(product => !product.images.length).map(product => ({ model: product.model, url: product.manufacturerUrl })),
    sparseTechnicalData: products.filter(product => product.technicalDetails.length <= 4).map(product => ({ model: product.model, url: product.manufacturerUrl })),
    failedImageDownloads: [...imageResults.entries()].filter(([, result]) => !result.ok).map(([url, result]) => ({ url, error: result.error }))
  };
  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

await main();
