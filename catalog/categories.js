(function () {
  "use strict";

  const definitions = [
    {
      id: "heating",
      slug: "heating",
      parentId: null,
      level: 1,
      title: "Опалення",
      shortTitle: "Опалення",
      description: "Насоси, колектори, автоматика та обладнання для систем опалення.",
      menuDescription: "Насоси, тепла підлога, гідравліка, автоматика",
      order: 10,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: [],
      seo: { title: "Опалення | ТД «Софіївка»", description: "Насоси, колектори, автоматика та обладнання для систем опалення." }
    },
    {
      id: "water-supply",
      slug: "water-supply",
      parentId: null,
      level: 1,
      title: "Водопостачання",
      shortTitle: "Водопостачання",
      description: "Обладнання для подачі, підготовки та очищення води.",
      menuDescription: "Подача, підготовка та очищення води",
      order: 20,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: [],
      seo: { title: "Водопостачання | ТД «Софіївка»", description: "Обладнання для подачі, підготовки та очищення води." }
    },
    {
      id: "plumbing",
      slug: "plumbing",
      parentId: null,
      level: 1,
      title: "Сантехніка",
      shortTitle: "Сантехніка",
      description: "Трубні системи, фітинги, арматура та монтажні матеріали.",
      menuDescription: "Труби, фітинги, арматура та колектори",
      order: 30,
      status: "future",
      visibility: "navigation",
      allowedFacetIds: [],
      seo: { title: "Сантехніка | ТД «Софіївка»", description: "Трубні системи, фітинги, арматура та монтажні матеріали." }
    },
    {
      id: "climate",
      slug: "climate",
      parentId: null,
      level: 1,
      title: "Клімат",
      shortTitle: "Клімат",
      description: "Кондиціонування, вентиляція, рекуперація та керування кліматом.",
      menuDescription: "Кондиціонування, вентиляція та рекуперація",
      order: 40,
      status: "future",
      visibility: "navigation",
      allowedFacetIds: [],
      seo: { title: "Кліматичне обладнання | ТД «Софіївка»", description: "Кондиціонування, вентиляція, рекуперація та керування кліматом." }
    },
    {
      id: "circulation-pumps",
      slug: "circulation-pumps",
      parentId: "heating",
      level: 2,
      title: "Циркуляційні насоси",
      shortTitle: "Циркуляційні насоси",
      description: "Насоси для циркуляції та підтримання робочої точки системи.",
      order: 110,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: ["productType", "type", "headM", "flowM3h", "mountingLengthMm", "powerKw", "connection", "pressureBar", "voltage", "protectionClass", "temperature", "eei", "control"],
      seo: { title: "Циркуляційні насоси | ТД «Софіївка»", description: "Циркуляційні насоси для систем опалення та інженерних контурів." }
    },
    {
      id: "underfloor-heating",
      slug: "underfloor-heating",
      parentId: "heating",
      level: 2,
      title: "Тепла підлога",
      shortTitle: "Тепла підлога",
      description: "Колектори та вузли розподілу контурів теплої підлоги.",
      order: 120,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: ["productType", "outlets", "connection", "material", "pressureBar"],
      seo: { title: "Тепла підлога | ТД «Софіївка»", description: "Колектори та вузли розподілу контурів теплої підлоги." }
    },
    {
      id: "distribution-hydraulics",
      slug: "distribution-hydraulics",
      parentId: "heating",
      level: 2,
      title: "Гідравліка та розподіл",
      shortTitle: "Гідравліка та розподіл",
      description: "Колектори, насосні групи, сепаратори й гідравлічні роздільники.",
      order: 130,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: ["productType", "outlets", "connection", "flowM3h", "heatOutputKw", "material", "pressureBar"],
      seo: { title: "Гідравліка та розподіл | ТД «Софіївка»", description: "Колектори, насосні групи, сепаратори та гідравлічні роздільники." }
    },
    {
      id: "automation",
      slug: "automation",
      parentId: "heating",
      level: 2,
      title: "Автоматика й термостати",
      shortTitle: "Автоматика",
      description: "Зональне керування, контролери та електричні компоненти.",
      order: 140,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: ["productType", "type", "voltage", "control", "temperature"],
      seo: { title: "Автоматика й термостати | ТД «Софіївка»", description: "Автоматика, контролери та термостати для систем опалення." }
    },
    {
      id: "valves",
      slug: "valves",
      parentId: "heating",
      level: 2,
      title: "Запірна й регулююча арматура",
      shortTitle: "Арматура",
      description: "Клапани та балансувальна арматура для гідравлічних контурів.",
      order: 150,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: ["productType", "type", "diameter", "diameterMm", "connection", "material", "pressureBar", "control", "voltage"],
      seo: { title: "Запірна й регулююча арматура | ТД «Софіївка»", description: "Клапани та балансувальна арматура для гідравлічних контурів." }
    },
    {
      id: "heating-components",
      slug: "heating-components",
      parentId: "heating",
      level: 2,
      title: "Комплектуючі та модульні системи",
      shortTitle: "Комплектуючі",
      description: "Додаткові компоненти та готові модульні вузли для систем опалення.",
      order: 160,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: ["productType", "type", "connection", "material", "pressureBar"],
      seo: { title: "Комплектуючі для опалення | ТД «Софіївка»", description: "Комплектуючі та модульні рішення для систем опалення." }
    },
    {
      id: "water-treatment",
      slug: "water-treatment",
      parentId: "water-supply",
      level: 2,
      title: "Водоочищення",
      shortTitle: "Водоочищення",
      description: "Питні фільтри, системи очищення, картриджі та фільтрувальні матеріали.",
      order: 210,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: ["productType", "purpose", "waterSource", "technology", "installation", "capacityLh", "waterType", "format", "pump", "mineralizer", "flowType", "scope"],
      seo: { title: "Водоочищення | ТД «Софіївка»", description: "Системи водоочищення, питні фільтри, картриджі та фільтрувальні матеріали." }
    },
    {
      id: "water-pumps",
      slug: "water-pumps",
      parentId: "water-supply",
      level: 2,
      title: "Насоси для водопостачання",
      shortTitle: "Насоси",
      description: "Насоси для подачі води, дренажу та інженерних систем водопостачання.",
      order: 220,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: ["productType", "headM", "flowM3h", "powerKw", "connection", "pressureBar", "voltage"],
      seo: { title: "Насоси для водопостачання | ТД «Софіївка»", description: "Багатоступеневі та дренажні насоси для систем водопостачання." }
    },
    { id: "multistage-pumps", slug: "multistage-pumps", parentId: "water-pumps", level: 3, title: "Багатоступеневі насоси", shortTitle: "Багатоступеневі", description: "Горизонтальні багатоступеневі насоси для водопостачання та поливу.", order: 321, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "powerKw", "selfPriming", "connection", "pressureBar", "voltage"], seo: { title: "Багатоступеневі насоси | ТД «Софіївка»", description: "Багатоступеневі насоси для приватного водопостачання, поливу та використання дощової води." } },
    { id: "drainage-pumps", slug: "drainage-pumps", parentId: "water-pumps", level: 3, title: "Дренажні насоси", shortTitle: "Дренажні", description: "Занурювальні насоси для відведення стічної та забрудненої води без фекалій.", order: 322, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "powerKw", "freePassageMm", "maxImmersionDepthM", "floatSwitch", "connection", "protectionClass"], seo: { title: "Дренажні насоси | ТД «Софіївка»", description: "Дренажні занурювальні насоси для відведення стічної та забрудненої води." } },
    { id: "drinking-system-cartridges", slug: "drinking-system-cartridges", parentId: "water-treatment", level: 3, title: "Картриджі питних систем", shortTitle: "Картриджі питних систем", description: "Змінні елементи для питних систем очищення води.", order: 311, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "type", "format"], legacyGroup: "replacement-elements", legacyGroupTitle: "Змінні елементи", seo: {} },
    { id: "mainline-cartridges", slug: "mainline-cartridges", parentId: "water-treatment", level: 3, title: "Картриджі магістральних фільтрів", shortTitle: "Магістральні картриджі", description: "Картриджі для магістрального очищення води.", order: 312, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "purpose", "format", "waterType"], legacyGroup: "replacement-elements", legacyGroupTitle: "Змінні елементи", seo: {} },
    { id: "mainline-filters-housings", slug: "mainline-filters-housings", parentId: "water-treatment", level: 3, title: "Корпуси магістральних фільтрів", shortTitle: "Магістральні фільтри", description: "Корпуси та готові магістральні фільтри.", order: 313, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "purpose", "connection", "format", "waterType"], legacyGroup: "whole-house-treatment", legacyGroupTitle: "Очищення води для будинку", seo: {} },
    { id: "reverse-osmosis", slug: "reverse-osmosis", parentId: "water-treatment", level: 3, title: "Зворотний осмос", shortTitle: "Зворотний осмос", description: "Побутові та професійні системи зворотного осмосу.", order: 314, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "capacityLh", "installation", "pump", "mineralizer", "flowType", "scope"], legacyGroup: "drinking-water-systems", legacyGroupTitle: "Системи питної води", seo: {} },
    { id: "filter-media", slug: "filter-media", parentId: "water-treatment", level: 3, title: "Фільтрувальні матеріали", shortTitle: "Фільтрувальні матеріали", description: "Завантаження та матеріали для систем очищення.", order: 315, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "type", "format"], legacyGroup: "materials-reagents", legacyGroupTitle: "Матеріали та реагенти", seo: {} },
    { id: "complex-treatment", slug: "complex-treatment", parentId: "water-treatment", level: 3, title: "Комплексне очищення", shortTitle: "Комплексне очищення", description: "Системи комплексного очищення води.", order: 316, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "purpose", "scope", "waterSource", "capacityLh"], legacyGroup: "whole-house-treatment", legacyGroupTitle: "Очищення води для будинку", seo: {} },
    { id: "water-softening", slug: "water-softening", parentId: "water-treatment", level: 3, title: "Пом’якшення", shortTitle: "Пом’якшення", description: "Системи зниження жорсткості води.", order: 317, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "purpose", "scope", "capacityLh"], legacyGroup: "whole-house-treatment", legacyGroupTitle: "Очищення води для будинку", seo: {} },
    { id: "chlorine-odor-removal", slug: "chlorine-odor-removal", parentId: "water-treatment", level: 3, title: "Видалення хлору та запаху", shortTitle: "Хлор і запах", description: "Системи видалення хлору, запахів і органічних домішок.", order: 318, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "purpose", "scope", "capacityLh"], legacyGroup: "whole-house-treatment", legacyGroupTitle: "Очищення води для будинку", seo: {} },
    { id: "mechanical-treatment", slug: "mechanical-treatment", parentId: "water-treatment", level: 3, title: "Механічне очищення", shortTitle: "Механічне очищення", description: "Системи попереднього механічного очищення.", order: 319, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "purpose", "scope", "capacityLh"], legacyGroup: "whole-house-treatment", legacyGroupTitle: "Очищення води для будинку", seo: {} },
    { id: "flow-filters", slug: "flow-filters", parentId: "water-treatment", level: 3, title: "Проточні фільтри", shortTitle: "Проточні фільтри", description: "Проточні системи доочищення питної води.", order: 320, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "installation", "type"], legacyGroup: "drinking-water-systems", legacyGroupTitle: "Системи питної води", seo: {} }
  ];

  const rawById = Object.fromEntries(definitions.map(item => [item.id, item]));
  const sectionIdFor = item => {
    let current = item;
    while (current?.parentId) current = rawById[current.parentId];
    return current?.id || "";
  };
  const nodes = Object.freeze(definitions.map(item => Object.freeze({
    ...item,
    name: item.title,
    metaTitle: item.seo?.title || `${item.title} | ТД «Софіївка»`,
    sectionId: sectionIdFor(item),
    facetIds: Object.freeze([...(item.allowedFacetIds || [])]),
    allowedFacetIds: Object.freeze([...(item.allowedFacetIds || [])]),
    seo: Object.freeze({ ...(item.seo || {}) })
  })));
  const byId = Object.freeze(Object.fromEntries(nodes.map(item => [item.id, item])));
  const childrenOf = parentId => nodes.filter(item => item.parentId === parentId).sort((a, b) => a.order - b.order);
  const descendantsOf = parentId => {
    const result = [];
    const visit = id => childrenOf(id).forEach(child => { result.push(child); visit(child.id); });
    visit(parentId);
    return result;
  };

  window.sofievkaTaxonomy = Object.freeze({
    nodes,
    byId,
    businessSections: Object.freeze(nodes.filter(item => item.level === 1).sort((a, b) => a.order - b.order)),
    productCategories: Object.freeze(nodes.filter(item => item.level > 1).sort((a, b) => a.order - b.order)),
    childrenOf,
    descendantsOf
  });
})();
