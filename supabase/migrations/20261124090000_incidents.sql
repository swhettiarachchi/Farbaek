-- Farbaek schema v53: the emergency pause and incidents (ADR 0083).
--
-- Emergency pause: anyone who can contribute to a workspace can stop its
-- agents at once. While paused, no cloud run starts, no desktop agent's
-- proposal is accepted, and nothing applies on its own. People's own
-- reviews and approvals keep working. Only an owner or admin resumes. A
-- pause can't undo what was already applied, or anything done outside
-- Farbaek.
--
-- Incidents: one record per thing that went wrong, with a timeline. They
-- open on their own from signals Farbaek already records (a change that
-- applied on its own failed its checks; what's live went down; agents were
-- paused), and a repeat of the same signal adds to the open incident
-- instead of opening another. Members read their workspace's incidents;
-- only the server writes them.

-- -------------------------------------------------- emergency pause

alter table public.organizations
  add column agents_paused_at timestamptz,
  add column agents_paused_by uuid references auth.users (id) on delete set null,
  add column agents_paused_reason text check (agents_paused_reason is null or char_length(agents_paused_reason) between 1 and 300);

create function private.agents_paused(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.organizations o where o.id = p_org and o.agents_paused_at is not null);
$$;
revoke all on function private.agents_paused(uuid) from public;

create function private.refuse_runs_when_paused()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.agents_paused(new.org_id) then
    raise exception 'AGENTS_PAUSED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_runs_when_paused() from public;
create trigger agent_runs_paused before insert on public.agent_runs for each row execute function private.refuse_runs_when_paused();

-- An agent's proposal, or anything that would apply on its own, waits until agents are resumed.
create function private.refuse_agent_changes_when_paused()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.agent_id is not null or new.run_id is not null or new.policy ->> 'outcome' in ('ALLOW', 'ALLOW_WITHIN_LIMITS'))
     and private.agents_paused(new.org_id) then
    raise exception 'AGENTS_PAUSED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_agent_changes_when_paused() from public;
create trigger change_proposals_paused before insert on public.change_proposals for each row execute function private.refuse_agent_changes_when_paused();

-- -------------------------------------------------- incidents

create table public.incidents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  number        integer not null check (number >= 1),
  title         text not null check (char_length(title) between 3 and 120),
  severity      text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status        text not null default 'open' check (status in ('open', 'contained', 'resolved')),
  source        text not null check (source in ('manual', 'autonomy_failure', 'outcome_watch', 'pause')),
  source_key    text check (source_key is null or char_length(source_key) <= 100),
  project_id    uuid references public.projects (id) on delete set null,
  proposal_id   uuid references public.change_proposals (id) on delete set null,
  opened_at     timestamptz not null default now(),
  opened_by     uuid references auth.users (id) on delete set null,
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users (id) on delete set null,
  outcome       text check (outcome is null or char_length(outcome) between 10 and 2000),
  escalated_at  timestamptz,
  unique (org_id, number),
  check ((status = 'resolved') = (resolved_at is not null))
);
-- A repeating signal adds to the incident it opened while that's unresolved.
create unique index incidents_open_source on public.incidents (org_id, source_key) where status <> 'resolved' and source_key is not null;
create index incidents_org_idx on public.incidents (org_id, opened_at desc);

create table public.incident_events (
  id           bigint generated always as identity primary key,
  incident_id  uuid not null references public.incidents (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  at           timestamptz not null default now(),
  actor        uuid references auth.users (id) on delete set null,
  kind         text not null check (kind in ('opened', 'note', 'severity', 'status', 'check_failed', 'recovered', 'paused', 'resumed', 'prevention', 'resolved')),
  text         text check (text is null or char_length(text) <= 2000),
  ref          jsonb not null default '{}'::jsonb check (jsonb_typeof(ref) = 'object' and octet_length(ref::text) <= 4096)
);
create index incident_events_incident_idx on public.incident_events (incident_id, id);

alter table public.incidents enable row level security;
alter table public.incident_events enable row level security;
revoke all on public.incidents, public.incident_events from anon, authenticated;
grant select on public.incidents, public.incident_events to authenticated;
create policy "members read their workspace's incidents" on public.incidents
  for select to authenticated using ((select private.is_member(org_id)));
create policy "members read their workspace's incident timelines" on public.incident_events
  for select to authenticated using ((select private.is_member(org_id)));

-- Opens an incident, or adds to the unresolved one with the same key. Returns its id.
create function private.open_incident(
  p_org uuid, p_source text, p_key text, p_title text, p_severity text,
  p_project uuid, p_proposal uuid, p_actor uuid, p_kind text, p_text text, p_ref jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_number integer;
begin
  perform pg_advisory_xact_lock(hashtext('farbaek.incident:' || p_org::text));
  if p_key is not null then
    select i.id into v_id from public.incidents i where i.org_id = p_org and i.source_key = p_key and i.status <> 'resolved';
  end if;
  if v_id is null then
    select coalesce(max(i.number), 0) + 1 into v_number from public.incidents i where i.org_id = p_org;
    insert into public.incidents (org_id, number, title, severity, source, source_key, project_id, proposal_id, opened_by)
    values (p_org, v_number, left(p_title, 120), p_severity, p_source, p_key, p_project, p_proposal, p_actor)
    returning id into v_id;
    insert into public.incident_events (incident_id, org_id, actor, kind, text, ref)
    values (v_id, p_org, p_actor, 'opened', left(p_text, 2000), coalesce(p_ref, '{}'::jsonb));
  else
    insert into public.incident_events (incident_id, org_id, actor, kind, text, ref)
    values (v_id, p_org, p_actor, p_kind, left(p_text, 2000), coalesce(p_ref, '{}'::jsonb));
  end if;
  return v_id;
end;
$$;
revoke all on function private.open_incident(uuid, text, text, text, text, uuid, uuid, uuid, text, text, jsonb) from public;

-- Signals Farbaek already audits open incidents, so the functions that raise them stay as they are.
create function private.incident_from_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uuid uuid := case when new.target ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then new.target::uuid end;
  v_task uuid;
  v_project uuid;
  v_name text;
  v_id uuid;
begin
  if v_uuid is null then
    return new;
  end if;
  if new.action = 'autonomy.suspended' then
    select p.task_id, p.project_id into v_task, v_project from public.change_proposals p where p.id = v_uuid;
    perform private.open_incident(
      new.org_id, 'autonomy_failure', 'autonomy', 'A change applied on its own failed its checks', 'high', v_project, v_uuid, null, 'check_failed',
      'A change that applied on its own ' || case when new.metadata ->> 'status' = 'partially_verified' then 'only partly passed' else 'failed' end
        || ' its checks, so autonomy paused itself for the whole workspace.',
      jsonb_strip_nulls(jsonb_build_object('task', v_task, 'proposal', v_uuid, 'project', v_project, 'proofpack', new.metadata ->> 'proofpack')));
  elsif new.action = 'watch.down' then
    select p.name into v_name from public.projects p where p.id = v_uuid;
    perform private.open_incident(
      new.org_id, 'outcome_watch', 'watch:' || v_uuid::text, coalesce(v_name, 'A project') || ' is down', 'high', v_uuid, null, null, 'check_failed',
      'What''s live failed two checks in a row' || coalesce(': ' || nullif(new.metadata ->> 'detail', ''), '.'),
      jsonb_build_object('project', v_uuid));
  elsif new.action = 'watch.recovered' then
    select i.id into v_id from public.incidents i where i.org_id = new.org_id and i.source_key = 'watch:' || v_uuid::text and i.status <> 'resolved';
    if v_id is not null then
      insert into public.incident_events (incident_id, org_id, kind, text, ref)
      values (v_id, new.org_id, 'recovered', 'It''s answering again' || coalesce(': ' || nullif(new.metadata ->> 'detail', ''), '.') || ' Resolve the incident once you know why it went down.', jsonb_build_object('project', v_uuid));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.incident_from_audit() from public;
create trigger audit_events_incidents after insert on public.audit_events
  for each row when (new.action in ('autonomy.suspended', 'watch.down', 'watch.recovered'))
  execute function private.incident_from_audit();

-- The changes an incident is about, by shape only (paths, kinds, the policy's
-- outcome), never content: its own change when it has one, otherwise the
-- changes applied in the 24 hours before it opened, in its project when it
-- names one. Read as the caller, so Row Level Security applies.
create function public.app_incident_changes(p_org uuid, p_number integer)
returns table (proposal_id uuid, task_id uuid, at timestamptz, files jsonb, outcome text, exact boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with i as (select * from public.incidents where org_id = p_org and number = p_number)
  select p.id, p.task_id, coalesce(p.decided_at, p.created_at),
         (select coalesce(jsonb_agg(jsonb_build_object('path', c ->> 'path', 'kind', c ->> 'kind')), '[]'::jsonb) from jsonb_array_elements(p.changes) c),
         coalesce(p.policy ->> 'outcome', 'REQUIRE_APPROVAL'),
         i.proposal_id is not null
    from i
    join public.change_proposals p
      on p.org_id = i.org_id
     and (
       p.id = i.proposal_id
       or (i.proposal_id is null and p.status = 'applied'
           and p.decided_at between i.opened_at - interval '24 hours' and i.opened_at
           and (i.project_id is null or p.project_id = i.project_id))
     )
   order by 3 desc
   limit 5;
$$;
revoke all on function public.app_incident_changes(uuid, integer) from public, anon;
grant execute on function public.app_incident_changes(uuid, integer) to authenticated, service_role;

-- -------------------------------------------------- functions for the server

create function private.require_manager(p_org uuid, p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_manager(uuid, uuid) from public;

-- Any contributor pauses; an owner or admin resumes. Returns whether anything changed.
create function public.app_set_agents_pause(p_org uuid, p_actor uuid, p_paused boolean, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
  v_was timestamptz;
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  select o.agents_paused_at into v_was from public.organizations o where o.id = p_org for update;
  if p_paused then
    if v_was is not null then
      return false;
    end if;
    update public.organizations set agents_paused_at = now(), agents_paused_by = p_actor, agents_paused_reason = v_reason where id = p_org;
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (p_org, p_actor, 'agents.paused', p_org::text, jsonb_build_object('reason', v_reason));
    perform private.open_incident(p_org, 'pause', 'pause', 'Agents paused', 'medium', null, null, p_actor, 'paused',
      'Agents paused' || coalesce(': ' || v_reason, '.') || ' No agent runs or automatic changes until an owner or admin resumes them.', '{}'::jsonb);
    return true;
  end if;

  perform private.require_manager(p_org, p_actor);
  if v_was is null then
    return false;
  end if;
  update public.organizations set agents_paused_at = null, agents_paused_by = null, agents_paused_reason = null where id = p_org;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'agents.resumed', p_org::text, jsonb_build_object('paused_at', v_was));
  select i.id into v_id from public.incidents i where i.org_id = p_org and i.source_key = 'pause' and i.status <> 'resolved';
  if v_id is not null then
    insert into public.incident_events (incident_id, org_id, actor, kind, text)
    values (v_id, p_org, p_actor, 'resumed', 'Agents resumed. Resolve the incident once you''ve written down what happened.');
  end if;
  return true;
end;
$$;
revoke all on function public.app_set_agents_pause(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.app_set_agents_pause(uuid, uuid, boolean, text) to service_role;

create function public.app_open_incident(p_org uuid, p_actor uuid, p_title text, p_severity text, p_project uuid, p_text text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if char_length(v_title) not between 3 and 120 or coalesce(p_severity, '') not in ('low', 'medium', 'high', 'critical')
     or char_length(coalesce(p_text, '')) > 2000 then
    raise exception 'INVALID_INCIDENT' using errcode = '22023';
  end if;
  if p_project is not null and not exists (select 1 from public.projects p where p.id = p_project and p.org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = '42704';
  end if;
  v_id := private.open_incident(p_org, 'manual', null, v_title, p_severity, p_project, null, p_actor, 'opened', nullif(btrim(coalesce(p_text, '')), ''), '{}'::jsonb);
  return (select i.number from public.incidents i where i.id = v_id);
end;
$$;
revoke all on function public.app_open_incident(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.app_open_incident(uuid, uuid, text, text, uuid, text) to service_role;

-- A note, or the record of a prevention step taken from the incident.
create function public.app_add_incident_event(p_org uuid, p_actor uuid, p_number integer, p_kind text, p_text text, p_ref jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_text text := btrim(coalesce(p_text, ''));
begin
  perform private.require_contributor(p_org, p_actor);
  if coalesce(p_kind, '') not in ('note', 'prevention') or char_length(v_text) not between 1 and 2000
     or jsonb_typeof(coalesce(p_ref, '{}'::jsonb)) <> 'object' or octet_length(coalesce(p_ref, '{}'::jsonb)::text) > 4096 then
    raise exception 'INVALID_INCIDENT' using errcode = '22023';
  end if;
  select i.id into v_id from public.incidents i where i.org_id = p_org and i.number = p_number;
  if v_id is null then
    raise exception 'NOT_FOUND' using errcode = '42704';
  end if;
  insert into public.incident_events (incident_id, org_id, actor, kind, text, ref) values (v_id, p_org, p_actor, p_kind, v_text, coalesce(p_ref, '{}'::jsonb));
end;
$$;
revoke all on function public.app_add_incident_event(uuid, uuid, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_add_incident_event(uuid, uuid, integer, text, text, jsonb) to service_role;

-- Severity and status. Resolving needs what happened and what was done, and is final.
create function public.app_update_incident(p_org uuid, p_actor uuid, p_number integer, p_severity text, p_status text, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.incidents%rowtype;
  v_outcome text := nullif(btrim(coalesce(p_outcome, '')), '');
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v from public.incidents i where i.org_id = p_org and i.number = p_number for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = '42704';
  end if;
  if v.status = 'resolved' then
    raise exception 'INCIDENT_RESOLVED' using errcode = '22023';
  end if;
  if coalesce(p_severity, v.severity) not in ('low', 'medium', 'high', 'critical')
     or coalesce(p_status, v.status) not in ('open', 'contained', 'resolved')
     or (p_status = 'resolved' and char_length(coalesce(v_outcome, '')) not between 10 and 2000) then
    raise exception 'INVALID_INCIDENT' using errcode = '22023';
  end if;

  if p_severity is not null and p_severity <> v.severity then
    update public.incidents set severity = p_severity where id = v.id;
    insert into public.incident_events (incident_id, org_id, actor, kind, text, ref)
    values (v.id, p_org, p_actor, 'severity', 'Severity changed from ' || v.severity || ' to ' || p_severity || '.', jsonb_build_object('from', v.severity, 'to', p_severity));
  end if;
  if p_status is not null and p_status <> v.status then
    if p_status = 'resolved' then
      update public.incidents set status = 'resolved', resolved_at = now(), resolved_by = p_actor, outcome = v_outcome where id = v.id;
      insert into public.incident_events (incident_id, org_id, actor, kind, text) values (v.id, p_org, p_actor, 'resolved', v_outcome);
    else
      update public.incidents set status = p_status where id = v.id;
      insert into public.incident_events (incident_id, org_id, actor, kind, text, ref)
      values (v.id, p_org, p_actor, 'status', case p_status when 'contained' then 'Marked as contained.' else 'Marked as open again.' end, jsonb_build_object('from', v.status, 'to', p_status));
    end if;
  end if;
end;
$$;
revoke all on function public.app_update_incident(uuid, uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.app_update_incident(uuid, uuid, integer, text, text, text) to service_role;

-- The escalation job claims an incident before it tells anyone, so two runs never both send.
create function public.app_claim_incident_escalation(p_incident uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.incidents set escalated_at = now()
     where id = p_incident and escalated_at is null and status <> 'resolved'
    returning 1
  )
  select exists (select 1 from claimed);
$$;
revoke all on function public.app_claim_incident_escalation(uuid) from public, anon, authenticated;
grant execute on function public.app_claim_incident_escalation(uuid) to service_role;

notify pgrst, 'reload schema';
