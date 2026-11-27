import { setTimeout as wait } from "node:timers/promises";

const PAGE_SIZE = 96;
const MAX_PRODUCT_PAGES = 400;
const RPC_ATTEMPTS = 3;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function productPath(product) {
  if (product?.slug) return `/product/${encodeURIComponent(product.slug)}`;
  if (product?.id) return `/product?id=${encodeURIComponent(product.id)}`;
  return "";
}

export async function publicCatalogRpc(supabase, name, body, { fetchImpl = globalThis.fetch, waitImpl = wait, signal } = {}) {
  for (let attempt = 1; attempt <= RPC_ATTEMPTS; attempt += 1) {
    signal?.throwIfAborted();
    let response;
    try {
      const requestTimeout = AbortSignal.timeout(20000);
      response = await fetchImpl(`${supabase.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: supabase.publishableKey, Authorization: `Bearer ${supabase.publishableKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, requestTimeout]) : requestTimeout
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (attempt === RPC_ATTEMPTS) throw new Error(`${name}: request failed after ${attempt} attempts (${error.message})`, { cause: error });
      await waitImpl(250 * attempt);
      continue;
    }
    if (response.ok) return response.json();
    if (!TRANSIENT_HTTP_STATUSES.has(response.status) || attempt === RPC_ATTEMPTS) {
      throw new Error(`${name}: HTTP ${response.status} after ${attempt} attempt${attempt === 1 ? "" : "s"}`);
    }
    await waitImpl(250 * attempt);
  }
}

export async function readPublicCatalog(supabase, { requireComplete = false, mapProduct = product => product, concurrency = 1, ...options } = {}) {
  const bootstrap = await publicCatalogRpc(supabase, "get_catalog_bootstrap", {}, options);
  if (!Array.isArray(bootstrap?.categories)) throw new Error("get_catalog_bootstrap returned no release");
  const validTotal = value => Number.isSafeInteger(value) && value >= 0;
  if (requireComplete && !validTotal(bootstrap.totalProducts)) throw new Error("get_catalog_bootstrap returned no valid totalProducts");
  const products = [];
  const ids = new Set();
  const addresses = new Set();
  const batchSize = Math.max(1, Math.min(8, Math.trunc(concurrency) || 1));
  const getPage = page => publicCatalogRpc(supabase, "get_catalog_products", { page_number: page, page_size: PAGE_SIZE }, options);
  let total = null;
  const addPage = (result, page) => {
    if (!Array.isArray(result?.products) || typeof result.hasMore !== "boolean") throw new Error(`get_catalog_products page ${page}: invalid products/hasMore`);
    if (bootstrap.version && result.version && bootstrap.version !== result.version) throw new Error(`Catalogue changed while fetching products (page ${page})`);
    if (requireComplete && !validTotal(result.total)) throw new Error(`get_catalog_products page ${page}: missing valid total`);
    if (result.total != null) {
      if (!validTotal(result.total)) throw new Error(`get_catalog_products page ${page}: invalid total`);
      if (total !== null && result.total !== total) throw new Error(`get_catalog_products page ${page}: total changed from ${total} to ${result.total}`);
      total = result.total;
      if (total > MAX_PRODUCT_PAGES * PAGE_SIZE) throw new Error(`get_catalog_products total ${total} exceeds sitemap page cap ${MAX_PRODUCT_PAGES}`);
      if (validTotal(bootstrap.totalProducts) && total !== bootstrap.totalProducts) throw new Error(`Catalogue totals differ: bootstrap ${bootstrap.totalProducts}, products ${total}`);
      if (result.hasMore !== (page * PAGE_SIZE < total)) throw new Error(`get_catalog_products page ${page}: hasMore disagrees with total ${total}`);
      const expected = Math.min(PAGE_SIZE, Math.max(0, total - (page - 1) * PAGE_SIZE));
      if (result.products.length !== expected) throw new Error(`get_catalog_products page ${page}: truncated page (${result.products.length}/${expected} products)`);
    }
    if (result.page != null && result.page !== page) throw new Error(`get_catalog_products returned page ${result.page} instead of ${page}`);
    if (result.pageSize != null && result.pageSize !== PAGE_SIZE) throw new Error(`get_catalog_products returned pageSize ${result.pageSize} instead of ${PAGE_SIZE}`);
    for (const product of result.products) {
      if (typeof product?.id !== "string" || !product.id.trim()) throw new Error(`get_catalog_products page ${page}: product has no id`);
      if (ids.has(product.id)) throw new Error(`get_catalog_products page ${page}: duplicate product id ${product.id}`);
      if (product.slug != null && typeof product.slug !== "string") throw new Error(`get_catalog_products page ${page}: invalid product slug`);
      const address = productPath(product);
      if (addresses.has(address)) throw new Error(`get_catalog_products page ${page}: duplicate product URL ${address}`);
      ids.add(product.id);
      addresses.add(address);
      products.push(mapProduct(product));
    }
    if (!result.hasMore) {
      if (total !== null && ids.size !== total) throw new Error(`Incomplete sitemap catalogue: ${ids.size}/${total} unique products`);
    }
  };
  for (let page = 1; page <= MAX_PRODUCT_PAGES;) {
    // The first validated page establishes the total before concurrent reads.
    const count = total === null ? 1 : Math.min(batchSize, Math.ceil(total / PAGE_SIZE) - page + 1);
    const batch = await Promise.all(Array.from({ length: count }, (_, index) => getPage(page + index)));
    for (const result of batch) {
      addPage(result, page);
      if (!result.hasMore) return { ...bootstrap, products };
      page += 1;
    }
  }
  throw new Error(`get_catalog_products exceeded sitemap page cap ${MAX_PRODUCT_PAGES} with hasMore=true`);
}
