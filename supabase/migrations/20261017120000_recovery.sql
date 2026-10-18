-- Farbaek schema v11: recovery of applied changes.
--
-- Undoing an applied change proposal writes each file's earlier content back
-- as a new revision, or removes a file the change created, in one
-- transaction under the project lock. The rules (spec "Safe undo and
-- compensating recovery", src/core/realityloop/recovery.ts):
-- - A file is undone only while it still holds exactly what the proposal
--   wrote. Anything newer is refused with FILE_CHANGED, never overwritten.
-- - The result is verified before anything is recorded: each restored file
--   must hold the earlier revision's exact content, each removed file must
--   be gone.
-- - The task reaches RECOVERED only when every file the proposal wrote is
--   back at its earlier state; otherwise it stays RECOVERY_PENDING.
-- - A repeated request (same operation hash) returns the first result.
--
-- Each recovery is recorded once, as an in-toto statement built by
-- src/core/proof/recovery-receipt.ts. Records are append-only.

create table public.recovery_operations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  project_id        uuid not null,
  task_id           uuid not null,
  -- No "set null" on these: that would be an update, which the trigger
  -- refuses. They leave together with their task.
  proposal_id       uuid not null references public.change_proposals (id),
  proofpack_digest  text references public.proofpacks (digest),
  plan_sha256       text not null check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  operation_sha256  text not null unique check (operation_sha256 ~ '^[0-9a-f]{64}$'),
  status            text not null check (status in ('recovered', 'partially_recovered')),
  restored          integer not null check (restored >= 0),
  statement         jsonb not null check (jsonb_typeof(statement) = 'object' and statement ->> '_type' = 'https://in-toto.io/Statement/v1'),
  digest            text not null unique check (digest ~ '^[0-9a-f]{64}$'),
  created_by        uuid not null,
  created_at        timestamptz not null default now(),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);
create index recovery_operations_task_idx on public.recovery_operations (task_id, created_at desc);
create index recovery_operations_org_idx on public.recovery_operations (org_id, created_at desc);

alter table public.recovery_operations enable row level security;
revoke all on public.recovery_operations from anon, authenticated;
grant select on public.recovery_operations to authenticated;
create policy "members read recovery operations" on public.recovery_operations
  for select to authenticated using ((select private.is_member(org_id)));

create function private.refuse_recovery_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'RECOVERY_IMMUTABLE' using errcode = '42501';
end;
$$;
revoke all on function private.refuse_recovery_update() from public;
create trigger recovery_operations_immutable before update on public.recovery_operations
  for each row execute function private.refuse_recovery_update();

-- p_operations: [{ "path", "action": "restore" | "remove", "from_sha256", "to_sha256" (null for remove) }].
-- Empty only when every file is already back and the task just needs to finish.
-- p_policy: the server's policy decision for this recovery.
-- p_receipt / p_receipt_digest: the statement and its canonical SHA-256 (computed by the server).
-- p_status: 'recovered' or 'partially_recovered'; checked against the files after the writes.
create function public.app_recover_change(
  p_proposal uuid,
  p_actor uuid,
  p_operations jsonb,
  p_plan_sha256 text,
  p_operation_sha256 text,
  p_expected_task_version integer,
  p_steps jsonb,
  p_policy jsonb,
  p_receipt jsonb,
  p_receipt_digest text,
  p_status text,
  p_max_file_bytes integer,
  p_max_project_bytes bigint,
  p_max_files integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.change_proposals%rowtype;
  v_existing public.recovery_operations%rowtype;
  v_op jsonb;
  v_change jsonb;
  v_applied_sha text;
  v_current_sha text;
  v_target_sha text;
  v_target_content text;
  v_after_sha text;
  v_after_content text;
  v_revision integer;
  v_restored integer := 0;
  v_complete boolean;
  v_state text;
  v_proofpack text;
  v_id uuid;
begin
  select * into v_p from public.change_proposals where id = p_proposal for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.lock_project(v_p.project_id, p_actor);

  -- A repeated request returns the first result instead of acting twice.
  select * into v_existing from public.recovery_operations where operation_sha256 = p_operation_sha256;
  if found then
    if v_existing.proposal_id <> p_proposal then
      raise exception 'INVALID_RECOVERY' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_existing.id, 'restored', v_existing.restored, 'status', v_existing.status, 'digest', v_existing.digest, 'replayed', true);
  end if;

  if v_p.status <> 'applied' then
    raise exception 'NOT_RECOVERABLE' using errcode = '22023';
  end if;
  if jsonb_typeof(p_policy) is distinct from 'object'
     or p_policy ->> 'outcome' is null
     or p_policy ->> 'outcome' not in ('ALLOW', 'ALLOW_WITHIN_LIMITS', 'REQUIRE_APPROVAL', 'SIMULATE_FIRST', 'ESCALATE', 'BLOCK') then
    raise exception 'INVALID_RECOVERY' using errcode = '22023';
  end if;
  if p_policy ->> 'outcome' = 'BLOCK' then
    raise exception 'POLICY_BLOCKED' using errcode = '42501';
  end if;
  -- An escalated change, or an escalated undo, needs an owner or admin.
  if (p_policy ->> 'outcome' = 'ESCALATE' or v_p.policy ->> 'outcome' = 'ESCALATE') and not exists (
    select 1 from public.organization_members m where m.org_id = v_p.org_id and m.user_id = p_actor and m.role in ('owner', 'admin')
  ) then
    raise exception 'APPROVER_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('recovered', 'partially_recovered') then
    raise exception 'INVALID_RECOVERY' using errcode = '22023';
  end if;
  if jsonb_typeof(p_operations) is distinct from 'array'
     or (select count(distinct e.value ->> 'path') from jsonb_array_elements(p_operations) e) <> jsonb_array_length(p_operations) then
    raise exception 'INVALID_RECOVERY' using errcode = '22023';
  end if;

  -- The record must describe exactly this recovery.
  select digest into v_proofpack from public.proofpacks where proposal_id = p_proposal order by seq desc limit 1;
  if p_receipt is null or p_receipt_digest is null
     or p_receipt ->> 'predicateType' is distinct from 'https://farbaek.dev/recovery/v1'
     or p_receipt -> 'predicate' -> 'proposal' ->> 'id' is distinct from p_proposal::text
     or p_receipt -> 'predicate' -> 'plan' ->> 'sha256' is distinct from p_plan_sha256
     or p_receipt -> 'predicate' ->> 'operationSha256' is distinct from p_operation_sha256
     or p_receipt -> 'predicate' ->> 'status' is distinct from p_status
     or p_receipt -> 'predicate' ->> 'proofPack' is distinct from v_proofpack
     or jsonb_typeof(p_receipt -> 'predicate' -> 'operations') is distinct from 'array'
     or jsonb_array_length(p_receipt -> 'predicate' -> 'operations') <> jsonb_array_length(p_operations)
     or exists (
       select 1 from jsonb_array_elements(p_operations) o
       where not exists (
         select 1 from jsonb_array_elements(p_receipt -> 'predicate' -> 'operations') s
         where s.value ->> 'path' = o.value ->> 'path'
           and s.value ->> 'action' = o.value ->> 'action'
           and s.value ->> 'fromSha256' = o.value ->> 'from_sha256'
           and (s.value ->> 'toSha256') is not distinct from (o.value ->> 'to_sha256')
       )
     ) then
    raise exception 'INVALID_RECOVERY' using errcode = '22023';
  end if;

  for v_op in select e.value from jsonb_array_elements(p_operations) e loop
    select c.value into v_change from jsonb_array_elements(v_p.changes) c where c.value ->> 'path' = v_op ->> 'path';
    if v_change is null then
      raise exception 'INVALID_RECOVERY' using errcode = '22023';
    end if;
    -- What this proposal wrote at the path. Restored revisions are never tagged, so this stays the applied one.
    select r.sha256 into v_applied_sha from public.project_file_revisions r
    where r.project_id = v_p.project_id and r.path = v_op ->> 'path' and r.proposal_id = p_proposal
    order by r.revision desc limit 1;
    if v_applied_sha is null or v_op ->> 'from_sha256' is distinct from v_applied_sha then
      raise exception 'INVALID_RECOVERY' using errcode = '22023';
    end if;
    -- Never overwrite a newer change: the file must still hold exactly what was applied.
    select f.sha256 into v_current_sha from public.project_files f where f.project_id = v_p.project_id and f.path = v_op ->> 'path';
    if v_current_sha is distinct from v_applied_sha then
      raise exception 'FILE_CHANGED' using errcode = '40001';
    end if;

    if v_change ->> 'kind' = 'create' then
      if v_op ->> 'action' is distinct from 'remove' or v_op ->> 'to_sha256' is not null then
        raise exception 'INVALID_RECOVERY' using errcode = '22023';
      end if;
      select max(r.revision) + 1 into v_revision from public.project_file_revisions r where r.project_id = v_p.project_id and r.path = v_op ->> 'path';
      delete from public.project_files where project_id = v_p.project_id and path = v_op ->> 'path';
      insert into public.project_file_revisions (project_id, org_id, path, revision, change, created_by)
      values (v_p.project_id, v_p.org_id, v_op ->> 'path', v_revision, 'delete', p_actor);
      if exists (select 1 from public.project_files f where f.project_id = v_p.project_id and f.path = v_op ->> 'path') then
        raise exception 'RECOVERY_UNVERIFIED' using errcode = 'P0001';
      end if;
    else
      if v_op ->> 'action' is distinct from 'restore' then
        raise exception 'INVALID_RECOVERY' using errcode = '22023';
      end if;
      select r.sha256, r.content into v_target_sha, v_target_content from public.project_file_revisions r
      where r.project_id = v_p.project_id and r.path = v_op ->> 'path' and r.revision = (v_change ->> 'base_revision')::integer;
      if v_target_content is null or v_op ->> 'to_sha256' is distinct from v_target_sha then
        raise exception 'INVALID_RECOVERY' using errcode = '22023';
      end if;
      perform private.put_project_file(v_p.project_id, v_p.org_id, p_actor, v_op ->> 'path', v_target_content, 'edit', p_max_file_bytes);
      -- Verify: the current revision holds the earlier content, byte for byte.
      select f.sha256, r.content into v_after_sha, v_after_content
      from public.project_files f
      join public.project_file_revisions r on r.project_id = f.project_id and r.path = f.path and r.revision = f.revision
      where f.project_id = v_p.project_id and f.path = v_op ->> 'path';
      if v_after_sha is distinct from v_target_sha or v_after_content is distinct from v_target_content then
        raise exception 'RECOVERY_UNVERIFIED' using errcode = 'P0001';
      end if;
    end if;

    v_restored := v_restored + 1;
    v_change := null;
    v_applied_sha := null;
    v_current_sha := null;
    v_target_sha := null;
    v_target_content := null;
    v_after_sha := null;
    v_after_content := null;
  end loop;

  perform private.check_project_size(v_p.project_id, p_max_project_bytes, p_max_files);

  -- Complete when every file this proposal wrote is back at its earlier state.
  v_complete := not exists (
    select 1 from jsonb_array_elements(v_p.changes) c
    where exists (
        select 1 from public.project_file_revisions r
        where r.project_id = v_p.project_id and r.path = c.value ->> 'path' and r.proposal_id = p_proposal
      )
      and case
        when c.value ->> 'kind' = 'create' then
          exists (select 1 from public.project_files f where f.project_id = v_p.project_id and f.path = c.value ->> 'path')
        else
          not exists (
            select 1 from public.project_files f
            join public.project_file_revisions b on b.project_id = f.project_id and b.path = f.path and b.revision = (c.value ->> 'base_revision')::integer
            where f.project_id = v_p.project_id and f.path = c.value ->> 'path' and f.sha256 = b.sha256
          )
      end
  );
  if jsonb_array_length(p_operations) = 0 and not v_complete then
    raise exception 'INVALID_RECOVERY' using errcode = '22023';
  end if;
  if p_status is distinct from (case when v_complete then 'recovered' else 'partially_recovered' end) then
    raise exception 'INVALID_RECOVERY' using errcode = '22023';
  end if;

  perform private.apply_transitions(v_p.task_id, p_actor, p_expected_task_version, p_steps);
  select state into v_state from public.tasks where id = v_p.task_id;
  if v_state is distinct from (case when v_complete then 'RECOVERED' else 'RECOVERY_PENDING' end) then
    raise exception 'INVALID_TRANSITION' using errcode = '22023';
  end if;

  insert into public.recovery_operations (org_id, project_id, task_id, proposal_id, proofpack_digest, plan_sha256, operation_sha256, status, restored, statement, digest, created_by)
  values (v_p.org_id, v_p.project_id, v_p.task_id, p_proposal, v_proofpack, p_plan_sha256, p_operation_sha256, p_status, v_restored, p_receipt, p_receipt_digest, p_actor)
  returning id into v_id;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_p.org_id, p_actor, 'change.recovered', p_proposal::text,
          jsonb_build_object('task_id', v_p.task_id, 'files', v_restored, 'status', p_status, 'plan_sha256', p_plan_sha256, 'receipt', p_receipt_digest));

  return jsonb_build_object('id', v_id, 'restored', v_restored, 'status', p_status, 'digest', p_receipt_digest, 'replayed', false);
end;
$$;

revoke all on function public.app_recover_change(uuid, uuid, jsonb, text, text, integer, jsonb, jsonb, jsonb, text, text, integer, bigint, integer) from public, anon, authenticated;
grant execute on function public.app_recover_change(uuid, uuid, jsonb, text, text, integer, jsonb, jsonb, jsonb, text, text, integer, bigint, integer) to service_role;
