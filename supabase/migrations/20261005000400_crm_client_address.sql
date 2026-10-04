-- Lead/order rate limit by real client address (final audit AUD-019, fix plan W2-5).
--
-- _crm_client_fingerprint() hashed the FIRST x-forwarded-for entry. That entry is whatever the
-- client sent: proxies only append to the header, so a bot could rotate a fake first value and
-- never hit the «20 submissions per hour from one address» limit.
--
-- Now the address is read from the RIGHT end of the chain, which the platform proxies wrote:
-- walking right to left, private/loopback/link-local hops (internal load balancers) and
-- Cloudflare edge addresses (when the CDN in front appends its own hop) are skipped, and the
-- first remaining address is the client. Everything left of it is client-supplied and ignored.
-- If the chain has only internal addresses (local QA), the rightmost valid one is used.
--
-- Also adds a site-wide backstop: at most 60 submissions (orders + leads) per 10 minutes.
--
-- crm_client_address_probe() lets an active admin see how their own request's headers are parsed,
-- to confirm on DEV that the chosen address is really theirs before this goes to PROD.
--
-- NOTE: _crm_enforce_rate_limit contains `delete from`; apply this file through the Supabase SQL
-- Editor (the MCP connector times out on such function bodies).

create index if not exists crm_submission_log_created_idx on public.crm_submission_log (created_at desc);

-- True for addresses that belong to proxies rather than clients.
create or replace function public._crm_is_proxy_address(address inet)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select address is null
    or address <<= any (array[
      -- private, loopback, link-local, CGNAT, unspecified
      '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16',
      '100.64.0.0/10', '0.0.0.0/8',
      '::1/128', 'fc00::/7', 'fe80::/10', '::/128',
      -- Cloudflare edge (https://www.cloudflare.com/ips/)
      '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
      '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
      '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
      '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
      '2a06:98c0::/29', '2c0f:f248::/32'
    ]::inet[])
$$;

-- One header entry to an address: trims quotes, [v6]:port and v4:port; null when it is not an IP.
create or replace function public._crm_parse_address(raw text)
returns inet
language plpgsql
immutable
set search_path = ''
as $$
declare
  value text := btrim(coalesce(raw, ''), ' "''');
begin
  if value ~ '^\[[0-9A-Fa-f:.]+\](:[0-9]+)?$' then
    value := substring(value from '^\[([0-9A-Fa-f:.]+)\]');
  elsif value ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}:[0-9]+$' then
    value := split_part(value, ':', 1);
  end if;
  if value = '' or value !~ '^[0-9A-Fa-f:.]+$' or char_length(value) > 45 then return null; end if;
  begin
    return host(value::inet)::inet;
  exception when others then
    return null;
  end;
end;
$$;

-- The client address the platform saw, from the request headers (see the header comment).
create or replace function public._crm_client_address(headers jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  chain text[] := string_to_array(coalesce(headers ->> 'x-forwarded-for', ''), ',');
  parsed inet;
  fallback inet;
  idx integer;
begin
  if chain is not null and cardinality(chain) > 0 then
    for idx in reverse cardinality(chain) .. greatest(cardinality(chain) - 20, 1) loop
      parsed := public._crm_parse_address(chain[idx]);
      continue when parsed is null;
      if fallback is null then fallback := parsed; end if;
      if not public._crm_is_proxy_address(parsed) then return host(parsed); end if;
    end loop;
  end if;
  if fallback is null then fallback := public._crm_parse_address(headers ->> 'x-real-ip'); end if;
  return host(fallback);
end;
$$;

-- Hash of the caller's IP (from the API gateway headers). Never stores the raw address.
create or replace function public._crm_client_fingerprint()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  headers jsonb;
  address text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;
  address := public._crm_client_address(headers);
  if coalesce(btrim(address), '') = '' then return null; end if;
  return encode(extensions.digest('sofievka-crm:' || btrim(address), 'sha256'), 'hex');
end;
$$;

create or replace function public._crm_enforce_rate_limit(submission_kind text, normalized_phone text, fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.crm_submission_log where created_at < now() - interval '2 days';

  if (select count(*) from public.crm_submission_log
      where phone = normalized_phone and kind = submission_kind and created_at > now() - interval '1 hour') >= 5 then
    raise exception using errcode = '54000', message = 'Забагато звернень з цього номера. Спробуйте пізніше або зателефонуйте нам.';
  end if;
  if fingerprint is not null and (select count(*) from public.crm_submission_log
      where client_fingerprint = fingerprint and created_at > now() - interval '1 hour') >= 20 then
    raise exception using errcode = '54000', message = 'Забагато звернень. Спробуйте пізніше або зателефонуйте нам.';
  end if;
  -- Site-wide backstop against a bot rotating addresses and phones.
  if (select count(*) from public.crm_submission_log where created_at > now() - interval '10 minutes') >= 60 then
    raise exception using errcode = '54000', message = 'Забагато звернень. Спробуйте за кілька хвилин або зателефонуйте нам.';
  end if;

  insert into public.crm_submission_log (kind, phone, client_fingerprint)
  values (submission_kind, normalized_phone, fingerprint);
end;
$$;

-- Admin-only check of how the current request's address headers are read (for DEV verification).
create or replace function public.crm_client_address_probe()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  headers jsonb;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Лише для працівників.';
  end if;
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;
  return jsonb_build_object(
    'chosen', public._crm_client_address(headers),
    'chain', coalesce((
      select jsonb_agg(jsonb_build_object(
          'value', btrim(entry),
          'valid', public._crm_parse_address(entry) is not null,
          'proxy', public._crm_is_proxy_address(public._crm_parse_address(entry))
        ) order by ordinality)
      from unnest(string_to_array(headers ->> 'x-forwarded-for', ',')) with ordinality as item(entry, ordinality)
    ), '[]'::jsonb),
    'headers', coalesce((
      select jsonb_object_agg(key, value) from jsonb_each_text(coalesce(headers, '{}'::jsonb))
      where key in ('x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip',
        'x-envoy-external-address', 'forwarded', 'x-client-ip', 'cf-ray')
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public._crm_is_proxy_address(inet) from public, anon, authenticated;
revoke all on function public._crm_parse_address(text) from public, anon, authenticated;
revoke all on function public._crm_client_address(jsonb) from public, anon, authenticated;
revoke all on function public._crm_client_fingerprint() from public, anon, authenticated;
revoke all on function public._crm_enforce_rate_limit(text, text, text) from public, anon, authenticated;
revoke all on function public.crm_client_address_probe() from public, anon;
grant execute on function public.crm_client_address_probe() to authenticated;
