#!/usr/bin/env node
// Read-only post-publication checks. Run only after the complete wave2 release is live.
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const EXPECTED = Object.freeze({ total: 19327, wave2: 8005, excludedTools: 266, brands: { rehau: 7639, tweetop: 345, oxi: 21 } });
const KEPT_SYSTEM_COMPONENTS = [
  { sku: '13524301002', id: 'rehau-a2sh8pd4k6pahv3sqahre5lad4', category: 'geothermal-systems', title: 'Монтажний комплект пластин REHAU RAUGEO 1 для геотермального зонда' },
  { sku: '14710571001', id: 'rehau-vqpd3i735l17jnfk6ou02opfek', category: 'distribution-manifolds', title: 'Комплект ручних повітровідвідників REHAU HKV-D P, 2 шт., з інструментом для демонтажу' },
  { sku: '14710581001', id: 'rehau-fmc49c4ci9jpu3kg4lbmq6u06s', category: 'distribution-manifolds', title: 'Комплект автоматичних повітровідвідників REHAU HKV-D P, 2 шт., з інструментом для демонтажу' }
];
const READ_RPCS = new Set(['get_catalog_bootstrap', 'get_catalog_facets', 'get_catalog_products', 'get_catalog_product']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clean = (value, limit = Infinity) => {
  const text = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
};
const decode = value => String(value ?? '').replace(/&(#x[\da-f]+|#\d+|quot|apos|lt|gt|amp);/gi, (match, entity) => {
  const named = { quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  const code = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
});
const attributes = markup => Object.fromEntries([...markup.matchAll(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(match => [match[1].toLowerCase(), decode(match[3])]));
const field = (html, tag, key, value, attribute) => {
  for (const match of html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'gi'))) {
    const attrs = attributes(match[1]);
    if (attrs[key] === value) return attrs[attribute] || '';
  }
  return '';
};
const imageUrl = product => {
  const image = product.images?.[0];
  return typeof image === 'string' ? image : image?.url || image?.src || '';
};
const normalized = value => value === true ? 'yes' : value === false ? 'no' : value == null ? null : String(value);

export async function verifyWave2Live({ base = process.env.WAVE2_BASE_URL || 'https://sofievka.vercel.app', fetchImpl = fetch,
  exclusionsPath = path.join(ROOT, 'tests/fixtures/rehau-no-tools-scope.json'), requireExclusions = true } = {}) {
  base = String(base).replace(/\/+$/, '');
  const origin = new URL(base).origin, errors = [], summary = { status: 'fail', suite: 'wave2-live', base, expected: EXPECTED, checks: 0, brands: {}, scope: { excludedIdsChecked: 0, keptSystemComponents: [] }, facets: [], samples: [] };
  let publicKey = '', apiOrigin = '';
  const sanitize = error => String(error?.message || error).replaceAll(publicKey || '\0', '[redacted]').replace(/sb_publishable_[A-Za-z0-9_-]+/g, '[redacted]');
  const check = (condition, message) => { summary.checks++; if (!condition) errors.push(message); return Boolean(condition); };
  const attempt = async (label, action) => { try { return await action(); } catch (error) { check(false, `${label}: ${sanitize(error)}`); return null; } };
  const fresh = route => `${base}${route}${route.includes('?') ? '&' : '?'}utm_source=wave2-live-${Date.now()}`;
  async function rpc(name, body = {}) {
    if (!READ_RPCS.has(name)) throw new Error('Only public catalogue read RPCs are allowed.');
    const response = await fetchImpl(`${apiOrigin}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  }
  function counts(facets, label, total, brand = null) {
    if (!check(object(facets), `${label}: facets response is not an object`)) return;
    check(Number.isSafeInteger(facets.total) && facets.total === total, `${label}: total ${facets.total}, expected ${total}`);
    check(typeof facets.version === 'string' && facets.version.length > 0, `${label}: version missing`);
    if (check(object(facets.brandCounts), `${label}: brandCounts missing`)) {
      const entries = Object.entries(facets.brandCounts);
      check(entries.every(([id, count]) => (!brand || id === brand) && Number.isSafeInteger(count) && count >= 0), `${label}: invalid or out-of-scope brandCounts`);
      check(entries.reduce((sum, [, count]) => sum + count, 0) === total, `${label}: brandCounts sum differs from total`);
      if (brand) check((facets.brandCounts[brand] ?? 0) === total, `${label}: scoped brand count differs`);
    }
    check(object(facets.technicalCounts), `${label}: technicalCounts missing`);
  }
  async function binary(url, kind, brand) {
    const absolute = new URL(url, `${base}/`);
    if (!check(absolute.origin === origin && absolute.pathname.startsWith(`/assets/products/${brand}/`), `${brand}: ${kind} is not local brand media`)) return null;
    const response = await fetchImpl(absolute.href, { headers: { Range: 'bytes=0-511' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    check([200, 206].includes(response.status), `${brand} ${kind}: HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    check(kind === 'image' ? /^image\//i.test(contentType) : /application\/(pdf|octet-stream)/i.test(contentType), `${brand} ${kind}: wrong content type ${contentType}`);
    // Some CDNs ignore Range. Read the signature and cancel rather than buffering a large PDF.
    const reader = response.body?.getReader();
    if (!reader) { check(false, `${brand} ${kind}: response body missing`); return null; }
    const chunks = []; let bytes = 0;
    try {
      while (bytes < 32) { const result = await reader.read(); if (result.done) break; chunks.push(result.value); bytes += result.value.length; }
    } finally { await reader.cancel().catch(() => {}); }
    const head = Buffer.concat(chunks.map(value => Buffer.from(value))).subarray(0, 512);
    const pdf = head.subarray(0, 5).toString('ascii') === '%PDF-';
    const image = (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP')
      || head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || (head[0] === 255 && head[1] === 216);
    check(kind === 'pdf' ? pdf : image, `${brand} ${kind}: binary signature is invalid (possible HTML or Git LFS pointer)`);
    return { status: response.status, path: absolute.pathname };
  }
  async function pdp(product, brand) {
    const route = `/product/${encodeURIComponent(product.slug)}`, response = await fetchImpl(fresh(route), { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    check(response.status === 200, `${brand} PDP: HTTP ${response.status}`);
    const html = await response.text(), title = decode(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim();
    const h1 = clean(decode(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || ''));
    check(/data-page-root\s+data-prerendered/.test(html), `${brand} PDP: no server content`);
    check(h1 === clean(product.title), `${brand} PDP: H1 differs from public product title`);
    let expectedTitle = clean(product.seo?.title) || `${clean(product.title)} | ТД «Софіївка»`;
    if (expectedTitle.length > 65) expectedTitle = expectedTitle.replace(/\s+—\s+характеристики(?: та ціна)?(?=\s*\|)/i, '');
    check(Boolean(product.seo?.title && product.seo?.description), `${brand} PDP: imported SEO fields missing`);
    check(title === expectedTitle && !title.startsWith('Товар |'), `${brand} PDP: wrong SEO title`);
    check(field(html, 'meta', 'name', 'description', 'content') === clean(product.seo?.description || product.shortDescription || product.description, 300), `${brand} PDP: wrong SEO description`);
    check(field(html, 'link', 'rel', 'canonical', 'href') === `${base}${route}`, `${brand} PDP: wrong canonical`);
    check(field(html, 'meta', 'name', 'robots', 'content') === 'index,follow', `${brand} PDP: wrong robots`);
    check(field(html, 'meta', 'property', 'og:title', 'content') === title, `${brand} PDP: wrong Open Graph title`);
    let schema = null;
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (attributes(match[1]).id === 'schema-product') {
      try { schema = JSON.parse(match[2]); } catch { /* reported by the schema assertion */ }
    }
    if (check(object(schema), `${brand} PDP: Product JSON-LD missing or invalid`)) {
      check(schema['@type'] === 'Product' && schema.name === clean(product.title), `${brand} PDP: wrong Product schema title`);
      check(schema.url === `${base}${route}`, `${brand} PDP: wrong Product schema URL`);
      check(schema.brand?.name?.toLocaleLowerCase().includes(brand), `${brand} PDP: wrong Product schema brand`);
      const known = product.pricing?.priceStatus === 'known' && Number(product.pricing.amount) > 0;
      check(known ? Number(schema.offers?.price) === Number(product.pricing.amount) : !schema.offers, `${brand} PDP: schema pricing differs from public product`);
    }
    return { status: response.status, serverTitle: title };
  }
  await attempt('runtime configuration', async () => {
    const response = await fetchImpl(`${base}/catalog-runtime-config.js`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.text(), rawUrl = /["']url["']\s*:\s*["'](https:[^"']+)["']/.exec(config)?.[1];
    publicKey = /sb_publishable_[A-Za-z0-9_-]+/.exec(config)?.[0] || '';
    if (!rawUrl || !publicKey) throw new Error('Public catalogue API settings missing');
    const api = new URL(rawUrl.replace(/\\\//g, '/'));
    if (api.protocol !== 'https:' || api.username || api.password || api.search) throw new Error('Invalid public catalogue API URL');
    apiOrigin = api.origin;
    check(true, 'runtime public configuration loaded');
  });
  if (!apiOrigin || !publicKey) return { ...summary, errors };
  const bootstrap = await attempt('bootstrap', () => rpc('get_catalog_bootstrap'));
  if (bootstrap) {
    summary.total = bootstrap.totalProducts;
    check(bootstrap.totalProducts === EXPECTED.total, `bootstrap total ${bootstrap.totalProducts}, expected ${EXPECTED.total}`);
    check(Object.values(EXPECTED.brands).reduce((sum, value) => sum + value, 0) === EXPECTED.wave2, `wave2 expected brand sum differs from ${EXPECTED.wave2}`);
    for (const [brand, expected] of Object.entries(EXPECTED.brands)) check(bootstrap.brandCounts?.[brand] === expected, `${brand}: bootstrap count ${bootstrap.brandCounts?.[brand]}, expected ${expected}`);
  }
  const global = await attempt('whole catalogue facets', () => rpc('get_catalog_facets'));
  if (global) counts(global, 'whole catalogue', EXPECTED.total);
  const globalList = await attempt('whole catalogue products', () => rpc('get_catalog_products', { page_size: 1 }));
  if (globalList) check(globalList.total === EXPECTED.total, `whole catalogue products total ${globalList.total}, expected ${EXPECTED.total}`);
  const brandLists = new Map();
  for (const [brand, expected] of Object.entries(EXPECTED.brands)) await attempt(`${brand} scope`, async () => {
    const facets = await rpc('get_catalog_facets', { scope_brand: brand });
    counts(facets, brand, expected, brand);
    const list = await rpc('get_catalog_products', { scope_brand: brand, page_size: 96 });
    check(list.total === expected, `${brand}: products total ${list.total}, expected ${expected}`);
    if (check(Array.isArray(list.products), `${brand}: products array missing`)) {
      check(list.products.length === Math.min(expected, 96), `${brand}: first page truncated`);
      check(list.products.every(product => product.brandId === brand), `${brand}: listing contains a different brand`);
      brandLists.set(brand, list.products);
    }
    summary.brands[brand] = { bootstrap: bootstrap?.brandCounts?.[brand], facets: facets.total, products: list.total };
  });
  // The category check complements the tracked exact-ID fixture, including misplaced tools.
  await attempt('REHAU tool category excluded', async () => {
    const scope = { scope_brand: 'rehau', scope_category: 'pipe-installation-tools' };
    const list = await rpc('get_catalog_products', { ...scope, page_size: 1 });
    check(list.total === 0 && Array.isArray(list.products) && list.products.length === 0, 'REHAU tool category still has public products');
    const facets = await rpc('get_catalog_facets', scope);
    counts(facets, 'REHAU tool category', 0, 'rehau');
    summary.scope.toolCategoryProducts = list.total;
    summary.scope.toolCategoryFacets = facets?.total;
  });
  await attempt('REHAU exact excluded IDs', async () => {
    let raw;
    try { raw = await fs.readFile(path.resolve(ROOT, exclusionsPath), 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT' && !requireExclusions) { summary.scope.exclusionFile = 'absent (optional; hard tool-category check retained)'; return; }
      throw new Error(error.code === 'ENOENT' ? 'Required exclusions file does not exist' : 'Exclusions file cannot be read');
    }
    let document;
    try { document = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw new Error('Exclusions file is not valid JSON'); }
    const ids = document.products?.map(product => product.legacyId);
    if (document.count !== EXPECTED.excludedTools || !Array.isArray(ids) || ids.length !== EXPECTED.excludedTools
      || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^rehau-[a-z0-9-]+$/.test(id))
      || KEPT_SYSTEM_COMPONENTS.some(product => ids.includes(product.id))) throw new Error('Exclusions file must contain exactly 266 distinct REHAU IDs and preserve the three system components');
    const list = await rpc('get_catalog_products', { scope_brand: 'rehau', product_ids: ids, page_size: 1 });
    check(list.total === 0 && Array.isArray(list.products) && list.products.length === 0, 'At least one of the 266 explicitly excluded REHAU products is still public');
    summary.scope.exclusionFile = path.relative(ROOT, path.resolve(ROOT, exclusionsPath)).split(path.sep).join('/');
    summary.scope.excludedIdsChecked = ids.length;
    summary.scope.excludedPublished = list.total;
  });
  for (const expected of KEPT_SYSTEM_COMPONENTS) await attempt(`REHAU kept ${expected.sku}`, async () => {
    const product = (await rpc('get_catalog_product', { legacy_id: expected.id }))?.product;
    if (!check(product?.id === expected.id && product?.brandId === 'rehau' && product?.sku === expected.sku, `REHAU kept ${expected.sku}: missing or wrong public identity`)) return;
    check(product.publicationStatus === 'published', `REHAU kept ${expected.sku}: not published`);
    check(product.primaryCategoryId === expected.category, `REHAU kept ${expected.sku}: wrong category`);
    check(product.title === expected.title, `REHAU kept ${expected.sku}: wrong corrected title`);
    check(!/Монтажний\s+інструмент/i.test([product.title, product.shortDescription, product.description, product.fullDescription].filter(Boolean).join('\n')), `REHAU kept ${expected.sku}: misleading tool classification remains in public text`);
    // Manufacturer evidence supports no new normalized material/outlets/circuit values here.
    check(object(product.normalizedAttributes) && Object.keys(product.normalizedAttributes).length === 0, `REHAU kept ${expected.sku}: unsupported normalized attributes`);
    check(Array.isArray(product.catalogAttributes) && product.catalogAttributes.length === 0, `REHAU kept ${expected.sku}: unsupported typed attributes`);
    if (expected.sku !== '13524301002') check(/2 шт\./u.test(product.title) && !/\b2\s*St\b/.test(product.title), `REHAU kept ${expected.sku}: valve quantity is not normalized to 2 шт.`);
    const page = await pdp(product, 'rehau');
    summary.scope.keptSystemComponents.push({ sku: expected.sku, category: product.primaryCategoryId, pdpStatus: page.status });
  });
  for (const spec of [
    { brand: 'tweetop', category: 'water-heating-pipes', attribute: 'pipeWallThicknessMm' },
    { brand: 'rehau', category: 'distribution-manifolds', attribute: 'outlets' },
    { brand: 'oxi', category: 'pellet-burners', attribute: 'heatOutputKw' }
  ]) await attempt(`${spec.brand} ${spec.attribute}`, async () => {
    const scope = { scope_brand: spec.brand, scope_category: spec.category }, facets = await rpc('get_catalog_facets', scope);
    if (!check(object(facets?.technicalCounts?.[spec.attribute]), `${spec.brand}: actual ${spec.attribute} facet values missing`)) return;
    const options = Object.entries(facets.technicalCounts[spec.attribute]).filter(([value, count]) => value.length && Number.isSafeInteger(count) && count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!check(options.length > 0, `${spec.brand}: ${spec.attribute} facet has no usable values`)) return;
    const [value, expected] = options[0], selected = [value]; // Actual facet key, deliberately an array of strings.
    check(selected.every(item => typeof item === 'string'), `${spec.brand}: selected facet values must be strings`);
    const body = { ...scope, technical_filters: { [spec.attribute]: selected } };
    const filtered = await rpc('get_catalog_products', { ...body, page_size: 96 });
    check(filtered.total === expected, `${spec.brand}: selected ${spec.attribute} products ${filtered.total}, facet count ${expected}`);
    check(Array.isArray(filtered.products) && filtered.products.length === Math.min(expected, 96), `${spec.brand}: filtered products empty or truncated`);
    check(filtered.products?.every(product => product.brandId === spec.brand && product.primaryCategoryId === spec.category && normalized(product.normalizedAttributes?.[spec.attribute]) === value), `${spec.brand}: selected ${spec.attribute} returned mismatched product values`);
    const filteredFacets = await rpc('get_catalog_facets', body);
    counts(filteredFacets, `${spec.brand} ${spec.attribute} selected`, expected, spec.brand);
    summary.facets.push({ ...spec, values: selected, matched: filtered.total });
  });
  for (const brand of Object.keys(EXPECTED.brands)) await attempt(`${brand} media/PDP samples`, async () => {
    const cards = brandLists.get(brand) || [], images = new Set(), documents = new Set();
    let sampled = 0;
    // Prefer two distinct primary images; manufacturer PDFs may legitimately be shared across variants.
    const ordered = [...cards].sort((a, b) => Number(imageUrl(a) === imageUrl(cards[0] || {})) - Number(imageUrl(b) === imageUrl(cards[0] || {})));
    if (cards[0]) ordered.unshift(cards[0]);
    const visited = new Set();
    for (const card of ordered) {
      if (sampled === 2) break;
      if (visited.has(card.id) || !imageUrl(card) || images.has(imageUrl(card))) continue;
      visited.add(card.id);
      const product = (await rpc('get_catalog_product', { legacy_id: card.id }))?.product;
      if (!check(product?.id === card.id && product?.brandId === brand, `${brand}: detail identity differs from listing`)) continue;
      const docs = (product.documents || []).filter(document => typeof document?.url === 'string' && /\.pdf(?:[?#]|$)/i.test(document.url));
      if (!docs.length) continue;
      const document = docs.find(item => !documents.has(item.url)) || docs[0];
      const results = await Promise.allSettled([binary(imageUrl(product), 'image', brand), binary(document.url, 'pdf', brand), pdp(product, brand)]);
      results.forEach((result, index) => { if (result.status === 'rejected') check(false, `${brand} sample ${['image', 'PDF', 'PDP'][index]}: ${sanitize(result.reason)}`); });
      summary.samples.push({ brand, id: product.id, slug: product.slug, image: results[0].status === 'fulfilled' ? results[0].value : null, pdf: results[1].status === 'fulfilled' ? results[1].value : null, pdp: results[2].status === 'fulfilled' ? results[2].value : null });
      images.add(imageUrl(product)); documents.add(document.url); sampled++;
    }
    check(sampled === 2, `${brand}: found only ${sampled}/2 distinct-primary-image products with PDFs in first96`);
  });
  summary.status = errors.length ? 'fail' : 'pass';
  if (errors.length) summary.errors = errors;
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), exclusions = args.find(argument => argument.startsWith('--exclusions='));
  if (args.includes('--help')) console.log('Usage: node scripts/import/verify-wave2-live.mjs [--exclusions=imports/rehau-no-tools-exclusions.json] (run after full no-tools wave2 publication; optional WAVE2_BASE_URL). Default: required tracked tests/fixtures/rehau-no-tools-scope.json; an explicit producer path is also supported and required to exist. Read-only checks, one JSON record, exit 1 on failure.');
  else if (args.some(argument => !/^--exclusions=.+/.test(argument)) || args.filter(argument => argument.startsWith('--exclusions=')).length > 1) { console.log(JSON.stringify({ status: 'fail', error: 'Unknown or repeated argument; use --help.' })); process.exitCode = 1; }
  else verifyWave2Live({ ...(exclusions ? { exclusionsPath: exclusions.slice('--exclusions='.length), requireExclusions: true } : {}) }).then(result => { console.log(JSON.stringify(result)); if (result.status !== 'pass') process.exitCode = 1; }).catch(() => { console.log(JSON.stringify({ status: 'fail', error: 'Wave2 live verification could not start.' })); process.exitCode = 1; });
}
