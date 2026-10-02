const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const toast = document.querySelector("[data-toast]");
let toastTimer;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function setupCatalogMenu() {
  const toggle = document.querySelector("[data-menu-toggle]");
  const menu = document.querySelector("#catalog-menu");
  if (!toggle || !menu) return;

  if (window.sofievkaCatalogUI?.megaMenu && window.sofievkaCatalogUI?.bindMenu) {
    menu.innerHTML = window.sofievkaCatalogUI.megaMenu();
    window.sofievkaCatalogUI.bindMenu({ toggle, menu });
    return;
  }

  const close = () => {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  menu.addEventListener("click", event => {
    if (event.target.closest("a")) close();
  });

  document.addEventListener("click", event => {
    if (!menu.hidden && !event.target.closest("[data-header]")) close();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
  });
}

// Categories chosen in the admin (homepageOrder) lead the homepage; without a choice the
// active top-level sections are shown. Only categories with products on sale qualify.
function storefrontHomepageCategories(catalog) {
  const chosen = catalog.taxonomy.nodes
    .filter(category => Number.isFinite(category.homepageOrder) && category.status === "active"
      && category.visibility === "catalog" && catalog.countForCategory(category.id) > 0)
    .sort((a, b) => a.homepageOrder - b.homepageOrder);
  return chosen.length ? chosen : catalog.activeSections;
}

function storefrontCategoryGroups() {
  const catalog = window.sofievkaCatalog;
  if (!catalog) return [];
  return storefrontHomepageCategories(catalog).map(section => ({
    id: section.id,
    title: section.title,
    description: section.menuDescription || section.description,
    href: catalog.getCategoryPath(section.id),
    items: catalog.availableCategories(section.id).map(category => ({
      title: category.title,
      href: catalog.getCategoryPath(category.id),
      count: catalog.productsForCategory(category.id).length
    }))
  }));
}

function setupStorefrontCategories() {
  const navigation = document.querySelector("[data-storefront-categories]");
  const panel = navigation?.querySelector("[data-storefront-subcategories]");
  const title = panel?.querySelector("[data-storefront-subcategories-title]");
  const list = panel?.querySelector("[data-storefront-subcategories-list]");
  const allLink = panel?.querySelector("[data-storefront-subcategories-all]");
  const closeButton = panel?.querySelector("[data-storefront-subcategories-close]");
  if (!navigation || !panel || !title || !list || !allLink) return;
  const groups = storefrontCategoryGroups();
  if (!groups.length) return;
  navigation.querySelectorAll(".storefront-category").forEach(item => item.remove());
  // Categories without subcategories link straight to their page; the rest open the panel.
  // Position classes drive the grid borders, which depend on how many items there are.
  const count = groups.length;
  navigation.style.setProperty("--storefront-category-count", String(count));
  groups.forEach((group, index) => {
    const item = document.createElement(group.items.length ? "button" : "a");
    item.className = "storefront-category";
    if (group.items.length) {
      item.type = "button";
      item.dataset.storefrontCategory = group.id;
      item.setAttribute("aria-expanded", "false");
      item.setAttribute("aria-controls", "storefront-subcategories");
    } else {
      item.href = group.href;
    }
    if (index === count - 1) item.classList.add("storefront-category--last");
    if (index >= count - (count % 3 || 3)) item.classList.add("storefront-category--last-row-3");
    if (index >= count - (count % 2 || 2)) item.classList.add("storefront-category--last-row-2");
    if (index % 3 === 2) item.classList.add("storefront-category--row-end-3");
    if (index % 2 === 1) item.classList.add("storefront-category--row-end-2");
    const strong = document.createElement("strong");
    strong.textContent = group.title;
    const description = document.createElement("span");
    description.textContent = group.description;
    item.append(strong, description);
    navigation.insertBefore(item, panel);
  });
  const buttons = [...navigation.querySelectorAll("[data-storefront-category]")];

  let activeButton = null;

  const close = (restoreFocus = false) => {
    panel.hidden = true;
    buttons.forEach(button => {
      button.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    });
    if (restoreFocus) activeButton?.focus();
    activeButton = null;
  };

  const open = button => {
    const group = groups.find(item => item.id === button.dataset.storefrontCategory);
    if (!group) return;

    buttons.forEach(item => {
      const active = item === button;
      item.classList.toggle("is-open", active);
      item.setAttribute("aria-expanded", String(active));
    });

    title.textContent = group.title;
    list.replaceChildren(...group.items.map(item => {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = `${item.title} (${item.count})`;
      return link;
    }));
    allLink.href = group.href;
    allLink.setAttribute("aria-label", `Усі товари категорії ${group.title}`);
    panel.hidden = false;
    activeButton = button;
  };

  buttons.forEach(button => button.addEventListener("click", () => {
    if (button === activeButton && !panel.hidden) close(true);
    else open(button);
  }));

  closeButton?.addEventListener("click", () => close(true));
  navigation.addEventListener("click", event => {
    if (event.target.closest(".storefront-subcategories__list a, [data-storefront-subcategories-all]")) close();
  });
  document.addEventListener("click", event => {
    if (!panel.hidden && !navigation.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) close(true);
  });
}

function setupHeroSlider() {
  const slider = document.querySelector("[data-slider]");
  const track = slider?.querySelector("[data-slider-track]");
  const slides = [...(slider?.querySelectorAll("[data-slide]") || [])];
  const dots = [...(slider?.querySelectorAll("[data-slide-dot]") || [])];
  const live = slider?.querySelector("[data-slide-live]");
  if (!slider || !track || !slides.length) return;
  slider.dataset.sliderReady = "true";

  let index = 0;
  let timer;
  let pointerStart = null;
  let paused = false;
  const autoplay = slider?.dataset.sliderAutoplay !== "false";

  const render = (nextIndex, announce = true) => {
    index = (nextIndex + slides.length) % slides.length;
    track.style.transform = `translate3d(-${index * 100}%, 0, 0)`;

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      slide.toggleAttribute("inert", !active);

      slide.querySelectorAll("a, button, input, select, textarea, [tabindex]").forEach(element => {
        if (!active) {
          if (!element.hasAttribute("data-slider-tabindex")) {
            element.dataset.sliderTabindex = element.getAttribute("tabindex") ?? "";
          }
          element.tabIndex = -1;
          return;
        }

        if (!element.hasAttribute("data-slider-tabindex")) return;
        const previousTabIndex = element.dataset.sliderTabindex;
        if (previousTabIndex === "") element.removeAttribute("tabindex");
        else element.setAttribute("tabindex", previousTabIndex);
        delete element.dataset.sliderTabindex;
      });
    });

    dots.forEach(dot => dot.classList.remove("is-active"));
    void slider.offsetWidth;
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === index;
      if (active) dot.classList.add("is-active");
      dot.setAttribute("aria-selected", String(active));
      dot.tabIndex = active ? 0 : -1;
    });

    if (announce && live) live.textContent = `Показано слайд ${index + 1} з ${slides.length}`;
  };

  const stop = () => window.clearInterval(timer);
  const start = () => {
    stop();
    if (autoplay && !reducedMotion && !paused) timer = window.setInterval(() => (slider.isConnected ? render(index + 1, false) : stop()), 7000);
  };

  slider.querySelector("[data-slide-prev]")?.addEventListener("click", () => {
    render(index - 1);
    start();
  });

  slider.querySelector("[data-slide-next]")?.addEventListener("click", () => {
    render(index + 1);
    start();
  });

  dots.forEach(dot => dot.addEventListener("click", () => {
    render(Number(dot.dataset.slideDot));
    start();
  }));

  slider.addEventListener("mouseenter", () => {
    paused = true;
    slider.classList.add("is-paused");
    stop();
  });
  slider.addEventListener("mouseleave", () => {
    paused = false;
    slider.classList.remove("is-paused");
    start();
  });
  slider.addEventListener("focusin", () => {
    paused = true;
    slider.classList.add("is-paused");
    stop();
  });
  slider.addEventListener("focusout", event => {
    if (!slider.contains(event.relatedTarget)) {
      paused = false;
      slider.classList.remove("is-paused");
      start();
    }
  });

  slider.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      render(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      render(index + 1);
    }
  });

  slider.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse") pointerStart = event.clientX;
  });
  slider.addEventListener("pointerup", event => {
    if (pointerStart === null) return;
    const distance = event.clientX - pointerStart;
    if (Math.abs(distance) > 50) render(index + (distance < 0 ? 1 : -1));
    pointerStart = null;
    start();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      slider.classList.add("is-paused");
      stop();
    } else {
      slider.classList.toggle("is-paused", paused);
      start();
    }
  });

  render(0, false);
  start();
}

let catalogProducts = Array.isArray(window.sofievkaCatalog?.catalogProducts)
  ? window.sofievkaCatalog.catalogProducts
  : [
    ...(Array.isArray(window.sofievkaProducts) ? window.sofievkaProducts : []),
    ...(Array.isArray(window.sofievkaTermojetProducts) ? window.sofievkaTermojetProducts : []),
    ...(Array.isArray(window.sofievkaWiloProducts) ? window.sofievkaWiloProducts : [])
  ];

const searchItems = [
  { name: "Газові котли", meta: "Опалення", href: "/catalog/heating/heat-generation/gas-boilers" },
  { name: "Циркуляційні насоси", meta: "Насоси", href: "/catalog/heating/circulation-pumps" },
  { name: "Водоочищення", meta: "Фільтри та системи", href: "/catalog/water-treatment" },
  { name: "Розумний будинок", meta: "Автоматизація", href: "/catalog/smart-home" },
  { name: "Кондиціонери", meta: "Клімат", href: "/catalog/climate" },
  { name: "Монтаж і сервіс", meta: "Послуги", href: "services.html" },
  { name: "Бренди", meta: "Виробники", href: "brands.html" }
].concat(catalogProducts.map(product => ({
  name: product.title,
  meta: `${product.type} · ${product.sku}`,
  href: `product.html?id=${encodeURIComponent(product.id)}`
})));

function setupSearch() {
  const form = document.querySelector("[data-search]");
  if (form && window.sofievkaCatalogUI?.bindSearch) {
    window.sofievkaCatalogUI.bindSearch(form);
    return;
  }
  const input = form?.querySelector("input");
  const results = form?.querySelector(".search-results");
  if (!form || !input || !results) return;

  let requestId = 0;

  const getResults = async query => {
    const apiSearch = window.SofievkaCatalog?.search;
    if (typeof apiSearch === "function") {
      const items = await apiSearch(query, { limit: 5 });
      return Array.isArray(items) ? items : [];
    }

    const normalized = query.toLocaleLowerCase("uk");
    return searchItems
      .filter(item => `${item.name} ${item.meta}`.toLocaleLowerCase("uk").includes(normalized))
      .slice(0, 5);
  };

  const close = () => {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };

  const render = async () => {
    const query = input.value.trim();
    if (!query) {
      close();
      return;
    }

    const currentRequest = ++requestId;
    let matched = [];
    try {
      matched = await getResults(query);
    } catch (error) {
      console.error("Search provider failed", error);
    }
    if (currentRequest !== requestId) return;
    results.replaceChildren();

    if (!matched.length) {
      const empty = document.createElement("p");
      empty.textContent = "Нічого не знайдено. Спробуйте назву категорії.";
      results.append(empty);
    } else {
      matched.forEach(item => {
        const link = document.createElement("a");
        const name = document.createElement("strong");
        const meta = document.createElement("small");
        link.href = item.href;
        name.textContent = item.name;
        meta.textContent = item.meta;
        link.append(name, meta);
        link.addEventListener("click", close);
        results.append(link);
      });
    }

    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  input.addEventListener("input", render);
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
  });

  form.addEventListener("submit", event => {
    const first = results.querySelector("a");
    if (first) {
      event.preventDefault();
      first.click();
      return;
    }
    if (!input.value.trim()) {
      event.preventDefault();
      input.focus();
    }
  });

  document.addEventListener("click", event => {
    if (!event.target.closest("[data-search]")) close();
  });
}

const homepageProductIds = [
  "termojet-wp_20506",
  "MO650MECOSTD",
  "tekkhaus-1000015",
  "termojet-excel_84040BOX2",
  "CPV3ECOSTD",
  "tekkhaus-1000125",
  "termojet-excel_47025230",
  "FP1054CTPL"
];
const homepageSaleProductIds = [
  "tekkhaus-1000073",
  "termojet-new_41015110",
  "tekkhaus-1001009",
  "termojet-wp_19342",
  "tekkhaus-1001047",
  "termojet-new_42020170",
  "tekkhaus-1000116",
  "termojet-wp_19356"
];
let homepageProductById = new Map(catalogProducts.map(product => [product.id, product]));
const homepageIsAvailable = product => product
  && (product.availability === "in_stock" || product.availabilityLabel === "В наявності")
  && Number(product.pricing?.amount ?? product.price) > 0;
const homepageHasOffer = product => (Array.isArray(product.tags) && product.tags.includes("sale"))
  || Number(product.pricing?.oldAmount ?? product.oldPrice ?? 0) > Number(product.pricing?.amount ?? product.price);
let homepageProducts = homepageProductIds.map(id => homepageProductById.get(id)).filter(homepageIsAvailable);
let homepageSaleProducts = homepageSaleProductIds.map(id => homepageProductById.get(id))
  .filter(product => homepageIsAvailable(product) && homepageHasOffer(product));
let productGroups = {
  popular: homepageProducts,
  sale: homepageSaleProducts
};

// Supplier photos use different canvas proportions and amounts of baked-in whitespace.
// These presentation hints keep the visible equipment optically balanced without
// changing source assets or catalogue data.
const homepageProductMediaFit = {
  "termojet-wp_20506": "dominant",
  "termojet-excel_84040BOX2": "compact",
  CPV3ECOSTD: "compact",
  FP1054CTPL: "slender",
  ROBUST1000STD: "compact",
  "termojet-wp_8997": "slender"
};

function createProductCard(product, favoriteIds) {
  const productName = product.title || product.model;
  const available = product.availability === "in_stock" || product.inventory?.status === "in_stock" || product.availabilityLabel === "В наявності";
  const price = Number(product.pricing?.amount ?? product.price);
  const oldPrice = Number(product.pricing?.oldAmount ?? product.oldPrice ?? 0);
  const money = amount => `${new Intl.NumberFormat("uk-UA").format(amount)} грн`;
  const escapeMarkup = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
  const card = document.createElement("article");
  card.className = "product-card";
  const mediaFit = homepageProductMediaFit[product.id];
  if (mediaFit) card.dataset.mediaFit = mediaFit;
  card.innerHTML = `
    <a class="product-card__image" href="product.html?id=${encodeURIComponent(product.id)}"><img src="${escapeMarkup(product.image || product.images?.[0] || "")}" width="1536" height="1536" loading="lazy" alt="${escapeMarkup(productName)}"></a>
    <span class="product-card__status product-card__status--${available ? "available" : "unavailable"}">${escapeMarkup(product.availabilityLabel || (available ? "В наявності" : "Немає в наявності"))}</span>
    <span class="product-card__brand">${escapeMarkup(product.brand)}</span>
    <h3><a href="product.html?id=${encodeURIComponent(product.id)}">${escapeMarkup(productName)}</a></h3>
    <span class="product-card__code">${escapeMarkup(product.code || product.sku || product.id)}</span>
    <ul class="product-card__specs" aria-label="Дані товару"><li>${escapeMarkup(product.type || product.normalizedAttributes?.productType || "Інженерне обладнання")}</li></ul>
    <div class="product-card__price-group">${oldPrice > price ? `<del class="product-card__old-price">${money(oldPrice)}</del>` : ""}<strong class="product-card__price">${money(price)}</strong></div>
    <div class="product-card__actions">
      <button class="product-card__buy" type="button" data-buy="${escapeMarkup(product.id)}">До кошика</button>
      <button class="product-card__favorite${favoriteIds.has(product.id) ? " is-active" : ""}" type="button" data-favorite="${escapeMarkup(product.id)}" aria-label="Додати ${escapeMarkup(productName)} в обране" aria-pressed="${favoriteIds.has(product.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></button>
    </div>`;
  return card;
}

function setupProducts() {
  const sections = [...document.querySelectorAll("[data-product-section]")];
  const cartCount = document.querySelector("[data-cart-count]");
  const favoriteCount = document.querySelector("[data-favorite-count]");
  if (!sections.length) return;

  let storedCart = {};
  let storedFavorites = [];
  try { storedCart = JSON.parse(localStorage.getItem("sofievka-cart")) || {}; } catch {}
  try { storedFavorites = JSON.parse(localStorage.getItem("sofievka-favorites")) || []; } catch {}
  if (window.sofievkaCatalogScopedDataSource) {
    storedCart = Object.fromEntries(Object.entries(storedCart).filter(([, quantity]) => Number(quantity) > 0));
  } else {
    const validProductIds = new Set(catalogProducts.map(product => product.id));
    storedCart = Object.fromEntries(Object.entries(storedCart).filter(([id, quantity]) => validProductIds.has(id) && Number(quantity) > 0));
    storedFavorites = storedFavorites.filter(id => validProductIds.has(id));
  }
  const favoriteIds = new Set(storedFavorites);
  let cart = Object.values(storedCart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
  if (cartCount) cartCount.textContent = String(cart);
  if (favoriteCount) favoriteCount.textContent = String(favoriteIds.size);
  document.querySelector("[data-cart]")?.setAttribute("aria-label", `Кошик, ${cart} товарів`);
  document.querySelector("[data-favorites]")?.setAttribute("aria-label", `Обране, ${favoriteIds.size} товарів`);

  const render = (grid, group) => {
    grid.setAttribute("aria-busy", "true");
    grid.replaceChildren();
    const products = productGroups[group] || productGroups.popular;
    if (!products.length) {
      const message = document.createElement("p");
      message.className = "empty-state";
      message.textContent = group === "sale" ? "Акційні товари тимчасово недоступні." : "Каталог товарів тимчасово недоступний.";
      grid.append(message);
    } else {
      products.forEach(product => grid.append(createProductCard(product, favoriteIds)));
    }
    grid.scrollLeft = 0;
    grid.setAttribute("aria-busy", "false");
  };

  const scrollProducts = (grid, direction) => {
    const firstCard = grid.querySelector(".product-card");
    if (!firstCard) return;
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    grid.scrollBy({ left: direction * (firstCard.getBoundingClientRect().width + gap), behavior: reducedMotion ? "auto" : "smooth" });
  };

  const handleProductAction = event => {
    const buyButton = event.target.closest("[data-buy]");
    const favoriteButton = event.target.closest("[data-favorite]");

    if (buyButton) {
      cart += 1;
      storedCart[buyButton.dataset.buy] = (storedCart[buyButton.dataset.buy] || 0) + 1;
      localStorage.setItem("sofievka-cart", JSON.stringify(storedCart));
      if (cartCount) cartCount.textContent = String(cart);
      document.querySelector("[data-cart]")?.setAttribute("aria-label", `Кошик, ${cart} товарів`);
      showToast("Товар додано до кошика");
    }

    if (favoriteButton) {
      const id = favoriteButton.dataset.favorite;
      const active = favoriteIds.has(id);
      if (active) favoriteIds.delete(id);
      else favoriteIds.add(id);
      document.querySelectorAll("[data-favorite]").forEach(button => {
        if (button.dataset.favorite !== id) return;
        button.classList.toggle("is-active", !active);
        button.setAttribute("aria-pressed", String(!active));
      });
      if (favoriteCount) favoriteCount.textContent = String(favoriteIds.size);
      localStorage.setItem("sofievka-favorites", JSON.stringify([...favoriteIds]));
      document.querySelector("[data-favorites]")?.setAttribute("aria-label", `Обране, ${favoriteIds.size} товарів`);
      showToast(active ? "Товар видалено з обраного" : "Товар додано в обране");
    }
  };

  sections.forEach(section => {
    const grid = section.querySelector("[data-product-grid]");
    const previousButton = section.querySelector("[data-products-prev]");
    const nextButton = section.querySelector("[data-products-next]");
    const group = section.dataset.productGroup || "popular";
    if (!grid) return;

    previousButton?.addEventListener("click", () => scrollProducts(grid, -1));
    nextButton?.addEventListener("click", () => scrollProducts(grid, 1));
    grid.addEventListener("click", handleProductAction);
    render(grid, group);
  });
}

function setupHeaderActions() {
  document.querySelector("[data-favorites]")?.addEventListener("click", () => { window.location.href = "favorites.html"; });
  document.querySelector("[data-cart]")?.addEventListener("click", () => { window.location.href = "cart.html"; });
}

function setupReveal() {
  const elements = [...document.querySelectorAll("[data-reveal]")];
  if (reducedMotion || !("IntersectionObserver" in window)) return;

  elements.forEach(element => element.classList.add("reveal-pending"));

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      entry.target.classList.remove("reveal-pending");
      observer.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -40px" });

  elements.forEach(element => observer.observe(element));
}

function setupSignatureMotion() {
  if (reducedMotion) return;

  const motionSections = [...document.querySelectorAll("[data-motion]")];
  if (!motionSections.length) return;

  motionSections.forEach(section => {
    section.classList.add("motion-ready");

    const staggeredItems = section.matches('[data-motion="brands"]')
      ? section.querySelectorAll(".brand-logo-cell")
      : section.matches('[data-motion="process"]')
        ? section.querySelectorAll(".service-process article")
        : section.querySelectorAll(".b2b__benefits article");

    staggeredItems.forEach((item, itemIndex) => {
      item.style.setProperty("--motion-index", itemIndex);
    });
  });

  if (!("IntersectionObserver" in window)) {
    motionSections.forEach(section => section.classList.add("is-motion-active"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-motion-active");
      observer.unobserve(entry.target);
    });
  }, { threshold: .22, rootMargin: "0px 0px -8%" });

  motionSections.forEach(section => observer.observe(section));

  const installerSection = document.querySelector('[data-motion="installer"]');
  const motif = installerSection?.querySelector(".b2b__motif");
  if (!installerSection || !motif || !window.matchMedia("(pointer: fine)").matches) return;

  let animationFrame;
  installerSection.addEventListener("pointermove", event => {
    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(() => {
      const bounds = installerSection.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - .5) * 18;
      const y = ((event.clientY - bounds.top) / bounds.height - .5) * 12;
      motif.style.setProperty("--motif-x", `${x}px`);
      motif.style.setProperty("--motif-y", `${y}px`);
      animationFrame = null;
    });
  });

  installerSection.addEventListener("pointerleave", () => {
    motif.style.setProperty("--motif-x", "0px");
    motif.style.setProperty("--motif-y", "0px");
  });
}

// Brands come from the active catalogue (Supabase release once it has loaded, edited in the admin);
// the static registry only fills presentation details the database does not hold (logo theme).
function catalogBrandList() {
  const registry = Array.isArray(window.sofievkaBrandRegistry) ? window.sofievkaBrandRegistry : [];
  const live = Array.isArray(window.sofievkaBrands) ? window.sofievkaBrands : registry;
  const staticBySlug = new Map(registry.map(brand => [brand.slug, brand]));
  return live
    .map(brand => {
      const fallback = staticBySlug.get(brand.slug) || {};
      return { ...fallback, ...brand, logo: brand.logo || fallback.logo || "", description: brand.description || fallback.description || "" };
    })
    .filter(brand => brand.type === "catalog" && brand.visibility !== "hidden");
}

function featuredCatalogBrands() {
  return catalogBrandList()
    .filter(brand => brand.featured)
    .sort((first, second) => (first.featuredOrder ?? 999) - (second.featuredOrder ?? 999) || first.name.localeCompare(second.name, "uk"));
}

function createBrandMedia(brand, fallbackTarget) {
  const media = document.createElement("div");
  media.className = `brand-media${brand.logoTheme === "dark" ? " brand-media--dark" : ""}`;

  const renderFallback = () => {
    fallbackTarget?.classList.add("has-text-fallback");
    media.className = "brand-media";
    const fallback = document.createElement("span");
    fallback.className = "brand-media__fallback";
    fallback.textContent = brand.name;
    media.replaceChildren(fallback);
  };

  if (!brand.logo) {
    renderFallback();
    return media;
  }

  const image = document.createElement("img");
  image.src = brand.logo;
  image.alt = `Логотип ${brand.name}`;
  image.loading = "lazy";
  image.addEventListener("error", renderFallback, { once: true });
  media.append(image);
  return media;
}

function createLogoCell(brand, linkToDirectory = false, decorativeDuplicate = false) {
  const cell = document.createElement(linkToDirectory ? "a" : "div");
  cell.className = "brand-logo-cell";
  cell.dataset.brand = brand.slug;
  cell.dataset.brandType = brand.type;
  cell.dataset.futureHref = brand.futurePath;
  if (decorativeDuplicate) {
    cell.tabIndex = -1;
    cell.setAttribute("aria-hidden", "true");
  } else {
    cell.setAttribute("aria-label", brand.name);
  }
  if (linkToDirectory) cell.href = "brands.html";
  cell.append(createBrandMedia(brand, cell));
  return cell;
}

function createDirectoryCard(brand) {
  const card = document.createElement("article");
  card.className = "brand-directory-card";
  card.id = `brand-${brand.slug}`;
  card.dataset.brand = brand.slug;
  card.dataset.brandName = brand.name.toLocaleLowerCase("uk");
  card.dataset.brandType = brand.type;
  card.dataset.futureHref = brand.futurePath;

  const logo = createBrandMedia(brand, card);
  const content = document.createElement("div");
  content.className = "brand-directory-card__content";

  const name = document.createElement("strong");
  name.className = "brand-directory-card__name";
  name.textContent = brand.name;
  const description = document.createElement("p");
  description.textContent = brand.description;
  content.append(name, description);
  card.append(logo, content);
  return card;
}

function getBrandLetter(brand) {
  return brand.name.charAt(0).toLocaleUpperCase("uk");
}

function getLetterId(letter) {
  if (letter === "С") return "letter-cyrillic-s";
  return `letter-${letter.toLocaleLowerCase("uk")}`;
}

function setupHomepageBrands() {
  const wall = document.querySelector("[data-homepage-brands]");
  if (!wall) return;

  const brands = featuredCatalogBrands().slice(0, 9);
  const createGroup = decorativeDuplicate => {
    const group = document.createElement("div");
    group.className = "brand-wall__group";

    if (decorativeDuplicate) {
      group.setAttribute("aria-hidden", "true");
    } else {
      group.setAttribute("role", "list");
    }

    brands.forEach(brand => {
      const cell = createLogoCell(brand, true, decorativeDuplicate);
      if (!decorativeDuplicate) cell.setAttribute("role", "listitem");
      group.append(cell);
    });

    return group;
  };

  const track = document.createElement("div");
  track.className = "brand-wall__track";
  track.append(createGroup(false), createGroup(true));
  wall.replaceChildren(track);
}

// Stores come from the shop settings (site-settings.js, edited in /admin/settings).
function homepageStoreLocations() {
  const settings = window.sofievkaSiteSettings?.current;
  if (!settings) return {};
  return Object.fromEntries(settings.stores.map(store => [store.id, {
    name: store.city,
    kicker: store.title,
    address: store.address,
    phone: store.phones[0] || "",
    phoneHref: window.sofievkaSiteSettings.phoneHref(store.phones[0]),
    email: store.email,
    hours: store.hours,
    mapQuery: store.mapQuery || store.address
  }]));
}

function setupHomepageContact() {
  const form = document.querySelector("[data-home-contact-form]");
  if (!form) return;

  const storeInput = form.querySelector("[data-home-contact-store]");
  const map = document.querySelector(".home-contact__map iframe");
  const kicker = document.querySelector("[data-store-kicker]");
  const address = document.querySelector("[data-store-address]");
  const route = document.querySelector("[data-store-route]");
  const phone = document.querySelector("[data-store-phone]");
  const email = document.querySelector("[data-store-email]");
  const hours = document.querySelector("[data-store-hours]");

  let stores = homepageStoreLocations();
  let activeStore = Object.keys(stores)[0];
  const switcher = document.querySelector(".home-contact__store-switcher");
  const renderSwitcher = () => {
    if (!switcher) return;
    switcher.replaceChildren(...Object.entries(stores).map(([key, store]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.storeLocation = key;
      button.setAttribute("aria-pressed", String(key === activeStore));
      button.textContent = store.name;
      button.addEventListener("click", () => selectStore(key));
      return button;
    }));
    switcher.hidden = Object.keys(stores).length < 2;
  };

  const selectStore = key => {
    const store = stores[key];
    if (!store) return;
    activeStore = key;
    const storeButtons = [...document.querySelectorAll("[data-store-location]")];

    storeButtons.forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.storeLocation === key));
    });

    const encodedQuery = encodeURIComponent(store.mapQuery);
    if (map) {
      map.src = `https://www.google.com/maps?q=${encodedQuery}&output=embed`;
      map.title = `Магазин Софіївка у місті ${store.name} на мапі`;
    }
    if (kicker) kicker.textContent = store.kicker;
    if (address) address.textContent = store.address;
    if (route) route.href = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
    if (phone) {
      phone.textContent = store.phone;
      phone.href = store.phoneHref;
    }
    if (email) {
      email.textContent = store.email;
      email.href = `mailto:${store.email}`;
    }
    if (hours) {
      hours.replaceChildren();
      store.hours.forEach((line, index) => {
        if (index) hours.append(document.createElement("br"));
        hours.append(line);
      });
    }

    if (storeInput) storeInput.value = store.name;
    form.dataset.contactEmail = store.email;
    form.action = `mailto:${store.email}`;
  };

  renderSwitcher();
  selectStore(activeStore);
  window.sofievkaSiteSettings?.onChange(() => {
    stores = homepageStoreLocations();
    if (!stores[activeStore]) activeStore = Object.keys(stores)[0];
    renderSwitcher();
    selectStore(activeStore);
  });
  // Without the CRM (local builds) the form falls back to a prepared email.
  if (!window.sofievkaCrm?.available) {
    const note = form.querySelector("[data-home-contact-note]");
    if (note) note.textContent = "Відкриється ваш поштовий застосунок із заповненими даними.";
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const request = String(data.get("request") || "").trim();
    const store = String(data.get("store") || "Київ").trim();
    const recipient = form.dataset.contactEmail;
    const subject = `Зворотний дзвінок — ${name}`;
    const body = [
      `Магазин: ${store}`,
      `Ім'я: ${name}`,
      `Телефон: ${phone}`,
      request ? `Запит: ${request}` : "Запит: консультація щодо обладнання"
    ].join("\n");

    const crm = window.sofievkaCrm;
    if (!crm?.available) {
      window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    const idleLabel = submit?.innerHTML;
    let status = form.querySelector("[data-home-contact-status]");
    if (!status) {
      status = document.createElement("p");
      status.dataset.homeContactStatus = "";
      status.setAttribute("role", "status");
      status.className = "home-contact__status";
      form.append(status);
    }
    if (submit) { submit.disabled = true; submit.textContent = "Надсилаємо…"; }
    status.textContent = "";
    crm.submitLead({
      type: request ? "contact" : "callback",
      name,
      phone,
      subject: `Магазин: ${store}`,
      message: request,
      pageUrl: location.pathname
    }).then(result => {
      form.reset();
      status.textContent = `Дякуємо! Звернення № ${result?.number ?? ""} прийнято — передзвонимо найближчим часом.`;
    }).catch(error => {
      status.textContent = error?.message || "Не вдалося надіслати. Зателефонуйте нам, будь ласка.";
    }).finally(() => {
      if (submit) { submit.disabled = false; submit.innerHTML = idleLabel; }
    });
  });
}

// Delegated: the menu columns are re-rendered from /admin/menus by site-settings.js.
function setupFooterAccordion() {
  if (!document.querySelector("[data-footer-section]")) return;
  document.documentElement.classList.add("footer-accordion-ready");

  document.addEventListener("click", event => {
    const toggle = event.target.closest(".footer__toggle");
    const section = toggle?.closest("[data-footer-section]");
    if (!section) return;
    const open = section.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector("b").textContent = open ? "−" : "+";
  });
}

function setupBrandDirectory() {
  const groupsRoot = document.querySelector("[data-brand-groups]");
  const alphabet = document.querySelector("[data-brand-alphabet]");
  const searchForm = document.querySelector("[data-brand-search]");
  const searchInput = searchForm?.querySelector("input");
  const status = document.querySelector("[data-brand-search-status]");
  if (!groupsRoot || !alphabet) return;


  const alphabetOrder = ["A", "B", "D", "E", "F", "G", "K", "L", "M", "P", "R", "S", "С", "T", "V", "W"];
  const grouped = new Map(alphabetOrder.map(letter => [letter, []]));
  catalogBrandList().sort((first, second) => first.name.localeCompare(second.name, "uk")).forEach(brand => {
    const letter = getBrandLetter(brand);
    if (!grouped.has(letter)) grouped.set(letter, []);
    grouped.get(letter).push(brand);
  });

  grouped.forEach((groupBrands, letter) => {
    if (!groupBrands.length) return;
    const group = document.createElement("section");
    group.className = "brand-letter-group";
    group.id = getLetterId(letter);
    group.dataset.letter = letter;
    const heading = document.createElement("h3");
    heading.textContent = letter;
    const grid = document.createElement("div");
    grid.className = "brand-directory-grid";
    grid.replaceChildren(...groupBrands.map(createDirectoryCard));
    group.append(heading, grid);
    groupsRoot.append(group);

    const link = document.createElement("a");
    link.href = `#${group.id}`;
    link.textContent = letter;
    link.dataset.alphabetLetter = letter;
    alphabet.append(link);
  });

  const filterBrands = () => {
    const query = searchInput?.value.trim().toLocaleLowerCase("uk") || "";
    let visibleCount = 0;
    groupsRoot.querySelectorAll(".brand-letter-group").forEach(group => {
      let groupVisible = 0;
      group.querySelectorAll(".brand-directory-card").forEach(card => {
        const visible = !query || card.dataset.brandName.includes(query);
        card.hidden = !visible;
        if (visible) groupVisible += 1;
      });
      group.hidden = groupVisible === 0;
      visibleCount += groupVisible;
      alphabet.querySelector(`[data-alphabet-letter="${group.dataset.letter}"]`)?.toggleAttribute("hidden", groupVisible === 0);
    });
    if (status) status.textContent = query ? `Знайдено брендів: ${visibleCount}` : "";
  };

  searchInput?.addEventListener("input", filterBrands);
  searchForm?.addEventListener("submit", event => event.preventDefault());
}

async function prepareScopedHomepage() {
  const source = window.sofievkaCatalogScopedDataSource;
  if (!source) return;
  const [popular, sale] = await Promise.all([
    source.getCollection("homepage-products"),
    source.getCollection("homepage-sale-products")
  ]);
  const cards = [...new Map([...(popular?.products || []), ...(sale?.products || [])].map(product => [product.id, product])).values()];
  const bootstrap = window.sofievkaCatalogSnapshot;
  window.sofievkaInstallCatalogSnapshot(Object.freeze({ ...bootstrap, products: Object.freeze(cards) }), { useRawCatalog: false });
  window.sofievkaInstallPdp?.();
  const adaptedById = new Map(window.sofievkaCatalog.catalogProducts.map(product => [product.id, product]));
  catalogProducts = [...adaptedById.values()];
  homepageProductById = adaptedById;
  homepageProducts = (popular?.products || []).map(product => adaptedById.get(product.id)).filter(homepageIsAvailable);
  homepageSaleProducts = (sale?.products || []).map(product => adaptedById.get(product.id)).filter(product => homepageIsAvailable(product) && homepageHasOffer(product));
  productGroups = { popular: homepageProducts, sale: homepageSaleProducts };
}

function renderHomepageCatalogFailure() {
  document.querySelectorAll("[data-product-grid]").forEach(grid => {
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = `<div class="catalog-empty" role="alert"><span aria-hidden="true">!</span><h3>Каталог тимчасово недоступний</h3><p>Не вдалося отримати дані каталогу. Локальне джерело не підставляється автоматично.</p><button class="button button--primary" type="button" data-catalog-retry>Спробувати ще раз</button></div>`;
  });
  document.querySelectorAll("[data-products-prev], [data-products-next]").forEach(button => { button.disabled = true; });
  document.addEventListener("click", event => { if (event.target.closest("[data-catalog-retry]")) location.reload(); });
}

(async function initializeHomepage() {
  let catalogLoadError = null;
  try {
    if (window.sofievkaCatalogDataReady) await window.sofievkaCatalogDataReady;
    await prepareScopedHomepage();
  } catch (error) {
    catalogLoadError = error;
    console.error("Scoped homepage collections failed", error);
  }
  if (window.sofievkaCatalogUIReady) await window.sofievkaCatalogUIReady;
  setupCatalogMenu();
  setupStorefrontCategories();
  setupHeroSlider();
  setupSearch();
  if (catalogLoadError && window.sofievkaCatalogRemoteRequested) renderHomepageCatalogFailure();
  else setupProducts();
  setupHeaderActions();
  setupHomepageBrands();
  setupHomepageContact();
  setupBrandDirectory();
  setupFooterAccordion();
  setupReveal();
  setupSignatureMotion();
})();

// Homepage banners from /admin/banners, served by the public RPC get_homepage_banners.
// index.html keeps the static slides and tiles as first paint and fallback; the copy saved on
// the last visit renders straight away and the fresh copy replaces it when it arrives. Every
// text goes in through textContent and every address through bannerSafeUrl.
const HOMEPAGE_BANNERS_CACHE = "sofievka.homepageBanners.v1";

function bannerSafeUrl(value) {
  const url = String(value || "").trim();
  if (/^https:\/\/[^/\s"'<>\\]+(\/[^\s"'<>\\]*)?$/i.test(url)) return url;
  if (/^\/([^/\\\s"'<>][^\s"'<>\\]*)?$/.test(url)) return url;
  if (/^assets\/[^\s"'<>\\]+$/.test(url)) return `/${url}`;
  return "";
}

function bannerElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bannerFocus(value) {
  const focus = Number(value);
  return Number.isFinite(focus) ? Math.min(100, Math.max(0, Math.round(focus))) : 50;
}

// The banner image, wrapped in <picture> when a separate phone image is set.
function bannerImage(banner, className, { eager = false, lazy = !eager, focus = true } = {}) {
  const image = bannerElement("img", className);
  image.src = bannerSafeUrl(banner.imageUrl);
  image.alt = banner.imageAlt || "";
  if (!banner.imageAlt) image.setAttribute("aria-hidden", "true");
  if (eager) image.setAttribute("fetchpriority", "high");
  if (lazy) image.loading = "lazy";
  if (focus) image.style.objectPosition = `${bannerFocus(banner.imageFocus)}% center`;
  const mobile = bannerSafeUrl(banner.mobileImageUrl);
  if (!mobile) return image;
  const picture = document.createElement("picture");
  const source = document.createElement("source");
  source.media = "(max-width: 640px)";
  source.srcset = mobile.replace(/,/g, "%2C");
  picture.append(source, image);
  return picture;
}

function bannerButtonContent(label) {
  const arrow = bannerElement("span", "arrow-mark");
  arrow.setAttribute("aria-hidden", "true");
  return [label, " ", arrow];
}

function buildHeroSlide(banner, index, total) {
  const slide = bannerElement("article", `storefront-slide${index === 0 ? " is-active" : ""}`);
  slide.dataset.slide = "";
  slide.setAttribute("aria-label", `Слайд ${index + 1} з ${total}`);
  const link = bannerElement("a", "storefront-slide__link");
  link.href = bannerSafeUrl(banner.linkUrl) || "/catalog";
  const content = bannerElement("div", "storefront-slide__content");
  const logo = bannerSafeUrl(banner.logoUrl);
  if (logo) {
    const brand = bannerElement("img", "storefront-slide__brand storefront-slide__brand--original");
    brand.src = logo;
    brand.alt = banner.logoAlt || "";
    brand.width = 180;
    brand.height = 72;
    content.append(brand);
  }
  if (banner.kicker) {
    const kicker = bannerElement("p", "storefront-slide__technical");
    String(banner.kicker).split("\n").forEach((line, lineIndex) => {
      if (lineIndex) kicker.append(document.createElement("br"));
      kicker.append(line);
    });
    content.append(kicker);
  }
  // The first slide carries the page heading, as in the static markup.
  content.append(bannerElement(index === 0 ? "h1" : "h2", "", banner.title));
  if (banner.text) content.append(bannerElement("p", "storefront-slide__lead", banner.text));
  if (banner.buttonLabel) {
    const button = bannerElement("span", "button button--primary");
    button.append(...bannerButtonContent(banner.buttonLabel));
    content.append(button);
  }
  link.append(bannerImage(banner, "storefront-slide__image", { eager: index === 0 }), content);
  slide.append(link);
  return slide;
}

function buildPromoTile(banner) {
  const product = banner.layout === "product";
  const tile = bannerElement("article", `storefront-promo storefront-promo--${product ? "water" : "climate"}`);
  const copy = bannerElement("div", "storefront-promo__copy");
  if (banner.kicker) copy.append(bannerElement("span", "storefront-promo__brand", banner.kicker));
  copy.append(bannerElement("h2", "", banner.title));
  if (banner.text) copy.append(bannerElement("p", "", banner.text));
  const link = bannerElement("a", "button button--primary storefront-promo__action");
  link.href = bannerSafeUrl(banner.linkUrl) || "/catalog";
  link.append(...bannerButtonContent(banner.buttonLabel || "Детальніше"));
  // The tiles sit on the first screen next to the slider, so their images load right away.
  const image = bannerImage(banner, "", { focus: !product, lazy: false });
  tile.append(...(product ? [copy, image, link] : [image, copy, link]));
  return tile;
}

function isValidBanner(banner) {
  return Boolean(banner && typeof banner === "object" && typeof banner.title === "string" && banner.title.trim()
    && bannerSafeUrl(banner.imageUrl) && bannerSafeUrl(banner.linkUrl));
}

function applyHomepageBanners(data) {
  const hero = (Array.isArray(data?.hero) ? data.hero : []).filter(isValidBanner).slice(0, 8);
  const promo = (Array.isArray(data?.promo) ? data.promo : []).filter(isValidBanner).slice(0, 2);
  const slider = document.querySelector("[data-slider]");
  if (slider && hero.length) {
    // A fresh copy of the section drops the old listeners; setupHeroSlider binds the new one.
    const wasReady = slider.dataset.sliderReady === "true";
    const fresh = slider.cloneNode(true);
    delete fresh.dataset.sliderReady;
    fresh.classList.remove("is-paused");
    const track = fresh.querySelector("[data-slider-track]");
    const dots = fresh.querySelector(".storefront-showcase__dots");
    const footer = fresh.querySelector(".storefront-showcase__footer");
    track.style.transform = "";
    track.replaceChildren(...hero.map((banner, index) => buildHeroSlide(banner, index, hero.length)));
    dots?.replaceChildren(...hero.map((banner, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.dataset.slideDot = String(index);
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-selected", String(index === 0));
      dot.setAttribute("aria-label", `Показати слайд ${index + 1}`);
      if (index === 0) dot.className = "is-active";
      return dot;
    }));
    if (footer) footer.style.display = hero.length > 1 ? "" : "none";
    fresh.dataset.sliderAutoplay = hero.length > 1 ? "true" : "false";
    const liveRegion = fresh.querySelector("[data-slide-live]");
    if (liveRegion) liveRegion.textContent = "";
    slider.replaceWith(fresh);
    if (wasReady) setupHeroSlider();
  }
  const promos = document.querySelector(".storefront-promos");
  if (promos && promo.length) {
    promos.replaceChildren(...promo.map(buildPromoTile));
    promos.classList.toggle("storefront-promos--single", promo.length === 1);
  }
}

function setupHomepageBanners() {
  if (!document.querySelector("[data-slider]")) return;
  let cached = null;
  try { cached = window.localStorage.getItem(HOMEPAGE_BANNERS_CACHE); } catch { /* storage blocked */ }
  if (cached) {
    try { applyHomepageBanners(JSON.parse(cached)); } catch { /* ignore a broken cache */ }
  }
  const config = window.SOFIEVKA_CATALOG_CONFIG?.supabase;
  if (!config?.url || !config?.publishableKey) return;
  fetch(`${config.url}/rest/v1/rpc/get_homepage_banners`, {
    method: "POST",
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10000)
  })
    .then(response => (response.ok ? response.json() : null))
    .then(body => {
      if (!body || typeof body !== "object" || !Array.isArray(body.hero) || !Array.isArray(body.promo)) return;
      const serialized = JSON.stringify(body);
      try { window.localStorage.setItem(HOMEPAGE_BANNERS_CACHE, serialized); } catch { /* private mode */ }
      if (serialized !== cached) applyHomepageBanners(body);
    })
    .catch(() => { /* keep the static or cached banners */ });
}

setupHomepageBanners();
