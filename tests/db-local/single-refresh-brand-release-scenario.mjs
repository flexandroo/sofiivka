// Local-only comparison of frozen double-refresh SQL with opt-in atomic snapshot seeding.
// node tests/db-local/single-refresh-brand-release-scenario.mjs [manifest.json] [parent=43]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createDatabase } from './database.mjs';
import { metadataSql } from '../../scripts/import/three-brand-metadata.mjs';
import { readyPayload } from '../../scripts/import/prepare-brand-release.mjs';
import { splitFrozenChunk } from '../../scripts/import/subdivide-brand-release.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const VERSION = 'v-single-refresh-local';
const SENTINEL = 'single-refresh-manual-sentinel';
const METADATA = ['sourceEvidence', 'series', 'priceCurrency', 'vatIncluded', 'related', 'ean'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
const json = async file => JSON.parse(await fs.readFile(path.resolve(ROOT, file), 'utf8'));
const progress = value => console.log(JSON.stringify(value));
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";

async function setup(prerequisite) {
  const db = await createDatabase();
  try {
    await db.exec(`insert into public.categories(stable_id,slug,parent_id,level,title,short_title,sort_order,status,visibility)
      values('sewerage','sewerage',null,1,'Каналізація та дренаж','Каналізація та дренаж',350,'active','catalog') on conflict(stable_id)do nothing;
      insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,product_count,public_product_count,product_id_hash,ready)
      values('${VERSION}','single-refresh-local',
        (select coalesce(jsonb_agg(public._taxonomy_category_release_entry(c)order by c.sort_order),'[]')from public.categories c where c.status='active'),
        (select coalesce(jsonb_agg(public._taxonomy_brand_release_entry(b)order by b.stable_id),'[]')from public.brands b where b.status='active'),
        (select coalesce(jsonb_object_agg(d.stable_id,public._attributes_release_fields(d)),'{}')from public.attribute_definitions d where d.status='active'),0,0,repeat('0',64),true);
      insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,'${VERSION}');
      insert into public.catalog_admin_cache_revision(singleton,base_snapshot_version)values(true,'${VERSION}')
        on conflict(singleton)do update set base_snapshot_version=excluded.base_snapshot_version,revision=0;`);
    await db.exec(metadataSql());
    await db.exec(prerequisite);
    const brand = await one(db, "select internal_id from public.brands where status='active' order by stable_id limit 1");
    const category = await one(db, `select c.internal_id from public.categories c where c.status='active' and c.visibility='catalog'
      and not exists(select 1 from public.categories child where child.parent_id=c.internal_id and child.status='active')order by c.stable_id limit 1`);
    await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,publication_status)
      values($1,'SINGLE-REFRESH-OLD',$1,'Наявний ручний товар','Наявний ручний товар','SINGLE-REFRESH-OLD',$2,$3,2345,'known','published')`, [SENTINEL, brand.internal_id, category.internal_id]);
    await db.query('select public._admin_refresh_catalog(array[internal_id]) from public.products where legacy_id=$1', [SENTINEL]);
    return db;
  } catch (error) { await db.close(); throw error; }
}

async function sentinel(db) {
  return one(db, `select to_jsonb(p) product,s.payload snapshot,to_jsonb(c) card
    from public.products p join public.catalog_product_snapshots s on s.legacy_id=p.legacy_id and s.snapshot_version=$2
    join public.catalog_product_cards c on c.legacy_id=p.legacy_id and c.snapshot_version=$2 where p.legacy_id=$1`, [SENTINEL, VERSION]);
}

// Ignore only generated DB identities/timestamps and global revisions across independent DBs.
async function capture(db, ids) {
  return (await db.query(`select p.legacy_id,
    (to_jsonb(p)-array['internal_id','brand_id','primary_category_id','series_id','last_import_run_id','last_imported_at','created_at','updated_at'])
      ||jsonb_build_object('brand',b.stable_id,'category',category.stable_id,'series',series.stable_id,'sourceRef',run.source_ref) product,
    (select jsonb_agg((to_jsonb(s)-array['internal_id','product_id','supplier_id','import_run_id','first_seen_at','last_seen_at','verified_at','created_at','updated_at'])
      ||jsonb_build_object('supplier',supplier.stable_id,'sourceRef',r.source_ref)order by supplier.stable_id,s.source_id)
      from public.product_source_records s join public.suppliers supplier on supplier.internal_id=s.supplier_id
      left join public.import_runs r on r.internal_id=s.import_run_id where s.product_id=p.internal_id) sources,
    (select coalesce(jsonb_agg(to_jsonb(m)-array['internal_id','product_id','created_at','updated_at']order by m.sort_order,m.url),'[]')from public.product_media m where m.product_id=p.internal_id)media,
    (select coalesce(jsonb_agg(to_jsonb(d)-array['internal_id','product_id','created_at','updated_at']order by d.sort_order,d.url),'[]')from public.product_documents d where d.product_id=p.internal_id)documents,
    (select coalesce(jsonb_agg((to_jsonb(v)-array['internal_id','product_id','attribute_id','option_id','created_at','updated_at'])
      ||jsonb_build_object('attribute',def.stable_id,'option',o.value)order by def.stable_id),'[]')from public.product_attribute_values v
      join public.attribute_definitions def on def.internal_id=v.attribute_id left join public.attribute_options o on o.internal_id=v.option_id where v.product_id=p.internal_id)typed_attributes,
    case when series.internal_id is not null then (to_jsonb(series)-array['internal_id','brand_id','created_at','updated_at'])||jsonb_build_object('brand',b.stable_id)end series,
    snapshot.payload snapshot,snapshot.sort_order snapshot_sort_order,to_jsonb(catalog_card)-array['snapshot_version']card
    from public.products p join public.brands b on b.internal_id=p.brand_id join public.categories category on category.internal_id=p.primary_category_id
    left join public.product_series series on series.internal_id=p.series_id left join public.import_runs run on run.internal_id=p.last_import_run_id
    left join public.catalog_product_snapshots snapshot on snapshot.legacy_id=p.legacy_id and snapshot.snapshot_version=$2
    left join public.catalog_product_cards catalog_card on catalog_card.legacy_id=p.legacy_id and catalog_card.snapshot_version=$2
    where p.legacy_id=any($1::text[])order by p.legacy_id`, [ids, VERSION])).rows;
}

async function exactRows(db, ids) {
  return (await db.query(`select p.legacy_id,to_jsonb(p) product,
    (select jsonb_agg(to_jsonb(s)order by s.internal_id)from public.product_source_records s where s.product_id=p.internal_id)sources,
    (select jsonb_agg(to_jsonb(m)order by m.internal_id)from public.product_media m where m.product_id=p.internal_id)media,
    (select jsonb_agg(to_jsonb(d)order by d.internal_id)from public.product_documents d where d.product_id=p.internal_id)documents
    from public.products p where legacy_id=any($1::text[])order by p.legacy_id`, [ids])).rows;
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

function assertSource(rows, expected, originals, sourceRef, supplier) {
  for (const row of rows) {
    const item = expected.get(row.legacy_id), original = originals.get(item.sku.toLowerCase());
    assert.equal(row.product.publication_status, 'published');
    assert.equal(row.product.sourceRef, sourceRef);
    assert.equal(row.product.sku, item.sku);
    assert.equal(row.product.brand, item.brand);
    assert.equal(row.product.category, item.category);
    assert.equal(row.product.title, item.title);
    assert.equal(row.product.amount === null ? null : Number(row.product.amount), item.amount);
    assert.equal(row.sources.length, 1);
    const metadata = Object.fromEntries(METADATA.filter(key => Object.hasOwn(original, key) && original[key] !== undefined).map(key => [key, original[key]]));
    assert.deepEqual(row.sources[0].raw_payload, { characteristics: item.characteristics, ...metadata }, 'entire cleaned characteristics plus original enrichment/sourceEvidence preserved');
    assert.equal(row.sources[0].source_id, item.sourceId);
    assert.equal(row.sources[0].source_url, item.sourceUrl);
    assert.equal(row.sources[0].sourceRef, sourceRef);
    assert.deepEqual(row.snapshot.sourceAttributes, item.characteristics);
    assert.deepEqual(row.snapshot.unmappedAttributes, item.characteristics);
    assert.deepEqual(row.snapshot.normalizedAttributes, item.filters);
    assert.equal(row.snapshot.source.supplier, supplier);
    assert.equal(row.snapshot.source.sourceId, item.sourceId);
    assert.equal(row.snapshot.source.sourceCategory, item.sourceCategory);
    assert.equal(row.snapshot.publicationStatus, 'published');
    assert.deepEqual(row.snapshot.images, item.images);
    assert.deepEqual(row.media.map(value => value.url), item.images);
    assert.deepEqual(row.snapshot.documents, item.documents.map(value => ({ type: 'PDF', title: value.title, url: value.url })));
    assert.deepEqual(row.documents.map(value => ({ title: value.title, url: value.url })), item.documents.map(value => ({ title: value.title, url: value.url })));
    assert.deepEqual(row.card.card.images, [item.images[0]]);
    assert.deepEqual(row.card.normalized_attributes, item.filters);
    assert.deepEqual(row.card.card.pricing, row.snapshot.pricing);
    assert.equal(row.snapshot.pricing.amount, item.amount);
    assert.equal(row.snapshot.seriesId, row.series?.stable_id || null);
    if (original.series) assert.equal(row.series.name.toLowerCase(), original.series.trim().replace(/\s+/g, ' ').toLowerCase());
  }
}

export async function runScenario(manifestPath = 'imports/releases/engineering-no-tools-20261126-58f77cb362d6/manifest.json', parentNumber = 43) {
  const started = performance.now(), manifest = await json(manifestPath), parent = manifest.chunks[parentNumber - 1];
  assert(parent, 'actual frozen parent exists');
  const [draftSql, publicationSql, atomicSql, prerequisite] = await Promise.all([parent.file, parent.publicationFile, parent.atomicFile, manifest.metadata.file].map(file => fs.readFile(path.resolve(ROOT, file), 'utf8')));
  assert.equal(sha(draftSql), parent.sha256); assert.equal(sha(atomicSql), parent.atomicSha256); assert.equal(sha(prerequisite), manifest.metadata.sha256);
  const items = readyPayload(draftSql), expected = new Map(items.map(item => [item.legacyId, item]));
  assert.deepEqual(items.map(item => item.legacyId), parent.ids);
  const batch = await json(manifest.batches.find(value => /rehau-no-tools/.test(value.file)).file);
  const originals = new Map(batch.products.filter(product => items.some(item => item.sku.toLowerCase() === product.sku.toLowerCase())).map(product => [product.sku.toLowerCase(), product]));
  const input = { draftSql, publicationSql, atomicSql, sourceRef: parent.sourceRef, ids: parent.ids, originalsBySku: originals, projectId: manifest.projectRef };
  // The opt-in must leave every previously reviewed default artifact byte-for-byte unchanged.
  const historicalPath = `imports/recoveries/${manifest.jobId}/small-resume/manifest.json`, historical = await json(historicalPath);
  const oldParts = historical.chunks.filter(value => value.parentChunk === parentNumber);
  const historicalOptions = { maxBytes: historical.maxBytes, maxRequestBytes: historical.maxRequestBytes,
    statementTimeout: oldParts[0].statementTimeout, lockTimeout: oldParts[0].lockTimeout };
  const defaults = splitFrozenChunk({ ...input, ...historicalOptions });
  const explicitFalse = splitFrozenChunk({ ...input, ...historicalOptions, singleRefresh: false });
  assert.deepEqual(defaults, explicitFalse);
  assert.equal(defaults.length, oldParts.length);
  for (let index = 0; index < defaults.length; index++) {
    assert.equal(defaults[index].atomicSha256, oldParts[index].atomicSha256, 'default SQL hash unchanged');
    assert.equal(defaults[index].atomicSql, await fs.readFile(path.resolve(ROOT, oldParts[index].atomicFile), 'utf8'));
  }
  const parts = splitFrozenChunk({ ...input, maxBytes: 300000, maxRequestBytes: 325000, singleRefresh: true });
  assert.deepEqual(parts.flatMap(part => part.items), items);
  for (const part of parts) {
    assert.equal((part.atomicSql.match(/perform public\._admin_refresh_catalog\(/g) || []).length, 1, 'exactly final publication refresh remains');
    assert.match(part.atomicSql, /perform public\._admin_refresh_catalog\(target_ids\)/);
    assert.equal((part.draftSql.match(/perform public\._admin_refresh_catalog\(/g) || []).length, 1, 'standalone draft artifact is unmodified');
    assert.equal((part.atomicSql.match(/^begin;/gm) || []).length, 1); assert.equal((part.atomicSql.match(/^commit;/gm) || []).length, 1);
    assert(part.atomicBytes <= 300000 && part.requestBytes <= 325000);
    const sameSubset = splitFrozenChunk({ ...input, excludeIds: parent.ids.filter(id => !part.ids.includes(id)), maxBytes: 600000, maxRequestBytes: 650000 });
    assert.equal(sameSubset.length, 1);
    assert.equal(part.draftSql, sameSubset[0].draftSql, 'opt-in modifies only atomic SQL, never standalone draft/source fields');
    const manualPatch = /    -- Supplier characteristics[\s\S]*?product\.internal_id = any\(added\)\);/.exec(part.draftSql)?.[0];
    assert(manualPatch && part.atomicSql.includes(manualPatch), 'exact original manual source/snapshot patch retained');
  }
  progress({ phase: 'single-refresh-compiler-checks', products: items.length, parts: parts.map(part => part.ids.length), defaultHashesUnchanged: true });
  let db, baseline;
  try {
    db = await setup(prerequisite);
    const before = await sentinel(db);
    await db.exec(atomicSql);
    baseline = await capture(db, parent.ids);
    assert.equal(baseline.length, items.length); assertSource(baseline, expected, originals, parent.sourceRef, batch.supplier);
    assert.deepEqual(await sentinel(db), before);
  } finally { if (db) await db.close(); db = null; }
  progress({ phase: 'independent-frozen-double-refresh-baseline', products: baseline.length });
  try {
    db = await setup(prerequisite);
    const before = await sentinel(db), first = parts[0];
    const seriesBefore = (await db.query('select to_jsonb(s) row from public.product_series s order by stable_id')).rows;
    const runsBefore = await one(db, 'select count(*)::int n from public.import_runs');
    const publicationStart = first.atomicSql.indexOf('do $brand_publish$');
    assert(publicationStart > 0);
    const goodGuard = `run.source_ref=any(array[${literal(parent.sourceRef)}])`;
    const tail = first.atomicSql.slice(publicationStart);
    assert.equal(tail.split(goodGuard).length, 2);
    const corrupt = first.atomicSql.slice(0, publicationStart) + tail.replace(goodGuard, `run.source_ref=any(array[${literal(parent.sourceRef + '/not-owned')}])`);
    await assert.rejects(db.exec(corrupt), /Publication refused/);
    await db.exec('rollback');
    assert(Object.values(await counts(db, parent.ids)).every(value => value === 0), 'publication ownership failure rolls back every new product/source/media/document/snapshot/card, including minimal seeds');
    assert.deepEqual((await db.query('select to_jsonb(s) row from public.product_series s order by stable_id')).rows, seriesBefore, 'new series rolled back');
    assert.deepEqual(await one(db, 'select count(*)::int n from public.import_runs'), runsBefore, 'failed atomic run rolled back');
    assert.deepEqual(await sentinel(db), before);
    progress({ phase: 'corrupt-publication-full-rollback', firstPartProducts: first.ids.length });
    for (const part of parts) await db.exec(part.atomicSql);
    const rows = await capture(db, parent.ids);
    assertSource(rows, expected, originals, parent.sourceRef, batch.supplier);
    assert.deepEqual(rows, baseline, 'single-refresh parts exactly equal frozen double-refresh public/core/source/attributes/media/documents/series/prices');
    const state = await counts(db, parent.ids), exact = await exactRows(db, parent.ids);
    assert.equal(state.products, items.length); assert.equal(state.published, items.length); assert.equal(state.sources, items.length);
    assert.equal(state.cards, items.length); assert.equal(state.snapshots, items.length);
    assert.equal(state.media, items.reduce((sum, item) => sum + item.images.length, 0));
    assert.equal(state.documents, items.reduce((sum, item) => sum + item.documents.length, 0));
    for (const part of parts) await db.exec(part.atomicSql);
    assert.deepEqual(await capture(db, parent.ids), rows);
    assert.deepEqual(await exactRows(db, parent.ids), exact, 'replay preserves all product/source/media/document columns and timestamps');
    assert.deepEqual(await counts(db, parent.ids), state);
    await db.exec(atomicSql);
    assert.deepEqual(await capture(db, parent.ids), rows, 'frozen original atomic may replay after single-refresh publication');
    assert.deepEqual(await exactRows(db, parent.ids), exact);
    assert.deepEqual(await sentinel(db), before, 'manual sentinel whole product, card, snapshot and price unchanged');
    const runs = await one(db, 'select count(distinct source_ref)::int refs,sum(records_succeeded)::int succeeded,sum(records_failed)::int failed from public.import_runs where source_ref=$1', [parent.sourceRef]);
    assert.deepEqual(runs, { refs: 1, succeeded: items.length, failed: 0 });
    progress({ status: 'PASS', suite: 'single-refresh-brand-release', parent: parentNumber, products: items.length, parts: parts.length, counts: state, exactRawMetadata: true, exactPublicPayload: true, standaloneDraftUnchanged: true, defaultHashesUnchanged: true, ownershipFailureAtomicRollback: true, replayExact: true, sentinelUnchanged: true, elapsedMs: Math.round(performance.now() - started) });
    return { status: 'PASS', products: items.length, parts: parts.length };
  } finally {
    if (db) await db.close();
    assert.equal(sha(await fs.readFile(path.resolve(ROOT, parent.file))), parent.sha256);
    assert.equal(sha(await fs.readFile(path.resolve(ROOT, parent.atomicFile))), parent.atomicSha256);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await runScenario(process.argv[2], process.argv[3] ? Number(process.argv[3]) : 43);
