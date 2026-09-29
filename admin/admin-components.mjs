import { icon } from "/admin/admin-icons.mjs";

export const ADMIN_STATUS = Object.freeze({
  published: "Опубліковано",
  draft: "Чернетка",
  hidden: "Приховано",
  archived: "Архів",
  in_stock: "В наявності",
  out_of_stock: "Немає",
  preorder: "Передзамовлення",
  discontinued: "Знято з продажу",
  unknown: "Невідомо",
  known: "Ціна вказана",
  on_request: "За запитом",
  price_unknown: "Не вказана"
});

export function createButton(label, { variant = "secondary", type = "button", iconName = null } = {}) {
  const button = element("button", `admin-button admin-button--${safeVariant(variant)}`);
  button.type = type;
  const text = element("span");
  text.textContent = label;
  button.append(text);
  if (iconName) button.insertAdjacentHTML("beforeend", icon(iconName));
  return button;
}

export function createIconButton(label, iconName) {
  const button = element("button", "admin-icon-button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.insertAdjacentHTML("beforeend", icon(iconName));
  return button;
}

export function createStatusBadge(status, { tone = "" } = {}) {
  const badge = element("span", `admin-status${tone ? ` admin-status--${safeTone(tone)}` : ""}`);
  badge.textContent = ADMIN_STATUS[status] || status;
  badge.dataset.status = status;
  return badge;
}

export function createFormField({ label, name, type = "text", value = "", help = "", options = [] }) {
  const wrapper = element("label", "admin-field");
  const title = element("span");
  title.textContent = label;
  wrapper.append(title);
  let control;
  if (type === "select") {
    control = element("select", "admin-select");
    for (const option of options) {
      const node = element("option");
      node.value = option.value;
      node.textContent = option.label;
      node.selected = option.value === value;
      control.append(node);
    }
  } else {
    control = element("input");
    control.type = type;
    control.value = value;
  }
  control.name = name;
  wrapper.append(control);
  if (help) {
    const description = element("small");
    description.textContent = help;
    wrapper.append(description);
  }
  return wrapper;
}

export function createPageHeader({ eyebrow = "", title, description = "", action = null }) {
  const header = element("header", "admin-page-head");
  const copy = element("div");
  if (eyebrow) {
    const kicker = element("p", "admin-kicker");
    kicker.textContent = eyebrow;
    copy.append(kicker);
  }
  const heading = element("h1");
  heading.textContent = title;
  copy.append(heading);
  if (description) {
    const paragraph = element("p");
    paragraph.textContent = description;
    copy.append(paragraph);
  }
  header.append(copy);
  if (action instanceof Element) header.append(action);
  return header;
}

export function createToolbar(...children) {
  const toolbar = element("div", "admin-toolbar");
  toolbar.setAttribute("role", "toolbar");
  children.filter(child => child instanceof Element).forEach(child => toolbar.append(child));
  return toolbar;
}

export function createEmptyState({ title, message, action = null }) {
  return createState("admin-empty-state", "products", title, message, action);
}

export function createErrorState({ title, message, action = null }) {
  const state = createState("admin-error-state", "warning", title, message, action);
  state.setAttribute("role", "alert");
  return state;
}

export function createSkeleton(rows = 5) {
  const skeleton = element("div", "admin-skeleton");
  skeleton.setAttribute("aria-label", "Завантаження даних");
  skeleton.setAttribute("aria-busy", "true");
  for (let index = 0; index < rows; index += 1) {
    const row = element("span");
    row.setAttribute("aria-hidden", "true");
    skeleton.append(row);
  }
  return skeleton;
}

export function createDialog({ id, title, description = "" }) {
  const dialog = element("dialog", "admin-dialog");
  dialog.id = id;
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  const heading = element("h2");
  heading.id = `${id}-title`;
  heading.textContent = title;
  dialog.append(heading);
  if (description) {
    const paragraph = element("p");
    paragraph.textContent = description;
    dialog.append(paragraph);
  }
  return dialog;
}

export function createDrawer({ id, title }) {
  const drawer = element("aside", "admin-component-drawer");
  drawer.id = id;
  drawer.setAttribute("aria-labelledby", `${id}-title`);
  drawer.hidden = true;
  const heading = element("h2");
  heading.id = `${id}-title`;
  heading.textContent = title;
  drawer.append(heading);
  return drawer;
}

export function createTableShell({ caption, columns = [] }) {
  const viewport = element("div", "admin-table-shell");
  const table = element("table");
  const captionNode = element("caption", "admin-sr-only");
  captionNode.textContent = caption;
  const head = element("thead");
  const row = element("tr");
  for (const column of columns) {
    const cell = element("th");
    cell.scope = "col";
    cell.textContent = column;
    row.append(cell);
  }
  head.append(row);
  table.append(captionNode, head, element("tbody"));
  viewport.append(table);
  return viewport;
}

export function createLoadMore(label = "Завантажити ще") {
  const wrapper = element("div", "admin-load-more");
  wrapper.append(createButton(label));
  return wrapper;
}

function createState(className, iconName, title, message, action) {
  const state = element("section", className);
  state.insertAdjacentHTML("beforeend", icon(iconName));
  const copy = element("div");
  const heading = element("h2");
  heading.textContent = title;
  const paragraph = element("p");
  paragraph.textContent = message;
  copy.append(heading, paragraph);
  state.append(copy);
  if (action instanceof Element) state.append(action);
  return state;
}

function element(tagName, className = "") {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  return node;
}

function safeVariant(value) {
  return ["primary", "secondary", "ghost", "danger"].includes(value) ? value : "secondary";
}

function safeTone(value) {
  return ["success", "warning", "danger", "info"].includes(value) ? value : "";
}
