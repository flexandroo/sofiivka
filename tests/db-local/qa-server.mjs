// Local end-to-end QA server: the built site + a tiny Supabase look-alike backed by PGlite.
// It is for browser QA only (never deployed): fake auth accepts the QA password for seeded QA users.
//
//   node scripts/build-static-site.mjs --output-dir=dist
//   node tests/db-local/qa-server.mjs --port=4300
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./database.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../../dist");
const port = Number(process.argv.find(argument => argument.startsWith("--port="))?.split("=")[1] || 4300);
const origin = `http://localhost:${port}`;
const PUBLISHABLE = "sb_publishable_local_qa";
const QA_PASSWORD = "qa-local-password";
const DEV_REF = "wfxcklglujgramasdzyr";
const USERS = [
  { id: "00000000-0000-4000-8000-0000000000a1", email: "owner@qa.test", name: "Олена Власник", role: "owner" },
  { id: "00000000-0000-4000-8000-0000000000a2", email: "manager@qa.test", name: "Андрій Менеджер", role: "manager" },
  { id: "00000000-0000-4000-8000-0000000000a3", email: "content@qa.test", name: "Ірина Контент", role: "content_manager" }
];

const db = await createDatabase();
for (const user of USERS) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  await db.query("insert into public.admin_profiles (user_id, name, role) values ($1, $2, $3)", [user.id, user.name, user.role]);
}
// An account without a staff profile, for the "add staff" flow.
await db.query("insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a4', 'candidate@qa.test')");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ttf": "font/ttf", ".woff2": "font/woff2", ".ico": "image/x-icon" };

function send(response, status, body, headers = {}) {
  const payload = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS", "Access-Control-Expose-Headers": "content-range",
    ...(typeof body === "object" ? { "Content-Type": "application/json" } : {}), ...headers });
  response.end(payload);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function caller(request) {
  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token.startsWith("qa.")) {
    const user = USERS.find(item => item.id === token.slice(3));
    return user ? { role: "authenticated", user } : null;
  }
  return token === PUBLISHABLE ? { role: "anon", user: null } : null;
}

async function asCaller(who, fn) {
  return db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [who.user?.id || ""]);
    await tx.query("select set_config('request.headers', $1, true)", [JSON.stringify({ "x-forwarded-for": "127.0.0.1" })]);
    await tx.exec(`set local role ${who.role}`);
    return fn(tx);
  });
}

function session(user) {
  return { access_token: `qa.${user.id}`, refresh_token: `qa-refresh.${user.id}`, token_type: "bearer",
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user.id, email: user.email } };
}

async function handleAuth(request, response, url) {
  if (url.pathname === "/auth/v1/token") {
    const body = await readJson(request);
    const user = url.searchParams.get("grant_type") === "refresh_token"
      ? USERS.find(item => body.refresh_token === `qa-refresh.${item.id}`)
      : USERS.find(item => item.email === String(body.email).toLowerCase() && body.password === QA_PASSWORD);
    return user ? send(response, 200, session(user)) : send(response, 400, { error_code: "invalid_credentials", msg: "Invalid login" });
  }
  if (url.pathname === "/auth/v1/user") {
    const who = caller(request);
    return who?.user ? send(response, 200, { id: who.user.id, email: who.user.email }) : send(response, 401, { msg: "invalid" });
  }
  if (url.pathname === "/auth/v1/logout") return send(response, 204);
  return send(response, 404, { msg: "not found" });
}

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

async function handleRest(request, response, url) {
  const who = caller(request);
  if (!who) return send(response, 401, { message: "JWT invalid" });

  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
  if (rpc) {
    const body = await readJson(request);
    const names = Object.keys(body);
    if (!names.every(name => SAFE_IDENTIFIER.test(name))) return send(response, 400, { message: "bad args" });
    const args = names.map((name, index) => `${name} => $${index + 1}`).join(", ");
    const values = names.map(name => {
      const value = body[name];
      return value !== null && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : value;
    });
    try {
      const result = await asCaller(who, tx => tx.query(`select public.${rpc[1]}(${args}) as result`, values));
      return send(response, 200, JSON.stringify(result.rows[0]?.result ?? null), { "Content-Type": "application/json" });
    } catch (error) {
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400;
      return send(response, status, { code: error.code, message: error.message });
    }
  }

  const table = url.pathname.match(/^\/rest\/v1\/([a-z0-9_]+)$/)?.[1];
  if (!table) return send(response, 404, { message: "not found" });
  const where = [];
  const values = [];
  let select = "*";
  let limit = null;
  for (const [key, raw] of url.searchParams) {
    if (key === "select") { select = raw.split(",").filter(column => SAFE_IDENTIFIER.test(column)).join(", ") || "*"; continue; }
    if (key === "limit") { limit = Number(raw); continue; }
    if (key === "order") continue;
    if (!SAFE_IDENTIFIER.test(key) || !raw.startsWith("eq.")) continue;
    values.push(raw.slice(3));
    where.push(`${key}::text = $${values.length}`);
  }
  try {
    const filter = where.length ? ` where ${where.join(" and ")}` : "";
    if (request.method === "HEAD") {
      const result = await asCaller(who, tx => tx.query(`select count(*)::int as total from public.${table}${filter}`, values));
      const total = result.rows[0].total;
      return send(response, 200, undefined, { "content-range": `0-0/${total}` });
    }
    const result = await asCaller(who, tx => tx.query(`select ${select} from public.${table}${filter}${limit ? ` limit ${limit}` : ""}`, values));
    return send(response, 200, result.rows);
  } catch (error) {
    return send(response, error.code === "42501" ? 403 : 400, { code: error.code, message: error.message });
  }
}

// QA-only: mirror local storefront products into the database so the cart can be ordered.
async function handleSeed(request, response) {
  const items = await readJson(request);
  const brand = (await db.query("select internal_id from public.brands order by stable_id limit 1")).rows[0];
  const category = (await db.query("select internal_id from public.categories order by level desc, stable_id limit 1")).rows[0];
  for (const item of items) {
    await db.query(`insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id,
        amount, price_status, inventory_status, publication_status)
      values ($1, $2, $3, $4, $4, $2, $5, $6, $7, $8, 'in_stock', 'published') on conflict (legacy_id) do nothing`,
      [item.id, item.sku || item.id, `qa-${item.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"), item.title,
        brand.internal_id, category.internal_id, Number(item.price) > 0 ? Number(item.price) : null,
        Number(item.price) > 0 ? "known" : "unknown"]);
  }
  return send(response, 200, { seeded: items.length });
}

function runtimeConfig(request) {
  const referer = String(request.headers.referer || "");
  const admin = referer.includes("/admin");
  return `window.SOFIEVKA_CATALOG_CONFIG=Object.freeze(${JSON.stringify({
    source: admin ? "supabase" : "local",
    environment: "preview",
    supabase: { url: origin, publishableKey: PUBLISHABLE, projectRef: DEV_REF }
  })});\n`;
}

function serveStatic(response, pathname) {
  let file = path.join(dist, decodeURIComponent(pathname));
  if (!file.startsWith(dist)) return send(response, 403, "forbidden");
  if (pathname === "/" ) file = path.join(dist, "index.html");
  else if (pathname === "/admin" || pathname.startsWith("/admin/") && !path.extname(pathname)) file = path.join(dist, "admin/index.html");
  else if (/^\/(blog|portfolio)\/[^/]+$/.test(pathname)) file = path.join(dist, "post.html");
  else if (!path.extname(pathname)) file = path.join(dist, `${pathname}.html`);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(response, 404, "not found");
  response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(response);
}

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, origin);
    if (request.method === "OPTIONS") return send(response, 204);
    if (url.pathname.startsWith("/auth/v1/")) return await handleAuth(request, response, url);
    if (url.pathname.startsWith("/rest/v1/")) return await handleRest(request, response, url);
    if (url.pathname === "/__qa/seed-products") return await handleSeed(request, response);
    if (url.pathname === "/catalog-runtime-config.js") return send(response, 200, runtimeConfig(request), { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
    return serveStatic(response, url.pathname);
  } catch (error) {
    send(response, 500, { message: error.message });
  }
}).listen(port, () => console.log(JSON.stringify({ status: "listening", origin, users: USERS.map(user => user.email) })));
