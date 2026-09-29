import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SOFIEVKA_PROJECTS = Object.freeze({
  wfxcklglujgramasdzyr: Object.freeze({ environment: 'development', name: 'sofievka' }),
  fkjarsouuchjiedrrblc: Object.freeze({ environment: 'production', name: 'sofievka-prod' }),
});

export const CATALOG_RUNTIME_FILES = Object.freeze([
  'brands-data.js',
  'products-data.js',
  'water-catalog-data.js',
  'termojet-products-data.js',
  'wilo-products-data.js',
  'grundfos-products-data.js',
  'tekkhaus-products-data.js',
  'tech-products-data.js',
  'heating-brands-products-data.js',
  'baxi-buderus-products-data.js',
  'catalog-data.js',
]);

const UUID_NAMESPACE = '99df62b2-552a-5c30-9e0f-8fd93dc692a4';

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sortedLinesHash(values) {
  return sha256([...values].sort().join('\n'));
}

export function stableStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, function stableReplacer(_key, item) {
    if (!item || typeof item !== 'object') return item;
    if (seen.has(item)) throw new TypeError('Cannot stable-stringify a circular value.');
    seen.add(item);
    if (Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
  });
}

function uuidBytes(uuid) {
  return Buffer.from(uuid.replaceAll('-', ''), 'hex');
}

export function uuidFromKey(key, namespace = UUID_NAMESPACE) {
  const digest = crypto.createHash('sha1').update(uuidBytes(namespace)).update(String(key)).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function slugify(value) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || `value-${sha256(String(value ?? '')).slice(0, 12)}`;
}

export function loadCatalogRuntime(projectRoot = PROJECT_ROOT) {
  const context = { window: {}, console, URLSearchParams, Intl };
  context.window.window = context.window;
  vm.createContext(context);
  for (const relativePath of CATALOG_RUNTIME_FILES) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    vm.runInContext(source, context, { filename: relativePath });
  }
  const state = context.window;
  if (!state.sofievkaCatalogSnapshot || !state.sofievkaCatalog) {
    throw new Error('Canonical CatalogSnapshot did not initialize.');
  }
  return state;
}

function parseArrayLiteral(source, variableName) {
  const expression = new RegExp(`const\\s+${variableName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`).exec(source)?.[1];
  if (!expression) throw new Error(`Could not find ${variableName} in script.js.`);
  const value = vm.runInNewContext(expression, Object.create(null), { timeout: 1000 });
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${variableName} is not a string array.`);
  }
  return value;
}

export function loadHomepageCollections(projectRoot = PROJECT_ROOT) {
  const source = fs.readFileSync(path.join(projectRoot, 'script.js'), 'utf8');
  return Object.freeze({
    homepageProductIds: Object.freeze(parseArrayLiteral(source, 'homepageProductIds')),
    homepageSaleProductIds: Object.freeze(parseArrayLiteral(source, 'homepageSaleProductIds')),
  });
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function countBy(values, selector) {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right), 'en')));
}

export function readCategoryReview(projectRoot = PROJECT_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, 'catalog', 'category-mapping-review.json'), 'utf8'));
}

export function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

export function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runSupabaseCli(argumentsList, { sensitive = false } = {}) {
  const commandArguments = ['supabase', ...argumentsList, '--agent', 'no'];
  if (commandArguments.some((argument) => !/^[A-Za-z0-9_.=\/-]+$/.test(argument))) {
    throw new Error('Unsafe character in Supabase CLI argument.');
  }
  const executable = process.platform === 'win32' ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe') : 'npx';
  const spawnArguments = process.platform === 'win32'
    ? ['/d', '/s', '/c', ['npx', ...commandArguments].join(' ')]
    : commandArguments;
  const result = childProcess.spawnSync(executable, spawnArguments, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = sensitive
      ? 'Sensitive CLI command failed; output suppressed.'
      : String(result.error?.message || result.stderr || result.stdout || '').trim();
    throw new Error(`Supabase CLI failed: ${detail}`);
  }
  return result.stdout;
}

export function resolveLinkedProject(projectRef) {
  const expected = SOFIEVKA_PROJECTS[projectRef];
  if (!expected) throw new Error(`Refusing remote access to unapproved Supabase project ${projectRef}.`);
  const projects = JSON.parse(runSupabaseCli(['projects', 'list', '--output', 'json']));
  const project = projects.find((item) => item.ref === projectRef);
  if (!project) throw new Error(`Supabase project ${projectRef} is not visible to the logged-in CLI profile.`);
  if (project.name !== expected.name || project.status !== 'ACTIVE_HEALTHY' || !project.linked) {
    throw new Error(`Refusing remote access: expected linked ACTIVE_HEALTHY ${expected.environment} project ${expected.name}, got ${project.name}/${project.status}/linked=${project.linked}.`);
  }
  return { ...project, environment: expected.environment };
}

export function resolveLinkedDevProject(projectRef) {
  if (projectRef !== 'wfxcklglujgramasdzyr') {
    throw new Error(`Refusing DEV-only operation for project ${projectRef}.`);
  }
  return resolveLinkedProject(projectRef);
}

export function resolveMigrationHistory() {
  const output = runSupabaseCli(['migration', 'list', '--linked', '--output-format', 'text']);
  const pairs = [...output.matchAll(/`(\d{14})`\s*\|\s*`(\d{14})`/g)].map((match) => ({ local: match[1], remote: match[2] }));
  return { output, pairs };
}

export function resolveProjectApiKeys(projectRef) {
  const keys = JSON.parse(runSupabaseCli([
    'projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output', 'json',
  ], { sensitive: true }));
  const publishableKey = keys.find((key) => key.type === 'publishable')?.api_key || keys.find((key) => key.id === 'anon')?.api_key;
  const serviceRoleKey = keys.find((key) => key.id === 'service_role')?.api_key;
  if (!publishableKey || !serviceRoleKey) throw new Error('Required publishable/service-role keys are unavailable.');
  return { publishableKey, serviceRoleKey };
}

export function resolveProjectPublishableKey(projectRef) {
  const keys = JSON.parse(runSupabaseCli([
    'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json',
  ], { sensitive: true }));
  const publishableKey = keys.find((key) => key.type === 'publishable')?.api_key || keys.find((key) => key.id === 'anon')?.api_key;
  if (!publishableKey) throw new Error('Publishable key is unavailable.');
  return publishableKey;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class SupabaseRestClient {
  constructor({ projectRef, apiKey, authorization = apiKey }) {
    this.baseUrl = `https://${projectRef}.supabase.co`;
    this.apiKey = apiKey;
    this.authorization = authorization;
  }

  async request(pathname, {
    method = 'GET',
    body,
    headers = {},
    allowFailure = false,
    responseType = 'json',
  } = {}) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}${pathname}`, {
          method,
          headers: {
            apikey: this.apiKey,
            Authorization: `Bearer ${this.authorization}`,
            ...headers,
          },
          body,
          signal: AbortSignal.timeout(120_000),
        });
        const text = method === 'HEAD' ? '' : await response.text();
        let payload = null;
        if (text) {
          if (responseType === 'text') payload = text;
          else {
            try { payload = JSON.parse(text); } catch { payload = text; }
          }
        }
        if (response.ok || allowFailure) return { response, payload };
        if ([429, 502, 503, 504].includes(response.status) && attempt < 3) {
          lastError = new Error(`Transient Supabase HTTP ${response.status}.`);
          await delay(500 * (2 ** attempt));
          continue;
        }
        throw new Error(`${method} ${pathname.split('?')[0]} failed (${response.status}): ${JSON.stringify(payload)}`);
      } catch (error) {
        lastError = error;
        if (attempt >= 3 || !/fetch|abort|timeout|Transient/i.test(error.message)) throw error;
        await delay(500 * (2 ** attempt));
      }
    }
    throw lastError;
  }

  async count(table, query = {}) {
    const parameters = new URLSearchParams({ select: '*', ...query });
    const { response } = await this.request(`/rest/v1/${table}?${parameters}`, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact', Range: '0-0' },
    });
    const contentRange = response.headers.get('content-range') || '';
    const count = Number(contentRange.split('/').at(-1));
    if (!Number.isInteger(count)) throw new Error(`Could not parse exact count for ${table}: ${contentRange}`);
    return count;
  }

  async fetchAll(table, { select = '*', query = {}, pageSize = 1000 } = {}) {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const parameters = new URLSearchParams({ select, ...query });
      const { payload } = await this.request(`/rest/v1/${table}?${parameters}`, {
        headers: { Range: `${offset}-${offset + pageSize - 1}` },
      });
      if (!Array.isArray(payload)) throw new Error(`Expected an array from ${table}.`);
      rows.push(...payload);
      if (payload.length < pageSize) break;
    }
    return rows;
  }

  async insert(table, rows, { returnRepresentation = false } = {}) {
    const list = Array.isArray(rows) ? rows : [rows];
    const { payload } = await this.request(`/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: returnRepresentation ? 'return=representation' : 'return=minimal',
      },
      body: JSON.stringify(Array.isArray(rows) ? list : rows),
    });
    return payload;
  }

  async upsert(table, rows, {
    onConflict,
    batchSize = 250,
    maxBytes = 1_500_000,
    onProgress,
  } = {}) {
    if (!rows.length) return { batches: 0, rows: 0 };
    const batches = [];
    let current = [];
    let currentBytes = 2;
    for (const row of rows) {
      const rowBytes = Buffer.byteLength(JSON.stringify(row)) + 1;
      if (current.length && (current.length >= batchSize || currentBytes + rowBytes > maxBytes)) {
        batches.push(current);
        current = [];
        currentBytes = 2;
      }
      current.push(row);
      currentBytes += rowBytes;
    }
    if (current.length) batches.push(current);

    let completed = 0;
    for (const batch of batches) {
      const parameters = new URLSearchParams();
      if (onConflict) parameters.set('on_conflict', onConflict);
      const query = parameters.size ? `?${parameters}` : '';
      await this.request(`/rest/v1/${table}${query}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      });
      completed += batch.length;
      onProgress?.({ table, completed, total: rows.length, batch: batches.indexOf(batch) + 1, batches: batches.length });
    }
    return { batches: batches.length, rows: rows.length };
  }

  async deleteByValues(table, column, values, { chunkSize = 80 } = {}) {
    let deletedScopes = 0;
    for (let index = 0; index < values.length; index += chunkSize) {
      const chunk = values.slice(index, index + chunkSize);
      const parameters = new URLSearchParams({ [column]: `in.(${chunk.join(',')})` });
      await this.request(`/rest/v1/${table}?${parameters}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      deletedScopes += chunk.length;
    }
    return deletedScopes;
  }

  async patch(table, query, body, { returnRepresentation = false } = {}) {
    const parameters = new URLSearchParams(query);
    const { payload } = await this.request(`/rest/v1/${table}?${parameters}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: returnRepresentation ? 'return=representation' : 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    return payload;
  }
}

function validMappingStatus(value) {
  return ['mapped', 'classifier', 'review', 'unmapped', 'ignored', 'rejected'].includes(value) ? value : 'unmapped';
}

function verifiedAt(raw) {
  const value = raw?.dateVerified || raw?.date_verified;
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function sourceUrl(raw) {
  for (const value of [raw?.manufacturerUrl, raw?.manufacturer_url, raw?.descriptionSourceUrl, raw?.description_source_url]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function documentType(document) {
  const value = `${document?.type ?? ''} ${document?.title ?? ''}`.toLocaleLowerCase('uk-UA');
  if (/certificate|сертиф|reach/.test(value)) return 'certificate';
  if (/datasheet|data sheet|технічн.*лист|специфікац/.test(value)) return 'datasheet';
  if (/інструк|instruction|manual|керівниц/.test(value)) return 'instruction';
  return 'other';
}

function tagIdentity(name) {
  const hash = sha256(name);
  return {
    stableId: `tag-${hash.slice(0, 20)}`,
    slug: `${slugify(name).slice(0, 72)}-${hash.slice(0, 8)}`,
  };
}

export async function loadCoreLookup(client) {
  const [brands, categories, attributes] = await Promise.all([
    client.fetchAll('brands', { select: 'internal_id,stable_id,name' }),
    client.fetchAll('categories', { select: 'internal_id,stable_id' }),
    client.fetchAll('attribute_definitions', { select: 'internal_id,stable_id,value_type,unit' }),
  ]);
  if (brands.length !== 36 || categories.length !== 87 || attributes.length !== 64) {
    throw new Error(`Core seed mismatch: brands=${brands.length}, categories=${categories.length}, attributes=${attributes.length}.`);
  }
  return {
    brandRows: brands,
    categoryRows: categories,
    attributeRows: attributes,
    brands: new Map(brands.map((row) => [row.stable_id, row])),
    categories: new Map(categories.map((row) => [row.stable_id, row])),
    attributes: new Map(attributes.map((row) => [row.stable_id, row])),
  };
}

export function buildImportPlan({ state, homepage, categoryReview, core, importRunId, startedAt, snapshotBaseline }) {
  const products = state.sofievkaCatalogSnapshot.products;
  const rawProducts = state.sofievkaRawSupplierProducts;
  const rawById = new Map(rawProducts.map((product) => [product.id, product]));
  const canonicalById = new Map(products.map((product) => [product.id, product]));
  const brandNames = new Map(state.sofievkaCatalogSnapshot.brands.map((brand) => [brand.id, brand.name]));
  const productInternalIds = new Map(products.map((product) => [product.id, uuidFromKey(`product:${product.id}`)]));

  for (const product of products) {
    if (!core.brands.has(product.brandId)) throw new Error(`${product.id}: missing core brand ${product.brandId}.`);
    if (!core.categories.has(product.primaryCategoryId)) throw new Error(`${product.id}: missing primary category ${product.primaryCategoryId}.`);
    for (const categoryId of product.secondaryCategoryIds ?? []) {
      if (!core.categories.has(categoryId)) throw new Error(`${product.id}: missing secondary category ${categoryId}.`);
    }
    if (!rawById.has(product.id)) throw new Error(`${product.id}: missing raw provenance record.`);
  }

  const supplierIds = [...new Set(products.map((product) => product.source.supplier))].sort();
  const supplierRows = supplierIds.map((stableId) => {
    const representative = products.find((product) => product.source.supplier === stableId);
    const raw = rawById.get(representative.id);
    let websiteUrl = null;
    try { websiteUrl = new URL(sourceUrl(raw)).origin; } catch { websiteUrl = null; }
    return {
      internal_id: uuidFromKey(`supplier:${stableId}`),
      stable_id: stableId,
      name: brandNames.get(stableId) || stableId,
      website_url: websiteUrl,
      active: true,
    };
  });
  const pipelineSupplier = {
    internal_id: uuidFromKey('supplier:sofievka-canonical'),
    stable_id: 'sofievka-canonical',
    name: 'Sofiivka canonical catalog pipeline',
    website_url: null,
    active: true,
  };
  supplierRows.push(pipelineSupplier);
  const supplierInternalIds = new Map(supplierRows.map((row) => [row.stable_id, row.internal_id]));

  const seriesMap = new Map();
  const seriesNameFallbacks = [];
  for (const product of products) {
    if (!product.seriesId) continue;
    const raw = rawById.get(product.id);
    const sourceName = typeof raw.series === 'string' && raw.series.trim() ? raw.series.trim() : null;
    if (!seriesMap.has(product.seriesId)) {
      if (!sourceName) seriesNameFallbacks.push(product.seriesId);
      seriesMap.set(product.seriesId, {
        internal_id: uuidFromKey(`series:${product.seriesId}`),
        stable_id: product.seriesId,
        brand_id: core.brands.get(product.brandId).internal_id,
        slug: product.seriesId,
        name: sourceName || product.seriesId,
        description: '',
        seo_title: null,
        seo_description: null,
        status: 'active',
      });
    } else {
      const existing = seriesMap.get(product.seriesId);
      if (existing.brand_id !== core.brands.get(product.brandId).internal_id) throw new Error(`${product.seriesId}: series spans multiple brands.`);
      if (sourceName && existing.name !== sourceName) throw new Error(`${product.seriesId}: conflicting series names.`);
    }
  }
  const seriesInternalIds = new Map([...seriesMap].map(([stableId, row]) => [stableId, row.internal_id]));

  const importRun = {
    internal_id: importRunId,
    supplier_id: pipelineSupplier.internal_id,
    status: 'running',
    source_ref: snapshotBaseline.snapshotHash,
    started_at: startedAt,
    finished_at: null,
    records_seen: products.length,
    records_succeeded: 0,
    records_failed: 0,
    error_summary: null,
    metadata: {
      version: 'catalog-data-migration-v1',
      snapshotVersion: snapshotBaseline.snapshotVersion,
      snapshotHash: snapshotBaseline.snapshotHash,
      productIdHash: snapshotBaseline.productIdHash,
      expectedCounts: snapshotBaseline.counts,
    },
  };

  const productRows = products.map((product) => {
    const raw = rawById.get(product.id);
    return {
      internal_id: productInternalIds.get(product.id),
      legacy_id: product.id,
      sku: product.sku,
      slug: product.slug,
      title: product.title,
      short_title: product.shortTitle,
      model: product.model,
      brand_id: core.brands.get(product.brandId).internal_id,
      primary_category_id: core.categories.get(product.primaryCategoryId).internal_id,
      series_id: product.seriesId ? seriesInternalIds.get(product.seriesId) : null,
      amount: product.pricing.amount,
      old_amount: product.pricing.oldAmount,
      currency: product.pricing.currency,
      price_status: product.pricing.priceStatus,
      inventory_status: product.inventory.status,
      publication_status: product.publicationStatus,
      description: product.description,
      short_description: product.shortDescription,
      full_description: product.fullDescription,
      description_sections: cloneJson(product.descriptionSections ?? []),
      badges: [...(product.badges ?? [])],
      seo_title: product.seo?.title ?? null,
      seo_description: product.seo?.description ?? null,
      archived_at: product.publicationStatus === 'archived' ? startedAt : null,
      last_import_run_id: importRunId,
      last_imported_at: startedAt,
      last_verified_at: verifiedAt(raw),
    };
  });

  const productCategoryRows = products.flatMap((product) => (product.secondaryCategoryIds ?? []).map((categoryId, index) => ({
    product_id: productInternalIds.get(product.id),
    category_id: core.categories.get(categoryId).internal_id,
    sort_order: index,
  })));

  const productAttributeRows = [];
  const attributeDiagnostics = { number: 0, string: 0, boolean: 0, selectText: 0, selectOption: 0 };
  for (const product of products) {
    for (const attribute of product.catalogAttributes ?? []) {
      const definition = core.attributes.get(attribute.id);
      if (!definition) throw new Error(`${product.id}: missing attribute definition ${attribute.id}.`);
      const row = {
        product_id: productInternalIds.get(product.id),
        attribute_id: definition.internal_id,
        value_number: null,
        value_text: null,
        value_boolean: null,
        option_id: null,
        source_label: attribute.sourceLabel || null,
        source_value: attribute.sourceValue === undefined ? null : cloneJson(attribute.sourceValue),
        provenance: attribute.provenance || 'canonical',
        normalization_rule: attribute.rule || null,
        source_unit: null,
        unit_override: attribute.unit && attribute.unit !== definition.unit ? attribute.unit : null,
        unit_status: attribute.unitStatus || null,
      };
      if (definition.value_type === 'number') {
        if (!Number.isFinite(attribute.value)) throw new Error(`${product.id}/${attribute.id}: invalid numeric value.`);
        row.value_number = attribute.value;
        attributeDiagnostics.number += 1;
      } else if (definition.value_type === 'boolean') {
        if (typeof attribute.value !== 'boolean') throw new Error(`${product.id}/${attribute.id}: invalid boolean value.`);
        row.value_boolean = attribute.value;
        attributeDiagnostics.boolean += 1;
      } else {
        row.value_text = String(attribute.value);
        attributeDiagnostics[definition.value_type === 'select' ? 'selectText' : 'string'] += 1;
      }
      productAttributeRows.push(row);
    }
  }

  const sourceRecordRows = [];
  const sourceAttributeRows = [];
  for (const product of products) {
    const raw = rawById.get(product.id);
    const sourceRecordId = uuidFromKey(`source-record:${product.source.supplier}:${product.source.sourceId}`);
    const serializedRaw = JSON.stringify(raw);
    sourceRecordRows.push({
      internal_id: sourceRecordId,
      product_id: productInternalIds.get(product.id),
      supplier_id: supplierInternalIds.get(product.source.supplier),
      source_id: product.source.sourceId,
      source_category: product.source.sourceCategory || null,
      source_url: sourceUrl(raw),
      mapping_status: validMappingStatus(product.source.mappingStatus),
      raw_payload: cloneJson(raw),
      payload_checksum: sha256(serializedRaw),
      import_run_id: importRunId,
      first_seen_at: startedAt,
      last_seen_at: startedAt,
      verified_at: verifiedAt(raw),
      active: true,
    });

    const mappedEvidence = new Map();
    for (const attribute of product.catalogAttributes ?? []) {
      if (!attribute.sourceLabel) continue;
      const key = stableStringify([attribute.sourceLabel, attribute.sourceValue]);
      if (!mappedEvidence.has(key)) mappedEvidence.set(key, attribute.id);
    }
    const evidence = [
      ...(product.sourceAttributes ?? []).map((attribute, index) => ({ ...attribute, layer: 'sourceAttributes', layerOrdinal: index })),
      ...(product.unmappedAttributes ?? []).map((attribute, index) => ({ ...attribute, layer: 'unmappedAttributes', layerOrdinal: index })),
    ];
    evidence.forEach((attribute, ordinal) => {
      const evidenceKey = stableStringify([attribute.label, attribute.value]);
      const mappedAttributeId = attribute.layer === 'sourceAttributes' ? mappedEvidence.get(evidenceKey) : null;
      sourceAttributeRows.push({
        internal_id: uuidFromKey(`source-attribute:${sourceRecordId}:${ordinal}`),
        product_id: productInternalIds.get(product.id),
        source_record_id: sourceRecordId,
        ordinal,
        label: String(attribute.label).trim(),
        source_value: cloneJson(attribute.value),
        normalized_attribute_id: mappedAttributeId ? core.attributes.get(mappedAttributeId)?.internal_id ?? null : null,
        mapping_status: mappedAttributeId ? 'mapped' : 'unmapped',
        mapping_notes: null,
        source_metadata: {
          canonicalLayer: attribute.layer,
          sourceOrdinal: attribute.layerOrdinal,
          provenance: attribute.provenance ?? null,
        },
        mapped_at: mappedAttributeId ? startedAt : null,
      });
    });
  }

  const mediaRows = [];
  const documentRows = [];
  for (const product of products) {
    const raw = rawById.get(product.id);
    const imageSources = Array.isArray(raw.imageSources) ? raw.imageSources : Array.isArray(raw.image_sources) ? raw.image_sources : [];
    (product.images ?? []).forEach((url, index) => {
      const source = imageSources.find((item) => item.local === url);
      const sourceType = String(source?.type ?? '').toLocaleLowerCase('en-US');
      mediaRows.push({
        internal_id: uuidFromKey(`media:${product.id}:${index}:${url}`),
        product_id: productInternalIds.get(product.id),
        media_type: 'image',
        role: index === 0 ? 'primary' : sourceType.includes('dimension') ? 'dimension' : 'gallery',
        url,
        storage_path: null,
        source_url: source?.source || source?.original || (index === 0 ? raw.imageSourceUrl || raw.image_source_url || null : null),
        alt_text: null,
        sort_order: index,
        active: true,
      });
    });
    (product.documents ?? []).forEach((document, index) => {
      documentRows.push({
        internal_id: uuidFromKey(`document:${product.id}:${index}:${document.url}`),
        product_id: productInternalIds.get(product.id),
        title: String(document.title || document.type || 'Document').trim(),
        document_type: documentType(document),
        url: document.url,
        storage_path: null,
        source_url: document.url,
        sort_order: index,
        active: true,
      });
    });
  }

  const uniqueTagNames = [...new Set(products.flatMap((product) => product.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))].sort();
  const tagRows = uniqueTagNames.map((name) => {
    const identity = tagIdentity(name);
    return {
      internal_id: uuidFromKey(`tag:${name}`),
      stable_id: identity.stableId,
      slug: identity.slug,
      name,
      origin: 'supplier',
      status: 'review',
    };
  });
  const tagIds = new Map(tagRows.map((row) => [row.name, row.internal_id]));
  const productTagRows = products.flatMap((product) => [...new Set(product.tags ?? [])].map((tag) => ({
    product_id: productInternalIds.get(product.id),
    tag_id: tagIds.get(String(tag).trim()),
    provenance: 'canonical-supplier-tag',
  })));

  const collectionDefinitions = [
    ...[...new Set(products.flatMap((product) => product.collections ?? []))].sort().map((stableId, index) => ({
      stableId,
      title: stableId,
      type: stableId === 'sale' ? 'promotion' : 'manual',
      sortOrder: 100 + index,
      productIds: products.filter((product) => (product.collections ?? []).includes(stableId)).map((product) => product.id),
    })),
    { stableId: 'homepage-products', title: 'homepageProductIds', type: 'featured', sortOrder: 10, productIds: homepage.homepageProductIds },
    { stableId: 'homepage-sale-products', title: 'homepageSaleProductIds', type: 'promotion', sortOrder: 20, productIds: homepage.homepageSaleProductIds },
  ];
  const collectionRows = collectionDefinitions.map((collection) => ({
    internal_id: uuidFromKey(`collection:${collection.stableId}`),
    stable_id: collection.stableId,
    slug: collection.stableId,
    title: collection.title,
    description: '',
    collection_type: collection.type,
    active: true,
    date_from: null,
    date_to: null,
    sort_order: collection.sortOrder,
    seo_title: null,
    seo_description: null,
  }));
  const collectionIds = new Map(collectionRows.map((row) => [row.stable_id, row.internal_id]));
  const collectionItemRows = collectionDefinitions.flatMap((collection) => collection.productIds.map((productId, index) => {
    if (!canonicalById.has(productId)) throw new Error(`${collection.stableId}: unknown product ${productId}.`);
    return {
      collection_id: collectionIds.get(collection.stableId),
      product_id: productInternalIds.get(productId),
      sort_order: index,
    };
  }));

  const sourceRecordIds = new Map(sourceRecordRows.map((row) => [row.product_id, row.internal_id]));
  const categoryReviewRows = categoryReview.items.map((review) => ({
    internal_id: uuidFromKey(`category-review:${review.productId}`),
    product_id: productInternalIds.get(review.productId),
    source_record_id: sourceRecordIds.get(productInternalIds.get(review.productId)),
    current_category_id: core.categories.get(review.currentCategory)?.internal_id,
    suggested_category_id: core.categories.get(review.suggestedCategory)?.internal_id,
    source_category: review.sourceCategory || null,
    reason: review.reason || '',
    confidence: review.confidence,
    status: review.status,
    resolved_at: null,
  }));
  if (categoryReviewRows.some((row) => !row.product_id || !row.current_category_id || !row.suggested_category_id)) {
    throw new Error('Category mapping review contains an unresolved product/category reference.');
  }

  const diagnostics = {
    seriesNameFallbacks,
    attributeValues: attributeDiagnostics,
    selectValues: {
      mappedToOption: attributeDiagnostics.selectOption,
      storedAsReviewedText: attributeDiagnostics.selectText,
      unmappedRaw: sourceAttributeRows.filter((row) => row.mapping_status === 'unmapped').length,
    },
    sourceEvidence: {
      sourceAttributeRows: snapshotBaseline.counts.sourceAttributeRows,
      unmappedAttributeRows: snapshotBaseline.counts.unmappedAttributeRows,
      totalRows: sourceAttributeRows.length,
      unmappedProducts: snapshotBaseline.counts.unmappedProducts,
    },
    tags: { canonicalActive: 0, supplierReview: tagRows.length },
    media: {
      rows: mediaRows.length,
      productsWithoutMedia: snapshotBaseline.counts.productsWithoutMedia,
      productsWithOneMedia: snapshotBaseline.counts.productsWithOneMedia,
      productsWithMultipleMedia: snapshotBaseline.counts.productsWithMultipleMedia,
    },
    documents: {
      rows: documentRows.length,
      invalidUrls: documentRows.filter((row) => !/^https?:\/\//.test(row.url) && !row.url.startsWith('/')).length,
      exactDuplicates: documentRows.length - new Set(documentRows.map((row) => `${row.product_id}|${row.url}|${row.title}`)).size,
    },
  };

  return {
    importRun,
    productInternalIds,
    managedProductIds: [...productInternalIds.values()],
    managedCollectionIds: [...collectionIds.values()],
    supplierRows,
    seriesRows: [...seriesMap.values()],
    productRows,
    productCategoryRows,
    attributeOptionRows: [],
    productAttributeRows,
    sourceRecordRows,
    sourceAttributeRows,
    mediaRows,
    documentRows,
    tagRows,
    productTagRows,
    collectionRows,
    collectionItemRows,
    categoryReviewRows,
    diagnostics,
  };
}

export function buildSnapshotBaseline({ state, homepage, categoryReview }) {
  const snapshot = state.sofievkaCatalogSnapshot;
  const catalog = state.sofievkaCatalog;
  const products = snapshot.products;
  const rawProducts = Array.isArray(state.sofievkaRawSupplierProducts) ? state.sofievkaRawSupplierProducts : [];
  const rawById = new Map(rawProducts.map((product) => [product.id, product]));
  const allCatalogAttributes = products.flatMap((product) => product.catalogAttributes ?? []);
  const allSourceAttributes = products.flatMap((product) => product.sourceAttributes ?? []);
  const allUnmappedAttributes = products.flatMap((product) => product.unmappedAttributes ?? []);
  const allMedia = products.flatMap((product) => product.images ?? []);
  const allDocuments = products.flatMap((product) => product.documents ?? []);
  const seriesIds = [...new Set(products.map((product) => product.seriesId).filter(Boolean))].sort();
  const tagValues = [...new Set(products.flatMap((product) => product.tags ?? []).map(String))].sort();
  const collectionValues = [...new Set(products.flatMap((product) => product.collections ?? []).map(String))].sort();
  const curatedOptionDefinitions = Object.values(catalog.attributeDefinitions).filter((definition) => Array.isArray(definition.options) && definition.options.length > 0);
  const explicitSeo = products.filter((product) => product.seo?.title || product.seo?.description).length;
  const secondaryCategoryRows = products.reduce((total, product) => total + (product.secondaryCategoryIds?.length ?? 0), 0);
  const oldPriceCount = products.filter((product) => product.pricing?.oldAmount !== null && product.pricing?.oldAmount !== undefined).length;
  const productMediaDistribution = countBy(products, (product) => String(product.images?.length ?? 0));
  const sourceAttributeProducts = products.filter((product) => (product.sourceAttributes?.length ?? 0) > 0).length;
  const unmappedProducts = products.filter((product) => (product.unmappedAttributes?.length ?? 0) > 0).length;
  const sourceUnmappedExactOverlap = products.reduce((total, product) => {
    const sourceValues = new Set((product.sourceAttributes ?? []).map((attribute) => stableStringify([attribute.label, attribute.value])));
    return total + (product.unmappedAttributes ?? []).filter((attribute) => sourceValues.has(stableStringify([attribute.label, attribute.value]))).length;
  }, 0);
  const supplierIds = [...new Set(products.map((product) => product.source?.supplier).filter(Boolean))].sort();

  return {
    reportVersion: 'catalog-migration-baseline-v1',
    generatedAt: new Date().toISOString(),
    snapshotVersion: snapshot.version,
    snapshotHash: sha256(stableStringify(products)),
    productIdHash: sortedLinesHash(products.map((product) => product.id)),
    counts: {
      products: products.length,
      catalogProducts: catalog.catalogProducts.length,
      serviceItems: catalog.serviceItems.length,
      brands: snapshot.brands.length,
      brandsWithProducts: new Set(products.map((product) => product.brandId)).size,
      categories: snapshot.categories.length,
      primaryCategoriesWithProducts: new Set(products.map((product) => product.primaryCategoryId)).size,
      attributeDefinitions: Object.keys(snapshot.attributeDefinitions).length,
      series: seriesIds.length,
      suppliers: supplierIds.length,
      secondaryCategoryRows,
      typedAttributeRows: allCatalogAttributes.length,
      sourceAttributeRows: allSourceAttributes.length,
      sourceEvidenceRows: allSourceAttributes.length + allUnmappedAttributes.length,
      sourceAttributeProducts,
      unmappedAttributeRows: allUnmappedAttributes.length,
      unmappedProducts,
      sourceUnmappedExactOverlap,
      mediaRows: allMedia.length,
      productsWithoutMedia: products.filter((product) => (product.images?.length ?? 0) === 0).length,
      productsWithOneMedia: products.filter((product) => (product.images?.length ?? 0) === 1).length,
      productsWithMultipleMedia: products.filter((product) => (product.images?.length ?? 0) > 1).length,
      documentRows: allDocuments.length,
      productsWithDocuments: products.filter((product) => (product.documents?.length ?? 0) > 0).length,
      tagValues: tagValues.length,
      collectionValues: collectionValues.length,
      categoryMappingReviews: categoryReview.items.length,
      homepageProducts: homepage.homepageProductIds.length,
      homepageSaleProducts: homepage.homepageSaleProductIds.length,
      explicitSeo,
      fallbackOnlySeo: products.length - explicitSeo,
      oldPriceRows: oldPriceCount,
      rawProducts: rawProducts.length,
      rawProductsMatched: products.filter((product) => rawById.has(product.id)).length,
      curatedOptionDefinitions: curatedOptionDefinitions.length,
    },
    byBrand: countBy(products, (product) => product.brandId),
    byPrimaryCategory: countBy(products, (product) => product.primaryCategoryId),
    pricing: countBy(products, (product) => product.pricing.priceStatus),
    inventory: countBy(products, (product) => product.inventory.status),
    publication: countBy(products, (product) => product.publicationStatus),
    typedAttributesByDefinition: countBy(allCatalogAttributes, (attribute) => attribute.id),
    mediaPerProductDistribution: productMediaDistribution,
    seriesIds,
    supplierIds,
    tagValues,
    collectionValues,
    homepage: cloneJson(homepage),
  };
}
