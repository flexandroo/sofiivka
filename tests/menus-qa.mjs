// Menus and cookie consent: migration contract, seeds = storefront defaults = first-paint markup,
// admin wiring, and the storefront runtime (site-settings.js) run in a stubbed browser: link
// filtering, menu defaults, and analytics that wait for consent.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------
const migration = read("supabase/migrations/20261002001800_menus_cookies_v1.sql");
assert.match(migration, /check \(key in \('stores', 'checkout', 'social', 'company', 'notifications', 'integrations', 'seo', 'menus', 'cookies'\)\)/);
assert.match(migration, /setting\.key in \('stores', 'checkout', 'social', 'company', 'integrations', 'seo', 'menus', 'cookies'\)/, "notifications stay private");
for (const key of ["company", "stores", "checkout", "social", "notifications", "integrations", "seo", "menus", "cookies"]) {
  assert.match(migration, new RegExp(`target_key = '${key}'`), `_settings_clean keeps the ${key} branch`);
}
assert.match(migration, /create or replace function public\._settings_href/);
assert.match(migration, /revoke all on function public\._settings_href\(jsonb, text, boolean\) from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.get_site_settings\(\) to anon, authenticated/);
assert.match(migration, /on conflict \(key\) do nothing/);
assert.doesNotMatch(migration, /drop trigger|delete from|^begin;|^commit;/im, "safe for the Supabase connector");
// The copied body is the latest one (20261002001300), not the older 0300 definition.
const latest = read("supabase/migrations/20261002001300_seo_integrations_v1.sql");
const body = sql => sql.slice(sql.indexOf("  if target_key = 'company' then"), sql.indexOf("    return jsonb_build_object('pages', result);"));
assert.ok(body(latest).length > 1000 && migration.includes(body(latest)), "_settings_clean body copied verbatim from 1300");

const seed = name => JSON.parse(new RegExp(`\\('${name}', \\$json\\$([\\s\\S]*?)\\$json\\$\\)`).exec(migration)[1]);
// 20261002001900 rewrites the seeded /page.html links to clean addresses (/page); the runtime defaults follow it.
const cleanLinks = value => JSON.parse(JSON.stringify(value).replace(/"(\/[a-z-]+)\.html"/g, '"$1"'));
assert.match(read("supabase/migrations/20261002001900_product_slugs_v1.sql"), /where key in \('menus', 'cookies'\)/);
const seedMenus = cleanLinks(seed("menus"));
const seedCookies = cleanLinks(seed("cookies"));

// ---------------------------------------------------------------------------
// Storefront runtime in a stubbed browser
// ---------------------------------------------------------------------------
class FakeElement {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attributes = {}; this.children = []; this.listeners = {}; this.dataset = {}; this.classList = { add() {}, toggle() {} }; this.textContent = ""; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  remove() { this.removed = true; }
}

function boot({ cache = null, consent = null } = {}) {
  const storage = new Map();
  if (cache) storage.set("sofievka.siteSettings.v1", JSON.stringify(cache));
  if (consent) storage.set("sofievka.cookieConsent.v1", JSON.stringify({ choice: consent }));
  const head = new FakeElement("head");
  const body = new FakeElement("body");
  const documentListeners = {};
  const document = {
    readyState: "complete",
    head, body, title: "",
    createElement: tag => new FakeElement(tag),
    querySelector: selector => (selector === "[data-cookie-consent]" ? body.children.find(node => node.dataset?.cookieConsent !== undefined && !node.removed) || null : null),
    querySelectorAll: () => [],
    addEventListener: (type, listener) => { (documentListeners[type] ||= []).push(listener); }
  };
  const window = {
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    SOFIEVKA_CATALOG_CONFIG: null
  };
  const context = { window, document, location: { pathname: "/payment" }, console, Date, JSON, Object, Array, String, Set, Map, Promise, AbortSignal, Number, RegExp };
  window.window = window;
  vm.createContext(context);
  vm.runInContext(read("site-settings.js"), context, { filename: "site-settings.js" });
  const scripts = () => head.children.filter(node => node.tagName === "SCRIPT").map(node => node.src);
  const banner = () => body.children.find(node => node.dataset?.cookieConsent !== undefined && !node.removed) || null;
  const choose = choice => {
    const target = { closest: selector => (selector === "[data-cookie-choice]" ? { dataset: { cookieChoice: choice } } : null) };
    banner().listeners.click.forEach(listener => listener({ target }));
  };
  return { window, storage, scripts, banner, choose, api: window.sofievkaSiteSettings };
}

// Defaults = seeds; the runtime has no innerHTML and re-checks links from the client-side cache.
const runtime = read("site-settings.js");
assert.doesNotMatch(runtime, /innerHTML|insertAdjacentHTML|document\.write/);
let page = boot();
assert.deepEqual(JSON.parse(JSON.stringify(page.api.defaults.menus)), seedMenus, "site-settings.js defaults equal the migration seed");
assert.deepEqual(JSON.parse(JSON.stringify(page.api.defaults.cookies)), seedCookies);
assert.deepEqual(JSON.parse(JSON.stringify(page.api.current.menus)), seedMenus);
assert.equal(page.scripts().length, 0, "no ids, no tags");
assert.equal(page.banner(), null, "banner off by default");

page = boot({ cache: { menus: {
  header: [
    { label: "Добре", href: "/ok", children: [{ label: "Зло", href: "javascript:alert(1)" }, { label: "Так", href: "https://example.com/x" }] },
    { label: "Погане", href: "//evil.example" }, { label: "", href: "/empty" }, { label: "Схема", href: "data:text/html,x" }
  ],
  footer: [{ title: "Колонка", links: [{ label: "Http", href: "http://insecure.example" }] }, { title: "Друга", links: [{ label: "Так", href: "/yes" }] }]
}, cookies: { enabled: true, text: "Текст", privacyHref: "javascript:x" } } });
assert.deepEqual(JSON.parse(JSON.stringify(page.api.current.menus)), {
  header: [{ label: "Добре", href: "/ok", children: [{ label: "Так", href: "https://example.com/x" }] }],
  footer: [{ title: "Друга", links: [{ label: "Так", href: "/yes" }] }]
}, "unsafe cached links are dropped, columns without links disappear");
assert.equal(page.api.current.cookies.privacyHref, "", "unsafe privacy link dropped");
page = boot({ cache: { menus: { header: [], footer: [] } } });
assert.deepEqual(JSON.parse(JSON.stringify(page.api.current.menus)), { header: [], footer: [] }, "saved empty menus stay empty");

// Consent: banner off -> tags load at once and no consent commands (behaviour before this change).
const ids = { ga4MeasurementId: "G-ABC123DEF4", gtmContainerId: "GTM-K7XQ2P", metaPixelId: "123456789012345", searchConsoleToken: "" };
const consentCommands = window => [...(window.dataLayer || [])].filter(entry => entry && entry[0] === "consent").map(entry => [entry[1], entry[2].analytics_storage]);
page = boot({ cache: { integrations: ids, cookies: { enabled: false, text: "x" } } });
assert.equal(page.scripts().length, 3, "GTM, GA4 and Pixel load when the banner is off");
assert.deepEqual(consentCommands(page.window), []);
assert.equal(page.banner(), null);

// Banner on, no choice yet: defaults denied, nothing loads, the banner shows.
page = boot({ cache: { integrations: ids, cookies: { enabled: true, text: "Згода", privacyHref: "/privacy.html" } } });
assert.equal(page.scripts().length, 0, "nothing loads before consent");
assert.deepEqual(consentCommands(page.window), [["default", "denied"]]);
assert.equal(typeof page.window.fbq, "undefined", "no Pixel before accept");
assert.ok(page.banner(), "banner shown");
// «Лише необхідні»: choice stored, still nothing loaded, banner closed.
page.choose("necessary");
assert.equal(JSON.parse(page.storage.get("sofievka.cookieConsent.v1")).choice, "necessary");
assert.equal(page.scripts().length, 0);
assert.equal(page.banner(), null);
assert.deepEqual(consentCommands(page.window), [["default", "denied"], ["update", "denied"]]);
// Reopened from the footer link and accepted: consent granted, then the tags load.
page.api.openCookieSettings();
assert.ok(page.banner(), "banner reopens");
page.choose("all");
assert.deepEqual(consentCommands(page.window), [["default", "denied"], ["update", "denied"], ["update", "granted"]]);
assert.equal(page.scripts().length, 3, "tags load after accept");
assert.ok(page.window.fbq.queue.some(entry => entry[0] === "consent" && entry[1] === "grant"), "Pixel told consent is granted");
const gtmIndex = page.window.dataLayer.findIndex(entry => entry && entry.event === "gtm.js");
const grantIndex = page.window.dataLayer.findIndex(entry => entry && entry[0] === "consent" && entry[1] === "update" && entry[2].analytics_storage === "granted");
assert.ok(grantIndex >= 0 && grantIndex < gtmIndex, "consent update reaches the dataLayer before gtm.js starts");

// A returning visitor who accepted: default denied, update granted, then the tags, without a banner.
page = boot({ cache: { integrations: ids, cookies: { enabled: true, text: "Згода" } }, consent: "all" });
assert.deepEqual(consentCommands(page.window), [["default", "denied"], ["update", "granted"]]);
assert.equal(page.scripts().length, 3);
assert.equal(page.banner(), null);

// Pixel only, banner on: Pixel waits for accept even without Google tags.
page = boot({ cache: { integrations: { metaPixelId: "123456789012345" }, cookies: { enabled: true, text: "Згода" } } });
assert.equal(page.scripts().length, 0);
page.choose("all");
assert.deepEqual(page.scripts(), ["https://connect.facebook.net/en_US/fbevents.js"]);

// ---------------------------------------------------------------------------
// First-paint markup equals the defaults (no visible swap when the saved menus are the seed)
// ---------------------------------------------------------------------------
const links = markup => [...markup.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(match => ({ href: match[1], label: match[2] }));
const shell = read("page-shell.js");
// Inner pages use the homepage's accordion columns (final audit AUD-044); footerSection() builds each one.
const footerMenu = shell.slice(shell.indexOf('<div class="footer__menu" data-site-footer-menu="accordion">'), shell.indexOf("</div>${footerContactsMarkup()}"));
assert.ok(footerMenu.length > 100, "page-shell footer menu hook");
const shellColumns = [...footerMenu.matchAll(/footerSection\("([^"]+)", `([^`]*)`\)/g)];
assert.deepEqual(shellColumns.flatMap(match => links(match[2])), seedMenus.footer.flatMap(column => column.links));
assert.deepEqual(shellColumns.map(match => match[1]), seedMenus.footer.map(column => column.title));
assert.match(shell, /<div class="container \$\{className\}__inner" data-site-header-menu>/);
const navCalls = [...shell.matchAll(/siteNavLink\("([^"]+)", "([^"]+)"/g)].map(match => ({ label: match[2], href: match[1], children: [] }));
assert.deepEqual(navCalls, seedMenus.header, "page-shell built-in nav equals the header seed");
assert.match(shell, /window\.sofievkaSiteSettings\?\.applyHooks\(root\)/, "page-shell hands the rendered shell to the hooks");

const home = read("index.html");
const homeMenu = home.slice(home.indexOf('<div class="footer__menu" data-site-footer-menu="accordion">'), home.indexOf("\n      <div class=\"footer__section is-open\" data-footer-section>"));
assert.ok(homeMenu.length > 100, "homepage footer menu hook");
assert.deepEqual(links(homeMenu), seedMenus.footer.flatMap(column => column.links));
assert.deepEqual([...homeMenu.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]), seedMenus.footer.map(column => column.title));
assert.equal((homeMenu.match(/data-footer-section/g) || []).length, seedMenus.footer.length);
// The build injects the settings runtime only into pages that do not mention it yet.
for (const file of fs.readdirSync(root).filter(name => name.endsWith(".html"))) {
  assert.doesNotMatch(read(file), /site-settings\.js/, `${file} must not mention site-settings.js (the build would skip injecting it)`);
}
const script = read("script.js");
assert.match(script, /event\.target\.closest\("\.footer__toggle"\)/, "footer accordion is delegated (columns are re-rendered)");

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const app = read("admin/admin.mjs");
assert.match(app, /"\/admin\/menus": \{ title: "Меню сайту", section: "menus", icon: "menu", roles: \["owner", "admin"\] \}/);
assert.match(app, /\{ label: "Сайт", paths: \[[^\]]*"\/admin\/menus"[^\]]*\] \}/);
assert.match(app, /path === "\/admin\/menus" \? \(\) => createMenusView\(\{ api, signal \}\)/);
const menusView = read("admin/admin-menus.mjs");
assert.doesNotMatch(menusView, /innerHTML\s*=/);
assert.match(menusView, /api\.settings\.update\("menus", readMenus\(form\), updatedAt \|\| null\)/);
assert.match(menusView, /header: 10, children: 10, columns: 3, links: 12/, "limits match the SQL validator");
assert.ok(menusView.includes(String(/^(https:\/\/[^/\s<>"'\\]+(\/[^\s<>"'\\]*)?|\/([^/\s<>"'\\][^\s<>"'\\]*)?)$/i)), "admin link rule = storefront rule");
assert.ok(runtime.includes(String(/^(https:\/\/[^/\s<>"'\\]+(\/[^\s<>"'\\]*)?|\/([^/\s<>"'\\][^\s<>"'\\]*)?)$/i)), "storefront link rule");
const settingsView = read("admin/admin-settings.mjs");
assert.match(settingsView, /data-settings-form="cookies"/);
assert.match(settingsView, /cookies: form => \(\{/);
assert.match(settingsView, /sections\?\.cookies \? cookiesForm/);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
for (const file of ["styles.css", "pages.css", "homepage.css", "admin/admin.css"]) {
  const css = read(file);
  assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, `${file} braces balanced`);
}
const styles = read("styles.css");
assert.match(styles, /\.footer__menu \{\s*display: contents;/);
assert.match(styles, /\.cookie-consent \{\s*position: fixed;/, "banner overlays the page (no layout shift)");
assert.match(styles, /\.site-nav__group:focus-within \.site-nav__sub/, "submenu opens for keyboard users");
assert.match(read("admin/admin.css"), /\.admin-menu-row \{/);
assert.match(read("scripts/build-static-site.mjs"), /site-settings\.js\?v=20261002-stage4-1/);

console.log(JSON.stringify({ status: "ok", suite: "menus-qa" }));
