// Server first paint for product, category and brand pages. These pages are rendered in the browser, so their raw
// HTML used to be an empty shell: crawlers and link previews saw "Товар | ТД «Софіївка»" and an unknown address
// answered 200. Here the shell gets the real title, description, canonical, Open Graph, JSON-LD and readable content
// from the same public RPCs the storefront uses, and an unknown address answers 404. The client still renders the
// page as before and replaces this markup.
//
// Any failure of the catalogue API falls back to the plain shell with a 200 and a short cache: a database hiccup must
// never turn real pages into 404s for visitors or search engines.
const SITE_NAME = "ТД «Софіївка»";
const REQUEST_TIMEOUT_MS = 4000;
const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;
const SHELL_TTL_MS = 5 * 60 * 1000;
const LISTING_SIZE = 24;
const MAX_SPECIFICATIONS = 40;
const MAX_PARAGRAPHS = 8;
const CACHE_PAGE = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const CACHE_MISSING = "public, max-age=0, s-maxage=60";
const CACHE_FALLBACK = "public, max-age=0, s-maxage=30";
const TRACKING_PARAM = /^(utm_|gclid$|fbclid$|gad_source$|srsltyid$)/;

// Old catalogue addresses that catalog/routing.js still resolves and redirects in the browser (tests/seo-page-qa.mjs
// keeps this list equal to routing.js). They must not answer 404.
const LEGACY_CATALOG_PATHS = new Set([
  "/catalog/heating/boiler-accessories",
  "/catalog/heating/circulation-pumps",
  "/catalog/heating/circulation-pumps/dhw-recirculation",
  "/catalog/heating/circulation-pumps/system-circulation",
  "/catalog/heating/gas-boilers",
  "/catalog/heating/heat-accumulators",
  "/catalog/heating/hot-water-tanks",
  "/catalog/heating/industrial-heating",
  "/catalog/heating/pellet-boilers",
  "/catalog/heating/pellet-burners",
  "/catalog/heating/solid-fuel-boilers",
  "/catalog/heating/valves",
  "/catalog/water-supply/components",
  "/catalog/water-supply/components/pressure-tanks",
  "/catalog/water-supply/components/pump-accessories",
  "/catalog/water-supply/components/pump-automation",
  "/catalog/water-supply/components/pump-services",
  "/catalog/water-supply/drainage-pumps",
  "/catalog/water-supply/sewage-lifting-units",
  "/catalog/water-supply/sewage-pumps",
  "/catalog/water-supply/system-circulation",
  "/catalog/water-supply/water-pumps",
  "/catalog/water-supply/water-pumps/borehole-pumps",
  "/catalog/water-supply/water-pumps/drainage-pumps",
  "/catalog/water-supply/water-pumps/multistage-pumps",
  "/catalog/water-supply/water-pumps/pool-pumps-filtration",
  "/catalog/water-supply/water-pumps/pressure-boosting",
  "/catalog/water-supply/water-pumps/sewage-lifting-units",
  "/catalog/water-supply/water-pumps/sewage-pumps",
  "/catalog/water-supply/water-pumps/surface-pumps",
  "/catalog/water-supply/water-supply-components",
  "/catalog/water-supply/water-supply-components/pump-services",
  "/catalog/water-supply/water-treatment",
  "/catalog/water-treatment/chlorine-odor-removal",
  "/catalog/water-treatment/complex-treatment",
  "/catalog/water-treatment/disinfection",
  "/catalog/water-treatment/disinfection/uv-c-lamps",
  "/catalog/water-treatment/drinking-system-cartridges",
  "/catalog/water-treatment/filter-media",
  "/catalog/water-treatment/flow-filters",
  "/catalog/water-treatment/mainline-cartridges",
  "/catalog/water-treatment/mainline-filters-housings",
  "/catalog/water-treatment/materials-reagents",
  "/catalog/water-treatment/materials-reagents/filter-media",
  "/catalog/water-treatment/mechanical-treatment",
  "/catalog/water-treatment/replacement-elements",
  "/catalog/water-treatment/replacement-elements/drinking-system-cartridges",
  "/catalog/water-treatment/reverse-osmosis",
  "/catalog/water-treatment/water-softening"
]);

const FIRST_PAINT_STYLE = `<style>.ssr-page{min-height:100vh;padding:132px 0 48px;line-height:1.5}.ssr-page h1{margin:12px 0}.ssr-page img{display:block;max-width:320px;height:auto;margin:16px 0}.ssr-page dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 16px;max-width:720px}.ssr-page dd{margin:0}.ssr-page ul{padding-left:20px}.ssr-price{font-size:24px;font-weight:700}</style>`;

export const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

// JSON inside <script>: "<" is escaped so catalogue text cannot close the tag.
const jsonForScript = data => JSON.stringify(data).replace(/</g, "\\u003c");

const clean = (value, limit = Infinity) => {
  const text = String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
};

const money = amount => `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(Number(amount) || 0))} грн`;

export function resolveSiteOrigin(env = process.env) {
  const candidate = String(env.SOFIEVKA_SITE_URL || "").trim()
    || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://sofievka.vercel.app");
  return new URL(candidate).origin;
}

const absolute = (href, origin) => {
  try { return new URL(href, origin).href; } catch { return ""; }
};

// Category lookups over the bootstrap taxonomy: the same rule as catalog/routing.js and the sitemap.
export function createTaxonomy(categories = []) {
  const visible = category => category?.status === "active" && (category.visibility || "catalog") === "catalog";
  const byId = new Map(categories.map(category => [category.id, category]));
  const childrenOf = parentId => categories
    .filter(category => visible(category) && (category.parentId || null) === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const chain = category => {
    const result = [];
    for (let current = category; current && result.length <= 10; current = current.parentId ? byId.get(current.parentId) : null) {
      result.unshift(current);
    }
    return result;
  };
  const pathOf = category => `/catalog/${chain(category).map(item => encodeURIComponent(item.slug)).join("/")}`;
  const resolve = segments => {
    let current = null;
    for (const segment of segments) {
      current = childrenOf(current?.id ?? null).find(category => category.slug === segment);
      if (!current) return null;
    }
    return current;
  };
  return { byId, childrenOf, chain, pathOf, resolve };
}

export function hasFilterParams(search = "") {
  for (const key of new URLSearchParams(search).keys()) if (!TRACKING_PARAM.test(key)) return true;
  return false;
}

function crumbsMarkup(items) {
  const parts = items.map((item, index) => index === items.length - 1
    ? `<span aria-current="page">${escapeHtml(item.name)}</span>`
    : `<a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a>`);
  return `<nav class="page-breadcrumbs" aria-label="Хлібні крихти">${parts.join(" / ")}</nav>`;
}

function breadcrumbSchema(items, origin) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem", position: index + 1, name: item.name, item: absolute(item.href, origin)
    }))
  };
}

function categoryCrumbs(taxonomy, category) {
  const items = [{ name: "Головна", href: "/" }, { name: "Каталог", href: "/catalog" }];
  if (category) for (const item of taxonomy.chain(category)) items.push({ name: item.shortTitle || item.title, href: taxonomy.pathOf(item) });
  return items;
}

function priceLabel(pricing) {
  if (pricing?.priceStatus === "known" && Number(pricing.amount) > 0) return money(pricing.amount);
  return "Ціну уточнюйте";
}

const AVAILABILITY_LABEL = {
  in_stock: "В наявності",
  out_of_stock: "Немає в наявності",
  preorder: "Під замовлення",
  discontinued: "Знято з виробництва"
};
const availabilityLabel = status => AVAILABILITY_LABEL[status] || "Наявність уточнюйте";

function specificationsOf(product) {
  const seen = new Set();
  const items = [];
  for (const attribute of product.catalogAttributes || []) {
    if (attribute.id === "productType" || attribute.value === null || attribute.value === undefined || attribute.value === "") continue;
    const label = clean(attribute.label).replace(/,\s*[^,]+$/, attribute.unit ? "" : "$&");
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const value = Array.isArray(attribute.value) ? attribute.value.join(", ") : attribute.value;
    items.push([label, clean(attribute.unit ? `${value} ${attribute.unit}` : value)]);
    if (items.length >= MAX_SPECIFICATIONS) break;
  }
  return items;
}

function paragraphsOf(product) {
  const fromSections = (product.descriptionSections || []).flatMap(section => section?.paragraphs || []);
  const source = fromSections.length ? fromSections : String(product.fullDescription || product.description || product.shortDescription || "").split(/\n{2,}/);
  return source.map(paragraph => clean(paragraph)).filter(Boolean).slice(0, MAX_PARAGRAPHS);
}

// Same rules as page-shell.js (displaySku, shortSeoTitle, productGtin); tests/seo-page-qa.mjs keeps them in step.
// Import placeholders («altep-p20-5», «baxi-аксесуари-…», «TJ-new_…») are not manufacturer codes.
export function displaySku(product) {
  const sku = String(product?.sku || product?.id || "").trim();
  if (!sku) return "";
  if (/^(altep|baxi|buderus|focus)-/i.test(sku) || /^tj-new_/i.test(sku) || /запит/i.test(sku)) return "";
  const brand = String(product?.brandId || product?.brand || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (brand && sku.toLowerCase().startsWith(`${brand}-`) && sku === sku.toLowerCase() && /[a-zа-яіїєґ]{3,}-[a-zа-яіїєґ0-9]/.test(sku.slice(brand.length + 1))) return "";
  if (sku.toLowerCase() === String(product?.title || "").trim().toLowerCase()) return "";
  if (/^[А-ЯІЇЄҐ][а-яіїєґ’']{3,}\s/.test(sku)) return "";
  return sku;
}

// Search results show about 60 characters of a title: the generic tail goes first, the shop name stays.
export function shortSeoTitle(title) {
  let text = String(title || "").replace(/\s+/g, " ").trim();
  if (text.length > 65) text = text.replace(/\s+—\s+характеристики(?: та ціна)?(?=\s*\|)/i, "");
  return text;
}

export function productGtin(product) {
  const rows = [...(product?.unmappedAttributes || []), ...(product?.sourceAttributes || [])];
  const value = product?.ean || product?.gtin || rows.find(item => /^(ean|gtin|штрих)/i.test(String(item?.label || "").trim()))?.value;
  const digits = String(value || "").replace(/\D/g, "");
  return [8, 12, 13, 14].includes(digits.length) ? digits : "";
}

export function renderProduct({ product, relatedProducts = [], bootstrap, origin }) {
  const taxonomy = createTaxonomy(bootstrap.categories);
  const brand = (bootstrap.brands || []).find(item => item.id === product.brandId);
  const category = taxonomy.byId.get(product.primaryCategoryId);
  const path = `/product/${encodeURIComponent(product.slug)}`;
  const url = absolute(path, origin);
  const title = shortSeoTitle(clean(product.seo?.title) || `${clean(product.title)} | ${SITE_NAME}`);
  const description = clean(product.seo?.description || product.shortDescription || product.description, 300);
  const sku = displaySku(product);
  const gtin = productGtin(product);
  const images = (product.images || []).map(image => absolute(typeof image === "string" ? image : image?.url || image?.src, origin)).filter(Boolean);
  const pricing = product.pricing || {};
  const price = pricing.priceStatus === "known" && Number(pricing.amount) > 0 ? Number(pricing.amount) : null;
  const status = product.inventory?.status;
  const crumbs = [...categoryCrumbs(taxonomy, category), { name: clean(product.title), href: path }];
  const availability = { in_stock: "InStock", out_of_stock: "OutOfStock", preorder: "PreOrder", discontinued: "Discontinued" }[status];
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: clean(product.title),
    url,
    ...(sku ? { sku } : {}),
    ...(gtin ? { gtin } : {}),
    ...(images.length ? { image: images.slice(0, 20) } : {}),
    ...(description ? { description } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand.name } } : {}),
    ...(category ? { category: category.title } : {}),
    ...(price ? { offers: {
      "@type": "Offer", url, price: String(price), priceCurrency: pricing.currency || "UAH",
      itemCondition: "https://schema.org/NewCondition",
      ...(availability ? { availability: `https://schema.org/${availability}` } : {})
    } } : {})
  };
  const specifications = specificationsOf(product);
  const related = relatedProducts.filter(item => item?.slug).slice(0, 8);
  const oldPrice = price && Number(pricing.oldAmount) > price ? `<s>${escapeHtml(money(pricing.oldAmount))}</s> ` : "";
  const body = `<article class="ssr-page"><div class="container">${crumbsMarkup(crumbs)}
<h1>${escapeHtml(product.title)}</h1>
<p>${brand ? `<a href="/brands/${escapeHtml(encodeURIComponent(brand.id))}">${escapeHtml(brand.name)}</a> · ` : ""}${sku ? `Артикул: ${escapeHtml(sku)}` : ""}</p>
${images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(clean(product.title))}" width="320" height="320">` : ""}
<p class="ssr-price">${oldPrice}${escapeHtml(priceLabel(pricing))}</p>
<p>${escapeHtml(availabilityLabel(status))}</p>
${paragraphsOf(product).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
${specifications.length ? `<h2>Характеристики</h2><dl>${specifications.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>` : ""}
${related.length ? `<h2>Схожі товари</h2><ul>${related.map(item => `<li><a href="/product/${escapeHtml(encodeURIComponent(item.slug))}">${escapeHtml(item.title)}</a></li>`).join("")}</ul>` : ""}
</div></article>`;
  return {
    title, description, canonical: url, robots: "index,follow", ogType: "product", image: images[0] || "",
    schemas: { "schema-product": productSchema, "schema-breadcrumbs": breadcrumbSchema(crumbs, origin) },
    body
  };
}

function listingMarkup(products) {
  if (!products.length) return "";
  return `<h2>Товари</h2><ul>${products.filter(item => item?.slug).map(item => `<li><a href="/product/${escapeHtml(encodeURIComponent(item.slug))}">${escapeHtml(item.title)}</a> — ${escapeHtml(priceLabel(item.pricing))}</li>`).join("")}</ul>`;
}

export function renderCategory({ category, products = [], total = 0, bootstrap, origin, filtered = false }) {
  const taxonomy = createTaxonomy(bootstrap.categories);
  const path = taxonomy.pathOf(category);
  const crumbs = categoryCrumbs(taxonomy, category);
  const heading = clean(category.title || category.name);
  const description = clean(category.seo?.description || category.description, 300);
  const children = taxonomy.childrenOf(category.id);
  const count = bootstrap.categoryCounts ? Number(bootstrap.categoryCounts[category.id]) || 0 : total;
  const body = `<section class="ssr-page"><div class="container">${crumbsMarkup(crumbs)}
<h1>${escapeHtml(heading)}</h1>
${description ? `<p>${escapeHtml(description)}</p>` : ""}
${children.length ? `<h2>Розділи</h2><ul>${children.map(child => `<li><a href="${escapeHtml(taxonomy.pathOf(child))}">${escapeHtml(child.title)}</a></li>`).join("")}</ul>` : ""}
${listingMarkup(products)}
</div></section>`;
  return {
    title: clean(category.seo?.title || category.metaTitle) || `${heading} | ${SITE_NAME}`,
    description,
    canonical: absolute(path, origin),
    robots: filtered || count === 0 ? "noindex,follow" : "index,follow",
    ogType: "website",
    image: "",
    schemas: { "schema-breadcrumbs": breadcrumbSchema(crumbs, origin) },
    body
  };
}

export function renderBrand({ brand, products = [], bootstrap, origin, filtered = false }) {
  const path = `/brands/${encodeURIComponent(brand.id)}`;
  const crumbs = [{ name: "Головна", href: "/" }, { name: "Бренди", href: "/brands" }, { name: brand.name, href: path }];
  const description = clean(brand.seo?.description || brand.description, 300) || `${brand.name}: категорії та товари у каталозі ${SITE_NAME}.`;
  const count = Number(bootstrap.brandCounts?.[brand.id] ?? 0) || 0;
  const body = `<section class="ssr-page"><div class="container">${crumbsMarkup(crumbs)}
<h1>${escapeHtml(brand.name)}</h1>
<p>${escapeHtml(description)}</p>
${listingMarkup(products)}
</div></section>`;
  return {
    title: clean(brand.seo?.title) || `${brand.name} — товари та категорії | ${SITE_NAME}`,
    description,
    canonical: absolute(path, origin),
    robots: filtered || count === 0 ? "noindex,follow" : "index,follow",
    ogType: "website",
    image: absolute(brand.logo ? `/${String(brand.logo).replace(/^\/+/, "")}` : "", origin),
    schemas: { "schema-breadcrumbs": breadcrumbSchema(crumbs, origin) },
    body
  };
}

// Puts the rendered page into a shell (product.html, catalog.html, brand.html). Unknown shells stay untouched.
export function applyToShell(shell, page) {
  const tag = (attribute, name, content) => content ? `<meta ${attribute}="${name}" content="${escapeHtml(content)}">` : "";
  const head = [
    `<link rel="canonical" href="${escapeHtml(page.canonical)}">`,
    tag("name", "robots", page.robots),
    tag("property", "og:site_name", SITE_NAME),
    tag("property", "og:type", page.ogType),
    tag("property", "og:title", page.title),
    tag("property", "og:description", page.description),
    tag("property", "og:url", page.canonical),
    tag("property", "og:image", page.image),
    tag("name", "twitter:card", page.image ? "summary_large_image" : "summary"),
    ...Object.entries(page.schemas).map(([id, data]) => `<script type="application/ld+json" id="${id}">${jsonForScript(data)}</script>`),
    FIRST_PAINT_STYLE
  ].filter(Boolean).join("");
  return shell
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, () => tag("name", "description", page.description))
    .replace(/<link\s+rel="canonical"[^>]*>/i, "")
    .replace(/<meta\s+name="robots"[^>]*>/i, "")
    .replace(/<\/head>/i, () => `${head}</head>`)
    .replace(/<div data-page-root><\/div>/, () => `<div data-page-root data-prerendered>${page.body}</div>`);
}

function createCatalogApi({ url, key, fetchImpl }) {
  return async function rpc(name, body = {}) {
    const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  };
}

// Kept between invocations of the same function instance.
const memory = { bootstrap: null, bootstrapAt: 0, shells: new Map() };

export function resetMemory() {
  memory.bootstrap = null;
  memory.bootstrapAt = 0;
  memory.shells.clear();
}

async function loadBootstrap(rpc, now) {
  if (memory.bootstrap && now - memory.bootstrapAt < BOOTSTRAP_TTL_MS) return memory.bootstrap;
  const bootstrap = await rpc("get_catalog_bootstrap");
  if (!Array.isArray(bootstrap?.categories)) throw new Error("get_catalog_bootstrap returned no release");
  memory.bootstrap = bootstrap;
  memory.bootstrapAt = now;
  return bootstrap;
}

async function loadShell(path, requestOrigin, fetchImpl, now) {
  const cached = memory.shells.get(path);
  if (cached && now - cached.at < SHELL_TTL_MS) return cached.html;
  const response = await fetchImpl(`${requestOrigin}${path}`, { redirect: "follow", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  // 404.html is itself served with 404.
  if (!response.ok && path !== "/404.html") throw new Error(`${path}: HTTP ${response.status}`);
  const html = await response.text();
  // An empty root proves this is the static shell, not a page this function already rendered.
  if (!html.includes("<div data-page-root></div>")) throw new Error(`${path}: not an empty page shell`);
  memory.shells.set(path, { html, at: now });
  return html;
}

const single = value => Array.isArray(value) ? value.join("/") : String(value ?? "");
const SHELL_BY_KIND = { product: "/product", catalog: "/catalog", brand: "/brand" };

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

// Decides what a request gets. Pure of the HTTP response, so tests drive it directly.
export async function resolvePage({ kind, slug, path, search = "", rpc, origin, now = Date.now() }) {
  const filtered = hasFilterParams(search);
  if (kind === "product") {
    const value = safeDecode(single(slug)).toLowerCase();
    let result = value ? await rpc("get_catalog_product_by_slug", { product_slug: value }) : null;
    if (!result?.product && value) {
      // /product/<legacy id> from old links: the id keeps its case, so ask with the original spelling.
      const byId = await rpc("get_catalog_product", { legacy_id: safeDecode(single(slug)) });
      if (byId?.product?.slug) return { redirect: `/product/${encodeURIComponent(byId.product.slug)}${search}` };
    }
    if (!result?.product) return { missing: true };
    const bootstrap = await loadBootstrap(rpc, now);
    return { page: renderProduct({ product: result.product, relatedProducts: result.relatedProducts || [], bootstrap, origin }) };
  }
  if (kind === "catalog") {
    const segments = safeDecode(single(path)).split("/").filter(Boolean);
    // No usable path means the rewrite did not pass it: never answer 404 for a page that may exist.
    if (!segments.length || segments[0].startsWith(":")) return { plainShell: true };
    const requested = `/catalog/${segments.join("/")}`.replace(/\.html$/i, "");
    if (LEGACY_CATALOG_PATHS.has(requested) || /^\/catalog\/water-supply\/water-treatment\/[^/]+$/.test(requested)) return { plainShell: true };
    const bootstrap = await loadBootstrap(rpc, now);
    const category = createTaxonomy(bootstrap.categories).resolve(segments);
    if (!category) return { missing: true };
    const listing = await rpc("get_catalog_products", { scope_category: category.id, page_size: LISTING_SIZE });
    return { page: renderCategory({ category, products: listing?.products || [], total: listing?.total || 0, bootstrap, origin, filtered }) };
  }
  if (kind === "brand") {
    const value = safeDecode(single(slug));
    const bootstrap = await loadBootstrap(rpc, now);
    const brand = (bootstrap.brands || []).find(item => item.id === value);
    if (!brand) return { missing: true };
    const listing = await rpc("get_catalog_products", { scope_brand: brand.id, page_size: LISTING_SIZE });
    return { page: renderBrand({ brand, products: listing?.products || [], bootstrap, origin, filtered }) };
  }
  return { missing: true };
}

export default async function handler(req, res, { fetchImpl = fetch, env = process.env } = {}) {
  const { kind, slug, path } = req.query || {};
  const send = (status, cache, html) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", cache);
    res.end(html);
  };
  const requestUrl = new URL(req.url || "/", "https://internal.invalid");
  requestUrl.searchParams.delete("kind");
  requestUrl.searchParams.delete("slug");
  requestUrl.searchParams.delete("path");
  const search = requestUrl.search;
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
  const requestOrigin = `https://${String(host).split(",")[0].trim()}`;
  const now = Date.now();
  const shellPath = SHELL_BY_KIND[kind];

  try {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    if (!shellPath || !url || !key) throw new Error("catalogue API is not configured");
    const rpc = createCatalogApi({ url, key, fetchImpl });
    const result = await resolvePage({ kind, slug, path, search, rpc, origin: resolveSiteOrigin(env), now });
    if (result.redirect) {
      res.statusCode = 308;
      res.setHeader("Location", result.redirect);
      res.setHeader("Cache-Control", CACHE_PAGE);
      res.end();
      return;
    }
    if (result.missing) {
      send(404, CACHE_MISSING, await loadShell("/404.html", requestOrigin, fetchImpl, now));
      return;
    }
    const shell = await loadShell(shellPath, requestOrigin, fetchImpl, now);
    if (result.plainShell) {
      send(200, CACHE_PAGE, shell);
      return;
    }
    send(200, CACHE_PAGE, applyToShell(shell, result.page));
  } catch (error) {
    console.error("seo-page:", error?.message || error);
    try {
      send(200, CACHE_FALLBACK, await loadShell(shellPath || SHELL_BY_KIND.catalog, requestOrigin, fetchImpl, now));
    } catch {
      send(503, "no-store", `<!doctype html><html lang="uk"><meta charset="utf-8"><title>${SITE_NAME}</title><p>Сторінка тимчасово недоступна. Оновіть її за хвилину.</p></html>`);
    }
  }
}
