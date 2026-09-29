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

  async function request(pathname, { method = "GET", body, headers = {}, optional = false, signal } = {}) {
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
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000)
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new AdminApiError("Запит скасовано.", { code: "aborted" });
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

  async function rpc(name, body = {}, signal) {
    const response = await request(`/rest/v1/rpc/${name}`, { method: "POST", body, signal });
    return response.json();
  }

  async function getProductReferenceData() {
    return rpc("admin_product_reference_data");
  }

  async function listProducts(filters = {}, { signal } = {}) {
    return rpc("admin_list_products", {
      query_text: filters.query || null,
      filter_category_id: filters.categoryId || null,
      filter_brand_id: filters.brandId || null,
      filter_publication: filters.publication || null,
      filter_inventory: filters.inventory || null,
      filter_price: filters.price || null,
      sort_mode: filters.sort || "updated-desc",
      page_number: Math.max(1, Number(filters.page) || 1),
      page_size: Math.min(100, Math.max(1, Number(filters.pageSize) || 50))
    }, signal);
  }

  async function getProduct(legacyId, { signal } = {}) {
    return rpc("admin_get_product", { target_legacy_id: String(legacyId || "").trim() }, signal);
  }

  async function createProduct(payload) {
    return rpc("admin_create_product", { payload });
  }

  async function saveProduct(payload) {
    return rpc("admin_save_product", { payload });
  }

  async function bulkProducts(legacyIds, action, value = null) {
    return rpc("admin_bulk_products", {
      target_legacy_ids: legacyIds,
      action_name: action,
      action_value: value || null
    });
  }

  async function uploadAsset(file, { productId, kind = "media" }) {
    if (!(file instanceof File)) throw new AdminApiError("Оберіть файл для завантаження.", { code: "invalid_file" });
    const bucket = kind === "document" ? "documents" : "product-media";
    const maximum = kind === "document" ? 25 * 1024 * 1024 : 50 * 1024 * 1024;
    if (!file.size || file.size > maximum) throw new AdminApiError("Файл перевищує дозволений розмір.", { code: "invalid_file_size" });
    const safeName = file.name.toLocaleLowerCase("en-US").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
    const storagePath = `${productId}/${crypto.randomUUID()}-${safeName}`;
    const token = getAccessToken();
    if (!token) throw new AdminApiError("Сесію завершено. Увійдіть знову.", { status: 401, code: "session_expired" });
    let response;
    try {
      response = await fetchImplementation(`${url}/storage/v1/object/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "false"
        },
        body: file,
        signal: AbortSignal.timeout(60_000)
      });
    } catch {
      throw new AdminApiError("Файл не завантажено. Перевірте з’єднання.", { code: "upload_error" });
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new AdminApiError(payload?.message || "Storage відхилив файл.", { status: response.status, code: payload?.error || "upload_error" });
    }
    return Object.freeze({
      bucket,
      storagePath,
      url: `${url}/storage/v1/object/public/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`
    });
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

  return Object.freeze({
    getProfile,
    getDashboard,
    getProductReferenceData,
    listProducts,
    getProduct,
    createProduct,
    saveProduct,
    bulkProducts,
    uploadAsset
  });
}
