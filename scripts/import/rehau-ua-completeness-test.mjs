import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCompleteness, extractSearchSkus, sourceKeywords, runCompleteness } from './rehau-ua-completeness.mjs';

const p = (itemNumber, productId) => ({ itemNumber, productId, resolved: true });
const products = [p('12394721900', 'official-id-a'), p('14488981900', 'official-id-b')];
assert.deepEqual(assertCompleteness({ target: 2, products }), { resolvedUniqueSkus: 2, uniqueProductIds: 2, target: 2 });
assert.deepEqual(assertCompleteness({ target: 1, products: products.slice(0, 1) }), { resolvedUniqueSkus: 1, uniqueProductIds: 1, target: 1 });
assert.throws(() => assertCompleteness({ target: 3, products }), /partition incomplete/);
assert.throws(() => assertCompleteness({ target: 1, products }), /partition incomplete/);
assert.throws(() => assertCompleteness({ target: 2, metadataAfter: 3, products }), /metadata changed/);
assert.throws(() => assertCompleteness({ target: 2, products: [products[0], products[0]] }), /Duplicate SKU/);
assert.throws(() => assertCompleteness({ target: 2, products: [products[0], p('14488981900', 'official-id-a')] }), /Duplicate internal productId/);
assert.throws(() => assertCompleteness({ target: 2, products: [products[0], { ...products[1], resolved: false }] }), /resolved official SKU/);
assert.throws(() => assertCompleteness({ target: 2, products, unqueriedVariants: ['13185541001'] }), /Variant closure incomplete/);
assert.throws(() => assertCompleteness({ target: '2', products }), /Invalid live portal/);

const keywords = sourceKeywords([{ queries: [{ name: 'base-info', baseInfo: { shortText: 'Рулетка REHAU', model: 'Труба INSULPEX UNO SDR 7,4' } }] }]);
assert.ok(keywords.includes('рулетка') && keywords.includes('труба') && keywords.includes('INSULPEX') && keywords.includes('SDR'));
assert.ok(!keywords.some(word => /[РС][ЂЃ‚ЉЊЋЌЏђѓљњќџ]/u.test(word)), 'UTF-8 source words must not become mojibake');
assert.deepEqual(extractSearchSkus('<span class="x oxomi-product-item-number-js y">12394721900</span><div class="oxomi-product-item-number-js">14488981900</div><span class="oxomi-product-item-number-js">12394721900</span>'), ['12394721900', '14488981900']);
assert.deepEqual(extractSearchSkus('<span>12394721900</span><span class="oxomi-product-item-number-js">placeholder</span>'), []);
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const fixture = await fs.mkdtemp(path.join(root, 'tmp/rehau-ua-completeness-test-'));
const seed = path.join(fixture, 'seed.json');
await fs.writeFile(seed, JSON.stringify({ partition: { baselineUASkus: ['90000000001'] } }));
await fs.mkdir(path.join(fixture, 'source'));
const savedFetch = globalThis.fetch, savedLog = console.log;
const names = ['base-info', 'texts', 'features', 'product-images', 'attachments', 'measurements', 'pages', 'relationships', 'variants-html'];
const titles = { '90000000001': 'Труба INSULPEX', '90000000002': 'Муфта', '90000000003': 'Рулетка' };
const span = sku => `<span class="oxomi-product-item-number-js">${sku}</span>`;
let metadataCalls = 0, publicCalls = 0, target = 3, changeMetadata = false, truncate = false;
globalThis.fetch = async url => {
  const request = new URL(url);
  assert.equal(request.origin, 'https://oxomi.com');
  publicCalls++;
  if (request.pathname.endsWith('/universal-search/search')) {
    const query = request.searchParams.get('query');
    const json = query === '' ? { success: true, metadata: { products: changeMetadata && ++metadataCalls > 1 ? target + 1 : target } } : { success: true, sections: [{ parameters: { html: query === 'INSULPEX' ? span('90000000003') : '' } }] };
    return new Response(JSON.stringify(json));
  }
  assert.ok(request.pathname.endsWith('/product/data'));
  const queryNames = request.searchParams.getAll('queries');
  assert.ok(queryNames.every(name => names.includes(name)));
  const skus = [...request.searchParams.entries()].filter(([key]) => /^itemNumber\d+$/.test(key)).map(([, sku]) => sku);
  const products = skus.map(sku => ({ resolved: true, itemNumber: sku, productId: `id-${sku}`, queries: queryNames.map(name => name === 'base-info' ? { name, baseInfo: { shortText: titles[sku], model: titles[sku] } } : name === 'variants-html' ? { name, html: sku === '90000000001' ? span('90000000002') : '' } : { name }) }));
  return new Response(JSON.stringify({ success: true, products: truncate ? products.slice(1) : products }));
};
console.log = () => {};
try {
  const args = label => [`--seed=${seed}`, `--source-cache=${path.join(fixture, 'source')}`, `--cache=${path.join(fixture, 'cache-' + label)}`, `--output=${path.join(fixture, 'report-' + label + '.json')}`];
  const report = await runCompleteness(args('complete'));
  assert.equal(report.status, 'PASS_COMPLETE_SOURCE_PARTITION');
  assert.deepEqual(report.partition.newEngineeringSkus, ['90000000001', '90000000002', '90000000003']);
  assert.equal(report.engineeringRecoveries.length, 3);
  assert.ok(report.engineeringRecoveries.every(record => record.fullProductDataPath));
  assert.ok(report.variantEdges.some(edge => edge.to === '90000000002'));
  assert.ok(report.queryEvidence.some(query => query.query === 'INSULPEX' && query.skus.includes('90000000003')));
  const callsBeforeResume = publicCalls;
  const replay = await runCompleteness([...args('complete'), '--reuse-cache']);
  assert.equal(replay.status, 'PASS_CACHED_SOURCE_PARTITION_SNAPSHOT');
  assert.equal(publicCalls - callsBeforeResume, 2, 'cached replay makes only the two fresh metadata calls');
  target = 4;
  await assert.rejects(runCompleteness(args('incomplete')), /partition incomplete/);
  assert.equal((JSON.parse(await fs.readFile(path.join(fixture, 'report-incomplete.json'), 'utf8'))).status, 'FAILED_INCOMPLETE_SOURCE_PARTITION');
  target = 3; changeMetadata = true; metadataCalls = 0;
  await assert.rejects(runCompleteness(args('metadata-changed')), /metadata changed/);
  changeMetadata = false; truncate = true;
  await assert.rejects(runCompleteness(args('truncated')), /Truncated product\/data/);
} finally { globalThis.fetch = savedFetch; console.log = savedLog; }
console.log('PASS:14 pure guard assertions; fresh word+variant closure, full engineering packets, explicit cached replay, missing-source refusal, changing-metadata refusal and truncated-response refusal. No network calls.');
