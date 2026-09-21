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
      description: "Котли, насоси, колектори, автоматика та обладнання для систем опалення.",
      menuDescription: "Котли, насоси, тепла підлога, гідравліка, автоматика",
      order: 10,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: [],
      seo: { title: "Опалення | ТД «Софіївка»", description: "Котли, насоси, колектори, автоматика та обладнання для систем опалення." }
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
      status: "active",
      visibility: "catalog",
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
      status: "active",
      visibility: "catalog",
      allowedFacetIds: [],
      seo: { title: "Кліматичне обладнання | ТД «Софіївка»", description: "Кондиціонування, вентиляція, рекуперація та керування кліматом." }
    },
    {
      id: "household-equipment",
      slug: "household-equipment",
      parentId: null,
      level: 1,
      title: "Обладнання для господарства",
      shortTitle: "Для господарства",
      description: "Електричне обладнання для підготовки кормів та повсякденних господарських задач.",
      menuDescription: "Подрібнення та підготовка кормів",
      order: 50,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: [],
      seo: { title: "Обладнання для господарства | ТД «Софіївка»", description: "Електричне обладнання для підготовки кормів у приватному та фермерському господарстві." }
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
      allowedFacetIds: ["productType", "type", "control", "communication", "zones", "installation", "voltage", "protectionClass", "temperature"],
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
      allowedFacetIds: ["productType", "type", "compatibility", "communication", "installation", "voltage", "protectionClass", "connection", "material", "pressureBar"],
      seo: { title: "Комплектуючі для опалення | ТД «Софіївка»", description: "Комплектуючі та модульні рішення для систем опалення." }
    },
    { id: "gas-boilers", slug: "gas-boilers", parentId: "heating", level: 2, title: "Газові котли", shortTitle: "Газові котли", description: "Настінні та підлогові газові котли для опалення й приготування гарячої води.", order: 161, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "type", "heatOutputKw", "efficiencyPercent", "dhwFlowLMin", "installation", "energyClass", "dimensions", "weightKg", "voltage", "protectionClass"], seo: { title: "Газові котли | ТД «Софіївка»", description: "Газові та конденсаційні котли BAXI і Buderus з офіційними характеристиками." } },
    { id: "heat-pumps", slug: "heat-pumps", parentId: "heating", level: 2, title: "Теплові насоси", shortTitle: "Теплові насоси", description: "Повітряні та геотермальні теплові насоси для опалення, охолодження й гарячої води.", order: 162, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "heatOutputKw", "coolingCapacityKw", "refrigerant", "cop", "scop", "energyClass", "voltage", "soundLevelDb", "maxWaterTemperatureC", "dimensions", "weightKg"], seo: { title: "Теплові насоси | ТД «Софіївка»", description: "Побутові теплові насоси BAXI та Buderus для опалення, охолодження і ГВП." } },
    { id: "hot-water-tanks", slug: "hot-water-tanks", parentId: "heating", level: 2, title: "Бойлери непрямого нагріву", shortTitle: "Бойлери непрямого нагріву", description: "Баки й бойлери для накопичення та приготування побутової гарячої води.", order: 163, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "volumeL", "heatOutputKw", "pressureBar", "maxWaterTemperatureC", "connection", "material", "installation", "dimensions", "weightKg", "compatibility"], seo: { title: "Бойлери непрямого нагріву | ТД «Софіївка»", description: "Баки непрямого нагріву BAXI і Buderus для котлів та теплових насосів." } },
    { id: "solar-thermal", slug: "solar-thermal", parentId: "heating", level: 2, title: "Геліосистеми", shortTitle: "Геліосистеми", description: "Сонячні колектори, баки та компоненти для приготування гарячої води.", order: 164, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "collectorAreaM2", "installation", "pressureBar", "maxWaterTemperatureC", "dimensions", "weightKg", "compatibility"], seo: { title: "Геліосистеми | ТД «Софіївка»", description: "Сонячні колектори та компоненти геліосистем BAXI і Buderus." } },
    { id: "solid-fuel-boilers", slug: "solid-fuel-boilers", parentId: "heating", level: 2, title: "Твердопаливні котли", shortTitle: "Твердопаливні котли", description: "Котли з ручним завантаженням дров, вугілля, брикетів та іншого дозволеного виробником твердого палива.", order: 165, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "heatOutputKw", "fuel", "efficiencyPercent", "fireboxVolumeL", "waterVolumeL", "pressureBar", "maxWaterTemperatureC", "chimneyDiameterMm", "chimneyHeightM", "weightKg"], seo: { title: "Твердопаливні котли | ТД «Софіївка»", description: "Побутові та промислові твердопаливні котли Altep, FENIKS і FOCUS з офіційними характеристиками." } },
    { id: "pellet-boilers", slug: "pellet-boilers", parentId: "heating", level: 2, title: "Пелетні котли", shortTitle: "Пелетні котли", description: "Автоматизовані котли й міні-котельні з подачею пелет та підтвердженими виробником режимами роботи.", order: 166, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "heatOutputKw", "fuel", "efficiencyPercent", "waterVolumeL", "pressureBar", "maxWaterTemperatureC", "chimneyDiameterMm", "consumptionPowerW", "weightKg"], seo: { title: "Пелетні котли | ТД «Софіївка»", description: "Пелетні котли Altep, FENIKS і FOCUS для житлових, комерційних та промислових котелень." } },
    { id: "heat-accumulators", slug: "heat-accumulators", parentId: "heating", level: 2, title: "Теплоакумулятори", shortTitle: "Теплоакумулятори", description: "Буферні ємності для акумулювання тепла та стабілізації роботи водяної системи опалення.", order: 167, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "volumeL", "pressureBar", "connection", "material", "temperature", "widthMm", "heightMm", "weightKg"], seo: { title: "Теплоакумулятори | ТД «Софіївка»", description: "Теплоакумулятори Altep і FENIKS для котельних та водяних систем опалення." } },
    { id: "pellet-burners", slug: "pellet-burners", parentId: "heating", level: 2, title: "Пелетні пальники", shortTitle: "Пелетні пальники", description: "Факельні та автоматизовані пелетні пальники для сумісного котельного обладнання.", order: 168, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "heatOutputKw", "fuel", "consumptionPowerW", "voltage", "compatibility", "weightKg"], seo: { title: "Пелетні пальники | ТД «Софіївка»", description: "Пелетні пальники Altep, FENIKS і FOCUS з офіційними характеристиками та документами." } },
    { id: "boiler-accessories", slug: "boiler-accessories", parentId: "heating", level: 2, title: "Комплектуючі для котлів", shortTitle: "Комплектуючі для котлів", description: "Бункери, двері, колосники, шнеки, гідравлічні вузли, системи очищення та інші фірмові компоненти котельного обладнання.", order: 169, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "compatibility", "volumeL", "heatOutputKw", "connection", "material", "voltage", "consumptionPowerW", "weightKg"], seo: { title: "Комплектуючі для котлів | ТД «Софіївка»", description: "Фірмові комплектуючі Altep, FENIKS і FOCUS для монтажу, модернізації та сервісу котлів." } },
    { id: "flue-systems", slug: "flue-systems", parentId: "heating", level: 2, title: "Димоходи для газових котлів", shortTitle: "Димоходи", description: "Коаксіальні, роздільні та каскадні системи відведення продуктів згоряння.", order: 169.5, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "compatibility", "diameter", "connection", "material", "installation"], seo: { title: "Димоходи для газових котлів | ТД «Софіївка»", description: "Фірмові елементи димовидалення BAXI для сумісних газових і конденсаційних котлів." } },
    { id: "industrial-heating", slug: "industrial-heating", parentId: "heating", level: 2, title: "Промислове теплогенерувальне обладнання", shortTitle: "Промислове обладнання", description: "Теплогенератори та пелетні парогенератори для технологічних і промислових задач.", order: 170, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "heatOutputKw", "fuel", "capacityKgh", "efficiencyPercent", "consumptionPowerW", "pressureBar", "weightKg"], seo: { title: "Промислове теплогенерувальне обладнання | ТД «Софіївка»", description: "Теплогенератори та парогенератори Altep і FOCUS для промислових об’єктів." } },
    { id: "humidification", slug: "humidification", parentId: "climate", level: 2, title: "Туманоутворення та зволоження", shortTitle: "Туманоутворення", description: "Системи та комплектуючі для туманоутворення, зволоження й охолодження повітря.", order: 410, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "purpose", "flowM3h", "pressureBar", "voltage", "powerKw", "connection"], seo: { title: "Системи туманоутворення | ТД «Софіївка»", description: "Системи туманоутворення FOCUS та комплектуючі для зволоження й охолодження повітря." } },
    { id: "air-conditioners", slug: "air-conditioners", parentId: "climate", level: 2, title: "Кондиціонери", shortTitle: "Кондиціонери", description: "Побутові спліт- і мультиспліт-системи для охолодження та обігрівання приміщень.", order: 405, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "coolingCapacityKw", "heatOutputKw", "refrigerant", "seer", "scop", "energyClass", "soundLevelDb", "voltage", "dimensions", "weightKg"], seo: { title: "Кондиціонери | ТД «Софіївка»", description: "Побутові кондиціонери BAXI з офіційними характеристиками й фото." } },
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
    {
      id: "water-supply-components",
      slug: "water-supply-components",
      parentId: "water-supply",
      level: 2,
      title: "Баки, автоматика та комплектуючі",
      shortTitle: "Баки та автоматика",
      description: "Мембранні баки, контролери, монтажні комплекти та сервісні позиції для систем водопостачання.",
      order: 230,
      status: "active",
      visibility: "catalog",
      allowedFacetIds: ["productType", "volumeL", "pressureBar", "connection", "voltage", "control", "compatibility", "material", "installation"],
      seo: { title: "Баки й автоматика для водопостачання | ТД «Софіївка»", description: "Мембранні баки, автоматика та фірмові комплектуючі для насосних систем." }
    },
    { id: "multistage-pumps", slug: "multistage-pumps", parentId: "water-pumps", level: 3, title: "Багатоступеневі насоси", shortTitle: "Багатоступеневі", description: "Горизонтальні багатоступеневі насоси для водопостачання та поливу.", order: 321, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "powerKw", "selfPriming", "connection", "pressureBar", "voltage"], seo: { title: "Багатоступеневі насоси | ТД «Софіївка»", description: "Багатоступеневі насоси для приватного водопостачання, поливу та використання дощової води." } },
    { id: "drainage-pumps", slug: "drainage-pumps", parentId: "water-pumps", level: 3, title: "Дренажні насоси", shortTitle: "Дренажні", description: "Занурювальні насоси для відведення стічної та забрудненої води без фекалій.", order: 322, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "powerKw", "freePassageMm", "maxImmersionDepthM", "floatSwitch", "connection", "protectionClass"], seo: { title: "Дренажні насоси | ТД «Софіївка»", description: "Дренажні занурювальні насоси для відведення стічної та забрудненої води." } },
    { id: "borehole-pumps", slug: "borehole-pumps", parentId: "water-pumps", level: 3, title: "Свердловинні насоси", shortTitle: "Свердловинні", description: "Занурювальні насоси та комплектні системи для подачі води зі свердловин і колодязів.", order: 323, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "headM", "flowM3h", "powerKw", "connection", "voltage", "protectionClass"], seo: { title: "Свердловинні насоси | ТД «Софіївка»", description: "Свердловинні насоси для приватного водопостачання, поливу та зрошення." } },
    { id: "surface-pumps", slug: "surface-pumps", parentId: "water-pumps", level: 3, title: "Поверхневі насоси", shortTitle: "Поверхневі", description: "Поверхневі насоси для приватного водопостачання, поливу та використання дощової води.", order: 324, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "headM", "flowM3h", "powerKw", "selfPriming", "connection", "pressureBar", "voltage"], seo: { title: "Поверхневі насоси | ТД «Софіївка»", description: "Поверхневі насоси для будинку, поливу й автоматичної подачі води." } },
    { id: "pressure-boosting", slug: "pressure-boosting", parentId: "water-pumps", level: 3, title: "Підвищення тиску", shortTitle: "Підвищення тиску", description: "Насоси та комплектні установки для стабілізації тиску в приватних системах водопостачання.", order: 325, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "headM", "flowM3h", "powerKw", "connection", "pressureBar", "voltage", "control"], seo: { title: "Насоси підвищення тиску | ТД «Софіївка»", description: "Насоси й установки для підвищення тиску у водопостачанні будинку." } },
    { id: "sewage-pumps", slug: "sewage-pumps", parentId: "water-pumps", level: 3, title: "Каналізаційні насоси", shortTitle: "Каналізаційні", description: "Занурювальні насоси для перекачування забруднених і стічних вод.", order: 326, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "headM", "flowM3h", "powerKw", "freePassageMm", "maxImmersionDepthM", "connection", "protectionClass"], seo: { title: "Каналізаційні насоси | ТД «Софіївка»", description: "Каналізаційні насоси для відведення стічних і забруднених вод." } },
    { id: "sewage-lifting-units", slug: "sewage-lifting-units", parentId: "water-pumps", level: 3, title: "Каналізаційні установки", shortTitle: "Каналізаційні установки", description: "Готові напірні установки для відведення стічних вод із санітарних вузлів і будівель.", order: 327, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "headM", "flowM3h", "powerKw", "volumeL", "connection", "voltage", "control"], seo: { title: "Каналізаційні установки | ТД «Софіївка»", description: "Установки Wilo для напірного відведення стічних вод у приватних будинках." } },
    { id: "pool-pumps-filtration", slug: "pool-pumps-filtration", parentId: "water-pumps", level: 3, title: "Насоси та фільтрація для басейнів", shortTitle: "Для басейнів", description: "Насоси й комплектні фільтрувальні станції для циркуляції та механічного очищення води у приватних басейнах.", order: 328, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "flowM3h", "headM", "powerKw", "connection", "pressureBar", "voltage", "protectionClass", "filtrationMicron"], seo: { title: "Насоси та фільтрація для басейнів | ТД «Софіївка»", description: "Насоси й фільтрувальні станції для циркуляції та очищення води у басейні." } },
    { id: "pressure-tanks", slug: "pressure-tanks", parentId: "water-supply-components", level: 3, title: "Мембранні баки", shortTitle: "Мембранні баки", description: "Напірні мембранні баки для запасу води, стабілізації тиску та зменшення кількості пусків насоса.", order: 331, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "volumeL", "pressureBar", "connection", "material", "installation", "temperature"], seo: { title: "Мембранні баки | ТД «Софіївка»", description: "Мембранні напірні баки для побутового водопостачання." } },
    { id: "pump-automation", slug: "pump-automation", parentId: "water-supply-components", level: 3, title: "Автоматика насосів", shortTitle: "Автоматика насосів", description: "Контролери для автоматичного запуску, зупинки та захисту насосів водопостачання.", order: 332, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "pressureBar", "connection", "voltage", "protectionClass", "control", "temperature"], seo: { title: "Автоматика насосів | ТД «Софіївка»", description: "Контролери для автоматичного керування побутовими насосами." } },
    { id: "pump-accessories", slug: "pump-accessories", parentId: "water-supply-components", level: 3, title: "Комплектуючі для насосів", shortTitle: "Комплектуючі", description: "Фірмові клапани, колектори, монтажні комплекти й електричні компоненти для насосного обладнання.", order: 333, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "compatibility", "connection", "material", "pressureBar", "weightKg"], seo: { title: "Комплектуючі для насосів | ТД «Софіївка»", description: "Фірмові комплектуючі для насосів і насосних установок." } },
    { id: "pump-services", slug: "pump-services", parentId: "water-supply-components", level: 3, title: "Сервісні позиції", shortTitle: "Сервіс", description: "Офіційні сервісні позиції, наведені у прайсі побутового обладнання виробника.", order: 334, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "compatibility"], seo: { title: "Сервіс насосних систем | ТД «Софіївка»", description: "Офіційні сервісні позиції для насосних установок." } },
    { id: "feed-grinders", slug: "feed-grinders", parentId: "household-equipment", level: 2, title: "Кормоподрібнювачі", shortTitle: "Кормоподрібнювачі", description: "Електричні подрібнювачі зернових культур і коренеплодів для підготовки кормів.", order: 510, status: "active", visibility: "catalog", allowedFacetIds: ["productType", "powerKw", "capacityKgh", "rotationRpm", "voltage", "protectionClass", "weightKg"], seo: { title: "Кормоподрібнювачі | ТД «Софіївка»", description: "Електричні кормоподрібнювачі для зернових культур і коренеплодів." } },
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
