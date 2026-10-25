-- Farbaek schema v48: LaunchOS with Vercel (ADR 0078).
--
-- A workspace connects its own Vercel account with a token. The token is
-- sealed on the server (AES-256-GCM) before it reaches the database, and no
-- browser can read it back: members see only who it belongs to. A launch is
-- authorized once, for exactly the files being sent (their digest), under
-- the same evidence rule as publishing (ADR 0050): the latest applied change
-- verified, or an owner or admin's reason. Each authorization has its own
-- key, so pressing twice can't deploy twice, and one launch per project runs
-- at a time. The server records Vercel's progress on the order.

create table public.provider_connections (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  provider           text not null check (provider in ('vercel')),
  account_id         text not null check (char_length(account_id) between 1 and 100),
  account_name       text not null check (char_length(account_name) between 1 and 200),
  team_id            text check (team_id is null or team_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  -- Postgres caps a regex repeat at 255, so the length is checked on its own.
  token_sealed       text not null check (token_sealed ~ '^v1\.(k1|d1)\.[A-Za-z0-9_-]+$' and char_length(token_sealed) between 46 and 4000),
  connected_by       uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz,
  unique (org_id, provider)
);

alter table public.provider_connections enable row level security;
revoke all on public.provider_connections from public, anon, authenticated, service_role;
-- Members see who a connection belongs to, never the sealed token.
grant select (id, org_id, provider, account_id, account_name, team_id, connected_by, created_at, last_used_at) on public.provider_connections to authenticated;
grant select on public.provider_connections to service_role;
create policy "members read their workspace's connections" on public.provider_connections
  for select to authenticated using ((select private.is_member(org_id)));

create table public.launch_orders (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations (id) on delete cascade,
  project_id              uuid not null,
  provider                text not null check (provider in ('vercel')),
  idempotency_key         uuid not null,
  status                  text not null default 'authorized' check (status in ('authorized', 'uploading', 'building', 'ready', 'failed')),
  target_name             text not null check (target_name ~ '^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$'),
  account_name            text not null check (char_length(account_name) between 1 and 200),
  files_digest            text not null check (files_digest ~ '^[0-9a-f]{64}$'),
  file_count              integer not null check (file_count between 1 and 3000),
  total_bytes             bigint not null check (total_bytes between 1 and 26214400),
  evidence                text not null check (evidence in ('verified', 'unverified', 'partially_verified', 'failed', 'changed', 'none')),
  evidence_proofpack      text,
  override_reason         text,
  authorized_by           uuid references auth.users (id) on delete set null,
  authorized_at           timestamptz not null default now(),
  provider_deployment_id  text check (provider_deployment_id is null or char_length(provider_deployment_id) between 1 and 200),
  url                     text check (url is null or url ~ '^https://[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$'),
  inspector_url           text check (inspector_url is null or inspector_url ~ '^https://vercel\.com/'),
  failure                 text check (failure is null or char_length(failure) between 1 and 300),
  -- The live check after it's ready: the HTTP status the address answered with, 0 for no answer.
  health_status           integer check (health_status is null or health_status between 0 and 599),
  health_checked_at       timestamptz,
  updated_at              timestamptz not null default now(),
  finished_at             timestamptz,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  unique (org_id, idempotency_key),
  constraint launch_orders_evidence check (evidence = 'verified' or override_reason is not null),
  constraint launch_orders_finished check ((status in ('ready', 'failed')) = (finished_at is not null))
);
create index launch_orders_project_idx on public.launch_orders (project_id, authorized_at desc);
create unique index launch_orders_one_running on public.launch_orders (project_id) where status in ('authorized', 'uploading', 'building');

alter table public.launch_orders enable row level security;
revoke all on public.launch_orders from public, anon, authenticated, service_role;
grant select on public.launch_orders to authenticated, service_role;
create policy "members read their workspace's launches" on public.launch_orders
  for select to authenticated using ((select private.is_member(org_id)));

-- Owners and admins connect (or replace) the workspace's account with a provider.
-- p_limit is the plan's number of integrations; null means no limit.
create function public.app_connect_provider(p_org uuid, p_actor uuid, p_provider text, p_account_id text, p_account_name text, p_team_id text, p_sealed text, p_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_limit is not null and (select count(*) from public.provider_connections c where c.org_id = p_org and c.provider <> p_provider) >= p_limit then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.provider_connections (org_id, provider, account_id, account_name, team_id, token_sealed, connected_by)
  values (p_org, p_provider, p_account_id, p_account_name, nullif(btrim(coalesce(p_team_id, '')), ''), p_sealed, p_actor)
  on conflict (org_id, provider) do update
    set account_id = excluded.account_id, account_name = excluded.account_name, team_id = excluded.team_id,
        token_sealed = excluded.token_sealed, connected_by = excluded.connected_by, created_at = now(), last_used_at = null
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'provider.connected', v_id::text, jsonb_build_object('provider', p_provider, 'account', p_account_name, 'team', nullif(btrim(coalesce(p_team_id, '')), '')));
  return v_id;
end;
$$;
revoke all on function public.app_connect_provider(uuid, uuid, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.app_connect_provider(uuid, uuid, text, text, text, text, text, integer) to service_role;

-- Owners and admins disconnect it; the sealed token is deleted with the row.
create function public.app_disconnect_provider(p_org uuid, p_actor uuid, p_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.provider_connections where org_id = p_org and provider = p_provider;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'provider.disconnected', p_org::text, jsonb_build_object('provider', p_provider));
end;
$$;
revoke all on function public.app_disconnect_provider(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_disconnect_provider(uuid, uuid, text) to service_role;

-- An order with no progress for an hour counts as lost (a restart mid-launch);
-- Vercel's builds end well within that.
create function private.close_stale_launches(p_project uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.launch_orders
     set status = 'failed', failure = 'Farbaek lost track of this launch. Check its state in Vercel, then launch again if needed.', updated_at = now(), finished_at = now()
   where project_id = p_project and status in ('authorized', 'uploading', 'building') and updated_at < now() - interval '60 minutes';
$$;
revoke all on function private.close_stale_launches(uuid) from public;

-- Authorizes one launch of exactly these files. The same key returns the same order.
create function public.app_authorize_launch(
  p_org uuid, p_actor uuid, p_project uuid, p_provider text, p_key uuid, p_target text,
  p_digest text, p_file_count integer, p_bytes bigint, p_override_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_connection public.provider_connections%rowtype;
  v_evidence text;
  v_proofpack text;
  v_reason text;
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  select id into v_existing from public.launch_orders where org_id = p_org and idempotency_key = p_key;
  if found then
    return v_existing;
  end if;
  if not exists (select 1 from public.projects where id = p_project and org_id = p_org and archived_at is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_connection from public.provider_connections where org_id = p_org and provider = p_provider;
  if not found then
    raise exception 'NOT_CONNECTED' using errcode = 'P0001';
  end if;
  perform private.close_stale_launches(p_project);
  if exists (select 1 from public.launch_orders where project_id = p_project and status in ('authorized', 'uploading', 'building')) then
    raise exception 'LAUNCH_RUNNING' using errcode = 'P0001';
  end if;

  -- The evidence gate (ADR 0050): verified, or an owner or admin says why.
  select e.status, e.proofpack into v_evidence, v_proofpack from private.launch_evidence(p_project) e;
  if v_evidence <> 'verified' then
    if p_override_reason is null or btrim(p_override_reason) = '' then
      raise exception 'EVIDENCE_REQUIRED' using errcode = 'P0001';
    end if;
    perform private.require_override_role(p_org, p_actor);
    v_reason := private.require_reason(p_override_reason);
  end if;

  insert into public.launch_orders (org_id, project_id, provider, idempotency_key, target_name, account_name, files_digest, file_count, total_bytes, evidence, evidence_proofpack, override_reason, authorized_by)
  values (p_org, p_project, p_provider, p_key, p_target, v_connection.account_name, p_digest, p_file_count, p_bytes, v_evidence, v_proofpack, v_reason, p_actor)
  returning id into v_id;
  update public.provider_connections set last_used_at = now() where id = v_connection.id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'launch.authorized', p_project::text, jsonb_build_object(
    'order', v_id, 'provider', p_provider, 'target', p_target, 'digest', p_digest, 'files', p_file_count,
    'evidence', v_evidence, 'proofpack', v_proofpack, 'override', v_reason));
  return v_id;
end;
$$;
revoke all on function public.app_authorize_launch(uuid, uuid, uuid, text, uuid, text, text, integer, bigint, text) from public, anon, authenticated;
grant execute on function public.app_authorize_launch(uuid, uuid, uuid, text, uuid, text, text, integer, bigint, text) to service_role;

-- Records the provider's progress on an order, forward only. A finished order doesn't change.
create function public.app_update_launch_order(p_id uuid, p_status text, p_deployment text, p_url text, p_inspector text, p_failure text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.launch_orders%rowtype;
  v_rank constant jsonb := '{"authorized": 0, "uploading": 1, "building": 2, "ready": 3, "failed": 3}';
begin
  select * into v from public.launch_orders where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v.status in ('ready', 'failed') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status not in ('uploading', 'building', 'ready', 'failed') or (v_rank ->> p_status)::integer < (v_rank ->> v.status)::integer then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status = 'failed' and (p_failure is null or btrim(p_failure) = '') then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  update public.launch_orders
     set status = p_status,
         provider_deployment_id = coalesce(p_deployment, provider_deployment_id),
         url = coalesce(p_url, url),
         inspector_url = coalesce(p_inspector, inspector_url),
         failure = case when p_status = 'failed' then left(btrim(p_failure), 300) else null end,
         updated_at = now(),
         finished_at = case when p_status in ('ready', 'failed') then now() else null end
   where id = p_id;
  if p_status in ('ready', 'failed') then
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v.org_id, null, 'launch.' || p_status, v.project_id::text, jsonb_build_object('order', p_id, 'deployment', coalesce(p_deployment, v.provider_deployment_id), 'url', coalesce(p_url, v.url)));
  end if;
end;
$$;
revoke all on function public.app_update_launch_order(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_update_launch_order(uuid, text, text, text, text, text) to service_role;

-- Records a live check of a ready launch's address.
create function public.app_record_launch_health(p_id uuid, p_status integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.launch_orders set health_status = p_status, health_checked_at = now() where id = p_id and status = 'ready';
  if not found then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.app_record_launch_health(uuid, integer) from public, anon, authenticated;
grant execute on function public.app_record_launch_health(uuid, integer) to service_role;

notify pgrst, 'reload schema';
