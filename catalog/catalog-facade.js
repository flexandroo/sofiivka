(function () {
  "use strict";

  const baseTaxonomy = window.sofievkaTaxonomy;
  const attributeSchema = window.sofievkaAttributeSchema;
  const sourceMappings = window.sofievkaSourceMappings;
  const routing = window.sofievkaCatalogRouting;
  if (!baseTaxonomy || !attributeSchema || !sourceMappings || !routing) throw new Error("Central catalog modules are incomplete.");

  function createTaxonomy(nodesInput) {
    const nodes = Object.freeze((Array.isArray(nodesInput) ? nodesInput : []).map(item => Object.freeze(item)));
    const byId = Object.freeze(Object.fromEntries(nodes.map(item => [item.id, item])));
    const childrenOf = parentId => nodes.filter(item => item.parentId === parentId).sort((a, b) => a.order - b.order);
    const descendantsOf = parentId => {
      const result = [];
      const visit = id => childrenOf(id).forEach(child => { result.push(child); visit(child.id); });
      visit(parentId);
      return result;
    };
    return Object.freeze({
      nodes,
      byId,
      businessSections: Object.freeze(nodes.filter(item => item.level === 1).sort((a, b) => a.order - b.order)),
      productCategories: Object.freeze(nodes.filter(item => item.level > 1).sort((a, b) => a.order - b.order)),
      childrenOf,
      descendantsOf
    });
  }

  function installCatalogSnapshot(snapshotOverride = null, options = {}) {
    let canonicalProducts = snapshotOverride?.products || window.sofievkaCanonicalProducts || [];
    let brands = snapshotOverride?.brands || window.sofievkaBrands || [];
    let products = window.sofievkaNormalizedProducts || [];
    const taxonomy = snapshotOverride ? createTaxonomy(snapshotOverride.categories) : baseTaxonomy;
    routing.useTaxonomy?.(taxonomy);
    if (snapshotOverride) {
      products = window.sofievkaProductLegacyAdapter.installSnapshot(snapshotOverride, { ...options, taxonomy });
      canonicalProducts = snapshotOverride.products;
      brands = snapshotOverride.brands;
    }
    const attributeDefinitions = snapshotOverride?.attributeDefinitions || attributeSchema.definitions;
    const categoryCounts = Object.freeze({ ...(snapshotOverride?.categoryCounts || {}) });
    const brandCounts = Object.freeze({ ...(snapshotOverride?.brandCounts || {}) });
    const totalProducts = Number(snapshotOverride?.totalProducts ?? products.length);

    const catalogState = Object.freeze({
      id: "all",
      slug: "",
      name: "Усі товари",
      title: "Каталог обладнання",
      shortTitle: "Увесь каталог",
      description: "Інженерне обладнання для опалення, водопостачання, водоочищення, автоматизації, клімату та господарства.",
      menuDescription: "Усі товари та фільтри в одному каталозі",
      order: 0,
      status: "state",
      metaTitle: "Каталог інженерного обладнання | ТД «Софіївка»"
    });
    const sections = taxonomy.businessSections;
    const categories = taxonomy.productCategories;
    const sectionById = Object.freeze({ all: catalogState, ...Object.fromEntries(sections.map(section => [section.id, section])) });
    const categoryById = taxonomy.byId;
    const catalogProducts = Object.freeze(products.filter(product => {
      const category = categoryById[product.primaryCategoryId];
      return product.publicationStatus === "published" && category?.status === "active" && category?.visibility === "catalog";
    }));
    const serviceItems = Object.freeze(products.filter(product => categoryById[product.primaryCategoryId]?.visibility === "service"));

    function sectionUrl(sectionId = "all") { return sectionId === "all" ? routing.rootPath : routing.getCategoryPath(sectionId); }
    function categoryUrl(categoryId) { return routing.getCategoryPath(categoryId); }
    function brandUrl(brandId) { return `/brands/${encodeURIComponent(brandId)}`; }
    function descendantIds(categoryId) { return new Set([categoryId, ...taxonomy.descendantsOf(categoryId).map(category => category.id)]); }
    function productsForSection(sectionId) { return sectionId === "all" ? [...catalogProducts] : catalogProducts.filter(product => product.sectionId === sectionId); }
    function productsForCategory(categoryId) {
      const ids = descendantIds(categoryId);
      return catalogProducts.filter(product => ids.has(product.primaryCategoryId));
    }
    function countForCategory(categoryId) { return Number(categoryCounts[categoryId] ?? productsForCategory(categoryId).length); }
    function countForSection(sectionId) { return sectionId === "all" ? totalProducts : countForCategory(sectionId); }
    function countForBrand(brandId) { return Number(brandCounts[brandId] ?? catalogProducts.filter(product => product.brandId === brandId).length); }
    function availableCategories(sectionId) {
      return taxonomy.childrenOf(sectionId).filter(category => category.status === "active" && countForCategory(category.id) > 0);
    }
    const activeSections = Object.freeze(sections.filter(section => section.status === "active" && countForSection(section.id) > 0));
    const navigationSections = Object.freeze([catalogState, ...activeSections]);

    function resolveRoute(pathname = location.pathname, search = location.search, pageName = "catalog") {
      return routing.resolveLocation(pathname, search, pageName);
    }
    function valueLabel(definition, value) {
      if (definition?.type === "boolean") return value === true || value === "true" || value === "yes" ? "Так" : "Ні";
      if (attributeSchema.valueLabels[value]) return attributeSchema.valueLabels[value];
      if (definition?.type === "number") return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 4 }).format(Number(value))} ${definition.unit}`;
      return String(value);
    }
    function filterValue(definition, value) {
      if (definition?.type !== "boolean") return value;
      return definition.legacyValues?.[String(value)] || String(value);
    }
    function compareProductsByPrice(firstProduct, secondProduct, direction = "asc") {
      const first = Number.isFinite(firstProduct?.pricing?.amount) && firstProduct.pricing.amount > 0 ? firstProduct.pricing.amount : null;
      const second = Number.isFinite(secondProduct?.pricing?.amount) && secondProduct.pricing.amount > 0 ? secondProduct.pricing.amount : null;
      if (first === null || second === null) return first === null && second === null ? 0 : first === null ? 1 : -1;
      return direction === "desc" ? second - first : first - second;
    }

    const snapshot = Object.freeze(snapshotOverride || {
      version: "catalog-contract-v1",
      products: canonicalProducts,
      categories: taxonomy.nodes,
      brands,
      attributeDefinitions
    });
    window.sofievkaCatalogSnapshot = snapshot;

    const waterCategories = taxonomy.descendantsOf("water-treatment").filter(category => category.legacyGroup);
    const waterGroups = [...new Set(waterCategories.map(category => category.legacyGroup))].map(groupId => Object.freeze({
      slug: groupId,
      name: waterCategories.find(category => category.legacyGroup === groupId)?.legacyGroupTitle || groupId,
      children: Object.freeze(waterCategories.filter(category => category.legacyGroup === groupId).map(category => Object.freeze({ slug: category.slug, name: category.title })))
    }));
    const waterCategoryBySlug = Object.freeze(Object.fromEntries(waterCategories.map(category => [category.slug, Object.freeze({
      slug: category.slug,
      name: category.title,
      groupSlug: category.legacyGroup,
      groupName: category.legacyGroupTitle
    })])));
    const waterProducts = Object.freeze(catalogProducts.filter(product => product.sectionId === "water-treatment"));
    const distribution = Object.freeze(Object.fromEntries(waterCategories.map(category => [category.id, productsForCategory(category.id).length])));
    window.sofievkaWaterCatalog = Object.freeze({
      taxonomy: Object.freeze(waterGroups),
      categoryBySlug: waterCategoryBySlug,
      supplierMappings: sourceMappings.supplierLabelMappings.ecosoft,
      products: waterProducts,
      report: Object.freeze({
        sourceCount: window.sofievkaNormalizationReport?.waterSourceCount || waterProducts.length,
        normalizedCount: waterProducts.length,
        uncategorized: Object.freeze(waterProducts.filter(product => !categoryById[product.primaryCategoryId]).map(product => product.id)),
        duplicateIds: window.sofievkaNormalizationReport?.duplicateInputIds || Object.freeze([]),
        ambiguous: Object.freeze([]),
        distribution
      })
    });
    window.sofievkaProducts = waterProducts;

    const catalog = Object.freeze({
      catalogState, sections, activeSections, navigationSections, categories, taxonomy,
      sectionById, categoryById, attributeDefinitions, attributeSchema, sourceMappings,
      snapshot, canonicalProducts, products, catalogProducts, serviceItems, brands,
      totalProducts, categoryCounts, brandCounts,
      slugify: window.sofievkaProductNormalizer.slugify,
      sectionUrl, categoryUrl,
      getCategoryPath: routing.getCategoryPath,
      getCategoryAncestors: routing.getCategoryAncestors,
      brandUrl, productsForSection, productsForCategory, countForSection, countForCategory, countForBrand, availableCategories,
      resolveRoute, valueLabel, filterValue, compareProductsByPrice
    });
    window.sofievkaCatalog = catalog;
    return catalog;
  }

  window.sofievkaInstallCatalogSnapshot = installCatalogSnapshot;
  installCatalogSnapshot();
})();
