-- Staff admin v1: owners and admins manage who can enter /admin (name, role, active) from
-- /admin/users. Accounts themselves live in Supabase Auth: admin_add_staff attaches a profile to an
-- existing account, and the admin-staff edge function creates the account first when it is missing
-- (it needs the service role, which never reaches the browser).
-- Rules: an admin manages managers and content managers only; nobody grants owner except an
-- owner; nobody changes their own role or switches themselves off; the last active owner stays
-- (admin_profiles_preserve_active_owner trigger). Access is removed by switching it off, never by
-- deleting the profile, so history keeps its actors.

create table public.admin_staff_audit (
  internal_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  changes jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.admin_staff_audit enable row level security;
revoke all on table public.admin_staff_audit from public, anon, authenticated;
create index admin_staff_audit_user_idx on public.admin_staff_audit (user_id, created_at desc);

create or replace function public._staff_require_manager()
returns public.admin_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.admin_role := public.current_admin_role();
begin
  if actor_role is null or actor_role not in ('owner', 'admin') or not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Керувати працівниками можуть власник і адміністратор.';
  end if;
  return actor_role;
end;
$$;

create or replace function public._staff_row(target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'userId', profile.user_id,
    'email', account.email,
    'name', profile.name,
    'role', profile.role,
    'active', profile.active,
    'createdAt', profile.created_at,
    'updatedAt', profile.updated_at,
    'lastSignInAt', account.last_sign_in_at
  )
  from public.admin_profiles profile
  join auth.users account on account.id = profile.user_id
  where profile.user_id = target_user_id
$$;

create or replace function public.admin_list_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.admin_role := public._staff_require_manager();
begin
  return jsonb_build_object(
    'actorRole', actor_role,
    'actorId', auth.uid(),
    'staff', coalesce((
      select jsonb_agg(public._staff_row(profile.user_id)
        order by profile.active desc, array_position(array['owner', 'admin', 'manager', 'content_manager']::public.admin_role[], profile.role), lower(profile.name))
      from public.admin_profiles profile
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(entry order by entry ->> 'createdAt' desc)
      from (
        select jsonb_build_object(
          'userId', audit.user_id,
          'name', coalesce(target.name, account.email),
          'actor', coalesce(actor.name, 'Система'),
          'changes', audit.changes,
          'createdAt', audit.created_at
        ) entry
        from public.admin_staff_audit audit
        left join public.admin_profiles target on target.user_id = audit.user_id
        left join auth.users account on account.id = audit.user_id
        left join public.admin_profiles actor on actor.user_id = audit.actor_id
        order by audit.created_at desc
        limit 30
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

-- Attaches a staff profile to an existing Auth account. Returns {status: 'needs_account'} when
-- no account has that email, so the caller can create one and retry.
create or replace function public.admin_add_staff(email text, name text, role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.admin_role := public._staff_require_manager();
  clean_email text := lower(btrim(coalesce(email, '')));
  clean_name text := btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g'));
  target_role public.admin_role;
  target_id uuid;
  existing public.admin_profiles%rowtype;
begin
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(clean_email) > 254 then
    raise exception using errcode = '22023', message = 'Вкажіть коректний email.';
  end if;
  if clean_name = '' or char_length(clean_name) > 80 then
    raise exception using errcode = '22023', message = 'Вкажіть ім’я працівника (до 80 символів).';
  end if;
  if role is null or role not in ('owner', 'admin', 'manager', 'content_manager') then
    raise exception using errcode = '22023', message = 'Оберіть роль.';
  end if;
  target_role := role::public.admin_role;
  if actor_role = 'admin' and target_role in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'Адміністратор може додавати лише менеджерів і контент-менеджерів.';
  end if;

  select account.id into target_id from auth.users account where lower(account.email) = clean_email limit 1;
  if target_id is null then
    return jsonb_build_object('status', 'needs_account', 'email', clean_email);
  end if;
  select * into existing from public.admin_profiles profile where profile.user_id = target_id;
  if found then
    raise exception using errcode = '23505', message = format('%s вже є серед працівників.', clean_email);
  end if;

  insert into public.admin_profiles (user_id, name, role, active) values (target_id, clean_name, target_role, true);
  insert into public.admin_staff_audit (user_id, actor_id, changes)
  values (target_id, auth.uid(), jsonb_build_object('created', jsonb_build_object('name', clean_name, 'role', target_role)));
  return jsonb_build_object('status', 'added', 'staff', public._staff_row(target_id));
end;
$$;

create or replace function public.admin_update_staff(target_user_id uuid, patch jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.admin_role := public._staff_require_manager();
  target public.admin_profiles%rowtype;
  next_name text;
  next_role public.admin_role;
  next_active boolean;
  changes jsonb := '{}'::jsonb;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані працівника.';
  end if;
  select * into target from public.admin_profiles profile where profile.user_id = target_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Працівника не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Дані працівника вже змінили. Оновіть сторінку.';
  end if;
  if actor_role = 'admin' and target.role in ('owner', 'admin') and target.user_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Адміністратор може змінювати лише менеджерів і контент-менеджерів.';
  end if;

  next_name := target.name;
  if patch ? 'name' then
    next_name := btrim(regexp_replace(coalesce(patch ->> 'name', ''), '\s+', ' ', 'g'));
    if next_name = '' or char_length(next_name) > 80 then
      raise exception using errcode = '22023', message = 'Вкажіть ім’я працівника (до 80 символів).';
    end if;
  end if;
  next_role := target.role;
  if patch ? 'role' then
    if coalesce(patch ->> 'role', '') not in ('owner', 'admin', 'manager', 'content_manager') then
      raise exception using errcode = '22023', message = 'Оберіть роль.';
    end if;
    next_role := (patch ->> 'role')::public.admin_role;
  end if;
  next_active := target.active;
  if patch ? 'active' then
    if jsonb_typeof(patch -> 'active') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Доступ: очікується так або ні.';
    end if;
    next_active := (patch ->> 'active')::boolean;
  end if;

  if target.user_id = auth.uid() and (next_role <> target.role or not next_active) then
    raise exception using errcode = '42501', message = 'Власну роль і доступ змінює інший власник.';
  end if;
  if actor_role = 'admin' and next_role in ('owner', 'admin') and next_role <> target.role then
    raise exception using errcode = '42501', message = 'Роль власника чи адміністратора призначає лише власник.';
  end if;

  if next_name <> target.name then changes := changes || jsonb_build_object('name', jsonb_build_object('from', target.name, 'to', next_name)); end if;
  if next_role <> target.role then changes := changes || jsonb_build_object('role', jsonb_build_object('from', target.role, 'to', next_role)); end if;
  if next_active <> target.active then changes := changes || jsonb_build_object('active', jsonb_build_object('from', target.active, 'to', next_active)); end if;
  if changes = '{}'::jsonb then return public._staff_row(target.user_id); end if;

  begin
    update public.admin_profiles
    set name = next_name, role = next_role, active = next_active
    where user_id = target.user_id;
  exception when check_violation then
    raise exception using errcode = '23514', message = 'Має залишитися хоча б один активний власник.';
  end;
  insert into public.admin_staff_audit (user_id, actor_id, changes) values (target.user_id, auth.uid(), changes);
  return public._staff_row(target.user_id);
end;
$$;

revoke all on function public._staff_require_manager() from public, anon, authenticated;
revoke all on function public._staff_row(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_staff() from public, anon;
revoke all on function public.admin_add_staff(text, text, text) from public, anon;
revoke all on function public.admin_update_staff(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_list_staff() to authenticated;
grant execute on function public.admin_add_staff(text, text, text) to authenticated;
grant execute on function public.admin_update_staff(uuid, jsonb, timestamptz) to authenticated;
