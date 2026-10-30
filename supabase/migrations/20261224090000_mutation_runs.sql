-- Farbaek schema v83: mutation trials (ADR 0136, spec §10 "Test integrity").
--
-- A person can ask how well a project's tests catch small mistakes in the
-- lines a change adds. Farbaek makes up to 8 mutants on those lines and runs
-- the related tests once per mutant in one disposable sandbox. This table
-- records each run: the proposal and its exact content hash, who asked, the
-- session, the command, the clean run's time, every mutant with what its run
-- showed, and the compute time. The counts are worked out here from the
-- mutants, never taken from the caller. One run per proposal at a time, only
-- while the proposal waits for review. Written once by the server; members read.

create table public.mutation_runs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  task_id          uuid not null,
  proposal_id      uuid not null references public.change_proposals (id) on delete cascade,
  proposal_sha256  text not null check (proposal_sha256 ~ '^[0-9a-f]{64}$'),
  started_by       uuid references auth.users (id) on delete set null,
  session_id       uuid references public.sandbox_sessions (id) on delete set null,
  status           text not null default 'running' check (status in ('running', 'done', 'failed')),
  command          text check (command is null or char_length(command) between 1 and 2000),
  baseline_ms      integer check (baseline_ms is null or baseline_ms >= 0),
  mutants          jsonb,
  caught           integer,
  survived         integer,
  judged           integer,
  compute_ms       bigint check (compute_ms is null or compute_ms >= 0),
  reason           text check (reason is null or char_length(reason) between 1 and 500),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  constraint mutation_runs_finished check ((status = 'running') = (finished_at is null)),
  constraint mutation_runs_outcome check (
    (status = 'running' and mutants is null and reason is null)
    or (status = 'done' and jsonb_typeof(mutants) = 'array' and command is not null and caught is not null and survived is not null and judged is not null)
    or (status = 'failed' and reason is not null)
  )
);
create unique index mutation_runs_one_running on public.mutation_runs (proposal_id) where status = 'running';
create index mutation_runs_proposal_idx on public.mutation_runs (proposal_id, started_at desc);

alter table public.mutation_runs enable row level security;
revoke all on public.mutation_runs from public, anon, authenticated, service_role;
grant select on public.mutation_runs to authenticated, service_role;
create policy "members read their workspace's mutation trials" on public.mutation_runs
  for select to authenticated using ((select private.is_member(org_id)));

create function private.close_stale_mutation_runs(p_proposal uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.mutation_runs
     set status = 'failed', reason = 'It stopped without finishing, so there are no results. Try it again.', finished_at = now()
   where proposal_id = p_proposal and status = 'running' and started_at < now() - interval '30 minutes';
$$;
revoke all on function private.close_stale_mutation_runs(uuid) from public;

-- A list of mutants as the server writes them: at most 8, each placed in a file, with what its run showed.
create function private.valid_mutants(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) between 1 and 8
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(jsonb_typeof(e -> 'path'), 'missing') <> 'string'
           or coalesce(char_length(e ->> 'path'), 0) not between 1 and 500
           or coalesce(jsonb_typeof(e -> 'line'), 'missing') <> 'number'
           or coalesce(e ->> 'result', 'missing') not in ('killed', 'survived', 'timed_out', 'not_viable', 'not_run')
           or coalesce(char_length(e ->> 'before'), 0) > 200
           or coalesce(char_length(e ->> 'after'), 0) > 200
     );
$$;
revoke all on function private.valid_mutants(jsonb) from public;

create function public.app_start_mutation_run(p_org uuid, p_actor uuid, p_proposal uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.change_proposals%rowtype;
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v_proposal from public.change_proposals where id = p_proposal and org_id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_proposal.status <> 'pending' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  perform private.close_stale_mutation_runs(p_proposal);
  if exists (select 1 from public.mutation_runs where proposal_id = p_proposal and status = 'running') then
    raise exception 'MUTATION_RUNNING' using errcode = 'P0001';
  end if;
  insert into public.mutation_runs (org_id, task_id, proposal_id, proposal_sha256, started_by)
  values (p_org, v_proposal.task_id, p_proposal, v_proposal.sha256, p_actor)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'mutation.started', p_proposal::text, jsonb_build_object('run', v_id, 'task', v_proposal.task_id));
  return v_id;
end;
$$;
revoke all on function public.app_start_mutation_run(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_start_mutation_run(uuid, uuid, uuid) to service_role;

create function public.app_attach_mutation_session(p_id uuid, p_actor uuid, p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.mutation_runs%rowtype;
begin
  select * into v from public.mutation_runs where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v.org_id, p_actor);
  if v.status <> 'running' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.sandbox_sessions s
      join public.change_proposals p on p.id = v.proposal_id
     where s.id = p_session and s.org_id = v.org_id and s.project_id = p.project_id
  ) then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  update public.mutation_runs set session_id = p_session where id = p_id;
end;
$$;
revoke all on function public.app_attach_mutation_session(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_attach_mutation_session(uuid, uuid, uuid) to service_role;

-- Ends a run once: done with every mutant's result, or failed with the reason.
create function public.app_finish_mutation_run(p_id uuid, p_actor uuid, p_status text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.mutation_runs%rowtype;
  v_caught integer;
  v_survived integer;
begin
  select * into v from public.mutation_runs where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v.org_id, p_actor);
  if v.status <> 'running' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_result) <> 'object' then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if p_status = 'done' then
    if not private.valid_mutants(p_result -> 'mutants') or p_result ->> 'command' is null then
      raise exception 'INVALID_REQUEST' using errcode = '22023';
    end if;
    select count(*) filter (where e ->> 'result' in ('killed', 'timed_out')), count(*) filter (where e ->> 'result' = 'survived')
      into v_caught, v_survived
      from jsonb_array_elements(p_result -> 'mutants') e;
    update public.mutation_runs
       set status = 'done', command = p_result ->> 'command', baseline_ms = (p_result ->> 'baselineMs')::integer, mutants = p_result -> 'mutants',
           caught = v_caught, survived = v_survived, judged = v_caught + v_survived, compute_ms = (p_result ->> 'computeMs')::bigint, finished_at = now()
     where id = p_id;
  elsif p_status = 'failed' then
    if p_result ->> 'reason' is null then
      raise exception 'INVALID_REQUEST' using errcode = '22023';
    end if;
    update public.mutation_runs
       set status = 'failed', command = p_result ->> 'command', baseline_ms = (p_result ->> 'baselineMs')::integer, reason = left(p_result ->> 'reason', 500),
           compute_ms = (p_result ->> 'computeMs')::bigint, finished_at = now()
     where id = p_id;
  else
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v.org_id, p_actor, 'mutation.finished', v.proposal_id::text, jsonb_build_object('run', p_id, 'status', p_status, 'caught', v_caught, 'survived', v_survived));
end;
$$;
revoke all on function public.app_finish_mutation_run(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_finish_mutation_run(uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
