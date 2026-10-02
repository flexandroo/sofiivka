import { icon } from "/admin/admin-icons.mjs";

// Characteristics (attribute definitions) and catalogue filters. The code of a characteristic is
// set once at creation: product data, filter URLs and the storefront schema refer to it. The value
// type changes only while no product has a value. Which characteristics a category uses and shows
// as filters is edited on the category page (createCategoryFiltersPanel).

const VALUE_TYPES = Object.freeze({
  select: { label: "Список значень" },
  number: { label: "Число" },
  string: { label: "Текст" },
  boolean: { label: "Так / ні" }
});
const YES_NO = Object.freeze({ true: { label: "Так" }, false: { label: "Ні" } });
const FILTER_STATES = Object.freeze({
  filter: { label: "Фільтр" },
  "no-filter": { label: "Не фільтр" },
  unused: { label: "Не використовується" }
});
const FIELD_LABELS = Object.freeze({
  label: "Назва", unit: "Одиниця", value_type: "Тип значення", filterable: "Фільтр", sortable: "Сортування",
  sort_order: "Порядок", options: "Варіанти значень", created: "Створено", deleted: "Видалено"
});
// The storefront shows at most this many characteristic filters per listing.
const STOREFRONT_FILTER_LIMIT = 9;

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export async function createAttributesListView({ api, search = location.search, signal }) {
  const params = new URLSearchParams(search);
  const filters = { query: (params.get("q") || "").trim(), type: params.get("type") || "", state: params.get("state") || "" };
  const result = await api.attributes.list({ signal });
  const query = filters.query.toLocaleLowerCase("uk");
  const attributes = result.attributes.filter(attribute =>
    (!filters.type || attribute.valueType === filters.type)
    && (!filters.state
      || (filters.state === "filter" && attribute.filterable)
      || (filters.state === "no-filter" && !attribute.filterable)
      || (filters.state === "unused" && !attribute.categoryCount && !attribute.productCount))
    && (!query || [attribute.label, attribute.id, attribute.unit].some(value => String(value || "").toLocaleLowerCase("uk").includes(query))));
  const rows = attributes.map(attribute => `
    <tr>
      <td><a class="admin-crm-id" href="/admin/attributes/${encodeURIComponent(attribute.id)}" data-admin-link>${escape(attribute.label)}</a><small>${escape(attribute.id)}</small></td>
      <td>${escape(VALUE_TYPES[attribute.valueType]?.label || attribute.valueType)}${attribute.unit ? `<small>${escape(attribute.unit)}</small>` : ""}</td>
      <td class="admin-crm-num">${number(attribute.categoryCount)}<small>${attribute.facetCount ? `фільтр у ${number(attribute.facetCount)}` : "без фільтра"}</small></td>
      <td class="admin-crm-num">${number(attribute.productCount)}</td>
      <td>${attribute.filterable ? `<span class="admin-status admin-status--success">Фільтр</span>` : `<span class="admin-status">Не фільтр</span>`}</td>
      <td class="admin-crm-num">${formatOrder(attribute.sortOrder)}</td>
    </tr>`).join("");
  const html = `
    <section class="admin-crm-page">
      ${pageHead("ДАНІ", "Характеристики", `${number(attributes.length)} з ${number(result.attributes.length)} характеристик. Які з них показувати фільтрами, налаштовується на сторінці категорії.${result.canEdit ? "" : " Ваша роль може лише переглядати."}`,
        result.canEdit ? `<button class="admin-button admin-button--primary" type="button" data-create-open>Нова характеристика${icon("arrow")}</button>` : "")}
      ${filterBar(filters)}
      ${attributes.length ? `<div class="admin-products-table-wrap"><table class="admin-crm-table admin-crm-table--attributes"><thead><tr>${["Характеристика", "Тип", "Категорій", "Товарів", "Каталог", "Порядок"].map(text => `<th scope="col">${text}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`
        : emptyState("Характеристик не знайдено", "Змініть пошук або фільтр.")}
      ${result.canEdit ? createDialog() : ""}
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => {
      bindList(container);
      bindCreate(container, api);
    }
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
export async function createAttributeDetailView({ api, attributeId, signal }) {
  const detail = await api.attributes.get(attributeId, { signal });
  if (!detail?.attribute) return notFound();
  const { attribute, canEdit } = detail;
  const typeLocked = attribute.productCount > 0;
  const blocker = attribute.productCount
    ? `Характеристику заповнено в товарах: ${number(attribute.productCount)}.`
    : attribute.categoryCount ? `Характеристика прив’язана до категорій: ${number(attribute.categoryCount)}. Спершу приберіть її з цих категорій.`
    : detail.sourceMappingCount ? `На неї зіставлено характеристики постачальників: ${number(detail.sourceMappingCount)}.` : "";
  const html = `
    <section class="admin-crm-detail" data-attribute-detail>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/attributes" data-admin-link class="admin-back-link">← Усі характеристики</a>
          <p class="admin-kicker">ХАРАКТЕРИСТИКА · ${escape(attribute.id)}</p>
          <h1>${escape(attribute.label)}</h1>
          <div class="admin-editor-meta">
            <span class="admin-status">${escape(VALUE_TYPES[attribute.valueType]?.label || attribute.valueType)}</span>
            ${attribute.filterable ? `<span class="admin-status admin-status--success">Фільтр</span>` : `<span class="admin-status">Не фільтр</span>`}
            <span>Оновлено ${formatDateTime(attribute.updatedAt)}</span>
          </div>
        </div>
      </header>
      <div class="admin-crm-layout">
        <form class="admin-crm-main" data-attribute-form>
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">ВИЗНАЧЕННЯ</p><h2>Назва й тип</h2></div></header>
            <div class="admin-form-grid">
              ${textField("label", "Назва", attribute.label, 120, { required: true, hint: "Так характеристику бачать покупці у фільтрах і на сторінці товару." })}
              ${readonlyField("Код", attribute.id, "Код не змінюється: на нього посилаються товари й адреси з фільтрами.")}
              ${selectField("valueType", "Тип значення", VALUE_TYPES, attribute.valueType, { disabled: typeLocked,
                hint: typeLocked ? `Тип не змінити: характеристику заповнено в ${number(attribute.productCount)} товарах.` : "Тип можна змінити, поки жоден товар не має значення." })}
              ${textField("unit", "Одиниця виміру", attribute.unit, 20, { placeholder: "кВт, л, мм…", hint: "Для чисел: показується після значення." })}
            </div>
          </section>
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">КАТАЛОГ</p><h2>Фільтр і порядок</h2></div></header>
            <div class="admin-form-grid admin-form-grid--commercial">
              ${selectField("filterable", "Може бути фільтром", YES_NO, String(attribute.filterable))}
              ${selectField("sortable", "Сортування за нею", YES_NO, String(attribute.sortable))}
              ${textField("sortOrder", "Порядок", formatOrder(attribute.sortOrder), 9, { type: "number", step: "0.01", hint: "Менше число стоїть вище серед фільтрів." })}
            </div>
            <p class="admin-panel-note">«Ні» у полі «Може бути фільтром» прибирає характеристику з фільтрів усіх категорій. Увімкнути фільтр у конкретній категорії можна на сторінці категорії.</p>
          </section>
          ${attribute.valueType === "select" ? optionsPanel(detail.options, canEdit) : ""}
          ${canEdit ? `<footer class="admin-panel admin-crm-form-actions"><button class="admin-button admin-button--primary" type="submit">Зберегти</button></footer>`
            : `<p class="admin-panel-note">Редагувати характеристики можуть власник, адміністратор і контент-менеджер.</p>`}
        </form>
        <aside class="admin-crm-side">
          <section class="admin-panel admin-crm-contact">
            <header class="admin-panel__head"><div><p class="admin-kicker">ВИКОРИСТАННЯ</p><h2>${number(attribute.productCount)} товарів</h2></div></header>
            <dl>
              <div><dt>Категорій</dt><dd>${number(attribute.categoryCount)}</dd></div>
              <div><dt>Фільтр у</dt><dd>${number(attribute.facetCount)} кат.</dd></div>
              ${detail.sourceMappingCount ? `<div><dt>Постачальники</dt><dd>${number(detail.sourceMappingCount)} зіставлень</dd></div>` : ""}
            </dl>
          </section>
          ${categoriesPanel(detail.categories)}
          ${listPanel("ЗНАЧЕННЯ", "Найчастіші в товарах", detail.topValues, item => escape(item.value))}
          ${historyPanel(detail.history)}
          ${canEdit ? deletePanel(attribute.label, blocker) : ""}
        </aside>
      </div>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => bindEditor(container, { attribute, canEdit, api })
  };
}

function optionsPanel(options, canEdit) {
  const active = options.filter(option => option.active);
  const inactive = options.filter(option => !option.active);
  return `
    <section class="admin-panel" data-options-panel>
      <header class="admin-panel__head"><div><p class="admin-kicker">ВАРІАНТИ</p><h2>Варіанти значень</h2></div></header>
      <p class="admin-panel-note">Значення зберігається в товарах і адресах фільтрів, підпис бачать покупці. Прибраний варіант вимикається, а значення в товарах лишаються.</p>
      <ol class="admin-attribute-options" data-options-list>${active.map(option => optionRow(option, canEdit)).join("")}</ol>
      ${canEdit ? `<div class="admin-taxonomy-home__add"><button class="admin-button admin-button--secondary" type="button" data-option-add>Додати варіант</button></div>` : ""}
      ${inactive.length ? `<p class="admin-panel-note">Вимкнені: ${inactive.map(option => escape(option.label)).join(", ")}. Додайте варіант із тим самим значенням, щоб повернути його.</p>` : ""}
    </section>`;
}

function optionRow(option = { value: "", label: "", productCount: 0 }, canEdit = true) {
  return `<li class="admin-attribute-option" data-option-row>
    <label class="admin-field"><span>Значення</span><input data-option-value value="${escape(option.value)}" maxlength="120" required ${option.value ? "readonly" : ""}></label>
    <label class="admin-field"><span>Підпис</span><input data-option-label value="${escape(option.label)}" maxlength="120" placeholder="як значення"></label>
    <small class="admin-crm-num">${option.productCount ? `${number(option.productCount)} тов.` : ""}</small>
    ${canEdit ? `<button class="admin-icon-button" type="button" aria-label="Прибрати варіант" data-option-remove>×</button>` : ""}
  </li>`;
}

function categoriesPanel(categories) {
  return `
    <section class="admin-panel">
      <header class="admin-panel__head"><div><p class="admin-kicker">КАТЕГОРІЇ</p><h2>Де використовується</h2></div></header>
      <div class="admin-crm-items">${categories.length ? categories.map(item => `
        <div class="admin-crm-item admin-taxonomy-count">
          <div><strong><a href="/admin/categories/${encodeURIComponent(item.id)}?filters=1" data-admin-link>${escape(item.title)}</a></strong><small>${escape(item.path || "")}</small></div>
          ${item.facetEnabled ? `<span class="admin-status admin-status--success">Фільтр</span>` : `<span class="admin-status">Без фільтра</span>`}
          <span class="admin-crm-num">${number(item.productCount)}</span>
        </div>`).join("") : `<p class="admin-panel-note">Не прив’язана до жодної категорії. Додайте її у «Фільтри категорії» на сторінці категорії.</p>`}
      </div>
    </section>`;
}

function bindEditor(container, { attribute, canEdit, api }) {
  const form = container.querySelector("[data-attribute-form]");
  if (!form) return;
  bindDelete(container, () => api.attributes.remove(attribute.id, attribute.updatedAt));
  if (!canEdit) {
    form.querySelectorAll("input, select, textarea, button").forEach(control => { control.disabled = true; });
    return;
  }
  const list = form.querySelector("[data-options-list]");
  const fields = ["label", "valueType", "unit", "filterable", "sortable", "sortOrder"];
  const read = () => {
    const data = new FormData(form);
    const values = Object.fromEntries(fields.filter(name => data.has(name)).map(name => [name, String(data.get(name) ?? "")]));
    if (list) {
      values.options = JSON.stringify([...list.querySelectorAll("[data-option-row]")].map(row => ({
        value: row.querySelector("[data-option-value]").value.trim(),
        label: row.querySelector("[data-option-label]").value.trim()
      })));
    }
    return values;
  };
  const initial = read();
  const saveButton = form.querySelector('[type="submit"]');
  const markDirty = () => { saveButton.disabled = JSON.stringify(read()) === JSON.stringify(initial); };
  form.addEventListener("input", markDirty);
  form.addEventListener("change", markDirty);

  form.querySelector("[data-option-add]")?.addEventListener("click", () => {
    list.insertAdjacentHTML("beforeend", optionRow());
    list.lastElementChild.querySelector("input")?.focus();
    markDirty();
  });
  list?.addEventListener("click", event => {
    const remove = event.target.closest("[data-option-remove]");
    if (!remove) return;
    remove.closest("[data-option-row]").remove();
    markDirty();
  });
  markDirty();

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const current = read();
    const changed = Object.fromEntries(Object.entries(current).filter(([key, value]) => value !== initial[key]));
    if (!Object.keys(changed).length) return;
    const patch = { ...changed };
    for (const key of ["filterable", "sortable"]) if (key in patch) patch[key] = patch[key] === "true";
    if ("options" in patch) patch.options = JSON.parse(patch.options);
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      await api.attributes.update(attribute.id, patch, attribute.updatedAt);
      showToast(container, "Збережено. Сайт покаже зміни після оновлення сторінки.");
      setTimeout(() => goTo(location.pathname, { replace: true }), 900);
    } catch (error) {
      showToast(container, error.message, true);
      saveButton.disabled = false;
      saveButton.textContent = "Зберегти";
    }
  });
}

// ---------------------------------------------------------------------------
// Category filters (panel on /admin/categories/:id)
// ---------------------------------------------------------------------------
export async function createCategoryFiltersPanel({ api, categoryId, signal }) {
  const config = await api.attributes.getCategoryFilters(categoryId, { signal });
  if (!config?.category) return { html: "", bind() {} };
  const canEdit = config.canEdit;
  const html = `
    <section class="admin-panel admin-attribute-filters" id="category-filters" data-category-filters>
      <header class="admin-panel__head"><div><p class="admin-kicker">ФІЛЬТРИ КАТАЛОГУ</p><h2>Фільтри категорії</h2></div>
        ${canEdit ? `<button class="admin-button admin-button--primary" type="button" data-filters-save disabled>Зберегти фільтри</button>` : ""}</header>
      <p class="admin-panel-note">Характеристики товарів цієї категорії в порядку показу. Позначка «Фільтр» додає характеристику в панель фільтрів каталогу. На сайті видно до ${STOREFRONT_FILTER_LIMIT} фільтрів, і лише ті, де товари мають щонайменше два різні значення.</p>
      <ol class="admin-taxonomy-home__list" data-filters-list></ol>
      ${canEdit ? `<div class="admin-taxonomy-home__add">
        <label class="admin-field"><span>Додати характеристику</span><select data-filters-select></select></label>
        <button class="admin-button admin-button--secondary" type="button" data-filters-add>Додати</button>
      </div>` : ""}
    </section>`;
  return { html, bind: container => bindCategoryFilters(container, api, config) };
}

function bindCategoryFilters(container, api, config) {
  const panel = container.querySelector("[data-category-filters]");
  if (!panel) return;
  if (new URLSearchParams(location.search).has("filters")) panel.scrollIntoView({ block: "start" });
  const known = new Map([...config.items, ...config.available].map(item => [item.id, item]));
  const initial = config.items.map(item => ({ id: item.id, facetEnabled: item.facetEnabled, required: item.required }));
  let items = initial.map(item => ({ ...item }));
  const list = panel.querySelector("[data-filters-list]");
  const select = panel.querySelector("[data-filters-select]");
  const addButton = panel.querySelector("[data-filters-add]");
  const saveButton = panel.querySelector("[data-filters-save]");
  const canEdit = Boolean(saveButton);

  const render = () => {
    const enabled = items.filter(item => item.facetEnabled).length;
    list.replaceChildren(...(items.length ? items.map((item, index) => {
      const attribute = known.get(item.id);
      const meta = [attribute.id, VALUE_TYPES[attribute.valueType]?.label || attribute.valueType, attribute.unit,
        attribute.productCount ? `${number(attribute.productCount)} тов.` : ""].filter(Boolean).join(" · ");
      return element("li", { className: "admin-taxonomy-home__item admin-attribute-filter" },
        element("span", { className: "admin-taxonomy-home__position" }, String(index + 1)),
        element("div", {},
          element("strong", {}, element("a", { href: `/admin/attributes/${encodeURIComponent(attribute.id)}`, "data-admin-link": true }, attribute.label)),
          element("small", {}, meta, !attribute.filterable ? " · " : "",
            !attribute.filterable ? element("span", { className: "admin-taxonomy-home__warning" }, "фільтр вимкнено в характеристиці") : null)),
        element("div", { className: "admin-attribute-filter__flags" },
          checkbox("Фільтр", item.facetEnabled, { "data-flag": "facetEnabled", "data-id": item.id }, !canEdit || (!attribute.filterable && !item.facetEnabled)),
          checkbox("Обов’язкова", item.required, { "data-flag": "required", "data-id": item.id }, !canEdit)),
        canEdit ? element("div", { className: "admin-taxonomy-home__actions" },
          iconButton("Вище", "↑", { "data-move": "-1", "data-id": item.id }, index === 0),
          iconButton("Нижче", "↓", { "data-move": "1", "data-id": item.id }, index === items.length - 1),
          iconButton("Прибрати з категорії", "×", { "data-remove": item.id }, false)) : null);
    }) : [element("li", { className: "admin-muted" }, "У категорії ще немає характеристик.")]));
    if (enabled > STOREFRONT_FILTER_LIMIT) {
      list.append(element("li", { className: "admin-muted" }, `Увімкнено ${enabled} фільтрів: на сайті покажуться перші ${STOREFRONT_FILTER_LIMIT} за порядком характеристик.`));
    }
    if (select) {
      const options = [...known.values()].filter(attribute => !items.some(item => item.id === attribute.id))
        .sort((a, b) => a.label.localeCompare(b.label, "uk"));
      select.replaceChildren(element("option", { value: "" }, "Оберіть характеристику"),
        ...options.map(attribute => element("option", { value: attribute.id }, `${attribute.label} (${attribute.id})`)));
      addButton.disabled = !options.length;
    }
    if (saveButton) saveButton.disabled = JSON.stringify(items) === JSON.stringify(initial);
  };

  list.addEventListener("click", event => {
    const move = event.target.closest("[data-move]");
    const removeButton = event.target.closest("[data-remove]");
    if (move) {
      const index = items.findIndex(item => item.id === move.dataset.id);
      const next = index + Number(move.dataset.move);
      [items[index], items[next]] = [items[next], items[index]];
    } else if (removeButton) {
      items = items.filter(item => item.id !== removeButton.dataset.remove);
    } else return;
    render();
  });
  list.addEventListener("change", event => {
    const flag = event.target.closest("[data-flag]");
    if (!flag) return;
    const item = items.find(entry => entry.id === flag.dataset.id);
    item[flag.dataset.flag] = flag.checked;
    render();
  });
  addButton?.addEventListener("click", () => {
    const attribute = known.get(select.value);
    if (!attribute) return;
    items.push({ id: attribute.id, facetEnabled: Boolean(attribute.filterable), required: false });
    render();
  });
  saveButton?.addEventListener("click", async () => {
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      await api.attributes.setCategoryFilters(config.category.id, items, config.version);
      showToast(container, "Фільтри збережено. Каталог покаже їх після оновлення сторінки.");
      setTimeout(() => goTo(location.pathname + location.search, { replace: true }), 900);
    } catch (failure) {
      showToast(container, failure.message, true);
      saveButton.textContent = "Зберегти фільтри";
      render();
    }
  });
  render();
}

// ---------------------------------------------------------------------------
// Create and delete
// ---------------------------------------------------------------------------
function createDialog() {
  return `<dialog class="admin-dialog admin-create-dialog" data-create-dialog aria-labelledby="create-attribute-title"><form data-create-form novalidate>
    <header><p class="admin-kicker">НОВИЙ ЗАПИС</p><h2 id="create-attribute-title">Нова характеристика</h2><p>Код потім змінити не можна: на нього посилатимуться товари й фільтри.</p></header>
    <div class="admin-form-grid">
      ${textField("label", "Назва", "", 120, { full: true, required: true })}
      ${textField("id", "Код", "", 60, { placeholder: "заповниться з назви", hint: "Латиниця й цифри, з малої літери: heatOutputKw." })}
      ${selectField("valueType", "Тип значення", VALUE_TYPES, "select")}
      ${textField("unit", "Одиниця виміру", "", 20, { placeholder: "кВт, л, мм…" })}
      ${selectField("filterable", "Може бути фільтром", YES_NO, "true")}
    </div>
    <p class="admin-feedback admin-feedback--error" data-dialog-error role="alert" hidden></p>
    <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--primary" type="submit">Створити</button></div>
  </form></dialog>`;
}

function bindCreate(container, api) {
  const dialog = container.querySelector("[data-create-dialog]");
  if (!dialog) return;
  const form = dialog.querySelector("[data-create-form]");
  const error = dialog.querySelector("[data-dialog-error]");
  const submit = form.querySelector('[type="submit"]');
  container.querySelectorAll("[data-create-open]").forEach(button => button.addEventListener("click", () => {
    error.hidden = true;
    dialog.showModal();
    form.querySelector("input")?.focus();
  }));
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const payload = Object.fromEntries(["label", "id", "valueType", "unit"].map(name => [name, String(data.get(name) ?? "").trim()]).filter(([, value]) => value));
    payload.filterable = data.get("filterable") === "true";
    submit.disabled = true;
    submit.textContent = "Створюємо…";
    try {
      const created = await api.attributes.create(payload);
      dialog.close();
      goTo(`/admin/attributes/${encodeURIComponent(created.attribute.id)}`);
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = "Створити";
    }
  });
}

function deletePanel(name, blocker) {
  return `
    <section class="admin-panel admin-taxonomy-danger">
      <header class="admin-panel__head"><div><p class="admin-kicker">ВИДАЛЕННЯ</p><h2>Видалити характеристику</h2></div></header>
      <p class="admin-panel-note">${blocker ? escape(blocker) : "Характеристика зникне з адмінки й каталогу. Історія змін залишиться."}</p>
      <button class="admin-button admin-button--danger" type="button" data-delete-open ${blocker ? "disabled" : ""}>Видалити</button>
      <dialog class="admin-dialog" data-delete-dialog><h2>Видалити характеристику «${escape(name)}»?</h2><p>Це не можна скасувати.</p>
        <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--danger" type="button" data-delete-confirm>Видалити</button></div></dialog>
    </section>`;
}

function bindDelete(container, remove) {
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
      goTo("/admin/attributes", { replace: true });
    } catch (failure) {
      dialog.close();
      showToast(container, failure.message, true);
      confirmButton.disabled = false;
      confirmButton.textContent = "Видалити";
    }
  });
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function listPanel(kicker, title, items, render) {
  if (!items?.length) return "";
  return `
    <section class="admin-panel">
      <header class="admin-panel__head"><div><p class="admin-kicker">${kicker}</p><h2>${title}</h2></div></header>
      <div class="admin-crm-items">${items.map(item => `
        <div class="admin-crm-item admin-taxonomy-count"><div><strong>${render(item)}</strong></div><span></span><span class="admin-crm-num">${number(item.productCount)}</span></div>`).join("")}
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

function filterBar(filters) {
  const selectHtml = (name, label, all, options) => `
    <label><span>${label}</span><select name="${name}">
      <option value="">${all}</option>
      ${Object.entries(options).map(([value, item]) => `<option value="${value}" ${filters[name] === value ? "selected" : ""}>${escape(item.label)}</option>`).join("")}
    </select></label>`;
  return `
    <form class="admin-crm-filters admin-crm-filters--attributes" data-crm-filters>
      <label class="admin-filter-search"><span class="admin-sr-only">Пошук</span>${icon("search")}<input type="search" name="q" value="${escape(filters.query)}" placeholder="Назва, код або одиниця" autocomplete="off"></label>
      ${selectHtml("type", "Тип", "Будь-який", VALUE_TYPES)}
      ${selectHtml("state", "Каталог", "Усі", FILTER_STATES)}
      <div class="admin-filter-actions"><button class="admin-button admin-button--secondary" type="submit">Застосувати</button><a href="${location.pathname}" data-admin-link>Скинути</a></div>
    </form>`;
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

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "className") node.className = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.filter(child => child !== null && child !== undefined && child !== ""));
  return node;
}

function iconButton(label, text, data, disabled) {
  return element("button", { className: "admin-icon-button", type: "button", "aria-label": label, disabled, ...data }, text);
}

function checkbox(label, checked, data, disabled) {
  const input = element("input", { type: "checkbox", disabled, ...data });
  input.checked = Boolean(checked);
  return element("label", { className: "admin-attribute-filter__flag" }, input, element("span", {}, label));
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

function emptyState(title, message) {
  return `<section class="admin-state-panel admin-crm-empty">${icon("check")}<div><h2>${escape(title)}</h2><p>${escape(message)}</p></div></section>`;
}

function notFound() {
  return {
    html: `<section class="admin-state-panel" role="alert">${icon("warning")}<div><p class="admin-kicker">404</p><h1>Характеристику не знайдено</h1><p>Можливо, посилання застаріло.</p></div><a class="admin-button admin-button--secondary" href="/admin/attributes" data-admin-link>До характеристик</a></section>`,
    bind() {}
  };
}

function selectField(name, label, options, value, { disabled = false, hint = "" } = {}) {
  return `<label class="admin-field"><span>${label}</span><select name="${name}" ${disabled ? "disabled" : ""}>${Object.entries(options).map(([key, item]) =>
    `<option value="${key}" ${key === value ? "selected" : ""}>${escape(item.label)}</option>`).join("")}</select>${hint ? `<small>${escape(hint)}</small>` : ""}</label>`;
}

function textField(name, label, value, maxLength, { full = false, type = "text", step = "1", placeholder = "", hint = "", required = false } = {}) {
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${label}</span>
    <input name="${name}" type="${type}" value="${escape(value ?? "")}" ${type === "number" ? `min="0" step="${step}"` : `maxlength="${maxLength}"`} ${placeholder ? `placeholder="${escape(placeholder)}"` : ""} ${required ? "required" : ""}>
    ${hint ? `<small>${escape(hint)}</small>` : ""}</label>`;
}

function readonlyField(label, value, hint = "") {
  return `<div class="admin-field"><span>${label}</span><output class="admin-taxonomy-readonly">${escape(value)}</output>${hint ? `<small>${escape(hint)}</small>` : ""}</div>`;
}

function formatOrder(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.round(numeric * 100) / 100) : "";
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
