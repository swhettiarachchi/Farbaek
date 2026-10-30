-- Farbaek schema v75: the second check on a change (ADR 0121, spec §9).
--
-- On request, a second model reads a pending change against its approved
-- contract and says whether they agree. It's metered like any AI call
-- (operation second_check), kept with the proposal, and shown as advisory:
-- it never changes the policy's decision or what the change needs to be
-- approved. Members read it; only the server writes it, for a proposal
-- that's still waiting for review. A later check replaces the earlier one.

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping', 'policy_draft', 'image_generation', 'second_check'));

create table public.proposal_second_checks (
  proposal_id  uuid primary key references public.change_proposals (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  verdict      text not null check (verdict in ('consistent', 'concerns', 'unclear')),
  result       jsonb not null check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 65536),
  model        text not null check (char_length(model) between 1 and 100),
  independent  boolean not null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.proposal_second_checks enable row level security;
revoke all on public.proposal_second_checks from public, anon, authenticated, service_role;
grant select on public.proposal_second_checks to authenticated, service_role;
create policy "members read their workspace's second checks" on public.proposal_second_checks
  for select to authenticated using ((select private.is_member(org_id)));

-- Records (or replaces) the second check for one pending proposal.
create function public.app_record_second_check(p_proposal uuid, p_actor uuid, p_verdict text, p_result jsonb, p_model text, p_independent boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.change_proposals%rowtype;
begin
  select * into v_p from public.change_proposals where id = p_proposal for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_p.org_id, p_actor);
  if v_p.status <> 'pending' then
    raise exception 'PROPOSAL_CLOSED' using errcode = '40001';
  end if;
  if p_verdict is null or p_verdict not in ('consistent', 'concerns', 'unclear')
     or jsonb_typeof(p_result) is distinct from 'object' or jsonb_typeof(p_result -> 'findings') is distinct from 'array'
     or p_independent is null or p_model is null or char_length(p_model) not between 1 and 100 then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;
  insert into public.proposal_second_checks (proposal_id, org_id, verdict, result, model, independent, created_by, created_at)
  values (p_proposal, v_p.org_id, p_verdict, p_result, p_model, p_independent, p_actor, now())
  on conflict (proposal_id) do update
    set verdict = excluded.verdict, result = excluded.result, model = excluded.model, independent = excluded.independent,
        created_by = excluded.created_by, created_at = excluded.created_at;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_p.org_id, p_actor, 'proposal.second_checked', p_proposal::text,
          jsonb_build_object('model', p_model, 'verdict', p_verdict, 'independent', p_independent, 'findings', jsonb_array_length(p_result -> 'findings')));
end;
$$;

revoke all on function public.app_record_second_check(uuid, uuid, text, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.app_record_second_check(uuid, uuid, text, jsonb, text, boolean) to service_role;
