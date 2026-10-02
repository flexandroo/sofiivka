import { icon } from "/admin/admin-icons.mjs";

// Header and footer menus of the storefront: the site_settings section 'menus', saved through
// admin_update_settings with the section's updatedAt as the optimistic lock. The storefront
// (site-settings.js) renders them in page-shell pages and the homepage footer; the built-in menus
// stay as the first paint. Links: a site path (/delivery, /catalog/heating) or https://.

const LIMITS = Object.freeze({ header: 10, children: 10, columns: 3, links: 12, label: 40, childLabel: 60, title: 40, href: 300 });
// Same rule as public._settings_href and site-settings.js.
const SAFE_HREF = /^(https:\/\/[^/\s<>"'\\]+(\/[^\s<>"'\\]*)?|\/([^/\s<>"'\\][^\s<>"'\\]*)?)$/i;
const HREF_HINT = "Сторінка сайту, що починається з /, або повна адреса https://.";

export async function createMenusView({ api, signal }) {
  const { canEdit, sections } = await api.settings.get({ signal });
  const menus = sections?.menus || { value: null, updatedAt: null };
  const header = Array.isArray(menus.value?.header) ? menus.value.header : [];
  const footer = Array.isArray(menus.value?.footer) ? menus.value.footer : [];
  const missing = !sections?.menus;

  const html = `
    <section class="admin-crm-page admin-settings admin-menus" data-menus>
      <header class="admin-page-head"><div><p class="admin-kicker">САЙТ</p><h1>Меню сайту</h1>
        <p>Посилання в шапці та підвалі всіх сторінок.${canEdit ? "" : " Змінювати меню можуть власник і адміністратор."}</p></div></header>
      ${missing ? `<p class="admin-panel-note" role="alert">${icon("warning")} У базі ще немає розділу меню: застосуйте міграцію 20261002001800_menus_cookies_v1. Сайт показує вбудоване меню.</p>` : ""}
      <form class="admin-menus-form" data-menus-form novalidate>
        <section class="admin-panel">
          <header class="admin-panel__head"><div><p class="admin-kicker">ШАПКА</p><h2>Головне меню</h2></div>
            ${canEdit ? `<button class="admin-button admin-button--secondary" type="button" data-menu-add="header">${icon("plus")}<span>Додати пункт</span></button>` : ""}</header>
          <p class="admin-panel-note">Рядок над пошуком на комп’ютері, до ${LIMITS.header} пунктів. Підпункти відкриваються списком під пунктом. На телефоні цей рядок схований, тому важливі сторінки додайте й у підвал.</p>
          <ol class="admin-menu-list" data-menu-list="header">${header.map(headerItem).join("")}</ol>
          <p class="admin-menu-empty" data-menu-empty="header" ${header.length ? "hidden" : ""}>Пунктів немає: рядок меню на сайті не показується.</p>
        </section>
        <section class="admin-panel">
          <header class="admin-panel__head"><div><p class="admin-kicker">ПІДВАЛ</p><h2>Колонки посилань</h2></div>
            ${canEdit ? `<button class="admin-button admin-button--secondary" type="button" data-menu-add="footer">${icon("plus")}<span>Додати колонку</span></button>` : ""}</header>
          <p class="admin-panel-note">Перша колонка «Каталог» будується з розділів каталогу автоматично. Тут — до ${LIMITS.columns} колонок, у кожній від 1 до ${LIMITS.links} посилань.</p>
          <ol class="admin-menu-list" data-menu-list="footer">${footer.map(footerColumn).join("")}</ol>
          <p class="admin-menu-empty" data-menu-empty="footer" ${footer.length ? "hidden" : ""}>Колонок немає: у підвалі лишиться тільки каталог.</p>
        </section>
        <template data-menu-template="header">${headerItem({ label: "", href: "", children: [] })}</template>
        <template data-menu-template="footer">${footerColumn({ title: "", links: [{ label: "", href: "" }] })}</template>
        <template data-menu-template="link">${linkRow({ label: "", href: "" }, "link")}</template>
        <template data-menu-template="child">${linkRow({ label: "", href: "" }, "child")}</template>
        ${canEdit
          ? `<footer class="admin-panel admin-crm-form-actions admin-settings-actions"><small>${menus.updatedAt ? `Оновлено ${formatDateTime(menus.updatedAt)}` : ""}</small><button class="admin-button admin-button--primary" type="submit" ${missing ? "disabled" : ""}>Зберегти меню</button></footer>`
          : ""}
      </form>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;

  return { html, bind: container => bindMenus(container, { api, canEdit, updatedAt: menus.updatedAt, missing }) };
}

function headerItem(item) {
  return `
    <li class="admin-menu-item" data-menu-item>
      ${rowFields(item, LIMITS.label, "Назва пункту")}
      <ol class="admin-menu-children" data-menu-children>${(item.children || []).map(child => linkRow(child, "child")).join("")}</ol>
      <div class="admin-menu-item__foot"><button class="admin-button admin-button--ghost" type="button" data-menu-add-child>${icon("plus")}<span>Підпункт</span></button></div>
    </li>`;
}

function footerColumn(column) {
  return `
    <li class="admin-menu-item" data-menu-column>
      <div class="admin-menu-row">
        <label class="admin-field"><span>Назва колонки</span><input name="title" value="${escape(column.title)}" maxlength="${LIMITS.title}" required></label>
        ${rowActions("колонку")}
      </div>
      <ol class="admin-menu-children" data-menu-links>${(column.links || []).map(link => linkRow(link, "link")).join("")}</ol>
      <div class="admin-menu-item__foot"><button class="admin-button admin-button--ghost" type="button" data-menu-add-link>${icon("plus")}<span>Посилання</span></button></div>
    </li>`;
}

function linkRow(link, kind) {
  return `<li class="admin-menu-link" data-menu-${kind}>${rowFields(link, LIMITS.childLabel, kind === "child" ? "Підпункт" : "Назва посилання")}</li>`;
}

function rowFields(item, maxLabel, labelText) {
  return `
    <div class="admin-menu-row">
      <label class="admin-field"><span>${labelText}</span><input name="label" value="${escape(item.label)}" maxlength="${maxLabel}" required></label>
      <label class="admin-field"><span>Посилання</span><input name="href" value="${escape(item.href)}" maxlength="${LIMITS.href}" required placeholder="/delivery" spellcheck="false" autocomplete="off" title="${escape(HREF_HINT)}"></label>
      ${rowActions("")}
    </div>`;
}

function rowActions(what) {
  return `<div class="admin-menu-row__actions">
      <button class="admin-button admin-button--ghost" type="button" data-menu-up aria-label="Перемістити вище">Вище</button>
      <button class="admin-button admin-button--ghost admin-settings-remove" type="button" data-menu-remove aria-label="Прибрати${what ? ` ${what}` : ""}">Прибрати</button>
    </div>`;
}

const value = (scope, name) => String(scope.querySelector(`:scope > .admin-menu-row [name="${name}"]`)?.value || "").trim();
const rows = (list, selector) => [...list.children].filter(node => node.matches(selector));
const readLink = row => ({ label: value(row, "label"), href: value(row, "href") });

function readMenus(form) {
  return {
    header: rows(form.querySelector('[data-menu-list="header"]'), "[data-menu-item]").map(item => ({
      ...readLink(item),
      children: rows(item.querySelector("[data-menu-children]"), "[data-menu-child]").map(readLink)
    })),
    footer: rows(form.querySelector('[data-menu-list="footer"]'), "[data-menu-column]").map(column => ({
      title: value(column, "title"),
      links: rows(column.querySelector("[data-menu-links]"), "[data-menu-link]").map(readLink)
    }))
  };
}

function bindMenus(container, { api, canEdit, updatedAt, missing }) {
  const form = container.querySelector("[data-menus-form]");
  if (!canEdit || missing) {
    form.querySelectorAll("input, button").forEach(control => { control.disabled = true; });
    form.querySelectorAll("[data-menu-up], [data-menu-remove], [data-menu-add-child], [data-menu-add-link]").forEach(button => { button.hidden = true; });
    return;
  }
  const saveButton = form.querySelector('[type="submit"]');
  const initial = JSON.stringify(readMenus(form));
  const template = name => form.querySelector(`[data-menu-template="${name}"]`).content.firstElementChild.cloneNode(true);

  const checkHref = input => input.setCustomValidity(!input.value.trim() || SAFE_HREF.test(input.value.trim()) ? "" : HREF_HINT);
  const refresh = () => {
    for (const list of form.querySelectorAll("[data-menu-list], [data-menu-children], [data-menu-links]")) {
      const items = [...list.children];
      items.forEach((item, index) => {
        item.querySelector(":scope > .admin-menu-row [data-menu-up]").disabled = index === 0;
      });
    }
    const header = form.querySelector('[data-menu-list="header"]');
    const footer = form.querySelector('[data-menu-list="footer"]');
    container.querySelector('[data-menu-add="header"]').disabled = header.children.length >= LIMITS.header;
    container.querySelector('[data-menu-add="footer"]').disabled = footer.children.length >= LIMITS.columns;
    form.querySelector('[data-menu-empty="header"]').hidden = header.children.length > 0;
    form.querySelector('[data-menu-empty="footer"]').hidden = footer.children.length > 0;
    header.querySelectorAll("[data-menu-item]").forEach(item => {
      item.querySelector("[data-menu-add-child]").disabled = item.querySelector("[data-menu-children]").children.length >= LIMITS.children;
    });
    footer.querySelectorAll("[data-menu-column]").forEach(column => {
      const links = column.querySelector("[data-menu-links]").children;
      column.querySelector("[data-menu-add-link]").disabled = links.length >= LIMITS.links;
      // A column needs at least one link: its only link cannot be removed (remove the column instead).
      [...links].forEach(link => { link.querySelector("[data-menu-remove]").disabled = links.length === 1; });
    });
    form.querySelectorAll('[name="href"]').forEach(checkHref);
    saveButton.disabled = JSON.stringify(readMenus(form)) === initial;
  };
  const focusFirst = node => node.querySelector("input")?.focus();

  container.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.type === "submit") return;
    if (button.dataset.menuAdd) {
      const node = template(button.dataset.menuAdd);
      form.querySelector(`[data-menu-list="${button.dataset.menuAdd}"]`).append(node);
      refresh();
      focusFirst(node);
      return;
    }
    const owner = button.closest("[data-menu-item], [data-menu-column]");
    if (button.matches("[data-menu-add-child], [data-menu-add-link]")) {
      const child = button.matches("[data-menu-add-child]");
      const node = template(child ? "child" : "link");
      owner.querySelector(child ? "[data-menu-children]" : "[data-menu-links]").append(node);
      refresh();
      focusFirst(node);
      return;
    }
    const row = button.closest("li");
    if (button.matches("[data-menu-remove]")) { row.remove(); refresh(); return; }
    if (button.matches("[data-menu-up]") && row.previousElementSibling) {
      row.previousElementSibling.before(row);
      refresh();
      button.disabled ? row.querySelector("input")?.focus() : button.focus();
    }
  });
  form.addEventListener("input", event => {
    if (event.target.name === "href") checkHref(event.target);
    saveButton.disabled = JSON.stringify(readMenus(form)) === initial;
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    saveButton.disabled = true;
    saveButton.textContent = "Зберігаємо…";
    try {
      await api.settings.update("menus", readMenus(form), updatedAt || null);
      showToast(container, "Меню збережено. Сайт покаже його після оновлення сторінки.");
      setTimeout(() => window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { target: location.pathname, replace: true } })), 900);
    } catch (error) {
      showToast(container, error.message, true);
      saveButton.disabled = false;
      saveButton.textContent = "Зберегти меню";
    }
  });
  refresh();
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
