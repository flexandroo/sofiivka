// Checks the live site after a deploy, over plain HTTP: what a crawler and a link preview receive. It reads the public
// catalogue API, then compares every page with it, so an address that answers 200 with the wrong content fails too.
// It only reads. Run: node tests/live-smoke.mjs  (SMOKE_BASE_URL overrides the address).
const BASE = String(process.env.SMOKE_BASE_URL || "https://sofievka.vercel.app").replace(/\/+$/, "");
const MAX_PRICE_RUN_AGE_DAYS = 5;
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
  const response = await fetch(options.exact ? `${BASE}${path}` : fresh(path), { redirect: "manual", signal: AbortSignal.timeout(20000) });
  const html = response.status >= 300 && response.status < 400 ? "" : await response.text();
  return {
    path,
    status: response.status,
    location: response.headers.get("location") || "",
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
for (const path of ["/", "/catalog", "/brands", "/contact", "/delivery", "/cart", "/checkout", "/search?q=wilo"]) {
  const result = await page(path);
  check(result.status === 200, `${path}: expected 200, got ${result.status}`);
  check(/Софіївка/.test(result.title), `${path}: not a page of the site, title is "${result.title}"`);
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

// Products: one with a price, one on request.
const priced = firstPage.products.find(product => rank(product) === 0);
const onRequestList = await rpc("get_catalog_products", { scope_brand: "focus", page_size: 1 });
for (const product of [priced, onRequestList.products?.[0]].filter(Boolean)) {
  const path = `/product/${encodeURIComponent(product.slug)}`;
  const result = await page(path);
  if (!check(result.status === 200, `${path}: expected 200, got ${result.status}`)) continue;
  check(result.prerendered, `${path}: no server content`);
  check(result.h1 === decode(product.title).trim(), `${path}: heading is "${result.h1}", expected "${product.title}"`);
  check(result.title && !result.title.startsWith("Товар |"), `${path}: generic title "${result.title}"`);
  check(result.canonical.endsWith(path), `${path}: canonical is ${result.canonical}`);
  check(/property="og:title"/.test(result.html), `${path}: no link preview data`);
  const schema = schemaOf(result.html, "schema-product");
  if (check(schema, `${path}: no product data for search engines`)) {
    const amount = product.pricing?.priceStatus === "known" ? Number(product.pricing.amount) : null;
    if (amount) check(Number(schema.offers?.price) === amount, `${path}: schema price ${schema.offers?.price}, catalogue price ${amount}`);
    else check(!schema.offers, `${path}: a product on request has a price in its schema`);
  }
}

// Brands.
const brandId = Object.keys(bootstrap.brandCounts || {}).find(id => Number(bootstrap.brandCounts[id]) > 0);
const brand = bootstrap.brands.find(item => item.id === brandId);
if (check(brand, "no brand with products")) {
  const result = await page(`/brands/${encodeURIComponent(brand.id)}`);
  check(result.status === 200, `/brands/${brand.id}: expected 200, got ${result.status}`);
  check(result.h1 === decode(brand.name).trim(), `/brands/${brand.id}: heading is "${result.h1}"`);
}

// Unknown addresses are real 404s; old product links lead to the current address.
for (const path of ["/product/live-smoke-missing", "/catalog/live-smoke-missing", "/brands/live-smoke-missing", "/live-smoke-missing"]) {
  const result = await page(path);
  check(result.status === 404, `${path}: expected 404, got ${result.status}`);
  check(!result.prerendered, `${path}: a missing page has server content`);
}
if (priced && priced.id !== priced.slug) {
  const result = await page(`/product/${encodeURIComponent(priced.id)}`, { exact: true });
  check(result.status === 308 && result.location.endsWith(`/product/${encodeURIComponent(priced.slug)}`), `/product/${priced.id}: expected a redirect, got ${result.status} ${result.location}`);
}
const legacy = await page("/catalog/heating/gas-boilers");
check(legacy.status === 200, `an old catalogue address answers ${legacy.status}`);

// Files search engines read.
const sitemap = await page("/sitemap.xml", { exact: true });
check(sitemap.status === 200 && sitemap.html.includes("/product/"), "sitemap.xml has no products");
const robots = await page("/robots.txt", { exact: true });
check(robots.status === 200 && robots.html.includes("Sitemap:"), "robots.txt has no sitemap");

if (failures.length) {
  console.error(`Live site check failed on ${BASE}: ${failures.length} of ${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", suite: "live-smoke", base: BASE, checks, products: bootstrap.totalProducts }));
