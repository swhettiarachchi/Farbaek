-- Farbaek schema v8: ProofPacks.
--
-- Applying a change proposal now records its ProofPack (an in-toto statement
-- built by src/core/proof/proofpack.ts) in the same transaction. ProofPacks
-- are append-only: a trigger refuses every update, and rows leave only when
-- their project or organization is deleted. Within a project they form a
-- hash chain: each one names the digest of the one before, enforced here
-- under the project lock.

create table public.proofpacks (
  seq          bigint generated always as identity,
  digest       text primary key check (digest ~ '^[0-9a-f]{64}$'),
  org_id       uuid not null,
  project_id   uuid not null,
  task_id      uuid not null,
  -- No "set null": that would be an update, which the trigger refuses. Deleting a
  -- task removes its proposals and ProofPacks together, checked at statement end.
  proposal_id  uuid references public.change_proposals (id),
  status       text not null check (status in ('unverified', 'partially_verified', 'verified', 'failed')),
  statement    jsonb not null check (jsonb_typeof(statement) = 'object' and statement ->> '_type' = 'https://in-toto.io/Statement/v1'),
  previous     text check (previous is null or previous ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);
create unique index proofpacks_seq_idx on public.proofpacks (seq);
create index proofpacks_project_idx on public.proofpacks (project_id, seq desc);
create index proofpacks_task_idx on public.proofpacks (task_id, seq desc);

alter table public.proofpacks enable row level security;
revoke all on public.proofpacks from anon, authenticated;
grant select on public.proofpacks to authenticated;
create policy "members read proofpacks" on public.proofpacks
  for select to authenticated using ((select private.is_member(org_id)));

create function private.refuse_proofpack_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'PROOFPACK_IMMUTABLE' using errcode = '42501';
end;
$$;
create trigger proofpacks_immutable before update on public.proofpacks
  for each row execute function private.refuse_proofpack_update();

-- The signature gains the ProofPack.
drop function public.app_apply_proposal(uuid, uuid, jsonb, text, integer, jsonb, integer, bigint, integer);

-- Same as v7, plus: p_proofpack is the statement, p_proofpack_digest its
-- canonical SHA-256 (computed by the server), p_proofpack_status its status.
-- The statement must name this proposal, this approval and one subject per
-- file, and link to the project's latest ProofPack.
create function public.app_apply_proposal(
  p_proposal uuid,
  p_actor uuid,
  p_files jsonb,
  p_applied_sha256 text,
  p_expected_task_version integer,
  p_steps jsonb,
  p_max_file_bytes integer,
  p_max_project_bytes bigint,
  p_max_files integer,
  p_proofpack jsonb,
  p_proofpack_digest text,
  p_proofpack_status text
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
  v_previous text;
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

  -- The ProofPack must describe exactly this application.
  select digest into v_previous from public.proofpacks where project_id = v_p.project_id order by seq desc limit 1;
  if p_proofpack is null or p_proofpack_digest is null
     or p_proofpack -> 'predicate' -> 'proposal' ->> 'id' is distinct from p_proposal::text
     or p_proofpack -> 'predicate' -> 'approval' ->> 'appliedSha256' is distinct from p_applied_sha256
     or p_proofpack -> 'predicate' ->> 'status' is distinct from p_proofpack_status
     or jsonb_array_length(coalesce(p_proofpack -> 'subject', '[]'::jsonb)) <> jsonb_array_length(p_files) then
    raise exception 'INVALID_PROOFPACK' using errcode = '22023';
  end if;
  if p_proofpack -> 'predicate' ->> 'previous' is distinct from v_previous then
    raise exception 'PROOFPACK_CHAIN' using errcode = '40001';
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

  insert into public.proofpacks (digest, org_id, project_id, task_id, proposal_id, status, statement, previous)
  values (p_proofpack_digest, v_p.org_id, v_p.project_id, v_p.task_id, p_proposal, p_proofpack_status, p_proofpack, v_previous);

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_p.org_id, p_actor, 'proposal.applied', p_proposal::text,
          jsonb_build_object('task_id', v_p.task_id, 'files', v_written, 'applied_sha256', p_applied_sha256, 'proofpack', p_proofpack_digest, 'proofpack_status', p_proofpack_status));
  return v_written;
end;
$$;

revoke all on function public.app_apply_proposal(uuid, uuid, jsonb, text, integer, jsonb, integer, bigint, integer, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.app_apply_proposal(uuid, uuid, jsonb, text, integer, jsonb, integer, bigint, integer, jsonb, text, text) to service_role;
