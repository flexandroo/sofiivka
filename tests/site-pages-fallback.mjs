// Reads the built-in (fallback) texts of the information pages straight from page-shell.js, in the
// block format the site_pages table stores. pages-scenarios compares the migration seed with it,
// so the seed cannot drift from what the storefront renders without the database.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// slug -> renderer in page-shell.js; hasBody: the page has a free-text article (.prose) admins edit.
export const PAGE_SOURCES = Object.freeze([
  { slug: "about", renderer: "renderAboutExtended", hasBody: true },
  { slug: "services", renderer: "renderServicesExtended", hasBody: false },
  { slug: "installation", renderer: "renderInstallationExtended", hasBody: false },
  { slug: "service-center", renderer: "renderServiceCenterExtended", hasBody: true },
  { slug: "solutions", renderer: "renderSolutionsExtended", hasBody: false },
  { slug: "partnership", renderer: "renderPartnershipExtended", hasBody: true },
  { slug: "buyers", renderer: "renderBuyersExtended", hasBody: false },
  { slug: "delivery", renderer: "renderDeliveryExtended", hasBody: true },
  { slug: "payment", renderer: "renderPaymentExtended", hasBody: true },
  { slug: "warranty", renderer: "renderWarrantyExtended", hasBody: true },
  { slug: "returns", renderer: "renderReturnsExtended", hasBody: true },
  { slug: "faq", renderer: "renderFaqExtended", hasBody: false },
  { slug: "privacy", renderer: "privacyContent", legalTitle: "Політика конфіденційності", hasBody: true },
  { slug: "terms", renderer: "termsContent", legalTitle: "Умови користування", hasBody: true }
]);

const decode = value => String(value)
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`page-shell.js: ${name} not found`);
  const end = source.indexOf("\n  function ", start + 10);
  return source.slice(start, end < 0 ? undefined : end);
}

// <h2>, <p>, <ul>/<ol> with <li> (links inside become [text](url)) -> blocks.
export function htmlToBlocks(html) {
  const blocks = [];
  let current = null;
  let item = null;
  let link = null;
  const append = text => {
    if (link) link.text += text;
    else if (item !== null) item += text;
    else if (current && current.type !== "list") current.text += text;
  };
  for (const match of html.matchAll(/<(\/?)(h2|p|ul|ol|li|a)\b([^>]*)>|([^<]+)/g)) {
    const [, closing, tag, attributes, text] = match;
    if (text !== undefined) { append(decode(text)); continue; }
    if (tag === "h2" || tag === "p") {
      if (!closing) current = { type: tag === "h2" ? "heading" : "paragraph", text: "" };
      else { blocks.push({ type: current.type, text: current.text.trim() }); current = null; }
    } else if (tag === "ul" || tag === "ol") {
      if (!closing) current = { type: "list", ordered: tag === "ol", items: [] };
      else { blocks.push(current); current = null; }
    } else if (tag === "li") {
      if (!closing) item = "";
      else { current.items.push(item.trim()); item = null; }
    } else if (tag === "a") {
      if (!closing) link = { href: decode(/href="([^"]*)"/.exec(attributes)?.[1] || ""), text: "" };
      else { const done = link; link = null; append(`[${done.text}](${done.href})`); }
    }
  }
  return blocks;
}

const STRING = '"((?:[^"\\\\]|\\\\.)*)"';

export function extractFallbackPages(source = fs.readFileSync(path.join(root, "page-shell.js"), "utf8")) {
  const legal = functionBody(source, "renderLegal");
  const [, legalKicker, legalLead] = new RegExp(`hero\\(${STRING}, title, ${STRING}`).exec(legal);
  return PAGE_SOURCES.map(page => {
    const body = functionBody(source, page.renderer);
    let kicker, title, lead, prose = "";
    if (page.legalTitle) {
      [kicker, title, lead] = [legalKicker, page.legalTitle, legalLead];
      prose = /return `([\s\S]*?)`;/.exec(body)[1];
    } else {
      [, kicker, title, lead] = new RegExp(`hero\\(${STRING}, ${STRING}, ${STRING}`).exec(body);
      prose = /<article class="prose">([\s\S]*?)<\/article>/.exec(body)?.[1] || "";
    }
    return { slug: page.slug, hasBody: page.hasBody, kicker, title, lead, body: page.hasBody ? htmlToBlocks(prose) : [] };
  });
}

// The nine questions of the FAQ page, in order.
export function extractFallbackFaq(source = fs.readFileSync(path.join(root, "page-shell.js"), "utf8")) {
  const body = functionBody(source, "renderFaqExtended");
  const groups = /const groups = (\[[\s\S]*?\n    \]);/.exec(body)[1];
  return JSON.parse(groups).flatMap(([group, items]) => items.map(([question, answer]) => ({ group, question, answer })));
}

export function extractStaticSeo(slug) {
  const html = fs.readFileSync(path.join(root, `${slug}.html`), "utf8");
  return {
    title: decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] || ""),
    description: decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] || "")
  };
}
