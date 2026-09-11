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
  window.sofievkaCatalogUI?.bindMenu({ toggle, menu });
}

function setupCatalogArchitecture() {
  const ui = window.sofievkaCatalogUI;
  if (!ui) return;
  const menu = document.querySelector("#catalog-menu");
  const mount = menu?.querySelector("[data-catalog-menu-root]");
  if (mount) {
    mount.innerHTML = ui.megaMenu();
  }
  const homeCatalog = document.querySelector("[data-home-catalog]");
  if (homeCatalog) homeCatalog.innerHTML = ui.homeCards();
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

    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", String(active));
      dot.tabIndex = active ? 0 : -1;
    });

    if (announce && live) live.textContent = `Показано слайд ${index + 1} з ${slides.length}`;
  };

  const stop = () => window.clearInterval(timer);
  const start = () => {
    stop();
    if (!reducedMotion && !paused) timer = window.setInterval(() => render(index + 1, false), 7000);
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
    stop();
  });
  slider.addEventListener("mouseleave", () => {
    paused = false;
    start();
  });
  slider.addEventListener("focusin", () => {
    paused = true;
    stop();
  });
  slider.addEventListener("focusout", event => {
    if (!slider.contains(event.relatedTarget)) {
      paused = false;
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
    if (document.hidden) stop();
    else start();
  });

  render(0, false);
  start();
}

const catalogProducts = Array.isArray(window.sofievkaCatalog?.products)
  ? window.sofievkaCatalog.products
  : [
      ...(Array.isArray(window.sofievkaProducts) ? window.sofievkaProducts : []),
      ...(Array.isArray(window.sofievkaTermojetProducts) ? window.sofievkaTermojetProducts : [])
    ];

function setupSearch() {
  window.sofievkaCatalogUI?.bindSearch(document.querySelector("[data-search]"));
}

const productGroups = {
  popular: catalogProducts.slice(0, 4)
};

function createProductCard(product, favoriteIds, compareIds, storedCart) {
  const template = document.createElement("template");
  template.innerHTML = window.sofievkaCatalogUI?.renderProductCard(product, {
    variant: "compact",
    favoriteIds,
    compareIds,
    cart: storedCart
  }) || "";
  return template.content.firstElementChild;
}

function setupProducts() {
  const grid = document.querySelector("[data-product-grid]");
  const tabs = [...document.querySelectorAll("[data-product-tab]")];
  const cartCount = document.querySelector("[data-cart-count]");
  const favoriteCount = document.querySelector("[data-favorite-count]");
  if (!grid) return;

  let storedCart = {};
  let storedFavorites = [];
  let storedCompare = [];
  try { storedCart = JSON.parse(localStorage.getItem("sofievka-cart")) || {}; } catch {}
  try { storedFavorites = JSON.parse(localStorage.getItem("sofievka-favorites")) || []; } catch {}
  try { storedCompare = JSON.parse(localStorage.getItem("sofievka-compare")) || []; } catch {}
  const validProductIds = new Set(catalogProducts.map(product => product.id));
  storedCart = Object.fromEntries(Object.entries(storedCart).filter(([id, quantity]) => validProductIds.has(id) && Number(quantity) > 0));
  storedFavorites = storedFavorites.filter(id => validProductIds.has(id));
  storedCompare = storedCompare.filter(id => validProductIds.has(id)).slice(0, 4);
  const favoriteIds = new Set(storedFavorites);
  const compareIds = new Set(storedCompare);
  let cart = Object.values(storedCart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
  if (cartCount) cartCount.textContent = String(cart);
  if (favoriteCount) favoriteCount.textContent = String(favoriteIds.size);
  document.querySelector("[data-cart]")?.setAttribute("aria-label", `Кошик, ${cart} товарів`);
  document.querySelector("[data-favorites]")?.setAttribute("aria-label", `Обране, ${favoriteIds.size} товарів`);

  const render = group => {
    grid.setAttribute("aria-busy", "true");
    grid.replaceChildren();
    const products = productGroups[group] || productGroups.popular;
    if (!products.length) {
      const message = document.createElement("p");
      message.className = "empty-state";
      message.textContent = "Каталог товарів тимчасово недоступний.";
      grid.append(message);
    } else {
      products.forEach(product => grid.append(createProductCard(product, favoriteIds, compareIds, storedCart)));
    }
    window.sofievkaCatalogUI?.trackProductImages(grid);
    grid.setAttribute("aria-busy", "false");
  };

  tabs.forEach(tab => tab.addEventListener("click", () => {
    tabs.forEach(item => {
      const active = item === tab;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
    });
    render(tab.dataset.productTab);
  }));

  grid.addEventListener("click", event => {
    const buyButton = event.target.closest("[data-add]");
    const favoriteButton = event.target.closest("[data-favorite]");
    const compareButton = event.target.closest("[data-compare]");

    if (buyButton) {
      cart += 1;
      storedCart[buyButton.dataset.add] = (storedCart[buyButton.dataset.add] || 0) + 1;
      localStorage.setItem("sofievka-cart", JSON.stringify(storedCart));
      if (cartCount) cartCount.textContent = String(cart);
      document.querySelector("[data-cart]")?.setAttribute("aria-label", `Кошик, ${cart} товарів`);
      buyButton.classList.add("is-in-cart");
      buyButton.textContent = `У кошику · ${storedCart[buyButton.dataset.add]}`;
      buyButton.setAttribute("aria-label", `У кошику ${storedCart[buyButton.dataset.add]} шт. Додати ще`);
      showToast("Товар додано до кошика");
    }

    if (favoriteButton) {
      const id = favoriteButton.dataset.favorite;
      const active = favoriteIds.has(id);
      if (active) favoriteIds.delete(id);
      else favoriteIds.add(id);
      favoriteButton.classList.toggle("is-active", !active);
      favoriteButton.setAttribute("aria-pressed", String(!active));
      favoriteButton.setAttribute("aria-label", !active ? "Видалити з обраного" : "Додати в обране");
      if (favoriteCount) favoriteCount.textContent = String(favoriteIds.size);
      localStorage.setItem("sofievka-favorites", JSON.stringify([...favoriteIds]));
      document.querySelector("[data-favorites]")?.setAttribute("aria-label", `Обране, ${favoriteIds.size} товарів`);
      showToast(active ? "Товар видалено з обраного" : "Товар додано в обране");
    }

    if (compareButton) {
      const id = compareButton.dataset.compare;
      const product = catalogProducts.find(item => item.id === id);
      const first = catalogProducts.find(item => item.id === [...compareIds][0]);
      if (compareIds.has(id)) {
        compareIds.delete(id);
        compareButton.classList.remove("is-active");
        compareButton.setAttribute("aria-pressed", "false");
        compareButton.setAttribute("aria-label", "Додати до порівняння");
        compareButton.querySelector("span").textContent = "Порівняти";
        showToast("Товар видалено з порівняння");
      } else if (first && first.compareType !== product?.compareType) {
        showToast(`Порівнювати можна лише товари типу «${first.primaryCategoryName}»`);
      } else if (compareIds.size >= 4) {
        showToast("У порівнянні вже 4 товари");
      } else if (product) {
        compareIds.add(id);
        compareButton.classList.add("is-active");
        compareButton.setAttribute("aria-pressed", "true");
        compareButton.setAttribute("aria-label", "Видалити з порівняння");
        compareButton.querySelector("span").textContent = "У порівнянні";
        showToast("Товар додано до порівняння");
      }
      localStorage.setItem("sofievka-compare", JSON.stringify([...compareIds]));
    }
  });

  render("popular");
}

function setupHeaderActions() {
  document.querySelector("[data-profile]")?.addEventListener("click", () => { window.location.href = "account.html"; });
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
  if (linkToDirectory) cell.href = `/brands/${encodeURIComponent(brand.slug)}`;
  cell.append(createBrandMedia(brand, cell));
  return cell;
}

function createDirectoryCard(brand) {
  const card = document.createElement("a");
  card.className = "brand-directory-card";
  card.href = `/brands/${encodeURIComponent(brand.slug)}`;
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

  const brands = featuredBrands.slice(0, 10);
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

setupCatalogArchitecture();
setupCatalogMenu();
setupHeroSlider();
setupSearch();
setupProducts();
setupHeaderActions();
setupHomepageBrands();
setupBrandDirectory();
setupFooterAccordion();
setupReveal();
setupSignatureMotion();
