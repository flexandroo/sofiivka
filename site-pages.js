/* Texts of the information pages, edited in /admin/pages and served by the public RPCs
 * get_site_page / get_site_faq. page-shell.js renders its built-in copy first (and keeps it when
 * the database is unreachable or the page is switched to built-in text); this script then replaces
 * the text parts: first screen, the article (.prose), the FAQ list, <title> and meta description.
 * Content is structured blocks, never HTML: every string goes through textContent, and
 * [label](url) links become <a> only for site paths, https, mailto and tel. */
(function () {
  "use strict";

  const CACHE_PREFIX = "sofievka.sitePage.v1.";
  const LINK = /\[([^\]]+)\]\(([^)\s]*)\)/g;
  // Same rule as public._site_pages_check_links: no javascript:, no protocol-relative //host.
  const SAFE_URL = /^(https:\/\/[^\s<>"\\]+|\/([^/\s<>"\\][^\s<>"\\]*)?|mailto:[^\s<>"\\]+|tel:\+?[0-9-]+)$/;
  const requests = new Map();

  function read(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
  function write(key, value) { try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* private mode */ } }

  async function rpc(name, body) {
    const config = window.SOFIEVKA_CATALOG_CONFIG?.supabase;
    if (!config?.url || !config?.publishableKey) return undefined;
    try {
      const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return undefined;
      return await response.json();
    } catch { return undefined; }
  }

  // { page, faq } where undefined means "unknown, keep what is shown" and null means "use built-in text".
  function load(slug) {
    if (!requests.has(slug)) {
      requests.set(slug, Promise.all([
        rpc("get_site_page", { page_slug: slug }),
        slug === "faq" ? rpc("get_site_faq") : Promise.resolve(undefined)
      ]).then(([page, faq]) => ({ page, faq })));
    }
    return requests.get(slug);
  }

  const isPage = value => Boolean(value) && typeof value === "object" && typeof value.title === "string";
  const text = value => (typeof value === "string" ? value : "");

  // Text with [label](url) links, as DOM nodes.
  function inline(value) {
    const fragment = document.createDocumentFragment();
    const source = text(value);
    let last = 0;
    for (const match of source.matchAll(LINK)) {
      const [whole, label, url] = match;
      if (!SAFE_URL.test(url)) continue;
      if (match.index > last) fragment.append(source.slice(last, match.index));
      const link = document.createElement("a");
      link.href = url;
      link.textContent = label;
      if (/^https:/i.test(url)) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
      fragment.append(link);
      last = match.index + whole.length;
    }
    if (last < source.length) fragment.append(source.slice(last));
    return fragment;
  }

  function blockNode(block) {
    if (!block || typeof block !== "object") return null;
    if (block.type === "heading") {
      const node = document.createElement("h2");
      node.textContent = text(block.text);
      return node;
    }
    if (block.type === "paragraph") {
      const node = document.createElement("p");
      node.append(inline(block.text));
      return node;
    }
    if (block.type === "list" && Array.isArray(block.items)) {
      const node = document.createElement(block.ordered ? "ol" : "ul");
      block.items.forEach(item => {
        const entry = document.createElement("li");
        entry.append(inline(item));
        node.append(entry);
      });
      return node;
    }
    return null;
  }

  function setText(node, value) { if (node && value) node.textContent = value; }

  function renderPage(root, page) {
    if (!isPage(page)) return;
    const hero = root.querySelector(".page-hero");
    if (hero) {
      if (typeof page.kicker === "string") setText(hero.querySelector(".page-kicker"), page.kicker || "\u00a0");
      setText(hero.querySelector("h1"), page.title);
      setText(hero.querySelector('.page-breadcrumbs [aria-current="page"]'), page.title);
      if (typeof page.lead === "string") { const lead = hero.querySelector(".page-hero__lead"); if (lead) lead.textContent = page.lead; }
    }
    // An empty body keeps the built-in article rather than leaving a blank column.
    const blocks = Array.isArray(page.body) ? page.body.map(blockNode).filter(Boolean) : [];
    const article = root.querySelector("main article.prose");
    if (article && blocks.length) article.replaceChildren(...blocks);
    const seo = page.seo && typeof page.seo === "object" ? page.seo : {};
    if (text(seo.title)) document.title = seo.title;
    if (text(seo.description)) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.append(meta); }
      meta.setAttribute("content", seo.description);
    }
  }

  function renderFaq(root, items) {
    const container = root.querySelector(".faq-groups");
    if (!container || !Array.isArray(items)) return;
    const groups = new Map();
    items.forEach(item => {
      if (!item || !text(item.question)) return;
      const name = text(item.group) || "Інше";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    });
    if (!groups.size) {
      const empty = document.createElement("p");
      empty.textContent = "Запитань поки немає. Зателефонуйте або напишіть нам — відповімо.";
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...[...groups].map(([name, entries]) => {
      const section = document.createElement("section");
      const heading = document.createElement("h2");
      heading.textContent = name;
      const list = document.createElement("div");
      list.className = "faq-list";
      entries.forEach(item => {
        const details = document.createElement("details");
        details.className = "faq-item";
        const summary = document.createElement("summary");
        summary.textContent = item.question;
        const answer = document.createElement("p");
        answer.append(inline(item.answer));
        details.append(summary, answer);
        list.append(details);
      });
      section.append(heading, list);
      return section;
    }));
  }

  function render(slug, root, data) {
    if (isPage(data.page)) renderPage(root, data.page);
    if (slug === "faq" && Array.isArray(data.faq)) renderFaq(root, data.faq);
  }

  // Cached copy first (same task as page-shell's render, so no flash), then the fresh one.
  async function apply(slug, root = document) {
    const key = CACHE_PREFIX + slug;
    let cached = null;
    try { cached = JSON.parse(read(key) || "null"); } catch { cached = null; }
    if (cached) render(slug, root, cached);
    const fresh = await load(slug);
    if (fresh.page === undefined && fresh.faq === undefined) return;
    const next = { page: fresh.page === undefined ? cached?.page ?? null : fresh.page, faq: fresh.faq === undefined ? cached?.faq ?? null : fresh.faq };
    const serialized = JSON.stringify(next);
    if (serialized === JSON.stringify(cached)) return;
    write(key, next.page === null && next.faq === null ? null : serialized);
    render(slug, root, next);
  }

  window.sofievkaSitePages = Object.freeze({ apply, load, renderPage, renderFaq });
  const current = document.body?.dataset.page;
  if (current) load(current);
})();
