(function () {
  "use strict";

  const freezeMapping = mapping => Object.freeze({
    categoryId: "",
    classifier: "",
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
    tekkhaus: Object.freeze({ id: "tekkhaus", brandId: "tekk", sourceName: "Офіційний магазин TEKK HAUS" }),
    tech: Object.freeze({ id: "tech", brandId: "tech", sourceName: "Офіційний каталог TECH Controllers Україна" }),
    altep: Object.freeze({ id: "altep", brandId: "altep", sourceName: "Офіційний каталог Altep" }),
    feniks: Object.freeze({ id: "feniks", brandId: "feniks", sourceName: "Офіційний каталог FENIKS" }),
    focus: Object.freeze({ id: "focus", brandId: "focus", sourceName: "Офіційний каталог FOCUS / FireBox" }),
    baxi: Object.freeze({ id: "baxi", brandId: "baxi", sourceName: "Офіційний каталог BAXI Україна" }),
    buderus: Object.freeze({ id: "buderus", brandId: "buderus", sourceName: "Офіційний каталог Buderus Україна" })
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
      "termojet-nasosy": freezeMapping({ classifier: "termojet-pumps", mappingStatus: "classifier" }),
      "termojet-kolektory-pidloha": freezeMapping({ categoryId: "underfloor-heating" }),
      "termojet-rozpodilchi-kolektory": freezeMapping({ categoryId: "distribution-manifolds" }),
      "termojet-separatory": freezeMapping({ categoryId: "air-dirt-separators" }),
      "termojet-nasosni-hrupy": freezeMapping({ categoryId: "pump-groups" }),
      "termojet-kolektory-z-hidrostrilkoyu": freezeMapping({ categoryId: "manifolds-with-hydraulic-separator" }),
      "termojet-hidravlichni-rozdilnyky": freezeMapping({ categoryId: "hydraulic-separators" }),
      "termojet-zonalne-keruvannya": freezeMapping({ categoryId: "zone-control" }),
      "termojet-avtomatyka": freezeMapping({ classifier: "heating-automation", mappingStatus: "classifier" }),
      "termojet-klapany": freezeMapping({ categoryId: "heating-valves" }),
      "termojet-balansuval-klapany": freezeMapping({ categoryId: "heating-valves" }),
      "termojet-termojet-mega": freezeMapping({ classifier: "heating-component", seriesId: "termojet-mega", mappingStatus: "classifier" }),
      "termojet-termojet-box": freezeMapping({ classifier: "heating-component", seriesId: "termojet-box", mappingStatus: "classifier" }),
      "termojet-rozprodazh": freezeMapping({ classifier: "heating-component", collectionIds: ["sale"], tags: ["sale"], mappingStatus: "review" }),
      "termojet-dodatkove": freezeMapping({ classifier: "heating-component", tags: ["additional"], mappingStatus: "review" })
    }),
    wilo: Object.freeze({
      "wilo-circulation": freezeMapping({ categoryId: "system-circulation-pumps" }),
      "wilo-dhw-circulation": freezeMapping({ categoryId: "dhw-circulation-pumps" }),
      "wilo-system-circulation": freezeMapping({ categoryId: "system-circulation-pumps" }),
      "wilo-multistage": freezeMapping({ categoryId: "multistage-pumps" }),
      "wilo-drainage": freezeMapping({ categoryId: "drainage-pumps" }),
      "wilo-borehole": freezeMapping({ categoryId: "borehole-pumps" }),
      "wilo-surface": freezeMapping({ categoryId: "surface-pumps" }),
      "wilo-pressure": freezeMapping({ categoryId: "pressure-boosting" }),
      "wilo-sewage": freezeMapping({ categoryId: "sewage-pumps" }),
      "wilo-lifting": freezeMapping({ categoryId: "sewage-lifting-units" })
    }),
    grundfos: Object.freeze({
      "grundfos-circulation": freezeMapping({ categoryId: "system-circulation-pumps" }),
      "grundfos-dhw-circulation": freezeMapping({ categoryId: "dhw-circulation-pumps" }),
      "grundfos-surface": freezeMapping({ categoryId: "surface-pumps" }),
      "grundfos-pressure": freezeMapping({ categoryId: "pressure-boosting" }),
      "grundfos-drainage": freezeMapping({ categoryId: "drainage-pumps" }),
      "grundfos-sewage": freezeMapping({ categoryId: "sewage-pumps" }),
      "grundfos-lifting": freezeMapping({ categoryId: "sewage-lifting-units" }),
      "grundfos-pressure-tanks": freezeMapping({ categoryId: "pressure-tanks" }),
      "grundfos-pump-automation": freezeMapping({ categoryId: "pump-automation" }),
      "grundfos-pump-accessories": freezeMapping({ categoryId: "pump-accessories" }),
      "grundfos-pump-services": freezeMapping({ categoryId: "pump-services" }),
      "grundfos-heating-automation": freezeMapping({ categoryId: "heating-controllers" }),
      "grundfos-heating-components": freezeMapping({ categoryId: "branded-heating-accessories" })
    }),
    tekkhaus: Object.freeze({
      "tekkhaus-circulation": freezeMapping({ categoryId: "system-circulation-pumps" }),
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
    }),
    tech: Object.freeze({
      "tech-automation": freezeMapping({ classifier: "tech-automation", mappingStatus: "classifier" }),
      "tech-sinum": freezeMapping({ classifier: "tech-sinum", collectionIds: ["sinum"], tags: ["sinum"], mappingStatus: "classifier" }),
      "tech-accessories": freezeMapping({ categoryId: "heating-sensors-modules" })
    }),
    altep: Object.freeze({
      "altep-solid-fuel-boilers": freezeMapping({ categoryId: "solid-fuel-boilers" }),
      "altep-pellet-boilers": freezeMapping({ categoryId: "pellet-boilers" }),
      "altep-heat-accumulators": freezeMapping({ categoryId: "heat-accumulators" }),
      "altep-pellet-burners": freezeMapping({ categoryId: "pellet-burners" }),
      "altep-boiler-accessories": freezeMapping({ classifier: "boiler-accessory", mappingStatus: "classifier" }),
      "altep-industrial-heating": freezeMapping({ classifier: "industrial-heating", mappingStatus: "classifier" })
    }),
    feniks: Object.freeze({
      "feniks-solid-fuel-boilers": freezeMapping({ categoryId: "solid-fuel-boilers" }),
      "feniks-pellet-boilers": freezeMapping({ categoryId: "pellet-boilers" }),
      "feniks-heat-accumulators": freezeMapping({ categoryId: "heat-accumulators" }),
      "feniks-pellet-burners": freezeMapping({ categoryId: "pellet-burners" }),
      "feniks-boiler-accessories": freezeMapping({ classifier: "boiler-accessory", mappingStatus: "classifier" }),
      "feniks-industrial-heating": freezeMapping({ classifier: "industrial-heating", mappingStatus: "classifier" })
    }),
    focus: Object.freeze({
      "focus-solid-fuel-boilers": freezeMapping({ categoryId: "solid-fuel-boilers" }),
      "focus-pellet-boilers": freezeMapping({ categoryId: "pellet-boilers" }),
      "focus-heat-accumulators": freezeMapping({ categoryId: "heat-accumulators" }),
      "focus-pellet-burners": freezeMapping({ categoryId: "pellet-burners" }),
      "focus-boiler-accessories": freezeMapping({ classifier: "boiler-accessory", mappingStatus: "classifier" }),
      "focus-industrial-heating": freezeMapping({ classifier: "industrial-heating", mappingStatus: "classifier" }),
      "focus-humidification": freezeMapping({ classifier: "humidification", mappingStatus: "classifier" })
    }),
    baxi: Object.freeze({
      "baxi-gas-boilers": freezeMapping({ categoryId: "gas-boilers" }),
      "baxi-industrial-heating": freezeMapping({ categoryId: "gas-boilers" }),
      "baxi-heat-pumps": freezeMapping({ categoryId: "heat-pumps" }),
      "baxi-hot-water-tanks": freezeMapping({ categoryId: "hot-water-tanks" }),
      "baxi-heat-accumulators": freezeMapping({ categoryId: "heat-accumulators" }),
      "baxi-solar-thermal": freezeMapping({ categoryId: "solar-thermal" }),
      "baxi-automation": freezeMapping({ categoryId: "heating-controllers" }),
      "baxi-boiler-accessories": freezeMapping({ classifier: "boiler-accessory", mappingStatus: "classifier" }),
      "baxi-flue-systems": freezeMapping({ categoryId: "flue-systems" }),
      "baxi-air-conditioners": freezeMapping({ categoryId: "air-conditioners" })
    }),
    buderus: Object.freeze({
      "buderus-gas-boilers": freezeMapping({ categoryId: "gas-boilers" }),
      "buderus-heat-pumps": freezeMapping({ categoryId: "heat-pumps" }),
      "buderus-hot-water-tanks": freezeMapping({ categoryId: "hot-water-tanks" }),
      "buderus-heat-accumulators": freezeMapping({ categoryId: "heat-accumulators" }),
      "buderus-solar-thermal": freezeMapping({ categoryId: "solar-thermal" }),
      "buderus-automation": freezeMapping({ categoryId: "heating-controllers" })
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

  const productText = product => `${product.title || ""} ${product.type || ""} ${product.series || ""}`.toLocaleLowerCase("uk");

  function classifyTermojetPumps(product) {
    const text = productText(product);
    if (/каналізаці|grandlift|\bwt\s?400/.test(text)) return "sewage-lifting-units";
    if (/рециркуляц|гарячого водопостачання|\bгвп\b|\bspe12\b/.test(text)) return "dhw-circulation-pumps";
    return "system-circulation-pumps";
  }

  function classifyHeatingAutomation(product) {
    const text = productText(product);
    if (/кімнатн|термостат|терморегулятор|програматор/.test(text)) return "room-thermostats";
    if (/зональн|термостатичн.*привод|тепл.*підлог|контур/.test(text)) return "zone-control";
    if (/датчик|модул|ретранслятор|антен|інтернет|wi-?fi|кабел|перифер/.test(text)) return "heating-sensors-modules";
    return "heating-controllers";
  }

  function classifyTechAutomation(product) {
    if (/уф-ламп|\bauv[-\s]/.test(productText(product))) return "uv-disinfection";
    return classifyHeatingAutomation(product);
  }

  function classifyTechSinum(product) {
    const text = productText(product);
    if (/ролет|жалюзі/.test(text)) return "smart-shutters";
    if (/вимикач|димер|диммер|освітлен|rgb|світлодіод/.test(text)) return "smart-lighting";
    if (/розетк|реле|din-?рейк|вхідн.*плат|вхідн.*карт|вихідн.*модул/.test(text)) return "smart-relays";
    if (/датчик|мультисенсор|затоплен|дим|частинок|повітр|озонатор|стерилізатор/.test(text)) return "smart-sensors";
    if (/термостат|терморегулятор|температур|фанкойл|клапан|клімат/.test(text)) return "smart-climate";
    if (/живлен|кабел|рамк|ретранслятор|антен|монтаж/.test(text)) return "smart-accessories";
    return "smart-home-hubs";
  }

  function classifyHeatingComponent(product) {
    const text = productText(product);
    if (/комплект підключення|муфт|перехід|закінчен|адаптер/.test(text)) return "heating-fittings";
    if (/насосна група|\bbox\d/.test(text)) return "pump-groups";
    if (/гідростріл|гідравлічн.*розділ/.test(text)) return "hydraulic-separators";
    if (/колектор/.test(text)) return "distribution-manifolds";
    return "branded-heating-accessories";
  }

  function classifyBoilerAccessory(product) {
    const text = productText(product);
    if (/двер|лутк|рам.*кот|колосник|зачеп/.test(text)) return "boiler-doors-grates";
    if (/бункер|шнек|подач.*палив/.test(text)) return "pellet-hoppers-augers";
    if (/вентилятор/.test(text)) return "boiler-fans";
    if (/пневмоочищ|систем.*очищ/.test(text)) return "boiler-cleaning-systems";
    if (/гідравлічн.*вузол|гідровузол/.test(text)) return "boiler-hydraulic-nodes";
    return "branded-heating-accessories";
  }

  function classifyIndustrialHeating(product) {
    return /парогенератор/.test(productText(product)) ? "steam-generators" : "heat-generators";
  }

  function classifyHumidification(product) {
    return /комплектуюч/.test(productText(product)) ? "misting-components" : "misting-systems";
  }

  const classifiers = Object.freeze({
    "ecosoft-treatment": classifyEcosoftTreatment,
    "termojet-pumps": classifyTermojetPumps,
    "heating-automation": classifyHeatingAutomation,
    "tech-automation": classifyTechAutomation,
    "tech-sinum": classifyTechSinum,
    "heating-component": classifyHeatingComponent,
    "boiler-accessory": classifyBoilerAccessory,
    "industrial-heating": classifyIndustrialHeating,
    humidification: classifyHumidification
  });

  function supplierFor(product) {
    if (String(product.brand || "").toLocaleLowerCase("en") === "buderus") return "buderus";
    if (String(product.brand || "").toLocaleLowerCase("en") === "baxi") return "baxi";
    if (String(product.brand || "").toLocaleLowerCase("en") === "focus") return "focus";
    if (String(product.brand || "").toLocaleLowerCase("en") === "feniks") return "feniks";
    if (String(product.brand || "").toLocaleLowerCase("en") === "altep") return "altep";
    if (String(product.brand || "").toLocaleLowerCase("en") === "tech") return "tech";
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
    const classifier = configured.classifier || (configured.mappingStatus === "classifier" && supplier === "ecosoft" ? "ecosoft-treatment" : "");
    const categoryId = classifier ? classifiers[classifier]?.(product) || "" : configured.categoryId;
    return Object.freeze({ ...configured, supplier, sourceCategory, categoryId });
  }

  window.sofievkaSourceMappings = Object.freeze({
    suppliers,
    categoryMappings,
    supplierLabelMappings,
    classifyEcosoftTreatment,
    classifiers,
    supplierFor,
    sourceCategoryFor,
    resolve
  });
})();
