// Site pages v1 static contract: migration shape and grants, admin wiring, storefront renderer
// (no HTML from the database, safe links only), and the renderer itself on a tiny fake DOM.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { PAGE_SOURCES } from "./site-pages-fallback.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002001400_site_pages_v1.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const view = read("admin/admin-pages.mjs");
const runtime = read("site-pages.js");
const shell = read("page-shell.js");

// Database contract.
for (const table of ["site_pages", "site_faq_items", "site_faq_state", "site_pages_audit"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
}
for (const fn of ["get_site_page(text)", "get_site_faq()"]) {
  const escaped = fn.replace(/[()]/g, "\\$&");
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to anon, authenticated`));
}
for (const fn of ["admin_list_site_pages()", "admin_get_site_page(text)", "admin_save_site_page(text, jsonb, timestamptz)", "admin_save_site_faq(jsonb, timestamptz)"]) {
  const escaped = fn.replace(/[()]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon`));
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated`));
}
const functions = migration.split(/(?=create or replace function )/).slice(1);
assert.ok(functions.length >= 15);
for (const body of functions) {
  assert.match(body, /set search_path = ''/, `search_path: ${body.slice(0, 80)}`);
  if (/function public\.(get_|admin_)/.test(body)) assert.match(body, /security definer/, `definer: ${body.slice(0, 80)}`);
}
assert.match(migration, /can_manage_content\(\)/, "owner/admin/content manager edit");
assert.match(migration, /is_active_admin\(\)/, "any staff reads");
assert.match(migration, /errcode = '40001'/, "optimistic lock");
assert.match(migration, /admin_save_site_faq contains `delete from public\.site_faq_items`/, "header lists the delete");
assert.doesNotMatch(migration, /create trigger|drop trigger/i);
assert.doesNotMatch(migration, /^begin;|^commit;/m);
for (const page of PAGE_SOURCES) assert.match(migration, new RegExp(`\\('${page.slug}', `), `seed ${page.slug}`);

// Admin wiring.
assert.match(api, /"admin_list_site_pages"/);
assert.match(api, /"admin_save_site_page"/);
assert.match(api, /"admin_save_site_faq"/);
assert.match(app, /"\/admin\/pages": \{[^}]*roles: \[\.\.\.ROLES\]/);
assert.match(app, /\{ label: "Сайт", paths: \["\/admin\/pages"\] \}/);
assert.match(app, /createPageEditorView/);
assert.doesNotMatch(view, /innerHTML\s*=/, "views render through escaped templates and DOM nodes");
assert.doesNotMatch(view, /\$\{(?!escape\()[^}]*\.(title|lead|kicker|question|answer|text)\}/, "page text in templates is escaped");

// Storefront wiring: built-in render first, then the saved copy.
assert.match(shell, /SITE_PAGE_SLUGS = new Set\(\[/);
assert.match(shell, /site-pages\.js\?v=/);
for (const page of PAGE_SOURCES) assert.match(shell, new RegExp(`"${page.slug}"`));
assert.match(runtime, /rpc\/\$\{name\}/);
assert.match(runtime, /"get_site_page"/);
assert.match(runtime, /"get_site_faq"/);
assert.doesNotMatch(runtime, /innerHTML|insertAdjacentHTML|outerHTML/, "page texts never render as HTML");

// Renderer on a fake DOM: escaping, links, SEO.
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.className = ""; this._text = ""; }
  append(...nodes) { for (const node of nodes) { if (node?.isFragment) this.children.push(...node.children); else this.children.push(typeof node === "string" ? { text: node } : node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  set textContent(value) { this.children = [{ text: String(value) }]; }
  get textContent() { return this.children.map(child => child.text ?? child.textContent).join(""); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  set href(value) { this.attributes.href = value; }
  get href() { return this.attributes.href; }
  html() { return this.children.map(child => child.text !== undefined ? child.text.replace(/</g, "&lt;") : child.outer()).join(""); }
  outer() { const attrs = Object.entries(this.attributes).map(([key, value]) => ` ${key}="${value}"`).join(""); return `<${this.tagName.toLowerCase()}${attrs}${this.rel ? ` rel="${this.rel}"` : ""}${this.target ? ` target="${this.target}"` : ""}>${this.html()}</${this.tagName.toLowerCase()}>`; }
}
const nodes = {};
const fakeRoot = { querySelector: selector => nodes[selector] || null };
const hero = { querySelector: selector => ({ ".page-kicker": nodes.kicker, h1: nodes.h1, ".page-hero__lead": nodes.lead, '.page-breadcrumbs [aria-current="page"]': nodes.crumb })[selector] };
Object.assign(nodes, { kicker: new Node("p"), h1: new Node("h1"), lead: new Node("p"), crumb: new Node("span"), ".page-hero": hero, "main article.prose": new Node("article"), ".faq-groups": new Node("div") });
const meta = new Node("meta");
const context = {
  window: { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
  document: {
    title: "",
    body: { dataset: {} },
    head: { append() {} },
    createElement: tag => new Node(tag),
    createDocumentFragment: () => Object.assign(new Node("fragment"), { isFragment: true }),
    querySelector: selector => (selector === 'meta[name="description"]' ? meta : null)
  },
  fetch: () => Promise.reject(new Error("offline")),
  AbortSignal: { timeout: () => undefined },
  console
};
vm.createContext(context);
vm.runInContext(runtime, context);
const pages = context.window.sofievkaSitePages;
pages.renderPage(fakeRoot, {
  kicker: "Кікер", title: "<img src=x onerror=alert(1)>", lead: "Вступ",
  body: [
    { type: "heading", text: "<script>alert(1)</script>" },
    { type: "paragraph", text: "Див. [доставку](/delivery.html), [зовнішнє](https://example.com/a) і [погане](javascript:alert(1)) та [//evil](//evil.example)." },
    { type: "list", ordered: true, items: ["Один", "[пошта](mailto:a@b.c)"] },
    { type: "html", text: "<b>ignored</b>" }
  ],
  seo: { title: "SEO заголовок", description: "SEO опис" }
});
assert.equal(nodes.h1.textContent, "<img src=x onerror=alert(1)>");
assert.equal(nodes.crumb.textContent, "<img src=x onerror=alert(1)>");
const article = nodes["main article.prose"].html();
assert.match(article, /^<h2>&lt;script>alert\(1\)&lt;\/script><\/h2>/);
assert.match(article, /<a href="\/delivery\.html">доставку<\/a>/);
assert.match(article, /<a href="https:\/\/example\.com\/a" rel="noopener noreferrer" target="_blank">зовнішнє<\/a>/);
assert.match(article, /\[погане\]\(javascript:alert\(1\)\)/, "unsafe link stays plain text");
assert.match(article, /\[\/\/evil\]\(\/\/evil\.example\)/, "protocol-relative link stays plain text");
assert.match(article, /<ol><li>Один<\/li><li><a href="mailto:a@b\.c">пошта<\/a><\/li><\/ol>$/);
assert.doesNotMatch(article, /ignored/, "unknown block types are skipped");
assert.equal(context.document.title, "SEO заголовок");
assert.equal(meta.attributes.content, "SEO опис");

// Empty body keeps the built-in article.
nodes["main article.prose"].replaceChildren("built-in");
pages.renderPage(fakeRoot, { title: "Т", body: [] });
assert.equal(nodes["main article.prose"].textContent, "built-in");

pages.renderFaq(fakeRoot, [
  { group: "Підбір", question: "<b>Q1</b>", answer: "A1 [тут](/contact.html)" },
  { group: "Доставка", question: "Q2", answer: "A2" },
  { group: "Підбір", question: "Q3", answer: "A3" }
]);
const faq = nodes[".faq-groups"].html();
assert.match(faq, /^<section><h2>Підбір<\/h2><div><details><summary>&lt;b>Q1&lt;\/b><\/summary><p>A1 <a href="\/contact\.html">тут<\/a><\/p><\/details><details><summary>Q3/);
assert.match(faq, /<section><h2>Доставка<\/h2>/);

console.log(JSON.stringify({ status: "ok", suite: "pages-qa" }));
