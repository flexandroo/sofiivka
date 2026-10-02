import { validatePublicConfig } from "/lib/supabase-client.mjs";

export class AdminApiError extends Error {
  constructor(message, { status = 0, code = "api_error" } = {}) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

// CSV exports are fetched in pages of this size (the RPCs cap pages at 1000 rows).
export const CRM_EXPORT_PAGE_SIZE = 500;

export function createAdminApi(config, getAccessToken, { fetchImplementation = globalThis.fetch } = {}) {
  const { url, publishableKey } = validatePublicConfig(config);

  async function request(pathname, { method = "GET", body, headers = {}, optional = false, signal } = {}) {
    const token = await getAccessToken();
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
      throw new AdminApiError("База даних зараз недоступна. Спробуйте ще раз.", { code: "network_error" });
    }
    if (response.status === 401) throw new AdminApiError("Сесію завершено. Увійдіть знову.", { status: 401, code: "session_expired" });
    if (!response.ok) {
      if (optional && [403, 404].includes(response.status)) return null;
      const payload = await response.json().catch(() => null);
      throw new AdminApiError(payload?.message || "Не вдалося отримати дані з бази.", { status: response.status, code: payload?.code });
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
    const token = await getAccessToken();
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

  // CRM
  const crmPage = filters => ({
    page_number: Math.max(1, Number(filters.page) || 1),
    page_size: Math.min(100, Math.max(1, Number(filters.pageSize) || 50))
  });
  const crm = Object.freeze({
    overview: () => rpc("admin_crm_overview"),
    listOrders: (filters = {}, { signal } = {}) => rpc("admin_crm_list_orders", {
      query_text: filters.query || null, filter_status: filters.status || null, ...crmPage(filters)
    }, signal),
    getOrder: (number, { signal } = {}) => rpc("admin_crm_get_order", { order_number: Number(number) }, signal),
    updateOrder: (number, patch, expectedUpdatedAt) => rpc("admin_crm_update_order", {
      order_number: Number(number), patch, expected_updated_at: expectedUpdatedAt || null
    }),
    listLeads: (filters = {}, { signal } = {}) => rpc("admin_crm_list_leads", {
      query_text: filters.query || null, filter_status: filters.status || null, filter_type: filters.type || null, ...crmPage(filters)
    }, signal),
    getLead: (number, { signal } = {}) => rpc("admin_crm_get_lead", { lead_number: Number(number) }, signal),
    updateLead: (number, patch, expectedUpdatedAt) => rpc("admin_crm_update_lead", {
      lead_number: Number(number), patch, expected_updated_at: expectedUpdatedAt || null
    }),
    listCustomers: (filters = {}, { signal } = {}) => rpc("admin_crm_list_customers", {
      query_text: filters.query || null, ...crmPage(filters)
    }, signal),
    getCustomer: (id, { signal } = {}) => rpc("admin_crm_get_customer", { customer_id: id }, signal),
    updateCustomer: (id, patch, expectedUpdatedAt) => rpc("admin_crm_update_customer", {
      customer_id: id, patch, expected_updated_at: expectedUpdatedAt || null
    }),
    addNote: (entityType, entityKey, note) => rpc("admin_crm_add_note", {
      entity_type: entityType, entity_key: String(entityKey), note
    }),
    updateOrderItems: (number, lines, expectedUpdatedAt) => rpc("admin_crm_update_order_items", {
      order_number: Number(number), lines, expected_updated_at: expectedUpdatedAt || null
    }),
    createOrder: payload => rpc("admin_crm_create_order", { payload }),
    searchProducts: (query, { signal } = {}) => rpc("admin_crm_search_products", {
      query_text: String(query || "").trim(), max_rows: 12
    }, signal),
    exportOrders: (filters = {}, page = 1) => rpc("admin_crm_export_orders", {
      query_text: filters.query || null, filter_status: filters.status || null,
      page_number: Math.max(1, Number(page) || 1), page_size: CRM_EXPORT_PAGE_SIZE
    }),
    exportCustomers: (filters = {}, page = 1) => rpc("admin_crm_export_customers", {
      query_text: filters.query || null, page_number: Math.max(1, Number(page) || 1), page_size: CRM_EXPORT_PAGE_SIZE
    })
  });

  // Brands and categories
  const taxonomy = Object.freeze({
    listBrands: ({ signal } = {}) => rpc("admin_list_brands", {}, signal),
    getBrand: (id, { signal } = {}) => rpc("admin_get_brand", { brand_id: String(id || "") }, signal),
    updateBrand: (id, patch, expectedUpdatedAt) => rpc("admin_update_brand", {
      brand_id: String(id), patch, expected_updated_at: expectedUpdatedAt || null
    }),
    listCategories: ({ signal } = {}) => rpc("admin_list_categories", {}, signal),
    getCategory: (id, { signal } = {}) => rpc("admin_get_category", { category_id: String(id || "") }, signal),
    updateCategory: (id, patch, expectedUpdatedAt) => rpc("admin_update_category", {
      category_id: String(id), patch, expected_updated_at: expectedUpdatedAt || null
    }),
    createBrand: payload => rpc("admin_create_brand", { payload }),
    deleteBrand: (id, expectedUpdatedAt) => rpc("admin_delete_brand", { brand_id: String(id), expected_updated_at: expectedUpdatedAt || null }),
    createCategory: payload => rpc("admin_create_category", { payload }),
    deleteCategory: (id, expectedUpdatedAt) => rpc("admin_delete_category", { category_id: String(id), expected_updated_at: expectedUpdatedAt || null }),
    setHomepageCategories: ids => rpc("admin_set_homepage_categories", { category_ids: ids })
  });

  const settings = Object.freeze({
    get: ({ signal } = {}) => rpc("admin_get_settings", {}, signal),
    update: (section, value, expectedUpdatedAt) => rpc("admin_update_settings", {
      section, value, expected_updated_at: expectedUpdatedAt || null
    }),
    notificationsStatus: ({ signal } = {}) => rpc("admin_notifications_status", {}, signal),
    sendTestNotification: () => rpc("admin_notifications_send_test", {})
  });

  // Information pages and FAQ (/admin/pages)
  const pages = Object.freeze({
    list: ({ signal } = {}) => rpc("admin_list_site_pages", {}, signal),
    get: (slug, { signal } = {}) => rpc("admin_get_site_page", { page_slug: String(slug || "") }, signal),
    save: (slug, payload, expectedUpdatedAt) => rpc("admin_save_site_page", {
      page_slug: String(slug), payload, expected_updated_at: expectedUpdatedAt || null
    }),
    saveFaq: (items, expectedUpdatedAt) => rpc("admin_save_site_faq", { items, expected_updated_at: expectedUpdatedAt || null })
  });

  // Collections (homepage blocks and other product selections)
  const collections = Object.freeze({
    list: ({ signal } = {}) => rpc("admin_list_collections", {}, signal),
    get: (id, { signal } = {}) => rpc("admin_get_collection", { collection_id: String(id || "") }, signal),
    update: (id, patch, expectedUpdatedAt) => rpc("admin_update_collection", {
      collection_id: String(id), patch, expected_updated_at: expectedUpdatedAt || null
    }),
    setProducts: (id, productIds, expectedUpdatedAt) => rpc("admin_set_collection_products", {
      collection_id: String(id), product_ids: productIds, expected_updated_at: expectedUpdatedAt || null
    }),
    searchProducts: (query, { signal } = {}) => rpc("admin_search_collection_products", {
      query_text: String(query || ""), result_limit: 20
    }, signal),
    create: payload => rpc("admin_create_collection", { payload }),
    remove: (id, expectedUpdatedAt) => rpc("admin_delete_collection", { collection_id: String(id), expected_updated_at: expectedUpdatedAt || null })
  });

  // Characteristics and category filters
  const attributes = Object.freeze({
    list: ({ signal } = {}) => rpc("admin_list_attributes", {}, signal),
    get: (id, { signal } = {}) => rpc("admin_get_attribute", { attribute_id: String(id || "") }, signal),
    create: payload => rpc("admin_create_attribute", { payload }),
    update: (id, patch, expectedUpdatedAt) => rpc("admin_update_attribute", {
      attribute_id: String(id), patch, expected_updated_at: expectedUpdatedAt || null
    }),
    remove: (id, expectedUpdatedAt) => rpc("admin_delete_attribute", { attribute_id: String(id), expected_updated_at: expectedUpdatedAt || null }),
    getCategoryFilters: (categoryId, { signal } = {}) => rpc("admin_get_category_attributes", { category_id: String(categoryId || "") }, signal),
    setCategoryFilters: (categoryId, items, version) => rpc("admin_set_category_attributes", {
      category_id: String(categoryId), payload: { items }, expected_version: version || null
    })
  });

  // Staff: profiles through RPC; a brand-new account goes through the admin-staff edge function.
  const staff = Object.freeze({
    list: ({ signal } = {}) => rpc("admin_list_staff", {}, signal),
    update: (userId, patch, expectedUpdatedAt) => rpc("admin_update_staff", {
      target_user_id: userId, patch, expected_updated_at: expectedUpdatedAt || null
    }),
    async add({ email, name, role }) {
      const result = await rpc("admin_add_staff", { email, name, role });
      if (result?.status !== "needs_account") return result;
      const response = await request("/functions/v1/admin-staff", { method: "POST", body: { email, name, role } })
        .catch(error => {
          if (error.code === "network_error" || error.status === 404) {
            throw new AdminApiError("У цього email ще немає облікового запису, а сервіс створення облікових записів не підключено. Створіть користувача в Supabase → Authentication і спробуйте ще раз.", { code: "staff_function_missing" });
          }
          throw error;
        });
      return response.json();
    }
  });

  // Prices and stock: CSV export and the batched price import (/admin/products/import)
  const prices = Object.freeze({
    exportProducts: (filters = {}, page = 1, pageSize = 1000) => rpc("admin_export_products", {
      query_text: filters.query || null, filter_category_id: filters.categoryId || null, filter_brand_id: filters.brandId || null,
      filter_publication: filters.publication || null, filter_inventory: filters.inventory || null, filter_price: filters.price || null,
      page_number: Math.max(1, Number(page) || 1), page_size: Math.min(1000, Math.max(1, Number(pageSize) || 1000))
    }),
    apply: payload => rpc("admin_apply_price_updates", { payload })
  });

  async function changePassword(password) {
    await request("/auth/v1/user", { method: "PUT", body: { password } });
  }

  return Object.freeze({
    crm,
    staff,
    changePassword,
    taxonomy,
    settings,
    pages,
    collections,
    attributes,
    getProfile,
    getDashboard,
    getProductReferenceData,
    listProducts,
    getProduct,
    createProduct,
    saveProduct,
    bulkProducts,
    uploadAsset,
    prices
  });
}
