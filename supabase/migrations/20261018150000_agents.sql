-- Farbaek schema v14: paired desktop agents (Farbaek Agent, Stage 4).
--
-- A contributor pairs the desktop app with a workspace: the web app shows a
-- one-time code for 10 minutes; the app redeems it and receives an agent
-- token, shown to the app once. Farbaek stores only SHA-256 hashes of the
-- code and the token, so a copy of the database can't be used to pair or to
-- act as an agent.
--
-- An agent acts for the person who paired it, and only while that person is
-- still a contributor in the workspace (re-checked on every request). The
-- plan's agent limit is checked under a lock when a code is created and
-- again when it's redeemed. Owners and admins can revoke any agent; the
-- person who paired an agent can revoke it too.
--
-- Agents never write project files. Their work arrives as an ordinary change
-- proposal through app_create_proposal, tagged with the agent's id, so the
-- same contract checks, policy, metering, review and apply steps apply.

create table public.agents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  platform      text not null check (platform in ('windows', 'macos', 'linux')),
  app_version   text check (app_version is null or app_version ~ '^[0-9A-Za-z.+-]{1,40}$'),
  token_sha256  text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  paired_by     uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid,
  unique (id, org_id)
);
create index agents_org_idx on public.agents (org_id, created_at desc);

alter table public.agents enable row level security;
revoke all on public.agents from anon, authenticated;
-- Members see their workspace's agents. The token hash is left out of the grant, so browsers can never select it.
grant select (id, org_id, name, platform, app_version, paired_by, created_at, last_seen_at, revoked_at, revoked_by) on public.agents to authenticated;
create policy "members read agents" on public.agents
  for select to authenticated using ((select private.is_member(org_id)));

-- Pairing codes: server-only. Nothing here is readable from a browser.
create table public.agent_pairings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  code_sha256  text not null unique check (code_sha256 ~ '^[0-9a-f]{64}$'),
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  redeemed_at  timestamptz,
  agent_id     uuid references public.agents (id) on delete set null,
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);
create index agent_pairings_org_idx on public.agent_pairings (org_id, created_at desc);
alter table public.agent_pairings enable row level security;
revoke all on public.agent_pairings from anon, authenticated;

-- Proposals made by an agent point to it.
alter table public.change_proposals add column agent_id uuid references public.agents (id) on delete set null;

-- Agents counted against the plan: paired and not revoked.
create function private.active_agents(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.agents where org_id = p_org and revoked_at is null;
$$;
revoke all on function private.active_agents(uuid) from public;

-- p_agent_limit is the plan's agent allowance (null: set by contract).
create function public.app_create_agent_pairing(p_org uuid, p_actor uuid, p_code_sha256 text, p_expires_at timestamptz, p_agent_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(p_org, p_actor);
  if p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then
    raise exception 'INVALID_PAIRING' using errcode = '22023';
  end if;
  if p_agent_limit is not null and private.active_agents(p_org) >= p_agent_limit then
    raise exception 'AGENT_LIMIT' using errcode = 'P0001';
  end if;
  -- One open code per person per workspace: a new code replaces the old one.
  delete from public.agent_pairings where org_id = p_org and created_by = p_actor and redeemed_at is null;
  insert into public.agent_pairings (org_id, code_sha256, created_by, expires_at)
  values (p_org, p_code_sha256, p_actor, p_expires_at)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'agent.pairing_created', v_id::text, jsonb_build_object('expires_at', p_expires_at));
  return v_id;
end;
$$;

-- Redeems a code once, within its expiry, while the plan has room. Returns the new agent.
create function public.app_redeem_agent_pairing(
  p_code_sha256 text,
  p_token_sha256 text,
  p_name text,
  p_platform text,
  p_app_version text,
  p_agent_limit integer
)
returns table (agent_id uuid, org_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pairing public.agent_pairings%rowtype;
  v_agent uuid;
begin
  select * into v_pairing from public.agent_pairings where code_sha256 = p_code_sha256 for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_pairing.redeemed_at is not null or v_pairing.expires_at <= now() then
    raise exception 'PAIRING_CLOSED' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = v_pairing.org_id for update;
  perform private.require_contributor(v_pairing.org_id, v_pairing.created_by);
  if p_agent_limit is not null and private.active_agents(v_pairing.org_id) >= p_agent_limit then
    raise exception 'AGENT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.agents (org_id, name, platform, app_version, token_sha256, paired_by)
  values (v_pairing.org_id, trim(p_name), p_platform, nullif(trim(coalesce(p_app_version, '')), ''), p_token_sha256, v_pairing.created_by)
  returning id into v_agent;
  update public.agent_pairings set redeemed_at = now(), agent_id = v_agent where id = v_pairing.id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_pairing.org_id, v_pairing.created_by, 'agent.paired', v_agent::text, jsonb_build_object('name', trim(p_name), 'platform', p_platform));
  return query select v_agent, v_pairing.org_id;
end;
$$;

-- Resolves an agent token for one request: the agent, its workspace, and the
-- role its person holds now (null once they've left). Marks the agent as seen,
-- at most once a minute.
create function public.app_agent_session(p_token_sha256 text)
returns table (agent_id uuid, org_id uuid, user_id uuid, role public.org_role, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
begin
  select * into v_agent from public.agents where token_sha256 = p_token_sha256;
  if not found or v_agent.revoked_at is not null then
    return;
  end if;
  update public.agents set last_seen_at = now()
  where id = v_agent.id and (last_seen_at is null or last_seen_at < now() - interval '1 minute');
  return query
    select v_agent.id, v_agent.org_id, v_agent.paired_by,
           (select m.role from public.organization_members m where m.org_id = v_agent.org_id and m.user_id = v_agent.paired_by),
           v_agent.name;
end;
$$;

create function public.app_revoke_agent(p_agent uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
begin
  select * into v_agent from public.agents where id = p_agent for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_agent.paired_by <> p_actor and not exists (
    select 1 from public.organization_members where org_id = v_agent.org_id and user_id = p_actor and role in ('owner', 'admin')
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_agent.revoked_at is not null then
    raise exception 'AGENT_REVOKED' using errcode = '22023';
  end if;
  update public.agents set revoked_at = now(), revoked_by = p_actor where id = p_agent;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_agent.org_id, p_actor, 'agent.revoked', p_agent::text, jsonb_build_object('name', v_agent.name));
end;
$$;

-- An agent's proposal: the same function people's proposals go through, run
-- for the person who paired the agent, then tagged with the agent, in one
-- transaction. Agent steps must name this agent.
create function public.app_create_agent_proposal(
  p_agent uuid,
  p_task uuid,
  p_actor uuid,
  p_contract_version integer,
  p_plan jsonb,
  p_changes jsonb,
  p_dropped jsonb,
  p_violations jsonb,
  p_sha256 text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_expected_task_version integer,
  p_steps jsonb,
  p_policy jsonb,
  p_evaluation_limit integer,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
  v_task_org uuid;
  v_id uuid;
begin
  select * into v_agent from public.agents where id = p_agent for share;
  if not found or v_agent.revoked_at is not null then
    raise exception 'AGENT_REVOKED' using errcode = '42501';
  end if;
  select t.org_id into v_task_org from public.tasks t where t.id = p_task;
  if v_task_org is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_task_org <> v_agent.org_id or v_agent.paired_by <> p_actor then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s
    where s.value ->> 'actor_kind' = 'agent' and s.value ->> 'actor_id' is distinct from 'agent:' || p_agent::text
  ) then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;

  v_id := public.app_create_proposal(p_task, p_actor, p_contract_version, p_plan, p_changes, p_dropped, p_violations, p_sha256, p_model,
                                     p_input_tokens, p_output_tokens, p_expected_task_version, p_steps, p_policy, p_evaluation_limit,
                                     p_period_start, p_period_end);
  update public.change_proposals set agent_id = p_agent where id = v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_agent.org_id, p_actor, 'agent.proposal_submitted', v_id::text, jsonb_build_object('agent_id', p_agent, 'task_id', p_task));
  return v_id;
end;
$$;

revoke all on function public.app_create_agent_pairing(uuid, uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.app_redeem_agent_pairing(text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.app_agent_session(text) from public, anon, authenticated;
revoke all on function public.app_revoke_agent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_create_agent_proposal(uuid, uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text, text, integer, integer, integer, jsonb, jsonb, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.app_create_agent_pairing(uuid, uuid, text, timestamptz, integer) to service_role;
grant execute on function public.app_redeem_agent_pairing(text, text, text, text, text, integer) to service_role;
grant execute on function public.app_agent_session(text) to service_role;
grant execute on function public.app_revoke_agent(uuid, uuid) to service_role;
grant execute on function public.app_create_agent_proposal(uuid, uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text, text, integer, integer, integer, jsonb, jsonb, integer, timestamptz, timestamptz) to service_role;
