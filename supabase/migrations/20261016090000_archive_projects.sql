-- Farbaek schema v9: archiving projects.
--
-- Owners and admins can archive a project. An archived project leaves the
-- project list and stops counting toward the plan's project limit (the
-- count in app_create_project already ignores archived rows, and the unique
-- name index only covers active projects). Nothing is deleted: files,
-- revisions, tasks, contracts, proposals and ProofPacks stay readable to
-- members through Row Level Security. Changes to an archived project's
-- files are refused with PROJECT_ARCHIVED instead of NOT_FOUND.

-- Same as v5, plus the archived case gets its own error.
create or replace function private.lock_project(p_project uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_archived timestamptz;
begin
  select org_id, archived_at into v_org, v_archived from public.projects where id = p_project for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_org, p_actor);
  if v_archived is not null then
    raise exception 'PROJECT_ARCHIVED' using errcode = 'P0001';
  end if;
  return v_org;
end;
$$;

create function public.app_archive_project(p_project uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_name text;
  v_archived timestamptz;
begin
  select org_id, name, archived_at into v_org, v_name, v_archived from public.projects where id = p_project for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organization_members m where m.org_id = v_org and m.user_id = p_actor and m.role in ('owner', 'admin')
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_archived is not null then
    raise exception 'ALREADY_ARCHIVED' using errcode = 'P0001';
  end if;

  update public.projects set archived_at = now() where id = p_project;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'project.archived', p_project::text, jsonb_build_object('name', v_name));
end;
$$;

revoke all on function public.app_archive_project(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_archive_project(uuid, uuid) to service_role;
