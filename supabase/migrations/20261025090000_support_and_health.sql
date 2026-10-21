-- Farbaek schema v23: support requests and system health (ADR 0032, phase 4).
--
-- People write to Farbaek from the app and staff answer from Office Space.
-- A request belongs to the person who wrote it; staff identity and internal
-- notes never reach them. Support tables carry no activity guard, so a
-- suspended workspace or a paused platform can still reach Farbaek. The
-- health function reads the platform's state in one call for the office.

create table public.support_threads (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references auth.users (id) on delete cascade,
  org_id            uuid references public.organizations (id) on delete set null,
  topic             text not null check (topic in ('not_working', 'billing', 'account', 'abuse', 'other')),
  subject           text not null check (char_length(subject) between 3 and 120),
  status            text not null default 'waiting_on_farbaek' check (status in ('waiting_on_farbaek', 'waiting_on_you', 'closed')),
  assigned_to       uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_customer_at  timestamptz not null default now(),
  last_staff_at     timestamptz,
  customer_seen_at  timestamptz,
  closed_at         timestamptz,
  check ((status = 'closed') = (closed_at is not null))
);
create index support_threads_author on public.support_threads (author_id, updated_at desc);
create index support_threads_queue on public.support_threads (status, last_customer_at);

create table public.support_messages (
  id          bigint generated always as identity primary key,
  thread_id   uuid not null references public.support_threads (id) on delete cascade,
  from_staff  boolean not null,
  author_id   uuid references auth.users (id) on delete set null,
  internal    boolean not null default false check (not internal or from_staff),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index support_messages_thread on public.support_messages (thread_id, id);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_threads, public.support_messages from public, anon, authenticated, service_role;
grant select on public.support_threads, public.support_messages to service_role;
-- People read their own requests, without who on Farbaek's staff handled them.
grant select (id, author_id, org_id, topic, subject, status, created_at, updated_at, last_customer_at, last_staff_at, customer_seen_at, closed_at) on public.support_threads to authenticated;
grant select (id, thread_id, from_staff, body, created_at) on public.support_messages to authenticated;
create policy "people read their own support requests" on public.support_threads for select to authenticated
  using (author_id = (select auth.uid()));
create policy "people read the replies on their requests, never internal notes" on public.support_messages for select to authenticated
  using (not internal and exists (select 1 from public.support_threads t where t.id = thread_id and t.author_id = (select auth.uid())));

-- ------------------------------------------------------------------ helpers

create function private.require_support_body(p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_body, ''));
begin
  if char_length(v) not between 1 and 4000 then
    raise exception 'INVALID_SUPPORT' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function private.require_support_body(text) from public;

-- The permission matrix gains support (mirrors PERMISSIONS in src/core/office/permissions.ts).
create or replace function private.staff_can(p_role text, p_action text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case p_action
    when 'console.read'          then p_role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')
    when 'people.read_email'     then p_role in ('owner', 'admin', 'support', 'trust_safety')
    when 'audit.read_all'        then p_role in ('owner', 'admin', 'viewer')
    when 'audit.verify'          then p_role in ('owner', 'admin')
    when 'staff.read'            then p_role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')
    when 'staff.manage'          then p_role in ('owner')
    when 'workspace.suspend'     then p_role in ('owner', 'admin', 'trust_safety')
    when 'site.block'            then p_role in ('owner', 'admin', 'trust_safety')
    when 'usage.add'             then p_role in ('owner', 'admin')
    when 'trial.extend'          then p_role in ('owner', 'admin', 'support')
    when 'flags.set'             then p_role in ('owner')
    when 'announcements.manage'  then p_role in ('owner', 'admin')
    when 'support.read'          then p_role in ('owner', 'admin', 'support', 'trust_safety')
    when 'support.reply'         then p_role in ('owner', 'admin', 'support', 'trust_safety')
    else false
  end, false);
$$;

-- ------------------------------------------------------------------ people

-- Opens a request. A workspace, if given, must be one the person belongs to,
-- in any role and even while it's suspended. Five new requests a day each.
create function public.app_support_open(p_actor uuid, p_org uuid, p_topic text, p_subject text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := private.require_support_body(p_body);
  v_id uuid;
begin
  if p_topic is null or p_topic not in ('not_working', 'billing', 'account', 'abuse', 'other') or char_length(v_subject) not between 3 and 120 then
    raise exception 'INVALID_SUPPORT' using errcode = 'P0001';
  end if;
  if p_org is not null and not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.app_rate_limit('support-open:' || p_actor::text, 86400, 5) then
    raise exception 'SUPPORT_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.support_threads (author_id, org_id, topic, subject) values (p_actor, p_org, p_topic, v_subject) returning id into v_id;
  insert into public.support_messages (thread_id, from_staff, author_id, body) values (v_id, false, p_actor, v_body);
  return v_id;
end;
$$;

-- The author writes again. A closed request opens again. Thirty messages an hour each.
create function public.app_support_reply(p_actor uuid, p_thread uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := private.require_support_body(p_body);
begin
  perform 1 from public.support_threads t where t.id = p_thread and t.author_id = p_actor for update;
  if not found then
    raise exception 'THREAD_MISSING' using errcode = 'P0001';
  end if;
  if not public.app_rate_limit('support-reply:' || p_actor::text, 3600, 30) then
    raise exception 'SUPPORT_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.support_messages (thread_id, from_staff, author_id, body) values (p_thread, false, p_actor, v_body);
  update public.support_threads
    set status = 'waiting_on_farbaek', closed_at = null, last_customer_at = now(), customer_seen_at = now(), updated_at = now()
    where id = p_thread;
end;
$$;

create function public.app_support_close(p_actor uuid, p_thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_threads set status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
    where id = p_thread and author_id = p_actor;
  if not found then
    raise exception 'THREAD_MISSING' using errcode = 'P0001';
  end if;
end;
$$;

create function public.app_support_mark_seen(p_actor uuid, p_thread uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.support_threads set customer_seen_at = now() where id = p_thread and author_id = p_actor;
$$;

-- ------------------------------------------------------------------ staff

-- A reply the person sees, or an internal note only staff see. The event
-- records that it happened, never what it said.
create function public.app_staff_support_reply(p_actor uuid, p_session uuid, p_thread uuid, p_body text, p_internal boolean, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'support.reply');
  v_body text := private.require_support_body(p_body);
  v_org uuid;
begin
  select t.org_id into v_org from public.support_threads t where t.id = p_thread for update;
  if not found then
    raise exception 'THREAD_MISSING' using errcode = 'P0001';
  end if;
  insert into public.support_messages (thread_id, from_staff, author_id, internal, body) values (p_thread, true, p_actor, coalesce(p_internal, false), v_body);
  if not coalesce(p_internal, false) then
    update public.support_threads
      set status = 'waiting_on_you', closed_at = null, last_staff_at = now(), updated_at = now(), assigned_to = coalesce(assigned_to, p_actor)
      where id = p_thread;
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', case when coalesce(p_internal, false) then 'support.noted' else 'support.replied' end,
    'support_thread', p_thread::text, v_org, null, null, 'success', jsonb_build_object('chars', char_length(v_body)), p_ip_hash, p_ua, null);
end;
$$;

create function public.app_staff_support_update(p_actor uuid, p_session uuid, p_thread uuid, p_action text, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'support.reply');
  v_t record;
begin
  if p_action is null or p_action not in ('assign_me', 'unassign', 'close', 'reopen') then
    raise exception 'INVALID_SUPPORT' using errcode = 'P0001';
  end if;
  select t.org_id, t.status into v_t from public.support_threads t where t.id = p_thread for update;
  if not found then
    raise exception 'THREAD_MISSING' using errcode = 'P0001';
  end if;
  if p_action = 'assign_me' then
    update public.support_threads set assigned_to = p_actor, updated_at = now() where id = p_thread;
  elsif p_action = 'unassign' then
    update public.support_threads set assigned_to = null, updated_at = now() where id = p_thread;
  elsif p_action = 'close' then
    update public.support_threads set status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now() where id = p_thread;
  else
    update public.support_threads set status = 'waiting_on_farbaek', closed_at = null, updated_at = now() where id = p_thread;
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'support.' || case p_action when 'assign_me' then 'assigned' when 'unassign' then 'unassigned' when 'close' then 'closed' else 'reopened' end,
    'support_thread', p_thread::text, v_t.org_id, null, null, 'success', jsonb_build_object('from', v_t.status), p_ip_hash, p_ua, null);
end;
$$;

-- Office Space's support queue: one status (and only abuse reports if asked),
-- with the author's email, the workspace and the assignee, newest wait first.
create function public.app_office_support_queue(p_status text, p_abuse_only boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.waiting_since asc), '[]'::jsonb)
  from (
    select t.id, t.subject, t.topic, t.status, t.org_id as "orgId", o.name as workspace, u.email,
      t.assigned_to as "assignedTo", sm.email as "assignedEmail",
      case t.status when 'waiting_on_farbaek' then t.last_customer_at when 'waiting_on_you' then coalesce(t.last_staff_at, t.updated_at) else coalesce(t.closed_at, t.updated_at) end as waiting_since,
      (select count(*) from public.support_messages m where m.thread_id = t.id and not m.internal) as messages
    from public.support_threads t
    left join public.organizations o on o.id = t.org_id
    left join auth.users u on u.id = t.author_id
    left join public.staff_members sm on sm.user_id = t.assigned_to and sm.removed_at is null
    where t.status = p_status and (not coalesce(p_abuse_only, false) or t.topic = 'abuse')
    order by waiting_since asc
    limit 200
  ) x;
$$;

-- One request in full for staff: every message with internal notes, and who on the staff wrote each.
create function public.app_office_support_thread(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'subject', t.subject, 'topic', t.topic, 'status', t.status, 'orgId', t.org_id, 'authorId', t.author_id,
    'email', (select u.email from auth.users u where u.id = t.author_id),
    'assignedTo', t.assigned_to, 'createdAt', t.created_at, 'closedAt', t.closed_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'fromStaff', m.from_staff, 'internal', m.internal, 'body', m.body, 'createdAt', m.created_at,
        'staffEmail', case when m.from_staff then (select sm.email from public.staff_members sm where sm.user_id = m.author_id order by sm.created_at desc limit 1) end) order by m.id)
      from public.support_messages m where m.thread_id = t.id
    ), '[]'::jsonb)
  )
  from public.support_threads t where t.id = p_id;
$$;

-- The platform's state for Office Space's health page, read in one call.
create function public.app_office_health(p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'runs', jsonb_build_object(
      'live', (select count(*) from public.agent_runs r where r.status in ('starting', 'working', 'waiting')),
      'stuck', (select count(*) from public.agent_runs r where r.status in ('starting', 'working', 'waiting') and r.updated_at < p_now - interval '10 minutes'),
      'failed24', (select count(*) from public.agent_runs r where r.status = 'failed' and r.ended_at > p_now - interval '24 hours'),
      'finished24', (select count(*) from public.agent_runs r where r.status = 'finished' and r.ended_at > p_now - interval '24 hours')
    ),
    'audit', (
      select jsonb_build_object('events', (select h.seq from private.staff_audit_head h limit 1), 'lastCheck',
        (select jsonb_build_object('at', v.verified_at, 'ok', v.ok, 'through', v.through_seq) from public.staff_audit_verifications v order by v.id desc limit 1))
    ),
    'paused', coalesce((select jsonb_agg(f.key order by f.key) from public.platform_flags f where f.paused), '[]'::jsonb),
    'support', jsonb_build_object(
      'waiting', (select count(*) from public.support_threads t where t.status = 'waiting_on_farbaek'),
      'oldestWaitingAt', (select min(t.last_customer_at) from public.support_threads t where t.status = 'waiting_on_farbaek')
    )
  );
$$;

revoke all on function public.app_support_open(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_support_reply(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_support_close(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_support_mark_seen(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_staff_support_reply(uuid, uuid, uuid, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_support_update(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_office_health(timestamptz) from public, anon, authenticated;
revoke all on function public.app_office_support_queue(text, boolean) from public, anon, authenticated;
revoke all on function public.app_office_support_thread(uuid) from public, anon, authenticated;
grant execute on function public.app_support_open(uuid, uuid, text, text, text) to service_role;
grant execute on function public.app_support_reply(uuid, uuid, text) to service_role;
grant execute on function public.app_support_close(uuid, uuid) to service_role;
grant execute on function public.app_support_mark_seen(uuid, uuid) to service_role;
grant execute on function public.app_staff_support_reply(uuid, uuid, uuid, text, boolean, text, text) to service_role;
grant execute on function public.app_staff_support_update(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.app_office_health(timestamptz) to service_role;
grant execute on function public.app_office_support_queue(text, boolean) to service_role;
grant execute on function public.app_office_support_thread(uuid) to service_role;
