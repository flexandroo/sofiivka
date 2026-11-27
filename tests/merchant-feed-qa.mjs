import assert from "node:assert/strict";
import merchantFeed, { merchantItems, merchantXml } from "../api/merchant-feed.mjs";
import { readPublicCatalog } from "../lib/catalog-seo-source.mjs";

const origin = "https://shop.example.test";
const config = { url: "https://catalog.example.test", publishableKey: "sb_publishable_test" };
const categories = [
  { id: "engineering", name: "Опалення & вода", status: "active" },
  { id: "valves", parentId: "engineering", name: "Клапани", status: "active" },
  { id: "future", name: "Прихована категорія", status: "draft" }
];
const product = {
  id: "article-123", slug: "valve-123", title: "Клапан <b>моделі A&B</b>", primaryCategoryId: "valves", brand: "Brand",
  publicationStatus: "published", images: ["/assets/valve.webp"],
  inventory: { status: "in_stock" }, pricing: { amount: 120.75, oldAmount: 140, priceStatus: "known", currency: "UAH", unit: "m" }
};
const excluded = [
  { inventory: { status: "unknown" } },
  { inventory: { status: "preorder" } },
  { pricing: { priceStatus: "on_request" } },
  { images: ["/assets/placeholder.png"] },
  { pricing: { ...product.pricing, currency: "EUR" } },
  { publicationStatus: "draft" },
  { primaryCategoryId: "future" },
  { slug: "" },
  { id: "x".repeat(51) }
];
const offers = [product, ...excluded.map((values, index) => ({ ...product, id: `excluded-${index}`, slug: `excluded-${index}`, ...values }))];
const items = merchantItems({ products: offers, categories }, origin);
assert.equal(items.length, 1);
assert.equal(items[0].id, product.id, "Merchant ID uses the same product identity as ecommerce events");
assert.equal(items[0].link, `${origin}/product/valve-123`);
assert.equal(items[0].price, "140.00 UAH");
assert.equal(items[0].sale_price, "120.75 UAH");
assert.equal(items[0].unit_pricing_measure, "1 m");
assert.equal(items[0].availability, "in_stock");
const xml = merchantXml(items, origin).join("");
assert.match(xml, /<g:title>Клапан моделі A&amp;B<\/g:title>/);
assert.match(xml, /<g:product_type>Опалення &amp; вода &gt; Клапани<\/g:product_type>/);
assert.doesNotMatch(xml, /<g:(?:gtin|mpn)>/);

// Large paginated feeds remain ordered and reject a release change in mid-read.
const fixture = Array.from({ length: 300 }, (_, index) => ({ ...product, id: `test-${index}`, slug: `test-${index}` }));
let active = 0;
let peak = 0;
let revision = "release-a";
const fetchCatalog = async (url, options) => {
  if (url.endsWith("/get_catalog_bootstrap")) return Response.json({ version: "release-a", totalProducts: fixture.length, categories });
  const { page_number: page, page_size: pageSize } = JSON.parse(options.body);
  active += 1;
  peak = Math.max(active, peak);
  await new Promise(resolve => setImmediate(resolve));
  active -= 1;
  return Response.json({
    version: revision, page, pageSize, total: fixture.length, hasMore: page * pageSize < fixture.length,
    products: fixture.slice((page - 1) * pageSize, page * pageSize)
  });
};
const catalog = await readPublicCatalog(config, { fetchImpl: fetchCatalog, requireComplete: true, concurrency: 2 });
assert.equal(peak, 2);
assert.deepEqual(catalog.products.map(item => item.id), fixture.map(item => item.id));
revision = "release-b";
await assert.rejects(readPublicCatalog(config, { fetchImpl: fetchCatalog, requireComplete: true, concurrency: 2 }), /Catalogue changed/);

// Verify the same HTTP handler used on Vercel, using explicit public catalogue fixtures.
const env = { SOFIEVKA_SITE_URL: origin, SUPABASE_URL: config.url, SUPABASE_PUBLISHABLE_KEY: config.publishableKey };
const requests = [];
const fetchFeed = async (url, options) => {
  requests.push(url);
  if (url.endsWith("/get_catalog_bootstrap")) return Response.json({ version: "release-a", totalProducts: offers.length, categories });
  const { page_number: page, page_size: pageSize } = JSON.parse(options.body);
  return Response.json({ version: "release-a", total: offers.length, products: offers, page, pageSize, hasMore: false });
};
async function request(method, headers = {}) {
  const body = [];
  const response = { headers: new Headers(), statusCode: 0, setHeader(name, value) { this.headers.set(name, value); }, write(value) { body.push(value); }, end(value) { if (value) body.push(value); } };
  await merchantFeed({ method, headers }, response, { env, fetchImpl: fetchFeed });
  return { status: response.statusCode, headers: response.headers, body: body.join("") };
}
let response = await request("GET");
assert.equal(response.status, 200);
assert.equal(response.headers.get("x-robots-tag"), "noindex");
assert.match(response.headers.get("content-type"), /^application\/xml/);
assert.equal(response.body, xml);
const etag = response.headers.get("etag");
assert.ok(etag);
response = await request("HEAD");
assert.equal(response.status, 200);
assert.equal(response.body, "");
assert.equal(response.headers.get("etag"), etag);
response = await request("GET", { "if-none-match": etag });
assert.equal(response.status, 304);
response = await request("POST");
assert.equal(response.status, 405);
assert.equal(requests.length, 2, "warm requests reuse the validated catalogue");

console.log(JSON.stringify({ status: "ok", suite: "merchant-feed-qa" }));
