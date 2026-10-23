-- Farbaek schema v28: skill pinning (the spec's Tool Definition Pinning, ADR 0043).
--
-- A project's own skills (.farbaek/skills/*/SKILL.md or .claude/skills/*/SKILL.md)
-- go into the agent's instructions. A skill applies only in the version a
-- person approved: the pin records that file revision and its SHA-256. A new
-- or changed skill file is held back from runs until someone approves it.
-- Members read their workspace's pins; only the server writes, through two
-- functions that check the person, the project and the file.

create table public.project_skill_pins (
  project_id  uuid not null,
  org_id      uuid not null,
  path        text not null check (path ~* '^(\.farbaek|\.claude)/skills/[^/]+/SKILL\.md$'),
  revision    integer not null check (revision > 0),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Null for skills pinned when pinning began (migration v28), which were already in use.
  pinned_by   uuid references auth.users (id) on delete set null,
  pinned_at   timestamptz not null default now(),
  primary key (project_id, path),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);

alter table public.project_skill_pins enable row level security;
revoke all on public.project_skill_pins from public, anon, authenticated, service_role;
grant select on public.project_skill_pins to authenticated, service_role;
create policy "members read their workspace's skill pins" on public.project_skill_pins
  for select to authenticated using ((select private.is_member(org_id)));

-- Approves one skill file at the exact revision and hash the person reviewed.
-- Contributors only, on a project that isn't archived.
create function public.app_pin_skill(p_project uuid, p_actor uuid, p_path text, p_revision integer, p_sha256 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := private.lock_project(p_project, p_actor);
  if p_path !~* '^(\.farbaek|\.claude)/skills/[^/]+/SKILL\.md$' then
    raise exception 'INVALID_PATH' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.project_files f
    where f.project_id = p_project and f.path = p_path and f.revision = p_revision and f.sha256 = p_sha256
  ) then
    raise exception 'FILE_CHANGED' using errcode = '40001';
  end if;
  insert into public.project_skill_pins (project_id, org_id, path, revision, sha256, pinned_by, pinned_at)
  values (p_project, v_org, p_path, p_revision, p_sha256, p_actor, now())
  on conflict (project_id, path) do update
    set revision = excluded.revision, sha256 = excluded.sha256, pinned_by = excluded.pinned_by, pinned_at = excluded.pinned_at;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'skill.pinned', p_project::text, jsonb_build_object('path', p_path, 'revision', p_revision, 'sha256', p_sha256));
end;
$$;

-- Withdraws a skill's approval, for example when its file is removed.
create function public.app_unpin_skill(p_project uuid, p_actor uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := private.lock_project(p_project, p_actor);
  delete from public.project_skill_pins where project_id = p_project and path = p_path;
  if found then
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v_org, p_actor, 'skill.unpinned', p_project::text, jsonb_build_object('path', p_path));
  end if;
end;
$$;

revoke all on function public.app_pin_skill(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.app_pin_skill(uuid, uuid, text, integer, text) to service_role;
revoke all on function public.app_unpin_skill(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_unpin_skill(uuid, uuid, text) to service_role;

-- Skills already in projects were in use before pinning began. They're pinned
-- as they are now, so builds behave the same; later changes need a review.
insert into public.project_skill_pins (project_id, org_id, path, revision, sha256, pinned_by, pinned_at)
select f.project_id, f.org_id, f.path, f.revision, f.sha256, null, now()
from public.project_files f
where f.path ~* '^(\.farbaek|\.claude)/skills/[^/]+/SKILL\.md$'
on conflict (project_id, path) do nothing;
