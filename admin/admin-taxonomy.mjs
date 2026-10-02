import { icon } from "/admin/admin-icons.mjs";

// Brands and categories. Identity fields (id, slug, parent, brand name) are set once at creation
// and read-only afterwards: they drive storefront URLs and product cards. Records can be deleted
// only while nothing references them; the database refuses otherwise.

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
  featured: "Рекомендований", featured_order: "Порядок серед рекомендованих",
  created: "Створено", deleted: "Видалено"
});
const HOMEPAGE_LIMIT = 8;

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
      ${pageHead("ДАНІ", "Бренди", `${number(brands.length)} з ${number(result.brands.length)} брендів.${result.canEdit ? "" : " Ваша роль може лише переглядати."}`,
        createButton("Новий бренд", result.canEdit))}
      ${filterBar(filters, {
        placeholder: "Назва або код бренду",
        selects: [{ name: "visibility", label: "Видимість", all: "Будь-яка", options: BRAND_VISIBILITY }]
      })}
      ${brands.length ? table(["Бренд", "На сайті", "Серій", "Видимість", "Рекомендований", "Країна"], rows, "admin-crm-table--brands")
        : emptyState("Брендів не знайдено", "Змініть пошук або фільтр.")}
      ${result.canEdit ? createDialog("brand", "Новий бренд", "Адресу сторінки бренду потім змінити не можна, тож перевірте її перед збереженням.", `
        ${textField("name", "Назва", "", 120, { full: true, required: true })}
        ${textField("slug", "Адреса сторінки", "", 80, { full: true, placeholder: "заповниться з назви", hint: "Латиниця, цифри й дефіси. Сторінка бренду: /brands/адреса/" })}
        ${textField("country", "Країна", "", 80)}
        ${textField("websiteUrl", "Сайт виробника", "", 500, { type: "url", placeholder: "https://" })}`) : ""}
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => {
      bindList(container);
      bindCreate(container, {
        fields: ["name", "slug", "country", "websiteUrl"],
        create: payload => api.taxonomy.createBrand(payload),
        target: created => `/admin/brands/${encodeURIComponent(created.brand.id)}`
      });
    }
  };
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
          ${canEdit ? deletePanel("бренд", brand.name, brand.productCount
            ? `До бренду прив’язано товарів: ${number(brand.productCount)}. Перенесіть їх на інший бренд або приховайте бренд.`
            : brand.seriesCount ? `У бренду є серії товарів: ${number(brand.seriesCount)}.` : "") : ""}
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
      save: patch => api.taxonomy.updateBrand(brand.id, patch, brand.updatedAt),
      remove: () => api.taxonomy.deleteBrand(brand.id, brand.updatedAt),
      afterRemove: "/admin/brands"
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
        <small>${escape(category.id)}${category.childCount ? ` · ${number(category.childCount)} підкат.` : ""}${category.homepageOrder !== null && category.homepageOrder !== undefined ? " · на головній" : ""}</small></div></td>
      <td class="admin-crm-num">${number(category.publishedCount)}<small>з ${number(category.productCount)}</small></td>
      <td>${statusBadge(CATEGORY_STATUS, category.status)}</td>
      <td>${statusBadge(CATEGORY_VISIBILITY, category.visibility)}</td>
      <td class="admin-crm-num">${number(category.sortOrder)}</td>
    </tr>`).join("");
  const roots = result.categories.filter(category => !category.parentId).length;
  const html = `
    <section class="admin-crm-page">
      ${pageHead("ДАНІ", "Категорії", `${number(result.categories.length)} категорій у ${number(roots)} розділах.${result.canEdit ? "" : " Ваша роль може лише переглядати."}`,
        createButton("Нова категорія", result.canEdit))}
      ${homepagePanel(result.categories, result.canEdit)}
      ${filterBar(filters, {
        placeholder: "Назва або код категорії",
        selects: [{ name: "status", label: "Статус", all: "Будь-який", options: CATEGORY_STATUS }]
      })}
      ${rows ? table(["Категорія", "Товарів на сайті", "Статус", "Видимість", "Порядок"], rows, "admin-crm-table--categories")
        : emptyState("Категорій не знайдено", "Змініть пошук або фільтр.")}
      ${result.canEdit ? categoryCreateDialog(result.categories) : ""}
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => {
      bindList(container);
      bindHomepage(container, result.categories, ids => api.taxonomy.setHomepageCategories(ids));
      bindCategoryCreate(container, api);
    }
  };
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
        ${canEdit && category.level < 3 ? `<button class="admin-button admin-button--secondary" type="button" data-create-open>Додати підкатегорію</button>` : ""}
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
          ${canEdit ? deletePanel("категорію", category.title, detail.children.length
            ? `У категорії є підкатегорії: ${number(detail.children.length)}. Спершу видаліть або перенесіть їх.`
            : category.directCount ? `До категорії прив’язано товарів: ${number(category.directCount)}. Перенесіть їх в іншу категорію.` : "") : ""}
        </aside>
      </div>
      ${canEdit && category.level < 3 ? categoryCreateDialog([], { id: category.id, title: [...detail.path.map(item => item.title), category.title].join(" / ") }) : ""}
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => bindEditor(container, {
      canEdit,
      fields: ["title", "shortTitle", "menuDescription", "description", "status", "visibility", "sortOrder", "seoTitle", "seoDescription"],
      toPatch: patch => patch,
      save: patch => api.taxonomy.updateCategory(category.id, patch, category.updatedAt),
      remove: () => api.taxonomy.deleteCategory(category.id, category.updatedAt),
      afterRemove: "/admin/categories",
      extra: bindCategoryCreate
    }, api)
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

function bindEditor(container, { canEdit, fields, toPatch, save, remove, afterRemove, extra }, api) {
  const form = container.querySelector("[data-taxonomy-form]");
  if (!form) return;
  if (canEdit && remove) bindDelete(container, remove, afterRemove);
  if (canEdit && extra) extra(container, api);
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

function pageHead(kicker, title, lead, action = "") {
  return `<header class="admin-page-head"><div><p class="admin-kicker">${kicker}</p><h1>${title}</h1><p>${escape(lead)}</p></div>${action}</header>`;
}

function createButton(label, canEdit) {
  return canEdit ? `<button class="admin-button admin-button--primary" type="button" data-create-open>${label}${icon("arrow")}</button>` : "";
}

// ---------------------------------------------------------------------------
// Create and delete
// ---------------------------------------------------------------------------
function createDialog(kind, title, note, fieldsHtml) {
  return `<dialog class="admin-dialog admin-create-dialog" data-create-dialog aria-labelledby="create-${kind}-title"><form data-create-form novalidate>
    <header><p class="admin-kicker">НОВИЙ ЗАПИС</p><h2 id="create-${kind}-title">${title}</h2><p>${escape(note)}</p></header>
    <div class="admin-form-grid">${fieldsHtml}</div>
    <p class="admin-feedback admin-feedback--error" data-dialog-error role="alert" hidden></p>
    <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--primary" type="submit">Створити</button></div>
  </form></dialog>`;
}

function categoryCreateDialog(categories, fixedParent = null) {
  const byId = new Map(categories.map(category => [category.id, category]));
  const parents = treeOrder(categories).filter(category => category.level < 3)
    .map(category => [category.id, pathLabel(category, byId)]);
  const parentField = fixedParent
    ? `<input type="hidden" name="parentId" value="${escape(fixedParent.id)}">${readonlyField("Розміщення", fixedParent.title)}`
    : `<label class="admin-field admin-field--full"><span>Розміщення</span><select name="parentId">
        <option value="">Новий розділ верхнього рівня</option>
        ${parents.map(([id, label]) => `<option value="${escape(id)}">${escape(label)}</option>`).join("")}
      </select><small>Каталог має три рівні: розділ, група, категорія.</small></label>`;
  return createDialog("category", fixedParent ? "Нова підкатегорія" : "Нова категорія",
    "Адресу й розміщення потім змінити не можна: від них залежать посилання. Порожня категорія на сайті не з’явиться, доки в ній немає опублікованих товарів.", `
      ${parentField}
      ${textField("title", "Назва", "", 160, { full: true, required: true })}
      ${textField("slug", "Адреса", "", 80, { placeholder: "заповниться з назви", hint: "Латиниця, цифри й дефіси." })}
      ${selectField("status", "Статус", CATEGORY_STATUS, "active")}`);
}

function bindCategoryCreate(container, api) {
  bindCreate(container, {
    fields: ["parentId", "title", "slug", "status"],
    create: payload => api.taxonomy.createCategory(payload),
    target: created => `/admin/categories/${encodeURIComponent(created.category.id)}`
  });
}

function bindCreate(container, { fields, create, target }) {
  const dialog = container.querySelector("[data-create-dialog]");
  if (!dialog) return;
  const form = dialog.querySelector("[data-create-form]");
  const error = dialog.querySelector("[data-dialog-error]");
  const submit = form.querySelector('[type="submit"]');
  container.querySelectorAll("[data-create-open]").forEach(button => button.addEventListener("click", () => {
    error.hidden = true;
    dialog.showModal();
    form.querySelector("input:not([type=hidden])")?.focus();
  }));
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const payload = Object.fromEntries(fields.map(name => [name, String(data.get(name) ?? "").trim()]).filter(([, value]) => value));
    submit.disabled = true;
    submit.textContent = "Створюємо…";
    try {
      const created = await create(payload);
      dialog.close();
      goTo(target(created));
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = "Створити";
    }
  });
}

function deletePanel(noun, name, blocker) {
  return `
    <section class="admin-panel admin-taxonomy-danger">
      <header class="admin-panel__head"><div><p class="admin-kicker">ВИДАЛЕННЯ</p><h2>Видалити ${noun}</h2></div></header>
      <p class="admin-panel-note">${blocker ? escape(blocker) : "Запис зникне з адмінки й каталогу. Історія змін залишиться."}</p>
      <button class="admin-button admin-button--danger" type="button" data-delete-open ${blocker ? "disabled" : ""}>Видалити</button>
      <dialog class="admin-dialog" data-delete-dialog><h2>Видалити ${noun} «${escape(name)}»?</h2><p>Це не можна скасувати.</p>
        <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--danger" type="button" data-delete-confirm>Видалити</button></div></dialog>
    </section>`;
}

function bindDelete(container, remove, afterRemove) {
  const dialog = container.querySelector("[data-delete-dialog]");
  if (!dialog) return;
  container.querySelector("[data-delete-open]")?.addEventListener("click", () => dialog.showModal());
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  const confirmButton = dialog.querySelector("[data-delete-confirm]");
  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    confirmButton.textContent = "Видаляємо…";
    try {
      await remove();
      dialog.close();
      goTo(afterRemove, { replace: true });
    } catch (failure) {
      dialog.close();
      showToast(container, failure.message, true);
      confirmButton.disabled = false;
      confirmButton.textContent = "Видалити";
    }
  });
}

// ---------------------------------------------------------------------------
// Homepage categories
// ---------------------------------------------------------------------------
function homepagePanel(categories, canEdit) {
  return `
    <section class="admin-panel admin-taxonomy-home" data-homepage>
      <header class="admin-panel__head"><div><p class="admin-kicker">ГОЛОВНА СТОРІНКА</p><h2>Категорії на головній</h2></div>
        ${canEdit ? `<button class="admin-button admin-button--primary" type="button" data-homepage-save disabled>Зберегти</button>` : ""}</header>
      <p class="admin-panel-note">Блок «Категорії» поруч із банером, у цьому порядку. До ${HOMEPAGE_LIMIT} позицій, найкраще виглядають 6. Категорії без опублікованих товарів на сайті пропускаються.</p>
      <ol class="admin-taxonomy-home__list" data-homepage-list></ol>
      ${canEdit ? `<div class="admin-taxonomy-home__add">
        <label class="admin-field"><span>Додати категорію</span><select data-homepage-select></select></label>
        <button class="admin-button admin-button--secondary" type="button" data-homepage-add>Додати</button>
      </div>` : ""}
    </section>`;
}

function bindHomepage(container, categories, save) {
  const panel = container.querySelector("[data-homepage]");
  if (!panel) return;
  const byId = new Map(categories.map(category => [category.id, category]));
  const initial = categories.filter(category => category.homepageOrder !== null && category.homepageOrder !== undefined)
    .sort((a, b) => a.homepageOrder - b.homepageOrder).map(category => category.id);
  let selected = [...initial];
  const list = panel.querySelector("[data-homepage-list]");
  const select = panel.querySelector("[data-homepage-select]");
  const addButton = panel.querySelector("[data-homepage-add]");
  const saveButton = panel.querySelector("[data-homepage-save]");
  const canEdit = Boolean(saveButton);

  const element = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (value === false || value === null || value === undefined) continue;
      if (key === "className") node.className = value;
      else node.setAttribute(key, value === true ? "" : value);
    }
    node.append(...children.filter(child => child !== null && child !== undefined));
    return node;
  };
  const iconButton = (label, text, data, disabled) => element("button", { className: "admin-icon-button", type: "button", "aria-label": label, disabled, ...data }, text);

  const render = () => {
    list.replaceChildren(...(selected.length ? selected.map((id, index) => {
      const category = byId.get(id);
      const warning = category.status !== "active" || category.visibility !== "catalog" ? "не активна в каталозі"
        : !category.publishedCount ? "немає товарів на сайті" : "";
      return element("li", { className: "admin-taxonomy-home__item" },
        element("span", { className: "admin-taxonomy-home__position" }, String(index + 1)),
        element("div", {}, element("strong", {}, category.title),
          element("small", {}, pathLabel(category, byId, true), warning ? " · " : "",
            warning ? element("span", { className: "admin-taxonomy-home__warning" }, warning) : null)),
        canEdit ? element("div", { className: "admin-taxonomy-home__actions" },
          iconButton("Вище", "↑", { "data-move": "-1", "data-id": id }, index === 0),
          iconButton("Нижче", "↓", { "data-move": "1", "data-id": id }, index === selected.length - 1),
          iconButton("Прибрати з головної", "×", { "data-remove": id }, false)) : null);
    }) : [element("li", { className: "admin-muted" }, "Нічого не вибрано: на головній будуть усі розділи верхнього рівня.")]));
    if (select) {
      const options = treeOrder(categories).filter(category => !selected.includes(category.id)
        && category.status === "active" && category.visibility === "catalog" && category.publishedCount > 0);
      select.replaceChildren(element("option", { value: "" }, "Оберіть категорію"),
        ...options.map(category => element("option", { value: category.id }, pathLabel(category, byId))));
      addButton.disabled = selected.length >= HOMEPAGE_LIMIT;
      select.disabled = selected.length >= HOMEPAGE_LIMIT;
    }
    if (saveButton) saveButton.disabled = !selected.length || JSON.stringify(selected) === JSON.stringify(initial);
  };

  list.addEventListener("click", event => {
    const move = event.target.closest("[data-move]");
    const removeButton = event.target.closest("[data-remove]");
    if (move) {
      const index = selected.indexOf(move.dataset.id);
      const next = index + Number(move.dataset.move);
      [selected[index], selected[next]] = [selected[next], selected[index]];
    } else if (removeButton) {
      selected = selected.filter(id => id !== removeButton.dataset.remove);
    } else return;
    render();
  });
  addButton?.addEventListener("click", () => {
    if (!select.value || selected.length >= HOMEPAGE_LIMIT) return;
    selected.push(select.value);
    render();
  });
  saveButton?.addEventListener("click", async () => {
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      await save(selected);
      showToast(container, "Збережено. Головна покаже нові категорії після оновлення сторінки.");
      setTimeout(() => goTo(location.pathname + location.search, { replace: true }), 900);
    } catch (failure) {
      showToast(container, failure.message, true);
      saveButton.textContent = "Зберегти";
      render();
    }
  });
  render();
}

function pathLabel(category, byId, parentsOnly = false) {
  const names = [];
  for (let current = parentsOnly ? byId.get(category.parentId) : category; current; current = byId.get(current.parentId)) names.unshift(current.title);
  return names.length ? names.join(" / ") : "Розділ верхнього рівня";
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
