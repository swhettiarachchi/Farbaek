-- Farbaek schema v6: change proposals.
--
-- Under an approved intent contract, the agent proposes targeted changes to
-- a project's files. The server validates them (src/core/realityloop/
-- change-proposal.ts), checks them against the contract and stores them
-- here with the task transitions in one transaction. A person reviews each
-- file's diff, then approves the exact content they accepted; applying
-- writes new file revisions linked to the proposal. Nothing is applied
-- without that approval (autonomy level 0).

-- A second AI operation that spends credits (src/config/credits.ts).
alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check check (operation in ('contract_draft', 'change_proposal'));

-- Transitions decided by the agent or by Farbaek itself are recorded as such.
-- Steps may carry "actor_kind" ('user', 'agent' or 'system') and "actor_id";
-- user steps are always recorded as the signed-in actor.
create or replace function private.apply_transitions(p_task uuid, p_actor uuid, p_expected_version integer, p_steps jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_version integer;
  v_state text;
  v_step jsonb;
  v_kind text;
begin
  select org_id, version, state into v_org, v_version, v_state from public.tasks where id = p_task for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_org, p_actor);
  if v_version <> p_expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;

  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) loop
    if v_step ->> 'from' is distinct from v_state then
      raise exception 'VERSION_CONFLICT' using errcode = '40001';
    end if;
    v_kind := coalesce(v_step ->> 'actor_kind', 'user');
    insert into public.task_transitions (task_id, org_id, event_id, event_type, from_state, to_state, actor_kind, actor_id)
    values (p_task, v_org, v_step ->> 'event_id', v_step ->> 'event_type', v_state, v_step ->> 'to', v_kind,
            case when v_kind = 'user' then p_actor::text else coalesce(nullif(v_step ->> 'actor_id', ''), 'farbaek') end);
    v_state := v_step ->> 'to';
    v_version := v_version + 1;
  end loop;

  update public.tasks set state = v_state, version = v_version, updated_at = now() where id = p_task;
  return v_version;
end;
$$;

create table public.change_proposals (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null,
  org_id            uuid not null,
  project_id        uuid not null,
  contract_version  integer not null check (contract_version > 0),
  status            text not null check (status in ('pending', 'blocked', 'applied', 'discarded')),
  plan              jsonb not null check (jsonb_typeof(plan) = 'object'),
  changes           jsonb not null check (jsonb_typeof(changes) = 'array'),
  dropped           jsonb not null default '[]'::jsonb check (jsonb_typeof(dropped) = 'array'),
  violations        jsonb not null default '[]'::jsonb check (jsonb_typeof(violations) = 'array'),
  sha256            text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  model             text check (model is null or char_length(model) between 1 and 100),
  input_tokens      integer check (input_tokens is null or input_tokens >= 0),
  output_tokens     integer check (output_tokens is null or output_tokens >= 0),
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  decided_by        uuid references auth.users (id) on delete set null,
  decided_at        timestamptz,
  applied_sha256    text check (applied_sha256 is null or applied_sha256 ~ '^[0-9a-f]{64}$'),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  constraint change_proposals_decided check ((status in ('applied', 'discarded')) = (decided_at is not null)),
  constraint change_proposals_applied_hash check ((status = 'applied') = (applied_sha256 is not null)),
  constraint change_proposals_size check (octet_length(changes::text) <= 4194304)
);
create index change_proposals_task_idx on public.change_proposals (task_id, created_at desc);
create unique index change_proposals_one_pending_idx on public.change_proposals (task_id) where status = 'pending';

alter table public.change_proposals enable row level security;
revoke all on public.change_proposals from anon, authenticated;
grant select on public.change_proposals to authenticated;
create policy "members read change proposals" on public.change_proposals
  for select to authenticated using ((select private.is_member(org_id)));

-- Revisions written by applying a proposal point back to it.
alter table public.project_file_revisions add column proposal_id uuid references public.change_proposals (id) on delete set null;

-- ------------------------------------------------- server-only functions

-- p_changes: [{ "path", "kind": "create"|"edit", "base_revision", "content", "sha256", "reason" }].
-- Base revisions must still be current, and each sha256 must match its content.
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
  p_steps jsonb
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
  end loop;

  v_status := case when jsonb_array_length(coalesce(p_violations, '[]'::jsonb)) > 0 then 'blocked' else 'pending' end;
  insert into public.change_proposals (task_id, org_id, project_id, contract_version, status, plan, changes, dropped, violations, sha256, model, input_tokens, output_tokens, created_by)
  values (p_task, v_org, v_project, p_contract_version, v_status, p_plan, p_changes, coalesce(p_dropped, '[]'::jsonb), coalesce(p_violations, '[]'::jsonb),
          p_sha256, p_model, p_input_tokens, p_output_tokens, p_actor)
  returning id into v_id;

  perform private.apply_transitions(p_task, p_actor, p_expected_task_version, p_steps);
  select state into v_state from public.tasks where id = p_task;
  if v_state is distinct from (case when v_status = 'blocked' then 'BLOCKED' else 'APPROVAL_PENDING' end) then
    raise exception 'INVALID_TRANSITION' using errcode = '22023';
  end if;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'proposal.created', v_id::text,
          jsonb_build_object('task_id', p_task, 'status', v_status, 'files', jsonb_array_length(p_changes), 'sha256', p_sha256, 'model', p_model));
  return v_id;
end;
$$;

-- p_files: [{ "path", "content" }], the content the person accepted for each
-- file they kept. Every path must be in the proposal and still at its base
-- revision. Returns the number of files written.
create function public.app_apply_proposal(
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

-- Drops a pending or blocked proposal and returns the task to the approved contract.
create function public.app_discard_proposal(p_proposal uuid, p_actor uuid, p_expected_task_version integer, p_steps jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.change_proposals%rowtype;
  v_state text;
begin
  select * into v_p from public.change_proposals where id = p_proposal for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_p.org_id, p_actor);
  if v_p.status not in ('pending', 'blocked') then
    raise exception 'PROPOSAL_CLOSED' using errcode = '40001';
  end if;

  update public.change_proposals set status = 'discarded', decided_by = p_actor, decided_at = now() where id = p_proposal;
  perform private.apply_transitions(v_p.task_id, p_actor, p_expected_task_version, p_steps);
  select state into v_state from public.tasks where id = v_p.task_id;
  if v_state is distinct from 'CONTRACT_APPROVED' then
    raise exception 'INVALID_TRANSITION' using errcode = '22023';
  end if;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_p.org_id, p_actor, 'proposal.discarded', p_proposal::text, jsonb_build_object('task_id', v_p.task_id));
end;
$$;

revoke all on function public.app_create_proposal(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text, text, integer, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.app_apply_proposal(uuid, uuid, jsonb, text, integer, jsonb, integer, bigint, integer) from public, anon, authenticated;
revoke all on function public.app_discard_proposal(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.app_create_proposal(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text, text, integer, integer, integer, jsonb) to service_role;
grant execute on function public.app_apply_proposal(uuid, uuid, jsonb, text, integer, jsonb, integer, bigint, integer) to service_role;
grant execute on function public.app_discard_proposal(uuid, uuid, integer, jsonb) to service_role;
