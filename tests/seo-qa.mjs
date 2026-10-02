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
  brands: [{ id: "wilo", visibility: "catalog" }, { id: "service", visibility: "service" }, { id: "nobody", visibility: "catalog" }],
  categoryCounts: { heating: 2, boilers: 2, empty: 0, svc: 1, "under-svc": 1 },
  brandCounts: { wilo: 2, service: 1 },
  productIds: ["a&b", "p-2"]
});
assert.deepEqual(paths, ["/catalog", "/catalog/heating", "/catalog/heating/boilers", "/brands/wilo", "/product?id=a%26b", "/product?id=p-2"]);
const xml = renderSitemap("https://x.test", ["/", "/", "/product?id=1&x=2"]);
assert.equal((xml.match(/<url>/g) || []).length, 2);
assert.match(xml, /<loc>https:\/\/x\.test\/product\?id=1&amp;x=2<\/loc>/);
const robots = renderRobots("https://x.test");
for (const blocked of ["/admin", "/cart", "/checkout", "/account", "/search", "/compare", "/favorites"]) assert.match(robots, new RegExp(`^Disallow: ${blocked}$`, "m"));
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
fs.writeFileSync(path.join(site, "hidden.html"), '<!doctype html><html><head><meta name="robots" content="noindex,nofollow"></head></html>');
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

console.log(JSON.stringify({ status: "ok", suite: "seo-qa" }));
