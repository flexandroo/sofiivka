import { icon } from "/admin/admin-icons.mjs";

// Brands and categories (Taxonomy Admin v1). Identity fields (id, slug, parent, brand name)
// are read-only here: they drive storefront URLs and product cards.

const BRAND_VISIBILITY = Object.freeze({
  catalog: { label: "У каталозі", tone: "success" },
  service: { label: "Сервісний", tone: "info" },
  hidden: { label: "Прихований", tone: "" }
});
const CATEGORY_STATUS = Object.freeze({
  active: { label: "Активна", tone: "success" },
  future: { label: "Майбутня", tone: "info" },
  internal: { label: "Внутрішня", tone: "" },
  archived: { label: "Архів", tone: "" }
});
const CATEGORY_VISIBILITY = Object.freeze({
  catalog: { label: "Каталог", tone: "success" },
  landing: { label: "Лендінг", tone: "info" },
  service: { label: "Сервісна", tone: "info" },
  hidden: { label: "Прихована", tone: "" }
});
const YES_NO = Object.freeze({ true: { label: "Так" }, false: { label: "Ні" } });

const FIELD_LABELS = Object.freeze({
  title: "Назва", short_title: "Коротка назва", description: "Опис", menu_description: "Опис у меню",
  sort_order: "Порядок", status: "Статус", visibility: "Видимість", seo_title: "SEO title",
  seo_description: "SEO description", country: "Країна", website_url: "Сайт", logo_url: "Логотип",
  featured: "Рекомендований", featured_order: "Порядок серед рекомендованих"
});

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
export async function createBrandsListView({ api, search = location.search, signal }) {
  const params = new URLSearchParams(search);
  const filters = { query: (params.get("q") || "").trim(), visibility: params.get("visibility") || "" };
  const result = await api.taxonomy.listBrands({ signal });
  const query = filters.query.toLocaleLowerCase("uk");
  const brands = result.brands.filter(brand =>
    (!filters.visibility || brand.visibility === filters.visibility)
    && (!query || [brand.name, brand.id, ...(brand.aliases || [])].some(value => String(value || "").toLocaleLowerCase("uk").includes(query))));
  const rows = brands.map(brand => `
    <tr>
      <td><div class="admin-taxonomy-brand">${logo(brand)}<div><a class="admin-crm-id" href="/admin/brands/${encodeURIComponent(brand.id)}" data-admin-link>${escape(brand.name)}</a><small>${escape(brand.id)}</small></div></div></td>
      <td class="admin-crm-num">${number(brand.publishedCount)}<small>з ${number(brand.productCount)}</small></td>
      <td class="admin-crm-num">${number(brand.seriesCount)}</td>
      <td>${statusBadge(BRAND_VISIBILITY, brand.visibility)}</td>
      <td>${brand.featured ? `Так${brand.featuredOrder !== null ? `<small>позиція ${brand.featuredOrder}</small>` : ""}` : `<span class="admin-muted">—</span>`}</td>
      <td>${brand.country ? escape(brand.country) : `<span class="admin-muted">—</span>`}</td>
    </tr>`).join("");
  const html = `
    <section class="admin-crm-page">
      ${pageHead("ДАНІ", "Бренди", `${number(brands.length)} з ${number(result.brands.length)} брендів.${result.canEdit ? "" : " Ваша роль може лише переглядати."}`)}
      ${filterBar(filters, {
        placeholder: "Назва або код бренду",
        selects: [{ name: "visibility", label: "Видимість", all: "Будь-яка", options: BRAND_VISIBILITY }]
      })}
      ${brands.length ? table(["Бренд", "На сайті", "Серій", "Видимість", "Рекомендований", "Країна"], rows, "admin-crm-table--brands")
        : emptyState("Брендів не знайдено", "Змініть пошук або фільтр.")}
    </section>`;
  return { html, bind: container => bindList(container) };
}

export async function createBrandDetailView({ api, brandId, signal }) {
  const detail = await api.taxonomy.getBrand(brandId, { signal });
  if (!detail?.brand) return notFound("Бренд не знайдено", "/admin/brands", "До брендів");
  const { brand, canEdit } = detail;
  const html = `
    <section class="admin-crm-detail" data-taxonomy-detail>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/brands" data-admin-link class="admin-back-link">← Усі бренди</a>
          <p class="admin-kicker">БРЕНД · ${escape(brand.id)}</p>
          <h1>${escape(brand.name)}</h1>
          <div class="admin-editor-meta">${statusBadge(BRAND_VISIBILITY, brand.visibility)}<span>Оновлено ${formatDateTime(brand.updatedAt)}</span></div>
        </div>
      </header>
      <div class="admin-crm-layout">
        <form class="admin-crm-main" data-taxonomy-form>
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">ОПИС</p><h2>Картка бренду</h2></div></header>
            <div class="admin-form-grid">
              ${readonlyField("Назва", brand.name, "Назва впливає на картки товарів і змінюється окремо.")}
              ${readonlyField("Адреса", `/brands/${brand.slug}/`)}
              ${textField("country", "Країна", brand.country, 80)}
              ${textField("websiteUrl", "Сайт виробника", brand.websiteUrl, 500, { type: "url", placeholder: "https://" })}
              ${textField("logoUrl", "Логотип", brand.logoUrl, 500, { full: true, placeholder: "assets/brands/… або https://", hint: "Шлях до файлу на сайті або повна https-адреса." })}
              ${textArea("description", "Опис", brand.description, 4000)}
            </div>
          </section>
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">ПОКАЗ</p><h2>Видимість на сайті</h2></div></header>
            <div class="admin-form-grid">
              ${selectField("visibility", "Видимість", BRAND_VISIBILITY, brand.visibility)}
              ${selectField("featured", "Рекомендований", YES_NO, String(brand.featured))}
              ${textField("featuredOrder", "Позиція серед рекомендованих", brand.featuredOrder ?? "", 6, { type: "number", min: 0, hint: "Менше число стоїть вище. Діє лише для рекомендованих." })}
            </div>
            ${brand.publishedCount ? `<p class="admin-panel-note">Приховати бренд можна лише без опублікованих товарів. Зараз їх ${number(brand.publishedCount)}.</p>` : ""}
          </section>
          ${seoPanel(brand)}
          ${canEdit ? saveBar() : readOnlyNote()}
        </form>
        <aside class="admin-crm-side">
          <section class="admin-panel admin-crm-contact">
            <header class="admin-panel__head"><div><p class="admin-kicker">ТОВАРИ</p><h2>${number(brand.publishedCount)} на сайті</h2></div>
              <a href="/admin/products?brand=${encodeURIComponent(brand.internalId)}" data-admin-link>Товари${icon("arrow")}</a></header>
            <dl>
              <div><dt>Усього</dt><dd>${number(brand.productCount)}</dd></div>
              <div><dt>Серій</dt><dd>${number(brand.seriesCount)}</dd></div>
            </dl>
          </section>
          ${countList("КАТЕГОРІЇ", "Де представлений", detail.categories, item => `<a href="/admin/categories/${encodeURIComponent(item.id)}" data-admin-link>${escape(item.title)}</a>`)}
          ${countList("СЕРІЇ", "Лінійки бренду", detail.series, item => escape(item.name))}
          ${historyPanel(detail.history)}
        </aside>
      </div>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => bindEditor(container, {
      canEdit,
      fields: ["country", "websiteUrl", "logoUrl", "description", "visibility", "featured", "featuredOrder", "seoTitle", "seoDescription"],
      toPatch: patch => ("featured" in patch ? { ...patch, featured: patch.featured === "true" } : patch),
      save: patch => api.taxonomy.updateBrand(brand.id, patch, brand.updatedAt)
    })
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function createCategoriesListView({ api, search = location.search, signal }) {
  const params = new URLSearchParams(search);
  const filters = { query: (params.get("q") || "").trim(), status: params.get("status") || "" };
  const result = await api.taxonomy.listCategories({ signal });
  const ordered = treeOrder(result.categories);
  const query = filters.query.toLocaleLowerCase("uk");
  const matches = category => (!filters.status || category.status === filters.status)
    && (!query || [category.title, category.shortTitle, category.id, category.slug].some(value => String(value || "").toLocaleLowerCase("uk").includes(query)));
  // Keep ancestors of every match so the tree stays readable while filtering.
  const byId = new Map(result.categories.map(category => [category.id, category]));
  const visible = new Set();
  for (const category of ordered.filter(matches)) {
    for (let current = category; current; current = byId.get(current.parentId)) visible.add(current.id);
  }
  const rows = ordered.filter(category => visible.has(category.id)).map(category => `
    <tr class="${[category.level === 1 ? "admin-taxonomy-root" : "", matches(category) ? "" : "admin-taxonomy-context"].filter(Boolean).join(" ")}">
      <td><div class="admin-taxonomy-node" style="--level:${category.level - 1}">
        <a class="admin-crm-id" href="/admin/categories/${encodeURIComponent(category.id)}" data-admin-link>${escape(category.title)}</a>
        <small>${escape(category.id)}${category.childCount ? ` · ${number(category.childCount)} підкат.` : ""}</small></div></td>
      <td class="admin-crm-num">${number(category.publishedCount)}<small>з ${number(category.productCount)}</small></td>
      <td>${statusBadge(CATEGORY_STATUS, category.status)}</td>
      <td>${statusBadge(CATEGORY_VISIBILITY, category.visibility)}</td>
      <td class="admin-crm-num">${number(category.sortOrder)}</td>
    </tr>`).join("");
  const roots = result.categories.filter(category => !category.parentId).length;
  const html = `
    <section class="admin-crm-page">
      ${pageHead("ДАНІ", "Категорії", `${number(result.categories.length)} категорій у ${number(roots)} розділах.${result.canEdit ? "" : " Ваша роль може лише переглядати."}`)}
      ${filterBar(filters, {
        placeholder: "Назва або код категорії",
        selects: [{ name: "status", label: "Статус", all: "Будь-який", options: CATEGORY_STATUS }]
      })}
      ${rows ? table(["Категорія", "Товарів на сайті", "Статус", "Видимість", "Порядок"], rows, "admin-crm-table--categories")
        : emptyState("Категорій не знайдено", "Змініть пошук або фільтр.")}
    </section>`;
  return { html, bind: container => bindList(container) };
}

export async function createCategoryDetailView({ api, categoryId, signal }) {
  const detail = await api.taxonomy.getCategory(categoryId, { signal });
  if (!detail?.category) return notFound("Категорію не знайдено", "/admin/categories", "До категорій");
  const { category, canEdit } = detail;
  const trail = detail.path.map(item => `<a href="/admin/categories/${encodeURIComponent(item.id)}" data-admin-link>${escape(item.title)}</a>`).join(" / ");
  const html = `
    <section class="admin-crm-detail" data-taxonomy-detail>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/categories" data-admin-link class="admin-back-link">← Усі категорії</a>
          <p class="admin-kicker">РІВЕНЬ ${category.level} · ${escape(category.id)}</p>
          <h1>${escape(category.title)}</h1>
          <div class="admin-editor-meta">${statusBadge(CATEGORY_STATUS, category.status)}${statusBadge(CATEGORY_VISIBILITY, category.visibility)}${trail ? `<span>${trail}</span>` : ""}<span>Оновлено ${formatDateTime(category.updatedAt)}</span></div>
        </div>
      </header>
      <div class="admin-crm-layout">
        <form class="admin-crm-main" data-taxonomy-form>
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">ОПИС</p><h2>Назва й тексти</h2></div></header>
            <div class="admin-form-grid">
              ${textField("title", "Назва", category.title, 160, { required: true })}
              ${textField("shortTitle", "Коротка назва", category.shortTitle, 80, { hint: "Для меню, фільтрів і хлібних крихт." })}
              ${textField("menuDescription", "Опис у меню", category.menuDescription, 240, { full: true })}
              ${textArea("description", "Опис на сторінці категорії", category.description, 4000)}
              ${readonlyField("Адреса", category.slug, "Адреса й місце в дереві змінюються окремо, бо впливають на посилання.")}
            </div>
          </section>
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">ПОКАЗ</p><h2>Статус і порядок</h2></div></header>
            <div class="admin-form-grid admin-form-grid--commercial">
              ${selectField("status", "Статус", CATEGORY_STATUS, category.status)}
              ${selectField("visibility", "Видимість", CATEGORY_VISIBILITY, category.visibility)}
              ${textField("sortOrder", "Порядок", category.sortOrder, 6, { type: "number", min: 0, hint: "Менше число стоїть вище серед сусідніх категорій." })}
            </div>
            ${category.publishedCount ? `<p class="admin-panel-note">Вивести категорію з каталогу можна лише без опублікованих товарів. Зараз у ній і підкатегоріях їх ${number(category.publishedCount)}.</p>` : ""}
          </section>
          ${seoPanel(category)}
          ${canEdit ? saveBar() : readOnlyNote()}
        </form>
        <aside class="admin-crm-side">
          <section class="admin-panel admin-crm-contact">
            <header class="admin-panel__head"><div><p class="admin-kicker">ТОВАРИ</p><h2>${number(category.publishedCount)} на сайті</h2></div>
              <a href="/admin/products?category=${encodeURIComponent(category.internalId)}" data-admin-link>Товари${icon("arrow")}</a></header>
            <dl>
              <div><dt>Безпосередньо</dt><dd>${number(category.directCount)}</dd></div>
              <div><dt>Підкатегорій</dt><dd>${number(detail.children.length)}</dd></div>
            </dl>
          </section>
          ${countList("ПІДКАТЕГОРІЇ", "Вкладені розділи", detail.children, item => `<a href="/admin/categories/${encodeURIComponent(item.id)}" data-admin-link>${escape(item.title)}</a>`, item => statusBadge(CATEGORY_STATUS, item.status))}
          ${countList("БРЕНДИ", "Товари категорії", detail.brands, item => `<a href="/admin/brands/${encodeURIComponent(item.id)}" data-admin-link>${escape(item.name)}</a>`)}
          ${historyPanel(detail.history)}
        </aside>
      </div>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => bindEditor(container, {
      canEdit,
      fields: ["title", "shortTitle", "menuDescription", "description", "status", "visibility", "sortOrder", "seoTitle", "seoDescription"],
      toPatch: patch => patch,
      save: patch => api.taxonomy.updateCategory(category.id, patch, category.updatedAt)
    })
  };
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function treeOrder(categories) {
  const children = new Map();
  for (const category of categories) {
    const key = category.parentId || "";
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(category);
  }
  for (const list of children.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const ordered = [];
  const walk = parentId => (children.get(parentId) || []).forEach(category => { ordered.push(category); walk(category.id); });
  walk("");
  return ordered;
}

function seoPanel(entity) {
  return `
    <section class="admin-panel">
      <header class="admin-panel__head"><div><p class="admin-kicker">SEO</p><h2>Пошукові системи</h2></div></header>
      <div class="admin-form-grid">
        ${textField("seoTitle", "SEO title", entity.seoTitle, 160, { full: true, hint: "Порожнє поле: заголовок збирається з назви автоматично." })}
        ${textArea("seoDescription", "SEO description", entity.seoDescription, 320)}
      </div>
    </section>`;
}

function saveBar() {
  return `<footer class="admin-panel admin-crm-form-actions"><button class="admin-button admin-button--primary" type="submit">Зберегти</button></footer>`;
}

function readOnlyNote() {
  return `<p class="admin-panel-note">Редагувати довідники можуть власник, адміністратор і контент-менеджер.</p>`;
}

function countList(kicker, title, items, render, extra = () => "") {
  if (!items?.length) return "";
  return `
    <section class="admin-panel">
      <header class="admin-panel__head"><div><p class="admin-kicker">${kicker}</p><h2>${title}</h2></div></header>
      <div class="admin-crm-items">${items.map(item => `
        <div class="admin-crm-item admin-taxonomy-count"><div><strong>${render(item)}</strong></div>${extra(item)}<span class="admin-crm-num">${item.productCount === undefined ? "" : number(item.productCount)}</span></div>`).join("")}
      </div>
    </section>`;
}

function historyPanel(history) {
  return `
    <section class="admin-panel admin-crm-timeline">
      <header class="admin-panel__head"><div><p class="admin-kicker">ІСТОРІЯ</p><h2>Зміни</h2></div></header>
      <ol>${history?.length ? history.map(entry => `
        <li class="admin-crm-event">
          <header><strong>${escape(entry.actor)}</strong><time>${formatDateTime(entry.createdAt)}</time></header>
          <p>${Object.keys(entry.changes).map(field => escape(FIELD_LABELS[field] || field)).join(", ")}</p>
        </li>`).join("") : `<li class="admin-muted">Змін через адмінку ще не було.</li>`}</ol>
    </section>`;
}

function bindEditor(container, { canEdit, fields, toPatch, save }) {
  const form = container.querySelector("[data-taxonomy-form]");
  if (!form) return;
  if (!canEdit) {
    form.querySelectorAll("input, select, textarea").forEach(control => { control.disabled = true; });
    return;
  }
  const initial = snapshot(form, fields);
  const saveButton = form.querySelector('[type="submit"]');
  const markDirty = () => { saveButton.disabled = JSON.stringify(snapshot(form, fields)) === JSON.stringify(initial); };
  form.addEventListener("input", markDirty);
  form.addEventListener("change", markDirty);
  markDirty();

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const current = snapshot(form, fields);
    const patch = Object.fromEntries(Object.entries(current).filter(([key, value]) => value !== initial[key]));
    if (!Object.keys(patch).length) return;
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      await save(toPatch(patch));
      showToast(container, "Збережено. Сайт покаже зміни після оновлення сторінки.");
      setTimeout(() => goTo(location.pathname, { replace: true }), 900);
    } catch (error) {
      showToast(container, error.message, true);
      saveButton.disabled = false;
      saveButton.textContent = "Зберегти";
    }
  });
}

function bindList(container) {
  const form = container.querySelector("[data-crm-filters]");
  form?.addEventListener("submit", event => {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (String(value).trim()) params.set(key, String(value).trim());
    goTo(`${location.pathname}${params.size ? `?${params}` : ""}`, { replace: true });
  });
  form?.querySelectorAll("select").forEach(select => select.addEventListener("change", () => form.requestSubmit()));
}

function snapshot(form, fields) {
  const data = new FormData(form);
  return Object.fromEntries(fields.filter(name => data.has(name)).map(name => [name, String(data.get(name) ?? "")]));
}

function goTo(target, { replace = false } = {}) {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { target, replace } }));
}

function showToast(container, message, error = false) {
  const toast = container.querySelector(".admin-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function pageHead(kicker, title, lead) {
  return `<header class="admin-page-head"><div><p class="admin-kicker">${kicker}</p><h1>${title}</h1><p>${escape(lead)}</p></div></header>`;
}

function filterBar(filters, { placeholder, selects }) {
  return `
    <form class="admin-crm-filters" data-crm-filters>
      <label class="admin-filter-search"><span class="admin-sr-only">Пошук</span>${icon("search")}<input type="search" name="q" value="${escape(filters.query)}" placeholder="${escape(placeholder)}" autocomplete="off"></label>
      ${selects.map(select => `
        <label><span>${select.label}</span><select name="${select.name}">
          <option value="">${select.all}</option>
          ${Object.entries(select.options).map(([value, item]) => `<option value="${value}" ${filters[select.name] === value ? "selected" : ""}>${escape(item.label)}</option>`).join("")}
        </select></label>`).join("")}
      <div class="admin-filter-actions"><button class="admin-button admin-button--secondary" type="submit">Застосувати</button><a href="${location.pathname}" data-admin-link>Скинути</a></div>
    </form>`;
}

function table(headings, rows, modifier) {
  return `<div class="admin-products-table-wrap"><table class="admin-crm-table ${modifier}"><thead><tr>${headings.map(text => `<th scope="col">${text}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function emptyState(title, message) {
  return `<section class="admin-state-panel admin-crm-empty">${icon("check")}<div><h2>${escape(title)}</h2><p>${escape(message)}</p></div></section>`;
}

function notFound(title, href, label) {
  return {
    html: `<section class="admin-state-panel" role="alert">${icon("warning")}<div><p class="admin-kicker">404</p><h1>${escape(title)}</h1><p>Можливо, посилання застаріло.</p></div><a class="admin-button admin-button--secondary" href="${href}" data-admin-link>${label}</a></section>`,
    bind() {}
  };
}

function statusBadge(map, value) {
  const item = map[value] || { label: value, tone: "" };
  return `<span class="admin-status${item.tone ? ` admin-status--${item.tone}` : ""}">${escape(item.label)}</span>`;
}

function selectField(name, label, options, value) {
  return `<label class="admin-field"><span>${label}</span><select name="${name}">${Object.entries(options).map(([key, item]) =>
    `<option value="${key}" ${key === value ? "selected" : ""}>${escape(item.label)}</option>`).join("")}</select></label>`;
}

function textField(name, label, value, maxLength, { full = false, type = "text", min, placeholder = "", hint = "", required = false } = {}) {
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${label}</span>
    <input name="${name}" type="${type}" value="${escape(value ?? "")}" ${type === "number" ? `min="${min ?? 0}" step="1"` : `maxlength="${maxLength}"`} ${placeholder ? `placeholder="${escape(placeholder)}"` : ""} ${required ? "required" : ""}>
    ${hint ? `<small>${escape(hint)}</small>` : ""}</label>`;
}

function textArea(name, label, value, maxLength) {
  return `<label class="admin-field admin-field--full"><span>${label}</span><textarea name="${name}" maxlength="${maxLength}">${escape(value ?? "")}</textarea></label>`;
}

function readonlyField(label, value, hint = "") {
  return `<div class="admin-field"><span>${label}</span><output class="admin-taxonomy-readonly">${escape(value)}</output>${hint ? `<small>${escape(hint)}</small>` : ""}</div>`;
}

function logo(brand) {
  if (!brand.logoUrl) return `<span class="admin-taxonomy-logo" aria-hidden="true">${escape(brand.name.slice(0, 1))}</span>`;
  const src = /^https:\/\//i.test(brand.logoUrl) ? brand.logoUrl : `/${brand.logoUrl.replace(/^\/+/, "")}`;
  return `<img class="admin-taxonomy-logo" src="${escape(src)}" alt="" loading="lazy" width="36" height="36">`;
}

function number(value) {
  return new Intl.NumberFormat("uk-UA").format(Number(value) || 0);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
