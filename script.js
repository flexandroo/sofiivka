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

function storefrontCategoryGroups() {
  const catalog = window.sofievkaCatalog;
  if (!catalog) return [];
  return catalog.activeSections.map(section => ({
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
  navigation.querySelectorAll("[data-storefront-category]").forEach(button => button.remove());
  groups.forEach(group => {
    const button = document.createElement("button");
    button.className = "storefront-category";
    button.type = "button";
    button.dataset.storefrontCategory = group.id;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "storefront-subcategories");
    const strong = document.createElement("strong");
    strong.textContent = group.title;
    const description = document.createElement("span");
    description.textContent = group.description;
    button.append(strong, description);
    navigation.insertBefore(button, panel);
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
    if (autoplay && !reducedMotion && !paused) timer = window.setInterval(() => render(index + 1, false), 7000);
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

const catalogProducts = [
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
  "termojet-excel_84040BOX2",
  "CPV3ECOSTD",
  "termojet-excel_47025230",
  "FP1054CTPL",
  "ROBUST1000STD",
  "termojet-wp_8997"
];
const homepageProducts = homepageProductIds
  .map(id => catalogProducts.find(product => product.id === id))
  .filter(Boolean);
const homepageSaleProducts = catalogProducts
  .filter(product => (
    product.typeSlug === "rozprodazh"
    || product.primaryCategory === "termojet-rozprodazh"
    || product.type === "Акція"
  ) && (product.availability === "in_stock" || product.availabilityLabel === "В наявності"))
  .slice(0, 8);
const productGroups = {
  popular: homepageProducts.length >= 5 ? homepageProducts : catalogProducts.slice(0, 8),
  sale: homepageSaleProducts.length >= 5 ? homepageSaleProducts : catalogProducts.slice(8, 16)
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
  const available = product.availability === "in_stock" || product.availabilityLabel === "В наявності";
  const escapeMarkup = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
  const card = document.createElement("article");
  card.className = "product-card";
  const mediaFit = homepageProductMediaFit[product.id];
  if (mediaFit) card.dataset.mediaFit = mediaFit;
  card.innerHTML = `
    <a class="product-card__image" href="product.html?id=${encodeURIComponent(product.id)}"><img src="${escapeMarkup(product.image)}" width="1536" height="1536" loading="lazy" alt="${escapeMarkup(productName)}"></a>
    <span class="product-card__status product-card__status--${available ? "available" : "unavailable"}">${escapeMarkup(product.availabilityLabel || (available ? "В наявності" : "Немає в наявності"))}</span>
    <span class="product-card__brand">${escapeMarkup(product.brand)}</span>
    <h3><a href="product.html?id=${encodeURIComponent(product.id)}">${escapeMarkup(productName)}</a></h3>
    <span class="product-card__code">${escapeMarkup(product.code)}</span>
    <ul class="product-card__specs" aria-label="Дані товару"><li>${escapeMarkup(product.type)}</li></ul>
    <strong class="product-card__price">${new Intl.NumberFormat("uk-UA").format(product.price)} грн</strong>
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
  const validProductIds = new Set(catalogProducts.map(product => product.id));
  storedCart = Object.fromEntries(Object.entries(storedCart).filter(([id, quantity]) => validProductIds.has(id) && Number(quantity) > 0));
  storedFavorites = storedFavorites.filter(id => validProductIds.has(id));
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
      message.textContent = "Каталог товарів тимчасово недоступний.";
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

const brands = Array.isArray(window.sofievkaBrands) ? window.sofievkaBrands : [];
const catalogBrands = brands.filter(brand => brand.type === "catalog");
const featuredBrands = catalogBrands
  .filter(brand => brand.featured)
  .sort((first, second) => first.featuredOrder - second.featuredOrder);

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

  const brands = featuredBrands.slice(0, 9);
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

const homepageStoreLocations = {
  kyiv: {
    name: "Київ",
    kicker: "Магазин у Києві",
    address: "с. Софіївська Борщагівка, вул. Київська, 3",
    phone: "+38 (050) 358-22-84",
    phoneHref: "tel:+380503582284",
    email: "sofievkakyiv@ukr.net",
    hours: ["Пн–Пт 9:00–18:00", "Сб 9:00–14:00"],
    mapQuery: "с. Софіївська Борщагівка, вул. Київська, 3"
  },
  zhytomyr: {
    name: "Житомир",
    kicker: "Магазин у Житомирі",
    address: "м. Житомир, проспект Незалежності, 79",
    phone: "+38 (067) 726-00-00",
    phoneHref: "tel:+380677260000",
    email: "sofievka.zt.ua@gmail.com",
    hours: ["Пн–Пт 8:30–17:00", "Сб 8:30–14:00"],
    mapQuery: "Житомир, проспект Незалежності, 79"
  }
};

function setupHomepageContact() {
  const form = document.querySelector("[data-home-contact-form]");
  if (!form) return;

  const storeInput = form.querySelector("[data-home-contact-store]");
  const storeButtons = [...document.querySelectorAll("[data-store-location]")];
  const map = document.querySelector(".home-contact__map iframe");
  const kicker = document.querySelector("[data-store-kicker]");
  const address = document.querySelector("[data-store-address]");
  const route = document.querySelector("[data-store-route]");
  const phone = document.querySelector("[data-store-phone]");
  const email = document.querySelector("[data-store-email]");
  const hours = document.querySelector("[data-store-hours]");

  const selectStore = key => {
    const store = homepageStoreLocations[key];
    if (!store) return;

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

  storeButtons.forEach(button => {
    button.addEventListener("click", () => selectStore(button.dataset.storeLocation));
  });

  selectStore("kyiv");

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

    window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

function setupFooterAccordion() {
  const sections = [...document.querySelectorAll("[data-footer-section]")];
  if (!sections.length) return;
  document.documentElement.classList.add("footer-accordion-ready");

  sections.forEach(section => {
    const toggle = section.querySelector(".footer__toggle");
    toggle?.addEventListener("click", () => {
      const open = section.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.querySelector("b").textContent = open ? "−" : "+";
    });
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
  catalogBrands.forEach(brand => {
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

setupCatalogMenu();
setupStorefrontCategories();
setupHeroSlider();
setupSearch();
setupProducts();
setupHeaderActions();
setupHomepageBrands();
setupHomepageContact();
setupBrandDirectory();
setupFooterAccordion();
setupReveal();
setupSignatureMotion();
