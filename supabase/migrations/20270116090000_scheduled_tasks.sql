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
  -- While a run the person started by hand holds next_run_at: the schedule's own next time, put back when that run is finished.
  resume_at       timestamptz,
  -- While a run holds it, and after a failed try, until when it may not be claimed again.
  lease_until     timestamptz,
  -- Tries at the due time it is on now.
  attempts        integer not null default 0 check (attempts >= 0),
  -- The schedule's due times finished, whatever the outcome: what "ends after N runs" counts. A run started by hand isn't one.
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
  -- Started by the person with Run now, apart from the schedule.
  manual          boolean not null default false,
  -- What happened, in a sentence, when it didn't simply finish.
  detail          text check (detail is null or char_length(detail) <= 500),
  conversation_id uuid,
  message_id      uuid,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  constraint scheduled_task_runs_slot unique (task_id, due_at)
);

create index scheduled_task_runs_task on public.scheduled_task_runs (task_id, due_at desc);
create index scheduled_task_runs_owner on public.scheduled_task_runs (owner_id, org_id, due_at desc);
create index scheduled_task_runs_finished on public.scheduled_task_runs (finished_at);

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

-- One change to a person's scheduled tasks at a time: their membership row is locked until the change is committed, so two
-- saves or resumes sent together can't both pass a count made before either was written.
create function private.scheduled_one_at_a_time(p_org uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor for update;
end;
$$;
revoke all on function private.scheduled_one_at_a_time(uuid, uuid) from public, anon, authenticated;

-- Whether a run of the task is under way now: it holds the lease, which a change to the task must leave alone.
create function private.scheduled_running(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.scheduled_tasks t join public.scheduled_task_runs r on r.task_id = t.id
    where t.id = p_task and t.lease_until is not null and t.lease_until > now() and r.status = 'running'
  );
$$;
revoke all on function private.scheduled_running(uuid) from public, anon, authenticated;

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
  v_resume timestamptz;
  v_running boolean;
  v_by_hand boolean;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 or p_instruction is null or char_length(btrim(p_instruction)) not between 1 and 4000
     or p_schedule is null or jsonb_typeof(p_schedule) <> 'object' or p_options is null or jsonb_typeof(p_options) <> 'object' or p_max_active is null or p_max_active < 0 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  perform private.scheduled_one_at_a_time(p_org, p_actor);
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
  select t.version, t.state, t.resume_at into v_version, v_state, v_resume from public.scheduled_tasks t
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
  v_running := private.scheduled_running(p_task);
  -- A run the person started by hand, waiting or under way, keeps its place: the new schedule's next time waits behind it.
  v_by_hand := v_resume is not null and v_state = 'active' and p_next_run_at is not null;
  if not v_by_hand then
    -- A try that was waiting to be made again belongs to the schedule as it was; a run whose server stopped is closed with it.
    update public.scheduled_task_runs r
    set status = 'failed', finished_at = now(),
        detail = case when r.status = 'retrying' then 'Its schedule was changed before it was tried again.' else 'It was cut off before it finished.' end
    where r.task_id = p_task and (r.status = 'retrying' or (r.status = 'running' and not v_running));
  end if;
  update public.scheduled_tasks t
  set title = btrim(p_title), instruction = btrim(p_instruction), schedule = p_schedule, options = p_options,
      next_run_at = case when v_by_hand then t.next_run_at else p_next_run_at end,
      resume_at = case when v_by_hand then p_next_run_at else null end,
      -- A run under way keeps its lease, so nothing else is started beside it; it finds the task moved on and leaves it be.
      attempts = case when v_running or v_by_hand then t.attempts else 0 end,
      lease_until = case when v_running or v_by_hand then t.lease_until else null end,
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
  v_running boolean;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_state not in ('active', 'paused') then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  perform private.scheduled_one_at_a_time(p_org, p_actor);
  select t.state into v_state from public.scheduled_tasks t
  where t.id = p_task and t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_state = 'paused' then
    v_running := private.scheduled_running(p_task);
    update public.scheduled_tasks t set state = 'paused', state_reason = null, updated_at = now() where t.id = p_task and t.state = 'active';
    if found then
      -- A try waiting to be made again won't be; a run whose server stopped is closed. One under way finishes and says so itself.
      update public.scheduled_task_runs r
      set status = 'failed', finished_at = now(),
          detail = case when r.status = 'retrying' then 'Paused before it was tried again.' else 'It was cut off before it finished.' end
      where r.task_id = p_task and (r.status = 'retrying' or (r.status = 'running' and not v_running));
    end if;
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
  v_running := private.scheduled_running(p_task);
  update public.scheduled_tasks t
  set state = 'active', state_reason = null, next_run_at = p_next_run_at, resume_at = null, failures_in_row = 0,
      attempts = case when v_running then t.attempts else 0 end,
      lease_until = case when v_running then t.lease_until else null end,
      updated_at = now()
  where t.id = p_task;
end;
$$;

-- Run an active task once at the next tick, apart from its schedule: the schedule's own next time is kept and put back afterwards,
-- and the run isn't counted as one of the schedule's. A try that is waiting to be made again is made now instead.
create function public.app_scheduled_task_run_now(p_org uuid, p_actor uuid, p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_next timestamptz;
begin
  perform private.require_contributor(p_org, p_actor);
  select t.state, t.next_run_at into v_state, v_next from public.scheduled_tasks t
  where t.id = p_task and t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null for update;
  if not found or v_state <> 'active' then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if private.scheduled_running(p_task) then
    raise exception 'BUSY' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.scheduled_task_runs r where r.task_id = p_task and r.status = 'retrying' and r.due_at = v_next) then
    update public.scheduled_tasks t set lease_until = null, updated_at = now() where t.id = p_task;
    return;
  end if;
  update public.scheduled_tasks t
  set resume_at = coalesce(t.resume_at, t.next_run_at), next_run_at = now(), attempts = 0, lease_until = null, updated_at = now()
  where t.id = p_task;
end;
$$;

-- Removes a task from the list. Its past answers stay in Chat.
create function public.app_scheduled_task_archive(p_org uuid, p_actor uuid, p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_running boolean;
begin
  perform private.require_contributor(p_org, p_actor);
  v_running := private.scheduled_running(p_task);
  update public.scheduled_tasks t
  set archived_at = now(), state = 'ended', state_reason = null, next_run_at = null, resume_at = null, updated_at = now()
  where t.id = p_task and t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.scheduled_task_runs r
  set status = 'failed', finished_at = now(),
      detail = case when r.status = 'retrying' then 'Removed before it was tried again.' else 'It was cut off before it finished.' end
  where r.task_id = p_task and (r.status = 'retrying' or (r.status = 'running' and not v_running));
end;
$$;

-- Claims tasks that are due, for the server's runner: each gets a 15-minute lease and its run's row for this due time. A task whose
-- runner died is claimed again when the lease runs out, as another try at the same due time, never a second run of it.
create function public.app_scheduled_claim(p_limit integer)
returns table (
  run_id uuid, task_id uuid, org_id uuid, owner_id uuid, title text, instruction text, schedule jsonb, options jsonb, conversation_id uuid,
  due_at timestamptz, attempt integer, runs_finished integer, failures_in_row integer, manual boolean
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
    select t.id, t.org_id, t.owner_id, t.title, t.instruction, t.schedule, t.options, t.conversation_id, t.next_run_at, t.resume_at, t.attempts, t.runs_finished, t.failures_in_row
    from public.scheduled_tasks t
    where t.state = 'active' and t.archived_at is null and t.next_run_at <= now() and (t.lease_until is null or t.lease_until <= now())
    order by t.next_run_at
    limit greatest(1, least(coalesce(p_limit, 3), 10))
    for update skip locked
  loop
    update public.scheduled_tasks t set lease_until = now() + interval '15 minutes', attempts = t.attempts + 1 where t.id = v.id;
    -- A run of another due time that never said how it ended (its server stopped, and the task has moved on) is closed here.
    update public.scheduled_task_runs r
    set status = 'failed', detail = 'It was cut off before it finished.', finished_at = now()
    where r.task_id = v.id and r.status in ('running', 'retrying') and r.due_at <> v.next_run_at;
    insert into public.scheduled_task_runs as r (task_id, org_id, owner_id, due_at, status, attempt, manual)
    values (v.id, v.org_id, v.owner_id, v.next_run_at, 'running', v.attempts + 1, v.resume_at is not null)
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
    manual := v.resume_at is not null;
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
-- due time is finished (done, failed or skipped): the task moves to p_next_run_at, or ends when there is none, or is paused with a
-- reason. p_failures is the task's count of due times in a row that didn't finish, after this one.
-- p_attempt is the try reporting: an older try that was given up on (its lease ran out and the task was claimed again) changes nothing.
-- A task whose owner changed its schedule or removed it while this ran has moved on: the run is recorded and the task left as it is.
create function public.app_scheduled_run_finish(
  p_run uuid, p_attempt integer, p_status text, p_detail text, p_conversation uuid, p_message uuid,
  p_next_run_at timestamptz, p_retry_at timestamptz, p_pause_reason text, p_failures integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task uuid;
  v_due timestamptz;
  v_manual boolean;
  v_next timestamptz;
  v_state text;
  v_current boolean;
  v_status text;
begin
  if p_status not in ('done', 'failed', 'skipped') then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  -- The task's row is locked before the run's, the order every function here takes them in.
  select r.task_id into v_task from public.scheduled_task_runs r where r.id = p_run;
  if not found then
    return false;
  end if;
  select t.next_run_at, t.state into v_next, v_state from public.scheduled_tasks t where t.id = v_task for update;
  select r.due_at, r.manual into v_due, v_manual from public.scheduled_task_runs r
  where r.id = p_run and r.status = 'running' and r.attempt = p_attempt for update;
  if not found then
    return false;
  end if;
  v_current := v_next is not distinct from v_due;
  if p_retry_at is not null and v_current and v_state = 'active' then
    update public.scheduled_task_runs r set status = 'retrying', detail = left(p_detail, 500) where r.id = p_run;
    update public.scheduled_tasks t set lease_until = p_retry_at, updated_at = now() where t.id = v_task;
    return true;
  end if;
  -- A try that would have been made again, on a task that has been paused or moved on, ends here as failed.
  v_status := case when p_retry_at is not null then 'failed' else p_status end;
  update public.scheduled_task_runs r
  set status = v_status, detail = left(p_detail, 500), conversation_id = p_conversation, message_id = p_message, finished_at = now()
  where r.id = p_run;
  if not v_current then
    update public.scheduled_tasks t
    set last_run_at = now(), last_status = v_status, attempts = 0, lease_until = null, updated_at = now()
    where t.id = v_task;
    return true;
  end if;
  update public.scheduled_tasks t
  set last_run_at = now(), last_status = v_status,
      runs_finished = case when v_manual then t.runs_finished else t.runs_finished + 1 end,
      failures_in_row = greatest(0, coalesce(p_failures, 0)),
      attempts = 0, lease_until = null,
      -- A run started by hand gives the schedule its own next time back.
      next_run_at = case when v_manual then t.resume_at else p_next_run_at end,
      resume_at = null,
      -- A task the person paused while it ran stays as they left it.
      state = case when t.state <> 'active' then t.state when p_pause_reason is not null then 'paused'
                   when (case when v_manual then t.resume_at else p_next_run_at end) is null then 'ended' else 'active' end,
      state_reason = case when t.state <> 'active' then t.state_reason when p_pause_reason is not null then left(p_pause_reason, 300)
                          when (case when v_manual then t.resume_at else p_next_run_at end) is null then 'Its schedule has finished.' else null end,
      updated_at = now()
  where t.id = v_task;
  return true;
end;
$$;

-- Someone who leaves a workspace takes their scheduled tasks there with them: nothing keeps running in a place they can't see.
create function private.scheduled_tasks_of_departed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.scheduled_tasks where org_id = old.org_id and owner_id = old.user_id;
  return old;
end;
$$;
revoke all on function private.scheduled_tasks_of_departed() from public, anon, authenticated;
create trigger scheduled_tasks_leave_with_member after delete on public.organization_members
  for each row execute function private.scheduled_tasks_of_departed();

revoke all on function public.app_scheduled_task_save(uuid, uuid, uuid, integer, text, text, jsonb, jsonb, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.app_scheduled_task_state(uuid, uuid, uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.app_scheduled_task_run_now(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_scheduled_task_archive(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_scheduled_claim(integer) from public, anon, authenticated;
revoke all on function public.app_scheduled_task_conversation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_scheduled_run_finish(uuid, integer, text, text, uuid, uuid, timestamptz, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.app_scheduled_task_save(uuid, uuid, uuid, integer, text, text, jsonb, jsonb, timestamptz, integer) to service_role;
grant execute on function public.app_scheduled_task_state(uuid, uuid, uuid, text, timestamptz, integer) to service_role;
grant execute on function public.app_scheduled_task_run_now(uuid, uuid, uuid) to service_role;
grant execute on function public.app_scheduled_task_archive(uuid, uuid, uuid) to service_role;
grant execute on function public.app_scheduled_claim(integer) to service_role;
grant execute on function public.app_scheduled_task_conversation(uuid, uuid) to service_role;
grant execute on function public.app_scheduled_run_finish(uuid, integer, text, text, uuid, uuid, timestamptz, timestamptz, text, integer) to service_role;

-- A person's own scheduled tasks, for the download of their data (Settings, "Download my data"): what they wrote and when it
-- runs, in the workspaces they still belong to. Removed tasks are gone from it, as they are from the page.
create function public.app_scheduled_tasks_export(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'title', t.title, 'instruction', t.instruction, 'schedule', t.schedule, 'options', t.options, 'state', t.state,
    'workspace', o.name, 'created_at', t.created_at, 'runs_finished', t.runs_finished, 'last_run_at', t.last_run_at) order by t.created_at), '[]'::jsonb)
  from public.scheduled_tasks t
    join public.organizations o on o.id = t.org_id
    join public.organization_members om on om.org_id = t.org_id and om.user_id = p_user
  where t.owner_id = p_user and t.archived_at is null;
$$;
revoke all on function public.app_scheduled_tasks_export(uuid) from public, anon, authenticated;
grant execute on function public.app_scheduled_tasks_export(uuid) to service_role;
