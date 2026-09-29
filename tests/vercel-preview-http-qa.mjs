import childProcess from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployment = String(process.argv[2] || "").replace(/\/+$/, "");
const expectedProjectRef = "wfxcklglujgramasdzyr";
const deploymentHost = deployment ? new URL(deployment).hostname : "";
if (!/^sofievka-[a-z0-9]+-flexandroos-projects\.vercel\.app$/i.test(deploymentHost)) {
  throw new Error("Expected an immutable sofievka Preview deployment URL.");
}

const routePaths = [
  "/",
  "/catalog",
  "/catalog/heating",
  "/catalog/heating/heat-generation/gas-boilers",
  "/catalog/water-supply/water-pumps/borehole-pumps",
  "/catalog/water-treatment/drinking-water/reverse-osmosis",
  "/brands",
  "/brands/wilo",
  "/search?q=wilo",
  "/product?id=MO550MECOSTD",
];
const supplierFeeds = [
  "products-data.js",
  "termojet-products-data.js",
  "wilo-products-data.js",
  "grundfos-products-data.js",
  "tekkhaus-products-data.js",
  "tech-products-data.js",
  "heating-brands-products-data.js",
  "baxi-buderus-products-data.js",
];
const marker = "__SOFIEVKA_HTTP__";

async function vercelCurl(pathname) {
  const requestUrl = new URL(pathname, `${deployment}/`).href;
  const executable = process.platform === "win32" ? (process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe") : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/c", "npx", "--yes", "vercel@latest", "curl", requestUrl, "--", "--location", "--silent", "--show-error", "--write-out", `\\n${marker}:%{http_code}:%{time_total}:%{size_download}`]
    : ["--yes", "vercel@latest", "curl", requestUrl, "--", "--location", "--silent", "--show-error", "--write-out", `\\n${marker}:%{http_code}:%{time_total}:%{size_download}`];
  const started = performance.now();
  const result = await new Promise((resolve, reject) => {
    const child = childProcess.spawn(executable, args, { cwd: root, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`Vercel curl failed for ${pathname}; output suppressed.`)));
  });
  const markerIndex = result.stdout.lastIndexOf(`\n${marker}:`);
  if (markerIndex < 0) throw new Error(`Missing HTTP marker for ${pathname}.`);
  const body = result.stdout.slice(0, markerIndex);
  const [, status, curlSeconds, bytes] = result.stdout.slice(markerIndex + 1).trim().split(":");
  return { pathname, status: Number(status), curlMs: Math.round(Number(curlSeconds) * 1000), processMs: Math.round(performance.now() - started), bytes: Number(bytes), body };
}

async function parallelMap(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Vercel CLI's automatic protection bypass uses shared local state and can race
// when several protected requests start at once. Keep this gate deterministic.
const routeResponses = await parallelMap(routePaths, 1, vercelCurl);
for (const response of routeResponses) {
  if (response.status !== 200) throw new Error(`${response.pathname} returned HTTP ${response.status}.`);
  if (!/catalog-runtime-config\.js/i.test(response.body)) throw new Error(`${response.pathname} is missing runtime configuration.`);
  if (/(?:products-data|termojet-products-data|wilo-products-data|grundfos-products-data|tekkhaus-products-data|tech-products-data|heating-brands-products-data|baxi-buderus-products-data)\.js/i.test(response.body)) {
    throw new Error(`${response.pathname} still references a supplier feed.`);
  }
}

const [manifestResponse, configResponse, ...feedResponses] = await parallelMap([
  "/catalog-build-manifest.json",
  "/catalog-runtime-config.js",
  ...supplierFeeds.map(name => `/${name}`),
], 1, vercelCurl);
if (manifestResponse.status !== 200) throw new Error("Preview build manifest is unavailable.");
const manifest = JSON.parse(manifestResponse.body);
if (manifest.source !== "supabase" || manifest.deploymentEnvironment !== "preview" || manifest.projectRef !== expectedProjectRef || manifest.supplierFeedFilesIncluded !== false) {
  throw new Error("Preview build manifest does not match the controlled cutover contract.");
}
if (configResponse.status !== 200 || !configResponse.body.includes('"source":"supabase"') || !configResponse.body.includes(expectedProjectRef)) {
  throw new Error("Preview runtime configuration is invalid.");
}
if (/sb_secret_|service[_-]?role/i.test(configResponse.body)) throw new Error("A privileged credential leaked into Preview runtime configuration.");
for (const response of feedResponses) {
  if (response.status !== 404) throw new Error(`${response.pathname} should be absent, received HTTP ${response.status}.`);
}

const report = {
  reportVersion: "sofievka-controlled-cutover-preview-http-v1",
  status: "ok",
  deployment,
  checkedAt: new Date().toISOString(),
  routes: routeResponses.map(({ pathname, status, curlMs, processMs, bytes }) => ({ pathname, status, curlMs, processMs, bytes })),
  manifest,
  runtimeConfig: { status: configResponse.status, source: "supabase", projectRef: expectedProjectRef, privilegedCredentialLeaks: 0 },
  supplierFeeds: feedResponses.map(({ pathname, status }) => ({ pathname, status })),
};
await fs.mkdir(path.join(root, "reports"), { recursive: true });
const reportPath = path.join(root, "reports", "catalog-cutover-preview-http-v1.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: report.status, reportPath, routes: report.routes, supplierFeeds: report.supplierFeeds }, null, 2));
