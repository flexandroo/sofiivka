(function () {
  "use strict";

  // Compatibility entry point. This file intentionally owns no business taxonomy.
  // catalog-data.js consumes this immutable supplier feed, applies the centralized
  // source mappings, and replaces sofievkaProducts with normalized products.
  const sourceProducts = Array.isArray(window.sofievkaProducts) ? window.sofievkaProducts : [];
  window.sofievkaRawWaterProducts = sourceProducts;
  window.sofievkaWaterCatalog = Object.freeze({
    taxonomy: Object.freeze([]),
    categoryBySlug: Object.freeze({}),
    supplierMappings: Object.freeze({}),
    products: sourceProducts,
    report: Object.freeze({
      sourceCount: sourceProducts.length,
      normalizedCount: 0,
      uncategorized: Object.freeze([]),
      duplicateIds: Object.freeze([]),
      ambiguous: Object.freeze([]),
      distribution: Object.freeze({}),
      pendingCentralNormalization: true
    })
  });
})();
