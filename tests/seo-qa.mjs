// SEO and integrations: migration contract, admin wiring, storefront tags, sitemap/robots generator.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogPaths, renderRobots, renderSitemap, resolveSiteUrl, writeSeoFiles } from "../scripts/generate-sitemap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

// Migration: new keys allowed and public, validator redefined in full, no connector-unsafe statements.
const migration = read("supabase/migrations/20261002001300_seo_integrations_v1.sql");
assert.match(migration, /check \(key in \('stores', 'checkout', 'social', 'company', 'notifications', 'integrations', 'seo'\)\)/);
assert.match(migration, /setting\.key in \('stores', 'checkout', 'social', 'company', 'integrations', 'seo'\)/, "notifications stay private");
for (const key of ["company", "stores", "checkout", "social", "notifications", "integrations", "seo"]) {
  assert.match(migration, new RegExp(`target_key = '${key}'`), `_settings_clean keeps the ${key} branch`);
}
assert.match(migration, /\^G-\[A-Z0-9\]\{4,16\}\$/);
assert.match(migration, /\^GTM-\[A-Z0-9\]\{4,12\}\$/);
assert.match(migration, /on conflict \(key\) do nothing/);
assert.doesNotMatch(migration, /drop trigger|delete from|^begin;|^commit;/im);

// Admin: both sections render through escaped templates and have readers.
const view = read("admin/admin-settings.mjs");
assert.match(view, /data-settings-form="integrations"/);
assert.match(view, /data-settings-form="seo"/);
assert.match(view, /integrations: form =>/);
assert.match(view, /seo: form =>/);
assert.doesNotMatch(view, /innerHTML\s*=/);

// Storefront: tags only for valid ids, created as elements, once; SEO applied after the head is parsed.
const runtime = read("site-settings.js");
assert.doesNotMatch(runtime, /innerHTML|document\.write|insertAdjacentHTML/);
assert.match(runtime, /googletagmanager\.com\/gtag\/js\?id=/);
assert.match(runtime, /googletagmanager\.com\/gtm\.js\?id=/);
assert.match(runtime, /connect\.facebook\.net\/en_US\/fbevents\.js/);
assert.match(runtime, /google-site-verification/);
assert.match(runtime, /loadedTags/);
assert.match(read("scripts/build-static-site.mjs"), /writeSeoFiles\(/);

// Generator units.
assert.equal(resolveSiteUrl({}), "https://sofievka.vercel.app");
assert.equal(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "sofievka.com.ua" }), "https://sofievka.com.ua");
assert.throws(() => resolveSiteUrl({ SOFIEVKA_SITE_URL: "http://insecure.example" }));
const categories = [
  { id: "heating", slug: "heating", parentId: null, status: "active", visibility: "catalog" },
  { id: "boilers", slug: "boilers", parentId: "heating", status: "active", visibility: "catalog" },
  { id: "empty", slug: "empty", parentId: "heating", status: "active", visibility: "catalog" },
  { id: "svc", slug: "svc", parentId: null, status: "internal", visibility: "service" },
  { id: "under-svc", slug: "under", parentId: "svc", status: "active", visibility: "catalog" }
];
const paths = catalogPaths({
  categories,
  brands: [{ id: "wilo", visibility: "catalog" }, { id: "service", type: "service" }, { id: "off", status: "inactive" }, { id: "nobody", visibility: "catalog" }],
  categoryCounts: { heating: 2, boilers: 2, empty: 0, svc: 1, "under-svc": 1 },
  brandCounts: { wilo: 2, service: 1, off: 1 },
  productIds: ["a&b", "p-2"]
});
assert.deepEqual(paths, ["/catalog", "/catalog/heating", "/catalog/heating/boilers", "/brands/wilo", "/product?id=a%26b", "/product?id=p-2"]);
const xml = renderSitemap("https://x.test", ["/", "/", "/product?id=1&x=2"], new Map([
  ["/", "2026-02-30"], ["/product?id=1&x=2", "2026-11-27T11:11:00Z"]
]));
assert.equal((xml.match(/<url>/g) || []).length, 2);
assert.match(xml, /<loc>https:\/\/x\.test\/product\?id=1&amp;x=2<\/loc>/);
assert.match(xml, /<loc>https:\/\/x\.test\/product\?id=1&amp;x=2<\/loc><lastmod>2026-11-27<\/lastmod>/);
assert.equal((xml.match(/<lastmod>/g) || []).length, 1, "invalid dates do not turn into a sitemap modification date");
const robots = renderRobots("https://x.test");
assert.match(robots, /^Disallow: \/api\/$/m);
for (const route of ["/admin", "/cart", "/checkout", "/account", "/search", "/compare", "/favorites"]) assert.ok(!robots.includes(`Disallow: ${route}`), `${route} is crawlable so bots can read noindex`);
assert.match(robots, /^Sitemap: https:\/\/x\.test\/sitemap\.xml$/m);
assert.match(renderRobots("https://x.test", { indexable: false }), /^Disallow: \/$/m);

// Generator end to end against a stubbed Supabase (paging, verification meta, page exclusions).
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "seo-qa-"));
const site = path.join(temp, "site");
const out = path.join(temp, "out");
fs.mkdirSync(site);
fs.mkdirSync(out);
fs.writeFileSync(path.join(site, "about.html"), "<!doctype html><html><head><title>Про нас</title></head></html>");
fs.writeFileSync(path.join(site, "cart.html"), "<!doctype html><html><head></head></html>");
fs.writeFileSync(path.join(site, "hidden.html"), `<!doctype html><html><head><!-- ${"x".repeat(4100)} --><meta content="noindex,nofollow" name="robots"></head></html>`);
fs.writeFileSync(path.join(out, "index.html"), "<!doctype html><html><head><title>Головна</title></head></html>");
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const name = String(url).split("/rpc/")[1];
  const body = JSON.parse(options.body);
  calls.push(name);
  const json = name === "get_catalog_bootstrap" ? { categories, brands: [{ id: "wilo", visibility: "catalog" }], categoryCounts: { heating: 1, boilers: 1 }, brandCounts: { wilo: 1 } }
    : name === "get_catalog_products" ? { products: [{ id: `p-${body.page_number}` }], hasMore: body.page_number < 3 }
    : { integrations: { searchConsoleToken: "Token_123-abcdef" } };
  return { ok: true, status: 200, json: async () => json };
};
try {
  const result = await writeSeoFiles({
    root: site, outputDirectory: out, env: { SOFIEVKA_SITE_URL: "https://shop.test" }, log: () => {},
    config: { environment: "production", supabase: { url: "https://stub.supabase.co", publishableKey: "sb_publishable_x" } }
  });
  assert.equal(result.catalogSource, "supabase");
  assert.equal(result.verification, true);
  assert.equal(calls.filter(name => name === "get_catalog_products").length, 3, "pages until hasMore is false");
  const sitemap = fs.readFileSync(path.join(out, "sitemap.xml"), "utf8");
  for (const loc of ["/", "/about", "/catalog/heating/boilers", "/brands/wilo", "/product?id=p-1", "/product?id=p-3"]) {
    assert.ok(sitemap.includes(`<loc>https://shop.test${loc}</loc>`), `sitemap lists ${loc}`);
  }
  assert.doesNotMatch(sitemap, /cart|hidden|admin|checkout/);
  assert.match(fs.readFileSync(path.join(out, "robots.txt"), "utf8"), /Sitemap: https:\/\/shop\.test\/sitemap\.xml/);
  assert.match(fs.readFileSync(path.join(out, "index.html"), "utf8"), /<head><meta name="google-site-verification" content="Token_123-abcdef">/);
  const preview = await writeSeoFiles({ root: site, outputDirectory: out, env: {}, log: () => {}, config: { environment: "preview", supabase: { url: "https://stub.supabase.co", publishableKey: "x" } } });
  assert.equal(preview.indexable, false);
  assert.equal(preview.verification, false, "verification meta is added once");
} finally {
  globalThis.fetch = realFetch;
  fs.rmSync(temp, { recursive: true, force: true });
}

// Production must not turn an interrupted/partial hosted catalogue into a successful
// (but stale) bundled-feed sitemap. The fixtures exercise real paging at 96 rows.
const strictConfig = { source: "supabase", environment: "production", supabase: { url: "https://stub.supabase.co", publishableKey: "public-test-key" } };
const ok = value => ({ ok: true, status: 200, json: async () => value });
const failed = status => ({ ok: false, status, json: async () => ({}) });
const productPage = (page, total = 200) => ({
  total, page, pageSize: 96, hasMore: page * 96 < total,
  products: Array.from({ length: Math.min(96, Math.max(0, total - (page - 1) * 96)) }, (_, index) => ({ id: `p-${(page - 1) * 96 + index + 1}`, slug: `product-${(page - 1) * 96 + index + 1}` }))
});
async function productionFixture({ intercept = () => null, expectedError = null, total = 200, config = strictConfig } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-completeness-"));
  const site = path.join(directory, "site");
  const out = path.join(directory, "out");
  fs.mkdirSync(site);
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(site, "about.html"), "<html><head></head></html>");
  fs.writeFileSync(path.join(out, "index.html"), "<html><head></head></html>");
  const calls = [];
  const waits = [];
  const fetchImpl = async (url, options) => {
    const name = String(url).split("/rpc/")[1];
    const body = JSON.parse(options.body);
    const call = { name, page: body.page_number || null };
    calls.push(call);
    const attempt = calls.filter(item => item.name === name && item.page === call.page).length;
    const intercepted = await intercept(name, body, attempt);
    if (intercepted) return intercepted;
    if (name === "get_catalog_bootstrap") return ok({ categories: [], brands: [], totalProducts: total });
    if (name === "get_catalog_products") return ok(productPage(body.page_number, total));
    if (name === "get_site_posts") return ok({ posts: [], hasMore: false, total: 0 });
    return ok({});
  };
  const run = () => writeSeoFiles({ root: site, outputDirectory: out, config, env: {}, log: () => {}, fetchImpl, waitImpl: async delay => { waits.push(delay); } });
  try {
    if (expectedError) {
      await assert.rejects(run, expectedError);
      assert.ok(!fs.existsSync(path.join(out, "sitemap.xml")), "a failed production catalogue must not write a sitemap");
      assert.ok(!fs.existsSync(path.join(out, "robots.txt")), "a failed production catalogue must not report a successful SEO build");
      return { calls, waits };
    }
    const result = await run();
    const xml = fs.readFileSync(path.join(out, "sitemap.xml"), "utf8");
    return { result, xml, calls, waits };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const recovered = await productionFixture({ intercept: (name, body, attempt) => {
  if (name === "get_catalog_bootstrap" && attempt === 1) return failed(503);
  if (name === "get_catalog_products" && body.page_number === 2 && attempt < 3) throw new TypeError("fetch failed");
} });
assert.equal(recovered.result.catalogSource, "supabase");
assert.equal(recovered.result.products, 200);
assert.equal((recovered.xml.match(/<loc>[^<]+\/product\//g) || []).length, 200, "every unique hosted product is in the sitemap after recovery");
assert.deepEqual(recovered.waits, [250, 250, 500], "transient retries use bounded backoff");
assert.equal(recovered.calls.filter(call => call.name === "get_catalog_products" && call.page === 2).length, 3);

const denied = await productionFixture({ intercept: name => name === "get_catalog_bootstrap" ? failed(401) : null, expectedError: /refusing bundled fallback.*HTTP 401/ });
assert.equal(denied.calls.length, 1, "permanent authentication errors are not retried");
assert.equal(denied.waits.length, 0);
const unavailable = await productionFixture({ intercept: name => name === "get_catalog_products" ? failed(503) : null, expectedError: /refusing bundled fallback.*HTTP 503 after 3 attempts/ });
assert.equal(unavailable.calls.filter(call => call.name === "get_catalog_products").length, 3, "transient retries eventually fail closed");

await productionFixture({ expectedError: /hasMore disagrees/, intercept: (name, body) => name === "get_catalog_products" ? ok({ ...productPage(body.page_number), hasMore: false }) : null });
await productionFixture({ expectedError: /truncated page/, intercept: (name, body) => name === "get_catalog_products" ? ok({ ...productPage(body.page_number), products: productPage(body.page_number).products.slice(1) }) : null });
await productionFixture({ expectedError: /duplicate product id/, intercept: (name, body) => {
  if (name !== "get_catalog_products" || body.page_number !== 2) return null;
  const page = productPage(2);
  page.products[0].id = "p-1";
  return ok(page);
} });
await productionFixture({ expectedError: /total changed/, intercept: (name, body) => name === "get_catalog_products" && body.page_number === 2 ? ok(productPage(2, 199)) : null });
await productionFixture({ expectedError: /duplicate product URL/, intercept: (name, body) => {
  if (name !== "get_catalog_products" || body.page_number !== 2) return null;
  const page = productPage(2);
  page.products[0].slug = "product-1";
  return ok(page);
} });
await productionFixture({ expectedError: /Catalogue totals differ/, intercept: name => name === "get_catalog_bootstrap" ? ok({ categories: [], totalProducts: 201 }) : null });
await productionFixture({ expectedError: /Production Supabase posts incomplete.*truncated posts/, intercept: name => name === "get_site_posts" ? ok({ posts: [], hasMore: false, total: 1 }) : null });
const publishedArticle = await productionFixture({ intercept: (name, body) => name === "get_site_posts" && body.post_kind === "article"
  ? ok({ posts: [{ kind: "article", slug: "heat-pumps", publishedAt: "2026-11-25T10:30:00Z" }], hasMore: false, total: 1 }) : null });
assert.match(publishedArticle.xml, /\/blog\/heat-pumps<\/loc><lastmod>2026-11-25<\/lastmod>/);
await productionFixture({ expectedError: /exceeds sitemap page cap/, total: 96 * 400 + 1 });
await productionFixture({ expectedError: /missing valid total/, intercept: (name, body) => {
  if (name !== "get_catalog_products") return null;
  const page = productPage(body.page_number);
  delete page.total;
  return ok(page);
} });
await productionFixture({ expectedError: /product has no id/, intercept: (name, body) => {
  if (name !== "get_catalog_products") return null;
  const page = productPage(body.page_number);
  delete page.products[0].id;
  return ok(page);
} });
const empty = await productionFixture({ total: 0 });
assert.equal(empty.result.products, 0, "a proven empty catalogue is distinct from a failed/truncated one");

const fallbackPreview = await productionFixture({ config: { ...strictConfig, environment: "preview" }, intercept: () => failed(503) });
assert.equal(fallbackPreview.result.indexable, false);
assert.equal(fallbackPreview.result.catalogSource, "none", "preview may still fall back when this minimal fixture has no bundled catalogue");
assert.match(fallbackPreview.xml, /\/about/);

console.log(JSON.stringify({ status: "ok", suite: "seo-qa", productionSitemapCompleteness: "verified" }));
