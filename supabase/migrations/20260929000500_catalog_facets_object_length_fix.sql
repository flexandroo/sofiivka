-- PostgreSQL exposes jsonb_object_keys but not jsonb_object_length. Keep the
-- public SECURITY DEFINER function on a controlled search path and provide the
-- missing aggregate helper in the locked extensions schema.
begin;

create or replace function extensions.jsonb_object_length(value jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer from jsonb_object_keys(coalesce(value, '{}'::jsonb))
$$;

revoke all on function extensions.jsonb_object_length(jsonb) from public, anon, authenticated;

alter function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text)
  set search_path = 'pg_catalog', 'extensions';

commit;
