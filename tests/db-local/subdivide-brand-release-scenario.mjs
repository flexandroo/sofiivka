// Local-only integration rehearsal of exact frozen SQL split into atomic subsets.
// node tests/db-local/subdivide-brand-release-scenario.mjs [manifest.json] [chunkNumber]
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createDatabase } from './database.mjs';
import { metadataSql } from '../../scripts/import/three-brand-metadata.mjs';
import { readyPayload, publicationSql, atomicPublicationSql } from '../../scripts/import/prepare-brand-release.mjs';
import { enrichmentSql } from '../../scripts/import/brand-enrichment.mjs';
import { splitFrozenChunk, normalizeExclusionIds } from '../../scripts/import/subdivide-brand-release.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const VERSION = 'v-subdivision-rehearsal';
const SENTINEL = 'subdivision-existing-sentinel';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
const progress = data => console.log(JSON.stringify(data));
const normalizedSku = value => value.trim().toLowerCase();
const metadataKeys = ['sourceEvidence', 'series', 'priceCurrency', 'vatIncluded', 'related', 'ean'];
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const elapsed = start => Math.round(performance.now() - start);

function verifyGuards(sql) {
  assert.match(sql, /\bbegin;\s*set\s+local\s+statement_timeout\s*=\s*'45s';\s*set\s+local\s+lock_timeout\s*=\s*'5s';\s*set\s+local\s+jit\s*=\s*'?off'?;/iu,
    'transaction-local time and JIT guards occur immediately after BEGIN');
  assert.match(sql, /\ncommit;\s*$/iu, 'atomic transaction has a final COMMIT');
}

async function setupDatabase(prerequisite) {
  const db = await createDatabase();
  try {
    await db.exec(`insert into public.categories(stable_id,slug,parent_id,level,title,short_title,sort_order,status,visibility)
      values('sewerage','sewerage',null,1,'Каналізація та дренаж','Каналізація та дренаж',350,'active','catalog')
      on conflict(stable_id)do nothing;
      insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
      values('${VERSION}','local-subdivision-rehearsal',
        (select coalesce(jsonb_agg(public._taxonomy_category_release_entry(c)order by c.sort_order),'[]'::jsonb)from public.categories c where c.status='active'),
        (select coalesce(jsonb_agg(public._taxonomy_brand_release_entry(b)order by b.stable_id),'[]'::jsonb)from public.brands b where b.status='active'),
        (select coalesce(jsonb_object_agg(d.stable_id,public._attributes_release_fields(d)),'{}'::jsonb)from public.attribute_definitions d where d.status='active'),
        0,0,repeat('0',64),true);
      insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,'${VERSION}')
        on conflict(singleton)do update set snapshot_version=excluded.snapshot_version;
      insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,'${VERSION}')
        on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version,revision=0;`);
    await db.exec(metadataSql());
    await db.exec(prerequisite);
    const brand = await one(db, "select internal_id from public.brands where status='active' order by stable_id limit 1");
    const category = await one(db, `select c.internal_id from public.categories c where c.status='active' and c.visibility='catalog'
      and not exists(select 1 from public.categories child where child.parent_id=c.internal_id and child.status='active')
      order by c.stable_id limit 1`);
    await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,publication_status)
      values($1,'SUBDIVISION-SENTINEL','subdivision-existing-sentinel','Наявний контрольний товар','Наявний контрольний товар','SUBDIVISION-SENTINEL',$2,$3,2345,'known','published')`,
    [SENTINEL, brand.internal_id, category.internal_id]);
    await db.query('select public._admin_refresh_catalog(array[internal_id])from public.products where legacy_id=$1', [SENTINEL]);
    return db;
  } catch (error) { await db.close(); throw error; }
}

async function sentinel(db) {
  return one(db, `select to_jsonb(p)product,s.payload snapshot,card.card
    from public.products p
    join public.catalog_product_snapshots s on s.legacy_id=p.legacy_id and s.snapshot_version=$2
    join public.catalog_product_cards card on card.legacy_id=p.legacy_id and card.snapshot_version=$2
    where p.legacy_id=$1`, [SENTINEL, VERSION]);
}

async function counts(db, ids) {
  return one(db, `select
    (select count(*)::int from public.products where legacy_id=any($1::text[]))products,
    (select count(*)::int from public.products where legacy_id=any($1::text[])and publication_status='published')published,
    (select count(*)::int from public.product_source_records s join public.products p on p.internal_id=s.product_id where p.legacy_id=any($1::text[]))sources,
    (select count(*)::int from public.product_media m join public.products p on p.internal_id=m.product_id where p.legacy_id=any($1::text[]))media,
    (select count(*)::int from public.product_documents d join public.products p on p.internal_id=d.product_id where p.legacy_id=any($1::text[]))documents,
    (select count(*)::int from public.catalog_product_snapshots where snapshot_version=$2 and legacy_id=any($1::text[]))snapshots,
    (select count(*)::int from public.catalog_product_cards where snapshot_version=$2 and legacy_id=any($1::text[]))cards`, [ids, VERSION]);
}

// UUIDs, generated timestamps and global cache revisions differ across databases.
// Compare every product business field and relation through stable identities.
async function capture(db, ids) {
  const { rows } = await db.query(`select p.legacy_id,
      (to_jsonb(p)-array['internal_id','brand_id','primary_category_id','series_id','last_import_run_id','last_imported_at','created_at','updated_at'])
        ||jsonb_build_object('brand',brand.stable_id,'category',category.stable_id,'series',series.stable_id,'ownerSourceRef',run.source_ref)product,
      (select jsonb_agg((to_jsonb(s)-array['internal_id','product_id','supplier_id','import_run_id','first_seen_at','last_seen_at','verified_at','created_at','updated_at'])
        ||jsonb_build_object('supplier',supplier.stable_id,'ownerSourceRef',source_run.source_ref)order by supplier.stable_id,s.source_id)
        from public.product_source_records s join public.suppliers supplier on supplier.internal_id=s.supplier_id
        left join public.import_runs source_run on source_run.internal_id=s.import_run_id where s.product_id=p.internal_id)sources,
      (select coalesce(jsonb_agg(to_jsonb(m)-array['internal_id','product_id','created_at','updated_at']order by m.sort_order,m.url),'[]'::jsonb)
        from public.product_media m where m.product_id=p.internal_id)media,
      (select coalesce(jsonb_agg(to_jsonb(d)-array['internal_id','product_id','created_at','updated_at']order by d.sort_order,d.url),'[]'::jsonb)
        from public.product_documents d where d.product_id=p.internal_id)documents,
      (select coalesce(jsonb_agg((to_jsonb(v)-array['internal_id','product_id','attribute_id','option_id','created_at','updated_at'])
        ||jsonb_build_object('attribute',definition.stable_id,'option',option.value)order by definition.stable_id),'[]'::jsonb)
        from public.product_attribute_values v join public.attribute_definitions definition on definition.internal_id=v.attribute_id
        left join public.attribute_options option on option.internal_id=v.option_id where v.product_id=p.internal_id)typed_attributes,
      case when series.internal_id is not null then (to_jsonb(series)-array['internal_id','brand_id','created_at','updated_at'])
        ||jsonb_build_object('brand',brand.stable_id)end series,
      snapshot.payload snapshot,
      to_jsonb(catalog_card)-array['snapshot_version','sort_order']card
    from public.products p join public.brands brand on brand.internal_id=p.brand_id
    join public.categories category on category.internal_id=p.primary_category_id
    left join public.product_series series on series.internal_id=p.series_id
    left join public.import_runs run on run.internal_id=p.last_import_run_id
    left join public.catalog_product_snapshots snapshot on snapshot.legacy_id=p.legacy_id and snapshot.snapshot_version=$2
    left join public.catalog_product_cards catalog_card on catalog_card.legacy_id=p.legacy_id and catalog_card.snapshot_version=$2
    where p.legacy_id=any($1::text[])order by p.legacy_id`, [ids, VERSION]);
  return rows;
}

function assertExactSource(rows, expectedById, originalsBySku, sourceRef) {
  for (const row of rows) {
    const expected = expectedById.get(row.legacy_id);
    assert(expected, `${row.legacy_id}: expected input exists`);
    const original = originalsBySku.get(normalizedSku(expected.sku));
    assert.equal(row.product.sku, expected.sku);
    assert.equal(row.product.ownerSourceRef, sourceRef);
    assert.equal(row.product.brand, expected.brand);
    assert.equal(row.product.category, expected.category);
    assert.equal(row.product.publication_status, 'published');
    assert.equal(row.product.amount === null ? null : Number(row.product.amount), expected.amount);
    assert.equal(row.product.price_status, expected.amount === null ? 'unknown' : 'known');
    assert.equal(row.sources.length, 1, `${row.legacy_id}: exactly one source record`);
    const source = row.sources[0];
    assert.equal(source.source_id, expected.sourceId);
    assert.equal(source.source_category, expected.sourceCategory);
    assert.equal(source.source_url, expected.sourceUrl);
    assert.equal(source.ownerSourceRef, sourceRef);
    assert.equal(source.mapping_status, 'mapped');
    assert.equal(source.active, true);
    const exactMetadata = Object.fromEntries(metadataKeys.filter(key => Object.hasOwn(original, key) && original[key] !== undefined).map(key => [key, original[key]]));
    assert.deepEqual(source.raw_payload, { characteristics: expected.characteristics, ...exactMetadata }, `${row.legacy_id}: entire source characteristic payload and original enrichment preserved`);
    assert.deepEqual(row.snapshot.sourceAttributes, expected.characteristics);
    assert.deepEqual(row.snapshot.unmappedAttributes, expected.characteristics);
    assert.deepEqual(row.snapshot.normalizedAttributes, expected.filters);
    assert.equal(row.snapshot.source.sourceId, expected.sourceId);
    assert.equal(row.snapshot.source.sourceCategory, expected.sourceCategory);
    assert.equal(row.snapshot.publicationStatus, 'published');
    assert.equal(row.snapshot.pricing.amount, expected.amount);
    assert.deepEqual(row.media.map(m => m.url), expected.images);
    assert.equal(row.media.filter(m => m.role === 'primary').length, 1);
    assert.deepEqual(row.snapshot.images, expected.images);
    assert.deepEqual(row.documents.map(d => ({ title: d.title, url: d.url })), expected.documents.map(d => ({ title: d.title, url: d.url })));
    assert.deepEqual(row.snapshot.documents, expected.documents.map(d => ({ type: 'PDF', title: d.title, url: d.url })));
    assert.equal(row.card.legacy_id, expected.legacyId);
    assert.deepEqual(row.card.card.images, [expected.images[0]]);
    assert.deepEqual(row.card.card.pricing, row.snapshot.pricing);
    assert.deepEqual(row.card.normalized_attributes, expected.filters);
    assert.equal(row.card.card.seriesId, row.snapshot.seriesId);
    const seriesName = typeof original.series === 'string' ? original.series.trim().replace(/\s+/gu, ' ') : '';
    if (seriesName) {
      assert.equal(row.series.name.toLocaleLowerCase(), seriesName.toLocaleLowerCase());
      assert.equal(row.series.brand, expected.brand);
      assert.equal(row.series.status, 'active');
      assert.equal(row.snapshot.seriesId, row.series.stable_id);
    } else assert.equal(row.snapshot.seriesId, null);
  }
}

export async function runScenario(manifestPath = 'imports/releases/engineering-brands-20261126-b733226f1110/manifest.json', chunkNumber = 71) {
  const started = performance.now();
  const report = { mode: 'local-pglite-only', status: 'running', manifest: manifestPath, chunkNumber, checks: [] };
  const manifest = await readJson(path.resolve(ROOT, manifestPath));
  const chunk = manifest.chunks[chunkNumber - 1];
  assert(chunk, 'requested frozen chunk exists');
  report.jobId = manifest.jobId;
  report.sourceRef = chunk.sourceRef;
  const [draftSql, publicationSql, atomicSql, prerequisite] = await Promise.all([
    chunk.file, chunk.publicationFile, chunk.atomicFile, manifest.metadata.file
  ].map(file => fs.readFile(path.resolve(ROOT, file), 'utf8')));
  assert.equal(sha256(draftSql), chunk.sha256);
  assert.equal(sha256(atomicSql), chunk.atomicSha256);
  assert.equal(Buffer.byteLength(draftSql), chunk.bytes);
  assert.equal(Buffer.byteLength(atomicSql), chunk.atomicBytes);
  assert.equal(sha256(prerequisite), manifest.metadata.sha256);
  const items = readyPayload(draftSql);
  assert.deepEqual(items.map(i => i.legacyId), chunk.ids);
  const expectedById = new Map(items.map(item => [item.legacyId, item]));
  const wantedSkus = new Set(items.map(i => normalizedSku(i.sku)));
  const batchFile = manifest.batches.find(b => b.file.endsWith('rehau-2026-11-25.json')).file;
  // Retain only the tested originals, not the entire large source batch.
  const originalsBySku = new Map((await readJson(path.resolve(ROOT, batchFile))).products
    .filter(product => wantedSkus.has(normalizedSku(product.sku)))
    .map(product => [normalizedSku(product.sku), product]));
  assert.equal(originalsBySku.size, items.length);
  const input = { draftSql, publicationSql, atomicSql, sourceRef: chunk.sourceRef, ids: chunk.ids, originalsBySku, projectId: manifest.projectRef, maxBytes: 600000, maxRequestBytes: 650000 };
  const parts = splitFrozenChunk(input);
  assert(parts.length > 1, 'the real oversized parent must be subdivided');
  assert.deepEqual(parts.flatMap(p => p.ids), chunk.ids, 'ordered exact whole-parent ID coverage');
  assert.deepEqual(parts.flatMap(p => p.items), items, 'every normalized value is unchanged');
  assert.equal(new Set(parts.flatMap(p => p.ids)).size, chunk.ids.length);
  for (const part of parts) {
    assert.equal(part.sourceRef, chunk.sourceRef, 'parent source_ref is retained');
    assert.deepEqual(readyPayload(part.draftSql), part.items);
    assert.deepEqual(part.ids, part.items.map(i => i.legacyId));
    assert.equal(part.atomicBytes, Buffer.byteLength(part.atomicSql));
    assert.equal(part.atomicSha256, sha256(part.atomicSql));
    assert(part.atomicBytes <= input.maxBytes);
    const requestBytes = Buffer.byteLength(JSON.stringify({ project_id: manifest.projectRef, query: part.atomicSql }));
    assert.equal(part.requestBytes, requestBytes);
    assert(requestBytes <= input.maxRequestBytes);
    verifyGuards(part.atomicSql);
  }
  report.parts = parts.map((p, i) => ({ index: i + 1, products: p.ids.length, atomicBytes: p.atomicBytes, atomicSha256: p.atomicSha256, requestBytes: p.requestBytes }));
  report.products = items.length;
  report.checks.push('frozen-source-hashes', 'ordered-disjoint-whole-parent-coverage', 'normalized-values-unchanged', 'same-parent-source-ref', 'atomic-hash-and-request-bounds', 'transaction-local-guards');
  progress({ phase: 'subdivision', sourceRef: chunk.sourceRef, products: items.length, parts: report.parts });
  let db;
  let baselineRows;
  try {
    db = await setupDatabase(prerequisite);
    progress({ phase: 'baseline-setup', products: items.length });
    const old = await sentinel(db);
    await db.exec(atomicSql);
    baselineRows = await capture(db, chunk.ids);
    assert.equal(baselineRows.length, items.length);
    assertExactSource(baselineRows, expectedById, originalsBySku, chunk.sourceRef);
    assert.deepEqual(await sentinel(db), old, 'whole-parent baseline preserves existing row/card/price');
    progress({ phase: 'whole-parent-baseline', products: baselineRows.length });
  } finally { if (db) await db.close(); db = undefined; }

  try {
    db = await setupDatabase(prerequisite);
    progress({ phase: 'parts-setup', parts: parts.length });
    const old = await sentinel(db);
    await db.exec(parts[0].atomicSql);
    const firstState = await counts(db, chunk.ids);
    assert.equal(firstState.products, parts[0].ids.length);
    assert.equal(firstState.published, parts[0].ids.length);
    assert.equal(firstState.cards, parts[0].ids.length);
    const remainingIds = parts.slice(1).flatMap(p => p.ids);
    const remainingState = await counts(db, remainingIds);
    assert(Object.values(remainingState).every(value => value === 0), 'later parts are entirely absent after only part1');
    assert.deepEqual(await sentinel(db), old);
    report.checks.push('first-part-published-rest-absent');
    progress({ phase: 'first-part', published: firstState.published, remainingAbsent: remainingIds.length });
    for (let i = 1; i < parts.length; i++) await db.exec(parts[i].atomicSql);
    const rows = await capture(db, chunk.ids);
    assert.equal(rows.length, items.length);
    assertExactSource(rows, expectedById, originalsBySku, chunk.sourceRef);
    assert.deepEqual(rows, baselineRows, 'parts equal independent whole-parent baseline for every product/source/media/document/attribute/series/snapshot/card');
    progress({ phase: 'all-parts-equal-baseline', products: rows.length });
    const complete = await counts(db, chunk.ids);
    assert.equal(complete.products, items.length);
    assert.equal(complete.published, items.length);
    assert.equal(complete.sources, items.length);
    assert.equal(complete.media, items.reduce((n, item) => n + item.images.length, 0));
    assert.equal(complete.documents, items.reduce((n, item) => n + item.documents.length, 0));
    assert.equal(complete.snapshots, items.length);
    assert.equal(complete.cards, items.length);
    report.checks.push('all-parts-published', 'exact-source-ids-and-entire-raw-enrichment', 'all-characteristics-prices-and-series-preserved', 'all-media-documents-typed-attributes-readmodels-equal-whole-parent');
    for (const part of parts) await db.exec(part.atomicSql);
    progress({ phase: 'parts-replayed', parts: parts.length });
    assert.deepEqual(await counts(db, chunk.ids), complete, 'part replay has no duplicate data');
    assert.deepEqual(await capture(db, chunk.ids), rows, 'part replay preserves every captured business field');
    await db.exec(atomicSql);
    progress({ phase: 'whole-parent-replayed', products: items.length });
    assert.deepEqual(await counts(db, chunk.ids), complete, 'old whole-parent replay has no duplicate data');
    assert.deepEqual(await capture(db, chunk.ids), rows, 'old whole-parent replay preserves every captured business field');
    assert.deepEqual(await sentinel(db), old, 'existing sentinel row/card/price unchanged after all replays');
    const runCounters = await one(db, `select count(distinct source_ref)::int source_refs,sum(records_succeeded)::int succeeded,
      sum(records_failed)::int failed from public.import_runs where source_ref=$1`, [chunk.sourceRef]);
    assert.deepEqual(runCounters, { source_refs: 1, succeeded: items.length, failed: 0 }, 'replays do not inflate successful import counters');
    report.checks.push('all-parts-replay-idempotent', 'old-parent-replay-idempotent', 'single-parent-source-ref-success-counters', 'sentinel-entire-row-card-price-unchanged');
    report.counts = complete;
    report.runCounters = runCounters;
    report.status = 'ok';
  } catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; throw error; }
  finally {
    if (db) await db.close();
    report.elapsedMs = elapsed(started);
    report.finishedAt = new Date().toISOString();
    for (const [file, expected] of [[chunk.file, chunk.sha256], [chunk.atomicFile, chunk.atomicSha256], [manifest.metadata.file, manifest.metadata.sha256]]) {
      assert.equal(sha256(await fs.readFile(path.resolve(ROOT, file))), expected, `frozen input unchanged:${file}`);
    }
    const file = path.resolve(ROOT, 'imports/rehearsals', `${manifest.jobId}-subdivision-chunk${String(chunkNumber).padStart(3, '0')}-local.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(report, null, 2) + '\n');
    progress({ phase: 'complete', status: report.status, products: report.products, parts: report.parts.length, elapsedMs: report.elapsedMs, report: path.relative(ROOT, file).replaceAll('\\', '/') });
  }
  return report;
}

export async function runExclusionScenario(manifestPath = 'imports/releases/engineering-brands-20261126-b733226f1110/manifest.json') {
  const started = performance.now();
  const manifest = await readJson(path.resolve(ROOT, manifestPath));
  // This exact, independently audited RAUTOOL mounting kit is an actual tool.
  // The transform itself remains generic and never infers a product's scope.
  let parent, items, draft, atomic, parentNumber;
  for (let i = 0; i < manifest.chunks.length; i++) {
    const candidate = manifest.chunks[i];
    const candidateDraft = await fs.readFile(path.resolve(ROOT, candidate.file), 'utf8');
    const payload = readyPayload(candidateDraft);
    if (payload.some(item => item.sku === '10009331001')) {
      parent = candidate; items = payload; draft = candidateDraft; parentNumber = i + 1;
      atomic = await fs.readFile(path.resolve(ROOT, candidate.atomicFile), 'utf8');
      break;
    }
  }
  assert(parent, 'frozen release includes the source-proven RAUTOOL tool');
  assert.equal(sha256(draft), parent.sha256);
  assert.equal(sha256(atomic), parent.atomicSha256);
  const publication = await fs.readFile(path.resolve(ROOT, parent.publicationFile), 'utf8');
  const prerequisite = await fs.readFile(path.resolve(ROOT, manifest.metadata.file), 'utf8');
  assert.equal(sha256(prerequisite), manifest.metadata.sha256);
  const productSkus = new Set(items.map(item => normalizedSku(item.sku)));
  const batchFile = manifest.batches.find(b => b.file.endsWith('rehau-2026-11-25.json')).file;
  const originalsBySku = new Map((await readJson(path.resolve(ROOT, batchFile))).products
    .filter(product => productSkus.has(normalizedSku(product.sku))).map(product => [normalizedSku(product.sku), product]));
  const excludedTool = items.find(item => item.sku === '10009331001');
  assert.equal(excludedTool.category, 'pipe-installation-tools');
  const excludeIds = new Set([excludedTool.legacyId]);
  const eligible = items.filter(item => !excludeIds.has(item.legacyId));
  assert(eligible.length > 1);
  const common = { draftSql: draft, publicationSql: publication, atomicSql: atomic,
    sourceRef: parent.sourceRef, ids: parent.ids, originalsBySku, projectId: manifest.projectRef,
    maxBytes: 600000, maxRequestBytes: 650000 };
  const parts = splitFrozenChunk({ ...common, excludeIds });
  assert(parts.length > 0);
  assert.deepEqual(parts.flatMap(part => part.items), eligible);
  assert.deepEqual(parts.flatMap(part => part.ids), eligible.map(item => item.legacyId));
  for (const part of parts) {
    assert.equal(part.parentProductCount, items.length);
    assert.equal(part.eligibleProductCount, eligible.length);
    assert.equal(part.excludedProductCount, 1);
    assert.deepEqual(part.excludedIds, [excludedTool.legacyId]);
    assert.equal(part.sourceRef, parent.sourceRef);
    assert.equal(part.atomicSha256, sha256(part.atomicSql));
    assert(part.atomicBytes <= common.maxBytes && part.requestBytes <= common.maxRequestBytes);
    verifyGuards(part.atomicSql);
    // The full parent's count is the match anchor; actual per-part records_seen
    // must count only that eligible request, not repeatedly count the parent.
    assert(part.draftSql.includes(`$sofimport$${parent.sourceRef}$sofimport$, now(), ${part.ids.length},`));
  }
  assert.deepEqual([...normalizeExclusionIds([excludedTool.legacyId])], [...excludeIds]);
  assert.deepEqual([...normalizeExclusionIds({ products: [{ legacyId: excludedTool.legacyId }] })], [...excludeIds]);
  assert.deepEqual([...normalizeExclusionIds({ ids: [excludedTool.legacyId] })], [...excludeIds]);
  assert.throws(() => normalizeExclusionIds({ count: 2, products: [{ legacyId: excludedTool.legacyId }] }));
  assert.throws(() => normalizeExclusionIds([excludedTool.legacyId, excludedTool.legacyId]));
  assert.deepEqual(splitFrozenChunk({ ...common, excludeIds: parent.ids }), [], 'all-excluded parent emits no SQL parts');
  const incompleteOriginals = new Map(originalsBySku);
  incompleteOriginals.delete(normalizedSku(excludedTool.sku));
  assert.throws(() => splitFrozenChunk({ ...common, originalsBySku: incompleteOriginals, excludeIds: parent.ids }), /original source product missing/iu,
    'even an excluded product must have its full original enrichment verified first');
  assert.throws(() => splitFrozenChunk({ ...common, atomicSql: atomic + '\n-- changed', excludeIds: parent.ids }), /atomic envelope/iu,
    'all-excluded parent cannot bypass atomic integrity checks');

  // Independent whole eligible transaction: use the unchanged parent importer,
  // source-enrichment generator and scoped publisher, not splitFrozenChunk.
  const enrich = rows => enrichmentSql(rows.map(item => ({ ...item, original: originalsBySku.get(normalizedSku(item.sku)) })), parent.sourceRef);
  const suffix = `\n${enrich(items)}\ncommit;\n`;
  assert(draft.endsWith(suffix));
  const originalBlock = `$sofimport$${JSON.stringify(items)}$sofimport$`;
  const baselineDraft = (draft.slice(0, -suffix.length) + '\ncommit;\n')
    .split(originalBlock).join(`$sofimport$${JSON.stringify(eligible)}$sofimport$`)
    .replace(`$sofimport$${parent.sourceRef}$sofimport$, now(), ${items.length},`, `$sofimport$${parent.sourceRef}$sofimport$, now(), ${eligible.length},`)
    .replace(/\ncommit;\s*$/iu, `\n${enrich(eligible)}\ncommit;\n`);
  const eligibleIds = eligible.map(item => item.legacyId);
  const wholeFiltered = atomicPublicationSql(baselineDraft, publicationSql([{ sourceRef: parent.sourceRef, ids: eligibleIds }]));
  const expectedById = new Map(eligible.map(item => [item.legacyId, item]));
  const report = { mode: 'local-pglite-only', status: 'running', jobId: manifest.jobId, parentChunk: parentNumber,
    sourceRef: parent.sourceRef, parentProductCount: items.length, eligibleProductCount: eligible.length,
    excludedIds: [...excludeIds], excludedSku: excludedTool.sku, parts: parts.length, checks: [] };
  let db, baselineRows;
  try {
    db = await setupDatabase(prerequisite);
    await db.exec(wholeFiltered);
    baselineRows = await capture(db, eligibleIds);
    assert.equal(baselineRows.length, eligible.length);
    assertExactSource(baselineRows, expectedById, originalsBySku, parent.sourceRef);
    assert(Object.values(await counts(db, [...excludeIds])).every(value => value === 0));
  } finally { if (db) await db.close(); db = undefined; }
  try {
    db = await setupDatabase(prerequisite);
    const old = await sentinel(db);
    await db.exec(parts[0].atomicSql);
    assert.equal((await counts(db, eligibleIds)).published, parts[0].ids.length);
    assert(Object.values(await counts(db, [...excludeIds])).every(value => value === 0), 'excluded tool never imported by part1');
    for (const part of parts.slice(1)) await db.exec(part.atomicSql);
    const rows = await capture(db, eligibleIds);
    assert.equal(rows.length, eligible.length);
    assertExactSource(rows, expectedById, originalsBySku, parent.sourceRef);
    assert.deepEqual(rows, baselineRows, 'eligible products equal independent whole-filtered baseline');
    const complete = await counts(db, eligibleIds);
    for (const part of parts) await db.exec(part.atomicSql);
    await db.exec(wholeFiltered);
    assert.deepEqual(await capture(db, eligibleIds), rows);
    assert.deepEqual(await counts(db, eligibleIds), complete);
    assert(Object.values(await counts(db, [...excludeIds])).every(value => value === 0), 'excluded tool absent from every relation after all replays');
    assert.deepEqual(await sentinel(db), old);
    const successes = await one(db, 'select sum(records_succeeded)::int n from public.import_runs where source_ref=$1', [parent.sourceRef]);
    assert.equal(successes.n, eligible.length);
    report.checks.push('exact-eligible-excluded-partition', 'full-parent-validation-before-filter', 'original-count-anchor-subset-records-seen',
      'first-part-published-excluded-tool-absent', 'all-eligible-data-equal-whole-filtered-baseline', 'excluded-tool-never-imported',
      'eligible-parts-and-filtered-parent-replay-idempotent', 'sentinel-row-card-price-unchanged');
    report.status = 'ok';
  } finally { if (db) await db.close(); }

  // Exercise the file-based path and all-excluded parent manifest without hosted work.
  const temporary = await fs.mkdtemp(path.join(ROOT, 'tmp/subdivision-exclusion-'));
  const exclusionFile = path.join(temporary, 'all-excluded.json');
  const exclusionBytes = JSON.stringify({ count: parent.ids.length, products: parent.ids.map(legacyId => ({ legacyId })) });
  await fs.writeFile(exclusionFile, exclusionBytes);
  const output = path.join(temporary, 'derived');
  const cli = JSON.parse(execFileSync(process.execPath, ['scripts/import/subdivide-brand-release.mjs',
    `--manifest=${manifestPath}`, `--chunk=${parentNumber}`, `--exclude-file=${exclusionFile}`, `--output=${output}`],
  { cwd: ROOT, encoding: 'utf8' }));
  const derived = await readJson(path.resolve(ROOT, cli.manifest));
  assert.equal(derived.parentProductCount, items.length);
  assert.equal(derived.eligibleProductCount, 0);
  assert.equal(derived.excludedProductCount, items.length);
  assert.deepEqual(derived.excludedIds, parent.ids);
  assert.equal(derived.exclusionFileSha256, sha256(exclusionBytes));
  assert.equal(derived.chunks.length, 0);
  assert(derived.parents[0].skipped);
  assert.deepEqual(await fs.readdir(output), ['manifest.json'], 'all-excluded parent creates no SQL files');
  report.exclusionFileSha256 = derived.exclusionFileSha256;
  report.allExcludedParentManifest = cli.manifest;
  report.checks.push('file-products-format-sha-and-manifest-partition', 'all-excluded-parent-no-sql-files');
  assert.equal(sha256(await fs.readFile(path.resolve(ROOT, parent.file))), parent.sha256);
  assert.equal(sha256(await fs.readFile(path.resolve(ROOT, parent.atomicFile))), parent.atomicSha256);
  report.elapsedMs = elapsed(started);
  const reportFile = path.resolve(ROOT, 'imports/rehearsals', `${manifest.jobId}-subdivision-exclusion-local.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  progress({ phase: 'exclusion-complete', status: report.status, excludedSku: report.excludedSku, parent: items.length,
    eligible: eligible.length, parts: parts.length, elapsedMs: report.elapsedMs, report: path.relative(ROOT, reportFile).replaceAll('\\', '/') });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await runScenario(process.argv[2], process.argv[3] ? Number(process.argv[3]) : 71);
    await runExclusionScenario(process.argv[2]);
  }
  catch (error) { console.error(JSON.stringify({ phase: 'failed', name: error.name, message: error.message.split('\n')[0], location: error.stack?.split('\n').find(line => line.includes('subdivide-brand-release-scenario.mjs:')) })); process.exitCode = 1; }
}
