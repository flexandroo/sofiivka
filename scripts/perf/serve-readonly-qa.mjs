// Local UI QA build/server. Uses only the existing public PROD catalogue config, never CLI credentials/.env.
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const match = /^--(port|output|build)=(.+)$/.exec(argument);
  if (!match) throw new Error(`Unsupported argument: ${argument}`);
  return [match[1], match[2]];
}));
const port = Number(args.port || 4187);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local port.");
const output = path.resolve(root, args.output || "tmp/overnight-ui-qa/dist");
if (!output.startsWith(path.join(root, "tmp") + path.sep)) throw new Error("QA output must be inside workspace tmp.");
const projectRef = "fkjarsouuchjiedrrblc";
const source = await fetch("https://sofievka.vercel.app/catalog-runtime-config.js", { signal: AbortSignal.timeout(15000) });
if (!source.ok) throw new Error(`Public PROD config HTTP ${source.status}`);
const text = await source.text();
const config = JSON.parse(/Object\.freeze\((\{[\s\S]*\})\)/.exec(text)?.[1] || "{}");
if (config.source !== "supabase" || config.supabase?.projectRef !== projectRef || config.supabase?.url !== `https://${projectRef}.supabase.co` || !/^sb_publishable_/.test(config.supabase?.publishableKey || "")) {
  throw new Error("Only the verified public PROD configuration is accepted.");
}

if (args.build !== "false") {
  console.log(JSON.stringify({ phase: "building", projectRef, source: "supabase", output: path.relative(root, output).replaceAll("\\", "/"), assets: "served read-only from source assets; not recopied" }));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/build-static-site.mjs", `--output-dir=${path.relative(root, output)}`, "--skip-assets"], {
      cwd: root, stdio: "inherit", windowsHide: true,
      env: { ...process.env, SOFIEVKA_CATALOG_SOURCE: "supabase", VERCEL_ENV: "production", SUPABASE_URL: config.supabase.url, SUPABASE_PUBLISHABLE_KEY: config.supabase.publishableKey, SOFIEVKA_SUPABASE_PROJECT_REF: projectRef, SOFIEVKA_ALLOW_PRODUCTION_SUPABASE: "true" }
    });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Local QA build exited ${code}`)));
  });
}
const runtime = JSON.parse(/Object\.freeze\((\{[\s\S]*\})\)/.exec(await fs.readFile(path.join(output, "catalog-runtime-config.js"), "utf8"))?.[1] || "{}");
if (runtime.source !== "supabase" || runtime.supabase?.projectRef !== projectRef) throw new Error("Built config is not verified PROD.");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff2": "font/woff2", ".woff": "font/woff", ".pdf": "application/pdf", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json" };
function relativeFile(urlPath) {
  if (urlPath === "/") return "index.html";
  if (urlPath === "/catalog" || urlPath.startsWith("/catalog/")) {
    if (!path.posix.extname(urlPath)) return "catalog.html";
  }
  if (urlPath.startsWith("/product/")) return "product.html";
  if (urlPath.startsWith("/brands/")) return "brand.html";
  const clean = urlPath.replace(/^\/+/, "").replace(/\/$/, "");
  return path.posix.extname(clean) ? clean : `${clean}.html`;
}
const server = http.createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const relative = relativeFile(pathname);
    const extension = path.extname(relative).toLowerCase();
    if (!mime[extension]) { response.writeHead(404).end("Not found"); return; }
    const asset = pathname.startsWith("/assets/");
    const allowedRoot = asset ? path.join(root, "assets") : output;
    const absolute = path.resolve(allowedRoot, asset ? pathname.slice("/assets/".length) : relative);
    if (!absolute.startsWith(allowedRoot + path.sep)) { response.writeHead(403).end("Forbidden"); return; }
    let body, status = 200;
    try { body = await fs.readFile(absolute); }
    catch {
      if (extension !== ".html") { response.writeHead(404).end("Not found"); return; }
      body = await fs.readFile(path.join(output, "404.html"));
      status = 404;
    }
    response.writeHead(status, { "Content-Type": mime[extension], "Content-Length": body.length, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Sofievka-QA": "public-prod-catalog-read" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch { response.writeHead(400).end("Bad request"); }
});
server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ phase: "ready", url: `http://127.0.0.1:${port}`, projectRef, output: path.relative(root, output).replaceAll("\\", "/"), serverMethods: ["GET", "HEAD"], backend: "public PROD catalogue RPCs; no hosted mutations by this tool" })));
process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
