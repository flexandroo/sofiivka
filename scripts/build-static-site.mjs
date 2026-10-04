import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { resolveSiteUrl, writeSeoFiles } from "./generate-sitemap.mjs";
import { prerenderCompanyPages } from "./prerender-company-pages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputArgument = process.argv.find(argument => argument.startsWith("--output-dir="))?.split("=").slice(1).join("=") || "dist";
const skipAssets = process.argv.includes("--skip-assets");
const skipMinify = process.argv.includes("--no-minify");
const skipPrerender = process.argv.includes("--no-prerender");
const outputDirectory = path.resolve(root, outputArgument);
const source = String(process.env.SOFIEVKA_CATALOG_SOURCE || "local").trim().toLowerCase();
const deploymentEnvironment = String(process.env.VERCEL_ENV || "local").trim().toLowerCase();
const devProjectRef = "wfxcklglujgramasdzyr";
const supplierFeedNames = new Set([
  "products-data.js",
  "water-catalog-data.js",
  "termojet-products-data.js",
  "wilo-products-data.js",
  "grundfos-products-data.js",
  "tekkhaus-products-data.js",
  "tech-products-data.js",
  "heating-brands-products-data.js",
  "baxi-buderus-products-data.js"
]);
const supplierFeedPattern = /<script\b(?=[^>]*\bsrc=["'](?:[^"']*\/)?(?:products-data|water-catalog-data|termojet-products-data|wilo-products-data|grundfos-products-data|tekkhaus-products-data|tech-products-data|heating-brands-products-data|baxi-buderus-products-data)\.js[^"']*["'])[^>]*>\s*<\/script>\s*/gim;

if (!["local", "supabase"].includes(source)) throw new Error(`SOFIEVKA_CATALOG_SOURCE must be local or supabase, received: ${source}`);
if (outputDirectory === root || !outputDirectory.startsWith(`${root}${path.sep}`)) throw new Error("Build output must be a dedicated directory inside the project root.");

const config = {
  source,
  environment: deploymentEnvironment,
  supabase: null
};

if (source === "supabase") {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const expectedProjectRef = String(process.env.SOFIEVKA_SUPABASE_PROJECT_REF || "").trim();
  if (!url) throw new Error("SUPABASE_URL is required when SOFIEVKA_CATALOG_SOURCE=supabase.");
  if (!publishableKey) throw new Error("SUPABASE_PUBLISHABLE_KEY is required when SOFIEVKA_CATALOG_SOURCE=supabase.");
  if (!expectedProjectRef) throw new Error("SOFIEVKA_SUPABASE_PROJECT_REF is required when SOFIEVKA_CATALOG_SOURCE=supabase.");
  if (isPrivilegedKey(publishableKey)) throw new Error("A secret/service-role key must never be embedded in the storefront build.");
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) throw new Error("SUPABASE_URL must be an HTTPS Supabase project URL.");
  const actualProjectRef = parsedUrl.hostname.slice(0, -".supabase.co".length);
  if (!actualProjectRef || actualProjectRef !== expectedProjectRef) throw new Error("SUPABASE_URL and SOFIEVKA_SUPABASE_PROJECT_REF do not match.");
  if (deploymentEnvironment === "preview" && actualProjectRef !== devProjectRef) throw new Error("Vercel Preview must use the confirmed Sofievka DEV project.");
  if (deploymentEnvironment === "production") {
    if (actualProjectRef === devProjectRef) throw new Error("The Sofievka DEV Supabase project is forbidden in production builds.");
    if (process.env.SOFIEVKA_ALLOW_PRODUCTION_SUPABASE !== "true") throw new Error("Production Supabase cutover requires SOFIEVKA_ALLOW_PRODUCTION_SUPABASE=true.");
  }
  config.supabase = { url, publishableKey, projectRef: actualProjectRef };
}

await fs.rm(outputDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
await fs.mkdir(outputDirectory, { recursive: true });

const allowedDirectories = new Set(["admin", "assets", "catalog", "lib"]);
// No .json at the root: package.json, package-lock.json and vercel.json are repository files, not site files.
const allowedRootExtensions = new Set([".css", ".html", ".ico", ".js", ".mjs", ".svg", ".txt", ".webmanifest", ".xml"]);
// Inside the copied directories, data/notes files (catalog/*.json review baselines, assets/**/SOURCES.md) stay
// out of the site; nothing on the site fetches them.
const internalFilePattern = /\.(?:json|md|markdown|ps1|sh|sql|csv|tsv|log|map)$/i;
const rootEntries = await fs.readdir(root, { withFileTypes: true });
for (const entry of rootEntries) {
  const sourcePath = path.join(root, entry.name);
  const destinationPath = path.join(outputDirectory, entry.name);
  if (entry.isDirectory()) {
    if (allowedDirectories.has(entry.name) && !(skipAssets && entry.name === "assets")) {
      await fs.cp(sourcePath, destinationPath, { recursive: true, filter: file => !internalFilePattern.test(file) && !path.basename(file).startsWith(".") });
    }
    continue;
  }
  if (!allowedRootExtensions.has(path.extname(entry.name).toLowerCase())) continue;
  if (source === "supabase" && supplierFeedNames.has(entry.name)) continue;
  await fs.copyFile(sourcePath, destinationPath);
}

const runtimeConfigFile = path.join(outputDirectory, "catalog-runtime-config.js");
await fs.writeFile(runtimeConfigFile, `window.SOFIEVKA_CATALOG_CONFIG=Object.freeze(${JSON.stringify(config)});\n`, "utf8");

let htmlFiles = 0;
let removedFeedTags = 0;
const siteUrl = resolveSiteUrl();
// Pages whose content depends on the address (one template for many products, brands, posts, catalogue
// sections) or that are private get the site-wide preview; the rest get their own title, description and URL.
const templatePages = new Set(["404", "account", "brand", "cart", "catalog", "checkout", "compare", "favorites", "post", "product", "search"]);
const siteTitle = "ТД «Софіївка» — опалення, водопостачання, водопідготовка";
const attribute = value => String(value).replace(/&(?!#?\w+;)/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
for (const entry of await fs.readdir(outputDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".html") continue;
  const filePath = path.join(outputDirectory, entry.name);
  let html = await fs.readFile(filePath, "utf8");
  if (!/catalog-runtime-config\.js/i.test(html)) html = html.replace(/<head>/i, '<head><script src="/catalog-runtime-config.js"></script>');
  // Shop settings render synchronously (defaults + cached copy) before the deferred page scripts.
  if (!/site-settings\.js/i.test(html)) html = html.replace(/<script src="\/catalog-runtime-config\.js"><\/script>/i, match => `${match}<script src="/site-settings.js?v=20261002-stage4-1"></script>`);
  if (!/crm-client\.js/i.test(html)) html = html.replace(/<\/head>/i, '<script src="/crm-client.js?v=20261001-crm-1" defer></script></head>');
  // Customer accounts: header sign-in state on every page, signed-in checkout, /account.
  if (!/customer-account\.js/i.test(html)) html = html.replace(/<\/head>/i, '<script src="/customer-account.js?v=20261002-account-1" defer></script></head>');
  // Icons, link previews (Open Graph) and schema.org data for search engines.
  if (!/rel=["']icon["']/i.test(html)) html = html.replace(/<\/head>/i, '<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><meta name="theme-color" content="#202020"></head>');
  if (!/property=["']og:/i.test(html)) {
    const page = entry.name.slice(0, -".html".length);
    const isTemplate = templatePages.has(page);
    const title = isTemplate ? siteTitle : (html.match(/<title>([^<]*)<\/title>/i)?.[1] || siteTitle);
    const description = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] || "";
    const tags = [
      ["og:site_name", "ТД «Софіївка»"], ["og:locale", "uk_UA"], ["og:type", "website"], ["og:title", title],
      ...(description ? [["og:description", description]] : []),
      ...(isTemplate ? [] : [["og:url", `${siteUrl}${page === "index" ? "/" : `/${page}`}`]]),
      ["og:image", `${siteUrl}/assets/og-image.jpg`], ["og:image:width", "1200"], ["og:image:height", "630"]
    ];
    html = html.replace(/<\/head>/i, `${tags.map(([property, content]) => `<meta property="${property}" content="${attribute(content)}">`).join("")}<meta name="twitter:card" content="summary_large_image"></head>`);
  }
  // One canonical per indexable static page (no query string). Template pages (product, category, brand, post …)
  // set theirs at run time from the address; pages that already declare one keep it.
  const pageName = entry.name.slice(0, -".html".length);
  if (!templatePages.has(pageName) && !/<link\b[^>]*\brel=["']canonical["']/i.test(html)) {
    html = html.replace(/<\/head>/i, `<link rel="canonical" href="${attribute(`${siteUrl}${pageName === "index" ? "/" : `/${pageName}`}`)}"></head>`);
  }
  if (!/seo-schema\.js/i.test(html)) html = html.replace(/<\/head>/i, '<script src="/seo-schema.js?v=20261002-stage4-1" defer></script></head>');
  // page-shell.js loads brands-data.js, catalog-data.js and catalog-ui.js one after another before it renders;
  // preloading them (same URLs, stamped below) lets the browser fetch all three in parallel with page-shell.js.
  const hints = [];
  if (/page-shell\.js/i.test(html) && /data-page-root/i.test(html)) {
    for (const script of ["/brands-data.js", "/catalog-data.js", "/catalog-ui.js"]) {
      if (!new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*${script.slice(1).replace(".", "\\.")}`, "i").test(html)) hints.push(`<link rel="preload" as="script" href="${script}?v=1">`);
    }
  }
  // With the Supabase catalogue every storefront page imports these modules and calls the RPCs.
  if (source === "supabase" && /catalog-data\.js|page-shell\.js/i.test(html)) {
    hints.unshift(`<link rel="preconnect" href="${attribute(config.supabase.url)}" crossorigin>`);
    for (const module of ["/lib/supabase-client.mjs", "/catalog/supabase-data-source.mjs", "/catalog/data-source.mjs"]) hints.push(`<link rel="modulepreload" href="${module}?v=1">`);
  }
  if (hints.length) html = html.replace(/<\/head>/i, `${hints.join("")}</head>`);
  if (source === "supabase") {
    html = html.replace(supplierFeedPattern, match => {
      removedFeedTags += 1;
      return "";
    });
  }
  await fs.writeFile(filePath, html, "utf8");
  htmlFiles += 1;
}

// Smaller JS and CSS: whitespace, comments and local names are stripped (top-level names stay, other scripts use them).
// Supplier feeds (local mode only) and vendored libraries are copied as they are.
const minifyDirectories = new Set(["admin", "catalog"]);
const minifySkip = new Set([...supplierFeedNames, "catalog-runtime-config.js"]);
const minified = { files: 0, bytesBefore: 0, bytesAfter: 0 };
if (!skipMinify) {
  for (const filePath of await listFiles(outputDirectory, name => minifyDirectories.has(name))) {
    const extension = path.extname(filePath).toLowerCase();
    if (![".js", ".mjs", ".css"].includes(extension) || minifySkip.has(path.basename(filePath))) continue;
    const code = await fs.readFile(filePath, "utf8");
    const result = await transform(code, { loader: extension === ".css" ? "css" : "js", minify: true, legalComments: "none", charset: "utf8" });
    minified.files += 1;
    minified.bytesBefore += Buffer.byteLength(code);
    minified.bytesAfter += Buffer.byteLength(result.code);
    await fs.writeFile(filePath, result.code, "utf8");
  }
}

// One version per file: every local script and stylesheet a page links gets ?v=<hash of its content>, so a file
// is cached once across pages and a changed file is fetched again without bumping versions by hand.
const fileHashes = new Map();
async function contentHash(relativePath) {
  if (!fileHashes.has(relativePath)) {
    const filePath = path.join(outputDirectory, relativePath);
    if (!filePath.startsWith(`${outputDirectory}${path.sep}`)) return null;
    const content = await fs.readFile(filePath).catch(() => null);
    fileHashes.set(relativePath, content ? crypto.createHash("sha256").update(content).digest("hex").slice(0, 10) : null);
  }
  return fileHashes.get(relativePath);
}
let versionedReferences = 0;
// Scripts that load other scripts at run time ("/catalog-data.js?v=…" in page-shell.js) and ES module imports
// (`from "./data-source.mjs"`, `import("/lib/supabase-client.mjs?v=1")`) get the same treatment, so modules are
// cached as immutable files too instead of being revalidated (304) on every page. A file's hash covers the
// stamped references inside it, so passes repeat until nothing changes: a changed module also changes the URL of
// every module that imports it.
const versionedStringPattern = /(["'`])(\/[^"'`?#\s]+\.(?:js|mjs|css))\?v=[^"'`#\s]*\1/g;
const moduleSpecifierPattern = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])((?:\/|\.\.?\/)[^"'?#\s]+\.m?js)(?:\?v=[^"'#\s]*)?\2/g;
const htmlReferencePattern = /\b(src|href)="((?!https?:|\/\/|data:)[^"?#]+\.(?:js|mjs|css))(?:\?v=[^"#]*)?"/gi;
const resolveReference = (directory, reference) => reference.startsWith("/") ? reference.slice(1) : path.posix.normalize(path.posix.join(directory, reference));
async function stampReferences(filePath, { html = false } = {}) {
  const code = await fs.readFile(filePath, "utf8");
  const directory = path.relative(outputDirectory, path.dirname(filePath)).split(path.sep).join("/") || ".";
  const hashes = new Map();
  const hashFor = async reference => {
    const relativePath = resolveReference(directory, reference);
    if (!hashes.has(relativePath)) hashes.set(relativePath, await contentHash(path.normalize(relativePath)));
    return hashes.get(relativePath);
  };
  const patterns = html ? [htmlReferencePattern, moduleSpecifierPattern] : [versionedStringPattern, moduleSpecifierPattern];
  for (const pattern of patterns) for (const match of code.matchAll(pattern)) await hashFor(match[pattern === moduleSpecifierPattern ? 3 : 2]);
  let count = 0;
  let next = code;
  if (html) {
    next = next.replace(htmlReferencePattern, (match, name, reference) => {
      const hash = hashes.get(resolveReference(directory, reference));
      if (!hash) return match;
      count += 1;
      return `${name}="${reference}?v=${hash}"`;
    });
  } else {
    next = next.replace(versionedStringPattern, (match, quote, reference) => {
      const hash = hashes.get(resolveReference(directory, reference));
      if (!hash) return match;
      count += 1;
      return `${quote}${reference}?v=${hash}${quote}`;
    });
  }
  next = next.replace(moduleSpecifierPattern, (match, lead, quote, reference) => {
    const hash = hashes.get(resolveReference(directory, reference));
    if (!hash) return match;
    if (!match.includes(`?v=${hash}`)) count += 1;
    return `${lead}${quote}${reference}?v=${hash}${quote}`;
  });
  if (next !== code) await fs.writeFile(filePath, next, "utf8");
  return { changed: next !== code, count };
}
const scriptFiles = (await listFiles(outputDirectory, name => minifyDirectories.has(name) || name === "lib")).filter(file => /\.m?js$/i.test(file) && !minifySkip.has(path.basename(file)));
let stampingPasses = 0;
for (let changed = true; changed; stampingPasses += 1) {
  if (stampingPasses >= 12) throw new Error("Script versions did not settle: a cycle of module imports?");
  changed = false;
  fileHashes.clear();
  for (const filePath of scriptFiles) {
    const result = await stampReferences(filePath);
    if (result.changed) changed = true;
  }
}
fileHashes.clear();
for (const filePath of await listFiles(outputDirectory, name => name === "admin")) {
  if (path.extname(filePath).toLowerCase() !== ".html") continue;
  versionedReferences += (await stampReferences(filePath, { html: true })).count;
}
for (const filePath of scriptFiles) {
  const code = await fs.readFile(filePath, "utf8");
  versionedReferences += [...code.matchAll(versionedStringPattern)].length + [...code.matchAll(moduleSpecifierPattern)].filter(match => match[0].includes("?v=")).length;
}

// Company pages get their first paint in the HTML (pure Node, see scripts/prerender-company-pages.mjs).
const prerendered = skipPrerender ? [] : await prerenderCompanyPages({ outputDirectory, siteUrl, log: message => console.warn(message) });

const seo = await writeSeoFiles({ root, outputDirectory, config });

const manifest = {
  version: "sofievka-controlled-cutover-v1",
  source,
  deploymentEnvironment,
  projectRef: config.supabase?.projectRef || null,
  htmlFiles,
  removedFeedTags,
  supplierFeedFilesIncluded: source === "local",
  assetsIncluded: !skipAssets,
  minified,
  versionedReferences,
  stampingPasses,
  prerendered: prerendered.filter(item => item.status === "ok").map(item => item.page),
  prerenderFailures: prerendered.filter(item => item.status !== "ok"),
  sitemap: seo
};
await fs.writeFile(path.join(outputDirectory, "catalog-build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest));

function isPrivilegedKey(key) {
  if (key.startsWith("sb_secret_") || /service[_-]?role/i.test(key)) return true;
  const segments = key.split(".");
  if (segments.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

// Files under the output root: every root file, and everything inside the top-level directories `acceptDirectory` keeps.
async function listFiles(directory, acceptDirectory, depth = 0) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (depth > 0 || acceptDirectory(entry.name)) files.push(...await listFiles(entryPath, acceptDirectory, depth + 1));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}
