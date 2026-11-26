-- Farbaek schema v109: a link that starts a scheduled task or an agent from another app (stage 277, ADR 0284). Additions only,
-- nothing taken away.
--
-- A task runs at its times (v106). A link is the other way to start it: a call from another app, carrying a secret, queues one run
-- as "Run now" does, with a little text of the caller's as data for that run. Only the secret's hash is stored: the secret is shown
-- once, to the person who made the link. A task has one live link; making a new one stops the old.
--
-- Links are read by their owner, without the hash, and written only through the functions below, by the server.

-- The tables below are read every minute by the runner: a change that can't have its lock in five seconds gives up, to be run again.
set local lock_timeout = '5s';

create table public.scheduled_task_links (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.scheduled_tasks (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  -- SHA-256 of the secret, in hex. The secret itself is never stored.
  secret_hash  text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  -- The least time between two runs this link starts, from the owner's plan when the link was made: a plan that runs a task once a
  -- day at most doesn't run it more often through a link.
  min_seconds  integer not null check (min_seconds between 60 and 604800),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  uses         integer not null default 0 check (uses >= 0),
  revoked_at   timestamptz
);
create unique index scheduled_task_links_live on public.scheduled_task_links (task_id) where revoked_at is null;
create index scheduled_task_links_owner on public.scheduled_task_links (owner_id, org_id);

alter table public.scheduled_task_links enable row level security;
revoke all on public.scheduled_task_links from public, anon, authenticated, service_role;
grant select on public.scheduled_task_links to service_role;
-- The owner reads when a link was made and used, never its hash.
grant select (id, task_id, org_id, owner_id, min_seconds, created_at, last_used_at, uses, revoked_at) on public.scheduled_task_links to authenticated;
create policy "owners read their task links" on public.scheduled_task_links for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));

-- What the latest call to a task's link sent, and the due time of the one run it queued: it is that run's, and nobody else's.
alter table public.scheduled_tasks add column link_payload text check (link_payload is null or char_length(link_payload) <= 2000);
alter table public.scheduled_tasks add column link_due timestamptz;
-- On a run: that a call to the link started it, and what the call sent.
alter table public.scheduled_task_runs add column from_link boolean not null default false;
alter table public.scheduled_task_runs add column payload text check (payload is null or char_length(payload) <= 2000);

-- Makes a task's link, stopping the one it had and dropping anything the old one left waiting. The server makes the secret and
-- passes only its hash, with the least time between runs that the owner's plan allows.
create function public.app_scheduled_link_create(p_org uuid, p_actor uuid, p_task uuid, p_secret_hash text, p_min_seconds integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' or p_min_seconds is null or p_min_seconds not between 60 and 604800 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  -- The task's row first, then its links: the order every function here takes them in.
  perform 1 from public.scheduled_tasks t
  where t.id = p_task and t.org_id = p_org and t.owner_id = p_actor and t.archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.scheduled_task_links l set revoked_at = now() where l.task_id = p_task and l.revoked_at is null;
  update public.scheduled_tasks t set link_payload = null, link_due = null where t.id = p_task and (t.link_payload is not null or t.link_due is not null);
  insert into public.scheduled_task_links (task_id, org_id, owner_id, secret_hash, min_seconds) values (p_task, p_org, p_actor, p_secret_hash, p_min_seconds)
  returning scheduled_task_links.id into v_id;
  return v_id;
end;
$$;

-- Stops a task's link: a call with its secret is refused from now on, and anything it sent that hasn't run yet is dropped. Its
-- owner may always do this while they are in the workspace, whatever their role there has become and whatever the task's state:
-- stopping a link is never the thing to refuse.
create function public.app_scheduled_link_revoke(p_org uuid, p_actor uuid, p_task uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stopped boolean;
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform 1 from public.scheduled_tasks t where t.id = p_task and t.org_id = p_org and t.owner_id = p_actor for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.scheduled_task_links l set revoked_at = now() where l.task_id = p_task and l.revoked_at is null;
  v_stopped := found;
  update public.scheduled_tasks t set link_payload = null, link_due = null where t.id = p_task and (t.link_payload is not null or t.link_due is not null);
  return v_stopped;
end;
$$;

-- A call to a link. Queues one run of its task, as "Run now" does, and keeps what the caller sent for that run and no other.
--   'queued'    a run will start at the next tick
--   'unknown'   no such link, a stopped one, or the wrong secret: the same answer for each, so a caller learns nothing
--   'too_soon'  the link started a run less than its wait ago (the longer of p_min_seconds and the link's own)
--   'busy'      a run of the task is under way
--   'off'       the task is paused or ended, or its owner may no longer use AI here
create function public.app_scheduled_link_fire(p_link uuid, p_secret_hash text, p_payload text, p_min_seconds integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.scheduled_task_links%rowtype;
  v_wait interval;
begin
  if p_link is null or p_secret_hash is null or p_min_seconds is null or p_min_seconds < 0 then
    return 'unknown';
  end if;
  -- Read without a lock first: a call with the wrong secret takes no lock and writes nothing.
  select * into v_link from public.scheduled_task_links l where l.id = p_link;
  if not found or v_link.revoked_at is not null or v_link.secret_hash <> p_secret_hash then
    return 'unknown';
  end if;
  -- The task's row, then the link's, as making and stopping a link take them: two of these at once can't wait on each other.
  perform 1 from public.scheduled_tasks t where t.id = v_link.task_id for update;
  select * into v_link from public.scheduled_task_links l where l.id = p_link for update;
  if not found or v_link.revoked_at is not null or v_link.secret_hash <> p_secret_hash then
    return 'unknown';
  end if;
  v_wait := make_interval(secs => greatest(p_min_seconds, v_link.min_seconds));
  if v_link.last_used_at is not null and v_link.last_used_at > now() - v_wait then
    return 'too_soon';
  end if;
  -- As the task's owner, through "Run now" itself: every check it makes holds here too.
  begin
    perform public.app_scheduled_task_run_now(v_link.org_id, v_link.owner_id, v_link.task_id);
  exception
    when sqlstate 'P0001' then
      return case when sqlerrm = 'BUSY' then 'busy' else 'off' end;
    when insufficient_privilege then
      return 'off';
  end;
  -- What was sent belongs to the run just queued: the one whose due time is the task's next time now.
  update public.scheduled_tasks t
  set link_payload = nullif(left(btrim(coalesce(p_payload, '')), 2000), ''), link_due = t.next_run_at
  where t.id = v_link.task_id;
  update public.scheduled_task_links l set last_used_at = now(), uses = l.uses + 1 where l.id = p_link;
  return 'queued';
end;
$$;

-- What the caller of the task's link sent for this run, for the runner, which asks for every run. A call's text is given to the
-- run it queued (the run due at the time the call set) and to no other: asked a second time, for another try of the same run, the
-- answer is the same. What a call left for a run that never came (the task was paused before it started, or it was passed over)
-- is dropped when a later run asks, so it can't turn up in a run the owner starts days afterwards. Null when there is none.
create function public.app_scheduled_run_payload(p_run uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task uuid;
  v_run_due timestamptz;
  v_from_link boolean;
  v_payload text;
  v_waiting text;
  v_due timestamptz;
begin
  select r.task_id into v_task from public.scheduled_task_runs r where r.id = p_run;
  if not found then
    return null;
  end if;
  -- The task's row is locked before the run's, as everywhere else that takes both (v106).
  select t.link_payload, t.link_due into v_waiting, v_due from public.scheduled_tasks t where t.id = v_task for update;
  select r.due_at, r.from_link, r.payload into v_run_due, v_from_link, v_payload from public.scheduled_task_runs r where r.id = p_run for update;
  if v_from_link then
    return v_payload;
  end if;
  if v_due is null then
    return null;
  end if;
  if v_due = v_run_due then
    update public.scheduled_task_runs r set from_link = true, payload = v_waiting where r.id = p_run;
    update public.scheduled_tasks t set link_payload = null, link_due = null where t.id = v_task;
    return v_waiting;
  end if;
  if v_due < v_run_due then
    update public.scheduled_tasks t set link_payload = null, link_due = null where t.id = v_task;
  end if;
  return null;
end;
$$;

revoke all on function public.app_scheduled_link_create(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.app_scheduled_link_revoke(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_scheduled_link_fire(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.app_scheduled_run_payload(uuid) from public, anon, authenticated;
grant execute on function public.app_scheduled_link_create(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.app_scheduled_link_revoke(uuid, uuid, uuid) to service_role;
grant execute on function public.app_scheduled_link_fire(uuid, text, text, integer) to service_role;
grant execute on function public.app_scheduled_run_payload(uuid) to service_role;
