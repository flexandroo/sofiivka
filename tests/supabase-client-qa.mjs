import assert from "node:assert/strict";
import {
  createSofievkaSupabaseClient,
  createSofievkaSupabasePublicClient
} from "../lib/supabase-client.mjs";

const calls = [];
const fakeCreateClient = (...args) => {
  calls.push(args);
  return { kind: "test-client" };
};

const client = createSofievkaSupabaseClient(fakeCreateClient, {
  url: "https://example.supabase.co",
  publishableKey: "sb_publishable_test-only"
});

assert.deepEqual(client, { kind: "test-client" });
assert.equal(calls.length, 1);
assert.equal(calls[0][0], "https://example.supabase.co");
assert.equal(calls[0][1], "sb_publishable_test-only");
assert.equal(calls[0][2].db.schema, "public");

assert.throws(
  () => createSofievkaSupabaseClient(fakeCreateClient, {
    url: "https://example.supabase.co",
    publishableKey: "sb_secret_forbidden"
  }),
  /must never be used/
);

assert.throws(
  () => createSofievkaSupabaseClient(fakeCreateClient, {
    url: "javascript:alert(1)",
    publishableKey: "sb_publishable_test-only"
  }),
  /valid HTTPS Supabase URL/
);

const publicCalls = [];
const publicClient = createSofievkaSupabasePublicClient({
  url: "https://example.supabase.co/",
  publishableKey: "sb_publishable_test-only"
}, async (url, options) => {
  publicCalls.push({ url, options });
  return new Response(JSON.stringify({
    version: "test",
    products: [],
    categories: [],
    brands: [],
    attributeDefinitions: {}
  }), { status: 200, headers: { "content-type": "application/json" } });
});
const rpcResult = await publicClient.rpc("get_catalog_snapshot");
assert.equal(rpcResult.data.version, "test");
assert.equal(publicCalls.length, 1);
assert.equal(publicCalls[0].url, "https://example.supabase.co/rest/v1/rpc/get_catalog_snapshot");
assert.equal(publicCalls[0].options.headers.apikey, "sb_publishable_test-only");
assert.equal(publicCalls[0].options.method, "POST");
assert.equal(rpcResult.metrics.requestCount, 1);

assert.throws(
  () => createSofievkaSupabasePublicClient({
    url: "https://example.supabase.co",
    publishableKey: "sb_secret_forbidden"
  }, async () => new Response()),
  /must never be used/
);

console.log(JSON.stringify({ status: "ok", module: "supabase-client", assertions: 15 }, null, 2));
