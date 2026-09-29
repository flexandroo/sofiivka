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
    const [{ createSofievkaSupabasePublicClient }, { SupabaseCatalogDataSource }] = await Promise.all([
      import("/lib/supabase-client.mjs"), import("/catalog/supabase-data-source.mjs")
    ]);
    return new SupabaseCatalogDataSource({ client: createSofievkaSupabasePublicClient(config), cacheTtlMs: 300_000 });
  }

  async function loadSupabaseScoped() {
    const source = await createSource();
    window.sofievkaCatalogScopedDataSource = source;
    window.sofievkaCatalogDataSource = "supabase-scoped-loading";
    const bootstrap = await source.loadBootstrap();
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
    const source = await createSource();
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
