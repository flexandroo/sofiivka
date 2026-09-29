import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  PROJECT_ROOT,
  resolveLinkedDevProject,
  resolveProjectApiKeys,
  SupabaseRestClient
} from "./catalog-db-utils.mjs";

const projectRef = "wfxcklglujgramasdzyr";
const port = Number(process.argv.find(argument => argument.startsWith("--port="))?.split("=").at(1) || 4177);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid preview port.");
resolveLinkedDevProject(projectRef);
const { publishableKey, serviceRoleKey } = resolveProjectApiKeys(projectRef);
const baseUrl = `https://${projectRef}.supabase.co`;
const serviceClient = new SupabaseRestClient({ projectRef, apiKey: serviceRoleKey });
const userEmail = `admin-visual-${crypto.randomUUID()}@example.invalid`;
const userPassword = `${crypto.randomBytes(24).toString("base64url")}!Aa9`;
let userId = null;
let closing = false;

async function authRequest(pathname, { method = "GET", key = publishableKey, token = key, body, allowFailure = false } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !allowFailure) throw new Error(`DEV auth fixture failed (${response.status}).`);
  return { response, payload };
}

const created = await authRequest("/auth/v1/admin/users", {
  method: "POST",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: { email: userEmail, password: userPassword, email_confirm: true, user_metadata: { purpose: "admin-visual-qa" } }
});
userId = created.payload?.id;
if (!userId) throw new Error("DEV auth fixture user was not created.");
await serviceClient.insert("admin_profiles", { user_id: userId, name: "Візуальний QA", role: "admin", active: true });
const login = await authRequest("/auth/v1/token?grant_type=password", { method: "POST", body: { email: userEmail, password: userPassword } });
const session = login.payload;
if (!session?.access_token || !session?.refresh_token) throw new Error("DEV auth fixture session was not created.");

const runtimeConfig = Object.freeze({
  source: "supabase",
  environment: "local-preview",
  supabase: { url: baseUrl, publishableKey, projectRef }
});
const runtimeScript = `window.SOFIEVKA_CATALOG_CONFIG=Object.freeze(${JSON.stringify(runtimeConfig)});`;
const sessionScript = `localStorage.setItem(${JSON.stringify(`sofievka.admin.session.${projectRef}`)},${JSON.stringify(JSON.stringify(session))});`;
const mimeTypes = Object.freeze({
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".webp": "image/webp"
});

function pageFor(urlPath) {
  if (urlPath === "/" || urlPath === "/admin" || (urlPath.startsWith("/admin/") && !path.extname(urlPath))) return urlPath === "/" ? "index.html" : "admin/index.html";
  return urlPath.replace(/^\//, "");
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/catalog-runtime-config.js") {
    response.writeHead(200, { "Content-Type": mimeTypes[".js"], "Cache-Control": "no-store" });
    response.end(runtimeScript);
    return;
  }
  const relativePath = pageFor(url.pathname);
  const absolutePath = path.resolve(PROJECT_ROOT, relativePath);
  if (!absolutePath.startsWith(`${PROJECT_ROOT}${path.sep}`) && absolutePath !== path.join(PROJECT_ROOT, "index.html")) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(absolutePath, (error, body) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const extension = path.extname(absolutePath).toLowerCase();
    const output = extension === ".html"
      ? Buffer.from(body.toString("utf8").replace(/<head>/i, `<head><script>${runtimeScript}${sessionScript}</script>`))
      : body;
    response.writeHead(200, { "Content-Type": mimeTypes[extension] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(output);
  });
});

async function cleanup(exitCode = 0) {
  if (closing) return;
  closing = true;
  if (userId) {
    await authRequest(`/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      key: serviceRoleKey,
      token: serviceRoleKey,
      allowFailure: true
    });
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => cleanup(0));
process.once("SIGTERM", () => cleanup(0));
process.once("uncaughtException", error => {
  console.error(error?.message || "Admin visual QA server failed.");
  cleanup(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Authenticated DEV admin visual QA: http://127.0.0.1:${port}/admin`);
});
