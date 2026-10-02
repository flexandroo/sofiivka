(function () {
  "use strict";

  function inventoryLabel(status) {
    return ({
      in_stock: "В наявності",
      out_of_stock: "Немає в наявності",
      preorder: "Передзамовлення",
      discontinued: "Знято з виробництва",
      unknown: "Наявність уточнюйте"
    })[status] || "Наявність уточнюйте";
  }

  function createLegacyAdapter(options = {}) {
    const taxonomy = options.taxonomy || window.sofievkaTaxonomy;
    const brands = Array.isArray(options.brands) ? options.brands : [];
    const rawCatalog = options.rawCatalog || null;
    if (!taxonomy) throw new Error("LegacyAdapter requires catalogue taxonomy.");
    const brandById = Object.freeze(Object.fromEntries(brands.map(brand => [brand.id, brand])));

    function technicalDetails(canonical, raw) {
      if (Array.isArray(raw.technicalDetails)) return raw.technicalDetails;
      return Object.freeze([
        ...(canonical.catalogAttributes || []).filter(attribute => attribute.id !== "productType").map(attribute => Object.freeze([attribute.label, `${attribute.value}${attribute.unit ? ` ${attribute.unit}` : ""}`])),
        ...(canonical.unmappedAttributes || []).map(attribute => Object.freeze([attribute.label, attribute.value]))
      ]);
    }

    function adaptProduct(canonical, rawProduct) {
      const resolvedRaw = rawProduct === undefined ? rawCatalog?.productById?.(canonical.id) : rawProduct;
      const raw = resolvedRaw && typeof resolvedRaw === "object" ? resolvedRaw : {};
      const category = taxonomy.byId[canonical.primaryCategoryId];
      const parent = taxonomy.byId[category?.parentId];
      const brand = brandById[canonical.brandId];
      const status = canonical.inventory?.status || "unknown";
      const legacyPrice = canonical.pricing?.amount ?? (Number.isFinite(Number(raw.price)) ? Number(raw.price) : 0);
      const legacyOldPrice = canonical.pricing?.oldAmount ?? (Number.isFinite(Number(raw.oldPrice)) && Number(raw.oldPrice) > 0 ? Number(raw.oldPrice) : undefined);
      const sourceCategoryName = raw.primaryCategoryName || raw.type || canonical.source?.sourceCategory || "";

      return Object.freeze({
        // Supplier fields remain available only in the temporary local projection.
        // Supabase mode passes no raw object and therefore cannot leak private evidence.
        ...raw,
        ...canonical,
        price: legacyPrice,
        oldPrice: legacyOldPrice,
        currency: canonical.pricing?.currency || "UAH",
        availability: status,
        availabilityLabel: inventoryLabel(status),
        stockStatus: status,
        image: canonical.images?.[0] || "",
        brand: brand?.name || raw.brand || canonical.brandId,
        primaryCategory: canonical.primaryCategoryId,
        primaryCategoryName: category?.title || raw.primaryCategoryName || "",
        category: category?.sectionId || raw.category || "",
        categoryGroup: category?.parentId || "",
        categoryGroupName: parent?.title || "",
        sectionId: category?.sectionId || "",
        sourceCategoryId: canonical.source?.sourceCategory || "",
        sourceCategoryName,
        type: canonical.normalizedAttributes?.productType || raw.type || category?.title || "",
        typeSlug: raw.typeSlug || canonical.source?.sourceCategory || "",
        normalizedType: canonical.primaryCategoryId,
        compareType: canonical.primaryCategoryId,
        attributes: canonical.sourceAttributes || [],
        features: raw.features && typeof raw.features === "object" ? raw.features : (canonical.normalizedAttributes || {}),
        technicalDetails: technicalDetails(canonical, raw),
        variants: Object.freeze(Array.isArray(raw.variants) ? [...raw.variants] : []),
        compatibleProducts: Object.freeze(Array.isArray(raw.compatibleProducts) ? [...raw.compatibleProducts] : []),
        compatibleConsumables: Object.freeze(Array.isArray(raw.compatibleConsumables) ? [...raw.compatibleConsumables] : []),
        instructions: Object.freeze(Array.isArray(raw.instructions) ? [...raw.instructions] : [])
      });
    }

    function adaptProducts(products = [], adaptOptions = {}) {
      const useRawCatalog = adaptOptions.useRawCatalog !== false;
      return Object.freeze(products.map(product => adaptProduct(product, useRawCatalog ? undefined : {})));
    }

    return Object.freeze({ inventoryLabel, adaptProduct, adaptProducts });
  }

  function installSnapshot(snapshot, options = {}) {
    if (!snapshot || !Array.isArray(snapshot.products) || !Array.isArray(snapshot.brands)) {
      throw new Error("LegacyAdapter received an invalid CatalogSnapshot.");
    }
    const adapter = createLegacyAdapter({
      taxonomy: options.taxonomy || window.sofievkaTaxonomy,
      brands: snapshot.brands,
      rawCatalog: options.useRawCatalog === false ? null : window.sofievkaRawSupplierCatalog
    });
    const products = adapter.adaptProducts(snapshot.products, options);
    window.sofievkaCanonicalProducts = snapshot.products;
    window.sofievkaBrands = snapshot.brands;
    window.sofievkaLegacyProducts = products;
    window.sofievkaNormalizedProducts = products;
    window.sofievkaProductLegacyAdapter = Object.freeze({
      ...adapter,
      createLegacyAdapter,
      installSnapshot
    });
    return products;
  }

  const localSnapshot = Object.freeze({
    products: Array.isArray(window.sofievkaCanonicalProducts) ? window.sofievkaCanonicalProducts : [],
    brands: Array.isArray(window.sofievkaBrands) ? window.sofievkaBrands : []
  });
  if (!window.sofievkaTaxonomy || !window.sofievkaRawSupplierCatalog) {
    throw new Error("Canonical catalog inputs are incomplete.");
  }
  installSnapshot(localSnapshot, { useRawCatalog: true });
})();
