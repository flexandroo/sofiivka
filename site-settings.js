/* Shop settings shared by every page: stores and contacts, checkout options, social links, header
 * and footer menus, analytics tags and the cookie consent banner.
 * Values are edited in /admin/settings (menus in /admin/menus) and served by the public RPC get_site_settings.
 * The defaults below render the first paint (and work offline); the latest saved copy is cached
 * per browser, and the fresh copy replaces it once loaded. Elements opt in with data-site-* hooks. */
(function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    company: { name: "Торговий дім «Софіївка»" },
    stores: [
      {
        id: "kyiv",
        city: "Київ",
        title: "Магазин у Києві",
        address: "с. Софіївська Борщагівка, вул. Київська, 3",
        mapQuery: "с. Софіївська Борщагівка, вул. Київська, 3",
        phones: ["+38 (050) 358-22-84"],
        email: "sofievkakyiv@ukr.net",
        hours: ["Пн–Пт 9:00–18:00", "Сб 9:00–14:00"],
        pickup: true
      },
      {
        id: "zhytomyr",
        city: "Житомир",
        title: "Магазин у Житомирі",
        address: "м. Житомир, проспект Незалежності, 79",
        mapQuery: "Житомир, проспект Незалежності, 79",
        phones: ["+38 (067) 726-00-00"],
        email: "sofievka.zt.ua@gmail.com",
        hours: ["Пн–Пт 8:30–17:00", "Сб 8:30–14:00"],
        pickup: true
      }
    ],
    checkout: {
      deliveryMethods: [
        { id: "carrier", enabled: true, title: "Доставка перевізником по Україні", description: "Нова пошта або інший перевізник — погодимо під час підтвердження." },
        { id: "pickup", enabled: true, title: "Самовивіз з магазину", description: "Після підтвердження готовності замовлення." }
      ],
      paymentTitle: "Після підтвердження менеджером",
      paymentDescription: "Рахунок, оплата на картку або при отриманні — залежно від товару та доставки."
    },
    social: { instagram: "", facebook: "", youtube: "", telegram: "", viber: "" },
    integrations: { ga4MeasurementId: "", gtmContainerId: "", metaPixelId: "", searchConsoleToken: "" },
    seo: { pages: [] },
    // Same as the seed in 20261002001800_menus_cookies_v1 and the static first-paint markup
    // (page-shell.js, index.html). The footer column «Каталог» is built from the catalogue.
    menus: {
      header: [
        { label: "Про нас", href: "/about", children: [] },
        { label: "Рішення", href: "/solutions", children: [] },
        { label: "Монтаж", href: "/installation", children: [] },
        { label: "Сервіс", href: "/service-center", children: [] },
        { label: "Доставка й оплата", href: "/delivery", children: [] },
        { label: "Контакти", href: "/contact", children: [] }
      ],
      footer: [
        { title: "Послуги", links: [
          { label: "Монтаж", href: "/installation" },
          { label: "Сервісний центр", href: "/service-center" },
          { label: "Комплексні рішення", href: "/solutions" },
          { label: "Для монтажників", href: "/partnership" }
        ] },
        { title: "Покупцям", links: [
          { label: "Доставка", href: "/delivery" },
          { label: "Оплата", href: "/payment" },
          { label: "Гарантія", href: "/warranty" },
          { label: "Обмін і повернення", href: "/returns" },
          { label: "Особистий кабінет", href: "/account" }
        ] },
        { title: "Компанія", links: [
          { label: "Про нас", href: "/about" },
          { label: "Бренди", href: "/brands" },
          { label: "Контакти та графік", href: "/contact" },
          { label: "Надіслати специфікацію", href: "/partnership" },
          { label: "Часті запитання", href: "/faq" }
        ] }
      ]
    },
    cookies: { enabled: false, text: "Ми використовуємо cookie, щоб сайт працював, а з вашої згоди — ще й для аналітики та реклами.", privacyHref: "/privacy" }
  });
  const CACHE_KEY = "sofievka.siteSettings.v1";
  const CONSENT_KEY = "sofievka.cookieConsent.v1";
  const listeners = new Set();
  // Links are re-checked here because the cache is client-side (same rule as _settings_href in SQL):
  // a site path or an https:// URL, never another scheme or a protocol-relative //host.
  const SAFE_HREF = /^(https:\/\/[^/\s<>"'\\]+(\/[^\s<>"'\\]*)?|\/([^/\s<>"'\\][^\s<>"'\\]*)?)$/i;
  const safeLink = item => Boolean(item && typeof item.label === "string" && item.label.trim() && SAFE_HREF.test(String(item.href || "")));

  function read(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
  function write(key, value) { try { window.localStorage.setItem(key, value); } catch { /* private mode */ } }

  // Saved settings may omit sections; fill them from the defaults so renderers never branch.
  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    const stores = Array.isArray(source.stores) && source.stores.length ? source.stores : DEFAULTS.stores;
    const header = Array.isArray(source.menus?.header) ? source.menus.header : DEFAULTS.menus.header;
    const footer = Array.isArray(source.menus?.footer) ? source.menus.footer : DEFAULTS.menus.footer;
    return Object.freeze({
      company: { ...DEFAULTS.company, ...(source.company || {}) },
      stores: stores.map(store => ({ ...store, phones: Array.isArray(store.phones) ? store.phones : [], hours: Array.isArray(store.hours) ? store.hours : [] })),
      checkout: { ...DEFAULTS.checkout, ...(source.checkout || {}),
        deliveryMethods: Array.isArray(source.checkout?.deliveryMethods) && source.checkout.deliveryMethods.length ? source.checkout.deliveryMethods : DEFAULTS.checkout.deliveryMethods },
      social: { ...DEFAULTS.social, ...(source.social || {}) },
      integrations: { ...DEFAULTS.integrations, ...(source.integrations || {}) },
      seo: { pages: Array.isArray(source.seo?.pages) ? source.seo.pages : [] },
      menus: {
        header: header.filter(safeLink).map(item => ({
          label: item.label, href: item.href, children: (Array.isArray(item.children) ? item.children : []).filter(safeLink)
        })),
        footer: footer.filter(column => column && typeof column.title === "string" && Array.isArray(column.links))
          .map(column => ({ title: column.title, links: column.links.filter(safeLink) }))
          .filter(column => column.links.length)
      },
      cookies: {
        enabled: source.cookies?.enabled === true,
        text: String(source.cookies?.text || DEFAULTS.cookies.text),
        privacyHref: source.cookies && "privacyHref" in source.cookies
          ? (SAFE_HREF.test(String(source.cookies.privacyHref || "")) ? source.cookies.privacyHref : "")
          : DEFAULTS.cookies.privacyHref
      }
    });
  }

  let current = normalize((() => { try { return JSON.parse(read(CACHE_KEY) || "null"); } catch { return null; } })());

  const phoneHref = phone => `tel:+${String(phone || "").replace(/\D/g, "").replace(/^0/, "380")}`;
  const mapEmbed = query => `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const mapRoute = query => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const SOCIAL_LABELS = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", telegram: "Telegram", viber: "Viber" };

  function element(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name === "text") node.textContent = value;
      else if (value !== null && value !== undefined && value !== false) node.setAttribute(name, value === true ? "" : String(value));
    }
    node.append(...children);
    return node;
  }

  // Menus (/admin/menus). Static markup inside the hooks is the first paint; it is replaced only
  // when the menus differ from what the hook already shows, so equal menus never repaint.
  const normalizePath = value => {
    const path = String(value || "").toLowerCase().split(/[?#]/)[0].replace(/\.html$/, "").replace(/(.)\/+$/, "$1");
    return path === "/index" ? "/" : path;
  };
  const pagePath = () => normalizePath(location.pathname);
  // Pages that belong to a menu item with another address (the payment page sits under «Доставка й оплата»).
  const ACTIVE_ALIASES = Object.freeze({ "/payment": "/delivery" });
  const isCurrent = href => {
    if (!String(href).startsWith("/")) return false;
    const here = pagePath();
    const target = normalizePath(href);
    return target === here || target === ACTIVE_ALIASES[here];
  };
  const menuLink = (item, className = "") => element("a", { href: item.href, class: className || null, text: item.label });
  const external = item => /^https:/i.test(item.href);

  function renderHeaderMenu(container) {
    const items = current.menus.header;
    const state = JSON.stringify([items, pagePath()]);
    if (container.dataset.menuState === state) return;
    container.dataset.menuState = state;
    const nav = container.closest(".site-nav");
    if (nav) nav.hidden = !items.length;
    container.replaceChildren(...items.map(item => {
      const link = menuLink(item);
      if (external(item)) link.rel = "noopener";
      const selfCurrent = isCurrent(item.href);
      if (selfCurrent || item.children.some(child => isCurrent(child.href))) link.classList.add("is-active");
      if (selfCurrent) link.setAttribute("aria-current", "page");
      if (!item.children.length) return link;
      const panel = element("div", { class: "site-nav__sub" }, item.children.map(child => {
        const childLink = menuLink(child);
        if (isCurrent(child.href)) childLink.setAttribute("aria-current", "page");
        return childLink;
      }));
      link.classList.add("site-nav__parent");
      return element("div", { class: "site-nav__group" }, [link, panel]);
    }));
  }

  // data-site-footer-menu="accordion" (homepage: collapsible columns on phones) or "" (plain columns).
  function renderFooterMenu(container) {
    const columns = current.menus.footer;
    const accordion = container.dataset.siteFooterMenu === "accordion";
    const state = JSON.stringify(columns);
    if (container.dataset.menuState === state) return;
    container.dataset.menuState = state;
    container.replaceChildren(...columns.map(column => {
      const links = column.links.map(item => menuLink(item));
      const label = `${column.title} у підвалі`;
      if (!accordion) return element("nav", { "aria-label": label }, [element("h2", { text: column.title }), ...links]);
      return element("nav", { class: "footer__section", "aria-label": label, "data-footer-section": true }, [
        element("button", { class: "footer__toggle", type: "button", "aria-expanded": "false" }, [element("span", { text: column.title }), element("b", { "aria-hidden": "true", text: "+" })]),
        element("div", { class: "footer__links" }, links)
      ]);
    }));
  }

  // Shared static hooks: primary store contacts, social links, copyright, menus, cookie settings link.
  function applyHooks(root = document) {
    const primary = current.stores[0];
    root.querySelectorAll("[data-site-primary-phone]").forEach(link => {
      link.textContent = primary.phones[0] || "";
      link.href = phoneHref(primary.phones[0]);
    });
    root.querySelectorAll("[data-site-primary-email]").forEach(link => {
      link.textContent = primary.email || "";
      link.href = `mailto:${primary.email || ""}`;
    });
    root.querySelectorAll("[data-site-primary-address]").forEach(node => { node.textContent = primary.address; });
    root.querySelectorAll("[data-site-primary-hours]").forEach(node => { node.textContent = primary.hours.join(", "); });
    root.querySelectorAll(".footer__bottom > span:first-child").forEach(node => {
      node.textContent = `© ${new Date().getFullYear()} ${current.company.name}`;
    });
    root.querySelectorAll(".footer__socials").forEach(block => {
      const links = Object.entries(current.social).filter(([, url]) => /^https:\/\//i.test(String(url || "")));
      const icons = new Map([...block.querySelectorAll(".footer__social")].map(item => [String(item.getAttribute("title") || "").toLowerCase(), item.querySelector("svg")]));
      block.hidden = !links.length;
      block.removeAttribute("aria-hidden");
      block.replaceChildren(...links.map(([key, url]) => {
        const link = document.createElement("a");
        link.className = "footer__social";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = SOCIAL_LABELS[key] || key;
        link.setAttribute("aria-label", SOCIAL_LABELS[key] || key);
        const svg = icons.get(key);
        if (svg) link.append(svg.cloneNode(true));
        else link.textContent = (SOCIAL_LABELS[key] || key).slice(0, 2);
        return link;
      }));
    });
    root.querySelectorAll("[data-site-header-menu]").forEach(renderHeaderMenu);
    root.querySelectorAll("[data-site-footer-menu]").forEach(renderFooterMenu);
    // A way back to the consent choice, next to the legal links in the footer.
    root.querySelectorAll(".footer__bottom-meta > span:last-child").forEach(node => {
      const button = node.querySelector("[data-cookie-settings]");
      if (!current.cookies.enabled) {
        if (button) { button.previousSibling?.remove(); button.remove(); }
        return;
      }
      if (!button) node.append(" · ", element("button", { class: "footer__cookie-settings", type: "button", "data-cookie-settings": true, text: "Cookie" }));
    });
  }

  // Cookie consent (/admin/settings → Cookie). Off: tags load as soon as their ids are set, as before.
  // On: Google Consent Mode starts with everything denied, and GA4 / GTM / Meta Pixel load only after
  // «Прийняти всі»; «Лише необхідні» loads none of them. The choice lives in this browser only.
  function storedConsent() {
    try {
      const value = JSON.parse(read(CONSENT_KEY) || "null");
      return value && (value.choice === "all" || value.choice === "necessary") ? value.choice : null;
    } catch { return null; }
  }
  const analyticsAllowed = () => !current.cookies.enabled || storedConsent() === "all";
  const GRANTED = Object.freeze({ ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" });
  const DENIED = Object.freeze({ ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });
  let consentDefaultSent = false;
  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag(...arguments);
  }
  // Must reach the dataLayer before gtm.js / gtag.js; sent once per page and only when the banner is on.
  function sendConsentDefault() {
    if (consentDefaultSent || !current.cookies.enabled) return;
    consentDefaultSent = true;
    gtag("consent", "default", { ...DENIED, functionality_storage: "granted", security_storage: "granted", wait_for_update: 500 });
    if (storedConsent() === "all") gtag("consent", "update", GRANTED);
  }

  // Analytics and verification tags from /admin/settings → Інтеграції. Nothing loads while the ids
  // are empty; each id loads once per page. Ids are re-checked here because the cache is client-side.
  const loadedTags = new Set();
  function addScript(src) {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.append(script);
  }
  function applyIntegrations() {
    const { ga4MeasurementId: ga4, gtmContainerId: gtm, metaPixelId: pixel, searchConsoleToken: token } = current.integrations;
    const once = (key, valid, load) => { if (valid && !loadedTags.has(key)) { loadedTags.add(key); load(); } };
    // The verification meta sets no cookies; it never waits for consent.
    once(`gsc:${token}`, /^[A-Za-z0-9_-]{10,100}$/.test(token || "") && !document.querySelector(`meta[name="google-site-verification"][content="${token}"]`), () => {
      const meta = document.createElement("meta");
      meta.name = "google-site-verification";
      meta.content = token;
      document.head.append(meta);
    });
    const hasGoogle = /^GTM-[A-Z0-9]{4,12}$/.test(gtm || "") || /^G-[A-Z0-9]{4,16}$/.test(ga4 || "");
    if (hasGoogle) sendConsentDefault();
    if (!analyticsAllowed()) return;
    once(`gtm:${gtm}`, /^GTM-[A-Z0-9]{4,12}$/.test(gtm || ""), () => {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      addScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`);
    });
    once(`ga4:${ga4}`, /^G-[A-Z0-9]{4,16}$/.test(ga4 || ""), () => {
      gtag("js", new Date());
      gtag("config", ga4);
      addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`);
    });
    once(`pixel:${pixel}`, /^\d{6,20}$/.test(pixel || ""), () => {
      if (!window.fbq) {
        const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
        Object.assign(fbq, { push: fbq, loaded: true, version: "2.0", queue: [] });
        window.fbq = fbq;
        window._fbq = window._fbq || fbq;
        addScript("https://connect.facebook.net/en_US/fbevents.js");
      }
      if (current.cookies.enabled) window.fbq("consent", "grant");
      window.fbq("init", pixel);
      window.fbq("track", "PageView");
    });
  }

  function saveConsent(choice) {
    write(CONSENT_KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
    if (consentDefaultSent) gtag("consent", "update", choice === "all" ? GRANTED : DENIED);
    // Tags already on the page (an earlier «accept») stop using cookies after «only necessary».
    if (choice !== "all" && typeof window.fbq === "function") window.fbq("consent", "revoke");
    if (choice === "all" && typeof window.fbq === "function") window.fbq("consent", "grant");
    renderConsentBanner(false);
    applyIntegrations();
  }

  // A fixed bar at the bottom of the viewport: it overlays the page instead of pushing it, so the
  // layout does not shift when it appears or closes.
  function renderConsentBanner(forceOpen) {
    const existing = document.querySelector("[data-cookie-consent]");
    const open = current.cookies.enabled && (forceOpen || !storedConsent());
    if (!open) { existing?.remove(); return; }
    if (!document.body) return;
    const text = element("p", { class: "cookie-consent__text", id: "cookie-consent-text", text: `${current.cookies.text} ` });
    if (current.cookies.privacyHref) text.append(element("a", { href: current.cookies.privacyHref, text: "Детальніше" }));
    const banner = element("section", { class: "cookie-consent", "data-cookie-consent": true, "aria-label": "Згода на використання cookie", "aria-describedby": "cookie-consent-text" }, [
      element("div", { class: "container cookie-consent__inner" }, [
        text,
        element("div", { class: "cookie-consent__actions" }, [
          element("button", { class: "button button--outline-dark", type: "button", "data-cookie-choice": "necessary", text: "Лише необхідні" }),
          element("button", { class: "button button--primary", type: "button", "data-cookie-choice": "all", text: "Прийняти всі" })
        ])
      ])
    ]);
    banner.addEventListener("click", event => {
      const choice = event.target.closest("[data-cookie-choice]")?.dataset.cookieChoice;
      if (choice) saveConsent(choice);
    });
    if (existing) existing.replaceWith(banner);
    else document.body.append(banner);
    if (forceOpen) banner.querySelector("[data-cookie-choice='all']")?.focus();
  }
  function openCookieSettings() { renderConsentBanner(true); }
  document.addEventListener("click", event => {
    if (event.target.closest?.("[data-cookie-settings]")) openCookieSettings();
  });

  // Title/description overrides for static pages (Налаштування → SEO сторінок); the HTML keeps the defaults.
  function applySeo() {
    const page = current.seo.pages.find(item => item && item.path === pagePath());
    if (!page) return;
    const setMeta = (selector, attribute, name, value) => {
      let meta = document.head.querySelector(selector);
      if (!meta) { meta = document.createElement("meta"); meta.setAttribute(attribute, name); document.head.append(meta); }
      meta.setAttribute("content", value);
    };
    if (page.title) {
      document.title = page.title;
      if (document.head.querySelector('meta[property="og:title"]')) setMeta('meta[property="og:title"]', "property", "og:title", page.title);
    }
    if (page.description) {
      setMeta('meta[name="description"]', "name", "description", page.description);
      if (document.head.querySelector('meta[property="og:description"]')) setMeta('meta[property="og:description"]', "property", "og:description", page.description);
    }
  }

  function update(next) {
    current = normalize(next);
    applyIntegrations();
    if (document.readyState !== "loading") { applySeo(); renderConsentBanner(false); }
    applyHooks();
    listeners.forEach(listener => { try { listener(current); } catch (error) { console.error(error); } });
  }

  async function load() {
    const config = window.SOFIEVKA_CATALOG_CONFIG?.supabase;
    if (!config?.url || !config?.publishableKey) return current;
    try {
      const response = await fetch(`${config.url}/rest/v1/rpc/get_site_settings`, {
        method: "POST",
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return current;
      const body = await response.json();
      if (!body || typeof body !== "object") return current;
      const serialized = JSON.stringify(body);
      if (serialized !== read(CACHE_KEY)) {
        write(CACHE_KEY, serialized);
        update(body);
      }
    } catch { /* keep defaults or cache */ }
    return current;
  }

  window.sofievkaSiteSettings = Object.freeze({
    get current() { return current; },
    defaults: DEFAULTS,
    ready: load(),
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    applyHooks,
    openCookieSettings,
    phoneHref,
    mapEmbed,
    mapRoute
  });

  // One phone format for every form: +38 (0XX) XXX XX XX, typed digits only.
  function formatPhone(value) {
    const raw = String(value || "");
    let digits = raw.replace(/\D/g, "");
    if (/^\+?3?8?$/.test(raw.trim())) return raw;
    if (raw.trim().startsWith("+38") || digits.startsWith("380")) digits = digits.slice(2);
    if (digits && !digits.startsWith("0")) digits = `0${digits}`;
    digits = digits.slice(0, 10);
    if (!digits) return "";
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
    return `+38 (${parts[0]}${parts[0].length === 3 ? ")" : ""}${parts[1] ? ` ${parts[1]}` : ""}${parts[2] ? ` ${parts[2]}` : ""}${parts[3] ? ` ${parts[3]}` : ""}`;
  }
  document.addEventListener("input", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "tel" || event.inputType?.startsWith("delete")) return;
    input.value = formatPhone(input.value);
  });

  // Tags start right away from the cached copy; title/description, menus and the banner wait for the DOM.
  applyIntegrations();
  const ready = () => { applySeo(); applyHooks(); renderConsentBanner(false); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
