import { icon } from "/admin/admin-icons.mjs";
import { openMediaPicker } from "/admin/admin-media.mjs";

// Homepage banners: the hero slider and the promo tiles beside it. The storefront reads the
// live ones through get_homepage_banners (index.html keeps the static copy as first paint).
// Each banner saves on its own with its updatedAt; the order is saved per placement.

const PLACEMENTS = Object.freeze({
  hero: {
    kicker: "СЛАЙДЕР", title: "Головний банер", add: "Додати слайд", newTitle: "Новий слайд",
    note: "Слайди йдуть у цьому порядку, сайт показує до 8 активних. Якщо активних немає, лишаються стандартні слайди."
  },
  promo: {
    kicker: "ПЛИТКИ", title: "Плитки праворуч від банера", add: "Додати плитку", newTitle: "Нова плитка",
    note: "Сайт показує дві перші активні плитки. Якщо активних немає, лишаються стандартні плитки."
  }
});
const LAYOUTS = Object.freeze({
  cover: { label: "Фото на всю площу, текст зліва" },
  product: { label: "Фото товару праворуч на світлому тлі" }
});
const STATE = Object.freeze({
  live: { label: "На сайті", tone: "success" },
  scheduled: { label: "Заплановано", tone: "info" },
  ended: { label: "Показ завершено", tone: "warning" },
  off: { label: "Вимкнено", tone: "" }
});
const ACTIONS = Object.freeze({ create: "Додано", update: "Змінено", delete: "Видалено", reorder: "Змінено порядок" });
const FIELD_LABELS = Object.freeze({
  placement: "місце", layout: "вигляд", image_url: "зображення", mobile_image_url: "зображення для телефона",
  image_alt: "опис зображення", image_focus: "фокус", logo_url: "логотип", logo_alt: "назва на логотипі",
  kicker: "надзаголовок", title: "заголовок", body: "текст", button_label: "кнопка", link_url: "посилання",
  active: "показ", date_from: "початок показу", date_to: "кінець показу", order: "порядок"
});
const EDITABLE = Object.freeze(["placement", "layout", "imageUrl", "mobileImageUrl", "imageAlt", "imageFocus", "logoUrl", "logoAlt",
  "kicker", "title", "text", "buttonLabel", "linkUrl", "active", "dateFrom", "dateTo"]);
const URL_HINT = "https://… або шлях сайту: /catalog/heating, /product/<назва-товару>, assets/images/…";

export async function createBannersView({ api, signal }) {
  const data = await api.banners.list({ signal });
  const { canEdit } = data;
  const html = `
    <section class="admin-crm-page admin-banners" data-banners>
      <header class="admin-page-head"><div><p class="admin-kicker">САЙТ</p><h1>Банери головної</h1>
        <p>Слайдер і плитки на першому екрані головної сторінки.${canEdit ? "" : " Ваша роль може лише переглядати."}</p></div></header>
      ${Object.entries(PLACEMENTS).map(([placement, meta]) => `
        <section class="admin-panel" data-banner-panel="${placement}">
          <header class="admin-panel__head"><div><p class="admin-kicker">${meta.kicker}</p><h2>${escape(meta.title)}</h2></div>
            ${canEdit ? `<button class="admin-button admin-button--secondary" type="button" data-banner-add="${placement}">${icon("plus")}<span>${escape(meta.add)}</span></button>` : ""}</header>
          <p class="admin-panel-note">${escape(meta.note)}</p>
          <ol class="admin-banner-list" data-banner-list="${placement}"></ol>
        </section>`).join("")}
      <section class="admin-panel admin-crm-timeline">
        <header class="admin-panel__head"><div><p class="admin-kicker">ІСТОРІЯ</p><h2>Останні зміни</h2></div></header>
        <ol data-banner-history></ol>
      </section>
      ${editorDialog(canEdit)}
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => bindBanners(container, api, data) };
}

function editorDialog(canEdit) {
  return `
    <dialog class="admin-dialog admin-create-dialog admin-banner-dialog" data-banner-dialog aria-labelledby="banner-dialog-title">
      <form data-banner-form novalidate>
        <header><p class="admin-kicker" data-banner-dialog-kicker>БАНЕР</p><h2 id="banner-dialog-title" data-banner-dialog-title>Банер</h2>
          <p>Зображення: JPG, PNG, WebP або AVIF. Для слайда найкраще горизонтальне фото від 1536×1024.</p></header>
        <div class="admin-form-grid">
          <label class="admin-field"><span>Місце показу</span><select name="placement">
            ${Object.entries(PLACEMENTS).map(([value, meta]) => `<option value="${value}">${escape(meta.title)}</option>`).join("")}</select></label>
          <label class="admin-field" data-promo-only><span>Вигляд плитки</span><select name="layout">
            ${Object.entries(LAYOUTS).map(([value, item]) => `<option value="${value}">${escape(item.label)}</option>`).join("")}</select></label>
          ${urlField("imageUrl", "Зображення", { required: true, upload: canEdit, hint: URL_HINT })}
          <div class="admin-field admin-banner-preview" aria-hidden="true"><span>Попередній перегляд</span><div data-banner-preview></div></div>
          ${urlField("mobileImageUrl", "Зображення для телефона", { upload: canEdit, hint: "Необов’язково. Порожнє поле: те саме зображення." })}
          ${textField("imageFocus", "Фокус фото по горизонталі, %", "number", { hint: "0 — тримати в кадрі лівий край, 100 — правий, 50 — центр." })}
          ${textField("imageAlt", "Опис зображення", "text", { maxLength: 200, full: true, hint: "Для незрячих і пошуковиків. Порожнє поле: фото декоративне." })}
          ${urlField("logoUrl", "Логотип бренду", { upload: canEdit, hint: "Необов’язково. Показується над заголовком слайда.", heroOnly: true })}
          <label class="admin-field" data-hero-only><span>Назва бренду на логотипі</span><input name="logoAlt" maxlength="80"></label>
          <label class="admin-field admin-field--full"><span>Надзаголовок</span><textarea name="kicker" maxlength="120" rows="2"></textarea>
            <small data-hero-only>Дрібний текст над заголовком; можна 2–3 рядки. На телефоні в слайді не показується.</small></label>
          ${textField("title", "Заголовок", "text", { maxLength: 160, full: true, required: true })}
          <label class="admin-field admin-field--full"><span>Текст</span><textarea name="text" maxlength="300" rows="2"></textarea></label>
          ${textField("buttonLabel", "Текст кнопки", "text", { maxLength: 40, hint: "Порожнє поле: слайд без кнопки (клікабельний увесь), плитка з кнопкою «Детальніше»." })}
          ${textField("linkUrl", "Посилання", "text", { maxLength: 1000, required: true, hint: URL_HINT })}
          <label class="admin-field admin-settings-check"><input type="checkbox" name="active"><span>Показувати на сайті</span></label>
          <span aria-hidden="true"></span>
          ${textField("dateFrom", "Показувати з", "datetime-local", { hint: "Порожнє поле: одразу." })}
          ${textField("dateTo", "Показувати до", "datetime-local", { hint: "Порожнє поле: без кінцевої дати." })}
        </div>
        <p class="admin-feedback admin-feedback--error" data-banner-error role="alert" hidden></p>
        <div class="admin-dialog__actions admin-banner-dialog__actions">
          ${canEdit ? `<button class="admin-button admin-button--danger" type="button" data-banner-delete>Видалити</button>` : ""}
          <button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>${canEdit ? "Скасувати" : "Закрити"}</button>
          ${canEdit ? `<button class="admin-button admin-button--primary" type="submit" data-banner-save>Зберегти</button>` : ""}
        </div>
      </form>
    </dialog>
    ${canEdit ? `<dialog class="admin-dialog" data-banner-delete-dialog><h2 data-banner-delete-title>Видалити банер?</h2><p>Це не можна скасувати. Зображення у сховищі залишиться.</p>
      <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--danger" type="button" data-banner-delete-confirm>Видалити</button></div></dialog>` : ""}`;
}

function bindBanners(container, api, initial) {
  const state = { data: initial, busy: false };
  const { canEdit } = initial;
  const dialog = container.querySelector("[data-banner-dialog]");
  const form = dialog.querySelector("[data-banner-form]");
  const errorNode = dialog.querySelector("[data-banner-error]");
  const deleteDialog = container.querySelector("[data-banner-delete-dialog]");
  let editing = null;

  const byPlacement = placement => state.data.banners.filter(banner => banner.placement === placement);

  const render = () => {
    for (const placement of Object.keys(PLACEMENTS)) {
      const list = container.querySelector(`[data-banner-list="${placement}"]`);
      const banners = byPlacement(placement);
      let liveIndex = 0;
      const limit = state.data.limits?.[placement] ?? Infinity;
      list.replaceChildren(...(banners.length ? banners.map((banner, index) => {
        const status = bannerState(banner);
        const shown = status === "live" && liveIndex++ < limit;
        return element("li", { className: "admin-banner-item" },
          element("span", { className: "admin-banner-item__position" }, String(index + 1)),
          thumb(banner.imageUrl, banner.layout),
          element("div", { className: "admin-banner-item__info" },
            element("strong", {}, banner.title),
            element("small", {}, [banner.kicker.replace(/\n/g, " "), banner.linkUrl].filter(Boolean).join(" · ")),
            element("span", { className: "admin-banner-item__meta" },
              badge(status),
              status === "live" && !shown ? element("span", { className: "admin-muted" }, `не вміщається: показуються перші ${limit}`) : null,
              element("span", { className: "admin-muted" }, period(banner)))),
          element("div", { className: "admin-banner-item__actions" },
            canEdit ? element("label", { className: "admin-banner-toggle" },
              element("input", { type: "checkbox", "data-banner-active": banner.id, checked: banner.active, disabled: state.busy }),
              element("span", {}, "Показувати")) : null,
            canEdit ? iconButton("Вище", "↑", { "data-banner-move": "-1", "data-id": banner.id }, state.busy || index === 0) : null,
            canEdit ? iconButton("Нижче", "↓", { "data-banner-move": "1", "data-id": banner.id }, state.busy || index === banners.length - 1) : null,
            element("button", { className: "admin-button admin-button--secondary", type: "button", "data-banner-edit": banner.id },
              canEdit ? "Змінити" : "Переглянути")));
      }) : [element("li", { className: "admin-muted admin-banner-list__empty" }, "Немає жодного банера: сайт показує стандартні.")]));
    }
    const history = container.querySelector("[data-banner-history]");
    history.replaceChildren(...(state.data.history?.length ? state.data.history.map(entry => element("li", { className: "admin-crm-event" },
      element("header", {}, element("strong", {}, entry.actor), element("time", {}, formatDateTime(entry.createdAt))),
      element("p", {}, historyText(entry)))) : [element("li", { className: "admin-muted" }, "Змін через адмінку ще не було.")]));
  };

  const refresh = async () => {
    state.data = await api.banners.list();
    render();
  };

  // List actions: edit, reorder, show/hide.
  container.addEventListener("click", async event => {
    const add = event.target.closest("[data-banner-add]");
    const edit = event.target.closest("[data-banner-edit]");
    const move = event.target.closest("[data-banner-move]");
    if (add) openEditor(null, add.dataset.bannerAdd);
    else if (edit) openEditor(state.data.banners.find(banner => banner.id === edit.dataset.bannerEdit));
    else if (move && canEdit && !state.busy) {
      const banner = state.data.banners.find(item => item.id === move.dataset.id);
      if (!banner) return;
      const ids = byPlacement(banner.placement).map(item => item.id);
      const index = ids.indexOf(banner.id);
      const next = index + Number(move.dataset.bannerMove);
      if (next < 0 || next >= ids.length) return;
      [ids[index], ids[next]] = [ids[next], ids[index]];
      await runBusy(async () => {
        state.data = await api.banners.reorder(banner.placement, ids);
        showToast(container, "Порядок збережено.");
      });
      container.querySelector(`[data-banner-move="${move.dataset.bannerMove}"][data-id="${banner.id}"]:not(:disabled)`)?.focus();
    }
  });
  container.addEventListener("change", async event => {
    const toggle = event.target.closest("[data-banner-active]");
    if (!toggle || !canEdit) return;
    const banner = state.data.banners.find(item => item.id === toggle.dataset.bannerActive);
    if (!banner) return;
    await runBusy(async () => {
      await api.banners.save(banner.id, { ...editable(banner), active: toggle.checked }, banner.updatedAt);
      await refresh();
      showToast(container, toggle.checked ? "Банер увімкнено." : "Банер вимкнено.");
    });
  });

  async function runBusy(task) {
    state.busy = true;
    render();
    try { await task(); } catch (failure) {
      showToast(container, failure.message, true);
      await refresh().catch(() => {});
    }
    state.busy = false;
    render();
  }

  // Editor
  const field = name => form.elements.namedItem(name);
  const preview = dialog.querySelector("[data-banner-preview]");
  const syncPlacement = () => {
    const hero = field("placement").value === "hero";
    dialog.querySelectorAll("[data-hero-only]").forEach(node => { node.hidden = !hero; });
    dialog.querySelectorAll("[data-promo-only]").forEach(node => { node.hidden = hero; });
    if (hero) field("layout").value = "cover";
    syncPreview();
  };
  const syncPreview = () => {
    const url = field("imageUrl").value.trim();
    preview.replaceChildren(url ? thumb(url, field("layout").value, "admin-banner-preview__image") : element("span", { className: "admin-muted" }, "Додайте зображення."));
    const image = preview.querySelector("img");
    if (image && field("layout").value === "cover") image.style.objectPosition = `${clampFocus(field("imageFocus").value)}% center`;
  };
  form.addEventListener("input", event => { if (["imageUrl", "imageFocus"].includes(event.target.name)) syncPreview(); });
  form.addEventListener("change", event => { if (["placement", "layout"].includes(event.target.name)) syncPlacement(); });

  function openEditor(banner, placement = banner?.placement || "hero") {
    editing = banner || null;
    errorNode.hidden = true;
    const values = banner ? editable(banner) : { placement, layout: placement === "promo" ? "product" : "cover", imageFocus: 50, active: true };
    for (const name of EDITABLE) {
      const control = field(name);
      if (!control) continue;
      if (control.type === "checkbox") control.checked = Boolean(values[name]);
      else if (control.type === "datetime-local") control.value = toLocalInput(values[name]);
      else control.value = values[name] ?? "";
    }
    const meta = PLACEMENTS[placement];
    dialog.querySelector("[data-banner-dialog-kicker]").textContent = banner ? `${meta.kicker} · ${bannerStateLabel(banner)}` : "НОВИЙ БАНЕР";
    dialog.querySelector("[data-banner-dialog-title]").textContent = banner ? banner.title : meta.newTitle;
    const deleteButton = dialog.querySelector("[data-banner-delete]");
    if (deleteButton) deleteButton.hidden = !banner;
    if (!canEdit) form.querySelectorAll("input, select, textarea").forEach(control => { control.disabled = true; });
    syncPlacement();
    dialog.showModal();
    (canEdit ? field("placement") : dialog.querySelector("[data-dialog-cancel]"))?.focus();
    dialog.scrollTop = 0;
  }

  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!canEdit || !form.reportValidity()) return;
    const payload = readForm(form);
    const submit = dialog.querySelector("[data-banner-save]");
    submit.disabled = true;
    submit.textContent = "Зберігаємо…";
    errorNode.hidden = true;
    try {
      await api.banners.save(editing?.id || null, payload, editing?.updatedAt || null);
      dialog.close();
      await refresh();
      showToast(container, "Збережено. Сайт покаже зміни після оновлення сторінки.");
    } catch (failure) {
      errorNode.textContent = failure.message;
      errorNode.hidden = false;
    }
    submit.disabled = false;
    submit.textContent = "Зберегти";
  });

  // Uploads go to the public site-media bucket; the field gets the public URL.
  dialog.querySelectorAll("[data-upload-for]").forEach(input => input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const target = field(input.dataset.uploadFor);
    const button = dialog.querySelector(`[data-upload-button="${input.dataset.uploadFor}"]`);
    button.disabled = true;
    button.textContent = "Завантаження…";
    errorNode.hidden = true;
    try {
      if (!/^image\/(jpeg|png|webp|avif|svg\+xml)$/.test(file.type)) throw new Error("Підходять лише зображення JPG, PNG, WebP, AVIF або SVG.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Файл більший за 10 МБ. Стисніть зображення.");
      const uploaded = await api.banners.upload(file);
      target.value = uploaded.url;
      syncPreview();
    } catch (failure) {
      errorNode.textContent = failure.message;
      errorNode.hidden = false;
    }
    input.value = "";
    button.disabled = false;
    button.textContent = "Завантажити";
  }));
  dialog.querySelectorAll("[data-upload-button]").forEach(button => button.addEventListener("click", () => {
    dialog.querySelector(`[data-upload-for="${button.dataset.uploadButton}"]`)?.click();
  }));

  // Pick an image that is already in the media library (/admin/media).
  dialog.querySelectorAll("[data-media-pick]").forEach(button => button.addEventListener("click", async () => {
    const url = await openMediaPicker({ api }).catch(failure => {
      errorNode.textContent = failure.message;
      errorNode.hidden = false;
      return null;
    });
    if (!url) return;
    field(button.dataset.mediaPick).value = url;
    syncPreview();
    field(button.dataset.mediaPick).focus();
  }));

  if (deleteDialog) {
    dialog.querySelector("[data-banner-delete]").addEventListener("click", () => {
      if (!editing) return;
      deleteDialog.querySelector("[data-banner-delete-title]").textContent = `Видалити «${editing.title}»?`;
      deleteDialog.showModal();
    });
    deleteDialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => deleteDialog.close());
    const confirmButton = deleteDialog.querySelector("[data-banner-delete-confirm]");
    confirmButton.addEventListener("click", async () => {
      if (!editing) return;
      confirmButton.disabled = true;
      confirmButton.textContent = "Видаляємо…";
      try {
        await api.banners.remove(editing.id, editing.updatedAt);
        deleteDialog.close();
        dialog.close();
        await refresh();
        showToast(container, "Банер видалено.");
      } catch (failure) {
        deleteDialog.close();
        errorNode.textContent = failure.message;
        errorNode.hidden = false;
      }
      confirmButton.disabled = false;
      confirmButton.textContent = "Видалити";
    });
  }

  render();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function editable(banner) {
  return Object.fromEntries(EDITABLE.map(name => [name, banner[name] ?? null]));
}

function readForm(form) {
  const value = name => String(form.elements.namedItem(name)?.value ?? "").trim();
  const placement = value("placement");
  return {
    placement,
    layout: placement === "hero" ? "cover" : value("layout"),
    imageUrl: value("imageUrl"),
    mobileImageUrl: value("mobileImageUrl"),
    imageAlt: value("imageAlt"),
    imageFocus: value("imageFocus") === "" ? null : Number(value("imageFocus")),
    logoUrl: placement === "hero" ? value("logoUrl") : "",
    logoAlt: placement === "hero" ? value("logoAlt") : "",
    kicker: value("kicker"),
    title: value("title"),
    text: value("text"),
    buttonLabel: value("buttonLabel"),
    linkUrl: value("linkUrl"),
    active: Boolean(form.elements.namedItem("active")?.checked),
    dateFrom: fromLocalInput(value("dateFrom")),
    dateTo: fromLocalInput(value("dateTo"))
  };
}

function bannerState(banner) {
  if (!banner.active) return "off";
  const now = Date.now();
  if (banner.dateFrom && new Date(banner.dateFrom).valueOf() > now) return "scheduled";
  if (banner.dateTo && new Date(banner.dateTo).valueOf() < now) return "ended";
  return "live";
}

function bannerStateLabel(banner) {
  return STATE[bannerState(banner)].label.toUpperCase();
}

function badge(status) {
  const item = STATE[status];
  return element("span", { className: `admin-status${item.tone ? ` admin-status--${item.tone}` : ""}` }, item.label);
}

function period(banner) {
  if (!banner.dateFrom && !banner.dateTo) return "без обмежень у часі";
  return [banner.dateFrom ? `з ${formatDateTime(banner.dateFrom)}` : "", banner.dateTo ? `до ${formatDateTime(banner.dateTo)}` : ""].filter(Boolean).join(" ");
}

function historyText(entry) {
  const action = ACTIONS[entry.action] || entry.action;
  const where = entry.placement === "promo" ? "плитки" : "слайдера";
  if (entry.action === "reorder") return `${action} ${where}`;
  const fields = entry.action === "update"
    ? (entry.fields || []).map(name => FIELD_LABELS[name]).filter(Boolean)
    : [];
  return `${action}: «${entry.title || "без назви"}»${fields.length ? ` — ${fields.join(", ")}` : ""}`;
}

// Site paths are stored as written; the admin lives under /admin, so assets/... needs a leading slash.
export function bannerImageSrc(url) {
  const value = String(url || "").trim();
  if (/^https:\/\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("assets/")) return `/${value}`;
  return "";
}

function thumb(url, layout, className = "admin-banner-item__thumb") {
  const src = bannerImageSrc(url);
  const placeholder = () => element("span", { className, "aria-hidden": "true" });
  if (!src) return placeholder();
  const image = element("img", { className: `${className}${layout === "product" ? " is-contained" : ""}`, src, alt: "", loading: "lazy" });
  image.addEventListener("error", () => image.replaceWith(placeholder()), { once: true });
  return image;
}

function clampFocus(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 50;
}

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "className") node.className = value;
    else if (key === "checked") node.checked = Boolean(value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat().filter(child => child !== null && child !== undefined));
  return node;
}

function iconButton(label, text, data, disabled) {
  return element("button", { className: "admin-icon-button", type: "button", "aria-label": label, title: label, disabled, ...data }, text);
}

function urlField(name, label, { required = false, upload = false, hint = "", heroOnly = false } = {}) {
  return `<div class="admin-field admin-field--full"${heroOnly ? " data-hero-only" : ""}><span><label for="banner-${name}">${escape(label)}</label></span>
    <div class="admin-banner-url"><input id="banner-${name}" name="${name}" maxlength="1000" autocomplete="off" spellcheck="false" ${required ? "required" : ""}>
      ${upload ? `<span class="admin-banner-url__actions"><button class="admin-button admin-button--secondary" type="button" data-media-pick="${name}">Медіатека</button>
      <button class="admin-button admin-button--secondary" type="button" data-upload-button="${name}">Завантажити</button></span>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml" data-upload-for="${name}" hidden>` : ""}</div>
    ${hint ? `<small>${escape(hint)}</small>` : ""}</div>`;
}

function textField(name, label, type, { maxLength = 0, full = false, required = false, hint = "" } = {}) {
  const limits = type === "number" ? `min="0" max="100" step="1"` : maxLength ? `maxlength="${maxLength}"` : "";
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${escape(label)}</span>
    <input name="${name}" type="${type}" ${limits} ${required ? "required" : ""}>
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

function showToast(container, message, error = false) {
  const toast = container.querySelector(".admin-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
