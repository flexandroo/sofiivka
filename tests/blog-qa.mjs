// Blog and cases v1 static contract: migration shape and grants, admin wiring, storefront wiring
// (rewrites, post.html, sitemap), and the renderer itself on a tiny fake DOM (no HTML from the
// database, safe links and image addresses only).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { postPaths, writeSeoFiles, SITEMAP_EXCLUDED_PAGES } from "../scripts/generate-sitemap.mjs";
import { extractFallbackArticles, extractFallbackCase } from "./site-posts-fallback.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002001600_blog_cases_v1.sql");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const view = read("admin/admin-posts.mjs");
const runtime = read("site-posts.js");
const shell = read("page-shell.js");
const vercel = JSON.parse(read("vercel.json"));

// Database contract.
for (const table of ["site_posts", "site_posts_audit"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
}
assert.match(migration, /unique \(kind, slug\)/, "slug is unique per kind");
assert.match(migration, /check \(kind in \('article', 'case'\)\)/);
assert.match(migration, /check \(status in \('draft', 'published'\)\)/);
for (const fn of ["get_site_posts(text, integer, text, integer)", "get_site_post(text, text)"]) {
  const escaped = fn.replace(/[()]/g, "\\$&");
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to anon, authenticated`));
}
for (const fn of ["admin_list_site_posts()", "admin_get_site_post(uuid)", "admin_create_site_post(jsonb)",
  "admin_update_site_post(uuid, jsonb, timestamptz)", "admin_delete_site_post(uuid, timestamptz)"]) {
  const escaped = fn.replace(/[()]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon`));
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated`));
}
const functions = migration.split(/(?=create or replace function )/).slice(1);
assert.ok(functions.length >= 17);
for (const body of functions) {
  assert.match(body, /set search_path = ''/, `search_path: ${body.slice(0, 80)}`);
  if (/function public\.(get_|admin_)/.test(body)) assert.match(body, /security definer/, `definer: ${body.slice(0, 80)}`);
  const name = /function public\.(\w+)/.exec(body)[1];
  if (name.startsWith("_")) assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(`), `${name} is private`);
}
assert.match(migration, /can_manage_content\(\)/, "owner/admin/content manager edit");
assert.match(migration, /is_active_admin\(\)/, "any staff reads");
assert.match(migration, /errcode = '40001'/, "optimistic lock");
assert.match(migration, /post\.status = 'published' and post\.published_at <= now\(\)/, "public reads published posts only");
assert.match(migration, /admin_delete_site_post contains `delete from public\.site_posts`/, "header lists the delete");
assert.doesNotMatch(migration, /create trigger|drop trigger/i);
assert.doesNotMatch(migration, /taxonomy_admin_audit_entity_type_check|alter table public\.taxonomy_admin_audit/, "own audit table, taxonomy audit untouched");
assert.doesNotMatch(migration, /^begin;|^commit;/m);
for (const card of extractFallbackArticles()) assert.ok(migration.includes(`'${card.title}'`), `seed ${card.title}`);
assert.ok(migration.includes(`'${extractFallbackCase().title}'`), "seed case");

// Admin wiring.
for (const name of ["admin_list_site_posts", "admin_get_site_post", "admin_create_site_post", "admin_update_site_post", "admin_delete_site_post"]) {
  assert.match(api, new RegExp(`"${name}"`));
}
assert.match(api, /expected_updated_at: expectedUpdatedAt \|\| null/);
assert.match(api, /posts,\n/, "api exposes posts");
assert.match(app, /"\/admin\/blog": \{[^}]*roles: \[\.\.\.ROLES\]/);
assert.match(app, /\{ label: "Сайт", paths: \["\/admin\/banners", "\/admin\/pages", "\/admin\/blog"\] \}/);
assert.match(app, /createPostEditorView/);
assert.match(app, /\/\^\\\/admin\\\/blog\\\/\(\[0-9a-f-\]\{36\}\)\$\/i/);
assert.match(view, /«Статті»|Статті/);
assert.match(view, /Кейси/);
for (const type of ["heading", "paragraph", "list", "image", "quote"]) assert.match(view, new RegExp(`${type}: \\{ label:`), `block ${type}`);
assert.doesNotMatch(view, /innerHTML\s*=/, "views render through escaped templates and DOM nodes");
for (const line of view.split("\n").filter(item => item.includes("<"))) {
  assert.doesNotMatch(line, /\$\{(?!escape\()[^}]*\.(title|excerpt|category|slug|alt|caption|text|author|object|location|updatedBy)\}/, `post text in HTML templates is escaped: ${line.trim()}`);
}
assert.match(read("admin/admin-icons.mjs"), /\n  blog: '/);
const adminCss = read("admin/admin.css");
assert.equal((adminCss.match(/\{/g) || []).length, (adminCss.match(/\}/g) || []).length, "admin.css braces balanced");
const pagesCss = read("pages.css");
assert.equal((pagesCss.match(/\{/g) || []).length, (pagesCss.match(/\}/g) || []).length, "pages.css braces balanced");

// Storefront wiring: built-in cards first, then the published posts; one template for posts.
assert.match(shell, /SITE_POST_PAGES = new Set\(\["blog", "portfolio", "post"\]\)/);
assert.match(shell, /site-posts\.js\?v=/);
assert.match(shell, /post: renderPostTemplate/);
const postHtml = read("post.html");
assert.match(postHtml, /data-page="post"/);
assert.match(postHtml, /src="\/page-shell\.js/);
const rewrite = source => vercel.rewrites.find(item => item.source === source)?.destination;
assert.equal(rewrite("/blog/:slug"), "/post.html");
assert.equal(rewrite("/portfolio/:slug"), "/post.html");
assert.equal(rewrite("/post"), "/post.html");
assert.equal(rewrite("/blog"), "/blog.html");
assert.ok(SITEMAP_EXCLUDED_PAGES.has("post"), "the template is not in the sitemap");
assert.match(read("tests/db-local/qa-server.mjs"), /\(blog\|portfolio\)/, "local QA server serves post.html");
assert.match(runtime, /"get_site_posts"/);
assert.match(runtime, /"get_site_post"/);
assert.doesNotMatch(runtime, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/, "posts never render as HTML");

// Sitemap: post URLs from get_site_posts, defensive against odd rows; build never fails on errors.
assert.deepEqual(postPaths([
  { kind: "article", slug: "a-b" }, { kind: "case", slug: "c" }, { kind: "page", slug: "x" },
  { kind: "article", slug: "../evil" }, { kind: "article" }, null
]), ["/blog/a-b", "/portfolio/c"]);
assert.deepEqual(postPaths({ posts: [] }), []);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "blog-qa-"));
const site = path.join(temp, "site");
const out = path.join(temp, "out");
fs.mkdirSync(site);
fs.mkdirSync(out);
fs.writeFileSync(path.join(site, "blog.html"), "<!doctype html><html><head></head></html>");
fs.writeFileSync(path.join(site, "post.html"), "<!doctype html><html><head></head></html>");
fs.writeFileSync(path.join(out, "index.html"), "<!doctype html><html><head></head></html>");
const realFetch = globalThis.fetch;
const calls = [];
try {
  globalThis.fetch = async (url, options) => {
    const name = String(url).split("/rpc/")[1];
    const body = JSON.parse(options.body);
    calls.push(`${name}:${body.post_kind || ""}:${body.page_number || ""}`);
    if (name !== "get_site_posts") return { ok: false, status: 500, json: async () => ({}) };
    const posts = body.post_kind === "article"
      ? [{ kind: "article", slug: `a-${body.page_number}` }]
      : [{ kind: "case", slug: "kotelnia" }];
    return { ok: true, status: 200, json: async () => ({ posts, hasMore: body.post_kind === "article" && body.page_number < 2 }) };
  };
  const result = await writeSeoFiles({
    root: site, outputDirectory: out, env: { SOFIEVKA_SITE_URL: "https://shop.test" }, log: () => {},
    config: { environment: "production", supabase: { url: "https://stub.supabase.co", publishableKey: "sb_publishable_x" } }
  });
  assert.equal(result.posts, 3);
  const sitemap = fs.readFileSync(path.join(out, "sitemap.xml"), "utf8");
  for (const loc of ["/blog", "/blog/a-1", "/blog/a-2", "/portfolio/kotelnia"]) assert.ok(sitemap.includes(`<loc>https://shop.test${loc}</loc>`), `sitemap lists ${loc}`);
  assert.doesNotMatch(sitemap, /\/post</, "template stays out");
  assert.ok(calls.includes("get_site_posts:article:2") && !calls.includes("get_site_posts:article:3"), "pages until hasMore is false");

  globalThis.fetch = async () => { throw new Error("offline"); };
  const offline = await writeSeoFiles({ root: site, outputDirectory: out, env: {}, log: () => {}, config: { environment: "production", supabase: { url: "https://stub.supabase.co", publishableKey: "x" } } });
  assert.equal(offline.posts, 0, "an unreachable database does not fail the build");
} finally {
  globalThis.fetch = realFetch;
  fs.rmSync(temp, { recursive: true, force: true });
}

// Renderer on a fake DOM: escaping, links, images, SEO, case details.
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.className = ""; this.hidden = false; this.dataset = {}; this.map = {}; }
  append(...nodes) { for (const node of nodes) { if (node?.isFragment) this.children.push(...node.children); else this.children.push(typeof node === "string" ? { text: node } : node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  set textContent(value) { this.children = [{ text: String(value) }]; }
  get textContent() { return this.children.map(child => child.text ?? child.textContent).join(""); }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === "hidden") this.hidden = true; }
  getAttribute(name) { return this.attributes[name]; }
  set href(value) { this.attributes.href = value; }
  get href() { return this.attributes.href; }
  querySelector(selector) { return this.map[selector] || null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  html() { return this.children.map(child => child.text !== undefined ? child.text.replace(/</g, "&lt;") : child.outer()).join(""); }
  outer() {
    const attrs = Object.entries(this.attributes).map(([key, value]) => ` ${key}="${value}"`).join("");
    const tag = this.tagName.toLowerCase();
    return `<${tag}${this.className ? ` class="${this.className}"` : ""}${attrs}${this.rel ? ` rel="${this.rel}"` : ""}${this.target ? ` target="${this.target}"` : ""}>${this.html()}</${tag}>`;
  }
}
const meta = { description: new Node("meta"), robots: null };
const canonical = new Node("link");
const context = {
  window: { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
  location: { origin: "https://shop.test", pathname: "/blog/x", search: "" },
  document: {
    title: "",
    head: { append() {} },
    createElement: tag => new Node(tag),
    createDocumentFragment: () => Object.assign(new Node("fragment"), { isFragment: true }),
    querySelector: selector => (selector === 'meta[name="description"]' ? meta.description : selector === 'link[rel="canonical"]' ? canonical : null)
  },
  fetch: () => Promise.reject(new Error("offline")),
  AbortSignal: { timeout: () => undefined },
  URLSearchParams,
  Intl,
  console
};
vm.createContext(context);
vm.runInContext(runtime, context);
const posts = context.window.sofievkaSitePosts;

assert.equal(posts.imageSrc("assets/images/a.webp"), "/assets/images/a.webp");
assert.equal(posts.imageSrc("/assets/a.webp"), "/assets/a.webp");
assert.equal(posts.imageSrc("https://cdn.test/a.webp"), "https://cdn.test/a.webp");
for (const bad of ["javascript:alert(1)", "//evil.test/a.png", "http://x.test/a.png", "data:image/png;base64,AA", "/a b.png", '/a".png']) {
  assert.equal(posts.imageSrc(bad), "", `image ${bad}`);
}
assert.equal(posts.postUrl({ kind: "case", slug: "kotelnia" }), "/portfolio/kotelnia");

const ids = ["[data-post-kicker]", "[data-post-title]", "[data-post-current]", "[data-post-lead]", "[data-post-meta]", "[data-post-cover]",
  "[data-post-body]", "[data-post-facts]", "[data-post-gallery]", "[data-post-more]"];
const nodes = Object.fromEntries(ids.map(id => [id, new Node("div")]));
const moreList = new Node("div");
nodes["[data-post-more]"].map = { "[data-post-more-list]": moreList, h2: new Node("h2") };
const fakeRoot = { querySelector: selector => nodes[selector] || null, querySelectorAll: () => [] };
posts.renderPost(fakeRoot, {
  kind: "case", slug: "kotelnia", title: "<img src=x onerror=alert(1)>", excerpt: "Коротко", category: "Комплексна задача",
  tags: ["Опалення"], publishedAt: "2026-09-30T07:00:00Z", cover: { url: "javascript:alert(1)", alt: "x" },
  body: [
    { type: "heading", text: "<script>alert(1)</script>" },
    { type: "paragraph", text: "Див. [доставку](/delivery.html), [зовнішнє](https://example.com/a) і [погане](javascript:alert(1))." },
    { type: "list", ordered: true, items: ["Один", "[пошта](mailto:a@b.c)"] },
    { type: "image", url: "assets/images/a.webp", alt: "Фото", caption: "<b>Підпис</b>" },
    { type: "image", url: "javascript:alert(1)", alt: "погане" },
    { type: "quote", text: "Цитата", author: "Автор" },
    { type: "html", text: "<b>ignored</b>" }
  ],
  case: { object: "Будинок", location: "Київ", year: 2025, equipment: ["Котел <b>"], photos: [{ url: "https://cdn.test/1.webp", alt: "Котельня" }, { url: "data:image/png;base64,AA" }] },
  seo: { title: "", description: "" },
  more: [{ kind: "case", slug: "other", title: "Інший", excerpt: "", category: "", cover: { url: "" } }, { kind: "bad", slug: "x", title: "x" }]
});
assert.equal(nodes["[data-post-title]"].textContent, "<img src=x onerror=alert(1)>");
assert.equal(nodes["[data-post-current]"].textContent, "<img src=x onerror=alert(1)>");
assert.equal(nodes["[data-post-kicker]"].textContent, "Комплексна задача");
assert.equal(nodes["[data-post-cover]"].hidden, true, "unsafe cover is not shown");
const article = nodes["[data-post-body]"].html();
assert.match(article, /^<h2>&lt;script>alert\(1\)&lt;\/script><\/h2>/);
assert.match(article, /<a href="\/delivery\.html">доставку<\/a>/);
assert.match(article, /<a href="https:\/\/example\.com\/a" rel="noopener noreferrer" target="_blank">зовнішнє<\/a>/);
assert.match(article, /\[погане\]\(javascript:alert\(1\)\)/, "unsafe link stays plain text");
assert.match(article, /<ol><li>Один<\/li><li><a href="mailto:a@b\.c">пошта<\/a><\/li><\/ol>/);
assert.match(article, /<figure class="post-figure"><img src="\/assets\/images\/a\.webp" alt="Фото" loading="lazy"><\/img><figcaption>&lt;b>Підпис&lt;\/b><\/figcaption><\/figure>/);
assert.doesNotMatch(article, /погане"|javascript:alert\(1\)"/, "unsafe image is dropped");
assert.match(article, /<blockquote class="post-quote"><p>Цитата<\/p><cite>Автор<\/cite><\/blockquote>$/);
assert.doesNotMatch(article, /ignored/, "unknown block types are skipped");
const facts = nodes["[data-post-facts]"].html();
assert.match(facts, /<dt>Об'єкт<\/dt><dd>Будинок<\/dd>/);
assert.match(facts, /<dt>Рік<\/dt><dd>2025<\/dd>/);
assert.match(facts, /<li>Котел &lt;b><\/li>/);
const gallery = nodes["[data-post-gallery]"];
assert.equal(gallery.children.length, 1, "unsafe photo is dropped");
assert.equal(moreList.children.length, 1, "unknown kinds are skipped in more");
assert.match(moreList.html(), /href="\/portfolio\/other"/);
assert.equal(context.document.title, "<img src=x onerror=alert(1)> | ТД «Софіївка»", "title falls back to the post title");
assert.equal(meta.description.attributes.content, "Коротко", "description falls back to the excerpt");
assert.equal(canonical.attributes.href, "https://shop.test/portfolio/kotelnia");

// Blog list: cards link to /blog/<slug>; empty list shows the empty state, not the built-in cards.
const grid = new Node("div");
const section = new Node("section");
section.querySelector = () => null;
section.insertBefore = node => section.children.unshift(node);
grid.parentElement = section;
const listRoot = { querySelector: selector => (selector === ".article-grid" ? grid : null) };
posts.renderBlogList(listRoot, { posts: [{ kind: "article", slug: "a", title: "<b>A</b>", excerpt: "E", category: "Підбір", cover: { url: "/assets/a.webp" }, publishedAt: null }], tags: [] });
assert.match(grid.html(), /<article class="article-preview"><img src="\/assets\/a\.webp" alt="" loading="lazy"><\/img><div><span>Підбір<\/span><h2>&lt;b>A&lt;\/b><\/h2><p>E<\/p><a href="\/blog\/a" aria-label="Читати: <b>A<\/b>">Читати →<\/a>/, "title goes into text and an attribute value, never markup");
posts.renderBlogList(listRoot, { posts: [], tags: [] });
assert.equal(grid.hidden, true);
assert.match(section.html(), /Матеріали готуються/);

console.log(JSON.stringify({ status: "ok", suite: "blog-qa" }));
