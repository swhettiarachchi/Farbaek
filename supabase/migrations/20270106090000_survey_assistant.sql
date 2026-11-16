-- Farbaek schema v96: Survey Studio's drafting assistant (stage 195, ADR 0210).
--
-- The surveyor talks or types to the plan; the model reads each instruction
-- into a closed set of operations, code checks them, and the surveyor applies
-- them. One more AI operation, metered like the others (survey_assist), and a
-- record of the assistant's turns kept with the project: the words the
-- surveyor gave, the reply, the operations as checked, and what became of
-- them, so the surveyor can find an instruction again and the workspace has an
-- audit trail. Members of the workspace read their projects' turns; only the
-- server's functions below write them. A project keeps its last 500 turns, and
-- they go when the project does.

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping', 'policy_draft', 'image_generation', 'second_check', 'task_note', 'failure_test', 'survey_draft', 'survey_read', 'survey_assist'));

create table public.survey_assistant_turns (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.survey_projects (id) on delete cascade,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  actor_id      uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  lang          text not null check (lang in ('en', 'si', 'ta')),
  input_method  text not null check (input_method in ('voice', 'typed')),
  -- The instruction as the surveyor gave it, and the assistant's short reply (it never carries figures).
  words         text not null check (char_length(words) between 1 and 2000),
  reply         text not null default '' check (char_length(reply) <= 400),
  -- The operations as checked by code, and what was left out and why.
  operations    jsonb not null default '[]'::jsonb check (jsonb_typeof(operations) = 'array' and pg_column_size(operations) <= 65536),
  dropped       jsonb not null default '[]'::jsonb check (jsonb_typeof(dropped) = 'array' and pg_column_size(dropped) <= 16384),
  outcome       text not null check (outcome in ('suggested', 'applied', 'discarded', 'failed', 'reverted')),
  outcome_at    timestamptz,
  -- When applied: the SHA-256 of the canonical JSON of the change, so the version that carries it can be matched to this turn.
  applied_sha256 text check (applied_sha256 ~ '^[0-9a-f]{64}$'),
  model         text not null check (model ~ '^[a-z0-9][a-z0-9.:_-]{0,79}$')
);
create index survey_assistant_turns_project_idx on public.survey_assistant_turns (project_id, created_at desc);

alter table public.survey_assistant_turns enable row level security;
revoke all on public.survey_assistant_turns from public, anon, authenticated, service_role;
grant select on public.survey_assistant_turns to authenticated, service_role;
create policy "members read survey assistant turns" on public.survey_assistant_turns for select to authenticated using ((select private.is_member(org_id)));

-- Records one turn and its audit event (counts only), keeping the project's last 500 turns.
create function public.app_survey_record_assistant_turn(p_org uuid, p_actor uuid, p_project uuid, p_lang text, p_input text, p_words text, p_reply text, p_operations jsonb, p_dropped jsonb, p_outcome text, p_model text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.survey_project_open(p_org, p_project);
  if p_outcome is null or p_outcome not in ('suggested', 'failed') then
    raise exception 'INVALID_OUTCOME' using errcode = '22023';
  end if;
  if p_model is null or p_model !~ '^[a-z0-9][a-z0-9.:_-]{0,79}$' then
    raise exception 'INVALID_MODEL' using errcode = '22023';
  end if;
  insert into public.survey_assistant_turns (project_id, org_id, actor_id, lang, input_method, words, reply, operations, dropped, outcome, model)
  values (p_project, p_org, p_actor, p_lang, p_input, p_words, coalesce(p_reply, ''), coalesce(p_operations, '[]'::jsonb), coalesce(p_dropped, '[]'::jsonb), p_outcome, p_model)
  returning id into v_id;
  delete from public.survey_assistant_turns t
  where t.project_id = p_project
    and t.id in (select id from public.survey_assistant_turns where project_id = p_project order by created_at desc, id desc offset 500);
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.assistant_turn', p_project::text,
          jsonb_build_object('model', p_model, 'input', p_input, 'lang', p_lang, 'operations', jsonb_array_length(coalesce(p_operations, '[]'::jsonb)), 'dropped', jsonb_array_length(coalesce(p_dropped, '[]'::jsonb)), 'outcome', p_outcome));
  return v_id;
end;
$$;

-- What became of a suggested turn: applied (with the hash of the change) or discarded; an applied turn can later be taken back. Only
-- the surveyor who gave the instruction decides it.
create function public.app_survey_decide_assistant_turn(p_org uuid, p_actor uuid, p_turn uuid, p_outcome text, p_applied_sha256 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turn public.survey_assistant_turns%rowtype;
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v_turn from public.survey_assistant_turns where id = p_turn and org_id = p_org for update;
  if not found or v_turn.actor_id is distinct from p_actor then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.survey_project_open(p_org, v_turn.project_id);
  if not ((v_turn.outcome = 'suggested' and p_outcome in ('applied', 'discarded')) or (v_turn.outcome = 'applied' and p_outcome = 'reverted')) then
    raise exception 'INVALID_OUTCOME' using errcode = '22023';
  end if;
  if p_outcome = 'applied' and (p_applied_sha256 is null or p_applied_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'INVALID_HASH' using errcode = '22023';
  end if;
  update public.survey_assistant_turns
  set outcome = p_outcome, outcome_at = now(), applied_sha256 = case when p_outcome = 'applied' then p_applied_sha256 else applied_sha256 end
  where id = p_turn;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.assistant_decided', v_turn.project_id::text, jsonb_build_object('turn', p_turn, 'outcome', p_outcome));
end;
$$;

revoke all on function public.app_survey_record_assistant_turn(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.app_survey_decide_assistant_turn(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_survey_record_assistant_turn(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.app_survey_decide_assistant_turn(uuid, uuid, uuid, text, text) to service_role;
