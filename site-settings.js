/* Shop settings shared by every page: stores and contacts, checkout options, social links.
 * Values are edited in /admin/settings and served by the public RPC get_site_settings.
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
    social: { instagram: "", facebook: "", youtube: "", telegram: "", viber: "" }
  });
  const CACHE_KEY = "sofievka.siteSettings.v1";
  const listeners = new Set();

  function read(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
  function write(key, value) { try { window.localStorage.setItem(key, value); } catch { /* private mode */ } }

  // Saved settings may omit sections; fill them from the defaults so renderers never branch.
  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    const stores = Array.isArray(source.stores) && source.stores.length ? source.stores : DEFAULTS.stores;
    return Object.freeze({
      company: { ...DEFAULTS.company, ...(source.company || {}) },
      stores: stores.map(store => ({ ...store, phones: Array.isArray(store.phones) ? store.phones : [], hours: Array.isArray(store.hours) ? store.hours : [] })),
      checkout: { ...DEFAULTS.checkout, ...(source.checkout || {}),
        deliveryMethods: Array.isArray(source.checkout?.deliveryMethods) && source.checkout.deliveryMethods.length ? source.checkout.deliveryMethods : DEFAULTS.checkout.deliveryMethods },
      social: { ...DEFAULTS.social, ...(source.social || {}) }
    });
  }

  let current = normalize((() => { try { return JSON.parse(read(CACHE_KEY) || "null"); } catch { return null; } })());

  const phoneHref = phone => `tel:+${String(phone || "").replace(/\D/g, "").replace(/^0/, "380")}`;
  const mapEmbed = query => `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const mapRoute = query => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const SOCIAL_LABELS = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", telegram: "Telegram", viber: "Viber" };

  // Shared static hooks: primary store contacts, social links, copyright.
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
  }

  function update(next) {
    current = normalize(next);
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
    phoneHref,
    mapEmbed,
    mapRoute
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => applyHooks());
  else applyHooks();
})();
