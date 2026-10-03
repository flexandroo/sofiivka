// Downloads Termojet product images that are still hotlinked from termojet.com.ua,
// stores them as WebP in assets/products/termojet/ and writes a source -> local map.
//
// Usage:
//   node scripts/localize-termojet-images.mjs --urls=urls.txt [--map=tmp/termojet-image-map.json]
//
// urls.txt holds one image URL per line (export them from product_media). Image URLs found
// in termojet-products-data.js are always added. Existing files are reused, so reruns are cheap.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(import.meta.dirname, "..");
const MEDIA_DIR = path.join(ROOT, "assets", "products", "termojet");
const PUBLIC_DIR = "/assets/products/termojet";
const STATIC_DATA = path.join(ROOT, "termojet-products-data.js");
const IMAGE_URL = /https?:\/\/(?:www\.)?termojet\.com\.ua\/[^"'\s\\]+?\.(?:png|jpe?g|webp|gif)/gi;

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const MAP_FILE = path.resolve(ROOT, args.map || "tmp/termojet-image-map.json");

function fileStem(url) {
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "termojet-image";
}

function localName(url) {
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
  return `${fileStem(url)}-${hash}.webp`;
}

async function collectUrls() {
  const urls = new Set();
  if (args.urls) {
    for (const line of (await fs.readFile(path.resolve(args.urls), "utf8")).split(/\r?\n/)) {
      if (line.trim()) urls.add(line.trim());
    }
  }
  for (const match of (await fs.readFile(STATIC_DATA, "utf8")).matchAll(IMAGE_URL)) urls.add(match[0]);
  return [...urls].sort();
}

async function localize(url) {
  const fileName = localName(url);
  const target = path.join(MEDIA_DIR, fileName);
  const local = `${PUBLIC_DIR}/${fileName}`;
  try {
    await fs.access(target);
    return { source: url, local, status: "cached" };
  } catch {}
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (sofievka media sync)" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const input = Buffer.from(await response.arrayBuffer());
      await sharp(input)
        .rotate()
        .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88, alphaQuality: 95, effort: 6 })
        .toFile(target);
      return { source: url, local, status: "downloaded" };
    } catch (error) {
      lastError = error;
      if (/HTTP 404|HTTP 410/.test(error.message)) break;
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  return { source: url, local: "", status: "failed", error: lastError?.message || "unknown" };
}

async function mapLimit(items, limit, worker) {
  const result = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await worker(items[index]);
      if ((index + 1) % 50 === 0) console.log(`Processed ${index + 1}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return result;
}

const urls = await collectUrls();
await fs.mkdir(MEDIA_DIR, { recursive: true });
const results = await mapLimit(urls, 6, localize);
await fs.mkdir(path.dirname(MAP_FILE), { recursive: true });
await fs.writeFile(MAP_FILE, `${JSON.stringify(results, null, 2)}\n`);

const failed = results.filter(item => item.status === "failed");
console.log(`Images: ${results.length}, downloaded ${results.filter(item => item.status === "downloaded").length}, cached ${results.filter(item => item.status === "cached").length}, failed ${failed.length}`);
for (const item of failed) console.log(`  FAILED ${item.error}: ${item.source}`);
console.log(`Map: ${path.relative(ROOT, MAP_FILE)}`);
