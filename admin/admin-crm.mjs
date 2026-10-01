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
      <td><a class="admin-crm-id" href="/admin/orders/${order.number}" data-admin-link>№ ${order.number}</a><small>${formatDateTime(order.createdAt)}</small></td>
      <td><strong>${escape(order.contactName)}</strong><small>${phoneLink(order.contactPhone)}</small></td>
      <td>${escape(DELIVERY[order.deliveryMethod] || "")}${order.deliveryCity ? `<small>${escape(order.deliveryCity)}</small>` : ""}</td>
      <td class="admin-crm-num">${number(order.itemsCount)}</td>
      <td class="admin-crm-num">${orderTotal(order)}</td>
      <td>${statusBadge(ORDER_STATUS, order.status)}</td>
      <td>${order.assignedTo ? escape(order.assignedTo) : `<span class="admin-muted">—</span>`}</td>
    </tr>`).join("");
  const html = `
    <section class="admin-crm-page">
      ${pageHead("ПРОДАЖІ", "Замовлення", `${number(result.total)} за поточними умовами.`)}
      ${filterBar(filters, {
        placeholder: "№, ім’я, телефон або email",
        selects: [{ name: "status", label: "Статус", all: "Усі статуси", options: ORDER_STATUS }]
      })}
      ${result.orders.length ? table(["Замовлення", "Клієнт", "Отримання", "Шт.", "Сума", "Статус", "Відповідальний"], rows, "admin-crm-table--orders")
        : emptyState("Замовлень не знайдено", filters.query || filters.status ? "Змініть пошук або фільтр." : "Нові замовлення з сайту з’являться тут автоматично.")}
      ${pagination(result)}
    </section>`;
  return { html, bind: container => bindList(container) };
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
      </header>
      <div class="admin-crm-layout">
        <div class="admin-crm-main">
          <section class="admin-panel">
            <header class="admin-panel__head"><div><p class="admin-kicker">СКЛАД</p><h2>Товари · ${number(order.itemsCount)} шт.</h2></div></header>
            <div class="admin-crm-items">
              ${items.map(item => `
                <div class="admin-crm-item">
                  <div><strong>${item.productAvailable ? `<a href="/admin/products/${encodeURIComponent(item.legacyId)}" data-admin-link>${escape(item.title)}</a>` : escape(item.title)}</strong>
                    <small>${escape([item.brand, item.sku].filter(Boolean).join(" · "))}</small></div>
                  <span class="admin-crm-num">${number(item.quantity)} × ${item.unitAmount === null ? `<em>${escape(PRICE_STATUS[item.priceStatus] || "за запитом")}</em>` : money(item.unitAmount)}</span>
                  <strong class="admin-crm-num">${item.lineTotal === null ? "—" : money(item.lineTotal)}</strong>
                </div>`).join("")}
              <div class="admin-crm-item admin-crm-item--total"><span>Разом</span><span></span><strong class="admin-crm-num">${orderTotal(order)}</strong></div>
            </div>
            ${order.hasUnpricedItems ? `<p class="admin-panel-note">Є позиції без ціни — уточніть вартість під час підтвердження.</p>` : ""}
          </section>
          ${order.customerComment ? `<section class="admin-panel"><header class="admin-panel__head"><div><p class="admin-kicker">КОМЕНТАР КЛІЄНТА</p></div></header><p class="admin-crm-text">${multiline(order.customerComment)}</p></section>` : ""}
          <form class="admin-panel" data-crm-form>
            <header class="admin-panel__head"><div><p class="admin-kicker">ОБРОБКА</p><h2>Статус і доставка</h2></div></header>
            <div class="admin-form-grid">
              ${selectField("status", "Статус", ORDER_STATUS, order.status)}
              ${staffField(detail.staff, order.assignedTo)}
              ${selectField("deliveryMethod", "Отримання", Object.fromEntries(Object.entries(DELIVERY).map(([key, label]) => [key, { label }])), order.deliveryMethod)}
              ${textField("deliveryCity", "Місто", order.deliveryCity, 120)}
              ${textField("deliveryPoint", "Відділення або адреса", order.deliveryPoint, 240, true)}
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
    bind: container => bindDetail(container, {
      save: patch => api.crm.updateOrder(order.number, patch, order.updatedAt),
      note: text => api.crm.addNote("order", order.number, text),
      fields: ["status", "assignedTo", "deliveryMethod", "deliveryCity", "deliveryPoint", "managerComment"]
    })
  };
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
      ${pageHead("ПРОДАЖІ", "Клієнти", `${number(result.total)} карток. Клієнт створюється автоматично з замовлення або заявки — за номером телефону.`)}
      ${filterBar(filters, { placeholder: "Ім’я, телефон, email або компанія", selects: [] })}
      ${result.customers.length ? table(["Клієнт", "Контакти", "Замовлень", "Заявок", "Сума замовлень", "Остання активність"], rows, "admin-crm-table--customers")
        : emptyState("Клієнтів не знайдено", "Картки з’являться після першого замовлення або заявки.")}
      ${pagination(result)}
    </section>`;
  return { html, bind: container => bindList(container) };
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

function pageHead(kicker, title, lead) {
  return `<header class="admin-page-head"><div><p class="admin-kicker">${kicker}</p><h1>${title}</h1><p>${escape(lead)}</p></div></header>`;
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
      <small>${escape(entry.actor || (entry.kind === "created" ? "Сайт" : ""))}</small>
    </li>`;
  }).join("");
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

function phoneLink(phone) {
  if (!phone) return "";
  const pretty = String(phone).replace(/^\+380(\d{2})(\d{3})(\d{2})(\d{2})$/, "+380 $1 $2 $3 $4");
  return `<a href="tel:${escape(phone)}">${escape(pretty)}</a>`;
}

function multiline(text) {
  return escape(text).replace(/\n/g, "<br>");
}

function money(value) {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(value) || 0)} грн`;
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
