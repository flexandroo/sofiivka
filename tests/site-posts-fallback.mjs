// Reads the built-in (fallback) cards of blog.html and portfolio.html straight from page-shell.js.
// blog-scenarios compares the site_posts seed with them, so the seed cannot drift from what the
// storefront shows without the database.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`page-shell.js: ${name} not found`);
  const end = source.indexOf("\n  function ", start + 10);
  return source.slice(start, end < 0 ? undefined : end);
}

const decode = value => String(value)
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

// The six article cards of the blog page, in order: { category, title, excerpt, cover }.
export function extractFallbackArticles(source = fs.readFileSync(path.join(root, "page-shell.js"), "utf8")) {
  const body = functionBody(source, "renderBlogExtended");
  const cards = /const cards = (\[[\s\S]*?\]\]);/.exec(body)[1];
  return JSON.parse(cards).map(([category, title, excerpt, cover]) => ({ category, title, excerpt, cover }));
}

// The large case card of the portfolio page: { category, title, excerpt, cover, coverAlt }, or null when the
// page has no built-in case (it lists the company's own objects and leaves the case slot to the database).
export function extractFallbackCase(source = fs.readFileSync(path.join(root, "page-shell.js"), "utf8")) {
  const body = functionBody(source, "renderPortfolioExtended");
  const match =
    /<article class="portfolio-lead"><img src="([^"]+)" alt="([^"]*)"><div><p class="page-kicker">([^<]+)<\/p><h2>([^<]+)<\/h2><p>([^<]+)<\/p>/.exec(body);
  if (!match) return null;
  const [, cover, coverAlt, category, title, excerpt] = match;
  return { category: decode(category), title: decode(title), excerpt: decode(excerpt), cover, coverAlt: decode(coverAlt) };
}
