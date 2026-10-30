-- Farbaek schema v79: agent teams (ADR 0128). A workflow's steps can run
-- together: steps in one stage each get their own agent run at the same
-- time, and the next stage starts when every step of this one is verified.
-- Up to 3 steps share a stage. Existing workflows get one step per stage,
-- so they run exactly as before. The server refuses to approve a stage
-- whose steps' contracts could touch the same files (use-cases.ts).

alter table public.workflow_steps add column stage smallint;
update public.workflow_steps set stage = position where stage is null;
alter table public.workflow_steps alter column stage set not null;
alter table public.workflow_steps add constraint workflow_steps_stage_check check (stage between 1 and 8 and stage <= position);
create index workflow_steps_stage_idx on public.workflow_steps (workflow_id, stage);

-- Creates a workflow: each step is a new task. A step with "together" set
-- runs at the same time as the step before, in its stage; at most 3 per stage.
create or replace function public.app_create_workflow(p_org uuid, p_actor uuid, p_project uuid, p_title text, p_steps jsonb, p_ceiling integer)
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
  v_stage smallint := 0;
  v_width smallint := 0;
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
        or (e.value ? 'together' and jsonb_typeof(e.value -> 'together') <> 'boolean')
  ) then
    raise exception 'INVALID_WORKFLOW' using errcode = '22023';
  end if;
  insert into public.workflows (org_id, project_id, title, spend_ceiling_units, created_by)
  values (p_org, p_project, btrim(p_title), p_ceiling, p_actor)
  returning id into v_id;
  for v_step in select e.value from jsonb_array_elements(p_steps) e loop
    v_pos := v_pos + 1;
    if v_pos > 1 and coalesce((v_step ->> 'together')::boolean, false) then
      v_width := v_width + 1;
      if v_width > 3 then
        raise exception 'TEAM_TOO_LARGE' using errcode = '22023';
      end if;
    else
      v_stage := v_stage + 1;
      v_width := 1;
    end if;
    insert into public.tasks (org_id, project_id, title, created_by) values (p_org, p_project, btrim(v_step ->> 'title'), p_actor) returning id into v_task;
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (p_org, p_actor, 'task.created', v_task::text, jsonb_build_object('project_id', p_project, 'workflow_id', v_id));
    insert into public.workflow_steps (workflow_id, org_id, position, stage, title, notes, checkpoint, task_id)
    values (v_id, p_org, v_pos, v_stage, btrim(v_step ->> 'title'), coalesce(v_step ->> 'notes', ''), coalesce((v_step ->> 'checkpoint')::boolean, false), v_task);
  end loop;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'workflow.created', v_id::text, jsonb_build_object('project_id', p_project, 'steps', v_n, 'stages', v_stage, 'ceiling_units', p_ceiling));
  return v_id;
end;
$$;

-- Claims the next step for the server to run, or says why not. Safe to call
-- any number of times. Steps of the current stage are claimed one per call,
-- so a team starts by calling until the answer isn't "started".
create or replace function public.app_workflow_claim_next(p_workflow uuid)
returns table (result text, step smallint, task_id uuid, cap_units integer, approved_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.workflows%rowtype;
  v_next public.workflow_steps%rowtype;
  v_stage smallint;
  v_prev_last smallint;
  v_prev_checkpoint boolean;
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
  -- The current stage: the lowest one with a step that isn't verified yet.
  select min(s.stage) into v_stage from public.workflow_steps s where s.workflow_id = p_workflow and s.status <> 'verified';
  if v_stage is null then
    update public.workflows set status = 'finished', updated_at = now() where id = p_workflow;
    insert into public.audit_events (org_id, actor_id, action, target, metadata) values (v_w.org_id, null, 'workflow.finished', p_workflow::text, '{}'::jsonb);
    return query select 'finished'::text, null::smallint, null::uuid, null::integer, null::uuid;
    return;
  end if;
  if exists (select 1 from public.workflow_steps s where s.workflow_id = p_workflow and s.stage = v_stage and s.status in ('failed', 'cancelled')) then
    return query select 'blocked'::text, null::smallint, null::uuid, null::integer, null::uuid;
    return;
  end if;
  -- A checkpoint in the stage before holds this whole stage until a person continues.
  select max(s.position), bool_or(s.checkpoint) into v_prev_last, v_prev_checkpoint
    from public.workflow_steps s where s.workflow_id = p_workflow and s.stage = v_stage - 1;
  if coalesce(v_prev_checkpoint, false) and v_w.released_through < v_prev_last then
    update public.workflows set status = 'waiting', waiting_reason = 'checkpoint', updated_at = now() where id = p_workflow;
    return query select 'checkpoint'::text, v_prev_last, null::uuid, null::integer, null::uuid;
    return;
  end if;
  select * into v_next from public.workflow_steps s where s.workflow_id = p_workflow and s.stage = v_stage and s.status = 'pending' order by s.position limit 1;
  if not found then
    return query select 'busy'::text, null::smallint, null::uuid, null::integer, null::uuid;
    return;
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
  values (v_w.org_id, null, 'workflow.step_started', p_workflow::text, jsonb_build_object('step', v_next.position, 'stage', v_stage, 'task_id', v_next.task_id, 'cap_units', v_cap));
  return query select 'started'::text, v_next.position, v_next.task_id, v_cap, v_w.approved_by;
end;
$$;

-- The server records how a step went. A failure stops the workflow (teammates
-- already working finish their own step); a change waiting for review makes
-- it wait; a verified step carries it on only when no teammate still waits.
create or replace function public.app_workflow_step_result(p_workflow uuid, p_step smallint, p_result text, p_detail text)
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
  elsif p_result = 'waiting' or exists (select 1 from public.workflow_steps s where s.workflow_id = p_workflow and s.status = 'waiting') then
    update public.workflows set status = 'waiting', waiting_reason = 'review', updated_at = now() where id = p_workflow;
  else
    update public.workflows set status = 'running', waiting_reason = null, updated_at = now() where id = p_workflow;
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_w.org_id, null, 'workflow.step_' || p_result, p_workflow::text, jsonb_build_object('step', p_step, 'detail', v_detail));
end;
$$;
