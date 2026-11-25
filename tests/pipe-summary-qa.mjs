import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadCatalogRuntime, PROJECT_ROOT } from '../scripts/catalog-db-utils.mjs';

const runtime = loadCatalogRuntime();
const document = { addEventListener() {}, querySelectorAll: () => [] };
vm.runInNewContext(fs.readFileSync(path.join(PROJECT_ROOT, 'catalog-ui.js'), 'utf8'), {
  window: runtime, document, console, URL, URLSearchParams, Intl,
  location: { search: '', pathname: '/', href: 'https://sofievka.vercel.app/', origin: 'https://sofievka.vercel.app' },
  requestAnimationFrame: callback => callback(), setTimeout
}, { filename: 'catalog-ui.js' });
await runtime.sofievkaCatalogUIReady;

const { productCardAttributes, renderProductCard } = runtime.sofievkaCatalogUI;
const { keySpecs } = runtime.sofievkaPdp;
const plain = value => JSON.parse(JSON.stringify(value));
const numberLabel = value => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 4 }).format(value);
const pipe = {
  id: 'confirmed-pipe', sku: 'TEST-PIPE', slug: 'confirmed-pipe', brand: 'Valrom', brandId: 'valrom',
  title: 'Труба', primaryCategoryId: 'internal-sewer-pipes',
  normalizedAttributes: { pipeDiameterMm: 110, pipeLengthMm: 1000, material: 'PP' }
};
assert.deepEqual(plain(productCardAttributes(pipe)), [
  ['Діаметр труби', '110 мм'], ['Довжина труби', `${numberLabel(1000)} мм`], ['Матеріал', 'PP']
]);
assert.deepEqual(plain(keySpecs(pipe)).map(({ id, value }) => [id, value]), [
  ['pipeDiameterMm', '110 мм'], ['pipeLengthMm', `${numberLabel(1000)} мм`], ['material', 'PP']
]);
assert.equal(keySpecs(pipe)[0].label, 'Зовнішній діаметр труби, мм');
assert.equal(keySpecs(pipe)[1].label, 'Довжина труби, мм');

const fitting = {
  ...pipe, primaryCategoryId: 'internal-sewer-fittings',
  normalizedAttributes: { pipeDiameterMm: 110, angleDegrees: 45, material: 'PP', connection: 'Розтрубне' }
};
assert.deepEqual(plain(productCardAttributes(fitting)), [
  ['Діаметр труби', '110 мм'], ['Кут', '45 °'], ['Підключення', 'Розтрубне']
]);
assert.deepEqual(plain(keySpecs(fitting)).map(({ id }) => id), ['pipeDiameterMm', 'angleDegrees', 'connection', 'material']);
assert.equal(productCardAttributes(fitting, 1).length, 1);
assert.equal(keySpecs(fitting, 2).length, 2);
const standard = renderProductCard(fitting);
const compact = renderProductCard(fitting, { variant: 'compact' });
assert.equal((standard.match(/<dt>/g) || []).length, 3, 'standard cards retain their three-field limit');
assert.equal((compact.match(/<dt>/g) || []).length, 2, 'compact cards retain their two-field limit');
assert.ok(standard.includes('110 мм') && standard.includes('45 °'));
assert.ok(!standard.includes('Характеристики уточнюються'));

for (const category of [
  'internal-sewer-pipes', 'internal-sewer-fittings', 'external-sewer-pipes', 'external-sewer-fittings',
  'drainage-pipes', 'sewer-installation-components', 'pipe-fittings', 'inspection-chambers', 'future-pipe-category'
]) {
  const product = { ...pipe, primaryCategoryId: category, normalizedAttributes: { pipeDiameterMm: 110 } };
  assert.deepEqual(plain(productCardAttributes(product)), [['Діаметр труби', '110 мм']], category);
  assert.equal(keySpecs(product)[0]?.id, 'pipeDiameterMm', category);
}

for (const attributes of [{}, { pipeDiameterMm: null, pipeLengthMm: '', angleDegrees: undefined }]) {
  const missing = { ...pipe, title: 'Труба 110 × 1000 мм, 45°', normalizedAttributes: attributes };
  assert.deepEqual(plain(productCardAttributes(missing)), [], 'unconfirmed dimensions are not inferred from titles');
  assert.deepEqual(plain(keySpecs(missing)), []);
  assert.ok(renderProductCard(missing).includes('Характеристики уточнюються'));
}
assert.deepEqual(plain(productCardAttributes({ ...fitting, normalizedAttributes: { angleDegrees: 0 } })), [['Кут', '0 °']]);

const pump = {
  ...pipe, primaryCategoryId: 'circulation-pumps',
  normalizedAttributes: { headM: 6, flowM3h: 3, mountingLengthMm: 180, connection: '1″', powerKw: 0.045 }
};
assert.deepEqual(plain(productCardAttributes(pump)), [['Макс. напір', '6 м'], ['Подача', '3 м³/год'], ['Монтажна довжина', '180 мм']]);
assert.deepEqual(plain(keySpecs(pump)).map(({ id }) => id), ['headM', 'flowM3h', 'mountingLengthMm', 'connection', 'powerKw']);
const boiler = {
  ...pipe, primaryCategoryId: 'gas-boilers',
  normalizedAttributes: { heatOutputKw: 24, type: 'Конденсаційний', dhwFlowLMin: 13, efficiencyPercent: 108 }
};
assert.deepEqual(plain(productCardAttributes(boiler)), [
  ['Теплова потужність', '24 кВт'], ['Тип', 'Конденсаційний'], ['Продуктивність ГВП', '13 л/хв']
]);
assert.deepEqual(plain(keySpecs(boiler)).map(({ id }) => id), ['heatOutputKw', 'type', 'dhwFlowLMin', 'efficiencyPercent']);

console.log(JSON.stringify({ status: 'PASS', confirmedPipe: [110, 1000], angleDegrees: 45, categories: 9, cardLimits: [3, 2], missingValues: 'PASS', legacyPumpAndBoiler: 'PASS' }));
