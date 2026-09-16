(function () {
  "use strict";

  const taxonomy = window.sofievkaTaxonomy;
  const sourceMappings = window.sofievkaSourceMappings;
  if (!taxonomy) throw new Error("Catalog taxonomy must be initialized before routing.");

  const rootPath = "/catalog";
  const legacySectionAliases = Object.freeze({
    "/heating": "heating",
    "/water-supply": "water-supply",
    "/plumbing": "plumbing",
    "/climate": "climate"
  });
  const legacyQuerySections = Object.freeze({
    heating: "heating",
    water: "water-supply",
    plumbing: "plumbing",
    climate: "climate"
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

    const legacyWaterRoot = clean === "/catalog/water-treatment";
    if (legacyWaterRoot && params.has("type")) {
      const sourceCategory = params.get("type");
      const mapped = sourceMappings?.categoryMappings?.ecosoft?.[sourceCategory];
      if (mapped?.categoryId) return { categoryId: mapped.categoryId, kind: "query-type", sourceCategoryId: mapped.categoryId };
    }

    const oldWaterMatch = clean.match(/^\/catalog\/water-treatment\/([^/]+)$/);
    if (oldWaterMatch) {
      const category = taxonomy.childrenOf("water-treatment").find(item => item.slug === oldWaterMatch[1]);
      if (category) return { categoryId: category.id, kind: "legacy-water-path", sourceCategoryId: category.id };
    }
    if (legacyWaterRoot) return { categoryId: "water-treatment", kind: "legacy-water-root", sourceCategoryId: "" };

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

  window.sofievkaCatalogRouting = Object.freeze({
    rootPath,
    normalizePathname,
    getCategoryAncestors,
    getCategoryPath,
    resolveCatalogPath,
    resolveLocation
  });
})();
