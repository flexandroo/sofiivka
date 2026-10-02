import { icon } from "/admin/admin-icons.mjs";

export const CRM_ROLES = Object.freeze(["owner", "admin", "manager"]);

const ORDER_STATUS = Object.freeze({
  new: { label: "Нове", tone: "warning" },
  confirmed: { label: "Підтверджено", tone: "info" },
  processing: { label: "Комплектується", tone: "info" },
  shipped: { label: "Відправлено", tone: "info" },
  completed: { label: "Виконано", tone: "success" },
  cancelled: { label: "Скасовано", tone: "" }
});
const LEAD_STATUS = Object.freeze({
  new: { label: "Нове", tone: "warning" },
  in_progress: { label: "В роботі", tone: "info" },
  done: { label: "Опрацьовано", tone: "success" },
  spam: { label: "Спам", tone: "" }
});
const LEAD_TYPE = Object.freeze({ contact: "Звернення", partner_spec: "Специфікація", callback: "Дзвінок" });
const DELIVERY = Object.freeze({ carrier: "Перевізник", pickup: "Самовивіз" });
const PRICE_STATUS = Object.freeze({ known: "", on_request: "за запитом", unknown: "ціна не вказана" });

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export async function createOrdersListView({ api, search = location.search, signal }) {
  const filters = parseListFilters(search, ["status"]);
  const result = await api.crm.listOrders(filters, { signal });
  const rows = result.orders.map(order => `
    <tr>
      <td><a class="admin-crm-id" href="/admin/orders/${order.number}" data-admin-link>№ ${order.number}</a><small>${formatDateTime(order.createdAt)}${order.source === "manual" ? " · вручну" : ""}</small></td>
      <td><strong>${escape(order.contactName)}</strong><small>${phoneLink(order.contactPhone)}</small></td>
      <td>${escape(DELIVERY[order.deliveryMethod] || "")}${order.deliveryCity ? `<small>${escape(order.deliveryCity)}</small>` : ""}</td>
      <td class="admin-crm-num">${number(order.itemsCount)}</td>
      <td class="admin-crm-num">${orderTotal(order)}</td>
      <td>${statusBadge(ORDER_STATUS, order.status)}</td>
      <td>${order.assignedTo ? escape(order.assignedTo) : `<span class="admin-muted">—</span>`}</td>
    </tr>`).join("");
  const html = `
    <section class="admin-crm-page">
      ${pageHead("ПРОДАЖІ", "Замовлення", `${number(result.total)} за поточними умовами.`, `
        <div class="admin-crm-head-actions">
          <button class="admin-button admin-button--secondary" type="button" data-crm-export ${result.total ? "" : "disabled"}>${icon("download")}Експорт CSV</button>
          <a class="admin-button admin-button--primary" href="/admin/orders/new" data-admin-link>${icon("plus")}Нове замовлення</a>
        </div>`)}
      ${filterBar(filters, {
        placeholder: "№, ім’я, телефон або email",
        selects: [{ name: "status", label: "Статус", all: "Усі статуси", options: ORDER_STATUS }]
      })}
      ${result.orders.length ? table(["Замовлення", "Клієнт", "Отримання", "Шт.", "Сума", "Статус", "Відповідальний"], rows, "admin-crm-table--orders")
        : emptyState("Замовлень не знайдено", filters.query || filters.status ? "Змініть пошук або фільтр." : "Нові замовлення з сайту з’являться тут автоматично.")}
      ${pagination(result)}
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => {
      bindList(container);
      bindExport(container, {
        fetchPage: page => api.crm.exportOrders(filters, page),
        filename: "zamovlennia",
        columns: ORDER_CSV_COLUMNS
      });
    }
  };
}

export async function createOrderDetailView({ api, navigate, orderNumber, signal }) {
  const detail = await api.crm.getOrder(orderNumber, { signal });
  if (!detail?.order) return notFound("Замовлення не знайдено", "/admin/orders", "До замовлень");
  return renderOrderDetail({ api, navigate, detail });
}

function renderOrderDetail({ api, detail }) {
  const { order, items, customer } = detail;
  const html = `
    <section class="admin-crm-detail" data-crm-detail>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/orders" data-admin-link class="admin-back-link">← Усі замовлення</a>
          <p class="admin-kicker">${order.source === "website" ? "З САЙТУ" : "ВРУЧНУ"} · ${formatDateTime(order.createdAt)}</p>
          <h1>Замовлення № ${order.number}</h1>
          <div class="admin-editor-meta">${statusBadge(ORDER_STATUS, order.status)}<span>Оновлено ${formatDateTime(order.updatedAt)}</span></div>
        </div>
        <div class="admin-editor-head__actions">
          <a class="admin-button admin-button--secondary" href="/admin/orders/${order.number}/print" data-admin-link>${icon("print")}Друк</a>
        </div>
      </header>
      <div class="admin-crm-layout">
        <div class="admin-crm-main">
          <section class="admin-panel" data-lines-panel>
            <header class="admin-panel__head"><div><p class="admin-kicker">СКЛАД</p><h2>Товари · ${number(order.itemsCount)} шт.</h2></div>
              ${order.itemsEditable ? `<button class="admin-button admin-button--secondary" type="button" data-lines-edit>Редагувати склад</button>` : ""}</header>
            <div data-lines-view>
              <div class="admin-crm-items">
                ${items.map(item => `
                  <div class="admin-crm-item">
                    <div><strong>${item.productAvailable ? `<a href="/admin/products/${encodeURIComponent(item.legacyId)}" data-admin-link>${escape(item.title)}</a>` : escape(item.title)}</strong>
                      <small>${escape(itemMeta(item))}</small></div>
                    <span class="admin-crm-num">${number(item.quantity)} × ${item.unitAmount === null ? `<em>${escape(unpricedLabel(item))}</em>` : money(item.unitAmount)}</span>
                    <strong class="admin-crm-num">${item.lineTotal === null ? "—" : money(item.lineTotal)}</strong>
                  </div>`).join("")}
                <div class="admin-crm-item admin-crm-item--total"><span>Разом</span><span></span><strong class="admin-crm-num">${orderTotal(order)}</strong></div>
              </div>
              ${order.hasUnpricedItems ? `<p class="admin-panel-note">Є позиції без ціни — уточніть вартість і вкажіть її в складі замовлення.</p>` : ""}
              ${order.itemsEditable ? "" : `<p class="admin-panel-note">Склад виконаного або скасованого замовлення не редагується. Щоб змінити його, спершу змініть статус.</p>`}
            </div>
            <div data-lines-edit-area hidden>
              ${linesEditorHtml()}
              <footer class="admin-crm-form-actions">
                <button class="admin-button admin-button--ghost" type="button" data-lines-cancel>Скасувати</button>
                <button class="admin-button admin-button--primary" type="button" data-lines-save>Зберегти склад</button>
              </footer>
            </div>
          </section>
          ${order.customerComment ? `<section class="admin-panel"><header class="admin-panel__head"><div><p class="admin-kicker">КОМЕНТАР КЛІЄНТА</p></div></header><p class="admin-crm-text">${multiline(order.customerComment)}</p></section>` : ""}
          <form class="admin-panel" data-crm-form>
            <header class="admin-panel__head"><div><p class="admin-kicker">ОБРОБКА</p><h2>Статус і доставка</h2></div></header>
            <div class="admin-form-grid">
              ${selectField("status", "Статус", ORDER_STATUS, order.status)}
              ${staffField(detail.staff, order.assignedTo)}
              ${selectField("deliveryMethod", "Отримання", DELIVERY_OPTIONS, order.deliveryMethod)}
              ${textField("deliveryCity", "Місто", order.deliveryCity, 120)}
              <label class="admin-field admin-field--full"><span data-delivery-point-label>${deliveryPointLabel(order.deliveryMethod)}</span><input name="deliveryPoint" value="${escape(order.deliveryPoint || "")}" maxlength="240"></label>
              <label class="admin-field admin-field--full"><span>Коментар менеджера</span><textarea name="managerComment" maxlength="8000">${escape(order.managerComment)}</textarea></label>
            </div>
            <footer class="admin-crm-form-actions"><button class="admin-button admin-button--primary" type="submit">Зберегти</button></footer>
          </form>
        </div>
        <aside class="admin-crm-side">
          ${customerCard(customer, { email: order.contactEmail, name: order.contactName, phone: order.contactPhone })}
          ${timeline(detail.activity)}
        </aside>
      </div>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => {
      bindDetail(container, {
        save: patch => api.crm.updateOrder(order.number, patch, order.updatedAt),
        note: text => api.crm.addNote("order", order.number, text),
        fields: ["status", "assignedTo", "deliveryMethod", "deliveryCity", "deliveryPoint", "managerComment"]
      });
      bindDeliveryLabel(container);
      bindLinesEdit(container, { api, order, items });
    }
  };
}

function bindLinesEdit(container, { api, order, items }) {
  const panel = container.querySelector("[data-lines-panel]");
  const editButton = panel?.querySelector("[data-lines-edit]");
  if (!editButton) return;
  const view = panel.querySelector("[data-lines-view]");
  const area = panel.querySelector("[data-lines-edit-area]");
  const saveButton = panel.querySelector("[data-lines-save]");
  let editor = null;
  const toggle = editing => {
    view.hidden = editing;
    area.hidden = !editing;
    editButton.hidden = editing;
  };
  editButton.addEventListener("click", () => {
    editor = createLinesEditor(area.querySelector("[data-lines-editor]"), {
      api,
      lines: items.map(item => ({
        id: item.id, legacyId: item.legacyId, title: item.title, sku: item.sku, brand: item.brand,
        quantity: String(item.quantity), unitAmount: amountInput(item.unitAmount), priceStatus: item.priceStatus, custom: item.custom
      })),
      notify: (message, error) => showToast(container, message, error)
    });
    toggle(true);
    area.querySelector("[data-line-qty]")?.focus();
  });
  panel.querySelector("[data-lines-cancel]").addEventListener("click", () => {
    editor?.dispose();
    editor = null;
    toggle(false);
    editButton.focus();
  });
  saveButton.addEventListener("click", async () => {
    const lines = editor?.serialize();
    if (!lines) return;
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      await api.crm.updateOrderItems(order.number, lines, order.updatedAt);
      showToast(container, "Склад замовлення збережено.");
      setTimeout(() => goTo(location.pathname, { replace: true }), 350);
    } catch (error) {
      showToast(container, error.message, true);
      saveButton.disabled = false;
      saveButton.textContent = "Зберегти склад";
    }
  });
}

// ---------------------------------------------------------------------------
// Manual order (phone call, visit)
// ---------------------------------------------------------------------------
export async function createOrderCreateView({ api, search = location.search, signal }) {
  const customerId = new URLSearchParams(search).get("customer");
  let prefill = null;
  if (customerId && /^[0-9a-f-]{36}$/i.test(customerId)) {
    try {
      prefill = (await api.crm.getCustomer(customerId, { signal }))?.customer || null;
    } catch (error) {
      if (error?.code === "aborted") throw error;
    }
  }
  const html = `
    <section class="admin-crm-detail" data-crm-create-page>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/orders" data-admin-link class="admin-back-link">← Усі замовлення</a>
          <p class="admin-kicker">ВРУЧНУ · ДЗВІНОК АБО ВІЗИТ</p>
          <h1>Нове замовлення</h1>
          <div class="admin-editor-meta"><span>Ціни й суму рахує сервер. Клієнта знайдемо за телефоном або створимо нову картку.</span></div>
        </div>
      </header>
      <form data-crm-create novalidate>
        <div class="admin-crm-layout">
          <div class="admin-crm-main">
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">КЛІЄНТ</p><h2>Контакти</h2></div></header>
              <div class="admin-form-grid">
                <label class="admin-field"><span>Ім’я *</span><input name="name" maxlength="160" required autocomplete="off" value="${escape(prefill?.name || "")}"></label>
                <label class="admin-field"><span>Телефон *</span><input name="phone" type="tel" inputmode="tel" maxlength="32" required autocomplete="off" placeholder="050 123 45 67" value="${escape(prefill?.phone || "")}"></label>
                <label class="admin-field"><span>Email</span><input name="email" type="email" inputmode="email" maxlength="254" autocomplete="off" value="${escape(prefill?.email || "")}"></label>
                <label class="admin-field"><span>Компанія</span><input name="company" maxlength="200" autocomplete="off" value="${escape(prefill?.company || "")}"></label>
              </div>
            </section>
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">СКЛАД</p><h2>Товари й послуги</h2></div></header>
              ${linesEditorHtml()}
            </section>
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ОТРИМАННЯ</p><h2>Доставка й коментарі</h2></div></header>
              <div class="admin-form-grid">
                ${selectField("delivery", "Отримання", DELIVERY_OPTIONS, "carrier")}
                <label class="admin-field"><span>Місто</span><input name="city" maxlength="120" autocomplete="off" value="${escape(prefill?.city || "")}"></label>
                <label class="admin-field admin-field--full"><span data-delivery-point-label>${deliveryPointLabel("carrier")}</span><input name="deliveryPoint" maxlength="240" autocomplete="off"></label>
                <label class="admin-field admin-field--full"><span>Коментар клієнта</span><textarea name="comment" maxlength="4000" placeholder="Що просив клієнт, зручний час доставки…"></textarea></label>
                <label class="admin-field admin-field--full"><span>Коментар менеджера</span><textarea name="managerComment" maxlength="8000"></textarea></label>
              </div>
            </section>
          </div>
          <aside class="admin-crm-side">
            <section class="admin-panel admin-crm-create-summary">
              <header class="admin-panel__head"><div><p class="admin-kicker">ПІДСУМОК</p><h2 data-create-total>0 грн</h2></div></header>
              <div class="admin-form-stack">
                ${selectField("status", "Статус", { new: ORDER_STATUS.new, confirmed: ORDER_STATUS.confirmed }, "new")}
                <p class="admin-crm-hint">Відповідальним буде призначено вас. Змінити можна після створення.</p>
                <p class="admin-feedback admin-feedback--error" data-create-error role="alert" hidden></p>
                <button class="admin-button admin-button--primary" type="submit" data-create-submit>Створити замовлення</button>
              </div>
            </section>
          </aside>
        </div>
      </form>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => bindOrderCreate(container, { api }) };
}

function bindOrderCreate(container, { api }) {
  const form = container.querySelector("[data-crm-create]");
  const totalNode = container.querySelector("[data-create-total]");
  const errorNode = container.querySelector("[data-create-error]");
  const submit = container.querySelector("[data-create-submit]");
  const editor = createLinesEditor(container.querySelector("[data-lines-editor]"), {
    api,
    lines: [],
    notify: (message, error) => showToast(container, message, error),
    onTotal: text => { totalNode.textContent = text; }
  });
  bindDeliveryLabel(container, "delivery");
  const showError = message => {
    errorNode.textContent = message;
    errorNode.hidden = !message;
  };
  form.addEventListener("submit", async event => {
    event.preventDefault();
    showError("");
    const data = new FormData(form);
    const value = name => String(data.get(name) ?? "").trim();
    if (value("name").length < 2) { form.elements.name.focus(); return showError("Вкажіть ім’я клієнта."); }
    if (value("phone").replace(/\D/g, "").length < 9) { form.elements.phone.focus(); return showError("Вкажіть номер телефону клієнта."); }
    const lines = editor.serialize();
    if (!lines) return showError("Перевірте позиції замовлення.");
    submit.disabled = true;
    submit.textContent = "Створюємо…";
    try {
      const result = await api.crm.createOrder({
        name: value("name"), phone: value("phone"), email: value("email"), company: value("company"),
        delivery: value("delivery"), city: value("city"), deliveryPoint: value("deliveryPoint"),
        comment: value("comment"), managerComment: value("managerComment"), status: value("status"), lines
      });
      showToast(container, `Замовлення № ${result.order.number} створено.`);
      setTimeout(() => goTo(`/admin/orders/${result.order.number}`, { replace: true }), 350);
    } catch (error) {
      showError(error.message);
      submit.disabled = false;
      submit.textContent = "Створити замовлення";
    }
  });
}

// ---------------------------------------------------------------------------
// Print view (A4)
// ---------------------------------------------------------------------------
// Seller requisites are intentionally placeholders: replace them once the owner confirms the legal details.
const SELLER_PLACEHOLDERS = Object.freeze([
  ["Продавець", "[ЗАПОВНИТИ: повна назва ФОП / ТОВ]"],
  ["ЄДРПОУ / РНОКПП", "[ЗАПОВНИТИ]"],
  ["IBAN", "[ЗАПОВНИТИ]"],
  ["Банк", "[ЗАПОВНИТИ]"],
  ["Адреса", "[ЗАПОВНИТИ]"],
  ["Телефон", "[ЗАПОВНИТИ]"],
  ["Платник ПДВ", "[ЗАПОВНИТИ: так / ні]"]
]);

export async function createOrderPrintView({ api, orderNumber, signal }) {
  const detail = await api.crm.getOrder(orderNumber, { signal });
  if (!detail?.order) return notFound("Замовлення не знайдено", "/admin/orders", "До замовлень");
  const { order, items, customer } = detail;
  const shortDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  };
  const buyer = [
    ["Покупець", order.contactName],
    customer.company ? ["Компанія", customer.company] : null,
    ["Телефон", prettyPhone(order.contactPhone)],
    order.contactEmail ? ["Email", order.contactEmail] : null,
    ["Отримання", [DELIVERY[order.deliveryMethod], order.deliveryCity].filter(Boolean).join(", ")],
    order.deliveryPoint ? [deliveryPointLabel(order.deliveryMethod), order.deliveryPoint] : null
  ].filter(Boolean);
  const html = `
    <section class="admin-crm-print-page">
      <div class="admin-crm-print-toolbar">
        <a href="/admin/orders/${order.number}" data-admin-link class="admin-back-link">← До замовлення № ${order.number}</a>
        <div class="admin-inline-actions">
          <span class="admin-crm-hint">Реквізити продавця ще не заповнено — позначені поля надрукуються як є.</span>
          <button class="admin-button admin-button--primary" type="button" data-print>${icon("print")}Друкувати</button>
        </div>
      </div>
      <article class="admin-print-sheet" aria-label="Документ для друку">
        <header class="admin-print-sheet__head">
          <div class="admin-print-sheet__brand"><img src="/assets/logo-sofievka-transparent.png" width="1942" height="809" alt="Софіївка"><span>ТД «Софіївка»</span></div>
          <div class="admin-print-sheet__title">
            <h1>Замовлення № ${order.number}</h1>
            <p>від ${escape(shortDate(order.createdAt))} · ${escape(ORDER_STATUS[order.status]?.label || order.status)}</p>
          </div>
        </header>
        <div class="admin-print-parties">
          <section>
            <h2>Продавець</h2>
            <dl>${SELLER_PLACEHOLDERS.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd><span class="admin-print-placeholder">${escape(value)}</span></dd></div>`).join("")}</dl>
          </section>
          <section>
            <h2>Покупець</h2>
            <dl>${buyer.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>
          </section>
        </div>
        <div class="admin-print-table-wrap">
          <table class="admin-print-table">
            <thead><tr><th scope="col">№</th><th scope="col">Найменування</th><th scope="col">Артикул</th><th scope="col">К-сть</th><th scope="col">Ціна, грн</th><th scope="col">Сума, грн</th></tr></thead>
            <tbody>${items.map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escape(item.title)}${item.brand ? `<small>${escape(item.brand)}</small>` : ""}</td>
                <td>${escape(item.sku || "—")}</td>
                <td class="admin-crm-num">${number(item.quantity)}</td>
                <td class="admin-crm-num">${item.unitAmount === null ? "уточнюється" : plainMoney(item.unitAmount)}</td>
                <td class="admin-crm-num">${item.lineTotal === null ? "—" : plainMoney(item.lineTotal)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="admin-print-totals">
          <div><span>Усього</span><strong>${number(items.length)} поз. · ${number(order.itemsCount)} шт.</strong></div>
          <div><span>Разом до сплати</span><strong>${money(order.itemsTotal)}</strong></div>
          <div><span>ПДВ</span><strong><span class="admin-print-placeholder">[ЗАПОВНИТИ: у т.ч. ПДВ / без ПДВ]</span></strong></div>
          ${order.hasUnpricedItems ? `<p>Вартість позицій з позначкою «уточнюється» буде повідомлена додатково й до суми не входить.</p>` : ""}
        </div>
        ${order.customerComment ? `<section class="admin-print-note"><h2>Коментар</h2><p>${multiline(order.customerComment)}</p></section>` : ""}
        <footer class="admin-print-sheet__footer">
          <div><span>Продавець</span><i></i></div>
          <div><span>Покупець</span><i></i></div>
          <p>Сформовано ${escape(shortDate(new Date()))}. Не є податковою накладною; рахунком на оплату стає після заповнення реквізитів продавця.</p>
        </footer>
      </article>
    </section>`;
  return {
    html,
    bind: container => {
      container.querySelector("[data-print]")?.addEventListener("click", () => window.print());
    }
  };
}

// ---------------------------------------------------------------------------
// Order lines editor (shared by "edit order" and "new order")
// ---------------------------------------------------------------------------
function linesEditorHtml() {
  return `
    <div class="admin-crm-lines" data-lines-editor>
      <div class="admin-crm-lines__rows" data-lines-rows></div>
      <div class="admin-crm-lines__summary"><span>Разом (попередньо)</span><strong class="admin-crm-num" data-lines-total>0 грн</strong></div>
      <p class="admin-panel-note">Остаточну суму рахує сервер під час збереження. Порожня ціна означає «уточнюється» — позиція не входить у суму.</p>
      <div class="admin-crm-lines__add">
        <div class="admin-crm-picker" data-product-picker>
          <label class="admin-field"><span>Додати товар з каталогу</span>
            <input type="search" data-product-search placeholder="Назва, SKU або модель" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="crm-product-results"></label>
          <ul class="admin-crm-picker__results" id="crm-product-results" role="listbox" aria-label="Знайдені товари" data-product-results hidden></ul>
        </div>
        <fieldset class="admin-crm-custom-line">
          <legend>Довільна позиція</legend>
          <div class="admin-crm-custom-line__grid">
            <label class="admin-field admin-crm-custom-line__title"><span>Назва</span><input data-custom-title maxlength="300" placeholder="Напр., монтаж або доставка" autocomplete="off"></label>
            <label class="admin-field"><span>Артикул</span><input data-custom-sku maxlength="120" placeholder="необов’язково" autocomplete="off"></label>
            <label class="admin-field"><span>К-сть</span><input data-custom-qty type="number" min="1" max="999" step="1" value="1" inputmode="numeric"></label>
            <label class="admin-field"><span>Ціна, грн</span><input data-custom-price inputmode="decimal" placeholder="уточнюється" autocomplete="off"></label>
          </div>
          <button class="admin-button admin-button--secondary" type="button" data-custom-add>${icon("plus")}Додати позицію</button>
        </fieldset>
      </div>
    </div>`;
}

function createLinesEditor(root, { api, lines: initialLines, notify, onTotal = () => {} }) {
  const lines = initialLines.map(line => ({ ...line }));
  const rows = root.querySelector("[data-lines-rows]");
  const totalNode = root.querySelector("[data-lines-total]");
  const picker = root.querySelector("[data-product-picker]");
  const search = root.querySelector("[data-product-search]");
  const results = root.querySelector("[data-product-results]");
  const customFieldset = root.querySelector(".admin-crm-custom-line");
  const addButton = root.querySelector("[data-custom-add]");
  const customTitle = root.querySelector("[data-custom-title]");
  const customSku = root.querySelector("[data-custom-sku]");
  const customQty = root.querySelector("[data-custom-qty]");
  const customPrice = root.querySelector("[data-custom-price]");
  let found = [];
  let searchTimer = null;
  let searchController = null;

  const lineSum = line => {
    const amount = parseAmountInput(line.unitAmount);
    const quantity = parseQuantityInput(line.quantity);
    return amount === null || Number.isNaN(amount) || quantity === null ? null : Math.round(amount * quantity * 100) / 100;
  };
  const updateTotals = () => {
    let total = 0;
    let unpriced = 0;
    lines.forEach((line, index) => {
      const sum = lineSum(line);
      if (sum === null) unpriced += 1; else total += sum;
      const node = rows.querySelector(`[data-line="${index}"] [data-line-sum]`);
      if (node) node.textContent = sum === null ? "—" : money(sum);
    });
    const text = `${money(total)}${unpriced ? ` + ${unpriced} уточн.` : ""}`;
    totalNode.textContent = text;
    onTotal(text);
  };
  const render = () => {
    rows.innerHTML = lines.length ? lines.map(lineRowHtml).join("")
      : `<p class="admin-crm-lines__empty">Позицій ще немає. Знайдіть товар у каталозі або додайте довільну позицію.</p>`;
    updateTotals();
  };

  const onInput = event => {
    const row = event.target.closest("[data-line]");
    if (!row) return;
    const line = lines[Number(row.dataset.line)];
    if (event.target.matches("[data-line-qty]")) line.quantity = event.target.value;
    if (event.target.matches("[data-line-price]")) line.unitAmount = event.target.value;
    event.target.removeAttribute("aria-invalid");
    updateTotals();
  };
  const onClick = event => {
    const remove = event.target.closest("[data-line-remove]");
    if (!remove) return;
    const index = Number(remove.closest("[data-line]").dataset.line);
    lines.splice(index, 1);
    render();
    (rows.querySelector(`[data-line="${Math.min(index, lines.length - 1)}"] [data-line-remove]`) || search).focus();
  };

  const closeResults = () => {
    results.hidden = true;
    search.setAttribute("aria-expanded", "false");
  };
  const showResults = html => {
    results.innerHTML = html;
    results.hidden = false;
    search.setAttribute("aria-expanded", "true");
  };
  const runSearch = async () => {
    const query = search.value.trim();
    searchController?.abort();
    if (query.length < 2) { found = []; return closeResults(); }
    searchController = new AbortController();
    showResults(`<li class="admin-crm-picker__state">Шукаємо…</li>`);
    try {
      found = await api.crm.searchProducts(query, { signal: searchController.signal }) || [];
      showResults(found.length ? found.map((product, index) => `
        <li role="option" aria-selected="false"><button type="button" data-pick="${index}">
          <span><strong>${escape(product.title)}</strong>
          <small>${escape([product.brand, product.sku, PUBLICATION_NOTE[product.publicationStatus]].filter(Boolean).join(" · "))}</small></span>
          <span class="admin-crm-num">${product.amount === null ? escape(PRICE_STATUS[product.priceStatus] || "за запитом") : money(product.amount)}</span>
        </button></li>`).join("")
        : `<li class="admin-crm-picker__state">Нічого не знайдено. Додайте довільну позицію нижче.</li>`);
    } catch (error) {
      if (error?.code === "aborted") return;
      showResults(`<li class="admin-crm-picker__state is-error">${escape(error.message)}</li>`);
    }
  };
  const onSearchInput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  };
  const onSearchKey = event => {
    if (event.key === "Escape") closeResults();
    if (event.key === "Enter") { event.preventDefault(); clearTimeout(searchTimer); runSearch(); }
    if (event.key === "ArrowDown") { event.preventDefault(); results.querySelector("button")?.focus(); }
  };
  const onResultsClick = event => {
    const button = event.target.closest("[data-pick]");
    if (!button) return;
    const product = found[Number(button.dataset.pick)];
    const existing = lines.findIndex(line => line.legacyId && line.legacyId === product.legacyId);
    closeResults();
    if (existing >= 0) {
      notify("Цей товар уже є в замовленні — змініть кількість.", true);
      rows.querySelector(`[data-line="${existing}"] [data-line-qty]`)?.focus();
      return;
    }
    lines.push({ productId: product.legacyId, legacyId: product.legacyId, title: product.title, sku: product.sku, brand: product.brand,
      quantity: "1", unitAmount: amountInput(product.amount), priceStatus: product.priceStatus, custom: false });
    search.value = "";
    render();
    rows.querySelector(`[data-line="${lines.length - 1}"] [data-line-qty]`)?.focus();
  };
  const onResultsKey = event => {
    const buttons = [...results.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === "ArrowDown") { event.preventDefault(); buttons[Math.min(index + 1, buttons.length - 1)]?.focus(); }
    if (event.key === "ArrowUp") { event.preventDefault(); (index <= 0 ? search : buttons[index - 1]).focus(); }
    if (event.key === "Escape") { closeResults(); search.focus(); }
  };
  const onDocumentClick = event => { if (!picker.contains(event.target)) closeResults(); };

  const addCustom = () => {
    const title = customTitle.value.trim();
    if (title.length < 2) { customTitle.setAttribute("aria-invalid", "true"); customTitle.focus(); return notify("Вкажіть назву позиції.", true); }
    if (parseQuantityInput(customQty.value) === null) { customQty.setAttribute("aria-invalid", "true"); customQty.focus(); return notify("Кількість — ціле число від 1 до 999.", true); }
    if (Number.isNaN(parseAmountInput(customPrice.value))) { customPrice.setAttribute("aria-invalid", "true"); customPrice.focus(); return notify("Перевірте ціну: число до 9 999 999,99.", true); }
    lines.push({ title, sku: customSku.value.trim(), brand: "", quantity: customQty.value, unitAmount: customPrice.value.trim(), priceStatus: "", custom: true });
    [customTitle, customSku, customPrice].forEach(input => { input.value = ""; input.removeAttribute("aria-invalid"); });
    customQty.value = "1";
    customQty.removeAttribute("aria-invalid");
    render();
    customTitle.focus();
  };
  const onCustomKey = event => {
    if (event.key === "Enter" && event.target.matches("input")) { event.preventDefault(); addCustom(); }
  };

  rows.addEventListener("input", onInput);
  rows.addEventListener("click", onClick);
  search.addEventListener("input", onSearchInput);
  search.addEventListener("keydown", onSearchKey);
  results.addEventListener("click", onResultsClick);
  results.addEventListener("keydown", onResultsKey);
  document.addEventListener("click", onDocumentClick);
  addButton.addEventListener("click", addCustom);
  customFieldset.addEventListener("keydown", onCustomKey);
  render();

  return {
    serialize() {
      if (!lines.length) { notify("Додайте хоча б одну позицію.", true); search.focus(); return null; }
      for (const [index, line] of lines.entries()) {
        const row = rows.querySelector(`[data-line="${index}"]`);
        const invalid = (selector, message) => {
          const input = row.querySelector(selector);
          input.setAttribute("aria-invalid", "true");
          input.focus();
          notify(`«${line.title}»: ${message}`, true);
          return null;
        };
        if (parseQuantityInput(line.quantity) === null) return invalid("[data-line-qty]", "кількість — ціле число від 1 до 999.");
        if (Number.isNaN(parseAmountInput(line.unitAmount))) return invalid("[data-line-price]", "перевірте ціну (число до 9 999 999,99).");
      }
      return lines.map(line => {
        const quantity = parseQuantityInput(line.quantity);
        const amount = parseAmountInput(line.unitAmount);
        const unitAmount = amount === null ? null : amount.toFixed(2);
        if (line.id) return { id: line.id, quantity, unitAmount };
        if (line.productId) return { productId: line.productId, quantity, unitAmount };
        return { title: line.title, sku: line.sku, quantity, unitAmount };
      });
    },
    dispose() {
      rows.removeEventListener("input", onInput);
      rows.removeEventListener("click", onClick);
      search.removeEventListener("input", onSearchInput);
      search.removeEventListener("keydown", onSearchKey);
      results.removeEventListener("click", onResultsClick);
      results.removeEventListener("keydown", onResultsKey);
      document.removeEventListener("click", onDocumentClick);
      addButton.removeEventListener("click", addCustom);
      customFieldset.removeEventListener("keydown", onCustomKey);
      searchController?.abort();
      clearTimeout(searchTimer);
      search.value = "";
      closeResults();
    }
  };
}

function lineRowHtml(line, index) {
  const meta = [line.brand, line.sku, line.custom ? "довільна позиція" : "", line.priceStatus === "on_request" ? "у каталозі — за запитом" : ""].filter(Boolean).join(" · ");
  return `
    <div class="admin-crm-line" data-line="${index}">
      <div class="admin-crm-line__title"><strong>${escape(line.title)}</strong>${meta ? `<small>${escape(meta)}</small>` : ""}</div>
      <label class="admin-crm-line__qty"><span>К-сть</span><input type="number" min="1" max="999" step="1" inputmode="numeric" value="${escape(line.quantity)}" data-line-qty></label>
      <label class="admin-crm-line__price"><span>Ціна, грн</span><input inputmode="decimal" value="${escape(line.unitAmount)}" placeholder="уточнюється" autocomplete="off" data-line-price></label>
      <strong class="admin-crm-line__sum admin-crm-num" data-line-sum>—</strong>
      <button class="admin-icon-button admin-crm-line__remove" type="button" data-line-remove aria-label="Видалити позицію «${escape(line.title)}»">${icon("close")}</button>
    </div>`;
}

const PUBLICATION_NOTE = Object.freeze({ published: "", draft: "чернетка", hidden: "прихований" });
const DELIVERY_OPTIONS = Object.freeze(Object.fromEntries(Object.entries(DELIVERY).map(([key, label]) => [key, { label }])));

function deliveryPointLabel(method) {
  return method === "pickup" ? "Магазин самовивозу" : "Відділення або адреса";
}

function bindDeliveryLabel(container, name = "deliveryMethod") {
  const select = container.querySelector(`select[name="${name}"]`);
  const label = container.querySelector("[data-delivery-point-label]");
  select?.addEventListener("change", () => { if (label) label.textContent = deliveryPointLabel(select.value); });
}

function itemMeta(item) {
  return [item.brand, item.sku, item.custom ? "довільна позиція" : "", item.priceSource === "manager" && item.unitAmount !== null ? "ціна менеджера" : ""]
    .filter(Boolean).join(" · ");
}

function unpricedLabel(item) {
  return item.priceSource === "manager" || item.custom ? "уточнюється" : PRICE_STATUS[item.priceStatus] || "уточнюється";
}

// "" → null (price to be clarified); invalid → NaN.
function parseAmountInput(value) {
  const text = String(value ?? "").replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!text) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return Number.NaN;
  return Number(text);
}

function parseQuantityInput(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const quantity = Number(text);
  return quantity >= 1 && quantity <= 999 ? quantity : null;
}

function amountInput(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(".", ",");
}

// ---------------------------------------------------------------------------
// CSV export (UTF-8 with BOM, ";" separator — opens directly in Excel with a Ukrainian locale)
// ---------------------------------------------------------------------------
const EXPORT_ROW_CAP = 10_000;
const ORDER_CSV_COLUMNS = Object.freeze([
  ["№", row => row.number],
  ["Дата", row => csvDate(row.createdAt)],
  ["Статус", row => ORDER_STATUS[row.status]?.label || row.status],
  ["Джерело", row => row.source === "manual" ? "Вручну" : "Сайт"],
  ["Клієнт", row => row.contactName],
  ["Телефон", row => csvPhone(row.contactPhone)],
  ["Email", row => row.contactEmail],
  ["Отримання", row => DELIVERY[row.deliveryMethod] || row.deliveryMethod],
  ["Місто", row => row.deliveryCity],
  ["Відділення / магазин", row => row.deliveryPoint],
  ["Кількість, шт.", row => row.itemsCount],
  ["Сума, грн", row => csvAmount(row.itemsTotal)],
  ["Є позиції без ціни", row => row.hasUnpricedItems ? "так" : "ні"],
  ["Відповідальний", row => row.assignedTo],
  ["Товари", row => (row.items || []).map(item => `${[item.sku, item.title].filter(Boolean).join(" ")} × ${item.quantity}${item.unitAmount === null ? " (ціна уточнюється)" : ` по ${csvAmount(item.unitAmount)}`}`).join(" | ")],
  ["Коментар клієнта", row => row.customerComment],
  ["Коментар менеджера", row => row.managerComment]
]);
const CUSTOMER_CSV_COLUMNS = Object.freeze([
  ["Ім’я", row => row.name],
  ["Телефон", row => csvPhone(row.phone)],
  ["Email", row => row.email],
  ["Компанія", row => row.company],
  ["Місто", row => row.city],
  ["Замовлень", row => row.ordersCount],
  ["Заявок", row => row.leadsCount],
  ["Сума замовлень, грн", row => csvAmount(row.ordersTotal)],
  ["Клієнт з", row => csvDate(row.createdAt)],
  ["Остання активність", row => csvDate(row.lastActivityAt)],
  ["Нотатки", row => row.notes]
]);

function bindExport(container, { fetchPage, filename, columns }) {
  const button = container.querySelector("[data-crm-export]");
  button?.addEventListener("click", async () => {
    const label = button.innerHTML;
    button.disabled = true;
    button.textContent = "Готуємо файл…";
    try {
      const rows = [];
      let total = 0;
      for (let page = 1; ; page += 1) {
        const result = await fetchPage(page);
        total = result.total;
        rows.push(...result.rows);
        if (!result.rows.length || rows.length >= total || rows.length >= EXPORT_ROW_CAP) break;
      }
      const exported = rows.slice(0, EXPORT_ROW_CAP);
      downloadCsv(`${filename}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(columns, exported));
      showToast(container, total > exported.length
        ? `Експортовано перші ${number(exported.length)} з ${number(total)}. Звузьте фільтр, щоб отримати решту.`
        : `Файл готово: ${number(exported.length)} у вибірці.`);
    } catch (error) {
      showToast(container, error.message, true);
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  });
}

export function toCsv(columns, rows) {
  const lines = [columns.map(([title]) => csvCell(title)).join(";")];
  for (const row of rows) lines.push(columns.map(([, read]) => csvCell(read(row))).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

class CsvRaw {
  constructor(text) { this.text = text; }
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof CsvRaw) return value.text;
  let text = String(value);
  // Spreadsheet formula injection: text starting with = + - @ is kept as text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Phones are normalised on the server to +<digits>; ="…" keeps the leading + and stops Excel turning them into numbers.
function csvPhone(phone) {
  return /^\+\d{10,15}$/.test(String(phone || "")) ? new CsvRaw(`"=""${phone}"""`) : phone;
}

function csvAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  return Number(value).toFixed(2).replace(".", ",");
}

function csvDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
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

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
export async function createLeadsListView({ api, search = location.search, signal }) {
  const filters = parseListFilters(search, ["status", "type"]);
  const result = await api.crm.listLeads(filters, { signal });
  const rows = result.leads.map(lead => `
    <tr>
      <td><a class="admin-crm-id" href="/admin/leads/${lead.number}" data-admin-link>№ ${lead.number}</a><small>${formatDateTime(lead.createdAt)}</small></td>
      <td>${escape(LEAD_TYPE[lead.type] || lead.type)}${lead.specLinesCount ? `<small>${number(lead.specLinesCount)} поз.</small>` : ""}</td>
      <td><strong>${escape(lead.contactName)}</strong><small>${phoneLink(lead.contactPhone)}${lead.company ? ` · ${escape(lead.company)}` : ""}</small></td>
      <td class="admin-crm-preview">${escape(lead.preview || "—")}</td>
      <td>${statusBadge(LEAD_STATUS, lead.status)}</td>
      <td>${lead.assignedTo ? escape(lead.assignedTo) : `<span class="admin-muted">—</span>`}</td>
    </tr>`).join("");
  const html = `
    <section class="admin-crm-page">
      ${pageHead("ПРОДАЖІ", "Заявки", `${number(result.total)} за поточними умовами.`)}
      ${filterBar(filters, {
        placeholder: "№, ім’я, телефон, компанія або текст",
        selects: [
          { name: "type", label: "Тип", all: "Усі типи", options: Object.fromEntries(Object.entries(LEAD_TYPE).map(([key, label]) => [key, { label }])) },
          { name: "status", label: "Статус", all: "Усі статуси", options: LEAD_STATUS }
        ]
      })}
      ${result.leads.length ? table(["Заявка", "Тип", "Контакт", "Запит", "Статус", "Відповідальний"], rows, "admin-crm-table--leads")
        : emptyState("Заявок не знайдено", "Звернення з форм сайту з’являться тут автоматично.")}
      ${pagination(result)}
    </section>`;
  return { html, bind: container => bindList(container) };
}

export async function createLeadDetailView({ api, leadNumber, signal }) {
  const detail = await api.crm.getLead(leadNumber, { signal });
  if (!detail?.lead) return notFound("Заявку не знайдено", "/admin/leads", "До заявок");
  const { lead, customer } = detail;
  const html = `
    <section class="admin-crm-detail" data-crm-detail>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/leads" data-admin-link class="admin-back-link">← Усі заявки</a>
          <p class="admin-kicker">${escape((LEAD_TYPE[lead.type] || "").toUpperCase())} · ${formatDateTime(lead.createdAt)}</p>
          <h1>Заявка № ${lead.number}</h1>
          <div class="admin-editor-meta">${statusBadge(LEAD_STATUS, lead.status)}${lead.pageUrl ? `<span>Сторінка: <code>${escape(lead.pageUrl)}</code></span>` : ""}</div>
        </div>
      </header>
      <div class="admin-crm-layout">
        <div class="admin-crm-main">
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">ЗАПИТ</p><h2>${escape(lead.subject || "Без теми")}</h2></div></header>
            <p class="admin-crm-text">${lead.message ? multiline(lead.message) : `<span class="admin-muted">Без тексту</span>`}</p>
          </section>
          ${lead.specLines.length ? `
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">СПЕЦИФІКАЦІЯ</p><h2>${number(lead.specLines.length)} позицій</h2></div>
                <button class="admin-button admin-button--secondary" type="button" data-copy-spec>Копіювати</button></header>
              <div class="admin-crm-items">${lead.specLines.map((line, index) => `
                <div class="admin-crm-item"><div><strong><a href="/admin/products?q=${encodeURIComponent(line.code)}" data-admin-link>${escape(line.code)}</a></strong>${line.note ? `<small>${escape(line.note)}</small>` : ""}</div>
                <span class="admin-crm-num">${line.quantity === null ? "—" : `${number(line.quantity)} шт.`}</span><small class="admin-crm-num">${index + 1}</small></div>`).join("")}
              </div>
            </section>` : ""}
          <form class="admin-panel" data-crm-form>
            <header class="admin-panel__head"><div><p class="admin-kicker">ОБРОБКА</p><h2>Статус</h2></div></header>
            <div class="admin-form-grid">
              ${selectField("status", "Статус", LEAD_STATUS, lead.status)}
              ${staffField(detail.staff, lead.assignedTo)}
              <label class="admin-field admin-field--full"><span>Коментар менеджера</span><textarea name="managerComment" maxlength="8000">${escape(lead.managerComment)}</textarea></label>
            </div>
            <footer class="admin-crm-form-actions"><button class="admin-button admin-button--primary" type="submit">Зберегти</button></footer>
          </form>
        </div>
        <aside class="admin-crm-side">
          ${customerCard(customer, { email: lead.contactEmail, name: lead.contactName, phone: lead.contactPhone, company: lead.company })}
          ${timeline(detail.activity)}
        </aside>
      </div>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => {
      container.querySelector("[data-copy-spec]")?.addEventListener("click", async () => {
        const text = lead.specLines.map(line => [line.code, line.quantity ?? "", line.note ?? ""].join("\t").trim()).join("\n");
        try { await navigator.clipboard.writeText(text); showToast(container, "Специфікацію скопійовано."); }
        catch { showToast(container, "Не вдалося скопіювати.", true); }
      });
      bindDetail(container, {
        save: patch => api.crm.updateLead(lead.number, patch, lead.updatedAt),
        note: text => api.crm.addNote("lead", lead.number, text),
        fields: ["status", "assignedTo", "managerComment"]
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export async function createCustomersListView({ api, search = location.search, signal }) {
  const filters = parseListFilters(search, []);
  const result = await api.crm.listCustomers(filters, { signal });
  const rows = result.customers.map(customer => `
    <tr>
      <td><a class="admin-crm-id" href="/admin/customers/${customer.id}" data-admin-link>${escape(customer.name || "Без імені")}</a><small>${escape([customer.company, customer.city].filter(Boolean).join(" · "))}</small></td>
      <td>${phoneLink(customer.phone)}${customer.email ? `<small>${escape(customer.email)}</small>` : ""}</td>
      <td class="admin-crm-num">${number(customer.ordersCount)}</td>
      <td class="admin-crm-num">${number(customer.leadsCount)}</td>
      <td class="admin-crm-num">${Number(customer.ordersTotal) ? money(customer.ordersTotal) : "—"}</td>
      <td>${formatDateTime(customer.lastActivityAt)}</td>
    </tr>`).join("");
  const html = `
    <section class="admin-crm-page">
      ${pageHead("ПРОДАЖІ", "Клієнти", `${number(result.total)} карток. Клієнт створюється автоматично з замовлення або заявки — за номером телефону.`, `
        <div class="admin-crm-head-actions">
          <button class="admin-button admin-button--secondary" type="button" data-crm-export ${result.total ? "" : "disabled"}>${icon("download")}Експорт CSV</button>
        </div>`)}
      ${filterBar(filters, { placeholder: "Ім’я, телефон, email або компанія", selects: [] })}
      ${result.customers.length ? table(["Клієнт", "Контакти", "Замовлень", "Заявок", "Сума замовлень", "Остання активність"], rows, "admin-crm-table--customers")
        : emptyState("Клієнтів не знайдено", "Картки з’являться після першого замовлення або заявки.")}
      ${pagination(result)}
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => {
      bindList(container);
      bindExport(container, {
        fetchPage: page => api.crm.exportCustomers(filters, page),
        filename: "kliienty",
        columns: CUSTOMER_CSV_COLUMNS
      });
    }
  };
}

export async function createCustomerDetailView({ api, customerId, signal }) {
  const detail = await api.crm.getCustomer(customerId, { signal });
  if (!detail?.customer) return notFound("Клієнта не знайдено", "/admin/customers", "До клієнтів");
  const { customer } = detail;
  const html = `
    <section class="admin-crm-detail" data-crm-detail>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/customers" data-admin-link class="admin-back-link">← Усі клієнти</a>
          <p class="admin-kicker">КЛІЄНТ З ${formatDate(customer.createdAt)}</p>
          <h1>${escape(customer.name || "Без імені")}</h1>
          <div class="admin-editor-meta"><span>${phoneLink(customer.phone)}</span><span>${number(customer.ordersCount)} замовл. · ${number(customer.leadsCount)} заявок · ${Number(customer.ordersTotal) ? money(customer.ordersTotal) : "0 грн"}</span></div>
        </div>
        <div class="admin-editor-head__actions"><a class="admin-button admin-button--secondary" href="/admin/orders/new?customer=${encodeURIComponent(customer.id)}" data-admin-link>${icon("plus")}Нове замовлення</a></div>
      </header>
      <div class="admin-crm-layout">
        <div class="admin-crm-main">
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">ІСТОРІЯ</p><h2>Замовлення</h2></div></header>
            ${detail.orders.length ? `<div class="admin-crm-items">${detail.orders.map(order => `
              <div class="admin-crm-item"><div><strong><a href="/admin/orders/${order.number}" data-admin-link>№ ${order.number}</a></strong><small>${formatDateTime(order.createdAt)}</small></div>
              <span>${statusBadge(ORDER_STATUS, order.status)}</span><strong class="admin-crm-num">${orderTotal(order)}</strong></div>`).join("")}</div>`
              : `<p class="admin-crm-text admin-muted">Замовлень ще немає.</p>`}
          </section>
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">ІСТОРІЯ</p><h2>Заявки</h2></div></header>
            ${detail.leads.length ? `<div class="admin-crm-items">${detail.leads.map(lead => `
              <div class="admin-crm-item"><div><strong><a href="/admin/leads/${lead.number}" data-admin-link>№ ${lead.number} · ${escape(LEAD_TYPE[lead.type] || "")}</a></strong><small>${escape(lead.preview || "")}</small></div>
              <span>${statusBadge(LEAD_STATUS, lead.status)}</span><small class="admin-crm-num">${formatDate(lead.createdAt)}</small></div>`).join("")}</div>`
              : `<p class="admin-crm-text admin-muted">Заявок ще немає.</p>`}
          </section>
          <form class="admin-panel" data-crm-form>
            <header class="admin-panel__head"><div><p class="admin-kicker">КАРТКА</p><h2>Дані клієнта</h2></div></header>
            <div class="admin-form-grid">
              ${textField("name", "Ім’я", customer.name, 160)}
              <label class="admin-field"><span>Телефон</span><input value="${escape(customer.phone)}" disabled><small>Телефон — ключ картки, змінюється лише новим зверненням.</small></label>
              ${textField("email", "Email", customer.email, 254)}
              ${textField("company", "Компанія", customer.company, 200)}
              ${textField("city", "Місто", customer.city, 120)}
              <label class="admin-field admin-field--full"><span>Нотатки</span><textarea name="notes" maxlength="8000">${escape(customer.notes)}</textarea></label>
            </div>
            <footer class="admin-crm-form-actions"><button class="admin-button admin-button--primary" type="submit">Зберегти</button></footer>
          </form>
        </div>
        <aside class="admin-crm-side">${timeline(detail.activity, { showReferences: true })}</aside>
      </div>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return {
    html,
    bind: container => bindDetail(container, {
      save: patch => api.crm.updateCustomer(customer.id, patch, customer.updatedAt),
      note: text => api.crm.addNote("customer", customer.id, text),
      fields: ["name", "email", "company", "city", "notes"]
    })
  };
}

// ---------------------------------------------------------------------------
// Dashboard strip
// ---------------------------------------------------------------------------
export function renderCrmOverview(overview) {
  if (!overview) return "";
  const cell = (label, value, note, href, tone = "") => `
    <a class="admin-crm-stat${tone ? ` admin-crm-stat--${tone}` : ""}" href="${href}" data-admin-link>
      <span>${label}</span><strong>${value}</strong><small>${note}</small>
    </a>`;
  return `
    <section class="admin-crm-overview" aria-labelledby="crm-overview-title">
      <header><h2 id="crm-overview-title">Продажі</h2><a href="/admin/orders" data-admin-link>Усі замовлення${icon("arrow")}</a></header>
      <div>
        ${cell("Нові замовлення", number(overview.newOrders), "Потребують підтвердження", "/admin/orders?status=new", overview.newOrders ? "warning" : "")}
        ${cell("В роботі", number(overview.activeOrders), "Підтверджені, комплектуються, в дорозі", "/admin/orders?status=confirmed")}
        ${cell("Сьогодні", number(overview.ordersToday), "Замовлень за день", "/admin/orders")}
        ${cell("Нові заявки", number(overview.newLeads), "Звернення, специфікації, дзвінки", "/admin/leads?status=new", overview.newLeads ? "warning" : "")}
        ${cell("Виконано за 30 днів", money(overview.revenue30d), "Сума виконаних замовлень", "/admin/orders?status=completed")}
        ${cell("Клієнтів", number(overview.customers), "Карток у базі", "/admin/customers")}
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function parseListFilters(search, keys) {
  const params = new URLSearchParams(search);
  const filters = { query: params.get("q")?.trim() || "", page: Math.max(1, Number(params.get("page")) || 1), pageSize: 50 };
  for (const key of keys) filters[key] = params.get(key) || "";
  return Object.freeze(filters);
}

function pageHead(kicker, title, lead, actions = "") {
  return `<header class="admin-page-head"><div><p class="admin-kicker">${kicker}</p><h1>${title}</h1><p>${escape(lead)}</p></div>${actions}</header>`;
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

function pagination(result) {
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  if (pages <= 1) return "";
  return `<nav class="admin-pagination" aria-label="Сторінки">
    <button type="button" data-page="${result.page - 1}" ${result.page <= 1 ? "disabled" : ""}>Назад</button>
    <span>Сторінка <strong>${result.page}</strong> з ${pages}</span>
    <button type="button" data-page="${result.page + 1}" ${result.page >= pages ? "disabled" : ""}>Далі</button>
  </nav>`;
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

function staffField(staff, value) {
  return `<label class="admin-field"><span>Відповідальний</span><select name="assignedTo"><option value="">Не призначено</option>${(staff || []).map(person =>
    `<option value="${person.id}" ${person.id === value ? "selected" : ""}>${escape(person.name)}</option>`).join("")}</select></label>`;
}

function textField(name, label, value, maxLength, full = false) {
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${label}</span><input name="${name}" value="${escape(value || "")}" maxlength="${maxLength}"></label>`;
}

function customerCard(customer, contact) {
  return `
    <section class="admin-panel admin-crm-contact">
      <header class="admin-panel__head"><div><p class="admin-kicker">КЛІЄНТ</p><h2>${escape(contact.name || customer.name)}</h2></div>
        <a href="/admin/customers/${customer.id}" data-admin-link>Картка${icon("arrow")}</a></header>
      <dl>
        <div><dt>Телефон</dt><dd>${phoneLink(contact.phone || customer.phone)}</dd></div>
        ${contact.email || customer.email ? `<div><dt>Email</dt><dd><a href="mailto:${escape(contact.email || customer.email)}">${escape(contact.email || customer.email)}</a></dd></div>` : ""}
        ${contact.company ? `<div><dt>Компанія</dt><dd>${escape(contact.company)}</dd></div>` : ""}
        <div><dt>Історія</dt><dd>${number(customer.ordersCount)} замовл. · ${number(customer.leadsCount)} заявок</dd></div>
      </dl>
    </section>`;
}

function timeline(activity, { showReferences = false } = {}) {
  return `
    <section class="admin-panel admin-crm-timeline">
      <header class="admin-panel__head"><div><p class="admin-kicker">ІСТОРІЯ</p><h2>Нотатки й події</h2></div></header>
      <form class="admin-crm-note" data-crm-note>
        <label class="admin-sr-only" for="crm-note-input">Нова нотатка</label>
        <textarea id="crm-note-input" name="note" maxlength="4000" placeholder="Дзвінок, домовленість, нагадування…" required></textarea>
        <button class="admin-button admin-button--secondary" type="submit">Додати нотатку</button>
      </form>
      <ol data-crm-timeline data-show-references="${showReferences}">${timelineItems(activity, { showReferences })}</ol>
    </section>`;
}

const TIMELINE_KIND = Object.freeze({ created: "Створено", status: "Статус", note: "Нотатка", update: "Зміни" });

function timelineItems(activity, { showReferences = false } = {}) {
  const kindLabel = TIMELINE_KIND;
  if (!activity?.length) return `<li class="admin-muted">Подій ще немає.</li>`;
  return activity.map(entry => {
    const statusChange = entry.data?.status;
    const statusText = statusChange
      ? `${escape(ORDER_STATUS[statusChange.from]?.label || LEAD_STATUS[statusChange.from]?.label || statusChange.from)} → ${escape(ORDER_STATUS[statusChange.to]?.label || LEAD_STATUS[statusChange.to]?.label || statusChange.to)}`
      : "";
    const reference = !showReferences ? "" : entry.orderNumber ? ` · <a href="/admin/orders/${entry.orderNumber}" data-admin-link>№ ${entry.orderNumber}</a>`
      : entry.leadNumber ? ` · <a href="/admin/leads/${entry.leadNumber}" data-admin-link>заявка № ${entry.leadNumber}</a>` : "";
    return `<li class="admin-crm-event admin-crm-event--${escape(entry.kind)}">
      <header><strong>${escape(kindLabel[entry.kind] || entry.kind)}</strong>${reference}<time>${formatDateTime(entry.createdAt)}</time></header>
      ${entry.kind === "note" ? `<p>${multiline(entry.body)}</p>` : `<p>${escape(entry.body)}${statusText ? `: ${statusText}` : ""}</p>`}
      ${itemsDiff(entry.data)}
      <small>${escape(entry.actor || (entry.kind === "created" ? "Сайт" : ""))}</small>
    </li>`;
  }).join("");
}

function itemsDiff(data) {
  const items = data?.items;
  if (!items) return "";
  const price = value => value === null || value === undefined ? "уточнюється" : money(value);
  const rows = [
    ...(items.added || []).map(line => `<li><b>+</b> ${escape(line.title)} × ${number(line.quantity)}, ${escape(price(line.unitAmount))}</li>`),
    ...(items.removed || []).map(line => `<li><b>−</b> ${escape(line.title)} × ${number(line.quantity)}</li>`),
    ...(items.changed || []).map(line => {
      const changes = [];
      if (line.from.quantity !== line.to.quantity) changes.push(`${number(line.from.quantity)} → ${number(line.to.quantity)} шт.`);
      if (String(line.from.unitAmount) !== String(line.to.unitAmount)) changes.push(`${price(line.from.unitAmount)} → ${price(line.to.unitAmount)}`);
      return `<li><b>~</b> ${escape(line.title)}: ${escape(changes.join(", "))}</li>`;
    })
  ];
  const total = data.total ? `<li class="admin-crm-event__total">Сума: ${escape(money(data.total.from))} → ${escape(money(data.total.to))}</li>` : "";
  return rows.length ? `<ul class="admin-crm-event__diff">${rows.join("")}${total}</ul>` : "";
}

function bindList(container) {
  const form = container.querySelector("[data-crm-filters]");
  form?.addEventListener("submit", event => {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (String(value).trim()) params.set(key, String(value).trim());
    goTo(`${location.pathname}${params.size ? `?${params}` : ""}`);
  });
  form?.querySelectorAll("select").forEach(select => select.addEventListener("change", () => form.requestSubmit()));
  container.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => {
    const params = new URLSearchParams(location.search);
    params.set("page", button.dataset.page);
    goTo(`${location.pathname}?${params}`);
  }));
}

function bindDetail(container, { save, note, fields }) {
  const form = container.querySelector("[data-crm-form]");
  const initial = form ? snapshot(form, fields) : null;
  const saveButton = form?.querySelector('[type="submit"]');
  const markDirty = () => { if (saveButton) saveButton.disabled = JSON.stringify(snapshot(form, fields)) === JSON.stringify(initial); };
  form?.addEventListener("input", markDirty);
  form?.addEventListener("change", markDirty);
  markDirty();

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const current = snapshot(form, fields);
    const patch = Object.fromEntries(Object.entries(current).filter(([key, value]) => value !== initial[key]));
    if (!Object.keys(patch).length) return;
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      await save(patch);
      showToast(container, "Збережено.");
      setTimeout(() => goTo(location.pathname, { replace: true }), 350);
    } catch (error) {
      showToast(container, error.message, true);
      saveButton.disabled = false;
      saveButton.textContent = "Зберегти";
    }
  });

  const noteForm = container.querySelector("[data-crm-note]");
  noteForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const textarea = noteForm.querySelector("textarea");
    const button = noteForm.querySelector("button");
    const text = textarea.value.trim();
    if (!text) return;
    button.disabled = true;
    try {
      const activity = await note(text);
      const list = container.querySelector("[data-crm-timeline]");
      list.innerHTML = timelineItems(activity, { showReferences: list.dataset.showReferences === "true" });
      textarea.value = "";
      showToast(container, "Нотатку додано.");
    } catch (error) {
      showToast(container, error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

function snapshot(form, fields) {
  const data = new FormData(form);
  return Object.fromEntries(fields.filter(name => data.has(name)).map(name => [name, String(data.get(name) ?? "")]));
}

// The shell router listens to clicks on [data-admin-link]; programmatic navigation goes through the same path.
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

function orderTotal(order) {
  const total = Number(order.itemsTotal) || 0;
  if (!order.hasUnpricedItems) return money(total);
  return total ? `${money(total)} + уточн.` : "Уточнюється";
}

function prettyPhone(phone) {
  return String(phone || "").replace(/^\+380(\d{2})(\d{3})(\d{2})(\d{2})$/, "+380 $1 $2 $3 $4");
}

function phoneLink(phone) {
  if (!phone) return "";
  return `<a href="tel:${escape(phone)}">${escape(prettyPhone(phone))}</a>`;
}

function multiline(text) {
  return escape(text).replace(/\n/g, "<br>");
}

function money(value) {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(value) || 0)} грн`;
}

function plainMoney(value) {
  return new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function number(value) {
  return new Intl.NumberFormat("uk-UA").format(Number(value) || 0);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function escape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
