import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSeoFiles } from "./generate-sitemap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputArgument = process.argv.find(argument => argument.startsWith("--output-dir="))?.split("=").slice(1).join("=") || "dist";
const skipAssets = process.argv.includes("--skip-assets");
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
const allowedRootExtensions = new Set([".css", ".html", ".ico", ".js", ".json", ".mjs", ".svg", ".txt", ".webmanifest", ".xml"]);
const rootEntries = await fs.readdir(root, { withFileTypes: true });
for (const entry of rootEntries) {
  const sourcePath = path.join(root, entry.name);
  const destinationPath = path.join(outputDirectory, entry.name);
  if (entry.isDirectory()) {
    if (allowedDirectories.has(entry.name) && !(skipAssets && entry.name === "assets")) await fs.cp(sourcePath, destinationPath, { recursive: true });
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
for (const entry of await fs.readdir(outputDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".html") continue;
  const filePath = path.join(outputDirectory, entry.name);
  let html = await fs.readFile(filePath, "utf8");
  if (!/catalog-runtime-config\.js/i.test(html)) html = html.replace(/<head>/i, '<head><script src="/catalog-runtime-config.js"></script>');
  // Shop settings render synchronously (defaults + cached copy) before the deferred page scripts.
  if (!/site-settings\.js/i.test(html)) html = html.replace(/<script src="\/catalog-runtime-config\.js"><\/script>/i, match => `${match}<script src="/site-settings.js?v=20261002-seo-1"></script>`);
  if (!/crm-client\.js/i.test(html)) html = html.replace(/<\/head>/i, '<script src="/crm-client.js?v=20261001-crm-1" defer></script></head>');
  // Customer accounts: header sign-in state on every page, signed-in checkout, /account.
  if (!/customer-account\.js/i.test(html)) html = html.replace(/<\/head>/i, '<script src="/customer-account.js?v=20261002-account-1" defer></script></head>');
  if (source === "supabase") {
    html = html.replace(supplierFeedPattern, match => {
      removedFeedTags += 1;
      return "";
    });
  }
  await fs.writeFile(filePath, html, "utf8");
  htmlFiles += 1;
}

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
