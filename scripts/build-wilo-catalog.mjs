import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(import.meta.dirname, "..");
const API = "https://oc.ws.wilo.com/pfinder";
const CATALOG = "https://wilo.com/ua/uk/Обладнання/uk/virobi";
const ROOT_CONFIG = "8ae2819c8e9774cf018ea36fa2c86c6b";
const HOME_SEGMENT = "segment_SF|segment_SF=145853460";
const VERIFIED_ON = "2026-09-21";
const OUT_FILE = path.join(ROOT, "wilo-products-data.js");
const MEDIA_DIR = path.join(ROOT, "assets", "products", "wilo", "series");
const CACHE_DIR = path.join(ROOT, "tmp", "wilo-source");

const SKIP_SERIES = /^(?:Сепаратори|NovaCON$)/i;

function clean(value = "") {
  return String(value)
    .replace(/\{\$footnote=[^}]+\}/g, "")
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<li[^>]*>/gi, "")
    .replace(/<\/li>/gi, "; ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»")
    .replace(/&sup2;/gi, "²")
    .replace(/&sup3;/gi, "³")
    .replace(/&ndash;|&mdash;/gi, "–")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&le;/gi, "≤")
    .replace(/&ge;/gi, "≥")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*;+/g, "; ")
    .replace(/^\s*[;,:-]+|[;,:-]+\s*$/g, "")
    .trim();
}

function slugify(value) {
  return clean(value)
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function flattenNodes(node, out = []) {
  if (!node || typeof node !== "object") return out;
  out.push(node);
  for (const child of node.nodes || []) flattenNodes(child, out);
  return out;
}

function allProps(node) {
  return flattenNodes(node).flatMap(item => item.props || []);
}

function propValues(node, predicate) {
  return allProps(node)
    .filter(predicate)
    .flatMap(prop => (prop.values || []).map(value => ({ prop, value })))
    .filter(item => item.value?.desc);
}

function firstValue(node, predicate) {
  return propValues(node, predicate)[0]?.value?.desc || "";
}

function tab(node, psm) {
  return flattenNodes(node).find(item => item.attrs?.PSM === psm);
}

function mediaEntries(node) {
  return propValues(node, ({ dataType }) => dataType === 7).map(({ prop, value }) => {
    let memo = {};
    try { memo = value.memo ? JSON.parse(value.memo) : {}; } catch {}
    return {
      cod: prop.cod || prop.nodeName || "",
      url: value.desc,
      language: value.attrs?.mediaLanguages || "",
      subCatKey: value.attrs?.subCatKey || "",
      title: clean(memo.title || prop.desc || ""),
      subcategory: clean(memo.subCat || ""),
      edition: memo.edition || ""
    };
  });
}

function classify(seriesName) {
  if (/^(?:Atmos|Stratos|Yonos|Varios|Star-Z|TOP-Z)/i.test(seriesName)) {
    if (/(?:PICO-Z|MAXO-Z|Star-Z|TOP-Z)/i.test(seriesName)) return { sourceCategoryId: "wilo-dhw-circulation", category: "heating", type: "Циркуляційний насос для ГВП" };
    if (/(?:MAXO|PICO-D)/i.test(seriesName)) return { sourceCategoryId: "wilo-system-circulation", category: "heating", type: "Системний циркуляційний насос" };
    return { sourceCategoryId: "wilo-circulation", category: "heating", type: "Циркуляційний насос" };
  }
  if (/^(?:Sub |Actun|Extract)/i.test(seriesName)) return { sourceCategoryId: "wilo-borehole", category: "water-supply", type: "Свердловинний насос" };
  if (/^(?:PB|Isar BOOST|HiMulti 3 [CH]|Initial Jet System)/i.test(seriesName)) return { sourceCategoryId: "wilo-pressure", category: "water-supply", type: "Установка підвищення тиску" };
  if (/^HiMulti 3$/i.test(seriesName)) return { sourceCategoryId: "wilo-multistage", category: "water-supply", type: "Багатоступеневий поверхневий насос" };
  if (/^(?:Initial Jet$|Jet )/i.test(seriesName)) return { sourceCategoryId: "wilo-surface", category: "water-supply", type: "Поверхневий насос" };
  if (/^DrainLift/i.test(seriesName)) return { sourceCategoryId: "wilo-lifting", category: "water-supply", type: "Установка відведення стічних вод" };
  if (/^(?:Rexa|Initial Waste)/i.test(seriesName)) return { sourceCategoryId: "wilo-sewage", category: "water-supply", type: "Каналізаційний насос" };
  return { sourceCategoryId: "wilo-drainage", category: "water-supply", type: "Дренажний насос" };
}

function applicationList(classification) {
  const applications = {
    "wilo-circulation": ["водяні системи опалення", "контури теплої підлоги", "системи охолодження та кондиціонування"],
    "wilo-dhw-circulation": ["циркуляція гарячої питної води", "системи ГВП приватних будинків"],
    "wilo-system-circulation": ["системи опалення", "системи охолодження та кондиціонування"],
    "wilo-borehole": ["водопостачання зі свердловин і колодязів", "полив і зрошення"],
    "wilo-multistage": ["приватне водопостачання", "полив і зрошення", "використання дощової води"],
    "wilo-surface": ["приватне водопостачання", "полив і зрошення", "використання дощової води"],
    "wilo-pressure": ["підвищення тиску у приватному водопостачанні", "автоматична подача води"],
    "wilo-drainage": ["відведення дренажної та забрудненої води", "осушення приямків і підвалів"],
    "wilo-sewage": ["відведення стічних вод", "перекачування забрудненої води"],
    "wilo-lifting": ["напірне відведення стічних вод", "санітарні вузли нижче рівня каналізації"]
  };
  return applications[classification.sourceCategoryId] || [];
}

function numberFrom(value) {
  const match = clean(value).replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function technicalDetails(detail) {
  const technical = tab(detail, "product_technical");
  const rows = [];
  const seen = new Set();
  for (const prop of allProps(technical)) {
    const code = prop.cod || prop.nodeName || "";
    if (/^graphic_data_/i.test(code)) continue;
    const label = clean(prop.desc);
    const values = [...new Set((prop.values || []).map(item => clean(item.desc)).filter(Boolean))];
    if (!label || !values.length) continue;
    const value = values.join(" / ");
    const key = `${label}\u0000${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push([label, value]);
  }
  return rows;
}

function specByCode(detail) {
  const map = new Map();
  for (const prop of allProps(tab(detail, "product_technical"))) {
    const value = clean(prop.values?.[0]?.desc || "");
    if (value) map.set(prop.cod || prop.nodeName || "", value);
  }
  const find = pattern => [...map].find(([key]) => pattern.test(key))?.[1];
  return { map, find };
}

function normalizedFeatures(detail, classification) {
  const { find } = specByCode(detail);
  const result = { productType: classification.type };
  const putNumber = (key, pattern) => { const value = numberFrom(find(pattern)); if (Number.isFinite(value)) result[key] = value; };
  putNumber("headM", /Head_max/i);
  putNumber("flowM3h", /Flow_max/i);
  putNumber("mountingLengthMm", /dim_l0/i);
  putNumber("pressureBar", /pressure_pump_max/i);
  putNumber("weightKg", /weight_net/i);
  putNumber("freePassageMm", /free.*passage|ball.*passage/i);
  putNumber("maxImmersionDepthM", /immersion.*depth/i);
  putNumber("cableLengthM", /cable.*length/i);
  const powerKw = numberFrom(find(/elec_power_output_P2.*kW/i));
  const powerW = numberFrom(find(/elec_power_output_P2/i));
  if (Number.isFinite(powerKw)) result.powerKw = powerKw;
  else if (Number.isFinite(powerW)) result.powerKw = Number((powerW / 1000).toFixed(4));
  const textValues = {
    connection: find(/Pipe_connection|dimconnection|connection_pressure|connection_suction/i),
    voltage: find(/elec_mains_connection/i),
    protectionClass: find(/prot_ip_class/i)
  };
  if (/circulation/.test(classification.sourceCategoryId)) textValues.eei = find(/Energy_efficiency_index_EEI|Copy_From_Energy_efficiency_index_EEI/i);
  Object.entries(textValues).forEach(([key, value]) => { if (value) result[key] = clean(value); });
  const minTemp = find(/temp_fluid_min/i);
  const maxTemp = find(/temp_fluid_max/i);
  if (minTemp || maxTemp) result.temperature = [minTemp, maxTemp].filter(Boolean).map(clean).join("…");
  if (/circulation/.test(classification.sourceCategoryId)) result.control = "Електронне або ступінчасте — залежно від виконання";
  if (classification.sourceCategoryId === "wilo-surface") result.selfPriming = /(?:\sP(?:\/|\s)|Jet|FWJ|HWJ)/i.test(detail.desc) ? "yes" : "no";
  return result;
}

function keyFeatures(details, classification) {
  const preferred = [
    /Висота подачі|Максимальний напір/i,
    /Подача .*max|Максимальна подача/i,
    /Під’єднання до мережі/i,
    /Клас захисту/i,
    /Максимальний робочий тиск/i,
    /Під’єднання.*трубопроводу|Напірний патрубок|Всмоктувальний патрубок/i,
    /температура середовища/i,
    /Індекс енергетичної ефективності/i
  ];
  const features = [];
  for (const pattern of preferred) {
    const row = details.find(([label]) => pattern.test(label));
    if (row) features.push(`${row[0]}: ${row[1]}`);
  }
  if (features.length < 5) features.unshift(classification.type);
  return [...new Set(features)].slice(0, 8);
}

function selectDocuments(detail) {
  const media = mediaEntries(tab(detail, "product_downloads") || detail).filter(item => /\.pdf(?:$|\?)/i.test(item.url));
  const manual = media.find(item => item.language === "uk" && /Operating_Manual/i.test(item.subCatKey)) || media.find(item => item.language === "uk");
  const datasheet = media.find(item => /data.?sheet|technical.?data|itd/i.test(`${item.subCatKey} ${item.cod} ${item.subcategory}`));
  const certificate = media.find(item => /certificate|declaration|reach/i.test(`${item.subCatKey} ${item.cod} ${item.title}`));
  return { manual, datasheet, certificate };
}

async function fetchJson(url, cacheFile) {
  try { return JSON.parse(await fs.readFile(cacheFile, "utf8")); } catch {}
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (response.ok) {
      const text = await response.text();
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, text);
      return JSON.parse(text);
    }
    if (attempt === 4) throw new Error(`${response.status} ${url}`);
    await new Promise(resolve => setTimeout(resolve, attempt * 500));
  }
}

async function mapLimit(items, limit, worker) {
  const result = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await worker(items[index], index);
      if ((index + 1) % 50 === 0) console.log(`Processed ${index + 1}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return result;
}

const localizedImages = new Map();

function highestResolutionImageUrl(sourceUrl) {
  return sourceUrl.replace(/_\d+(\.(?:png|jpe?g|webp))$/i, "_5$1");
}

function mediaFileStem(sourceUrl) {
  const fileName = new URL(sourceUrl).pathname.split("/").pop() || "wilo-image";
  return slugify(fileName.replace(/_\d+\.(?:png|jpe?g|webp)$/i, "")) || "wilo-image";
}

async function localizeImage(sourceUrl) {
  if (!sourceUrl) return { local: "", source: "" };
  const preferredUrl = highestResolutionImageUrl(sourceUrl);
  if (localizedImages.has(preferredUrl)) return localizedImages.get(preferredUrl);
  const task = (async () => {
    const hash = crypto.createHash("sha1").update(preferredUrl).digest("hex").slice(0, 10);
    const fileName = `${mediaFileStem(preferredUrl)}-${hash}.webp`;
    const target = path.join(MEDIA_DIR, fileName);
    const local = `/assets/products/wilo/series/${fileName}`;
    try { await fs.access(target); return { local, source: preferredUrl, original: sourceUrl }; } catch {}
    let response = await fetch(preferredUrl);
    let resolvedSource = preferredUrl;
    if (!response.ok && preferredUrl !== sourceUrl) {
      response = await fetch(sourceUrl);
      resolvedSource = sourceUrl;
    }
    if (!response.ok) throw new Error(`Image ${response.status}: ${sourceUrl}`);
    const input = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(MEDIA_DIR, { recursive: true });
    await sharp(input)
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 95, effort: 6 })
      .toFile(target);
    return { local, source: resolvedSource, original: sourceUrl };
  })();
  localizedImages.set(preferredUrl, task);
  return task;
}

function seriesImageSources(detail) {
  const media = mediaEntries(detail);
  const preferred = media.filter(item => /graphic_data_(?:product_photo_beauty|picture_with_bubbles|product_in_application_picture)/i.test(item.cod));
  const fallback = media.filter(item => /graphic_data_product_photo_select/i.test(item.cod));
  return [...new Set((preferred.length ? preferred : fallback).map(item => item.url).filter(Boolean))];
}

function richTextItems(value = "") {
  const text = String(value)
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<\/(?:li|p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ");
  return [...new Set(text.split(/\n+/).map(clean).map(item => item.replace(/[.;:,]+$/g, "").trim()).filter(Boolean))];
}

function seriesProperty(detail, code) {
  const property = allProps(detail).find(item => item.cod === code || item.nodeName === code);
  return property?.values?.map(value => value.desc).filter(Boolean).join("\n") || "";
}

function lowerFirst(value = "") {
  const text = clean(value);
  return text ? `${text.charAt(0).toLocaleLowerCase("uk-UA")}${text.slice(1)}` : "";
}

function withoutPurposePrefix(value = "") {
  return clean(value).replace(/^для\s+/i, "").replace(/[.]+$/g, "");
}

function listSentence(items, limit = 6) {
  return [...new Set(items.map(clean).filter(Boolean))]
    .slice(0, limit)
    .map(item => /^[А-ЯІЇЄҐ]/u.test(item) ? lowerFirst(item) : item)
    .join("; ");
}

function officialSeriesCopy(detail) {
  return {
    design: clean(seriesProperty(detail, "desc_1_design_SFE")),
    applications: richTextItems(seriesProperty(detail, "desc_2_application_SFE")),
    equipment: richTextItems(seriesProperty(detail, "desc_3_equipment_function_SFE")),
    delivery: richTextItems(seriesProperty(detail, "desc_4_delivery_state_SFE")),
    advantages: richTextItems(seriesProperty(detail, "desc_7_advantages_SFE")),
    materials: richTextItems(seriesProperty(detail, "desc_8_material_SFE")),
    construction: richTextItems(seriesProperty(detail, "desc_9_construction_SFE"))
  };
}

function makeShortDescription(model, seriesName, classification, officialApplications, fallbackApplications) {
  const purposes = (officialApplications.length ? officialApplications : fallbackApplications)
    .map(withoutPurposePrefix)
    .filter(Boolean);
  const base = `Wilo ${model} — ${lowerFirst(classification.type)} серії ${seriesName}`;
  const candidates = [
    purposes.length ? `${base} для ${purposes[0]}.` : "",
    fallbackApplications.length ? `${base} для ${fallbackApplications.slice(0, 2).join(" та ")}.` : "",
    `${base}.`
  ].filter(Boolean);
  return candidates.find(candidate => candidate.length <= 220) || `${classification.type} Wilo ${model}.`;
}

function makeDescription(model, seriesName, classification, fallbackApplications, details, seriesDetail) {
  const official = officialSeriesCopy(seriesDetail);
  const exactFeatures = keyFeatures(details, classification);
  const applications = official.applications.length
    ? official.applications.map(withoutPurposePrefix).filter(Boolean)
    : fallbackApplications;
  const sections = [];

  const intro = official.design
    ? `Модель Wilo ${model} належить до серії ${seriesName}. За конструкцією це ${lowerFirst(official.design).replace(/[.]+$/g, "")}.`
    : `Wilo ${model} — ${lowerFirst(classification.type)} серії ${seriesName}.`;
  sections.push({ title: "Опис", paragraphs: [intro] });

  if (applications.length) {
    sections.push({
      title: "Застосування",
      paragraphs: [`Виробник передбачає використання обладнання для таких завдань: ${listSentence(applications)}.`]
    });
  }

  const constructionFacts = official.equipment.length ? official.equipment : official.construction;
  if (constructionFacts.length) {
    sections.push({
      title: "Конструкція та функції",
      paragraphs: [`У виконанні серії передбачено: ${listSentence(constructionFacts)}.`]
    });
  }

  if (official.materials.length) {
    sections.push({
      title: "Матеріали",
      paragraphs: [`Матеріали основних деталей, заявлені Wilo: ${listSentence(official.materials)}.`]
    });
  }

  if (exactFeatures.length) {
    sections.push({
      title: "Параметри конкретного виконання",
      paragraphs: [`Для моделі ${model} офіційно підтверджено: ${listSentence(exactFeatures, 8)}.`]
    });
  }

  if (official.advantages.length) {
    sections.push({
      title: "Особливості серії",
      paragraphs: [`Серед особливостей цієї серії Wilo зазначає: ${listSentence(official.advantages)}.`]
    });
  }

  if (official.delivery.length) {
    sections.push({
      title: "Комплект постачання",
      paragraphs: [`Типовий комплект серії включає: ${listSentence(official.delivery)}.`]
    });
  }

  const fullDescription = sections.flatMap(section => section.paragraphs).join("\n\n");
  return {
    applications,
    sections,
    shortDescription: makeShortDescription(model, seriesName, classification, official.applications, fallbackApplications),
    fullDescription
  };
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const seriesResponse = await fetchJson(`${API}/list?conf=${ROOT_CONFIG}&cursor=0&limit=500&rcco=ua&lcda=uk&psx=${encodeURIComponent(HOME_SEGMENT)}`, path.join(CACHE_DIR, "series.json"));
  const seriesNodes = (seriesResponse.result?.nodes || []).filter(item => !SKIP_SERIES.test(item.desc));
  const seriesRecords = await mapLimit(seriesNodes, 10, async node => {
    const list = await fetchJson(`${API}/list?conf=${node.nodeName}&cursor=0&limit=2000&rcco=ua&lcda=uk`, path.join(CACHE_DIR, `list-${node.nodeName}.json`));
    const detail = await fetchJson(`${API}/detail?conf=${node.nodeName}&rcco=ua&lcda=uk`, path.join(CACHE_DIR, `series-${node.nodeName}.json`));
    const listImage = (node.values || []).find(value => /https?:\/\/[^\s]+\.(?:png|jpe?g|webp)(?:$|\?)/i.test(value.desc || ""))?.desc || "";
    const sourceImages = seriesImageSources(detail.result);
    if (!sourceImages.length && listImage) sourceImages.push(listImage);
    const images = list.result?.nodes?.length ? await Promise.all(sourceImages.map(localizeImage)) : [];
    return { node, list: list.result, detail: detail.result, images };
  });
  const jobs = seriesRecords.flatMap(series => (series.list.nodes || []).map(product => ({ series, product })));
  const products = (await mapLimit(jobs, 18, async ({ series, product }) => {
    const seriesName = clean(series.node.desc);
    const classification = classify(seriesName);
    const fallbackApplications = applicationList(classification);
    const response = await fetchJson(`${API}/detail?conf=${series.node.nodeName}&nodeName=${product.nodeName}&rcco=ua&lcda=uk`, path.join(CACHE_DIR, "products", `${product.cod}.json`));
    const detail = response.result;
    const specs = technicalDetails(detail);
    const docs = selectDocuments(detail);
    const media = mediaEntries(detail);
    const productSources = [...new Set(media.filter(item => /graphic_data_product_photo_select/i.test(item.cod)).map(item => item.url).filter(Boolean))];
    const dimensionSources = [...new Set(media.filter(item => /graphic_data_(?:dimdrawing|dimension)/i.test(item.cod)).map(item => item.url).filter(Boolean))];
    const wiringSources = [...new Set(media.filter(item => /graphic_data_wiring/i.test(item.cod)).map(item => item.url).filter(Boolean))];
    const [productImages, dimensionImages, wiringImages] = await Promise.all([
      Promise.all(productSources.map(localizeImage)),
      Promise.all(dimensionSources.map(localizeImage)),
      Promise.all(wiringSources.map(localizeImage))
    ]);
    const manufacturerUrl = `${CATALOG}/${series.node.meta.slug}/${product.meta.slug}`;
    const seriesUrl = `${CATALOG}/${series.node.meta.slug}`;
    const title = `Насос Wilo ${clean(product.desc)}`;
    const editorial = makeDescription(clean(product.desc), seriesName, classification, fallbackApplications, specs, series.detail);
    const documents = [docs.manual, docs.datasheet, docs.certificate].filter(Boolean).map(item => ({ type: "PDF", title: item.title || item.subcategory || "Документ Wilo", language: item.language === "uk" ? "Українська" : "", url: item.url }));
    const ean = specs.find(([label]) => /EAN/i.test(label))?.[1] || "";
    const imageAssets = [
      ...productImages.map(item => ({ ...item, type: "product" })),
      ...series.images.map(item => ({ ...item, type: "series" })),
      ...dimensionImages.map(item => ({ ...item, type: "dimensions" })),
      ...wiringImages.map(item => ({ ...item, type: "wiring" }))
    ].filter((item, index, items) => item.local && items.findIndex(candidate => candidate.local === item.local) === index);
    const primaryImage = productImages[0] || series.images[0] || { local: "", source: "" };
    const dimensionImage = dimensionImages[0] || { local: "", source: "" };
    const gallery = imageAssets.map(item => item.local);
    const sources = [...new Set([manufacturerUrl, seriesUrl, ...imageAssets.flatMap(item => [item.source, item.original]), ...documents.map(item => item.url)].filter(Boolean))];
    return {
      id: String(product.cod), sku: String(product.cod), manufacturerCode: String(product.cod), manufacturer_code: String(product.cod),
      ean, EAN: ean, brand: "Wilo", category: classification.category, sourceCategoryId: classification.sourceCategoryId,
      typeSlug: classification.sourceCategoryId, type: classification.type, subcategory: classification.type,
      series: seriesName, seriesId: `wilo-${slugify(seriesName)}`, model: clean(product.desc), title,
      productName: title, product_name: title, shortDescription: editorial.shortDescription, short_description: editorial.shortDescription,
      fullDescription: editorial.fullDescription, full_description: editorial.fullDescription, description: editorial.fullDescription,
      descriptionSections: editorial.sections,
      keyFeatures: keyFeatures(specs, classification), key_features: keyFeatures(specs, classification), applications: editorial.applications, compatibility: "",
      technicalDetails: specs, features: normalizedFeatures(detail, classification), attributes: [],
      image: primaryImage.local, mainImage: primaryImage.local, main_image: primaryImage.local,
      images: gallery, galleryImages: gallery, gallery_images: gallery,
      dimensionDiagram: dimensionImage.local, dimension_diagram: dimensionImage.local, imageSourceUrl: primaryImage.source, image_source_url: primaryImage.source,
      imageSources: imageAssets, image_sources: imageAssets,
      documents, manualPdf: docs.manual?.url || "", manual_pdf: docs.manual?.url || "",
      datasheetPdf: docs.datasheet?.url || "", datasheet_pdf: docs.datasheet?.url || "",
      certificatePdf: docs.certificate?.url || "", certificate_pdf: docs.certificate?.url || "",
      manufacturerUrl, manufacturer_url: manufacturerUrl, descriptionSourceUrl: seriesUrl, description_source_url: seriesUrl, sourceUrls: sources, source_urls: sources,
      dateVerified: VERIFIED_ON, date_verified: VERIFIED_ON,
      seo: { title: `${title} — характеристики | ТД «Софіївка»`, description: `${classification.type} Wilo ${clean(product.desc)}: офіційно підтверджені технічні характеристики та документи.` },
      seoTitle: `${title} — характеристики | ТД «Софіївка»`, seo_title: `${title} — характеристики | ТД «Софіївка»`,
      seoDescription: `${classification.type} Wilo ${clean(product.desc)}: офіційно підтверджені технічні характеристики та документи.`,
      seo_description: `${classification.type} Wilo ${clean(product.desc)}: офіційно підтверджені технічні характеристики та документи.`,
      price: 0, currency: "UAH", availability: "unknown", availabilityLabel: "Наявність уточнюйте",
      condition: "new", conditionLabel: "Новий", officialCatalogEdition: "Офіційний каталог Wilo, перевірено 21.09.2026"
    };
  })).filter(Boolean);
  products.sort((a, b) => a.series.localeCompare(b.series, "uk") || a.model.localeCompare(b.model, "uk"));
  const seriesLabels = Object.fromEntries([...new Map(products.map(product => [product.seriesId, product.series])).entries()]);
  const output = `(function(){"use strict";const PRODUCTS=${JSON.stringify(products)};window.sofievkaWiloSeriesLabels=Object.freeze(${JSON.stringify(seriesLabels)});window.sofievkaWiloProducts=Object.freeze(PRODUCTS.map(product=>Object.freeze(product)));})();\n`;
  await fs.writeFile(OUT_FILE, output);
  const safeMediaRoot = path.resolve(ROOT, "assets", "products", "wilo");
  const resolvedMediaDir = path.resolve(MEDIA_DIR);
  if (!resolvedMediaDir.startsWith(`${safeMediaRoot}${path.sep}`)) throw new Error(`Unsafe media cleanup path: ${resolvedMediaDir}`);
  const referencedMedia = new Set(products.flatMap(product => product.images).map(image => path.basename(image)));
  for (const entry of await fs.readdir(MEDIA_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".webp") && !referencedMedia.has(entry.name)) {
      await fs.unlink(path.join(MEDIA_DIR, entry.name));
    }
  }
  const report = {
    verifiedOn: VERIFIED_ON,
    officialSegment: "Одно- та двоквартирні будинки",
    sourceSeriesCount: seriesResponse.result?.meta?.slice?.total || 0,
    pumpSeriesCount: seriesRecords.filter(item => item.list?.nodes?.length).length,
    skuCount: products.length,
    skippedSeries: (seriesResponse.result?.nodes || []).filter(item => SKIP_SERIES.test(item.desc)).map(item => item.desc),
    emptySeries: seriesRecords.filter(item => !(item.list?.nodes?.length)).map(item => item.node.desc),
    series: seriesRecords.map(item => ({ name: item.node.desc, skuCount: item.list?.nodes?.length || 0, source: `${CATALOG}/${item.node.meta.slug}` }))
  };
  await fs.writeFile(path.join(CACHE_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

await main();
