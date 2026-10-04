(function () {
  "use strict";

  const query = typeof location === "object" ? new URLSearchParams(location.search) : null;
  const runtimeConfig = window.SOFIEVKA_CATALOG_CONFIG || {};
  const configuredSource = runtimeConfig.source == null || runtimeConfig.source === "" ? "local" : String(runtimeConfig.source);
  const override = query?.get("dataSource") || "";
  const localHost = typeof location === "object" && ["127.0.0.1", "localhost"].includes(location.hostname);
  const explicitlyEnabled = window.SOFIEVKA_DEV_CATALOG_SOURCE === true;
  const debugOverride = localHost && explicitlyEnabled && ["local", "supabase", "supabase-full"].includes(override) ? override : "";
  const mode = debugOverride || configuredSource;
  const invalidSource = !["local", "supabase", "supabase-full"].includes(mode);
  const requested = mode === "supabase" || mode === "supabase-full";
  const BOOTSTRAP_CACHE_KEY = "sofievka-catalog-bootstrap-v1";
  const BOOTSTRAP_CACHE_TTL_MS = 300_000;
  const setDocumentDataSource = value => {
    if (typeof document === "object" && document.documentElement) {
      document.documentElement.dataset.catalogDataSource = value;
    }
  };

  window.sofievkaCatalogRemoteRequested = requested;
  window.sofievkaCatalogDataSource = invalidSource ? "configuration-error" : requested ? `${mode}-loading` : "local";
  setDocumentDataSource(window.sofievkaCatalogDataSource);
  const startup = invalidSource
    ? Promise.reject(new Error(`Unsupported catalogue source: ${mode}`))
    : requested
      ? (mode === "supabase-full" ? loadSupabaseSnapshot() : loadSupabaseScoped())
      : Promise.resolve(window.sofievkaCatalogSnapshot);
  window.sofievkaCatalogDataReady = startup.catch(error => {
    window.sofievkaCatalogStartupError = error;
    window.sofievkaCatalogDataSource = "configuration-error";
    setDocumentDataSource("configuration-error");
    throw error;
  });

  async function createSource() {
    const configuredSupabase = runtimeConfig.supabase || {};
    const legacySupabase = window.SOFIEVKA_SUPABASE_CONFIG || {};
    const config = {
      url: configuredSupabase.url || runtimeConfig.supabaseUrl || legacySupabase.url,
      publishableKey: configuredSupabase.publishableKey || runtimeConfig.supabasePublishableKey || legacySupabase.publishableKey
    };
    if (!config.url || !config.publishableKey) {
      throw new Error("Supabase catalogue source requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
    }
    // "?v=" is replaced by a content hash at build time (scripts/build-static-site.mjs), so the modules are cached
    // as immutable files; the pages also <link rel="modulepreload"> them.
    const [{ createSofievkaSupabasePublicClient }, { SupabaseCatalogDataSource }] = await Promise.all([
      import("/lib/supabase-client.mjs?v=1"), import("/catalog/supabase-data-source.mjs?v=1")
    ]);
    const source = new SupabaseCatalogDataSource({ client: createSofievkaSupabasePublicClient(config), cacheTtlMs: 300_000 });
    return { source, cacheScope: String(config.url) };
  }

  // The bootstrap (categories, brands, counts; ~120 KB) is the same on every page, so one copy per tab is kept in
  // sessionStorage for a few minutes. A cached copy is used only after get_catalog_version confirms that it is still
  // the live version, so an admin publish or a new snapshot shows on the next page.
  function readCachedBootstrap(scope) {
    try {
      const raw = window.sessionStorage?.getItem(BOOTSTRAP_CACHE_KEY);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      const age = Date.now() - Number(entry?.savedAt);
      if (!entry || entry.scope !== scope || !(age >= 0 && age < BOOTSTRAP_CACHE_TTL_MS)) return null;
      const bootstrap = entry.bootstrap;
      if (!bootstrap || typeof bootstrap.version !== "string" || !bootstrap.version || bootstrap.version !== entry.version) return null;
      if (!Array.isArray(bootstrap.categories) || !Array.isArray(bootstrap.brands)) return null;
      return bootstrap;
    } catch {
      return null;
    }
  }

  function writeCachedBootstrap(scope, bootstrap) {
    try {
      if (!bootstrap || typeof bootstrap.version !== "string" || !bootstrap.version) return;
      window.sessionStorage?.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({ scope, version: bootstrap.version, savedAt: Date.now(), bootstrap }));
    } catch {
      try { window.sessionStorage?.removeItem(BOOTSTRAP_CACHE_KEY); } catch {}
    }
  }

  async function loadBootstrap(source, scope) {
    const cached = readCachedBootstrap(scope);
    if (cached) {
      const live = await source.getCatalogVersion().catch(() => null);
      if (live && typeof live.version === "string" && live.version === cached.version) return Object.freeze(cached);
    }
    const bootstrap = await source.loadBootstrap();
    writeCachedBootstrap(scope, bootstrap);
    return bootstrap;
  }

  // Product pages: the product request starts together with the bootstrap instead of after it; page-shell.js then
  // asks for the same product and gets it from the data source's in-memory cache.
  function prefetchPageProduct(source) {
    try {
      if (document.body?.dataset.page !== "product") return null;
      const match = location.pathname.match(/^\/product\/([^/]+)\/?$/);
      const slug = match ? decodeURIComponent(match[1]).toLowerCase() : "";
      const id = new URLSearchParams(location.search).get("id") || "";
      const request = slug ? source.getProductBySlug(slug) : id ? source.getProductById(id) : null;
      return request ? request.catch(() => null) : null;
    } catch {
      return null;
    }
  }

  async function loadSupabaseScoped() {
    const { source, cacheScope } = await createSource();
    window.sofievkaCatalogScopedDataSource = source;
    window.sofievkaCatalogDataSource = "supabase-scoped-loading";
    const productRequest = prefetchPageProduct(source);
    const bootstrap = await loadBootstrap(source, cacheScope);
    await productRequest;
    const snapshot = Object.freeze({
      version: bootstrap.version,
      products: Object.freeze([]),
      categories: bootstrap.categories,
      brands: bootstrap.brands,
      attributeDefinitions: bootstrap.attributeDefinitions,
      totalProducts: bootstrap.totalProducts,
      categoryCounts: bootstrap.categoryCounts,
      brandCounts: bootstrap.brandCounts,
      collections: bootstrap.collections
    });
    if (typeof window.sofievkaInstallCatalogSnapshot !== "function") throw new Error("Catalog runtime installer is unavailable.");
    window.sofievkaInstallCatalogSnapshot(snapshot, { useRawCatalog: false });
    window.sofievkaInstallPdp?.();
    window.sofievkaInstallCatalogSearch?.();
    window.sofievkaCatalogDataSource = "supabase-scoped";
    window.sofievkaCatalogDataSourceMetrics = source.lastMetrics;
    setDocumentDataSource("supabase-scoped");
    return snapshot;
  }

  async function loadSupabaseSnapshot() {
    const { source } = await createSource();
    const snapshot = await source.loadCatalogSnapshot();
    if (typeof window.sofievkaInstallCatalogSnapshot !== "function") {
      throw new Error("Catalog runtime installer is unavailable.");
    }
    window.sofievkaInstallCatalogSnapshot(snapshot, { useRawCatalog: false });
    window.sofievkaInstallPdp?.();
    window.sofievkaInstallCatalogSearch?.();
    window.sofievkaCatalogDataSource = "supabase-full-debug";
    window.sofievkaCatalogDataSourceMetrics = source.lastMetrics;
    setDocumentDataSource("supabase-full-debug");
    return snapshot;
  }
})();
