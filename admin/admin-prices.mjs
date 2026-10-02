// Prices and stock (/admin/products/import): CSV export of the current product list filters and a
// price/stock import (CSV or XLSX) with column mapping, a server-side dry run shown as a diff, and
// batched apply through admin_apply_price_updates. File parsing lives in admin-price-csv.mjs.
import { icon } from "/admin/admin-icons.mjs";
import {
  IMPORT_FIELDS, EXPORT_COLUMNS, PRICE_STATUS_LABELS, INVENTORY_LABELS, PUBLICATION_LABELS,
  toCsv, csvText, readTableFile, guessMapping, findHeaderRow, buildImportRows
} from "/admin/admin-price-csv.mjs";

export const PRICE_IMPORT_BATCH = 100;
const EXPORT_PAGE = 1000;
const EXPORT_CAP = 20000;
const MAX_ROWS = 5000;
const PREVIEW_LIMIT = 300;
const FILTER_PARAMS = ["q", "category", "brand", "publication", "inventory", "price"];
const RESULT_LABELS = Object.freeze({
  dry: { changed: "Зміниться", unchanged: "Без змін", not_found: "Не знайдено", invalid: "Помилка" },
  applied: { changed: "Оновлено", unchanged: "Без змін", not_found: "Не знайдено", invalid: "Помилка" }
});
const RESULT_TONE = Object.freeze({ changed: "success", unchanged: "", not_found: "warning", invalid: "danger" });

export function priceImportHref(search = "") {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const name of FILTER_PARAMS) if (params.get(name)) kept.set(name, params.get(name));
  return `/admin/products/import${kept.size ? `?${kept}` : ""}`;
}

export async function createPriceImportView({ api, search = location.search, signal }) {
  const references = await api.getProductReferenceData({ signal });
  const filters = parseFilters(search);
  const canImport = Boolean(references?.capabilities?.manageCore);
  const listHref = `/admin/products${priceImportHref(search).replace("/admin/products/import", "")}`;
  const html = `
    <section class="admin-crm-page admin-prices" data-prices>
      <a href="${escape(listHref)}" data-admin-link class="admin-back-link">← Усі товари</a>
      <header class="admin-page-head"><div><p class="admin-kicker">КАТАЛОГ</p><h1>Ціни та наявність</h1>
        <p>Вивантажте ціни в CSV, оновіть їх в Excel або завантажте прайс постачальника. Перед записом ви побачите кожну зміну.</p></div></header>
      <div class="admin-prices-grid">
        <section class="admin-panel admin-prices-step" aria-labelledby="prices-export-title">
          <header class="admin-panel__head"><div><p class="admin-kicker">КРОК 1 · ЕКСПОРТ</p><h2 id="prices-export-title">Вивантажити CSV</h2></div></header>
          <div class="admin-prices-step__body">
            <p class="admin-prices-label">Фільтри списку товарів</p>
            <ul class="admin-prices-chips">${filterChips(filters, references)}</ul>
            <p class="admin-panel-note">SKU, Legacy ID, назва, бренд, ціна, стара ціна, статус ціни, наявність і публікація. Роздільник «;», десяткова кома — файл відкривається в Excel без налаштувань.</p>
            <div class="admin-prices-actions">
              <button class="admin-button admin-button--secondary" type="button" data-price-export>${icon("download")}Завантажити CSV</button>
              <a href="${escape(listHref)}" data-admin-link>Змінити фільтри</a>
            </div>
          </div>
        </section>
        <section class="admin-panel admin-prices-step" aria-labelledby="prices-import-title">
          <header class="admin-panel__head"><div><p class="admin-kicker">КРОК 2 · ІМПОРТ</p><h2 id="prices-import-title">Завантажити файл</h2></div></header>
          <div class="admin-prices-step__body">
            ${canImport ? "" : `<div class="admin-feedback">Імпорт цін доступний власнику, адміністратору та менеджеру. Експорт працює для всіх.</div>`}
            <label class="admin-prices-drop${canImport ? "" : " is-disabled"}">
              <input type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-price-file ${canImport ? "" : "disabled"}>
              <strong data-price-file-name>Оберіть CSV або XLSX</strong>
              <small>CSV з «;», «,» або табуляцією (UTF-8 чи Windows-1251) або перший аркуш Excel .xlsx. До ${formatNumber(MAX_ROWS)} рядків.</small>
            </label>
            <p class="admin-panel-note">Порожня клітинка ціни, статусу чи наявності — значення не змінюється. Порожня стара ціна прибирає знижку.</p>
            <form class="admin-prices-mapping" data-price-mapping hidden novalidate>
              <p class="admin-prices-meta" data-price-meta></p>
              <div class="admin-form-grid">
                <label class="admin-field"><span>Зіставляти за</span><select name="matchBy"><option value="sku">SKU</option><option value="legacy_id">Legacy ID</option></select></label>
                <label class="admin-field"><span>Рядок заголовків</span><input name="headerRow" type="number" min="1" step="1" inputmode="numeric"></label>
                <label class="admin-field"><span data-key-label>Колонка SKU</span><select name="key" required></select></label>
                ${IMPORT_FIELDS.filter(field => !field.key).map(field => `<label class="admin-field"><span>${escape(field.label)}</span><select name="${field.id}"></select></label>`).join("")}
              </div>
              <div class="admin-prices-actions">
                <button class="admin-button admin-button--primary" type="submit" data-price-check>Перевірити зміни</button>
                <span class="admin-muted" data-price-check-state></span>
              </div>
            </form>
          </div>
        </section>
      </div>
      <section class="admin-panel admin-prices-preview" data-price-preview hidden aria-live="polite"></section>
      <dialog class="admin-dialog" data-price-confirm><h2>Застосувати зміни цін?</h2><p data-price-confirm-text></p>
        <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--primary" type="button" data-price-confirm-apply>Застосувати</button></div></dialog>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => bindPrices(container, { api, filters, canImport, listHref }) };
}

function parseFilters(search) {
  const params = new URLSearchParams(search);
  return Object.freeze({
    query: params.get("q")?.trim() || "", categoryId: params.get("category") || "", brandId: params.get("brand") || "",
    publication: params.get("publication") || "", inventory: params.get("inventory") || "", price: params.get("price") || ""
  });
}

function filterChips(filters, references) {
  const chips = [];
  if (filters.query) chips.push(["Пошук", filters.query]);
  if (filters.brandId) chips.push(["Бренд", references.brands?.find(item => item.id === filters.brandId)?.name || filters.brandId]);
  if (filters.categoryId) chips.push(["Категорія", references.categories?.find(item => item.id === filters.categoryId)?.path || filters.categoryId]);
  if (filters.publication) chips.push(["Публікація", PUBLICATION_LABELS[filters.publication] || filters.publication]);
  if (filters.inventory) chips.push(["Наявність", INVENTORY_LABELS[filters.inventory] || filters.inventory]);
  if (filters.price) chips.push(["Ціна", PRICE_STATUS_LABELS[filters.price] || filters.price]);
  if (!chips.length) return `<li>Усі товари каталогу</li>`;
  return chips.map(([label, value]) => `<li><span>${escape(label)}</span>${escape(value)}</li>`).join("");
}

function bindPrices(container, context) {
  const root = container.querySelector("[data-prices]");
  if (!root) return;
  bindExport(root, context);
  if (!context.canImport) return;

  const fileInput = root.querySelector("[data-price-file]");
  const fileName = root.querySelector("[data-price-file-name]");
  const form = root.querySelector("[data-price-mapping]");
  const meta = root.querySelector("[data-price-meta]");
  const checkState = root.querySelector("[data-price-check-state]");
  const preview = root.querySelector("[data-price-preview]");
  const dialog = root.querySelector("[data-price-confirm]");
  const state = { file: null, table: [], format: "", delimiter: null, results: [], changedRows: [], matchBy: "sku", tab: "changes", applied: false, busy: false };

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    preview.hidden = true;
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error("Файл більший за 15 МБ.");
      const parsed = await readTableFile(file.name, await file.arrayBuffer());
      const nonEmpty = parsed.rows.filter(row => row.some(cell => cell !== "")).length;
      if (nonEmpty < 2) throw new Error("У файлі немає рядків із даними.");
      if (nonEmpty - 1 > MAX_ROWS) throw new Error(`У файлі ${formatNumber(nonEmpty - 1)} рядків. Розбийте його на частини до ${formatNumber(MAX_ROWS)}.`);
      Object.assign(state, { file, table: parsed.rows, format: parsed.format, delimiter: parsed.delimiter, results: [], applied: false });
      fileName.textContent = file.name;
      const headerIndex = findHeaderRow(parsed.rows);
      form.elements.headerRow.value = String(headerIndex + 1);
      fillMapping(headerIndex, true);
      meta.textContent = `${parsed.format === "xlsx" ? "Excel, перший аркуш" : `CSV, роздільник ${delimiterName(parsed.delimiter)}`} · ${formatNumber(nonEmpty - 1)} рядків із даними`;
      form.hidden = false;
      checkState.textContent = "";
    } catch (error) {
      form.hidden = true;
      fileName.textContent = "Оберіть CSV або XLSX";
      fileInput.value = "";
      showToast(root, error.message || "Не вдалося прочитати файл.", true);
    }
  });

  function fillMapping(headerIndex, guess) {
    const headers = state.table[headerIndex] || [];
    const width = Math.max(headers.length, ...state.table.slice(headerIndex, headerIndex + 20).map(row => row.length));
    const columns = Array.from({ length: width }, (_, index) => [index, `${columnLetter(index)} · ${headers[index] || "без назви"}`]);
    const mapping = guess ? guessMapping(headers) : null;
    if (guess) form.elements.matchBy.value = mapping.sku === undefined && mapping.legacyId !== undefined ? "legacy_id" : "sku";
    const keyField = form.elements.matchBy.value === "sku" ? "sku" : "legacyId";
    root.querySelector("[data-key-label]").textContent = form.elements.matchBy.value === "sku" ? "Колонка SKU" : "Колонка Legacy ID";
    const fill = (select, selected, emptyLabel) => {
      const current = guess ? selected : select.value;
      select.replaceChildren(...(emptyLabel ? [new Option(emptyLabel, "")] : []), ...columns.map(([value, label]) => new Option(label, String(value))));
      select.value = current === undefined || current === null ? "" : String(current);
      if (!emptyLabel && select.value === "" && columns.length) select.value = "0";
    };
    fill(form.elements.key, mapping ? mapping[keyField] : undefined, null);
    for (const field of IMPORT_FIELDS.filter(item => !item.key)) fill(form.elements[field.id], mapping?.[field.id], "— не оновлювати —");
  }

  form.elements.matchBy.addEventListener("change", () => {
    const headerIndex = Math.max(0, Number(form.elements.headerRow.value) - 1);
    const mapping = guessMapping(state.table[headerIndex] || []);
    fillMapping(headerIndex, false);
    const guessed = mapping[form.elements.matchBy.value === "sku" ? "sku" : "legacyId"];
    if (guessed !== undefined) form.elements.key.value = String(guessed);
  });
  form.elements.headerRow.addEventListener("change", () => {
    const value = Math.min(Math.max(1, Math.round(Number(form.elements.headerRow.value)) || 1), state.table.length);
    form.elements.headerRow.value = String(value);
    fillMapping(value - 1, true);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;
    const mapping = readMapping();
    if (![mapping.price, mapping.oldPrice, mapping.priceStatus, mapping.inventoryStatus].some(value => value !== undefined)) {
      return showToast(root, "Оберіть хоча б одну колонку для оновлення: ціну, стару ціну, статус ціни або наявність.", true);
    }
    const headerIndex = Math.max(0, Number(form.elements.headerRow.value) - 1);
    const { rows, problems } = buildImportRows(state.table, headerIndex, mapping, form.elements.matchBy.value);
    if (!rows.length && !problems.length) return showToast(root, "Під рядком заголовків немає даних.", true);
    state.matchBy = form.elements.matchBy.value;
    setBusy(true, "Перевіряємо…");
    try {
      const serverRows = [];
      for (let start = 0; start < rows.length; start += PRICE_IMPORT_BATCH) {
        checkState.textContent = `Перевірено ${formatNumber(start)} з ${formatNumber(rows.length)}`;
        const result = await context.api.prices.apply({ matchBy: state.matchBy, dryRun: true, rows: rows.slice(start, start + PRICE_IMPORT_BATCH) });
        serverRows.push(...result.rows);
      }
      state.results = [...serverRows, ...problems].sort((a, b) => a.line - b.line);
      const changedLines = new Set(serverRows.filter(result => result.status === "changed").map(result => result.line));
      state.changedRows = rows.filter(row => changedLines.has(row.line));
      state.applied = false;
      state.tab = state.changedRows.length ? "changes" : "problems";
      checkState.textContent = "";
      renderPreview();
      preview.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      checkState.textContent = "";
      showToast(root, error.message, true);
    } finally {
      setBusy(false);
    }
  });

  function readMapping() {
    const mapping = { key: Number(form.elements.key.value) };
    for (const field of IMPORT_FIELDS.filter(item => !item.key)) {
      const value = form.elements[field.id].value;
      if (value !== "") mapping[field.id] = Number(value);
    }
    return mapping;
  }

  function setBusy(busy, label = "") {
    state.busy = busy;
    const button = form.querySelector("[data-price-check]");
    button.disabled = busy;
    button.textContent = busy ? label : "Перевірити зміни";
    fileInput.disabled = busy;
  }

  function counts() {
    const total = { changed: 0, unchanged: 0, not_found: 0, invalid: 0 };
    for (const row of state.results) total[row.status] = (total[row.status] || 0) + 1;
    return total;
  }

  function renderPreview() {
    const total = counts();
    const labels = state.applied ? RESULT_LABELS.applied : RESULT_LABELS.dry;
    const problemsCount = total.not_found + total.invalid;
    const visible = state.results.filter(row => state.tab === "all" ? true
      : state.tab === "changes" ? row.status === "changed" : ["not_found", "invalid"].includes(row.status));
    const shown = visible.slice(0, PREVIEW_LIMIT);
    preview.innerHTML = `
      <header class="admin-panel__head"><div><p class="admin-kicker">${state.applied ? "ГОТОВО" : "КРОК 3 · ПЕРЕВІРКА"}</p>
        <h2>${state.applied ? "Зміни застосовано" : "Що зміниться"}</h2></div>
        <span class="admin-muted">${escape(state.file?.name || "")}</span></header>
      <dl class="admin-prices-summary">
        <div class="is-changed"><dt>${state.applied ? "Оновлено" : "Зміниться"}</dt><dd>${formatNumber(total.changed)}</dd></div>
        <div><dt>Без змін</dt><dd>${formatNumber(total.unchanged)}</dd></div>
        <div class="${total.not_found ? "is-warning" : ""}"><dt>Не знайдено</dt><dd>${formatNumber(total.not_found)}</dd></div>
        <div class="${total.invalid ? "is-danger" : ""}"><dt>Помилки</dt><dd>${formatNumber(total.invalid)}</dd></div>
      </dl>
      <div class="admin-prices-tabs" role="tablist" aria-label="Рядки перевірки">
        ${tabButton("changes", `${state.applied ? "Оновлено" : "Зміни"} · ${formatNumber(total.changed)}`)}
        ${tabButton("problems", `Проблеми · ${formatNumber(problemsCount)}`)}
        ${tabButton("all", `Усі рядки · ${formatNumber(state.results.length)}`)}
      </div>
      ${shown.length ? `<div class="admin-products-table-wrap admin-prices-table-wrap"><table class="admin-crm-table admin-prices-table admin-prices-table--cards">
        <thead><tr><th>Рядок</th><th>Товар</th><th>Ціна</th><th>Стара ціна</th><th>Статус ціни</th><th>Наявність</th><th>Результат</th></tr></thead>
        <tbody>${shown.map(row => resultRow(row, labels)).join("")}</tbody></table></div>`
        : `<p class="admin-prices-empty">${state.tab === "changes" ? "Жодна ціна чи наявність не зміниться." : state.tab === "problems" ? "Проблемних рядків немає." : "Рядків немає."}</p>`}
      ${visible.length > shown.length ? `<p class="admin-panel-note admin-prices-note">Показано перші ${formatNumber(shown.length)} з ${formatNumber(visible.length)}. Повний список — у звіті CSV.</p>` : ""}
      <div class="admin-prices-progress" data-price-progress hidden><span><i style="--progress:0%"></i></span><small data-price-progress-text></small></div>
      <footer class="admin-prices-footer">
        <button class="admin-button admin-button--ghost" type="button" data-price-report ${state.results.length ? "" : "disabled"}>${icon("download")}Звіт CSV</button>
        ${state.applied
          ? `<a class="admin-button admin-button--secondary" href="${escape(context.listHref)}" data-admin-link>До списку товарів</a>
             <button class="admin-button admin-button--primary" type="button" data-price-restart>Новий імпорт</button>`
          : `<button class="admin-button admin-button--primary" type="button" data-price-apply ${state.changedRows.length ? "" : "disabled"}>Застосувати ${formatNumber(state.changedRows.length)} змін</button>`}
      </footer>`;
    preview.hidden = false;
    preview.querySelectorAll("[data-price-tab]").forEach(button => button.addEventListener("click", () => { state.tab = button.dataset.priceTab; renderPreview(); }));
    preview.querySelector("[data-price-report]")?.addEventListener("click", downloadReport);
    preview.querySelector("[data-price-apply]")?.addEventListener("click", openConfirm);
    preview.querySelector("[data-price-restart]")?.addEventListener("click", () => {
      Object.assign(state, { results: [], changedRows: [], applied: false });
      preview.hidden = true; form.hidden = true; fileInput.value = ""; fileName.textContent = "Оберіть CSV або XLSX";
      root.querySelector(".admin-prices-drop")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function tabButton(id, label) {
    return `<button type="button" role="tab" data-price-tab="${id}" aria-selected="${state.tab === id}">${escape(label)}</button>`;
  }

  function openConfirm() {
    dialog.querySelector("[data-price-confirm-text]").textContent =
      `Буде оновлено ${formatNumber(state.changedRows.length)} товарів. Нові ціни й наявність одразу з’являться на сайті; кожна зміна записується в історію товару.`;
    dialog.showModal();
  }
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-price-confirm-apply]").addEventListener("click", async () => {
    dialog.close();
    await applyChanges();
  });

  async function applyChanges() {
    if (state.busy || !state.changedRows.length) return;
    const applyButton = preview.querySelector("[data-price-apply]");
    const progress = preview.querySelector("[data-price-progress]");
    const bar = progress.querySelector("i");
    const text = progress.querySelector("[data-price-progress-text]");
    const runId = crypto.randomUUID();
    const rows = state.changedRows;
    const applied = new Map();
    state.busy = true;
    applyButton.disabled = true;
    applyButton.textContent = "Застосовуємо…";
    progress.hidden = false;
    let failure = null;
    for (let start = 0; start < rows.length; start += PRICE_IMPORT_BATCH) {
      text.textContent = `Застосовано ${formatNumber(start)} з ${formatNumber(rows.length)}`;
      bar.style.setProperty("--progress", `${Math.round((start / rows.length) * 100)}%`);
      try {
        const result = await context.api.prices.apply({
          matchBy: state.matchBy, dryRun: false, runId, fileName: state.file?.name || "", rows: rows.slice(start, start + PRICE_IMPORT_BATCH)
        });
        for (const row of result.rows) applied.set(row.line, row);
      } catch (error) {
        failure = { error, done: start };
        break;
      }
    }
    state.busy = false;
    // Rows the server applied replace their preview; rows of a failed batch keep "will change" and are reported.
    state.results = state.results.map(row => applied.get(row.line) || (row.status === "changed" && failure
      ? { ...row, status: "invalid", message: `Не застосовано: ${failure.error.message}` } : row));
    state.changedRows = [];
    state.applied = true;
    state.tab = failure ? "problems" : "changes";
    renderPreview();
    const changed = [...applied.values()].filter(row => row.status === "changed").length;
    showToast(root, failure
      ? `Оновлено ${formatNumber(changed)}; решту не застосовано: ${failure.error.message}`
      : `Оновлено ${formatNumber(changed)} товарів. Сайт уже показує нові ціни.`, Boolean(failure));
  }

  function downloadReport() {
    const labels = state.applied ? RESULT_LABELS.applied : RESULT_LABELS.dry;
    const columns = [
      ["Рядок", row => row.line],
      [state.matchBy === "sku" ? "SKU у файлі" : "Legacy ID у файлі", row => csvText(row.key)],
      ["Legacy ID", row => csvText(row.legacyId || "")],
      ["Назва", row => row.title || ""],
      ["Результат", row => labels[row.status] || row.status],
      ["Було: ціна", row => amountCsv(row.before, "amount")],
      ["Стане: ціна", row => amountCsv(row.after, "amount")],
      ["Було: стара ціна", row => amountCsv(row.before, "oldAmount")],
      ["Стане: стара ціна", row => amountCsv(row.after, "oldAmount")],
      ["Було: наявність", row => INVENTORY_LABELS[row.before?.inventoryStatus] || ""],
      ["Стане: наявність", row => INVENTORY_LABELS[row.after?.inventoryStatus] || ""],
      ["Повідомлення", row => row.message || ""]
    ];
    downloadCsv(`tsiny-zvit-${today()}.csv`, toCsv(columns, state.results));
  }
}

function bindExport(root, { api, filters }) {
  const button = root.querySelector("[data-price-export]");
  button?.addEventListener("click", async () => {
    const label = button.innerHTML;
    button.disabled = true;
    button.textContent = "Готуємо файл…";
    try {
      const rows = [];
      let total = 0;
      for (let page = 1; ; page += 1) {
        const result = await api.prices.exportProducts(filters, page, EXPORT_PAGE);
        total = result.total;
        rows.push(...result.rows);
        if (!result.rows.length || rows.length >= total || rows.length >= EXPORT_CAP) break;
      }
      const exported = rows.slice(0, EXPORT_CAP);
      downloadCsv(`tsiny-${today()}.csv`, toCsv(EXPORT_COLUMNS, exported));
      showToast(root, total > exported.length
        ? `Експортовано перші ${formatNumber(exported.length)} з ${formatNumber(total)}. Звузьте фільтр, щоб отримати решту.`
        : `Файл готово: ${formatNumber(exported.length)} товарів.`);
    } catch (error) {
      showToast(root, error.message, true);
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  });
}

function resultRow(row, labels) {
  const before = row.before || {};
  const after = row.after || before;
  const missing = !row.before;
  const note = row.sku ? `SKU ${escape(row.sku)}` : row.status === "not_found" ? "Немає в каталозі" : "Рядок не перевірено";
  return `<tr class="admin-prices-row is-${escape(row.status)}">
    <td class="admin-crm-num" data-label="Рядок">${formatNumber(row.line)}</td>
    <td data-label="Товар">${row.title ? `<a href="/admin/products/${encodeURIComponent(row.legacyId)}" data-admin-link><strong>${escape(row.title)}</strong></a>` : `<strong>${escape(row.key || "—")}</strong>`}
      <small>${note}</small></td>
    <td class="admin-crm-num" data-label="Ціна">${missing ? "—" : diff(priceText(before), priceText(after))}</td>
    <td class="admin-crm-num" data-label="Стара ціна">${missing ? "—" : diff(amountText(before.oldAmount), amountText(after.oldAmount))}</td>
    <td data-label="Статус ціни">${missing ? "—" : diff(PRICE_STATUS_LABELS[before.priceStatus], PRICE_STATUS_LABELS[after.priceStatus])}</td>
    <td data-label="Наявність">${missing ? "—" : diff(INVENTORY_LABELS[before.inventoryStatus], INVENTORY_LABELS[after.inventoryStatus])}</td>
    <td data-label="Результат"><span class="admin-status${RESULT_TONE[row.status] ? ` admin-status--${RESULT_TONE[row.status]}` : ""}">${escape(labels[row.status] || row.status)}</span>
      ${row.message ? `<small>${escape(row.message)}</small>` : ""}</td>
  </tr>`;
}

function diff(before, after) {
  const from = before ?? "—";
  const to = after ?? "—";
  return from === to ? `<span class="admin-prices-same">${escape(to)}</span>` : `<span class="admin-prices-diff"><s>${escape(from)}</s><span aria-hidden="true">→</span><strong>${escape(to)}</strong></span>`;
}

function priceText(state) {
  if (state.priceStatus === "known") return amountText(state.amount);
  return state.priceStatus === "on_request" ? "За запитом" : "—";
}

function amountText(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  const digits = Number.isInteger(number) ? 0 : 2;
  return new Intl.NumberFormat("uk-UA", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
}

function amountCsv(state, field) {
  const value = state?.[field];
  return value === null || value === undefined ? "" : Number(value).toFixed(2).replace(".", ",");
}

function columnLetter(index) {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}

function delimiterName(delimiter) {
  return delimiter === "\t" ? "табуляція" : `«${delimiter}»`;
}

function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function showToast(root, message, error = false) {
  const toast = root.querySelector(".admin-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.hidden = true; }, 6000);
}

function formatNumber(value) {
  return new Intl.NumberFormat("uk-UA").format(Number(value) || 0);
}

function escape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
