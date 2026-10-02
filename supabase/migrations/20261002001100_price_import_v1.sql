-- Price import v1 (/admin/products/import): CSV export of prices and stock for the current list
-- filters, and a price/stock import that previews (dry run) and then applies supplier price lists
-- in batches, without scripts on the owner's PC.
--
-- admin_export_products(...)          any active staff member (same as the products list).
-- admin_apply_price_updates(payload)  can_manage_products() (owner, admin, manager), the same role
--                                     that bulk actions and update_product_commercial require.
--
-- payload = {
--   matchBy: 'sku' | 'legacy_id', dryRun: boolean, runId: uuid (one per import, all batches),
--   fileName: text,
--   rows: [{ line, key, price?, oldPrice?, priceStatus?, inventoryStatus? }]   -- 1..200 rows
-- }
-- A field left out of a row is not changed. oldPrice null or 0 clears the old price.
-- Every row gets its own result (changed / unchanged / not_found / invalid); one bad row never
-- stops the batch. Applied rows write product_admin_audit ('update', sections commercial +
-- price_import), one import_runs row per import (supplier 'admin-price-import'), and refresh
-- product cards through _admin_refresh_catalog, exactly like admin_bulk_products.
--
-- Supabase connector: this file has no `delete from`, no trigger statements and no trigger loops,
-- so it can go through apply_migration. It inserts one suppliers row (on conflict do nothing).

insert into public.suppliers (stable_id, name, active)
values ('admin-price-import', 'Імпорт цін в адмінці', true)
on conflict (stable_id) do nothing;

-- Numbers from the import: JSON number or text ("1 234,50"); never negative, at most 2 decimals.
create or replace function public._price_import_number(raw jsonb, label text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  text_value text;
  value numeric;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then return null; end if;
  if jsonb_typeof(raw) = 'number' then
    value := (raw #>> '{}')::numeric;
  elsif jsonb_typeof(raw) = 'string' then
    text_value := replace(replace(replace(btrim(raw #>> '{}'), ' ', ''), chr(160), ''), ',', '.');
    if text_value = '' then return null; end if;
    if text_value !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception '%: «%» не є числом', label, raw #>> '{}';
    end if;
    value := text_value::numeric;
  else
    raise exception '%: очікується число', label;
  end if;
  if value < 0 then raise exception '% не може бути від’ємною', label; end if;
  if value >= 1000000000000 then raise exception '% завелика', label; end if;
  return round(value, 2);
end;
$$;

create or replace function public.admin_export_products(
  query_text text default null,
  filter_category_id uuid default null,
  filter_brand_id uuid default null,
  filter_publication public.product_publication_status default null,
  filter_inventory public.product_inventory_status default null,
  filter_price public.product_price_status default null,
  page_number integer default 1,
  page_size integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  size integer := least(greatest(coalesce(page_size, 500), 1), 1000);
  page integer := greatest(coalesce(page_number, 1), 1);
  result jsonb;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Немає доступу до товарів.';
  end if;
  with recursive descendants as (
    select category.internal_id from public.categories category where category.internal_id = filter_category_id
    union all select child.internal_id from public.categories child join descendants parent on child.parent_id = parent.internal_id
  ), filtered as materialized (
    select product.legacy_id, product.sku, product.title, product.amount, product.old_amount,
      product.price_status, product.inventory_status, product.publication_status, brand.name brand_name
    from public.products product
    join public.brands brand on brand.internal_id = product.brand_id
    where (filter_category_id is null or product.primary_category_id in (select internal_id from descendants))
      and (filter_brand_id is null or product.brand_id = filter_brand_id)
      and (filter_publication is null or product.publication_status = filter_publication)
      and (filter_inventory is null or product.inventory_status = filter_inventory)
      and (filter_price is null or product.price_status = filter_price)
      and (coalesce(btrim(query_text), '') = '' or concat_ws(' ', product.title, product.sku, product.model, brand.name) ilike '%' || btrim(query_text) || '%')
  ), page_rows as (
    select * from filtered order by lower(filtered.sku), filtered.legacy_id
    offset (page - 1) * size limit size
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', page,
    'pageSize', size,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'legacyId', item.legacy_id, 'sku', item.sku, 'title', item.title, 'brand', item.brand_name,
      'amount', item.amount, 'oldAmount', item.old_amount, 'priceStatus', item.price_status,
      'inventoryStatus', item.inventory_status, 'publicationStatus', item.publication_status
    ) order by lower(item.sku), item.legacy_id) from page_rows item), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_apply_price_updates(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '25s'
as $$
declare
  actor uuid := auth.uid();
  match_by text := coalesce(payload ->> 'matchBy', 'sku');
  dry_run boolean;
  run_id uuid;
  file_name text := left(coalesce(btrim(payload ->> 'fileName'), ''), 200);
  input_rows jsonb := payload -> 'rows';
  entry record;
  item jsonb;
  line_number integer;
  key_value text;
  seen jsonb := '{}'::jsonb;
  target public.products%rowtype;
  has_price boolean;
  has_old boolean;
  new_price numeric;
  new_old numeric;
  new_status public.product_price_status;
  new_inventory public.product_inventory_status;
  final_amount numeric;
  final_old numeric;
  warning text;
  before_state jsonb;
  after_state jsonb;
  row_status text;
  row_message text;
  results jsonb := '[]'::jsonb;
  changed_ids uuid[] := '{}';
  count_changed integer := 0;
  count_unchanged integer := 0;
  count_not_found integer := 0;
  count_invalid integer := 0;
  version_value text;
  existing_run public.import_runs%rowtype;
  supplier uuid;
  key_label text;
begin
  if not public.can_manage_products() then
    raise exception using errcode = '42501', message = 'Імпорт цін доступний власнику, адміністратору та менеджеру.';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Некоректний запит імпорту.'; end if;
  if match_by not in ('sku', 'legacy_id') then raise exception 'Зіставлення можливе лише за SKU або Legacy ID.'; end if;
  if jsonb_typeof(input_rows) is distinct from 'array' or jsonb_array_length(input_rows) not between 1 and 200 then
    raise exception 'Передайте від 1 до 200 рядків за один запит.';
  end if;
  if jsonb_typeof(payload -> 'dryRun') = 'boolean' then dry_run := (payload ->> 'dryRun')::boolean;
  else dry_run := true; end if;
  key_label := case match_by when 'sku' then 'SKU' else 'Legacy ID' end;

  if not dry_run then
    if coalesce(payload ->> 'runId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Не передано ідентифікатор імпорту.';
    end if;
    run_id := (payload ->> 'runId')::uuid;
    select * into existing_run from public.import_runs run where run.internal_id = run_id for update;
    if found and (existing_run.created_by is distinct from actor or existing_run.metadata ->> 'kind' is distinct from 'admin_price_import') then
      raise exception 'Цей ідентифікатор імпорту належить іншому запуску.';
    end if;
    -- Lock every product of the batch in a stable order before reading it.
    perform 1 from public.products product
    where (match_by = 'sku' and lower(product.sku) in (select lower(btrim(value ->> 'key')) from jsonb_array_elements(input_rows)))
       or (match_by = 'legacy_id' and product.legacy_id in (select btrim(value ->> 'key') from jsonb_array_elements(input_rows)))
    order by product.legacy_id
    for update;
  end if;

  for entry in select value, ordinality from jsonb_array_elements(input_rows) with ordinality loop
    item := entry.value;
    line_number := case when jsonb_typeof(item -> 'line') = 'number' then (item ->> 'line')::numeric::integer else entry.ordinality::integer end;
    key_value := btrim(coalesce(item ->> 'key', ''));
    row_message := null;
    warning := null;
    before_state := null;
    after_state := null;
    target := null;

    if jsonb_typeof(item) <> 'object' or key_value = '' then
      row_status := 'invalid';
      row_message := format('Порожній %s.', key_label);
    elsif seen ? lower(key_value) then
      row_status := 'invalid';
      row_message := format('%s повторюється у файлі (рядок %s).', key_label, seen ->> lower(key_value));
    else
      seen := seen || jsonb_build_object(lower(key_value), line_number);
      if match_by = 'sku' then
        select * into target from public.products product where lower(product.sku) = lower(key_value);
      else
        select * into target from public.products product where product.legacy_id = key_value;
      end if;

      if target.internal_id is null then
        row_status := 'not_found';
        row_message := format('Товар із %s «%s» не знайдено.', key_label, key_value);
      else
        before_state := jsonb_build_object('amount', target.amount, 'oldAmount', target.old_amount,
          'priceStatus', target.price_status, 'inventoryStatus', target.inventory_status);
        begin
          has_price := item ? 'price' and jsonb_typeof(item -> 'price') <> 'null'
            and not (jsonb_typeof(item -> 'price') = 'string' and btrim(item ->> 'price') = '');
          has_old := item ? 'oldPrice';
          new_price := case when has_price then public._price_import_number(item -> 'price', 'Ціна') end;
          if has_price and new_price = 0 then
            raise exception 'Ціна має бути більшою за 0. Для товару без ціни вкажіть статус «За запитом».';
          end if;

          if item ? 'priceStatus' and jsonb_typeof(item -> 'priceStatus') <> 'null' then
            if not (item ->> 'priceStatus' = any (enum_range(null::public.product_price_status)::text[])) then
              raise exception 'Невідомий статус ціни «%».', item ->> 'priceStatus';
            end if;
            new_status := (item ->> 'priceStatus')::public.product_price_status;
          elsif has_price then
            new_status := 'known';
          else
            new_status := target.price_status;
          end if;

          if new_status = 'known' then
            final_amount := coalesce(new_price, case when target.price_status = 'known' then target.amount end);
            if final_amount is null then
              raise exception 'Для статусу «Вказана» потрібна ціна.';
            end if;
          else
            if has_price then
              raise exception 'Ціну вказано, але статус ціни — «%». Приберіть ціну або змініть статус.',
                case new_status when 'on_request' then 'За запитом' else 'Не вказана' end;
            end if;
            final_amount := null;
          end if;

          new_old := case when has_old then public._price_import_number(item -> 'oldPrice', 'Стара ціна') end;
          if new_status <> 'known' then
            if has_old and coalesce(new_old, 0) > 0 then
              raise exception 'Стару ціну можна вказати лише разом із ціною.';
            end if;
            final_old := null;
          elsif has_old then
            final_old := nullif(new_old, 0);
            if final_old is not null and final_old <= final_amount then
              raise exception 'Стара ціна (%) має бути більшою за ціну (%).', final_old, final_amount;
            end if;
          else
            final_old := target.old_amount;
            if final_old is not null and final_old <= final_amount then
              final_old := null;
              warning := 'Стару ціну прибрано: нова ціна не менша за неї.';
            end if;
          end if;

          if item ? 'inventoryStatus' and jsonb_typeof(item -> 'inventoryStatus') <> 'null' then
            if not (item ->> 'inventoryStatus' = any (enum_range(null::public.product_inventory_status)::text[])) then
              raise exception 'Невідомий статус наявності «%».', item ->> 'inventoryStatus';
            end if;
            new_inventory := (item ->> 'inventoryStatus')::public.product_inventory_status;
          else
            new_inventory := target.inventory_status;
          end if;

          after_state := jsonb_build_object('amount', final_amount, 'oldAmount', final_old,
            'priceStatus', new_status, 'inventoryStatus', new_inventory);

          if target.amount is not distinct from final_amount and target.old_amount is not distinct from final_old
            and target.price_status = new_status and target.inventory_status = new_inventory then
            row_status := 'unchanged';
          else
            row_status := 'changed';
            row_message := warning;
            if not dry_run then
              update public.products set
                amount = final_amount, old_amount = final_old, price_status = new_status,
                inventory_status = new_inventory, updated_by = actor, updated_at = now()
              where internal_id = target.internal_id;
              insert into public.product_admin_audit (product_id, legacy_id, actor_id, action, changed_sections, before_state, after_state)
              values (target.internal_id, target.legacy_id, actor, 'update', array['commercial', 'price_import'], before_state,
                after_state || jsonb_build_object('source', 'price_import', 'runId', run_id, 'line', line_number));
              changed_ids := array_append(changed_ids, target.internal_id);
            end if;
          end if;
        exception when others then
          row_status := 'invalid';
          row_message := case when sqlstate = '23514' then 'Значення не пройшли перевірку бази (ціна, стара ціна та статус несумісні).'
            else sqlerrm end;
          after_state := null;
        end;
      end if;
    end if;

    case row_status
      when 'changed' then count_changed := count_changed + 1;
      when 'unchanged' then count_unchanged := count_unchanged + 1;
      when 'not_found' then count_not_found := count_not_found + 1;
      else count_invalid := count_invalid + 1;
    end case;

    results := results || jsonb_build_array(jsonb_build_object(
      'line', line_number, 'key', key_value, 'status', row_status, 'message', row_message,
      'legacyId', target.legacy_id, 'sku', target.sku, 'title', target.title,
      'before', before_state, 'after', after_state));
  end loop;

  if not dry_run then
    if cardinality(changed_ids) > 0 and exists (
      select 1 from public.catalog_snapshot_pointer pointer
      join public.catalog_snapshot_releases release on release.snapshot_version = pointer.snapshot_version and release.ready
      where pointer.singleton
    ) then
      version_value := public._admin_refresh_catalog(changed_ids);
    end if;

    select internal_id into supplier from public.suppliers where stable_id = 'admin-price-import';
    if existing_run.internal_id is null then
      insert into public.import_runs (internal_id, supplier_id, status, source_ref, started_at, finished_at,
        records_seen, records_succeeded, records_failed, metadata, created_by)
      values (run_id, supplier, case when count_invalid + count_not_found > 0 then 'partial' else 'succeeded' end::public.import_run_status,
        nullif(file_name, ''), now(), now(), jsonb_array_length(input_rows), count_changed + count_unchanged,
        count_invalid + count_not_found,
        jsonb_build_object('kind', 'admin_price_import', 'matchBy', match_by, 'fileName', file_name, 'batches', 1,
          'changed', count_changed, 'unchanged', count_unchanged, 'notFound', count_not_found, 'invalid', count_invalid),
        actor);
    else
      update public.import_runs run set
        records_seen = run.records_seen + jsonb_array_length(input_rows),
        records_succeeded = run.records_succeeded + count_changed + count_unchanged,
        records_failed = run.records_failed + count_invalid + count_not_found,
        status = case when run.records_failed + count_invalid + count_not_found > 0 then 'partial' else 'succeeded' end::public.import_run_status,
        finished_at = now(),
        metadata = run.metadata || jsonb_build_object(
          'batches', coalesce((run.metadata ->> 'batches')::integer, 0) + 1,
          'changed', coalesce((run.metadata ->> 'changed')::integer, 0) + count_changed,
          'unchanged', coalesce((run.metadata ->> 'unchanged')::integer, 0) + count_unchanged,
          'notFound', coalesce((run.metadata ->> 'notFound')::integer, 0) + count_not_found,
          'invalid', coalesce((run.metadata ->> 'invalid')::integer, 0) + count_invalid)
      where run.internal_id = run_id;
    end if;
  end if;

  return jsonb_build_object(
    'dryRun', dry_run, 'runId', run_id, 'matchBy', match_by, 'catalogVersion', version_value,
    'counts', jsonb_build_object('changed', count_changed, 'unchanged', count_unchanged,
      'notFound', count_not_found, 'invalid', count_invalid),
    'rows', results);
end;
$$;

revoke all on function public._price_import_number(jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_export_products(text, uuid, uuid, public.product_publication_status, public.product_inventory_status, public.product_price_status, integer, integer) from public, anon;
revoke all on function public.admin_apply_price_updates(jsonb) from public, anon;
grant execute on function public.admin_export_products(text, uuid, uuid, public.product_publication_status, public.product_inventory_status, public.product_price_status, integer, integer) to authenticated;
grant execute on function public.admin_apply_price_updates(jsonb) to authenticated;
