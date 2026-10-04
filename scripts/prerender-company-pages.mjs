// Build-time first paint for the company pages (contact, about, delivery, …). page-shell.js renders every page
// into <div data-page-root> on the client, so the raw HTML of these pages used to be empty for crawlers, link
// previews and visitors without JS. Here page-shell.js runs in a Node `vm` context with a tiny DOM stand-in
// (no browser, so it also runs on Vercel), and the markup it writes into the root is saved into the built page.
//
// The client still renders the page as before and replaces this markup; site-pages.js then applies the texts
// edited in /admin/pages, so admin overrides keep winning. The built-in texts and the default shop settings
// (site-settings.js) are what gets prerendered, the same as the client's first paint today.
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

// Pages page-shell renders without the catalogue. Blog/cases are filled from /admin/blog and account is private,
// so they keep the client-only render.
export const PRERENDER_PAGES = Object.freeze([
  "about", "buyers", "contact", "delivery", "faq", "installation", "partnership", "payment", "privacy",
  "returns", "service-center", "services", "solutions", "terms", "warranty"
]);

const ROOT_PATTERN = /<div data-page-root><\/div>/;

export async function prerenderCompanyPages({ outputDirectory, siteUrl, pages = PRERENDER_PAGES, log = () => {} }) {
  const read = name => fs.readFile(path.join(outputDirectory, name), "utf8");
  const [siteSettings, pageShell] = await Promise.all([read("site-settings.js"), read("page-shell.js")]);
  const brandsData = await read("brands-data.js").catch(() => "");
  const scripts = [["site-settings.js", siteSettings], ["brands-data.js", brandsData], ["page-shell.js", pageShell]];
  const results = [];
  // After writing the root, page-shell binds events on the stand-in DOM and may reject; that is expected here.
  const ignoreRejection = reason => { if (process.env.SOFIEVKA_PRERENDER_DEBUG) console.error("prerender rejection:", reason); };
  process.on("unhandledRejection", ignoreRejection);
  try {
    for (const page of pages) results.push(await prerenderPage(page));
  } finally {
    await new Promise(resolve => setTimeout(resolve, 100));
    process.off("unhandledRejection", ignoreRejection);
  }
  return results;

  async function prerenderPage(page) {
    const file = path.join(outputDirectory, `${page}.html`);
    const html = await fs.readFile(file, "utf8").catch(() => null);
    if (!html || !ROOT_PATTERN.test(html) || !html.includes(`data-page="${page}"`)) return { page, status: "skipped" };
    try {
      const markup = await renderPage({ page, siteUrl, scripts });
      const main = markup.match(/<main\b[^>]*>([\s\S]*)<\/main>/)?.[1] || "";
      if (!/<h1\b/i.test(main)) throw new Error("rendered page has no <h1> in <main>");
      const firstPaint = markup
        // Frames (the Google map on /contact) load only in the client render, which replaces this markup;
        // otherwise the map would load twice.
        .replace(/<iframe\b([^>]*?)\ssrc=/gi, "<iframe$1 data-prerender-src=")
        // The toast container is the last thing the client render appends (tests and scripts wait for it).
        .replace(/<div class="toast" data-page-toast[^>]*><\/div>/, "");
      await fs.writeFile(file, html.replace(ROOT_PATTERN, () => `<div data-page-root data-prerendered>${firstPaint}</div>`), "utf8");
      return { page, status: "ok", bytes: Buffer.byteLength(firstPaint) };
    } catch (error) {
      // A page that cannot be prerendered keeps the client-only render; the build does not fail on it.
      log(`prerender ${page}: ${error.message}`);
      return { page, status: "failed", error: error.message };
    }
  }
}

async function renderPage({ page, siteUrl, scripts }) {
  let captured = null;
  const noop = () => {};
  const element = (tag = "div") => {
    const node = {
      tagName: String(tag).toUpperCase(), dataset: {}, style: {}, children: [], attributes: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      append: noop, appendChild: child => child, prepend: noop, remove: noop, replaceChildren: noop, before: noop, after: noop,
      setAttribute(name, value) { this.attributes[name] = String(value); }, getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; }, hasAttribute(name) { return name in this.attributes; },
      addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
      querySelector: () => null, querySelectorAll: () => [], closest: () => null, matches: () => false,
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      focus: noop, blur: noop, click: noop, scrollIntoView: noop, insertAdjacentHTML: noop,
      textContent: "", innerHTML: "", hidden: false
    };
    return node;
  };
  const root = element("div");
  Object.defineProperty(root, "innerHTML", { get: () => captured || "", set: value => { captured = String(value); } });
  const head = element("head");
  const body = element("body");
  body.dataset.page = page;
  const storage = () => {
    const map = new Map();
    return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), clear: () => map.clear(), key: () => null, get length() { return map.size; } };
  };
  const url = new URL(`/${page}`, siteUrl);
  const document = {
    readyState: "complete", title: "", head, body, documentElement: Object.assign(element("html"), { lang: "uk" }), cookie: "",
    querySelector(selector) {
      if (selector === "[data-page-root]") return root;
      // page-shell's loadScript() treats an existing <script> as loaded once the catalogue UI is present.
      if (/^script\[src/.test(selector)) return element("script");
      return null;
    },
    querySelectorAll: () => [], getElementById: () => null, getElementsByTagName: () => [],
    createElement: element, createTextNode: text => ({ textContent: String(text) }), createDocumentFragment: () => element("fragment"),
    addEventListener: noop, removeEventListener: noop
  };
  const window = {
    document, location: { href: url.href, origin: url.origin, protocol: url.protocol, host: url.host, hostname: url.hostname, pathname: url.pathname, search: "", hash: "", assign: noop, replace: noop, reload: noop },
    history: { state: null, replaceState: noop, pushState: noop, back: noop },
    navigator: { userAgent: "sofievka-prerender", language: "uk-UA", languages: ["uk-UA"] },
    localStorage: storage(), sessionStorage: storage(),
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    fetch: () => Promise.reject(new Error("offline prerender")),
    setTimeout: (callback, delay, ...rest) => setTimeout(() => { try { callback(...rest); } catch {} }, Math.min(Number(delay) || 0, 50)),
    clearTimeout, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, requestIdleCallback: () => 0,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true, scrollTo: noop, scrollY: 0, innerWidth: 1280, innerHeight: 800,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    // The catalogue is not loaded: page-shell renders company pages without it, with the static header/footer links.
    SOFIEVKA_CATALOG_CONFIG: Object.freeze({ source: "local", environment: "prerender", supabase: null }),
    sofievkaCatalogUI: { trackProductImages: noop, megaMenu: () => "" }
  };
  window.window = window;
  window.self = window;
  window.globalThis = window;
  const context = vm.createContext(window);
  const errors = [];
  for (const [name, code] of scripts) {
    if (!code) continue;
    try {
      new vm.Script(code, { filename: name }).runInContext(context, { timeout: 5000 });
    } catch (error) {
      if (name === "page-shell.js") throw error;
      errors.push(`${name}: ${error.message}`);
    }
  }
  // initialize() is async; wait until it has written the root (bindings after that may fail on the stand-in DOM).
  const started = Date.now();
  while (captured === null && Date.now() - started < 3000) await new Promise(resolve => setTimeout(resolve, 5));
  if (captured === null) throw new Error(`page-shell did not render${errors.length ? ` (${errors.join("; ")})` : ""}`);
  return captured;
}
