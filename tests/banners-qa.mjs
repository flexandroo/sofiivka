// Homepage banners v1: static contract between the migration, admin view, API and storefront,
// plus a DOM-free check of the storefront URL guard.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002000900_banners_admin_v1.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const view = read("admin/admin-banners.mjs");
const script = read("script.js");
const index = read("index.html");
const css = read("admin/admin.css");

// Database contract.
assert.match(migration, /alter table public\.homepage_banners enable row level security/);
assert.match(migration, /revoke all on table public\.homepage_banners from public, anon, authenticated/);
assert.match(migration, /revoke all on table public\.homepage_banners_audit from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.get_homepage_banners\(\) to anon, authenticated/);
for (const signature of ["admin_list_banners()", "admin_save_banner(uuid, jsonb, timestamptz)", "admin_delete_banner(uuid, timestamptz)", "admin_reorder_banners(text, uuid[])"]) {
  const escaped = signature.replace(/[()[\]]/g, character => `\\${character}`);
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon;`), `${signature} closed to anon`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`), `${signature} granted to staff`);
}
const functions = [...migration.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\n\$\$;/g)];
assert.ok(functions.length >= 10);
for (const [body, name] of functions) {
  assert.match(body, /set search_path = ''/, `${name}: empty search_path`);
  if (/^(get_|admin_)/.test(name)) assert.match(body, /security definer/, `${name}: security definer`);
  if (/^admin_(save|delete|reorder)/.test(name)) assert.match(body, /_banners_require_editor\(\)/, `${name}: content editors only`);
}
assert.match(migration, /admin_list_banners[\s\S]*?is_active_admin\(\)/, "any active staff can read");
assert.match(migration, /can_manage_content\(\)/);
assert.match(migration, /Statements the Supabase MCP connector cannot run[\s\S]*delete from public\.homepage_banners/, "header names SQL Editor statements");
assert.doesNotMatch(migration, /taxonomy_admin_audit/, "own audit table, shared taxonomy audit untouched");
assert.doesNotMatch(migration, /^begin;|^commit;/m);
// The seeded slides are still on the page; the seeded tiles were replaced on PROD on 2026-11-16.
for (const text of ["Насоси для стабільної роботи системи", "Чиста вода для щоденного використання", "Автоматика, що керує комфортом",
  "assets/images/home-hero-termojet-pumps-v1.jpg"]) {
  assert.ok(migration.includes(text), `seed has ${text}`);
  assert.ok(index.includes(text), `index.html still has ${text}`);
}
assert.ok(migration.includes("MO650MECOSTD"));
// Static banners: five 2:1 slides, two places with a Wilo and an Ecosoft square tile each, every image in the repo.
assert.equal((index.match(/<article class="storefront-slide[ "]/g) || []).length, 5);
assert.equal((index.match(/data-slide-dot="/g) || []).length, 5);
const places = index.split("data-promo-stack>").slice(1).map(place => place.split("</div>")[0]);
assert.equal(places.length, 2);
for (const place of places) {
  const tiles = [...place.matchAll(/<img src="([^"]+)" width="(\d+)" height="(\d+)"/g)];
  assert.equal(tiles.length, 2, "two tiles in each place");
  assert.deepEqual(tiles.map(([, src]) => src.match(/banners\/(wilo|ecosoft)-/)?.[1]).sort(), ["ecosoft", "wilo"], "one per brand");
  for (const [, , width, height] of tiles) assert.equal(width, height, "tiles are square");
}
for (const [, src] of index.matchAll(/src="(assets\/images\/banners\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, src)), `${src} exists`);
assert.match(read("homepage.css"), /\.storefront-showcase \{[^}]*aspect-ratio: 2 \/ 1;/, "the slider keeps the banners' 2:1");

// Admin wiring.
assert.match(app, /import \{ createBannersView \} from "\/admin\/admin-banners\.mjs"/);
assert.match(app, /"\/admin\/banners": \{ title: "Банери головної"/);
assert.match(app, /paths: \[[^\]]*"\/admin\/banners"/, "nav entry");
assert.match(app, /path === "\/admin\/banners" \? \(\) => createBannersView/);
for (const rpc of ["admin_list_banners", "admin_save_banner", "admin_delete_banner", "admin_reorder_banners"]) assert.ok(api.includes(`"${rpc}"`), rpc);
assert.match(api, /kind === "site" \? "site-media"/, "banner uploads go to site-media");
assert.match(api, /\n    banners,\n/, "api.banners exported");
assert.doesNotMatch(view, /innerHTML\s*=/, "views render through escaped templates and DOM nodes");
assert.match(view, /api\.banners\.save\(editing\?\.id \|\| null, payload, editing\?\.updatedAt/);
assert.match(view, /if \(!canEdit\) form\.querySelectorAll/, "read-only roles cannot edit");
assert.match(css, /\.admin-banner-item \{/);

// Storefront: static markup stays as first paint, the renderer never parses HTML.
assert.match(index, /data-slider data-slider-autoplay="true"/);
assert.match(index, /class="storefront-promos"/);
assert.match(script, /rpc\/get_homepage_banners/);
assert.match(script, /slider\.dataset\.sliderReady = "true"/);
const rendererStart = script.indexOf("const HOMEPAGE_BANNERS_CACHE");
assert.ok(rendererStart > 0);
const renderer = script.slice(rendererStart);
assert.doesNotMatch(renderer, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/, "banner text never renders as HTML");
// The text is drawn on the banner images: the site shows the picture, the title only names the link.
assert.doesNotMatch(index, /storefront-slide__content|storefront-promo__copy|storefront-promo__action/, "no text over the static banners");
assert.match(renderer, /link\.setAttribute\("aria-label", banner\.title\)/);
assert.doesNotMatch(renderer, /banner\.(kicker|text|buttonLabel|logoUrl)\b/, "overlay fields stay off the storefront");
assert.match(view, /\.\.\.RETIRED,/, "the editor clears the overlay fields");

// URL guard, run in isolation.
const guardSource = renderer.match(/function bannerSafeUrl[\s\S]*?\n}\n/)[0];
const sandbox = {};
vm.runInNewContext(`${guardSource}; result = bannerSafeUrl;`, sandbox);
const guard = sandbox.result;
assert.equal(guard("assets/images/a.jpg"), "/assets/images/a.jpg");
assert.equal(guard("/search.html?q=Termojet%20насос"), "/search.html?q=Termojet%20насос");
assert.equal(guard("https://cdn.example.com/a.jpg"), "https://cdn.example.com/a.jpg");
for (const bad of ["javascript:alert(1)", "//evil.example/x", "http://example.com/a.jpg", "data:text/html,x", "/a b", "/x\"y", "images/a.jpg", ""]) {
  assert.equal(guard(bad), "", `refuses ${bad}`);
}

console.log(JSON.stringify({ status: "ok", suite: "banners-qa" }));
