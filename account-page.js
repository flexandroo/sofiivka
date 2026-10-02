/* /account: sign in, sign up, password reset, profile, order history, order detail and "repeat order".
 * Loaded by page-shell.js on the account page only; auth and data calls go through window.sofievkaAccount
 * (customer-account.js). Views: /account (orders), /account?view=profile, /account?order=<number>. */
(function () {
  "use strict";

  const STATUS = Object.freeze({
    new: { label: "Прийнято", tone: "new" },
    confirmed: { label: "Підтверджено", tone: "active" },
    processing: { label: "Комплектується", tone: "active" },
    shipped: { label: "Відправлено", tone: "active" },
    completed: { label: "Виконано", tone: "done" },
    cancelled: { label: "Скасовано", tone: "muted" }
  });
  const CART_KEY = "sofievka-cart";
  const MIN_PASSWORD = 8;

  function mount(container, helpers) {
    const api = window.sofievkaAccount;
    const { escapeHtml: esc, money, toast } = helpers;
    let account = null;
    let notice = null;

    if (!api || !api.available) {
      container.innerHTML = `<div class="empty-state"><h2>Кабінет тимчасово недоступний</h2><p>Онлайн-кабінет зараз не підключений. Щодо замовлень зателефонуйте нам або напишіть — менеджер допоможе.</p><a class="button button--primary" href="/contact">Контакти</a></div>`;
      return;
    }

    const params = () => new URLSearchParams(location.search);
    const nextPath = () => {
      const next = params().get("next") || "";
      return /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : "";
    };
    const go = (search, { replace = false } = {}) => {
      const url = `${location.pathname}${search ? `?${search}` : ""}`;
      history[replace ? "replaceState" : "pushState"](null, "", url);
      route();
    };
    const formatDate = value => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(date);
    };
    const statusBadge = status => {
      const item = STATUS[status] || { label: status, tone: "muted" };
      return `<span class="account-status account-status--${item.tone}">${esc(item.label)}</span>`;
    };
    const orderTotal = order => {
      const total = Number(order.itemsTotal) || 0;
      if (order.hasUnpricedItems) return total ? `${money(total)} + уточнення` : "Ціну уточнює менеджер";
      return money(total);
    };
    const itemsLabel = count => {
      const value = Math.abs(Number(count) || 0);
      const word = value % 10 === 1 && value % 100 !== 11 ? "товар" : [2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100) ? "товари" : "товарів";
      return `${value} ${word}`;
    };
    const positionsLabel = count => {
      const value = Math.abs(Number(count) || 0);
      const word = value % 10 === 1 && value % 100 !== 11 ? "позиція" : [2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100) ? "позиції" : "позицій";
      return `${value} ${word}`;
    };
    const noticeMarkup = () => notice ? `<div class="notice${notice.error ? " notice--error" : ""}" role="${notice.error ? "alert" : "status"}">${notice.html}</div>` : "";
    const setBusy = (button, busy, label) => {
      if (!button) return;
      if (busy) { button.dataset.idleLabel = button.textContent; button.textContent = label || "Зачекайте…"; }
      else if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
      button.disabled = busy;
      button.toggleAttribute("aria-busy", busy);
    };
    const showFormError = (form, message) => {
      const box = form.querySelector("[data-account-error]");
      if (!box) return;
      box.textContent = message || "";
      box.hidden = !message;
      if (message) box.focus?.();
    };

    // -----------------------------------------------------------------------
    // Signed out: sign in / sign up / reset
    // -----------------------------------------------------------------------
    function authView(mode) {
      const next = nextPath();
      const tab = (name, label) => `<a href="?${new URLSearchParams({ ...(name === "signin" ? {} : { mode: name }), ...(next ? { next } : {}) })}" class="${mode === name ? "is-active" : ""}" ${mode === name ? 'aria-current="page"' : ""} data-account-mode="${name}">${label}</a>`;
      const errorBox = `<div class="notice notice--error" data-account-error role="alert" tabindex="-1" hidden></div>`;
      const forms = {
        signin: `<form class="account-form" data-account-form="signin" novalidate>
            <h2>Вхід до кабінету</h2>
            ${errorBox}
            <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required maxlength="254"></label>
            <label class="field"><span>Пароль</span><input name="password" type="password" autocomplete="current-password" required></label>
            <button class="button button--primary" type="submit">Увійти</button>
            <p class="account-form__links"><a href="?mode=reset" data-account-mode="reset">Забули пароль?</a></p>
          </form>`,
        signup: `<form class="account-form" data-account-form="signup" novalidate>
            <h2>Реєстрація</h2>
            ${errorBox}
            <label class="field"><span>Ім'я та прізвище</span><input name="name" autocomplete="name" required minlength="2" maxlength="160"></label>
            <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required maxlength="254"></label>
            <label class="field"><span>Пароль <small>(щонайменше ${MIN_PASSWORD} символів)</small></span><input name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD}" maxlength="72"></label>
            <button class="button button--primary" type="submit">Створити кабінет</button>
            <p class="checkout-legal">Реєструючись, ви погоджуєтесь на обробку контактних даних для обслуговування замовлень. <a href="/privacy">Політика конфіденційності</a></p>
          </form>`,
        reset: `<form class="account-form" data-account-form="reset" novalidate>
            <h2>Відновлення пароля</h2>
            <p class="account-form__lead">Вкажіть email кабінету — надішлемо посилання для створення нового пароля.</p>
            ${errorBox}
            <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required maxlength="254"></label>
            <button class="button button--primary" type="submit">Надіслати посилання</button>
            <p class="account-form__links"><a href="?" data-account-mode="signin">← Повернутися до входу</a></p>
          </form>`
      };
      return `<div class="content-layout account-auth">
        <div class="account-auth__panel">
          ${noticeMarkup()}
          <nav class="account-tabs" aria-label="Вхід або реєстрація">${tab("signin", "Вхід")}${tab("signup", "Реєстрація")}</nav>
          ${forms[mode] || forms.signin}
        </div>
        <div class="prose account-auth__info">
          <h2>Навіщо кабінет</h2>
          <ul>
            <li>Історія замовлень і їхні статуси в одному місці.</li>
            <li>Повторне замовлення в кілька кліків — товари повертаються в кошик.</li>
            <li>Контакти й адреса доставки підставляються під час оформлення.</li>
          </ul>
          <p>Замовлення, оформлені раніше на ваш email, з’являться в кабінеті після підтвердження адреси.</p>
          <p>Оформити замовлення можна й без реєстрації.</p>
        </div>
      </div>`;
    }

    function bindAuth(mode) {
      container.querySelectorAll("[data-account-mode]").forEach(link => link.addEventListener("click", event => {
        event.preventDefault();
        notice = null;
        const next = nextPath();
        const name = link.dataset.accountMode;
        go(new URLSearchParams({ ...(name === "signin" ? {} : { mode: name }), ...(next ? { next } : {}) }).toString());
      }));
      const form = container.querySelector("[data-account-form]");
      if (!form) return;
      form.addEventListener("submit", async event => {
        event.preventDefault();
        showFormError(form, "");
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        const button = form.querySelector('[type="submit"]');
        setBusy(button, true);
        try {
          if (mode === "signup") {
            const result = await api.signUp({ email: data.get("email"), password: data.get("password"), name: data.get("name") });
            if (result.session) { notice = null; await afterSignIn(); return; }
            notice = { html: `<strong>Перевірте пошту.</strong> Ми надіслали лист на ${esc(data.get("email"))}. Перейдіть за посиланням у ньому, щоб підтвердити email і увійти.` };
            go("", { replace: true });
          } else if (mode === "reset") {
            await api.requestPasswordReset(data.get("email"));
            notice = { html: `<strong>Лист надіслано.</strong> Якщо кабінет з адресою ${esc(data.get("email"))} існує, у листі буде посилання для створення нового пароля.` };
            go("", { replace: true });
          } else {
            await api.signIn(data.get("email"), data.get("password"));
            notice = null;
            await afterSignIn();
          }
        } catch (error) {
          setBusy(button, false);
          showFormError(form, error?.message || "Не вдалося виконати дію. Спробуйте ще раз.");
        }
      });
    }

    async function afterSignIn() {
      const next = nextPath();
      if (next) { location.assign(next); return; }
      account = null;
      go("", { replace: true });
    }

    // -----------------------------------------------------------------------
    // Password recovery (link from the email)
    // -----------------------------------------------------------------------
    function recoveryView() {
      return `<div class="account-narrow"><form class="account-form" data-account-recovery novalidate>
        <h2>Новий пароль</h2>
        <p class="account-form__lead">Придумайте новий пароль для кабінету ${esc(api.currentUser()?.email || "")}.</p>
        <div class="notice notice--error" data-account-error role="alert" tabindex="-1" hidden></div>
        <label class="field"><span>Новий пароль <small>(щонайменше ${MIN_PASSWORD} символів)</small></span><input name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD}" maxlength="72"></label>
        <label class="field"><span>Повторіть пароль</span><input name="confirm" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD}" maxlength="72"></label>
        <button class="button button--primary" type="submit">Зберегти пароль</button>
      </form></div>`;
    }
    function bindPasswordForm(form, onDone) {
      form.addEventListener("submit", async event => {
        event.preventDefault();
        showFormError(form, "");
        const password = form.elements.password;
        const confirm = form.elements.confirm;
        confirm.setCustomValidity(password.value === confirm.value ? "" : "Паролі не збігаються.");
        if (!form.reportValidity()) return;
        const button = form.querySelector('[type="submit"]');
        setBusy(button, true, "Зберігаємо…");
        try {
          await api.updatePassword(password.value);
          form.reset();
          setBusy(button, false);
          onDone();
        } catch (error) {
          setBusy(button, false);
          showFormError(form, error?.message);
        }
      });
    }

    // -----------------------------------------------------------------------
    // Signed in
    // -----------------------------------------------------------------------
    function shell(active, content) {
      const profile = account?.profile || {};
      const nav = [["orders", "", "Замовлення"], ["profile", "view=profile", "Профіль"]]
        .map(([key, search, label]) => `<a href="${search ? `?${search}` : "?"}" data-account-nav="${search}" class="${active === key ? "is-active" : ""}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`).join("");
      return `<div class="account-layout">
        <aside class="account-aside">
          <p class="account-aside__name">${esc(profile.name || "Ваш кабінет")}</p>
          <p class="account-aside__email">${esc(profile.email || api.currentUser()?.email || "")}</p>
          <nav class="account-nav" aria-label="Розділи кабінету">${nav}</nav>
          <button class="account-signout" type="button" data-account-signout>Вийти</button>
        </aside>
        <div class="account-main">${noticeMarkup()}${content}</div>
      </div>`;
    }
    function bindShell() {
      container.querySelectorAll("[data-account-nav]").forEach(link => link.addEventListener("click", event => {
        event.preventDefault();
        notice = null;
        go(link.dataset.accountNav);
      }));
      container.querySelector("[data-account-signout]")?.addEventListener("click", async () => {
        await api.signOut();
        account = null;
        notice = { html: "Ви вийшли з кабінету." };
        go("", { replace: true });
      });
    }

    function ordersView() {
      const orders = account.orders || [];
      if (!orders.length) {
        return `<section class="account-section"><h2>Замовлення</h2>
          <div class="empty-state account-empty"><h3>Замовлень поки немає</h3><p>Оформлені замовлення з’являться тут. Замовлення на ваш email, зроблені без входу, теж підтягуються сюди${account.profile?.emailConfirmed === false ? " — після підтвердження email" : ""}.</p><a class="button button--primary" href="/catalog">До каталогу</a></div>
        </section>`;
      }
      return `<section class="account-section"><h2>Замовлення <span class="account-count">${orders.length}</span></h2>
        <ol class="account-orders">${orders.map(order => `<li class="account-order">
          <div class="account-order__id"><a href="?order=${encodeURIComponent(order.number)}" data-account-order="${esc(order.number)}">№ ${esc(order.number)}</a><small>${esc(formatDate(order.createdAt))}</small></div>
          <div class="account-order__status">${statusBadge(order.status)}</div>
          <p class="account-order__items">${esc((order.items || []).slice(0, 2).map(item => item.title).join(", "))}${(order.items || []).length > 2 ? ` та ще ${(order.items || []).length - 2}` : ""}<small>${esc(itemsLabel(order.itemsCount))}</small></p>
          <strong class="account-order__total">${esc(orderTotal(order))}</strong>
        </li>`).join("")}</ol>
      </section>`;
    }
    function bindOrders() {
      container.querySelectorAll("[data-account-order]").forEach(link => link.addEventListener("click", event => {
        event.preventDefault();
        notice = null;
        go(`order=${encodeURIComponent(link.dataset.accountOrder)}`);
      }));
    }

    function orderView(order) {
      const delivery = order.deliveryMethod === "pickup"
        ? `Самовивіз${order.deliveryPoint ? `: ${esc(order.deliveryPoint)}` : ""}`
        : [order.deliveryCity, order.deliveryPoint].filter(Boolean).map(esc).join(", ") || "Доставка перевізником";
      const repeatable = order.items.filter(item => item.available && item.productId);
      return `<section class="account-section account-order-detail">
        <a class="account-back" href="?" data-account-nav="">← Усі замовлення</a>
        <div class="account-order-detail__head"><h2>Замовлення № ${esc(order.number)}</h2>${statusBadge(order.status)}</div>
        <dl class="account-facts">
          <div><dt>Дата</dt><dd>${esc(formatDate(order.createdAt))}</dd></div>
          <div><dt>Отримання</dt><dd>${delivery}</dd></div>
          <div><dt>Контакт</dt><dd>${esc(order.contactName || "")}${order.contactPhone ? `<br>${esc(order.contactPhone)}` : ""}</dd></div>
          ${order.customerComment ? `<div><dt>Коментар</dt><dd>${esc(order.customerComment)}</dd></div>` : ""}
        </dl>
        <table class="account-items">
          <thead><tr><th scope="col">Товар</th><th scope="col">Кількість</th><th scope="col">Ціна</th><th scope="col">Сума</th></tr></thead>
          <tbody>${order.items.map(item => `<tr>
            <td>${item.available && item.productId ? `<a href="/product?id=${encodeURIComponent(item.productId)}">${esc(item.title)}</a>` : esc(item.title)}<small>${esc([item.brandName, item.sku ? `код ${item.sku}` : ""].filter(Boolean).join(" · "))}${item.productId && !item.available ? " · більше не продається" : ""}</small></td>
            <td data-label="Кількість">${esc(item.quantity)} шт.</td>
            <td data-label="Ціна">${item.unitAmount === null || item.unitAmount === undefined ? "уточнюється" : esc(money(Number(item.unitAmount)))}</td>
            <td data-label="Сума">${item.lineTotal === null || item.lineTotal === undefined ? "—" : esc(money(Number(item.lineTotal)))}</td>
          </tr>`).join("")}</tbody>
          <tfoot><tr><th scope="row" colspan="3">Разом</th><td>${esc(orderTotal(order))}</td></tr></tfoot>
        </table>
        ${order.hasUnpricedItems ? `<p class="account-note">Ціни позицій «уточнюється» менеджер повідомляє під час підтвердження замовлення.</p>` : ""}
        <div class="account-actions">
          <button class="button button--primary" type="button" data-account-repeat ${repeatable.length ? "" : "disabled"}>Повторити замовлення</button>
          ${repeatable.length ? "" : `<p class="account-note">Товари з цього замовлення більше не продаються онлайн. Зателефонуйте нам — підберемо заміну.</p>`}
        </div>
      </section>`;
    }
    function bindOrder(order) {
      container.querySelector("[data-account-repeat]")?.addEventListener("click", () => {
        const repeatable = order.items.filter(item => item.available && item.productId);
        let current = {};
        try { current = JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { current = {}; }
        if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
        repeatable.forEach(item => { current[item.productId] = Math.min(999, (Number(current[item.productId]) || 0) + Number(item.quantity || 1)); });
        try { localStorage.setItem(CART_KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
        helpers.updateCounts?.();
        const skipped = order.items.length - repeatable.length;
        notice = { html: `<strong>Додано до кошика: ${esc(positionsLabel(repeatable.length))}.</strong>${skipped ? ` ${skipped} поз. більше не продається.` : ""} Ціни й наявність перевіримо під час оформлення. <a href="/cart">Перейти до кошика →</a>` };
        toast("Товари додано до кошика");
        render();
      });
    }

    function profileView() {
      const profile = account.profile || {};
      return `<section class="account-section"><h2>Профіль</h2>
        <form class="account-profile" data-account-profile novalidate>
          <div class="notice notice--error" data-account-error role="alert" tabindex="-1" hidden></div>
          <section class="form-section"><h3>Контактні дані</h3><div class="form-grid">
            <label class="field"><span>Ім'я та прізвище</span><input name="name" autocomplete="name" maxlength="160" value="${esc(profile.name || "")}"></label>
            <label class="field"><span>Телефон</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="24" placeholder="+38 (0__) ___ __ __" value="${esc(profile.phone || "")}"></label>
            <label class="field field--full"><span>Email</span><input type="email" value="${esc(profile.email || "")}" readonly aria-describedby="account-email-note"><small id="account-email-note">Email — логін кабінету. Щоб змінити його, напишіть нам.${profile.emailConfirmed === false ? " Адресу ще не підтверджено." : ""}</small></label>
          </div></section>
          <section class="form-section"><h3>Доставка за замовчуванням</h3><div class="form-grid">
            <label class="field"><span>Місто</span><input name="deliveryCity" autocomplete="address-level2" maxlength="120" value="${esc(profile.deliveryCity || "")}"></label>
            <label class="field"><span>Відділення або адреса</span><input name="deliveryPoint" maxlength="240" value="${esc(profile.deliveryPoint || "")}"></label>
          </div>
          <label class="choice account-consent"><input type="checkbox" name="marketingConsent" ${profile.marketingConsent ? "checked" : ""}><span><strong>Отримувати новини та пропозиції</strong><small>Рідко й по суті: акції, нові бренди, сезонне обслуговування. Відписатися можна тут у будь-який момент.</small></span></label>
          </section>
          <button class="button button--primary" type="submit">Зберегти профіль</button>
        </form>
        <form class="account-profile account-password" data-account-password novalidate>
          <section class="form-section"><h3>Пароль</h3>
            <div class="notice notice--error" data-account-error role="alert" tabindex="-1" hidden></div>
            <div class="form-grid">
              <label class="field"><span>Новий пароль</span><input name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD}" maxlength="72"></label>
              <label class="field"><span>Повторіть пароль</span><input name="confirm" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD}" maxlength="72"></label>
            </div>
          </section>
          <button class="button button--secondary" type="submit">Змінити пароль</button>
        </form>
      </section>`;
    }
    function bindProfile() {
      const form = container.querySelector("[data-account-profile]");
      form?.addEventListener("submit", async event => {
        event.preventDefault();
        showFormError(form, "");
        const data = new FormData(form);
        const phoneDigits = String(data.get("phone") || "").replace(/\D/g, "");
        form.elements.phone.setCustomValidity(!phoneDigits || (phoneDigits.length >= 9 && phoneDigits.length <= 15) ? "" : "Вкажіть номер телефону, наприклад 067 123 45 67");
        if (!form.reportValidity()) return;
        const button = form.querySelector('[type="submit"]');
        setBusy(button, true, "Зберігаємо…");
        try {
          const result = await api.updateProfile({
            name: data.get("name"), phone: data.get("phone"), deliveryCity: data.get("deliveryCity"),
            deliveryPoint: data.get("deliveryPoint"), marketingConsent: data.get("marketingConsent") === "on"
          });
          account = { ...account, profile: result.profile };
          notice = { html: "Профіль збережено." };
          render();
          toast("Профіль збережено");
        } catch (error) {
          setBusy(button, false);
          if (error?.code === "signed_out") return route();
          showFormError(form, error?.message);
        }
      });
      const passwordForm = container.querySelector("[data-account-password]");
      if (passwordForm) bindPasswordForm(passwordForm, () => { notice = { html: "Пароль змінено." }; render(); toast("Пароль змінено"); });
    }

    // -----------------------------------------------------------------------
    // Routing
    // -----------------------------------------------------------------------
    let renderToken = 0;
    function loading() {
      container.innerHTML = `<p class="account-loading" role="status">Завантажуємо кабінет…</p>`;
    }
    function failure(error) {
      container.innerHTML = `<div class="empty-state"><h2>Не вдалося відкрити кабінет</h2><p>${esc(error?.message || "Спробуйте оновити сторінку.")}</p><button class="button button--primary" type="button" data-account-retry>Спробувати ще раз</button></div>`;
      container.querySelector("[data-account-retry]")?.addEventListener("click", () => { account = null; route(); });
    }

    async function route() {
      const token = ++renderToken;
      const search = params();
      if (!api.currentUser()) {
        account = null;
        const mode = ["signup", "reset"].includes(search.get("mode")) ? search.get("mode") : "signin";
        container.innerHTML = authView(mode);
        bindAuth(mode);
        return;
      }
      if (search.get("mode") === "recovery") {
        container.innerHTML = recoveryView();
        bindPasswordForm(container.querySelector("[data-account-recovery]"), () => {
          notice = { html: "<strong>Пароль змінено.</strong> Ви увійшли до кабінету." };
          go("", { replace: true });
        });
        return;
      }
      if (!account) {
        loading();
        try {
          account = await api.getAccount();
        } catch (error) {
          if (token !== renderToken) return;
          if (error?.code === "signed_out" || error?.status === 401) { notice = { html: "Сесію завершено. Увійдіть знову.", error: true }; return route(); }
          return failure(error);
        }
        if (token !== renderToken) return;
      }
      const orderNumber = search.get("order");
      if (orderNumber && /^\d{1,12}$/.test(orderNumber)) {
        container.innerHTML = shell("orders", `<p class="account-loading" role="status">Завантажуємо замовлення…</p>`);
        bindShell();
        let order;
        try {
          order = (await api.getOrder(orderNumber)).order;
        } catch (error) {
          if (token !== renderToken) return;
          container.innerHTML = shell("orders", `<section class="account-section"><a class="account-back" href="?" data-account-nav="">← Усі замовлення</a><div class="empty-state account-empty"><h3>${esc(error?.message || "Замовлення не знайдено.")}</h3><p>Перевірте номер або відкрийте список замовлень.</p></div></section>`);
          bindShell();
          return;
        }
        if (token !== renderToken) return;
        document.title = `Замовлення № ${order.number} | ТД «Софіївка»`;
        container.innerHTML = shell("orders", orderView(order));
        bindShell();
        bindOrder(order);
        return;
      }
      document.title = "Особистий кабінет | ТД «Софіївка»";
      if (search.get("view") === "profile") {
        container.innerHTML = shell("profile", profileView());
        bindShell();
        bindProfile();
        return;
      }
      container.innerHTML = shell("orders", ordersView());
      bindShell();
      bindOrders();
    }
    const render = () => route();

    window.addEventListener("popstate", () => { notice = null; route(); });
    api.onChange(user => { if (!user && account) { account = null; route(); } });

    // Email links (confirmation, recovery) open the page with tokens in the hash; also handle a hash change
    // on an already open /account tab.
    const start = async () => {
      loading();
      try {
        const redirect = await api.consumeRedirect();
        if (redirect?.error) notice = { html: esc(redirect.error.message), error: true };
        else if (redirect?.type === "recovery") { history.replaceState(null, "", `${location.pathname}?mode=recovery`); }
        else if (redirect?.type === "signup") notice = { html: "<strong>Email підтверджено.</strong> Ласкаво просимо до кабінету." };
      } catch (error) {
        notice = { html: esc(error?.message || "Не вдалося завершити вхід за посиланням."), error: true };
      }
      if (api.currentUser()) {
        try { await api.getSession({ validate: true }); } catch { /* offline: keep the stored session */ }
        if (!api.currentUser() && !notice) notice = { html: "Сесію завершено. Увійдіть знову.", error: true };
      }
      route();
    };
    window.addEventListener("hashchange", () => { if (/(access_token|error)=/.test(location.hash)) { account = null; start(); } });
    start();
  }

  window.sofievkaAccountPage = Object.freeze({ mount, STATUS });
})();
