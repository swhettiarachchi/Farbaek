-- Farbaek schema v58: governed workflows, autonomy level 4 (ADR 0092).
--
-- A workflow is an ordered list of steps, each a normal task with its own
-- contract a person approved. An owner or admin approves the whole workflow
-- once, bound by hash; Farbaek then runs the steps in order with the cloud
-- agent. It stops for a person at checkpoints, when a change waits for
-- review, on any failure, and while agents are paused; each step's run is
-- capped at its share of the spend ceiling. Every existing control (policy,
-- rules, autonomy limits, permissions) still applies to each step.

create table public.workflows (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  project_id           uuid not null,
  title                text not null check (char_length(title) between 3 and 120),
  status               text not null default 'draft' check (status in ('draft', 'approved', 'running', 'waiting', 'halted', 'finished', 'cancelled')),
  waiting_reason       text check (waiting_reason in ('checkpoint', 'review')),
  halted_reason        text check (halted_reason is null or char_length(halted_reason) between 1 and 300),
  spend_ceiling_units  integer not null check (spend_ceiling_units between 1000 and 5000000),
  released_through     smallint not null default 0,
  approved_by          uuid references auth.users (id) on delete set null,
  approved_at          timestamptz,
  approved_sha256      text check (approved_sha256 is null or approved_sha256 ~ '^[0-9a-f]{64}$'),
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  check ((status = 'waiting') = (waiting_reason is not null)),
  check ((status = 'halted') = (halted_reason is not null)),
  check ((approved_at is null) = (approved_sha256 is null)),
  -- Only a draft, or a draft cancelled before approval, has no approval.
  check (status in ('draft', 'cancelled') or approved_at is not null),
  check (status <> 'draft' or approved_at is null)
);
create index workflows_org_idx on public.workflows (org_id, created_at desc);

create table public.workflow_steps (
  workflow_id  uuid not null references public.workflows (id) on delete cascade,
  org_id       uuid not null,
  position     smallint not null check (position between 1 and 8),
  title        text not null check (char_length(title) between 3 and 200),
  notes        text not null default '' check (char_length(notes) <= 2000),
  checkpoint   boolean not null default false,
  task_id      uuid not null unique,
  run_id       uuid references public.agent_runs (id) on delete set null,
  status       text not null default 'pending' check (status in ('pending', 'running', 'waiting', 'verified', 'failed', 'cancelled')),
  detail       text check (detail is null or char_length(detail) between 1 and 300),
  started_at   timestamptz,
  finished_at  timestamptz,
  primary key (workflow_id, position),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade
);

alter table public.workflows enable row level security;
alter table public.workflow_steps enable row level security;
revoke all on public.workflows, public.workflow_steps from public, anon, authenticated;
grant select on public.workflows, public.workflow_steps to authenticated;
create policy "members read workflows" on public.workflows for select to authenticated using ((select private.is_member(org_id)));
create policy "members read workflow steps" on public.workflow_steps for select to authenticated using ((select private.is_member(org_id)));

-- Creates a workflow and a task for each step, in one go.
create function public.app_create_workflow(p_org uuid, p_actor uuid, p_project uuid, p_title text, p_steps jsonb, p_ceiling integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_task uuid;
  v_step jsonb;
  v_n integer;
  v_pos smallint := 0;
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.projects where id = p_project and org_id = p_org and archived_at is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  v_n := case when jsonb_typeof(p_steps) = 'array' then jsonb_array_length(p_steps) else 0 end;
  if v_n not between 2 and 8 or exists (
    select 1 from jsonb_array_elements(p_steps) e
     where jsonb_typeof(e.value -> 'title') is distinct from 'string'
        or char_length(btrim(e.value ->> 'title')) not between 3 and 200
        or char_length(coalesce(e.value ->> 'notes', '')) > 2000
  ) then
    raise exception 'INVALID_WORKFLOW' using errcode = '22023';
  end if;
  insert into public.workflows (org_id, project_id, title, spend_ceiling_units, created_by)
  values (p_org, p_project, btrim(p_title), p_ceiling, p_actor)
  returning id into v_id;
  for v_step in select e.value from jsonb_array_elements(p_steps) e loop
    v_pos := v_pos + 1;
    insert into public.tasks (org_id, project_id, title, created_by) values (p_org, p_project, btrim(v_step ->> 'title'), p_actor) returning id into v_task;
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (p_org, p_actor, 'task.created', v_task::text, jsonb_build_object('project_id', p_project, 'workflow_id', v_id));
    insert into public.workflow_steps (workflow_id, org_id, position, title, notes, checkpoint, task_id)
    values (v_id, p_org, v_pos, btrim(v_step ->> 'title'), coalesce(v_step ->> 'notes', ''), coalesce((v_step ->> 'checkpoint')::boolean, false), v_task);
  end loop;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'workflow.created', v_id::text, jsonb_build_object('project_id', p_project, 'steps', v_n, 'ceiling_units', p_ceiling));
  return v_id;
end;
$$;

-- An owner or admin approves the whole workflow once every step's contract is approved, bound by the hash the server computed.
create function public.app_approve_workflow(p_workflow uuid, p_actor uuid, p_sha256 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.workflows%rowtype;
begin
  select * into v_w from public.workflows where id = p_workflow for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.organization_members m where m.org_id = v_w.org_id and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_w.status <> 'draft' then
    raise exception 'WORKFLOW_CLOSED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.workflow_steps s
     where s.workflow_id = p_workflow
       and not exists (select 1 from public.intent_contracts c where c.task_id = s.task_id and c.status = 'approved')
  ) then
    raise exception 'CONTRACTS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_WORKFLOW' using errcode = '22023';
  end if;
  update public.workflows set status = 'approved', approved_by = p_actor, approved_at = now(), approved_sha256 = p_sha256, updated_at = now() where id = p_workflow;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_w.org_id, p_actor, 'workflow.approved', p_workflow::text, jsonb_build_object('sha256', p_sha256, 'ceiling_units', v_w.spend_ceiling_units));
end;
$$;

-- Claims the next step for the server to run, or says why not. Safe to call any number of times.
-- Returns the step and its run's cap: an equal share of the ceiling, so the runs together never pass it.
create function public.app_workflow_claim_next(p_workflow uuid)
returns table (result text, step smallint, task_id uuid, cap_units integer, approved_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.workflows%rowtype;
  v_next public.workflow_steps%rowtype;
  v_prev public.workflow_steps%rowtype;
  v_steps integer;
  v_cap integer;
  v_capped bigint;
begin
  select * into v_w from public.workflows where id = p_workflow for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_w.status not in ('approved', 'running') then
    return query select v_w.status, null::smallint, null::uuid, null::integer, null::uuid;
    return;
  end if;
  if exists (select 1 from public.organizations o where o.id = v_w.org_id and o.agents_paused_at is not null) then
    return query select 'paused'::text, null::smallint, null::uuid, null::integer, null::uuid;
    return;
  end if;
  if exists (select 1 from public.workflow_steps s where s.workflow_id = p_workflow and s.status in ('running', 'waiting')) then
    return query select 'busy'::text, null::smallint, null::uuid, null::integer, null::uuid;
    return;
  end if;
  select * into v_next from public.workflow_steps s where s.workflow_id = p_workflow and s.status = 'pending' order by s.position limit 1;
  if not found then
    update public.workflows set status = 'finished', updated_at = now() where id = p_workflow;
    insert into public.audit_events (org_id, actor_id, action, target, metadata) values (v_w.org_id, null, 'workflow.finished', p_workflow::text, '{}'::jsonb);
    return query select 'finished'::text, null::smallint, null::uuid, null::integer, null::uuid;
    return;
  end if;
  if v_next.position > 1 then
    select * into v_prev from public.workflow_steps s where s.workflow_id = p_workflow and s.position = v_next.position - 1;
    if v_prev.status <> 'verified' then
      return query select 'blocked'::text, null::smallint, null::uuid, null::integer, null::uuid;
      return;
    end if;
    if v_prev.checkpoint and v_w.released_through < v_prev.position then
      update public.workflows set status = 'waiting', waiting_reason = 'checkpoint', updated_at = now() where id = p_workflow;
      return query select 'checkpoint'::text, v_prev.position, null::uuid, null::integer, null::uuid;
      return;
    end if;
  end if;
  select count(*) into v_steps from public.workflow_steps s where s.workflow_id = p_workflow;
  v_cap := floor(v_w.spend_ceiling_units::numeric / v_steps)::integer;
  select coalesce(sum(r.cap_units), 0) into v_capped from public.workflow_steps s join public.agent_runs r on r.id = s.run_id where s.workflow_id = p_workflow;
  if v_capped + v_cap > v_w.spend_ceiling_units then
    update public.workflows set status = 'halted', halted_reason = 'The spend ceiling is reached.', updated_at = now() where id = p_workflow;
    return query select 'ceiling'::text, null::smallint, null::uuid, null::integer, null::uuid;
    return;
  end if;
  update public.workflow_steps set status = 'running', started_at = now(), detail = null where workflow_id = p_workflow and position = v_next.position;
  update public.workflows set status = 'running', waiting_reason = null, updated_at = now() where id = p_workflow;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_w.org_id, null, 'workflow.step_started', p_workflow::text, jsonb_build_object('step', v_next.position, 'task_id', v_next.task_id, 'cap_units', v_cap));
  return query select 'started'::text, v_next.position, v_next.task_id, v_cap, v_w.approved_by;
end;
$$;

-- Ties a step to the run working on it.
create function public.app_workflow_attach_run(p_workflow uuid, p_step smallint, p_run uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workflow_steps s set run_id = p_run
   where s.workflow_id = p_workflow and s.position = p_step and s.status = 'running'
     and exists (select 1 from public.agent_runs r where r.id = p_run and r.task_id = s.task_id);
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- The server records how a step went: verified (the workflow carries on), waiting (a change waits for a person) or failed (the workflow halts).
create function public.app_workflow_step_result(p_workflow uuid, p_step smallint, p_result text, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.workflows%rowtype;
  v_detail text := nullif(left(btrim(coalesce(p_detail, '')), 300), '');
begin
  select * into v_w from public.workflows where id = p_workflow for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_result not in ('verified', 'waiting', 'failed') then
    raise exception 'INVALID_WORKFLOW' using errcode = '22023';
  end if;
  update public.workflow_steps
     set status = p_result, detail = v_detail, finished_at = case when p_result = 'waiting' then null else now() end
   where workflow_id = p_workflow and position = p_step and status in ('running', 'waiting');
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_w.status in ('cancelled', 'finished', 'halted') then
    return;
  end if;
  if p_result = 'failed' then
    update public.workflows set status = 'halted', waiting_reason = null, halted_reason = coalesce(v_detail, 'Step ' || p_step || ' failed.'), updated_at = now() where id = p_workflow;
  elsif p_result = 'waiting' then
    update public.workflows set status = 'waiting', waiting_reason = 'review', updated_at = now() where id = p_workflow;
  else
    update public.workflows set status = 'running', waiting_reason = null, updated_at = now() where id = p_workflow;
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_w.org_id, null, 'workflow.step_' || p_result, p_workflow::text, jsonb_build_object('step', p_step, 'detail', v_detail));
end;
$$;

-- A person releases a checkpoint: the workflow carries on with the next step.
create function public.app_continue_workflow(p_workflow uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.workflows%rowtype;
  v_through smallint;
begin
  select * into v_w from public.workflows where id = p_workflow for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_w.org_id, p_actor);
  if v_w.status <> 'waiting' or v_w.waiting_reason <> 'checkpoint' then
    raise exception 'NOT_AT_CHECKPOINT' using errcode = 'P0001';
  end if;
  select coalesce(max(position), 0) into v_through from public.workflow_steps where workflow_id = p_workflow and status = 'verified';
  update public.workflows set status = 'running', waiting_reason = null, released_through = v_through, updated_at = now() where id = p_workflow;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_w.org_id, p_actor, 'workflow.continued', p_workflow::text, jsonb_build_object('through', v_through));
end;
$$;

-- Stops a workflow for good: steps not yet done are cancelled. A run already working finishes its own step.
create function public.app_cancel_workflow(p_workflow uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.workflows%rowtype;
begin
  select * into v_w from public.workflows where id = p_workflow for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_w.org_id, p_actor);
  if v_w.status in ('finished', 'cancelled') then
    raise exception 'WORKFLOW_CLOSED' using errcode = 'P0001';
  end if;
  update public.workflow_steps set status = 'cancelled', finished_at = now() where workflow_id = p_workflow and status = 'pending';
  update public.workflows set status = 'cancelled', waiting_reason = null, halted_reason = null, updated_at = now() where id = p_workflow;
  insert into public.audit_events (org_id, actor_id, action, target, metadata) values (v_w.org_id, p_actor, 'workflow.cancelled', p_workflow::text, '{}'::jsonb);
end;
$$;

revoke all on function public.app_create_workflow(uuid, uuid, uuid, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.app_approve_workflow(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_workflow_claim_next(uuid) from public, anon, authenticated;
revoke all on function public.app_workflow_attach_run(uuid, smallint, uuid) from public, anon, authenticated;
revoke all on function public.app_workflow_step_result(uuid, smallint, text, text) from public, anon, authenticated;
revoke all on function public.app_continue_workflow(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_cancel_workflow(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_create_workflow(uuid, uuid, uuid, text, jsonb, integer) to service_role;
grant execute on function public.app_approve_workflow(uuid, uuid, text) to service_role;
grant execute on function public.app_workflow_claim_next(uuid) to service_role;
grant execute on function public.app_workflow_attach_run(uuid, smallint, uuid) to service_role;
grant execute on function public.app_workflow_step_result(uuid, smallint, text, text) to service_role;
grant execute on function public.app_continue_workflow(uuid, uuid) to service_role;
grant execute on function public.app_cancel_workflow(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
