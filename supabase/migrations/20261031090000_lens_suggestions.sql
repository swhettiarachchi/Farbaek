-- Farbaek schema v29: AI suggestions in the Intent Diff Lens (ADR 0044).
--
-- On request, a model maps each hunk of a proposal to the contract clause
-- it serves, or to none. The suggestion is metered like any AI call
-- (operation lens_mapping), kept with the proposal, and shown as AI beside
-- the exact checks, which it never changes. Members read it; only the
-- server writes it, for a proposal that's still waiting for review.

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping'));

create table public.proposal_lens_suggestions (
  proposal_id  uuid primary key references public.change_proposals (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  suggestion   jsonb not null check (jsonb_typeof(suggestion) = 'object' and octet_length(suggestion::text) <= 65536),
  model        text not null check (char_length(model) between 1 and 100),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.proposal_lens_suggestions enable row level security;
revoke all on public.proposal_lens_suggestions from public, anon, authenticated, service_role;
grant select on public.proposal_lens_suggestions to authenticated, service_role;
create policy "members read their workspace's lens suggestions" on public.proposal_lens_suggestions
  for select to authenticated using ((select private.is_member(org_id)));

-- Records (or replaces) the suggestion for one pending proposal.
create function public.app_record_lens_suggestion(p_proposal uuid, p_actor uuid, p_suggestion jsonb, p_model text)
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
  if jsonb_typeof(p_suggestion) is distinct from 'object' or jsonb_typeof(p_suggestion -> 'mappings') is distinct from 'array' then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;
  insert into public.proposal_lens_suggestions (proposal_id, org_id, suggestion, model, created_by, created_at)
  values (p_proposal, v_p.org_id, p_suggestion, p_model, p_actor, now())
  on conflict (proposal_id) do update
    set suggestion = excluded.suggestion, model = excluded.model, created_by = excluded.created_by, created_at = excluded.created_at;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_p.org_id, p_actor, 'proposal.lens_suggested', p_proposal::text,
          jsonb_build_object('model', p_model, 'mappings', jsonb_array_length(p_suggestion -> 'mappings')));
end;
$$;

revoke all on function public.app_record_lens_suggestion(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.app_record_lens_suggestion(uuid, uuid, jsonb, text) to service_role;
