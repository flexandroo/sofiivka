import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = process.argv.includes('--capture') ? require('sharp') : null;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const captureFile = path.join(root, 'tmp/hunter-official-families.jsonl');
const manifestFile = path.join(root, 'catalog/hunter-official-source.json');
const imageDir = path.join(root, 'assets/products/hunter');
const outputFile = path.join(root, 'hunter-products-data.js');
const verifiedAt = '2026-11-25';

const slug = value => String(value).normalize('NFKD').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const categoryMap = {
  Rotors: ['irrigation-rotors', 'Роторний дощувач'],
  Nozzles: ['irrigation-spray-nozzles', 'Форсунка для поливу'],
  'Spray Bodies': ['irrigation-spray-bodies', 'Корпус дощувача'],
  Hydrawise: ['irrigation-control-accessories', 'Компонент керування поливом'],
  Controllers: ['irrigation-controllers', 'Контролер або компонент керування поливом'],
  Sensors: ['irrigation-sensors', 'Датчик або компонент системи поливу'],
  Remotes: ['irrigation-remotes', 'Пульт керування поливом'],
  Valves: ['irrigation-valves', 'Клапан системи поливу'],
  'Micro Irrigation': ['irrigation-drip', 'Компонент крапельного поливу'],
  'ST System': ['irrigation-sports', 'Компонент поливу спортивних полів'],
  Accessories: ['irrigation-installation', 'Монтажний компонент системи поливу'],
  Tools: ['irrigation-tools', 'Інструмент для монтажу та обслуговування поливу'],
};

function classify(family) {
  const name = family.name;
  if (/MP Rotator|Eco-Rotator/i.test(name) && family.category !== 'Tools')
    return ['irrigation-mp-nozzles', 'Ротаційна форсунка або комплект MP Rotator'];
  if (/SkyCommand|Wireless Valve Link|EZ Decoder|ICD|Pump Start Relay/i.test(name))
    return ['irrigation-control-accessories', 'Компонент автоматики поливу'];
  if (/HC Flow Meter/i.test(name)) return ['irrigation-sensors', 'Витратомір системи поливу'];
  return categoryMap[family.category] || categoryMap.Rotors;
}

async function capture() {
  const lines = (await fs.readFile(captureFile, 'utf8')).trim().split(/\r?\n/);
  const latest = [...new Map(lines.map(line => JSON.parse(line)).map(item => [item.url, item])).values()];
  if (latest.length !== 120) throw new Error(`Expected 120 verified Hunter families/tools, got ${latest.length}`);
  await fs.mkdir(imageDir, { recursive: true });
  const families = [];
  for (const [index, item] of latest.entries()) {
    if (!item.models?.length) continue; // Software subscription has no physical article.
    if (!item.photo || !item.assetPath) throw new Error(`Missing official photo for ${item.name}`);
    const name = item.name || item.title;
    const filename = `${String(index + 1).padStart(3, '0')}-${slug(name)}.webp`;
    await sharp(item.assetPath).rotate()
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86, effort: 5 })
      .toFile(path.join(imageDir, filename));
    families.push({
      name,
      category: item.category || 'Rotors',
      url: item.url,
      image: `/assets/products/hunter/${filename}`,
      imageSource: item.photo,
      specs: item.specs || [],
      models: item.models.map(({ sku, description, url }) => ({ sku, description, url })),
    });
  }
  await fs.writeFile(manifestFile, JSON.stringify({ verifiedAt, families }, null, 2) + '\n');
}

if (process.argv.includes('--capture')) await capture();
const { families } = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
const seen = new Set();
const products = [];
const seriesLabels = {};
for (const family of families) {
  const [categoryId, type] = classify(family);
  const seriesId = `hunter-series-${slug(family.name)}`;
  seriesLabels[seriesId] = family.name;
  for (const model of family.models) {
    if (seen.has(model.sku)) continue;
    seen.add(model.sku);
    const id = `hunter-${slug(model.sku)}`;
    const title = `Hunter ${family.name} ${model.sku}`;
    const shortDescription = `${type} Hunter серії ${family.name}, артикул ${model.sku}.`;
    const originalDescription = model.description || '';
    const fullDescription = `${shortDescription}\n\nОпис виробника (англійською): ${originalDescription}\n\nПеред замовленням звірте параметри моделі та сумісність за офіційною сторінкою Hunter.`;
    const details = [
      ['Бренд', 'Hunter'], ['Артикул виробника', model.sku],
      ['Серія', family.name], ['Тип обладнання', type],
      ['Опис виробника (англ.)', originalDescription],
    ];
    const imageSources = [{ local: family.image, source: family.imageSource, original: family.imageSource, type: 'series' }];
    products.push({
      id, slug: id, sku: model.sku, manufacturerCode: model.sku, manufacturer_code: model.sku,
      brand: 'Hunter', category: 'irrigation', sourceCategoryId: categoryId,
      typeSlug: categoryId, type, subcategory: categoryId, series: family.name,
      seriesId, model: model.sku, title, productName: title, product_name: title,
      shortDescription, short_description: shortDescription,
      fullDescription, full_description: fullDescription, description: fullDescription,
      descriptionSections: [{ title: 'Опис', paragraphs: [shortDescription, `Опис виробника (англійською): ${originalDescription}`] }],
      keyFeatures: [], key_features: [], applications: ['Ландшафтний полив'],
      technicalDetails: details, technical_details: details,
      features: {}, attributes: [{ id: 'productType', value: type, label: 'Тип обладнання' }],
      tags: ['Hunter', 'полив', 'зрошення', family.name, model.sku],
      image: family.image, mainImage: family.image, main_image: family.image,
      images: [family.image], galleryImages: [family.image], gallery_images: [family.image],
      imageSourceUrl: family.imageSource, image_source_url: family.imageSource,
      imageSources, image_sources: imageSources,
      manufacturerUrl: model.url || family.url, manufacturer_url: model.url || family.url,
      descriptionSourceUrl: model.url || family.url, description_source_url: model.url || family.url,
      sourceUrls: [model.url || family.url], source_urls: [model.url || family.url],
      dateVerified: verifiedAt, date_verified: verifiedAt,
      seo: { title: `${title} | ТД «Софіївка»`, description: shortDescription },
      price: 0, currency: 'UAH', availability: 'unknown', availabilityLabel: 'Наявність уточнюйте',
      condition: 'new', conditionLabel: 'Новий', domestic: true,
      officialCatalogEdition: `Офіційний каталог Hunter, перевірено ${verifiedAt}`,
    });
  }
}
if (products.length !== 962 || new Set(products.map(p => p.id)).size !== products.length)
  throw new Error(`Hunter SKU integrity failure: ${products.length} unique products`);
const output = `(function(){"use strict";const PRODUCTS=${JSON.stringify(products)};window.sofievkaHunterSeriesLabels=Object.freeze(${JSON.stringify(seriesLabels)});window.sofievkaHunterProducts=Object.freeze(PRODUCTS.map(product=>Object.freeze(product)));})();\n`;
await fs.writeFile(outputFile, output);
console.log(JSON.stringify({ products: products.length, families: families.length, images: new Set(products.map(p => p.image)).size }, null, 2));
