// Build-time sitemap.xml + robots.txt (+ the Search Console verification meta on the homepage).
// The project has no serverless functions, so the sitemap is generated when Vercel builds the site:
// from the public catalogue RPCs when the build reads Supabase. Local/preview builds may fall
// back to bundled feeds; a production Supabase build must never publish an incomplete fallback.
// Published blog articles and cases are listed from
// get_site_posts when the build reads Supabase. Products published after a deploy appear in the
// sitemap on the next deploy.
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

// Pages that must stay out of search: private, per-visitor or result pages and page templates.
export const SITEMAP_EXCLUDED_PAGES = Object.freeze(new Set([
  "404", "account", "cart", "checkout", "compare", "favorites", "search",
  "brand", "product", "post", // templates: their real URLs come from the catalogue and the published posts
  "catalog", "index", "heating", "water-supply", "plumbing", "climate" // listed under their canonical URLs
]));
export const ROBOTS_DISALLOW = Object.freeze(["/admin", "/cart", "/checkout", "/account", "/search", "/compare", "/favorites"]);
const PAGE_SIZE = 96;
const MAX_PRODUCT_PAGES = 400;
const POST_PAGE_SIZE = 48;
const MAX_POST_PAGES = 50;
const RPC_ATTEMPTS = 3;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
export const POST_BASES = Object.freeze({ article: "/blog", case: "/portfolio" });

export function resolveSiteUrl(env = process.env) {
  const explicit = String(env.SOFIEVKA_SITE_URL || "").trim();
  const vercel = String(env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  const candidate = explicit || (vercel ? `https://${vercel}` : "https://sofievka.vercel.app");
  const url = new URL(candidate);
  if (url.protocol !== "https:") throw new Error("SOFIEVKA_SITE_URL must be an https URL.");
  return url.origin;
}

const xmlEscape = value => String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[character]);

export function renderSitemap(siteUrl, paths) {
  const unique = [...new Set(paths)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique
    .map(item => `  <url><loc>${xmlEscape(`${siteUrl}${item}`)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export function renderRobots(siteUrl, { indexable = true } = {}) {
  if (!indexable) return "# Preview deployment: not for indexing.\nUser-agent: *\nDisallow: /\n";
  return ["User-agent: *", "Allow: /", ...ROBOTS_DISALLOW.map(item => `Disallow: ${item}`), "", `Sitemap: ${siteUrl}/sitemap.xml`, ""].join("\n");
}

// Category, brand and product URLs from a catalogue bootstrap (categories, brands, counts) + products ({ id, slug }).
// Products with a slug get /product/<slug>; bare ids (productIds) fall back to /product?id=<id>.
export function catalogPaths({ categories = [], brands = [], categoryCounts = null, brandCounts = null, products = [], productIds = [] }) {
  const byId = new Map(categories.map(category => [category.id, category]));
  const visible = category => category && category.status === "active" && (category.visibility || "catalog") === "catalog";
  const chain = category => {
    const result = [];
    for (let current = category; current; current = current.parentId ? byId.get(current.parentId) : null) {
      if (!visible(current) || result.length > 10) return null; // hidden ancestor, missing parent or a cycle
      result.unshift(current.slug);
      if (current.parentId && !byId.has(current.parentId)) return null;
    }
    return result;
  };
  const paths = ["/catalog"];
  for (const category of categories) {
    if (categoryCounts && !(Number(categoryCounts[category.id]) > 0)) continue;
    const slugs = visible(category) ? chain(category) : null;
    if (slugs?.length) paths.push(`/catalog/${slugs.map(encodeURIComponent).join("/")}`);
  }
  for (const brand of brands) {
    if ((brand.visibility || "catalog") !== "catalog") continue;
    if (brandCounts && !(Number(brandCounts[brand.id]) > 0)) continue;
    paths.push(`/brands/${encodeURIComponent(brand.id)}`);
  }
  for (const product of products) {
    if (product?.slug) paths.push(`/product/${encodeURIComponent(product.slug)}`);
    else if (product?.id) paths.push(`/product?id=${encodeURIComponent(product.id)}`);
  }
  for (const id of productIds) if (id) paths.push(`/product?id=${encodeURIComponent(id)}`);
  return paths;
}

export async function staticPagePaths(root) {
  const paths = ["/"];
  for (const name of (await fs.readdir(root)).sort()) {
    if (!name.endsWith(".html")) continue;
    const page = name.slice(0, -".html".length);
    if (SITEMAP_EXCLUDED_PAGES.has(page)) continue;
    const head = (await fs.readFile(path.join(root, name), "utf8")).slice(0, 4000);
    if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(head)) continue;
    paths.push(`/${page}`);
  }
  return paths;
}

async function rpc(supabase, name, body, { fetchImpl, waitImpl }) {
  for (let attempt = 1; attempt <= RPC_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(`${supabase.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: supabase.publishableKey, Authorization: `Bearer ${supabase.publishableKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000)
      });
    } catch (error) {
      if (attempt === RPC_ATTEMPTS) throw new Error(`${name}: request failed after ${attempt} attempts (${error.message})`, { cause: error });
      await waitImpl(250 * attempt);
      continue;
    }
    if (response.ok) return response.json();
    if (!TRANSIENT_HTTP_STATUSES.has(response.status) || attempt === RPC_ATTEMPTS) {
      throw new Error(`${name}: HTTP ${response.status} after ${attempt} attempt${attempt === 1 ? "" : "s"}`);
    }
    await waitImpl(250 * attempt);
  }
}

async function supabaseCatalog(supabase, options, { requireComplete = false } = {}) {
  const bootstrap = await rpc(supabase, "get_catalog_bootstrap", {}, options);
  if (!Array.isArray(bootstrap?.categories)) throw new Error("get_catalog_bootstrap returned no release");
  const validTotal = value => Number.isSafeInteger(value) && value >= 0;
  if (requireComplete && !validTotal(bootstrap.totalProducts)) throw new Error("get_catalog_bootstrap returned no valid totalProducts");
  const products = [];
  const ids = new Set();
  const addresses = new Set();
  let total = null;
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page += 1) {
    const result = await rpc(supabase, "get_catalog_products", { page_number: page, page_size: PAGE_SIZE }, options);
    if (!Array.isArray(result?.products) || typeof result.hasMore !== "boolean") throw new Error(`get_catalog_products page ${page}: invalid products/hasMore`);
    if (requireComplete && !validTotal(result.total)) throw new Error(`get_catalog_products page ${page}: missing valid total`);
    if (result.total != null) {
      if (!validTotal(result.total)) throw new Error(`get_catalog_products page ${page}: invalid total`);
      if (total !== null && result.total !== total) throw new Error(`get_catalog_products page ${page}: total changed from ${total} to ${result.total}`);
      total = result.total;
      if (total > MAX_PRODUCT_PAGES * PAGE_SIZE) throw new Error(`get_catalog_products total ${total} exceeds sitemap page cap ${MAX_PRODUCT_PAGES}`);
      if (validTotal(bootstrap.totalProducts) && total !== bootstrap.totalProducts) throw new Error(`Catalogue totals differ: bootstrap ${bootstrap.totalProducts}, products ${total}`);
      if (result.hasMore !== (page * PAGE_SIZE < total)) throw new Error(`get_catalog_products page ${page}: hasMore disagrees with total ${total}`);
      const expected = Math.min(PAGE_SIZE, Math.max(0, total - (page - 1) * PAGE_SIZE));
      if (result.products.length !== expected) throw new Error(`get_catalog_products page ${page}: truncated page (${result.products.length}/${expected} products)`);
    }
    if (result.page != null && result.page !== page) throw new Error(`get_catalog_products returned page ${result.page} instead of ${page}`);
    if (result.pageSize != null && result.pageSize !== PAGE_SIZE) throw new Error(`get_catalog_products returned pageSize ${result.pageSize} instead of ${PAGE_SIZE}`);
    for (const product of result.products) {
      if (typeof product?.id !== "string" || !product.id.trim()) throw new Error(`get_catalog_products page ${page}: product has no id`);
      if (ids.has(product.id)) throw new Error(`get_catalog_products page ${page}: duplicate product id ${product.id}`);
      if (product.slug != null && typeof product.slug !== "string") throw new Error(`get_catalog_products page ${page}: invalid product slug`);
      const address = product.slug ? `/product/${encodeURIComponent(product.slug)}` : `/product?id=${encodeURIComponent(product.id)}`;
      if (addresses.has(address)) throw new Error(`get_catalog_products page ${page}: duplicate product URL ${address}`);
      ids.add(product.id);
      addresses.add(address);
      products.push({ id: product.id, slug: product.slug });
    }
    if (!result.hasMore) {
      if (total !== null && ids.size !== total) throw new Error(`Incomplete sitemap catalogue: ${ids.size}/${total} unique products`);
      return { ...bootstrap, products };
    }
  }
  throw new Error(`get_catalog_products exceeded sitemap page cap ${MAX_PRODUCT_PAGES} with hasMore=true`);
}

// Published blog articles and cases (get_site_posts); anything unexpected is skipped, never thrown.
export function postPaths(posts) {
  const paths = [];
  for (const post of Array.isArray(posts) ? posts : []) {
    const base = POST_BASES[post?.kind];
    if (base && typeof post.slug === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug)) paths.push(`${base}/${post.slug}`);
  }
  return paths;
}

async function supabasePosts(supabase, options) {
  const posts = [];
  for (const kind of Object.keys(POST_BASES)) {
    for (let page = 1; page <= MAX_POST_PAGES; page += 1) {
      const result = await rpc(supabase, "get_site_posts", { post_kind: kind, page_number: page, page_size: POST_PAGE_SIZE }, options);
      if (!Array.isArray(result?.posts)) break;
      posts.push(...result.posts);
      if (!result.hasMore) break;
    }
  }
  return posts;
}

async function localCatalog(root) {
  const { loadCatalogRuntime } = await import("./catalog-db-utils.mjs");
  const snapshot = loadCatalogRuntime(root).sofievkaCatalogSnapshot;
  const published = snapshot.products.filter(product => product.publicationStatus === "published");
  const categoryCounts = {};
  const categoriesById = new Map(snapshot.categories.map(category => [category.id, category]));
  for (const product of published) {
    const seen = new Set();
    for (let id = product.primaryCategoryId; id && !seen.has(id); id = categoriesById.get(id)?.parentId) {
      seen.add(id);
      categoryCounts[id] = (categoryCounts[id] || 0) + 1;
    }
  }
  const brandCounts = {};
  for (const product of published) brandCounts[product.brandId] = (brandCounts[product.brandId] || 0) + 1;
  return { categories: snapshot.categories, brands: snapshot.brands, categoryCounts, brandCounts, products: published.map(product => ({ id: product.id, slug: product.slug })) };
}

export async function writeSeoFiles({ root, outputDirectory, config, env = process.env, log = console.warn, fetchImpl = globalThis.fetch, waitImpl = wait }) {
  const siteUrl = resolveSiteUrl(env);
  const indexable = config.environment !== "preview";
  const requireComplete = config.environment === "production" && config.source === "supabase";
  const rpcOptions = { fetchImpl, waitImpl };
  let catalog = null;
  let catalogSource = "local";
  let settings = null;
  let posts = [];
  if (requireComplete && !config.supabase) throw new Error("Production Supabase sitemap requires Supabase configuration");
  if (config.supabase) {
    try {
      catalog = await supabaseCatalog(config.supabase, rpcOptions, { requireComplete });
      catalogSource = "supabase";
    } catch (error) {
      if (requireComplete) throw new Error(`[sitemap] Production Supabase catalogue incomplete; refusing bundled fallback: ${error.message}`, { cause: error });
      log(`[sitemap] Supabase catalogue unavailable (${error.message}); using the bundled feeds.`);
    }
    try { settings = await rpc(config.supabase, "get_site_settings", {}, rpcOptions); } catch (error) { log(`[sitemap] get_site_settings: ${error.message}`); }
    try { posts = await supabasePosts(config.supabase, rpcOptions); } catch (error) { log(`[sitemap] get_site_posts: ${error.message}`); }
  }
  if (!catalog) {
    try { catalog = await localCatalog(root); } catch (error) {
      log(`[sitemap] bundled catalogue unavailable (${error.message}); sitemap lists static pages only.`);
      catalog = {};
      catalogSource = "none";
    }
  }
  const blogPaths = postPaths(posts);
  const paths = [...await staticPagePaths(root), ...blogPaths, ...catalogPaths(catalog)];
  await fs.writeFile(path.join(outputDirectory, "sitemap.xml"), renderSitemap(siteUrl, paths), "utf8");
  await fs.writeFile(path.join(outputDirectory, "robots.txt"), renderRobots(siteUrl, { indexable }), "utf8");

  // Google verifies the HTML-tag method without running scripts, so the token must be in the served HTML.
  const token = String(settings?.integrations?.searchConsoleToken || "");
  let verification = false;
  if (/^[A-Za-z0-9_-]{10,100}$/.test(token)) {
    const indexFile = path.join(outputDirectory, "index.html");
    const html = await fs.readFile(indexFile, "utf8");
    if (!/google-site-verification/i.test(html)) {
      await fs.writeFile(indexFile, html.replace(/<head>/i, `<head><meta name="google-site-verification" content="${token}">`), "utf8");
      verification = true;
    }
  }
  return { siteUrl, urls: new Set(paths).size, catalogSource, products: catalog.products?.length || 0, posts: blogPaths.length, indexable, verification };
}
