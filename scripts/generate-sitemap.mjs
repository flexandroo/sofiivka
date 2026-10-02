// Build-time sitemap.xml + robots.txt (+ the Search Console verification meta on the homepage).
// The project has no serverless functions, so the sitemap is generated when Vercel builds the site:
// from the public catalogue RPCs when the build reads Supabase, otherwise (or if Supabase is not
// reachable) from the bundled catalogue feeds. Products published after a deploy appear in the
// sitemap on the next deploy.
import fs from "node:fs/promises";
import path from "node:path";

// Pages that must stay out of search: private, per-visitor or result pages and page templates.
export const SITEMAP_EXCLUDED_PAGES = Object.freeze(new Set([
  "404", "account", "cart", "checkout", "compare", "favorites", "search",
  "brand", "product", // templates: their real URLs come from the catalogue
  "catalog", "index", "heating", "water-supply", "plumbing", "climate" // listed under their canonical URLs
]));
export const ROBOTS_DISALLOW = Object.freeze(["/admin", "/cart", "/checkout", "/account", "/search", "/compare", "/favorites"]);
const PAGE_SIZE = 96;
const MAX_PRODUCT_PAGES = 400;

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

// Category, brand and product URLs from a catalogue bootstrap (categories, brands, counts) + product ids.
export function catalogPaths({ categories = [], brands = [], categoryCounts = null, brandCounts = null, productIds = [] }) {
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

async function rpc(supabase, name, body) {
  const response = await fetch(`${supabase.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: supabase.publishableKey, Authorization: `Bearer ${supabase.publishableKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

async function supabaseCatalog(supabase) {
  const bootstrap = await rpc(supabase, "get_catalog_bootstrap", {});
  if (!bootstrap?.categories) throw new Error("get_catalog_bootstrap returned no release");
  const productIds = [];
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page += 1) {
    const result = await rpc(supabase, "get_catalog_products", { page_number: page, page_size: PAGE_SIZE });
    productIds.push(...(result?.products || []).map(product => product.id));
    if (!result?.hasMore) break;
  }
  return { ...bootstrap, productIds };
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
  return { categories: snapshot.categories, brands: snapshot.brands, categoryCounts, brandCounts, productIds: published.map(product => product.id) };
}

export async function writeSeoFiles({ root, outputDirectory, config, env = process.env, log = console.warn }) {
  const siteUrl = resolveSiteUrl(env);
  const indexable = config.environment !== "preview";
  let catalog = null;
  let catalogSource = "local";
  let settings = null;
  if (config.supabase) {
    try {
      catalog = await supabaseCatalog(config.supabase);
      catalogSource = "supabase";
    } catch (error) {
      log(`[sitemap] Supabase catalogue unavailable (${error.message}); using the bundled feeds.`);
    }
    try { settings = await rpc(config.supabase, "get_site_settings", {}); } catch (error) { log(`[sitemap] get_site_settings: ${error.message}`); }
  }
  if (!catalog) {
    try { catalog = await localCatalog(root); } catch (error) {
      log(`[sitemap] bundled catalogue unavailable (${error.message}); sitemap lists static pages only.`);
      catalog = {};
      catalogSource = "none";
    }
  }
  const paths = [...await staticPagePaths(root), ...catalogPaths(catalog)];
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
  return { siteUrl, urls: new Set(paths).size, catalogSource, indexable, verification };
}
