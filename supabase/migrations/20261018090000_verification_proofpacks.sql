-- Farbaek schema v12: ProofPacks for verified check runs.
--
-- A change's ProofPack is written when it's applied, before any check has
-- run, so it's unverified, and ProofPacks never change. When the change's
-- checks then run in a sandbox against exactly the applied content, a second
-- ProofPack is appended to the project's chain with the real results. It
-- repeats what was approved and applied, links to the run's receipt and to
-- the change's own ProofPack, and is recorded once per receipt.
--
-- This function checks that the receipt belongs to the task, matches the
-- statement's status and says the sandbox held the applied content, that the
-- statement names the task, its applied proposal and the change's ProofPack,
-- and that it links to the project's latest ProofPack, under the project lock.

create unique index proofpacks_verification_receipt_idx
  on public.proofpacks ((statement -> 'predicate' -> 'verification' ->> 'receipt'))
  where statement -> 'predicate' -> 'verification' ->> 'receipt' is not null;

create function public.app_record_verification_proofpack(
  p_task uuid,
  p_actor uuid,
  p_receipt text,
  p_statement jsonb,
  p_digest text,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_receipt public.sandbox_receipts%rowtype;
  v_existing text;
  v_proposal uuid;
  v_applied text;
  v_previous text;
begin
  select * into v_task from public.tasks where id = p_task;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.lock_project(v_task.project_id, p_actor);

  -- Once per receipt: a repeat returns the ProofPack already recorded.
  select digest into v_existing from public.proofpacks
  where statement -> 'predicate' -> 'verification' ->> 'receipt' = p_receipt;
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_receipt from public.sandbox_receipts where digest = p_receipt;
  if not found or v_receipt.task_id is distinct from p_task or v_receipt.org_id <> v_task.org_id then
    raise exception 'INVALID_PROOFPACK' using errcode = '22023';
  end if;
  -- Only a run against exactly the applied content verifies the change.
  if v_receipt.status is distinct from p_status
     or (v_receipt.statement -> 'predicate' -> 'appliedChange' ->> 'matched') is distinct from 'true' then
    raise exception 'INVALID_PROOFPACK' using errcode = '22023';
  end if;

  select id into v_proposal from public.change_proposals
  where task_id = p_task and status = 'applied' order by decided_at desc nulls last limit 1;
  select digest into v_applied from public.proofpacks
  where task_id = p_task and proposal_id = v_proposal and statement -> 'predicate' -> 'verification' is null
  order by seq desc limit 1;
  select digest into v_previous from public.proofpacks where project_id = v_task.project_id order by seq desc limit 1;

  if v_proposal is null or v_applied is null
     or p_statement ->> '_type' is distinct from 'https://in-toto.io/Statement/v1'
     or p_statement -> 'predicate' ->> 'status' is distinct from p_status
     or p_statement -> 'predicate' -> 'task' ->> 'id' is distinct from p_task::text
     or p_statement -> 'predicate' -> 'proposal' ->> 'id' is distinct from v_proposal::text
     or p_statement -> 'predicate' -> 'verification' ->> 'receipt' is distinct from p_receipt
     or p_statement -> 'predicate' -> 'verification' ->> 'appliedProofPack' is distinct from v_applied
     or (v_receipt.statement -> 'predicate' -> 'verdict' ->> 'proofPackDigest') is distinct from v_applied then
    raise exception 'INVALID_PROOFPACK' using errcode = '22023';
  end if;
  if p_statement -> 'predicate' ->> 'previous' is distinct from v_previous then
    raise exception 'PROOFPACK_CHAIN' using errcode = '40001';
  end if;

  insert into public.proofpacks (digest, org_id, project_id, task_id, proposal_id, status, statement, previous)
  values (p_digest, v_task.org_id, v_task.project_id, p_task, v_proposal, p_status, p_statement, v_previous);

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_task.org_id, p_actor, 'proofpack.verification_recorded', p_task::text,
          jsonb_build_object('proofpack', p_digest, 'status', p_status, 'receipt', p_receipt, 'applied_proofpack', v_applied));
  return p_digest;
end;
$$;

revoke all on function public.app_record_verification_proofpack(uuid, uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.app_record_verification_proofpack(uuid, uuid, text, jsonb, text, text) to service_role;
