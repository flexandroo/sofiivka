-- Supplier prices with daily currency conversion (owner's rules, 2026-10-05):
--   * a UAH price list price goes to the site as is;
--   * a EUR/USD price is converted every day at the NBU rate + 2.5%;
--   * a price list price without VAT gets +20% VAT;
--   * only the retail price is stored; the site price is rounded to whole hryvnia.
--
-- product_price_sources keeps the supplier price per product. fx_recalculate_prices() turns it into
-- products.amount for every active source and refreshes the changed product cards. Products without a
-- source are never touched. A source is the authority for its product: a manual admin price edit is
-- overwritten by the next daily run until the source is deactivated.
--
-- NBU rates: fx_request_nbu_rates() queues an HTTP GET through pg_net; fx_ingest_nbu_rates() reads the
-- answer a few minutes later, stores the rates (fx_store_nbu_payload) and recalculates prices.
-- pg_cron runs both daily. pg_net/pg_cron are guarded: the local PGlite harness has neither.

create table if not exists public.price_fx_settings (
  singleton boolean primary key default true check (singleton),
  markup_percent numeric(6, 3) not null default 2.5 check (markup_percent between 0 and 50),
  vat_percent numeric(6, 3) not null default 20 check (vat_percent between 0 and 50),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.price_fx_settings (singleton) values (true) on conflict (singleton) do nothing;

create table if not exists public.fx_rates (
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  rate_date date not null,
  rate numeric(14, 6) not null check (rate > 0),
  source text not null default 'NBU',
  fetched_at timestamptz not null default now(),
  primary key (currency, rate_date)
);

create table if not exists public.product_price_sources (
  product_id uuid primary key references public.products(internal_id) on delete cascade,
  base_amount numeric(14, 2) not null check (base_amount > 0),
  currency text not null check (currency in ('UAH', 'EUR', 'USD')),
  vat_included boolean not null,
  source text not null check (btrim(source) <> ''),
  source_ref text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fx_fetch_log (
  internal_id bigint generated always as identity primary key,
  request_id bigint,
  status text not null check (status in ('requested', 'stored', 'error', 'skipped')),
  message text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.price_fx_runs (
  internal_id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  rates jsonb not null default '{}'::jsonb,
  changed integer not null default 0,
  unchanged integer not null default 0,
  skipped integer not null default 0,
  changes jsonb not null default '[]'::jsonb
);

alter table public.price_fx_settings enable row level security;
alter table public.fx_rates enable row level security;
alter table public.product_price_sources enable row level security;
alter table public.fx_fetch_log enable row level security;
alter table public.price_fx_runs enable row level security;
revoke all on public.price_fx_settings, public.fx_rates, public.product_price_sources,
  public.fx_fetch_log, public.price_fx_runs from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
exception when others then
  raise notice 'pg_net is not available here (%); NBU rates will not be fetched.', sqlerrm;
end $$;

-- Site price from a supplier price: VAT first, then the currency rate plus markup, whole hryvnia.
create or replace function public._fx_site_price(base numeric, currency text, vat_included boolean,
  rate numeric, markup_percent numeric, vat_percent numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(base
    * case when vat_included then 1 else 1 + vat_percent / 100 end
    * case when currency = 'UAH' then 1 else rate * (1 + markup_percent / 100) end, 0)
$$;

create or replace function public.fx_recalculate_prices()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.price_fx_settings%rowtype;
  item record;
  new_amount numeric;
  changed_ids uuid[] := '{}';
  changes jsonb := '[]'::jsonb;
  rates jsonb;
  count_changed integer := 0;
  count_unchanged integer := 0;
  count_skipped integer := 0;
  chunk uuid[];
  i integer;
begin
  select * into settings from public.price_fx_settings where singleton;
  if not found or not settings.enabled then
    return jsonb_build_object('status', 'disabled');
  end if;

  select coalesce(jsonb_object_agg(latest.currency, jsonb_build_object('rate', latest.rate, 'date', latest.rate_date)), '{}'::jsonb)
  into rates
  from (select distinct on (currency) currency, rate, rate_date from public.fx_rates order by currency, rate_date desc) latest;

  for item in
    select source.product_id, source.base_amount, source.currency, source.vat_included,
      product.legacy_id, product.amount, product.old_amount, product.price_status,
      (rates -> source.currency ->> 'rate')::numeric as rate
    from public.product_price_sources source
    join public.products product on product.internal_id = source.product_id
    where source.active
    order by product.legacy_id
    for update of product
  loop
    if item.currency <> 'UAH' and item.rate is null then
      count_skipped := count_skipped + 1;
      continue;
    end if;
    new_amount := public._fx_site_price(item.base_amount, item.currency, item.vat_included, item.rate,
      settings.markup_percent, settings.vat_percent);
    if item.amount is not distinct from new_amount and item.price_status = 'known'
      and (item.old_amount is null or item.old_amount > new_amount) then
      count_unchanged := count_unchanged + 1;
      continue;
    end if;
    update public.products set
      amount = new_amount,
      price_status = 'known',
      old_amount = case when old_amount > new_amount then old_amount end,
      updated_at = now()
    where internal_id = item.product_id;
    count_changed := count_changed + 1;
    changed_ids := array_append(changed_ids, item.product_id);
    changes := changes || jsonb_build_array(jsonb_build_object('legacyId', item.legacy_id, 'before', item.amount, 'after', new_amount));
  end loop;

  if cardinality(changed_ids) > 0 and exists (
    select 1 from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ) then
    i := 1;
    while i <= cardinality(changed_ids) loop
      chunk := changed_ids[i : i + 299];
      perform public._admin_refresh_catalog(chunk);
      i := i + 300;
    end loop;
  end if;

  insert into public.price_fx_runs (rates, changed, unchanged, skipped, changes)
  values (rates, count_changed, count_unchanged, count_skipped, changes);

  return jsonb_build_object('status', 'ok', 'rates', rates, 'changed', count_changed,
    'unchanged', count_unchanged, 'skipped', count_skipped);
end;
$$;

-- Stores the NBU answer (array of {cc, rate, exchangedate 'dd.mm.yyyy'}) for EUR and USD.
create or replace function public.fx_store_nbu_payload(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored integer;
begin
  if jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'NBU answer is not a JSON array.';
  end if;
  insert into public.fx_rates (currency, rate_date, rate, source, fetched_at)
  select entry ->> 'cc', to_date(entry ->> 'exchangedate', 'DD.MM.YYYY'), (entry ->> 'rate')::numeric, 'NBU', now()
  from jsonb_array_elements(payload) entry
  where entry ->> 'cc' in ('EUR', 'USD') and (entry ->> 'rate')::numeric > 0
  on conflict (currency, rate_date) do update set rate = excluded.rate, fetched_at = excluded.fetched_at;
  get diagnostics stored = row_count;
  return stored;
end;
$$;

create or replace function public.fx_request_nbu_rates()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  request bigint;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    insert into public.fx_fetch_log (status, message, processed_at) values ('skipped', 'pg_net is not installed', now());
    return null;
  end if;
  execute 'select net.http_get(url := $1, timeout_milliseconds := 15000)'
    into request using 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json';
  insert into public.fx_fetch_log (request_id, status) values (request, 'requested');
  return request;
end;
$$;

create or replace function public.fx_ingest_nbu_rates()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending record;
  answer record;
  stored integer;
  total_stored integer := 0;
begin
  if to_regclass('net._http_response') is not null then
    for pending in select internal_id, request_id from public.fx_fetch_log where status = 'requested' order by internal_id loop
      answer := null;
      execute 'select status_code, content, error_msg from net._http_response where id = $1'
        into answer using pending.request_id;
      if answer is null then
        if exists (select 1 from public.fx_fetch_log where internal_id = pending.internal_id and requested_at < now() - interval '1 hour') then
          update public.fx_fetch_log set status = 'error', message = 'no answer from pg_net', processed_at = now()
          where internal_id = pending.internal_id;
        end if;
        continue;
      end if;
      begin
        if answer.status_code <> 200 then
          raise exception 'HTTP % %', answer.status_code, coalesce(answer.error_msg, '');
        end if;
        stored := public.fx_store_nbu_payload(answer.content::jsonb);
        total_stored := total_stored + stored;
        update public.fx_fetch_log set status = 'stored', message = stored || ' rates', processed_at = now()
        where internal_id = pending.internal_id;
      exception when others then
        update public.fx_fetch_log set status = 'error', message = left(sqlerrm, 500), processed_at = now()
        where internal_id = pending.internal_id;
      end;
    end loop;
  end if;
  return jsonb_build_object('stored', total_stored, 'prices', public.fx_recalculate_prices());
end;
$$;

-- Owner/manager entry point for a manual recalculation (e.g. after loading new sources).
create or replace function public.admin_fx_recalculate_prices()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_products() then
    raise exception using errcode = '42501', message = 'Перерахунок цін доступний власнику, адміністратору та менеджеру.';
  end if;
  return public.fx_recalculate_prices();
end;
$$;

revoke all on function public._fx_site_price(numeric, text, boolean, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.fx_recalculate_prices() from public, anon, authenticated;
revoke all on function public.fx_store_nbu_payload(jsonb) from public, anon, authenticated;
revoke all on function public.fx_request_nbu_rates() from public, anon, authenticated;
revoke all on function public.fx_ingest_nbu_rates() from public, anon, authenticated;
revoke all on function public.admin_fx_recalculate_prices() from public, anon;
grant execute on function public.admin_fx_recalculate_prices() to authenticated;

-- Daily schedule (UTC): fetch at 06:00 and 13:00, ingest + recalculate five minutes later.
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('fx-nbu-request-morning', '0 6 * * *', 'select public.fx_request_nbu_rates()');
    perform cron.schedule('fx-nbu-ingest-morning', '5 6 * * *', 'select public.fx_ingest_nbu_rates()');
    perform cron.schedule('fx-nbu-request-afternoon', '0 13 * * *', 'select public.fx_request_nbu_rates()');
    perform cron.schedule('fx-nbu-ingest-afternoon', '5 13 * * *', 'select public.fx_ingest_nbu_rates()');
  end if;
exception when others then
  raise notice 'pg_cron is not available here (%); run fx_request_nbu_rates/fx_ingest_nbu_rates manually.', sqlerrm;
end $$;
