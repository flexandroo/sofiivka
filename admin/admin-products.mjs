import { icon } from "/admin/admin-icons.mjs";
import { priceImportHref } from "/admin/admin-prices.mjs";
import { relationsPanel, bindRelationsPanel } from "/admin/admin-product-relations.mjs";

const PUBLICATION = Object.freeze({ published: "Опубліковано", draft: "Чернетка", hidden: "Приховано", archived: "Архів" });
const INVENTORY = Object.freeze({ in_stock: "В наявності", out_of_stock: "Немає", preorder: "Передзамовлення", discontinued: "Знято", unknown: "Невідомо" });
const PRICE = Object.freeze({ known: "Вказана", on_request: "За запитом", unknown: "Не вказана" });
const DOCUMENT_TYPES = Object.freeze({ manual: "Посібник", datasheet: "Технічний лист", certificate: "Сертифікат", instruction: "Інструкція", other: "Інше" });
let referenceCache = null;

export function resetProductsCache() {
  referenceCache = null;
}

export async function createProductsListView({ api, profile, navigate, search = location.search, signal }) {
  const filters = parseFilters(search);
  const [references, result] = await Promise.all([
    getReferences(api),
    api.listProducts(filters, { signal })
  ]);
  const canMutate = references.capabilities.manageCore;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const html = `
    <section class="admin-products-page" data-products-page>
      <header class="admin-page-head admin-page-head--products">
        <div><p class="admin-kicker">КАНОНІЧНИЙ КАТАЛОГ</p><h1>Товари</h1><p><strong>${formatNumber(result.total)}</strong> записів за поточними умовами.</p></div>
        <div class="admin-crm-head-actions"><a class="admin-button admin-button--secondary" href="${escape(priceImportHref(search))}" data-admin-link data-price-import-link>${icon("download")}Ціни: імпорт / експорт</a>
        <button class="admin-button admin-button--primary" type="button" data-create-product ${canMutate ? "" : "disabled title=\"Недоступно для цієї ролі\""}>Новий товар${icon("arrow")}</button></div>
      </header>
      <form class="admin-products-filters" data-products-filters>
        <button class="admin-filter-close" type="button" data-close-mobile-filters aria-label="Закрити фільтри">×</button>
        <label class="admin-filter-search"><span class="admin-sr-only">Пошук</span>${icon("search")}<input type="search" name="q" value="${escape(filters.query)}" placeholder="Назва, SKU, модель або бренд" autocomplete="off"></label>
        <label><span>Бренд</span><select name="brand">${option("", "Усі бренди", filters.brandId)}${references.brands.map(item => option(item.id, item.name, filters.brandId)).join("")}</select></label>
        <label><span>Публікація</span><select name="publication">${option("", "Усі статуси", filters.publication)}${Object.entries(PUBLICATION).map(([value, label]) => option(value, label, filters.publication)).join("")}</select></label>
        <label class="admin-filter-wide"><span>Категорія</span><select name="category">${option("", "Усі категорії", filters.categoryId)}${references.categories.map(item => option(item.id, item.path, filters.categoryId)).join("")}</select></label>
        <label><span>Наявність</span><select name="inventory">${option("", "Будь-яка", filters.inventory)}${Object.entries(INVENTORY).map(([value, label]) => option(value, label, filters.inventory)).join("")}</select></label>
        <label><span>Ціна</span><select name="price">${option("", "Будь-яка", filters.price)}${Object.entries(PRICE).map(([value, label]) => option(value, label, filters.price)).join("")}</select></label>
        <label><span>Сортування</span><select name="sort">
          ${option("updated-desc", "Оновлені спочатку", filters.sort)}${option("updated-asc", "Давні спочатку", filters.sort)}
          ${option("title-asc", "Назва А–Я", filters.sort)}${option("title-desc", "Назва Я–А", filters.sort)}
          ${option("price-asc", "Ціна: зростання", filters.sort)}${option("price-desc", "Ціна: спадання", filters.sort)}${option("sku-asc", "SKU А–Я", filters.sort)}
        </select></label>
        <div class="admin-filter-actions"><button class="admin-button admin-button--secondary" type="submit">Застосувати</button><a href="/admin/products" data-admin-link>Скинути</a></div>
      </form>
      <button class="admin-mobile-filter-button" type="button" data-mobile-filters>${icon("attributes")}Фільтри <span>${activeFilterCount(filters)}</span></button>
      <div class="admin-selection-bar" data-selection-bar hidden>
        <strong><span data-selection-count>0</span> вибрано</strong>
        <select data-bulk-action ${canMutate ? "" : "disabled"} aria-label="Масова дія">
          <option value="">Оберіть дію</option><option value="publish">Опублікувати</option><option value="hide">Приховати</option>
          <option value="category">Змінити категорію</option><option value="brand">Змінити бренд</option><option value="archive">Архівувати</option>
        </select>
        <select data-bulk-value hidden aria-label="Нове значення"></select>
        <button class="admin-button admin-button--primary" type="button" data-bulk-open disabled>Застосувати</button>
        <button class="admin-button admin-button--ghost" type="button" data-selection-clear>Скасувати вибір</button>
      </div>
      ${result.products.length ? renderProductTable(result.products, canMutate) : renderEmpty(filters)}
      <nav class="admin-pagination" aria-label="Сторінки товарів">
        <button type="button" data-page="${result.page - 1}" ${result.page <= 1 ? "disabled" : ""}>Назад</button>
        <span>Сторінка <strong>${result.page}</strong> з ${pages}</span>
        <button type="button" data-page="${result.page + 1}" ${result.page >= pages ? "disabled" : ""}>Далі</button>
      </nav>
      ${renderCreateDialog(references)}
      ${renderBulkDialog()}
      <div class="admin-toast" data-products-toast role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => bindProductsList(container, { api, references, result, filters, navigate, canMutate }) };
}

export async function createProductEditorView({ api, profile, navigate, legacyId, signal }) {
  const [references, detail] = await Promise.all([getReferences(api), api.getProduct(legacyId, { signal })]);
  if (!detail?.product) return {
    html: `<section class="admin-state-panel" role="alert">${icon("warning")}<div><p class="admin-kicker">ТОВАР НЕ ЗНАЙДЕНО</p><h1>Запис недоступний</h1><p>Перевірте legacy ID або поверніться до списку.</p></div><a class="admin-button admin-button--secondary" href="/admin/products" data-admin-link>До товарів</a></section>`,
    bind() {}
  };
  const product = detail.product;
  const canCore = references.capabilities.manageCore;
  const canContent = references.capabilities.manageContent;
  const html = `
    <section class="admin-product-editor" data-product-editor data-legacy-id="${escape(product.legacyId)}">
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/products" data-admin-link class="admin-back-link">← Усі товари</a>
          <p class="admin-kicker">${escape(product.sku)} · ${escape(product.legacyId)}</p>
          <h1>${escape(product.title)}</h1>
          <div class="admin-editor-meta"><span class="admin-status" data-status="${escape(product.publicationStatus)}">${PUBLICATION[product.publicationStatus]}</span><span>Оновлено ${formatDateTime(product.updatedAt)}</span></div>
        </div>
        <div class="admin-editor-head__actions">
          <a class="admin-button admin-button--secondary" href="/product?id=${encodeURIComponent(product.legacyId)}" target="_blank" rel="noreferrer">Переглянути${icon("external")}</a>
          <button class="admin-button admin-button--secondary" type="button" disabled title="Дублювання заплановане після v1">Дублювати</button>
          <button class="admin-button admin-button--danger" type="button" data-archive-product ${canCore && product.publicationStatus !== "archived" ? "" : "disabled"}>В архів</button>
        </div>
      </header>
      <div class="admin-editor-layout">
        <nav class="admin-editor-tabs" aria-label="Розділи товару" role="tablist">
          ${tab("core", "Основне", true)}${tab("content", "Контент")}${tab("attributes", `Характеристики · ${detail.attributes.length}`)}
          ${tab("media", `Медіа · ${detail.media.length}`)}${tab("documents", `Документи · ${detail.documents.length}`)}${tab("seo", "SEO")}${tab("relations", "Пов’язані товари")}
        </nav>
        <form class="admin-editor-form" data-editor-form novalidate>
          ${renderCorePanel(product, references, canCore)}
          ${renderContentPanel(product, canContent)}
          ${renderAttributesPanel(detail, references, canCore, product.categoryId)}
          ${renderMediaPanel(detail.media, canContent)}
          ${renderDocumentsPanel(detail.documents, canContent)}
          ${renderSeoPanel(product, canContent)}
          ${relationsPanel()}
        </form>
        <aside class="admin-editor-context">
          <section><p class="admin-kicker">ІДЕНТИЧНІСТЬ</p><dl><div><dt>Legacy ID</dt><dd><code>${escape(product.legacyId)}</code></dd></div><div><dt>Створено</dt><dd>${formatDateTime(product.createdAt)}</dd></div><div><dt>Імпорт</dt><dd>${formatDateTime(product.lastImportedAt)}</dd></div><div><dt>Перевірено</dt><dd>${formatDateTime(product.lastVerifiedAt)}</dd></div></dl></section>
          <section><p class="admin-kicker">ОСТАННІ ЗМІНИ</p>${detail.audit.length ? `<ol class="admin-audit-list">${detail.audit.slice(0, 8).map(item => `<li><strong>${escape(item.action)}</strong><span>${escape((item.sections || []).join(", "))}</span><time>${formatDateTime(item.createdAt)}</time></li>`).join("")}</ol>` : `<p class="admin-muted">Адмін-змін ще не зафіксовано.</p>`}</section>
        </aside>
      </div>
      <footer class="admin-save-bar">
        <div><span class="admin-save-state" data-save-state>Змін немає</span><small>Збереження створює audit-запис і нову catalog revision.</small></div>
        <div class="admin-save-actions"><button class="admin-button admin-button--ghost" type="button" data-reset-product disabled>Скасувати зміни</button><button class="admin-button admin-button--primary" type="button" data-save-product disabled>Зберегти зміни</button></div>
      </footer>
      <dialog class="admin-dialog" data-archive-dialog><h2>Архівувати товар?</h2><p>Товар зникне з публічного каталогу, але запис і його історія залишаться в базі.</p><div><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--danger" type="button" data-archive-confirm>Архівувати</button></div></dialog>
      <div class="admin-toast" data-editor-toast role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => {
    bindProductEditor(container, { api, references, detail, navigate, canCore, canContent });
    bindRelationsPanel(container.querySelector("[data-product-editor]"), { api, legacyId: product.legacyId });
  } };
}

async function getReferences(api) {
  if (!referenceCache) referenceCache = api.getProductReferenceData().catch(error => { referenceCache = null; throw error; });
  return referenceCache;
}

function parseFilters(search) {
  const params = new URLSearchParams(search);
  return Object.freeze({
    query: params.get("q")?.trim() || "", categoryId: params.get("category") || "",
    brandId: params.get("brand") || "", publication: params.get("publication") || "",
    inventory: params.get("inventory") || "", price: params.get("price") || "",
    sort: params.get("sort") || "updated-desc", page: Math.max(1, Number(params.get("page")) || 1), pageSize: 50
  });
}

function renderProductTable(products, canMutate) {
  return `<div class="admin-products-table-wrap"><table class="admin-products-table"><caption class="admin-sr-only">Товари каталогу</caption><thead><tr>
    <th class="admin-check-cell"><input type="checkbox" data-select-all aria-label="Вибрати всі товари на сторінці" ${canMutate ? "" : "disabled"}></th>
    <th>Товар</th><th>Бренд / категорія</th><th>Ціна</th><th>Наявність</th><th>Публікація</th><th>Оновлено</th><th><span class="admin-sr-only">Відкрити</span></th>
  </tr></thead><tbody>${products.map(product => `<tr>
    <td class="admin-check-cell"><input type="checkbox" value="${escape(product.legacyId)}" data-select-product aria-label="Вибрати ${escape(product.title)}" ${canMutate ? "" : "disabled"}></td>
    <td class="admin-product-cell"><a href="/admin/products/${encodeURIComponent(product.legacyId)}" data-admin-link>${product.imageUrl ? `<img src="${escape(product.imageUrl)}" alt="" loading="lazy">` : `<span class="admin-product-placeholder">${icon("products")}</span>`}<span><strong>${escape(product.title)}</strong><small>SKU ${escape(product.sku)} · ${escape(product.model)}</small></span></a></td>
    <td><strong>${escape(product.brand.name)}</strong><small>${escape(product.category.title)}</small></td>
    <td>${formatPrice(product)}</td><td><span class="admin-status" data-status="${escape(product.inventoryStatus)}">${INVENTORY[product.inventoryStatus]}</span></td>
    <td><span class="admin-status" data-status="${escape(product.publicationStatus)}">${PUBLICATION[product.publicationStatus]}</span></td>
    <td><time>${formatDateTime(product.updatedAt)}</time></td><td><a class="admin-row-open" href="/admin/products/${encodeURIComponent(product.legacyId)}" data-admin-link aria-label="Відкрити ${escape(product.title)}">${icon("arrow")}</a></td>
  </tr>`).join("")}</tbody></table></div>`;
}

function renderEmpty(filters) {
  return `<section class="admin-empty-state">${icon("products")}<div><h2>Товарів не знайдено</h2><p>${activeFilterCount(filters) ? "Змініть або скиньте фільтри." : "Каталог поки порожній."}</p></div><a class="admin-button admin-button--secondary" href="/admin/products" data-admin-link>Скинути фільтри</a></section>`;
}

function renderCreateDialog(references) {
  return `<dialog class="admin-dialog admin-create-dialog" data-create-dialog aria-labelledby="create-product-title"><form data-create-form>
    <header><p class="admin-kicker">НОВИЙ DRAFT</p><h2 id="create-product-title">Створити товар</h2><p>Legacy ID буде згенеровано незалежно від назви та залишиться незмінним.</p></header>
    <div class="admin-form-grid"><label class="admin-field admin-field--full"><span>Назва</span><input name="title" required maxlength="240"></label>
    <label class="admin-field"><span>SKU</span><input name="sku" required maxlength="120"></label><label class="admin-field"><span>Модель</span><input name="model" required maxlength="180"></label>
    <label class="admin-field"><span>Бренд</span><select name="brandId" required><option value="">Оберіть</option>${references.brands.map(item => option(item.id, item.name)).join("")}</select></label>
    <label class="admin-field"><span>Категорія</span><select name="categoryId" required><option value="">Оберіть</option>${references.categories.map(item => option(item.id, item.path)).join("")}</select></label>
    <label class="admin-field"><span>Публікація</span><select disabled><option>Чернетка</option></select></label>
    <label class="admin-field"><span>Стан ціни</span><select disabled><option>Не вказана</option></select></label>
    <label class="admin-field"><span>Наявність</span><select disabled><option>Невідомо</option></select></label></div>
    <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--primary" type="submit">Створити чернетку</button></div>
  </form></dialog>`;
}

function renderBulkDialog() {
  return `<dialog class="admin-dialog" data-bulk-dialog><h2>Підтвердити масову зміну</h2><p data-bulk-summary></p><div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--danger" type="button" data-bulk-confirm>Підтвердити</button></div></dialog>`;
}

function bindProductsList(container, context) {
  const filtersForm = container.querySelector("[data-products-filters]");
  const navigateWithForm = (page = 1) => {
    const data = new FormData(filtersForm); const params = new URLSearchParams();
    for (const name of ["q", "category", "brand", "publication", "inventory", "price", "sort"]) {
      const value = String(data.get(name) || "").trim(); if (value && !(name === "sort" && value === "updated-desc")) params.set(name, value);
    }
    if (page > 1) params.set("page", String(page));
    context.navigate(`/admin/products${params.size ? `?${params}` : ""}`);
  };
  let searchTimer = null;
  filtersForm?.addEventListener("submit", event => { event.preventDefault(); clearTimeout(searchTimer); navigateWithForm(); });
  filtersForm?.querySelector('input[name="q"]')?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => navigateWithForm(), 350);
  });
  filtersForm?.querySelectorAll("select").forEach(select => select.addEventListener("change", () => navigateWithForm()));
  container.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => navigateWithForm(Number(button.dataset.page))));

  const mobileButton = container.querySelector("[data-mobile-filters]");
  mobileButton?.addEventListener("click", () => filtersForm.classList.toggle("is-mobile-open"));
  filtersForm?.querySelector("[data-close-mobile-filters]")?.addEventListener("click", () => filtersForm.classList.remove("is-mobile-open"));

  const boxes = [...container.querySelectorAll("[data-select-product]")];
  const all = container.querySelector("[data-select-all]");
  const selectionBar = container.querySelector("[data-selection-bar]");
  const action = container.querySelector("[data-bulk-action]");
  const value = container.querySelector("[data-bulk-value]");
  const openBulk = container.querySelector("[data-bulk-open]");
  const selected = () => boxes.filter(box => box.checked).map(box => box.value);
  const syncSelection = () => {
    const count = selected().length; selectionBar.hidden = !count;
    selectionBar.querySelector("[data-selection-count]").textContent = count;
    if (all) { all.checked = count === boxes.length && count > 0; all.indeterminate = count > 0 && count < boxes.length; }
    openBulk.disabled = !count || !action.value || (["brand", "category"].includes(action.value) && !value.value);
  };
  all?.addEventListener("change", () => { boxes.forEach(box => { box.checked = all.checked; }); syncSelection(); });
  boxes.forEach(box => box.addEventListener("change", syncSelection));
  container.querySelector("[data-selection-clear]")?.addEventListener("click", () => { boxes.forEach(box => { box.checked = false; }); if (all) all.checked = false; syncSelection(); });
  action?.addEventListener("change", () => {
    const type = action.value; value.hidden = !["brand", "category"].includes(type); value.replaceChildren();
    if (!value.hidden) {
      value.append(new Option(type === "brand" ? "Оберіть бренд" : "Оберіть категорію", ""));
      const items = type === "brand" ? context.references.brands.map(item => [item.id, item.name]) : context.references.categories.map(item => [item.id, item.path]);
      items.forEach(([id, label]) => value.append(new Option(label, id)));
    }
    syncSelection();
  });
  value?.addEventListener("change", syncSelection);

  const bulkDialog = container.querySelector("[data-bulk-dialog]");
  openBulk?.addEventListener("click", () => {
    const labels = { publish: "опублікувати", hide: "приховати", archive: "архівувати", category: "змінити категорію для", brand: "змінити бренд для" };
    bulkDialog.querySelector("[data-bulk-summary]").textContent = `Підтвердіть дію «${labels[action.value]}» для ${selected().length} товарів. Зміна одразу з’явиться на сайті.`;
    bulkDialog.showModal();
  });
  bulkDialog?.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => bulkDialog.close());
  bulkDialog?.querySelector("[data-bulk-confirm]")?.addEventListener("click", async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = "Змінюємо…";
    try {
      const result = await context.api.bulkProducts(selected(), action.value, value.value || null);
      bulkDialog.close(); showToast(container, `${result.affected} товарів оновлено.`); setTimeout(() => context.navigate(location.pathname + location.search, { replace: true }), 350);
    } catch (error) { button.disabled = false; button.textContent = "Підтвердити"; showToast(container, error.message, true); }
  });

  const createDialog = container.querySelector("[data-create-dialog]");
  container.querySelector("[data-create-product]")?.addEventListener("click", () => createDialog.showModal());
  createDialog?.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => createDialog.close());
  createDialog?.querySelector("[data-create-form]")?.addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
    const button = form.querySelector("[type=submit]"); button.disabled = true; button.textContent = "Створюємо…";
    const data = new FormData(form);
    try {
      const created = await context.api.createProduct(Object.fromEntries(["title", "sku", "model", "brandId", "categoryId"].map(name => [name, String(data.get(name) || "").trim()])));
      createDialog.close(); context.navigate(`/admin/products/${encodeURIComponent(created.legacyId)}`);
    } catch (error) { button.disabled = false; button.textContent = "Створити чернетку"; showToast(container, error.message, true); }
  });
}

function renderCorePanel(product, references, enabled) {
  const disabled = enabled ? "" : "disabled";
  return `<section id="panel-core" class="admin-editor-panel is-active" data-editor-panel="core" role="tabpanel" aria-labelledby="tab-core">
    <header><div><p class="admin-kicker">ОСНОВНЕ</p><h2>Ідентичність і класифікація</h2></div><span>${enabled ? "Редагування дозволено" : "Лише перегляд"}</span></header>
    <div class="admin-form-grid">
      ${field("Назва", "title", product.title, { full: true, disabled, required: true })}${field("Коротка назва", "shortTitle", product.shortTitle, { full: true, disabled, required: true })}
      ${field("SKU", "sku", product.sku, { disabled, required: true })}${field("Модель", "model", product.model, { disabled, required: true })}
      ${field("Slug", "slug", product.slug, { full: true, disabled, required: true, help: "Legacy ID не залежить від slug і не змінюється." })}
      ${selectField("Бренд", "brandId", product.brandId, references.brands.map(item => [item.id, item.name]), disabled)}
      ${selectField("Категорія", "categoryId", product.categoryId, references.categories.map(item => [item.id, item.path]), disabled)}
      ${selectField("Серія", "seriesId", product.seriesId || "", [["", "Без серії"], ...references.series.filter(item => item.brandId === product.brandId).map(item => [item.id, item.name])], disabled)}
      ${selectField("Публікація", "publicationStatus", product.publicationStatus, Object.entries(PUBLICATION), disabled)}
    </div>
    <p class="admin-relation-warning" data-series-brand-warning hidden>Поточна серія не належить до вибраного бренду. Оберіть сумісну серію або «Без серії» — значення не змінюється автоматично.</p>
    <div class="admin-section-divider"></div>
    <header><div><p class="admin-kicker">КОМЕРЦІЙНІ ДАНІ</p><h2>Ціна та наявність</h2></div></header>
    <div class="admin-form-grid admin-form-grid--commercial">
      ${selectField("Статус ціни", "priceStatus", product.priceStatus, Object.entries(PRICE), disabled)}
      ${field("Поточна ціна", "amount", product.amount ?? "", { type: "number", disabled, min: "0", step: "0.01" })}
      ${field("Стара ціна", "oldAmount", product.oldAmount ?? "", { type: "number", disabled, min: "0", step: "0.01" })}
      ${selectField("Валюта", "currency", product.currency, [["UAH", "UAH"]], disabled)}
      ${selectField("Наявність", "inventoryStatus", product.inventoryStatus, Object.entries(INVENTORY), disabled)}
    </div>
  </section>`;
}

function renderContentPanel(product, enabled) {
  const disabled = enabled ? "" : "disabled";
  return `<section id="panel-content" class="admin-editor-panel" data-editor-panel="content" role="tabpanel" aria-labelledby="tab-content" hidden>
    <header><div><p class="admin-kicker">КОНТЕНТ</p><h2>Описи товару</h2></div><span>${enabled ? "Редагування дозволено" : "Лише перегляд"}</span></header>
    <div class="admin-form-stack">
      ${textareaField("Короткий опис", "shortDescription", product.shortDescription, disabled, 4)}
      ${textareaField("Опис", "description", product.description, disabled, 7)}
      ${textareaField("Повний опис", "fullDescription", product.fullDescription, disabled, 10)}
      ${textareaField("Структуровані секції · JSON", "descriptionSections", JSON.stringify(product.descriptionSections || [], null, 2), disabled, 8, "Масив структурованих блоків; перевіряється перед збереженням.")}
      ${field("Бейджі", "badges", (product.badges || []).join(", "), { full: true, disabled, help: "Розділяйте комою." })}
    </div>
  </section>`;
}

function renderAttributesPanel(detail, references, enabled, categoryId) {
  const rules = categoryRules(references, categoryId);
  const ruleMap = new Map(rules.map(rule => [rule.attributeId, rule]));
  const definitions = new Map(references.attributes.map(item => [item.id, item]));
  const rows = detail.attributes.map(item => attributeRow({ ...definitions.get(item.attributeId), ...item }, ruleMap.get(item.attributeId))).join("");
  const relevant = references.attributes.filter(item => ruleMap.has(item.id));
  const hasMismatch = detail.attributes.some(item => !ruleMap.has(item.attributeId));
  return `<section id="panel-attributes" class="admin-editor-panel" data-editor-panel="attributes" role="tabpanel" aria-labelledby="tab-attributes" hidden>
    <header><div><p class="admin-kicker">ТИПІЗОВАНІ ДАНІ</p><h2>Характеристики</h2></div>${enabled ? `<button class="admin-button admin-button--secondary" type="button" data-add-attribute>Додати характеристику</button>` : `<span>Лише перегляд</span>`}</header>
    <p class="admin-panel-note">Доступні лише характеристики поточної категорії. Позначка «Фільтр каталогу» є read-only.</p>
    <div class="admin-category-warning" data-category-attribute-warning ${hasMismatch ? "" : "hidden"}>Частина характеристик не належить до вибраної категорії. Значення збережені й не будуть видалені автоматично.</div>
    <div class="admin-attribute-picker" data-attribute-picker hidden><select data-new-attribute><option value="">Оберіть характеристику</option>${relevant.map(item => option(item.id, `${item.label}${item.unit ? ` · ${item.unit}` : ""}`)).join("")}</select><button class="admin-button admin-button--primary" type="button" data-attribute-confirm>Додати</button></div>
    <div class="admin-attributes-list" data-attributes-list>${rows || `<p class="admin-muted" data-no-attributes>Типізованих значень немає.</p>`}</div>
    <details class="admin-source-evidence"><summary>Source / unmapped evidence <span>${detail.sourceAttributes.length}</span></summary>
      <p>Read-only provenance без raw supplier payload.</p>
      <div class="admin-source-table"><table><thead><tr><th>Поле</th><th>Значення</th><th>Mapping</th><th>Layer</th></tr></thead><tbody>${detail.sourceAttributes.map(item => `<tr><td>${escape(item.label)}</td><td>${escape(displayValue(item.value))}</td><td>${escape(item.mappingStatus)}</td><td>${escape(item.canonicalLayer || "—")}</td></tr>`).join("")}</tbody></table></div>
    </details>
  </section>`;
}

function attributeRow(item, rule = null) {
  const value = item.value ?? "";
  const input = item.valueType === "boolean"
    ? `<select data-attribute-value><option value="true" ${value === true ? "selected" : ""}>Так</option><option value="false" ${value === false ? "selected" : ""}>Ні</option></select>`
    : item.valueType === "select"
      ? `<select data-attribute-value>${(item.options || []).map(entry => option(entry.value, entry.label, value)).join("")}${(item.options || []).some(entry => entry.value === value) ? "" : option(value, value, value)}</select>`
    : `<input data-attribute-value type="${item.valueType === "number" ? "number" : "text"}" value="${escape(value)}" ${item.valueType === "number" ? 'step="any"' : ""}>`;
  const badges = [rule?.displayGroup, rule?.facetEnabled ? "Фільтр каталогу" : ""].filter(Boolean);
  return `<div class="admin-attribute-row${rule ? "" : " is-category-mismatch"}" data-attribute-row data-id="${escape(item.attributeId || item.id)}" data-type="${escape(item.valueType)}"><label><span>${escape(item.label)}${item.unit ? ` <small>${escape(item.unit)}</small>` : ""}<em data-attribute-meta ${badges.length ? "" : "hidden"}>${badges.map(escape).join(" · ")}</em></span>${input}</label><button type="button" data-remove-attribute aria-label="Видалити ${escape(item.label)}">×</button></div>`;
}

function renderMediaPanel(media, enabled) {
  return `<section id="panel-media" class="admin-editor-panel" data-editor-panel="media" role="tabpanel" aria-labelledby="tab-media" hidden>
    <header><div><p class="admin-kicker">МЕДІА</p><h2>Зображення і відео</h2></div>${enabled ? `<div class="admin-inline-actions"><button class="admin-button admin-button--secondary" type="button" data-add-media>Додати URL</button><label class="admin-button admin-button--primary admin-upload-button">Завантажити<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" data-upload-media></label></div>` : `<span>Лише перегляд</span>`}</header>
    <p class="admin-panel-note">Зовнішні URL зберігаються; нові файли завантажуються в <code>product-media/{product_uuid}</code>.</p>
    <div class="admin-asset-list" data-media-list>${media.map(mediaRow).join("") || `<p class="admin-muted" data-no-media>Медіа відсутні.</p>`}</div>
  </section>`;
}

function mediaRow(item) {
  return `<article class="admin-asset-row" data-media-row>
    <div class="admin-asset-preview">${item.mediaType === "image" && item.url ? `<img src="${escape(item.url)}" alt="">` : icon("media")}</div>
    <div class="admin-asset-fields"><input data-asset-url type="url" value="${escape(item.url || "")}" placeholder="https://…" required><input data-asset-alt value="${escape(item.altText || "")}" placeholder="Alt text"><input data-storage-path type="hidden" value="${escape(item.storagePath || "")}"><input data-source-url type="hidden" value="${escape(item.sourceUrl || "")}"></div>
    <select data-media-type aria-label="Тип медіа">${option("image", "Зображення", item.mediaType)}${option("diagram", "Схема", item.mediaType)}${option("video", "Відео", item.mediaType)}</select>
    <select data-media-role aria-label="Роль">${option("primary", "Primary", item.role)}${option("gallery", "Gallery", item.role)}${option("dimension", "Розміри", item.role)}${option("other", "Інше", item.role)}</select>
    <div class="admin-order-actions"><button type="button" data-move-up>Вгору</button><button type="button" data-move-down>Вниз</button><button type="button" data-remove-asset>Прибрати</button></div>
  </article>`;
}

function renderDocumentsPanel(documents, enabled) {
  return `<section id="panel-documents" class="admin-editor-panel" data-editor-panel="documents" role="tabpanel" aria-labelledby="tab-documents" hidden>
    <header><div><p class="admin-kicker">ДОКУМЕНТАЦІЯ</p><h2>Файли товару</h2></div>${enabled ? `<div class="admin-inline-actions"><button class="admin-button admin-button--secondary" type="button" data-add-document>Додати URL</button><label class="admin-button admin-button--primary admin-upload-button">Завантажити PDF<input type="file" accept="application/pdf" data-upload-document></label></div>` : `<span>Лише перегляд</span>`}</header>
    <p class="admin-panel-note">PDF до 25 MB; зовнішні посилання залишаються валідним джерелом.</p>
    <div class="admin-document-list" data-document-list>${documents.map(documentRow).join("") || `<p class="admin-muted" data-no-documents>Документів немає.</p>`}</div>
  </section>`;
}

function documentRow(item) {
  return `<article class="admin-document-row" data-document-row>${icon("collections")}<input data-document-title value="${escape(item.title || "")}" placeholder="Назва документа" required><input data-document-url type="url" value="${escape(item.url || "")}" placeholder="https://…" required><select data-document-type>${Object.entries(DOCUMENT_TYPES).map(([value, label]) => option(value, label, item.documentType)).join("")}</select><input data-storage-path type="hidden" value="${escape(item.storagePath || "")}"><input data-source-url type="hidden" value="${escape(item.sourceUrl || "")}"><div class="admin-order-actions"><button type="button" data-move-up>Вгору</button><button type="button" data-move-down>Вниз</button><button type="button" data-remove-asset>Прибрати</button></div></article>`;
}

function renderSeoPanel(product, enabled) {
  const disabled = enabled ? "" : "disabled";
  return `<section id="panel-seo" class="admin-editor-panel" data-editor-panel="seo" role="tabpanel" aria-labelledby="tab-seo" hidden>
    <header><div><p class="admin-kicker">ПОШУКОВА ВИДИМІСТЬ</p><h2>SEO</h2></div><span>${enabled ? "Редагування дозволено" : "Лише перегляд"}</span></header>
    <div class="admin-form-stack">${field("SEO title", "seoTitle", product.seoTitle || "", { full: true, disabled, maxlength: 160 })}${textareaField("SEO description", "seoDescription", product.seoDescription || "", disabled, 5)}</div>
    <div class="admin-serp-preview"><small>Попередній перегляд</small><strong data-seo-preview-title>${escape(product.seoTitle || product.title)}</strong><span>sofievka.vercel.app/product?id=${escape(product.legacyId)}</span><p data-seo-preview-description>${escape(product.seoDescription || product.shortDescription || product.description || "Опис формується з картки товару.")}</p></div>
  </section>`;
}

function bindProductEditor(container, context) {
  const editor = container.querySelector("[data-product-editor]");
  const form = editor.querySelector("[data-editor-form]");
  const save = editor.querySelector("[data-save-product]");
  const reset = editor.querySelector("[data-reset-product]");
  const state = editor.querySelector("[data-save-state]");
  let dirty = false;
  const setDirty = value => { dirty = value; save.disabled = !value; reset.disabled = !value; state.textContent = value ? "Є незбережені зміни" : "Змін немає"; state.classList.toggle("is-dirty", value); };
  form.addEventListener("input", () => setDirty(true)); form.addEventListener("change", () => setDirty(true));
  const beforeUnload = event => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; };
  const interceptLinks = event => { if (!dirty) return; const link = event.target.closest("a[data-admin-link]"); if (link && !confirm("Вийти без збереження змін?")) { event.preventDefault(); event.stopImmediatePropagation(); } else if (link) dirty = false; };
  window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", interceptLinks, true);
  editor.addEventListener("admin:dispose", () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", interceptLinks, true); });

  const tabs = [...editor.querySelectorAll("[role=tab]")];
  const activateTab = (tabNode, focus = false) => {
    tabs.forEach(node => { node.setAttribute("aria-selected", String(node === tabNode)); node.tabIndex = node === tabNode ? 0 : -1; });
    editor.querySelectorAll("[data-editor-panel]").forEach(panel => { panel.hidden = panel.dataset.editorPanel !== tabNode.dataset.tab; panel.classList.toggle("is-active", !panel.hidden); });
    if (focus) tabNode.focus();
  };
  tabs.forEach((tabNode, index) => {
    tabNode.addEventListener("click", () => activateTab(tabNode));
    tabNode.addEventListener("keydown", event => {
      const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index - 1 + tabs.length) % tabs.length : null;
      if (targetIndex === null) return;
      event.preventDefault(); activateTab(tabs[targetIndex], true);
    });
  });

  if (context.canCore) {
    bindSeriesToBrand(form, context.references);
    bindCategoryAttributes(form, editor, context.references);
    bindAttributes(editor, context.references, setDirty);
  }
  if (context.canContent) bindAssets(editor, context, setDirty);
  const seoTitle = form.elements.seoTitle; const seoDescription = form.elements.seoDescription;
  seoTitle?.addEventListener("input", () => { editor.querySelector("[data-seo-preview-title]").textContent = seoTitle.value || form.elements.title?.value || context.detail.product.title; });
  seoDescription?.addEventListener("input", () => { editor.querySelector("[data-seo-preview-description]").textContent = seoDescription.value || "Опис формується з картки товару."; });
  reset.addEventListener("click", () => { dirty = false; context.navigate(location.pathname, { replace: true }); });

  save.addEventListener("click", async () => {
    try {
      if (!form.reportValidity()) return;
      const payload = collectEditorPayload(editor, context);
      save.disabled = true; save.textContent = "Зберігаємо…"; state.textContent = "Транзакція виконується";
      const result = await context.api.saveProduct(payload);
      dirty = false; setDirty(false); showToast(editor, `Збережено · ${result.catalogVersion}`);
      setTimeout(() => context.navigate(location.pathname, { replace: true }), 450);
    } catch (error) { save.disabled = false; save.textContent = "Зберегти зміни"; state.textContent = "Не збережено"; state.classList.add("is-error"); showToast(editor, error.message, true); }
  });

  const archiveDialog = editor.querySelector("[data-archive-dialog]");
  editor.querySelector("[data-archive-product]")?.addEventListener("click", () => archiveDialog.showModal());
  archiveDialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => archiveDialog.close());
  archiveDialog.querySelector("[data-archive-confirm]").addEventListener("click", async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = "Архівуємо…";
    try { await context.api.bulkProducts([context.detail.product.legacyId], "archive"); dirty = false; archiveDialog.close(); context.navigate(location.pathname, { replace: true }); }
    catch (error) { button.disabled = false; button.textContent = "Архівувати"; showToast(editor, error.message, true); }
  });
}

function bindSeriesToBrand(form, references) {
  const brand = form.elements.brandId;
  const series = form.elements.seriesId;
  const warning = form.closest("[data-product-editor]")?.querySelector("[data-series-brand-warning]");
  if (!brand || !series) return;
  brand.addEventListener("change", () => {
    const current = series.value;
    const currentDefinition = references.series.find(item => item.id === current);
    const matching = references.series.filter(item => item.brandId === brand.value);
    const mismatched = currentDefinition && currentDefinition.brandId !== brand.value;
    series.replaceChildren(
      new Option("Без серії", ""),
      ...(mismatched ? [new Option(`${currentDefinition.name} · не відповідає бренду`, currentDefinition.id)] : []),
      ...matching.map(item => new Option(item.name, item.id))
    );
    series.value = current;
    if (warning) warning.hidden = !mismatched;
  });
}

function categoryRules(references, categoryId) {
  return (references.categoryAttributes || []).filter(item => item.categoryId === categoryId).sort((a, b) => a.sortOrder - b.sortOrder);
}

function bindCategoryAttributes(form, editor, references) {
  const category = form.elements.categoryId;
  const picker = editor.querySelector("[data-new-attribute]");
  const warning = editor.querySelector("[data-category-attribute-warning]");
  if (!category || !picker || !warning) return;
  const sync = () => {
    const rules = categoryRules(references, category.value);
    const ruleMap = new Map(rules.map(item => [item.attributeId, item]));
    const allowed = new Set(ruleMap.keys());
    const current = picker.value;
    picker.replaceChildren(new Option("Оберіть характеристику", ""), ...rules.map(rule => {
      const definition = references.attributes.find(item => item.id === rule.attributeId);
      return new Option(`${definition?.label || rule.attributeId}${definition?.unit ? ` · ${definition.unit}` : ""}`, rule.attributeId);
    }));
    picker.value = allowed.has(current) ? current : "";
    let mismatch = false;
    editor.querySelectorAll("[data-attribute-row]").forEach(row => {
      const valid = allowed.has(row.dataset.id);
      const rule = ruleMap.get(row.dataset.id);
      const metadata = [rule?.displayGroup, rule?.facetEnabled ? "Фільтр каталогу" : ""].filter(Boolean).join(" · ");
      const indicator = row.querySelector("[data-attribute-meta]");
      indicator.textContent = metadata;
      indicator.hidden = !metadata;
      row.classList.toggle("is-category-mismatch", !valid);
      mismatch ||= !valid;
    });
    warning.hidden = !mismatch;
  };
  category.addEventListener("change", sync);
}

function bindAttributes(editor, references, setDirty) {
  const list = editor.querySelector("[data-attributes-list]"); const picker = editor.querySelector("[data-attribute-picker]"); const select = editor.querySelector("[data-new-attribute]");
  const bindRemove = row => row.querySelector("[data-remove-attribute]").addEventListener("click", () => { row.remove(); setDirty(true); });
  list.querySelectorAll("[data-attribute-row]").forEach(bindRemove);
  editor.querySelector("[data-add-attribute]")?.addEventListener("click", () => { picker.hidden = !picker.hidden; if (!picker.hidden) select.focus(); });
  editor.querySelector("[data-attribute-confirm]")?.addEventListener("click", () => {
    const definition = references.attributes.find(item => item.id === select.value); if (!definition) return;
    if (list.querySelector(`[data-id="${CSS.escape(definition.id)}"]`)) return showToast(editor, "Характеристику вже додано.", true);
    const categoryId = editor.querySelector('[name="categoryId"]')?.value;
    const rule = categoryRules(references, categoryId).find(item => item.attributeId === definition.id);
    list.querySelector("[data-no-attributes]")?.remove(); list.insertAdjacentHTML("beforeend", attributeRow({ ...definition, attributeId: definition.id, value: definition.valueType === "boolean" ? false : "" }, rule));
    bindRemove(list.lastElementChild); picker.hidden = true; select.value = ""; setDirty(true);
  });
}

function bindAssets(editor, context, setDirty) {
  const mediaList = editor.querySelector("[data-media-list]"); const documentList = editor.querySelector("[data-document-list]");
  const bindRow = row => {
    row.querySelector("[data-remove-asset]")?.addEventListener("click", () => { row.remove(); setDirty(true); });
    row.querySelector("[data-move-up]")?.addEventListener("click", () => { const previous = row.previousElementSibling; if (previous?.matches("[data-media-row],[data-document-row]")) row.parentNode.insertBefore(row, previous); setDirty(true); });
    row.querySelector("[data-move-down]")?.addEventListener("click", () => { const next = row.nextElementSibling; if (next?.matches("[data-media-row],[data-document-row]")) row.parentNode.insertBefore(next, row); setDirty(true); });
  };
  editor.querySelectorAll("[data-media-row],[data-document-row]").forEach(bindRow);
  editor.querySelector("[data-add-media]")?.addEventListener("click", () => { mediaList.querySelector("[data-no-media]")?.remove(); mediaList.insertAdjacentHTML("beforeend", mediaRow({ mediaType: "image", role: "gallery", url: "", altText: "", sortOrder: mediaList.children.length, active: true })); bindRow(mediaList.lastElementChild); setDirty(true); });
  editor.querySelector("[data-add-document]")?.addEventListener("click", () => { documentList.querySelector("[data-no-documents]")?.remove(); documentList.insertAdjacentHTML("beforeend", documentRow({ title: "", documentType: "other", url: "", sortOrder: documentList.children.length, active: true })); bindRow(documentList.lastElementChild); setDirty(true); });
  editor.querySelector("[data-upload-media]")?.addEventListener("change", event => upload(event, "media", mediaList, mediaRow));
  editor.querySelector("[data-upload-document]")?.addEventListener("change", event => upload(event, "document", documentList, documentRow));
  async function upload(event, kind, list, renderer) {
    const file = event.target.files?.[0]; if (!file) return;
    event.target.disabled = true; showToast(editor, `Завантажуємо ${file.name}…`);
    try {
      const uploaded = await context.api.uploadAsset(file, { productId: context.detail.product.internalId, kind });
      list.querySelector(".admin-muted")?.remove();
      const item = kind === "document"
        ? { title: file.name.replace(/\.pdf$/i, ""), documentType: "other", url: uploaded.url, storagePath: uploaded.storagePath, sourceUrl: "", sortOrder: list.children.length, active: true }
        : { mediaType: file.type.startsWith("video/") ? "video" : "image", role: list.querySelector("[data-media-role] option:checked[value=primary]") ? "gallery" : "primary", url: uploaded.url, storagePath: uploaded.storagePath, sourceUrl: "", altText: "", sortOrder: list.children.length, active: true };
      list.insertAdjacentHTML("beforeend", renderer(item)); bindRow(list.lastElementChild); setDirty(true); showToast(editor, "Файл завантажено. Збережіть товар, щоб зафіксувати його в каталозі.");
    } catch (error) { showToast(editor, error.message, true); }
    finally { event.target.disabled = false; event.target.value = ""; }
  }
}

function collectEditorPayload(editor, context) {
  const form = editor.querySelector("[data-editor-form]"); const product = context.detail.product;
  const payload = { legacyId: product.legacyId, expectedUpdatedAt: product.updatedAt };
  if (context.canCore) {
    payload.core = Object.fromEntries(["sku", "slug", "title", "shortTitle", "model", "brandId", "categoryId", "seriesId", "publicationStatus"].map(name => [name, form.elements[name].value.trim()]));
    const chosenSeries = context.references.series.find(item => item.id === payload.core.seriesId);
    if (chosenSeries && chosenSeries.brandId !== payload.core.brandId) throw new Error("Оберіть серію, що належить вибраному бренду, або «Без серії».");
    payload.commercial = { amount: nullable(form.elements.amount.value), oldAmount: nullable(form.elements.oldAmount.value), currency: form.elements.currency.value, priceStatus: form.elements.priceStatus.value, inventoryStatus: form.elements.inventoryStatus.value };
    if (payload.commercial.priceStatus === "known" && !(Number(payload.commercial.amount) > 0)) throw new Error("Для статусу «Ціна вказана» потрібна сума більша за нуль.");
    if (payload.commercial.oldAmount !== null && Number(payload.commercial.oldAmount) <= Number(payload.commercial.amount)) throw new Error("Стара ціна має бути більшою за поточну.");
    payload.attributes = [...editor.querySelectorAll("[data-attribute-row]")].map(row => {
      const raw = row.querySelector("[data-attribute-value]").value; let value = raw;
      if (row.dataset.type === "number") value = Number(raw); if (row.dataset.type === "boolean") value = raw === "true";
      if (raw === "" || (row.dataset.type === "number" && !Number.isFinite(value))) throw new Error("Заповніть усі характеристики або видаліть порожні рядки.");
      return { attributeId: row.dataset.id, value };
    });
  }
  if (context.canContent) {
    let descriptionSections; try { descriptionSections = JSON.parse(form.elements.descriptionSections.value || "[]"); } catch { throw new Error("Структуровані секції містять некоректний JSON."); }
    if (!Array.isArray(descriptionSections)) throw new Error("Структуровані секції мають бути JSON-масивом.");
    payload.content = { description: form.elements.description.value, shortDescription: form.elements.shortDescription.value, fullDescription: form.elements.fullDescription.value, descriptionSections, badges: form.elements.badges.value.split(",").map(value => value.trim()).filter(Boolean), seoTitle: form.elements.seoTitle.value, seoDescription: form.elements.seoDescription.value };
    payload.media = [...editor.querySelectorAll("[data-media-row]")].map((row, index) => ({ mediaType: row.querySelector("[data-media-type]").value, role: row.querySelector("[data-media-role]").value, url: row.querySelector("[data-asset-url]").value.trim(), storagePath: nullable(row.querySelector("[data-storage-path]").value), sourceUrl: nullable(row.querySelector("[data-source-url]").value), altText: nullable(row.querySelector("[data-asset-alt]").value), sortOrder: index, active: true }));
    if (payload.media.filter(item => item.role === "primary").length > 1) throw new Error("Оберіть лише одне primary-зображення.");
    payload.documents = [...editor.querySelectorAll("[data-document-row]")].map((row, index) => ({ title: row.querySelector("[data-document-title]").value.trim(), documentType: row.querySelector("[data-document-type]").value, url: row.querySelector("[data-document-url]").value.trim(), storagePath: nullable(row.querySelector("[data-storage-path]").value), sourceUrl: nullable(row.querySelector("[data-source-url]").value), sortOrder: index, active: true }));
  }
  return payload;
}

function tab(id, label, selected = false) { return `<button id="tab-${id}" type="button" role="tab" data-tab="${id}" aria-selected="${selected}" aria-controls="panel-${id}" tabindex="${selected ? 0 : -1}">${escape(label)}</button>`; }
function field(label, name, value, options = {}) { return `<label class="admin-field${options.full ? " admin-field--full" : ""}"><span>${escape(label)}</span><input name="${name}" type="${options.type || "text"}" value="${escape(value)}" ${options.required ? "required" : ""} ${options.disabled || ""} ${options.min ? `min="${options.min}"` : ""} ${options.step ? `step="${options.step}"` : ""} ${options.maxlength ? `maxlength="${options.maxlength}"` : ""}>${options.help ? `<small>${escape(options.help)}</small>` : ""}</label>`; }
function textareaField(label, name, value, disabled, rows, help = "") { return `<label class="admin-field admin-field--full"><span>${escape(label)}</span><textarea name="${name}" rows="${rows}" ${disabled}>${escape(value)}</textarea>${help ? `<small>${escape(help)}</small>` : ""}</label>`; }
function selectField(label, name, value, options, disabled) { return `<label class="admin-field"><span>${escape(label)}</span><select name="${name}" ${disabled}>${options.map(([optionValue, optionLabel]) => option(optionValue, optionLabel, value)).join("")}</select></label>`; }
function option(value, label, selected = "") { return `<option value="${escape(value)}" ${String(value) === String(selected ?? "") ? "selected" : ""}>${escape(label)}</option>`; }
function nullable(value) { const result = String(value ?? "").trim(); return result === "" ? null : result; }
function activeFilterCount(filters) { return [filters.query, filters.categoryId, filters.brandId, filters.publication, filters.inventory, filters.price].filter(Boolean).length; }
function formatPrice(product) { if (product.priceStatus === "known" && product.amount != null) return `<strong>${new Intl.NumberFormat("uk-UA", { style: "currency", currency: product.currency, maximumFractionDigits: 2 }).format(product.amount)}</strong>${product.oldAmount ? `<small><s>${formatNumber(product.oldAmount)}</s></small>` : ""}`; return `<span class="admin-muted">${PRICE[product.priceStatus]}</span>`; }
function formatNumber(value) { return new Intl.NumberFormat("uk-UA").format(Number(value)); }
function formatDateTime(value) { const date = new Date(value); return value && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "—"; }
function displayValue(value) { if (value == null) return "—"; if (typeof value === "string") return value; return JSON.stringify(value); }
function showToast(container, message, error = false) { const toast = container.querySelector(".admin-toast"); if (!toast) return; toast.textContent = message; toast.classList.toggle("is-error", error); toast.hidden = false; clearTimeout(toast._timer); toast._timer = setTimeout(() => { toast.hidden = true; }, 5000); }
function escape(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
