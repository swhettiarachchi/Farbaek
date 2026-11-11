-- Farbaek schema v90: developer API keys (stage 177, ADR 0187).
--
-- An owner or admin makes a key for the developer API (the v1 test space API,
-- which Lite and up include). A key works in one workspace and acts as the
-- person who made it, with the role they have there at the moment of each
-- call: if they leave, or lose the owner or admin role, their keys stop. A key
-- is "fbk_" plus 32 random bytes; Farbaek stores only its SHA-256 and shows
-- the whole key once. Browsers can read which keys exist, never the hash.

create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  created_by    uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60 and name !~ '[[:cntrl:]]'),
  token_sha256  text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  -- The key's first characters, so people can tell keys apart: "fbk_" and four more.
  hint          text not null check (hint ~ '^fbk_[A-Za-z0-9_-]{4}$'),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid references auth.users (id) on delete set null,
  constraint api_keys_expiry_check check (expires_at > created_at and expires_at <= created_at + interval '366 days')
);
create index api_keys_org_idx on public.api_keys (org_id, created_at desc);

alter table public.api_keys enable row level security;
revoke all on public.api_keys from public, anon, authenticated, service_role;
-- Owners and admins see which keys exist and when they were used, never the hash.
grant select (id, org_id, created_by, name, hint, created_at, expires_at, last_used_at, revoked_at) on public.api_keys to authenticated;
grant select on public.api_keys to service_role;
create policy "owners and admins read their workspace's API keys" on public.api_keys
  for select to authenticated using ((select private.has_role(org_id, array['owner', 'admin']::public.org_role[])));

-- Makes a key. Owners and admins only, in a workspace that isn't suspended, with at most 10 working keys.
create function public.app_create_api_key(p_org uuid, p_actor uuid, p_name text, p_sha256 text, p_hint text, p_days integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if private.org_suspended(p_org) then
    raise exception 'SUSPENDED' using errcode = '42501';
  end if;
  if p_days not in (30, 90, 365) then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  -- One key at a time per workspace, so the count below can't be raced past.
  perform pg_advisory_xact_lock(hashtextextended('api_keys:' || p_org::text, 0));
  if (select count(*) from public.api_keys k where k.org_id = p_org and k.revoked_at is null and k.expires_at > now()) >= 10 then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.api_keys (org_id, created_by, name, token_sha256, hint, expires_at)
  values (p_org, p_actor, btrim(p_name), p_sha256, p_hint, now() + make_interval(days => p_days))
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'api_key.created', v_id::text, jsonb_build_object('name', btrim(p_name), 'key_starts', p_hint, 'days', p_days));
  return v_id;
end;
$$;

-- Turns a key off for good. Owners and admins only; it stays listed as revoked.
create function public.app_revoke_api_key(p_org uuid, p_actor uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hint text;
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.api_keys k set revoked_at = now(), revoked_by = p_actor
  where k.id = p_id and k.org_id = p_org and k.revoked_at is null
  returning k.hint into v_hint;
  if v_hint is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'api_key.revoked', p_id::text, jsonb_build_object('key_starts', v_hint));
end;
$$;

-- What a key may do now, for the API's own check of each call, by the key's SHA-256. Nothing when the key is unknown,
-- revoked or expired, or its maker is no longer an owner or admin there. Marks it used at most once a minute.
create function public.app_api_key_session(p_sha256 text)
returns table (key_id uuid, org_id uuid, user_id uuid, role public.org_role, suspended boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_keys%rowtype;
  v_role public.org_role;
begin
  select * into v_key from public.api_keys k where k.token_sha256 = p_sha256;
  if not found or v_key.revoked_at is not null or v_key.expires_at <= now() then
    return;
  end if;
  select m.role into v_role from public.organization_members m where m.org_id = v_key.org_id and m.user_id = v_key.created_by;
  if v_role is null or v_role not in ('owner', 'admin') then
    return;
  end if;
  update public.api_keys k set last_used_at = now()
  where k.id = v_key.id and (k.last_used_at is null or k.last_used_at < now() - interval '1 minute');
  return query select v_key.id, v_key.org_id, v_key.created_by, v_role, private.org_suspended(v_key.org_id);
end;
$$;

-- When a key's maker leaves the workspace or stops being an owner or admin, their keys there are revoked for good, so
-- a key that leaked can't come back if they return. Recorded as Farbaek's doing. Skipped while the whole workspace is
-- being deleted: its keys and records go with it.
create function private.revoke_api_keys_of_former_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := old.org_id;
  v_user uuid := old.user_id;
  v_reason text;
begin
  if tg_op = 'DELETE' then
    v_reason := 'left';
  elsif old.role in ('owner', 'admin') and new.role not in ('owner', 'admin') then
    v_reason := 'role_changed';
  else
    return null;
  end if;
  if not exists (select 1 from public.organizations o where o.id = v_org) then
    return null;
  end if;
  with revoked as (
    update public.api_keys k set revoked_at = now()
    where k.org_id = v_org and k.created_by = v_user and k.revoked_at is null
    returning k.id, k.hint
  )
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  select v_org, null, 'api_key.revoked', r.id::text, jsonb_build_object('key_starts', r.hint, 'reason', v_reason) from revoked r;
  return null;
end;
$$;
revoke all on function private.revoke_api_keys_of_former_manager() from public;

create trigger organization_members_revoke_api_keys
  after update of role or delete on public.organization_members
  for each row execute function private.revoke_api_keys_of_former_manager();

revoke all on function public.app_create_api_key(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.app_revoke_api_key(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_api_key_session(text) from public, anon, authenticated;
grant execute on function public.app_create_api_key(uuid, uuid, text, text, text, integer) to service_role;
grant execute on function public.app_revoke_api_key(uuid, uuid, uuid) to service_role;
grant execute on function public.app_api_key_session(text) to service_role;
