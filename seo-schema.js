/* Structured data (schema.org JSON-LD) for search engines, added on every page by the build.
 * - BreadcrumbList from the visible breadcrumbs (nav.page-breadcrumbs), kept in sync when a page re-renders.
 * - Organization with both stores on the home, about and contact pages (from site settings).
 * - Product on the product page: page-shell.js fills window.sofievkaProductSchema and fires "sofievka:product-schema".
 * Google reads JSON-LD added by JavaScript; messengers and other crawlers need prerendered HTML (stage 5). */
(function () {
  "use strict";

  const ORIGIN = location.origin;
  const absolute = href => { try { return new URL(href, ORIGIN).href; } catch { return ""; } };

  function put(id, data) {
    let script = document.getElementById(id);
    if (!data) { script?.remove(); return; }
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = id;
      document.head.append(script);
    }
    const text = JSON.stringify(data);
    if (script.textContent !== text) script.textContent = text;
  }

  function breadcrumbs() {
    const nav = document.querySelector("nav.page-breadcrumbs");
    if (!nav) return null;
    const items = [];
    for (const node of nav.querySelectorAll("a, [aria-current]")) {
      const name = node.textContent.replace(/\s+/g, " ").trim();
      if (!name) continue;
      const url = node.tagName === "A" ? absolute(node.getAttribute("href")) : location.href.split("#")[0];
      if (url) items.push({ "@type": "ListItem", position: items.length + 1, name, item: url });
    }
    return items.length > 1 ? { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items } : null;
  }

  function hoursSpecification(lines) {
    const days = { "Пн": "Monday", "Вт": "Tuesday", "Ср": "Wednesday", "Чт": "Thursday", "Пт": "Friday", "Сб": "Saturday", "Нд": "Sunday" };
    const order = Object.keys(days);
    const result = [];
    for (const line of lines || []) {
      const match = String(line).match(/^(Пн|Вт|Ср|Чт|Пт|Сб|Нд)(?:\s*[–-]\s*(Пн|Вт|Ср|Чт|Пт|Сб|Нд))?\s+(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
      if (!match) continue;
      const from = order.indexOf(match[1]);
      const to = match[2] ? order.indexOf(match[2]) : from;
      if (to < from) continue;
      result.push({ "@type": "OpeningHoursSpecification", dayOfWeek: order.slice(from, to + 1).map(day => days[day]), opens: match[3].padStart(5, "0"), closes: match[4].padStart(5, "0") });
    }
    return result;
  }

  function organization() {
    const page = document.body?.dataset.page || "";
    if (!["home", "about", "contact"].includes(page)) return null;
    const settings = window.sofievkaSiteSettings?.current || {};
    const name = settings.company?.name || "Торговий дім «Софіївка»";
    const social = Object.values(settings.social || {}).filter(value => /^https:\/\//.test(String(value)));
    const stores = (settings.stores || []).filter(store => store?.address).map(store => ({
      "@type": "Store",
      name: `${name}, ${store.city || store.title || ""}`.replace(/, $/, ""),
      address: { "@type": "PostalAddress", streetAddress: store.address, addressLocality: store.city || undefined, addressCountry: "UA" },
      telephone: store.phones?.[0] || undefined,
      email: store.email || undefined,
      openingHoursSpecification: hoursSpecification(store.hours)
    }));
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      name,
      url: `${ORIGIN}/`,
      logo: `${ORIGIN}/assets/icon-512.png`,
      ...(social.length ? { sameAs: social } : {}),
      ...(stores[0]?.telephone ? { telephone: stores[0].telephone } : {}),
      ...(stores.length ? { department: stores } : {})
    };
  }

  function product() {
    return document.body?.dataset.page === "product" ? window.sofievkaProductSchema || null : null;
  }

  let queued = false;
  function update() {
    queued = false;
    put("schema-breadcrumbs", breadcrumbs());
    put("schema-organization", organization());
    put("schema-product", product());
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  function start() {
    schedule();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("sofievka:product-schema", schedule);
    window.sofievkaSiteSettings?.onChange?.(schedule);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
