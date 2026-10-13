-- Farbaek schema v7: policy decisions and governed-evaluation metering.
--
-- Every change proposal now carries the policy decision that governed it
-- (src/core/trust/policy.ts): the outcome, the findings and the sha256 of the
-- exact rule set. Each decision is one governed evaluation, recorded in
-- evaluation_events in the same transaction and refused once the plan's
-- evaluation allowance for the period is used up. An escalated proposal can
-- only be applied by an owner or admin.

alter table public.change_proposals add column policy jsonb
  check (policy is null or (
    jsonb_typeof(policy) = 'object'
    and policy ->> 'outcome' in ('ALLOW', 'ALLOW_WITHIN_LIMITS', 'REQUIRE_APPROVAL', 'SIMULATE_FIRST', 'ESCALATE', 'BLOCK')
    and policy ->> 'version' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(policy -> 'findings') = 'array'
  ));

-- The signature gains the policy decision and the metering inputs.
drop function public.app_create_proposal(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text, text, integer, integer, integer, jsonb);

-- p_policy: { "outcome", "version", "findings": [...] }. p_evaluation_limit is
-- the plan's allowance for the period (null: set by contract); the period
-- must contain the database's current time.
create function public.app_create_proposal(
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
  v_org uuid;
  v_project uuid;
  v_change jsonb;
  v_current integer;
  v_status text;
  v_id uuid;
  v_state text;
begin
  select org_id, project_id into v_org, v_project from public.tasks where id = p_task for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_org, p_actor);

  if p_policy is null or p_policy ->> 'outcome' is null
     or (jsonb_array_length(coalesce(p_violations, '[]'::jsonb)) > 0 and p_policy ->> 'outcome' <> 'BLOCK') then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;
  if not exists (select 1 from public.intent_contracts where task_id = p_task and version = p_contract_version and status = 'approved') then
    raise exception 'CONTRACT_CHANGED' using errcode = '40001';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;
  if (select count(distinct e.value ->> 'path') from jsonb_array_elements(p_changes) e) <> jsonb_array_length(p_changes) then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;

  for v_change in select e.value from jsonb_array_elements(p_changes) e loop
    if not private.valid_project_path(v_change ->> 'path') then
      raise exception 'INVALID_PATH' using errcode = '22023';
    end if;
    if v_change ->> 'kind' is null or v_change ->> 'kind' not in ('create', 'edit')
       or jsonb_typeof(v_change -> 'content') is distinct from 'string'
       or jsonb_typeof(v_change -> 'base_revision') is distinct from 'number'
       or ((v_change ->> 'kind') = 'create') <> ((v_change ->> 'base_revision')::integer = 0)
       or encode(sha256(convert_to(v_change ->> 'content', 'UTF8')), 'hex') is distinct from v_change ->> 'sha256' then
      raise exception 'INVALID_PROPOSAL' using errcode = '22023';
    end if;
    select f.revision into v_current from public.project_files f where f.project_id = v_project and f.path = v_change ->> 'path';
    if coalesce(v_current, 0) <> (v_change ->> 'base_revision')::integer then
      raise exception 'FILE_CHANGED' using errcode = '40001';
    end if;
    v_current := null;
  end loop;

  -- Metering: one governed evaluation per proposal, counted under a lock on the organization.
  perform 1 from public.organizations where id = v_org for update;
  if p_period_start is null or p_period_end is null or not (now() >= p_period_start and now() < p_period_end) then
    raise exception 'PERIOD_MISMATCH' using errcode = '22023';
  end if;
  if p_evaluation_limit is not null and (
    select count(*) from public.evaluation_events
    where org_id = v_org and occurred_at >= p_period_start and occurred_at < p_period_end
  ) >= p_evaluation_limit then
    raise exception 'EVALUATION_LIMIT' using errcode = 'P0001';
  end if;

  v_status := case when p_policy ->> 'outcome' = 'BLOCK' then 'blocked' else 'pending' end;
  insert into public.change_proposals (task_id, org_id, project_id, contract_version, status, plan, changes, dropped, violations, sha256, model, input_tokens, output_tokens, created_by, policy)
  values (p_task, v_org, v_project, p_contract_version, v_status, p_plan, p_changes, coalesce(p_dropped, '[]'::jsonb), coalesce(p_violations, '[]'::jsonb),
          p_sha256, p_model, p_input_tokens, p_output_tokens, p_actor, p_policy)
  returning id into v_id;

  insert into public.evaluation_events (org_id, idempotency_key, outcome)
  values (v_org, 'change_proposal:' || v_id::text, p_policy ->> 'outcome');

  perform private.apply_transitions(p_task, p_actor, p_expected_task_version, p_steps);
  select state into v_state from public.tasks where id = p_task;
  if v_state is distinct from (case when v_status = 'blocked' then 'BLOCKED' else 'APPROVAL_PENDING' end) then
    raise exception 'INVALID_TRANSITION' using errcode = '22023';
  end if;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'proposal.created', v_id::text,
          jsonb_build_object('task_id', p_task, 'status', v_status, 'files', jsonb_array_length(p_changes), 'sha256', p_sha256, 'model', p_model,
                             'policy_outcome', p_policy ->> 'outcome', 'policy_version', p_policy ->> 'version'));
  return v_id;
end;
$$;

-- Same as v6, plus: an escalated proposal needs an owner or admin.
create or replace function public.app_apply_proposal(
  p_proposal uuid,
  p_actor uuid,
  p_files jsonb,
  p_applied_sha256 text,
  p_expected_task_version integer,
  p_steps jsonb,
  p_max_file_bytes integer,
  p_max_project_bytes bigint,
  p_max_files integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.change_proposals%rowtype;
  v_item jsonb;
  v_change jsonb;
  v_current integer;
  v_written integer := 0;
  v_state text;
begin
  select * into v_p from public.change_proposals where id = p_proposal for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.lock_project(v_p.project_id, p_actor);
  if v_p.status <> 'pending' then
    raise exception 'PROPOSAL_CLOSED' using errcode = '40001';
  end if;
  if v_p.policy ->> 'outcome' = 'ESCALATE' and not exists (
    select 1 from public.organization_members m where m.org_id = v_p.org_id and m.user_id = p_actor and m.role in ('owner', 'admin')
  ) then
    raise exception 'APPROVER_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) = 0 then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;
  if (select count(distinct e.value ->> 'path') from jsonb_array_elements(p_files) e) <> jsonb_array_length(p_files) then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;

  for v_item in select e.value from jsonb_array_elements(p_files) e loop
    select c.value into v_change from jsonb_array_elements(v_p.changes) c where c.value ->> 'path' = v_item ->> 'path';
    if v_change is null or jsonb_typeof(v_item -> 'content') is distinct from 'string' then
      raise exception 'INVALID_PROPOSAL' using errcode = '22023';
    end if;
    select f.revision into v_current from public.project_files f where f.project_id = v_p.project_id and f.path = v_item ->> 'path';
    if coalesce(v_current, 0) <> (v_change ->> 'base_revision')::integer then
      raise exception 'FILE_CHANGED' using errcode = '40001';
    end if;
    if private.put_project_file(v_p.project_id, v_p.org_id, p_actor, v_item ->> 'path', v_item ->> 'content', 'edit', p_max_file_bytes) <> 'unchanged' then
      update public.project_file_revisions r set proposal_id = p_proposal
      where r.project_id = v_p.project_id and r.path = v_item ->> 'path'
        and r.revision = (select f.revision from public.project_files f where f.project_id = v_p.project_id and f.path = v_item ->> 'path');
      v_written := v_written + 1;
    end if;
    v_change := null;
    v_current := null;
  end loop;

  if v_written = 0 then
    raise exception 'NOTHING_TO_APPLY' using errcode = '22023';
  end if;
  perform private.check_project_size(v_p.project_id, p_max_project_bytes, p_max_files);

  update public.change_proposals set status = 'applied', decided_by = p_actor, decided_at = now(), applied_sha256 = p_applied_sha256 where id = p_proposal;
  perform private.apply_transitions(v_p.task_id, p_actor, p_expected_task_version, p_steps);
  select state into v_state from public.tasks where id = v_p.task_id;
  if v_state is distinct from 'VERIFYING' then
    raise exception 'INVALID_TRANSITION' using errcode = '22023';
  end if;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_p.org_id, p_actor, 'proposal.applied', p_proposal::text,
          jsonb_build_object('task_id', v_p.task_id, 'files', v_written, 'applied_sha256', p_applied_sha256));
  return v_written;
end;
$$;

revoke all on function public.app_create_proposal(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text, text, integer, integer, integer, jsonb, jsonb, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.app_create_proposal(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text, text, integer, integer, integer, jsonb, jsonb, integer, timestamptz, timestamptz) to service_role;
