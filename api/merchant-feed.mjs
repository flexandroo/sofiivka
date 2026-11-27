import { createHash } from "node:crypto";
import { productPath, readPublicCatalog } from "../lib/catalog-seo-source.mjs";
import { validatePublicConfig } from "../lib/supabase-client.mjs";
import { resolveSiteUrl } from "../scripts/generate-sitemap.mjs";

const SUPPORTED_STOCK = new Set(["in_stock", "out_of_stock"]);
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_CONTROL = "public, max-age=0, s-maxage=900, stale-while-revalidate=3600";
const XML_START = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>\n';
const XML_END = "</channel></rss>\n";

const xml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
})[character]);
const plain = (value, limit) => Array.from(String(value ?? "").replace(/<[^>]*>/g, " ")
  .replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, "")
  .replace(/\s+/g, " ").trim()).slice(0, limit).join("").trimEnd();
const currency = value => `${Number(value).toFixed(2)} UAH`;

function productImage(value, origin) {
  if (!value || /(?:placeholder|fallback|no[-_]?image)/i.test(value)) return "";
  try {
    const url = new URL(value, origin);
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

export function merchantItems(catalog, origin) {
  const brands = new Map((catalog.brands || []).map(brand => [brand.id, brand.name]));
  const categories = new Map(catalog.categories.map(category => [category.id, category]));
  const categoryPath = id => {
    const names = [];
    for (let category = categories.get(id); category; category = categories.get(category.parentId)) {
      if (category.status !== "active" || (category.visibility || "catalog") !== "catalog" || names.length === 10
        || (category.parentId && !categories.has(category.parentId))) return [];
      names.unshift(category.name);
    }
    return names;
  };
  return catalog.products.flatMap(product => {
    const { id, slug, pricing, inventory } = product;
    if (!id || id.length > 50 || !slug || product.publicationStatus !== "published" || !SUPPORTED_STOCK.has(inventory?.status)) return [];
    const amount = pricing?.amount;
    if (pricing?.priceStatus !== "known" || pricing.currency !== "UAH" || !Number.isFinite(amount) || amount <= 0) return [];
    const image = productImage(product.images?.[0], origin);
    const title = plain(product.title, 150);
    const brand = plain(product.brand || brands.get(product.brandId), 70);
    const path = categoryPath(product.primaryCategoryId);
    if (!image || !title || !brand || !path.length) return [];
    const description = plain(product.shortDescription || product.description, 5000)
      || plain([...new Set([product.title, path.at(-1)].filter(Boolean))].join(". "), 5000);
    const compareAt = pricing.oldAmount;
    const sale = Number.isFinite(compareAt) && compareAt > amount;
    return [{
      id, title, description, link: new URL(productPath(product), origin).href,
      image_link: image, availability: inventory.status, brand,
      price: currency(sale ? compareAt : amount),
      ...(sale ? { sale_price: currency(amount) } : {}),
      product_type: plain(path.join(" > "), 750),
      ...(pricing.unit === "m" ? { unit_pricing_measure: "1 m", unit_pricing_base_measure: "1 m" } : {})
    }];
  });
}

export function merchantXml(items, origin) {
  return [
    XML_START,
    `<title>ТД «Софіївка»</title><link>${xml(origin)}</link><description>Інженерне обладнання та матеріали</description>\n`,
    ...items.map(item => `<item>${Object.entries(item).map(([field, value]) => `<g:${field}>${xml(value)}</g:${field}>`).join("")}</item>\n`),
    XML_END
  ];
}

let cached;
let inFlight;
async function loadFeed(origin, config, fetchImpl) {
  const key = `${origin}|${config.url}`;
  if (cached?.key === key && cached.expires > Date.now()) return cached;
  if (inFlight?.key === key) return inFlight.promise;
  const promise = (async () => {
    const catalog = await readPublicCatalog(config, {
      requireComplete: true, concurrency: 6, signal: AbortSignal.timeout(50000), fetchImpl
    });
    const items = merchantItems(catalog, origin);
    if (!items.length) throw new Error("Catalogue has no exportable offers");
    const chunks = merchantXml(items, origin);
    const hash = createHash("sha256");
    chunks.forEach(chunk => hash.update(chunk));
    cached = { key, chunks, etag: `"${hash.digest("hex")}"`, expires: Date.now() + CACHE_TTL_MS };
    return cached;
  })();
  inFlight = { key, promise };
  try { return await promise; }
  finally { if (inFlight?.promise === promise) inFlight = null; }
}

export default async function handler(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  res.setHeader("X-Robots-Tag", "noindex");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    return res.end();
  }
  let feed;
  try {
    const origin = resolveSiteUrl(env);
    const config = validatePublicConfig({ url: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
    feed = await loadFeed(origin, config, fetchImpl);
  } catch (error) {
    console.warn("[merchant-feed]", error.message);
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "60");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end(req.method === "HEAD" ? undefined : "Google Merchant feed is temporarily unavailable.");
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.setHeader("ETag", feed.etag);
  if (req.headers?.["if-none-match"] === feed.etag) {
    res.statusCode = 304;
    return res.end();
  }
  res.statusCode = 200;
  if (req.method === "HEAD") return res.end();
  // Stream a fully validated catalogue so large feeds fit the function response boundary.
  for (const chunk of feed.chunks) res.write(chunk);
  return res.end();
}
