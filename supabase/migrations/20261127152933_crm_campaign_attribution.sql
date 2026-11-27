-- Keep first-touch campaign fields with the order or lead so they survive the browser session.
begin;

alter table public.crm_orders add column utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object');
alter table public.crm_leads add column utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object');

create function public._crm_campaign_attribution(raw jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(entry.key, value), '{}'::jsonb)
  from unnest(array['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) entry(key)
  cross join lateral (values (
    nullif(left(btrim(regexp_replace(raw ->> entry.key, '[[:cntrl:]]+', '', 'g')), 150), '')
  )) clean(value)
  where jsonb_typeof(raw -> entry.key) = 'string' and clean.value is not null
$$;
revoke all on function public._crm_campaign_attribution(jsonb) from public, anon, authenticated;

-- Retain current checkout/lead permission, promotion and rate-limit behavior.
-- An unexpected function version stops the migration instead of changing a different call site.
create function pg_temp._crm_attribution_patch(target regprocedure, old_text text, new_text text)
returns void language plpgsql as $$
declare definition text := pg_get_functiondef(target);
begin
  if length(definition) - length(replace(definition, old_text, '')) <> length(old_text) then
    raise exception 'CRM attribution migration: expected one occurrence of % in %', old_text, target;
  end if;
  execute replace(definition, old_text, new_text);
end
$$;

select pg_temp._crm_attribution_patch('public.crm_submit_order(jsonb)',
  'customer_comment, client_fingerprint, customer_user_id', 'customer_comment, client_fingerprint, customer_user_id, utm');
select pg_temp._crm_attribution_patch('public.crm_submit_order(jsonb)',
  'order_comment, fingerprint, signed_in_user', 'order_comment, fingerprint, signed_in_user, public._crm_campaign_attribution(payload -> ''utm'')');
select pg_temp._crm_attribution_patch('public.crm_submit_lead(jsonb)',
  'subject, message, spec_lines, page_url, client_fingerprint', 'subject, message, spec_lines, page_url, client_fingerprint, utm');
select pg_temp._crm_attribution_patch('public.crm_submit_lead(jsonb)',
  'subject, message, lines, page_url, fingerprint', 'subject, message, lines, page_url, fingerprint, public._crm_campaign_attribution(payload -> ''utm'')');

select pg_temp._crm_attribution_patch('public.admin_crm_get_order(bigint)',
  '''managerComment'', target.manager_comment,', '''managerComment'', target.manager_comment, ''utm'', target.utm,');
select pg_temp._crm_attribution_patch('public.admin_crm_get_lead(bigint)',
  '''pageUrl'', target.page_url,', '''pageUrl'', target.page_url, ''utm'', target.utm,');
select pg_temp._crm_attribution_patch('public.admin_crm_list_leads(text,public.crm_lead_status,public.crm_lead_type,integer,integer)',
  '''company'', page_rows.company,', '''company'', page_rows.company, ''utm'', page_rows.utm,');
select pg_temp._crm_attribution_patch('public.admin_crm_export_orders(text,public.crm_order_status,integer,integer)',
  '''source'', page_rows.source,', '''source'', page_rows.source, ''utm'', page_rows.utm,');

drop function pg_temp._crm_attribution_patch(regprocedure,text,text);
commit;
