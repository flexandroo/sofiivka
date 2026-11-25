#!/usr/bin/env node
// Public, read-only OXOMI discovery. A search limit is never treated as a catalogue limit.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const FULL_QUERIES = ['base-info', 'texts', 'features', 'product-images', 'attachments', 'measurements', 'pages', 'relationships', 'variants-html'];
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const readJson = async filename => JSON.parse((await fs.readFile(filename, 'utf8')).replace(/^\uFEFF/, ''));

export function extractSearchSkus(html = '') {
  return [...new Set([...html.matchAll(/oxomi-product-item-number-js[^>]*>\s*([0-9]{11})\s*</g)].map(match => match[1]))];
}

export function sourceKeywords(products) {
  const words = new Set();
  for (const product of products) {
    const info = product.queries?.find(query => query.name === 'base-info')?.baseInfo || product.baseInfo || {};
    const text = `${info.shortText || ''} ${info.model || ''}`.normalize('NFC');
    for (const word of text.toLocaleLowerCase('uk').match(/[\p{Script=Cyrillic}]{3,}(?:-[\p{Script=Cyrillic}]{3,})?/gu) || []) words.add(word);
    for (const word of text.toUpperCase().match(/[A-Z][A-Z0-9]*(?:[-_][A-Z0-9]+)*/g) || []) if (word.length >= 3) words.add(word);
  }
  return [...words].sort();
}

export function assertCompleteness({ target, products, unqueriedVariants = [], metadataAfter = target }) {
  if (!Number.isSafeInteger(target) || target < 0) throw new Error('Invalid live portal products metadata.');
  if (metadataAfter !== target) throw new Error(`Portal metadata changed during discovery: ${target} -> ${metadataAfter}; rerun on a consistent source snapshot.`);
  const skus = new Set(), ids = new Set();
  for (const product of products) {
    if (!product.resolved || !/^[0-9]{11}$/.test(product.itemNumber || '') || !product.productId) throw new Error('Completeness requires resolved official SKU and internal productId.');
    if (skus.has(product.itemNumber)) throw new Error(`Duplicate SKU: ${product.itemNumber}`);
    if (ids.has(product.productId)) throw new Error(`Duplicate internal productId: ${product.productId}`);
    skus.add(product.itemNumber); ids.add(product.productId);
  }
  if (unqueriedVariants.length) throw new Error(`Variant closure incomplete: ${unqueriedVariants.length} unqueried SKU.`);
  if (skus.size !== target) throw new Error(`Source partition incomplete: ${skus.size} resolved unique SKU / ${target} portal products. Do not publish a completeness claim.`);
  return { resolvedUniqueSkus: skus.size, uniqueProductIds: ids.size, target };
}

async function parallel(items, action, concurrency = 4) {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) await action(items[cursor++]);
  }));
}

function options(args) {
  const result = { portal: '3001044', cache: 'tmp/rehau-ua-completeness-replay', output: 'imports/rehau-ua-completeness-current.json', seed: 'imports/rehau-ua-completeness-qa.json', sourceCache: 'tmp/rehau-source/details-ua', reuseCache: false };
  for (const arg of args) {
    if (arg === '--reuse-cache') result.reuseCache = true;
    else if (arg === '--help') result.help = true;
    else {
      const match = /^--(portal|cache|output|seed|source-cache)=(.+)$/.exec(arg);
      if (!match) throw new Error(`Unknown argument: ${arg}`);
      result[match[1] === 'source-cache' ? 'sourceCache' : match[1]] = match[2];
    }
  }
  if (!/^\d+$/.test(result.portal)) throw new Error('Portal must be a numeric public OXOMI portal ID.');
  for (const key of ['cache', 'output']) {
    const absolute = path.resolve(ROOT, result[key]);
    if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) throw new Error(`${key} must stay inside the repository.`);
    result[key] = absolute;
  }
  result.seed = path.resolve(ROOT, result.seed);
  result.sourceCache = path.resolve(ROOT, result.sourceCache);
  return result;
}

export async function runCompleteness(args = process.argv.slice(2)) {
  const config = options(args);
  if (config.help) {
    console.log('node scripts/import/rehau-ua-completeness.mjs [--portal=3001044] [--seed=imports/rehau-ua-completeness-qa.json] [--source-cache=tmp/rehau-source/details-ua] [--cache=tmp/rehau-ua-completeness-replay] [--output=imports/rehau-ua-completeness-current.json] [--reuse-cache]');
    console.log('Default: fresh public requests. --reuse-cache explicitly resumes a cached source snapshot. No DB, assets, source-union, or collector files are changed.');
    return;
  }
  await fs.mkdir(config.cache, { recursive: true });
  const relative = filename => path.relative(ROOT, filename).split(path.sep).join('/');
  const sourceRequests = [], requestFailures = [];
  async function request(endpoint, params, kind, fresh = false) {
    const url = new URL(`https://oxomi.com/portals/api/v1/${endpoint}`);
    url.searchParams.set('portal', config.portal);
    for (const [key, value] of params) url.searchParams.append(key, String(value));
    const filename = path.join(config.cache, `${kind}-${sha256(url.href).slice(0, 24)}.json`);
    let json, cached = false;
    if (config.reuseCache && !fresh) {
      try { json = await readJson(filename); cached = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!json) {
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!response.ok) {
        requestFailures.push({ url: url.href, status: response.status });
        throw new Error(`Official public API HTTP ${response.status}: ${url.href}`);
      }
      json = await response.json();
      if (json.success === false) throw new Error(`Official API refused public request: ${url.href}`);
      await fs.writeFile(filename, JSON.stringify(json));
    }
    sourceRequests.push({ url: url.href, cache: relative(filename), cached, sha256: sha256(await fs.readFile(filename)) });
    return { json, cache: relative(filename) };
  }
  async function metadata(stage) {
    const response = await request('universal-search/search', [['query', ''], ['limit', 50], ['hideStories', true]], `metadata-${stage}`, true);
    const target = response.json.metadata?.products;
    if (!Number.isSafeInteger(target) || target < 0) throw new Error('Live portal omitted valid products metadata.');
    return { target, source: sourceRequests.at(-1), fetchedAt: new Date().toISOString() };
  }
  const before = await metadata('before'), candidates = new Set(), baseline = new Set();
  const shared = config.sourceCache;
  try {
    for (const name of await fs.readdir(shared)) {
      if (!name.endsWith('.json')) continue;
      for (const product of (await readJson(path.join(shared, name))).products || []) {
        if (product.resolved && /^[0-9]{11}$/.test(product.itemNumber || '')) {
          baseline.add(product.itemNumber); candidates.add(product.itemNumber);
        }
      }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Historical public SKU evidence seeds discovery, but every seed is re-resolved by the API.
  // Thus a fresh clone retains prior recoveries without trusting historical publication/currentness.
  const historical = await readJson(config.seed);
  for (const key of ['baselineUASkus', 'newEngineeringSkus', 'newMepaOutOfScopeSkus']) {
    for (const sku of historical.partition?.[key] || []) {
      if (!/^[0-9]{11}$/.test(sku)) throw new Error(`Invalid historical source SKU: ${sku}`);
      candidates.add(sku);
    }
  }
  if (!candidates.size) throw new Error('No source seeds: run the REHAU collector or supply a committed public-source partition with --seed.');
  const queried = new Set(), searched = new Set(), products = new Map(), productSources = new Map(), unresolved = new Map(), queryEvidence = [], variantEdges = [];
  async function productBatches(skus, queryNames, kind, absorb) {
    const chunks = [];
    for (let index = 0; index < skus.length; index += 29) chunks.push(skus.slice(index, index + 29));
    await parallel(chunks, async chunk => {
      const params = [['language', 'uk'], ...queryNames.map(name => ['queries', name])];
      chunk.forEach((sku, index) => params.push([`itemNumber${index + 1}`, sku], [`supplierNumber${index + 1}`, '-']));
      const response = await request('product/data', params, kind);
      if (response.json.products?.length !== chunk.length) throw new Error('Truncated product/data response; no completeness claim is safe.');
      const returned = new Set(response.json.products.map(product => product.itemNumber));
      if (returned.size !== chunk.length || chunk.some(sku => !returned.has(sku))) throw new Error('product/data returned duplicate or mismatched SKU.');
      for (const product of response.json.products) await absorb(product, response.cache);
    });
  }
  let round = 0;
  while (true) {
    let pending;
    while ((pending = [...candidates].filter(sku => !queried.has(sku)).sort()).length) {
      await productBatches(pending, ['base-info', 'variants-html'], 'variant-source', async (product, cache) => {
        queried.add(product.itemNumber);
        if (!product.resolved) { unresolved.set(product.itemNumber, { sku: product.itemNumber, sourceCache: cache }); return; }
        const names = new Set(product.queries?.map(query => query.name));
        if (!names.has('base-info') || !names.has('variants-html')) throw new Error(`Incomplete variant queries: ${product.itemNumber}`);
        products.set(product.itemNumber, product); productSources.set(product.itemNumber, cache);
        for (const query of product.queries) if (query.name === 'variants-html') {
          for (const sku of extractSearchSkus(query.html)) {
            if (!candidates.has(sku)) variantEdges.push({ from: product.itemNumber, to: sku, sourceCache: cache });
            candidates.add(sku);
          }
        }
      });
      console.log(JSON.stringify({ phase: 'variants', resolved: products.size, queried: queried.size, target: before.target }));
    }
    const keywords = sourceKeywords(products.values()).filter(word => !searched.has(word));
    if (!keywords.length) break;
    round++;
    console.log(JSON.stringify({ phase: 'source-words', round, pendingQueries: keywords.length, resolved: products.size, target: before.target }));
    let done = 0;
    await parallel(keywords, async keyword => {
      const response = await request('universal-search/search', [['query', keyword], ['limit', 50], ['hideStories', true]], 'word');
      const html = response.json.sections?.map(section => section.parameters?.html || '').join('\n') || '';
      const skus = extractSearchSkus(html);
      for (const sku of skus) candidates.add(sku);
      searched.add(keyword); queryEvidence.push({ query: keyword, skus, sourceCache: response.cache });
      if (++done % 100 === 0) console.log(JSON.stringify({ phase: 'source-words', round, completed: done, total: keywords.length }));
    });
  }
  const after = await metadata('after'), unqueried = [...candidates].filter(sku => !queried.has(sku));
  const basicReport = { checkedAt: new Date().toISOString(), portal: config.portal, sourceMode: config.reuseCache ? 'explicit cached snapshot resume' : 'fresh public requests', metadataBefore: before, metadataAfter: after, queryRounds: round, keywordQueries: searched.size, variantsQueried: queried.size, unresolvedCandidates: [...unresolved.values()], requestFailures, queryEvidence, variantEdges, sourceRequests };
  let invariants;
  try { invariants = assertCompleteness({ target: before.target, products: products.values(), unqueriedVariants: unqueried, metadataAfter: after.target }); }
  catch (error) {
    await fs.mkdir(path.dirname(config.output), { recursive: true });
    await fs.writeFile(config.output, JSON.stringify({ ...basicReport, status: 'FAILED_INCOMPLETE_SOURCE_PARTITION', error: error.message, resolvedUniqueSkus: products.size }, null, 2) + '\n');
    throw error;
  }
  const newEngineering = [...products.keys()].filter(sku => !baseline.has(sku) && !sku.startsWith('1896')).sort(), fullSources = new Map();
  await productBatches(newEngineering, FULL_QUERIES, 'full-engineering', async (product, cache) => {
    if (!product.resolved || product.productId !== products.get(product.itemNumber)?.productId) throw new Error(`Full source identity changed: ${product.itemNumber}`);
    const names = new Set(product.queries?.map(query => query.name));
    if (FULL_QUERIES.some(name => !names.has(name))) throw new Error(`Full engineering source incomplete: ${product.itemNumber}`);
    fullSources.set(product.itemNumber, cache);
  });
  const row = sku => {
    const product = products.get(sku), info = product.queries.find(query => query.name === 'base-info').baseInfo;
    return { sku, id: product.productId, title: info.shortText || info.model || '', model: info.model, datasheetUrl: info.datasheetUrl, sourceCache: productSources.get(sku), ...(fullSources.has(sku) ? { fullProductDataPath: fullSources.get(sku) } : {}) };
  };
  const all = [...products.keys()].sort(), newMepa = all.filter(sku => !baseline.has(sku) && sku.startsWith('1896'));
  const report = { ...basicReport, status: config.reuseCache ? 'PASS_CACHED_SOURCE_PARTITION_SNAPSHOT' : 'PASS_COMPLETE_SOURCE_PARTITION', invariants, counts: { baselineResolved: baseline.size, allResolvedUniqueUA: all.length, engineering: all.filter(sku => !sku.startsWith('1896')).length, mepaOutOfScope: all.filter(sku => sku.startsWith('1896')).length, newEngineering: newEngineering.length, newMepaOutOfScope: newMepa.length }, partition: { baselineUASkus: all.filter(sku => baseline.has(sku)), newEngineeringSkus: newEngineering, newMepaOutOfScopeSkus: newMepa }, engineeringRecoveries: newEngineering.map(row), mepaOutOfScopeRecoveries: newMepa.map(row), limitations: ['This verifies public source completeness. Exact images, titles, technical fields and import readiness still require the normal quality gates.', 'Historical and shared-cache records were source seeds only; all final product identities were obtained from the public product/data API.', 'With --reuse-cache, product identity/currentness is a cached snapshot; a matching current count alone does not prove every cached identity is still current. Use default fresh requests for a current-source claim.', 'MEPA1896* is a separate sanitary assortment, retained as source evidence outside the REHAU engineering import scope.'] };
  await fs.mkdir(path.dirname(config.output), { recursive: true });
  await fs.writeFile(config.output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, invariants, output: relative(config.output), sha256: sha256(await fs.readFile(config.output)) }));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCompleteness().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
