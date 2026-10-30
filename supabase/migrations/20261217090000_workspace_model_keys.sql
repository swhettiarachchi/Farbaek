-- Farbaek schema v76: a workspace's own model key (ADR 0125, spec §10 and
-- §12: "local models and org gateways").
--
-- An owner or admin can give the workspace its own Anthropic API key, and
-- optionally a company gateway (an Anthropic-compatible https address). The
-- server seals the key (AES-256-GCM, bound to the workspace) before it gets
-- here; this table never holds it in the clear, and browsers can't read the
-- sealed value. Calls made on the workspace's own key don't count against
-- Farbaek's AI allowance; their token counts are logged in
-- model_key_usage instead, so the workspace still sees what it used.

create table public.workspace_model_keys (
  org_id         uuid primary key references public.organizations (id) on delete cascade,
  provider       text not null check (provider in ('anthropic')),
  -- Postgres caps a regex repeat at 255, so the length is checked on its own.
  key_sealed     text not null check (key_sealed ~ '^v1\.(k1|d1)\.[A-Za-z0-9_-]+$' and char_length(key_sealed) between 46 and 2000),
  -- The key's last characters, so people can tell keys apart. Never more than 6.
  key_hint       text not null check (key_hint ~ '^[A-Za-z0-9_-]{4,6}$'),
  base_url       text check (base_url is null or (base_url ~ '^https://[a-z0-9.-]+(/[A-Za-z0-9._~/-]*)?$' and char_length(base_url) <= 300)),
  set_by         uuid references auth.users (id) on delete set null,
  set_at         timestamptz not null default now(),
  last_used_at   timestamptz
);

alter table public.workspace_model_keys enable row level security;
revoke all on public.workspace_model_keys from public, anon, authenticated, service_role;
-- Members see that a key is set and which one, never the sealed value.
grant select (org_id, provider, key_hint, base_url, set_by, set_at, last_used_at) on public.workspace_model_keys to authenticated;
grant select on public.workspace_model_keys to service_role;
create policy "members read their workspace's model key" on public.workspace_model_keys
  for select to authenticated using ((select private.is_member(org_id)));

create table public.model_key_usage (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  actor_id       uuid references auth.users (id) on delete set null,
  task_id        uuid,
  operation      text not null check (char_length(operation) between 1 and 40),
  model          text not null check (char_length(model) between 1 and 100),
  input_tokens   integer not null check (input_tokens >= 0),
  output_tokens  integer not null check (output_tokens >= 0),
  cache_read_tokens  integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  created_at     timestamptz not null default now(),
  constraint model_key_usage_task_same_org_fk foreign key (task_id, org_id) references public.tasks (id, org_id) on delete set null (task_id)
);
create index model_key_usage_task_idx on public.model_key_usage (org_id, task_id);

alter table public.model_key_usage enable row level security;
revoke all on public.model_key_usage from public, anon, authenticated, service_role;
grant select on public.model_key_usage to authenticated, service_role;
create policy "members read their workspace's own-key usage" on public.model_key_usage
  for select to authenticated using ((select private.is_member(org_id)));

-- Sets or replaces the workspace's key. Owners and admins only.
create function public.app_set_model_key(p_org uuid, p_actor uuid, p_provider text, p_key_sealed text, p_key_hint text, p_base_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.workspace_model_keys (org_id, provider, key_sealed, key_hint, base_url, set_by, set_at, last_used_at)
  values (p_org, p_provider, p_key_sealed, p_key_hint, p_base_url, p_actor, now(), null)
  on conflict (org_id) do update
    set provider = excluded.provider, key_sealed = excluded.key_sealed, key_hint = excluded.key_hint, base_url = excluded.base_url,
        set_by = excluded.set_by, set_at = excluded.set_at, last_used_at = null;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'workspace.model_key_set', p_provider,
          jsonb_build_object('provider', p_provider, 'key_ends', p_key_hint, 'gateway', case when p_base_url is null then null else split_part(substr(p_base_url, 9), '/', 1) end));
end;
$$;

-- Removes it: the workspace goes back to Farbaek's AI. Owners and admins only.
create function public.app_remove_model_key(p_org uuid, p_actor uuid)
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
  delete from public.workspace_model_keys where org_id = p_org returning key_hint into v_hint;
  if v_hint is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'workspace.model_key_removed', 'anthropic', jsonb_build_object('key_ends', v_hint));
end;
$$;

-- Logs one call made on the workspace's own key, and marks the key used.
create function public.app_record_model_key_usage(p_org uuid, p_actor uuid, p_task uuid, p_operation text, p_model text, p_input integer, p_output integer, p_cache_read integer, p_cache_write integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspace_model_keys k where k.org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.model_key_usage (org_id, actor_id, task_id, operation, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
  values (p_org, p_actor, p_task, p_operation, p_model, greatest(p_input, 0), greatest(p_output, 0), greatest(coalesce(p_cache_read, 0), 0), greatest(coalesce(p_cache_write, 0), 0));
  update public.workspace_model_keys set last_used_at = now() where org_id = p_org and (last_used_at is null or last_used_at < now() - interval '1 minute');
end;
$$;

revoke all on function public.app_set_model_key(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_remove_model_key(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_record_model_key_usage(uuid, uuid, uuid, text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.app_set_model_key(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.app_remove_model_key(uuid, uuid) to service_role;
grant execute on function public.app_record_model_key_usage(uuid, uuid, uuid, text, text, integer, integer, integer, integer) to service_role;
