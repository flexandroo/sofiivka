import { validatePublicConfig } from "/lib/supabase-client.mjs";

export class AdminAuthError extends Error {
  constructor(message, { code = "auth_error", status = 0 } = {}) {
    super(message);
    this.name = "AdminAuthError";
    this.code = code;
    this.status = status;
  }
}

export function createAdminAuthClient(config, options = {}) {
  const { url, publishableKey } = validatePublicConfig(config);
  const fetchImplementation = options.fetchImplementation || globalThis.fetch;
  const storage = options.storage || globalThis.localStorage;
  const projectRef = new URL(url).hostname.split(".")[0];
  const storageKey = `sofievka.admin.session.${projectRef}`;
  let refreshPromise = null;

  if (typeof fetchImplementation !== "function") throw new TypeError("Fetch implementation is required");

  async function request(pathname, { method = "GET", accessToken, body } = {}) {
    let response;
    try {
      response = await fetchImplementation(`${url}${pathname}`, {
        method,
        headers: {
          apikey: publishableKey,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000)
      });
    } catch (error) {
      throw new AdminAuthError("Не вдалося зв’язатися із сервісом авторизації.", { code: "network_error" });
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload?.error_code || payload?.code || (response.status === 401 ? "invalid_session" : "auth_error");
      const message = code === "invalid_credentials" || response.status === 400
        ? "Неправильна електронна адреса або пароль."
        : response.status === 429
          ? "Забагато спроб. Зачекайте та спробуйте ще раз."
          : response.status === 401
            ? "Сесію завершено. Увійдіть знову."
            : "Авторизацію не виконано. Спробуйте ще раз.";
      throw new AdminAuthError(message, { code, status: response.status });
    }
    return payload;
  }

  function readStoredSession() {
    try {
      const session = JSON.parse(storage.getItem(storageKey) || "null");
      return isSession(session) ? session : null;
    } catch {
      return null;
    }
  }

  function persistSession(session) {
    if (!isSession(session)) throw new AdminAuthError("Сервіс повернув некоректну сесію.", { code: "invalid_response" });
    storage.setItem(storageKey, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    storage.removeItem(storageKey);
  }

  async function refreshSession(session) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: session.refresh_token }
    }).then(persistSession).catch(error => {
      clearSession();
      throw error;
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function getSession({ validate = true } = {}) {
    let session = readStoredSession();
    if (!session) return null;
    if (expiresSoon(session)) {
      try { session = await refreshSession(session); }
      catch { return null; }
    }
    if (!validate) return session;
    try {
      const user = await request("/auth/v1/user", { accessToken: session.access_token });
      session = { ...session, user };
      persistSession(session);
      return session;
    } catch (error) {
      if (error.status !== 401) throw error;
      try {
        session = await refreshSession(session);
        const user = await request("/auth/v1/user", { accessToken: session.access_token });
        session = { ...session, user };
        persistSession(session);
        return session;
      } catch {
        clearSession();
        return null;
      }
    }
  }

  async function signInWithPassword(email, password) {
    const session = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: String(email).trim(), password: String(password) }
    });
    return persistSession(session);
  }

  async function signOut() {
    const session = readStoredSession();
    clearSession();
    if (!session?.access_token) return;
    try { await request("/auth/v1/logout", { method: "POST", accessToken: session.access_token }); }
    catch { /* Local logout remains authoritative if the network is unavailable. */ }
  }

  return Object.freeze({
    getSession,
    signInWithPassword,
    signOut,
    clearSession,
    getAccessToken: () => readStoredSession()?.access_token || null,
    storageKey
  });
}

function isSession(value) {
  return Boolean(value && typeof value.access_token === "string" && typeof value.refresh_token === "string" && value.user?.id);
}

function expiresSoon(session) {
  const expiresAt = Number(session.expires_at || 0) * 1000;
  return !expiresAt || expiresAt <= Date.now() + 45_000;
}
