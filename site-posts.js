/* Blog articles and cases, edited in /admin/blog and served by the public RPCs get_site_posts /
 * get_site_post. blog.html and portfolio.html render their built-in cards first (and keep them when
 * the database is unreachable); this script then shows the published posts with links to
 * /blog/<slug> and /portfolio/<slug>, which post.html renders.
 * Content is structured blocks, never HTML: every string goes through textContent, [label](url)
 * links become <a> only for site paths, https, mailto and tel, and images only load from https or
 * site paths. */
(function () {
  "use strict";

  const CACHE_PREFIX = "sofievka.sitePosts.v1.";
  const LINK = /\[([^\]]+)\]\(([^)\s]*)\)/g;
  // Same rule as public._site_pages_check_links: no javascript:, no protocol-relative //host.
  const SAFE_URL = /^(https:\/\/[^\s<>"\\]+|\/([^/\s<>"\\][^\s<>"\\]*)?|mailto:[^\s<>"\\]+|tel:\+?[0-9-]+)$/;
  const KINDS = Object.freeze({
    article: { base: "/blog", page: "blog", listTitle: "Корисно знати", kicker: "Корисно знати", read: "Читати", more: "Інші матеріали", empty: "Матеріали готуються до публікації. Поставте запитання — відповімо особисто." },
    case: { base: "/portfolio", page: "portfolio", listTitle: "Інженерні задачі", kicker: "Реалізований об'єкт", read: "Детальніше про об'єкт", more: "Інші об'єкти", empty: "Готуємо перші підтверджені кейси: фото й результати з'являться після дозволу замовників." }
  });
  const PAGE_KIND = Object.freeze({ blog: "article", portfolio: "case" });

  function read(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
  function write(key, value) { try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* private mode */ } }
  function readCache(key) { try { return JSON.parse(read(CACHE_PREFIX + key) || "null"); } catch { return null; } }

  // undefined: database not configured or unreachable (keep what is shown); null: nothing published there.
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

  const text = value => (typeof value === "string" ? value : "");
  const isPost = value => Boolean(value) && typeof value === "object" && typeof value.title === "string" && typeof value.slug === "string" && Boolean(KINDS[value.kind]);

  // https:// or a site path; assets/… is stored without the leading slash (as in banners).
  function imageSrc(url) {
    const value = text(url).trim();
    if (/^https:\/\/[^\s<>"\\]+$/i.test(value)) return value;
    if (/^\/[^/\\\s<>"][^\s<>"\\]*$/.test(value)) return value;
    if (/^assets\/[^\s<>"\\]+$/.test(value)) return `/${value}`;
    return "";
  }

  function postUrl(post) {
    return `${KINDS[post.kind].base}/${encodeURIComponent(post.slug)}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.valueOf())) return "";
    try { return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(date); } catch { return ""; }
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = content;
    return node;
  }

  function image(url, alt, className) {
    const src = imageSrc(url);
    if (!src) return null;
    const node = document.createElement("img");
    if (className) node.className = className;
    node.setAttribute("src", src);
    node.setAttribute("alt", text(alt));
    node.setAttribute("loading", "lazy");
    return node;
  }

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
    if (block.type === "heading") return element("h2", "", text(block.text));
    if (block.type === "paragraph") {
      const node = element("p");
      node.append(inline(block.text));
      return node;
    }
    if (block.type === "list" && Array.isArray(block.items)) {
      const node = element(block.ordered ? "ol" : "ul");
      block.items.forEach(item => {
        const entry = element("li");
        entry.append(inline(item));
        node.append(entry);
      });
      return node;
    }
    if (block.type === "image") {
      const picture = image(block.url, block.alt);
      if (!picture) return null;
      const figure = element("figure", "post-figure");
      figure.append(picture);
      if (text(block.caption)) figure.append(element("figcaption", "", block.caption));
      return figure;
    }
    if (block.type === "quote" && text(block.text)) {
      const quote = element("blockquote", "post-quote");
      quote.append(element("p", "", block.text));
      if (text(block.author)) quote.append(element("cite", "", block.author));
      return quote;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Cards (blog list, portfolio list, "more" on a post)
  // ---------------------------------------------------------------------------
  function postCard(post) {
    const card = element("article", "article-preview");
    const cover = image(post.cover?.url, "", "");
    if (cover) card.append(cover);
    const body = element("div");
    const label = [text(post.category), formatDate(post.publishedAt)].filter(Boolean).join(" · ");
    body.append(element("span", "", label));
    body.append(element("h2", "", post.title));
    if (text(post.excerpt)) body.append(element("p", "", post.excerpt));
    const facts = post.kind === "case" ? caseFacts(post.case).map(([, value]) => value).join(" · ") : "";
    if (facts) body.append(element("p", "post-card__facts", facts));
    const more = element("a", "", `${KINDS[post.kind].read} →`);
    more.href = postUrl(post);
    more.setAttribute("aria-label", `${KINDS[post.kind].read}: ${post.title}`);
    body.append(more);
    card.append(body);
    return card;
  }

  function caseFacts(details) {
    if (!details || typeof details !== "object") return [];
    return [["Об'єкт", text(details.object)], ["Місце", text(details.location)], ["Рік", details.year ? String(details.year) : ""]]
      .filter(([, value]) => value);
  }

  function emptyState(kind) {
    const wrap = element("div", "container post-empty");
    const box = element("div", "empty-state");
    wrap.append(box);
    box.append(element("h2", "", kind === "case" ? "Кейси готуються" : "Матеріали готуються"));
    box.append(element("p", "", KINDS[kind].empty));
    const link = element("a", "button button--secondary", "Поставити запитання");
    link.href = "/contact.html";
    box.append(link);
    return wrap;
  }

  function tagFilter(data, current) {
    const tags = Array.isArray(data.tags) ? data.tags.filter(tag => tag && text(tag.name)) : [];
    if (tags.length < 2 && !current) return null;
    const nav = element("nav", "container post-tags");
    nav.setAttribute("aria-label", "Теми");
    const add = (label, href, active) => {
      const link = element("a", active ? "is-active" : "", label);
      link.href = href;
      if (active) link.setAttribute("aria-current", "true");
      nav.append(link);
    };
    add("Усі теми", location.pathname, !current);
    tags.forEach(tag => add(tag.name, `${location.pathname}?tag=${encodeURIComponent(tag.name)}`, Boolean(current) && tag.name.toLowerCase() === current.toLowerCase()));
    return nav;
  }

  // Blog: the card grid (and the tag filter above it) is replaced by the published articles.
  function renderBlogList(root, data, { tag = "", onMore } = {}) {
    const grid = root.querySelector(".article-grid");
    if (!grid || !data || !Array.isArray(data.posts)) return;
    const section = grid.parentElement;
    section.querySelector(".post-tags")?.remove();
    section.querySelector(".post-more")?.remove();
    section.querySelector(".post-empty")?.remove();
    const filter = tagFilter(data, tag);
    if (filter) section.insertBefore(filter, grid);
    const posts = data.posts.filter(isPost);
    grid.hidden = !posts.length;
    grid.replaceChildren(...posts.map(postCard));
    if (!posts.length) section.append(emptyState("article"));
    if (data.hasMore && onMore) section.append(moreButton(onMore));
  }

  // Portfolio: the first case takes the large slot, the others follow as cards.
  function renderCaseList(root, data, { onMore } = {}) {
    const showcase = root.querySelector(".portfolio-showcase");
    if (!showcase || !data || !Array.isArray(data.posts)) return;
    const posts = data.posts.filter(isPost);
    const lead = showcase.querySelector(".portfolio-lead");
    const section = showcase.parentElement;
    section.querySelector(".post-case-list")?.remove();
    section.querySelector(".post-more")?.remove();
    section.querySelector(".post-empty")?.remove();
    if (!lead) return;
    if (!posts.length) {
      lead.hidden = true;
      section.append(emptyState("case"));
      return;
    }
    lead.hidden = false;
    const [first, ...rest] = posts;
    const cover = image(first.cover?.url, first.cover?.alt, "");
    const body = element("div");
    body.append(element("p", "page-kicker", text(first.category) || KINDS.case.kicker));
    body.append(element("h2", "", first.title));
    if (text(first.excerpt)) body.append(element("p", "", first.excerpt));
    const facts = caseFacts(first.case).map(([, value]) => value).join(" · ");
    if (facts) body.append(element("p", "post-card__facts", facts));
    const link = element("a", "text-link", `${KINDS.case.read} →`);
    link.href = postUrl(first);
    body.append(link);
    lead.replaceChildren(...[cover, body].filter(Boolean));
    if (rest.length) {
      const list = element("div", "container article-grid article-grid--expanded post-case-list");
      list.append(...rest.map(postCard));
      section.append(list);
    }
    if (data.hasMore && onMore) section.append(moreButton(onMore));
  }

  function moreButton(onMore) {
    const wrap = element("div", "container post-more");
    const button = element("button", "button button--secondary", "Показати ще");
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Завантажуємо…";
      const ok = await onMore();
      if (!ok) { button.disabled = false; button.textContent = "Показати ще"; }
    });
    wrap.append(button);
    return wrap;
  }

  async function applyList(page, root) {
    const kind = PAGE_KIND[page];
    const tag = (new URLSearchParams(location.search).get("tag") || "").trim().slice(0, 40);
    const render = kind === "case" ? renderCaseList : renderBlogList;
    const state = { data: null, page: 1 };
    const onMore = async () => {
      const next = await rpc("get_site_posts", { post_kind: kind, page_number: state.page + 1, filter_tag: tag || null });
      if (!next || !Array.isArray(next.posts)) return false;
      state.page += 1;
      state.data = { ...next, posts: [...state.data.posts, ...next.posts] };
      render(root, state.data, { tag, onMore });
      return true;
    };
    const cacheKey = `list.${kind}`;
    const cached = tag ? null : readCache(cacheKey);
    if (cached) { state.data = cached; render(root, cached, { tag, onMore }); }
    const fresh = await rpc("get_site_posts", { post_kind: kind, page_number: 1, filter_tag: tag || null });
    if (fresh === undefined || !fresh || !Array.isArray(fresh.posts)) return;
    if (!tag) {
      const serialized = JSON.stringify(fresh);
      if (serialized === JSON.stringify(cached)) return;
      write(CACHE_PREFIX + cacheKey, serialized);
    }
    state.data = fresh;
    render(root, fresh, { tag, onMore });
  }

  // ---------------------------------------------------------------------------
  // One post (post.html, served at /blog/<slug> and /portfolio/<slug>)
  // ---------------------------------------------------------------------------
  function currentPost() {
    const match = /^\/(blog|portfolio)\/([^/]+)\/?$/.exec(location.pathname);
    const params = new URLSearchParams(location.search);
    const kind = match ? (match[1] === "portfolio" ? "case" : "article") : params.get("kind") === "case" ? "case" : "article";
    let slug = match ? match[2] : params.get("slug") || "";
    try { slug = decodeURIComponent(slug); } catch { slug = ""; }
    slug = slug.toLowerCase();
    return { kind, slug: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : "" };
  }

  function setMeta(name, value) {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", name); document.head.append(meta); }
    meta.setAttribute("content", value);
  }

  function setCanonical(path) {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.setAttribute("rel", "canonical"); document.head.append(link); }
    link.setAttribute("href", `${location.origin}${path}`);
  }

  function setListLinks(root, kind) {
    root.querySelectorAll("[data-post-list-link]").forEach(link => {
      link.href = `${KINDS[kind].base}`;
      link.textContent = link.dataset.postListLink === "back" ? `← ${KINDS[kind].listTitle}` : KINDS[kind].listTitle;
    });
  }

  function renderMissing(root, kind, unavailable) {
    const node = selector => root.querySelector(selector);
    setListLinks(root, kind);
    if (node("[data-post-kicker]")) node("[data-post-kicker]").textContent = KINDS[kind].listTitle;
    if (node("[data-post-title]")) node("[data-post-title]").textContent = unavailable ? "Матеріал тимчасово недоступний" : "Матеріал не знайдено";
    if (node("[data-post-lead]")) node("[data-post-lead]").textContent = unavailable
      ? "Не вдалося завантажити текст. Оновіть сторінку трохи згодом."
      : "Можливо, посилання застаріло або матеріал ще не опубліковано.";
    if (node("[data-post-current]")) node("[data-post-current]").textContent = unavailable ? "Недоступно" : "Не знайдено";
    node("[data-post-body]")?.replaceChildren();
    node("[data-post-cover]")?.setAttribute("hidden", "");
    if (!unavailable) setMeta("robots", "noindex,follow");
    document.title = `${unavailable ? "Матеріал недоступний" : "Матеріал не знайдено"} | ТД «Софіївка»`;
  }

  function renderPost(root, post) {
    if (!isPost(post)) return;
    const kind = post.kind;
    const node = selector => root.querySelector(selector);
    setListLinks(root, kind);
    node("[data-post-kicker]").textContent = text(post.category) || KINDS[kind].kicker;
    node("[data-post-title]").textContent = post.title;
    if (node("[data-post-current]")) node("[data-post-current]").textContent = post.title;
    node("[data-post-lead]").textContent = text(post.excerpt);
    const meta = node("[data-post-meta]");
    if (meta) {
      const date = formatDate(post.publishedAt);
      const tags = Array.isArray(post.tags) ? post.tags.filter(tag => typeof tag === "string" && tag) : [];
      meta.replaceChildren();
      if (date) { const time = element("time", "", date); time.setAttribute("datetime", text(post.publishedAt)); meta.append(time); }
      tags.forEach(tag => {
        const link = element("a", "", tag);
        link.href = `${KINDS[kind].base}?tag=${encodeURIComponent(tag)}`;
        meta.append(link);
      });
      meta.hidden = !meta.children.length;
    }
    const coverBox = node("[data-post-cover]");
    if (coverBox) {
      const cover = image(post.cover?.url, post.cover?.alt, "");
      coverBox.replaceChildren(...(cover ? [cover] : []));
      coverBox.hidden = !cover;
    }
    const body = node("[data-post-body]");
    if (body) body.replaceChildren(...(Array.isArray(post.body) ? post.body.map(blockNode).filter(Boolean) : []));

    // Cases: facts and equipment in the side card, photos under the text.
    const details = kind === "case" && post.case && typeof post.case === "object" ? post.case : null;
    const facts = node("[data-post-facts]");
    if (facts) {
      facts.replaceChildren();
      caseFacts(details).forEach(([label, value]) => {
        const row = element("div");
        row.append(element("dt", "", label), element("dd", "", value));
        facts.append(row);
      });
      const equipment = Array.isArray(details?.equipment) ? details.equipment.filter(item => typeof item === "string" && item) : [];
      if (equipment.length) {
        const row = element("div", "post-facts__equipment");
        const list = element("ul");
        equipment.forEach(item => list.append(element("li", "", item)));
        const value = element("dd");
        value.append(list);
        row.append(element("dt", "", "Обладнання"), value);
        facts.append(row);
      }
      facts.hidden = !facts.children.length;
    }
    const gallery = node("[data-post-gallery]");
    if (gallery) {
      const photos = Array.isArray(details?.photos) ? details.photos.map(photo => {
        const picture = image(photo?.url, photo?.alt, "");
        if (!picture) return null;
        const figure = element("figure");
        figure.append(picture);
        if (text(photo.alt)) figure.append(element("figcaption", "", photo.alt));
        return figure;
      }).filter(Boolean) : [];
      gallery.replaceChildren(...photos);
      gallery.hidden = !photos.length;
    }
    const more = node("[data-post-more]");
    if (more) {
      const others = Array.isArray(post.more) ? post.more.filter(isPost) : [];
      const grid = more.querySelector("[data-post-more-list]");
      const heading = more.querySelector("h2");
      if (heading) heading.textContent = KINDS[kind].more;
      grid?.replaceChildren(...others.map(postCard));
      more.hidden = !others.length;
    }

    const seo = post.seo && typeof post.seo === "object" ? post.seo : {};
    document.title = text(seo.title) || `${post.title} | ТД «Софіївка»`;
    const description = text(seo.description) || text(post.excerpt);
    if (description) setMeta("description", description);
    setCanonical(postUrl(post));
  }

  async function applyPost(root) {
    const { kind, slug } = currentPost();
    setListLinks(root, kind);
    if (!slug) { renderMissing(root, kind, false); return; }
    const cacheKey = `post.${kind}.${slug}`;
    const cached = readCache(cacheKey);
    if (isPost(cached)) renderPost(root, cached);
    const fresh = await rpc("get_site_post", { post_kind: kind, post_slug: slug });
    if (fresh === undefined) { if (!isPost(cached)) renderMissing(root, kind, true); return; }
    if (!isPost(fresh)) { write(CACHE_PREFIX + cacheKey, null); renderMissing(root, kind, false); return; }
    const serialized = JSON.stringify(fresh);
    if (serialized === JSON.stringify(cached)) return;
    write(CACHE_PREFIX + cacheKey, serialized);
    renderPost(root, fresh);
  }

  function apply(page, root = document) {
    if (page === "post") return applyPost(root);
    if (PAGE_KIND[page]) return applyList(page, root);
    return Promise.resolve();
  }

  window.sofievkaSitePosts = Object.freeze({ apply, renderPost, renderBlogList, renderCaseList, blockNode, imageSrc, postUrl });
})();
