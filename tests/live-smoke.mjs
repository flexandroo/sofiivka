// Checks the live site after a deploy, over plain HTTP: what a crawler and a link preview receive. It reads the public
// catalogue API, then compares every page with it, so an address that answers 200 with the wrong content fails too.
// It only reads. Run: node tests/live-smoke.mjs  (SMOKE_BASE_URL overrides the address).
import { productPath } from "../lib/catalog-seo-source.mjs";

const BASE = String(process.env.SMOKE_BASE_URL || "https://sofievka.vercel.app").replace(/\/+$/, "");
const MAX_PRICE_RUN_AGE_DAYS = 5;
const MAX_SITEMAP_DRIFT = 0.05;
const failures = [];
let checks = 0;

const check = (condition, message) => {
  checks += 1;
  if (!condition) failures.push(message);
  return Boolean(condition);
};

const decode = text => String(text ?? "")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const pick = (html, pattern) => decode(pattern.exec(html)?.[1] ?? "").trim();

// A tracking parameter skips the CDN copy without marking the page as filtered.
const fresh = path => `${BASE}${path}${path.includes("?") ? "&" : "?"}utm_source=live-smoke-${Date.now()}`;

async function page(path, options = {}) {
  const response = await fetch(options.exact ? `${BASE}${path}` : fresh(path), { redirect: "manual", signal: AbortSignal.timeout(options.timeout ?? 20000) });
  const html = response.status >= 300 && response.status < 400 ? "" : await response.text();
  return {
    path,
    status: response.status,
    location: response.headers.get("location") || "",
    contentType: response.headers.get("content-type") || "",
    robotsHeader: response.headers.get("x-robots-tag") || "",
    strictTransport: response.headers.get("strict-transport-security") || "",
    html,
    h1: pick(html, /<h1[^>]*>([^<]*)/i),
    title: pick(html, /<title[^>]*>([^<]*)/i),
    canonical: pick(html, /<link rel="canonical" href="([^"]*)/i),
    robots: pick(html, /<meta name="robots" content="([^"]*)/i),
    prerendered: /data-page-root data-prerendered/.test(html)
  };
}

function schemaOf(html, id) {
  const raw = new RegExp(`<script type="application/ld\\+json" id="${id}">(.*?)</script>`, "s").exec(html)?.[1];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const config = await (await fetch(`${BASE}/catalog-runtime-config.js`, { signal: AbortSignal.timeout(20000) })).text();
const url = /"url":"(https:[^"]+)"/.exec(config)?.[1];
const key = /sb_publishable_[A-Za-z0-9_-]+/.exec(config)?.[0];
if (!url || !key) throw new Error("catalog-runtime-config.js has no catalogue API settings");

async function rpc(name, body = {}) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

// Catalogue data.
const bootstrap = await rpc("get_catalog_bootstrap");
check(bootstrap.totalProducts > 0, "the catalogue has no published products");
const version = await rpc("get_catalog_version");
const ageDays = (Date.now() - new Date(version.updated_at).getTime()) / 86400000;
check(ageDays < MAX_PRICE_RUN_AGE_DAYS, `the catalogue was last updated ${ageDays.toFixed(1)} days ago: the daily price recalculation may have stopped`);

const rank = product => product.pricing?.priceStatus === "known" && product.pricing?.amount ? 0 : 1;
const firstPage = await rpc("get_catalog_products", { page_size: 96 });
check(firstPage.total === bootstrap.totalProducts, `product list says ${firstPage.total}, bootstrap says ${bootstrap.totalProducts}`);
const ranks = firstPage.products.map(rank);
check(ranks.every((value, index) => !index || ranks[index - 1] <= value), "products with a price are not listed first");

// Static pages.
let canonicalOrigin = BASE;
for (const path of ["/", "/catalog", "/brands", "/contact", "/delivery", "/cart", "/checkout", "/search?q=wilo"]) {
  const result = await page(path);
  check(result.status === 200, `${path}: expected 200, got ${result.status}`);
  check(/Софіївка/.test(result.title), `${path}: not a page of the site, title is "${result.title}"`);
  if (path === "/") {
    if (result.canonical) canonicalOrigin = new URL(result.canonical).origin;
    if (BASE.startsWith("https://")) check(/\bmax-age=[1-9]\d*/.test(result.strictTransport), "/: no HSTS response header");
  }
  const pathname = new URL(path, BASE).pathname;
  check(result.canonical === `${canonicalOrigin}${pathname}`, `${path}: canonical is ${result.canonical}`);
  if (["/cart", "/checkout", "/search"].includes(pathname)) {
    check(/\bnoindex\b/.test(result.robots) && /\bnoindex\b/.test(result.robotsHeader), `${path}: the service page needs noindex in the HTML and response`);
  }
}

// Categories: each page shows its own heading. A wrong shell once gave every category the same one.
const byId = new Map(bootstrap.categories.map(category => [category.id, category]));
const visible = category => category.status === "active" && (category.visibility || "catalog") === "catalog"
  && Number(bootstrap.categoryCounts?.[category.id]) > 0;
const categoryPath = category => {
  const slugs = [];
  for (let current = category; current; current = current.parentId ? byId.get(current.parentId) : null) slugs.unshift(current.slug);
  return `/catalog/${slugs.join("/")}`;
};
const sections = bootstrap.categories.filter(category => category.level === 1 && visible(category));
const children = sections.map(section => bootstrap.categories.find(category => category.parentId === section.id && visible(category))).filter(Boolean);
check(sections.length > 0, "no catalogue sections with products");
for (const category of [...sections, ...children]) {
  const path = categoryPath(category);
  const result = await page(path);
  if (!check(result.status === 200, `${path}: expected 200, got ${result.status}`)) continue;
  check(result.prerendered, `${path}: no server content`);
  check(result.h1 === decode(category.title).trim(), `${path}: heading is "${result.h1}", expected "${category.title}"`);
  check(result.canonical.endsWith(path), `${path}: canonical is ${result.canonical}`);
  check(result.robots === "index,follow", `${path}: robots is "${result.robots}"`);
  check(schemaOf(result.html, "schema-breadcrumbs"), `${path}: no breadcrumb data`);
}
if (sections[0]) {
  const path = categoryPath(sections[0]);
  const filtered = await page(`${path}?min=100`);
  check(filtered.status === 200 && /\bnoindex\b/.test(filtered.robots) && filtered.canonical === `${canonicalOrigin}${path}`,
    `${path}: a filtered listing needs noindex and the clean canonical`);
}

// Products: one with a price, one on request.
const priced = firstPage.products.find(product => rank(product) === 0);
const onRequestList = await rpc("get_catalog_products", { scope_brand: "focus", page_size: 1 });
for (const product of [priced, onRequestList.products?.[0]].filter(Boolean)) {
  const path = productPath(product);
  const result = await page(path);
  if (!check(result.status === 200, `${path}: expected 200, got ${result.status}`)) continue;
  check(result.prerendered, `${path}: no server content`);
  check(result.h1 === decode(product.title).trim(), `${path}: heading is "${result.h1}", expected "${product.title}"`);
  check(result.title && !result.title.startsWith("Товар |"), `${path}: generic title "${result.title}"`);
  check(result.canonical.endsWith(path), `${path}: canonical is ${result.canonical}`);
  check(/property="og:title"/.test(result.html), `${path}: no link preview data`);
  const schema = schemaOf(result.html, "schema-product");
  const amount = product.pricing?.priceStatus === "known" ? Number(product.pricing.amount) : null;
  if (amount > 0) check(Number(schema?.offers?.price) === amount, `${path}: schema price ${schema?.offers?.price}, catalogue price ${amount}`);
  else check(!schema, `${path}: a product on request has Product structured data without an offer`);
}

// Brands.
const brandId = Object.keys(bootstrap.brandCounts || {}).find(id => Number(bootstrap.brandCounts[id]) > 0);
const brand = bootstrap.brands.find(item => item.id === brandId);
if (check(brand, "no brand with products")) {
  const result = await page(`/brands/${encodeURIComponent(brand.id)}`);
  check(result.status === 200, `/brands/${brand.id}: expected 200, got ${result.status}`);
  check(result.h1 === decode(brand.name).trim(), `/brands/${brand.id}: heading is "${result.h1}"`);
}

// Large brand scopes exercise the real facet RPC: a small first brand can hide a timeout
// on a newly imported catalogue. Counts are the contract; elapsed time is not a benchmark.
const visibleBrandCounts = bootstrap.brands
  .filter(item => (!item.status || item.status === "active") && (item.visibility || item.type || "catalog") === "catalog")
  .map(item => ({ id: item.id, count: Number(bootstrap.brandCounts?.[item.id]) }))
  .filter(item => Number.isSafeInteger(item.count) && item.count > 0)
  .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
const facetBrands = [...new Map([
  ...visibleBrandCounts.slice(0, 3),
  ...visibleBrandCounts.filter(item => item.id === brand?.id)
].map(item => [item.id, item])).values()];
const countObject = value => value && typeof value === "object" && !Array.isArray(value);
check(facetBrands.length > 0, "no visible brand scopes for facet checks");
const facetScopes = [{ id: null, count: bootstrap.totalProducts }, ...facetBrands];
for (const scope of facetScopes) {
  const label = `get_catalog_facets(${scope.id || "whole catalogue"}, ${scope.count} products)`;
  try {
    const facets = await rpc("get_catalog_facets", scope.id ? { scope_brand: scope.id } : {});
    if (!check(countObject(facets), `${label}: response is not an object`)) continue;
    check(typeof facets.version === "string" && facets.version.length > 0, `${label}: missing catalogue version`);
    check(Number.isSafeInteger(facets.total) && facets.total === scope.count, `${label}: total is ${facets.total}, bootstrap says ${scope.count}`);
    if (check(countObject(facets.brandCounts), `${label}: brandCounts is not an object`)) {
      const counts = Object.entries(facets.brandCounts);
      check(counts.every(([id, count]) => (!scope.id || id === scope.id) && Number.isSafeInteger(count) && count >= 0), `${label}: brandCounts contains an out-of-scope brand or invalid counts`);
      check(counts.reduce((total, [, count]) => total + count, 0) === scope.count, `${label}: scoped brandCounts sum does not match bootstrap`);
      if (scope.id) check(facets.brandCounts[scope.id] === scope.count, `${label}: the scoped brand count is incorrect`);
    }
    if (check(countObject(facets.technicalCounts), `${label}: technicalCounts is not an object`)) {
      check(Object.values(facets.technicalCounts).every(options => countObject(options)
        && Object.values(options).every(count => Number.isSafeInteger(count) && count >= 0)), `${label}: technicalCounts contains invalid option counts`);
    }
  } catch (error) {
    check(false, `${label}: ${error.message}`);
  }
}

// Unknown addresses are real 404s; old product links lead to the current address.
for (const path of ["/product/live-smoke-missing", "/product?id=live-smoke-missing", "/catalog/live-smoke-missing", "/brands/live-smoke-missing", "/blog/live-smoke-missing", "/portfolio/live-smoke-missing", "/live-smoke-missing", "/live-smoke-missing.html", "/live-smoke-missing.xml"]) {
  const result = await page(path);
  check(result.status === 404, `${path}: expected 404, got ${result.status}`);
  check(!result.prerendered, `${path}: a missing page has server content`);
}
if (priced?.slug) {
  const oldPaths = [`/product?id=${encodeURIComponent(priced.id)}&utm_source=live-smoke`, `/products/${encodeURIComponent(priced.slug)}`];
  if (priced.id !== priced.slug) oldPaths.push(`/product/${encodeURIComponent(priced.id)}`);
  for (const path of oldPaths) {
    const result = await page(path, { exact: true });
    const target = productPath(priced) + (path.includes("utm_source=") ? "?utm_source=live-smoke" : "");
    check(result.status === 301 && new URL(result.location, BASE).href === new URL(target, BASE).href, `${path}: expected 301 to ${target}, got ${result.status} ${result.location}`);
  }
}
const gasBoilers = byId.get("gas-boilers");
if (gasBoilers && visible(gasBoilers)) {
  const alias = "/catalog/heating/gas-boilers";
  const target = categoryPath(gasBoilers);
  const result = await page(alias, { exact: true });
  check(alias === target ? result.status === 200 : result.status === 301 && new URL(result.location, BASE).pathname === target, `${alias}: expected ${target}, got ${result.status} ${result.location}`);
}

// Files search engines read.
const merchant = await page("/google-merchant.xml", { exact: true, timeout: 55000 });
if (check(merchant.status === 200 && /application\/xml/i.test(merchant.contentType), `Google Merchant: expected XML, got ${merchant.status} ${merchant.contentType}`)) {
  const offers = [...merchant.html.matchAll(/<item>(.*?)<\/item>/gs)].map(match => ({
    id: pick(match[1], /<g:id>([^<]+)<\/g:id>/),
    link: pick(match[1], /<g:link>([^<]+)<\/g:link>/),
    price: pick(match[1], /<g:sale_price>([^<]+)<\/g:sale_price>/) || pick(match[1], /<g:price>([^<]+)<\/g:price>/)
  }));
  check(offers.length > 0 && new Set(offers.map(offer => offer.id)).size === offers.length,
    "Google Merchant: the feed is empty or has duplicate offer IDs");
  check(offers.every(offer => offer.id && offer.link.startsWith(`${canonicalOrigin}/product/`) && /^\d+\.\d{2} UAH$/.test(offer.price)),
    "Google Merchant: invalid offer identity, link or UAH price");
  const samples = [...new Set([offers[0], offers[Math.floor(offers.length / 2)], offers.at(-1)].filter(Boolean))];
  await Promise.all(samples.map(async offer => {
    if (!offer.link.startsWith(`${canonicalOrigin}/product/`)) return;
    const target = await page(new URL(offer.link).pathname, { exact: true });
    check(target.status === 200 && target.canonical === offer.link && !/\bnoindex\b/.test(`${target.robots} ${target.robotsHeader}`),
      `Google Merchant: ${offer.link} is not an indexable canonical page`);
    const schema = schemaOf(target.html, "schema-product");
    check(Number(schema?.offers?.price) === parseFloat(offer.price), `Google Merchant: ${offer.id} price differs from the landing page`);
  }));
}
const sitemap = await page("/sitemap.xml", { exact: true });
check(sitemap.status === 200 && /\b(?:application|text)\/xml\b/i.test(sitemap.contentType), `sitemap.xml: expected XML, got ${sitemap.status} ${sitemap.contentType}`);
const locs = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
check(locs.length === new Set(locs).size, "sitemap.xml has duplicate URLs");
const paths = locs.filter(loc => loc.startsWith(`${canonicalOrigin}/`)).map(loc => loc.slice(canonicalOrigin.length));
check(locs.length > 0 && paths.length === locs.length, "sitemap.xml lists URLs on the wrong canonical origin");
check(paths.every(path => !/^\/(admin|cart|checkout|account|search|compare|favorites|brand|post)(?:\/|\?|$)/.test(path)), "sitemap.xml lists service or template routes");
const productLocs = paths.filter(path => /^\/product(?:\/[^/?]+$|\?id=[^&]+$)/.test(path));
check(productLocs.length > 0 && Math.abs(productLocs.length - bootstrap.totalProducts) <= Math.ceil(bootstrap.totalProducts * MAX_SITEMAP_DRIFT),
  `sitemap.xml has ${productLocs.length} products vs ${bootstrap.totalProducts} in the live catalogue`);
const samples = ["/", "/catalog", "/brands", ...sections.slice(0, 3).map(categoryPath), ...(priced ? [productPath(priced)] : [])];
for (const [kind, base] of [["article", "/blog"], ["case", "/portfolio"]]) {
  const published = await rpc("get_site_posts", { post_kind: kind, page_size: 1 });
  if (published?.posts?.[0]) samples.push(`${base}/${published.posts[0].slug}`);
}
for (const path of samples) {
  const url = `${canonicalOrigin}${path}`;
  check(locs.includes(url), `${url}: missing from sitemap.xml`);
  const result = await page(path);
  check(result.status === 200 && result.canonical === url, `${url}: sitemap destination is ${result.status}, canonical ${result.canonical}`);
  check(!/\bnoindex\b/.test(`${result.robotsHeader},${result.robots}`), `${url}: the sitemap destination has noindex`);
  check((result.html.match(/<link\b[^>]*\brel="canonical"/gi) || []).length === 1, `${url}: expected one canonical tag`);
}
const robots = await page("/robots.txt", { exact: true });
check(robots.status === 200 && robots.html.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`), "robots.txt does not point to the canonical sitemap");

if (failures.length) {
  console.error(`Live site check failed on ${BASE}: ${failures.length} of ${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", suite: "live-smoke", base: BASE, checks, products: bootstrap.totalProducts, wholeCatalogueFacets: true, facetBrands: facetBrands.map(item => item.id) }));
