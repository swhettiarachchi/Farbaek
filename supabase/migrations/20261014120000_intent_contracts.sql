-- Farbaek schema v3: versioned intent contracts.
--
-- A contract version is immutable once written. The server validates the
-- body against the IntentContract schema (src/core/realityloop/contract.ts),
-- hashes it with RFC 8785 canonical JSON, and decides the task transitions
-- with the TypeScript state machine. These functions store the contract and
-- apply those transitions in one transaction, re-checking versions.

alter table public.tasks add constraint tasks_id_org_key unique (id, org_id);

create table public.intent_contracts (
  task_id      uuid not null,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  version      integer not null check (version > 0),
  body         jsonb not null,
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status       text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  approved_by  uuid references auth.users (id) on delete set null,
  approved_at  timestamptz,
  primary key (task_id, version),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  check (status <> 'approved' or approved_at is not null)
);
create index intent_contracts_org_idx on public.intent_contracts (org_id, task_id);

alter table public.intent_contracts enable row level security;
revoke all on public.intent_contracts from anon, authenticated;
grant select on public.intent_contracts to authenticated;
create policy "members read contracts" on public.intent_contracts
  for select to authenticated using ((select private.is_member(org_id)));

-- Applies a list of transitions already decided by the TypeScript state
-- machine: [{ "event_id", "event_type", "from", "to" }, ...]. Each step is
-- checked against the current state and version. Returns the new version.
create function private.apply_transitions(p_task uuid, p_actor uuid, p_expected_version integer, p_steps jsonb)
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
    insert into public.task_transitions (task_id, org_id, event_id, event_type, from_state, to_state, actor_kind, actor_id)
    values (p_task, v_org, v_step ->> 'event_id', v_step ->> 'event_type', v_state, v_step ->> 'to', 'user', p_actor::text);
    v_state := v_step ->> 'to';
    v_version := v_version + 1;
  end loop;

  update public.tasks set state = v_state, version = v_version, updated_at = now() where id = p_task;
  return v_version;
end;
$$;
revoke all on function private.apply_transitions(uuid, uuid, integer, jsonb) from public;

-- Saves a new contract version (a first draft or a revision) and applies the
-- transitions that put the task into CONTRACT_DRAFTED. p_based_on is the
-- latest contract version the author saw (0 for none), so two people can't
-- overwrite each other's drafts.
create function public.app_save_contract(
  p_task uuid,
  p_actor uuid,
  p_body jsonb,
  p_sha256 text,
  p_based_on integer,
  p_expected_task_version integer,
  p_steps jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_latest integer;
  v_next integer;
begin
  perform private.apply_transitions(p_task, p_actor, p_expected_task_version, p_steps);
  select org_id into v_org from public.tasks where id = p_task;

  select coalesce(max(version), 0) into v_latest from public.intent_contracts where task_id = p_task;
  if v_latest <> p_based_on then
    raise exception 'CONTRACT_CHANGED' using errcode = '40001';
  end if;
  v_next := v_latest + 1;
  if (p_body ->> 'version')::integer is distinct from v_next then
    raise exception 'INVALID_CONTRACT' using errcode = '22023';
  end if;

  -- A new version replaces the previous draft, or the approved version being revised.
  update public.intent_contracts set status = 'superseded' where task_id = p_task and status in ('draft', 'approved');
  insert into public.intent_contracts (task_id, org_id, version, body, sha256, created_by)
  values (p_task, v_org, v_next, p_body, p_sha256, p_actor);

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'contract.saved', p_task::text, jsonb_build_object('version', v_next, 'sha256', p_sha256));
  return v_next;
end;
$$;

-- Approves one exact contract version: the hash the reviewer saw must match
-- the stored hash, and it must still be the latest draft.
create function public.app_approve_contract(
  p_task uuid,
  p_actor uuid,
  p_version integer,
  p_sha256 text,
  p_expected_task_version integer,
  p_steps jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_row public.intent_contracts%rowtype;
begin
  select * into v_row from public.intent_contracts
   where task_id = p_task order by version desc limit 1 for update;
  if not found or v_row.version <> p_version or v_row.status <> 'draft' then
    raise exception 'CONTRACT_CHANGED' using errcode = '40001';
  end if;
  if v_row.sha256 <> p_sha256 then
    raise exception 'CONTRACT_CHANGED' using errcode = '40001';
  end if;

  perform private.apply_transitions(p_task, p_actor, p_expected_task_version, p_steps);
  select org_id into v_org from public.tasks where id = p_task;

  update public.intent_contracts set status = 'approved', approved_by = p_actor, approved_at = now()
   where task_id = p_task and version = p_version;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'contract.approved', p_task::text, jsonb_build_object('version', p_version, 'sha256', p_sha256));
end;
$$;

revoke all on function public.app_save_contract(uuid, uuid, jsonb, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.app_approve_contract(uuid, uuid, integer, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.app_save_contract(uuid, uuid, jsonb, text, integer, integer, jsonb) to service_role;
grant execute on function public.app_approve_contract(uuid, uuid, integer, text, integer, jsonb) to service_role;
