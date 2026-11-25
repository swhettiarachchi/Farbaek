-- Farbaek schema v106: work Farbaek does by itself on a schedule (stage 271, ADR 0278). Additions only, nothing taken away.
--
-- A scheduled task is a person's instruction and when to run it. Each run is a Chat turn made on the server with no page open, as that
-- person, in the task's own conversation. The work is durable: a task that is due is claimed with a lease, so a server that restarts
-- mid-run leaves it to be claimed again, and each due time is run at most once (one row per task and due time).
--
-- Tasks and runs are read by their owner (row-level security) and written only through the functions below, by the server.

create table public.scheduled_tasks (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 80),
  instruction     text not null check (char_length(instruction) between 1 and 4000),
  -- { "repeat": { "kind": "daily", "time": "09:00" }, "timeZone": "Asia/Colombo", "end": { "kind": "never" } }, checked by the server.
  schedule        jsonb not null check (jsonb_typeof(schedule) = 'object' and octet_length(schedule::text) <= 2000),
  -- { "web": true, "effort": "balanced", "notify": true }
  options         jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object' and octet_length(options::text) <= 1000),
  state           text not null default 'active' check (state in ('active', 'paused', 'ended')),
  -- Why it is paused or ended, when Farbaek did that itself ("Paused after 5 runs in a row didn't finish").
  state_reason    text check (state_reason is null or char_length(state_reason) <= 300),
  -- Where its answers are written. Kept if the conversation is deleted: the next run starts a new one.
  conversation_id uuid references public.chat_conversations (id) on delete set null,
  next_run_at     timestamptz,
  -- While a run holds it, and after a failed try, until when it may not be claimed again.
  lease_until     timestamptz,
  -- Tries at the due time it is on now.
  attempts        integer not null default 0 check (attempts >= 0),
  -- Due times finished, whatever the outcome: what "ends after N runs" counts.
  runs_finished   integer not null default 0 check (runs_finished >= 0),
  failures_in_row integer not null default 0 check (failures_in_row >= 0),
  last_run_at     timestamptz,
  last_status     text check (last_status is null or last_status in ('done', 'failed', 'skipped')),
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create index scheduled_tasks_owner on public.scheduled_tasks (owner_id, org_id, created_at desc) where archived_at is null;
create index scheduled_tasks_due on public.scheduled_tasks (next_run_at) where state = 'active' and archived_at is null;

create table public.scheduled_task_runs (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.scheduled_tasks (id) on delete cascade,
  org_id          uuid not null references public.organizations (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  due_at          timestamptz not null,
  status          text not null check (status in ('running', 'retrying', 'done', 'failed', 'skipped')),
  attempt         integer not null default 1 check (attempt >= 1),
  -- What happened, in a sentence, when it didn't simply finish.
  detail          text check (detail is null or char_length(detail) <= 500),
  conversation_id uuid,
  message_id      uuid,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  constraint scheduled_task_runs_slot unique (task_id, due_at)
);

create index scheduled_task_runs_task on public.scheduled_task_runs (task_id, due_at desc);

alter table public.scheduled_tasks enable row level security;
alter table public.scheduled_task_runs enable row level security;
revoke all on public.scheduled_tasks from public, anon, authenticated, service_role;
revoke all on public.scheduled_task_runs from public, anon, authenticated, service_role;
grant select on public.scheduled_tasks to authenticated, service_role;
grant select on public.scheduled_task_runs to authenticated, service_role;
create policy "owners read their scheduled tasks" on public.scheduled_tasks for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));
create policy "owners read their scheduled runs" on public.scheduled_task_runs for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));

-- The timer that runs due tasks reports like the other background jobs (v43).
alter table public.job_runs drop constraint job_runs_job_check;
alter table public.job_runs add constraint job_runs_job_check check (job in ('sandbox_sweep', 'hourly_jobs', 'db_backup', 'restore_test', 'scheduled_tasks'));

-- How many of a person's tasks are active in a workspace: what a plan's limit is checked against.
create function private.scheduled_active_count(p_org uuid, p_owner uuid, p_except uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.scheduled_tasks t
  where t.org_id = p_org and t.owner_id = p_owner and t.state = 'active' and t.archived_at is null and (p_except is null or t.id <> p_except);
$$;
revoke all on function private.scheduled_active_count(uuid, uuid, uuid) from public, anon, authenticated;

-- A new task (p_task null), or a change to one from the version on screen. The server works out when it runs next; none means the
-- schedule has no run left, and the task is saved as ended. p_max_active is the plan's limit on active tasks, passed by the server.
create function public.app_scheduled_task_save(
  p_org uuid, p_actor uuid, p_task uuid, p_base_version integer, p_title text, p_instruction text, p_schedule jsonb, p_options jsonb,
  p_next_run_at timestamptz, p_max_active integer
)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_version integer;
  v_state text;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 or p_instruction is null or char_length(btrim(p_instruction)) not between 1 and 4000
     or p_schedule is null or jsonb_typeof(p_schedule) <> 'object' or p_options is null or jsonb_typeof(p_options) <> 'object' or p_max_active is null or p_max_active < 0 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  if p_task is null then
    if p_next_run_at is not null and private.scheduled_active_count(p_org, p_actor, null) >= p_max_active then
      raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
    end if;
    -- Kept tasks, active or not: a ceiling against a runaway script, far above what a person sets up by hand.
    if (select count(*) from public.scheduled_tasks t where t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null) >= 200 then
      raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
    end if;
    insert into public.scheduled_tasks (org_id, owner_id, title, instruction, schedule, options, state, state_reason, next_run_at)
    values (p_org, p_actor, btrim(p_title), btrim(p_instruction), p_schedule, p_options,
            case when p_next_run_at is null then 'ended' else 'active' end,
            case when p_next_run_at is null then 'Its schedule has no run left.' end, p_next_run_at)
    returning scheduled_tasks.id, scheduled_tasks.version into v_id, v_version;
    return query select v_id, v_version;
    return;
  end if;
  select t.version, t.state into v_version, v_state from public.scheduled_tasks t
  where t.id = p_task and t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_base_version is distinct from v_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  -- An ended task given a schedule with a run left becomes active again, within the plan's limit; a paused one stays paused.
  if v_state = 'ended' and p_next_run_at is not null and private.scheduled_active_count(p_org, p_actor, p_task) >= p_max_active then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  update public.scheduled_tasks t
  set title = btrim(p_title), instruction = btrim(p_instruction), schedule = p_schedule, options = p_options,
      next_run_at = p_next_run_at, attempts = 0, lease_until = null,
      state = case when p_next_run_at is null then 'ended' when t.state = 'ended' then 'active' else t.state end,
      state_reason = case when p_next_run_at is null then 'Its schedule has no run left.' when t.state = 'ended' then null else t.state_reason end,
      version = t.version + 1, updated_at = now()
  where t.id = p_task;
  return query select p_task, v_version + 1;
end;
$$;

-- Pause, or resume: a resumed task starts counting failures afresh, within the plan's limit on active tasks.
create function public.app_scheduled_task_state(p_org uuid, p_actor uuid, p_task uuid, p_state text, p_next_run_at timestamptz, p_max_active integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_state not in ('active', 'paused') then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  select t.state into v_state from public.scheduled_tasks t
  where t.id = p_task and t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_state = 'paused' then
    update public.scheduled_tasks t set state = 'paused', state_reason = null, updated_at = now() where t.id = p_task and t.state = 'active';
    return;
  end if;
  if v_state = 'active' then
    return;
  end if;
  if p_next_run_at is null then
    raise exception 'SCHEDULE_ENDED' using errcode = 'P0001';
  end if;
  if private.scheduled_active_count(p_org, p_actor, p_task) >= coalesce(p_max_active, 0) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  update public.scheduled_tasks t
  set state = 'active', state_reason = null, next_run_at = p_next_run_at, attempts = 0, lease_until = null, failures_in_row = 0, updated_at = now()
  where t.id = p_task;
end;
$$;

-- Run an active task at the next tick, once, without changing its schedule.
create function public.app_scheduled_task_run_now(p_org uuid, p_actor uuid, p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  update public.scheduled_tasks t
  set next_run_at = now(), attempts = 0, updated_at = now()
  where t.id = p_task and t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null and t.state = 'active'
    and (t.lease_until is null or t.lease_until <= now());
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- Removes a task from the list. Its past answers stay in Chat.
create function public.app_scheduled_task_archive(p_org uuid, p_actor uuid, p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  update public.scheduled_tasks t
  set archived_at = now(), state = 'ended', state_reason = null, next_run_at = null, updated_at = now()
  where t.id = p_task and t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- Claims tasks that are due, for the server's runner: each gets a 15-minute lease and its run's row for this due time. A task whose
-- runner died is claimed again when the lease runs out, as another try at the same due time, never a second run of it.
create function public.app_scheduled_claim(p_limit integer)
returns table (
  run_id uuid, task_id uuid, org_id uuid, owner_id uuid, title text, instruction text, schedule jsonb, options jsonb, conversation_id uuid,
  due_at timestamptz, attempt integer, runs_finished integer, failures_in_row integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v record;
  v_run uuid;
begin
  -- Old history goes after half a year; the answers themselves are Chat's to keep.
  delete from public.scheduled_task_runs r where r.finished_at < now() - interval '180 days';
  for v in
    select t.id, t.org_id, t.owner_id, t.title, t.instruction, t.schedule, t.options, t.conversation_id, t.next_run_at, t.attempts, t.runs_finished, t.failures_in_row
    from public.scheduled_tasks t
    where t.state = 'active' and t.archived_at is null and t.next_run_at <= now() and (t.lease_until is null or t.lease_until <= now())
    order by t.next_run_at
    limit greatest(1, least(coalesce(p_limit, 3), 10))
    for update skip locked
  loop
    update public.scheduled_tasks t set lease_until = now() + interval '15 minutes', attempts = t.attempts + 1 where t.id = v.id;
    insert into public.scheduled_task_runs as r (task_id, org_id, owner_id, due_at, status, attempt)
    values (v.id, v.org_id, v.owner_id, v.next_run_at, 'running', v.attempts + 1)
    on conflict on constraint scheduled_task_runs_slot
    do update set status = 'running', attempt = excluded.attempt, started_at = now(), finished_at = null, detail = null
    returning r.id into v_run;
    run_id := v_run;
    task_id := v.id;
    org_id := v.org_id;
    owner_id := v.owner_id;
    title := v.title;
    instruction := v.instruction;
    schedule := v.schedule;
    options := v.options;
    conversation_id := v.conversation_id;
    due_at := v.next_run_at;
    attempt := v.attempts + 1;
    runs_finished := v.runs_finished;
    failures_in_row := v.failures_in_row;
    return next;
  end loop;
end;
$$;

-- Remembers the task's conversation as soon as a run has one, so a run that is cut off and tried again writes into the same one.
create function public.app_scheduled_task_conversation(p_task uuid, p_conversation uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.scheduled_tasks t
  set conversation_id = p_conversation
  where t.id = p_task
    and exists (select 1 from public.chat_conversations c where c.id = p_conversation and c.org_id = t.org_id and c.owner_id = t.owner_id);
$$;

-- How a run went. With p_retry_at, this try failed in a way worth trying again: the same due time is claimed again then. Otherwise the
-- due time is finished (done, failed or skipped): the task moves to p_next_run_at, or ends when there is none, or is paused with a reason.
-- p_attempt is the try reporting: an older try that was given up on (its lease ran out and the task was claimed again) changes nothing.
create function public.app_scheduled_run_finish(
  p_run uuid, p_attempt integer, p_status text, p_detail text, p_conversation uuid, p_message uuid,
  p_next_run_at timestamptz, p_retry_at timestamptz, p_pause_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task uuid;
begin
  if p_status not in ('done', 'failed', 'skipped') then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  select r.task_id into v_task from public.scheduled_task_runs r
  where r.id = p_run and r.status = 'running' and r.attempt = p_attempt for update;
  if not found then
    return false;
  end if;
  if p_retry_at is not null then
    update public.scheduled_task_runs r set status = 'retrying', detail = left(p_detail, 500) where r.id = p_run;
    update public.scheduled_tasks t set lease_until = p_retry_at, updated_at = now() where t.id = v_task;
    return true;
  end if;
  update public.scheduled_task_runs r
  set status = p_status, detail = left(p_detail, 500), conversation_id = p_conversation, message_id = p_message, finished_at = now()
  where r.id = p_run;
  update public.scheduled_tasks t
  set last_run_at = now(), last_status = p_status, runs_finished = t.runs_finished + 1,
      failures_in_row = case when p_status = 'done' then 0 else t.failures_in_row + 1 end,
      attempts = 0, lease_until = null, next_run_at = p_next_run_at,
      -- A task the person paused or removed while it ran stays as they left it.
      state = case when t.state <> 'active' then t.state when p_pause_reason is not null then 'paused' when p_next_run_at is null then 'ended' else 'active' end,
      state_reason = case when t.state <> 'active' then t.state_reason when p_pause_reason is not null then left(p_pause_reason, 300)
                          when p_next_run_at is null then 'Its schedule has finished.' else null end,
      updated_at = now()
  where t.id = v_task;
  return true;
end;
$$;

revoke all on function public.app_scheduled_task_save(uuid, uuid, uuid, integer, text, text, jsonb, jsonb, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.app_scheduled_task_state(uuid, uuid, uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.app_scheduled_task_run_now(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_scheduled_task_archive(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_scheduled_claim(integer) from public, anon, authenticated;
revoke all on function public.app_scheduled_task_conversation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_scheduled_run_finish(uuid, integer, text, text, uuid, uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.app_scheduled_task_save(uuid, uuid, uuid, integer, text, text, jsonb, jsonb, timestamptz, integer) to service_role;
grant execute on function public.app_scheduled_task_state(uuid, uuid, uuid, text, timestamptz, integer) to service_role;
grant execute on function public.app_scheduled_task_run_now(uuid, uuid, uuid) to service_role;
grant execute on function public.app_scheduled_task_archive(uuid, uuid, uuid) to service_role;
grant execute on function public.app_scheduled_claim(integer) to service_role;
grant execute on function public.app_scheduled_task_conversation(uuid, uuid) to service_role;
grant execute on function public.app_scheduled_run_finish(uuid, integer, text, text, uuid, uuid, timestamptz, timestamptz, text) to service_role;
