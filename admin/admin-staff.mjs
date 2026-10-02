// Staff and access (/admin/users, owner/admin) and the signed-in user's own password
// (/admin/account, everyone). Roles and access are switched through admin_update_staff; a new
// employee is attached with admin_add_staff, and the admin-staff edge function creates the Auth
// account first when the email has none.

export const ROLE_OPTIONS = Object.freeze({
  owner: { label: "Власник", note: "Усе, включно з працівниками й налаштуваннями" },
  admin: { label: "Адміністратор", note: "Усе, крім керування власниками й адміністраторами" },
  manager: { label: "Менеджер", note: "Замовлення, заявки, клієнти; каталог лише перегляд" },
  content_manager: { label: "Контент-менеджер", note: "Товари, категорії, бренди, підбірки" }
});
const CHANGE_LABELS = Object.freeze({ name: "ім’я", role: "роль", active: "доступ", created: "додано" });

export async function createStaffView({ api, signal }) {
  const { staff, actorRole, actorId, history } = await api.staff.list({ signal });
  const assignable = Object.entries(ROLE_OPTIONS).filter(([role]) => actorRole === "owner" || !["owner", "admin"].includes(role));
  const rows = staff.map(member => {
    const self = member.userId === actorId;
    const locked = actorRole === "admin" && ["owner", "admin"].includes(member.role) && !self;
    return `
      <tr data-staff-row data-user-id="${escape(member.userId)}" data-updated-at="${escape(member.updatedAt)}" class="${member.active ? "" : "is-muted"}">
        <td><input class="admin-staff-name" name="name" value="${escape(member.name)}" maxlength="80" aria-label="Ім’я" ${locked ? "disabled" : ""}><small>${escape(member.email || "")}${self ? " · це ви" : ""}</small></td>
        <td><select name="role" aria-label="Роль" ${locked || self ? "disabled" : ""}>${Object.entries(ROLE_OPTIONS)
          .filter(([role]) => role === member.role || assignable.some(([option]) => option === role))
          .map(([role, item]) => `<option value="${role}" ${role === member.role ? "selected" : ""}>${escape(item.label)}</option>`).join("")}</select></td>
        <td><label class="admin-staff-toggle"><input type="checkbox" name="active" ${member.active ? "checked" : ""} ${locked || self ? "disabled" : ""}><span>${member.active ? "Є доступ" : "Вимкнено"}</span></label></td>
        <td>${member.lastSignInAt ? formatDateTime(member.lastSignInAt) : `<span class="admin-muted">Ще не входив</span>`}</td>
        <td>${locked ? "" : `<button class="admin-button admin-button--secondary" type="button" data-staff-save disabled>Зберегти</button>`}</td>
      </tr>`;
  }).join("");

  const html = `
    <section class="admin-crm-page admin-staff" data-staff>
      <header class="admin-page-head"><div><p class="admin-kicker">СИСТЕМА</p><h1>Працівники</h1>
        <p>Хто може входити в адмінку і що бачить. Доступ не видаляється, а вимикається, щоб історія змін зберегла авторів.</p></div></header>
      <form class="admin-panel" data-staff-add novalidate>
        <header class="admin-panel__head"><div><p class="admin-kicker">НОВИЙ ПРАЦІВНИК</p><h2>Надати доступ</h2></div></header>
        <div class="admin-form-grid admin-staff-add">
          <label class="admin-field"><span>Email</span><input name="email" type="email" maxlength="254" required autocomplete="off"></label>
          <label class="admin-field"><span>Ім’я</span><input name="name" maxlength="80" required autocomplete="off"></label>
          <label class="admin-field"><span>Роль</span><select name="role">${assignable.filter(([role]) => role !== "owner")
            .concat(assignable.filter(([role]) => role === "owner"))
            .map(([role, item]) => `<option value="${role}" ${role === "manager" ? "selected" : ""}>${escape(item.label)}</option>`).join("")}</select></label>
          <div class="admin-staff-add__submit"><button class="admin-button admin-button--primary" type="submit">Додати</button></div>
        </div>
        <p class="admin-panel-note">Якщо в людини ще немає облікового запису, його буде створено з тимчасовим паролем, який ви передасте їй особисто.</p>
        <div class="admin-staff-password" data-staff-password hidden></div>
      </form>
      <section class="admin-panel">
        <header class="admin-panel__head"><div><p class="admin-kicker">КОМАНДА</p><h2>${staff.filter(member => member.active).length} з доступом</h2></div></header>
        <div class="admin-products-table-wrap"><table class="admin-crm-table admin-staff-table">
          <thead><tr><th>Працівник</th><th>Роль</th><th>Доступ</th><th>Останній вхід</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>
      <section class="admin-panel">
        <header class="admin-panel__head"><div><p class="admin-kicker">РОЛІ</p><h2>Що може кожна роль</h2></div></header>
        <dl class="admin-staff-roles">${Object.values(ROLE_OPTIONS).map(item => `<div><dt>${escape(item.label)}</dt><dd>${escape(item.note)}</dd></div>`).join("")}</dl>
      </section>
      <section class="admin-panel admin-crm-timeline">
        <header class="admin-panel__head"><div><p class="admin-kicker">ІСТОРІЯ</p><h2>Зміни доступу</h2></div></header>
        <ol>${history.length ? history.map(entry => `
          <li class="admin-crm-event"><header><strong>${escape(entry.actor)}</strong><time>${formatDateTime(entry.createdAt)}</time></header>
          <p>${escape(entry.name)}: ${escape(describeChanges(entry.changes))}</p></li>`).join("") : `<li class="admin-muted">Змін ще не було.</li>`}</ol>
      </section>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;

  return { html, bind: container => bindStaff(container, api) };
}

export function createAccountView({ api, profile, email }) {
  const html = `
    <section class="admin-crm-page admin-staff" data-account>
      <header class="admin-page-head"><div><p class="admin-kicker">ОБЛІКОВИЙ ЗАПИС</p><h1>${escape(profile.name)}</h1>
        <p>${escape(email || "")} · ${escape(ROLE_OPTIONS[profile.role]?.label || profile.role)}</p></div></header>
      <form class="admin-panel" data-password-form novalidate>
        <header class="admin-panel__head"><div><p class="admin-kicker">БЕЗПЕКА</p><h2>Змінити пароль</h2></div></header>
        <div class="admin-form-grid">
          <label class="admin-field"><span>Новий пароль</span><input name="password" type="password" minlength="10" maxlength="72" required autocomplete="new-password"><small>Щонайменше 10 символів.</small></label>
          <label class="admin-field"><span>Ще раз</span><input name="confirm" type="password" minlength="10" maxlength="72" required autocomplete="new-password"></label>
        </div>
        <footer class="admin-crm-form-actions"><button class="admin-button admin-button--primary" type="submit">Змінити пароль</button></footer>
      </form>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => bindAccount(container, api) };
}

function bindAccount(container, api) {
  const form = container.querySelector("[data-password-form]");
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const password = form.elements.password.value;
    if (!form.reportValidity()) return;
    if (password !== form.elements.confirm.value) return showToast(container, "Паролі не збігаються.", true);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api.changePassword(password);
      form.reset();
      showToast(container, "Пароль змінено. Наступного разу входьте з новим паролем.");
    } catch (error) {
      showToast(container, error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

function bindStaff(container, api) {
  const addForm = container.querySelector("[data-staff-add]");
  const passwordBox = container.querySelector("[data-staff-password]");
  addForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!addForm.reportValidity()) return;
    const button = addForm.querySelector('[type="submit"]');
    const values = { email: addForm.elements.email.value.trim(), name: addForm.elements.name.value.trim(), role: addForm.elements.role.value };
    button.disabled = true;
    button.textContent = "Додаємо…";
    try {
      const result = await api.staff.add(values);
      if (result.temporaryPassword) {
        addForm.reset();
        passwordBox.replaceChildren(
          element("strong", `Обліковий запис ${result.staff.email} створено.`),
          element("p", "Тимчасовий пароль (показується один раз, передайте його особисто):"),
          element("code", result.temporaryPassword),
          element("p", "Після входу працівник змінює пароль у своєму обліковому записі (клік на ім’я внизу меню)."),
          Object.assign(element("button", "Готово, оновити список"), { type: "button", className: "admin-button admin-button--secondary", onclick: () => goTo(location.pathname, { replace: true }) })
        );
        passwordBox.hidden = false;
        button.disabled = false;
        button.textContent = "Додати";
        return;
      }
      showToast(container, `${result.staff.name} отримав доступ.`);
      setTimeout(() => goTo(location.pathname, { replace: true }), 700);
    } catch (error) {
      showToast(container, error.message, true);
      button.disabled = false;
      button.textContent = "Додати";
    }
  });

  container.querySelectorAll("[data-staff-row]").forEach(row => {
    const save = row.querySelector("[data-staff-save]");
    if (!save) return;
    const read = () => ({ name: row.querySelector('[name="name"]').value.trim(), role: row.querySelector('[name="role"]').value, active: row.querySelector('[name="active"]').checked });
    const initial = read();
    const toggleLabel = row.querySelector(".admin-staff-toggle span");
    row.addEventListener("input", () => { save.disabled = JSON.stringify(read()) === JSON.stringify(initial); });
    row.addEventListener("change", () => {
      save.disabled = JSON.stringify(read()) === JSON.stringify(initial);
      toggleLabel.textContent = read().active ? "Є доступ" : "Вимкнено";
    });
    save.addEventListener("click", async () => {
      const current = read();
      const patch = Object.fromEntries(Object.entries(current).filter(([key, value]) => value !== initial[key]));
      if (patch.active === false && !window.confirm(`Вимкнути доступ для «${current.name}»? Працівник більше не зможе увійти в адмінку.`)) return;
      save.disabled = true;
      try {
        await api.staff.update(row.dataset.userId, patch, row.dataset.updatedAt);
        showToast(container, "Збережено.");
        setTimeout(() => goTo(location.pathname, { replace: true }), 700);
      } catch (error) {
        showToast(container, error.message, true);
        save.disabled = false;
      }
    });
  });
}

function describeChanges(changes) {
  return Object.entries(changes || {}).map(([key, change]) => {
    if (key === "created") return `додано як ${ROLE_OPTIONS[change.role]?.label || change.role}`;
    if (key === "role") return `роль: ${ROLE_OPTIONS[change.from]?.label || change.from} → ${ROLE_OPTIONS[change.to]?.label || change.to}`;
    if (key === "active") return change.to ? "доступ увімкнено" : "доступ вимкнено";
    return `${CHANGE_LABELS[key] || key}: ${change.from} → ${change.to}`;
  }).join("; ");
}

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
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
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
