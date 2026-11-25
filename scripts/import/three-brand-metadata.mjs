// Explicit prerequisites for the approved Valrom / General Fittings / Tervix import.
// This file generates SQL; it never connects to or writes a hosted database.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const attributes = [
  { id: 'pipeDiameterMm', label: 'Зовнішній діаметр труби, мм', unit: 'мм' },
  { id: 'pipeLengthMm', label: 'Довжина труби, мм', unit: 'мм' },
  { id: 'angleDegrees', label: 'Кут, °', unit: '°' },
];
const pipeFacets = ['pipeDiameterMm', 'pipeLengthMm', 'angleDegrees', 'connection', 'material', 'pressureBar'];
export const categories = [
  { id: 'internal-sewerage', parent: 'sewerage', title: 'Внутрішня каналізація', order: 354, facets: [] },
  { id: 'internal-sewer-pipes', parent: 'internal-sewerage', title: 'Труби внутрішньої каналізації', order: 355, facets: pipeFacets },
  { id: 'internal-sewer-fittings', parent: 'internal-sewerage', title: 'Фітинги внутрішньої каналізації', order: 356, facets: pipeFacets },
  { id: 'external-sewerage', parent: 'sewerage', title: 'Зовнішня каналізація', order: 357, facets: [] },
  { id: 'external-sewer-pipes', parent: 'external-sewerage', title: 'Труби зовнішньої каналізації', order: 358, facets: pipeFacets },
  { id: 'external-sewer-fittings', parent: 'external-sewerage', title: 'Фітинги зовнішньої каналізації', order: 359, facets: pipeFacets },
  { id: 'drainage-pipes', parent: 'sewerage', title: 'Дренажні труби й комплектуючі', order: 361, facets: pipeFacets },
  { id: 'inspection-chambers', parent: 'sewerage', title: 'Каналізаційні колодязі й комплектуючі', order: 362, facets: ['pipeDiameterMm', 'heightMm', 'material'] },
  { id: 'wastewater-treatment', parent: 'sewerage', title: 'Очищення стічних вод', order: 363, facets: ['volumeL', 'flowM3h', 'material'] },
  { id: 'sewer-installation-components', parent: 'sewerage', title: 'Монтажні комплектуючі каналізації', order: 364, facets: ['pipeDiameterMm', 'connection', 'material'] },
  { id: 'pipe-fittings', parent: 'water-supply', title: 'Фітинги для труб', order: 291, facets: pipeFacets },
  { id: 'shutoff-valves', parent: 'water-supply', title: 'Крани й запірна арматура', order: 292, facets: ['connection', 'material', 'pressureBar', 'flowM3h'] },
  { id: 'leak-protection', parent: 'water-supply', title: 'Захист від протікання води', order: 293, facets: ['productType', 'connection', 'communication', 'control', 'voltage', 'protectionClass', 'zones', 'pressureBar'] },
];
export const brand = {
  id: 'tervix', name: 'Tervix', website: 'https://tervix.ua/',
  description: 'Системи захисту від протікання води, датчики та автоматика для інженерних систем.',
};
const literal = value => value == null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";

export function metadataSql() {
  return `-- Additive metadata only. Approved three-brand catalogue extension, 2026-11-25.
-- Existing brands/categories/definitions and all existing products are preserved.
begin;
do $brand_metadata$
declare
  category_spec jsonb; attribute_spec jsonb;
  parent_row public.categories%rowtype;
  category_row public.categories%rowtype;
  attribute_row public.attribute_definitions%rowtype;
  brand_row public.brands%rowtype;
  facet_id text; ordinal integer;
begin
  -- Existing brand content is retained; fill only the previously missing official logo.
  update public.brands set logo_url='/assets/brands/general-fittings.svg'
  where stable_id='general-fittings' and nullif(btrim(logo_url),'') is null;
  if found then
    perform public._taxonomy_patch_release('brands','general-fittings',jsonb_build_object('logo','/assets/brands/general-fittings.svg'));
  end if;
  insert into public.brands (stable_id, slug, name, website_url, description, logo_url, visibility, status)
  values (${literal(brand.id)}, ${literal(brand.id)}, ${literal(brand.name)}, ${literal(brand.website)}, ${literal(brand.description)}, '/assets/brands/tervix.png', 'catalog', 'active')
  on conflict (stable_id) do nothing;
  select * into strict brand_row from public.brands where stable_id = ${literal(brand.id)};
  if brand_row.status <> 'active' then raise exception 'Requested brand is inactive'; end if;
  perform public._taxonomy_put_release_entry('brands', brand_row.stable_id, public._taxonomy_brand_release_entry(brand_row));

  for attribute_spec in select value from jsonb_array_elements(${literal(JSON.stringify(attributes))}::jsonb) loop
    insert into public.attribute_definitions (stable_id, label, value_type, unit, filterable, sortable, sort_order)
    values (attribute_spec->>'id', attribute_spec->>'label', 'number', attribute_spec->>'unit', true, true, 70)
    on conflict (stable_id) do nothing;
    select * into strict attribute_row from public.attribute_definitions where stable_id = attribute_spec->>'id';
    if attribute_row.value_type <> 'number' or attribute_row.unit is distinct from attribute_spec->>'unit' then
      raise exception 'Attribute identity/type conflict: %', attribute_row.stable_id;
    end if;
    perform public._attributes_put_release_definition(attribute_row.stable_id, public._attributes_release_fields(attribute_row),
      jsonb_build_object('semanticId', attribute_row.stable_id, 'aliases', '[]'::jsonb));
  end loop;

  for category_spec in select value from jsonb_array_elements(${literal(JSON.stringify(categories))}::jsonb) loop
    select * into strict parent_row from public.categories where stable_id = category_spec->>'parent' and status = 'active';
    insert into public.categories (stable_id, slug, parent_id, level, title, short_title, sort_order, status, visibility)
    values (category_spec->>'id', category_spec->>'id', parent_row.internal_id, parent_row.level + 1,
      category_spec->>'title', category_spec->>'title', (category_spec->>'order')::integer, 'active', 'catalog')
    on conflict (stable_id) do nothing;
    select * into strict category_row from public.categories where stable_id = category_spec->>'id';
    if category_row.parent_id is distinct from parent_row.internal_id or category_row.status <> 'active' or category_row.visibility <> 'catalog' then
      raise exception 'Category identity/state conflict: %', category_row.stable_id;
    end if;
    ordinal := 0;
    for facet_id in select jsonb_array_elements_text(category_spec->'facets') loop
      select * into strict attribute_row from public.attribute_definitions where stable_id = facet_id and status = 'active';
      insert into public.category_attributes (category_id, attribute_id, facet_enabled, sort_order)
      values (category_row.internal_id, attribute_row.internal_id, attribute_row.filterable, ordinal)
      on conflict (category_id, attribute_id) do nothing;
      ordinal := ordinal + 1;
    end loop;
    perform public._taxonomy_put_release_entry('categories', category_row.stable_id, public._taxonomy_category_release_entry(category_row));
    perform public._attributes_sync_category_release(array[category_row.internal_id]);
  end loop;
end;
$brand_metadata$;
commit;
`;
}

export function stagedReference(reference) {
  const result = structuredClone(reference);
  if (!result.brands.some(row => row.id === brand.id)) result.brands.push({ id: brand.id, name: brand.name, status: 'active' });
  for (const row of attributes) {
    result.attributes[row.id] ??= { type: 'number', label: row.label, unit: row.unit, values: [] };
  }
  for (const row of categories) {
    if (result.categories.some(category => category.id === row.id)) continue;
    result.categories.push({ id: row.id, title: row.title, status: 'active', visibility: 'catalog',
      leaf: !categories.some(child => child.parent === row.id), facets: row.facets });
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(import.meta.dirname, '../..');
  const reference = JSON.parse(fs.readFileSync(path.join(root, 'imports/reference-prod.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'imports/three-brand-metadata.sql'), metadataSql());
  fs.writeFileSync(path.join(root, 'imports/reference-staged.json'), JSON.stringify(stagedReference(reference), null, 2) + '\n');
  console.log(JSON.stringify({ categories: categories.length, numericAttributes: attributes.length, newBrand: brand.id, hostedWrites: false }));
}
