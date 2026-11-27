// Server first paint for product, category and brand pages. These pages are rendered in the browser, so their raw
// HTML used to be an empty shell: crawlers and link previews saw "Товар | ТД «Софіївка»" and an unknown address
// answered 200. Here the shell gets the real title, description, canonical, Open Graph, JSON-LD and readable content
// from the same public RPCs the storefront uses, and an unknown address answers 404. The client still renders the
// page as before and replaces this markup.
//
// A temporary data failure keeps the shell available for the browser and gives crawlers a retryable response.
import legacyCatalogRouting from "../catalog/routing.js";
import sourceMappings from "../catalog/source-mappings.js";
import categoryEditorial from "../catalog/category-editorial.js";
import { isPostSlug, renderPostPage } from "../lib/seo-post.mjs";
import { escapeHtml, faqSchema, jsonForScript, organizationSchema, schemaMarkup, seoText as clean, SITE_NAME, snippetTitle } from "../lib/seo-meta.mjs";

export { escapeHtml };
const REQUEST_TIMEOUT_MS = 4000;
const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;
const SHELL_TTL_MS = 5 * 60 * 1000;
const LISTING_SIZE = 24;
const MAX_SPECIFICATIONS = 40;
const MAX_PARAGRAPHS = 8;
const CACHE_PAGE = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const CACHE_MISSING = "public, max-age=0, s-maxage=60";
const CACHE_FALLBACK = "no-store";
const TRACKING_PARAM = /^(utm_|gclid$|dclid$|fbclid$|gad_source$|gad_campaignid$|gbraid$|wbraid$|msclkid$|srsltyid$)/i;

// In a framed shell (header, placeholders and footer from the build) the content waits hidden for the client
// render; the shell's <noscript> style shows it to visitors without JavaScript.
const FIRST_PAINT_STYLE = `<style>[data-page-frame] .ssr-page{display:none}.ssr-page{min-height:100vh;padding:132px 0 48px;line-height:1.5}.ssr-page h1{margin:12px 0}.ssr-page img{display:block;max-width:320px;height:auto;margin:16px 0}.ssr-page dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 16px;max-width:720px}.ssr-page dd{margin:0}.ssr-page ul{padding-left:20px}.ssr-price{font-size:24px;font-weight:700}</style>`;

const money = amount => `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(amount) || 0)} грн`;

function knownPrice(pricing) {
  const amount = Number(pricing?.amount);
  return pricing?.priceStatus === "known" && Number.isFinite(amount) && amount > 0 ? amount : null;
}

function titleWithPrice(template, price, fallback) {
  if (!template.includes("{min}")) return template;
  return price ? template.replaceAll("{min}", price) : fallback;
}

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
  if (knownPrice(pricing)) return `${money(pricing.amount)}${pricing.unit === "m" ? "/м" : ""}`;
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
  const path = product.slug ? `/product/${encodeURIComponent(product.slug)}` : `/product?id=${encodeURIComponent(product.id)}`;
  const url = absolute(path, origin);
  const pricing = product.pricing || {};
  const price = knownPrice(pricing);
  const fallbackTitle = `${clean(product.title)} | ${SITE_NAME}`;
  const title = snippetTitle(shortSeoTitle(titleWithPrice(clean(product.seo?.title) || fallbackTitle, price && priceLabel(pricing), fallbackTitle)), clean(product.model) || displaySku(product));
  const description = clean(product.seo?.description || product.shortDescription || product.description || product.title, 160);
  const sku = displaySku(product);
  const gtin = productGtin(product);
  const images = (product.images || []).map(image => absolute(typeof image === "string" ? image : image?.url || image?.src, origin)).filter(Boolean);
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
      seller: { "@id": `${origin}/#organization` },
      ...(pricing.unit === "m" ? { priceSpecification: {
        "@type": "UnitPriceSpecification", price: String(price), priceCurrency: pricing.currency || "UAH",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "м" }
      } } : {}),
      ...(availability ? { availability: `https://schema.org/${availability}` } : {})
    } } : {})
  };
  const specifications = specificationsOf(product);
  const related = relatedProducts.filter(item => item?.slug).slice(0, 8);
  const oldPrice = price && Number(pricing.oldAmount) > price ? `<s>${escapeHtml(priceLabel({ ...pricing, amount: pricing.oldAmount }))}</s> ` : "";
  const body = `<article class="ssr-page"><div class="container">${crumbsMarkup(crumbs)}
<h1>${escapeHtml(product.title)}</h1>
<p>${brand ? `<a href="/brands/${escapeHtml(encodeURIComponent(brand.id))}">${escapeHtml(brand.name)}</a> · ` : ""}${sku ? `Артикул: ${escapeHtml(sku)}` : ""}</p>
${images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(clean(product.title))}" width="320" height="320" fetchpriority="high" decoding="async">` : ""}
<p class="ssr-price">${oldPrice}${escapeHtml(priceLabel(pricing))}</p>
<p>${escapeHtml(availabilityLabel(status))}</p>
${paragraphsOf(product).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
${specifications.length ? `<h2>Характеристики</h2><dl>${specifications.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>` : ""}
${related.length ? `<h2>Схожі товари</h2><ul>${related.map(item => `<li><a href="/product/${escapeHtml(encodeURIComponent(item.slug))}">${escapeHtml(item.title)}</a></li>`).join("")}</ul>` : ""}
</div></article>`;
  return {
    title, description, canonical: url, robots: "index,follow", ogType: "product", image: images[0] || "",
    schemas: { ...(price ? { "schema-product": productSchema } : {}), "schema-breadcrumbs": breadcrumbSchema(crumbs, origin) },
    body
  };
}

function listingMarkup(products) {
  if (!products.length) return "";
  return `<h2>Товари</h2><ul>${products.filter(item => item?.slug).map(item => `<li><a href="/product/${escapeHtml(encodeURIComponent(item.slug))}">${escapeHtml(item.title)}</a> — ${escapeHtml(priceLabel(item.pricing))}</li>`).join("")}</ul>`;
}

function collectionSchema(url, name, description, products, origin) {
  const items = products.filter(product => product?.slug).map((product, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: clean(product.title),
    url: absolute(`/product/${encodeURIComponent(product.slug)}`, origin)
  }));
  return {
    "@context": "https://schema.org", "@type": "CollectionPage", url, name, description,
    ...(items.length ? { mainEntity: { "@type": "ItemList", itemListElement: items } } : {})
  };
}

export function renderCategory({ category, products = [], minimumPricing, total = 0, bootstrap, origin, filtered = false }) {
  const taxonomy = createTaxonomy(bootstrap.categories);
  const path = taxonomy.pathOf(category);
  const canonical = absolute(path, origin);
  const crumbs = categoryCrumbs(taxonomy, category);
  const heading = clean(category.title || category.name);
  const landing = categoryEditorial.landings[category.id];
  const intro = landing?.intro || clean(category.description || category.seo?.description);
  const description = clean(category.seo?.description || intro || heading, 160);
  const fallbackTitle = `${heading} | ${SITE_NAME}`;
  const configuredTitle = clean(category.seo?.title || category.metaTitle);
  const minimum = knownPrice(minimumPricing) ? priceLabel(minimumPricing) : null;
  const template = configuredTitle.includes("{min}") ? configuredTitle : (minimum && landing?.titleWithPrice) || configuredTitle || fallbackTitle;
  const title = snippetTitle(titleWithPrice(template, minimum, fallbackTitle));
  const children = taxonomy.childrenOf(category.id);
  const count = bootstrap.categoryCounts ? Number(bootstrap.categoryCounts[category.id]) || 0 : total;
  const body = `<section class="ssr-page"><div class="container">${crumbsMarkup(crumbs)}
<h1>${escapeHtml(heading)}</h1>
${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
${children.length ? `<h2>Розділи</h2><ul>${children.map(child => `<li><a href="${escapeHtml(taxonomy.pathOf(child))}">${escapeHtml(child.title)}</a>${child.description ? `<p>${escapeHtml(clean(child.description))}</p>` : ""}</li>`).join("")}</ul>` : ""}
${listingMarkup(products)}
${landing ? categoryEditorial.markup(landing, escapeHtml) : ""}
</div></section>`;
  return {
    title, description, canonical,
    robots: filtered || count === 0 ? "noindex,follow" : "index,follow",
    ogType: "website",
    image: landing?.image || "",
    imageSize: landing?.image ? { width: 1200, height: 630 } : null,
    schemas: {
      "schema-breadcrumbs": breadcrumbSchema(crumbs, origin),
      "schema-collection": collectionSchema(canonical, heading, description, products, origin),
      ...(landing?.faq.length ? { "schema-faq": faqSchema(landing.faq) } : {})
    },
    body
  };
}

export function renderBrand({ brand, products = [], bootstrap, origin, filtered = false }) {
  const path = `/brands/${encodeURIComponent(brand.id)}`;
  const crumbs = [{ name: "Головна", href: "/" }, { name: "Бренди", href: "/brands" }, { name: brand.name, href: path }];
  const description = clean(brand.seo?.description || brand.description, 160) || `${brand.name}: категорії та товари у каталозі ${SITE_NAME}.`;
  const canonical = absolute(path, origin);
  const count = Number(bootstrap.brandCounts?.[brand.id] ?? 0) || 0;
  const body = `<section class="ssr-page"><div class="container">${crumbsMarkup(crumbs)}
<h1>${escapeHtml(brand.name)}</h1>
<p>${escapeHtml(description)}</p>
${listingMarkup(products)}
</div></section>`;
  return {
    title: snippetTitle(clean(brand.seo?.title) || `${brand.name} — товари та категорії | ${SITE_NAME}`),
    description,
    canonical,
    robots: filtered || count === 0 ? "noindex,follow" : "index,follow",
    ogType: "website",
    image: brand.logo ? absolute(`/${String(brand.logo).replace(/^\/+/, "")}`, origin) : "",
    schemas: { "schema-breadcrumbs": breadcrumbSchema(crumbs, origin), "schema-collection": collectionSchema(canonical, brand.name, description, products, origin) },
    body
  };
}

// Puts the rendered page into a shell (product.html, catalog.html, brand.html). Unknown shells stay untouched.
export function applyToShell(shell, page) {
  const tag = (attribute, name, content) => `<meta ${attribute}="${name}" content="${escapeHtml(content)}">`;
  const attribute = (markup, name) => {
    for (const [, key, quoted, singleQuoted, unquoted] of markup.matchAll(/\s+([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
      if (key.toLowerCase() === name) return (quoted ?? singleQuoted ?? unquoted).trim().toLowerCase();
    }
    return "";
  };
  // Derive the company fallback from this page's origin, never from a previous page's product image.
  const image = absolute(page.image || "/assets/og-image.jpg", page.canonical);
  const imageSize = page.imageSize || (!page.image ? { width: 1200, height: 630 } : null);
  const head = [
    `<title>${escapeHtml(page.title)}</title>`,
    tag("name", "description", page.description),
    `<link rel="canonical" href="${escapeHtml(page.canonical)}">`,
    tag("name", "robots", page.robots),
    tag("property", "og:site_name", SITE_NAME),
    tag("property", "og:locale", "uk_UA"),
    tag("property", "og:type", page.ogType),
    tag("property", "og:title", page.title),
    tag("property", "og:description", page.description),
    tag("property", "og:url", page.canonical),
    tag("property", "og:image", image),
    ...(imageSize ? [tag("property", "og:image:width", imageSize.width), tag("property", "og:image:height", imageSize.height)] : []),
    tag("name", "twitter:card", image ? "summary_large_image" : "summary"),
    schemaMarkup("schema-organization", organizationSchema(new URL(page.canonical).origin)),
    ...Object.entries(page.schemas).map(([id, data]) => schemaMarkup(id, data)),
    ...(page.postData ? [`<script type="application/json" id="ssr-post-data">${jsonForScript(page.postData)}</script>`] : []),
    ...(shell.includes(FIRST_PAINT_STYLE) ? [] : [FIRST_PAINT_STYLE])
  ].filter(Boolean).join("");
  return shell
    .replace(/<head\b([^>]*)>([\s\S]*?)<\/head>/i, (match, attributes, content) => {
      const retained = content
        .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
        .replace(/<(?:meta|link)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, markup => {
          const name = attribute(markup, "name");
          return /^(?:description|robots)$/.test(name) || /^(?:og|twitter):/.test(name)
            || /^(?:og|twitter):/.test(attribute(markup, "property"))
            || attribute(markup, "rel") === "canonical" ? "" : markup;
        })
        .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, (markup, opening) => {
          const id = attribute(opening, "id");
          return id.startsWith("schema-") || id === "ssr-post-data" ? "" : markup;
        });
      const owner = /\bdata-seo-rendered\b/.test(attributes) ? "" : " data-seo-rendered";
      return `<head${attributes}${owner}>${retained}${head}</head>`;
    })
    .replace(/<div data-page-root><\/div>/, () => `<div data-page-root data-prerendered>${page.body}</div>`)
    // A framed shell (scripts/prerender-company-pages.mjs) takes the content at its slot inside <main>.
    .replace(/<div data-page-root data-page-frame>([\s\S]*?)<!--first-paint-->(?:<!--catalog-index-->[\s\S]*?<!--\/catalog-index-->)?/, (match, frame) => `<div data-page-root data-prerendered data-page-frame>${frame}${page.body}`);
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
const memory = { bootstrap: null, bootstrapAt: 0, bootstrapRequest: null, shells: new Map() };

export function resetMemory() {
  memory.bootstrap = null;
  memory.bootstrapAt = 0;
  memory.bootstrapRequest = null;
  memory.shells.clear();
}

async function loadBootstrap(rpc, now) {
  if (memory.bootstrap && now - memory.bootstrapAt < BOOTSTRAP_TTL_MS) return memory.bootstrap;
  if (memory.bootstrapRequest) return memory.bootstrapRequest;
  // Fluid instances can serve simultaneous misses. Share the metadata read rather than asking the database
  // for the same bootstrap once per page; a rejected request must not poison subsequent invocations.
  const request = Promise.resolve().then(() => rpc("get_catalog_bootstrap")).then(bootstrap => {
    if (!Array.isArray(bootstrap?.categories)) throw new Error("get_catalog_bootstrap returned no release");
    memory.bootstrap = bootstrap;
    memory.bootstrapAt = now;
    return bootstrap;
  }).finally(() => {
    if (memory.bootstrapRequest === request) memory.bootstrapRequest = null;
  });
  memory.bootstrapRequest = request;
  return request;
}

async function loadShell(path, requestOrigin, fetchImpl, now) {
  const cached = memory.shells.get(path);
  if (cached && now - cached.at < SHELL_TTL_MS) return cached.html;
  const response = await fetchImpl(`${requestOrigin}${path}`, { redirect: "follow", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  // 404.html is itself served with 404.
  if (!response.ok && path !== "/404.html") throw new Error(`${path}: HTTP ${response.status}`);
  const html = await response.text();
  // An empty root or an unfilled frame proves this is the static shell, not a page this function already rendered.
  if (!html.includes("<div data-page-root></div>") && !html.includes("<div data-page-root data-page-frame>")) throw new Error(`${path}: not an empty page shell`);
  memory.shells.set(path, { html, at: now });
  return html;
}

const single = value => Array.isArray(value) ? value.join("/") : String(value ?? "");
const SHELL_BY_KIND = { product: "/product", catalog: "/catalog", brand: "/brand", post: "/post" };

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

// Decides what a request gets. Pure of the HTTP response, so tests drive it directly.
export async function resolvePage({ kind, slug, id, path, postKind, legacyPath = false, legacySection, legacyType, search = "", rpc, origin, now = Date.now() }) {
  const filtered = hasFilterParams(search);
  if (kind === "post") {
    const requested = safeDecode(single(slug));
    const value = requested.toLowerCase();
    if (!["article", "case"].includes(postKind) || !isPostSlug(value)) return { missing: true };
    const post = await rpc("get_site_post", { post_kind: postKind, post_slug: value });
    if (!post || post.kind !== postKind || post.slug !== value) return { missing: true };
    const page = renderPostPage({ post, origin, crumbsMarkup, breadcrumbSchema });
    if (requested !== value) return { redirect: `${new URL(page.canonical).pathname}${search}` };
    return { page };
  }
  if (kind === "product") {
    const legacyId = single(id);
    const value = safeDecode(single(slug));
    // These reads do not depend on each other. Still decide missing products/legacy redirects from the
    // product response alone: unavailable metadata must not turn an unknown product into a 200 fallback.
    const bootstrapRequest = value || legacyId ? loadBootstrap(rpc, now) : null;
    bootstrapRequest?.catch(() => {});
    let result = legacyId ? await rpc("get_catalog_product", { legacy_id: legacyId }) : null;
    if (!legacyId && value) {
      result = await rpc("get_catalog_product_by_slug", { product_slug: value.toLowerCase() });
      // /product/<legacy id> from old links: the id keeps its case, so ask with the original spelling.
      if (!result?.product) result = await rpc("get_catalog_product", { legacy_id: value });
    }
    if (!result?.product) return { missing: true };
    const product = result.product;
    if (product.slug && (legacyId || legacyPath || product.slug !== value)) {
      return { redirect: `/product/${encodeURIComponent(product.slug)}${search}` };
    }
    if (!product.slug && !legacyId) {
      return { redirect: `/product?id=${encodeURIComponent(product.id)}${search ? `&${search.slice(1)}` : ""}` };
    }
    const bootstrap = await bootstrapRequest;
    return { page: renderProduct({ product, relatedProducts: result.relatedProducts || [], bootstrap, origin }) };
  }
  if (kind === "catalog") {
    const parts = single(path).split("/").filter(Boolean);
    const segments = parts.map(safeDecode);
    if ((!segments.length && !legacySection) || segments[0]?.startsWith(":")) return { missing: true };
    const bootstrap = await loadBootstrap(rpc, now);
    const taxonomy = createTaxonomy(bootstrap.categories);
    const normalized = segments.join("/").replace(/\.html$/i, "");
    const category = taxonomy.resolve(normalized.split("/"));
    if (!category || legacySection || legacyType) {
      const aliasId = (legacySection && legacyCatalogRouting.legacyQuerySections[legacySection])
        || (legacyType && sourceMappings.categoryMappings.ecosoft[legacyType]?.categoryId)
        || legacyCatalogRouting.legacyCategoryPaths[`/catalog/${normalized}`];
      const historicalWaterSlug = /^water-supply\/water-treatment\/([^/]+)$/.exec(normalized)?.[1];
      const alias = taxonomy.byId.get(aliasId) || (historicalWaterSlug && bootstrap.categories.find(item =>
        (item.slug === historicalWaterSlug || item.id === historicalWaterSlug) && taxonomy.chain(item).some(node => node.id === "water-treatment")));
      if (alias?.visibility === "service") return { redirect: `/service-center${search}` };
      const target = alias && taxonomy.pathOf(alias);
      return target && taxonomy.resolve(target.slice("/catalog/".length).split("/").map(safeDecode))
        ? { redirect: `${target}${search}` }
        : { missing: true };
    }
    if (legacyPath || normalized !== segments.join("/")) return { redirect: `${taxonomy.pathOf(category)}${search}` };
    const scope = { scope_category: category.id };
    const needsMinimum = !filtered && (categoryEditorial.landings[category.id] || (category.seo?.title || category.metaTitle || "").includes("{min}"));
    const [listing, lowest] = await Promise.all([
      rpc("get_catalog_products", { ...scope, page_size: LISTING_SIZE }),
      needsMinimum ? rpc("get_catalog_products", { ...scope, page_size: 1, sort_mode: "price-asc", minimum_price: 0.01 }).catch(() => null) : null
    ]);
    return { page: renderCategory({ category, products: listing?.products || [], minimumPricing: lowest?.products?.[0]?.pricing, total: listing?.total || 0, bootstrap, origin, filtered }) };
  }
  if (kind === "brand") {
    const value = safeDecode(single(slug));
    const bootstrap = await loadBootstrap(rpc, now);
    const brand = (bootstrap.brands || []).find(item => item.id === value);
    if (!brand) return { missing: true };
    if (legacyPath) return { redirect: `/brands/${encodeURIComponent(brand.id)}${search}` };
    const listing = await rpc("get_catalog_products", { scope_brand: brand.id, page_size: LISTING_SIZE });
    return { page: renderBrand({ brand, products: listing?.products || [], bootstrap, origin, filtered }) };
  }
  return { missing: true };
}

export default async function handler(req, res, { fetchImpl = fetch, env = process.env } = {}) {
  const { kind, slug, id, path, postKind, legacyPath, legacySection, legacyType } = req.query || {};
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
  requestUrl.searchParams.delete("postKind");
  requestUrl.searchParams.delete("legacyPath");
  requestUrl.searchParams.delete("legacySection");
  requestUrl.searchParams.delete("legacyType");
  if (legacySection) requestUrl.searchParams.delete("category");
  if (legacyType) requestUrl.searchParams.delete("type");
  if (kind === "product" && id) requestUrl.searchParams.delete("id");
  const search = requestUrl.search;
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
  const requestOrigin = `https://${String(host).split(",")[0].trim()}`;
  const now = Date.now();
  const shellPath = Object.hasOwn(SHELL_BY_KIND, kind) ? SHELL_BY_KIND[kind] : null;
  let shellRequest = null;

  try {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    if (!shellPath || !url || !key) throw new Error("catalogue API is not configured");
    const rpc = createCatalogApi({ url, key, fetchImpl });
    // The static frame is independent of catalogue reads. Start its fetch now instead of adding another
    // network round trip after the product/listing is ready. Redirects and 404s still choose their own shell.
    shellRequest = loadShell(shellPath, requestOrigin, fetchImpl, now);
    shellRequest.catch(() => {});
    const result = await resolvePage({ kind, slug, id, path, postKind, legacyPath: legacyPath === "1", legacySection, legacyType, search, rpc, origin: resolveSiteOrigin(env), now });
    if (result.redirect) {
      res.statusCode = 301;
      res.setHeader("Location", result.redirect);
      res.setHeader("Cache-Control", CACHE_PAGE);
      res.end();
      return;
    }
    if (result.missing) {
      send(404, CACHE_MISSING, await loadShell("/404.html", requestOrigin, fetchImpl, now));
      return;
    }
    const shell = await shellRequest;
    send(200, CACHE_PAGE, applyToShell(shell, result.page));
  } catch (error) {
    console.error("seo-page:", error?.message || error);
    try {
      const retryShell = () => loadShell(shellPath || SHELL_BY_KIND.catalog, requestOrigin, fetchImpl, now);
      res.setHeader("Retry-After", "60");
      send(503, CACHE_FALLBACK, await (shellRequest ? shellRequest.catch(retryShell) : retryShell()));
    } catch {
      send(503, "no-store", `<!doctype html><html lang="uk"><meta charset="utf-8"><title>${SITE_NAME}</title><p>Сторінка тимчасово недоступна. Оновіть її за хвилину.</p></html>`);
    }
  }
}
