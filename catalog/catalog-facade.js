(function () {
  "use strict";

  const taxonomy = window.sofievkaTaxonomy;
  const attributeSchema = window.sofievkaAttributeSchema;
  const sourceMappings = window.sofievkaSourceMappings;
  const routing = window.sofievkaCatalogRouting;
  const products = Array.isArray(window.sofievkaNormalizedProducts) ? window.sofievkaNormalizedProducts : [];
  const brands = Array.isArray(window.sofievkaBrands) ? window.sofievkaBrands : [];
  if (!taxonomy || !attributeSchema || !sourceMappings || !routing) throw new Error("Central catalog modules are incomplete.");

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
  const attributeDefinitions = attributeSchema.definitions;
  const catalogProducts = Object.freeze(products.filter(product => {
    const category = categoryById[product.primaryCategoryId];
    return category?.status === "active" && category?.visibility === "catalog";
  }));
  const serviceItems = Object.freeze(products.filter(product => categoryById[product.primaryCategoryId]?.visibility === "service"));

  function sectionUrl(sectionId = "all") {
    return sectionId === "all" ? routing.rootPath : routing.getCategoryPath(sectionId);
  }

  function categoryUrl(categoryId) {
    return routing.getCategoryPath(categoryId);
  }

  function brandUrl(brandId) { return `/brands/${encodeURIComponent(brandId)}`; }
  function descendantIds(categoryId) { return new Set([categoryId, ...taxonomy.descendantsOf(categoryId).map(category => category.id)]); }
  function productsForSection(sectionId) { return sectionId === "all" ? [...catalogProducts] : catalogProducts.filter(product => product.sectionId === sectionId); }
  function productsForCategory(categoryId) {
    const ids = descendantIds(categoryId);
    return catalogProducts.filter(product => ids.has(product.primaryCategoryId));
  }
  function availableCategories(sectionId) {
    return taxonomy.childrenOf(sectionId).filter(category => category.status === "active" && productsForCategory(category.id).length > 0);
  }
  const activeSections = Object.freeze(sections.filter(section => section.status === "active" && productsForSection(section.id).length > 0));
  const navigationSections = Object.freeze([catalogState, ...activeSections]);

  function resolveRoute(pathname = location.pathname, search = location.search, pageName = "catalog") {
    return routing.resolveLocation(pathname, search, pageName);
  }

  function valueLabel(definition, value) {
    if (attributeSchema.valueLabels[value]) return attributeSchema.valueLabels[value];
    if (definition?.type === "number") return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 4 }).format(Number(value))} ${definition.unit}`;
    return String(value);
  }

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

  window.sofievkaCatalog = Object.freeze({
    catalogState,
    sections,
    activeSections,
    navigationSections,
    categories,
    taxonomy,
    sectionById,
    categoryById,
    attributeDefinitions,
    attributeSchema,
    sourceMappings,
    products,
    catalogProducts,
    serviceItems,
    brands,
    slugify: window.sofievkaProductNormalizer.slugify,
    sectionUrl,
    categoryUrl,
    getCategoryPath: routing.getCategoryPath,
    getCategoryAncestors: routing.getCategoryAncestors,
    brandUrl,
    productsForSection,
    productsForCategory,
    availableCategories,
    resolveRoute,
    valueLabel
  });
})();
