(function () {
  "use strict";

  function duplicateValues(items, selector) {
    const counts = new Map();
    items.forEach(item => {
      const value = selector(item);
      if (value !== undefined && value !== null && value !== "") counts.set(String(value), (counts.get(String(value)) || 0) + 1);
    });
    return [...counts].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
  }

  function validateCatalog(catalog = window.sofievkaCatalog) {
    if (!catalog) throw new Error("sofievkaCatalog is not initialized.");
    const errors = [];
    const warnings = [];
    const add = (target, code, items, message) => {
      if (items.length) target.push(Object.freeze({ code, count: items.length, message, items: Object.freeze(items) }));
    };
    const products = catalog.products;
    const brands = catalog.brands;
    const inventoryStatuses = new Set(["in_stock", "out_of_stock", "preorder", "unknown"]);

    add(errors, "duplicate-product-id", duplicateValues(products, product => product.id), "Product IDs must be unique.");
    add(errors, "duplicate-sku", duplicateValues(products, product => product.sku), "SKU values must be unique.");
    add(errors, "duplicate-product-slug", duplicateValues(products, product => product.slug), "Product slugs must be unique.");
    add(errors, "unknown-brand", products.filter(product => !brands.some(brand => brand.id === product.brandId)).map(product => ({ id: product.id, brandId: product.brandId })), "Every product must reference the brand registry.");
    add(errors, "unknown-category", products.filter(product => !catalog.categoryById[product.primaryCategoryId]).map(product => ({ id: product.id, primaryCategoryId: product.primaryCategoryId })), "Every product must reference the category registry.");
    add(errors, "missing-primary-category", products.filter(product => !product.primaryCategoryId).map(product => ({ id: product.id })), "Primary category is required.");
    add(errors, "invalid-price", products.filter(product => !Number.isFinite(product.pricing?.amount) || product.pricing.amount < 0 || !product.pricing.currency).map(product => ({ id: product.id, pricing: product.pricing })), "Price must contain a non-negative amount and currency.");
    add(errors, "invalid-inventory-status", products.filter(product => !inventoryStatuses.has(product.inventory?.status)).map(product => ({ id: product.id, status: product.inventory?.status })), "Inventory status is outside the supported enum.");
    add(errors, "invalid-attribute-value", products.flatMap(product => product.catalogAttributes.filter(attribute => !catalog.attributeDefinitions[attribute.id] || (catalog.attributeDefinitions[attribute.id].type === "number" && !Number.isFinite(attribute.value))).map(attribute => ({ id: product.id, attributeId: attribute.id, value: attribute.value }))), "Normalized attributes must match the centralized schema.");
    add(errors, "products-in-hidden-category", products.filter(product => ["hidden", "future"].includes(catalog.categoryById[product.primaryCategoryId]?.status)).map(product => ({ id: product.id, primaryCategoryId: product.primaryCategoryId })), "Products cannot reference hidden or future categories.");
    add(errors, "source-mapping-target-missing", Object.entries(catalog.sourceMappings.categoryMappings).flatMap(([supplier, mappings]) => Object.entries(mappings).filter(([, mapping]) => mapping.categoryId && !catalog.categoryById[mapping.categoryId]).map(([sourceCategory, mapping]) => ({ supplier, sourceCategory, categoryId: mapping.categoryId }))), "Every explicit source mapping must target the category registry.");
    add(errors, "normalization-error", products.filter(product => product.normalizationError).map(product => ({ id: product.id, error: product.normalizationError })), "All source products must normalize successfully.");

    const rawSourceCategories = new Set(products.map(product => `${product.source?.supplier}:${product.source?.sourceCategory}`));
    const configuredSourceCategories = new Set(Object.entries(catalog.sourceMappings.categoryMappings).flatMap(([supplier, mappings]) => Object.keys(mappings).map(sourceCategory => `${supplier}:${sourceCategory}`)));
    add(errors, "unmapped-source-category", [...rawSourceCategories].filter(value => !configuredSourceCategories.has(value)).map(value => ({ source: value })), "Every source category must have an explicit mapping.");

    const activeNodes = catalog.taxonomy.nodes.filter(category => category.status === "active");
    add(warnings, "empty-active-category", activeNodes.filter(category => catalog.productsForCategory(category.id).length === 0).map(category => ({ categoryId: category.id, title: category.title })), "Active categories should contain products; future sections are excluded.");
    add(warnings, "brand-without-products", brands.filter(brand => brand.type === "catalog" && !products.some(product => product.brandId === brand.id)).map(brand => ({ brandId: brand.id, name: brand.name })), "Catalog brand has no products in the current feeds.");
    add(warnings, "mapping-needs-review", products.filter(product => product.source?.mappingStatus === "review").map(product => ({ id: product.id, sourceCategory: product.source.sourceCategory, categoryId: product.primaryCategoryId })), "Compatibility mapping needs business review.");
    add(warnings, "unmapped-source-attribute", products.filter(product => product.unmappedAttributes.length).map(product => ({ id: product.id, count: product.unmappedAttributes.length, labels: [...new Set(product.unmappedAttributes.map(attribute => attribute.label))] })), "Supplier attributes remain preserved but are not part of the filter schema.");

    const provenance = products.flatMap(product => product.catalogAttributes).reduce((counts, attribute) => {
      counts[attribute.provenance] = (counts[attribute.provenance] || 0) + 1;
      return counts;
    }, {});
    return Object.freeze({
      valid: errors.length === 0,
      summary: Object.freeze({
        products: products.length,
        brands: brands.length,
        categories: catalog.taxonomy.nodes.length,
        sourceMappings: configuredSourceCategories.size,
        errors: errors.reduce((sum, group) => sum + group.count, 0),
        warnings: warnings.reduce((sum, group) => sum + group.count, 0),
        attributeProvenance: Object.freeze(provenance)
      }),
      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings)
    });
  }

  window.sofievkaCatalogValidation = Object.freeze({ validateCatalog });
})();
