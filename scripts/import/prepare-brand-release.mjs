// Prepare bounded, independently reviewable draft imports and a scoped publication transaction.
// No hosted connections. Apply the generated SQL only after media deployment is READY.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { enrichmentSql } from './brand-enrichment.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
export function readyPayload(sql) {
  const match = sql.match(/jsonb_array_elements\(\$sofimport\$([\s\S]*?)\$sofimport\$::jsonb\)/);
  return match ? JSON.parse(match[1]) : [];
}

export function splitDraftSql(sql, { jobId, batchName, size = 75, maxBytes = 1_500_000, enrich = null }) {
  const payload = readyPayload(sql);
  if (new Set(payload.map(item => item.legacyId)).size !== payload.length) throw new Error('Normalized legacy IDs collide.');
  const originalJson = JSON.stringify(payload);
  const chunks = [];
  for (let start = 0; start < payload.length;) {
    let count = Math.min(size, payload.length - start);
    let query;
    const sourceRef = `${jobId}/${batchName}/${String(chunks.length + 1).padStart(3, '0')}`;
    do {
      const next = payload.slice(start, start + count);
      query = sql.replaceAll(originalJson, () => JSON.stringify(next))
        .replaceAll(`$sofimport$${batchName}$sofimport$`, `$sofimport$${sourceRef}$sofimport$`)
        .replace(`now(), ${payload.length},`, `now(), ${count},`);
      if (enrich) {
        if (!/\ncommit;\s*$/i.test(query)) throw new Error('Draft transaction has no final COMMIT.');
        const addition = enrich(next, sourceRef);
        query = query.replace(/\ncommit;\s*$/i, () => `\n${addition}\ncommit;\n`);
      }
      if (Buffer.byteLength(query) <= maxBytes) break;
      count = Math.floor(count / 2);
    } while (count > 0);
    if (!count) throw new Error('A single product exceeds the SQL request budget.');
    if (!query.includes(`$sofimport$${sourceRef}$sofimport$`)) throw new Error('Import run source reference was not scoped.');
    chunks.push({ sourceRef, ids: payload.slice(start, start + count).map(row => row.legacyId), sql: query });
    start += count;
  }
  return chunks;
}

export function publicationSql(chunks) {
  const ids = chunks.flatMap(chunk => chunk.ids);
  const sourceRefs = chunks.map(chunk => chunk.sourceRef);
  if (!ids.length) return '-- No new products to publish.\n';
  if (new Set(ids).size !== ids.length) throw new Error('Brand batches have colliding product IDs.');
  return `-- Publish only new products created by these exact validated import runs.
begin;
do $brand_publish$
declare target_ids uuid[]; intended_ids text[] := array[${ids.map(literal).join(',')}];
begin
  select array_agg(product.internal_id) into target_ids
  from public.products product join public.import_runs run on run.internal_id=product.last_import_run_id
  where product.legacy_id=any(intended_ids)
    and run.source_ref=any(array[${sourceRefs.map(literal).join(',')}])
    and run.status='succeeded' and product.publication_status in ('draft','published');
  if coalesce(cardinality(target_ids),0) <> cardinality(intended_ids) then
    raise exception 'Publication refused: expected % products owned by this import, found %', cardinality(intended_ids),coalesce(cardinality(target_ids),0);
  end if;
  update public.products set publication_status='published' where internal_id=any(target_ids) and publication_status='draft';
  perform public._admin_refresh_catalog(target_ids);
  if exists (select 1 from public.products where internal_id=any(target_ids) and publication_status<>'published') then
    raise exception 'Some imported products were not published';
  end if;
end;
$brand_publish$;
commit;
`;
}

export function atomicPublicationSql(draft, publication) {
  // The exact generated draft and publication bodies share one transaction. A failed
  // ownership/read-model check rolls back the new products as well as their publication.
  if (!/\ncommit;\s*$/i.test(draft) || !/^--[^\n]*\nbegin;\n/.test(publication)) {
    throw new Error('Unexpected transaction envelope; refusing to combine SQL.');
  }
  const sql = draft.replace(/\ncommit;\s*$/i, '\n') + publication.replace(/^--[^\n]*\nbegin;\n/, '');
  if (Buffer.byteLength(sql) >= 2_000_000) throw new Error('Atomic import exceeds execute_sql budget.');
  return sql;
}

export function prepareRelease(batchFiles, { reference = 'imports/reference-prod.json' } = {}) {
  if (!batchFiles.length) throw new Error('Provide the checked brand batch files.');
  const digest = crypto.createHash('sha256');
  for (const file of batchFiles) digest.update(fs.readFileSync(path.resolve(root, file)));
  const jobId = `three-brands-20261125-${digest.digest('hex').slice(0, 12)}`;
  const output = path.join(root, 'imports/releases', jobId);
  fs.mkdirSync(output, { recursive: true });
  const chunks = [];
  const batches = [];
  const allSkus = new Map();
  const allTitles = new Map();
  for (const file of batchFiles) {
    const report = JSON.parse(execFileSync(process.execPath,
      ['scripts/import-check.mjs', file, `--reference=${reference}`, '--check-links'], { cwd: root, encoding: 'utf8' }));
    if (report.blocked) throw new Error(`${file}: ${report.blocked} products fail the project standard.`);
    const sql = fs.readFileSync(path.resolve(root, file.replace(/\.json$/, '.sql')), 'utf8');
    const input = JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
    const originals = new Map(input.products.map(product => [product.sku.trim().toLowerCase(), product]));
    for (const item of readyPayload(sql)) {
      const skuKey = item.sku.trim().toLowerCase();
      const titleKey = item.title.trim().toLocaleLowerCase('uk');
      if (allSkus.has(skuKey)) throw new Error(`Cross-batch SKU collision: ${item.sku} (${file}, ${allSkus.get(skuKey)})`);
      if (allTitles.has(titleKey)) throw new Error(`Cross-batch title collision: ${item.title}`);
      allSkus.set(skuKey, file);
      allTitles.set(titleKey, file);
    }
    const parts = splitDraftSql(sql, { jobId, batchName: path.basename(file),
      enrich: (items, sourceRef) => enrichmentSql(items.map(item => ({ ...item, original: originals.get(item.sku.trim().toLowerCase()) })), sourceRef),
    });
    for (const chunk of parts) {
      chunk.file = path.relative(root, path.join(output, `${String(chunks.length + 1).padStart(3, '0')}-draft.sql`)).replaceAll('\\', '/');
      fs.writeFileSync(path.resolve(root, chunk.file), chunk.sql);
      chunk.publicationFile = chunk.file.replace('-draft.sql', '-publish.sql');
      const publication = publicationSql([chunk]);
      fs.writeFileSync(path.resolve(root, chunk.publicationFile), publication);
      chunk.atomicFile = chunk.file.replace('-draft.sql', '-atomic.sql');
      const atomic = atomicPublicationSql(chunk.sql, publication);
      fs.writeFileSync(path.resolve(root, chunk.atomicFile), atomic);
      chunk.atomicSha256 = crypto.createHash('sha256').update(atomic).digest('hex');
      chunk.atomicBytes = Buffer.byteLength(atomic);
      chunks.push(chunk);
    }
    batches.push({ file, ...report });
  }
  // One bounded transaction per chunk also keeps _admin_refresh_catalog inside its 20-second budget.
  // Reject cross-brand identity collisions before any generated files can be applied.
  if (new Set(chunks.flatMap(chunk => chunk.ids)).size !== chunks.reduce((count, chunk) => count + chunk.ids.length, 0)) {
    throw new Error('Brand batches have colliding product IDs.');
  }
  const manifest = {
    jobId, createdAt: new Date().toISOString(), projectRef: 'fkjarsouuchjiedrrblc',
    batches, newProducts: chunks.reduce((count, chunk) => count + chunk.ids.length, 0),
    chunks: chunks.map(({ sql, ...chunk }) => ({ ...chunk, sha256: crypto.createHash('sha256').update(sql).digest('hex'), bytes: Buffer.byteLength(sql) })),
    publicationFiles: chunks.map(chunk => chunk.publicationFile),
  };
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const reference = args.find(arg => arg.startsWith('--reference='))?.slice('--reference='.length);
  const manifest = prepareRelease(args.filter(arg => !arg.startsWith('--')), reference ? { reference } : {});
  console.log(JSON.stringify({ jobId: manifest.jobId, newProducts: manifest.newProducts, chunks: manifest.chunks.length, batches: manifest.batches }));
}
