-- Farbaek schema v60: Mesh's secure relay (ADR 0094).
--
-- Two paired Farbaek Agents that aren't on the same network can send to each
-- other through Farbaek's server, end to end encrypted: the server passes
-- bytes along in memory and keeps none of them. The database keeps only:
--   - which agents turned on "Reachable through Farbaek", with their mesh
--     device fingerprint (the first 16 hex digits of SHA-256 of a public key),
--     so members can see them;
--   - each workspace's relayed bytes for the day, against its allowance;
--   - one audit event per relayed session: which two agents and how many
--     bytes, never file names or contents.
-- Only the server writes any of it.

alter table public.agents
  add column mesh_fingerprint text check (mesh_fingerprint is null or mesh_fingerprint ~ '^[0-9a-f]{16}$'),
  add column mesh_reachable_at timestamptz,
  add constraint agents_mesh_reachable check (mesh_reachable_at is null or mesh_fingerprint is not null);
grant select (mesh_fingerprint, mesh_reachable_at) on public.agents to authenticated;

create table public.mesh_relay_days (
  org_id  uuid not null references public.organizations (id) on delete cascade,
  day     date not null,
  bytes   bigint not null default 0 check (bytes >= 0),
  primary key (org_id, day)
);
alter table public.mesh_relay_days enable row level security;
revoke all on public.mesh_relay_days from public, anon, authenticated, service_role;
grant select on public.mesh_relay_days to authenticated, service_role;
create policy "members read their workspace's relay days" on public.mesh_relay_days
  for select to authenticated using ((select private.is_member(org_id)));

-- An agent turns reachability on (with its mesh fingerprint) or off. Audited when it changes.
create function public.app_agent_set_mesh_relay(p_agent uuid, p_fingerprint text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.agents%rowtype;
begin
  select * into v from public.agents where id = p_agent and revoked_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_on and (p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{16}$') then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if p_on then
    update public.agents set mesh_fingerprint = p_fingerprint, mesh_reachable_at = coalesce(case when mesh_fingerprint = p_fingerprint then mesh_reachable_at end, now()) where id = p_agent;
  else
    update public.agents set mesh_reachable_at = null where id = p_agent;
  end if;
  if (v.mesh_reachable_at is not null) is distinct from p_on or (p_on and v.mesh_fingerprint is distinct from p_fingerprint) then
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v.org_id, v.paired_by, case when p_on then 'mesh.relay_reachable' else 'mesh.relay_unreachable' end, p_agent::text,
            jsonb_build_object('agent', v.name, 'fingerprint', case when p_on then p_fingerprint else v.mesh_fingerprint end));
  end if;
end;
$$;
revoke all on function public.app_agent_set_mesh_relay(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.app_agent_set_mesh_relay(uuid, text, boolean) to service_role;

-- Adds relayed bytes to the workspace's day (UTC), under a lock. Returns false
-- once the day is past its cap: the relay then closes the session.
create function public.app_mesh_relay_use(p_org uuid, p_bytes bigint, p_cap bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
begin
  if p_bytes is null or p_bytes < 0 or p_cap is null or p_cap <= 0 then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  insert into public.mesh_relay_days (org_id, day, bytes)
  values (p_org, (now() at time zone 'utc')::date, p_bytes)
  on conflict (org_id, day) do update set bytes = public.mesh_relay_days.bytes + excluded.bytes
  returning bytes into v_total;
  -- Old days aren't needed for anything.
  delete from public.mesh_relay_days where org_id = p_org and day < (now() at time zone 'utc')::date - 30;
  return v_total <= p_cap;
end;
$$;
revoke all on function public.app_mesh_relay_use(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.app_mesh_relay_use(uuid, bigint, bigint) to service_role;

-- One audit event per relayed session, once it ends.
create function public.app_mesh_relay_session_ended(p_org uuid, p_caller uuid, p_callee uuid, p_bytes bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  if p_reason not in ('done', 'cancelled', 'idle', 'expired', 'allowance', 'unreachable', 'declined') or p_bytes < 0 then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  select paired_by into v_actor from public.agents where id = p_caller and org_id = p_org;
  if not found or not exists (select 1 from public.agents where id = p_callee and org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, v_actor, 'mesh.relay_session', p_caller::text, jsonb_build_object('caller', p_caller, 'callee', p_callee, 'bytes', p_bytes, 'ended', p_reason));
end;
$$;
revoke all on function public.app_mesh_relay_session_ended(uuid, uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.app_mesh_relay_session_ended(uuid, uuid, uuid, bigint, text) to service_role;

notify pgrst, 'reload schema';
