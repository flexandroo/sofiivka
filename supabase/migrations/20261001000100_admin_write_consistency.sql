-- Admin write consistency.
-- Products Admin v1 refreshes the public read model only inside its own RPCs.
-- Two older write paths stayed open and silently left the storefront stale:
--   1. legacy RPCs update_product_commercial / update_product_content;
--   2. direct PostgREST table writes allowed by RLS for staff roles.
-- This migration keeps both paths (they are part of the tested RLS contract) but makes
-- every staff write refresh the public product card and leave an audit trail.

alter table public.product_admin_audit drop constraint product_admin_audit_action_check;
alter table public.product_admin_audit add constraint product_admin_audit_action_check
  check (action = any (array[
    'create', 'update', 'bulk_publish', 'bulk_hide', 'bulk_archive', 'bulk_category', 'bulk_brand',
    'direct_write', 'legacy_rpc'
  ]));

-- Refresh public cards for products changed outside the admin RPCs.
-- Skips silently when no catalogue release is active (fresh databases, pgTAP fixtures).
create or replace function public._admin_external_write_refresh(target_product_ids uuid[], action_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_ids uuid[];
  actor uuid := auth.uid();
begin
  if action_name not in ('direct_write', 'legacy_rpc') then
    raise exception 'Unsupported external write action %', action_name;
  end if;
  -- Callable by the invoker-rights trigger, so it is reachable over RPC too: staff only.
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  select coalesce(array_agg(distinct product.internal_id), '{}')
  into existing_ids
  from public.products product
  where product.internal_id = any (coalesce(target_product_ids, '{}'));

  if cardinality(existing_ids) = 0 then return; end if;

  if actor is not null then
    insert into public.product_admin_audit (product_id, legacy_id, actor_id, action, changed_sections, after_state)
    select product.internal_id, product.legacy_id, actor, action_name, array['external'],
      jsonb_build_object('updatedAt', product.updated_at, 'publicationStatus', product.publication_status)
    from public.products product
    where product.internal_id = any (existing_ids);
  end if;

  if exists (
    select 1
    from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release
      on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ) then
    perform public._admin_refresh_catalog(existing_ids);
  end if;
end;
$$;

-- Physically deleted products must disappear from the public read model too.
create or replace function public._admin_external_delete_cleanup(target_legacy_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_version text;
begin
  if cardinality(coalesce(target_legacy_ids, '{}')) = 0 then return; end if;
  if not public.can_admin_catalog() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  select pointer.snapshot_version into active_version
  from public.catalog_snapshot_pointer pointer
  where pointer.singleton;
  if active_version is null then return; end if;

  delete from public.catalog_product_cards card
  where card.snapshot_version = active_version and card.legacy_id = any (target_legacy_ids);
  delete from public.catalog_product_snapshots snapshot
  where snapshot.snapshot_version = active_version and snapshot.legacy_id = any (target_legacy_ids);

  update public.catalog_admin_cache_revision
  set base_snapshot_version = active_version,
      revision = case when base_snapshot_version = active_version then revision + 1 else 1 end,
      updated_at = now()
  where singleton;
end;
$$;

revoke all on function public._admin_external_write_refresh(uuid[], text) from public, anon;
revoke all on function public._admin_external_delete_cleanup(text[]) from public, anon;
grant execute on function public._admin_external_write_refresh(uuid[], text) to authenticated;
grant execute on function public._admin_external_delete_cleanup(text[]) to authenticated;

-- Statement-level trigger. SECURITY INVOKER on purpose: it must see the caller's role.
-- Writes made by the admin RPCs (SECURITY DEFINER, current_user = owner) and by
-- imports (service_role) are ignored here because they already refresh the read model.
create or replace function public._admin_track_external_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  key_column text := tg_argv[0];
  changed_ids uuid[] := '{}';
  part uuid[];
  deleted_legacy text[];
begin
  if current_user <> 'authenticated' then return null; end if;

  if tg_op in ('INSERT', 'UPDATE') then
    execute format('select coalesce(array_agg(distinct %I), ''{}'') from new_rows', key_column) into part;
    changed_ids := changed_ids || part;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    execute format('select coalesce(array_agg(distinct %I), ''{}'') from old_rows', key_column) into part;
    changed_ids := changed_ids || part;
  end if;

  if tg_op = 'DELETE' and tg_table_name = 'products' then
    select coalesce(array_agg(distinct legacy_id), '{}') into deleted_legacy from old_rows;
    if cardinality(deleted_legacy) > 0 then
      perform public._admin_external_delete_cleanup(deleted_legacy);
    end if;
  end if;

  if cardinality(changed_ids) = 0 then return null; end if;
  perform public._admin_external_write_refresh(changed_ids, 'direct_write');
  return null;
end;
$$;

do $$
declare
  spec record;
  operation text;
begin
  for spec in
    select * from (values
      ('products', 'internal_id'),
      ('product_media', 'product_id'),
      ('product_documents', 'product_id'),
      ('product_attribute_values', 'product_id'),
      ('product_categories', 'product_id'),
      ('product_tags', 'product_id')
    ) as item(table_name, key_column)
  loop
    foreach operation in array array['insert', 'update', 'delete'] loop
      execute format('drop trigger if exists %I on public.%I', spec.table_name || '_external_' || operation, spec.table_name);
      execute format(
        'create trigger %I after %s on public.%I referencing %s for each statement execute function public._admin_track_external_write(%L)',
        spec.table_name || '_external_' || operation,
        operation,
        spec.table_name,
        case operation
          when 'insert' then 'new table as new_rows'
          when 'delete' then 'old table as old_rows'
          else 'old table as old_rows new table as new_rows'
        end,
        spec.key_column
      );
    end loop;
  end loop;
end;
$$;

-- Legacy column-scoped RPCs: same permissions as before, now with refresh + audit.
create or replace function public.update_product_commercial(
  target_product_id uuid,
  new_amount numeric,
  new_old_amount numeric,
  new_currency varchar,
  new_price_status public.product_price_status,
  new_inventory_status public.product_inventory_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_products() then
    raise exception 'Not authorized';
  end if;
  update public.products
  set amount = new_amount,
      old_amount = new_old_amount,
      currency = new_currency,
      price_status = new_price_status,
      inventory_status = new_inventory_status,
      updated_by = auth.uid()
  where internal_id = target_product_id;
  if not found then
    raise exception 'Product not found';
  end if;
  perform public._admin_external_write_refresh(array[target_product_id], 'legacy_rpc');
end;
$$;

create or replace function public.update_product_content(
  target_product_id uuid,
  new_description text,
  new_short_description text,
  new_full_description text,
  new_description_sections jsonb,
  new_seo_title text,
  new_seo_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_content() then
    raise exception 'Not authorized';
  end if;
  if new_description_sections is null or jsonb_typeof(new_description_sections) <> 'array' then
    raise exception 'description_sections must be a JSON array';
  end if;
  update public.products
  set description = coalesce(new_description, ''),
      short_description = coalesce(new_short_description, ''),
      full_description = coalesce(new_full_description, ''),
      description_sections = new_description_sections,
      seo_title = new_seo_title,
      seo_description = new_seo_description,
      updated_by = auth.uid()
  where internal_id = target_product_id;
  if not found then
    raise exception 'Product not found';
  end if;
  perform public._admin_external_write_refresh(array[target_product_id], 'legacy_rpc');
end;
$$;

-- These were callable by anon (the role check rejected them, but they never needed to be exposed).
revoke all on function public.update_product_commercial(uuid, numeric, numeric, varchar, public.product_price_status, public.product_inventory_status) from public, anon;
revoke all on function public.update_product_content(uuid, text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.update_product_commercial(uuid, numeric, numeric, varchar, public.product_price_status, public.product_inventory_status) to authenticated;
grant execute on function public.update_product_content(uuid, text, text, text, jsonb, text, text) to authenticated;
