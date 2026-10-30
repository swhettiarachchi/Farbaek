-- Farbaek schema v74: permission leases for paired agents (ADR 0117, spec §9).
--
-- A paired Farbaek Agent used to hold a token with no end, on every project,
-- with the pairing person's full rights. Now each agent holds a lease:
--
-- - it ends: 90 days after pairing or the last renewal (at most 90 days ahead);
-- - its projects: every project in the workspace (null), or the ones listed;
-- - what it may do: read tasks and files, propose changes, use Farbaek's AI
--   through the model gateway, and use Mesh's relay;
-- - how many requests an hour, counted on the server.
--
-- The server checks the lease on every agent request (app_agent_session
-- returns it). Owners, admins and the person who paired an agent can set its
-- lease; each change is recorded in the audit log. A revoked agent's lease
-- can't be set again. Agents paired before this keep working for 90 days
-- from now, then need a renewal.

alter table public.agents
  add column lease_expires_at       timestamptz,
  add column lease_projects         uuid[],
  add column lease_capabilities     text[] not null default array['read', 'propose', 'model', 'mesh'],
  add column lease_actions_per_hour integer not null default 600,
  add column lease_set_at           timestamptz,
  add column lease_set_by           uuid;

update public.agents set lease_expires_at = now() + interval '90 days', lease_set_at = now() where lease_expires_at is null;

alter table public.agents
  alter column lease_expires_at set not null,
  alter column lease_expires_at set default now() + interval '90 days',
  add constraint agents_lease_capabilities check (lease_capabilities <@ array['read', 'propose', 'model', 'mesh']::text[] and cardinality(lease_capabilities) between 1 and 4),
  add constraint agents_lease_actions check (lease_actions_per_hour between 10 and 5000),
  add constraint agents_lease_projects check (lease_projects is null or cardinality(lease_projects) between 1 and 100);

-- Members see each agent's lease on the Agents page.
grant select (lease_expires_at, lease_projects, lease_capabilities, lease_actions_per_hour, lease_set_at) on public.agents to authenticated;

-- The agent behind a token, with its lease. Nothing for a revoked agent;
-- the server refuses an expired lease itself, so it can say why.
drop function public.app_agent_session(text);
create function public.app_agent_session(p_token_sha256 text)
returns table (
  agent_id uuid,
  org_id uuid,
  user_id uuid,
  role public.org_role,
  name text,
  lease_expires_at timestamptz,
  lease_projects uuid[],
  lease_capabilities text[],
  lease_actions_per_hour integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
begin
  select * into v_agent from public.agents a where a.token_sha256 = p_token_sha256;
  if not found or v_agent.revoked_at is not null then
    return;
  end if;
  update public.agents a set last_seen_at = now()
  where a.id = v_agent.id and (a.last_seen_at is null or a.last_seen_at < now() - interval '1 minute');
  return query
    select v_agent.id, v_agent.org_id, v_agent.paired_by,
           (select m.role from public.organization_members m where m.org_id = v_agent.org_id and m.user_id = v_agent.paired_by),
           v_agent.name, v_agent.lease_expires_at, v_agent.lease_projects, v_agent.lease_capabilities, v_agent.lease_actions_per_hour;
end;
$$;

-- Sets an agent's lease: renewing, narrowing or widening it within the limits.
create function public.app_agent_lease_set(
  p_agent uuid,
  p_actor uuid,
  p_days integer,
  p_projects uuid[],
  p_capabilities text[],
  p_actions_per_hour integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
  v_expires timestamptz;
  v_projects uuid[];
begin
  select * into v_agent from public.agents a where a.id = p_agent for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_agent.paired_by <> p_actor and not exists (
    select 1 from public.organization_members m where m.org_id = v_agent.org_id and m.user_id = p_actor and m.role in ('owner', 'admin')
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_agent.revoked_at is not null then
    raise exception 'AGENT_REVOKED' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'INVALID_LEASE: a lease lasts 1 to 90 days' using errcode = '22023';
  end if;
  if p_capabilities is null or cardinality(p_capabilities) = 0 or not (p_capabilities <@ array['read', 'propose', 'model', 'mesh']::text[]) then
    raise exception 'INVALID_LEASE: unknown capability' using errcode = '22023';
  end if;
  if p_actions_per_hour is null or p_actions_per_hour < 10 or p_actions_per_hour > 5000 then
    raise exception 'INVALID_LEASE: 10 to 5000 requests an hour' using errcode = '22023';
  end if;
  if p_projects is not null then
    select array_agg(distinct x) into v_projects from unnest(p_projects) as x;
    if v_projects is null or cardinality(v_projects) > 100 or exists (
      select 1 from unnest(v_projects) as x where not exists (select 1 from public.projects p where p.id = x and p.org_id = v_agent.org_id)
    ) then
      raise exception 'INVALID_LEASE: a project isn''t in this workspace' using errcode = '22023';
    end if;
  end if;

  v_expires := now() + make_interval(days => p_days);
  update public.agents a
     set lease_expires_at = v_expires,
         lease_projects = v_projects,
         lease_capabilities = (select array_agg(distinct c order by c) from unnest(p_capabilities) as c),
         lease_actions_per_hour = p_actions_per_hour,
         lease_set_at = now(),
         lease_set_by = p_actor
   where a.id = p_agent;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_agent.org_id, p_actor, 'agent.lease_set', p_agent::text, jsonb_build_object(
    'name', v_agent.name,
    'expires_at', v_expires,
    'projects', coalesce(cardinality(v_projects), 0),
    'all_projects', v_projects is null,
    'capabilities', p_capabilities,
    'actions_per_hour', p_actions_per_hour
  ));
  return v_expires;
end;
$$;

revoke all on function public.app_agent_session(text) from public, anon, authenticated;
revoke all on function public.app_agent_lease_set(uuid, uuid, integer, uuid[], text[], integer) from public, anon, authenticated;
grant execute on function public.app_agent_session(text) to service_role;
grant execute on function public.app_agent_lease_set(uuid, uuid, integer, uuid[], text[], integer) to service_role;
