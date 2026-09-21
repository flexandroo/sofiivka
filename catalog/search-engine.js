(function () {
  "use strict";

  const catalog = window.sofievkaCatalog;
  if (!catalog) throw new Error("Catalog search requires the centralized catalog facade.");

  const SEARCHABLE_ATTRIBUTE_IDS = Object.freeze([
    "diameter", "diameterMm", "connection", "powerKw", "headM", "flowM3h", "filtrationMicron",
    "compatibility", "kvs", "mountingLengthMm", "pressureBar", "heatOutputKw", "outlets", "voltage",
    "control", "protectionClass", "temperature", "capacityLh", "format", "eei", "selfPriming",
    "maxImmersionDepthM", "freePassageMm", "cableLengthM", "floatSwitch", "volumeL", "material", "installation"
  ]);

  const CATEGORY_ALIASES = Object.freeze({
    "circulation-pumps": ["циркуляційний насос", "циркуляційні насоси", "циркуляционный насос", "циркуляционные насосы"],
    "water-pumps": ["насоси для водопостачання", "водяні насоси", "насосы водоснабжения"],
    "multistage-pumps": ["багатоступеневий насос", "багатоступеневі насоси", "многоступенчатый насос"],
    "drainage-pumps": ["дренажний насос", "дренажні насоси", "занурювальний насос", "дренажный насос"],
    "underfloor-heating": ["тепла підлога", "теплий пол", "теплый пол", "підігрів підлоги"],
    "distribution-hydraulics": ["гідравліка", "гидравлика", "колектор", "колектори", "коллектор", "насосна група"],
    automation: ["автоматика", "керування", "управління", "управление", "термостат", "контролер"],
    valves: ["арматура", "клапан", "клапани", "кран", "регулююча арматура"],
    "heating-components": ["комплектуючі", "комплектующие", "модульна система"],
    "water-treatment": ["водоочищення", "очищення води", "очистка воды", "фільтрація води"],
    "reverse-osmosis": ["осмос", "зворотний осмос", "зворотній осмос", "обратный осмос", "reverse osmosis"],
    "drinking-system-cartridges": ["картридж", "картриджі", "картриджи", "змінний елемент"],
    "mainline-cartridges": ["магістральний картридж", "магістральні картриджі", "картридж", "картриджі", "картриджи"],
    "mainline-filters-housings": ["магістральний фільтр", "корпус фільтра", "колба фільтра"],
    "filter-media": ["фільтрувальні матеріали", "фильтрующие материалы", "завантаження для фільтра", "засипка"],
    "complex-treatment": ["комплексне очищення", "комплексная очистка"],
    "water-softening": ["пом'якшення", "пом’якшення", "умягчение", "пом'якшувач"],
    "chlorine-odor-removal": ["видалення хлору", "хлор і запах", "удаление хлора"],
    "mechanical-treatment": ["механічне очищення", "механическая очистка"],
    "flow-filters": ["проточний фільтр", "проточні фільтри", "проточный фильтр"],
    "water-supply-components": ["комплектуючі для водопостачання", "баки та автоматика", "аксесуари насосів"],
    "pressure-tanks": ["мембранний бак", "гідроакумулятор", "напірний бак", "расширительный бак"],
    "pump-automation": ["автоматика насоса", "контролер насоса", "реле тиску", "pressure manager"],
    "pump-accessories": ["комплектуючі насоса", "аксесуари насоса", "монтажний комплект"],
    "pump-services": ["сервіс насосів", "пусконалагодження", "введення в експлуатацію"]
  });

  const WORD_GROUPS = Object.freeze([
    ["насос", "насоси", "насосы", "помпа", "помпи", "помпы"],
    ["картридж", "картриджі", "картриджи"],
    ["фільтр", "фільтри", "фильтр", "фильтры"],
    ["колектор", "колектори", "коллектор", "коллекторы"],
    ["клапан", "клапани", "клапаны"],
    ["керування", "управління", "управление"],
    ["циркуляційний", "циркуляційні", "циркуляционный", "циркуляционные"],
    ["зворотний", "зворотній", "обратный"],
    ["матеріал", "матеріали", "материал", "материалы"],
    ["фільтрувальний", "фільтрувальні", "фильтрующий", "фильтрующие"]
  ]);

  const STOP_WORDS = new Set(["і", "й", "та", "для", "з", "зі", "із", "в", "у", "на", "по", "и", "для"]);
  const SERIES_LABELS = catalog.attributeSchema.seriesLabels || {};

  function normalizeQuery(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .replace(/[’‘`´]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("uk");
  }

  function tokenize(value) {
    return normalizeQuery(value).match(/[a-zа-яіїєґ0-9]+(?:[./-][a-zа-яіїєґ0-9]+)*/giu) || [];
  }

  const normalizedWordGroups = WORD_GROUPS.map(group => group.map(normalizeQuery));
  function variantsForToken(token) {
    const group = normalizedWordGroups.find(items => items.includes(token));
    return group || [token];
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function phraseWithTokens(values) {
    const phrases = unique(values.map(normalizeQuery));
    return Object.freeze({ phrases: Object.freeze(phrases), tokens: Object.freeze(unique(phrases.flatMap(tokenize))) });
  }

  function technicalAttributeText(product) {
    const values = [];
    SEARCHABLE_ATTRIBUTE_IDS.forEach(id => {
      const value = product.normalizedAttributes?.[id];
      if (value === undefined || value === null || value === "") return;
      const definition = catalog.attributeDefinitions[id];
      const display = catalog.valueLabel(definition, value);
      values.push(id, definition?.label || "", display);
      if (/\d\s*["″]/.test(String(display))) values.push(`${String(display).replace(/["″]/g, "")} дюйм`, "inch");
    });
    return values;
  }

  function collectionText(product) {
    const collections = [
      ...(Array.isArray(product.collections) ? product.collections : []),
      ...(Array.isArray(product.tags) ? product.tags : [])
    ];
    return collections.flatMap(collection => {
      if (/sale|discount/i.test(collection)) return [collection, "sale", "розпродаж", "знижка"];
      return [collection];
    });
  }

  function identifierVariants(value) {
    const normalized = normalizeQuery(value).replace(/\s+/g, "");
    const variants = [normalized];
    // Supplier codes occasionally confuse the letter O and zero. Keep this controlled
    // equivalence below exact identifier matches instead of applying general fuzzy SKU search.
    if (/[oо](?=\d)|(?<=\d)[oо]/iu.test(normalized)) variants.push(normalized.replace(/[oо]/giu, "0"));
    if (/0(?=\d)|(?<=\d)0/u.test(normalized)) variants.push(normalized.replace(/0/g, "o"));
    return unique(variants);
  }

  const categoryIndex = Object.freeze(catalog.categories
    .filter(category => category.status === "active")
    .map(category => {
      const products = catalog.productsForCategory(category.id);
      const aliases = CATEGORY_ALIASES[category.id] || [];
      const parentNames = catalog.getCategoryAncestors(category.id).map(item => item.title || item.name);
      const text = phraseWithTokens([category.title, category.shortTitle, ...parentNames, ...aliases]);
      return Object.freeze({ type: "category", entity: category, count: products.length, href: catalog.getCategoryPath(category.id), aliases: Object.freeze(aliases), ...text });
    })
    .filter(item => item.count > 0));

  const productCountByBrand = catalog.products.reduce((counts, product) => {
    counts[product.brandId] = (counts[product.brandId] || 0) + 1;
    return counts;
  }, {});
  const brandIndex = Object.freeze(catalog.brands.map(brand => {
    const aliases = Array.isArray(brand.aliases) ? brand.aliases : [];
    const text = phraseWithTokens([brand.name, brand.slug, ...aliases]);
    return Object.freeze({ type: "brand", entity: brand, count: productCountByBrand[brand.slug] || 0, href: catalog.brandUrl(brand.slug), aliases: Object.freeze(aliases), ...text });
  }));

  const productIndex = Object.freeze(catalog.products.map(product => {
    const category = catalog.categoryById[product.primaryCategoryId];
    const categoryChain = category ? [...catalog.getCategoryAncestors(category.id), category] : [];
    const categoryAliases = categoryChain.flatMap(item => CATEGORY_ALIASES[item.id] || []);
    const seriesLabel = product.seriesId ? SERIES_LABELS[product.seriesId] || product.seriesId : "";
    const seriesName = product.seriesId ? `${product.brand} ${seriesLabel}` : "";
    const title = phraseWithTokens([product.title, product.shortTitle]);
    const model = phraseWithTokens([product.model]);
    const brand = phraseWithTokens([product.brand, product.brandId]);
    const series = phraseWithTokens([seriesName, seriesLabel, product.seriesId]);
    const categoryText = phraseWithTokens([...categoryChain.flatMap(item => [item.title, item.shortTitle]), ...categoryAliases]);
    const attributes = phraseWithTokens(technicalAttributeText(product));
    const collections = phraseWithTokens(collectionText(product));
    return Object.freeze({
      product,
      sku: normalizeQuery(product.sku).replace(/\s+/g, ""),
      skuVariants: Object.freeze(identifierVariants(product.sku)),
      title,
      model,
      brand,
      series,
      category: categoryText,
      attributes,
      collections
    });
  }));

  const seriesIndex = Object.freeze([...new Set(catalog.products.map(product => product.seriesId).filter(Boolean))].map(seriesId => {
    const products = catalog.products.filter(product => product.seriesId === seriesId);
    const brand = products[0]?.brand || "";
    const label = SERIES_LABELS[seriesId] || seriesId;
    const name = `${brand} ${label}`.trim();
    const text = phraseWithTokens([name, label, seriesId]);
    return Object.freeze({ type: "series", entity: Object.freeze({ id: seriesId, name, label, brand }), count: products.length, href: `/search?q=${encodeURIComponent(name)}`, aliases: Object.freeze([]), ...text });
  }));
  const fuzzyVocabulary = Object.freeze(unique([
    ...productIndex.flatMap(entry => [...entry.title.tokens, ...entry.brand.tokens, ...entry.category.tokens]),
    ...brandIndex.flatMap(entry => entry.tokens),
    ...categoryIndex.flatMap(entry => entry.tokens),
    ...seriesIndex.flatMap(entry => entry.tokens)
  ]));
  const fuzzyMatchCache = new Map();

  function levenshtein(first, second, maxDistance) {
    if (first === second) return 0;
    if (Math.abs(first.length - second.length) > maxDistance) return maxDistance + 1;
    let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
    for (let i = 1; i <= first.length; i += 1) {
      const current = [i];
      let rowMinimum = i;
      for (let j = 1; j <= second.length; j += 1) {
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (first[i - 1] === second[j - 1] ? 0 : 1));
        rowMinimum = Math.min(rowMinimum, current[j]);
      }
      if (rowMinimum > maxDistance) return maxDistance + 1;
      previous = current;
    }
    return previous[second.length];
  }

  function fuzzyTokenMatch(queryToken, candidateTokens) {
    if (!/^[a-zа-яіїєґ]+$/iu.test(queryToken) || queryToken.length < 4) return false;
    if (!fuzzyMatchCache.has(queryToken)) {
      const maxDistance = queryToken.length >= 8 ? 2 : 1;
      fuzzyMatchCache.set(queryToken, new Set(fuzzyVocabulary.filter(candidate => candidate.length >= 4 && levenshtein(queryToken, candidate, maxDistance) <= maxDistance)));
    }
    const matches = fuzzyMatchCache.get(queryToken);
    return candidateTokens.some(candidate => matches.has(candidate));
  }

  function phraseMatchScore(query, field, scores) {
    if (!query || !field.phrases.length) return 0;
    if (field.phrases.includes(query)) return scores.exact;
    if (field.phrases.some(value => value.startsWith(query))) return scores.prefix;
    if (field.phrases.some(value => value.includes(query))) return scores.contains;
    return 0;
  }

  function tokenMatchScore(token, entry) {
    const variants = variantsForToken(token);
    const fields = [
      [entry.title, 155, 95],
      [entry.model, 145, 90],
      [entry.brand, 135, 85],
      [entry.series, 130, 82],
      [entry.category, 125, 78],
      [entry.attributes, 72, 44],
      [entry.collections, 64, 38]
    ];
    if (variants.some(value => entry.skuVariants.includes(value))) return 900;
    if (/\d/u.test(token) && variants.some(value => entry.skuVariants.some(sku => sku.startsWith(value)))) return 620;
    for (const [field, exactScore, containsScore] of fields) {
      if (variants.some(value => field.tokens.includes(value))) return exactScore;
      if (variants.some(value => field.phrases.some(phrase => phrase.includes(value)))) return containsScore;
    }
    const fuzzyTokens = unique([...entry.title.tokens, ...entry.brand.tokens, ...entry.category.tokens]);
    return fuzzyTokenMatch(token, fuzzyTokens) ? 24 : 0;
  }

  function scoreProduct(entry, normalizedQuery, tokens) {
    const compact = normalizedQuery.replace(/\s+/g, "");
    if (entry.sku === compact) return 100000;
    if (entry.model.phrases.includes(normalizedQuery)) return 90000;
    if (entry.title.phrases.includes(normalizedQuery)) return 85000;
    const hasNumber = tokens.some(token => /\d/u.test(token));
    const hasUnit = tokens.some(token => ["мм", "м", "мкм", "квт", "вт", "бар", "л", "дюйм", "inch"].includes(token));
    const technicalPairs = tokens.flatMap((token, index) => /\d/u.test(token) && tokens[index + 1] ? [`${token} ${tokens[index + 1]}`] : []);
    if (hasNumber && hasUnit && ![entry.title, entry.model, entry.attributes].some(field => field.phrases.some(phrase => technicalPairs.some(pair => phrase.includes(pair))))) return 0;
    let score = 0;
    if (entry.sku.startsWith(compact)) score += 18000;
    else if (entry.skuVariants.includes(compact)) score += 12000;
    score += phraseMatchScore(normalizedQuery, entry.title, { exact: 0, prefix: 8000, contains: 4200 });
    score += phraseMatchScore(normalizedQuery, entry.model, { exact: 0, prefix: 7200, contains: 3600 });
    score += phraseMatchScore(normalizedQuery, entry.brand, { exact: 3200, prefix: 1900, contains: 1100 });
    score += phraseMatchScore(normalizedQuery, entry.series, { exact: 3000, prefix: 1700, contains: 1000 });
    score += phraseMatchScore(normalizedQuery, entry.category, { exact: 2800, prefix: 1500, contains: 900 });
    score += phraseMatchScore(normalizedQuery, entry.attributes, { exact: 0, prefix: 260, contains: 180 });
    score += phraseMatchScore(normalizedQuery, entry.collections, { exact: 500, prefix: 360, contains: 220 });

    let coverage = 0;
    let tokenScore = 0;
    tokens.forEach(token => {
      const matchScore = tokenMatchScore(token, entry);
      if (matchScore > 0) coverage += 1;
      tokenScore += matchScore;
      const variants = variantsForToken(token);
      if (variants.some(value => entry.category.tokens.includes(value))) tokenScore += 175;
      if (variants.some(value => entry.brand.tokens.includes(value))) tokenScore += 145;
      if (variants.some(value => entry.series.tokens.includes(value))) tokenScore += 135;
    });
    if (coverage !== tokens.length) return 0;
    score += tokenScore + (tokens.length > 1 ? coverage * 210 : 0);
    return score;
  }

  function scoreEntity(item, normalizedQuery, tokens) {
    const exact = item.phrases.includes(normalizedQuery);
    if (exact) return 10000;
    const prefix = item.phrases.some(value => value.startsWith(normalizedQuery));
    if (prefix) return 4800;
    const contains = item.phrases.some(value => value.includes(normalizedQuery));
    if (contains) return 2600;
    let coverage = 0;
    let score = 0;
    tokens.forEach(token => {
      const variants = variantsForToken(token);
      if (variants.some(value => item.tokens.includes(value))) { coverage += 1; score += 240; return; }
      if (fuzzyTokenMatch(token, item.tokens)) { coverage += 1; score += 45; }
    });
    return coverage === tokens.length ? score : 0;
  }

  function meaningfulTokens(query) {
    const all = tokenize(query);
    const filtered = all.filter(token => !STOP_WORDS.has(token));
    return filtered.length ? filtered : all;
  }

  function rankedEntities(items, normalizedQuery, tokens, limit, filter = () => true) {
    return items
      .filter(filter)
      .map(item => ({ ...item, score: scoreEntity(item, normalizedQuery, tokens) }))
      .filter(item => item.score > 0)
      .sort((first, second) => second.score - first.score || second.count - first.count || first.entity.name?.localeCompare(second.entity.name, "uk"))
      .slice(0, limit);
  }

  function search(query, options = {}) {
    const normalizedQuery = normalizeQuery(query);
    const tokens = meaningfulTokens(normalizedQuery);
    const limits = {
      products: Number.isFinite(options.productLimit) ? options.productLimit : Infinity,
      categories: Number.isFinite(options.categoryLimit) ? options.categoryLimit : Infinity,
      brands: Number.isFinite(options.brandLimit) ? options.brandLimit : Infinity,
      series: Number.isFinite(options.seriesLimit) ? options.seriesLimit : Infinity
    };
    if (!normalizedQuery || !tokens.length) return Object.freeze({ query: String(query ?? ""), normalizedQuery, totalProducts: 0, products: Object.freeze([]), productHits: Object.freeze([]), categories: Object.freeze([]), brands: Object.freeze([]), series: Object.freeze([]) });

    const allProductHits = productIndex
      .map(entry => ({ product: entry.product, score: scoreProduct(entry, normalizedQuery, tokens) }))
      .filter(hit => hit.score > 0)
      .sort((first, second) => second.score - first.score || first.product.title.localeCompare(second.product.title, "uk"));
    const exactBrandQuery = brandIndex.some(item => item.phrases.includes(normalizedQuery));
    const brands = rankedEntities(brandIndex, normalizedQuery, tokens, limits.brands, item => item.count > 0 || (exactBrandQuery && item.phrases.includes(normalizedQuery)));
    const categories = rankedEntities(categoryIndex, normalizedQuery, tokens, limits.categories);
    const series = rankedEntities(seriesIndex, normalizedQuery, tokens, limits.series);
    const productHits = allProductHits.slice(0, limits.products);
    return Object.freeze({
      query: String(query ?? ""),
      normalizedQuery,
      tokens: Object.freeze(tokens),
      totalProducts: allProductHits.length,
      products: Object.freeze(productHits.map(hit => hit.product)),
      productHits: Object.freeze(productHits),
      categories: Object.freeze(categories),
      brands: Object.freeze(brands),
      series: Object.freeze(series)
    });
  }

  const api = Object.freeze({
    search,
    normalizeQuery,
    tokenize,
    searchableAttributeIds: SEARCHABLE_ATTRIBUTE_IDS,
    aliases: CATEGORY_ALIASES,
    index: Object.freeze({ products: productIndex, brands: brandIndex, categories: categoryIndex, series: seriesIndex })
  });
  window.sofievkaCatalogSearch = api;
  window.catalogSearch = search;
})();
