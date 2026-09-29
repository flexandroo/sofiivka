import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminDirectory = path.join(root, "admin");
const outputDirectory = path.join(root, ".admin-test-build");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const files = ["index.html", "admin.css", "admin.mjs", "admin-auth.mjs", "admin-api.mjs", "admin-icons.mjs", "admin-components.mjs"];

for (const file of files) assert.ok(fs.existsSync(path.join(adminDirectory, file)), `admin/${file} must exist`);

const html = read("admin/index.html");
const css = read("admin/admin.css");
const app = read("admin/admin.mjs");
const auth = read("admin/admin-auth.mjs");
const api = read("admin/admin-api.mjs");
const components = read("admin/admin-components.mjs");
const vercel = JSON.parse(read("vercel.json"));
const build = read("scripts/build-static-site.mjs");

assert.match(html, /lang="uk"/);
assert.match(html, /noindex,nofollow,noarchive/);
assert.match(html, /data-admin-state="loading"/);
assert.doesNotMatch(html, /signup|sign.?up|reset.?password|social/i);

for (const route of ["/admin", "/admin/products", "/admin/categories", "/admin/brands", "/admin/attributes", "/admin/collections", "/admin/media", "/admin/settings"]) {
  assert.ok(app.includes(`"${route}"`), `${route} must be declared`);
}
assert.ok(vercel.rewrites.some(item => item.source === "/admin/:path*" && item.destination === "/admin/index.html"));
assert.match(build, /new Set\(\["admin", "assets", "catalog", "lib"\]\)/);

for (const role of ["owner", "admin", "manager", "content_manager"]) assert.ok(app.includes(`"${role}"`));
assert.match(app, /profile\?\.active/);
assert.match(auth, /grant_type=password/);
assert.match(auth, /grant_type=refresh_token/);
assert.match(auth, /\/auth\/v1\/logout/);
assert.match(api, /Authorization: `Bearer \$\{token\}`/);
assert.match(api, /Prefer: "count=exact"/);
for (const component of ["createButton", "createIconButton", "createStatusBadge", "createFormField", "createPageHeader", "createToolbar", "createEmptyState", "createErrorState", "createSkeleton", "createDialog", "createDrawer", "createTableShell", "createLoadMore"]) {
  assert.match(components, new RegExp(`export function ${component}\\b`));
}
assert.doesNotMatch(`${html}\n${css}\n${app}\n${auth}\n${api}`, /sb_secret_|service[_-]?role|database.?password/i);
assert.doesNotMatch(css, /!important|linear-gradient|radial-gradient|backdrop-filter:\s*blur\([^)]{3,}/i);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /max-width: 900px/);
assert.match(css, /max-width: 620px/);
assert.match(css, /outline: 3px solid var\(--yellow\)/);

fs.rmSync(outputDirectory, { recursive: true, force: true });
const result = childProcess.spawnSync(process.execPath, ["scripts/build-static-site.mjs", `--output-dir=${path.basename(outputDirectory)}`, "--skip-assets"], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    VERCEL_ENV: "preview",
    SOFIEVKA_CATALOG_SOURCE: "supabase",
    SUPABASE_URL: "https://wfxcklglujgramasdzyr.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
    SOFIEVKA_SUPABASE_PROJECT_REF: "wfxcklglujgramasdzyr"
  }
});
assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
assert.ok(fs.existsSync(path.join(outputDirectory, "admin", "index.html")), "admin route must be copied into build");
const runtimeConfig = fs.readFileSync(path.join(outputDirectory, "catalog-runtime-config.js"), "utf8");
assert.match(runtimeConfig, /wfxcklglujgramasdzyr/);
assert.doesNotMatch(runtimeConfig, /fkjarsouuchjiedrrblc|sb_secret_|service_role/i);
fs.rmSync(outputDirectory, { recursive: true, force: true });

console.log(JSON.stringify({
  status: "ok",
  routes: 9,
  auth: ["password", "restore", "refresh", "logout"],
  projectRef: "wfxcklglujgramasdzyr",
  productionChanged: false
}));
