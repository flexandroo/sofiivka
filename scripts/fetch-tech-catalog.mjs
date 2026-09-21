import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_URL = "https://tech-controllers.com/ua/sitemap.xml";
const OUT_DIR = path.join(ROOT, "tmp", "tech-source");
const OUT_FILE = path.join(OUT_DIR, "products.json");
const USER_AGENT = "Mozilla/5.0 TD-Sofiivka-Catalog/1.0";

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
    .replace(/&divide;/gi, "÷")
    .replace(/&plusmn;/gi, "±")
    .replace(/&Omega;/gi, "Ω")
    .replace(/&micro;/gi, "µ")
    .replace(/&sup2;/gi, "²")
    .replace(/&deg;/gi, "°")
    .replace(/&bull;/gi, "•")
    .replace(/&hellip;/gi, "…")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function clean(value = "") {
  return decodeEntities(String(value))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function absoluteUrl(value, base) {
  try {
    return new URL(decodeEntities(value), base).href;
  } catch {
    return "";
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function fetchText(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "user-agent": USER_AGENT }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { text: await response.text(), finalUrl: response.url, status: response.status };
  } catch (error) {
    if (attempt >= 4) throw error;
    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    return fetchText(url, attempt + 1);
  }
}

function extractBreadcrumbs(html, baseUrl) {
  const block = html.match(/<div class=["'][^"']*breadcrumbs[^"']*["'][^>]*>([\s\S]*?)<style/i)?.[1] || "";
  return [...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<span\b[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/gi)]
    .map(match => ({ url: absoluteUrl(match[1], baseUrl), title: clean(match[2]) }))
    .filter(item => item.url.includes("/ua/k/") && item.title);
}

function extractGallery(html, baseUrl) {
  const start = html.search(/<!--\s*LP \(product\)\s*-->/i);
  const params = html.search(/<section\s+id=["']params["']/i);
  const downloads = html.search(/<div class=["'][^"']*product-downloads/i);
  const candidates = [params, downloads].filter(index => index > start);
  const end = candidates.length ? Math.min(...candidates) : html.length;
  const block = start >= 0 ? html.slice(start, end) : html;
  const ogImage = html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
  const linked = [...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  const embedded = [...block.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  const images = unique([ogImage, ...linked, ...embedded]
    .map(value => absoluteUrl(value, baseUrl))
    .filter(url => /\/!uploads\/(?:products|gallery|sections)\//i.test(url) && /\.(?:avif|webp|png|jpe?g)(?:\.webp)?(?:\?|$)/i.test(url)));
  const largeKeys = new Set(images.map(url => {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/(?:s|m)_([^/]+)$/i, "/b_$1").replace(/\.webp$/i, "");
  }));
  return images.filter(url => {
    const parsed = new URL(url);
    if (!/\/(?:s|m)_/i.test(parsed.pathname)) return true;
    const largePath = parsed.pathname.replace(/\/(?:s|m)_([^/]+)$/i, "/b_$1").replace(/\.webp$/i, "");
    return !largeKeys.has(largePath);
  });
}

function extractTechnicalDetails(html) {
  const block = html.match(/<div class=["'][^"']*specification_parameters[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || "";
  const rows = [];
  for (const row of block.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => clean(match[1]));
    if (cells.length >= 2 && cells[0] && cells.slice(1).some(Boolean)) rows.push([cells[0].replace(/:$/, ""), cells.slice(1).filter(Boolean).join("; ")]);
  }
  const seen = new Set();
  return rows.filter(([label, value]) => {
    const key = `${label.toLocaleLowerCase("uk")}\u0000${value.toLocaleLowerCase("uk")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractContent(html) {
  const galleryIndex = html.search(/<!--\s*LP \(product\)\s*-->/i);
  const paramsIndex = html.search(/<section\s+id=["']params["']/i);
  if (galleryIndex < 0 || paramsIndex <= galleryIndex) return { headings: [], paragraphs: [], bullets: [] };
  const block = html.slice(galleryIndex, paramsIndex);
  const extract = tagPattern => [...block.matchAll(tagPattern)].map(match => clean(match[1])).filter(Boolean);
  const headings = extract(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi).filter(value => value.length <= 180);
  const paragraphs = extract(/<p\b[^>]*>([\s\S]*?)<\/p>/gi).filter(value => value.length >= 25 && value.length <= 1200);
  const bullets = extract(/<li\b[^>]*>([\s\S]*?)<\/li>/gi).filter(value => value.length >= 3 && value.length <= 500);
  return { headings: unique(headings), paragraphs: unique(paragraphs), bullets: unique(bullets) };
}

function extractDocuments(html, baseUrl) {
  const start = html.search(/<div class=["'][^"']*product-downloads/i);
  if (start < 0) return [];
  const block = html.slice(start, html.search(/<link\b[^>]*lp_rwd\.css/i) > start ? html.search(/<link\b[^>]*lp_rwd\.css/i) : undefined);
  const documents = [];
  for (const item of block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const href = item[1].match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || "";
    const url = absoluteUrl(href, baseUrl);
    if (!/\.pdf(?:\?|$)/i.test(url)) continue;
    const title = clean(item[1].match(/<span\b[^>]*class=["'][^"']*file-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || path.basename(new URL(url).pathname));
    documents.push({ title, url });
  }
  return unique(documents.map(item => `${item.title}\u0000${item.url}`)).map(value => {
    const [title, url] = value.split("\u0000");
    return { title, url };
  });
}

function parseProduct(html, requestedUrl, finalUrl) {
  const model = clean(html.match(/<h1\b[^>]*class=["'][^"']*page-header[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const pageSubtitle = clean(html.match(/<div\b[^>]*class=["'][^"']*page-subheader[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const ogTitle = clean(html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || "").replace(/\s*[-–—]\s*TECH Controllers.*$/i, "");
  const subtitle = pageSubtitle || (ogTitle.toLocaleLowerCase("uk") !== model.toLocaleLowerCase("uk") ? ogTitle : "");
  const canonical = absoluteUrl(html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] || finalUrl, finalUrl);
  return {
    requestedUrl,
    finalUrl,
    canonicalUrl: canonical || finalUrl,
    slug: new URL(finalUrl).pathname.split("/").filter(Boolean).at(-1) || "",
    model,
    subtitle,
    breadcrumbs: extractBreadcrumbs(html, finalUrl),
    gallery: extractGallery(html, finalUrl),
    technicalDetails: extractTechnicalDetails(html),
    content: extractContent(html),
    documents: extractDocuments(html, finalUrl)
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
      if ((index + 1) % 20 === 0) console.log(`Fetched ${index + 1}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  const sitemap = await fetchText(SOURCE_URL);
  const sitemapUrls = unique([...sitemap.text.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map(match => decodeEntities(match[1]).trim())
    .filter(url => /^https:\/\/tech-controllers\.com\/ua\/p\//i.test(url)));
  if (sitemapUrls.length !== 262) throw new Error(`Expected 262 official product URLs, received ${sitemapUrls.length}`);

  const failures = [];
  const fetched = await mapLimit(sitemapUrls, 6, async url => {
    try {
      const response = await fetchText(url);
      return parseProduct(response.text, url, response.finalUrl);
    } catch (error) {
      failures.push({ url, error: String(error) });
      return null;
    }
  });

  const valid = fetched.filter(product => product?.model);
  const grouped = new Map();
  for (const product of valid) {
    const key = `canonical:${product.canonicalUrl}`;
    if (!grouped.has(key)) grouped.set(key, product);
  }
  const products = [...grouped.values()];
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify({
    sourceUrl: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    sitemapUrlCount: sitemapUrls.length,
    parsedCount: valid.length,
    uniqueProductCount: products.length,
    failures,
    products
  }, null, 2));
  console.log(JSON.stringify({
    source: SOURCE_URL,
    sitemapUrlCount: sitemapUrls.length,
    parsedCount: valid.length,
    uniqueProductCount: products.length,
    duplicatePages: valid.length - products.length,
    failures: failures.length,
    withImages: products.filter(product => product.gallery.length).length,
    imageReferences: products.reduce((total, product) => total + product.gallery.length, 0),
    withTechnicalDetails: products.filter(product => product.technicalDetails.length).length,
    withDocuments: products.filter(product => product.documents.length).length,
    output: OUT_FILE
  }, null, 2));
}

await main();
