import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = "https://sofievka.vercel.app";
const assetVersion = "20260912-production-1";
const dataScripts = [
  "site-config.js",
  "brands-data.js",
  "products-data.js",
  "water-catalog-data.js",
  "termojet-products-data.js",
  "catalog-data.js",
  "catalog-ui.js"
];

const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;"
})[character]);

const textOnly = value => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const descriptionOf = value => textOnly(value).slice(0, 260);

function genericElement(tagName = "div") {
  return {
    tagName: tagName.toUpperCase(),
    className: "",
    hidden: false,
    dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    append() {},
    appendChild() {},
    replaceChildren() {},
    setAttribute() {},
    getAttribute() { return null; },
    hasAttribute() { return false; },
    removeAttribute() {},
    toggleAttribute() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    matches() { return false; },
    closest() { return null; }
  };
}

function createEnvironment(pageName = "", pathname = "/", search = "") {
  let renderedHtml = "";
  const rootElement = genericElement("div");
  Object.defineProperty(rootElement, "innerHTML", {
    get: () => renderedHtml,
    set: value => { renderedHtml = String(value); }
  });

  const headElements = [];
  const head = {
    append(element) { headElements.push(element); },
    querySelector(selector) {
      if (selector === 'link[rel="canonical"]') return headElements.find(item => item.rel === "canonical") || null;
      const metaMatch = selector.match(/^meta\[name="([^"]+)"\]$/);
      return metaMatch ? headElements.find(item => item.name === metaMatch[1]) || null : null;
    }
  };
  const document = {
    title: "",
    body: { dataset: { page: pageName } },
    head,
    createElement: genericElement,
    addEventListener() {},
    querySelector(selector) {
      if (selector === "[data-page-root]") return rootElement;
      return head.querySelector(selector);
    },
    querySelectorAll() { return []; }
  };
  const location = {
    pathname,
    search,
    href: `${siteUrl}${pathname}${search}`,
    assign() {}
  };
  const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const window = {
    document,
    location,
    localStorage,
    matchMedia,
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame() { return 0; },
    addEventListener() {},
    dispatchEvent() {}
  };
  window.window = window;
  const context = vm.createContext({
    window,
    document,
    location,
    localStorage,
    console,
    URL,
    URLSearchParams,
    Intl,
    Map,
    Set,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    JSON,
    Math,
    Date,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
    requestAnimationFrame() { return 0; },
    setTimeout() { return 0; },
    clearTimeout() {},
    history: { back() {} },
    CustomEvent: class CustomEvent {}
  });
  return { context, window, document, location, rootElement, headElements, getRenderedHtml: () => renderedHtml };
}

function runScript(environment, filename) {
  vm.runInContext(fs.readFileSync(path.join(root, filename), "utf8"), environment.context, { filename });
}

function createCoreRuntime() {
  const environment = createEnvironment();
  dataScripts.forEach(filename => runScript(environment, filename));
  return environment;
}

let renderEnvironment = null;
function renderDynamicPage(pageName, pathname, search = "") {
  if (!renderEnvironment) renderEnvironment = createCoreRuntime();
  const environment = renderEnvironment;
  environment.window.__sofievkaPageShellInitialized = false;
  environment.document.body.dataset.page = pageName;
  environment.document.title = "";
  environment.location.pathname = pathname;
  environment.location.search = search;
  environment.location.href = `${siteUrl}${pathname}${search}`;
  environment.rootElement.innerHTML = "";
  environment.headElements.length = 0;
  runScript(environment, "page-shell.js");
  const html = environment.getRenderedHtml();
  if (!html) throw new Error(`Page shell produced no HTML for ${pageName} at ${pathname}`);
  return { html, runtime: environment.window, document: environment.document };
}

function schemaMarkup(schema) {
  if (!schema) return "";
  return `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
}

function documentMarkup({ pageName, title, description, canonicalPath, content, robots = "index,follow", schema = null }) {
  const canonical = `${siteUrl}${canonicalPath}`;
  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#202020">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${pageName === "product" ? "product" : "website"}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}">
  <link rel="stylesheet" href="/pages.css?v=${assetVersion}">
  <script src="/site-config.js?v=${assetVersion}" defer></script>
  <script src="/brands-data.js?v=20260818-photo-icons-1" defer></script>
  <script src="/products-data.js?v=20260825-feed-1" defer></script>
  <script src="/termojet-products-data.js?v=20260825-termojet-1" defer></script>
  <script src="/water-catalog-data.js?v=${assetVersion}" defer></script>
  <script src="/catalog-data.js?v=${assetVersion}" defer></script>
  <script src="/catalog-ui.js?v=${assetVersion}" defer></script>
  <script src="/page-shell.js?v=${assetVersion}" defer></script>
  ${schemaMarkup(schema)}
</head>
<body data-page="${escapeHtml(pageName)}"><div data-page-root>${content}</div></body>
</html>
`;
}

function writeFile(relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function extractMeta(filename) {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  const title = source.match(/<title>([^<]+)<\/title>/i)?.[1] || "ТД «Софіївка»";
  const description = source.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] || "Інженерне обладнання, комплектація, монтаж і сервіс.";
  return { title, description };
}

function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`
    }))
  };
}

const core = createCoreRuntime();
const catalog = core.window.sofievkaCatalog;
const taxonomy = core.window.sofievkaTaxonomy;
const catalogUi = core.window.sofievkaCatalogUI;
const allProducts = catalog.products;

const staticPages = [
  ["about", "about.html", "/about", true],
  ["blog", "blog.html", "/blog", true],
  ["buyers", "buyers.html", "/buyers", true],
  ["contact", "contact.html", "/contact", true],
  ["delivery", "delivery.html", "/delivery", true],
  ["faq", "faq.html", "/faq", true],
  ["installation", "installation.html", "/installation", true],
  ["partnership", "partnership.html", "/partnership", true],
  ["payment", "payment.html", "/payment", true],
  ["portfolio", "portfolio.html", "/portfolio", true],
  ["privacy", "privacy.html", "/privacy", true],
  ["returns", "returns.html", "/returns", true],
  ["service-center", "service-center.html", "/service-center", true],
  ["services", "services.html", "/services", true],
  ["solutions", "solutions.html", "/solutions", true],
  ["terms", "terms.html", "/terms", true],
  ["warranty", "warranty.html", "/warranty", true],
  ["account", "account.html", "/account", false],
  ["cart", "cart.html", "/cart", false],
  ["checkout", "checkout.html", "/checkout", false],
  ["compare", "compare.html", "/compare", false],
  ["favorites", "favorites.html", "/favorites", false],
  ["search", "search.html", "/search", false]
];

const sitemapPaths = ["/"];
for (const [pageName, filename, route, indexable] of staticPages) {
  const meta = extractMeta(filename);
  const rendered = renderDynamicPage(pageName, route);
  writeFile(filename, documentMarkup({
    pageName,
    title: meta.title,
    description: meta.description,
    canonicalPath: route,
    content: rendered.html,
    robots: indexable ? "index,follow" : "noindex,follow",
    schema: indexable ? breadcrumbSchema([{ name: "Головна", path: "/" }, { name: meta.title.replace(/ \|.+$/, ""), path: route }]) : null
  }));
  if (indexable) sitemapPaths.push(route);
}

const catalogRoot = renderDynamicPage("catalog", "/catalog");
writeFile("catalog.html", documentMarkup({
  pageName: "catalog",
  title: catalog.sectionById.all.metaTitle,
  description: catalog.sectionById.all.description,
  canonicalPath: "/catalog",
  content: catalogRoot.html,
  schema: breadcrumbSchema([{ name: "Головна", path: "/" }, { name: "Каталог", path: "/catalog" }])
}));
sitemapPaths.push("/catalog");

for (const category of taxonomy.nodes.filter(item => item.status === "active" && (item.level === 1 || catalog.productsForCategory(item.id).length > 0))) {
  const route = catalog.getCategoryPath(category.id);
  const rendered = renderDynamicPage("catalog", route);
  const chain = [...catalog.getCategoryAncestors(category.id), category];
  const schema = breadcrumbSchema([
    { name: "Головна", path: "/" },
    { name: "Каталог", path: "/catalog" },
    ...chain.map(item => ({ name: item.name, path: catalog.getCategoryPath(item.id) }))
  ]);
  writeFile(path.join(route.slice(1), "index.html"), documentMarkup({
    pageName: "catalog",
    title: category.metaTitle || `${category.title || category.name} | ТД «Софіївка»`,
    description: category.description || `Товари категорії ${category.title || category.name} у каталозі ТД «Софіївка».`,
    canonicalPath: route,
    content: rendered.html,
    schema
  }));
  sitemapPaths.push(route);
}

const brandsWithProducts = catalog.brands.filter(brand => allProducts.some(product => product.brandId === brand.id));
for (const brand of brandsWithProducts) {
  const route = catalog.brandUrl(brand.id);
  const rendered = renderDynamicPage("brand", route);
  const count = allProducts.filter(product => product.brandId === brand.id).length;
  writeFile(path.join(route.slice(1), "index.html"), documentMarkup({
    pageName: "brand",
    title: `${brand.name} — товари та категорії | ТД «Софіївка»`,
    description: `${brand.name}: ${count} ${count === 1 ? "товар" : "товарів"} у каталозі ТД «Софіївка». Категорії, характеристики, ціни та наявність.`,
    canonicalPath: route,
    content: rendered.html,
    schema: breadcrumbSchema([{ name: "Головна", path: "/" }, { name: "Бренди", path: "/brands" }, { name: brand.name, path: route }])
  }));
  sitemapPaths.push(route);
}

const availabilityMap = {
  in_stock: "https://schema.org/InStock",
  out_of_stock: "https://schema.org/OutOfStock",
  pre_order: "https://schema.org/PreOrder"
};

for (const product of allProducts) {
  const route = catalog.productUrl(product);
  const rendered = renderDynamicPage("product", route);
  const amount = Number(product.pricing?.amount ?? product.price);
  const availability = product.inventory?.status || product.availability || "unknown";
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    sku: product.sku || product.id,
    url: `${siteUrl}${route}`,
    description: descriptionOf(product.fullDescription || product.description || product.title),
    brand: { "@type": "Brand", name: product.brand },
    category: product.primaryCategoryName || undefined,
    image: (product.images || [product.image]).filter(Boolean).map(image => /^https?:\/\//.test(image) ? image : `${siteUrl}${image.startsWith("/") ? image : `/${image}`}`),
    offers: Number.isFinite(amount) && amount > 0 ? {
      "@type": "Offer",
      priceCurrency: "UAH",
      price: amount,
      availability: availabilityMap[availability] || "https://schema.org/LimitedAvailability",
      url: `${siteUrl}${route}`
    } : undefined
  };
  const category = catalog.categoryById[product.primaryCategoryId];
  const chain = category ? [...catalog.getCategoryAncestors(category.id), category] : [];
  writeFile(path.join(route.slice(1), "index.html"), documentMarkup({
    pageName: "product",
    title: `${product.title} | ТД «Софіївка»`,
    description: descriptionOf(product.fullDescription || product.description || `${product.title}: характеристики, ціна та наявність.`),
    canonicalPath: route,
    content: rendered.html,
    schema: {
      "@context": "https://schema.org",
      "@graph": [schema, breadcrumbSchema([
        { name: "Головна", path: "/" },
        { name: "Каталог", path: "/catalog" },
        ...chain.map(item => ({ name: item.name, path: catalog.getCategoryPath(item.id) })),
        { name: product.title, path: route }
      ])]
    }
  }));
  sitemapPaths.push(route);
}

const legacyProduct = renderDynamicPage("product", "/product");
writeFile("product.html", documentMarkup({
  pageName: "product",
  title: "Товар | ТД «Софіївка»",
  description: "Сторінка товару в каталозі ТД «Софіївка».",
  canonicalPath: "/catalog",
  content: legacyProduct.html,
  robots: "noindex,follow"
}));

const legacyBrand = renderDynamicPage("brand", "/brand");
writeFile("brand.html", documentMarkup({
  pageName: "brand",
  title: "Бренд | ТД «Софіївка»",
  description: "Сторінки брендів у каталозі ТД «Софіївка».",
  canonicalPath: "/brands",
  content: legacyBrand.html,
  robots: "noindex,follow"
}));

for (const [filename, categoryId] of [["heating.html", "heating"], ["water-supply.html", "water-supply"], ["plumbing.html", "plumbing"], ["climate.html", "climate"]]) {
  const category = catalog.categoryById[categoryId];
  const route = catalog.getCategoryPath(categoryId);
  const rendered = renderDynamicPage("catalog", route);
  writeFile(filename, documentMarkup({
    pageName: "catalog",
    title: category.metaTitle || `${category.name} | ТД «Софіївка»`,
    description: category.description,
    canonicalPath: route,
    content: rendered.html,
    robots: "noindex,follow"
  }));
}

let home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const homeCategories = catalogUi.homeCards();
const homeProducts = catalog.featuredProducts(4).map(product => catalogUi.renderProductCard(product, { variant: "compact" })).join("");
home = home.replace(/<!-- prerender:home-categories:start -->[\s\S]*?<!-- prerender:home-categories:end -->/, `<!-- prerender:home-categories:start -->${homeCategories}<!-- prerender:home-categories:end -->`);
home = home.replace(/<!-- prerender:home-products:start -->[\s\S]*?<!-- prerender:home-products:end -->/, `<!-- prerender:home-products:start -->${homeProducts}<!-- prerender:home-products:end -->`);
writeFile("index.html", home);

let brandsPage = fs.readFileSync(path.join(root, "brands.html"), "utf8");
const brandGroups = Object.entries(Object.groupBy(catalog.brands, brand => brand.name.charAt(0).toLocaleUpperCase("uk")))
  .sort(([first], [second]) => first.localeCompare(second, "uk"))
  .map(([letter, brands]) => `<section class="brand-group" aria-labelledby="brand-letter-${escapeHtml(letter)}"><h2 id="brand-letter-${escapeHtml(letter)}">${escapeHtml(letter)}</h2><div class="brand-directory-grid">${brands.map(brand => {
    const count = allProducts.filter(product => product.brandId === brand.id).length;
    const logo = brand.logo ? `<span class="brand-media"><img src="${escapeHtml(brand.logo)}" alt="Логотип ${escapeHtml(brand.name)}" loading="lazy"></span>` : `<span class="brand-media"><span class="brand-media__fallback">${escapeHtml(brand.name)}</span></span>`;
    return `<a class="brand-directory-card" href="${count ? catalog.brandUrl(brand.id) : `/brands#brand-${encodeURIComponent(brand.id)}`}" id="brand-${escapeHtml(brand.id)}"><span>${logo}</span><span class="brand-directory-card__content"><strong class="brand-directory-card__name">${escapeHtml(brand.name)}</strong><p>${escapeHtml(brand.description || "Виробник інженерного обладнання")}${count ? ` · ${count} товарів` : " · товари очікуються"}</p></span></a>`;
  }).join("")}</div></section>`).join("");
brandsPage = brandsPage.replace(/<!-- prerender:brand-directory:start -->[\s\S]*?<!-- prerender:brand-directory:end -->/, `<!-- prerender:brand-directory:start -->${brandGroups}<!-- prerender:brand-directory:end -->`);
writeFile("brands.html", brandsPage);
sitemapPaths.push("/brands");

const uniqueSitemapPaths = [...new Set(sitemapPaths)].sort();
writeFile("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniqueSitemapPaths.map(route => `  <url><loc>${siteUrl}${escapeHtml(route)}</loc></url>`).join("\n")}\n</urlset>\n`);
writeFile("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);

console.log(JSON.stringify({
  status: "ok",
  staticPages: staticPages.length,
  categories: taxonomy.nodes.filter(item => item.status === "active" && (item.level === 1 || catalog.productsForCategory(item.id).length > 0)).length,
  brands: brandsWithProducts.length,
  products: allProducts.length,
  sitemapUrls: uniqueSitemapPaths.length
}, null, 2));
