import { icon } from "/admin/admin-icons.mjs";

// Product collections («Підбірки»). Two of them feed the homepage blocks «Хіти продажів» and
// «Акційні пропозиції»; the storefront reads them through get_catalog_collection, in this order.
// Membership and the card fields are saved separately, each with the collection's updatedAt.

const HOMEPAGE_BLOCKS = Object.freeze({
  popular: { label: "Головна · «Хіти продажів»" },
  sale: { label: "Головна · «Акційні пропозиції»" }
});
const COLLECTION_TYPES = Object.freeze({
  manual: { label: "Ручна" },
  featured: { label: "Рекомендовані" },
  promotion: { label: "Акція" }
});
const STATE = Object.freeze({
  live: { label: "На сайті", tone: "success" },
  scheduled: { label: "Заплановано", tone: "info" },
  ended: { label: "Показ завершено", tone: "warning" },
  off: { label: "Вимкнено", tone: "" }
});
const YES_NO = Object.freeze({ true: { label: "Так" }, false: { label: "Ні" } });
const FIELD_LABELS = Object.freeze({
  title: "Назва", description: "Опис", collection_type: "Тип", active: "Показ на сайті",
  date_from: "Показувати з", date_to: "Показувати до", sort_order: "Порядок",
  products: "Склад і порядок товарів", created: "Створено", deleted: "Видалено"
});
const ITEM_LIMIT = 100;

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export async function createCollectionsListView({ api, search = location.search, signal }) {
  const params = new URLSearchParams(search);
  const filters = { query: (params.get("q") || "").trim(), state: params.get("state") || "" };
  const result = await api.collections.list({ signal });
  const query = filters.query.toLocaleLowerCase("uk");
  const collections = result.collections.filter(collection =>
    (!filters.state || collectionState(collection) === filters.state)
    && (!query || [collection.title, collection.id].some(value => String(value || "").toLocaleLowerCase("uk").includes(query))));
  const rows = collections.map(collection => `
    <tr>
      <td><a class="admin-crm-id" href="/admin/collections/${encodeURIComponent(collection.id)}" data-admin-link>${escape(collection.title)}</a>
        <small>${escape(collection.id)}${collection.homepageBlock ? ` · ${escape(HOMEPAGE_BLOCKS[collection.homepageBlock].label)}` : ""}</small></td>
      <td class="admin-crm-num">${number(collection.publishedCount)}<small>з ${number(collection.itemCount)}</small></td>
      <td>${statusBadge(STATE, collectionState(collection))}</td>
      <td>${period(collection)}</td>
      <td>${escape(COLLECTION_TYPES[collection.type]?.label || collection.type)}</td>
    </tr>`).join("");
  const html = `
    <section class="admin-crm-page">
      <header class="admin-page-head"><div><p class="admin-kicker">КАТАЛОГ</p><h1>Підбірки</h1>
        <p>${escape(`${number(collections.length)} з ${number(result.collections.length)} підбірок. Блоки головної сторінки стоять першими.${result.canEdit ? "" : " Ваша роль може лише переглядати."}`)}</p></div>
        ${result.canEdit ? `<button class="admin-button admin-button--primary" type="button" data-create-open>Нова підбірка${icon("arrow")}</button>` : ""}</header>
      <form class="admin-crm-filters" data-crm-filters>
        <label class="admin-filter-search"><span class="admin-sr-only">Пошук</span>${icon("search")}<input type="search" name="q" value="${escape(filters.query)}" placeholder="Назва або код підбірки" autocomplete="off"></label>
        <label><span>Показ</span><select name="state"><option value="">Будь-який</option>
          ${Object.entries(STATE).map(([value, item]) => `<option value="${value}" ${filters.state === value ? "selected" : ""}>${escape(item.label)}</option>`).join("")}
        </select></label>
        <div class="admin-filter-actions"><button class="admin-button admin-button--secondary" type="submit">Застосувати</button><a href="${location.pathname}" data-admin-link>Скинути</a></div>
      </form>
      ${collections.length
        ? `<div class="admin-products-table-wrap"><table class="admin-crm-table admin-crm-table--collections"><thead><tr>${["Підбірка", "Товарів на сайті", "Показ", "Період", "Тип"].map(text => `<th scope="col">${text}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`
        : `<section class="admin-state-panel admin-crm-empty">${icon("check")}<div><h2>Підбірок не знайдено</h2><p>Змініть пошук або фільтр.</p></div></section>`}
      ${result.canEdit ? createDialog() : ""}
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => { bindFilters(container); bindCreate(container, api); } };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
export async function createCollectionDetailView({ api, collectionId, signal }) {
  const detail = await api.collections.get(collectionId, { signal });
  if (!detail?.collection) {
    return {
      html: `<section class="admin-state-panel" role="alert">${icon("warning")}<div><p class="admin-kicker">404</p><h1>Підбірку не знайдено</h1><p>Можливо, посилання застаріло.</p></div><a class="admin-button admin-button--secondary" href="/admin/collections" data-admin-link>До підбірок</a></section>`,
      bind() {}
    };
  }
  const { collection, canEdit } = detail;
  const block = collection.homepageBlock;
  const html = `
    <section class="admin-crm-detail" data-collection-detail>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/collections" data-admin-link class="admin-back-link">← Усі підбірки</a>
          <p class="admin-kicker">ПІДБІРКА · ${escape(collection.id)}</p>
          <h1 data-collection-title>${escape(collection.title)}</h1>
          <div class="admin-editor-meta"><span data-collection-state>${statusBadge(STATE, collectionState(collection))}</span>${block ? `<span>${escape(HOMEPAGE_BLOCKS[block].label)}</span>` : ""}<span data-collection-updated>Оновлено ${formatDateTime(collection.updatedAt)}</span></div>
        </div>
      </header>
      <div class="admin-crm-layout">
        <div class="admin-crm-main">
          <section class="admin-panel admin-collection-items" data-items-panel>
            <header class="admin-panel__head"><div><p class="admin-kicker">ТОВАРИ</p><h2>Склад і порядок</h2></div>
              ${canEdit ? `<div class="admin-collection-items__save"><button class="admin-button admin-button--ghost" type="button" data-items-reset hidden>Скасувати</button><button class="admin-button admin-button--primary" type="button" data-items-save disabled>Зберегти склад</button></div>` : ""}</header>
            <p class="admin-panel-note">${escape(itemsNote(block))}</p>
            <p class="admin-collection-items__summary" data-items-summary></p>
            <ol class="admin-collection-items__list" data-items-list></ol>
            ${canEdit ? `<div class="admin-collection-search">
              <label class="admin-field"><span>Додати товар</span>
                <input type="search" data-product-search placeholder="Назва, артикул, модель або бренд" autocomplete="off" maxlength="120"></label>
              <p class="admin-muted" data-search-status hidden></p>
              <ul class="admin-collection-search__results" data-search-results></ul>
            </div>` : ""}
          </section>
          <form class="admin-crm-main" data-collection-form>
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ПОКАЗ</p><h2>Назва й період</h2></div></header>
              <div class="admin-form-grid">
                ${textField("title", "Назва", collection.title, 160, { required: true, hint: block ? "Для адмінки й пошуку. Заголовок блоку на головній сталий." : "" })}
                ${selectField("type", "Тип", COLLECTION_TYPES, collection.type)}
                ${selectField("active", "Показувати на сайті", YES_NO, String(collection.active))}
                ${textField("sortOrder", "Порядок серед підбірок", collection.sortOrder, 6, { type: "number", min: 0 })}
                ${textField("dateFrom", "Показувати з", toLocalInput(collection.dateFrom), 0, { type: "datetime-local", hint: "Порожнє поле: одразу." })}
                ${textField("dateTo", "Показувати до", toLocalInput(collection.dateTo), 0, { type: "datetime-local", hint: "Порожнє поле: без кінцевої дати." })}
                <label class="admin-field admin-field--full"><span>Опис</span><textarea name="description" maxlength="2000">${escape(collection.description)}</textarea></label>
              </div>
              ${block ? `<p class="admin-panel-note">Поза періодом показу або з вимкненим показом блок на головній буде порожнім.</p>` : ""}
            </section>
            ${canEdit ? `<footer class="admin-panel admin-crm-form-actions"><button class="admin-button admin-button--primary" type="submit">Зберегти</button></footer>`
              : `<p class="admin-panel-note">Редагувати підбірки можуть власник, адміністратор і контент-менеджер.</p>`}
          </form>
        </div>
        <aside class="admin-crm-side">
          <section class="admin-panel admin-crm-contact">
            <header class="admin-panel__head"><div><p class="admin-kicker">НА САЙТІ</p><h2 data-summary-visible></h2></div></header>
            <dl>
              <div><dt>Товарів у підбірці</dt><dd data-summary-total></dd></div>
              <div><dt>Опубліковано</dt><dd data-summary-published></dd></div>
            </dl>
          </section>
          ${historyPanel(detail.history)}
          ${canEdit ? deletePanel(collection, block) : ""}
        </aside>
      </div>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => bindDetail(container, api, detail) };
}

function bindDetail(container, api, detail) {
  const state = { collection: { ...detail.collection }, saved: detail.items, items: [...detail.items] };
  const { canEdit } = detail;
  const block = state.collection.homepageBlock;
  const list = container.querySelector("[data-items-list]");
  const saveButton = container.querySelector("[data-items-save]");
  const resetButton = container.querySelector("[data-items-reset]");
  const summary = container.querySelector("[data-items-summary]");
  const ids = items => items.map(item => item.legacyId);
  const dirty = () => JSON.stringify(ids(state.items)) !== JSON.stringify(ids(state.saved));

  const render = () => {
    list.replaceChildren(...(state.items.length ? state.items.map((item, index) => {
      const warnings = itemWarnings(item, block);
      return element("li", { className: `admin-collection-item${warnings.length ? " has-warning" : ""}` },
        element("span", { className: "admin-collection-item__position" }, String(index + 1)),
        productThumb(item),
        productInfo(item, warnings),
        canEdit ? element("div", { className: "admin-collection-item__actions" },
          iconButton("Вище", "↑", { "data-move": "-1", "data-id": item.legacyId }, index === 0),
          iconButton("Нижче", "↓", { "data-move": "1", "data-id": item.legacyId }, index === state.items.length - 1),
          iconButton("Прибрати з підбірки", "×", { "data-remove": item.legacyId }, false)) : null);
    }) : [element("li", { className: "admin-muted admin-collection-items__empty" },
      block ? "Підбірка порожня: блок на головній не покаже жодного товару." : "У підбірці ще немає товарів.")]));
    const shown = state.items.filter(item => !itemWarnings(item, block).length).length;
    summary.textContent = block
      ? `На головній з’являться ${number(shown)} з ${number(state.items.length)} товарів.`
      : `На сайті ${number(state.items.filter(item => item.inCatalog).length)} з ${number(state.items.length)} товарів.`;
    if (saveButton) {
      saveButton.disabled = !dirty();
      resetButton.hidden = !dirty();
    }
    refreshSummary(container, state);
    renderResults();
  };

  // Product search
  const searchInput = container.querySelector("[data-product-search]");
  const results = container.querySelector("[data-search-results]");
  const status = container.querySelector("[data-search-status]");
  let hits = [];
  let searchTimer = null;
  let searchController = null;
  const setStatus = text => { if (!status) return; status.textContent = text; status.hidden = !text; };
  function renderResults() {
    if (!results) return;
    const chosen = new Set(ids(state.items));
    const full = state.items.length >= ITEM_LIMIT;
    results.replaceChildren(...hits.map(item => {
      const warnings = itemWarnings(item, block);
      const added = chosen.has(item.legacyId);
      return element("li", { className: "admin-collection-item admin-collection-item--hit" },
        productThumb(item),
        productInfo(item, warnings, { link: false }),
        element("button", { className: "admin-button admin-button--secondary", type: "button", "data-add": item.legacyId, disabled: added || full },
          added ? "Додано" : "Додати"));
    }));
  }
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) { searchController?.abort(); hits = []; setStatus(""); renderResults(); return; }
    searchTimer = setTimeout(async () => {
      searchController?.abort();
      searchController = new AbortController();
      setStatus("Шукаємо…");
      try {
        hits = await api.collections.searchProducts(query, { signal: searchController.signal });
        setStatus(hits.length ? "" : "Нічого не знайдено.");
        renderResults();
      } catch (failure) {
        if (failure?.code === "aborted") return;
        setStatus(failure.message);
      }
    }, 250);
  });
  searchInput?.addEventListener("keydown", event => { if (event.key === "Enter") event.preventDefault(); });
  results?.addEventListener("click", event => {
    const button = event.target.closest("[data-add]");
    if (!button || state.items.length >= ITEM_LIMIT) return;
    const item = hits.find(hit => hit.legacyId === button.dataset.add);
    if (!item || state.items.some(current => current.legacyId === item.legacyId)) return;
    state.items.push(item);
    render();
  });

  list.addEventListener("click", event => {
    const move = event.target.closest("[data-move]");
    const removeButton = event.target.closest("[data-remove]");
    if (move) {
      const index = state.items.findIndex(item => item.legacyId === move.dataset.id);
      const next = index + Number(move.dataset.move);
      if (index < 0 || next < 0 || next >= state.items.length) return;
      [state.items[index], state.items[next]] = [state.items[next], state.items[index]];
    } else if (removeButton) {
      state.items = state.items.filter(item => item.legacyId !== removeButton.dataset.remove);
    } else return;
    render();
  });
  resetButton?.addEventListener("click", () => { state.items = [...state.saved]; render(); });
  saveButton?.addEventListener("click", async () => {
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      const saved = await api.collections.setProducts(state.collection.id, ids(state.items), state.collection.updatedAt);
      state.collection = { ...saved.collection };
      state.saved = saved.items;
      state.items = [...saved.items];
      showToast(container, "Склад збережено. Сайт покаже зміни після оновлення сторінки.");
    } catch (failure) {
      showToast(container, failure.message, true);
    }
    saveButton.textContent = "Зберегти склад";
    render();
  });

  bindForm(container, api, state, canEdit);
  if (canEdit) bindDelete(container, api, state);
  render();
}

function bindForm(container, api, state, canEdit) {
  const form = container.querySelector("[data-collection-form]");
  const fields = ["title", "type", "active", "sortOrder", "dateFrom", "dateTo", "description"];
  if (!canEdit) {
    form.querySelectorAll("input, select, textarea").forEach(control => { control.disabled = true; });
    return;
  }
  let initial = snapshot(form, fields);
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
    if ("active" in patch) patch.active = patch.active === "true";
    if ("dateFrom" in patch) patch.dateFrom = fromLocalInput(patch.dateFrom);
    if ("dateTo" in patch) patch.dateTo = fromLocalInput(patch.dateTo);
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      const saved = await api.collections.update(state.collection.id, patch, state.collection.updatedAt);
      state.collection = { ...saved.collection };
      initial = current;
      container.querySelector("[data-collection-title]").textContent = saved.collection.title;
      refreshSummary(container, state);
      showToast(container, "Збережено. Сайт покаже зміни після оновлення сторінки.");
    } catch (failure) {
      showToast(container, failure.message, true);
    }
    saveButton.textContent = "Зберегти";
    markDirty();
  });
}

function refreshSummary(container, state) {
  const { collection, saved } = state;
  const published = saved.filter(item => item.publicationStatus === "published").length;
  container.querySelector("[data-summary-visible]").textContent = `${number(saved.filter(item => item.inCatalog).length)} товарів`;
  container.querySelector("[data-summary-total]").textContent = number(saved.length);
  container.querySelector("[data-summary-published]").textContent = number(published);
  container.querySelector("[data-collection-updated]").textContent = `Оновлено ${formatDateTime(collection.updatedAt)}`;
  const badge = STATE[collectionState(collection)];
  const holder = container.querySelector("[data-collection-state]");
  holder.replaceChildren(element("span", { className: `admin-status${badge.tone ? ` admin-status--${badge.tone}` : ""}` }, badge.label));
}

// The storefront rules (script.js): unpublished products never show; homepage blocks skip
// products that are out of stock or have no price; the sale block also needs a discount
// (old price above price) or the "sale" tag.
export function itemWarnings(item, block) {
  const warnings = [];
  if (!item.inCatalog) {
    warnings.push(item.publicationStatus !== "published" ? "не опубліковано, на сайті не з’явиться" : "бренд або категорія неактивні, на сайті не з’явиться");
    return warnings;
  }
  if (!block) return warnings;
  if (item.inventoryStatus !== "in_stock") warnings.push("немає в наявності, головна пропустить");
  if (item.priceStatus !== "known" || !(Number(item.amount) > 0)) warnings.push("без ціни, головна пропустить");
  if (block === "sale" && !(Array.isArray(item.tags) && item.tags.includes("sale")) && !(Number(item.oldAmount) > Number(item.amount))) {
    warnings.push("немає старої ціни чи тегу sale, в «Акційних пропозиціях» не з’явиться");
  }
  return warnings;
}

function itemsNote(block) {
  if (block === "sale") return "Блок показує товари в цьому порядку, якщо вони опубліковані, є в наявності, мають ціну і знижку: стару ціну, вищу за поточну, або тег sale. Решту головна пропускає.";
  if (block === "popular") return "Блок показує товари в цьому порядку, якщо вони опубліковані, є в наявності й мають ціну. Решту головна пропускає.";
  return "Порядок у списку зберігається для сайту. Неопубліковані товари на сайті не показуються.";
}

function productThumb(item) {
  if (!item.imageUrl) return element("span", { className: "admin-collection-item__thumb", "aria-hidden": "true" });
  const src = /^https?:\/\//i.test(item.imageUrl) ? item.imageUrl : `/${String(item.imageUrl).replace(/^\/+/, "")}`;
  const image = element("img", { className: "admin-collection-item__thumb", src, alt: "", loading: "lazy", width: "48", height: "48" });
  image.addEventListener("error", () => image.replaceWith(element("span", { className: "admin-collection-item__thumb", "aria-hidden": "true" })), { once: true });
  return image;
}

function productInfo(item, warnings, { link = true } = {}) {
  const price = item.priceStatus === "known" && Number(item.amount) > 0
    ? [Number(item.oldAmount) > Number(item.amount) ? element("s", {}, money(item.oldAmount)) : null, element("strong", {}, money(item.amount))]
    : [element("span", { className: "admin-muted" }, "ціна за запитом")];
  return element("div", { className: "admin-collection-item__info" },
    link ? element("a", { href: `/admin/products/${encodeURIComponent(item.legacyId)}`, "data-admin-link": true }, item.title)
      : element("strong", {}, item.title),
    element("small", {}, [item.sku ? `SKU ${item.sku}` : item.legacyId, item.brand].filter(Boolean).join(" · ")),
    element("span", { className: "admin-collection-item__price" }, ...price),
    ...warnings.map(text => element("span", { className: "admin-collection-item__warning" }, text)));
}

function deletePanel(collection, block) {
  const blocker = block ? "Цю підбірку показує головна сторінка, її не можна видалити. Можна прибрати товари або вимкнути показ." : "";
  return `
    <section class="admin-panel admin-taxonomy-danger">
      <header class="admin-panel__head"><div><p class="admin-kicker">ВИДАЛЕННЯ</p><h2>Видалити підбірку</h2></div></header>
      <p class="admin-panel-note">${escape(blocker || "Підбірка зникне разом зі списком товарів. Самі товари залишаться. Історія змін збережеться.")}</p>
      <button class="admin-button admin-button--danger" type="button" data-delete-open ${blocker ? "disabled" : ""}>Видалити</button>
      <dialog class="admin-dialog" data-delete-dialog><h2>Видалити підбірку «${escape(collection.title)}»?</h2><p>Це не можна скасувати.</p>
        <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--danger" type="button" data-delete-confirm>Видалити</button></div></dialog>
    </section>`;
}

function bindDelete(container, api, state) {
  const dialog = container.querySelector("[data-delete-dialog]");
  if (!dialog) return;
  container.querySelector("[data-delete-open]")?.addEventListener("click", () => dialog.showModal());
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  const confirmButton = dialog.querySelector("[data-delete-confirm]");
  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    confirmButton.textContent = "Видаляємо…";
    try {
      await api.collections.remove(state.collection.id, state.collection.updatedAt);
      dialog.close();
      goTo("/admin/collections", { replace: true });
    } catch (failure) {
      dialog.close();
      showToast(container, failure.message, true);
      confirmButton.disabled = false;
      confirmButton.textContent = "Видалити";
    }
  });
}

function createDialog() {
  return `<dialog class="admin-dialog admin-create-dialog" data-create-dialog aria-labelledby="create-collection-title"><form data-create-form novalidate>
    <header><p class="admin-kicker">НОВИЙ ЗАПИС</p><h2 id="create-collection-title">Нова підбірка</h2><p>Код підбірки потім змінити не можна: за ним сайт знаходить підбірку.</p></header>
    <div class="admin-form-grid">
      ${textField("title", "Назва", "", 160, { full: true, required: true })}
      ${textField("slug", "Код", "", 80, { placeholder: "заповниться з назви", hint: "Латиниця, цифри й дефіси." })}
      ${selectField("type", "Тип", COLLECTION_TYPES, "manual")}
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
    const payload = Object.fromEntries(["title", "slug", "type"].map(name => [name, String(data.get(name) ?? "").trim()]).filter(([, value]) => value));
    submit.disabled = true;
    submit.textContent = "Створюємо…";
    try {
      const created = await api.collections.create(payload);
      dialog.close();
      goTo(`/admin/collections/${encodeURIComponent(created.collection.id)}`);
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = "Створити";
    }
  });
}

function bindFilters(container) {
  const form = container.querySelector("[data-crm-filters]");
  form?.addEventListener("submit", event => {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (String(value).trim()) params.set(key, String(value).trim());
    goTo(`${location.pathname}${params.size ? `?${params}` : ""}`, { replace: true });
  });
  form?.querySelectorAll("select").forEach(select => select.addEventListener("change", () => form.requestSubmit()));
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function collectionState(collection) {
  if (!collection.active) return "off";
  const now = Date.now();
  if (collection.dateFrom && new Date(collection.dateFrom).valueOf() > now) return "scheduled";
  if (collection.dateTo && new Date(collection.dateTo).valueOf() < now) return "ended";
  return "live";
}

function period(collection) {
  if (!collection.dateFrom && !collection.dateTo) return `<span class="admin-muted">Без обмежень</span>`;
  return `${collection.dateFrom ? `з ${formatDate(collection.dateFrom)}` : ""}${collection.dateFrom && collection.dateTo ? "<br>" : ""}${collection.dateTo ? `до ${formatDate(collection.dateTo)}` : ""}`;
}

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "className") node.className = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat().filter(child => child !== null && child !== undefined));
  return node;
}

function iconButton(label, text, data, disabled) {
  return element("button", { className: "admin-icon-button", type: "button", "aria-label": label, title: label, disabled, ...data }, text);
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

function statusBadge(map, value) {
  const item = map[value] || { label: value, tone: "" };
  return `<span class="admin-status${item.tone ? ` admin-status--${item.tone}` : ""}">${escape(item.label)}</span>`;
}

function selectField(name, label, options, value) {
  return `<label class="admin-field"><span>${label}</span><select name="${name}">${Object.entries(options).map(([key, item]) =>
    `<option value="${key}" ${key === value ? "selected" : ""}>${escape(item.label)}</option>`).join("")}</select></label>`;
}

function textField(name, label, value, maxLength, { full = false, type = "text", min, placeholder = "", hint = "", required = false } = {}) {
  const limits = type === "number" ? `min="${min ?? 0}" step="1"` : maxLength ? `maxlength="${maxLength}"` : "";
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${label}</span>
    <input name="${name}" type="${type}" value="${escape(value ?? "")}" ${limits} ${placeholder ? `placeholder="${escape(placeholder)}"` : ""} ${required ? "required" : ""}>
    ${hint ? `<small>${escape(hint)}</small>` : ""}</label>`;
}

// <input type="datetime-local"> works in the browser's time zone without an offset.
function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const pad = part => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

function money(value) {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(value) || 0)} грн`;
}

function number(value) {
  return new Intl.NumberFormat("uk-UA").format(Number(value) || 0);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
