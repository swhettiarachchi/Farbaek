-- Farbaek schema v2: projects, and server-only writes.
--
-- From here on the browser (anon, authenticated) can only read. Every write
-- goes through a server action that authenticates the user, runs the
-- TypeScript entitlement and RealityLoop rules (the single source of truth),
-- then calls one of the app_* functions below with the server's secret key.
-- The functions are executable by service_role only, and still re-check
-- membership, quotas and versions inside one transaction (defence in depth).

-- ------------------------------------------------------------- projects

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  description  text check (description is null or char_length(description) <= 500),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (id, org_id)
);
create unique index projects_org_name_idx on public.projects (org_id, lower(name)) where archived_at is null;
create index projects_org_created_idx on public.projects (org_id, created_at desc);

alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select on public.projects to authenticated;
create policy "members read projects" on public.projects
  for select to authenticated using ((select private.is_member(org_id)));

-- Tasks belong to a project in the same organization (composite key).
alter table public.tasks add column project_id uuid;
alter table public.tasks
  add constraint tasks_project_same_org_fk foreign key (project_id, org_id)
  references public.projects (id, org_id) on delete cascade;
create index tasks_project_created_idx on public.tasks (project_id, created_at desc);

do $$
begin
  if not exists (select 1 from public.tasks where project_id is null) then
    alter table public.tasks alter column project_id set not null;
  end if;
end;
$$;

-- Task creation moves to the server.
drop policy "contributors create tasks" on public.tasks;
revoke insert on public.tasks from authenticated;

-- ------------------------------------------------- server-only functions

create function private.require_contributor(p_org uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = p_user and m.role in ('owner', 'admin', 'member')
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_contributor(uuid, uuid) from public;

-- p_limit is the effective plan limit computed by the server from the plan
-- catalog; null means "set by contract". The count is re-checked under a row
-- lock so two concurrent requests can't both slip under the limit.
create function public.app_create_project(p_org uuid, p_actor uuid, p_name text, p_description text, p_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(p_org, p_actor);

  if char_length(v_name) not between 1 and 80 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  if p_limit is not null and
     (select count(*) from public.projects where org_id = p_org and archived_at is null) >= p_limit then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  begin
    insert into public.projects (org_id, name, description, created_by)
    values (p_org, v_name, v_description, p_actor)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'DUPLICATE_NAME' using errcode = '23505';
  end;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'project.created', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

create function public.app_create_task(p_org uuid, p_actor uuid, p_project uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
begin
  perform private.require_contributor(p_org, p_actor);
  if char_length(v_title) not between 1 and 200 then
    raise exception 'INVALID_TITLE' using errcode = '22023';
  end if;
  if not exists (select 1 from public.projects where id = p_project and org_id = p_org and archived_at is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.tasks (org_id, project_id, title, created_by)
  values (p_org, p_project, v_title, p_actor)
  returning id into v_id;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'task.created', v_id::text, jsonb_build_object('project_id', p_project));
  return v_id;
end;
$$;

-- Applies one RealityLoop transition that the server already validated with
-- the TypeScript state machine. Optimistic concurrency on (version, state);
-- (task_id, event_id) makes a replayed event a no-op that returns the
-- current version.
create function public.app_apply_task_transition(
  p_task uuid,
  p_actor_user uuid,
  p_actor_kind text,
  p_actor_id text,
  p_event_id text,
  p_event_type text,
  p_from text,
  p_to text,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_version integer;
begin
  select org_id, version into v_org, v_version from public.tasks where id = p_task for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.task_transitions where task_id = p_task and event_id = p_event_id) then
    return v_version;
  end if;

  if p_actor_user is not null then
    perform private.require_contributor(v_org, p_actor_user);
  end if;

  update public.tasks
     set state = p_to, version = version + 1, updated_at = now()
   where id = p_task and version = p_expected_version and state = p_from
  returning version into v_version;
  if not found then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;

  insert into public.task_transitions (task_id, org_id, event_id, event_type, from_state, to_state, actor_kind, actor_id)
  values (p_task, v_org, p_event_id, p_event_type, p_from, p_to, p_actor_kind, p_actor_id);

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor_user, 'task.transition', p_task::text,
          jsonb_build_object('event', p_event_type, 'from', p_from, 'to', p_to));
  return v_version;
end;
$$;

revoke all on function public.app_create_project(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.app_create_task(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_apply_task_transition(uuid, uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.app_create_project(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.app_create_task(uuid, uuid, uuid, text) to service_role;
grant execute on function public.app_apply_task_transition(uuid, uuid, text, text, text, text, text, text, integer) to service_role;
