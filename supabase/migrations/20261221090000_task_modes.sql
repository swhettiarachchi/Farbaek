-- Farbaek schema v80: operating modes (ADR 0131, spec §10). A task is in one
-- of four modes, an explicit setting people can see and change:
--   learn  explains concepts, decisions and trade-offs; changes nothing;
--   pair   small reviewable steps: at most 3 files a change, a person approves each;
--   build  implements the approved contract within its limits (the default);
--   audit  inspects and reports; changes nothing.
-- The rules are enforced here, by triggers on the rows that record changes
-- and runs, whichever function writes them.

alter table public.tasks add column mode text not null default 'build' check (mode in ('learn', 'pair', 'build', 'audit'));

-- Notes the AI writes for Learn and Audit tasks, and the operation they're metered as.
alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping', 'policy_draft', 'image_generation', 'second_check', 'task_note'));

create table public.task_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  task_id     uuid not null,
  kind        text not null check (kind in ('explanation', 'audit')),
  body        jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 65536),
  model       text not null check (char_length(model) between 1 and 100),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade
);
create index task_notes_task_idx on public.task_notes (task_id, created_at desc);

alter table public.task_notes enable row level security;
revoke all on public.task_notes from public, anon, authenticated, service_role;
grant select on public.task_notes to authenticated, service_role;
create policy "members read task notes" on public.task_notes for select to authenticated using ((select private.is_member(org_id)));

-- ------------------------------------------------------------- the rules

-- Learn and Audit tasks change nothing; a Pair change is at most 3 files.
create function private.task_mode_guard_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  select mode into v_mode from public.tasks where id = new.task_id;
  if v_mode in ('learn', 'audit') then
    raise exception 'MODE_NO_CHANGES' using errcode = 'P0001', detail = v_mode;
  end if;
  if v_mode = 'pair' and jsonb_array_length(new.changes) > 3 then
    raise exception 'PAIR_TOO_LARGE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.task_mode_guard_proposal() from public;
create trigger task_mode_guard_proposal before insert on public.change_proposals
  for each row execute function private.task_mode_guard_proposal();

-- A Pair step is always approved by a person, never applied on its own.
create function private.task_mode_guard_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.policy ->> 'outcome', '') = 'ALLOW_WITHIN_LIMITS'
     and exists (select 1 from public.tasks t where t.id = new.task_id and t.mode = 'pair') then
    raise exception 'PAIR_NEEDS_PERSON' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.task_mode_guard_apply() from public;
create trigger task_mode_guard_apply before update of status on public.change_proposals
  for each row when (old.status = 'pending' and new.status = 'applied')
  execute function private.task_mode_guard_apply();

-- No agent runs for tasks that change nothing.
create function private.task_mode_guard_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.tasks t where t.id = new.task_id and t.mode in ('learn', 'audit')) then
    raise exception 'MODE_NO_CHANGES' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.task_mode_guard_run() from public;
create trigger task_mode_guard_run before insert on public.agent_runs
  for each row execute function private.task_mode_guard_run();

-- ------------------------------------------------- server-only functions

-- Changes a task's mode. Contributors, and never while a change waits for review.
create function public.app_set_task_mode(p_task uuid, p_actor uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task record;
begin
  select id, org_id, mode into v_task from public.tasks where id = p_task for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_task.org_id, p_actor);
  if p_mode not in ('learn', 'pair', 'build', 'audit') then
    raise exception 'INVALID_MODE' using errcode = '22023';
  end if;
  if v_task.mode = p_mode then
    return;
  end if;
  if exists (select 1 from public.change_proposals p where p.task_id = p_task and p.status = 'pending') then
    raise exception 'PROPOSAL_PENDING' using errcode = 'P0001';
  end if;
  update public.tasks set mode = p_mode, updated_at = now() where id = p_task;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_task.org_id, p_actor, 'task.mode_changed', p_task::text, jsonb_build_object('from', v_task.mode, 'to', p_mode));
end;
$$;

-- Keeps a note the AI wrote for a Learn or Audit task. Contributors.
create function public.app_record_task_note(p_task uuid, p_actor uuid, p_kind text, p_body jsonb, p_model text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task record;
  v_id uuid;
begin
  select id, org_id, mode into v_task from public.tasks where id = p_task;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_task.org_id, p_actor);
  if (p_kind = 'explanation' and v_task.mode <> 'learn') or (p_kind = 'audit' and v_task.mode <> 'audit') then
    raise exception 'WRONG_MODE' using errcode = 'P0001';
  end if;
  insert into public.task_notes (org_id, task_id, kind, body, model, created_by)
  values (v_task.org_id, p_task, p_kind, p_body, p_model, p_actor)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_task.org_id, p_actor, 'task.note_written', p_task::text, jsonb_build_object('kind', p_kind, 'model', p_model));
  return v_id;
end;
$$;

revoke all on function public.app_set_task_mode(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_record_task_note(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.app_set_task_mode(uuid, uuid, text) to service_role;
grant execute on function public.app_record_task_note(uuid, uuid, text, jsonb, text) to service_role;
