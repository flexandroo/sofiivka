import { icon } from "/admin/admin-icons.mjs";

// Media library: images staff upload once and reuse in banners, products and brands. Files go
// to the public site-media bucket (folder library/) through the Storage API with the staff JWT
// and are then registered with admin_register_media. openMediaPicker() reuses the same grid
// and upload flow inside other editors and resolves with the chosen public URL.

export const MEDIA_TYPES = Object.freeze({
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/svg+xml": "SVG"
});
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = Object.keys(MEDIA_TYPES).join(",");
const MAX_FILES_AT_ONCE = 20;

export async function createMediaView({ api, signal }) {
  const data = await api.media.list({}, { signal });
  const { canEdit } = data;
  const html = `
    <section class="admin-crm-page admin-media" data-media>
      <header class="admin-page-head"><div><p class="admin-kicker">ДАНІ</p><h1>Медіатека</h1>
        <p>Зображення для банерів, товарів і брендів. Нові файли зберігаються в Supabase Storage (site-media/library); наявні фото товарів лишаються там, де були.${canEdit ? "" : " Ваша роль може лише переглядати й копіювати адреси."}</p></div></header>
      ${canEdit ? dropZone("media") : ""}
      <form class="admin-crm-filters admin-media-filters" data-media-filters role="search">
        <label class="admin-filter-search"><span class="admin-sr-only">Пошук</span>${icon("search")}<input type="search" name="q" placeholder="Назва файлу або опис" autocomplete="off"></label>
        <div class="admin-filter-actions"><button class="admin-button admin-button--secondary" type="submit">Знайти</button></div>
      </form>
      <p class="admin-media-summary admin-muted" data-media-summary aria-live="polite"></p>
      <ul class="admin-media-grid" data-media-grid></ul>
      <nav class="admin-pagination" aria-label="Сторінки медіатеки" data-media-pages></nav>
      ${detailDialog(canEdit)}
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => bindMedia(container, api, data) };
}

function dropZone(prefix) {
  return `<section class="admin-media-drop" data-media-drop>
      ${icon("media")}
      <div><strong>Перетягніть зображення сюди</strong>
        <small>${Object.values(MEDIA_TYPES).join(", ")}, до ${formatSize(MEDIA_MAX_BYTES)} кожне; до ${MAX_FILES_AT_ONCE} файлів за раз.</small></div>
      <label class="admin-button admin-button--primary admin-upload-button">${icon("plus")}<span>Обрати файли</span>
        <input type="file" accept="${ACCEPT}" multiple data-media-input aria-describedby="${prefix}-drop-hint"></label>
      <span class="admin-sr-only" id="${prefix}-drop-hint">Зображення JPG, PNG, WebP або SVG до 5 МБ.</span>
      <ul class="admin-media-queue" data-media-queue hidden></ul>
    </section>`;
}

function detailDialog(canEdit) {
  return `
    <dialog class="admin-dialog admin-create-dialog admin-media-dialog" data-media-dialog aria-labelledby="media-dialog-title">
      <form data-media-form novalidate>
        <header><p class="admin-kicker" data-media-dialog-kicker>ФАЙЛ</p><h2 id="media-dialog-title" data-media-dialog-title>Файл</h2></header>
        <div class="admin-media-detail">
          <div class="admin-media-detail__preview" data-media-preview></div>
          <div class="admin-media-detail__fields">
            <div class="admin-field"><span><label for="media-url">Адреса для вставлення</label></span>
              <div class="admin-banner-url"><input id="media-url" name="url" readonly spellcheck="false">
                <button class="admin-button admin-button--secondary" type="button" data-media-copy>Копіювати</button></div></div>
            <label class="admin-field"><span>Опис зображення (alt)</span>
              <textarea name="alt" maxlength="300" rows="3" ${canEdit ? "" : "disabled"}></textarea>
              <small>Що зображено, для незрячих і пошуковиків. Банери й товари мають власне поле опису.</small></label>
            <dl class="admin-media-facts" data-media-facts></dl>
          </div>
        </div>
        <p class="admin-feedback admin-feedback--error" data-media-error role="alert" hidden></p>
        <div class="admin-dialog__actions admin-media-dialog__actions">
          ${canEdit ? `<button class="admin-button admin-button--danger" type="button" data-media-delete>Видалити</button>` : ""}
          <button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>${canEdit ? "Скасувати" : "Закрити"}</button>
          ${canEdit ? `<button class="admin-button admin-button--primary" type="submit" data-media-save>Зберегти опис</button>` : ""}
        </div>
      </form>
    </dialog>
    ${canEdit ? `<dialog class="admin-dialog" data-media-delete-dialog><h2 data-media-delete-title>Видалити файл?</h2>
      <p>Файл зникне з медіатеки та сховища. Це не можна скасувати.</p>
      <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--danger" type="button" data-media-delete-confirm>Видалити</button></div></dialog>` : ""}`;
}

function bindMedia(container, api, initial) {
  const state = { data: initial, query: "", page: 1 };
  const { canEdit } = initial;
  const grid = container.querySelector("[data-media-grid]");
  const dialog = container.querySelector("[data-media-dialog]");
  const form = dialog.querySelector("[data-media-form]");
  const errorNode = dialog.querySelector("[data-media-error]");
  const deleteDialog = container.querySelector("[data-media-delete-dialog]");
  let editing = null;

  const render = () => {
    const { items, total, page, pageSize } = state.data;
    container.querySelector("[data-media-summary]").textContent = total
      ? `${state.query ? "Знайдено" : "У медіатеці"} ${total} ${plural(total, ["файл", "файли", "файлів"])}.`
      : "";
    grid.replaceChildren(...(items.length
      ? items.map(item => mediaCard(item, { "data-media-open": item.id }))
      : [element("li", { className: "admin-media-grid__empty admin-muted" },
        state.query ? "Нічого не знайдено. Змініть запит." : canEdit ? "Медіатека порожня. Завантажте перші зображення." : "Медіатека порожня.")]));
    renderPages(container.querySelector("[data-media-pages]"), page, Math.max(1, Math.ceil(total / pageSize)));
  };

  const load = async (page = state.page) => {
    state.data = await api.media.list({ query: state.query, page });
    state.page = state.data.page;
    if (!state.data.items.length && state.page > 1) return load(state.page - 1);
    render();
  };
  const reload = page => load(page).catch(failure => showToast(container, failure.message, true));

  container.querySelector("[data-media-filters]").addEventListener("submit", event => {
    event.preventDefault();
    state.query = String(new FormData(event.currentTarget).get("q") || "").trim();
    reload(1);
  });
  container.querySelector("[data-media-pages]").addEventListener("click", event => {
    const button = event.target.closest("[data-page]");
    if (button && !button.disabled) reload(Number(button.dataset.page));
  });
  grid.addEventListener("click", event => {
    const open = event.target.closest("[data-media-open]");
    if (open) openDetail(state.data.items.find(item => item.id === open.dataset.mediaOpen));
  });

  if (canEdit) bindUploads(container.querySelector("[data-media-drop]"), api, {
    onDone: count => {
      if (!count) return;
      state.query = "";
      container.querySelector("[data-media-filters] input[name=q]").value = "";
      reload(1).then(() => showToast(container, count === 1 ? "Файл завантажено." : `Завантажено файлів: ${count}.`));
    }
  });

  // Detail dialog: copy URL, edit alt, delete.
  function openDetail(item) {
    if (!item) return;
    editing = item;
    errorNode.hidden = true;
    dialog.querySelector("[data-media-dialog-kicker]").textContent = `${MEDIA_TYPES[item.mimeType] || "ФАЙЛ"} · ${formatSize(item.size)}`;
    dialog.querySelector("[data-media-dialog-title]").textContent = item.name || item.path.split("/").at(-1);
    dialog.querySelector("[data-media-preview]").replaceChildren(preview(item, "admin-media-detail__image"));
    form.elements.namedItem("url").value = item.url;
    form.elements.namedItem("alt").value = item.alt || "";
    dialog.querySelector("[data-media-facts]").replaceChildren(...facts(item));
    const deleteButton = dialog.querySelector("[data-media-delete]");
    if (deleteButton) {
      const used = usageCount(item.usage);
      deleteButton.disabled = used > 0;
      deleteButton.title = used ? "Файл використовується. Спершу замініть його там." : "";
    }
    dialog.showModal();
    dialog.querySelector("[data-media-copy]").focus();
  }

  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  const copyButton = dialog.querySelector("[data-media-copy]");
  copyButton.addEventListener("click", async () => {
    const ok = await copyText(form.elements.namedItem("url"));
    copyButton.textContent = ok ? "Скопійовано" : "Виділено: Ctrl+C";
    clearTimeout(copyButton._timer);
    copyButton._timer = setTimeout(() => { copyButton.textContent = "Копіювати"; }, 1800);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!canEdit || !editing) return;
    const submit = dialog.querySelector("[data-media-save]");
    submit.disabled = true;
    submit.textContent = "Зберігаємо…";
    errorNode.hidden = true;
    try {
      const { item } = await api.media.update(editing.id, form.elements.namedItem("alt").value.trim(), editing.updatedAt);
      state.data = { ...state.data, items: state.data.items.map(entry => entry.id === item.id ? item : entry) };
      dialog.close();
      render();
      showToast(container, "Опис збережено.");
    } catch (failure) {
      errorNode.textContent = failure.message;
      errorNode.hidden = false;
    }
    submit.disabled = false;
    submit.textContent = "Зберегти опис";
  });

  if (deleteDialog) {
    dialog.querySelector("[data-media-delete]").addEventListener("click", () => {
      if (!editing) return;
      deleteDialog.querySelector("[data-media-delete-title]").textContent = `Видалити «${editing.name || "файл"}»?`;
      deleteDialog.showModal();
    });
    deleteDialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => deleteDialog.close());
    const confirmButton = deleteDialog.querySelector("[data-media-delete-confirm]");
    confirmButton.addEventListener("click", async () => {
      if (!editing) return;
      confirmButton.disabled = true;
      confirmButton.textContent = "Видаляємо…";
      try {
        const result = await api.media.remove(editing.id);
        deleteDialog.close();
        dialog.close();
        await load();
        showToast(container, result.objectRemoved ? "Файл видалено." : "Файл прибрано з медіатеки, але сховище не підтвердило видалення.", !result.objectRemoved);
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
// Uploads (library page and picker)
// ---------------------------------------------------------------------------

export function validateMediaFile(file) {
  if (!file) return "Оберіть файл.";
  if (!MEDIA_TYPES[file.type]) return "Підходять лише зображення JPG, PNG, WebP або SVG.";
  if (!file.size) return "Файл порожній.";
  if (file.size > MEDIA_MAX_BYTES) return `Файл більший за ${formatSize(MEDIA_MAX_BYTES)}. Стисніть зображення.`;
  return "";
}

function bindUploads(zone, api, { onDone, onUploaded = () => {} }) {
  if (!zone) return;
  const input = zone.querySelector("[data-media-input]");
  const queue = zone.querySelector("[data-media-queue]");
  let busy = false;

  const run = async files => {
    if (busy || !files.length) return;
    busy = true;
    zone.classList.add("is-busy");
    input.disabled = true;
    const list = [...files].slice(0, MAX_FILES_AT_ONCE);
    queue.hidden = false;
    const rows = list.map(file => element("li", {}, element("span", {}, file.name), element("small", {}, "у черзі")));
    if (files.length > list.length) rows.push(element("li", { className: "is-error" }, element("span", {}, `Ще ${files.length - list.length}`), element("small", {}, `за раз — до ${MAX_FILES_AT_ONCE} файлів`)));
    queue.replaceChildren(...rows);
    let uploaded = 0;
    for (const [index, file] of list.entries()) {
      const status = rows[index].querySelector("small");
      const problem = validateMediaFile(file);
      if (problem) {
        rows[index].classList.add("is-error");
        status.textContent = problem;
        continue;
      }
      status.textContent = "завантаження…";
      try {
        const { width, height } = await readDimensions(file);
        const result = await api.media.upload(file, { width, height });
        rows[index].classList.add("is-done");
        status.textContent = "готово";
        uploaded += 1;
        onUploaded(result.item);
      } catch (failure) {
        rows[index].classList.add("is-error");
        status.textContent = failure.message;
      }
    }
    input.value = "";
    input.disabled = false;
    zone.classList.remove("is-busy");
    busy = false;
    if (rows.every(row => row.classList.contains("is-done"))) setTimeout(() => { if (!busy) queue.hidden = true; }, 2500);
    onDone(uploaded);
  };

  input.addEventListener("change", () => run(input.files ? [...input.files] : []));
  zone.addEventListener("dragover", event => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? "none" : "copy";
    zone.classList.add("is-dragover");
  });
  zone.addEventListener("dragleave", event => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove("is-dragover");
  });
  zone.addEventListener("drop", event => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    zone.classList.remove("is-dragover");
    run([...event.dataTransfer.files]);
  });
}

// Pixel size for raster images; SVG has no fixed size, so it is stored without one.
async function readDimensions(file) {
  if (file.type === "image/svg+xml" || typeof createImageBitmap !== "function") return { width: null, height: null };
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width || null, height: bitmap.height || null };
    bitmap.close?.();
    return size;
  } catch {
    return { width: null, height: null };
  }
}

// ---------------------------------------------------------------------------
// Picker for other editors
// ---------------------------------------------------------------------------

// Opens a modal over the current page and resolves with the chosen image URL, or null when the
// dialog is closed without a choice. Staff who may edit content can upload from the picker too.
export function openMediaPicker({ api, title = "Оберіть зображення" } = {}) {
  if (!api?.media) return Promise.reject(new Error("Медіатека недоступна."));
  return new Promise(resolve => {
    const state = { query: "", page: 1, data: null };
    let chosen = null;
    const dialog = document.createElement("dialog");
    dialog.className = "admin-dialog admin-create-dialog admin-media-picker";
    dialog.setAttribute("aria-labelledby", "media-picker-title");
    dialog.innerHTML = `
      <header><p class="admin-kicker">МЕДІАТЕКА</p><h2 id="media-picker-title"></h2></header>
      <div class="admin-media-picker__upload" data-picker-upload hidden>${dropZone("picker")}</div>
      <form class="admin-crm-filters admin-media-filters" data-picker-filters role="search">
        <label class="admin-filter-search"><span class="admin-sr-only">Пошук</span>${icon("search")}<input type="search" name="q" placeholder="Назва файлу або опис" autocomplete="off"></label>
        <div class="admin-filter-actions"><button class="admin-button admin-button--secondary" type="submit">Знайти</button></div>
      </form>
      <p class="admin-feedback admin-feedback--error" data-picker-error role="alert" hidden></p>
      <ul class="admin-media-grid admin-media-grid--picker" data-picker-grid><li class="admin-media-grid__empty admin-muted">Завантаження…</li></ul>
      <nav class="admin-pagination" aria-label="Сторінки медіатеки" data-picker-pages></nav>
      <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button></div>`;
    dialog.querySelector("#media-picker-title").textContent = title;
    document.body.append(dialog);
    const grid = dialog.querySelector("[data-picker-grid]");
    const errorNode = dialog.querySelector("[data-picker-error]");

    const render = () => {
      const { items, total, page, pageSize } = state.data;
      grid.replaceChildren(...(items.length
        ? items.map(item => mediaCard(item, { "data-picker-choose": item.id }, "Обрати"))
        : [element("li", { className: "admin-media-grid__empty admin-muted" },
          state.query ? "Нічого не знайдено." : "Медіатека порожня. Завантажте зображення.")]));
      renderPages(dialog.querySelector("[data-picker-pages]"), page, Math.max(1, Math.ceil(total / pageSize)));
    };
    const load = async (page = 1) => {
      errorNode.hidden = true;
      try {
        state.data = await api.media.list({ query: state.query, page });
        state.page = state.data.page;
        render();
        const upload = dialog.querySelector("[data-picker-upload]");
        if (state.data.canEdit && upload.hidden) {
          upload.hidden = false;
          bindUploads(upload.querySelector("[data-media-drop]"), api, { onDone: count => { if (count) { state.query = ""; dialog.querySelector("[data-picker-filters] input").value = ""; load(1); } } });
        }
      } catch (failure) {
        errorNode.textContent = failure.message;
        errorNode.hidden = false;
      }
    };

    dialog.querySelector("[data-picker-filters]").addEventListener("submit", event => {
      event.preventDefault();
      state.query = String(new FormData(event.currentTarget).get("q") || "").trim();
      load(1);
    });
    dialog.querySelector("[data-picker-pages]").addEventListener("click", event => {
      const button = event.target.closest("[data-page]");
      if (button && !button.disabled) load(Number(button.dataset.page));
    });
    grid.addEventListener("click", event => {
      const button = event.target.closest("[data-picker-choose]");
      const item = button && state.data?.items.find(entry => entry.id === button.dataset.pickerChoose);
      if (!item) return;
      chosen = item.url;
      dialog.close();
    });
    dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(chosen);
    }, { once: true });

    dialog.showModal();
    dialog.querySelector("[data-picker-filters] input").focus();
    load(1);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mediaCard(item, data, actionLabel = "") {
  const used = usageCount(item.usage);
  const dims = item.width && item.height ? `${item.width}×${item.height}` : MEDIA_TYPES[item.mimeType] || "";
  return element("li", { className: "admin-media-card" },
    element("button", { type: "button", className: "admin-media-card__button", "aria-label": `${actionLabel || "Відкрити"}: ${item.name || item.path}`, ...data },
      preview(item, "admin-media-card__image"),
      element("span", { className: "admin-media-card__name" }, item.name || item.path.split("/").at(-1)),
      element("small", { className: "admin-media-card__meta" }, [dims, formatSize(item.size)].filter(Boolean).join(" · ")),
      used ? element("span", { className: "admin-status admin-status--info admin-media-card__usage" }, `Використано: ${used}`) : null,
      item.alt ? null : element("span", { className: "admin-media-card__noalt" }, "без опису")));
}

function preview(item, className) {
  const image = element("img", { className, src: item.url, alt: item.alt || "", loading: "lazy", decoding: "async" });
  image.addEventListener("error", () => image.replaceWith(element("span", { className: `${className} is-missing`, "aria-hidden": "true" })), { once: true });
  return image;
}

function facts(item) {
  const usage = item.usage || {};
  const rows = [
    ["Тип", MEDIA_TYPES[item.mimeType] || item.mimeType],
    ["Розмір", formatSize(item.size)],
    ["Пікселі", item.width && item.height ? `${item.width} × ${item.height}` : "—"],
    ["Завантажено", `${formatDateTime(item.createdAt)}${item.uploadedBy ? ` · ${item.uploadedBy}` : ""}`],
    ["Використання", usageCount(usage)
      ? [usage.banners ? `банери: ${usage.banners}` : "", usage.products ? `товари: ${usage.products}` : "", usage.brands ? `бренди: ${usage.brands}` : ""].filter(Boolean).join(", ")
      : "ніде не використано"],
    ["Шлях", `${item.bucket}/${item.path}`]
  ];
  return rows.flatMap(([term, value]) => [element("dt", {}, term), element("dd", {}, value)]);
}

function usageCount(usage) {
  return Number(usage?.banners || 0) + Number(usage?.products || 0) + Number(usage?.brands || 0);
}

function renderPages(nav, page, pages) {
  nav.hidden = pages <= 1;
  nav.replaceChildren(
    element("button", { type: "button", "data-page": page - 1, disabled: page <= 1 }, "← Попередня"),
    element("span", {}, `Сторінка ${page} з ${pages}`),
    element("button", { type: "button", "data-page": page + 1, disabled: page >= pages }, "Наступна →"));
}

async function copyText(input) {
  try {
    await navigator.clipboard.writeText(input.value);
    return true;
  } catch {
    input.focus();
    input.select();
    return false;
  }
}

function plural(count, [one, few, many]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toLocaleString("uk-UA", { maximumFractionDigits: 1 })} МБ`;
  if (value >= 1024) return `${Math.round(value / 1024)} КБ`;
  return `${value} Б`;
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

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
