// Bounded public read RPC samples. Public config stays in memory and is never logged.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const match = /^--(http-report|output)=(.+)$/.exec(value);
  if (!match) throw new Error(`Unsupported argument: ${value}`);
  return [match[1], match[2]];
}));
const base = "https://sofievka.vercel.app";
const output = path.resolve(root, args.output || "imports/perf/overnight-rpc-baseline-2026-11-26.json");
if (!output.startsWith(path.join(root, "imports", "perf") + path.sep)) throw new Error("Output must be in ignored imports/perf.");
const htmlReport = JSON.parse(await fs.readFile(path.resolve(root, args["http-report"] || "imports/perf/overnight-http-baseline-2026-11-26.json"), "utf8"));
const configResponse = await fetch(`${base}/catalog-runtime-config.js`, { signal: AbortSignal.timeout(15000) });
if (!configResponse.ok) throw new Error(`Public config HTTP ${configResponse.status}`);
const configText = await configResponse.text();
const url = /"url":"(https:[^"]+)"/.exec(configText)?.[1];
const key = /sb_publishable_[A-Za-z0-9_-]+/.exec(configText)?.[0];
if (!url || !key || new URL(url).hostname !== "fkjarsouuchjiedrrblc.supabase.co") throw new Error("Expected public PROD config unavailable.");
const slugs = htmlReport.summaries.filter(page => page.route.startsWith("/product/")).map(page => decodeURIComponent(page.route.slice("/product/".length)));
const operations = [
  { name: "get_catalog_bootstrap", body: {} },
  { name: "get_catalog_products", body: { scope_brand: "rehau", page_size: 24 } },
  { name: "get_catalog_facets", body: { scope_brand: "rehau" } },
  ...slugs.map(slug => ({ name: "get_catalog_product_by_slug", body: { product_slug: slug } }))
];
const samples = [];
for (const round of ["first", "repeat"]) {
  let next = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < operations.length) {
      const operation = operations[next++];
      const started = performance.now();
      let sample = { round, name: operation.name, parameters: operation.body };
      try {
        const response = await fetch(`${url}/rest/v1/rpc/${operation.name}`, {
          method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(operation.body), signal: AbortSignal.timeout(15000)
        });
        const headersAt = performance.now();
        const text = await response.text();
        const bodyAt = performance.now();
        const value = JSON.parse(text);
        sample = { ...sample, status: response.status, headersMs: Math.round(headersAt - started), totalMs: Math.round(bodyAt - started), decodedBytes: Buffer.byteLength(text), encoding: response.headers.get("content-encoding"), contentLength: response.headers.get("content-length"), upstreamMs: response.headers.get("x-kong-upstream-latency"), total: value?.total ?? value?.totalProducts ?? null, productId: value?.product?.id ?? null, categoryCount: value?.categories?.length ?? null, error: response.ok ? null : String(value?.message || "HTTP failure") };
      } catch (error) {
        sample.error = String(error.message);
        sample.totalMs = Math.round(performance.now() - started);
      }
      samples.push(sample);
      console.log(JSON.stringify({ round, name: sample.name, status: sample.status, totalMs: sample.totalMs, decodedBytes: sample.decodedBytes, error: sample.error }));
    }
  }));
}
const groups = operations.map(operation => {
  const matches = samples.filter(sample => sample.name === operation.name && JSON.stringify(sample.parameters) === JSON.stringify(operation.body));
  const times = matches.filter(sample => sample.status === 200).map(sample => sample.totalMs).sort((a, b) => a - b);
  return { ...operation, samples: matches.length, p50Ms: times.length === 2 ? (times[0] + times[1]) / 2 : times[0] ?? null, maxMs: times.at(-1) ?? null, decodedBytes: matches[0]?.decodedBytes ?? null };
});
const report = { measuredAt: new Date().toISOString(), projectRef: "fkjarsouuchjiedrrblc", method: "Two bounded HTTP rounds to public read RPCs, at most two concurrent. First/repeat do not force cold/warm DB. Fetch auto-decompresses bodies; decodedBytes is not wireBytes. No browser CORS/preflight or render timing is included.", maxConcurrency: 2, requests: samples.length, groups, samples, failures: samples.filter(sample => sample.status !== 200) };
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output: path.relative(root, output).replaceAll("\\", "/"), requests: samples.length, failures: report.failures.length }));
