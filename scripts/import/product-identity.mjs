import { createHash } from 'node:crypto';

// Identity is source-based, never title/slug-based. Keep the historical mapping for
// already-safe ASCII identifiers; lossy source identifiers receive a stable suffix.
// Existing products are resolved by SKU/source before this helper is used.
export function stableImportId(supplier, sourceId) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(supplier)) throw new Error('Invalid import supplier identity.');
  let source = String(sourceId ?? '').replace(/\s+/g, ' ').trim();
  if (!source) throw new Error('Import source identity is empty.');
  if (source.startsWith(`${supplier}-`)) source = source.slice(supplier.length + 1);
  const original = `${supplier}-${source}`.toLowerCase();
  const ascii = original.replace(/[^a-z0-9._-]+/g, '-');
  if (ascii === original) return ascii;
  const digest = createHash('sha256').update(original).digest('hex').slice(0, 12);
  return `${ascii.replace(/-+$/, '').slice(0, 100)}-${digest}`;
}
