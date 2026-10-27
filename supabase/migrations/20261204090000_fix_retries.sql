-- Farbaek schema v63: fixing what failed checks found, with free retries (ADR 0101).
--
-- A task whose checks failed can start a fix: a new task linked to it, with
-- the same intent. If the fix's own checks fail too, the AI usage it settled
-- is given back from the plan's retry reserve (ECONOMICS.retryHoldback), once,
-- whole ledger entries only, within the same 31-day cap the settle function
-- already applies to free retries. The server key calls these functions; it
-- can't write the columns directly.

alter table public.tasks
  add column fix_of_task_id   uuid,
  add column fix_refunded_at  timestamptz,
  add constraint tasks_fix_of_same_org_fk foreign key (fix_of_task_id, org_id)
    references public.tasks (id, org_id) on delete set null (fix_of_task_id),
  add constraint tasks_fix_not_self check (fix_of_task_id is null or fix_of_task_id <> id),
  add constraint tasks_fix_refund_needs_fix check (fix_refunded_at is null or fix_of_task_id is not null);
create index tasks_fix_of_idx on public.tasks (fix_of_task_id) where fix_of_task_id is not null;

-- Links a just-created task as the fix for one whose checks failed. One open fix per task at a time.
create function public.app_link_fix_task(p_org uuid, p_actor uuid, p_task uuid, p_source uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.tasks%rowtype;
  v_task public.tasks%rowtype;
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v_source from public.tasks t where t.id = p_source and t.org_id = p_org for update;
  select * into v_task from public.tasks t where t.id = p_task and t.org_id = p_org for update;
  if v_source.id is null or v_task.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_source.state not in ('FAILED', 'PARTIALLY_VERIFIED') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_task.state not in ('RECEIVED', 'CONTEXT_ASSEMBLED', 'CONTRACT_DRAFTED') or v_task.fix_of_task_id is not null or v_task.project_id <> v_source.project_id then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.tasks f
     where f.fix_of_task_id = p_source and f.org_id = p_org
       and f.state not in ('VERIFIED', 'FAILED', 'PARTIALLY_VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'RECOVERED', 'REQUIRES_HUMAN_INTERVENTION')
  ) then
    raise exception 'FIX_OPEN' using errcode = 'P0001';
  end if;
  update public.tasks t set fix_of_task_id = p_source where t.id = p_task;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'task.fix_started', p_task::text, jsonb_build_object('fixes', p_source));
end;
$$;

-- Gives back a failed fix's settled AI usage from the retry reserve. Returns the units given back (0 when nothing applies).
create function public.app_refund_fix_task(p_task uuid, p_cap bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_used bigint;
  v_given bigint := 0;
  v_entries integer := 0;
  v_row record;
begin
  select * into v_task from public.tasks t where t.id = p_task;
  if not found or v_task.fix_of_task_id is null or v_task.fix_refunded_at is not null
     or v_task.state not in ('FAILED', 'PARTIALLY_VERIFIED') or coalesce(p_cap, 0) <= 0 then
    return 0;
  end if;
  -- The same lock the settle function takes, so the cap can't be passed by two at once.
  perform 1 from public.organizations o where o.id = v_task.org_id for update;
  select * into v_task from public.tasks t where t.id = p_task for update;
  if v_task.fix_refunded_at is not null then
    return 0;
  end if;
  select coalesce(sum(l.credits), 0) into v_used from public.ai_credit_ledger l
   where l.org_id = v_task.org_id and l.status = 'refunded' and l.refund_reason = 'free_retry' and l.settled_at > now() - interval '31 days';

  for v_row in
    select l.id, l.credits, l.grants from public.ai_credit_ledger l
     where l.org_id = v_task.org_id and l.task_id = p_task and l.status = 'settled'
     order by l.settled_at, l.id
     for update
  loop
    exit when v_used + v_given + v_row.credits > p_cap;
    perform private.release_units(v_row.grants, v_row.credits);
    update public.ai_credit_ledger l
       set status = 'refunded', refund_reason = 'free_retry', grants = '[]'::jsonb
     where l.id = v_row.id;
    v_given := v_given + v_row.credits;
    v_entries := v_entries + 1;
  end loop;

  update public.tasks t set fix_refunded_at = now() where t.id = p_task;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_task.org_id, null, 'usage.free_retry', p_task::text,
    jsonb_build_object('units', v_given, 'entries', v_entries, 'fixes', v_task.fix_of_task_id, 'cap', p_cap));
  return v_given;
end;
$$;

revoke all on function public.app_link_fix_task(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_refund_fix_task(uuid, bigint) from public, anon, authenticated;
grant execute on function public.app_link_fix_task(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.app_refund_fix_task(uuid, bigint) to service_role;
