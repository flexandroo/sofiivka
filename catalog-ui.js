window.sofievkaCatalogUIReady = (async function () {
  "use strict";

  if (window.sofievkaCatalogDataReady) await window.sofievkaCatalogDataReady;

  const catalog = window.sofievkaCatalog;
  if (!catalog) return;

  const state = { expandedGroups: new Set(), brandQuery: "", visibleCount: 24 };
  const dataSourceMode = new URLSearchParams(location.search).get("dataSource") || "";
  const preserveDataSource = href => {
    if (!dataSourceMode.startsWith("supabase") || !href || /^(?:#|mailto:|tel:|javascript:)/i.test(href)) return href;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return href;
    url.searchParams.set("dataSource", dataSourceMode);
    return `${url.pathname}${url.search}${url.hash}`;
  };
  // Supplier texts may already contain HTML entities (&lt;); decode first so they are not escaped twice.
  const decodeEntities = value => String(value ?? "").replace(/&(?:#(\d+)|#x([0-9a-f]+)|(lt|gt|amp|quot|apos|nbsp));/gi, (entity, dec, hex, name) => dec ? String.fromCodePoint(+dec) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " })[name.toLowerCase()]);
  const escapeHtml = value => decodeEntities(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const money = value => `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))} грн`;
  const countLabel = count => {
    const value = Math.abs(Number(count) || 0);
    const ending = value % 10 === 1 && value % 100 !== 11 ? "товар" : [2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100) ? "товари" : "товарів";
    return `${value} ${ending}`;
  };

  // Some supplier imports carry a generated slug (altep-p20-5, baxi-…, TJ-new_…), the product name or «запит»
  // instead of the manufacturer code. Such values cannot be matched against a price list, so they are not shown.
  const SYNTHETIC_SKU = /^(?:altep|baxi|buderus|focus)-|^tj-new_/i;
  function displaySku(product) {
    const code = String(product?.sku || product?.code || "").replace(/^Код товару:\s*/i, "").trim();
    if (!code) return "";
    const brand = String(product.brandId || product.brand_id || "").toLowerCase();
    if (SYNTHETIC_SKU.test(code) || (brand && code.toLowerCase().startsWith(`${brand}-`))) return "";
    // A run of lowercase Cyrillic letters is a word («Датчик Холла», «запит»), not a code (КРН200V, F.FBnА10 are codes).
    if (/[а-яіїєґ]{3,}/.test(code)) return "";
    if (product.title && code.toLocaleLowerCase("uk") === String(product.title).toLocaleLowerCase("uk")) return "";
    return code;
  }

  // Back from a product page restores how far the listing was loaded and scrolled (per URL, this tab only).
  const listingStateKey = () => `sofievka-listing:${location.pathname}${location.search}`;
  const readListingState = () => {
    try {
      const navigation = performance.getEntriesByType?.("navigation")?.[0];
      if (!navigation || !["back_forward", "reload"].includes(navigation.type)) return null;
      const saved = JSON.parse(sessionStorage.getItem(listingStateKey()) || "null");
      return saved && Number(saved.count) > 0 ? { count: Number(saved.count), scrollY: Math.max(0, Number(saved.scrollY) || 0) } : null;
    } catch { return null; }
  };
  const saveListingState = count => {
    try {
      if (count > 0) sessionStorage.setItem(listingStateKey(), JSON.stringify({ count, scrollY: Math.round(window.scrollY) }));
    } catch { /* storage unavailable: Back simply starts at the top */ }
  };
  const restoreScroll = scrollY => {
    if (!scrollY) return;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "instant" })));
  };

  const priceGroupMarkup = filters => `<fieldset class="filter-group" data-price-group><legend>Ціна, грн</legend><div class="price-filter"><label><span>Від</span><input type="number" min="0" inputmode="numeric" enterkeyhint="done" value="${Number.isFinite(filters.minPrice) && filters.minPrice > 0 ? filters.minPrice : ""}" data-price-min></label><label><span>До</span><input type="number" min="0" inputmode="numeric" enterkeyhint="done" value="${Number.isFinite(filters.maxPrice) ? filters.maxPrice : ""}" data-price-max></label></div><button class="price-apply" type="button" data-price-apply>Застосувати</button></fieldset>`;
  const priceFilterActive = filters => filters.minPrice > 0 || Number.isFinite(filters.maxPrice);
  // Reads both price fields; a reversed range (10 000 … 5 000) is swapped instead of returning nothing.
  const readPriceInputs = () => {
    let minimum = Number(document.querySelector("[data-price-min]")?.value || 0);
    const rawMaximum = document.querySelector("[data-price-max]")?.value;
    let maximum = rawMaximum ? Number(rawMaximum) : Infinity;
    if (!(minimum > 0)) minimum = 0;
    if (!(maximum >= 0)) maximum = Infinity;
    if (Number.isFinite(maximum) && minimum > maximum) [minimum, maximum] = [maximum, minimum];
    return { minPrice: minimum, maxPrice: maximum };
  };
  // Price sorting is offered only where at least one product has a price (or it is already selected).
  const syncSortOptions = (pricesKnown, sort) => {
    const select = document.querySelector("[data-catalog-sort]");
    if (!select) return;
    const showPrice = pricesKnown || sort !== "default";
    const options = [["default", "За замовчуванням"], ...(showPrice ? [["price-asc", "За ціною ↑"], ["price-desc", "За ціною ↓"]] : [])];
    if ([...select.options].map(option => option.value).join() !== options.map(([value]) => value).join()) {
      select.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    }
    select.value = sort;
  };

  // Facet re-renders replace the markup; keep keyboard focus on the same control.
  const withFacetFocus = (root, renderFn) => {
    const active = document.activeElement;
    let selector = "";
    if (active && root.contains(active)) {
      if (active.dataset.filterKey) selector = `[data-filter-key="${CSS.escape(active.dataset.filterKey)}"][value="${CSS.escape(active.value)}"]`;
      else if (active.matches("[data-price-min]")) selector = "[data-price-min]";
      else if (active.matches("[data-price-max]")) selector = "[data-price-max]";
      else if (active.matches("[data-price-apply]")) selector = "[data-price-apply]";
      else if (active.matches("[data-brand-search]")) selector = "[data-brand-search]";
      else if (active.dataset.facetMore) selector = `[data-facet-more="${CSS.escape(active.dataset.facetMore)}"]`;
    }
    renderFn();
    if (selector) root.querySelector(selector)?.focus({ preventScroll: true });
  };

  // The filter panel is a sidebar on desktop and an off-canvas dialog up to 900 px: there it is inert while closed,
  // takes focus when opened, keeps Tab inside and gives focus back to «Фільтри» when closed.
  function bindFilterDrawer(filterPanel, backdrop) {
    const drawerQuery = matchMedia("(max-width: 900px)");
    const toggleButton = () => document.querySelector("[data-filter-toggle]");
    let open = false;
    const sync = () => {
      if (!filterPanel) return;
      const modal = drawerQuery.matches;
      filterPanel.setAttribute("role", modal ? "dialog" : "region");
      if (modal) filterPanel.setAttribute("aria-modal", "true");
      else filterPanel.removeAttribute("aria-modal");
      filterPanel.toggleAttribute("inert", modal && !open);
    };
    const focusables = () => [...filterPanel.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.closest("[hidden]") && element.getClientRects().length);
    const setDrawer = (next, { restoreFocus = true } = {}) => {
      if (!filterPanel) return;
      const focusWasInside = filterPanel.contains(document.activeElement);
      open = Boolean(next) && drawerQuery.matches;
      filterPanel.classList.toggle("is-open", open);
      backdrop?.toggleAttribute("hidden", !open);
      document.body.classList.toggle("filter-drawer-open", open);
      toggleButton()?.setAttribute("aria-expanded", String(open));
      sync();
      if (open) requestAnimationFrame(() => (filterPanel.querySelector("[data-filter-close]") || focusables()[0])?.focus({ preventScroll: true }));
      else if (restoreFocus && drawerQuery.matches && (focusWasInside || document.activeElement === document.body)) toggleButton()?.focus({ preventScroll: true });
    };
    filterPanel?.addEventListener("keydown", event => {
      if (event.key !== "Tab" || !open) return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && open) setDrawer(false); });
    drawerQuery.addEventListener?.("change", () => { if (open && !drawerQuery.matches) setDrawer(false, { restoreFocus: false }); else sync(); });
    sync();
    return { setDrawer, isOpen: () => open };
  }

  const containsProduct = (collection, id) => collection instanceof Set
    ? collection.has(id)
    : Array.isArray(collection)
    ? collection.includes(id)
    : Boolean(collection && Number(collection[id]) > 0);

  function productCardAttributes(product, limit = 3) {
    const schema = catalog.attributeSchema || {};
    const normalized = product.normalizedAttributes || {};
    const categoryPriority = schema.cardPriorityByCategory?.[product.primaryCategoryId] || [];
    const fallbackPriority = schema.cardFallbackPriority || Object.keys(catalog.attributeDefinitions || {});
    const keys = [...new Set([...categoryPriority, ...fallbackPriority])];
    return keys.flatMap(key => {
      const definition = catalog.attributeDefinitions?.[key];
      const value = normalized[key];
      if (!definition || value === undefined || value === null || value === "") return [];
      const label = schema.cardAttributeLabels?.[key] || definition.label.replace(/, .+$/, "");
      return [[label, catalog.valueLabel(definition, value)]];
    }).slice(0, limit);
  }

  function renderProductCard(product, options = {}) {
    if (!product) return "";
    const variant = options.variant === "compact" ? "compact" : "standard";
    const attributeLimit = Number(options.attributeLimit) || (variant === "compact" ? 2 : 3);
    const favoriteActive = containsProduct(options.favoriteIds, product.id);
    const compareActive = containsProduct(options.compareIds, product.id);
    const cartQuantity = Number(options.cart?.[product.id] || 0);
    const title = product.title || product.shortTitle || product.model || "Товар";
    const productHref = preserveDataSource(catalog.productUrl(product));
    const brandHref = preserveDataSource(catalog.brandUrl(product.brandId || catalog.slugify(product.brand || "")));
    const status = product.inventory?.status || product.stockStatus || product.availability || "unknown";
    const inStock = status === "in_stock";
    const statusLabel = product.availabilityLabel || (inStock ? "В наявності" : status === "out_of_stock" ? "Немає в наявності" : "Наявність уточнюйте");
    const amount = Number(product.pricing?.amount ?? product.price);
    const hasPrice = Number.isFinite(amount) && amount > 0;
    const oldAmount = Number(product.pricing?.oldAmount ?? product.oldPrice ?? 0);
    const hasOldPrice = Number.isFinite(oldAmount) && oldAmount > amount;
    const isSale = Array.isArray(product.tags) && product.tags.includes("sale");
    const image = product.image || product.images?.[0] || "";
    const attributes = productCardAttributes(product, attributeLimit);
    const series = catalog.attributeSchema?.seriesLabels?.[product.seriesId] || "";
    const sku = displaySku(product);
    const showCompare = options.showCompare !== false;
    const priceMarkup = hasPrice
      ? `<div class="product-card__price-group">${hasOldPrice ? `<del class="product-card__old-price">${money(oldAmount)}</del>` : ""}<strong class="product-card__price">${money(amount)}</strong></div>`
      : "";
    const primaryAction = inStock && hasPrice
      ? `<button class="product-card__buy${cartQuantity ? " is-in-cart" : ""}" type="button" data-add="${escapeHtml(product.id)}" aria-label="${escapeHtml(cartQuantity ? `У кошику ${cartQuantity} шт. Додати ще` : `Додати ${title} до кошика`)}">${cartQuantity ? `У кошику · ${cartQuantity}` : "До кошика"}</button>`
      : `<a class="product-card__buy product-card__buy--consult" href="/contact?product=${encodeURIComponent(product.id)}#contact-form">${hasPrice ? "Уточнити наявність" : "Запитати ціну"}</a>`;
    // Without a price the card says it once, on the button; an unknown stock status is not repeated either.
    const statusMarkup = hasPrice || status === "in_stock" || status === "out_of_stock"
      ? `<span class="product-card__status product-card__status--${inStock ? "available" : status === "out_of_stock" ? "unavailable" : "pending"}"><i aria-hidden="true"></i>${escapeHtml(statusLabel)}</span>`
      : "";
    const commercialMarkup = statusMarkup || priceMarkup ? `<div class="product-card__commercial">${statusMarkup}${priceMarkup}</div>` : "";
    const imageMarkup = image
      ? `<img src="${escapeHtml(image)}" width="800" height="800" loading="lazy" decoding="async" data-product-image onerror="this.hidden=true;this.parentElement.classList.add('is-fallback')" alt="${escapeHtml(title)}">`
      : "";

    return `<article class="product-card catalog-product product-card--${variant}" data-product-card="${escapeHtml(product.id)}"><div class="product-card__media-actions">${isSale ? '<span class="product-card__badge">Акція</span>' : ""}<button class="product-card__favorite${favoriteActive ? " is-active" : ""}" type="button" data-favorite="${escapeHtml(product.id)}" aria-label="${favoriteActive ? "Видалити з обраного" : "Додати в обране"}: ${escapeHtml(title)}" aria-pressed="${favoriteActive}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l7.8-7.5a5.5 5.5 0 0 0-.2-7.9Z"/></svg></button></div><a class="product-card__image${image ? "" : " is-fallback"}" href="${productHref}" aria-label="Відкрити товар: ${escapeHtml(title)}">${imageMarkup}<span class="product-card__image-fallback" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M5 8h22v17H5zM9 20l5-5 4 4 3-3 6 6M11 12h.01"/></svg>Фото готується</span></a><div class="product-card__identity"><a class="product-card__brand" href="${escapeHtml(brandHref)}">${escapeHtml(product.brand || "Виробник")}</a>${series ? `<span class="product-card__series">Серія ${escapeHtml(series)}</span>` : ""}</div><h3><a href="${productHref}" title="${escapeHtml(title)}">${escapeHtml(title)}</a></h3>${attributes.length ? `<dl class="product-card__specs" aria-label="Ключові характеристики">${attributes.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : `<p class="product-card__specs-empty">Характеристики уточнюються</p>`}${sku ? `<span class="product-card__code">Код: ${escapeHtml(sku)}</span>` : `<span class="product-card__code" aria-hidden="true"></span>`}${commercialMarkup}<div class="product-card__actions">${primaryAction}${showCompare ? `<button class="compare-button${compareActive ? " is-active" : ""}" type="button" data-compare="${escapeHtml(product.id)}" aria-label="${compareActive ? "Видалити з порівняння" : "Додати до порівняння"}: ${escapeHtml(title)}" aria-pressed="${compareActive}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h10v10M16 19H6V9"/></svg><span>${compareActive ? "У порівнянні" : "Порівняти"}</span></button>` : ""}</div></article>`;
  }

  const showProductImageFallback = image => {
    image.hidden = true;
    image.closest(".product-card__image")?.classList.add("is-fallback");
  };

  const imageVisibilityObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      imageVisibilityObserver.unobserve(entry.target);
      window.setTimeout(() => { if (!entry.target.naturalWidth) showProductImageFallback(entry.target); }, 2400);
    });
  }, { rootMargin: "160px" }) : null;

  const trackProductImages = root => {
    const images = root.matches?.("[data-product-image]") ? [root] : [...(root.querySelectorAll?.("[data-product-image]") || [])];
    images.forEach(image => {
      if (image.dataset.imagePrepared) return;
      image.dataset.imagePrepared = "true";
      image.addEventListener("error", () => showProductImageFallback(image), { once: true });
      image.addEventListener("load", () => {
        image.hidden = false;
        image.closest(".product-card__image")?.classList.remove("is-fallback");
      });
      if (image.complete && !image.naturalWidth) showProductImageFallback(image);
      else imageVisibilityObserver?.observe(image);
    });
  };

  document.addEventListener("error", event => {
    const image = event.target.closest?.("[data-product-image]");
    if (image) showProductImageFallback(image);
  }, true);
  requestAnimationFrame(() => trackProductImages(document));

  // Keep the explicit development data-source switch across internal navigation.
  // Local and production URLs are untouched because they do not carry the switch.
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");
    const preserved = preserveDataSource(href);
    if (preserved && preserved !== href) link.setAttribute("href", preserved);
  }, true);
  document.addEventListener("submit", event => {
    if (!dataSourceMode.startsWith("supabase")) return;
    const form = event.target.closest?.("form");
    if (!form || String(form.method || "get").toLowerCase() !== "get") return;
    const action = new URL(form.getAttribute("action") || location.href, location.href);
    if (action.origin !== location.origin || form.elements.namedItem("dataSource")) return;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "dataSource";
    input.value = dataSourceMode;
    form.append(input);
  }, true);

  function brandFromLocation() {
    const pathSlug = location.pathname.split("/").filter(Boolean).pop()?.replace(/\.html$/, "");
    const slug = pathSlug && !["brand", "brands"].includes(pathSlug) ? pathSlug : new URLSearchParams(location.search).get("slug") || "";
    return catalog.brands.find(brand => brand.id === slug) || null;
  }

  function context(pageName) {
    const isBrand = pageName === "brand";
    const route = catalog.resolveRoute(location.pathname, location.search, pageName);
    const brand = isBrand ? brandFromLocation() : null;
    const section = route.section || catalog.sectionById.all;
    const currentCategory = route.currentCategory || null;
    const category = currentCategory?.level > 1 ? currentCategory : null;
    return { ...route, pageName, isBrand, route, brand, section, currentCategory, category, notFound: !isBrand && route.notFound };
  }

  function canonicalPath(ctx) {
    if (ctx.isBrand) return ctx.brand ? catalog.brandUrl(ctx.brand.id) : "/brands";
    return ctx.canonicalPath || "/catalog";
  }

  function ensureMeta(name, value) {
    let tag = document.head.querySelector(`meta[name="${name}"]`);
    if (!tag) { tag = document.createElement("meta"); tag.name = name; document.head.append(tag); }
    tag.content = value;
  }

  function applyMetadata(ctx, hasFilters = false) {
    const title = ctx.notFound
      ? "Категорію не знайдено | ТД «Софіївка»"
      : ctx.isBrand
      ? `${ctx.brand?.name || "Бренд"} — товари та категорії | ТД «Софіївка»`
      : (ctx.currentCategory?.metaTitle || ctx.section.metaTitle);
    const description = ctx.notFound
      ? "Запитаний розділ каталогу не існує або має неправильну ієрархію."
      : ctx.isBrand
      ? `${ctx.brand?.name || "Виробник"}: категорії та товари у каталозі ТД «Софіївка».`
      : (ctx.currentCategory?.description || ctx.section.description);
    document.title = title;
    ensureMeta("description", description);
    // The catalog root and brand pages have no current category; only a missing or inactive one is noindex,
    // and brands without products stay noindex (they are not in the sitemap).
    const hidden = ctx.notFound
      || (ctx.isBrand && (!ctx.brand || catalog.countForBrand?.(ctx.brand.id) === 0))
      || (ctx.currentCategory && ctx.currentCategory.status !== "active");
    ensureMeta("robots", hidden || hasFilters ? "noindex,follow" : "index,follow");
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.append(canonical); }
    canonical.href = `https://sofievka.vercel.app${canonicalPath(ctx)}`;
  }

  function breadcrumb(ctx) {
    const items = [`<a href="/">Головна</a>`, `<a href="/catalog">Каталог</a>`];
    if (ctx.isBrand) {
      items.push(`<a href="/brands">Бренди</a>`);
      if (ctx.brand) items.push(`<span aria-current="page">${escapeHtml(ctx.brand.name)}</span>`);
    } else {
      const chain = ctx.currentCategory ? [...ctx.ancestors, ctx.currentCategory] : [];
      chain.forEach((category, index) => {
        const current = index === chain.length - 1;
        items.push(current
          ? `<span aria-current="page">${escapeHtml(category.name)}</span>`
          : `<a href="${catalog.getCategoryPath(category.id)}">${escapeHtml(category.name)}</a>`);
      });
      if (ctx.notFound) items.push(`<span aria-current="page">Категорію не знайдено</span>`);
      else if (!chain.length) items.push(`<span aria-current="page">Усі товари</span>`);
    }
    return `<nav class="catalog-breadcrumbs" aria-label="Хлібні крихти">${items.join('<span aria-hidden="true">/</span>')}</nav>`;
  }

  function scopeProducts(ctx) {
    let products = ctx.isBrand
      ? (catalog.catalogProducts || catalog.products).filter(product => product.brandId === ctx.brand?.id)
      : (ctx.notFound ? [] : (ctx.currentCategory ? catalog.productsForCategory(ctx.currentCategory.id) : catalog.productsForSection("all")));
    return products;
  }

  function scopeCount(ctx) {
    if (ctx.isBrand) return ctx.brand ? catalog.countForBrand?.(ctx.brand.id) ?? scopeProducts(ctx).length : 0;
    if (ctx.notFound) return 0;
    return ctx.currentCategory
      ? (catalog.countForCategory?.(ctx.currentCategory.id) ?? scopeProducts(ctx).length)
      : (catalog.countForSection?.("all") ?? scopeProducts(ctx).length);
  }

  function selectorMarkup(ctx) {
    // On a brand page these tabs would show whole-catalogue counts; the «Категорія» filter
    // already lists the brand's own categories with the brand's counts.
    if (ctx.isBrand) return "";
    return `<nav class="catalog-section-tabs" aria-label="Розділи каталогу">${catalog.navigationSections.map(section => {
      const active = !ctx.isBrand && ctx.section.id === section.id;
      return `<a href="${catalog.sectionUrl(section.id)}" class="${active ? "is-active" : ""}"${active ? ' aria-current="page"' : ""}>${escapeHtml(section.name)}<span>${catalog.countForSection?.(section.id) ?? catalog.productsForSection(section.id).length}</span></a>`;
    }).join("")}</nav>`;
  }

  function subcategoryMarkup(ctx) {
    if (ctx.isBrand || ctx.notFound || !ctx.currentCategory) return "";
    const current = ctx.currentCategory;
    const hasChildren = catalog.availableCategories(current.id).length > 0;
    const parent = hasChildren ? current : catalog.categoryById[current.parentId];
    if (!parent) return "";
    const categories = catalog.availableCategories(parent.id);
    if (!categories.length) return "";
    const parentCount = catalog.countForCategory?.(parent.id) ?? catalog.productsForCategory(parent.id).length;
    return `<nav class="catalog-subcategory-tabs${categories.length > 7 ? " catalog-subcategory-tabs--many" : ""}" aria-label="Категорії поточного рівня"><a href="${catalog.categoryUrl(parent.id)}" class="${current.id === parent.id ? "is-active" : ""}"${current.id === parent.id ? ' aria-current="page"' : ""}>Усе: ${escapeHtml(parent.shortTitle || parent.name)} <span>${parentCount}</span></a>${categories.map(category => `<a href="${catalog.categoryUrl(category.id)}" class="${current.id === category.id ? "is-active" : ""}"${current.id === category.id ? ' aria-current="page"' : ""}>${escapeHtml(category.name)} <span>${catalog.countForCategory?.(category.id) ?? catalog.productsForCategory(category.id).length}</span></a>`).join("")}</nav>`;
  }

  function introMarkup(ctx, total) {
    if (ctx.notFound) return `<section class="catalog-intro catalog-intro--state"><div class="container">${breadcrumb(ctx)}<div class="catalog-intro__line"><div><p class="page-kicker">Каталог</p><h1>Категорію не знайдено</h1><p>Перевірте адресу або поверніться до кореня каталогу. Некоректна вкладеність не підмінюється схожою категорією.</p></div><a class="button button--secondary" href="/catalog">До каталогу</a></div></div></section>`;
    if (ctx.isBrand) {
      if (!ctx.brand) return `<section class="catalog-intro"><div class="container">${breadcrumb(ctx)}<div class="catalog-intro__line"><div><p class="page-kicker">Бренди</p><h1>Бренд не знайдено</h1><p>Перейдіть до каталогу виробників і виберіть доступний бренд.</p></div><a class="button button--secondary" href="/brands">Усі бренди</a></div></div></section>`;
      const darkLogo = (ctx.brand.logoTheme || (window.sofievkaBrands || []).find(item => item.slug === ctx.brand.slug)?.logoTheme) === "dark";
      const logo = ctx.brand.logo ? `<div class="catalog-brand-mark${darkLogo ? " catalog-brand-mark--dark" : ""}"><img src="/${ctx.brand.logo.replace(/^\//, "")}" alt="${escapeHtml(ctx.brand.name)}"></div>` : `<div class="catalog-brand-mark catalog-brand-mark--text" aria-hidden="true">${escapeHtml(ctx.brand.name.slice(0, 2).toUpperCase())}</div>`;
      return `<section class="catalog-intro catalog-intro--brand"><div class="container">${breadcrumb(ctx)}<div class="catalog-intro__line">${logo}<div><p class="page-kicker">Виробник</p><h1>${escapeHtml(ctx.brand.name)}</h1><p>${escapeHtml(ctx.brand.description || `Товари ${ctx.brand.name} у каталозі інженерного обладнання.`)}</p></div><strong>${countLabel(total)}</strong></div></div></section>`;
    }
    const title = ctx.currentCategory?.name || ctx.section.title;
    const description = ctx.currentCategory?.description || ctx.section.description;
    return `<section class="catalog-intro"><div class="container">${breadcrumb(ctx)}<div class="catalog-intro__line catalog-intro__line--category"><div><div class="catalog-intro__heading"><h1>${escapeHtml(title)}</h1><strong>${countLabel(total)}</strong></div><p>${escapeHtml(description)}</p></div></div></div></section>`;
  }

  function render({ pageName = "catalog" } = {}) {
    const ctx = context(pageName);
    const total = scopeCount(ctx);
    applyMetadata(ctx, false);
    if (ctx.notFound || (ctx.isBrand && !ctx.brand)) return introMarkup(ctx, 0);
    if (ctx.currentCategory?.status === "future") return `${introMarkup(ctx, 0)}<section class="catalog-workspace catalog-workspace--state"><div class="container"><div class="catalog-state"><p class="page-kicker">Асортимент готується</p><h2>Розділ готується до наповнення</h2><p>Тут з’являться товари після перевірки категорій, характеристик і доступності.</p><a class="button button--secondary" href="/catalog">Перейти до каталогу</a></div></div></section>`;
    if (ctx.currentCategory?.visibility === "service") return `${introMarkup(ctx, 0)}<section class="catalog-workspace catalog-workspace--state"><div class="container"><div class="catalog-state"><p class="page-kicker">Сервісна послуга</p><h2>Пусконалагодження не є товаром каталогу</h2><p>Умови, виїзд і вартість погоджуються сервісним центром після перевірки обладнання та об’єкта.</p><a class="button button--primary" href="/service-center">Звернутися до сервісного центру</a></div></div></section>`;
    const skeletons = Array.from({ length: 6 }, () => `<div class="product-skeleton" aria-hidden="true"><i></i><b></b><span></span><span></span></div>`).join("");
    return `${introMarkup(ctx, total)}<section class="catalog-workspace"><div class="container">${selectorMarkup(ctx)}${subcategoryMarkup(ctx)}<div class="catalog-mobile-tools"><button class="button button--secondary mobile-filter-button" type="button" data-filter-toggle aria-expanded="false" aria-controls="catalog-filter-panel">Фільтри</button><span data-mobile-result-count>${countLabel(total)}</span></div><div class="catalog-layout"><div class="catalog-filter-backdrop" data-filter-backdrop hidden></div><div class="catalog-filter" id="catalog-filter-panel" data-filter role="region" aria-label="Фільтри каталогу"><div class="catalog-filter__head"><div><span>Параметри вибору</span><h2>Фільтри</h2></div><button type="button" data-filter-close aria-label="Закрити фільтри">Закрити</button></div><div data-facet-root></div><div class="catalog-filter__footer"><button class="button button--primary" type="button" data-filter-apply>Показати <span data-drawer-count>${countLabel(total)}</span></button></div></div><div class="catalog-results"><div class="catalog-toolbar"><div><p><strong data-result-count>${total}</strong> <span data-result-label>${countLabel(total).replace(/^\d+\s+/, "")}</span></p><div class="active-filters" data-active-filters></div></div><label>Сортування<select data-catalog-sort><option value="default">За замовчуванням</option><option value="price-asc">За ціною ↑</option><option value="price-desc">За ціною ↓</option></select></label></div><div class="catalog-products is-loading" data-catalog-products>${skeletons}</div><div class="catalog-more"><p class="catalog-more__error" data-load-more-error role="alert" hidden></p><button class="button button--secondary" type="button" data-load-more>Показати ще</button></div></div></div></div></section><section class="catalog-seo"><div class="container"><h2>${escapeHtml(ctx.currentCategory?.name || ctx.section.name)}: підбір за технічними параметрами</h2><p>${escapeHtml(ctx.currentCategory?.description || ctx.section.description)} Фільтри каталогу показують лише характеристики, наявні в поточному наборі товарів. Для остаточного підбору перевірте робочу точку, приєднання та умови монтажу.</p></div></section>`;
  }

  function readState(ctx) {
    const params = new URLSearchParams(location.search);
    const values = {};
    ["brand", "availability", "subcategory", ...(ctx?.isBrand ? ["category"] : []), ...Object.keys(catalog.attributeDefinitions)].forEach(key => {
      const selected = (params.get(key) || "").split(",").filter(Boolean);
      if (selected.length) values[key] = selected;
    });
    const legacyTypeTarget = catalog.sourceMappings.categoryMappings.ecosoft?.[params.get("type")]?.categoryId;
    if (!ctx?.isBrand && legacyTypeTarget && legacyTypeTarget === ctx.currentCategory?.id) delete values.type;
    return {
      values,
      q: (params.get("q") || "").trim(),
      minPrice: Number(params.get("minPrice") || 0),
      maxPrice: Number(params.get("maxPrice") || Infinity),
      sort: ["price-asc", "price-desc"].includes(params.get("sort")) ? params.get("sort") : "default"
    };
  }

  function productValue(product, key) {
    if (key === "brand") return product.brandId;
    if (key === "availability") return product.availability;
    if (key === "subcategory" || key === "category") return product.primaryCategoryId;
    return catalog.filterValue(catalog.attributeDefinitions[key], product.normalizedAttributes?.[key]);
  }

  function matches(product, filters, omitKey = "") {
    if (filters.q && !`${product.title} ${product.shortTitle || ""} ${product.sku} ${product.brand} ${product.sourceCategoryName}`.toLocaleLowerCase("uk").includes(filters.q.toLocaleLowerCase("uk"))) return false;
    if (omitKey !== "price" && (filters.minPrice > 0 || Number.isFinite(filters.maxPrice))) {
      const amount = product.pricing?.amount;
      if (!Number.isFinite(amount) || amount <= 0 || amount < filters.minPrice || amount > filters.maxPrice) return false;
    }
    return Object.entries(filters.values).every(([key, selected]) => {
      if (key === omitKey || !selected.length) return true;
      const value = productValue(product, key);
      return value !== undefined && value !== null && selected.includes(String(value));
    });
  }

  function filteredProducts(baseProducts, filters, omitKey = "") {
    return baseProducts.filter(product => matches(product, filters, omitKey));
  }

  function optionCounts(baseProducts, filters, key) {
    const counts = new Map();
    filteredProducts(baseProducts, filters, key).forEach(product => {
      const value = productValue(product, key);
      if (value !== undefined && value !== null && value !== "") counts.set(String(value), (counts.get(String(value)) || 0) + 1);
    });
    (filters.values[key] || []).forEach(value => { if (!counts.has(value)) counts.set(value, 0); });
    return counts;
  }

  function relevantDefinitions(ctx, baseProducts) {
    const categoryIds = ctx.currentCategory?.level > 1 ? [ctx.currentCategory.id] : [...new Set(baseProducts.map(product => product.primaryCategoryId))];
    const allowed = [...new Set(categoryIds.flatMap(id => catalog.categoryById[id]?.facetIds || []))];
    return allowed.map(id => [id, catalog.attributeDefinitions[id]]).filter(([id, definition]) => {
      if (!definition?.filterable) return false;
      const values = new Set(baseProducts.map(product => product.normalizedAttributes?.[id]).filter(value => value !== undefined && value !== null && value !== ""));
      return values.size >= 2;
    }).sort((a, b) => a[1].rank - b[1].rank).slice(0, 9);
  }

  function labelFor(key, value) {
    if (key === "brand") return catalog.brands.find(brand => brand.id === value)?.name || value;
    if (key === "availability") return value === "in_stock" ? "В наявності" : value === "out_of_stock" ? "Немає в наявності" : "Наявність уточнюйте";
    if (key === "subcategory" || key === "category") return catalog.categoryById[value]?.name || value;
    return catalog.valueLabel(catalog.attributeDefinitions[key], value);
  }

  function facetGroup(key, label, counts, filters, options = {}) {
    const selected = filters.values[key] || [];
    let items = [...counts].map(([value, count]) => ({ value, count, label: labelFor(key, value) }));
    // Numeric parameters (power, head, pressure…) read in ascending order; the rest by popularity.
    const numeric = catalog.attributeDefinitions[key]?.type === "number";
    items.sort(numeric
      ? (a, b) => (Number(a.value) || 0) - (Number(b.value) || 0)
      : (a, b) => b.count - a.count || a.label.localeCompare(b.label, "uk", { numeric: true }));
    const expanded = state.expandedGroups.has(key);
    const limit = options.limit || 8;
    const visible = expanded ? items : items.filter((item, index) => index < limit || selected.includes(item.value));
    if (!items.length) return "";
    const search = options.search && items.length > 8 ? `<label class="facet-search"><span class="sr-only">Знайти бренд</span><input type="search" placeholder="Знайти бренд" value="${escapeHtml(state.brandQuery)}" data-brand-search></label>` : "";
    return `<fieldset class="filter-group" data-facet-group="${escapeHtml(key)}"><legend>${escapeHtml(label)}</legend>${search}<div class="facet-options">${visible.map(item => `<label data-facet-option data-option-label="${escapeHtml(item.label.toLocaleLowerCase("uk"))}"${!item.count && !selected.includes(item.value) ? ' class="is-disabled"' : ""}><input type="checkbox" data-filter-key="${escapeHtml(key)}" value="${escapeHtml(item.value)}" ${selected.includes(item.value) ? "checked" : ""} ${!item.count && !selected.includes(item.value) ? "disabled" : ""}><span>${escapeHtml(item.label)}</span><small>${item.count}</small></label>`).join("")}</div>${items.length > limit ? `<button class="facet-more" type="button" data-facet-more="${escapeHtml(key)}">${expanded ? "Згорнути" : `Показати всі · ${items.length}`}</button>` : ""}</fieldset>`;
  }

  function renderFacets(ctx, baseProducts, filters, options = {}) {
    const groups = [];
    if (ctx.isBrand) {
      groups.push(facetGroup("category", "Категорія", optionCounts(baseProducts, filters, "category"), filters, { limit: 8 }));
    }
    if (!ctx.isBrand) groups.push(facetGroup("brand", "Бренд", optionCounts(baseProducts, filters, "brand"), filters, { search: true, limit: 8 }));
    if (options.pricesKnown !== false || priceFilterActive(filters)) groups.push(priceGroupMarkup(filters));
    groups.push(facetGroup("availability", "Наявність", optionCounts(baseProducts, filters, "availability"), filters, { limit: 4 }));
    relevantDefinitions(ctx, baseProducts).forEach(([key, definition]) => groups.push(facetGroup(key, definition.label, optionCounts(baseProducts, filters, key), filters, { limit: 7 })));
    return `${groups.filter(Boolean).join("")}<button class="filter-reset" type="button" data-filter-clear>Скинути всі фільтри</button>`;
  }

  function activeChips(filters) {
    const chips = [];
    Object.entries(filters.values).forEach(([key, values]) => values.forEach(value => chips.push(`<button type="button" data-remove-filter="${escapeHtml(key)}" data-remove-value="${escapeHtml(value)}">${escapeHtml(labelFor(key, value))}<span aria-hidden="true">×</span></button>`)));
    if (filters.minPrice) chips.push(`<button type="button" data-remove-price="minPrice">Від ${money(filters.minPrice)}<span aria-hidden="true">×</span></button>`);
    if (Number.isFinite(filters.maxPrice)) chips.push(`<button type="button" data-remove-price="maxPrice">До ${money(filters.maxPrice)}<span aria-hidden="true">×</span></button>`);
    if (filters.q) chips.push(`<button type="button" data-remove-query>Пошук: ${escapeHtml(filters.q)}<span aria-hidden="true">×</span></button>`);
    return chips.length ? `${chips.join("")}<button class="active-filters__clear" type="button" data-filter-clear>Скинути все</button>` : "";
  }

  function paramsFromFilters(filters) {
    const params = new URLSearchParams();
    if (window.sofievkaCatalogScopedDataSource && new URLSearchParams(location.search).get("dataSource") === "supabase") params.set("dataSource", "supabase");
    Object.entries(filters.values).forEach(([key, values]) => { if (values.length) params.set(key, values.join(",")); });
    if (filters.minPrice) params.set("minPrice", String(filters.minPrice));
    if (Number.isFinite(filters.maxPrice)) params.set("maxPrice", String(filters.maxPrice));
    if (filters.sort !== "default") params.set("sort", filters.sort);
    if (filters.q) params.set("q", filters.q);
    return params;
  }

  function hasIndexableFilters(filters) {
    return Boolean(Object.keys(filters.values).length || filters.minPrice || Number.isFinite(filters.maxPrice) || filters.q || filters.sort !== "default");
  }

  function bindScoped({ pageName = "catalog", productCard } = {}) {
    const source = window.sofievkaCatalogScopedDataSource;
    const productRoot = document.querySelector("[data-catalog-products]");
    const facetRoot = document.querySelector("[data-facet-root]");
    if (!source || !productRoot || !facetRoot || typeof productCard !== "function") return;
    let ctx = context(pageName);
    let filters = readState(ctx);
    let page = 1;
    let total = scopeCount(ctx);
    let hasMore = false;
    let currentProducts = [];
    let currentFacets = null;
    let controller = null;
    let requestSequence = 0;
    let pendingRestore = readListingState();
    if (pendingRestore && "scrollRestoration" in history) history.scrollRestoration = "manual";
    const filterPanel = document.querySelector("[data-filter]");
    const backdrop = document.querySelector("[data-filter-backdrop]");
    const { setDrawer } = bindFilterDrawer(filterPanel, backdrop);
    const loadMoreError = document.querySelector("[data-load-more-error]");
    const pricesKnown = facets => !facets?.priceBounds || facets.priceBounds.max != null;
    const skeletons = Array.from({ length: 6 }, () => `<div class="product-skeleton" aria-hidden="true"><i></i><b></b><span></span><span></span></div>`).join("");

    const writeUrl = (push = true) => {
      const params = paramsFromFilters(filters);
      const target = `${canonicalPath(ctx)}${params.toString() ? `?${params}` : ""}`;
      // Applying the same filters twice (Enter, then «Застосувати») must not add a second history entry.
      const same = target === `${location.pathname}${location.search}`;
      history[push && !same ? "pushState" : "replaceState"]({}, "", target);
      applyMetadata(ctx, hasIndexableFilters(filters));
    };
    const requestQuery = (requestedPage, pageSize = 24) => {
      const technicalFilters = {};
      Object.entries(filters.values).forEach(([key, values]) => {
        if (!["brand", "availability", "subcategory", "category"].includes(key)) technicalFilters[key] = values;
      });
      const scopeCategory = ctx.currentCategory?.id || (ctx.section?.id !== "all" ? ctx.section?.id : "all");
      return {
        scopeCategory, scopeBrand: ctx.isBrand ? ctx.brand?.id || "" : "",
        categoryIds: [...new Set([...(filters.values.category || []), ...(filters.values.subcategory || [])])],
        brandIds: filters.values.brand || [], availabilityIds: filters.values.availability || [],
        technicalFilters,
        minPrice: filters.minPrice > 0 ? filters.minPrice : null,
        maxPrice: Number.isFinite(filters.maxPrice) ? filters.maxPrice : null,
        sort: filters.sort, q: filters.q, page: requestedPage, pageSize
      };
    };
    const countsMap = (values, selected = []) => {
      const map = new Map(Object.entries(values || {}).map(([value, count]) => [value, Number(count) || 0]));
      selected.forEach(value => { if (!map.has(value)) map.set(value, 0); });
      return map;
    };
    const renderScopedFacets = facets => {
      const groups = [];
      if (ctx.isBrand) groups.push(facetGroup("category", "Категорія", countsMap(facets.categoryCounts, filters.values.category), filters, { limit: 8 }));
      if (!ctx.isBrand) groups.push(facetGroup("brand", "Бренд", countsMap(facets.brandCounts, filters.values.brand), filters, { search: true, limit: 8 }));
      if (pricesKnown(facets) || priceFilterActive(filters)) groups.push(priceGroupMarkup(filters));
      groups.push(facetGroup("availability", "Наявність", countsMap(facets.availabilityCounts, filters.values.availability), filters, { limit: 4 }));
      Object.entries(facets.technicalCounts || {})
        .sort(([left], [right]) => (catalog.attributeDefinitions[left]?.rank || 999) - (catalog.attributeDefinitions[right]?.rank || 999))
        .forEach(([key, counts]) => {
          const definition = catalog.attributeDefinitions[key];
          if (definition?.filterable) groups.push(facetGroup(key, definition.label, countsMap(counts, filters.values[key]), filters, { limit: 7 }));
        });
      withFacetFocus(facetRoot, () => { facetRoot.innerHTML = `${groups.filter(Boolean).join("")}<button class="filter-reset" type="button" data-filter-clear>Скинути всі фільтри</button>`; });
      if (state.brandQuery) filterBrandOptions();
      syncSortOptions(pricesKnown(facets), filters.sort);
    };
    const updateCounters = () => {
      document.querySelectorAll("[data-result-count]").forEach(element => { element.textContent = String(total); });
      document.querySelectorAll("[data-drawer-count]").forEach(element => { element.textContent = countLabel(total); });
      document.querySelectorAll("[data-mobile-result-count]").forEach(element => { element.textContent = countLabel(total); });
      document.querySelectorAll("[data-result-label]").forEach(element => { element.textContent = countLabel(total).replace(/^\d+\s+/, ""); });
      const activeRoot = document.querySelector("[data-active-filters]");
      if (activeRoot) activeRoot.innerHTML = activeChips(filters);
      syncSortOptions(pricesKnown(currentFacets), filters.sort);
      const loadMore = document.querySelector("[data-load-more]");
      if (loadMore) { loadMore.hidden = !hasMore; loadMore.disabled = false; loadMore.removeAttribute("aria-busy"); loadMore.textContent = `Показати ще · ${Math.min(24, Math.max(0, total - currentProducts.length))}`; }
      const mobileButton = document.querySelector("[data-filter-toggle]");
      const activeCount = Object.values(filters.values).reduce((sum, values) => sum + values.length, 0) + Number(Boolean(filters.minPrice)) + Number(Number.isFinite(filters.maxPrice));
      if (mobileButton) mobileButton.textContent = activeCount ? `Фільтри · ${activeCount}` : "Фільтри";
    };
    const renderProducts = () => {
      window.sofievkaRegisterScopedProducts?.(currentProducts);
      productRoot.classList.remove("is-loading");
      productRoot.removeAttribute("aria-busy");
      productRoot.innerHTML = currentProducts.length
        ? currentProducts.map(productCard).join("")
        : total === 0 && hasIndexableFilters(filters)
          ? `<div class="catalog-empty"><span aria-hidden="true">0</span><h2>Товарів за цими параметрами немає</h2><p>Змініть один із фільтрів або скиньте вибір.</p><button class="button button--secondary" type="button" data-filter-clear>Скинути фільтри</button></div>`
          : `<div class="catalog-empty"><span aria-hidden="true">0</span><h2>Товарів у цьому розділі поки немає</h2><p>Перейдіть до іншого розділу каталогу.</p><a class="button button--secondary" href="/catalog">Увесь каталог</a></div>`;
      trackProductImages(productRoot);
      updateCounters();
    };
    // A failed «Показати ще» keeps the cards and filters already on screen; the message sits above the button.
    const renderLoadMoreError = error => {
      if (loadMoreError) { loadMoreError.textContent = "Не вдалося завантажити наступні товари. Перевірте з’єднання та натисніть «Показати ще» ще раз."; loadMoreError.hidden = false; }
      const loadMore = document.querySelector("[data-load-more]");
      if (loadMore) { loadMore.hidden = false; loadMore.disabled = false; loadMore.removeAttribute("aria-busy"); loadMore.textContent = "Показати ще"; }
      console.error("Scoped catalogue «load more» failed", error);
    };
    const clearLoadMoreError = () => { if (loadMoreError) { loadMoreError.hidden = true; loadMoreError.textContent = ""; } };
    const renderError = error => {
      productRoot.classList.remove("is-loading");
      productRoot.removeAttribute("aria-busy");
      productRoot.innerHTML = `<div class="catalog-empty" role="alert"><span aria-hidden="true">!</span><h2>Не вдалося завантажити товари</h2><p>Перевірте з’єднання та спробуйте ще раз.</p><button class="button button--primary" type="button" data-scoped-retry>Спробувати ще раз</button></div>`;
      facetRoot.innerHTML = `<div class="catalog-empty" role="alert"><p>Фільтри тимчасово недоступні.</p></div>`;
      console.error("Scoped catalogue request failed", error);
    };
    const load = async ({ append = false, restore = null } = {}) => {
      controller?.abort();
      controller = new AbortController();
      const sequence = ++requestSequence;
      // Restoring after Back asks for every page that was on screen at once (the RPC caps a page at 96).
      const pagesWanted = restore && !append ? Math.min(4, Math.max(1, Math.ceil(restore.count / 24))) : 1;
      const nextPage = append ? page + 1 : 1;
      clearLoadMoreError();
      if (!append) {
        productRoot.classList.add("is-loading");
        productRoot.setAttribute("aria-busy", "true");
        productRoot.innerHTML = skeletons;
      } else {
        const loadMore = document.querySelector("[data-load-more]");
        if (loadMore) { loadMore.disabled = true; loadMore.setAttribute("aria-busy", "true"); loadMore.textContent = "Завантаження…"; }
      }
      try {
        const query = requestQuery(nextPage, 24 * pagesWanted);
        const [products, facets] = append
          ? [await source.listProducts(query, { signal: controller.signal }), currentFacets]
          : await Promise.all([
            source.listProducts(query, { signal: controller.signal }),
            source.loadFacets(query, { signal: controller.signal })
          ]);
        if (sequence !== requestSequence) return;
        page = append ? nextPage : pagesWanted;
        total = products.total;
        hasMore = products.hasMore;
        currentProducts = append ? [...currentProducts, ...products.products] : [...products.products];
        currentFacets = facets;
        if (!append && facets) renderScopedFacets(facets);
        renderProducts();
        if (restore && currentProducts.length < restore.count && hasMore) load({ append: true, restore });
        else if (restore) restoreScroll(restore.scrollY);
      } catch (error) {
        if (error?.name === "AbortError" || /abort/i.test(error?.message || "")) return;
        if (sequence !== requestSequence) return;
        if (append) renderLoadMoreError(error); else renderError(error);
      }
    };
    const update = (push = true) => { pendingRestore = null; writeUrl(push); load(); };
    const applyPrice = () => { Object.assign(filters, readPriceInputs()); update(); };
    const filterBrandOptions = () => {
      const query = state.brandQuery.toLocaleLowerCase("uk");
      facetRoot.querySelectorAll('[data-facet-group="brand"] [data-facet-option]').forEach(option => { option.hidden = Boolean(query) && !option.dataset.optionLabel.includes(query); });
    };

    document.addEventListener("change", event => {
      const input = event.target.closest("[data-filter-key]");
      if (input && (facetRoot.contains(input) || filterPanel?.contains(input))) {
        const key = input.dataset.filterKey;
        const values = new Set(filters.values[key] || []);
        input.checked ? values.add(input.value) : values.delete(input.value);
        if (values.size) filters.values[key] = [...values]; else delete filters.values[key];
        update();
      }
      if (event.target.matches("[data-catalog-sort]")) { filters.sort = event.target.value; update(); }
    });
    document.addEventListener("input", event => {
      if (!event.target.matches("[data-brand-search]")) return;
      state.brandQuery = event.target.value;
      filterBrandOptions();
    });
    document.addEventListener("click", event => {
      if (event.target.closest("[data-filter-toggle]")) setDrawer(true);
      if (event.target.closest("[data-filter-close], [data-filter-backdrop], [data-filter-apply]")) setDrawer(false);
      if (event.target.closest("[data-price-apply]")) applyPrice();
      const more = event.target.closest("[data-facet-more]");
      if (more) { state.expandedGroups.has(more.dataset.facetMore) ? state.expandedGroups.delete(more.dataset.facetMore) : state.expandedGroups.add(more.dataset.facetMore); if (currentFacets) renderScopedFacets(currentFacets); }
      const remove = event.target.closest("[data-remove-filter]");
      if (remove) { filters.values[remove.dataset.removeFilter] = (filters.values[remove.dataset.removeFilter] || []).filter(value => value !== remove.dataset.removeValue); if (!filters.values[remove.dataset.removeFilter].length) delete filters.values[remove.dataset.removeFilter]; update(); }
      const price = event.target.closest("[data-remove-price]");
      if (price) { filters[price.dataset.removePrice] = price.dataset.removePrice === "maxPrice" ? Infinity : 0; update(); }
      if (event.target.closest("[data-remove-query]")) { filters.q = ""; update(); }
      if (event.target.closest("[data-filter-clear]")) { filters = { values: {}, q: "", minPrice: 0, maxPrice: Infinity, sort: "default" }; state.brandQuery = ""; update(); }
      if (event.target.closest("[data-load-more]") && hasMore && !event.target.closest("[data-load-more]").disabled) load({ append: true });
      if (event.target.closest("[data-scoped-retry]")) load();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target.matches?.("[data-price-min], [data-price-max]")) { event.preventDefault(); applyPrice(); }
    });
    window.addEventListener("popstate", () => { pendingRestore = null; ctx = context(pageName); filters = readState(ctx); applyMetadata(ctx, hasIndexableFilters(filters)); load(); });
    window.addEventListener("pagehide", () => saveListingState(currentProducts.length));
    productRoot.addEventListener("click", event => { if (event.target.closest("a[href]")) saveListingState(currentProducts.length); });

    const initialParams = new URLSearchParams(location.search);
    const redundantLegacyType = catalog.sourceMappings.categoryMappings.ecosoft?.[initialParams.get("type")]?.categoryId === ctx.currentCategory?.id;
    if (ctx.route.legacy || initialParams.has("slug") || (!ctx.isBrand && (initialParams.has("category") || redundantLegacyType))) writeUrl(false);
    else applyMetadata(ctx, hasIndexableFilters(filters));
    requestAnimationFrame(() => { const restore = pendingRestore; pendingRestore = null; load({ restore }); });
  }

  function bind({ pageName = "catalog", productCard } = {}) {
    if (window.sofievkaCatalogScopedDataSource) return bindScoped({ pageName, productCard });
    const productRoot = document.querySelector("[data-catalog-products]");
    const facetRoot = document.querySelector("[data-facet-root]");
    if (!productRoot || !facetRoot || typeof productCard !== "function") return;
    let ctx = context(pageName);
    let filters = readState(ctx);
    let pendingRestore = readListingState();
    if (pendingRestore && "scrollRestoration" in history) history.scrollRestoration = "manual";
    const filterPanel = document.querySelector("[data-filter]");
    const backdrop = document.querySelector("[data-filter-backdrop]");
    const { setDrawer } = bindFilterDrawer(filterPanel, backdrop);
    const hasPrice = product => Number(product.pricing?.amount ?? product.price) > 0;

    const writeUrl = (push = true) => {
      const params = paramsFromFilters(filters);
      const target = `${canonicalPath(ctx)}${params.toString() ? `?${params}` : ""}`;
      const same = target === `${location.pathname}${location.search}`;
      history[push && !same ? "pushState" : "replaceState"]({}, "", target);
      applyMetadata(ctx, hasIndexableFilters(filters));
    };

    const renderResults = () => {
      const baseProducts = scopeProducts(ctx);
      const results = filteredProducts(baseProducts, filters);
      if (filters.sort === "price-asc") results.sort((a, b) => catalog.compareProductsByPrice(a, b, "asc"));
      if (filters.sort === "price-desc") results.sort((a, b) => catalog.compareProductsByPrice(a, b, "desc"));
      const pricesKnown = filteredProducts(baseProducts, filters, "price").some(hasPrice);
      withFacetFocus(facetRoot, () => { facetRoot.innerHTML = renderFacets(ctx, baseProducts, filters, { pricesKnown }); });
      productRoot.classList.remove("is-loading");
      productRoot.innerHTML = results.length ? results.slice(0, state.visibleCount).map(productCard).join("") : baseProducts.length
        ? `<div class="catalog-empty"><span aria-hidden="true">0</span><h2>Товарів за цими параметрами немає</h2><p>Змініть один із фільтрів або скиньте вибір.</p><button class="button button--secondary" type="button" data-filter-clear>Скинути фільтри</button></div>`
        : `<div class="catalog-empty"><span aria-hidden="true">0</span><h2>Товарів у цьому розділі поки немає</h2><p>Ми не показуємо порожні підкатегорії або вигадані позиції. Перейдіть до іншого розділу каталогу.</p><a class="button button--secondary" href="/catalog">Увесь каталог</a></div>`;
      trackProductImages(productRoot);
      document.querySelectorAll("[data-result-count]").forEach(element => { element.textContent = String(results.length); });
      document.querySelectorAll("[data-drawer-count]").forEach(element => { element.textContent = countLabel(results.length); });
      document.querySelectorAll("[data-mobile-result-count]").forEach(element => { element.textContent = countLabel(results.length); });
      document.querySelectorAll("[data-result-label]").forEach(element => { element.textContent = countLabel(results.length).replace(/^\d+\s+/, ""); });
      const activeRoot = document.querySelector("[data-active-filters]");
      if (activeRoot) activeRoot.innerHTML = activeChips(filters);
      syncSortOptions(pricesKnown, filters.sort);
      const loadMore = document.querySelector("[data-load-more]");
      if (loadMore) { loadMore.hidden = state.visibleCount >= results.length; loadMore.textContent = `Показати ще · ${Math.min(24, Math.max(0, results.length - state.visibleCount))}`; }
      const mobileButton = document.querySelector("[data-filter-toggle]");
      const activeCount = Object.values(filters.values).reduce((sum, values) => sum + values.length, 0) + Number(Boolean(filters.minPrice)) + Number(Number.isFinite(filters.maxPrice));
      if (mobileButton) mobileButton.textContent = activeCount ? `Фільтри · ${activeCount}` : "Фільтри";
      if (state.brandQuery) filterBrandOptions();
    };

    const update = (push = true) => { pendingRestore = null; state.visibleCount = 24; writeUrl(push); renderResults(); };
    const applyPrice = () => { Object.assign(filters, readPriceInputs()); update(); };
    const visibleProductCount = () => productRoot.querySelectorAll("[data-product-card]").length;
    const filterBrandOptions = () => {
      const query = state.brandQuery.toLocaleLowerCase("uk");
      facetRoot.querySelectorAll('[data-facet-group="brand"] [data-facet-option]').forEach(option => { option.hidden = Boolean(query) && !option.dataset.optionLabel.includes(query); });
    };

    document.addEventListener("change", event => {
      const input = event.target.closest("[data-filter-key]");
      if (input) {
        const key = input.dataset.filterKey;
        const values = new Set(filters.values[key] || []);
        input.checked ? values.add(input.value) : values.delete(input.value);
        if (values.size) filters.values[key] = [...values]; else delete filters.values[key];
        update();
      }
      if (event.target.matches("[data-catalog-sort]")) { filters.sort = event.target.value; update(); }
    });
    document.addEventListener("input", event => {
      if (!event.target.matches("[data-brand-search]")) return;
      state.brandQuery = event.target.value;
      filterBrandOptions();
    });
    document.addEventListener("click", event => {
      if (event.target.closest("[data-filter-toggle]")) setDrawer(true);
      if (event.target.closest("[data-filter-close], [data-filter-backdrop], [data-filter-apply]")) setDrawer(false);
      if (event.target.closest("[data-price-apply]")) applyPrice();
      const more = event.target.closest("[data-facet-more]");
      if (more) { state.expandedGroups.has(more.dataset.facetMore) ? state.expandedGroups.delete(more.dataset.facetMore) : state.expandedGroups.add(more.dataset.facetMore); renderResults(); }
      const remove = event.target.closest("[data-remove-filter]");
      if (remove) { filters.values[remove.dataset.removeFilter] = (filters.values[remove.dataset.removeFilter] || []).filter(value => value !== remove.dataset.removeValue); if (!filters.values[remove.dataset.removeFilter].length) delete filters.values[remove.dataset.removeFilter]; update(); }
      const price = event.target.closest("[data-remove-price]");
      if (price) { filters[price.dataset.removePrice] = price.dataset.removePrice === "maxPrice" ? Infinity : 0; update(); }
      if (event.target.closest("[data-remove-query]")) { filters.q = ""; update(); }
      if (event.target.closest("[data-filter-clear]")) { filters = { values: {}, q: "", minPrice: 0, maxPrice: Infinity, sort: "default" }; state.brandQuery = ""; update(); }
      if (event.target.closest("[data-load-more]")) { state.visibleCount += 24; renderResults(); }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target.matches?.("[data-price-min], [data-price-max]")) { event.preventDefault(); applyPrice(); }
    });
    window.addEventListener("popstate", () => { pendingRestore = null; ctx = context(pageName); filters = readState(ctx); state.visibleCount = 24; applyMetadata(ctx, hasIndexableFilters(filters)); renderResults(); });
    window.addEventListener("pagehide", () => saveListingState(visibleProductCount()));
    productRoot.addEventListener("click", event => { if (event.target.closest("a[href]")) saveListingState(visibleProductCount()); });

    const initialParams = new URLSearchParams(location.search);
    const redundantLegacyType = catalog.sourceMappings.categoryMappings.ecosoft?.[initialParams.get("type")]?.categoryId === ctx.currentCategory?.id;
    if (ctx.route.legacy || initialParams.has("slug") || (!ctx.isBrand && (initialParams.has("category") || redundantLegacyType))) writeUrl(false);
    else applyMetadata(ctx, hasIndexableFilters(filters));
    requestAnimationFrame(() => {
      const restore = pendingRestore;
      pendingRestore = null;
      if (restore) state.visibleCount = Math.max(24, Math.ceil(restore.count / 24) * 24);
      renderResults();
      if (restore) restoreScroll(restore.scrollY);
    });
  }

  // Site pages for the phone menu (the header page links are hidden on phones), grouped like the footer.
  const MENU_GROUPS = [
    ["Про компанію", [["/about", "Про нас"], ["/solutions", "Рішення"], ["/blog", "Блог"], ["/contact", "Контакти"]]],
    ["Для клієнта", [["/delivery", "Доставка й оплата"], ["/returns", "Повернення та обмін"], ["/warranty", "Гарантія"], ["/service-center", "Сервіс"], ["/installation", "Монтаж"], ["/buyers", "Покупцям"]]]
  ];

  function megaMenu() {
    const route = catalog.resolveRoute(location.pathname, location.search, document.body.dataset.page || "catalog");
    const currentId = route.notFound ? "" : route.currentCategory?.id || "";
    const currentBranch = new Set(currentId ? [...catalog.getCategoryAncestors(currentId).map(category => category.id), currentId] : []);
    const columns = catalog.navigationSections.filter(section => section.id !== "all").map(section => {
      const children = catalog.availableCategories(section.id);
      const sectionCurrent = route.sectionId === section.id;
      const sectionName = section.shortTitle || section.name;
      return `<section class="${sectionCurrent ? "is-current-section" : ""}">${children.length ? '<button class="catalog-menu__back" type="button">Назад</button>' : ""}<a class="catalog-menu__title${currentId === section.id ? " is-current" : ""}" href="${catalog.getCategoryPath(section.id)}"${currentId === section.id ? ' aria-current="page"' : ""}><span><strong>${escapeHtml(sectionName)}</strong><small>${escapeHtml(section.menuDescription || section.description)}</small></span><i aria-hidden="true">→</i></a>${children.length ? `<div class="catalog-menu__children"><a class="catalog-menu__section-all" href="${catalog.getCategoryPath(section.id)}">Усі товари: ${escapeHtml(sectionName)}</a>${children.map(category => `<a class="${currentBranch.has(category.id) ? "is-current" : ""}" href="${catalog.getCategoryPath(category.id)}"${currentId === category.id ? ' aria-current="page"' : ""}>${escapeHtml(category.name)}</a>`).join("")}</div>` : ""}</section>`;
    }).join("");
    const allCurrent = !route.notFound && route.catalogState === "all" && /^\/catalog\/?$/.test(location.pathname);
    return `<div class="catalog-menu__panel"><div class="catalog-menu__heading"><span>Каталог обладнання</span><small>Швидкий перехід до категорії</small></div><div class="catalog-menu__taxonomy">${columns}</div><div class="catalog-menu__utilities"><a class="catalog-menu__all${allCurrent ? " is-current" : ""}" href="${catalog.sectionUrl("all")}"${allCurrent ? ' aria-current="page"' : ""}>Увесь каталог <span aria-hidden="true">→</span></a><a class="catalog-menu__brands" href="/brands">Усі бренди <span aria-hidden="true">→</span></a></div><div class="catalog-menu__pages">${MENU_GROUPS.map(([title, links]) => `<section class="catalog-menu__group"><p>${title}</p>${links.map(([href, label]) => `<a href="${href}"${location.pathname === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</section>`).join("")}</div></div>`;
  }

  function bindMenu({ toggle, menu }) {
    if (!toggle || !menu || toggle.dataset.catalogMenuBound === "true") return;
    toggle.dataset.catalogMenuBound = "true";
    toggle.setAttribute("aria-haspopup", "true");
    const catalogRoute = /^\/catalog(?:\/|$)/.test(location.pathname) || ["heating", "water-supply", "water-treatment", "sewerage", "smart-home", "climate", "household-equipment"].includes(document.body.dataset.page);
    toggle.classList.toggle("is-active", catalogRoute);
    if (catalogRoute) toggle.setAttribute("aria-label", "Каталог, поточний розділ. Відкрити меню");

    const phone = () => matchMedia("(max-width: 640px)").matches;
    const links = () => [...menu.querySelectorAll("a[href]")].filter(link => link.offsetParent !== null);
    const setOpen = (open, { focusFirst = false, restoreFocus = false } = {}) => {
      if (open) {
        const search = toggle.closest("header")?.querySelector(".search");
        const searchResults = search?.querySelector(".search-results");
        if (searchResults) searchResults.hidden = true;
        search?.querySelector('input[aria-expanded="true"]')?.setAttribute("aria-expanded", "false");
      }
      // Phones: jump to the top so the menu opens right under the header.
      if (open && phone() && window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
      if (open && phone()) menu.style.setProperty("--menu-top", `${Math.max(0, Math.round(toggle.closest("header")?.getBoundingClientRect().bottom || 0))}px`);
      if (!open) { menu.classList.remove("is-drilled"); menu.querySelectorAll(".catalog-menu__taxonomy section.is-expanded").forEach(item => item.classList.remove("is-expanded")); }
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Закрити меню" : "Відкрити каталог і меню");
      document.body.classList.toggle("catalog-navigation-open", open && matchMedia("(max-width: 640px)").matches);
      if (focusFirst && open) requestAnimationFrame(() => links()[0]?.focus());
      if (restoreFocus && !open) toggle.focus();
    };

    // On phones a section opens its subcategories in place of the menu (drill-down), with a back button.
    const drill = section => {
      menu.querySelectorAll(".catalog-menu__taxonomy section.is-expanded").forEach(item => item.classList.remove("is-expanded"));
      section?.classList.add("is-expanded");
      menu.classList.toggle("is-drilled", Boolean(section));
      menu.scrollTop = 0;
      (section?.querySelector(".catalog-menu__back") || menu.querySelector(".catalog-menu__taxonomy .catalog-menu__title"))?.focus({ preventScroll: true });
    };
    menu.addEventListener("click", event => {
      if (event.target.closest(".catalog-menu__back")) { drill(null); return; }
      const title = event.target.closest(".catalog-menu__title");
      const section = title?.closest("section");
      if (!title || !phone() || !section?.querySelector(".catalog-menu__children")) return;
      event.preventDefault();
      if (!menu.classList.contains("is-drilled")) drill(section);
    });

    toggle.addEventListener("click", () => setOpen(menu.hidden));
    mountTabBar();
    toggle.addEventListener("keydown", event => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        setOpen(menu.hidden);
        return;
      }
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => {
        const items = links();
        (event.key === "ArrowUp" ? items.at(-1) : items[0])?.focus();
      });
    });
    menu.addEventListener("click", event => { if (event.target.closest("a") && !event.defaultPrevented) setOpen(false); });
    menu.addEventListener("keydown", event => {
      const items = links();
      const index = items.indexOf(document.activeElement);
      if (event.key === "Escape") { event.preventDefault(); setOpen(false, { restoreFocus: true }); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || index < 0) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    });
    document.addEventListener("click", event => {
      if (!menu.hidden && !menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !menu.hidden) setOpen(false, { restoreFocus: true });
    });
    document.addEventListener("focusin", event => {
      if (!menu.hidden && event.target.closest(".search")) setOpen(false);
    });
    window.addEventListener("resize", () => {
      if (!matchMedia("(max-width: 640px)").matches) document.body.classList.remove("catalog-navigation-open");
    });
  }

  // Bottom navigation on phones (styles.css hides it above 640px). The cart count mirrors the header's
  // counter, which page-shell.js and script.js keep up to date.
  function mountTabBar() {
    if (document.querySelector("[data-tabbar]")) return;
    const path = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
    const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
    const items = [
      ["/", "Головна", icon('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'), path === "/" || path === "/index"],
      ["/catalog", "Каталог", icon('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>'), /^\/(catalog|brands|product)(\/|$)/.test(path)],
      ["/favorites", "Обране", icon('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l7.8-7.5a5.5 5.5 0 0 0 1-8.9Z"/>'), path === "/favorites"],
      ["/cart", "Кошик", icon('<path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'), path === "/cart" || path === "/checkout"],
      ["/contact", "Контакти", icon('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'), path === "/contact"]
    ];
    const bar = document.createElement("nav");
    bar.className = "tabbar";
    bar.dataset.tabbar = "";
    bar.setAttribute("aria-label", "Швидка навігація");
    bar.innerHTML = items.map(([href, label, svg, current]) => `<a href="${href}"${current ? ' aria-current="page" class="is-current"' : ""}>${svg}<span>${label}</span>${href === "/cart" ? '<b data-tabbar-cart hidden>0</b>' : ""}</a>`).join("");
    document.body.append(bar);
    const badge = bar.querySelector("[data-tabbar-cart]");
    const source = document.querySelector("header [data-cart-count]");
    const sync = () => { const count = Number(source?.textContent || 0); badge.textContent = String(count); badge.hidden = !(count > 0); };
    sync();
    if (source) new MutationObserver(sync).observe(source, { childList: true, characterData: true, subtree: true });
  }

  function bindSearch(form = document.querySelector("[data-search]"), options = {}) {
    const search = window.sofievkaCatalogSearch;
    const scopedSource = window.sofievkaCatalogScopedDataSource;
    const input = form?.querySelector('input[type="search"]');
    const results = form?.querySelector(".search-results");
    if ((!search && !scopedSource) || !form || !input || !results || form.dataset.searchBound === "true") return;
    form.dataset.searchBound = "true";
    const instanceId = input.id || `catalog-search-${Math.random().toString(36).slice(2, 8)}`;
    const minLength = Number(options.minLength) || 2;
    let timer = 0;
    let request = 0;
    let selectedIndex = -1;
    let controller = null;
    const normalizeQuery = value => search?.normalizeQuery ? search.normalizeQuery(value) : String(value || "").toLocaleLowerCase("uk").replace(/\s+/g, " ").trim();

    input.id = instanceId;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", results.id || `${instanceId}-results`);
    results.id ||= `${instanceId}-results`;
    results.setAttribute("role", "listbox");
    results.setAttribute("aria-label", "Підказки пошуку");

    const links = () => [...results.querySelectorAll('[role="option"]')];
    const setSelected = index => {
      const items = links();
      selectedIndex = items.length ? (index + items.length) % items.length : -1;
      items.forEach((item, itemIndex) => {
        const active = itemIndex === selectedIndex;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      if (selectedIndex >= 0) {
        input.setAttribute("aria-activedescendant", items[selectedIndex].id);
        items[selectedIndex].scrollIntoView({ block: "nearest" });
      } else input.removeAttribute("aria-activedescendant");
    };
    const close = () => {
      window.clearTimeout(timer);
      controller?.abort();
      results.hidden = true;
      input.setAttribute("aria-expanded", "false");
      setSelected(-1);
    };
    const option = ({ href, title, meta, image = "", kind, index }) => `<a id="${escapeHtml(instanceId)}-option-${index}" class="search-suggestion search-suggestion--${kind}" href="${escapeHtml(href)}" role="option" aria-selected="false">${image ? `<span class="search-suggestion__image"><img src="${escapeHtml(image)}" width="56" height="56" alt="" loading="lazy"></span>` : `<span class="search-suggestion__mark" aria-hidden="true">${kind === "brand" ? "B" : kind === "category" ? "C" : "S"}</span>`}<span class="search-suggestion__text"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></span><span class="search-suggestion__arrow" aria-hidden="true">→</span></a>`;
    const group = (label, kind, items, startIndex, mapItem) => {
      if (!items.length) return { html: "", next: startIndex };
      const headingId = `${instanceId}-${kind}-heading`;
      const html = `<section class="search-results__group search-results__group--${kind}" role="group" aria-labelledby="${escapeHtml(headingId)}"><h2 id="${escapeHtml(headingId)}">${escapeHtml(label)}</h2>${items.map((item, offset) => option({ ...mapItem(item), kind, index: startIndex + offset })).join("")}</section>`;
      return { html, next: startIndex + items.length };
    };
    const render = async () => {
      const rawQuery = input.value;
      const normalizedQuery = normalizeQuery(rawQuery);
      const currentRequest = ++request;
      if (normalizedQuery.length < minLength) { close(); return; }
      controller?.abort();
      controller = new AbortController();
      results.innerHTML = `<div class="search-results__empty" role="status"><strong>Шукаємо…</strong><span>Перевіряємо каталог за назвою, моделлю та кодом.</span></div>`;
      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
      let found;
      try {
        found = scopedSource
          ? await scopedSource.search(rawQuery, { productLimit: 5, categoryLimit: 3, brandLimit: 2, seriesLimit: 2, signal: controller.signal })
          : search.search(rawQuery, { productLimit: 5, categoryLimit: 3, brandLimit: 2, seriesLimit: 2 });
      } catch (error) {
        if (/abort/i.test(error?.message || "")) return;
        if (currentRequest !== request) return;
        results.innerHTML = `<div class="search-results__empty" role="alert"><strong>Пошук тимчасово недоступний</strong><span>Спробуйте ще раз.</span></div>`;
        return;
      }
      if (currentRequest !== request) return;
      let index = 0;
      const blocks = [];
      const productGroup = group("Товари", "product", found.products, index, product => ({ href: preserveDataSource(catalog.productUrl(product)), title: product.title, meta: displaySku(product) ? `${product.brand} · Код ${displaySku(product)}` : product.brand, image: product.image || product.images?.[0] || "" }));
      blocks.push(productGroup.html); index = productGroup.next;
      const categoryGroup = group("Категорії", "category", found.categories, index, hit => ({ href: hit.href || catalog.categoryUrl(hit.entity.id), title: hit.entity.title, meta: countLabel(hit.count) }));
      blocks.push(categoryGroup.html); index = categoryGroup.next;
      const brandGroup = group("Бренди", "brand", found.brands, index, hit => ({ href: hit.href || catalog.brandUrl(hit.entity.id), title: hit.entity.name, meta: countLabel(hit.count) }));
      blocks.push(brandGroup.html); index = brandGroup.next;
      const seriesGroup = group("Серії", "series", found.series, index, hit => ({ href: hit.href || `/search?q=${encodeURIComponent(hit.entity.name)}`, title: hit.entity.name, meta: countLabel(hit.count) }));
      blocks.push(seriesGroup.html); index = seriesGroup.next;
      const hasResults = index > 0;
      results.innerHTML = hasResults
        ? `${blocks.join("")}<a class="search-results__all" id="${escapeHtml(instanceId)}-option-${index}" role="option" aria-selected="false" href="/search?q=${encodeURIComponent(rawQuery.trim())}"><span>Показати всі результати для «${escapeHtml(rawQuery.trim())}»</span><span aria-hidden="true">→</span></a>`
        : `<div class="search-results__empty" role="status"><strong>Нічого не знайдено</strong><span>Спробуйте назву, модель або артикул.</span></div>`;
      selectedIndex = -1;
      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    const queueRender = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(render, Number(options.debounce) || 150);
    };

    input.addEventListener("input", queueRender);
    input.addEventListener("focus", () => {
      if (normalizeQuery(input.value).length >= minLength) queueRender();
    });
    input.addEventListener("keydown", event => {
      // The first Escape only closes the suggestions; the browser's own «clear the search field» is kept for a second one.
      if (event.key === "Escape") { if (!results.hidden) { event.preventDefault(); close(); } return; }
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) {
        if (event.key === "Enter" && selectedIndex >= 0) {
          const selected = links()[selectedIndex];
          if (selected) { event.preventDefault(); location.assign(selected.href); }
        } else if (event.key === "Enter" && input.value.trim()) {
          event.preventDefault();
          location.assign(preserveDataSource(`/search?q=${encodeURIComponent(input.value.trim())}`));
        }
        return;
      }
      event.preventDefault();
      if (results.hidden) { render(); if (results.hidden) return; }
      setSelected(selectedIndex + (event.key === "ArrowDown" ? 1 : -1));
    });
    form.addEventListener("submit", event => {
      const query = input.value.trim();
      if (!query) { event.preventDefault(); close(); input.focus(); }
    });
    results.addEventListener("mousemove", event => {
      const item = event.target.closest('[role="option"]');
      if (item) setSelected(links().indexOf(item));
    });
    results.addEventListener("click", event => { if (event.target.closest("a")) close(); });
    form.addEventListener("focusout", event => {
      if (!form.contains(event.relatedTarget)) window.setTimeout(close, 0);
    });
    document.addEventListener("click", event => { if (!form.contains(event.target)) close(); });
  }

  function homeCards() {
    const imageBySection = { heating: "assets/images/solution-boiler-room.webp", "water-supply": "assets/images/hero-water.webp", "water-treatment": "assets/images/home-hero-ecosoft-water-v1.jpg", "smart-home": "assets/images/home-hero-termojet-automation-v1.jpg", climate: "assets/images/hero-climate.webp", "household-equipment": "assets/images/showroom.webp" };
    const homeSections = catalog.activeSections;
    return homeSections.map(section => {
      const children = catalog.availableCategories(section.id).slice(0, 4);
      const productCount = catalog.countForSection?.(section.id) ?? catalog.productsForSection(section.id).length;
      return `<a class="category-card category-card--${escapeHtml(section.id)}" href="${catalog.sectionUrl(section.id)}"><img src="${imageBySection[section.id]}" width="1536" height="1024" loading="lazy" alt="${escapeHtml(section.name)}"><span class="category-card__content"><span class="category-card__title"><strong>${escapeHtml(section.name)}</strong><em>${productCount || "Напрям"}</em></span><small>${children.length ? children.map(category => category.name).join(" · ") : section.description}</small></span></a>`;
    }).join("");
  }

  window.sofievkaCatalogUI = Object.freeze({ render, bind, renderProductCard, displaySku, productCardAttributes, trackProductImages, megaMenu, bindMenu, bindSearch, homeCards, applyMetadata, preserveDataSource });
})();
