import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "hunter-products-data.js");
const ASSET_DIR = path.join(ROOT, "assets", "products", "hunter");
const VERIFIED_AT = "2026-11-25";
const OFFICIAL_BASE = "https://www.hunterirrigation.com/en-metric/irrigation-product";

const ITEMS = [
  ["PGJ", "rotors/pgj", "irrigation-rotors"],
  ["SRM", "rotors/srm", "irrigation-rotors"],
  ["PGP-ADJ", "rotors/pgp-adj", "irrigation-rotors"],
  ["PGP Ultra", "rotors/pgp-ultra", "irrigation-rotors"],
  ["PGP Ultra & I-20 PRB", "rotors/pgp-ultra-i-20-prb", "irrigation-rotors"],
  ["I-20", "rotors/i-20", "irrigation-rotors"],
  ["I-25", "rotors/i-25", "irrigation-rotors"],
  ["I-40", "rotors/i-40", "irrigation-rotors"],
  ["I-80", "rotors/i-80", "irrigation-rotors"],
  ["I-90", "rotors/i-90", "irrigation-rotors"],
  ["ST-1700-V-B", "st-system/st-1700-v-b", "irrigation-sports"],
  ["ST-1600-KIT-B", "systeme-st/st-1600-kit-b", "irrigation-sports"],
  ["ST-1600-HS-B", "st-system/st-1600-hs-b", "irrigation-sports"],
  ["ST-1600-HS-BR", "st-system/st-1600-hs-br", "irrigation-sports"],
  ["ST-1200-BR", "st-system/st-1200-br", "irrigation-sports"],
  ["ST-90-B", "st-system/st-90-b", "irrigation-sports", false],
  ["STG-900", "st-system/stg-900", "irrigation-sports"],
  ["Standard MP Rotator Nozzle", "mp-rotator/standard-mp-rotator-nozzle", "irrigation-mp-nozzles"],
  ["MP Rotator MP800 Nozzle", "mp-rotator/mp-rotatorr-mp800-nozzle", "irrigation-mp-nozzles"],
  ["MP Rotator Strip Nozzle", "mp-rotator/mp-rotatortm-strip-nozzle", "irrigation-mp-nozzles"],
  ["MP Rotator Stake Kit", "mp-rotator/mp-rotatortm-stake-kit", "irrigation-mp-nozzles"],
  ["Pro High-Efficiency Nozzles", "nozzles/pro-high-efficiency-nozzles", "irrigation-spray-nozzles"],
  ["Pro Adjustable Nozzles", "nozzles/pro-adjustable-nozzles", "irrigation-spray-nozzles"],
  ["Pro Fixed Nozzles", "nozzles/pro-fixed-nozzles", "irrigation-spray-nozzles"],
  ["Strip Pattern Nozzles", "nozzles/strip-pattern-nozzles", "irrigation-spray-nozzles"],
  ["Short-Radius Micro Spray Nozzles", "nozzles/short-radius-micro-spray-nozzles", "irrigation-spray-nozzles"],
  ["Bubblers & Bubbler Nozzles", "nozzles/bubblers-bubbler-nozzles", "irrigation-spray-nozzles"],
  ["Eco-Rotator", "mp-rotator/eco-rotator", "irrigation-mp-nozzles"],
  ["PS Ultra", "spray-bodies/ps-ultra", "irrigation-spray-bodies"],
  ["Pro-Spray", "spray-bodies/pro-spraytm", "irrigation-spray-bodies"],
  ["Pro-Spray PRS30", "spray-bodies/pro-spraytm-prs30", "irrigation-spray-bodies"],
  ["Pro-Spray PRS40", "spray-bodies/pro-spraytm-prs40", "irrigation-spray-bodies"],
  ["X2 with WAND", "controllers/x2tm-wand", "irrigation-controllers"],
  ["HC", "hydrawise/hc", "irrigation-controllers"],
  ["HC Flow Meter", "sensors/hc-flow-meter", "irrigation-sensors"],
  ["HPC", "controllers/hpc", "irrigation-controllers"],
  ["Pro-HC", "controllers/pro-hc", "irrigation-controllers"],
  ["HCC", "hydrawise/hcc", "irrigation-controllers"],
  ["Eco Logic", "controllers/eco-logic", "irrigation-controllers"],
  ["X-Core", "controllers/x-coretm", "irrigation-controllers"],
  ["Pro-C", "controllers/pro-cr", "irrigation-controllers"],
  ["ICC2", "controllers/icc2", "irrigation-controllers"],
  ["Wireless Valve Link", "controllers/wireless-valve-link", "irrigation-control-accessories"],
  ["EZ Decoder System", "controllers/ez-decoder-system", "irrigation-control-accessories"],
  ["MCC", "controllers/mcc", "irrigation-controllers"],
  ["ACC2", "controllers/acc2", "irrigation-controllers"],
  ["ACC2 Decoder", "controllers/acc2-decoder", "irrigation-controllers"],
  ["BTT", "controllers/btt", "irrigation-controllers"],
  ["NODE-BT", "controllers/node-bt", "irrigation-controllers"],
  ["Node", "controllers/node", "irrigation-controllers"],
  ["XC Hybrid", "controllers/xc-hybrid", "irrigation-controllers"],
  ["ICD-HP", "controllers/icd-hp", "irrigation-control-accessories"],
  ["Pump Start Relay", "controllers/pump-start-relay", "irrigation-control-accessories"],
  ["ICD Decoders", "controllers/icd-decoders", "irrigation-control-accessories", false],
  ["Solar Sync Sensor", "sensors/solar-synctm-sensor", "irrigation-sensors"],
  ["Rain-Clik Sensor", "sensors/rain-cliktm-sensor", "irrigation-sensors"],
  ["Mini-Clik Sensor", "sensors/mini-cliktm-sensor", "irrigation-sensors"],
  ["Soil-Clik Sensor", "sensors/soil-cliktm-sensor", "irrigation-sensors"],
  ["Flow-Clik Sensor", "sensors/flow-cliktm-sensor", "irrigation-sensors"],
  ["Flow-Sync Sensor", "sensors/flow-synctm-sensor", "irrigation-sensors"],
  ["Wireless Flow Sensor", "sensors/wireless-flow-sensor", "irrigation-sensors"],
  ["Wind-Clik Sensor", "sensors/wind-cliktm-sensor", "irrigation-sensors"],
  ["Mini Weather Station", "sensors/mini-weather-station", "irrigation-sensors"],
  ["Freeze-Clik Sensor", "sensors/freeze-cliktm-sensor", "irrigation-sensors"],
  ["Roam", "remotes/roam", "irrigation-remotes"]
];

const CATEGORY = Object.freeze({
  "irrigation-rotors": {
    name: "Роторні дощувачі",
    type: "Роторний дощувач",
    purpose: "рівномірного поливу газонів, зелених зон і відкритих територій",
    features: ["Регульований сектор поливу", "Змінні сопла для підбору витрати та радіуса", "Підземний монтаж у системі автоматичного поливу"]
  },
  "irrigation-sports": {
    name: "Полив спортивних полів",
    type: "Система поливу спортивних полів",
    purpose: "професійного поливу футбольних полів, стадіонів та великих відкритих майданчиків",
    features: ["Великий радіус дії", "Конструкція для інтенсивної експлуатації", "Сумісність із компонентами Hunter ST System"]
  },
  "irrigation-mp-nozzles": {
    name: "Ротаційні форсунки MP Rotator",
    type: "Ротаційна форсунка",
    purpose: "точного водозберігального поливу газонів і ділянок складної геометрії",
    features: ["Багатоструменева технологія поливу", "Низька інтенсивність опадів", "Підбір радіуса та сектора під конкретну зону"]
  },
  "irrigation-spray-nozzles": {
    name: "Форсунки для дощувачів",
    type: "Форсунка для дощувача",
    purpose: "поливу газонів, вузьких смуг, клумб і локальних зелених зон",
    features: ["Стабільна форма сектора поливу", "Варіанти для різних радіусів і конфігурацій", "Сумісність із висувними корпусами Hunter"]
  },
  "irrigation-spray-bodies": {
    name: "Висувні корпуси дощувачів",
    type: "Висувний корпус дощувача",
    purpose: "підземного монтажу форсунок у системах автоматичного поливу",
    features: ["Міцний корпус для підземного монтажу", "Сумісність із форсунками Hunter", "Сервісне обслуговування зверху"]
  },
  "irrigation-controllers": {
    name: "Контролери поливу",
    type: "Контролер поливу",
    purpose: "автоматичного керування зонами поливу за розкладом і погодними умовами",
    features: ["Програмоване керування зонами", "Автоматизація графіка поливу", "Інтеграція з датчиками Hunter"]
  },
  "irrigation-control-accessories": {
    name: "Компоненти керування поливом",
    type: "Компонент автоматики поливу",
    purpose: "розширення, підключення й сервісу систем автоматичного керування поливом",
    features: ["Сумісність із контролерами Hunter", "Професійне масштабування системи", "Монтаж у складі автоматики поливу"]
  },
  "irrigation-sensors": {
    name: "Датчики поливу",
    type: "Датчик системи поливу",
    purpose: "коригування поливу за опадами, вологістю, витратою, вітром або температурою",
    features: ["Автоматичне коригування роботи системи", "Зменшення непродуктивної витрати води", "Сумісність із контролерами Hunter"]
  },
  "irrigation-remotes": {
    name: "Пульти керування поливом",
    type: "Пульт дистанційного керування",
    purpose: "дистанційного запуску й сервісної перевірки зон автоматичного поливу",
    features: ["Дистанційне керування зонами", "Зручна пусконалагоджувальна перевірка", "Сумісність із контролерами Hunter"]
  }
});

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assetArgument() {
  const raw = process.argv.find(argument => argument.startsWith("--assets-from="));
  return raw ? path.resolve(raw.slice("--assets-from=".length)) : "";
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.name === "manifest.json") return [];
    const stat = await fs.stat(fullPath);
    return [{ fullPath, birthtimeMs: stat.birthtimeMs }];
  }));
  return nested.flat();
}

async function importAssets(sourceRoot) {
  if (!sourceRoot) return;
  const cutoff = new Date("2026-11-25T12:05:30Z").getTime();
  const sourceFiles = (await listFiles(sourceRoot))
    .filter(file => file.birthtimeMs >= cutoff)
    .sort((left, right) => left.birthtimeMs - right.birthtimeMs);
  const expected = ITEMS.filter(item => item[3] !== false).length;
  if (sourceFiles.length !== expected) throw new Error(`Expected ${expected} bundled Hunter images, received ${sourceFiles.length}`);
  await fs.mkdir(ASSET_DIR, { recursive: true });
  let sourceIndex = 0;
  for (const [model, , , hasImage = true] of ITEMS) {
    if (!hasImage) continue;
    const slug = slugify(model);
    const source = sourceFiles[sourceIndex++].fullPath;
    await sharp(source)
      .rotate()
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, effort: 5 })
      .toFile(path.join(ASSET_DIR, `${slug}.webp`));
  }
}

function productFor(item) {
  const [model, sourcePath, categoryId, hasImage = true] = item;
  const group = CATEGORY[categoryId];
  const slug = slugify(model);
  const id = `hunter-${slug}`;
  const title = `Hunter ${model}`;
  const manufacturerUrl = `${OFFICIAL_BASE}/${sourcePath}`;
  const image = hasImage ? `/assets/products/hunter/${slug}.webp` : "";
  const shortDescription = `${title} — ${group.type.toLowerCase()} для ${group.purpose}.`;
  const selectionText = "Перед замовленням звірте параметри зони, доступний тиск і витрату води, тип підключення, сумісність з іншими компонентами та вимоги до монтажу.";
  const fullDescription = `${title} — ${group.type.toLowerCase()} серії «${model}» для ${group.purpose}. Дані про продукт і зображення перевірені за офіційною сторінкою Hunter.\n\n${group.features.join(". ")}.\n\n${selectionText}`;
  const technicalDetails = [
    ["Тип обладнання", group.type],
    ["Бренд", "Hunter"],
    ["Офіційна назва", model],
    ["Категорія виробника", group.name]
  ];
  const attributes = [
    { id: "productType", value: group.type, label: "Тип обладнання" }
  ];
  const imageSources = image ? [{ local: image, source: manufacturerUrl, original: manufacturerUrl, type: "product" }] : [];
  const tags = ["hunter", "полив", "зрошення", model, group.type, group.name];
  const seoTitle = `${title} — характеристики | ТД «Софіївка»`;
  const seoDescription = `${title}: офіційне фото, призначення та підбір для систем автоматичного поливу Hunter.`;

  return {
    id,
    slug: id,
    sku: id,
    manufacturerCode: "",
    manufacturer_code: "",
    ean: "",
    EAN: "",
    brand: "Hunter",
    category: "irrigation",
    sourceCategoryId: categoryId,
    typeSlug: categoryId,
    type: group.type,
    subcategory: categoryId,
    series: model,
    seriesId: id,
    model,
    title,
    productName: title,
    product_name: title,
    shortDescription,
    short_description: shortDescription,
    fullDescription,
    full_description: fullDescription,
    description: fullDescription,
    descriptionSections: [
      { title: "Опис", paragraphs: [`${title} — ${group.type.toLowerCase()} для ${group.purpose}.`] },
      { title: "Ключові особливості", paragraphs: [group.features.join(". ") + "."] },
      { title: "Підбір і монтаж", paragraphs: [selectionText] }
    ],
    keyFeatures: group.features,
    key_features: group.features,
    applications: [group.purpose],
    compatibility: "Компоненти систем автоматичного поливу Hunter; сумісність конкретного виконання потрібно звірити з документацією виробника.",
    technicalDetails,
    technical_details: technicalDetails,
    features: {},
    attributes,
    tags,
    image,
    mainImage: image,
    main_image: image,
    images: image ? [image] : [],
    galleryImages: image ? [image] : [],
    gallery_images: image ? [image] : [],
    imageSourceUrl: manufacturerUrl,
    image_source_url: manufacturerUrl,
    imageSources,
    image_sources: imageSources,
    documents: [],
    manualPdf: "",
    manual_pdf: "",
    datasheetPdf: "",
    datasheet_pdf: "",
    certificatePdf: "",
    certificate_pdf: "",
    manufacturerUrl,
    manufacturer_url: manufacturerUrl,
    descriptionSourceUrl: manufacturerUrl,
    description_source_url: manufacturerUrl,
    sourceUrls: [manufacturerUrl],
    source_urls: [manufacturerUrl],
    dateVerified: VERIFIED_AT,
    date_verified: VERIFIED_AT,
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
    domestic: true,
    officialCatalogEdition: `Офіційний каталог Hunter 2026, перевірено ${VERIFIED_AT}`
  };
}

await importAssets(assetArgument());

const products = ITEMS.map(productFor);
if (new Set(products.map(product => product.id)).size !== products.length) throw new Error("Hunter product IDs are not unique");

const seriesLabels = Object.fromEntries(products.map(product => [product.seriesId, product.series]));
const output = `(function(){"use strict";const PRODUCTS=${JSON.stringify(products)};window.sofievkaHunterSeriesLabels=Object.freeze(${JSON.stringify(seriesLabels)});window.sofievkaHunterProducts=Object.freeze(PRODUCTS.map(product=>Object.freeze(product)));})();\n`;
await fs.writeFile(OUT_FILE, output, "utf8");
console.log(JSON.stringify({ products: products.length, images: products.filter(product => product.images.length).length, output: OUT_FILE }, null, 2));
