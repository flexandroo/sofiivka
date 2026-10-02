-- Attributes Admin v1: characteristic definitions and per-category catalogue filters.
-- Staff edit attribute definitions (label, unit, filter/sort flags, order, select options) and
-- which characteristics each category uses and shows as filters. Every save patches the active
-- release JSON the storefront reads (attribute_definitions entry, category facetIds and
-- allowedFacetIds) and bumps the admin cache revision so clients refetch.
--
-- Release contract kept here:
--   category.allowedFacetIds = every characteristic linked to the category, in category order;
--   category.facetIds        = the linked characteristics shown as filters (facet_enabled);
--   attribute_definitions[id] = { id, label, type, unit, filterable, sortable, rank, options, ... }.
-- The storefront still drops non-filterable definitions and shows at most 9 filters with 2+ values.
--
-- The stable id (code) of a characteristic is set once at creation: product snapshots, URLs with
-- filters and the static storefront schema refer to it. The value type can change only while no
-- product has a value for the characteristic.

alter table public.taxonomy_admin_audit drop constraint if exists taxonomy_admin_audit_entity_type_check;
alter table public.taxonomy_admin_audit
  add constraint taxonomy_admin_audit_entity_type_check check (entity_type in ('brand', 'category', 'homepage', 'collection', 'attribute'));

-- lowerCamelCase code from Ukrainian or Latin text: "Робочий тиск" -> "robochyiTysk".
create or replace function public._attributes_code_from_label(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(string_agg(case when part.ordinal = 1 then part.word else initcap(part.word) end, '' order by part.ordinal), 60), '')
  from unnest(string_to_array(coalesce(public._taxonomy_slugify(raw), ''), '-')) with ordinality as part(word, ordinal)
  where part.word <> ''
$$;

create or replace function public._attributes_type_valid(raw text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(raw in ('number', 'string', 'boolean', 'select'), false)
$$;

-- Category filter configuration in category order. Also the source of the concurrency token.
create or replace function public._attributes_category_config(target_category_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', definition.stable_id,
    'facetEnabled', relation.facet_enabled,
    'required', relation.required,
    'sortOrder', relation.sort_order
  ) order by relation.sort_order, definition.stable_id), '[]'::jsonb)
  from public.category_attributes relation
  join public.attribute_definitions definition on definition.internal_id = relation.attribute_id
  where relation.category_id = target_category_id
$$;

-- Rewrite facetIds / allowedFacetIds of the given categories in the active release.
create or replace function public._attributes_sync_category_release(target_category_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_version text;
begin
  if coalesce(cardinality(target_category_ids), 0) = 0 then return; end if;
  active_version := public._taxonomy_lock_release();
  if active_version is null then return; end if;

  update public.catalog_snapshot_releases release
  set categories = (
        select coalesce(jsonb_agg(
          case when category.internal_id is null then item.value
          else item.value || jsonb_build_object(
            'facetIds', coalesce((
              select jsonb_agg(definition.stable_id order by relation.sort_order, definition.stable_id)
              from public.category_attributes relation
              join public.attribute_definitions definition on definition.internal_id = relation.attribute_id
              where relation.category_id = category.internal_id and relation.facet_enabled
            ), '[]'::jsonb),
            'allowedFacetIds', coalesce((
              select jsonb_agg(definition.stable_id order by relation.sort_order, definition.stable_id)
              from public.category_attributes relation
              join public.attribute_definitions definition on definition.internal_id = relation.attribute_id
              where relation.category_id = category.internal_id
            ), '[]'::jsonb))
          end order by item.ordinal), '[]'::jsonb)
        from jsonb_array_elements(release.categories) with ordinality as item(value, ordinal)
        left join public.categories category
          on category.stable_id = item.value ->> 'id' and category.internal_id = any(target_category_ids)
      ),
      updated_at = now()
  where release.snapshot_version = active_version;
  perform public._taxonomy_bump_revision(active_version);
end;
$$;

-- Release fields owned by the admin for one definition. Keys it does not own (aliases with
-- regexes, semanticId, categoryScope, booleanValues) are kept from the published entry.
create or replace function public._attributes_release_fields(target public.attribute_definitions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', target.stable_id,
    'label', target.label,
    'type', target.value_type,
    'unit', coalesce(target.unit, ''),
    'filterable', target.filterable,
    'sortable', target.sortable,
    'rank', target.sort_order,
    'options', (
      select jsonb_agg(jsonb_build_object('value', option.value, 'label', option.label) order by option.sort_order, option.value)
      from public.attribute_options option
      where option.attribute_id = target.internal_id and option.active
    )
  )
$$;

-- Merge (or drop, when fields is null) one entry of release.attribute_definitions.
create or replace function public._attributes_put_release_definition(target_stable_id text, fields jsonb, defaults jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_version text;
begin
  active_version := public._taxonomy_lock_release();
  if active_version is null then return; end if;
  update public.catalog_snapshot_releases release
  set attribute_definitions = case
        when fields is null then release.attribute_definitions - target_stable_id
        else release.attribute_definitions || jsonb_build_object(target_stable_id,
          coalesce(defaults, '{}'::jsonb) || coalesce(release.attribute_definitions -> target_stable_id, '{}'::jsonb) || fields)
      end,
      updated_at = now()
  where release.snapshot_version = active_version;
  perform public._taxonomy_bump_revision(active_version);
end;
$$;

create or replace function public._attributes_definition_json(target public.attribute_definitions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', target.stable_id,
    'internalId', target.internal_id,
    'label', target.label,
    'valueType', target.value_type,
    'unit', target.unit,
    'filterable', target.filterable,
    'sortable', target.sortable,
    'sortOrder', target.sort_order,
    'status', target.status,
    'updatedAt', target.updated_at,
    'productCount', (select count(*) from public.product_attribute_values value where value.attribute_id = target.internal_id),
    'categoryCount', (select count(*) from public.category_attributes relation where relation.attribute_id = target.internal_id),
    'facetCount', (select count(*) from public.category_attributes relation where relation.attribute_id = target.internal_id and relation.facet_enabled),
    'optionCount', (select count(*) from public.attribute_options option where option.attribute_id = target.internal_id and option.active)
  )
$$;

-- ---------------------------------------------------------------------------
-- Attribute definitions
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_attributes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  return jsonb_build_object(
    'canEdit', public.can_manage_content(),
    'attributes', coalesce((
      with value_counts as (
        select value.attribute_id, count(*)::integer total
        from public.product_attribute_values value group by value.attribute_id
      ), link_counts as (
        select relation.attribute_id, count(*)::integer total,
          count(*) filter (where relation.facet_enabled)::integer facets
        from public.category_attributes relation group by relation.attribute_id
      ), option_counts as (
        select option.attribute_id, count(*)::integer total
        from public.attribute_options option where option.active group by option.attribute_id
      )
      select jsonb_agg(jsonb_build_object(
        'id', definition.stable_id,
        'label', definition.label,
        'valueType', definition.value_type,
        'unit', definition.unit,
        'filterable', definition.filterable,
        'sortable', definition.sortable,
        'sortOrder', definition.sort_order,
        'status', definition.status,
        'productCount', coalesce(value_counts.total, 0),
        'categoryCount', coalesce(link_counts.total, 0),
        'facetCount', coalesce(link_counts.facets, 0),
        'optionCount', coalesce(option_counts.total, 0),
        'updatedAt', definition.updated_at
      ) order by definition.sort_order, lower(definition.label), definition.stable_id)
      from public.attribute_definitions definition
      left join value_counts on value_counts.attribute_id = definition.internal_id
      left join link_counts on link_counts.attribute_id = definition.internal_id
      left join option_counts on option_counts.attribute_id = definition.internal_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_get_attribute(attribute_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.attribute_definitions%rowtype;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select * into target from public.attribute_definitions definition where definition.stable_id = attribute_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'attribute', public._attributes_definition_json(target),
    'canEdit', public.can_manage_content(),
    'sourceMappingCount', (select count(*) from public.product_source_attributes source where source.normalized_attribute_id = target.internal_id),
    'categories', coalesce((
      with recursive paths as (
        select category.internal_id, category.title::text path from public.categories category where category.parent_id is null
        union all
        select child.internal_id, paths.path || ' / ' || child.title
        from public.categories child join paths on child.parent_id = paths.internal_id
      )
      select jsonb_agg(jsonb_build_object(
        'id', category.stable_id,
        'title', category.title,
        'path', paths.path,
        'status', category.status,
        'facetEnabled', relation.facet_enabled,
        'required', relation.required,
        'productCount', (select count(*) from public.product_attribute_values value
          join public.products product on product.internal_id = value.product_id
          where value.attribute_id = target.internal_id and product.primary_category_id = category.internal_id)
      ) order by paths.path)
      from public.category_attributes relation
      join public.categories category on category.internal_id = relation.category_id
      left join paths on paths.internal_id = category.internal_id
      where relation.attribute_id = target.internal_id
    ), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'value', option.value,
        'label', option.label,
        'active', option.active,
        'productCount', (select count(*) from public.product_attribute_values value
          where value.attribute_id = target.internal_id
            and (value.option_id = option.internal_id or (value.option_id is null and value.value_text = option.value)))
      ) order by not option.active, option.sort_order, option.value)
      from public.attribute_options option where option.attribute_id = target.internal_id
    ), '[]'::jsonb),
    'topValues', coalesce((
      select jsonb_agg(jsonb_build_object('value', grouped.value, 'productCount', grouped.total) order by grouped.total desc, grouped.value)
      from (
        select coalesce(option.label, value.value_text, value.value_number::text,
            case value.value_boolean when true then 'Так' when false then 'Ні' end) as value,
          count(*)::integer total
        from public.product_attribute_values value
        left join public.attribute_options option on option.internal_id = value.option_id
        where value.attribute_id = target.internal_id
        group by 1
        order by 2 desc, 1
        limit 12
      ) grouped
    ), '[]'::jsonb),
    'history', public._taxonomy_audit_json('attribute', target.internal_id)
  );
end;
$$;

create or replace function public.admin_update_attribute(attribute_id text, patch jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.attribute_definitions%rowtype;
  before_row jsonb;
  after_row jsonb;
  changes jsonb;
  options_before jsonb;
  options_after jsonb;
  value_total integer;
  entry jsonb;
  option_value text;
  option_label text;
  option_values text[] := '{}';
  ordinal integer := 0;
  linked uuid[];
begin
  perform public._taxonomy_require_editor();
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні зміни.';
  end if;

  select * into target from public.attribute_definitions definition where definition.stable_id = attribute_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Характеристику не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Характеристику вже змінив інший працівник. Оновіть сторінку.';
  end if;
  before_row := to_jsonb(target);
  options_before := (public._attributes_release_fields(target)) -> 'options';

  if patch ? 'label' then
    target.label := public._taxonomy_clean_text(patch ->> 'label', 120);
    if target.label is null then raise exception using errcode = '22023', message = 'Назва характеристики обов’язкова.'; end if;
  end if;
  if patch ? 'unit' then target.unit := public._taxonomy_clean_text(patch ->> 'unit', 20); end if;
  if patch ? 'valueType' then
    if not public._attributes_type_valid(patch ->> 'valueType') then
      raise exception using errcode = '22023', message = 'Невідомий тип значення.';
    end if;
    if (patch ->> 'valueType') <> target.value_type::text then
      select count(*)::integer into value_total from public.product_attribute_values value where value.attribute_id = target.internal_id;
      if value_total > 0 then
        raise exception using errcode = '23514', message = format(
          'Тип значення не можна змінити: характеристику вже заповнено в товарах (%s).', value_total);
      end if;
      target.value_type := (patch ->> 'valueType')::public.attribute_value_type;
    end if;
  end if;
  if patch ? 'filterable' then
    if jsonb_typeof(patch -> 'filterable') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Некоректне значення «Фільтр».';
    end if;
    target.filterable := (patch ->> 'filterable')::boolean;
  end if;
  if patch ? 'sortable' then
    if jsonb_typeof(patch -> 'sortable') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Некоректне значення «Сортування».';
    end if;
    target.sortable := (patch ->> 'sortable')::boolean;
  end if;
  if patch ? 'sortOrder' then
    if coalesce(patch ->> 'sortOrder', '') !~ '^\d{1,6}(\.\d{1,2})?$' then
      raise exception using errcode = '22023', message = 'Порядок має бути числом від 0 (до двох знаків після крапки).';
    end if;
    target.sort_order := (patch ->> 'sortOrder')::numeric;
  end if;

  if patch ? 'options' then
    if target.value_type <> 'select' then
      raise exception using errcode = '22023', message = 'Варіанти значень є лише в характеристик типу «Список значень».';
    end if;
    if jsonb_typeof(patch -> 'options') <> 'array' or jsonb_array_length(patch -> 'options') > 200 then
      raise exception using errcode = '22023', message = 'Варіанти значень: до 200 позицій.';
    end if;
    for entry in select value from jsonb_array_elements(patch -> 'options') loop
      option_value := public._taxonomy_clean_text(entry ->> 'value', 120);
      option_label := coalesce(public._taxonomy_clean_text(entry ->> 'label', 120), option_value);
      if option_value is null then
        raise exception using errcode = '22023', message = 'Значення варіанта не може бути порожнім.';
      end if;
      if option_value = any(option_values) then
        raise exception using errcode = '22023', message = format('Значення «%s» повторюється.', option_value);
      end if;
      option_values := option_values || option_value;
      ordinal := ordinal + 1;
      insert into public.attribute_options (attribute_id, value, label, sort_order, active, created_by, updated_by)
      values (target.internal_id, option_value, option_label, ordinal * 10, true, auth.uid(), auth.uid())
      on conflict on constraint attribute_options_attribute_id_value_key do update
        set label = excluded.label, sort_order = excluded.sort_order, active = true, updated_by = auth.uid()
        where public.attribute_options.label is distinct from excluded.label
           or public.attribute_options.sort_order is distinct from excluded.sort_order
           or not public.attribute_options.active;
    end loop;
    -- Options leave the list by deactivation: product values may still reference them.
    update public.attribute_options option
    set active = false, updated_by = auth.uid()
    where option.attribute_id = target.internal_id and option.active and not (option.value = any(option_values));
  end if;

  update public.attribute_definitions set
    label = target.label,
    unit = target.unit,
    value_type = target.value_type,
    filterable = target.filterable,
    sortable = target.sortable,
    sort_order = target.sort_order
  where internal_id = target.internal_id
    and (label, unit, value_type, filterable, sortable, sort_order)
      is distinct from (target.label, target.unit, target.value_type, target.filterable, target.sortable, target.sort_order);

  select * into target from public.attribute_definitions definition where definition.internal_id = target.internal_id;
  after_row := to_jsonb(target);
  options_after := (public._attributes_release_fields(target)) -> 'options';

  select coalesce(jsonb_object_agg(field, jsonb_build_object('from', before_row -> field, 'to', after_row -> field)), '{}'::jsonb)
  into changes
  from unnest(array['label', 'unit', 'value_type', 'filterable', 'sortable', 'sort_order']) field
  where before_row -> field is distinct from after_row -> field;
  if options_before is distinct from options_after then
    changes := changes || jsonb_build_object('options', jsonb_build_object('from', options_before, 'to', options_after));
  end if;

  if changes <> '{}'::jsonb then
    update public.attribute_definitions set updated_by = auth.uid() where internal_id = target.internal_id
    returning * into target;
    insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
    values ('attribute', target.internal_id, target.stable_id, auth.uid(), changes);

    perform public._attributes_put_release_definition(target.stable_id, public._attributes_release_fields(target)
      || case when target.value_type = 'boolean' and changes ? 'value_type'
           then jsonb_build_object('legacyValues', jsonb_build_object('true', 'yes', 'false', 'no')) else '{}'::jsonb end);

    -- Turning the filter off globally switches it off in every category (schema trigger); mirror
    -- that in the release.
    if changes ? 'filterable' then
      select array_agg(relation.category_id) into linked
      from public.category_attributes relation where relation.attribute_id = target.internal_id;
      perform public._attributes_sync_category_release(linked);
    end if;
  end if;

  return public.admin_get_attribute(attribute_id);
end;
$$;

create or replace function public.admin_create_attribute(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attribute_label text;
  attribute_code text;
  attribute_type text;
  base_code text;
  suffix integer := 2;
  created public.attribute_definitions%rowtype;
begin
  perform public._taxonomy_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані характеристики.';
  end if;

  attribute_label := public._taxonomy_clean_text(payload ->> 'label', 120);
  if attribute_label is null then raise exception using errcode = '22023', message = 'Назва характеристики обов’язкова.'; end if;
  attribute_type := coalesce(nullif(payload ->> 'valueType', ''), 'select');
  if not public._attributes_type_valid(attribute_type) then
    raise exception using errcode = '22023', message = 'Невідомий тип значення.';
  end if;

  attribute_code := public._taxonomy_clean_text(payload ->> 'id', 60);
  if attribute_code is not null then
    if attribute_code !~ '^[a-z][A-Za-z0-9]{1,59}$' then
      raise exception using errcode = '22023', message = 'Код: латиниця й цифри, починається з малої літери (наприклад, heatOutputKw).';
    end if;
    if exists (select 1 from public.attribute_definitions definition where lower(definition.stable_id) = lower(attribute_code)) then
      raise exception using errcode = '23505', message = format('Код «%s» уже зайнятий іншою характеристикою.', attribute_code);
    end if;
  else
    base_code := coalesce(public._attributes_code_from_label(attribute_label), 'attribute');
    if base_code !~ '^[a-z]' then base_code := 'attr' || initcap(base_code); end if;
    attribute_code := base_code;
    while exists (select 1 from public.attribute_definitions definition where lower(definition.stable_id) = lower(attribute_code)) loop
      attribute_code := left(base_code, 56) || suffix;
      suffix := suffix + 1;
    end loop;
  end if;

  if exists (select 1 from public.attribute_definitions definition where lower(definition.label) = lower(attribute_label)) then
    raise exception using errcode = '23505', message = 'Характеристика з такою назвою вже є.';
  end if;

  insert into public.attribute_definitions (stable_id, label, value_type, unit, filterable, sortable, sort_order, status, created_by, updated_by)
  values (attribute_code, attribute_label, attribute_type::public.attribute_value_type, null, true, false, 100, 'active', auth.uid(), auth.uid())
  returning * into created;

  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('attribute', created.internal_id, created.stable_id, auth.uid(),
    jsonb_build_object('created', jsonb_build_object('from', null, 'to', created.label)));

  perform public._attributes_put_release_definition(created.stable_id, public._attributes_release_fields(created),
    jsonb_build_object('aliases', '[]'::jsonb, 'categoryScope', '[]'::jsonb,
      'booleanValues', jsonb_build_object('true', '[]'::jsonb, 'false', '[]'::jsonb),
      'legacyValues', case when created.value_type = 'boolean'
        then jsonb_build_object('true', 'yes', 'false', 'no') else '{}'::jsonb end));

  -- Optional fields go through the regular editor so they share its validation.
  if payload - 'label' - 'id' - 'valueType' <> '{}'::jsonb then
    perform public.admin_update_attribute(created.stable_id, payload - 'label' - 'id' - 'valueType', null);
  end if;
  return public.admin_get_attribute(created.stable_id);
end;
$$;

create or replace function public.admin_delete_attribute(attribute_id text, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.attribute_definitions%rowtype;
  value_total integer;
  link_total integer;
  source_total integer;
begin
  perform public._taxonomy_require_editor();
  select * into target from public.attribute_definitions definition where definition.stable_id = attribute_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Характеристику не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Характеристику вже змінив інший працівник. Оновіть сторінку.';
  end if;

  select count(*)::integer into value_total from public.product_attribute_values value where value.attribute_id = target.internal_id;
  if value_total > 0 then
    raise exception using errcode = '23503', message = format(
      'Не можна видалити характеристику: її заповнено в товарах (%s).', value_total);
  end if;
  select count(*)::integer into link_total from public.category_attributes relation where relation.attribute_id = target.internal_id;
  if link_total > 0 then
    raise exception using errcode = '23503', message = format(
      'Не можна видалити характеристику: вона прив’язана до категорій (%s). Спершу приберіть її з фільтрів цих категорій.', link_total);
  end if;
  select count(*)::integer into source_total from public.product_source_attributes source where source.normalized_attribute_id = target.internal_id;
  if source_total > 0 then
    raise exception using errcode = '23503', message = format(
      'Не можна видалити характеристику: на неї зіставлено характеристики постачальників (%s).', source_total);
  end if;

  delete from public.attribute_definitions where internal_id = target.internal_id;
  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('attribute', target.internal_id, target.stable_id, auth.uid(),
    jsonb_build_object('deleted', jsonb_build_object('from', target.label, 'to', null)));
  perform public._attributes_put_release_definition(target.stable_id, null);
  return jsonb_build_object('deleted', target.stable_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Category filters
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_category_attributes(category_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.categories%rowtype;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select * into target from public.categories category where category.stable_id = category_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'category', jsonb_build_object('id', target.stable_id, 'title', target.title, 'level', target.level),
    'canEdit', public.can_manage_content(),
    'version', md5(public._attributes_category_config(target.internal_id)::text),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', definition.stable_id,
        'label', definition.label,
        'valueType', definition.value_type,
        'unit', definition.unit,
        'filterable', definition.filterable,
        'facetEnabled', relation.facet_enabled,
        'required', relation.required,
        'sortOrder', relation.sort_order,
        'productCount', (select count(*) from public.product_attribute_values value
          join public.products product on product.internal_id = value.product_id
          where value.attribute_id = definition.internal_id and product.primary_category_id = target.internal_id)
      ) order by relation.sort_order, definition.stable_id)
      from public.category_attributes relation
      join public.attribute_definitions definition on definition.internal_id = relation.attribute_id
      where relation.category_id = target.internal_id
    ), '[]'::jsonb),
    'available', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', definition.stable_id, 'label', definition.label, 'valueType', definition.value_type,
        'unit', definition.unit, 'filterable', definition.filterable
      ) order by lower(definition.label), definition.stable_id)
      from public.attribute_definitions definition
      where definition.status = 'active'
        and not exists (select 1 from public.category_attributes relation
          where relation.category_id = target.internal_id and relation.attribute_id = definition.internal_id)
    ), '[]'::jsonb)
  );
end;
$$;

-- Replace the category's characteristics with payload.items (ordered list of
-- { id, facetEnabled, required }). Characteristics left out are unlinked from the category;
-- product values stay untouched.
create or replace function public.admin_set_category_attributes(category_id text, payload jsonb, expected_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.categories%rowtype;
  before_config jsonb;
  after_config jsonb;
  entry jsonb;
  definition public.attribute_definitions%rowtype;
  wanted_ids uuid[] := '{}';
  wanted_facet boolean;
  wanted_required boolean;
  item_position integer := 0;
begin
  perform public._taxonomy_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' or jsonb_typeof(payload -> 'items') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Некоректний список характеристик.';
  end if;
  if jsonb_array_length(payload -> 'items') > 80 then
    raise exception using errcode = '22023', message = 'У категорії може бути до 80 характеристик.';
  end if;

  select * into target from public.categories category where category.stable_id = category_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Категорію не знайдено.'; end if;
  before_config := public._attributes_category_config(target.internal_id);
  if expected_version is not null and expected_version <> md5(before_config::text) then
    raise exception using errcode = '40001', message = 'Фільтри категорії вже змінив інший працівник. Оновіть сторінку.';
  end if;

  for entry in select value from jsonb_array_elements(payload -> 'items') loop
    if jsonb_typeof(entry) <> 'object' then
      raise exception using errcode = '22023', message = 'Некоректний список характеристик.';
    end if;
    select * into definition from public.attribute_definitions item where item.stable_id = entry ->> 'id';
    if not found then
      raise exception using errcode = 'P0002', message = format('Характеристику «%s» не знайдено.', coalesce(entry ->> 'id', ''));
    end if;
    if definition.internal_id = any(wanted_ids) then
      raise exception using errcode = '22023', message = format('Характеристика «%s» повторюється.', definition.label);
    end if;
    if jsonb_typeof(coalesce(entry -> 'facetEnabled', 'false'::jsonb)) <> 'boolean'
       or jsonb_typeof(coalesce(entry -> 'required', 'false'::jsonb)) <> 'boolean' then
      raise exception using errcode = '22023', message = 'Некоректні позначки фільтра.';
    end if;
    wanted_facet := coalesce((entry ->> 'facetEnabled')::boolean, false);
    wanted_required := coalesce((entry ->> 'required')::boolean, false);
    if wanted_facet and (not definition.filterable or definition.status <> 'active') then
      raise exception using errcode = '23514', message = format(
        '«%s» не може бути фільтром: у налаштуваннях характеристики вимкнено «Фільтр».', definition.label);
    end if;
    wanted_ids := wanted_ids || definition.internal_id;
    item_position := item_position + 1;

    insert into public.category_attributes (category_id, attribute_id, facet_enabled, required, sort_order, created_by, updated_by)
    values (target.internal_id, definition.internal_id, wanted_facet, wanted_required, item_position * 10, auth.uid(), auth.uid())
    on conflict on constraint category_attributes_pkey do update
      set facet_enabled = excluded.facet_enabled, required = excluded.required,
          sort_order = excluded.sort_order, updated_by = auth.uid()
      where (public.category_attributes.facet_enabled, public.category_attributes.required, public.category_attributes.sort_order)
        is distinct from (excluded.facet_enabled, excluded.required, excluded.sort_order);
  end loop;

  delete from public.category_attributes relation
  where relation.category_id = target.internal_id and not (relation.attribute_id = any(wanted_ids));

  after_config := public._attributes_category_config(target.internal_id);
  if before_config is distinct from after_config then
    insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
    values ('category', target.internal_id, target.stable_id, auth.uid(),
      jsonb_build_object('filters', jsonb_build_object('from', before_config, 'to', after_config)));
    perform public._attributes_sync_category_release(array[target.internal_id]);
  end if;

  return public.admin_get_category_attributes(category_id);
end;
$$;

revoke all on function public._attributes_code_from_label(text) from public, anon, authenticated;
revoke all on function public._attributes_type_valid(text) from public, anon, authenticated;
revoke all on function public._attributes_category_config(uuid) from public, anon, authenticated;
revoke all on function public._attributes_sync_category_release(uuid[]) from public, anon, authenticated;
revoke all on function public._attributes_release_fields(public.attribute_definitions) from public, anon, authenticated;
revoke all on function public._attributes_put_release_definition(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._attributes_definition_json(public.attribute_definitions) from public, anon, authenticated;

revoke all on function public.admin_list_attributes() from public, anon;
revoke all on function public.admin_get_attribute(text) from public, anon;
revoke all on function public.admin_update_attribute(text, jsonb, timestamptz) from public, anon;
revoke all on function public.admin_create_attribute(jsonb) from public, anon;
revoke all on function public.admin_delete_attribute(text, timestamptz) from public, anon;
revoke all on function public.admin_get_category_attributes(text) from public, anon;
revoke all on function public.admin_set_category_attributes(text, jsonb, text) from public, anon;
grant execute on function public.admin_list_attributes() to authenticated;
grant execute on function public.admin_get_attribute(text) to authenticated;
grant execute on function public.admin_update_attribute(text, jsonb, timestamptz) to authenticated;
grant execute on function public.admin_create_attribute(jsonb) to authenticated;
grant execute on function public.admin_delete_attribute(text, timestamptz) to authenticated;
grant execute on function public.admin_get_category_attributes(text) to authenticated;
grant execute on function public.admin_set_category_attributes(text, jsonb, text) to authenticated;
