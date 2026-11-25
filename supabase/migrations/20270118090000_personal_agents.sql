-- Farbaek schema v108: agents, helpers that keep working toward a goal (stage 275, ADR 0282). Additions only, nothing taken away.
--
-- An agent is a name, a goal and a limit a person gave. One scheduled task does its work (v106): the task carries the schedule, the
-- runs, the pause and the chat; the agent carries who it is and what it is for. Each finished run leaves a short note of what it
-- did and what it will do next, and the next run is given the latest of them: the agent's own memory, which the person can read and
-- clear.
--
-- The table is personal_agents: "agents" is taken by the desktop agents a person pairs with their computer (migration 14), which
-- are a different thing.
--
-- Agents are read by their owner (row-level security) and written only through the functions below, by the server.

-- The tables below are read every minute by the runner: a change that can't have its lock in five seconds gives up, to be run again.
set local lock_timeout = '5s';

create table public.personal_agents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  goal        text not null check (char_length(goal) between 1 and 2000),
  -- Its limit: the most runs it may make in any 30 days, whatever its schedule says and however often "Work now" is pressed.
  runs_limit  integer not null check (runs_limit between 1 and 750),
  -- Whether its runs are given what the person asked Farbaek to remember (Chat's memory, v101).
  use_memory  boolean not null default true,
  -- Notes from runs that started before this are no longer given to it: the person cleared them.
  notes_from  timestamptz,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index personal_agents_owner on public.personal_agents (owner_id, org_id, created_at desc) where archived_at is null;

alter table public.personal_agents enable row level security;
revoke all on public.personal_agents from public, anon, authenticated, service_role;
grant select on public.personal_agents to authenticated, service_role;
create policy "owners read their personal agents" on public.personal_agents for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));

-- The task that does an agent's work. One for each agent.
alter table public.scheduled_tasks add column personal_agent_id uuid references public.personal_agents (id) on delete cascade;
create unique index scheduled_tasks_personal_agent on public.scheduled_tasks (personal_agent_id) where personal_agent_id is not null and archived_at is null;

-- What a finished run of an agent did and what it will do next, in the answer's own opening and closing words.
alter table public.scheduled_task_runs add column note text check (note is null or char_length(note) <= 700);

-- A new agent (p_agent null) with the task that does its work, or a change to both from the version on screen. The task is saved by
-- the scheduled tasks' own function, so its checks hold here too: the plan's limit on active tasks, and a run under way left alone.
-- p_max_agents is the plan's limit on agents, passed by the server.
create function public.app_personal_agent_save(
  p_org uuid, p_actor uuid, p_agent uuid, p_base_version integer, p_name text, p_goal text, p_runs_limit integer, p_use_memory boolean,
  p_schedule jsonb, p_options jsonb, p_next_run_at timestamptz, p_max_active integer, p_max_agents integer
)
returns table (id uuid, task_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_agent uuid;
  v_task uuid;
  v_task_version integer;
  v_version integer;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 or p_goal is null or char_length(btrim(p_goal)) not between 1 and 2000
     or p_runs_limit is null or p_runs_limit not between 1 and 750 or p_use_memory is null or p_max_agents is null or p_max_agents < 0 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  perform private.scheduled_one_at_a_time(p_org, p_actor);
  if p_agent is null then
    -- Agents that have their work: one left without a task shows nowhere, and mustn't hold a place nobody can free.
    if (select count(*) from public.personal_agents a
        where a.org_id = p_org and a.owner_id = p_actor and a.archived_at is null
          and exists (select 1 from public.scheduled_tasks t where t.personal_agent_id = a.id and t.archived_at is null)) >= p_max_agents then
      raise exception 'AGENT_LIMIT' using errcode = 'P0001';
    end if;
    insert into public.personal_agents (org_id, owner_id, name, goal, runs_limit, use_memory)
    values (p_org, p_actor, btrim(p_name), btrim(p_goal), p_runs_limit, p_use_memory)
    returning personal_agents.id, personal_agents.version into v_agent, v_version;
    select s.id into v_task
    from public.app_scheduled_task_save(p_org, p_actor, null, null, btrim(p_name), btrim(p_goal), p_schedule, p_options, p_next_run_at, p_max_active) s;
    update public.scheduled_tasks t set personal_agent_id = v_agent where t.id = v_task;
    return query select v_agent, v_task, v_version;
    return;
  end if;
  select a.version into v_version from public.personal_agents a
  where a.id = p_agent and a.org_id = p_org and a.owner_id = p_actor and a.archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_base_version is distinct from v_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  select t.id, t.version into v_task, v_task_version from public.scheduled_tasks t
  where t.personal_agent_id = p_agent and t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform public.app_scheduled_task_save(p_org, p_actor, v_task, v_task_version, btrim(p_name), btrim(p_goal), p_schedule, p_options, p_next_run_at, p_max_active);
  update public.personal_agents a
  set name = btrim(p_name), goal = btrim(p_goal), runs_limit = p_runs_limit, use_memory = p_use_memory, version = a.version + 1, updated_at = now()
  where a.id = p_agent;
  return query select p_agent, v_task, v_version + 1;
end;
$$;

-- Removes an agent and stops its work. Its past answers stay in Chat.
create function public.app_personal_agent_archive(p_org uuid, p_actor uuid, p_agent uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  perform 1 from public.personal_agents a where a.id = p_agent and a.org_id = p_org and a.owner_id = p_actor and a.archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  for v_task in select t.id from public.scheduled_tasks t where t.personal_agent_id = p_agent and t.archived_at is null loop
    perform public.app_scheduled_task_archive(p_org, p_actor, v_task);
  end loop;
  update public.personal_agents a set archived_at = now(), updated_at = now() where a.id = p_agent;
end;
$$;

-- Clears what an agent remembers of its earlier runs: a fresh start. The notes stay on the runs for the person to read and are no
-- longer given to it, and its next run begins a new chat rather than carry on the one that holds its earlier answers (see new_chat
-- below). The old chat stays in Chat.
create function public.app_personal_agent_notes_clear(p_org uuid, p_actor uuid, p_agent uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  update public.personal_agents a set notes_from = now(), updated_at = now()
  where a.id = p_agent and a.org_id = p_org and a.owner_id = p_actor and a.archived_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- What the runner needs to run an agent's task. Null when the task isn't an agent's; an agent that has been removed is still
-- answered for, marked archived, so its task is never run as if it were no agent's.
--
--   runs_in_30_days  Runs that made a turn (a message was begun), finished or not, due in the last 30 days less half a day. The half
--                    day keeps a run from being held up by the one made at the same time 30 days before, whichever was claimed
--                    first in its minute, and through a clock change. A retried run is one row, so it is counted once.
--   told_limit       Whether a run has already been passed over for the limit since the last run that made a turn: the person
--                    is told once for each stretch at the limit.
--   new_chat         Whether the task's chat was begun before the notes were last cleared. Such a chat isn't carried on: clearing
--                    is a fresh start, and the earlier answers a run would read there are part of what was cleared.
--   notes            The latest eight, newest first, from runs that started after the notes were last cleared.
create function public.app_personal_agent_run_context(p_task uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'agent_id', a.id, 'name', a.name, 'goal', a.goal, 'runs_limit', a.runs_limit, 'use_memory', a.use_memory,
    'archived', a.archived_at is not null,
    'runs_in_30_days', (
      select count(*) from public.scheduled_task_runs r
      where r.task_id = t.id and r.status in ('done', 'failed') and r.message_id is not null and r.due_at > now() - interval '708 hours'),
    'told_limit', exists (
      select 1 from public.scheduled_task_runs s
      where s.task_id = t.id and s.status = 'skipped' and s.detail like '%which is its limit%'
        and s.due_at > coalesce((
          select max(r.due_at) from public.scheduled_task_runs r
          where r.task_id = t.id and r.status in ('done', 'failed') and r.message_id is not null), '-infinity'::timestamptz)),
    'new_chat', a.notes_from is not null and exists (
      select 1 from public.chat_conversations c where c.id = t.conversation_id and c.created_at < a.notes_from),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('at', n.due_at, 'note', n.note) order by n.due_at desc)
      from (
        select r.due_at, r.note from public.scheduled_task_runs r
        where r.task_id = t.id and r.status = 'done' and r.note is not null and (a.notes_from is null or r.started_at > a.notes_from)
        order by r.due_at desc limit 8
      ) n), '[]'::jsonb))
  from public.scheduled_tasks t join public.personal_agents a on a.id = t.personal_agent_id
  where t.id = p_task;
$$;

-- Keeps what a finished run did, for the agent's next run and for the person to read. Only a run that finished has one.
create function public.app_scheduled_run_note(p_run uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_note is null or char_length(btrim(p_note)) = 0 then
    return false;
  end if;
  update public.scheduled_task_runs r set note = left(btrim(p_note), 700) where r.id = p_run and r.status = 'done';
  return found;
end;
$$;

-- When a person leaves a workspace, their agents there go with them, as their scheduled tasks do (v106).
create function private.personal_agents_of_departed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.personal_agents where org_id = old.org_id and owner_id = old.user_id;
  return old;
end;
$$;
revoke all on function private.personal_agents_of_departed() from public, anon, authenticated;
create trigger personal_agents_leave_with_member after delete on public.organization_members
  for each row execute function private.personal_agents_of_departed();

-- A person's own agents, for the download of their data (Settings, "Download my data"), with the notes each has kept.
create function public.app_personal_agents_export(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', a.name, 'goal', a.goal, 'runs_limit', a.runs_limit, 'use_memory', a.use_memory, 'workspace', o.name, 'created_at', a.created_at,
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('at', r.due_at, 'note', r.note) order by r.due_at)
      from public.scheduled_task_runs r join public.scheduled_tasks t on t.id = r.task_id
      where t.personal_agent_id = a.id and r.note is not null), '[]'::jsonb)) order by a.created_at), '[]'::jsonb)
  from public.personal_agents a
    join public.organizations o on o.id = a.org_id
    join public.organization_members om on om.org_id = a.org_id and om.user_id = p_user
  where a.owner_id = p_user and a.archived_at is null;
$$;

revoke all on function public.app_personal_agent_save(uuid, uuid, uuid, integer, text, text, integer, boolean, jsonb, jsonb, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.app_personal_agent_archive(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_personal_agent_notes_clear(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_personal_agent_run_context(uuid) from public, anon, authenticated;
revoke all on function public.app_scheduled_run_note(uuid, text) from public, anon, authenticated;
revoke all on function public.app_personal_agents_export(uuid) from public, anon, authenticated;
grant execute on function public.app_personal_agent_save(uuid, uuid, uuid, integer, text, text, integer, boolean, jsonb, jsonb, timestamptz, integer, integer) to service_role;
grant execute on function public.app_personal_agent_archive(uuid, uuid, uuid) to service_role;
grant execute on function public.app_personal_agent_notes_clear(uuid, uuid, uuid) to service_role;
grant execute on function public.app_personal_agent_run_context(uuid) to service_role;
grant execute on function public.app_scheduled_run_note(uuid, text) to service_role;
grant execute on function public.app_personal_agents_export(uuid) to service_role;
