// Bounded, read-only HTTP evidence. This is not a browser/LCP benchmark or a load test.
// node scripts/perf/http-baseline.mjs --output=imports/perf/overnight-http-baseline-2026-11-26.json
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const match = /^--(base|output|assets)=(.+)$/.exec(value);
  if (!match) throw new Error(`Unsupported argument: ${value}`);
  return [match[1], match[2]];
}));
const base = new URL(args.base || "https://sofievka.vercel.app");
if (base.protocol !== "https:") throw new Error("The target must use HTTPS.");
const output = path.resolve(root, args.output || "imports/perf/overnight-http-baseline-2026-11-26.json");
if (!output.startsWith(path.join(root, "imports", "perf") + path.sep)) throw new Error("Output must be in ignored imports/perf.");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const work = path.join(path.dirname(output), `http-${runId}`);
await fs.mkdir(work, { recursive: true });
const exec = promisify(execFile);
const curl = process.platform === "win32" ? "curl.exe" : "curl";
let counter = 0;

function parseHeaders(raw) {
  const block = raw.trim().split(/\r?\n\r?\n/).at(-1) || "";
  return Object.fromEntries(block.split(/\r?\n/).slice(1).map(line => {
    const colon = line.indexOf(":");
    return colon < 0 ? null : [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
  }).filter(Boolean));
}

async function request(url, label) {
  const id = String(++counter).padStart(3, "0");
  const headersFile = path.join(work, `${id}-headers.txt`);
  const bodyFile = path.join(work, `${id}-body`);
  try {
    const { stdout } = await exec(curl, ["--silent", "--show-error", "--location", "--max-time", "25", "--connect-timeout", "10", "--compressed", "--dump-header", headersFile, "--output", bodyFile, "--write-out", "%{json}", url], { maxBuffer: 1024 * 1024 });
    const metrics = JSON.parse(stdout);
    const [rawHeaders, body] = await Promise.all([fs.readFile(headersFile, "utf8"), fs.readFile(bodyFile)]);
    const headers = parseHeaders(rawHeaders);
    if (new URL(url).pathname === "/catalog-runtime-config.js") {
      await fs.writeFile(bodyFile, "[Public runtime configuration omitted; byte measurements describe the original response.]\n");
    }
    return { label, url, status: metrics.http_code, dnsMs: Math.round(metrics.time_namelookup * 1000), connectMs: Math.round(metrics.time_connect * 1000), tlsMs: Math.round(metrics.time_appconnect * 1000), ttfbMs: Math.round(metrics.time_starttransfer * 1000), totalMs: Math.round(metrics.time_total * 1000), wireBytes: metrics.size_download, decodedBytes: body.length, redirects: metrics.num_redirects, cache: headers["x-vercel-cache"] || null, age: headers.age || null, vercelId: headers["x-vercel-id"] || null, cacheControl: headers["cache-control"] || null, contentEncoding: headers["content-encoding"] || null, contentType: headers["content-type"] || null, bodyFile: path.relative(root, bodyFile).replaceAll("\\", "/"), body };
  } catch (error) {
    return { label, url, error: String(error.stderr || error.message).slice(0, 1000) };
  }
}

// Exactly two workers. No automatic retries, cache purges, SQL, authentication or writes to the site.
async function bounded(items, operation) {
  const result = Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      result[index] = await operation(items[index], index);
    }
  }));
  return result;
}
const withoutBody = ({ body, ...result }) => result;
const sitemap = await request(new URL("/sitemap.xml", base).href, "sitemap");
if (sitemap.status !== 200) throw new Error(`Sitemap unavailable: ${JSON.stringify(withoutBody(sitemap))}`);
const locations = [...sitemap.body.toString("utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replaceAll("&amp;", "&"));
const preferred = ["rehau", "tweetop", "oxi", "baxi", "valrom", "tervix"];
const products = preferred.map(brand => locations.find(url => url.includes("/product/") && url.toLowerCase().includes(brand))).filter(Boolean);
for (const url of locations.filter(url => url.includes("/product/"))) {
  if (products.length >= 6) break;
  if (!products.includes(url)) products.push(url);
}
if (products.length !== 6) throw new Error("Six real canonical product URLs are required.");
const paths = ["/", "/catalog", "/brands/rehau", ...products.map(url => new URL(url).pathname)];
const targets = paths.map(route => {
  const url = new URL(route, base);
  url.searchParams.set("utm_source", `performance-${runId}`);
  return { route, url: url.href };
});
const pages = [];
const bodies = new Map();
for (const round of ["first-key-request", "repeat-same-key"]) {
  const measurements = await bounded(targets, async target => {
    const result = await request(target.url, `${round}:${target.route}`);
    if (result.body && !bodies.has(target.route)) bodies.set(target.route, result.body.toString("utf8"));
    return { ...withoutBody(result), route: target.route, round, prerendered: result.body ? /data-prerendered/.test(result.body.toString("utf8")) : null };
  });
  pages.push(...measurements);
  console.log(JSON.stringify({ phase: round, requests: measurements.length, failures: measurements.filter(x => x.status !== 200).length }));
}

const assetCandidates = new Map();
for (const [route, html] of bodies) {
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    if (/^<link/i.test(tag[0]) && !/rel=["'](?:stylesheet|preload|modulepreload)["']/i.test(tag[0])) continue;
    const href = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag[0])?.[1];
    if (!href) continue;
    const url = new URL(href.replaceAll("&amp;", "&"), base);
    if (url.origin !== base.origin) continue;
    const entry = assetCandidates.get(url.href) || { url: url.href, routes: [], tag: tag[0] };
    if (!entry.routes.includes(route)) entry.routes.push(route);
    assetCandidates.set(url.href, entry);
  }
}
const candidates = [...assetCandidates.values()];
const selectedAssets = args.assets === "false" ? [] : candidates.slice(0, 24);
const assets = await bounded(selectedAssets, async entry => ({ ...withoutBody(await request(entry.url, "critical-asset")), routes: entry.routes, tag: entry.tag }));
const summaries = paths.map(route => {
  const samples = pages.filter(page => page.route === route && page.status === 200);
  const sorted = samples.map(x => x.ttfbMs).sort((a, b) => a - b);
  return { route, samples: samples.length, ttfbP50Ms: sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null, firstTtfbMs: samples[0]?.ttfbMs ?? null, repeatTtfbMs: samples[1]?.ttfbMs ?? null, firstCache: samples[0]?.cache ?? null, repeatCache: samples[1]?.cache ?? null, decodedBytes: samples[0]?.decodedBytes ?? null };
});
const report = { measuredAt: new Date().toISOString(), base: base.origin, method: "HTTP only, curl fresh connection per request; unique tracking-key first request then same-key repeat; actual CDN status recorded. This does not force a function/DB cold start and does not measure browser FCP/LCP or script execution.", maxConcurrency: 2, pageRequests: pages.length, sitemap: withoutBody(sitemap), summaries, pages, assets, assetCandidateCount: candidates.length, assetMeasurementCap: 24, assetDecodedBytes: assets.reduce((sum, asset) => sum + (asset.decodedBytes || 0), 0), failures: [...pages, ...assets].filter(item => item.error || item.status !== 200).map(withoutBody) };
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output: path.relative(root, output).replaceAll("\\", "/"), summaries, measuredAssets: assets.length, assetDecodedBytes: report.assetDecodedBytes, failures: report.failures.length }));
