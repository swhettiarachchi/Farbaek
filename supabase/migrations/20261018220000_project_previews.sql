-- Farbaek schema v17: instant previews of a project's files (ADR 0023).
--
-- A website made of static files can be previewed without a sandbox: the
-- preview gateway serves the project's current files on the preview's own
-- host. A preview now points at either a sandbox session and a port (an
-- app running in the sandbox) or a project (its files as they are now).
-- The same rules apply to both: a private link for the person who opened it,
-- launched once, expiring, revocable, and only while they're a member.

alter table public.sandbox_previews alter column session_id drop not null;
alter table public.sandbox_previews alter column port drop not null;
alter table public.sandbox_previews add column project_id uuid references public.projects (id) on delete cascade;
alter table public.sandbox_previews add constraint sandbox_previews_target check (
  (session_id is not null and port is not null and project_id is null)
  or (session_id is null and port is null and project_id is not null)
);
create index sandbox_previews_project_idx on public.sandbox_previews (project_id, created_at desc) where project_id is not null;
-- Reads stay as they are: members read their workspace's previews ("members read sandbox previews", migration 10).

-- Opens a preview of a project's files. Any member can look at a project's files, so any member can preview them.
create function public.app_create_project_preview(p_project uuid, p_actor uuid, p_id text, p_ttl_seconds integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_archived boolean;
  v_expires timestamptz;
begin
  select org_id, archived_at is not null into v_org, v_archived from public.projects where id = p_project for update;
  if v_org is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.organization_members m where m.org_id = v_org and m.user_id = p_actor) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_id is null or p_id !~ '^[a-z2-7]{26}$' then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 86400 then
    raise exception 'INVALID_LIMITS' using errcode = '22023';
  end if;
  if (select count(*) from public.sandbox_previews
      where project_id = p_project and created_by = p_actor and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'PREVIEW_LIMIT' using errcode = 'P0001';
  end if;
  v_expires := now() + make_interval(secs => p_ttl_seconds);
  insert into public.sandbox_previews (id, project_id, org_id, created_by, expires_at)
  values (p_id, p_project, v_org, p_actor, v_expires);
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'preview.opened', p_id, jsonb_build_object('project_id', p_project));
  return v_expires;
end;
$$;

-- Uses a preview's one launch. Session previews also need their session running.
create or replace function public.app_launch_sandbox_preview(p_id text, p_user uuid)
returns table (session_id uuid, port integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.sandbox_previews%rowtype;
begin
  select * into p from public.sandbox_previews where id = p_id for update;
  if not found or p.created_by <> p_user or p.revoked_at is not null or p.expires_at <= now() or p.launched_at is not null
     or (p.session_id is not null and not exists (select 1 from public.sandbox_sessions s where s.id = p.session_id and s.state = 'ready'))
     or (p.project_id is not null and not exists (select 1 from public.projects pr where pr.id = p.project_id and pr.archived_at is null))
     or not exists (select 1 from public.organization_members m where m.org_id = p.org_id and m.user_id = p_user) then
    raise exception 'PREVIEW_UNAVAILABLE' using errcode = 'P0001';
  end if;
  update public.sandbox_previews set launched_at = now() where id = p_id;
  return query select p.session_id, p.port, p.expires_at;
end;
$$;

-- Closes a preview. The person who opened it can; for session previews the session's operators can; for project previews owners and admins can.
create or replace function public.app_revoke_sandbox_preview(p_id text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.sandbox_previews%rowtype;
  s public.sandbox_sessions%rowtype;
begin
  select * into p from public.sandbox_previews where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p.created_by <> p_actor then
    if p.session_id is not null then
      select * into s from public.sandbox_sessions where id = p.session_id;
      perform private.require_session_operator(s.org_id, s.created_by, p_actor);
    elsif not exists (select 1 from public.organization_members m where m.org_id = p.org_id and m.user_id = p_actor and m.role in ('owner', 'admin')) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  update public.sandbox_previews set revoked_at = coalesce(revoked_at, now()) where id = p_id;
  if p.session_id is not null then
    insert into public.sandbox_events (session_id, org_id, actor_id, event, detail)
    values (p.session_id, p.org_id, p_actor, 'preview.revoked', jsonb_build_object('port', p.port));
  end if;
end;
$$;

revoke all on function public.app_create_project_preview(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.app_create_project_preview(uuid, uuid, text, integer) to service_role;
