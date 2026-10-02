-- CRM notifications v1: a Telegram message to the shop staff about every new order and lead.
--
-- Flow
--   crm_orders / crm_leads AFTER INSERT trigger
--     -> public._crm_notify_enqueue(kind, number)
--        reads site_settings 'notifications' (notifyOrders / notifyLeads, recipients),
--        reads the private config row (edge function URL + shared secret),
--        writes a crm_notification_log row and queues net.http_post (pg_net).
--     -> pg_net sends the request after the transaction commits (a rolled-back order sends nothing)
--     -> edge function crm-notify (supabase/functions/crm-notify) checks the shared secret header,
--        loads the order/lead summary with the service role, sends Telegram messages and marks the
--        log row 'sent' or 'error'.
--   The trigger never makes an order or lead insert fail: every failure is caught and logged.
--   Without pg_net or without config it only writes a 'skipped' log row.
--
-- Config storage: a private single-row table public.crm_notify_config (RLS on, every grant revoked,
--   read only by security definer functions). Chosen over Supabase Vault because it works the same on
--   DEV, PROD and the local PGlite harness, and the secret only allows asking the function to announce
--   an order that already exists. The status RPC never returns the secret.
--
-- Supabase SQL Editor: apply this whole file through the SQL Editor, not the MCP connector. It contains
--   * `create extension if not exists pg_net` (inside a guarded DO block);
--   * `drop trigger if exists` / `create trigger` on crm_orders and crm_leads;
--   * trigger functions with exception handlers.
--
-- Owner setup after applying (details in Ukrainian: docs/notifications-setup.md)
--   1. Create a bot with @BotFather, keep the token.
--   2. Supabase -> Edge Functions -> Secrets: TELEGRAM_BOT_TOKEN, CRM_NOTIFY_SECRET (long random
--      string), optional ADMIN_BASE_URL (default https://sofievka.vercel.app).
--   3. Deploy the function without JWT check: supabase functions deploy crm-notify --no-verify-jwt
--      (supabase/config.toml also sets verify_jwt = false for it).
--   4. SQL Editor:
--        update public.crm_notify_config
--        set function_url = 'https://<project-ref>.supabase.co/functions/v1/crm-notify',
--            secret = '<the same CRM_NOTIFY_SECRET>'
--        where id = 1;
--   5. Each recipient writes /start to the bot; put their chat ids into /admin/settings -> Сповіщення,
--      then press «Надіслати тестове повідомлення».

-- ---------------------------------------------------------------------------
-- pg_net (Supabase ships it; the local PGlite harness does not, so this is guarded)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
exception when others then
  raise notice 'pg_net is not available here (%); notifications will be logged as skipped.', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private config and the log
-- ---------------------------------------------------------------------------
create table public.crm_notify_config (
  id integer primary key default 1 check (id = 1),
  function_url text check (function_url is null or function_url ~ '^https?://'),
  secret text check (secret is null or char_length(secret) between 16 and 200),
  updated_at timestamptz not null default now()
);
insert into public.crm_notify_config (id) values (1);
alter table public.crm_notify_config enable row level security;
revoke all on table public.crm_notify_config from public, anon, authenticated;

create table public.crm_notification_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('order', 'lead', 'test')),
  entity_number bigint,
  status text not null check (status in ('queued', 'sent', 'skipped', 'error')),
  reason text not null default '' check (char_length(reason) <= 500),
  request_id bigint,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_notification_log_created_idx on public.crm_notification_log (created_at desc);
alter table public.crm_notification_log enable row level security;
revoke all on table public.crm_notification_log from public, anon, authenticated;
-- The edge function marks rows sent/error with the service role.
grant select, update on table public.crm_notification_log to service_role;

-- ---------------------------------------------------------------------------
-- Enqueue: decides, logs and queues the HTTP call. Never raises.
-- ---------------------------------------------------------------------------
create or replace function public._crm_has_pg_net()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace ns on ns.oid = proc.pronamespace
    where ns.nspname = 'net' and proc.proname = 'http_post'
  )
$$;

create or replace function public._crm_notify_enqueue(notify_kind text, entity_number bigint, actor uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings jsonb;
  config public.crm_notify_config%rowtype;
  chat_count integer;
  email_count integer;
  skip_reason text;
  log_id bigint;
  request_id_value bigint;
begin
  select setting.value into settings from public.site_settings setting where setting.key = 'notifications';
  settings := coalesce(settings, '{}'::jsonb);
  chat_count := coalesce(jsonb_array_length(case when jsonb_typeof(settings -> 'telegramChatIds') = 'array' then settings -> 'telegramChatIds' end), 0);
  email_count := coalesce(jsonb_array_length(case when jsonb_typeof(settings -> 'emails') = 'array' then settings -> 'emails' end), 0);
  select * into config from public.crm_notify_config where id = 1;

  if notify_kind = 'order' and coalesce((settings ->> 'notifyOrders')::boolean, true) = false then
    skip_reason := 'Сповіщення про замовлення вимкнено.';
  elsif notify_kind = 'lead' and coalesce((settings ->> 'notifyLeads')::boolean, true) = false then
    skip_reason := 'Сповіщення про заявки вимкнено.';
  elsif chat_count + email_count = 0 then
    skip_reason := 'Немає отримувачів.';
  elsif config.function_url is null or config.secret is null then
    skip_reason := 'Відправку не налаштовано (crm_notify_config).';
  elsif not public._crm_has_pg_net() then
    skip_reason := 'Розширення pg_net недоступне.';
  end if;

  if skip_reason is not null then
    insert into public.crm_notification_log (kind, entity_number, status, reason, actor_id)
    values (notify_kind, entity_number, 'skipped', skip_reason, actor)
    returning id into log_id;
    return jsonb_build_object('id', log_id, 'status', 'skipped', 'reason', skip_reason);
  end if;

  insert into public.crm_notification_log (kind, entity_number, status, actor_id,
    details)
  values (notify_kind, entity_number, 'queued', actor,
    jsonb_build_object('telegramRecipients', chat_count, 'emailRecipients', email_count))
  returning id into log_id;

  begin
    execute 'select net.http_post(url := $1, body := $2, params := ''{}''::jsonb, headers := $3, timeout_milliseconds := 8000)'
      into request_id_value
      using config.function_url,
        jsonb_build_object('kind', notify_kind, 'number', entity_number, 'logId', log_id),
        jsonb_build_object('Content-Type', 'application/json', 'x-crm-notify-secret', config.secret);
    update public.crm_notification_log set request_id = request_id_value, updated_at = now() where id = log_id;
  exception when others then
    update public.crm_notification_log
    set status = 'error', reason = left('pg_net: ' || sqlerrm, 500), updated_at = now()
    where id = log_id;
    return jsonb_build_object('id', log_id, 'status', 'error', 'reason', left(sqlerrm, 500));
  end;
  return jsonb_build_object('id', log_id, 'status', 'queued', 'reason', '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: the insert always succeeds, whatever happens to the notification.
-- ---------------------------------------------------------------------------
create or replace function public._crm_notify_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notify_kind text := case when tg_table_name = 'crm_orders' then 'order' else 'lead' end;
begin
  begin
    perform public._crm_notify_enqueue(notify_kind, new.number, null);
  exception when others then
    begin
      insert into public.crm_notification_log (kind, entity_number, status, reason)
      values (notify_kind, new.number, 'error', left(sqlerrm, 500));
    exception when others then
      null;
    end;
  end;
  return null;
end;
$$;

drop trigger if exists crm_orders_notify on public.crm_orders;
create trigger crm_orders_notify after insert on public.crm_orders
  for each row execute function public._crm_notify_after_insert();
drop trigger if exists crm_leads_notify on public.crm_leads;
create trigger crm_leads_notify after insert on public.crm_leads
  for each row execute function public._crm_notify_after_insert();

-- ---------------------------------------------------------------------------
-- Admin RPCs (owner / admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_notifications_status()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  config public.crm_notify_config%rowtype;
  has_pg_net boolean := public._crm_has_pg_net();
  has_responses boolean := to_regclass('net._http_response') is not null;
  entry record;
  response record;
  log_rows jsonb := '[]'::jsonb;
  shown_status text;
  shown_reason text;
begin
  if not public.can_admin_catalog() then
    raise exception using errcode = '42501', message = 'Стан сповіщень бачать власник і адміністратор.';
  end if;
  select * into config from public.crm_notify_config where id = 1;

  for entry in
    select * from public.crm_notification_log order by created_at desc, id desc limit 20
  loop
    shown_status := entry.status;
    shown_reason := entry.reason;
    -- A row still 'queued' never reached the function (wrong URL, JWT check on, function missing):
    -- show pg_net's own answer when it is there.
    if entry.status = 'queued' and entry.request_id is not null and has_responses then
      begin
        execute 'select status_code, error_msg from net._http_response where id = $1'
          into response using entry.request_id;
        if response.error_msg is not null then
          shown_status := 'error';
          shown_reason := left('Запит не дійшов: ' || response.error_msg, 500);
        elsif response.status_code is not null and response.status_code not between 200 and 299 then
          shown_status := 'error';
          shown_reason := format('Функція відповіла HTTP %s.', response.status_code);
        end if;
      exception when others then
        null;
      end;
    end if;
    log_rows := log_rows || jsonb_build_array(jsonb_build_object(
      'id', entry.id, 'kind', entry.kind, 'number', entry.entity_number,
      'status', shown_status, 'reason', shown_reason, 'details', entry.details,
      'createdAt', entry.created_at, 'updatedAt', entry.updated_at
    ));
  end loop;

  return jsonb_build_object(
    'configured', config.function_url is not null and config.secret is not null and has_pg_net,
    'functionUrlSet', config.function_url is not null,
    'secretSet', config.secret is not null,
    'pgNet', has_pg_net,
    'log', log_rows
  );
end;
$$;

create or replace function public.admin_notifications_send_test()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb;
  recent integer;
begin
  if not public.can_admin_catalog() then
    raise exception using errcode = '42501', message = 'Надсилати тестове повідомлення можуть власник і адміністратор.';
  end if;
  select count(*) into recent from public.crm_notification_log
  where kind = 'test' and created_at > now() - interval '1 minute';
  if recent >= 3 then
    raise exception using errcode = '54000', message = 'Забагато тестових повідомлень. Спробуйте за хвилину.';
  end if;
  result := public._crm_notify_enqueue('test', null, auth.uid());
  return result;
end;
$$;

revoke all on function public._crm_has_pg_net() from public, anon, authenticated;
revoke all on function public._crm_notify_enqueue(text, bigint, uuid) from public, anon, authenticated;
revoke all on function public._crm_notify_after_insert() from public, anon, authenticated;
revoke all on function public.admin_notifications_status() from public, anon;
revoke all on function public.admin_notifications_send_test() from public, anon;
grant execute on function public.admin_notifications_status() to authenticated;
grant execute on function public.admin_notifications_send_test() to authenticated;
