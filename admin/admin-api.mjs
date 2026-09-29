import { validatePublicConfig } from "/lib/supabase-client.mjs";

export class AdminApiError extends Error {
  constructor(message, { status = 0, code = "api_error" } = {}) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

export function createAdminApi(config, getAccessToken, fetchImplementation = globalThis.fetch) {
  const { url, publishableKey } = validatePublicConfig(config);

  async function request(pathname, { method = "GET", body, headers = {}, optional = false } = {}) {
    const token = getAccessToken();
    if (!token) throw new AdminApiError("Сесію завершено. Увійдіть знову.", { status: 401, code: "session_expired" });
    let response;
    try {
      response = await fetchImplementation(`${url}${pathname}`, {
        method,
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(25_000)
      });
    } catch {
      if (optional) return null;
      throw new AdminApiError("DEV database зараз недоступна. Спробуйте ще раз.", { code: "network_error" });
    }
    if (response.status === 401) throw new AdminApiError("Сесію завершено. Увійдіть знову.", { status: 401, code: "session_expired" });
    if (!response.ok) {
      if (optional && [403, 404].includes(response.status)) return null;
      const payload = await response.json().catch(() => null);
      throw new AdminApiError(payload?.message || "Не вдалося отримати дані з DEV database.", { status: response.status, code: payload?.code });
    }
    return response;
  }

  async function getProfile(userId) {
    const query = new URLSearchParams({
      select: "user_id,name,role,active,updated_at",
      user_id: `eq.${userId}`,
      limit: "1"
    });
    const response = await request(`/rest/v1/admin_profiles?${query}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function count(table, filters = {}) {
    const query = new URLSearchParams({ select: "*", ...filters });
    const response = await request(`/rest/v1/${table}?${query}`, {
      method: "HEAD",
      headers: { Prefer: "count=exact", Range: "0-0" }
    });
    const total = Number((response.headers.get("content-range") || "").split("/").at(-1));
    if (!Number.isInteger(total)) throw new AdminApiError(`Не вдалося порахувати записи ${table}.`, { code: "invalid_count" });
    return total;
  }

  async function latestImport() {
    const query = new URLSearchParams({
      select: "status,source_ref,started_at,finished_at,records_succeeded,records_failed",
      order: "started_at.desc.nullslast",
      limit: "1"
    });
    const response = await request(`/rest/v1/import_runs?${query}`, { optional: true });
    if (!response) return null;
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function catalogVersion() {
    const response = await request("/rest/v1/rpc/get_catalog_version", {
      method: "POST",
      body: {},
      optional: true
    });
    return response ? response.json() : null;
  }

  async function getDashboard() {
    const [products, published, noPrice, unknownInventory, categoryReviews, brands, lastImport, version] = await Promise.all([
      count("products"),
      count("products", { publication_status: "eq.published" }),
      count("products", { price_status: "eq.unknown" }),
      count("products", { inventory_status: "eq.unknown" }),
      count("category_mapping_reviews", { status: "eq.review" }).catch(error => error.status === 403 ? null : Promise.reject(error)),
      count("brands"),
      latestImport(),
      catalogVersion()
    ]);
    return Object.freeze({ products, published, noPrice, unknownInventory, categoryReviews, brands, lastImport, version });
  }

  return Object.freeze({ getProfile, getDashboard });
}
