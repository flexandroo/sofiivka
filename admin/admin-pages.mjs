import { icon } from "/admin/admin-icons.mjs";

// Information pages («Сторінки»): first screen, article text as blocks, SEO, and the FAQ list.
// The storefront (page-shell.js + site-pages.js) renders its built-in copy first and then applies
// what is saved here through get_site_page / get_site_faq. Text is stored as blocks, never HTML.
// Pages that are mostly layout (cards, grids, forms) expose only the first screen and SEO.

const BLOCK_TYPES = Object.freeze({
  heading: { label: "Підзаголовок", add: "Підзаголовок" },
  paragraph: { label: "Абзац", add: "Абзац" },
  list: { label: "Список", add: "Список" }
});
const STATE = Object.freeze({
  custom: { label: "Текст з адмінки", tone: "success" },
  builtin: { label: "Вбудований текст", tone: "warning" }
});
const FIELD_LABELS = Object.freeze({
  kicker: "Надзаголовок", title: "Заголовок", lead: "Вступ", body: "Текст сторінки",
  seo_title: "SEO-заголовок", seo_description: "SEO-опис", published: "Показ на сайті", items: "Запитання"
});
const LIMITS = Object.freeze({ kicker: 80, title: 200, lead: 600, seoTitle: 160, seoDescription: 320, heading: 200, paragraph: 4000, item: 1000, blocks: 80, faq: 100 });
const EDITOR_ROLES_NOTE = "Редагувати сторінки можуть власник, адміністратор і контент-менеджер.";

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export async function createPagesListView({ api, signal }) {
  const result = await api.pages.list({ signal });
  const rows = result.pages.map(page => `
    <tr>
      <td><a class="admin-crm-id" href="/admin/pages/${encodeURIComponent(page.slug)}" data-admin-link>${escape(page.navTitle)}</a>
        <small>/${escape(page.slug)}.html</small></td>
      <td>${escape(scopeLabel(page, result.faq))}</td>
      <td>${statusBadge(page.published ? "custom" : "builtin")}</td>
      <td>${formatDateTime(page.updatedAt)}${page.updatedBy ? `<small>${escape(page.updatedBy)}</small>` : ""}</td>
    </tr>`).join("");
  const html = `
    <section class="admin-crm-page admin-pages">
      <header class="admin-page-head"><div><p class="admin-kicker">САЙТ</p><h1>Сторінки</h1>
        <p>${escape(`Тексти інформаційних сторінок і часті запитання. Каталог, картки товарів, кошик, оформлення замовлення й контакти зібрані з даних і налаштувань, тому їх тут немає.${result.canEdit ? "" : " Ваша роль може лише переглядати."}`)}</p></div></header>
      <div class="admin-products-table-wrap"><table class="admin-crm-table admin-crm-table--pages"><thead><tr>${["Сторінка", "Що редагується", "На сайті", "Оновлено"].map(text => `<th scope="col">${text}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
  return { html, bind() {} };
}

function scopeLabel(page, faq) {
  if (page.slug === "faq") return `Перший екран, SEO і запитання (на сайті ${number(faq?.active)} з ${number(faq?.total)})`;
  return page.hasBody ? `Перший екран, текст (${number(page.blockCount)} блоків) і SEO` : "Перший екран і SEO";
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
export async function createPageEditorView({ api, slug, signal }) {
  const detail = await api.pages.get(slug, { signal });
  if (!detail?.page) {
    return {
      html: `<section class="admin-state-panel" role="alert">${icon("warning")}<div><p class="admin-kicker">404</p><h1>Сторінку не знайдено</h1><p>Можливо, посилання застаріло.</p></div><a class="admin-button admin-button--secondary" href="/admin/pages" data-admin-link>До сторінок</a></section>`,
      bind() {}
    };
  }
  const { page, canEdit } = detail;
  const isFaq = page.slug === "faq";
  const html = `
    <section class="admin-crm-detail admin-pages" data-page-editor>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/pages" data-admin-link class="admin-back-link">← Усі сторінки</a>
          <p class="admin-kicker">СТОРІНКА · /${escape(page.slug)}.html</p>
          <h1>${escape(page.navTitle)}</h1>
          <div class="admin-editor-meta"><span data-page-state>${statusBadge(page.published ? "custom" : "builtin")}</span><span data-page-updated>${escape(updatedLabel(page))}</span>
            <a href="/${escape(page.slug)}.html" target="_blank" rel="noopener">Відкрити на сайті ${icon("external")}</a></div>
        </div>
      </header>
      <div class="admin-crm-layout">
        <div class="admin-crm-main">
          <form class="admin-crm-main" data-page-form novalidate>
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ПЕРШИЙ ЕКРАН</p><h2>Заголовок і вступ</h2></div></header>
              <div class="admin-form-grid">
                ${textField("kicker", "Надзаголовок", page.kicker, LIMITS.kicker, { hint: "Короткий рядок над заголовком." })}
                ${textField("title", "Заголовок", page.title, LIMITS.title, { required: true, hint: "Також стоїть у хлібних крихтах." })}
                ${textArea("lead", "Вступ", page.lead, LIMITS.lead, { full: true, rows: 3 })}
              </div>
            </section>
            ${page.hasBody ? `
            <section class="admin-panel admin-pages-body">
              <header class="admin-panel__head"><div><p class="admin-kicker">ТЕКСТ СТОРІНКИ</p><h2>Блоки тексту</h2></div></header>
              <p class="admin-panel-note">Текст у білій колонці сторінки. Картки над ним і бокова панель з кнопками залишаються такими, як у макеті. Посилання: <code>[текст](/delivery.html)</code> або <code>[текст](https://…)</code>.</p>
              <ol class="admin-pages-blocks" data-blocks></ol>
              ${canEdit ? `<div class="admin-pages-add" data-block-add>${Object.entries(BLOCK_TYPES).map(([type, item]) =>
                `<button class="admin-button admin-button--secondary" type="button" data-add-block="${type}">${icon("plus")}${escape(item.add)}</button>`).join("")}</div>` : ""}
            </section>` : `
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ВМІСТ</p><h2>${isFaq ? "Запитання нижче" : "Решта сторінки — макет"}</h2></div></header>
              <p class="admin-panel-note">${escape(isFaq
                ? "Список запитань редагується окремо, у блоці «Часті запитання» нижче, і зберігається своєю кнопкою."
                : "Під першим екраном тут картки, сітки з посиланнями або зображеннями. Вони пов’язані з іншими сторінками й змінюються разом із кодом сайту, тож тут редагуються лише перший екран і SEO.")}</p>
            </section>`}
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ПОШУК</p><h2>SEO</h2></div></header>
              <div class="admin-form-grid">
                ${textField("seoTitle", "Заголовок вкладки й пошуку (title)", page.seo?.title, LIMITS.seoTitle, { full: true, counter: 60 })}
                ${textArea("seoDescription", "Опис для пошуку (meta description)", page.seo?.description, LIMITS.seoDescription, { full: true, rows: 3, counter: 160 })}
              </div>
              <p class="admin-panel-note">Порожнє поле: сайт залишає вбудований варіант. Пошуковики зазвичай показують до 60 символів заголовка й до 160 символів опису.</p>
            </section>
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ПОКАЗ</p><h2>Що бачать покупці</h2></div></header>
              <label class="admin-field admin-settings-check"><input type="checkbox" name="published" ${page.published ? "checked" : ""}><span>Показувати на сайті текст з адмінки</span></label>
              <p class="admin-panel-note">Вимкнено: сайт показує вбудований текст сторінки${isFaq ? " і вбудовані запитання" : ""}. Зручно, щоб підготувати зміни заздалегідь.</p>
            </section>
            ${canEdit ? `<footer class="admin-panel admin-crm-form-actions admin-pages-actions"><small data-dirty-note></small><button class="admin-button admin-button--primary" type="submit">Зберегти сторінку</button></footer>`
              : `<p class="admin-panel-note">${EDITOR_ROLES_NOTE}</p>`}
          </form>
          ${isFaq ? faqPanel(canEdit) : ""}
        </div>
        <aside class="admin-crm-side">
          <section class="admin-panel admin-pages-help">
            <header class="admin-panel__head"><div><p class="admin-kicker">ПІДКАЗКА</p><h2>Як писати</h2></div></header>
            <ul>
              <li>Підзаголовок відкриває новий розділ тексту.</li>
              <li>У списку кожен пункт пишіть з нового рядка.</li>
              <li>Посилання: <code>[текст](/payment.html)</code>, <code>[текст](https://…)</code>, <code>[пошта](mailto:…)</code>.</li>
              <li>HTML-теги не працюють: сайт показує їх як звичайний текст.</li>
              <li>Сайт покаже зміни після оновлення сторінки.</li>
            </ul>
          </section>
          <section class="admin-panel admin-crm-timeline">
            <header class="admin-panel__head"><div><p class="admin-kicker">ІСТОРІЯ</p><h2>Зміни сторінки</h2></div></header>
            <ol data-page-history></ol>
          </section>
          ${isFaq ? `<section class="admin-panel admin-crm-timeline">
            <header class="admin-panel__head"><div><p class="admin-kicker">ІСТОРІЯ</p><h2>Зміни запитань</h2></div></header>
            <ol data-faq-history></ol>
          </section>` : ""}
        </aside>
      </div>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => bindEditor(container, api, detail) };
}

function faqPanel(canEdit) {
  return `
    <section class="admin-panel admin-pages-faq" data-faq-panel>
      <header class="admin-panel__head"><div><p class="admin-kicker">ЧАСТІ ЗАПИТАННЯ</p><h2>Запитання й відповіді</h2></div>
        ${canEdit ? `<div class="admin-collection-items__save"><button class="admin-button admin-button--ghost" type="button" data-faq-reset hidden>Скасувати</button><button class="admin-button admin-button--primary" type="button" data-faq-save disabled>Зберегти запитання</button></div>` : ""}</header>
      <p class="admin-panel-note">Запитання з однаковим розділом стоять на сайті разом, розділи йдуть у порядку першого запитання. Приховане запитання лишається тут, але на сайті не показується.</p>
      <p class="admin-collection-items__summary" data-faq-summary></p>
      <ol class="admin-pages-faq__list" data-faq-list></ol>
      <datalist id="admin-faq-groups" data-faq-groups></datalist>
      ${canEdit ? `<button class="admin-button admin-button--secondary" type="button" data-faq-add>${icon("plus")}Додати запитання</button>` : ""}
    </section>`;
}

let keySequence = 0;
const nextKey = () => `k${++keySequence}`;

function bindEditor(container, api, detail) {
  const { canEdit } = detail;
  const state = {
    page: detail.page,
    blocks: toBlockState(detail.page.body),
    initial: null
  };
  const form = container.querySelector("[data-page-form]");
  const blocksList = container.querySelector("[data-blocks]");
  const saveButton = form.querySelector('[type="submit"]');
  const dirtyNote = form.querySelector("[data-dirty-note]");

  const payload = () => {
    const data = new FormData(form);
    const value = name => String(data.get(name) ?? "").trim();
    const result = {
      kicker: value("kicker"), title: value("title"), lead: value("lead"),
      seoTitle: value("seoTitle"), seoDescription: value("seoDescription"),
      published: form.querySelector('[name="published"]').checked
    };
    if (state.page.hasBody) result.body = state.blocks.map(fromBlockState);
    return result;
  };
  const markDirty = () => {
    if (!saveButton) return;
    const dirty = JSON.stringify(payload()) !== state.initial;
    saveButton.disabled = !dirty;
    dirtyNote.textContent = dirty ? "Є незбережені зміни." : "";
  };

  const renderBlocks = () => {
    if (!blocksList) return;
    blocksList.replaceChildren(...(state.blocks.length
      ? state.blocks.map((block, index) => blockEditor(block, index, state.blocks.length, canEdit))
      : [element("li", { className: "admin-muted admin-pages-blocks__empty" }, "Блоків немає: сайт залишить вбудований текст сторінки.")]));
    container.querySelectorAll("[data-add-block]").forEach(button => { button.disabled = state.blocks.length >= LIMITS.blocks; });
    markDirty();
  };

  blocksList?.addEventListener("input", event => {
    const holder = event.target.closest("[data-block]");
    const block = state.blocks.find(item => item.key === holder?.dataset.block);
    if (!block) return;
    if (event.target.name === "text") block.text = event.target.value;
    if (event.target.name === "items") block.items = event.target.value;
    if (event.target.name === "ordered") block.ordered = event.target.checked;
    markDirty();
  });
  blocksList?.addEventListener("change", event => {
    if (event.target.name !== "ordered") return;
    const block = state.blocks.find(item => item.key === event.target.closest("[data-block]")?.dataset.block);
    if (block) { block.ordered = event.target.checked; markDirty(); }
  });
  blocksList?.addEventListener("click", event => {
    const button = event.target.closest("[data-block-move], [data-block-remove]");
    if (!button) return;
    const index = state.blocks.findIndex(item => item.key === button.closest("[data-block]")?.dataset.block);
    if (index < 0) return;
    if (button.dataset.blockRemove !== undefined) state.blocks.splice(index, 1);
    else {
      const next = index + Number(button.dataset.blockMove);
      if (next < 0 || next >= state.blocks.length) return;
      [state.blocks[index], state.blocks[next]] = [state.blocks[next], state.blocks[index]];
    }
    renderBlocks();
    const focusKey = state.blocks[Math.min(index, state.blocks.length - 1)]?.key;
    blocksList.querySelector(`[data-block="${focusKey}"] textarea, [data-block="${focusKey}"] input[name="text"]`)?.focus({ preventScroll: true });
  });
  container.querySelector("[data-block-add]")?.addEventListener("click", event => {
    const button = event.target.closest("[data-add-block]");
    if (!button || state.blocks.length >= LIMITS.blocks) return;
    const block = { key: nextKey(), type: button.dataset.addBlock, text: "", items: "", ordered: false };
    state.blocks.push(block);
    renderBlocks();
    blocksList.querySelector(`[data-block="${block.key}"] textarea, [data-block="${block.key}"] input[name="text"]`)?.focus();
  });

  const counters = () => form.querySelectorAll("[data-counter]").forEach(counter => {
    const input = form.querySelector(`[name="${counter.dataset.counter}"]`);
    const length = input.value.trim().length;
    counter.textContent = `${length} символів${length > Number(counter.dataset.recommended) ? ` · рекомендовано до ${counter.dataset.recommended}` : ""}`;
    counter.classList.toggle("is-over", length > Number(counter.dataset.recommended));
  });
  form.addEventListener("input", () => { counters(); markDirty(); });
  form.addEventListener("change", markDirty);
  counters();

  const renderHistory = () => renderHistoryList(container.querySelector("[data-page-history]"), state.page.history || detail.history);

  if (!canEdit) {
    form.querySelectorAll("input, select, textarea, button").forEach(control => { control.disabled = true; });
  } else {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const titleInput = form.querySelector('[name="title"]');
      if (!titleInput.value.trim()) { titleInput.setCustomValidity("Заголовок обов’язковий."); titleInput.reportValidity(); titleInput.setCustomValidity(""); return; }
      saveButton.disabled = true;
      saveButton.textContent = "Зберігаємо…";
      try {
        const saved = await api.pages.save(state.page.slug, payload(), state.page.updatedAt);
        state.page = { ...saved.page, history: saved.history };
        state.blocks = toBlockState(saved.page.body);
        resetForm(form, saved.page);
        state.initial = JSON.stringify(payload());
        container.querySelector("[data-page-updated]").textContent = updatedLabel(saved.page);
        container.querySelector("[data-page-state]").replaceChildren(statusNode(saved.page.published ? "custom" : "builtin"));
        renderHistory();
        showToast(container, "Збережено. Сайт покаже зміни після оновлення сторінки.");
      } catch (failure) {
        showToast(container, failure.message, true);
      }
      saveButton.textContent = "Зберегти сторінку";
      counters();
      renderBlocks();
      markDirty();
    });
  }

  renderBlocks();
  state.initial = JSON.stringify(payload());
  markDirty();
  renderHistory();
  if (detail.faq) bindFaq(container, api, detail.faq, canEdit);
}

function resetForm(form, page) {
  const set = (name, value) => { const input = form.querySelector(`[name="${name}"]`); if (input) input.value = value ?? ""; };
  set("kicker", page.kicker);
  set("title", page.title);
  set("lead", page.lead);
  set("seoTitle", page.seo?.title);
  set("seoDescription", page.seo?.description);
  form.querySelector('[name="published"]').checked = Boolean(page.published);
}

function toBlockState(body) {
  return (Array.isArray(body) ? body : []).map(block => ({
    key: nextKey(),
    type: BLOCK_TYPES[block.type] ? block.type : "paragraph",
    text: block.text || "",
    items: Array.isArray(block.items) ? block.items.join("\n") : "",
    ordered: Boolean(block.ordered)
  }));
}

function fromBlockState(block) {
  if (block.type === "list") {
    return { type: "list", ordered: block.ordered, items: block.items.split(/\r?\n/).map(line => line.trim()).filter(Boolean) };
  }
  return { type: block.type, text: block.text.trim() };
}

function blockEditor(block, index, total, canEdit) {
  const label = BLOCK_TYPES[block.type].label;
  const fieldId = `block-${block.key}`;
  const control = block.type === "heading"
    ? element("input", { id: fieldId, name: "text", type: "text", maxlength: String(LIMITS.heading), required: true, disabled: !canEdit, value: block.text })
    : element("textarea", {
      id: fieldId, name: block.type === "list" ? "items" : "text", disabled: !canEdit,
      rows: block.type === "list" ? "5" : "4", maxlength: String(block.type === "list" ? LIMITS.item * 40 : LIMITS.paragraph),
      placeholder: block.type === "list" ? "Кожен пункт з нового рядка" : ""
    });
  if (control.tagName === "INPUT") control.value = block.text;
  else control.value = block.type === "list" ? block.items : block.text;
  return element("li", { className: `admin-pages-block admin-pages-block--${block.type}`, "data-block": block.key },
    element("header", { className: "admin-pages-block__head" },
      element("label", { className: "admin-pages-block__type", for: fieldId }, `${index + 1}. ${label}`),
      block.type === "list" ? element("label", { className: "admin-pages-block__ordered" },
        element("input", { type: "checkbox", name: "ordered", checked: block.ordered, disabled: !canEdit }), "Нумерований") : null,
      canEdit ? element("div", { className: "admin-collection-item__actions" },
        iconButton(`Блок ${index + 1} вище`, "↑", { "data-block-move": "-1" }, index === 0),
        iconButton(`Блок ${index + 1} нижче`, "↓", { "data-block-move": "1" }, index === total - 1),
        iconButton(`Прибрати блок ${index + 1}`, "×", { "data-block-remove": "" }, false)) : null),
    control);
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------
function bindFaq(container, api, faq, canEdit) {
  const panel = container.querySelector("[data-faq-panel]");
  const list = panel.querySelector("[data-faq-list]");
  const saveButton = panel.querySelector("[data-faq-save]");
  const resetButton = panel.querySelector("[data-faq-reset]");
  const addButton = panel.querySelector("[data-faq-add]");
  const summary = panel.querySelector("[data-faq-summary]");
  const groupsList = panel.querySelector("[data-faq-groups]");
  const toState = items => items.map(item => ({ key: nextKey(), id: item.id, group: item.group, question: item.question, answer: item.answer, active: item.active !== false }));
  const state = { saved: faq, items: toState(faq.items) };
  const serialize = items => JSON.stringify(items.map(({ id, group, question, answer, active }) => ({ id: id || null, group: group.trim(), question: question.trim(), answer: answer.trim(), active })));
  let initial = serialize(state.items);
  const dirty = () => serialize(state.items) !== initial;

  const refresh = () => {
    const shown = state.items.filter(item => item.active).length;
    summary.textContent = `На сайті ${number(shown)} з ${number(state.items.length)} запитань.`;
    const groups = [...new Set(state.items.map(item => item.group.trim()).filter(Boolean))];
    groupsList.replaceChildren(...groups.map(group => element("option", { value: group })));
    if (saveButton) {
      saveButton.disabled = !dirty();
      resetButton.hidden = !dirty();
    }
    if (addButton) addButton.disabled = state.items.length >= LIMITS.faq;
  };
  const render = () => {
    list.replaceChildren(...(state.items.length
      ? state.items.map((item, index) => faqEditor(item, index, state.items.length, canEdit))
      : [element("li", { className: "admin-muted admin-pages-blocks__empty" }, "Запитань немає: сторінка покаже лише заголовок і підказку зв’язатися з магазином.")]));
    refresh();
  };

  list.addEventListener("input", event => {
    const item = state.items.find(entry => entry.key === event.target.closest("[data-faq]")?.dataset.faq);
    if (!item) return;
    if (["group", "question", "answer"].includes(event.target.name)) item[event.target.name] = event.target.value;
    if (event.target.name === "active") item.active = event.target.checked;
    refresh();
  });
  list.addEventListener("change", event => {
    if (event.target.name !== "active") return;
    const holder = event.target.closest("[data-faq]");
    const item = state.items.find(entry => entry.key === holder?.dataset.faq);
    if (!item) return;
    item.active = event.target.checked;
    holder.classList.toggle("is-hidden", !item.active);
    refresh();
  });
  list.addEventListener("click", event => {
    const button = event.target.closest("[data-faq-move], [data-faq-remove]");
    if (!button) return;
    const index = state.items.findIndex(entry => entry.key === button.closest("[data-faq]")?.dataset.faq);
    if (index < 0) return;
    if (button.dataset.faqRemove !== undefined) state.items.splice(index, 1);
    else {
      const next = index + Number(button.dataset.faqMove);
      if (next < 0 || next >= state.items.length) return;
      [state.items[index], state.items[next]] = [state.items[next], state.items[index]];
    }
    render();
  });
  addButton?.addEventListener("click", () => {
    if (state.items.length >= LIMITS.faq) return;
    const item = { key: nextKey(), id: null, group: state.items.at(-1)?.group || "", question: "", answer: "", active: true };
    state.items.push(item);
    render();
    list.querySelector(`[data-faq="${item.key}"] [name="question"]`)?.focus();
  });
  resetButton?.addEventListener("click", () => { state.items = toState(state.saved.items); render(); });
  saveButton?.addEventListener("click", async () => {
    const missing = list.querySelector("[data-faq] input:invalid, [data-faq] textarea:invalid");
    if (missing) { missing.reportValidity(); return; }
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      const items = JSON.parse(serialize(state.items));
      const saved = await api.pages.saveFaq(items, state.saved.updatedAt);
      state.saved = saved;
      state.items = toState(saved.items);
      initial = serialize(state.items);
      renderHistoryList(container.querySelector("[data-faq-history]"), saved.history);
      showToast(container, "Запитання збережено. Сайт покаже зміни після оновлення сторінки.");
    } catch (failure) {
      showToast(container, failure.message, true);
    }
    saveButton.textContent = "Зберегти запитання";
    render();
  });

  renderHistoryList(container.querySelector("[data-faq-history]"), faq.history);
  render();
}

function faqEditor(item, index, total, canEdit) {
  const id = `faq-${item.key}`;
  const input = (name, label, attributes) => {
    const control = element(name === "answer" ? "textarea" : "input", { id: `${id}-${name}`, name, required: true, disabled: !canEdit, ...attributes });
    control.value = item[name];
    return element("label", { className: `admin-field${name === "group" ? "" : " admin-field--full"}`, for: `${id}-${name}` }, element("span", {}, label), control);
  };
  return element("li", { className: `admin-pages-faq__item${item.active ? "" : " is-hidden"}`, "data-faq": item.key },
    element("header", { className: "admin-pages-block__head" },
      element("span", { className: "admin-pages-block__type" }, `${index + 1}. ${item.question.trim() ? "Запитання" : "Нове запитання"}`),
      element("label", { className: "admin-pages-block__ordered" },
        element("input", { type: "checkbox", name: "active", checked: item.active, disabled: !canEdit }), "Показувати"),
      canEdit ? element("div", { className: "admin-collection-item__actions" },
        iconButton(`Запитання ${index + 1} вище`, "↑", { "data-faq-move": "-1" }, index === 0),
        iconButton(`Запитання ${index + 1} нижче`, "↓", { "data-faq-move": "1" }, index === total - 1),
        iconButton(`Видалити запитання ${index + 1}`, "×", { "data-faq-remove": "" }, false)) : null),
    element("div", { className: "admin-form-grid" },
      input("group", "Розділ", { type: "text", maxlength: "80", list: "admin-faq-groups", placeholder: "Наприклад, Доставка і сервіс" }),
      input("question", "Питання", { type: "text", maxlength: "300" }),
      input("answer", "Відповідь", { rows: "3", maxlength: "2000" })));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderHistoryList(list, history) {
  if (!list) return;
  list.replaceChildren(...(history?.length ? history.map(entry => element("li", { className: "admin-crm-event" },
    element("header", {}, element("strong", {}, entry.actor), element("time", {}, formatDateTime(entry.createdAt))),
    element("p", {}, (entry.fields || []).map(field => FIELD_LABELS[field] || field).join(", "))))
    : [element("li", { className: "admin-muted" }, "Змін через адмінку ще не було.")]));
}

function updatedLabel(page) {
  return `Оновлено ${formatDateTime(page.updatedAt)}${page.updatedBy ? ` · ${page.updatedBy}` : ""}`;
}

function statusBadge(value) {
  const item = STATE[value];
  return `<span class="admin-status admin-status--${item.tone}">${escape(item.label)}</span>`;
}

function statusNode(value) {
  const item = STATE[value];
  return element("span", { className: `admin-status admin-status--${item.tone}` }, item.label);
}

function textField(name, label, value, maxLength, { full = false, hint = "", required = false, counter = 0 } = {}) {
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${label}</span>
    <input name="${name}" type="text" value="${escape(value ?? "")}" maxlength="${maxLength}" ${required ? "required" : ""}>
    ${counter ? `<small data-counter="${name}" data-recommended="${counter}"></small>` : ""}
    ${hint ? `<small>${escape(hint)}</small>` : ""}</label>`;
}

function textArea(name, label, value, maxLength, { full = false, rows = 3, counter = 0 } = {}) {
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${label}</span><textarea name="${name}" maxlength="${maxLength}" rows="${rows}">${escape(value ?? "")}</textarea>
    ${counter ? `<small data-counter="${name}" data-recommended="${counter}"></small>` : ""}</label>`;
}

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "className") node.className = value;
    else if (key === "value" && "value" in node) node.value = value;
    else if (key === "checked") node.checked = Boolean(value);
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
