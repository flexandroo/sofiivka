// Vercel builds the sitemap from the public catalogue and post RPCs. Local and preview builds can
// use bundled data. A production Supabase build requires complete public listings.
import fs from "node:fs/promises";
import path from "node:path";
import { productPath, publicCatalogRpc, readPublicCatalog } from "../lib/catalog-seo-source.mjs";

// Pages that must stay out of search: private, per-visitor or result pages and page templates.
export const SITEMAP_EXCLUDED_PAGES = Object.freeze(new Set([
  "404", "account", "cart", "checkout", "compare", "favorites", "search",
  "brand", "product", "post", // templates: their real URLs come from the catalogue and the published posts
  "catalog", "index", "heating", "water-supply", "plumbing", "climate" // listed under their canonical URLs
]));
// Service pages must be crawlable for search engines to read their noindex directive.
const ROBOTS_DISALLOW = Object.freeze(["/api/"]);
const POST_PAGE_SIZE = 48;
const MAX_POST_PAGES = 50;
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

function lastModifiedDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "";
  const iso = date.toISOString().slice(0, 10);
  return value.length === 10 && iso !== value ? "" : iso;
}

export function renderSitemap(siteUrl, paths, modified = new Map()) {
  const unique = [...new Set(paths)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique
    .map(item => {
      const date = lastModifiedDate(modified.get(item));
      return `  <url><loc>${xmlEscape(`${siteUrl}${item}`)}</loc>${date ? `<lastmod>${date}</lastmod>` : ""}</url>`;
    }).join("\n")}\n</urlset>\n`;
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
    if (!brand?.id || (brand.status && brand.status !== "active") || (brand.visibility || brand.type || "catalog") !== "catalog") continue;
    if (brandCounts && !(Number(brandCounts[brand.id]) > 0)) continue;
    paths.push(`/brands/${encodeURIComponent(brand.id)}`);
  }
  for (const product of products) {
    const address = productPath(product);
    if (address) paths.push(address);
  }
  for (const id of productIds) if (id) paths.push(productPath({ id }));
  return paths;
}

export async function staticPagePaths(root) {
  const paths = ["/"];
  for (const name of (await fs.readdir(root)).sort()) {
    if (!name.endsWith(".html")) continue;
    const page = name.slice(0, -".html".length);
    if (SITEMAP_EXCLUDED_PAGES.has(page)) continue;
    const html = await fs.readFile(path.join(root, name), "utf8");
    const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] || "";
    if (/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])(?=[^>]*\bcontent\s*=\s*["'][^"']*\bnoindex\b)[^>]*>/i.test(head)) continue;
    paths.push(`/${page}`);
  }
  return paths;
}

function postPath(post) {
  const base = Object.hasOwn(POST_BASES, post?.kind) && POST_BASES[post.kind];
  return base && typeof post.slug === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug) ? `${base}/${post.slug}` : "";
}

export function postPaths(posts) {
  return (Array.isArray(posts) ? posts : []).map(postPath).filter(Boolean);
}

async function supabasePosts(supabase, options, requireComplete) {
  const posts = [];
  for (const kind of Object.keys(POST_BASES)) {
    const addresses = new Set();
    let total = null;
    for (let page = 1; page <= MAX_POST_PAGES; page += 1) {
      const result = await publicCatalogRpc(supabase, "get_site_posts", { post_kind: kind, page_number: page, page_size: POST_PAGE_SIZE }, options);
      if (!Array.isArray(result?.posts) || typeof result.hasMore !== "boolean") throw new Error(`${kind} page ${page}: invalid posts/hasMore`);
      if (requireComplete) {
        const count = result.total;
        if (!Number.isSafeInteger(count) || count < 0 || (total !== null && total !== count)) throw new Error(`${kind} page ${page}: invalid or changed total`);
        if (count > MAX_POST_PAGES * POST_PAGE_SIZE) throw new Error(`${kind}: ${count} posts exceed the sitemap page cap`);
        total = count;
        const remaining = count - (page - 1) * POST_PAGE_SIZE;
        if (result.posts.length !== Math.min(POST_PAGE_SIZE, remaining) || result.hasMore !== (remaining > POST_PAGE_SIZE)) {
          throw new Error(`${kind} page ${page}: truncated posts or inconsistent hasMore`);
        }
        for (const post of result.posts) {
          const address = postPath(post);
          if (post?.kind !== kind || !address || addresses.has(address)) throw new Error(`${kind} page ${page}: invalid or duplicate post URL`);
          addresses.add(address);
        }
      }
      posts.push(...result.posts);
      if (!result.hasMore) break;
      if (page === MAX_POST_PAGES) throw new Error(`${kind}: get_site_posts exceeded the sitemap page cap`);
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
  return { categories: snapshot.categories, brands: snapshot.brands, categoryCounts, brandCounts, products: published };
}

export async function writeSeoFiles({ root, outputDirectory, config, env = process.env, log = console.warn, fetchImpl, waitImpl, onPublicPaths }) {
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
      catalog = await readPublicCatalog(config.supabase, {
        ...rpcOptions, requireComplete,
        mapProduct: ({ id, slug, updatedAt, publishedAt }) => ({ id, slug, updatedAt, publishedAt })
      });
      catalogSource = "supabase";
    } catch (error) {
      if (requireComplete) throw new Error(`[sitemap] Production Supabase catalogue incomplete; refusing bundled fallback: ${error.message}`, { cause: error });
      log(`[sitemap] Supabase catalogue unavailable (${error.message}); using the bundled feeds.`);
    }
    try { settings = await publicCatalogRpc(config.supabase, "get_site_settings", {}, rpcOptions); } catch (error) { log(`[sitemap] get_site_settings: ${error.message}`); }
    try {
      posts = await supabasePosts(config.supabase, rpcOptions, requireComplete);
    } catch (error) {
      if (requireComplete) throw new Error(`[sitemap] Production Supabase posts incomplete: ${error.message}`, { cause: error });
      log(`[sitemap] get_site_posts: ${error.message}`);
    }
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
  const modified = new Map([
    ...(catalog.products || []).map(product => [productPath(product), product.updatedAt || product.publishedAt]),
    ...posts.map(post => [postPath(post), post?.updatedAt || post?.publishedAt])
  ]);
  await onPublicPaths?.({ catalog, posts, settings });
  await fs.writeFile(path.join(outputDirectory, "sitemap.xml"), renderSitemap(siteUrl, paths, modified), "utf8");
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
