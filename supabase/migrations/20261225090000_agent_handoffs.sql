-- Farbaek schema v84: Continue on my computer (ADR 0139, spec §25 "Continue-on-Desktop Handoff").
--
-- From a phone or browser, a contributor hands a task to one of the
-- workspace's desktop agents: its contract, the change waiting for review,
-- the checks to run and a note. The desktop shows it to the person there,
-- who runs the checks on a copy of the project with the change written in,
-- and reports what happened: each command's exit code, time and output hash,
-- with a digest of the whole report. A report from a computer is labelled as
-- such; it never verifies anything. One open handoff per task and agent; it
-- lapses after a day. Written by the server only; members read.

create table public.agent_handoffs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  task_id          uuid not null,
  agent_id         uuid not null,
  proposal_id      uuid references public.change_proposals (id) on delete set null,
  proposal_sha256  text check (proposal_sha256 is null or proposal_sha256 ~ '^[0-9a-f]{64}$'),
  requested_by     uuid references auth.users (id) on delete set null,
  note             text check (note is null or char_length(note) between 1 and 500),
  checks           jsonb not null check (jsonb_typeof(checks) = 'array' and jsonb_array_length(checks) between 1 and 20),
  status           text not null default 'waiting' check (status in ('waiting', 'opened', 'done', 'failed', 'cancelled', 'expired')),
  result           jsonb,
  result_digest    text check (result_digest is null or result_digest ~ '^[0-9a-f]{64}$'),
  reason           text check (reason is null or char_length(reason) between 1 and 500),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '1 day',
  opened_at        timestamptz,
  finished_at      timestamptz,
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  foreign key (agent_id, org_id) references public.agents (id, org_id) on delete cascade,
  constraint agent_handoffs_finished check ((status in ('waiting', 'opened')) = (finished_at is null)),
  constraint agent_handoffs_done check (status <> 'done' or (jsonb_typeof(result) = 'object' and result_digest is not null))
);
create unique index agent_handoffs_one_open on public.agent_handoffs (task_id, agent_id) where status in ('waiting', 'opened');
create index agent_handoffs_task_idx on public.agent_handoffs (task_id, created_at desc);
create index agent_handoffs_agent_idx on public.agent_handoffs (agent_id, created_at desc);

alter table public.agent_handoffs enable row level security;
revoke all on public.agent_handoffs from public, anon, authenticated, service_role;
grant select on public.agent_handoffs to authenticated, service_role;
create policy "members read their workspace's handoffs" on public.agent_handoffs
  for select to authenticated using ((select private.is_member(org_id)));

-- Open handoffs past their day are closed, so a new one can be asked for.
create function private.expire_agent_handoffs(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.agent_handoffs
     set status = 'expired', reason = 'Nobody ran it within a day, so it lapsed.', finished_at = now()
   where org_id = p_org and status in ('waiting', 'opened') and expires_at < now();
$$;
revoke all on function private.expire_agent_handoffs(uuid) from public;

-- The checks as the server writes them: 1 to 20 commands, each plain text.
create function private.valid_handoff_checks(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) between 1 and 20
     and not exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 300);
$$;
revoke all on function private.valid_handoff_checks(jsonb) from public;

-- A contributor hands a task to one of the workspace's agents that hasn't been revoked.
create function public.app_request_handoff(p_org uuid, p_actor uuid, p_task uuid, p_agent uuid, p_proposal uuid, p_checks jsonb, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sha text := null;
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.tasks where id = p_task and org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.agents where id = p_agent and org_id = p_org and revoked_at is null) then
    raise exception 'AGENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.valid_handoff_checks(p_checks) or (p_note is not null and char_length(p_note) not between 1 and 500) then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if p_proposal is not null then
    select sha256 into v_sha from public.change_proposals where id = p_proposal and task_id = p_task and org_id = p_org and status = 'pending';
    if v_sha is null then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;
  end if;
  perform private.expire_agent_handoffs(p_org);
  if exists (select 1 from public.agent_handoffs where task_id = p_task and agent_id = p_agent and status in ('waiting', 'opened')) then
    raise exception 'HANDOFF_OPEN' using errcode = 'P0001';
  end if;
  insert into public.agent_handoffs (org_id, task_id, agent_id, proposal_id, proposal_sha256, requested_by, note, checks)
  values (p_org, p_task, p_agent, p_proposal, v_sha, p_actor, nullif(p_note, ''), p_checks)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'handoff.requested', p_task::text, jsonb_build_object('handoff', v_id, 'agent', p_agent));
  return v_id;
end;
$$;
revoke all on function public.app_request_handoff(uuid, uuid, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.app_request_handoff(uuid, uuid, uuid, uuid, uuid, jsonb, text) to service_role;

-- A contributor withdraws an open handoff.
create function public.app_cancel_handoff(p_handoff uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.agent_handoffs%rowtype;
begin
  select * into v from public.agent_handoffs where id = p_handoff for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v.org_id, p_actor);
  if v.status not in ('waiting', 'opened') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.agent_handoffs set status = 'cancelled', reason = 'Withdrawn before it ran.', finished_at = now() where id = p_handoff;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v.org_id, p_actor, 'handoff.cancelled', v.task_id::text, jsonb_build_object('handoff', p_handoff));
end;
$$;
revoke all on function public.app_cancel_handoff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_cancel_handoff(uuid, uuid) to service_role;

-- The agent says it has the handoff open. Only the agent it was handed to, while it hasn't lapsed.
create function public.app_agent_open_handoff(p_org uuid, p_agent uuid, p_handoff uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.agent_handoffs%rowtype;
begin
  perform private.expire_agent_handoffs(p_org);
  select * into v from public.agent_handoffs where id = p_handoff and org_id = p_org and agent_id = p_agent for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v.status not in ('waiting', 'opened') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.agent_handoffs set status = 'opened', opened_at = coalesce(opened_at, now()) where id = p_handoff;
end;
$$;
revoke all on function public.app_agent_open_handoff(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_agent_open_handoff(uuid, uuid, uuid) to service_role;

-- The agent reports once: each check that ran, with the report's digest, or why it couldn't run.
create function public.app_agent_finish_handoff(p_org uuid, p_agent uuid, p_handoff uuid, p_status text, p_result jsonb, p_digest text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.agent_handoffs%rowtype;
begin
  select * into v from public.agent_handoffs where id = p_handoff and org_id = p_org and agent_id = p_agent for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v.status not in ('waiting', 'opened') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status = 'done' then
    -- The whole report is kept, so its digest can be checked again later.
    if jsonb_typeof(p_result) <> 'object' or jsonb_typeof(p_result -> 'checks') <> 'array' or jsonb_array_length(p_result -> 'checks') not between 1 and 20 or p_digest is null or exists (
      select 1 from jsonb_array_elements(p_result -> 'checks') e
       where jsonb_typeof(e) <> 'object'
          or coalesce(jsonb_typeof(e -> 'command'), 'missing') <> 'string'
          or coalesce(jsonb_typeof(e -> 'exitCode'), 'missing') not in ('number', 'null')
          or coalesce(char_length(e ->> 'output'), 0) > 2000
    ) then
      raise exception 'INVALID_REQUEST' using errcode = '22023';
    end if;
    update public.agent_handoffs set status = 'done', result = p_result, result_digest = p_digest, reason = left(nullif(p_reason, ''), 500), finished_at = now() where id = p_handoff;
  elsif p_status = 'failed' then
    if p_reason is null or p_reason = '' then
      raise exception 'INVALID_REQUEST' using errcode = '22023';
    end if;
    update public.agent_handoffs set status = 'failed', reason = left(p_reason, 500), finished_at = now() where id = p_handoff;
  else
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, null, 'handoff.finished', v.task_id::text, jsonb_build_object('handoff', p_handoff, 'agent', p_agent, 'status', p_status));
end;
$$;
revoke all on function public.app_agent_finish_handoff(uuid, uuid, uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.app_agent_finish_handoff(uuid, uuid, uuid, text, jsonb, text, text) to service_role;

notify pgrst, 'reload schema';
