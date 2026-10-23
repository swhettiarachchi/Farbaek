-- Farbaek schema v32: verifying an applied change in one step (ADR 0047).
--
-- Each attempt to check an applied change in a sandbox is recorded: who or
-- what started it (a person, or the workspace's autonomy right after a change
-- applied on its own), the session it ran in, and how it ended, including an
-- attempt that couldn't run and why. One attempt runs per task at a time. The
-- check run itself still writes its receipt and verification ProofPack as
-- before; this table only says which attempt produced them.
--
-- It also closes a gap in v31: a change applied on its own whose checks
-- partly fail now pauses autonomy too, not only one whose checks all fail.

create table public.task_verifications (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  task_id         uuid not null,
  proposal_id     uuid references public.change_proposals (id) on delete set null,
  started_by      uuid references auth.users (id) on delete set null,
  trigger         text not null check (trigger in ('person', 'autonomy')),
  session_id      uuid references public.sandbox_sessions (id) on delete set null,
  status          text not null default 'running' check (status in ('running', 'done', 'failed')),
  result          text check (result in ('verified', 'partially_verified', 'failed', 'unverified')),
  receipt_digest  text references public.sandbox_receipts (digest),
  failure         text check (failure is null or char_length(failure) between 1 and 300),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  constraint task_verifications_finished check ((status = 'running') = (finished_at is null)),
  constraint task_verifications_outcome check (
    (status = 'running' and result is null and receipt_digest is null and failure is null)
    or (status = 'done' and result is not null and receipt_digest is not null and failure is null)
    or (status = 'failed' and result is null and receipt_digest is null and failure is not null)
  )
);
create unique index task_verifications_one_running on public.task_verifications (task_id) where status = 'running';
create index task_verifications_task_idx on public.task_verifications (task_id, started_at desc);

alter table public.task_verifications enable row level security;
revoke all on public.task_verifications from public, anon, authenticated, service_role;
grant select on public.task_verifications to authenticated, service_role;
create policy "members read their workspace's verifications" on public.task_verifications
  for select to authenticated using ((select private.is_member(org_id)));

-- How long an attempt may run before it counts as stopped (a restart, a lost process).
create function private.close_stale_verifications(p_task uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.task_verifications
     set status = 'failed', failure = 'It stopped without finishing, so nothing was recorded. Run the checks again.', finished_at = now()
   where task_id = p_task and status = 'running' and started_at < now() - interval '20 minutes';
$$;
revoke all on function private.close_stale_verifications(uuid) from public;

-- Starts an attempt for a task whose change is applied and waiting for its checks.
create function public.app_start_task_verification(p_org uuid, p_actor uuid, p_task uuid, p_trigger text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_proposal uuid;
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_trigger not in ('person', 'autonomy') then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  select * into v_task from public.tasks where id = p_task and org_id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_task.state <> 'VERIFYING' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  select id into v_proposal from public.change_proposals
  where task_id = p_task and status = 'applied' order by decided_at desc nulls last limit 1;
  if v_proposal is null then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  perform private.close_stale_verifications(p_task);
  if exists (select 1 from public.task_verifications where task_id = p_task and status = 'running') then
    raise exception 'VERIFICATION_RUNNING' using errcode = 'P0001';
  end if;

  insert into public.task_verifications (org_id, task_id, proposal_id, started_by, trigger)
  values (p_org, p_task, v_proposal, p_actor, p_trigger)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'verification.started', p_task::text, jsonb_build_object('verification', v_id, 'trigger', p_trigger, 'proposal', v_proposal));
  return v_id;
end;
$$;
revoke all on function public.app_start_task_verification(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_start_task_verification(uuid, uuid, uuid, text) to service_role;

-- Names the sandbox session an attempt runs in; it must be linked to the same task.
create function public.app_attach_verification_session(p_id uuid, p_actor uuid, p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.task_verifications%rowtype;
begin
  select * into v from public.task_verifications where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v.org_id, p_actor);
  if v.status <> 'running' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.sandbox_sessions s where s.id = p_session and s.org_id = v.org_id and s.task_id = v.task_id) then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  update public.task_verifications set session_id = p_session where id = p_id;
end;
$$;
revoke all on function public.app_attach_verification_session(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_attach_verification_session(uuid, uuid, uuid) to service_role;

-- Ends an attempt: done with the receipt its check run wrote, or failed with the reason it couldn't run.
create function public.app_finish_task_verification(p_id uuid, p_actor uuid, p_status text, p_receipt text, p_failure text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.task_verifications%rowtype;
  v_result text;
begin
  select * into v from public.task_verifications where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v.org_id, p_actor);
  if v.status <> 'running' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status = 'done' then
    -- The result is the receipt's own: never a claim the server makes separately.
    select r.status into v_result from public.sandbox_receipts r
    where r.digest = p_receipt and r.org_id = v.org_id and r.task_id = v.task_id
      and (v.session_id is null or r.session_id = v.session_id);
    if v_result is null then
      raise exception 'INVALID_REQUEST' using errcode = '22023';
    end if;
    update public.task_verifications set status = 'done', result = v_result, receipt_digest = p_receipt, finished_at = now() where id = p_id;
  elsif p_status = 'failed' then
    update public.task_verifications set status = 'failed', failure = left(coalesce(nullif(btrim(p_failure), ''), 'It stopped without a reason.'), 300), finished_at = now() where id = p_id;
  else
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v.org_id, p_actor, 'verification.finished', v.task_id::text, jsonb_build_object('verification', p_id, 'status', p_status, 'result', v_result, 'receipt', p_receipt));
end;
$$;
revoke all on function public.app_finish_task_verification(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.app_finish_task_verification(uuid, uuid, text, text, text) to service_role;

-- v31 paused autonomy only when every check failed. A partly failed run is a failed check too.
create or replace function private.suspend_autonomy_on_failure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by_policy boolean;
begin
  if new.status not in ('failed', 'partially_verified') or new.proposal_id is null then
    return new;
  end if;
  select (p.statement -> 'predicate' -> 'approval' ->> 'by') = 'policy' into v_by_policy
  from public.proofpacks p where p.proposal_id = new.proposal_id order by p.seq asc limit 1;
  if coalesce(v_by_policy, false) then
    update public.org_autonomy
       set suspended_at = now(),
           suspended_reason = 'A change applied on its own failed its checks on ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD') || '. Review it, then turn autonomy on again.'
     where org_id = new.org_id and level = 2 and suspended_at is null;
    if found then
      insert into public.audit_events (org_id, actor_id, action, target, metadata)
      values (new.org_id, null, 'autonomy.suspended', new.proposal_id::text, jsonb_build_object('proofpack', new.digest, 'status', new.status));
    end if;
  end if;
  return new;
end;
$$;
