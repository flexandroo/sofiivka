(function () {
  "use strict";

  const freezeMapping = mapping => Object.freeze({
    categoryId: "",
    seriesId: null,
    collectionIds: Object.freeze([]),
    tags: Object.freeze([]),
    mappingStatus: "mapped",
    ...mapping,
    collectionIds: Object.freeze([...(mapping.collectionIds || [])]),
    tags: Object.freeze([...(mapping.tags || [])])
  });

  const suppliers = Object.freeze({
    ecosoft: Object.freeze({ id: "ecosoft", brandId: "ecosoft", sourceName: "Каталог товарів" }),
    termojet: Object.freeze({ id: "termojet", brandId: "termojet", sourceName: "Termojet XML catalog", imageOrigin: "https://termojet.com.ua" }),
    wilo: Object.freeze({ id: "wilo", brandId: "wilo", sourceName: "Офіційний каталог Wilo Україна" }),
    grundfos: Object.freeze({ id: "grundfos", brandId: "grundfos", sourceName: "Офіційний каталог Grundfos Україна" }),
    tekkhaus: Object.freeze({ id: "tekkhaus", brandId: "tekk", sourceName: "Офіційний магазин TEKK HAUS" })
  });

  const categoryMappings = Object.freeze({
    ecosoft: Object.freeze({
      "reverse-osmosis": freezeMapping({ categoryId: "reverse-osmosis" }),
      "flow-filters": freezeMapping({ categoryId: "flow-filters" }),
      "mainline-filters": freezeMapping({ categoryId: "mainline-filters-housings" }),
      "water-filter-cartridges": freezeMapping({ categoryId: "drinking-system-cartridges" }),
      "mainline-cartridges": freezeMapping({ categoryId: "mainline-cartridges" }),
      "filter-media": freezeMapping({ categoryId: "filter-media" }),
      horeca: freezeMapping({ categoryId: "reverse-osmosis", collectionIds: ["horeca"], tags: ["horeca"] }),
      "filtration-systems": freezeMapping({ categoryId: "", mappingStatus: "classifier", tags: ["whole-house-treatment"] })
    }),
    termojet: Object.freeze({
      "termojet-nasosy": freezeMapping({ categoryId: "circulation-pumps" }),
      "termojet-kolektory-pidloha": freezeMapping({ categoryId: "underfloor-heating" }),
      "termojet-rozpodilchi-kolektory": freezeMapping({ categoryId: "distribution-hydraulics" }),
      "termojet-separatory": freezeMapping({ categoryId: "distribution-hydraulics" }),
      "termojet-nasosni-hrupy": freezeMapping({ categoryId: "distribution-hydraulics" }),
      "termojet-kolektory-z-hidrostrilkoyu": freezeMapping({ categoryId: "distribution-hydraulics" }),
      "termojet-hidravlichni-rozdilnyky": freezeMapping({ categoryId: "distribution-hydraulics" }),
      "termojet-zonalne-keruvannya": freezeMapping({ categoryId: "automation" }),
      "termojet-avtomatyka": freezeMapping({ categoryId: "automation" }),
      "termojet-klapany": freezeMapping({ categoryId: "valves" }),
      "termojet-balansuval-klapany": freezeMapping({ categoryId: "valves" }),
      "termojet-termojet-mega": freezeMapping({ categoryId: "heating-components", seriesId: "termojet-mega" }),
      "termojet-termojet-box": freezeMapping({ categoryId: "heating-components", seriesId: "termojet-box" }),
      "termojet-rozprodazh": freezeMapping({ categoryId: "heating-components", collectionIds: ["sale"], tags: ["sale"], mappingStatus: "review" }),
      "termojet-dodatkove": freezeMapping({ categoryId: "heating-components", tags: ["additional"], mappingStatus: "review" })
    }),
    wilo: Object.freeze({
      "wilo-circulation": freezeMapping({ categoryId: "circulation-pumps" }),
      "wilo-dhw-circulation": freezeMapping({ categoryId: "circulation-pumps" }),
      "wilo-system-circulation": freezeMapping({ categoryId: "circulation-pumps" }),
      "wilo-multistage": freezeMapping({ categoryId: "multistage-pumps" }),
      "wilo-drainage": freezeMapping({ categoryId: "drainage-pumps" }),
      "wilo-borehole": freezeMapping({ categoryId: "borehole-pumps" }),
      "wilo-surface": freezeMapping({ categoryId: "surface-pumps" }),
      "wilo-pressure": freezeMapping({ categoryId: "pressure-boosting" }),
      "wilo-sewage": freezeMapping({ categoryId: "sewage-pumps" }),
      "wilo-lifting": freezeMapping({ categoryId: "sewage-lifting-units" })
    }),
    grundfos: Object.freeze({
      "grundfos-circulation": freezeMapping({ categoryId: "circulation-pumps" }),
      "grundfos-dhw-circulation": freezeMapping({ categoryId: "circulation-pumps" }),
      "grundfos-surface": freezeMapping({ categoryId: "surface-pumps" }),
      "grundfos-pressure": freezeMapping({ categoryId: "pressure-boosting" }),
      "grundfos-drainage": freezeMapping({ categoryId: "drainage-pumps" }),
      "grundfos-sewage": freezeMapping({ categoryId: "sewage-pumps" }),
      "grundfos-lifting": freezeMapping({ categoryId: "sewage-lifting-units" }),
      "grundfos-pressure-tanks": freezeMapping({ categoryId: "pressure-tanks" }),
      "grundfos-pump-automation": freezeMapping({ categoryId: "pump-automation" }),
      "grundfos-pump-accessories": freezeMapping({ categoryId: "pump-accessories" }),
      "grundfos-pump-services": freezeMapping({ categoryId: "pump-services" }),
      "grundfos-heating-automation": freezeMapping({ categoryId: "automation" }),
      "grundfos-heating-components": freezeMapping({ categoryId: "heating-components" })
    }),
    tekkhaus: Object.freeze({
      "tekkhaus-circulation": freezeMapping({ categoryId: "circulation-pumps" }),
      "tekkhaus-surface": freezeMapping({ categoryId: "surface-pumps" }),
      "tekkhaus-pressure": freezeMapping({ categoryId: "pressure-boosting" }),
      "tekkhaus-borehole": freezeMapping({ categoryId: "borehole-pumps" }),
      "tekkhaus-drainage": freezeMapping({ categoryId: "drainage-pumps" }),
      "tekkhaus-sewage": freezeMapping({ categoryId: "sewage-pumps" }),
      "tekkhaus-pool": freezeMapping({ categoryId: "pool-pumps-filtration" }),
      "tekkhaus-pressure-tanks": freezeMapping({ categoryId: "pressure-tanks" }),
      "tekkhaus-automation": freezeMapping({ categoryId: "pump-automation" }),
      "tekkhaus-accessories": freezeMapping({ categoryId: "pump-accessories" }),
      "tekkhaus-feed-grinders": freezeMapping({ categoryId: "feed-grinders" })
    })
  });

  const supplierLabelMappings = Object.freeze({
    ecosoft: Object.freeze({
      "Фільтри зворотного осмосу": "reverse-osmosis",
      "Проточні фільтри": "flow-filters",
      "Магістральні фільтри": "mainline-filters-housings",
      "Картриджі для фільтрів води": "drinking-system-cartridges",
      "Картриджі магістральні": "mainline-cartridges",
      "Матеріали для фільтрів": "filter-media",
      "Для кафе, ресторанів, готелів": "reverse-osmosis"
    })
  });

  function classifyEcosoftTreatment(product) {
    const sku = String(product.sku || "").toLocaleLowerCase("en");
    const haystack = `${product.sku || ""} ${product.title || ""} ${product.description || ""}`.toLocaleLowerCase("uk");
    if (/^fpa\d/.test(sku)) return "chlorine-odor-removal";
    if (/^fpc\d/.test(sku)) return "chlorine-odor-removal";
    if (/^fp\d/.test(sku)) return "mechanical-treatment";
    if (/^fk/.test(sku)) return "complex-treatment";
    if (/^fu/.test(sku)) return "water-softening";
    if (/видален.*хлор|^fpa\d/i.test(haystack)) return "chlorine-odor-removal";
    if (/сірковод|запах|^fpc\d/i.test(haystack)) return "chlorine-odor-removal";
    if (/механічн|^fp\d/i.test(haystack)) return "mechanical-treatment";
    if (/комплексн|знезалізнення та пом.?якш|ecomix|\bfk\s?\d|^fk/i.test(haystack)) return "complex-treatment";
    if (/пом.?якш|\bfu\s?\d|^fu/i.test(haystack)) return "water-softening";
    if (/знезаліз|заліз|марган/i.test(haystack)) return "iron-removal";
    return "complex-treatment";
  }

  function supplierFor(product) {
    if (String(product.brand || "").toLocaleLowerCase("en").replace(/[^a-z]/g, "") === "tekkhaus") return "tekkhaus";
    if (String(product.brand || "").toLocaleLowerCase("en") === "grundfos") return "grundfos";
    if (String(product.brand || "").toLocaleLowerCase("en") === "wilo") return "wilo";
    if (String(product.brand || "").toLocaleLowerCase("en") === "ecosoft" || product.category === "water") return "ecosoft";
    if (String(product.brand || "").toLocaleLowerCase("en") === "termojet" || product.category === "heating") return "termojet";
    return "";
  }

  function sourceCategoryFor(product, supplier = supplierFor(product)) {
    if (supplier === "termojet") return product.primaryCategory || `termojet-${product.typeSlug || ""}`;
    return product.sourceCategoryId || product.typeSlug || "";
  }

  function resolve(product, supplier = supplierFor(product)) {
    const sourceCategory = sourceCategoryFor(product, supplier);
    const configured = categoryMappings[supplier]?.[sourceCategory];
    if (!configured) return Object.freeze({ supplier, sourceCategory, categoryId: "", seriesId: null, collectionIds: Object.freeze([]), tags: Object.freeze([]), mappingStatus: "unmapped" });
    const categoryId = configured.mappingStatus === "classifier" ? classifyEcosoftTreatment(product) : configured.categoryId;
    return Object.freeze({ ...configured, supplier, sourceCategory, categoryId });
  }

  window.sofievkaSourceMappings = Object.freeze({
    suppliers,
    categoryMappings,
    supplierLabelMappings,
    classifyEcosoftTreatment,
    supplierFor,
    sourceCategoryFor,
    resolve
  });
})();
