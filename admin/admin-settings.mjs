import { icon } from "/admin/admin-icons.mjs";

// Shop settings: stores and contacts, checkout options, social links, company name and order
// notification recipients. Each section saves on its own (admin_update_settings) with an
// optimistic lock; the storefront reads the public sections through get_site_settings.

const SOCIAL = Object.freeze([
  ["instagram", "Instagram"], ["facebook", "Facebook"], ["youtube", "YouTube"], ["telegram", "Telegram"], ["viber", "Viber"]
]);
const DELIVERY_LABELS = Object.freeze({ carrier: "Доставка перевізником", pickup: "Самовивіз" });
const MAX_STORES = 10;

export async function createSettingsView({ api, signal }) {
  const { canEdit, sections } = await api.settings.get({ signal });
  const section = key => sections?.[key] || { value: null, updatedAt: null };
  const stores = section("stores");
  const checkout = section("checkout");
  const social = section("social");
  const company = section("company");
  const notifications = section("notifications");

  const html = `
    <section class="admin-crm-page admin-settings" data-settings>
      <header class="admin-page-head"><div><p class="admin-kicker">СИСТЕМА</p><h1>Налаштування магазину</h1>
        <p>Контакти, доставка й соцмережі, які бачать покупці на сайті.${canEdit ? "" : " Ваша роль може лише переглядати."}</p></div></header>

      <form class="admin-panel" data-settings-form="stores">
        <header class="admin-panel__head"><div><p class="admin-kicker">МАГАЗИНИ</p><h2>Адреси й контакти</h2></div>
          ${canEdit ? `<button class="admin-button admin-button--secondary" type="button" data-store-add>Додати магазин</button>` : ""}</header>
        <p class="admin-panel-note">Перший магазин вважається основним: його телефон і пошта стоять у шапці та підвалі сайту. Телефони й рядки графіка пишіть з нового рядка.</p>
        <div class="admin-settings-stores" data-store-list>${(stores.value || []).map(store => storeFieldset(store, false)).join("")}</div>
        <template data-store-template>${storeFieldset({ pickup: true }, true)}</template>
        ${saveBar(canEdit, stores.updatedAt)}
      </form>

      <form class="admin-panel" data-settings-form="checkout">
        <header class="admin-panel__head"><div><p class="admin-kicker">ОФОРМЛЕННЯ</p><h2>Доставка й оплата</h2></div></header>
        ${(checkout.value?.deliveryMethods || []).map(method => `
          <fieldset class="admin-settings-group" data-delivery="${escape(method.id)}">
            <legend>${escape(DELIVERY_LABELS[method.id] || method.id)}</legend>
            <div class="admin-form-grid">
              ${checkbox("enabled", "Показувати покупцям", method.enabled !== false)}
              ${textField("title", "Назва", method.title, 120, { required: true })}
              ${textField("description", "Пояснення", method.description, 300, { full: true })}
            </div>
          </fieldset>`).join("")}
        <div class="admin-form-grid">
          ${textField("paymentTitle", "Оплата: заголовок", checkout.value?.paymentTitle, 120, { required: true })}
          ${textArea("paymentDescription", "Оплата: пояснення", checkout.value?.paymentDescription, 500)}
        </div>
        <p class="admin-panel-note">Для самовивозу покупець обирає магазин зі списку вище (ті, де увімкнено самовивіз).</p>
        ${saveBar(canEdit, checkout.updatedAt)}
      </form>

      <form class="admin-panel" data-settings-form="social">
        <header class="admin-panel__head"><div><p class="admin-kicker">СОЦМЕРЕЖІ</p><h2>Посилання в підвалі сайту</h2></div></header>
        <div class="admin-form-grid">
          ${SOCIAL.map(([key, label]) => textField(key, label, social.value?.[key], 500, { type: "url", placeholder: "https://" })).join("")}
        </div>
        <p class="admin-panel-note">Порожні поля не показуються. Якщо всі порожні, блок соцмереж на сайті ховається.</p>
        ${saveBar(canEdit, social.updatedAt)}
      </form>

      <form class="admin-panel" data-settings-form="company">
        <header class="admin-panel__head"><div><p class="admin-kicker">КОМПАНІЯ</p><h2>Назва в підвалі</h2></div></header>
        <div class="admin-form-grid">${textField("name", "Назва компанії", company.value?.name, 120, { required: true, full: true })}</div>
        ${saveBar(canEdit, company.updatedAt)}
      </form>

      <form class="admin-panel" data-settings-form="notifications">
        <header class="admin-panel__head"><div><p class="admin-kicker">СПОВІЩЕННЯ</p><h2>Кому повідомляти про нові замовлення</h2></div></header>
        <div class="admin-form-grid">
          ${textArea("emails", "Email (кожен з нового рядка)", (notifications.value?.emails || []).join("\n"), 2600)}
          ${textArea("telegramChatIds", "Telegram chat id (кожен з нового рядка)", (notifications.value?.telegramChatIds || []).join("\n"), 260)}
          ${checkbox("notifyOrders", "Повідомляти про замовлення", notifications.value?.notifyOrders !== false)}
          ${checkbox("notifyLeads", "Повідомляти про заявки на дзвінок", notifications.value?.notifyLeads !== false)}
        </div>
        <div class="admin-notify-status" data-notify-status><p class="admin-panel-note">Перевіряємо стан відправки…</p></div>
        ${saveBar(canEdit, notifications.updatedAt)}
      </form>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;

  return { html, bind: container => bindSettings(container, { api, canEdit, sections }) };
}

function storeFieldset(store, isNew) {
  return `
    <fieldset class="admin-settings-group" data-store>
      <legend>${isNew ? "Новий магазин" : escape(store.title || store.city || store.id)}</legend>
      <div class="admin-form-grid">
        ${isNew
          ? textField("id", "Код", "", 40, { required: true, placeholder: "lviv", hint: "Латиниця, цифри й дефіси. Після збереження не змінюється." })
          : `<input type="hidden" name="id" value="${escape(store.id)}"><div class="admin-field"><span>Код</span><output class="admin-taxonomy-readonly">${escape(store.id)}</output></div>`}
        ${textField("city", "Місто", store.city, 80, { required: true })}
        ${textField("title", "Назва", store.title, 120, { required: true, placeholder: "Магазин у Києві" })}
        ${textField("address", "Адреса", store.address, 240, { required: true, full: true })}
        ${textField("mapQuery", "Точка на мапі", store.mapQuery, 240, { full: true, hint: "Що шукати в Google Maps. Порожнє поле: використовується адреса." })}
        ${textArea("phones", "Телефони", (store.phones || []).join("\n"), 220)}
        ${textField("email", "Email", store.email, 254, { type: "email" })}
        ${textArea("hours", "Графік роботи", (store.hours || []).join("\n"), 580)}
        ${checkbox("pickup", "Доступний самовивіз", store.pickup !== false)}
      </div>
      <footer class="admin-settings-store-actions">
        <button class="admin-button admin-button--ghost" type="button" data-store-up>Вище</button>
        <button class="admin-button admin-button--ghost admin-settings-remove" type="button" data-store-remove>Прибрати магазин</button>
      </footer>
    </fieldset>`;
}

function bindSettings(container, { api, canEdit, sections }) {
  bindNotificationStatus(container, { api, canEdit });
  const forms = [...container.querySelectorAll("[data-settings-form]")];
  if (!canEdit) {
    forms.forEach(form => form.querySelectorAll("input, select, textarea, button").forEach(control => { control.disabled = true; }));
    container.querySelectorAll("[data-store-up], [data-store-remove]").forEach(button => { button.hidden = true; });
    return;
  }
  bindStores(container.querySelector('[data-settings-form="stores"]'));
  for (const form of forms) {
    const key = form.dataset.settingsForm;
    const saveButton = form.querySelector('[type="submit"]');
    const initial = JSON.stringify(READERS[key](form));
    const markDirty = () => { saveButton.disabled = JSON.stringify(READERS[key](form)) === initial; };
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("settings:changed", markDirty);
    markDirty();
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      saveButton.disabled = true;
      saveButton.textContent = "Зберігаємо…";
      try {
        await api.settings.update(key, READERS[key](form), sections?.[key]?.updatedAt || null);
        showToast(container, "Збережено. Сайт покаже зміни після оновлення сторінки.");
        setTimeout(() => goTo(location.pathname, { replace: true }), 900);
      } catch (error) {
        showToast(container, error.message, true);
        saveButton.disabled = false;
        saveButton.textContent = "Зберегти";
      }
    });
  }
}

function bindStores(form) {
  const list = form.querySelector("[data-store-list]");
  const template = form.querySelector("[data-store-template]");
  const addButton = form.querySelector("[data-store-add]");
  const changed = () => {
    const items = list.querySelectorAll("[data-store]");
    items.forEach((item, index) => {
      item.querySelector("[data-store-up]").disabled = index === 0;
      item.querySelector("[data-store-remove]").disabled = items.length === 1;
    });
    addButton.disabled = items.length >= MAX_STORES;
    form.dispatchEvent(new CustomEvent("settings:changed"));
  };
  addButton.addEventListener("click", () => {
    const fieldset = template.content.firstElementChild.cloneNode(true);
    list.append(fieldset);
    changed();
    fieldset.querySelector("input")?.focus();
  });
  list.addEventListener("click", event => {
    const item = event.target.closest("[data-store]");
    if (!item) return;
    if (event.target.closest("[data-store-remove]")) { item.remove(); changed(); }
    if (event.target.closest("[data-store-up]") && item.previousElementSibling) { item.previousElementSibling.before(item); changed(); }
  });
  changed();
}

const lines = value => String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const field = (scope, name) => scope.querySelector(`[name="${name}"]`);
const text = (scope, name) => String(field(scope, name)?.value || "").trim();
const checked = (scope, name) => Boolean(field(scope, name)?.checked);

const READERS = Object.freeze({
  stores: form => [...form.querySelectorAll("[data-store-list] [data-store]")].map(item => ({
    id: text(item, "id"),
    city: text(item, "city"),
    title: text(item, "title"),
    address: text(item, "address"),
    mapQuery: text(item, "mapQuery"),
    phones: lines(field(item, "phones")?.value),
    email: text(item, "email"),
    hours: lines(field(item, "hours")?.value),
    pickup: checked(item, "pickup")
  })),
  checkout: form => ({
    deliveryMethods: [...form.querySelectorAll("[data-delivery]")].map(item => ({
      id: item.dataset.delivery,
      enabled: checked(item, "enabled"),
      title: text(item, "title"),
      description: text(item, "description")
    })),
    paymentTitle: text(form, "paymentTitle"),
    paymentDescription: text(form, "paymentDescription")
  }),
  social: form => Object.fromEntries(SOCIAL.map(([key]) => [key, text(form, key)])),
  company: form => ({ name: text(form, "name") }),
  notifications: form => ({
    emails: lines(field(form, "emails")?.value),
    telegramChatIds: lines(field(form, "telegramChatIds")?.value),
    notifyOrders: checked(form, "notifyOrders"),
    notifyLeads: checked(form, "notifyLeads")
  })
});

function saveBar(canEdit, updatedAt) {
  if (!canEdit) return `<p class="admin-panel-note">Змінювати налаштування можуть власник і адміністратор.</p>`;
  return `<footer class="admin-crm-form-actions admin-settings-actions"><small>${updatedAt ? `Оновлено ${formatDateTime(updatedAt)}` : ""}</small><button class="admin-button admin-button--primary" type="submit">Зберегти</button></footer>`;
}

function checkbox(name, label, value) {
  return `<label class="admin-field admin-settings-check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}><span>${label}</span></label>`;
}

function textField(name, label, value, maxLength, { full = false, type = "text", placeholder = "", hint = "", required = false } = {}) {
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${label}</span>
    <input name="${name}" type="${type}" value="${escape(value ?? "")}" maxlength="${maxLength}" ${placeholder ? `placeholder="${escape(placeholder)}"` : ""} ${required ? "required" : ""}>
    ${hint ? `<small>${escape(hint)}</small>` : ""}</label>`;
}

function textArea(name, label, value, maxLength) {
  return `<label class="admin-field"><span>${label}</span><textarea name="${name}" maxlength="${maxLength}" rows="3">${escape(value ?? "")}</textarea></label>`;
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

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

// Notification delivery: real status from admin_notifications_status, recent log and a test message.
const NOTIFY_STATUS = Object.freeze({
  queued: ["У черзі", "info"], sent: ["Надіслано", "success"], skipped: ["Пропущено", "warning"], error: ["Помилка", "danger"]
});
const NOTIFY_KIND = Object.freeze({ order: "Замовлення", lead: "Заявка", test: "Тест" });

function bindNotificationStatus(container, { api, canEdit }) {
  const box = container.querySelector("[data-notify-status]");
  if (!box || !api.settings.notificationsStatus) return;
  if (!canEdit) {
    box.replaceChildren();
    box.insertAdjacentHTML("beforeend", `<p class="admin-panel-note">Стан відправки бачать власник і адміністратор.</p>`);
    return;
  }
  let timer = null;
  const render = status => {
    const log = status.log || [];
    const missing = [
      status.pgNet ? "" : "розширення pg_net",
      status.functionUrlSet ? "" : "адреса функції crm-notify",
      status.secretSet ? "" : "секрет CRM_NOTIFY_SECRET"
    ].filter(Boolean);
    box.replaceChildren();
    box.insertAdjacentHTML("beforeend", `
      <div class="admin-notify-status__head">
        <p>${status.configured
          ? `<span class="admin-status admin-status--success">${icon("check")} Підключено</span> Сповіщення йдуть у Telegram через функцію crm-notify. Тест іде на збережені chat id. Email поки не надсилається.`
          : `<span class="admin-status admin-status--warning">${icon("warning")} Не підключено</span> Отримувачі зберігаються, але відправки немає. Бракує: ${escape(missing.join(", "))}. Інструкція: docs/notifications-setup.md.`}</p>
        <button class="admin-button admin-button--secondary" type="button" data-notify-test ${status.configured ? "" : "disabled"}>Надіслати тестове повідомлення</button>
      </div>
      ${log.length ? `<table class="admin-crm-table admin-notify-log"><thead><tr><th>Час</th><th>Подія</th><th>Стан</th><th>Пояснення</th></tr></thead><tbody>
        ${log.slice(0, 8).map(entry => {
          const [label, tone] = NOTIFY_STATUS[entry.status] || [entry.status, "info"];
          return `<tr><td>${escape(formatDateTime(entry.createdAt))}</td>
            <td>${escape(NOTIFY_KIND[entry.kind] || entry.kind)}${entry.number ? ` №${escape(entry.number)}` : ""}</td>
            <td><span class="admin-status admin-status--${tone}">${escape(label)}</span></td>
            <td>${escape(entry.reason || "")}</td></tr>`;
        }).join("")}</tbody></table>` : `<p class="admin-notify-status__empty">Сповіщень ще не було.</p>`}`);
    box.querySelector("[data-notify-test]")?.addEventListener("click", sendTest);
  };
  const load = () => api.settings.notificationsStatus()
    .then(render)
    .catch(error => {
      box.replaceChildren();
      box.insertAdjacentHTML("beforeend", `<p class="admin-panel-note">Не вдалося перевірити стан відправки: ${escape(error.message)}</p>`);
    });
  async function sendTest(event) {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Надсилаємо…";
    try {
      const result = await api.settings.sendTestNotification();
      showToast(container, result?.status === "queued"
        ? "Тестове повідомлення в черзі. Результат з’явиться в журналі за кілька секунд."
        : `Не надіслано: ${result?.reason || "невідома причина"}`, result?.status !== "queued");
    } catch (error) {
      showToast(container, error.message, true);
    }
    await load();
    clearTimeout(timer);
    timer = setTimeout(() => { if (box.isConnected) load(); }, 4000);
  }
  load();
}
