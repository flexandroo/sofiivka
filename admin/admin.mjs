import { createAdminAuthClient } from "/admin/admin-auth.mjs";
import { createAdminApi, AdminApiError } from "/admin/admin-api.mjs";
import { icon } from "/admin/admin-icons.mjs";
import { createProductsListView, createProductEditorView, resetProductsCache } from "/admin/admin-products.mjs";
import { resolveAdminEnvironment } from "/admin/admin-env.mjs";
import {
  CRM_ROLES, createOrdersListView, createOrderDetailView, createOrderCreateView, createOrderPrintView, createLeadsListView, createLeadDetailView,
  createCustomersListView, createCustomerDetailView, renderCrmOverview
} from "/admin/admin-crm.mjs";
import {
  createBrandsListView, createBrandDetailView, createCategoriesListView, createCategoryDetailView
} from "/admin/admin-taxonomy.mjs";
import { createSettingsView } from "/admin/admin-settings.mjs";
import { createStaffView, createAccountView } from "/admin/admin-staff.mjs";
import { createCollectionsListView, createCollectionDetailView } from "/admin/admin-collections.mjs";
import { createAttributesListView, createAttributeDetailView } from "/admin/admin-attributes.mjs";
import { createPriceImportView } from "/admin/admin-prices.mjs";
import { createPagesListView, createPageEditorView } from "/admin/admin-pages.mjs";

const ROLES = new Set(["owner", "admin", "manager", "content_manager"]);
const ROLE_LABELS = Object.freeze({
  owner: "Власник",
  admin: "Адміністратор",
  manager: "Менеджер",
  content_manager: "Контент-менеджер"
});
const ROUTES = Object.freeze({
  "/admin": { title: "Огляд", section: "dashboard", icon: "dashboard", roles: [...ROLES] },
  "/admin/orders": { title: "Замовлення", section: "orders", icon: "orders", roles: [...CRM_ROLES] },
  "/admin/leads": { title: "Заявки", section: "leads", icon: "leads", roles: [...CRM_ROLES] },
  "/admin/customers": { title: "Клієнти", section: "customers", icon: "user", roles: [...CRM_ROLES] },
  "/admin/products": { title: "Товари", section: "products", icon: "products", roles: [...ROLES] },
  "/admin/categories": { title: "Категорії", section: "categories", icon: "categories", roles: [...ROLES] },
  "/admin/brands": { title: "Бренди", section: "brands", icon: "brands", roles: [...ROLES] },
  "/admin/attributes": { title: "Характеристики", section: "attributes", icon: "attributes", roles: [...ROLES] },
  "/admin/collections": { title: "Підбірки", section: "collections", icon: "collections", roles: [...ROLES] },
  "/admin/media": { title: "Медіа", section: "media", icon: "media", roles: [...ROLES] },
  "/admin/pages": { title: "Сторінки", section: "pages", icon: "pages", roles: [...ROLES] },
  "/admin/settings": { title: "Налаштування", section: "settings", icon: "settings", roles: ["owner", "admin"] },
  "/admin/users": { title: "Працівники", section: "users", icon: "user", roles: ["owner", "admin"] },
  "/admin/account": { title: "Мій обліковий запис", section: "account", icon: "lock", roles: [...ROLES] }
});
const NAV_GROUPS = Object.freeze([
  { label: "Головне", paths: ["/admin"] },
  { label: "Продажі", paths: ["/admin/orders", "/admin/leads", "/admin/customers"] },
  { label: "Каталог", paths: ["/admin/products", "/admin/collections"] },
  { label: "Дані", paths: ["/admin/categories", "/admin/brands", "/admin/attributes", "/admin/media"] },
  { label: "Сайт", paths: ["/admin/pages"] },
  { label: "Система", paths: ["/admin/settings", "/admin/users"] }
]);
const PLACEHOLDERS = Object.freeze({
  products: {
    eyebrow: "Канонічний каталог",
    lead: "Робоча область списку й редактора товарів буде наступним етапом.",
    rows: [["Список товарів", "Таблиця, пошук, фільтри та сортування"], ["Редактор", "Канонічні поля, атрибути й provenance"], ["Публікація", "Окремі draft / publish / hide команди"]]
  },
  media: {
    eyebrow: "13 006 медіазаписів",
    lead: "Медіа залишаються в поточному джерелі; перенесення в Storage не входить у цей етап.",
    rows: [["Зображення", "Primary, gallery, dimension і alt text"], ["Документи", "3 885 інструкцій та технічних файлів"], ["Майбутнє завантаження", "Лише через server-authorized signed flow"]]
  }
});

const root = document.querySelector("#admin-root");
const boot = document.querySelector("[data-admin-boot]");
const runtime = window.SOFIEVKA_CATALOG_CONFIG;
let auth;
let api;
let activeProfile = null;
let activeSession = null;
let drawerReturnFocus = null;
let routeController = null;
let environment = null;

start().catch(error => renderFatal(error));

async function start() {
  environment = resolveAdminEnvironment(runtime);
  document.body.dataset.adminEnvironment = environment.key;
  auth = createAdminAuthClient(runtime.supabase);
  api = createAdminApi(runtime.supabase, auth.getFreshAccessToken, { environment });
  bindRouter();
  await route();
}

async function route() {
  routeController?.abort();
  routeController = new AbortController();
  const signal = routeController.signal;
  setLoading(true);
  const path = normalizePath(location.pathname);
  activeSession = await auth.getSession();

  if (path === "/admin/login") {
    if (activeSession) {
      const profile = await api.getProfile(activeSession.user.id);
      if (isAuthorizedProfile(profile)) return navigate("/admin", { replace: true });
      return renderAccessDenied(profile);
    }
    return renderLogin();
  }

  if (!activeSession) return navigate("/admin/login", { replace: true });
  activeProfile = await api.getProfile(activeSession.user.id);
  if (!isAuthorizedProfile(activeProfile)) return renderAccessDenied(activeProfile);

  const priceImport = path === "/admin/products/import";
  const productEditorMatch = !priceImport && path.match(/^\/admin\/products\/([^/]+)$/);
  const orderMatch = path.match(/^\/admin\/orders\/(\d{1,12})$/);
  const orderPrintMatch = path.match(/^\/admin\/orders\/(\d{1,12})\/print$/);
  const orderCreate = path === "/admin/orders/new";
  const leadMatch = path.match(/^\/admin\/leads\/(\d{1,12})$/);
  const customerMatch = path.match(/^\/admin\/customers\/([0-9a-f-]{36})$/i);
  const brandMatch = path.match(/^\/admin\/brands\/([^/]+)$/);
  const categoryMatch = path.match(/^\/admin\/categories\/([^/]+)$/);
  const collectionMatch = path.match(/^\/admin\/collections\/([^/]+)$/);
  const attributeMatch = path.match(/^\/admin\/attributes\/([^/]+)$/);
  const pageMatch = path.match(/^\/admin\/pages\/([a-z0-9-]+)$/);
  const definition = priceImport ? { ...ROUTES["/admin/products"], title: "Ціни та наявність" }
    : productEditorMatch ? { ...ROUTES["/admin/products"], title: "Редагування товару" }
    : orderMatch ? { ...ROUTES["/admin/orders"], title: `Замовлення № ${orderMatch[1]}` }
    : orderPrintMatch ? { ...ROUTES["/admin/orders"], title: `Друк замовлення № ${orderPrintMatch[1]}` }
    : orderCreate ? { ...ROUTES["/admin/orders"], title: "Нове замовлення" }
    : leadMatch ? { ...ROUTES["/admin/leads"], title: `Заявка № ${leadMatch[1]}` }
    : customerMatch ? { ...ROUTES["/admin/customers"], title: "Клієнт" }
    : brandMatch ? { ...ROUTES["/admin/brands"], title: "Бренд" }
    : categoryMatch ? { ...ROUTES["/admin/categories"], title: "Категорія" }
    : collectionMatch ? { ...ROUTES["/admin/collections"], title: "Підбірка" }
    : attributeMatch ? { ...ROUTES["/admin/attributes"], title: "Характеристика" }
    : pageMatch ? { ...ROUTES["/admin/pages"], title: "Сторінка" }
    : ROUTES[path];
  if (!definition) return renderNotFound();
  if (!definition.roles.includes(activeProfile.role)) return renderForbidden(definition);

  if (path === "/admin") {
    try {
      const canCrm = CRM_ROLES.includes(activeProfile.role);
      const [rawDashboard, crmOverview] = await Promise.all([
        api.getDashboard(),
        canCrm ? api.crm.overview().catch(() => null) : Promise.resolve(null)
      ]);
      const dashboard = activeProfile.role === "content_manager"
        ? { ...rawDashboard, categoryReviews: null, lastImport: null }
        : rawDashboard;
      return renderShell(definition, renderDashboard(dashboard, renderCrmOverview(crmOverview)));
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) return expireSession();
      return renderShell(definition, renderDashboardError(error));
    }
  }
  if (path === "/admin/products") {
    try {
      const view = await createProductsListView({ api, profile: activeProfile, navigate, search: location.search, signal });
      renderShell(definition, view.html);
      view.bind(root);
      return;
    } catch (error) {
      if (error instanceof AdminApiError && error.code === "aborted") return;
      if (error instanceof AdminApiError && error.status === 401) return expireSession();
      return renderShell(definition, renderProductsError(error));
    }
  }
  if (productEditorMatch) {
    try {
      const legacyId = decodeURIComponent(productEditorMatch[1]);
      const view = await createProductEditorView({ api, profile: activeProfile, navigate, legacyId, signal });
      renderShell(definition, view.html);
      view.bind(root);
      return;
    } catch (error) {
      if (error instanceof AdminApiError && error.code === "aborted") return;
      if (error instanceof AdminApiError && error.status === 401) return expireSession();
      return renderShell(definition, renderProductsError(error));
    }
  }
  const crmView = path === "/admin/orders" ? () => createOrdersListView({ api, signal })
    : orderMatch ? () => createOrderDetailView({ api, navigate, orderNumber: orderMatch[1], signal })
    : orderPrintMatch ? () => createOrderPrintView({ api, orderNumber: orderPrintMatch[1], signal })
    : orderCreate ? () => createOrderCreateView({ api, search: location.search, signal })
    : path === "/admin/leads" ? () => createLeadsListView({ api, signal })
    : leadMatch ? () => createLeadDetailView({ api, leadNumber: leadMatch[1], signal })
    : path === "/admin/customers" ? () => createCustomersListView({ api, signal })
    : customerMatch ? () => createCustomerDetailView({ api, customerId: customerMatch[1], signal })
    : path === "/admin/brands" ? () => createBrandsListView({ api, signal })
    : brandMatch ? () => createBrandDetailView({ api, brandId: decodeURIComponent(brandMatch[1]), signal })
    : path === "/admin/categories" ? () => createCategoriesListView({ api, signal })
    : categoryMatch ? () => createCategoryDetailView({ api, categoryId: decodeURIComponent(categoryMatch[1]), signal })
    : path === "/admin/settings" ? () => createSettingsView({ api, signal })
    : path === "/admin/users" ? () => createStaffView({ api, signal })
    : path === "/admin/account" ? async () => createAccountView({ api, profile: activeProfile, email: activeSession?.user?.email })
    : path === "/admin/collections" ? () => createCollectionsListView({ api, signal })
    : collectionMatch ? () => createCollectionDetailView({ api, collectionId: decodeURIComponent(collectionMatch[1]), signal })
    : path === "/admin/attributes" ? () => createAttributesListView({ api, signal })
    : attributeMatch ? () => createAttributeDetailView({ api, attributeId: decodeURIComponent(attributeMatch[1]), signal })
    : priceImport ? () => createPriceImportView({ api, search: location.search, signal })
    : path === "/admin/pages" ? () => createPagesListView({ api, signal })
    : pageMatch ? () => createPageEditorView({ api, slug: pageMatch[1], signal })
    : null;
  if (crmView) {
    try {
      const view = await crmView();
      renderShell(definition, view.html);
      view.bind(root);
      return;
    } catch (error) {
      if (error instanceof AdminApiError && error.code === "aborted") return;
      if (error instanceof AdminApiError && error.status === 401) return expireSession();
      return renderShell(definition, renderSectionError(error, definition));
    }
  }
  return renderShell(definition, renderPlaceholder(definition));
}

function renderSectionError(error, definition) {
  return `<section class="admin-state-panel" role="alert">
    ${icon("warning")}<div><p class="admin-kicker">${escapeHtml(definition.title.toUpperCase())}</p><h1>Не вдалося відкрити розділ</h1><p>${escapeHtml(error?.message || "База даних не відповіла.")}</p></div>
    <button class="admin-button admin-button--secondary" type="button" data-retry>Спробувати ще раз</button>
  </section>`;
}

function setLoading(isLoading) {
  document.body.dataset.adminState = isLoading ? "loading" : "ready";
  if (boot) boot.hidden = !isLoading;
  if (isLoading) {
    root.querySelector("[data-product-editor]")?.dispatchEvent(new CustomEvent("admin:dispose"));
    root.replaceChildren();
  }
}

function renderProductsError(error) {
  return `<section class="admin-state-panel" role="alert">
    ${icon("warning")}<div><p class="admin-kicker">PRODUCTS ADMIN</p><h1>Не вдалося відкрити товари</h1><p>${escapeHtml(error?.message || "База даних не відповіла.")}</p></div>
    <button class="admin-button admin-button--secondary" type="button" data-retry>Спробувати ще раз</button>
  </section>`;
}

function renderLogin(message = "") {
  activeProfile = null;
  document.title = "Вхід до адміністрування | Софіївка";
  root.innerHTML = `
    <main class="admin-login" id="admin-main">
      <section class="admin-login__brand" aria-labelledby="admin-login-brand-title">
        <a class="admin-brand admin-brand--login" href="/" aria-label="Софіївка, сайт">
          <img src="/assets/logo-sofievka-transparent.png" width="1942" height="809" alt="Софіївка">
          <span>Керування каталогом</span>
        </a>
        <div class="admin-login__statement">
          <p class="admin-kicker">${environment.isProduction ? "РОБОЧИЙ ПРОСТІР" : "DEV WORKSPACE"}</p>
          <h1 id="admin-login-brand-title">Точні дані для інженерного каталогу</h1>
          <p>Опалення, вода, водоочищення, сантехніка та клімат — в одному контрольованому середовищі.</p>
        </div>
        <div class="admin-login__environment"><span aria-hidden="true"></span>${escapeHtml(environment.name)}</div>
      </section>
      <section class="admin-login__form-wrap" aria-labelledby="admin-login-title">
        <form class="admin-login__form" data-login-form novalidate>
          <header>
            <p class="admin-kicker">ЗАХИЩЕНИЙ ДОСТУП</p>
            <h2 id="admin-login-title">Увійти до робочого простору</h2>
            <p>Використайте обліковий запис із активним профілем адміністратора.</p>
          </header>
          <div class="admin-feedback admin-feedback--error" data-login-error role="alert" ${message ? "" : "hidden"}>${escapeHtml(message)}</div>
          <label class="admin-field">
            <span>Електронна адреса</span>
            <input name="email" type="email" inputmode="email" autocomplete="username" required aria-describedby="login-email-hint">
            <small id="login-email-hint">Обліковий запис працівника з активним профілем.</small>
          </label>
          <label class="admin-field">
            <span>Пароль</span>
            <input name="password" type="password" autocomplete="current-password" minlength="8" required>
          </label>
          <button class="admin-button admin-button--primary" type="submit" data-login-submit>
            <span>Увійти</span>${icon("arrow")}
          </button>
          <p class="admin-login__notice">Реєстрація та відновлення пароля вимкнені в цьому інтерфейсі.</p>
        </form>
      </section>
    </main>`;
  setLoading(false);
  bindLogin();
  requestAnimationFrame(() => root.querySelector("input")?.focus());
}

function bindLogin() {
  const form = root.querySelector("[data-login-form]");
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const errorNode = form.querySelector("[data-login-error]");
    const submit = form.querySelector("[data-login-submit]");
    const data = new FormData(form);
    if (!form.reportValidity()) return;
    errorNode.hidden = true;
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.querySelector("span").textContent = "Входимо…";
    try {
      const session = await auth.signInWithPassword(data.get("email"), data.get("password"));
      const profile = await api.getProfile(session.user.id);
      if (!isAuthorizedProfile(profile)) return renderAccessDenied(profile);
      activeProfile = profile;
      activeSession = session;
      navigate("/admin", { replace: true });
    } catch (error) {
      errorNode.textContent = error?.message || "Не вдалося виконати вхід.";
      errorNode.hidden = false;
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.querySelector("span").textContent = "Увійти";
      form.querySelector("input")?.focus();
    }
  });
}

function renderShell(definition, content) {
  document.title = `${definition.title} | Адміністрування Софіївка`;
  root.innerHTML = `
    <div class="admin-shell">
      <div class="admin-drawer-backdrop" data-drawer-backdrop hidden></div>
      <aside class="admin-sidebar" id="admin-navigation" aria-label="Навігація адміністрування" data-admin-sidebar>
        <div class="admin-sidebar__top">
          <a class="admin-brand" href="/admin" data-admin-link aria-label="Софіївка, огляд адміністрування">
            <img src="/assets/logo-sofievka-transparent.png" width="1942" height="809" alt="Софіївка">
            <span>Адміністрування</span>
          </a>
          <button class="admin-icon-button admin-sidebar__close" type="button" data-drawer-close aria-label="Закрити меню">${icon("close")}</button>
        </div>
        <nav class="admin-nav">${renderNavigation(definition.section)}</nav>
        <footer class="admin-sidebar__footer">
          <a class="admin-user" href="/admin/account" data-admin-link title="Мій обліковий запис">
            <span class="admin-user__avatar" aria-hidden="true">${initials(activeProfile.name)}</span>
            <span><strong>${escapeHtml(activeProfile.name)}</strong><small>${escapeHtml(ROLE_LABELS[activeProfile.role])}</small></span>
          </a>
          <button class="admin-logout" type="button" data-logout>${icon("logout")}<span>Вийти</span></button>
        </footer>
      </aside>
      <div class="admin-workspace">
        <header class="admin-topbar">
          <button class="admin-icon-button admin-menu-button" type="button" data-drawer-open aria-label="Відкрити меню" aria-controls="admin-navigation" aria-expanded="false">${icon("menu")}</button>
          <form class="admin-global-search" role="search" data-admin-search>
            <label class="admin-sr-only" for="admin-global-search">Пошук товарів у адмініструванні</label>
            ${icon("search")}
            <input id="admin-global-search" name="q" type="search" autocomplete="off" placeholder="Пошук товару або SKU">
          </form>
          <a class="admin-environment admin-environment--${environment.key}" href="${environment.dashboardUrl}" target="_blank" rel="noreferrer" aria-label="Відкрити ${escapeHtml(environment.name)} у новій вкладці">
            <span aria-hidden="true"></span><strong>${environment.label}</strong><small>Supabase</small>${icon("external")}
          </a>
        </header>
        <main class="admin-main" id="admin-main" tabindex="-1">${content}</main>
      </div>
    </div>`;
  setLoading(false);
  bindShell();
}

function renderNavigation(activeSection) {
  return NAV_GROUPS.filter(group => group.paths.some(path => ROUTES[path].roles.includes(activeProfile.role))).map(group => `
    <section class="admin-nav__group" aria-labelledby="nav-${slug(group.label)}">
      <h2 id="nav-${slug(group.label)}">${group.label}</h2>
      ${group.paths.map(path => {
        const item = ROUTES[path];
        const allowed = item.roles.includes(activeProfile.role);
        if (!allowed) return "";
        return `<a href="${path}" data-admin-link ${item.section === activeSection ? 'aria-current="page"' : ""}>${icon(item.icon)}<span>${item.title}</span></a>`;
      }).join("")}
    </section>`).join("");
}

function renderDashboard(data, salesHtml = "") {
  const importDate = data.lastImport?.finished_at || data.lastImport?.started_at;
  const version = typeof data.version === "string" ? data.version : data.version?.version;
  return `
    <div class="admin-page-head">
      <div>
        <p class="admin-kicker">${formatDate(new Date())}</p>
        <h1>Огляд</h1>
        <p>Продажі та каталог · ${escapeHtml(environment.name)}.</p>
      </div>
      <a class="admin-button admin-button--secondary" href="/admin/products" data-admin-link>Перейти до товарів${icon("arrow")}</a>
    </div>
    ${salesHtml}
    <section class="admin-metrics" aria-labelledby="catalog-state-title">
      <header><h2 id="catalog-state-title">Стан даних</h2><span class="admin-status admin-status--success">${icon("check")}Синхронізовано</span></header>
      <dl>
        ${metric("Товарів", data.products, "Канонічний каталог")}
        ${metric("Опубліковано", data.published, `${number(data.products - data.published)} непублічний запис`)}
        ${metric("Без ціни", data.noPrice, "Потрібне комерційне уточнення", "warning")}
        ${metric("Невідомий залишок", data.unknownInventory, "Статус постачання відсутній", "warning")}
        ${metric("Mapping review", data.categoryReviews, data.categoryReviews === null ? "Недоступно для цієї ролі" : "Категорії для ручної перевірки", data.categoryReviews ? "warning" : "")}
        ${metric("Брендів", data.brands, "Активний довідник")}
      </dl>
    </section>
    <div class="admin-dashboard-grid">
      <section class="admin-panel" aria-labelledby="quality-title">
        <header class="admin-panel__head"><div><p class="admin-kicker">ПРІОРИТЕТИ</p><h2 id="quality-title">Якість каталогу</h2></div><a href="/admin/products" data-admin-link>Усі товари${icon("arrow")}</a></header>
        <div class="admin-data-list">
          ${qualityRow("Ціни", "Без підтвердженої ціни", data.noPrice, data.products, "Високий вплив")}
          ${qualityRow("Наявність", "Невідомий складський статус", data.unknownInventory, data.products, "Потрібне джерело")}
          ${qualityRow("Таксономія", "Рішення mapping review", data.categoryReviews, data.products, data.categoryReviews === null ? "Обмежено роллю" : "Ручна перевірка")}
        </div>
      </section>
      <aside class="admin-panel admin-release" aria-labelledby="release-title">
        <header class="admin-panel__head"><div><p class="admin-kicker">ДЖЕРЕЛО</p><h2 id="release-title">Останнє оновлення</h2></div></header>
        <dl>
          <div><dt>Середовище</dt><dd>${escapeHtml(environment.name)}</dd></div>
          <div><dt>Project ref</dt><dd><code>${environment.projectRef}</code></dd></div>
          <div><dt>Catalog version</dt><dd>${escapeHtml(shortVersion(version) || "Поточна")}</dd></div>
          <div><dt>Import</dt><dd>${data.lastImport ? escapeHtml(data.lastImport.status) : "Недоступно для ролі"}</dd></div>
          <div><dt>Завершено</dt><dd>${importDate ? formatDateTime(importDate) : "—"}</dd></div>
        </dl>
      </aside>
    </div>
    <section class="admin-scope" aria-labelledby="scope-title">
      <div><p class="admin-kicker">ПОВНИЙ ІНЖЕНЕРНИЙ КАТАЛОГ</p><h2 id="scope-title">Одна система даних для всіх напрямів</h2></div>
      <p>Опалення · Водопостачання · Водоочищення · Сантехніка · Клімат · Комплектація об’єктів</p>
    </section>`;
}

function renderDashboardError(error) {
  return `
    <div class="admin-page-head"><div><p class="admin-kicker">КАТАЛОГ</p><h1>Огляд каталогу</h1><p>Стан канонічних даних · ${escapeHtml(environment.name)}.</p></div></div>
    <section class="admin-state-panel" role="alert">
      ${icon("warning")}
      <div><h2>Не вдалося завантажити показники</h2><p>${escapeHtml(error?.message || "База даних не відповіла.")}</p></div>
      <button class="admin-button admin-button--secondary" type="button" data-retry>Спробувати ще раз</button>
    </section>`;
}

function renderPlaceholder(definition) {
  const page = PLACEHOLDERS[definition.section];
  const query = new URLSearchParams(location.search).get("q");
  return `
    <div class="admin-page-head">
      <div><p class="admin-kicker">${escapeHtml(page.eyebrow)}</p><h1>${definition.title}</h1><p>${escapeHtml(page.lead)}</p></div>
      <span class="admin-status">FOUNDATION</span>
    </div>
    ${query ? `<div class="admin-feedback">Пошуковий запит збережено для наступного етапу: <strong>${escapeHtml(query)}</strong></div>` : ""}
    <section class="admin-foundation-list" aria-labelledby="foundation-title">
      <header><span>${icon(definition.icon)}</span><div><p class="admin-kicker">ПІДГОТОВЛЕНО</p><h2 id="foundation-title">Контур наступного етапу</h2></div></header>
      <ol>${page.rows.map(([title, description], index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div><small>Ще не активовано</small></li>`).join("")}</ol>
    </section>
    <p class="admin-boundary-note">Розділ ще в розробці: зміни даних тут поки вимкнені.</p>`;
}

function renderAccessDenied(profile) {
  document.title = "Немає доступу | Адміністрування Софіївка";
  root.innerHTML = `
    <main class="admin-access" id="admin-main">
      <a class="admin-brand admin-brand--dark" href="/"><img src="/assets/logo-sofievka-transparent.png" width="1942" height="809" alt="Софіївка"><span>Адміністрування</span></a>
      <section>
        <span class="admin-access__icon">${icon("lock")}</span>
        <p class="admin-kicker">ДОСТУП ОБМЕЖЕНО</p>
        <h1>${profile?.active === false ? "Профіль деактивовано" : "Адміністративний профіль не знайдено"}</h1>
        <p>Обліковий запис авторизовано, але для роботи потрібен активний <code>admin_profile</code> з дозволеною роллю.</p>
        <p class="admin-access__account">${escapeHtml(activeSession?.user?.email || "Поточний користувач")}</p>
        <button class="admin-button admin-button--primary" type="button" data-logout>Вийти та змінити обліковий запис</button>
      </section>
    </main>`;
  setLoading(false);
  root.querySelector("[data-logout]")?.addEventListener("click", handleLogout);
}

function renderForbidden(definition) {
  renderShell(definition, `
    <section class="admin-state-panel" role="alert">
      ${icon("lock")}<div><p class="admin-kicker">НЕДОСТАТНЬО ПРАВ</p><h1>Маршрут недоступний для ролі</h1><p>Роль «${escapeHtml(ROLE_LABELS[activeProfile.role])}» не має доступу до розділу «${escapeHtml(definition.title)}».</p></div>
      <a class="admin-button admin-button--secondary" href="/admin" data-admin-link>До огляду</a>
    </section>`);
}

function renderNotFound() {
  renderShell({ title: "Сторінку не знайдено", section: "none" }, `
    <section class="admin-state-panel">
      ${icon("warning")}<div><p class="admin-kicker">404</p><h1>Сторінку не знайдено</h1><p>Перевірте адресу або поверніться до огляду каталогу.</p></div>
      <a class="admin-button admin-button--secondary" href="/admin" data-admin-link>До огляду</a>
    </section>`);
}

function renderFatal(error) {
  document.title = "Помилка конфігурації | Софіївка";
  root.innerHTML = `<main class="admin-fatal"><span>${icon("warning")}</span><h1>Адміністрування не запущено</h1><p>${escapeHtml(error?.message || "Невідома помилка конфігурації.")}</p><a href="/">Повернутися на сайт</a></main>`;
  setLoading(false);
}

function bindShell() {
  root.querySelector("[data-logout]")?.addEventListener("click", handleLogout);
  root.querySelector("[data-retry]")?.addEventListener("click", route);
  root.querySelector("[data-admin-search]")?.addEventListener("submit", event => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q").trim();
    if (query) navigate(`/admin/products?q=${encodeURIComponent(query)}`);
  });
  const open = root.querySelector("[data-drawer-open]");
  const close = root.querySelector("[data-drawer-close]");
  const backdrop = root.querySelector("[data-drawer-backdrop]");
  open?.addEventListener("click", () => setDrawer(true));
  close?.addEventListener("click", () => setDrawer(false));
  backdrop?.addEventListener("click", () => setDrawer(false));
  document.addEventListener("keydown", handleDrawerKeydown);
  root.querySelector("#admin-main")?.focus({ preventScroll: true });
}

function setDrawer(isOpen) {
  const sidebar = root.querySelector("[data-admin-sidebar]");
  const backdrop = root.querySelector("[data-drawer-backdrop]");
  const trigger = root.querySelector("[data-drawer-open]");
  if (!sidebar || !backdrop || !trigger) return;
  if (isOpen) drawerReturnFocus = document.activeElement;
  sidebar.classList.toggle("is-open", isOpen);
  backdrop.hidden = !isOpen;
  trigger.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("admin-drawer-open", isOpen);
  if (isOpen) sidebar.querySelector("[data-drawer-close]")?.focus();
  else drawerReturnFocus?.focus?.();
}

function handleDrawerKeydown(event) {
  const sidebar = root.querySelector("[data-admin-sidebar].is-open");
  if (!sidebar) return;
  if (event.key === "Escape") return setDrawer(false);
  if (event.key !== "Tab") return;
  const focusable = [...sidebar.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

async function handleLogout() {
  resetProductsCache();
  await auth.signOut();
  activeProfile = null;
  activeSession = null;
  navigate("/admin/login", { replace: true });
}

async function expireSession() {
  resetProductsCache();
  auth.clearSession();
  activeProfile = null;
  activeSession = null;
  history.replaceState({}, "", "/admin/login");
  renderLogin("Сесію завершено. Увійдіть знову.");
}

function bindRouter() {
  document.addEventListener("click", event => {
    const link = event.target.closest("a[data-admin-link]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    document.removeEventListener("keydown", handleDrawerKeydown);
    navigate(`${link.pathname}${link.search}`);
  });
  window.addEventListener("popstate", () => route().catch(renderFatal));
  window.addEventListener("admin:navigate", event => navigate(event.detail.target, { replace: Boolean(event.detail.replace) }));
}

function navigate(target, { replace = false } = {}) {
  const url = new URL(target, location.origin);
  if (replace) history.replaceState({}, "", `${url.pathname}${url.search}`);
  else history.pushState({}, "", `${url.pathname}${url.search}`);
  route().catch(renderFatal);
}

function isAuthorizedProfile(profile) {
  return Boolean(profile?.active && ROLES.has(profile.role));
}

function normalizePath(pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return clean === "/admin/index.html" ? "/admin" : clean;
}

function metric(label, value, note, tone = "") {
  const shown = value === null || value === undefined ? "—" : number(value);
  return `<div class="admin-metric${tone ? ` admin-metric--${tone}` : ""}"><dt>${label}</dt><dd>${shown}</dd><small>${escapeHtml(note)}</small></div>`;
}

function qualityRow(area, label, value, total, status) {
  const unavailable = value === null || value === undefined;
  const ratio = unavailable || !total ? 0 : Math.min(100, Math.round((value / total) * 100));
  return `<div class="admin-data-row"><span class="admin-data-row__area">${escapeHtml(area)}</span><div><strong>${escapeHtml(label)}</strong><span class="admin-progress" aria-label="${unavailable ? "Дані недоступні" : `${ratio}% товарів`}"><i style="--progress:${ratio}%"></i></span></div><b>${unavailable ? "—" : number(value)}</b><small>${escapeHtml(status)}</small></div>`;
}

function initials(name) {
  return String(name || "Admin").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function slug(value) {
  return value.toLocaleLowerCase("uk-UA").replace(/[^a-zа-яіїєґ0-9]+/gi, "-");
}

function number(value) {
  return new Intl.NumberFormat("uk-UA").format(Number(value));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function shortVersion(value) {
  const text = String(value || "");
  return text.length > 28 ? `${text.slice(0, 12)}…${text.slice(-8)}` : text;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
