-- Farbaek schema v94: Survey Studio drafts from the surveyor's words (stage 191, ADR 0202).
--
-- Two AI actions, metered like every other: "Draft the plan" reads the
-- surveyor's own description into lots, roads, adjoining lands and title
-- fields (survey_draft); "Read an old plan" reads a photo of an earlier plan
-- or deed into title fields (survey_read). The model never computes: the
-- tested engine measures everything, and every AI-filled item waits for the
-- surveyor to check it. Nothing the person typed or photographed is stored
-- here: the draft comes back to the screen and is saved, if at all, as an
-- ordinary drawing version. Each run leaves one audit event with counts only.

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping', 'policy_draft', 'image_generation', 'second_check', 'task_note', 'failure_test', 'survey_draft', 'survey_read'));

-- Records that an AI draft ran on a project: which action, which model, and how many items it offered, dropped and asked about.
create function public.app_survey_record_ai_draft(p_org uuid, p_actor uuid, p_project uuid, p_operation text, p_model text, p_accepted integer, p_dropped integer, p_questions integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.survey_project_open(p_org, p_project);
  if p_operation is null or p_operation not in ('survey_draft', 'survey_read') then
    raise exception 'INVALID_OPERATION' using errcode = '22023';
  end if;
  if p_model is null or p_model !~ '^[a-z0-9][a-z0-9.:_-]{0,79}$' then
    raise exception 'INVALID_MODEL' using errcode = '22023';
  end if;
  if p_accepted is null or p_dropped is null or p_questions is null
     or p_accepted not between 0 and 1000 or p_dropped not between 0 and 1000 or p_questions not between 0 and 100 then
    raise exception 'INVALID_COUNTS' using errcode = '22023';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.ai_drafted', p_project::text,
          jsonb_build_object('operation', p_operation, 'model', p_model, 'accepted', p_accepted, 'dropped', p_dropped, 'questions', p_questions));
end;
$$;

revoke all on function public.app_survey_record_ai_draft(uuid, uuid, uuid, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.app_survey_record_ai_draft(uuid, uuid, uuid, text, text, integer, integer, integer) to service_role;
