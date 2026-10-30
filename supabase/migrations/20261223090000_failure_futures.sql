-- Farbaek schema v82: the Failure Futures Lab (ADR 0135, spec §10).
--
-- Failure scenarios are suggested from the lines a proposed change adds and
-- stay hypothetical until a person tries one. A trial runs one AI-written
-- test that simulates the failure, with the proposal's files, in a
-- disposable sandbox, and records what it observed: reproduced, handled or
-- inconclusive. The test, its command, exit code and output are kept, so a
-- person can judge whether the test was fair. One trial runs per proposal at
-- a time, and only while the proposal waits for review. Written once by the
-- server; members read.

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping', 'policy_draft', 'image_generation', 'second_check', 'task_note', 'failure_test'));

create table public.failure_futures (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  task_id          uuid not null,
  proposal_id      uuid not null references public.change_proposals (id) on delete cascade,
  proposal_sha256  text not null check (proposal_sha256 ~ '^[0-9a-f]{64}$'),
  kind             text not null check (kind in ('duplicate_delivery', 'out_of_order', 'timeout', 'rate_limit', 'concurrency', 'partial_db_failure', 'expired_credentials', 'permission_denied', 'malformed_input', 'empty_input', 'timezone_boundary', 'retry_loop', 'incompatible_api', 'missing_config')),
  evidence         jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) between 1 and 3),
  started_by       uuid references auth.users (id) on delete set null,
  session_id       uuid references public.sandbox_sessions (id) on delete set null,
  status           text not null default 'running' check (status in ('running', 'reproduced', 'handled', 'inconclusive', 'not_testable', 'failed')),
  test_path        text check (test_path is null or char_length(test_path) between 1 and 500),
  test_content     text check (test_content is null or char_length(test_content) <= 20000),
  test_sha256      text check (test_sha256 is null or test_sha256 ~ '^[0-9a-f]{64}$'),
  expects          text check (expects is null or char_length(expects) <= 500),
  command          text check (command is null or char_length(command) <= 600),
  exit_code        integer,
  duration_ms      integer check (duration_ms is null or duration_ms >= 0),
  output           text check (output is null or char_length(output) <= 4000),
  reason           text check (reason is null or char_length(reason) <= 500),
  model            text check (model is null or char_length(model) <= 100),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  constraint failure_futures_finished check ((status = 'running') = (finished_at is null)),
  -- A trial that observed something names the test it ran.
  constraint failure_futures_observed check (status not in ('reproduced', 'handled') or (test_content is not null and test_sha256 is not null and command is not null))
);
create unique index failure_futures_one_running on public.failure_futures (proposal_id) where status = 'running';
create index failure_futures_proposal_idx on public.failure_futures (proposal_id, started_at desc);

alter table public.failure_futures enable row level security;
revoke all on public.failure_futures from public, anon, authenticated, service_role;
grant select on public.failure_futures to authenticated, service_role;
create policy "members read their workspace's failure trials" on public.failure_futures
  for select to authenticated using ((select private.is_member(org_id)));

-- A trial left running longer than its sandbox could have counts as stopped.
create function private.close_stale_failure_futures(p_proposal uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.failure_futures
     set status = 'failed', reason = 'It stopped without finishing, so nothing was observed. Try it again.', finished_at = now()
   where proposal_id = p_proposal and status = 'running' and started_at < now() - interval '30 minutes';
$$;
revoke all on function private.close_stale_failure_futures(uuid) from public;

-- Starts a trial of one scenario on a proposal that's waiting for review.
create function public.app_start_failure_future(p_org uuid, p_actor uuid, p_proposal uuid, p_kind text, p_evidence jsonb)
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
  if jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) not between 1 and 3 or exists (
    select 1 from jsonb_array_elements(p_evidence) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(jsonb_typeof(e -> 'path'), 'missing') <> 'string'
        or coalesce(jsonb_typeof(e -> 'line'), 'missing') <> 'number'
        or coalesce(char_length(e ->> 'snippet'), 0) > 200
  ) then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;

  perform private.close_stale_failure_futures(p_proposal);
  if exists (select 1 from public.failure_futures where proposal_id = p_proposal and status = 'running') then
    raise exception 'FAILURE_TRIAL_RUNNING' using errcode = 'P0001';
  end if;

  insert into public.failure_futures (org_id, task_id, proposal_id, proposal_sha256, kind, evidence, started_by)
  values (p_org, v_proposal.task_id, p_proposal, v_proposal.sha256, p_kind, p_evidence, p_actor)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'failure_future.started', p_proposal::text, jsonb_build_object('trial', v_id, 'task', v_proposal.task_id, 'kind', p_kind));
  return v_id;
end;
$$;
revoke all on function public.app_start_failure_future(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_start_failure_future(uuid, uuid, uuid, text, jsonb) to service_role;

-- Names the sandbox session a trial runs in: one of this workspace's, for the proposal's project.
create function public.app_attach_failure_session(p_id uuid, p_actor uuid, p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.failure_futures%rowtype;
begin
  select * into v from public.failure_futures where id = p_id for update;
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
  update public.failure_futures set session_id = p_session where id = p_id;
end;
$$;
revoke all on function public.app_attach_failure_session(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_attach_failure_session(uuid, uuid, uuid) to service_role;

-- Ends a trial once, with what it observed or why it didn't run.
create function public.app_finish_failure_future(p_id uuid, p_actor uuid, p_status text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.failure_futures%rowtype;
begin
  select * into v from public.failure_futures where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v.org_id, p_actor);
  if v.status <> 'running' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status not in ('reproduced', 'handled', 'inconclusive', 'not_testable', 'failed') or jsonb_typeof(p_result) <> 'object' then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  update public.failure_futures
     set status       = p_status,
         test_path    = p_result ->> 'testPath',
         test_content = p_result ->> 'test',
         test_sha256  = p_result ->> 'testSha256',
         expects      = left(p_result ->> 'expects', 500),
         command      = p_result ->> 'command',
         exit_code    = (p_result ->> 'exitCode')::integer,
         duration_ms  = (p_result ->> 'durationMs')::integer,
         output       = right(p_result ->> 'output', 4000),
         reason       = left(p_result ->> 'reason', 500),
         model        = left(p_result ->> 'model', 100),
         finished_at  = now()
   where id = p_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v.org_id, p_actor, 'failure_future.finished', v.proposal_id::text, jsonb_build_object('trial', p_id, 'kind', v.kind, 'status', p_status));
end;
$$;
revoke all on function public.app_finish_failure_future(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_finish_failure_future(uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
