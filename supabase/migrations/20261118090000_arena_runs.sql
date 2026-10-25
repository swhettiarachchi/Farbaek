-- Farbaek schema v47: the Future-State Arena (ADR 0076).
--
-- A person can try a change before approving it: one disposable sandbox runs
-- the contract's checks on the project's current files, then with the
-- proposal's files written over them. Nothing is applied, and a trial never
-- writes a receipt, a ProofPack or a task transition. This table records
-- each trial: the proposal and its exact content hash, who asked, the
-- session, and both lists of results, written once by the server. One trial
-- runs per proposal at a time, and only while the proposal waits for review.

create table public.arena_runs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  task_id          uuid not null,
  proposal_id      uuid not null references public.change_proposals (id) on delete cascade,
  proposal_sha256  text not null check (proposal_sha256 ~ '^[0-9a-f]{64}$'),
  started_by       uuid references auth.users (id) on delete set null,
  session_id       uuid references public.sandbox_sessions (id) on delete set null,
  status           text not null default 'running' check (status in ('running', 'done', 'failed')),
  baseline         jsonb,
  candidate        jsonb,
  failure          text check (failure is null or char_length(failure) between 1 and 300),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  constraint arena_runs_finished check ((status = 'running') = (finished_at is null)),
  constraint arena_runs_outcome check (
    (status = 'running' and baseline is null and candidate is null and failure is null)
    or (status = 'done' and jsonb_typeof(baseline) = 'array' and jsonb_typeof(candidate) = 'array' and failure is null)
    or (status = 'failed' and candidate is null and failure is not null and (baseline is null or jsonb_typeof(baseline) = 'array'))
  )
);
create unique index arena_runs_one_running on public.arena_runs (proposal_id) where status = 'running';
create index arena_runs_proposal_idx on public.arena_runs (proposal_id, started_at desc);

alter table public.arena_runs enable row level security;
revoke all on public.arena_runs from public, anon, authenticated, service_role;
grant select on public.arena_runs to authenticated, service_role;
create policy "members read their workspace's trials" on public.arena_runs
  for select to authenticated using ((select private.is_member(org_id)));

-- A trial that ran longer than its sandbox could have counts as stopped (a restart, a lost process).
create function private.close_stale_arena_runs(p_proposal uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.arena_runs
     set status = 'failed', failure = 'It stopped without finishing, so there are no results. Try it again.', finished_at = now()
   where proposal_id = p_proposal and status = 'running' and started_at < now() - interval '30 minutes';
$$;
revoke all on function private.close_stale_arena_runs(uuid) from public;

-- A list of check results, as the server writes them: at most 20, each with a name.
create function private.valid_arena_checks(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 20
     and not exists (
       select 1 from jsonb_array_elements(p) e
        -- A missing key reads as null, so each test is coalesced to fail closed.
        where jsonb_typeof(e) <> 'object'
           or coalesce(jsonb_typeof(e -> 'name'), 'missing') <> 'string'
           or coalesce(char_length(e ->> 'name'), 0) not between 1 and 300
           or coalesce(jsonb_typeof(e -> 'exitCode'), 'missing') not in ('number', 'null')
     );
$$;
revoke all on function private.valid_arena_checks(jsonb) from public;

-- Starts a trial of a proposal that's waiting for review.
create function public.app_start_arena_run(p_org uuid, p_actor uuid, p_proposal uuid)
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

  perform private.close_stale_arena_runs(p_proposal);
  if exists (select 1 from public.arena_runs where proposal_id = p_proposal and status = 'running') then
    raise exception 'ARENA_RUNNING' using errcode = 'P0001';
  end if;

  insert into public.arena_runs (org_id, task_id, proposal_id, proposal_sha256, started_by)
  values (p_org, v_proposal.task_id, p_proposal, v_proposal.sha256, p_actor)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'arena.started', p_proposal::text, jsonb_build_object('trial', v_id, 'task', v_proposal.task_id));
  return v_id;
end;
$$;
revoke all on function public.app_start_arena_run(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_start_arena_run(uuid, uuid, uuid) to service_role;

-- Names the sandbox session a trial runs in: one of this workspace's, for the proposal's project.
create function public.app_attach_arena_session(p_id uuid, p_actor uuid, p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.arena_runs%rowtype;
begin
  select * into v from public.arena_runs where id = p_id for update;
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
  update public.arena_runs set session_id = p_session where id = p_id;
end;
$$;
revoke all on function public.app_attach_arena_session(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_attach_arena_session(uuid, uuid, uuid) to service_role;

-- Ends a trial once: done with both result lists, or failed with the reason (and the baseline, if it ran).
create function public.app_finish_arena_run(p_id uuid, p_actor uuid, p_status text, p_baseline jsonb, p_candidate jsonb, p_failure text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.arena_runs%rowtype;
begin
  select * into v from public.arena_runs where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v.org_id, p_actor);
  if v.status <> 'running' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status = 'done' then
    if not private.valid_arena_checks(p_baseline) or not private.valid_arena_checks(p_candidate) then
      raise exception 'INVALID_REQUEST' using errcode = '22023';
    end if;
    update public.arena_runs set status = 'done', baseline = p_baseline, candidate = p_candidate, finished_at = now() where id = p_id;
  elsif p_status = 'failed' then
    if p_failure is null or (p_baseline is not null and not private.valid_arena_checks(p_baseline)) then
      raise exception 'INVALID_REQUEST' using errcode = '22023';
    end if;
    update public.arena_runs set status = 'failed', baseline = p_baseline, failure = left(p_failure, 300), finished_at = now() where id = p_id;
  else
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v.org_id, p_actor, 'arena.finished', v.proposal_id::text, jsonb_build_object('trial', p_id, 'status', p_status));
end;
$$;
revoke all on function public.app_finish_arena_run(uuid, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.app_finish_arena_run(uuid, uuid, text, jsonb, jsonb, text) to service_role;

notify pgrst, 'reload schema';
