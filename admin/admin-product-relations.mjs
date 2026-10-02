import { itemWarnings } from "/admin/admin-collections.mjs";

// «Пов’язані товари» tab of the product editor: three ordered lists the product page shows as
// «Сумісні товари», «Аксесуари» and «Схожі товари». Saved separately from the main product form
// (admin_set_product_relations) with the lists the editor loaded as the concurrency token.

const KINDS = Object.freeze([
  Object.freeze({ id: "compatible", title: "Сумісні товари", note: "З чим цей товар працює разом: обладнання тієї ж системи, яке підходить за підключенням і параметрами." }),
  Object.freeze({ id: "accessory", title: "Аксесуари", note: "Комплектуючі, витратні матеріали й монтажні елементи саме до цього товару." }),
  Object.freeze({ id: "similar", title: "Схожі товари", note: "Альтернативи на заміну. Вибрані товари стоять першими, решту сайт добирає автоматично з тієї ж категорії." })
]);

export function relationsPanel() {
  return `<section id="panel-relations" class="admin-editor-panel admin-related" data-editor-panel="relations" role="tabpanel" aria-labelledby="tab-relations" hidden data-relations-panel>
    <header><div><p class="admin-kicker">ПОВ’ЯЗАНІ ТОВАРИ</p><h2>Сумісні, аксесуари, схожі</h2></div><div class="admin-related__actions" data-relations-actions hidden>
      <span class="admin-save-state" data-relations-state>Змін немає</span>
      <button class="admin-button admin-button--ghost" type="button" data-relations-reset hidden>Скасувати</button>
      <button class="admin-button admin-button--primary" type="button" data-relations-save disabled>Зберегти зв’язки</button>
    </div><span data-relations-readonly hidden>Лише перегляд</span></header>
    <p class="admin-panel-note">Блоки показуються на сторінці товару в цьому порядку. Неопубліковані товари сайт пропускає. Зберігаються окремо від інших розділів, кнопкою «Зберегти зв’язки». Зв’язок односторонній: щоб товар B показував A, додайте A в картці B.</p>
    <div class="admin-related__body" data-relations-body><p class="admin-muted admin-related__loading">Завантажуємо…</p></div>
  </section>`;
}

export function bindRelationsPanel(editor, { api, legacyId }) {
  const panel = editor?.querySelector("[data-relations-panel]");
  if (!panel) return;
  // The panel sits inside the main product form; its controls must not mark that form dirty.
  for (const type of ["input", "change"]) panel.addEventListener(type, event => event.stopPropagation());
  panel.addEventListener("keydown", event => { if (event.key === "Enter" && event.target.matches("input")) event.preventDefault(); });

  const body = panel.querySelector("[data-relations-body]");
  const actions = panel.querySelector("[data-relations-actions]");
  const saveButton = panel.querySelector("[data-relations-save]");
  const resetButton = panel.querySelector("[data-relations-reset]");
  const stateLabel = panel.querySelector("[data-relations-state]");
  const state = { canEdit: false, limit: 24, token: null, saved: {}, lists: {} };
  const searches = new Map();
  const tabButton = editor.querySelector("#tab-relations");

  const ids = list => list.map(item => item.legacyId);
  const dirty = () => KINDS.some(kind => JSON.stringify(ids(state.lists[kind.id] || [])) !== JSON.stringify(ids(state.saved[kind.id] || [])));
  const total = () => KINDS.reduce((sum, kind) => sum + (state.saved[kind.id] || []).length, 0);

  // Hide the product form's save bar while this tab is open (it does not save relations).
  const syncTab = () => editor.classList.toggle("is-relations-tab", !panel.hidden);
  const observer = new MutationObserver(syncTab);
  observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  editor.addEventListener("admin:dispose", () => observer.disconnect());

  const beforeUnload =event => { if (!dirty()) return; event.preventDefault(); event.returnValue = ""; };
  window.addEventListener("beforeunload", beforeUnload);
  editor.addEventListener("admin:dispose", () => window.removeEventListener("beforeunload", beforeUnload));

  function accept(detail) {
    state.canEdit = Boolean(detail.canEdit);
    state.limit = Number(detail.limit) || 24;
    state.token = detail.state;
    state.saved = Object.fromEntries(KINDS.map(kind => [kind.id, detail.relations?.[kind.id] || []]));
    state.lists = Object.fromEntries(KINDS.map(kind => [kind.id, [...state.saved[kind.id]]]));
  }

  function renderShell() {
    actions.hidden = !state.canEdit;
    panel.querySelector("[data-relations-readonly]").hidden = state.canEdit;
    body.replaceChildren(...KINDS.map(kind => element("section", { className: "admin-related__kind", "data-kind": kind.id },
      element("header", { className: "admin-related__kind-head" },
        element("h3", { id: `relations-${kind.id}-title` }, kind.title),
        element("span", { className: "admin-related__count", "data-count": kind.id })),
      element("p", { className: "admin-related__note" }, kind.note),
      element("ol", { className: "admin-collection-items__list admin-related__list", "data-list": kind.id, "aria-labelledby": `relations-${kind.id}-title` }),
      state.canEdit ? element("div", { className: "admin-collection-search admin-related__search" },
        element("label", { className: "admin-field" }, element("span", {}, `Додати в «${kind.title}»`),
          element("input", { type: "search", "data-search": kind.id, placeholder: "Назва, артикул, модель або бренд", autocomplete: "off", maxlength: "120" })),
        element("p", { className: "admin-muted", "data-search-status": kind.id, hidden: true }),
        element("ul", { className: "admin-collection-search__results", "data-results": kind.id })) : null)));
    KINDS.forEach(kind => renderKind(kind.id));
  }

  function renderKind(kindId) {
    const list = body.querySelector(`[data-list="${kindId}"]`);
    const items = state.lists[kindId];
    list.replaceChildren(...(items.length ? items.map((item, index) => {
      const warnings = itemWarnings(item, null);
      return element("li", { className: `admin-collection-item${warnings.length ? " has-warning" : ""}` },
        element("span", { className: "admin-collection-item__position" }, String(index + 1)),
        productThumb(item),
        productInfo(item, warnings, true),
        state.canEdit ? element("div", { className: "admin-collection-item__actions" },
          iconButton("Вище", "↑", { "data-move": "-1", "data-kind": kindId, "data-id": item.legacyId }, index === 0),
          iconButton("Нижче", "↓", { "data-move": "1", "data-kind": kindId, "data-id": item.legacyId }, index === items.length - 1),
          iconButton("Прибрати", "×", { "data-remove": item.legacyId, "data-kind": kindId }, false)) : null);
    }) : [element("li", { className: "admin-muted admin-collection-items__empty" }, "Нічого не вибрано.")]));
    body.querySelector(`[data-count="${kindId}"]`).textContent = `${items.length} з ${state.limit}`;
    renderResults(kindId);
    refreshState();
  }

  function renderResults(kindId) {
    const results = body.querySelector(`[data-results="${kindId}"]`);
    if (!results) return;
    const hits = searches.get(kindId)?.hits || [];
    const chosen = new Set(ids(state.lists[kindId]));
    const full = state.lists[kindId].length >= state.limit;
    results.replaceChildren(...hits.map(item => {
      const self = item.legacyId === legacyId;
      const added = chosen.has(item.legacyId);
      return element("li", { className: "admin-collection-item admin-collection-item--hit" },
        productThumb(item),
        productInfo(item, itemWarnings(item, null), false),
        element("button", { className: "admin-button admin-button--secondary", type: "button", "data-add": item.legacyId, "data-kind": kindId, disabled: self || added || full },
          self ? "Цей товар" : added ? "Додано" : "Додати"));
    }));
  }

  function refreshState() {
    const changed = dirty();
    saveButton.disabled = !changed;
    resetButton.hidden = !changed;
    stateLabel.textContent = changed ? "Є незбережені зміни" : "Змін немає";
    stateLabel.classList.toggle("is-dirty", changed);
    if (tabButton) tabButton.textContent = `Пов’язані товари · ${total()}${changed ? " *" : ""}`;
  }

  body.addEventListener("input", event => {
    const input = event.target.closest("[data-search]");
    if (!input) return;
    const kindId = input.dataset.search;
    const search = searches.get(kindId) || { hits: [], timer: null, controller: null };
    searches.set(kindId, search);
    const status = body.querySelector(`[data-search-status="${kindId}"]`);
    const setStatus = text => { status.textContent = text; status.hidden = !text; };
    clearTimeout(search.timer);
    const query = input.value.trim();
    if (query.length < 2) { search.controller?.abort(); search.hits = []; setStatus(""); renderResults(kindId); return; }
    search.timer = setTimeout(async () => {
      search.controller?.abort();
      search.controller = new AbortController();
      setStatus("Шукаємо…");
      try {
        search.hits = await api.collections.searchProducts(query, { signal: search.controller.signal }) || [];
        setStatus(search.hits.length ? "" : "Нічого не знайдено.");
        renderResults(kindId);
      } catch (failure) {
        if (failure?.code === "aborted") return;
        setStatus(failure.message);
      }
    }, 250);
  });

  body.addEventListener("click", event => {
    const add = event.target.closest("[data-add]");
    const move = event.target.closest("[data-move]");
    const remove = event.target.closest("[data-remove]");
    const kindId = (add || move || remove)?.dataset.kind;
    if (!kindId || !state.canEdit) return;
    const list = state.lists[kindId];
    if (add) {
      const item = (searches.get(kindId)?.hits || []).find(hit => hit.legacyId === add.dataset.add);
      if (!item || item.legacyId === legacyId || list.length >= state.limit || list.some(current => current.legacyId === item.legacyId)) return;
      list.push(item);
    } else if (move) {
      const index = list.findIndex(item => item.legacyId === move.dataset.id);
      const next = index + Number(move.dataset.move);
      if (index < 0 || next < 0 || next >= list.length) return;
      [list[index], list[next]] = [list[next], list[index]];
    } else {
      state.lists[kindId] = list.filter(item => item.legacyId !== remove.dataset.remove);
    }
    renderKind(kindId);
  });

  resetButton.addEventListener("click", () => {
    state.lists = Object.fromEntries(KINDS.map(kind => [kind.id, [...state.saved[kind.id]]]));
    KINDS.forEach(kind => renderKind(kind.id));
  });

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      const lists = Object.fromEntries(KINDS.map(kind => [kind.id, ids(state.lists[kind.id])]));
      accept(await api.relations.set(legacyId, lists, state.token));
      KINDS.forEach(kind => renderKind(kind.id));
      showToast(editor, "Зв’язки збережено. Сторінка товару покаже їх після оновлення.");
    } catch (failure) {
      showToast(editor, failure.message, true);
      refreshState();
    }
    saveButton.textContent = "Зберегти зв’язки";
  });

  api.relations.get(legacyId).then(detail => {
    if (!detail) throw new Error("Товар не знайдено.");
    accept(detail);
    renderShell();
  }).catch(failure => {
    body.replaceChildren(element("p", { className: "admin-feedback admin-feedback--error admin-related__loading", role: "alert" },
      `Не вдалося завантажити пов’язані товари: ${failure.message}`));
  });
}

function productThumb(item) {
  if (!item.imageUrl) return element("span", { className: "admin-collection-item__thumb", "aria-hidden": "true" });
  const src = /^https?:\/\//i.test(item.imageUrl) ? item.imageUrl : `/${String(item.imageUrl).replace(/^\/+/, "")}`;
  const image = element("img", { className: "admin-collection-item__thumb", src, alt: "", loading: "lazy", width: "48", height: "48" });
  image.addEventListener("error", () => image.replaceWith(element("span", { className: "admin-collection-item__thumb", "aria-hidden": "true" })), { once: true });
  return image;
}

function productInfo(item, warnings, link) {
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

function showToast(container, message, error = false) {
  const toast = container.querySelector(".admin-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function money(value) {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(value) || 0)} грн`;
}
