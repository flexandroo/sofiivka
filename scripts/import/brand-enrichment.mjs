// Preserve source-only import metadata and attach genuine manufacturer series.
// The returned DO statement belongs INSIDE the caller's scoped draft transaction.
// It never changes prices, publication, characteristics, or existing series content.
import { createHash } from "node:crypto";

const METADATA_KEYS = ["sourceEvidence", "series", "priceCurrency", "vatIncluded", "related", "ean"];
const literal = value => "E'" + String(value).replaceAll("\\", "\\\\").replaceAll("'", "''") + "'";
const required = (value, label) => {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new TypeError(`${label} must be a nonempty text value without NUL.`);
  return value;
};

/**
 * @param {Array<{legacyId:string, sourceId:string, sku:string, brand:string, original:object}>} rows
 * @param {string} sourceRef Exact import_runs.source_ref of this chunk.
 * @returns {string} One atomic DML DO statement, without BEGIN / COMMIT.
 */
export function enrichmentSql(rows, sourceRef) {
  required(sourceRef, "sourceRef");
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array.");
  if (!rows.length) return "-- No new products require source enrichment.\n";
  const ids = new Set();
  const payload = rows.map(row => {
    const legacyId = required(row.legacyId, "legacyId");
    if (ids.has(legacyId)) throw new Error(`Duplicate enrichment legacyId: ${legacyId}`);
    ids.add(legacyId);
    if (!row.original || typeof row.original !== "object" || Array.isArray(row.original)) throw new TypeError(`${legacyId}: original batch product is required.`);
    const metadata = Object.fromEntries(METADATA_KEYS.filter(key => Object.hasOwn(row.original, key) && row.original[key] !== undefined).map(key => [key, row.original[key]]));
    return { legacyId, sourceId: required(row.sourceId, "sourceId"), sku: required(row.sku, "sku"), brand: required(row.brand, "brand"),
      seriesName: typeof row.original.series === "string" && row.original.series.trim() ? row.original.series.trim().replace(/\s+/g, " ") : null,
      metadata };
  });
  const json = JSON.stringify(payload);
  if (json.includes("\\u0000")) throw new TypeError("Source metadata cannot contain NUL.");
  // The DO body's delimiter must not occur even inside an otherwise safely quoted input literal.
  let tag = "$brand_enrichment_" + createHash("sha256").update(json + sourceRef).digest("hex").slice(0, 16) + "$";
  while (json.includes(tag) || sourceRef.includes(tag)) tag = tag.slice(0, -1) + "_$";
  return `-- Enrich only the new drafts owned by this exact import run.
do ${tag}
declare
  item jsonb;
  target public.products%rowtype;
  source_record public.product_source_records%rowtype;
  run_supplier uuid;
  brand_stable text;
  series_name text;
  series_slug text;
  series_stable text;
  series_value uuid;
  series_matches integer;
begin
  for item in select value from jsonb_array_elements(${literal(json)}::jsonb) loop
    select product.* into target
    from public.products product
    join public.import_runs run on run.internal_id = product.last_import_run_id
    join public.brands brand on brand.internal_id = product.brand_id
    where product.legacy_id = item ->> 'legacyId'
      and lower(product.sku) = lower(item ->> 'sku')
      and brand.stable_id = item ->> 'brand'
      and run.source_ref = ${literal(sourceRef)} and run.status = 'succeeded'
      and product.publication_status in ('draft','published')
    for update of product;
    if not found then
      raise exception 'Brand enrichment refused: product % is not owned by source_ref %', item ->> 'legacyId', ${literal(sourceRef)};
    end if;
    select supplier_id into run_supplier from public.import_runs where internal_id = target.last_import_run_id;
    select * into source_record from public.product_source_records
    where product_id = target.internal_id and import_run_id = target.last_import_run_id
      and supplier_id = run_supplier and source_id = item ->> 'sourceId'
    for update;
    if not found or jsonb_typeof(source_record.raw_payload) <> 'object' then
      raise exception 'Brand enrichment refused: source record for % is not owned by this import', item ->> 'legacyId';
    end if;
    if exists (select 1 from jsonb_each(item -> 'metadata') entry
      where source_record.raw_payload ? entry.key and source_record.raw_payload -> entry.key is distinct from entry.value) then
      raise exception 'Brand enrichment refused: source metadata for % already differs', item ->> 'legacyId';
    end if;

    series_name := nullif(item ->> 'seriesName', '');
    if target.publication_status = 'published' then
      -- A resumed atomic release may encounter its own already-published rows.
      -- This path only verifies the completed enrichment; it must never repair or overwrite edits.
      if exists (select 1 from jsonb_each(item -> 'metadata') entry
        where not source_record.raw_payload ? entry.key or source_record.raw_payload -> entry.key is distinct from entry.value) then
        raise exception 'Brand enrichment refused: published metadata for % is incomplete or differs', item ->> 'legacyId';
      end if;
      if series_name is null then
        if target.series_id is not null then raise exception 'Brand enrichment refused: published series for % differs', item ->> 'legacyId'; end if;
      else
        select count(*)::integer, (array_agg(internal_id order by internal_id))[1]
        into series_matches, series_value from public.product_series
        where brand_id = target.brand_id and lower(name) = lower(series_name);
        if series_matches <> 1 or target.series_id is distinct from series_value then
          raise exception 'Brand enrichment refused: published series for % differs', item ->> 'legacyId';
        end if;
      end if;
      continue;
    end if;
    if series_name is not null then
      select count(*)::integer, (array_agg(internal_id order by internal_id))[1]
      into series_matches, series_value from public.product_series
      where brand_id = target.brand_id and lower(name) = lower(series_name);
      if series_matches > 1 then raise exception 'Ambiguous existing brand series %', series_name; end if;
      if series_matches = 0 then
        series_slug := coalesce(nullif(public._catalog_slugify(series_name), ''), 'series-' || substr(md5(series_name), 1, 12));
        if exists (select 1 from public.product_series where brand_id = target.brand_id and slug = series_slug) then
          series_slug := left(series_slug, 60) || '-' || substr(md5(lower(series_name)), 1, 12);
        end if;
        select stable_id into brand_stable from public.brands where internal_id = target.brand_id;
        series_stable := left(brand_stable || '-' || series_slug, 100) || '-' || substr(md5(brand_stable || ':' || lower(series_name)), 1, 12);
        insert into public.product_series (stable_id, brand_id, slug, name)
        values (series_stable, target.brand_id, series_slug, series_name)
        on conflict do nothing;
        select count(*)::integer, (array_agg(internal_id order by internal_id))[1]
        into series_matches, series_value from public.product_series
        where brand_id = target.brand_id and lower(name) = lower(series_name);
        if series_matches <> 1 then raise exception 'Unable to resolve brand series % safely', series_name; end if;
      end if;
      if target.series_id is not null and target.series_id <> series_value then
        raise exception 'Brand enrichment refused: series for % was already assigned differently', item ->> 'legacyId';
      end if;
      update public.products set series_id = series_value
      where internal_id = target.internal_id and series_id is null;
    end if;

    -- Metadata is an allowlist, so the importer's cleaned characteristics can never be replaced.
    update public.product_source_records set raw_payload = raw_payload || (item -> 'metadata')
    where internal_id = source_record.internal_id
      and raw_payload is distinct from raw_payload || (item -> 'metadata');
  end loop;
end;
${tag};
`;
}
