// Offline behaviour checks: prove overlap with gates, not fragile elapsed-time assertions.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import handler, { resetMemory, resolvePage } from "../../api/seo-page.mjs";

const bootstrap = { categories: [], brands: [], brandCounts: {}, categoryCounts: {} };
const product = { id: "P-1", slug: "actual-product", title: "Товар", brandId: "brand", primaryCategoryId: "category", pricing: { amount: null, priceStatus: "unknown" }, inventory: { status: "unknown" }, images: [] };
const shell = '<!doctype html><html><head><title>Товар</title></head><body data-page="product"><div data-page-root></div></body></html>';
const env = { SUPABASE_URL: "https://database.test", SUPABASE_PUBLISHABLE_KEY: "public-test-key", SOFIEVKA_SITE_URL: "https://shop.test" };
const tick = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = () => ({ statusCode: 0, headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, end(body) { this.body = body; } });
const request = () => ({ query: { kind: "product", slug: product.slug }, url: `/product/${product.slug}`, headers: { host: "shop.test" } });
let cases = 0;
const unhandled = [];
const onUnhandled = error => unhandled.push(error);
process.on("unhandledRejection", onUnhandled);
const originalError = console.error;
console.error = () => {};
try {
  // All three independent reads start even while every response is blocked.
  resetMemory();
  const gates = { shell: deferred(), product: deferred(), bootstrap: deferred() };
  const calls = [];
  const res = response();
  const pending = handler(request(), res, { env, fetchImpl: address => {
    const key = address.endsWith("/get_catalog_bootstrap") ? "bootstrap" : address.endsWith("/get_catalog_product_by_slug") ? "product" : "shell";
    calls.push(key);
    return gates[key].promise;
  } });
  await tick();
  assert.deepEqual([...calls].sort(), ["bootstrap", "product", "shell"]);
  assert.equal(res.body, undefined);
  gates.shell.resolve(new Response(shell));
  gates.bootstrap.resolve(Response.json(bootstrap));
  await tick();
  assert.equal(res.body, undefined, "product data is still required");
  gates.product.resolve(Response.json({ product }));
  await pending;
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /data-prerendered/);
  assert.match(res.body, /<h1>Товар<\/h1>/);
  cases++;

  // Two simultaneous pages share one bootstrap request. Product reads remain distinct.
  resetMemory();
  let bootstrapCalls = 0, productCalls = 0;
  const shared = deferred();
  const rpc = async (name, body) => {
    if (name === "get_catalog_bootstrap") { bootstrapCalls++; return shared.promise; }
    if (name === "get_catalog_product_by_slug") { productCalls++; return { product: { ...product, slug: body.product_slug } }; }
    return null;
  };
  const pageOne = resolvePage({ kind: "product", slug: "one", rpc, origin: "https://shop.test", now: 1000 });
  const pageTwo = resolvePage({ kind: "product", slug: "two", rpc, origin: "https://shop.test", now: 1000 });
  await tick();
  assert.equal(bootstrapCalls, 1);
  assert.equal(productCalls, 2);
  shared.resolve(bootstrap);
  assert.ok((await pageOne).page);
  assert.ok((await pageTwo).page);
  await resolvePage({ kind: "product", slug: "three", rpc, origin: "https://shop.test", now: 1001 });
  assert.equal(bootstrapCalls, 1, "existing TTL cache is still used");
  cases++;

  // A failed shared request is evicted, so the next page can recover.
  resetMemory();
  let failures = 0;
  const retryRpc = async name => {
    if (name === "get_catalog_bootstrap") { if (++failures === 1) throw new Error("temporary metadata error"); return bootstrap; }
    return { product };
  };
  await assert.rejects(resolvePage({ kind: "product", slug: product.slug, rpc: retryRpc, origin: "https://shop.test" }), /metadata error/);
  assert.ok((await resolvePage({ kind: "product", slug: product.slug, rpc: retryRpc, origin: "https://shop.test" })).page);
  assert.equal(failures, 2);
  cases++;

  // Unknown products/legacy IDs keep their 404/redirect decision even if the overlapping metadata fails.
  for (const legacy of [false, true]) {
    resetMemory();
    const seenIds = [];
    const result = await resolvePage({ kind: "product", slug: "P-LEGACY", search: "?utm_source=test", origin: "https://shop.test", rpc: async (name, body) => {
      if (name === "get_catalog_bootstrap") throw new Error("metadata offline");
      if (name === "get_catalog_product") { seenIds.push(body.legacy_id); return legacy ? { product } : null; }
      return null;
    } });
    assert.deepEqual(seenIds, ["P-LEGACY"]);
    assert.deepEqual(result, legacy ? { redirect: "/product/actual-product?utm_source=test" } : { missing: true });
    cases++;
  }

  // Fallback awaits the already-running shell rather than issuing another request for it.
  resetMemory();
  const fallbackShell = deferred();
  let shellCalls = 0;
  const fallbackResponse = response();
  const fallback = handler(request(), fallbackResponse, { env, fetchImpl: async address => {
    if (address.includes("/rest/v1/rpc/")) return new Response("offline", { status: 500 });
    shellCalls++;
    return fallbackShell.promise;
  } });
  await tick();
  assert.equal(shellCalls, 1);
  fallbackShell.resolve(new Response(shell));
  await fallback;
  assert.equal(shellCalls, 1);
  assert.equal(fallbackResponse.statusCode, 503);
  assert.equal(fallbackResponse.headers["cache-control"], "no-store");
  cases++;

  // The previous shell retry remains available if the first shell fetch itself fails.
  resetMemory();
  let shellAttempts = 0;
  const retryResponse = response();
  await handler(request(), retryResponse, { env, fetchImpl: async address => {
    if (address.endsWith("/get_catalog_bootstrap")) return Response.json(bootstrap);
    if (address.endsWith("/get_catalog_product_by_slug")) return Response.json({ product });
    if (++shellAttempts === 1) throw new Error("shell temporarily unavailable");
    return new Response(shell);
  } });
  assert.equal(shellAttempts, 2);
  assert.equal(retryResponse.statusCode, 503);
  assert.equal(retryResponse.headers["cache-control"], "no-store");
  cases++;

  const config = JSON.parse(await fs.readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.regions, ["dub1"], "one function region near the existing eu-west-1 database");
  cases++;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unhandled, [], "ignored speculative reads must never create unhandled rejections");
} finally {
  console.error = originalError;
  process.removeListener("unhandledRejection", onUnhandled);
}
console.log(JSON.stringify({ status: "ok", cases, concurrency: "gated proof", hostedRequests: 0 }));
