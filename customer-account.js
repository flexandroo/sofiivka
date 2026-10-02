/* Storefront customer accounts (Supabase Auth, email + password).
 * Talks to the Auth REST endpoints directly with the browser-safe publishable key and keeps the session in
 * localStorage under its own key (staff sessions live under sofievka.admin.session.*). A customer account is a
 * plain Auth user without admin_profiles: the admin SPA and every admin_* RPC reject it.
 * Account data goes only through customer_* RPCs that act on the signed-in caller. */
(function () {
  "use strict";

  const config = window.SOFIEVKA_CATALOG_CONFIG;
  const supabase = config && config.supabase && config.supabase.url && config.supabase.publishableKey ? config.supabase : null;
  let projectRef = "local";
  try { if (supabase) projectRef = config.supabase.projectRef || new URL(supabase.url).hostname.split(".")[0]; } catch { /* keep default */ }
  const storageKey = `sofievka.customer.session.${projectRef}`;
  const listeners = new Set();
  let refreshPromise = null;

  class AccountError extends Error {
    constructor(message, code, status) {
      super(message);
      this.name = "AccountError";
      this.code = code || "account_error";
      this.status = status || 0;
    }
  }

  const AUTH_MESSAGES = {
    invalid_credentials: "Неправильний email або пароль.",
    invalid_grant: "Неправильний email або пароль.",
    email_not_confirmed: "Email ще не підтверджено. Перейдіть за посиланням із листа, який ми надіслали.",
    user_already_exists: "Обліковий запис з цим email уже існує. Увійдіть або відновіть пароль.",
    email_exists: "Обліковий запис з цим email уже існує. Увійдіть або відновіть пароль.",
    weak_password: "Пароль надто простий. Використайте щонайменше 8 символів, літери та цифри.",
    same_password: "Новий пароль має відрізнятися від попереднього.",
    email_address_invalid: "Перевірте email.",
    validation_failed: "Перевірте email і пароль.",
    signup_disabled: "Реєстрацію тимчасово вимкнено. Зателефонуйте нам, будь ласка.",
    over_email_send_rate_limit: "Лист уже надіслано. Зачекайте кілька хвилин перед повторною спробою.",
    over_request_rate_limit: "Забагато спроб. Зачекайте та спробуйте ще раз.",
    otp_expired: "Посилання застаріло або вже використане. Запросіть новий лист.",
    reauthentication_needed: "Увійдіть знову, щоб змінити пароль.",
    session_not_found: "Сесію завершено. Увійдіть знову.",
    refresh_token_not_found: "Сесію завершено. Увійдіть знову."
  };

  function authMessage(code, status) {
    if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
    if (status === 429) return AUTH_MESSAGES.over_request_rate_limit;
    if (status === 401 || status === 403) return "Сесію завершено. Увійдіть знову.";
    if (status === 422) return "Перевірте введені дані.";
    return "Не вдалося виконати дію. Спробуйте ще раз.";
  }

  async function authRequest(pathname, { method = "GET", accessToken, body } = {}) {
    if (!supabase) throw new AccountError("Особистий кабінет зараз недоступний.", "unavailable");
    let response;
    try {
      response = await fetch(`${supabase.url}${pathname}`, {
        method,
        headers: {
          apikey: supabase.publishableKey,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000)
      });
    } catch {
      throw new AccountError("Немає з’єднання. Перевірте інтернет і спробуйте ще раз.", "network");
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload && (payload.error_code || payload.error || payload.code) || "auth_error";
      throw new AccountError(authMessage(String(code), response.status), String(code), response.status);
    }
    return payload;
  }

  function isSession(value) {
    return Boolean(value && typeof value.access_token === "string" && typeof value.refresh_token === "string" && value.user && value.user.id);
  }
  function expiresSoon(session) {
    const expiresAt = Number(session.expires_at || 0) * 1000;
    return !expiresAt || expiresAt <= Date.now() + 45000;
  }
  function readStoredSession() {
    try {
      const session = JSON.parse(localStorage.getItem(storageKey) || "null");
      return isSession(session) ? session : null;
    } catch {
      return null;
    }
  }
  function notify() {
    const user = currentUser();
    listeners.forEach(listener => { try { listener(user); } catch (error) { console.error(error); } });
    decorateHeader(document);
  }
  function persistSession(session) {
    if (!isSession(session)) throw new AccountError("Сервіс авторизації повернув некоректну відповідь.", "invalid_response");
    if (!session.expires_at && session.expires_in) session = { ...session, expires_at: Math.floor(Date.now() / 1000) + Number(session.expires_in) };
    try { localStorage.setItem(storageKey, JSON.stringify(session)); } catch { /* private mode: session lives for this page only */ }
    notify();
    return session;
  }
  function clearSession() {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    notify();
  }

  function currentUser() {
    const session = readStoredSession();
    return session ? { id: session.user.id, email: session.user.email || "", name: session.user.user_metadata?.name || "" } : null;
  }

  async function refreshSession(session) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = authRequest("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token } })
      .then(persistSession)
      .catch(error => { if (error.code !== "network") clearSession(); throw error; })
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function getFreshAccessToken() {
    const session = readStoredSession();
    if (!session) return null;
    if (!expiresSoon(session)) return session.access_token;
    try { return (await refreshSession(session)).access_token; } catch { return null; }
  }

  // validate: confirm the session with the Auth server (signed out elsewhere, deleted user, etc.).
  async function getSession({ validate = true } = {}) {
    let session = readStoredSession();
    if (!session) return null;
    if (expiresSoon(session)) {
      try { session = await refreshSession(session); } catch { return null; }
    }
    if (!validate) return session;
    try {
      const user = await authRequest("/auth/v1/user", { accessToken: session.access_token });
      return persistSession({ ...session, user });
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) throw error;
      try {
        session = await refreshSession(session);
        const user = await authRequest("/auth/v1/user", { accessToken: session.access_token });
        return persistSession({ ...session, user });
      } catch {
        clearSession();
        return null;
      }
    }
  }

  function returnAddress(path) {
    return `${location.origin}${path}`;
  }

  async function signIn(email, password) {
    const session = await authRequest("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: String(email || "").trim().toLowerCase(), password: String(password || "") }
    });
    return persistSession(session);
  }

  // With "Confirm email" on (required), Supabase answers without a session and sends a confirmation letter.
  async function signUp({ email, password, name }) {
    const payload = await authRequest(`/auth/v1/signup?redirect_to=${encodeURIComponent(returnAddress("/account"))}`, {
      method: "POST",
      body: { email: String(email || "").trim().toLowerCase(), password: String(password || ""), data: { name: String(name || "").trim().slice(0, 160) } }
    });
    if (isSession(payload)) return { session: persistSession(payload), confirmationSent: false };
    return { session: null, confirmationSent: true };
  }

  async function requestPasswordReset(email) {
    await authRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(returnAddress("/account"))}`, {
      method: "POST",
      body: { email: String(email || "").trim().toLowerCase() }
    });
  }

  async function updatePassword(password) {
    const accessToken = await getFreshAccessToken();
    if (!accessToken) throw new AccountError("Сесію завершено. Увійдіть знову.", "signed_out", 401);
    const user = await authRequest("/auth/v1/user", { method: "PUT", accessToken, body: { password: String(password || "") } });
    const session = readStoredSession();
    if (session && user && user.id) persistSession({ ...session, user });
  }

  async function signOut() {
    const session = readStoredSession();
    clearSession();
    if (!session) return;
    try { await authRequest("/auth/v1/logout", { method: "POST", accessToken: session.access_token }); } catch { /* local sign-out is enough */ }
  }

  // Links from Supabase emails (confirmation, password recovery) return with tokens or an error in the hash.
  async function consumeRedirect() {
    const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
    if (!hash || !/(access_token|error)=/.test(hash)) return null;
    const params = new URLSearchParams(hash);
    history.replaceState(null, "", location.pathname + location.search);
    if (params.get("error") || params.get("error_code")) {
      const code = params.get("error_code") || params.get("error");
      return { type: params.get("type") || "error", error: new AccountError(authMessage(code, 0), code) };
    }
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return null;
    const user = await authRequest("/auth/v1/user", { accessToken });
    persistSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: params.get("token_type") || "bearer",
      expires_in: Number(params.get("expires_in") || 3600),
      expires_at: Number(params.get("expires_at") || 0) || Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600),
      user
    });
    return { type: params.get("type") || "signin", error: null };
  }

  async function rpc(name, args = {}) {
    if (!supabase) throw new AccountError("Особистий кабінет зараз недоступний.", "unavailable");
    const send = async accessToken => {
      try {
        return await fetch(`${supabase.url}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: { apikey: supabase.publishableKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(20000)
        });
      } catch {
        throw new AccountError("Немає з’єднання. Перевірте інтернет і спробуйте ще раз.", "network");
      }
    };
    let accessToken = await getFreshAccessToken();
    if (!accessToken) throw new AccountError("Увійдіть до особистого кабінету.", "signed_out", 401);
    let response = await send(accessToken);
    if (response.status === 401) {
      const session = readStoredSession();
      try { accessToken = session ? (await refreshSession(session)).access_token : null; } catch { accessToken = null; }
      if (!accessToken) { clearSession(); throw new AccountError("Сесію завершено. Увійдіть знову.", "signed_out", 401); }
      response = await send(accessToken);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const known = body && ["22023", "P0002", "42501"].includes(body.code);
      if (response.status === 401) clearSession();
      throw new AccountError(known ? body.message : "Не вдалося завантажити дані. Спробуйте ще раз.", body && body.code, response.status);
    }
    return body;
  }

  // Header icon: [data-account-link] with an optional [data-account-label] inside.
  function decorateHeader(scope) {
    const user = currentUser();
    (scope || document).querySelectorAll("[data-account-link]").forEach(link => {
      link.classList.toggle("is-signed-in", Boolean(user));
      link.setAttribute("aria-label", user ? `Особистий кабінет${user.email ? `, ${user.email}` : ""}` : "Увійти до особистого кабінету");
      const label = link.querySelector("[data-account-label]");
      if (label) label.textContent = user ? "Кабінет" : "Увійти";
    });
  }

  window.addEventListener("storage", event => { if (event.key === storageKey) notify(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => decorateHeader(document), { once: true });
  else decorateHeader(document);

  window.sofievkaAccount = Object.freeze({
    available: Boolean(supabase),
    storageKey,
    AccountError,
    currentUser,
    getSession,
    getFreshAccessToken,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
    consumeRedirect,
    rpc,
    decorateHeader,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getAccount: () => rpc("customer_get_account"),
    getOrder: number => rpc("customer_get_order", { order_number: Number(number) }),
    updateProfile: patch => rpc("customer_update_profile", { patch })
  });
})();
