(function () {
  "use strict";

  // Starts with the bundled taxonomy; installCatalogSnapshot swaps in the live one so categories
  // created in the admin resolve without a rebuild.
  let taxonomy = window.sofievkaTaxonomy;
  const sourceMappings = window.sofievkaSourceMappings;
  if (!taxonomy) throw new Error("Catalog taxonomy must be initialized before routing.");

  const rootPath = "/catalog";
  const legacySectionAliases = Object.freeze({
    "/heating": "heating",
    "/water-supply": "water-supply",
    "/climate": "climate"
  });
  const legacyQuerySections = Object.freeze({
    heating: "heating",
    water: "water-supply",
    treatment: "water-treatment",
    automation: "smart-home",
    climate: "climate"
  });
  const legacyCategoryPaths = Object.freeze({
    "/catalog/heating/gas-boilers": "gas-boilers",
    "/catalog/heating/hot-water-tanks": "hot-water-tanks",
    "/catalog/heating/solid-fuel-boilers": "solid-fuel-boilers",
    "/catalog/heating/pellet-boilers": "pellet-boilers",
    "/catalog/heating/heat-accumulators": "heat-accumulators",
    "/catalog/heating/pellet-burners": "pellet-burners",
    "/catalog/heating/boiler-accessories": "heating-components",
    "/catalog/heating/industrial-heating": "heat-generation",
    "/catalog/heating/valves": "heating-valves",
    "/catalog/water-supply/water-treatment": "water-treatment",
    "/catalog/water-supply/water-supply-components": "water-supply-components",
    "/catalog/water-supply/water-supply-components/pump-services": "pump-services",
    "/catalog/water-treatment/reverse-osmosis": "reverse-osmosis",
    "/catalog/water-treatment/flow-filters": "flow-filters",
    "/catalog/water-treatment/mainline-filters-housings": "mainline-filters-housings",
    "/catalog/water-treatment/mainline-cartridges": "mainline-cartridges",
    "/catalog/water-treatment/drinking-system-cartridges": "drinking-system-cartridges",
    "/catalog/water-treatment/filter-media": "filter-media",
    "/catalog/water-treatment/complex-treatment": "complex-treatment",
    "/catalog/water-treatment/water-softening": "water-softening",
    "/catalog/water-treatment/chlorine-odor-removal": "chlorine-odor-removal",
    "/catalog/water-treatment/mechanical-treatment": "mechanical-treatment",
    // Catalogue structure of 2026-10-02: every pump moved under water-supply, single-child water
    // treatment groups were flattened. The old addresses keep resolving to the same categories.
    "/catalog/heating/circulation-pumps": "system-circulation-pumps",
    "/catalog/heating/circulation-pumps/system-circulation": "system-circulation-pumps",
    "/catalog/heating/circulation-pumps/dhw-recirculation": "dhw-circulation-pumps",
    "/catalog/water-supply/water-pumps": "water-supply",
    "/catalog/water-supply/water-pumps/borehole-pumps": "borehole-pumps",
    "/catalog/water-supply/water-pumps/surface-pumps": "surface-pumps",
    "/catalog/water-supply/water-pumps/multistage-pumps": "multistage-pumps",
    "/catalog/water-supply/water-pumps/pressure-boosting": "pressure-boosting",
    "/catalog/water-supply/water-pumps/drainage-pumps": "drainage-pumps",
    "/catalog/water-supply/water-pumps/sewage-pumps": "sewage-pumps",
    "/catalog/water-supply/water-pumps/sewage-lifting-units": "sewage-lifting-units",
    "/catalog/water-supply/water-pumps/pool-pumps-filtration": "pool-pumps-filtration",
    "/catalog/water-supply/components": "water-supply",
    "/catalog/water-supply/components/pressure-tanks": "pressure-tanks",
    "/catalog/water-supply/components/pump-automation": "pump-automation",
    "/catalog/water-supply/components/pump-accessories": "pump-accessories",
    "/catalog/water-supply/components/pump-services": "pump-services",
    "/catalog/water-treatment/replacement-elements": "drinking-water-systems",
    "/catalog/water-treatment/replacement-elements/drinking-system-cartridges": "drinking-system-cartridges",
    "/catalog/water-treatment/materials-reagents": "whole-house-treatment",
    "/catalog/water-treatment/materials-reagents/filter-media": "filter-media",
    "/catalog/water-treatment/disinfection": "uv-disinfection",
    "/catalog/water-treatment/disinfection/uv-c-lamps": "uv-disinfection",
    // Sections v2 of 2026-10-02: heating circulation pumps back under heating, sewage and drainage
    // in their own section. Addresses from structure A keep resolving.
    "/catalog/water-supply/system-circulation": "system-circulation-pumps",
    "/catalog/water-supply/drainage-pumps": "drainage-pumps",
    "/catalog/water-supply/sewage-pumps": "sewage-pumps",
    "/catalog/water-supply/sewage-lifting-units": "sewage-lifting-units"
  });

  function normalizePathname(pathname = rootPath) {
    let value = String(pathname || rootPath).split("?")[0] || rootPath;
    try { value = decodeURIComponent(value); } catch { /* Keep a malformed segment for the not-found state. */ }
    value = value.replace(/\.html$/i, "").replace(/\/+$/, "") || "/";
    return value.startsWith("/") ? value : `/${value}`;
  }

  function getCategoryAncestors(categoryId) {
    const result = [];
    let current = taxonomy.byId[categoryId];
    const visited = new Set();
    while (current?.parentId && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      current = taxonomy.byId[current.parentId];
      if (current) result.unshift(current);
    }
    return Object.freeze(result);
  }

  function getCategoryPath(categoryId) {
    const current = taxonomy.byId[categoryId];
    if (!current) return rootPath;
    const chain = [...getCategoryAncestors(categoryId), current];
    return `${rootPath}/${chain.map(category => encodeURIComponent(category.slug)).join("/")}`;
  }

  function categoryContext(currentCategory, extra = {}) {
    const ancestors = currentCategory ? getCategoryAncestors(currentCategory.id) : Object.freeze([]);
    const section = currentCategory ? (ancestors[0] || currentCategory) : null;
    const children = Object.freeze(currentCategory ? taxonomy.childrenOf(currentCategory.id) : taxonomy.childrenOf(null));
    const descendantIds = Object.freeze(currentCategory
      ? [currentCategory.id, ...taxonomy.descendantsOf(currentCategory.id).map(category => category.id)]
      : taxonomy.nodes.map(category => category.id));
    return Object.freeze({
      catalogState: currentCategory ? "category" : "all",
      currentCategory,
      categoryId: currentCategory?.id || "",
      section,
      sectionId: section?.id || "all",
      ancestors,
      children,
      descendantIds,
      canonicalPath: currentCategory ? getCategoryPath(currentCategory.id) : rootPath,
      status: currentCategory?.status || "active",
      notFound: false,
      reason: "",
      legacy: false,
      legacySourceCategoryId: "",
      redirectTo: "",
      ...extra
    });
  }

  function notFoundContext(pathname, reason, matched = []) {
    const ancestors = Object.freeze([...matched]);
    const section = matched[0] || null;
    return Object.freeze({
      catalogState: "not-found",
      currentCategory: null,
      categoryId: "",
      section,
      sectionId: section?.id || "all",
      ancestors,
      children: Object.freeze([]),
      descendantIds: Object.freeze([]),
      canonicalPath: rootPath,
      status: "not-found",
      notFound: true,
      reason,
      requestedPath: pathname,
      legacy: false,
      legacySourceCategoryId: "",
      redirectTo: ""
    });
  }

  function resolveCatalogPath(pathname) {
    const clean = normalizePathname(pathname);
    if (clean === rootPath) return categoryContext(null);
    if (!clean.startsWith(`${rootPath}/`)) return notFoundContext(clean, "outside-catalog");

    const segments = clean.slice(rootPath.length + 1).split("/").filter(Boolean);
    const matched = [];
    let parentId = null;
    for (const segment of segments) {
      const current = taxonomy.childrenOf(parentId).find(category => category.slug === segment);
      if (!current) return notFoundContext(clean, "invalid-hierarchy", matched);
      matched.push(current);
      parentId = current.id;
    }
    return matched.length ? categoryContext(matched.at(-1)) : categoryContext(null);
  }

  function legacyTarget(pathname, params, pageName) {
    const clean = normalizePathname(pathname);
    const querySection = legacyQuerySections[params.get("category")];
    if ((clean === rootPath || clean === "/catalog") && querySection) {
      return { categoryId: querySection, kind: "query-category", sourceCategoryId: "" };
    }

    const legacyPathCategory = legacyCategoryPaths[clean];
    if (legacyPathCategory) return { categoryId: legacyPathCategory, kind: "legacy-category-path", sourceCategoryId: "" };

    if (clean === "/catalog/water-treatment" && params.has("type")) {
      const sourceCategory = params.get("type");
      const mapped = sourceMappings?.categoryMappings?.ecosoft?.[sourceCategory];
      if (mapped?.categoryId) return { categoryId: mapped.categoryId, kind: "query-type", sourceCategoryId: mapped.categoryId };
    }

    const oldWaterMatch = clean.match(/^\/catalog\/water-supply\/water-treatment\/([^/]+)$/);
    if (oldWaterMatch) {
      const category = taxonomy.descendantsOf("water-treatment").find(item => item.slug === oldWaterMatch[1] || item.id === oldWaterMatch[1]);
      if (category) return { categoryId: category.id, kind: "legacy-water-path", sourceCategoryId: category.id };
    }

    const sectionAlias = legacySectionAliases[clean];
    if (sectionAlias) return { categoryId: sectionAlias, kind: "legacy-section", sourceCategoryId: "" };
    if (clean === rootPath && taxonomy.byId[pageName]?.level === 1) {
      return { categoryId: pageName, kind: "physical-page", sourceCategoryId: "" };
    }
    return null;
  }

  function resolveLocation(pathname = location.pathname, search = location.search, pageName = "catalog") {
    const params = new URLSearchParams(search || "");
    const clean = normalizePathname(pathname);
    const target = legacyTarget(clean, params, pageName);
    if (target) {
      const category = taxonomy.byId[target.categoryId];
      if (!category) return notFoundContext(clean, "unknown-legacy-target");
      const canonicalPath = getCategoryPath(category.id);
      return categoryContext(category, {
        legacy: true,
        legacyKind: target.kind,
        legacySourceCategoryId: target.sourceCategoryId,
        redirectTo: canonicalPath
      });
    }

    const resolved = resolveCatalogPath(clean);
    const usedHtmlExtension = /\.html(?:\/)?$/i.test(String(pathname || ""));
    if (usedHtmlExtension && !resolved.notFound) {
      return Object.freeze({ ...resolved, legacy: true, legacyKind: "html-extension", redirectTo: resolved.canonicalPath });
    }
    return resolved;
  }

  function useTaxonomy(next) {
    if (next?.byId && typeof next.childrenOf === "function") taxonomy = next;
  }

  window.sofievkaCatalogRouting = Object.freeze({
    rootPath,
    useTaxonomy,
    normalizePathname,
    getCategoryAncestors,
    getCategoryPath,
    resolveCatalogPath,
    resolveLocation
  });
})();
