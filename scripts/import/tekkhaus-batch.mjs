// Converts the TEKK HAUS store feed (node scripts/fetch-tekkhaus-catalog.mjs) into an import batch
// in the docs/product-import-standard.md format. Photos already in assets/products/tekkhaus are reused,
// new ones are downloaded and converted to WebP (needs the sharp package).
// Usage: node scripts/import/tekkhaus-batch.mjs [--no-download] > imports/tekkhaus-YYYY-MM-DD.json
import fs from "node:fs";
import path from "node:path";
import {
  clean, classify, extractModel, technicalDetails, normalizedFeatures, keyFeatures, extractApplications,
  description, extractDocuments, downloadImage, imageFileName
} from "../build-tekkhaus-catalog.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SOURCE_FILE = path.join(ROOT, "tmp", "tekkhaus-source", "products.json");
const MEDIA_DIR = path.join(ROOT, "assets", "products", "tekkhaus");
const download = !process.argv.includes("--no-download");
const CATEGORY_BY_SOURCE = {
  "tekkhaus-circulation": "system-circulation-pumps", "tekkhaus-surface": "surface-pumps",
  "tekkhaus-pressure": "pressure-boosting", "tekkhaus-borehole": "borehole-pumps",
  "tekkhaus-drainage": "drainage-pumps", "tekkhaus-sewage": "sewage-pumps",
  "tekkhaus-pool": "pool-pumps-filtration", "tekkhaus-pressure-tanks": "pressure-tanks",
  "tekkhaus-automation": "pump-automation", "tekkhaus-accessories": "pump-accessories",
  "tekkhaus-feed-grinders": "feed-grinders"
};
const DROPPED_LABELS = /^(?:артикул виробника|офіційна назва|категорія виробника)$/i;

const feed = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));
const bySku = new Map();
for (const record of feed.products) {
  const sku = clean(record.sku);
  if (!sku) continue;
  const current = bySku.get(sku);
  if (!current || (String(current.permalink).includes("/ru/") && !String(record.permalink).includes("/ru/"))) bySku.set(sku, record);
}

async function localImages(record) {
  const result = [];
  for (const image of record.images || []) {
    const fileName = imageFileName(image);
    const target = path.join(MEDIA_DIR, fileName);
    if (!fs.existsSync(target) && download) {
      const outcome = await downloadImage(image.src, target).catch(error => ({ ok: false, error: String(error) }));
      if (!outcome.ok) { console.error(`photo failed ${image.src}: ${outcome.error}`); continue; }
    }
    if (fs.existsSync(target)) result.push(`assets/products/tekkhaus/${fileName}`);
  }
  return result;
}

const products = [];
for (const record of bySku.values()) {
  const gardia = /gardia/i.test(clean(record.name));
  const classification = classify(record);
  const model = extractModel(record, classification);
  const details = technicalDetails(record);
  const features = keyFeatures(record, details, classification);
  const editorial = description(record, classification, details, features, extractApplications(record, classification));
  const brandName = gardia ? "Gardia" : "TEKK HAUS";
  const title = `${classification.type} ${brandName} ${model.replace(/\bgardia\b/gi, "").replace(/\s{2,}/g, " ").trim()}`.trim();
  const filters = normalizedFeatures(details, classification);
  const price = Number(record.prices?.price || 0) / 10 ** Number(record.prices?.currency_minor_unit || 0);
  products.push({
    sourceId: `tekkhaus-${clean(record.sku)}`,
    sourceUrl: clean(record.permalink),
    sourceCategory: classification.sourceCategoryId,
    sku: clean(record.sku),
    model,
    brand: gardia ? "gardia" : "tekk",
    title,
    category: CATEGORY_BY_SOURCE[classification.sourceCategoryId] || "",
    price: price > 0 ? price : null,
    shortDescription: editorial.shortDescription,
    description: editorial.fullDescription,
    sections: editorial.sections,
    characteristics: details.filter(([label]) => !DROPPED_LABELS.test(label)).map(([label, value]) => ({ label, value })),
    filters,
    images: await localImages(record),
    documents: extractDocuments(record).documents.map(document => ({ title: document.title, type: /інструк/i.test(document.title) ? "manual" : "datasheet", url: document.url }))
  });
}

process.stdout.write(JSON.stringify({
  supplier: "tekkhaus",
  supplierName: "Офіційний магазин TEKK HAUS",
  collectedAt: feed.fetchedAt.slice(0, 10),
  sourceSite: "https://shop.tekk.haus/",
  products
}, null, 1));
