import { resetProductsCache } from "/admin/admin-products.mjs";

// «Серії» panel on the brand page: create, rename and delete product series of the brand.
// The code (slug) is set at creation; products pick their series in the product editor.
// A series that products use can be deleted only together with unlinking them.

export function seriesPanel(canEdit) {
  return `
    <section class="admin-panel admin-series" data-series-panel>
      <header class="admin-panel__head"><div><p class="admin-kicker">СЕРІЇ</p><h2>Лінійки бренду</h2></div>
        ${canEdit ? `<button class="admin-button admin-button--secondary" type="button" data-series-create>Нова серія</button>` : ""}</header>
      <ul class="admin-series__list" data-series-list><li class="admin-muted">Завантажуємо…</li></ul>
      ${canEdit ? `<dialog class="admin-dialog admin-create-dialog" data-series-dialog aria-labelledby="series-dialog-title"><form data-series-form novalidate>
        <header><p class="admin-kicker" data-series-dialog-kicker>НОВА СЕРІЯ</p><h2 id="series-dialog-title" data-series-dialog-title>Нова серія</h2>
          <p data-series-dialog-note>Код потім змінити не можна. Товари додаються до серії в картці товару.</p></header>
        <div class="admin-form-grid">
          <label class="admin-field admin-field--full"><span>Назва</span><input name="name" maxlength="120" required></label>
          <label class="admin-field admin-field--full" data-series-slug-field><span>Код</span><input name="slug" maxlength="80" placeholder="заповниться з назви"><small>Латиниця, цифри й дефіси.</small></label>
        </div>
        <p class="admin-feedback admin-feedback--error" data-series-error role="alert" hidden></p>
        <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--primary" type="submit" data-series-submit>Створити</button></div>
      </form></dialog>
      <dialog class="admin-dialog" data-series-delete-dialog><h2 data-series-delete-title></h2><p data-series-delete-note></p>
        <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--danger" type="button" data-series-delete-confirm>Видалити</button></div></dialog>` : ""}
    </section>`;
}

export function bindSeriesPanel(container, { api, brandId }) {
  const panel = container.querySelector("[data-series-panel]");
  if (!panel) return;
  const list = panel.querySelector("[data-series-list]");
  const dialog = panel.querySelector("[data-series-dialog]");
  const deleteDialog = panel.querySelector("[data-series-delete-dialog]");
  const state = { canEdit: false, series: [], editing: null, deleting: null };

  function accept(result) {
    state.canEdit = Boolean(result?.canEdit) && Boolean(dialog);
    state.series = result?.series || [];
    const count = container.querySelector("[data-series-count]");
    if (count) count.textContent = new Intl.NumberFormat("uk-UA").format(state.series.length);
    render();
  }

  function render() {
    list.replaceChildren(...(state.series.length ? state.series.map(item => element("li", { className: "admin-series__item" },
      element("div", { className: "admin-series__info" },
        element("strong", {}, item.name),
        element("small", {}, `${productLabel(item.productCount)}${item.productCount ? `, на сайті ${item.publishedCount}` : ""} · ${item.slug}`)),
      state.canEdit ? element("div", { className: "admin-series__actions" },
        element("button", { className: "admin-button admin-button--ghost", type: "button", "data-series-rename": item.id }, "Перейменувати"),
        element("button", { className: "admin-button admin-button--ghost admin-series__delete", type: "button", "data-series-delete": item.id }, "Видалити")) : null))
      : [element("li", { className: "admin-muted" }, "У бренду ще немає серій.")]));
  }

  const load = () => api.series.list(brandId).then(accept).catch(failure => {
    list.replaceChildren(element("li", { className: "admin-feedback admin-feedback--error", role: "alert" }, `Не вдалося завантажити серії: ${failure.message}`));
  });
  load();

  if (!dialog) return;
  const form = dialog.querySelector("[data-series-form]");
  const error = dialog.querySelector("[data-series-error]");
  const submit = dialog.querySelector("[data-series-submit]");
  const slugField = dialog.querySelector("[data-series-slug-field]");

  function openDialog(series = null) {
    state.editing = series;
    form.reset();
    error.hidden = true;
    slugField.hidden = Boolean(series);
    form.elements.name.value = series?.name || "";
    dialog.querySelector("[data-series-dialog-kicker]").textContent = series ? "СЕРІЯ" : "НОВА СЕРІЯ";
    dialog.querySelector("[data-series-dialog-title]").textContent = series ? "Перейменувати серію" : "Нова серія";
    dialog.querySelector("[data-series-dialog-note]").textContent = series
      ? `Код «${series.slug}» не змінюється. Нову назву сайт одразу використає в пошуку.`
      : "Код потім змінити не можна. Товари додаються до серії в картці товару.";
    submit.textContent = series ? "Зберегти" : "Створити";
    dialog.showModal();
    form.elements.name.focus();
  }

  panel.querySelector("[data-series-create]")?.addEventListener("click", () => openDialog());
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const name = form.elements.name.value.trim();
    const slug = form.elements.slug.value.trim();
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Зберігаємо…";
    try {
      const result = state.editing
        ? await api.series.update(state.editing.id, { name }, state.editing.updatedAt)
        : await api.series.create(brandId, slug ? { name, slug } : { name });
      dialog.close();
      resetProductsCache();
      accept(result);
      showToast(container, state.editing ? "Серію перейменовано." : "Серію створено. Додайте до неї товари в картці товару.");
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    }
    submit.disabled = false;
    submit.textContent = label;
  });

  const confirmButton = deleteDialog.querySelector("[data-series-delete-confirm]");
  deleteDialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => deleteDialog.close());
  list.addEventListener("click", event => {
    const rename = event.target.closest("[data-series-rename]");
    const remove = event.target.closest("[data-series-delete]");
    const series = state.series.find(item => item.id === (rename || remove)?.dataset[rename ? "seriesRename" : "seriesDelete"]);
    if (!series) return;
    if (rename) return openDialog(series);
    state.deleting = series;
    deleteDialog.querySelector("[data-series-delete-title]").textContent = `Видалити серію «${series.name}»?`;
    deleteDialog.querySelector("[data-series-delete-note]").textContent = series.productCount
      ? `Серію використовують ${productLabel(series.productCount)}. Вони залишаться в каталозі, але без серії. Це не можна скасувати.`
      : "Це не можна скасувати.";
    confirmButton.textContent = series.productCount ? "Відв’язати й видалити" : "Видалити";
    deleteDialog.showModal();
  });
  confirmButton.addEventListener("click", async () => {
    const series = state.deleting;
    if (!series) return;
    const label = confirmButton.textContent;
    confirmButton.disabled = true;
    confirmButton.textContent = "Видаляємо…";
    try {
      const result = await api.series.remove(series.id, series.updatedAt, series.productCount > 0);
      deleteDialog.close();
      resetProductsCache();
      accept(result);
      showToast(container, series.productCount ? `Серію видалено, ${productLabel(series.productCount)} без серії.` : "Серію видалено.");
    } catch (failure) {
      deleteDialog.close();
      showToast(container, failure.message, true);
    }
    confirmButton.disabled = false;
    confirmButton.textContent = label;
  });
}

function productLabel(count) {
  const value = Math.abs(Number(count) || 0);
  const ending = value % 10 === 1 && value % 100 !== 11 ? "товар" : [2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100) ? "товари" : "товарів";
  return `${value} ${ending}`;
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

function showToast(container, message, error = false) {
  const toast = container.querySelector(".admin-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.hidden = true; }, 5000);
}
