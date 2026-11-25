// One reviewable correction for the frozen imported 401211 source error.
// It does not regenerate the published import batch or release manifest.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { readyPayload } from "./prepare-brand-release.mjs";
import { curateTervixSpecifications } from "./tervix-specification-quality.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
export const SOURCE_REF = "three-brands-20261125-0f27bb511996/tervix-2026-11-25.json/001";
const literal = value => "E'" + String(value).replaceAll("\\", "\\\\").replaceAll("'", "''") + "'";

export function tervix401211CorrectionPlan(payload, sourceRef = SOURCE_REF) {
  if (payload.legacyId !== "tervix-4013" || payload.sku !== "401211" || payload.sourceId !== "4013" || payload.brand !== "tervix") throw Error("Unexpected correction identity.");
  const curated = curateTervixSpecifications(payload.characteristics, { sku: payload.sku, sourceUrl: payload.sourceUrl });
  if (curated.sourceIssues.length !== 1 || curated.sourceIssues[0].field !== "Споживана потужність" || curated.sourceIssues[0].values[0] !== "> 1A") throw Error("The expected source defect changed.");
  const paragraph = "Споживана потужність: > 1A.";
  let removedParagraphs = 0;
  const sections = payload.sections.map(section => ({ ...section, paragraphs: section.paragraphs.filter(text => { if (text === paragraph) { removedParagraphs++; return false; } return true; }) }));
  const parts = payload.fullDescription.split("\n\n");
  if (removedParagraphs !== 1 || parts.filter(text => text === paragraph).length !== 1) throw Error("The expected repeated technical paragraph changed.");
  return { expected: { legacyId: payload.legacyId, sku: payload.sku, sourceId: payload.sourceId, title: payload.title, characteristics: payload.characteristics, fullDescription: payload.fullDescription, sections: payload.sections },
    corrected: { characteristics: curated.characteristics, fullDescription: parts.filter(text => text !== paragraph).join("\n\n"), sections },
    sourceRef, issue: { id: "tervix-401211-power-unit-2026-11-25", ...curated.sourceIssues[0], sourceRef, removedParagraph: paragraph } };
}

export function tervix401211CorrectionSql(payload, sourceRef = SOURCE_REF) {
  const plan = tervix401211CorrectionPlan(payload, sourceRef), json = JSON.stringify(plan);
  let tag = "$tervix_quality_" + createHash("sha256").update(json).digest("hex").slice(0, 12) + "$";
  while (json.includes(tag)) tag = tag.slice(0, -1) + "_$";
  return `-- Scoped, source-preserving correction of one unsupported manufacturer specification.
begin;
do ${tag}
declare
  plan jsonb := ${literal(json)}::jsonb;
  target public.products%rowtype;
  source_record public.product_source_records%rowtype;
  run_record public.import_runs%rowtype;
  before_product jsonb;
  before_source jsonb;
  before_run jsonb;
  source_evidence jsonb;
  corrections jsonb;
  updated_source jsonb;
  active_version text;
  snapshot_payload jsonb;
  already_corrected boolean;
begin
  select product.* into target from public.products product
  join public.import_runs run on run.internal_id=product.last_import_run_id
  join public.brands brand on brand.internal_id=product.brand_id
  where product.legacy_id=plan #>> '{expected,legacyId}' and product.sku=plan #>> '{expected,sku}'
    and product.title=plan #>> '{expected,title}' and brand.stable_id='tervix'
    and product.publication_status='published' and run.status='succeeded' and run.source_ref=plan ->> 'sourceRef'
  for update of product;
  if not found then raise exception 'Tervix quality correction refused: exact published import-owned product not found'; end if;
  select * into run_record from public.import_runs where internal_id=target.last_import_run_id;
  select * into source_record from public.product_source_records
    where product_id=target.internal_id and import_run_id=target.last_import_run_id
      and supplier_id=run_record.supplier_id and source_id=plan #>> '{expected,sourceId}' for update;
  if not found then raise exception 'Tervix quality correction refused: source record ownership mismatch'; end if;
  select snapshot_version into active_version from public.catalog_snapshot_pointer where singleton;
  select payload into snapshot_payload from public.catalog_product_snapshots
    where legacy_id=target.legacy_id and snapshot_version=active_version for update;
  if not found then raise exception 'Tervix quality correction refused: active product snapshot missing'; end if;
  source_evidence := coalesce(source_record.raw_payload -> 'sourceEvidence','{}'::jsonb);
  corrections := coalesce(source_evidence -> 'qualityCorrections','[]'::jsonb);
  if jsonb_typeof(source_evidence)<>'object' or jsonb_typeof(corrections)<>'array' then
    raise exception 'Tervix quality correction refused: unexpected provenance shape';
  end if;
  already_corrected := target.full_description=plan #>> '{corrected,fullDescription}'
    and target.description_sections=plan #> '{corrected,sections}'
    and source_record.raw_payload -> 'characteristics'=plan #> '{corrected,characteristics}'
    and corrections @> jsonb_build_array(plan -> 'issue');
  if already_corrected then
    if snapshot_payload -> 'unmappedAttributes' is distinct from plan #> '{corrected,characteristics}'
      or snapshot_payload -> 'sourceAttributes' is distinct from plan #> '{corrected,characteristics}'
      or snapshot_payload ->> 'fullDescription' is distinct from plan #>> '{corrected,fullDescription}'
      or snapshot_payload -> 'descriptionSections' is distinct from plan #> '{corrected,sections}' then
      raise exception 'Tervix quality correction refused: corrected snapshot differs';
    end if;
    return;
  end if;
  if target.full_description is distinct from plan #>> '{expected,fullDescription}'
    or target.description_sections is distinct from plan #> '{expected,sections}'
    or source_record.raw_payload -> 'characteristics' is distinct from plan #> '{expected,characteristics}'
    or snapshot_payload -> 'unmappedAttributes' is distinct from plan #> '{expected,characteristics}'
    or snapshot_payload -> 'sourceAttributes' is distinct from plan #> '{expected,characteristics}'
    or exists(select 1 from jsonb_array_elements(corrections) correction where correction ->> 'id'=plan #>> '{issue,id}') then
    raise exception 'Tervix quality correction refused: original values changed';
  end if;
  before_product := to_jsonb(target)-'updated_at'-'full_description'-'description_sections';
  before_source := to_jsonb(source_record)-'updated_at'-'raw_payload';
  before_run := to_jsonb(run_record);
  updated_source := jsonb_set(source_record.raw_payload,'{characteristics}',plan #> '{corrected,characteristics}',true);
  source_evidence := source_evidence || jsonb_build_object('qualityCorrections',corrections || jsonb_build_array(plan -> 'issue'));
  updated_source := jsonb_set(updated_source,'{sourceEvidence}',source_evidence,true);
  update public.product_source_records set raw_payload=updated_source where internal_id=source_record.internal_id;
  update public.products set full_description=plan #>> '{corrected,fullDescription}', description_sections=plan #> '{corrected,sections}' where internal_id=target.internal_id;
  -- The read-model builder preserves sourceAttributes/unmappedAttributes from the existing snapshot.
  -- Seed only these two source-backed arrays, then refresh the remaining public fields canonically.
  update public.catalog_product_snapshots set payload=jsonb_set(jsonb_set(payload,'{sourceAttributes}',plan #> '{corrected,characteristics}',true),'{unmappedAttributes}',plan #> '{corrected,characteristics}',true), updated_at=now()
    where legacy_id=target.legacy_id and snapshot_version=active_version;
  perform public._admin_refresh_catalog(array[target.internal_id]);
  if (select to_jsonb(product)-'updated_at'-'full_description'-'description_sections' from public.products product where internal_id=target.internal_id) is distinct from before_product
    or (select to_jsonb(source)-'updated_at'-'raw_payload' from public.product_source_records source where internal_id=source_record.internal_id) is distinct from before_source
    or (select to_jsonb(run) from public.import_runs run where internal_id=run_record.internal_id) is distinct from before_run then
    raise exception 'Tervix quality correction changed protected product/source/run fields';
  end if;
  select payload into snapshot_payload from public.catalog_product_snapshots where legacy_id=target.legacy_id and snapshot_version=active_version;
  if snapshot_payload -> 'unmappedAttributes' is distinct from plan #> '{corrected,characteristics}'
    or snapshot_payload -> 'sourceAttributes' is distinct from plan #> '{corrected,characteristics}'
    or snapshot_payload ->> 'fullDescription' is distinct from plan #>> '{corrected,fullDescription}'
    or snapshot_payload -> 'descriptionSections' is distinct from plan #> '{corrected,sections}' then
    raise exception 'Tervix quality correction failed to synchronize the public snapshot';
  end if;
end;
${tag};
commit;
`;
}

export function frozenTervix401211Payload() {
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,"imports/releases/three-brands-20261125-0f27bb511996/manifest.json"),"utf8"));
  const chunk=manifest.chunks.find(chunk=>chunk.ids.includes("tervix-4013"));
  if (!chunk || chunk.sourceRef!==SOURCE_REF) throw Error("Frozen Tervix release reference changed.");
  return readyPayload(fs.readFileSync(path.join(ROOT,chunk.file),"utf8")).find(product=>product.legacyId==="tervix-4013");
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href && process.argv.includes("--write")) {
  const sql=tervix401211CorrectionSql(frozenTervix401211Payload());
  const file=path.join(ROOT,"imports/tervix-401211-quality-fix.sql");
  fs.writeFileSync(file,sql); console.log(JSON.stringify({file,bytes:Buffer.byteLength(sql),sourceRef:SOURCE_REF,products:1}));
}
