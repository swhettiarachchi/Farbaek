-- Farbaek schema v26: a run's own usage cap (the Cost-Before-Compute
-- Envelope, ADR 0040).
--
-- A person may cap one agent run at a share of this period's AI usage. The
-- cap is worked out on the server in units and stored with the run; the
-- model gateway enforces it before each step. Runs without a cap keep the
-- plan's own limit, as before.

alter table public.agent_runs add column cap_units integer check (cap_units is null or cap_units > 0);

-- Replaced with one more, optional, parameter. Dropped first so there is a
-- single function and calls with the earlier seven arguments still resolve.
drop function public.app_start_agent_run(uuid, uuid, uuid, text, text, integer, text);

create function public.app_start_agent_run(
  p_org uuid,
  p_actor uuid,
  p_task uuid,
  p_effort text,
  p_mode text,
  p_contract_version integer,
  p_contract_sha256 text,
  p_cap_units integer default null
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
  if p_cap_units is not null and p_cap_units <= 0 then
    raise exception 'INVALID_CAP' using errcode = '22023';
  end if;

  insert into public.agent_runs (org_id, task_id, project_id, started_by, effort, mode, contract_version, contract_sha256, cap_units)
  values (p_org, p_task, v_task.project_id, p_actor, p_effort, p_mode, p_contract_version, p_contract_sha256, p_cap_units)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'agent.run_started', v_id::text, jsonb_build_object('task_id', p_task, 'effort', p_effort, 'mode', p_mode, 'cap_units', p_cap_units));
  return v_id;
end;
$$;

revoke all on function public.app_start_agent_run(uuid, uuid, uuid, text, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.app_start_agent_run(uuid, uuid, uuid, text, text, integer, text, integer) to service_role;
