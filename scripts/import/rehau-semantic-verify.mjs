#!/usr/bin/env node
// Offline regression checks derived from the independently audited manufacturer
// evidence, rather than the collector's classification or normalization code.
// node scripts/import/rehau-semantic-verify.mjs [batch.json] --self-test
// node scripts/import/rehau-semantic-verify.mjs --self-test-only (no import batch needed)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultBatch = 'imports/rehau-2026-11-25.json';
const defaultAudit = 'tests/fixtures/rehau-semantic-source-audit.json';
const defaultReport = 'imports/rehau-semantic-regression.json';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
const sourceTitle = p => p.sourceEvidence?.sourceTitle ?? '';
const features = p => p.sourceEvidence?.sourceEtim?.features ?? [];
const has = (p, key) => Object.hasOwn(p.filters ?? {}, key);
const titleIs = (p, pattern) => pattern.test(normalize(p?.title));
const pipeClasses = new Set([
  'Kunststoffrohr glatt', 'Mehrschichtrohr glatt', 'Vorisoliertes Kunststoffrohr',
  'Kunststoffrohr gerippt', 'Drainage-/Infiltrationsrohr', 'Schutzrohr für Kunststoff-Rohrsystem'
]);
const knownNonpipeClasses = new Set(['Klebeband', 'Randisolation Bodenheizung', 'Tragschale']);
const rootKnownSkus = [
  '11072421001', '11072431001', '12165931001', '11040221001',
  '10009331001', '10012631001', '11036861002', '12002961001', '14570011001',
  '11002551001', '11002591001', '11002761001', '11002781001',
  '11051621001', '12036091001'
];
// Independently read exact-SKU PDF rows, not expectations copied from the adapter.
const numericSourceFacts = [
  { sku: '11720211999', key: 'pipeDiameterMm', expected: 1000, raw: '1.000 mm', proof: 'Exact ETIM OD1.000mm;10721213p45 exactSKU Typ1000/hostDN-OD900–1400, separately branchDN160' },
  { sku: '14030781001', key: 'weightKg', expected: 2, raw: '2.000 g', proof: '10721213p216: Drehmomentschlüssel exact SKU, Gewicht2kg/St' },
  { sku: '11787501001', key: 'weightKg', expected: 1, raw: '1.000 g', proof: '10702605p32: exact SKU1000g /1kg' },
  { sku: '10014561001', key: 'weightKg', expected: 3.905, raw: '3,905 kg', proof: '10722250p31: exact SKU row3,905kg/St' },
  { sku: '10401151120', key: 'pipeDiameterMm', expected: 10.1, raw: '10,1 mm', proof: 'Exact manufacturer variant title RAUTHERM NEO-X5 10,1x1,1 Bund120m' },
  { sku: '10401151120', key: 'pipeWallThicknessMm', expected: 1.1, raw: '1,1 mm', proof: 'Exact variant title and ETIM Wandstärke1,1mm' },
  { sku: '10401151120', key: 'pipeLengthMm', expected: 120000, raw: '120 m', proof: 'Exact manufacturer supply variant Bund120m' }
];

// These policies and contact blocks were actually observed in public copy.
// Safety directions mentioning a doctor / poison centre are deliberately allowed.
const publicRisks = [
  ['manufacturer-no-return-policy-in-public-copy', /поверненню\s+не\s+підляга[єю]|обмін\w*\s+(?:і|та)\s+повернен\w*\s+виключен/iu],
  ['manufacturer-leadtime-in-public-copy', /термін\w*\s+поставки/iu],
  ['manufacturer-price-request-in-public-copy', /цін[аи]\s*(?:—|-|–|:)?.{0,8}\s+за\s+запитом|ціни\s*(?:—|-|–|:)?.{0,8}\s+за\s+запитом/iu],
  ['sds-company-contacts-in-public-copy', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+(?:49|41)\s*\d|Відповідальна\s+особа\s+в\s+ЄС/iu]
];

function publicStrings(p) {
  const result = [];
  const walk = (value, field) => {
    if (typeof value === 'string') result.push({ field, value });
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${field}[${i}]`));
    else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => walk(v, `${field}.${k}`));
    }
  };
  for (const key of ['title', 'shortDescription', 'description', 'sections', 'characteristics', 'seoTitle', 'seoDescription']) {
    walk(p[key], key);
  }
  return result;
}

function exactSourceQuantity(raw) {
  const match = normalize(raw).match(/^(\d+(?:[.,]\d+)*)\s*(mm|cm|m|kg|g|мм|см|м|кг|г)$/iu);
  if (!match) return null;
  const unit = match[2].toLowerCase().replace('мм', 'mm').replace('см', 'cm').replace('кг', 'kg').replace('м', 'm').replace('г', 'g');
  let text = match[1];
  if (text.includes(',')) {
    // German comma decimals; grouping dots are distinct from the decimal comma.
    if (!/^\d+(?:\.\d{3})*,\d+$/u.test(text)) return null;
    text = text.replaceAll('.', '').replace(',', '.');
  } else if (['mm', 'g'].includes(unit) && /^[1-9]\d{0,2}(?:\.\d{3})+$/u.test(text)) {
    // Proven by exact catalogue rows:1.000mm=1000mm;2.000g=2kg.
    text = text.replaceAll('.', '');
  } else if (!/^\d+(?:\.\d+)?$/u.test(text)) return null;
  // Do not blindly apply that rule to metres:12228551001 is4.825m,
  // independently confirmed by English catalogue10604059p15.
  return { value: Number(text), unit };
}

function explicitLengthMm(raw) {
  const quantity = exactSourceQuantity(raw);
  const multiplier = { mm: 1, cm: 10, m: 1000 }[quantity?.unit];
  return multiplier ? quantity.value * multiplier : null;
}

export function evaluateSemanticRegression(products, audit, { requireCoverage = true } = {}) {
  const bySku = new Map();
  const unresolved = [];
  const checks = [];
  const issueKeys = new Set();
  const addIssue = (code, p, message, evidence = {}) => {
    const sku = p?.sku ?? evidence.sku;
    const key = `${code}/${sku}/${evidence.field ?? ''}/${message}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    unresolved.push({ code, sku, message, sourceUrl: p?.sourceUrl, sourceTitle: sourceTitle(p ?? {}), ...evidence });
  };
  const check = (code, p, condition, message, evidence = {}) => {
    if (!p) return;
    checks.push({ code, sku: p.sku, pass: Boolean(condition) });
    if (!condition) addIssue(code, p, message, evidence);
  };
  for (const p of products) {
    if (bySku.has(p.sku)) addIssue('duplicate-sku', p, 'A SKU occurs more than once in the batch.');
    bySku.set(p.sku, p);
  }
  const audited = new Set(audit.findings.flatMap(f => f.affectedSkus));
  if (requireCoverage) {
    for (const sku of audited) {
      if (!bySku.has(sku)) addIssue('audited-product-missing', null, 'Audited SKU is absent; provide an explicit supported exclusion before release.', { sku });
    }
    for (const sku of rootKnownSkus) {
      if (!bySku.has(sku)) addIssue('root-known-product-missing', null, 'A source-proven root regression SKU is absent; provide an explicit supported exclusion before release.', { sku });
    }
  }
  const group = id => (audit.findings.find(f => f.id === id)?.affectedSkus ?? []).map(s => bySku.get(s)).filter(Boolean);
  const noWrongPipeLength = (code, p) => check(code, p,
    !has(p, 'pipeLengthMm') && !(p.characteristics ?? []).some(c => /^Довжина труби$/iu.test(c.label)),
    'A proven nonpipe product still exposes a pipe-length filter or derived pipe-length characteristic.',
    { observedFilter: p.filters?.pipeLengthMm, observedRows: (p.characteristics ?? []).filter(c => /Довжина труби/iu.test(c.label)) });

  for (const p of group('nonpipe-length-mapped-as-pipe-mm')) {
    noWrongPipeLength('nonpipe-length-mapped-as-pipe-mm', p);
    const actual = (p.characteristics ?? []).some(c => /^Довжина$/iu.test(c.label) && /^25\s*м$/iu.test(normalize(c.value)));
    check('nonpipe-length-mapped-as-pipe-mm', p, actual,
      'The exact ETIM length25m should remain a general product length in its real unit.', { expected: 'Довжина:25 м' });
  }
  for (const p of group('wc-waste-connections-routed-as-pressure-pipes')) {
    check('wc-waste-connections-routed-as-pressure-pipes', p, p.category === 'internal-sewer-fittings',
      'Exact Ukrainian catalogue10714882p89 identifies a WC internal-sewer connection.', { category: p.category, expected: 'internal-sewer-fittings' });
    noWrongPipeLength('wc-waste-connections-routed-as-pressure-pipes', p);
  }
  for (const p of group('wall-sleeve-routed-as-pressure-pipe')) {
    check('wall-sleeve-routed-as-pressure-pipe', p,
      p.category !== 'water-heating-pipes' && !titleIs(p, /^Труба\s/iu),
      'The exact source identifies a waterproof wall sleeve with adhesive flange, not a water/heating pipe.', { category: p.category, title: p.title });
    noWrongPipeLength('wall-sleeve-routed-as-pressure-pipe', p);
  }
  for (const p of group('pipe-clips-rewritten-as-pipes')) {
    check('pipe-clips-rewritten-as-pipes', p,
      p.category === 'pipe-installation-components' && titleIs(p, /^Кліпса(?:\s|$)/iu) && !titleIs(p, /^Труба\s/iu),
      'The source identifies a fixing clip (Rohrschelle), not a pipe.', { category: p.category, title: p.title });
    noWrongPipeLength('pipe-clips-rewritten-as-pipes', p);
  }
  for (const p of group('bkt-heating-modules-routed-as-generic-components')) {
    check('bkt-heating-modules-routed-as-generic-components', p,
      p.category === 'underfloor-heating' && !titleIs(p, /^(?:Муфта|Фітинг|Монтажна комплектуюча)\s/iu) && /BKT|модуль/iu.test(p.title),
      'The exact Rohrmatte source is a BKT heating/cooling pipe module, not its coupling or a generic pipe component.', { category: p.category, title: p.title });
  }
  for (const p of group('rainwater-geotextiles-routed-as-surface-heating')) {
    check('rainwater-geotextiles-routed-as-surface-heating', p,
      p.category === 'stormwater-infiltration-components' && !/поверхневого опалення/iu.test(p.title),
      'The exact RAUMAT source application is rainwater management.', { category: p.category, title: p.title });
  }
  for (const p of group('tools-routed-as-fittings-or-components')) {
    check('tools-routed-as-fittings-or-components', p,
      p.category === 'pipe-installation-tools' && !titleIs(p, /^(?:Фітинг|Монтажна комплектуюча)\s/iu),
      'The exact source identifies an actual tool.', { category: p.category, title: p.title });
  }
  for (const p of group('ra-uplen-pipe-rewritten-as-supplied-coupling')) {
    check('ra-uplen-pipe-rewritten-as-supplied-coupling', p, titleIs(p, /^Труба\s/iu),
      'The exact ribbed6m RAUPLEN pipe must not be rewritten as the supplied double coupling.', { title: p.title });
  }
  for (const p of group('without-coupling-title-conflicts-with-family-description')) {
    check('without-coupling-title-conflicts-with-family-description', p,
      !titleIs(p, /^Муфта\s/iu) && /BKT|модуль/iu.test(p.title) && /без/iu.test(p.title),
      'The exact source title is a BKT module WITHOUT quick coupling/blind plug, not a coupling.', { title: p.title });
    const badLines = publicStrings(p).flatMap(({ field, value }) => value.split(/\r?\n/u).map(value => ({ field, value }))).filter(({ value }) =>
      /(?:швидкорознім\S*\s+муфт|Schnellkupplung).*(?:заглуш|Blindstopfen).*(?:приєднан|підключен|angeschlossen)/iu.test(value)
      && !/без\s+швидкорознім|без\s+(?:муфти|швидкорознімної)|ohne\s+Schnellkuppl/iu.test(value));
    check('without-coupling-title-conflicts-with-family-description', p, badLines.length === 0,
      'Public copy still asserts the coupling and plug are included despite the exact variant exclusion.', { conflicts: badLines.map(({ field, value }) => ({ field, value: value.slice(0, 1200) })) });
  }
  for (const p of group('cast-covers-rewritten-as-complete-chambers')) {
    check('cast-covers-rewritten-as-complete-chambers', p,
      titleIs(p, /^(?:Чавунна\s+)?(?:Кришка|Люк)\s/iu) && !titleIs(p, /^Колодязь\s/iu),
      'Exact Gussabdeckung / Kanaldeckel mit Rahmen identifies a cast cover/frame, not a complete chamber.', { title: p.title });
  }
  for (const p of group('dewpoint-controller-routed-as-installation-component')) {
    check('dewpoint-controller-routed-as-installation-component', p,
      p.category === 'heating-sensors-modules' && titleIs(p, /^Контролер\s+точки\s+роси/iu),
      'Exact TPW24VAC source identifies a dewpoint control device.', { category: p.category, title: p.title });
    if (has(p, 'voltage')) check('dewpoint-controller-routed-as-installation-component', p,
      /^24\s*В(?:\s*AC)?$/iu.test(normalize(p.filters.voltage)), 'The exact TPW supply voltage is24VAC.', { value: p.filters.voltage });
    check('dewpoint-controller-routed-as-installation-component', p,
      publicStrings(p).some(({ value }) => /IP\s*40/iu.test(value)), 'Preserve the exact published IP40 characteristic.');
  }

  // Original root findings, checked from the source concepts and exact variants.
  for (const sku of ['11072421001', '11072431001']) {
    const p = bySku.get(sku);
    check('root-house-entry', p, p?.category !== 'water-heating-pipes' && titleIs(p, /^(?:Будинкове введення|Будинковий ввід|Домовий ввід)/iu),
      'The exact source is a RAUVITHERM house entry assembly, not a pipe.', { category: p?.category, title: p?.title });
    if (p) noWrongPipeLength('root-house-entry', p);
  }
  const valve = bySku.get('12165931001');
  check('root-valve-kit-not-sensor', valve, valve?.category === 'shutoff-valves' && titleIs(valve, /^Комплект\s+кульових\s+кранів/iu),
    'Two ball valves with a sensor connection are not a sensor.', { category: valve?.category, title: valve?.title });
  const uncoiler = bySku.get('11040221001');
  check('root-uncoiler-tool', uncoiler, uncoiler?.category === 'pipe-installation-tools' && titleIs(uncoiler, /^Розмотувач\s/iu),
    'The exact Abrollvorrichtung source identifies an uncoiling tool.', { category: uncoiler?.category, title: uncoiler?.title });
  for (const [sku, concept] of [
    ['10009331001', /^Монтажний\s+набір/iu],
    ['10012631001', /^Коліно\s/iu],
    ['11036861002', /^Бетонна\s+накривна\s+плита/iu],
    ['12002961001', /^Системна\s+основа.*регулятор/iu],
    ['14570011001', /^Датчик\s+води/iu]
  ]) {
    const p = bySku.get(sku);
    check('root-exact-title-concept', p, titleIs(p ?? {}, concept),
      'The exact source product concept must survive title normalization.', { title: p?.title });
    if (p) {
      const tokens = normalize(p.title).toLocaleLowerCase('uk').split(/[^\p{L}\p{N}.]+/u).filter(Boolean);
      const repeated = tokens.some((token, i) => token.length > 2 && token === tokens[i + 1]);
      check('root-duplicate-title-token', p, !repeated, 'A repeated adjacent word remains in this audited title.', { title: p.title });
    }
  }

  let numericLengthChecks = 0;
  let numericFactChecks = 0;
  let outletSourceChecks = 0;
  let angleSourceChecks = 0;
  const perGroupCoverage = {};
  for (const f of audit.findings) perGroupCoverage[f.id] = {
    audited: f.affectedSkus.length, present: f.affectedSkus.filter(sku => bySku.has(sku)).length
  };
  for (const fact of numericSourceFacts) {
    const p = bySku.get(fact.sku);
    if (!p) continue;
    numericFactChecks++;
    check('source-verified-numeric-locale', p,
      has(p, fact.key) && Math.abs(Number(p.filters[fact.key]) - fact.expected) < 0.00001,
      'The numeric filter disagrees with an independently verified exact-SKU source quantity.',
      { field: fact.key, value: p.filters?.[fact.key], expected: fact.expected, raw: fact.raw, proof: fact.proof });
  }
  for (const [sku, expectedMm] of [['12228551001', 4825], ['12228561001', 4800]]) {
    const p = bySku.get(sku);
    if (!p) continue;
    const row = (p.characteristics ?? []).find(c => c.label === 'Довжина');
    numericFactChecks++;
    check('source-verified-metres-decimal-exception', p,
      explicitLengthMm(row?.value) === expectedMm && !has(p, 'pipeLengthMm'),
      'The support-channel length is a decimal metre quantity, not thousands of metres or a pipe-length filter.',
      { field: 'characteristics.Довжина', value: row?.value, expectedMm, proof: 'English10604059p15: exactSKU4.825m/4.8m; suitable for5m pipe-bar' });
  }
  const centimetres = bySku.get('12080201222');
  if (centimetres) {
    const row = (centimetres.characteristics ?? []).find(c => c.label === 'Ширина');
    numericFactChecks++;
    check('source-verified-centimetre-unit', centimetres, explicitLengthMm(row?.value) === 1050,
      'The exact oBKT ETIM width105cm must remain equivalent to1050mm; width must not become pipe length.',
      { field: 'characteristics.Ширина', value: row?.value, expectedMm: 1050, proof: 'ExactSKU12080201222 ETIM Breite105cm' });
  }
  for (const p of products) {
    const cls = p.sourceEvidence?.sourceEtim?.class?.name;
    if (knownNonpipeClasses.has(cls) && has(p, 'pipeLengthMm')) {
      check('source-proved-nonpipe-length', p, false, 'ETIM identifies tape, edge insulation or support channel; its body length is not pipeLengthMm.', { class: cls, value: p.filters.pipeLengthMm });
    }
    if (pipeClasses.has(cls) && has(p, 'pipeLengthMm')) {
      const rawLength = features(p).find(f => f.name === 'Länge')?.value;
      const expected = explicitLengthMm(rawLength);
      // An exact title supply length can legitimately supersede rounded ETIM.
      const provenance = p.sourceEvidence?.normalizedFilterSources?.pipeLengthMm;
      if (expected !== null && provenance?.source === 'ETIM exact SKU') {
        numericLengthChecks++;
        check('source-explicit-pipe-length-unit', p, Math.abs(Number(p.filters.pipeLengthMm) - expected) < 0.00001,
          'Pipe length must equal the explicit manufacturer quantity converted to mm.', { sourceRaw: rawLength, expectedMm: expected, value: p.filters.pipeLengthMm });
      }
    }
    const explicitAngle = sourceTitle(p).match(/87[,.]5\s*°/u);
    if (explicitAngle) {
      angleSourceChecks++;
      check('root-exact-angle-not-rounded-etim', p, Number(p.filters?.angleDegrees) === 87.5,
        'The exact source title states87.5degrees; rounded ETIM87 must not override it.', { value: p.filters?.angleDegrees, expected: 87.5 });
    }
    if (p.category === 'distribution-manifolds') {
      const titled = sourceTitle(p).match(/\b(\d+)\s+(?:Kreise|контур(?:ів|и)?)(?=\s|$|[,;)])/iu);
      const sourceCount = features(p).find(f => /^(?:Anzahl der Heizkreise|Anzahl Heizkreise)$/u.test(f.name))?.value;
      const rawCount = titled?.[1] ?? (/^\d+$/u.test(normalize(sourceCount)) ? normalize(sourceCount) : null);
      if (rawCount !== null) {
        outletSourceChecks++;
        check('root-manifold-outlets-select-string', p,
          typeof p.filters?.outlets === 'string' && p.filters.outlets === String(Number(rawCount)),
          'An exact published circuit count must survive as the select-string outlets value.', { sourceRaw: sourceCount ?? titled?.[0], expected: String(Number(rawCount)), value: p.filters?.outlets });
      }
    }
    for (const [code, pattern] of publicRisks) {
      const matches = publicStrings(p).filter(({ value }) => pattern.test(value));
      checks.push({ code, sku: p.sku, pass: matches.length === 0 });
      if (matches.length) addIssue(code, p, 'Manufacturer policy/price/leadtime or company contact remains in public copy.', {
        matches: matches.slice(0, 8).map(({ field, value }) => {
          const lines = value.split(/\r?\n/u).filter(line => pattern.test(line));
          return { field, text: (lines.join('\n') || value).slice(0, 1200) };
        })
      });
    }
  }
  for (const [sku, expected] of [['11051621001', '230 В'], ['12036091001', '230 В']]) {
    const p = bySku.get(sku);
    check('verified-charger-input-voltage', p, p?.filters?.voltage === expected,
      'The exact charger Nennspannung is230V; battery charging voltage is a separate output value.', { value: p?.filters?.voltage, expected });
  }
  return {
    pass: unresolved.length === 0,
    products: products.length,
    auditedSkuCoverage: { expected: audited.size, present: [...audited].filter(s => bySku.has(s)).length },
    rootKnownSkuCoverage: { expected: rootKnownSkus.length, present: rootKnownSkus.filter(s => bySku.has(s)).length },
    perGroupCoverage,
    checkCount: checks.length,
    explicitSourceChecks: { numericLengthChecks, numericFactChecks, outletSourceChecks, angleSourceChecks },
    unresolvedCount: unresolved.length,
    unresolvedSkuCount: new Set(unresolved.map(x => x.sku)).size,
    unresolvedCountsByCode: Object.fromEntries([...new Set(unresolved.map(x => x.code))].sort().map(code => [code, unresolved.filter(x => x.code === code).length])),
    unresolved,
    limitations: [
      'Offline targeted source-evidence regression, not independent manual reinspection of all manufacturer documents.',
      'Does not invent unpublished channels/zones or demand filters for parameters the manufacturer does not publish.',
      'Does not reject a chamber-category leaf that explicitly includes chamber components, provided the product head correctly identifies a cover.',
      'Original audit and source raw fields are never treated as public copy.'
    ]
  };
}

function selfTest(audit) {
  const empty = { sku: '11040471001', title: 'Фіксувальна стрічка REHAU 25 м', category: 'underfloor-heating', filters: {}, characteristics: [{ label: 'Довжина', value: '25 м' }], description: '', sourceEvidence: {} };
  const evaluate = p => evaluateSemanticRegression([p], audit, { requireCoverage: false });
  const contains = (result, code) => result.unresolved.some(x => x.code === code);
  assert(!contains(evaluate(empty), 'nonpipe-length-mapped-as-pipe-mm'));
  assert(contains(evaluate({ ...empty, filters: { pipeLengthMm: 25 } }), 'nonpipe-length-mapped-as-pipe-mm'));
  const pipe = { ...empty, sku: 'unit-source-fixture', filters: { pipeLengthMm: 25000 }, sourceEvidence: { sourceEtim: { class: { name: 'Kunststoffrohr glatt' }, features: [{ name: 'Länge', value: '25 m' }] }, normalizedFilterSources: { pipeLengthMm: { source: 'ETIM exact SKU' } } } };
  assert(!contains(evaluate(pipe), 'source-explicit-pipe-length-unit'));
  assert(contains(evaluate({ ...pipe, filters: { pipeLengthMm: 25 } }), 'source-explicit-pipe-length-unit'));
  const safe = { ...empty, sku: 'policy-fixture', description: 'P310 Негайно звернутися до ТОКСИКОЛОГІЧНОГО ЦЕНТРУ / лікаря.' };
  assert(!publicRisks.some(([code]) => contains(evaluate(safe), code)));
  for (const [code, text] of [
    ['manufacturer-no-return-policy-in-public-copy', 'поверненню не підлягає'],
    ['manufacturer-leadtime-in-public-copy', 'Термін поставки — за запитом'],
    ['manufacturer-price-request-in-public-copy', 'ціни — за запитом'],
    ['sds-company-contacts-in-public-copy', 'ehs@vandex.com']
  ]) {
    assert(contains(evaluate({ ...safe, sections: [{ title: 'Інформація', paragraphs: [text] }] }), code));
    assert(!contains(evaluate({ ...safe, sourceEvidence: { rawDescription: text } }), code));
  }
  const kit = { ...empty, sku: '12889291002', title: 'Модуль BKT REHAU без швидкорознімної муфти та заглушки', category: 'underfloor-heating', description: 'Без швидкорознімної муфти та заглушки.' };
  assert(!contains(evaluate(kit), 'without-coupling-title-conflicts-with-family-description'));
  assert(contains(evaluate({ ...kit, description: 'Швидкорознімна муфта NP7.2 та глуха заглушка приєднані на кінці.' }), 'without-coupling-title-conflicts-with-family-description'));
  const manifold = { ...empty, sku: 'outlet-source-fixture', title: 'Колектор REHAU', category: 'distribution-manifolds', filters: { outlets: '6' }, sourceEvidence: { sourceTitle: 'HKV-D 6 Kreise' } };
  assert(!contains(evaluate(manifold), 'root-manifold-outlets-select-string'));
  assert(contains(evaluate({ ...manifold, filters: { outlets: 6 } }), 'root-manifold-outlets-select-string'));
  assert(contains(evaluate({ ...manifold, filters: {} }), 'root-manifold-outlets-select-string'));
  // Actual source cases protect grouping, comma decimals and a proven dot-decimal
  // metre exception. No import of, or assertion against, the main parser.
  assert.equal(explicitLengthMm('1.000 mm'), 1000); //11720211999
  assert.equal(exactSourceQuantity('2.000 g').value / 1000, 2); //14030781001
  assert.equal(exactSourceQuantity('3,905 kg').value, 3.905); //10014561001
  assert.equal(explicitLengthMm('10,1 mm'), 10.1); //10401151120
  assert.equal(explicitLengthMm('1,1 mm'), 1.1); //10401151120
  assert.equal(explicitLengthMm('120 m'), 120000); //10401151120
  assert.equal(explicitLengthMm('105 cm'), 1050); //12080201222
  assert.equal(explicitLengthMm('4.825 m'), 4825); //12228551001
  assert.equal(explicitLengthMm('4.800 м'), 4800); //12228561001
  const groupedMm = { ...empty, sku: '11720211999', filters: { pipeDiameterMm: 1000 } };
  assert(!contains(evaluate(groupedMm), 'source-verified-numeric-locale'));
  assert(contains(evaluate({ ...groupedMm, filters: { pipeDiameterMm: 1 } }), 'source-verified-numeric-locale'));
  const groupedGrams = { ...empty, sku: '14030781001', filters: { weightKg: 2 } };
  assert(!contains(evaluate(groupedGrams), 'source-verified-numeric-locale'));
  assert(contains(evaluate({ ...groupedGrams, filters: { weightKg: 0.002 } }), 'source-verified-numeric-locale'));
  const decimalKg = { ...empty, sku: '10014561001', filters: { weightKg: 3.905 } };
  assert(!contains(evaluate(decimalKg), 'source-verified-numeric-locale'));
  assert(contains(evaluate({ ...decimalKg, filters: { weightKg: 3905 } }), 'source-verified-numeric-locale'));
  const metreException = { ...empty, sku: '12228551001', characteristics: [{ label: 'Довжина', value: '4.825 м' }] };
  assert(!contains(evaluate(metreException), 'source-verified-metres-decimal-exception'));
  assert(contains(evaluate({ ...metreException, characteristics: [{ label: 'Довжина', value: '4825 м' }] }), 'source-verified-metres-decimal-exception'));
  const naturalHouseEntry = { ...empty, sku: '11072421001', title: 'Будинковий ввід REHAU RAUVITHERM для труб', category: 'district-heating-components', characteristics: [] };
  assert(!contains(evaluate(naturalHouseEntry), 'root-house-entry'));
  return { pass: true, cases: 36 };
}

async function main() {
  const args = process.argv.slice(2);
  const batchArg = args.find(x => !x.startsWith('--')) ?? defaultBatch;
  const auditArg = args.find(x => x.startsWith('--audit='))?.slice(8) ?? defaultAudit;
  const reportArg = args.find(x => x.startsWith('--report='))?.slice(9) ?? defaultReport;
  if (args.includes('--self-test-only')) {
    const auditBytes = await readFile(path.resolve(root, auditArg));
    const audit = JSON.parse(auditBytes);
    assert.equal(audit.findings.length, 15, 'Expected the complete frozen15-group semantic audit.');
    assert.equal(new Set(audit.findings.flatMap(f => f.affectedSkus)).size, 637);
    console.log(JSON.stringify({ audit: auditArg, auditSha256: sha256(auditBytes), auditSnapshotSha256: audit.snapshotSha256, selfTest: selfTest(audit) }));
    return;
  }
  const [batchBytes, auditBytes] = await Promise.all([
    readFile(path.resolve(root, batchArg)), readFile(path.resolve(root, auditArg))
  ]);
  const batch = JSON.parse(batchBytes);
  const audit = JSON.parse(auditBytes);
  assert(Array.isArray(batch.products), 'Batch products must be an array.');
  assert.equal(audit.findings.length, 15, 'Expected the complete frozen15-group semantic audit.');
  const result = evaluateSemanticRegression(batch.products, audit);
  const report = {
    schemaVersion: 1,
    kind: 'offline-targeted-rehau-semantic-regression',
    batchPath: batchArg,
    batchSha256: sha256(batchBytes),
    batchBytes: batchBytes.length,
    auditPath: auditArg,
    auditSha256: sha256(auditBytes),
    auditSnapshotSha256: audit.snapshotSha256,
    selfTest: args.includes('--self-test') ? selfTest(audit) : null,
    ...result
  };
  await writeFile(path.resolve(root, reportArg), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ report: reportArg, batchSha256: report.batchSha256, products: report.products, pass: report.pass, checks: report.checkCount, auditedSkuCoverage: report.auditedSkuCoverage, sourceChecks: report.explicitSourceChecks, selfTest: report.selfTest, unresolvedCountsByCode: report.unresolvedCountsByCode }));
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
