-- Farbaek schema v16: cloud agent runs (ADR 0022).
--
-- A contributor starts the Farbaek Agent on a task whose contract is
-- approved. The run works on Farbaek's servers: model steps through the
-- model gateway (metered from the usage wallet, migration 15), commands in a
-- sandbox session (migration 10). People follow it live: every step is an
-- event, appended here. A run never writes project files. Its finished work
-- arrives as an ordinary change proposal through app_create_proposal, tagged
-- with the run, so the same contract checks, policy, metering, review and
-- apply steps apply.
--
-- One live run per task. A run is "live" while starting, working or waiting
-- for a person's approval. Only the server writes runs and their events.

create table public.agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  task_id             uuid not null references public.tasks (id) on delete cascade,
  project_id          uuid not null references public.projects (id) on delete cascade,
  started_by          uuid not null references auth.users (id) on delete cascade,
  effort              text not null check (effort in ('fast', 'balanced', 'deep')),
  -- sandboxed: commands run in a sandbox session; review_only: no commands, a patch only.
  mode                text not null check (mode in ('sandboxed', 'review_only')),
  status              text not null default 'starting' check (status in ('starting', 'working', 'waiting', 'finished', 'failed', 'cancelled', 'interrupted')),
  model               text check (model is null or char_length(model) <= 100),
  steps               integer not null default 0 check (steps >= 0),
  input_tokens        bigint not null default 0 check (input_tokens >= 0),
  output_tokens       bigint not null default 0 check (output_tokens >= 0),
  contract_version    integer not null check (contract_version > 0),
  contract_sha256     text not null check (contract_sha256 ~ '^[0-9a-f]{64}$'),
  sandbox_session_id  uuid references public.sandbox_sessions (id) on delete set null,
  outcome             text check (outcome is null or char_length(outcome) <= 2000),
  finish              jsonb check (finish is null or jsonb_typeof(finish) = 'object'),
  proposal_id         uuid references public.change_proposals (id) on delete set null,
  started_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  ended_at            timestamptz,
  check ((status in ('starting', 'working', 'waiting')) = (ended_at is null))
);
create index agent_runs_org_idx on public.agent_runs (org_id, started_at desc);
create index agent_runs_task_idx on public.agent_runs (task_id, started_at desc);
create unique index agent_runs_one_live_per_task on public.agent_runs (task_id) where status in ('starting', 'working', 'waiting');

create table public.agent_run_events (
  id          bigint generated always as identity primary key,
  run_id      uuid not null references public.agent_runs (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  kind        text not null check (kind in ('model', 'tool', 'approval', 'note', 'command')),
  payload     jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384),
  created_at  timestamptz not null default now()
);
create index agent_run_events_run_idx on public.agent_run_events (run_id, id);

alter table public.agent_runs enable row level security;
alter table public.agent_run_events enable row level security;
revoke all on public.agent_runs, public.agent_run_events from anon, authenticated;
grant select on public.agent_runs, public.agent_run_events to authenticated;
create policy "members read agent runs" on public.agent_runs
  for select to authenticated using ((select private.is_member(org_id)));
create policy "members read agent run events" on public.agent_run_events
  for select to authenticated using ((select private.is_member(org_id)));

-- Proposals made by a cloud run point to it.
alter table public.change_proposals add column run_id uuid references public.agent_runs (id) on delete set null;

-- Starts a run for an approved task. The server has checked the contract it read; this re-checks membership and the task under the lock.
create function public.app_start_agent_run(
  p_org uuid,
  p_actor uuid,
  p_task uuid,
  p_effort text,
  p_mode text,
  p_contract_version integer,
  p_contract_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_id uuid;
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(p_org, p_actor);
  select * into v_task from public.tasks where id = p_task and org_id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_task.state <> 'CONTRACT_APPROVED' then
    raise exception 'INVALID_TRANSITION' using errcode = '22023';
  end if;
  if exists (select 1 from public.agent_runs where task_id = p_task and status in ('starting', 'working', 'waiting')) then
    raise exception 'RUN_ACTIVE' using errcode = '23505';
  end if;

  insert into public.agent_runs (org_id, task_id, project_id, started_by, effort, mode, contract_version, contract_sha256)
  values (p_org, p_task, v_task.project_id, p_actor, p_effort, p_mode, p_contract_version, p_contract_sha256)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'agent.run_started', v_id::text, jsonb_build_object('task_id', p_task, 'effort', p_effort, 'mode', p_mode));
  return v_id;
end;
$$;

-- Records progress: appends events (at most 50 per call) and updates the run. Ended runs can't change.
create function public.app_update_agent_run(
  p_run uuid,
  p_status text,
  p_model text,
  p_add_steps integer,
  p_add_input_tokens integer,
  p_add_output_tokens integer,
  p_sandbox_session uuid,
  p_outcome text,
  p_finish jsonb,
  p_events jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.agent_runs%rowtype;
  v_event jsonb;
begin
  select * into v_run from public.agent_runs where id = p_run for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_run.ended_at is not null then
    raise exception 'RUN_ENDED' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('working', 'waiting', 'finished', 'failed', 'cancelled', 'interrupted') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if coalesce(p_add_steps, 0) < 0 or coalesce(p_add_input_tokens, 0) < 0 or coalesce(p_add_output_tokens, 0) < 0 then
    raise exception 'INVALID_USAGE' using errcode = '22023';
  end if;
  if p_events is not null and (jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50) then
    raise exception 'INVALID_EVENTS' using errcode = '22023';
  end if;
  if p_sandbox_session is not null and not exists (select 1 from public.sandbox_sessions where id = p_sandbox_session and org_id = v_run.org_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  for v_event in select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    insert into public.agent_run_events (run_id, org_id, kind, payload)
    values (p_run, v_run.org_id, v_event ->> 'kind', coalesce(v_event -> 'payload', '{}'::jsonb));
  end loop;

  update public.agent_runs
  set status = coalesce(p_status, status),
      model = coalesce(p_model, model),
      steps = steps + coalesce(p_add_steps, 0),
      input_tokens = input_tokens + coalesce(p_add_input_tokens, 0),
      output_tokens = output_tokens + coalesce(p_add_output_tokens, 0),
      sandbox_session_id = coalesce(p_sandbox_session, sandbox_session_id),
      outcome = coalesce(p_outcome, outcome),
      finish = coalesce(p_finish, finish),
      updated_at = now(),
      ended_at = case when coalesce(p_status, status) in ('finished', 'failed', 'cancelled', 'interrupted') then now() else null end
  where id = p_run;
end;
$$;

-- Marks live runs that stopped reporting as interrupted (their server went
-- away). A working run reports at least every minute, even while it waits for
-- a person. Returns how many were interrupted.
create function public.app_interrupt_stale_agent_runs(p_stale_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with stopped as (
    update public.agent_runs
    set status = 'interrupted', ended_at = now(), updated_at = now(),
        outcome = 'Farbaek stopped while this run was working. It won''t continue on its own: start a new run.'
    where status in ('starting', 'working', 'waiting') and updated_at < p_stale_before
    returning id, org_id
  ), noted as (
    insert into public.agent_run_events (run_id, org_id, kind, payload)
    select id, org_id, 'note', jsonb_build_object('text', 'Interrupted: the run stopped reporting.') from stopped
  )
  select count(*) into v_count from stopped;
  return v_count;
end;
$$;

-- A run's proposal: the same function people's proposals go through, run for
-- the person who started the run, then tagged with it, in one transaction.
-- The run's own steps must name the run.
create function public.app_create_run_proposal(
  p_run uuid,
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
  v_run public.agent_runs%rowtype;
  v_id uuid;
begin
  select * into v_run from public.agent_runs where id = p_run for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_run.task_id <> p_task or v_run.started_by <> p_actor then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_run.status not in ('working', 'waiting') or v_run.proposal_id is not null then
    raise exception 'RUN_ENDED' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s
    where s.value ->> 'actor_kind' = 'agent' and s.value ->> 'actor_id' is distinct from 'run:' || p_run::text
  ) then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;

  v_id := public.app_create_proposal(p_task, p_actor, p_contract_version, p_plan, p_changes, p_dropped, p_violations, p_sha256, p_model,
                                     p_input_tokens, p_output_tokens, p_expected_task_version, p_steps, p_policy, p_evaluation_limit,
                                     p_period_start, p_period_end);
  update public.change_proposals set run_id = p_run where id = v_id;
  update public.agent_runs set proposal_id = v_id, updated_at = now() where id = p_run;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_run.org_id, p_actor, 'agent.run_proposal_submitted', v_id::text, jsonb_build_object('run_id', p_run, 'task_id', p_task));
  return v_id;
end;
$$;

revoke all on function public.app_start_agent_run(uuid, uuid, uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.app_update_agent_run(uuid, text, text, integer, integer, integer, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.app_interrupt_stale_agent_runs(timestamptz) from public, anon, authenticated;
revoke all on function public.app_create_run_proposal(uuid, uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text, text, integer, integer, integer, jsonb, jsonb, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.app_start_agent_run(uuid, uuid, uuid, text, text, integer, text) to service_role;
grant execute on function public.app_update_agent_run(uuid, text, text, integer, integer, integer, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.app_interrupt_stale_agent_runs(timestamptz) to service_role;
grant execute on function public.app_create_run_proposal(uuid, uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text, text, integer, integer, integer, jsonb, jsonb, integer, timestamptz, timestamptz) to service_role;
