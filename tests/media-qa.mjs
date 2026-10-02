// Media library v1: static contract between the migration, admin API, the /admin/media view,
// the picker wiring in banners and products, and the stylesheet.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002001500_media_library_v1.sql");
const storage = read("supabase/migrations/20260928000400_storage.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const view = read("admin/admin-media.mjs");
const banners = read("admin/admin-banners.mjs");
const products = read("admin/admin-products.mjs");
const css = read("admin/admin.css");
const pkg = JSON.parse(read("package.json"));

// Database contract.
assert.match(migration, /alter table public\.media_assets enable row level security/);
assert.match(migration, /revoke all on table public\.media_assets from public, anon, authenticated/);
assert.match(migration, /revoke all on table public\.media_assets_audit from public, anon, authenticated/);
for (const signature of ["admin_list_media(text, integer)", "admin_register_media(jsonb)", "admin_update_media(uuid, text, timestamptz)", "admin_delete_media(uuid)"]) {
  const escaped = signature.replace(/[()[\]]/g, character => `\\${character}`);
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon;`), `${signature} closed to anon`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`), `${signature} granted to staff`);
}
for (const helper of ["_media_usage(text)", "_media_admin_json(public.media_assets)", "_media_require_editor()", "_media_dimension(jsonb, text)"]) {
  const escaped = helper.replace(/[().[\]]/g, character => `\\${character}`);
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated;`), `${helper} private`);
}
const functions = [...migration.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\n\$\$;/g)];
assert.ok(functions.length >= 8);
for (const [body, name] of functions) {
  assert.match(body, /set search_path = ''/, `${name}: empty search_path`);
  if (/^admin_/.test(name)) assert.match(body, /security definer/, `${name}: security definer`);
  if (/^admin_(register|update|delete)/.test(name)) assert.match(body, /_media_require_editor\(\)/, `${name}: content editors only`);
}
assert.match(migration, /admin_list_media[\s\S]*?is_active_admin\(\)/, "any active staff can read");
assert.match(migration, /can_manage_content\(\)/);
assert.match(migration, /Statements the Supabase MCP connector cannot run[\s\S]*delete from public\.media_assets/, "header names SQL Editor statements");
assert.match(migration, /to_regclass\('storage\.buckets'\) is not null/, "storage touched only where the schema exists");
assert.match(migration, /to_regclass\('storage\.objects'\) is not null/, "object check guarded");
assert.doesNotMatch(migration, /create policy|drop policy/, "existing site-media policies are reused");
assert.doesNotMatch(migration, /taxonomy_admin_audit/, "own audit table, shared taxonomy audit untouched");
assert.doesNotMatch(migration, /^begin;|^commit;/m);
assert.match(migration, /homepage_banners[\s\S]*product_media[\s\S]*brands/, "usage covers banners, products and brands");
// The bucket and folder the browser writes to are allowed by the storage policies.
assert.match(storage, /'site-media',\s*'site-media',\s*true/);
assert.match(storage, /when 'site-media' then\s*coalesce\(\(storage\.foldername\(object_name\)\)\[1\], ''\) ~ '\^\[a-z0-9\]/);
assert.match(storage, /sofievka_content_assets_insert[\s\S]*?'site-media'[\s\S]*?can_manage_content\(\)/);

// API.
for (const rpc of ["admin_list_media", "admin_register_media", "admin_update_media", "admin_delete_media"]) assert.ok(api.includes(`"${rpc}"`), rpc);
assert.match(api, /uploadAsset\(named, \{ productId: "library", kind: "site" \}\)/, "uploads go to site-media/library");
assert.match(api, /removeStorageObject\(uploaded\.bucket, uploaded\.storagePath\)/, "failed registration removes the object");
assert.match(api, /\n    media,\n/, "api.media exported");

// Admin route: real view, stub gone.
assert.match(app, /import \{ createMediaView \} from "\/admin\/admin-media\.mjs"/);
assert.match(app, /path === "\/admin\/media" \? \(\) => createMediaView\(\{ api, signal \}\)/);
assert.match(app, /paths: \[[^\]]*"\/admin\/media"/, "nav entry");
assert.doesNotMatch(app, /13 006 медіазаписів|server-authorized signed flow/, "placeholder removed");

// View.
assert.match(view, /export function openMediaPicker\(/);
assert.match(view, /export async function createMediaView\(/);
assert.match(view, /MEDIA_MAX_BYTES = 5 \* 1024 \* 1024/);
for (const type of ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]) assert.ok(view.includes(`"${type}"`), type);
assert.match(view, /multiple data-media-input/, "multi upload");
assert.match(view, /addEventListener\("drop"/, "drag and drop");
assert.match(view, /navigator\.clipboard\.writeText/, "copy URL");
assert.match(view, /api\.media\.update\(editing\.id/, "alt edit with lock");
assert.match(view, /data-media-delete-dialog/, "delete asks for confirmation");
assert.match(view, /Supabase Storage/, "lead says new uploads live in Storage");
assert.doesNotMatch(view, /innerHTML\s*=\s*`[^`]*\$\{(?!dropZone|icon)/, "no data interpolated into innerHTML");

// Client-side validation, run in isolation.
const snippet = name => {
  const match = view.match(new RegExp(`(?:export )?(?:const ${name} = [\\s\\S]*?;\\n|function ${name}\\([\\s\\S]*?\\n}\\n)`));
  assert.ok(match, `${name} found`);
  return match[0].replace(/^export /, "");
};
const sandbox = {};
vm.runInNewContext(`${["MEDIA_TYPES", "MEDIA_MAX_BYTES", "formatSize", "validateMediaFile"].map(snippet).join("\n")}
  result = { validateMediaFile, formatSize };`, sandbox);
const { validateMediaFile, formatSize } = sandbox.result;
assert.equal(validateMediaFile({ type: "image/webp", size: 1000 }), "");
assert.equal(validateMediaFile({ type: "image/svg+xml", size: 1000 }), "");
assert.match(validateMediaFile({ type: "image/gif", size: 1000 }), /JPG, PNG, WebP або SVG/);
assert.match(validateMediaFile({ type: "image/avif", size: 1000 }), /JPG, PNG, WebP або SVG/);
assert.match(validateMediaFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 }), /більший за 5 МБ/);
assert.equal(validateMediaFile({ type: "image/png", size: 5 * 1024 * 1024 }), "");
assert.match(validateMediaFile({ type: "image/png", size: 0 }), /порожній/);
assert.match(validateMediaFile(null), /Оберіть файл/);
assert.equal(formatSize(2048), "2 КБ");

// Picker wiring.
assert.match(banners, /import \{ openMediaPicker \} from "\/admin\/admin-media\.mjs"/);
assert.match(banners, /data-media-pick="\$\{name\}"/);
assert.match(products, /import \{ openMediaPicker \} from "\/admin\/admin-media\.mjs"/);
assert.match(products, /data-pick-media/);

// Styles and scripts.
assert.match(css, /\.admin-media-grid \{/);
assert.match(css, /\.admin-media-drop\.is-dragover/);
let depth = 0;
for (const character of css) { depth += character === "{" ? 1 : character === "}" ? -1 : 0; assert.ok(depth >= 0, "admin.css braces"); }
assert.equal(depth, 0, "admin.css braces balanced");
assert.equal(pkg.scripts["media:qa"], "node tests/media-qa.mjs");
assert.match(pkg.scripts["db:local:test"], /harness\.mjs media-scenarios\.mjs/);

console.log(JSON.stringify({ status: "ok", suite: "media-qa" }));
