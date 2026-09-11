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

const searchItems = [
  { name: "Газові котли", meta: "Опалення", href: "catalog.html?category=heating" },
  { name: "Циркуляційні насоси", meta: "Насоси", href: "catalog.html?category=water" },
  { name: "Радіатори", meta: "Опалення", href: "catalog.html?category=heating" },
  { name: "Водонагрівачі", meta: "Гаряча вода", href: "catalog.html?category=water" },
  { name: "Кондиціонери", meta: "Клімат", href: "solutions.html" },
  { name: "Труби та фітинги", meta: "Сантехніка", href: "catalog.html" },
  { name: "Монтаж і сервіс", meta: "Послуги", href: "services.html" },
  { name: "Бренди", meta: "Виробники", href: "brands.html" }
];

function setupSearch() {
  const form = document.querySelector("[data-search]");
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

// Homepage product data follows the same shape as the future catalog response.
const homepageProducts = {
  boiler: {
    id: "boiler",
    brand: "Vaillant",
    model: "ecoTEC pure VUW 246/7-2",
    code: "Модель VUW 246/7-2",
    specs: ["24 кВт", "конденсаційний", "2 контури"],
    price: "Ціну уточнюйте",
    oldPrice: "",
    availability: "Наявність уточнюйте",
    image: "assets/images/product-boiler.webp"
  },
  pump: {
    id: "pump",
    brand: "Grundfos",
    model: "ALPHA1 L 25-60 180",
    code: "Модель ALPHA1 L 25-60 180",
    specs: ["Напір 6 м", "до 3,6 м³/год", "180 мм"],
    price: "Ціну уточнюйте",
    oldPrice: "",
    availability: "Наявність уточнюйте",
    image: "assets/images/product-pump.webp"
  },
  radiator: {
    id: "radiator",
    brand: "Korado",
    model: "RADIK KLASIK 22 500 × 1000",
    code: "Модель RADIK KLASIK 22",
    specs: ["тип 22", "500 × 1000 мм", "бокове підключення"],
    price: "Ціну уточнюйте",
    oldPrice: "",
    availability: "Наявність уточнюйте",
    image: "assets/images/product-radiator.webp"
  },
  heater: {
    id: "heater",
    brand: "Atlantic",
    model: "O’Pro Profi VM 080 D400-1-M",
    code: "Модель VM 080 D400-1-M",
    specs: ["75 л", "1,5 кВт", "вертикальний"],
    price: "Ціну уточнюйте",
    oldPrice: "",
    availability: "Наявність уточнюйте",
    image: "assets/images/product-water-heater.webp"
  }
};

const productGroups = {
  popular: [
    homepageProducts.boiler,
    homepageProducts.pump,
    homepageProducts.radiator,
    homepageProducts.heater
  ]
};

function createProductCard(product, favoriteIds) {
  const productName = `${product.brand} ${product.model}`;
  const escapeMarkup = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
  const card = document.createElement("article");
  card.className = "product-card";
  card.innerHTML = `
    <div class="product-card__image"><img src="${escapeMarkup(product.image)}" width="1536" height="1536" loading="lazy" alt="${escapeMarkup(productName)}"></div>
    <span class="product-card__status product-card__status--pending">${escapeMarkup(product.availability)}</span>
    <span class="product-card__brand">${escapeMarkup(product.brand)}</span>
    <h3>${escapeMarkup(product.model)}</h3>
    <span class="product-card__code">${escapeMarkup(product.code)}</span>
    <ul class="product-card__specs" aria-label="Ключові характеристики">${product.specs.slice(0, 3).map(spec => `<li>${escapeMarkup(spec)}</li>`).join("")}</ul>
    <strong class="product-card__price">${escapeMarkup(product.price)}</strong>
    <span class="product-card__old-price">${escapeMarkup(product.oldPrice)}</span>
    <div class="product-card__actions">
      <button class="product-card__buy" type="button" data-buy="${escapeMarkup(product.id)}">Додати до запиту</button>
      <button class="product-card__favorite${favoriteIds.has(product.id) ? " is-active" : ""}" type="button" data-favorite="${escapeMarkup(product.id)}" aria-label="Додати ${escapeMarkup(productName)} в обране" aria-pressed="${favoriteIds.has(product.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></button>
    </div>`;
  return card;
}

function setupProducts() {
  const grid = document.querySelector("[data-product-grid]");
  const tabs = [...document.querySelectorAll("[data-product-tab]")];
  const cartCount = document.querySelector("[data-cart-count]");
  const favoriteCount = document.querySelector("[data-favorite-count]");
  if (!grid) return;

  let storedCart = {};
  let storedFavorites = [];
  try { storedCart = JSON.parse(localStorage.getItem("sofievka-cart")) || {}; } catch {}
  try { storedFavorites = JSON.parse(localStorage.getItem("sofievka-favorites")) || []; } catch {}
  const favoriteIds = new Set(storedFavorites);
  let cart = Object.values(storedCart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
  if (cartCount) cartCount.textContent = String(cart);
  if (favoriteCount) favoriteCount.textContent = String(favoriteIds.size);

  const render = group => {
    grid.setAttribute("aria-busy", "true");
    grid.replaceChildren();
    productGroups[group].forEach(product => grid.append(createProductCard(product, favoriteIds)));
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
      favoriteButton.classList.toggle("is-active", !active);
      favoriteButton.setAttribute("aria-pressed", String(!active));
      if (favoriteCount) favoriteCount.textContent = String(favoriteIds.size);
      localStorage.setItem("sofievka-favorites", JSON.stringify([...favoriteIds]));
      document.querySelector("[data-favorites]")?.setAttribute("aria-label", `Обране, ${favoriteIds.size} товарів`);
      showToast(active ? "Товар видалено з обраного" : "Товар додано в обране");
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

function createLogoCell(brand, linkToDirectory = false) {
  const cell = document.createElement(linkToDirectory ? "a" : "div");
  cell.className = "brand-logo-cell";
  cell.dataset.brand = brand.slug;
  cell.dataset.brandType = brand.type;
  cell.dataset.futureHref = brand.futurePath;
  cell.setAttribute("aria-label", brand.name);
  if (linkToDirectory) cell.href = `brands.html#brand-${brand.slug}`;
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
  const cells = featuredBrands.slice(0, 10).map(brand => {
    const cell = createLogoCell(brand, true);
    cell.setAttribute("role", "listitem");
    return cell;
  });
  wall.replaceChildren(...cells);
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
setupHeroSlider();
setupSearch();
setupProducts();
setupHeaderActions();
setupHomepageBrands();
setupBrandDirectory();
setupFooterAccordion();
setupReveal();
