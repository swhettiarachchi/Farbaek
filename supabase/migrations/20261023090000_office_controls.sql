-- Farbaek schema v21: Office Space controls (ADR 0032, phase 2).
--
-- Staff can now suspend a workspace, take a published site offline, add AI
-- usage, pause parts of the platform and post announcements. Each control is
-- enforced here, not by the console: a suspended workspace fails every
-- member write (require_contributor) and every insert that starts new
-- activity (guard triggers, which also catch the functions that check
-- membership themselves); a paused feature fails its inserts; a blocked site
-- can't go live again. System work only updates rows, so settling usage,
-- sweeping sandboxes and ending runs keep working. Every staff function
-- re-checks the role and session and records one chained event (v20).

-- ------------------------------------------------------------------ columns and tables

alter table public.organizations
  add column suspended_at timestamptz,
  add column suspended_notice text check (suspended_notice is null or char_length(suspended_notice) between 10 and 500);

alter table public.sites
  add column blocked_at timestamptz,
  add column blocked_notice text check (blocked_notice is null or char_length(blocked_notice) between 10 and 500);

-- Platform pause switches. Missing rows count as not paused; the five rows
-- are seeded here and nothing can delete them.
create table public.platform_flags (
  key             text primary key check (key in ('ai_runs', 'sandboxes', 'publishing', 'serve_published_sites', 'new_workspaces')),
  paused          boolean not null default false,
  public_message  text check (public_message is null or char_length(public_message) between 10 and 280),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
insert into public.platform_flags (key) values ('ai_runs'), ('sandboxes'), ('publishing'), ('serve_published_sites'), ('new_workspaces');

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  message      text not null check (char_length(message) between 10 and 280),
  tone         text not null check (tone in ('info', 'incident')),
  dismissible  boolean not null default true,
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid not null,
  ended_at     timestamptz,
  ended_by     uuid,
  constraint announcements_window check (ends_at is null or ends_at > starts_at)
);

alter table public.platform_flags enable row level security;
alter table public.announcements enable row level security;
revoke all on public.platform_flags, public.announcements from public, anon, authenticated, service_role;
grant select on public.platform_flags, public.announcements to service_role;
-- Signed-in people see the switches and live announcements, never who set them.
grant select (key, paused, public_message, updated_at) on public.platform_flags to authenticated;
grant select (id, message, tone, dismissible, starts_at, ends_at) on public.announcements to authenticated;
create policy "signed-in people read platform switches" on public.platform_flags for select to authenticated using (true);
create policy "signed-in people read live announcements" on public.announcements for select to authenticated
  using (ended_at is null and starts_at <= now() and (ends_at is null or ends_at > now()));

-- ------------------------------------------------------------------ helpers

create function private.platform_paused(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.paused from public.platform_flags f where f.key = p_key), false);
$$;
revoke all on function private.platform_paused(text) from public;

create function private.org_suspended(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.organizations o where o.id = p_org and o.suspended_at is not null);
$$;
revoke all on function private.org_suspended(uuid) from public;

-- Membership as before (non-members still get FORBIDDEN first), and now a
-- suspended workspace refuses its members' writes.
create or replace function private.require_contributor(p_org uuid, p_user uuid)
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
  if private.org_suspended(p_org) then
    raise exception 'WORKSPACE_SUSPENDED' using errcode = 'P0001';
  end if;
end;
$$;

-- Before an insert that starts new activity: refused for a suspended
-- workspace, and for a paused feature (the trigger's argument, if any).
create function private.guard_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag text := nullif(tg_argv[0], '');
begin
  if tg_table_name <> 'organizations' then
    if private.org_suspended(new.org_id) then
      raise exception 'WORKSPACE_SUSPENDED' using errcode = 'P0001';
    end if;
  end if;
  if v_flag is not null and private.platform_paused(v_flag) then
    raise exception 'PAUSED_BY_FARBAEK:%', v_flag using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_activity() from public;

create trigger guard_activity before insert on public.ai_credit_ledger for each row execute function private.guard_activity('ai_runs');
create trigger guard_activity before insert on public.agent_runs for each row execute function private.guard_activity('ai_runs');
create trigger guard_activity before insert on public.sandbox_sessions for each row execute function private.guard_activity('sandboxes');
create trigger guard_activity before insert on public.sandbox_executions for each row execute function private.guard_activity('sandboxes');
create trigger guard_activity before insert on public.site_deployments for each row execute function private.guard_activity('publishing');
create trigger guard_activity before insert on public.sites for each row execute function private.guard_activity('publishing');
create trigger guard_activity before insert on public.sandbox_previews for each row execute function private.guard_activity('');
create trigger guard_activity before insert on public.projects for each row execute function private.guard_activity('');
create trigger guard_activity before insert on public.tasks for each row execute function private.guard_activity('');
create trigger guard_activity before insert on public.project_file_revisions for each row execute function private.guard_activity('');
create trigger guard_activity before insert on public.change_proposals for each row execute function private.guard_activity('');
create trigger guard_activity before insert on public.organization_invitations for each row execute function private.guard_activity('');
create trigger guard_activity before insert on public.organization_members for each row execute function private.guard_activity('');
create trigger guard_activity before insert on public.security_reports for each row execute function private.guard_activity('');
create trigger guard_activity before insert on public.agents for each row execute function private.guard_activity('');
create trigger guard_activity before insert on public.organizations for each row execute function private.guard_activity('new_workspaces');

-- A site goes live (again) only if it isn't blocked, its workspace isn't
-- suspended and publishing isn't paused. Taking it offline always works.
create function private.guard_site_live()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.live_deployment_id is not null and new.live_deployment_id is distinct from old.live_deployment_id then
    if new.blocked_at is not null then
      raise exception 'SITE_BLOCKED' using errcode = 'P0001';
    end if;
    if private.org_suspended(new.org_id) then
      raise exception 'WORKSPACE_SUSPENDED' using errcode = 'P0001';
    end if;
    if private.platform_paused('publishing') then
      raise exception 'PAUSED_BY_FARBAEK:publishing' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_site_live() from public;
create trigger sites_guard_live before update of live_deployment_id on public.sites
  for each row execute function private.guard_site_live();

-- ------------------------------------------------------------------ serving

-- Everything the site route needs in one call: whether the name is live,
-- and if so its files. A blocked, paused or suspended site says which.
create function public.app_site_for_serving(p_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_site record;
  v_dep record;
begin
  select s.id, s.org_id, s.live_deployment_id, s.blocked_at into v_site from public.sites s where s.name = p_name;
  if not found then
    return jsonb_build_object('state', 'none');
  end if;
  if v_site.blocked_at is not null then
    return jsonb_build_object('state', 'blocked');
  end if;
  if private.platform_paused('serve_published_sites') then
    return jsonb_build_object('state', 'paused');
  end if;
  if private.org_suspended(v_site.org_id) then
    return jsonb_build_object('state', 'suspended');
  end if;
  if v_site.live_deployment_id is null then
    return jsonb_build_object('state', 'none');
  end if;
  select d.id, d.project_id, d.files into v_dep from public.site_deployments d where d.id = v_site.live_deployment_id;
  if not found then
    return jsonb_build_object('state', 'none');
  end if;
  return jsonb_build_object('state', 'live', 'deployment_id', v_dep.id, 'project_id', v_dep.project_id, 'files', v_dep.files);
end;
$$;

-- ------------------------------------------------------------------ staff controls

create function private.require_notice(p_notice text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_notice, ''));
begin
  if char_length(v) not between 10 and 500 then
    raise exception 'NOTICE_REQUIRED' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function private.require_notice(text) from public;

create function public.app_staff_suspend_workspace(
  p_actor uuid,
  p_session uuid,
  p_org uuid,
  p_confirm_name text,
  p_notice text,
  p_reason text,
  p_ip_hash text,
  p_ua text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'workspace.suspend');
  v_reason text := private.require_reason(p_reason);
  v_notice text := private.require_notice(p_notice);
  v_name text;
  v_suspended timestamptz;
begin
  select o.name, o.suspended_at into v_name, v_suspended from public.organizations o where o.id = p_org for update;
  if v_name is null then
    raise exception 'WORKSPACE_MISSING' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_confirm_name, '')) is distinct from v_name then
    raise exception 'CONFIRM_NAME_MISMATCH' using errcode = 'P0001';
  end if;
  if v_suspended is not null then
    raise exception 'ALREADY_SUSPENDED' using errcode = 'P0001';
  end if;
  update public.organizations set suspended_at = now(), suspended_notice = v_notice where id = p_org;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, null, 'farbaek.workspace_suspended', p_org::text, jsonb_build_object('notice', v_notice));
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'workspace.suspended', 'workspace', p_org::text, p_org, v_reason, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
end;
$$;

create function public.app_staff_restore_workspace(p_actor uuid, p_session uuid, p_org uuid, p_reason text, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'workspace.suspend');
  v_reason text := private.require_reason(p_reason);
begin
  update public.organizations set suspended_at = null, suspended_notice = null where id = p_org and suspended_at is not null;
  if not found then
    raise exception 'NOT_SUSPENDED' using errcode = 'P0001';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, null, 'farbaek.workspace_restored', p_org::text, '{}'::jsonb);
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'workspace.restored', 'workspace', p_org::text, p_org, v_reason, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
end;
$$;

-- Takes a site offline and keeps it, files and name, as evidence. The owner
-- sees the notice; visitors see a neutral page.
create function public.app_staff_block_site(p_actor uuid, p_session uuid, p_site uuid, p_notice text, p_reason text, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'site.block');
  v_reason text := private.require_reason(p_reason);
  v_notice text := private.require_notice(p_notice);
  v_site record;
begin
  select s.id, s.org_id, s.name, s.blocked_at, s.live_deployment_id into v_site from public.sites s where s.id = p_site for update;
  if not found then
    raise exception 'SITE_MISSING' using errcode = 'P0001';
  end if;
  if v_site.blocked_at is not null then
    raise exception 'ALREADY_BLOCKED' using errcode = 'P0001';
  end if;
  update public.sites set blocked_at = now(), blocked_notice = v_notice, live_deployment_id = null where id = p_site;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_site.org_id, null, 'farbaek.site_blocked', p_site::text, jsonb_build_object('site', v_site.name, 'notice', v_notice));
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'site.blocked', 'site', p_site::text, v_site.org_id, v_reason, null, 'success',
    jsonb_build_object('was_live', v_site.live_deployment_id is not null, 'deployment', v_site.live_deployment_id), p_ip_hash, p_ua, null);
end;
$$;

-- Lifts the block. The site stays offline until its owner makes it live again.
create function public.app_staff_unblock_site(p_actor uuid, p_session uuid, p_site uuid, p_reason text, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'site.block');
  v_reason text := private.require_reason(p_reason);
  v_org uuid;
  v_name text;
begin
  update public.sites set blocked_at = null, blocked_notice = null where id = p_site and blocked_at is not null returning org_id, name into v_org, v_name;
  if v_org is null then
    raise exception 'NOT_BLOCKED' using errcode = 'P0001';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, null, 'farbaek.site_unblocked', p_site::text, jsonb_build_object('site', v_name));
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'site.unblocked', 'site', p_site::text, v_org, v_reason, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
end;
$$;

-- AI usage added by Farbaek: an adjustment grant, never a payment and never
-- billing. Owners up to 5,000,000 units, admins up to 500,000; above
-- 1,000,000 a fresh authenticator code is needed. It expires within 90 days.
create function public.app_staff_add_usage(
  p_actor uuid,
  p_session uuid,
  p_org uuid,
  p_units bigint,
  p_days integer,
  p_reason text,
  p_auth_strength text,
  p_ip_hash text,
  p_ua text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'usage.add');
  v_reason text := private.require_reason(p_reason);
  v_cap bigint;
  v_id uuid;
  v_expires timestamptz;
begin
  if p_units is null or p_units < 1000 then
    raise exception 'INVALID_UNITS' using errcode = 'P0001';
  end if;
  v_cap := case v_role when 'owner' then 5000000 when 'admin' then 500000 else 0 end;
  if p_units > v_cap then
    raise exception 'USAGE_CAP' using errcode = 'P0001';
  end if;
  if p_units > 1000000 and p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  if p_days is null or p_days not between 1 and 90 then
    raise exception 'INVALID_EXPIRY' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'WORKSPACE_MISSING' using errcode = 'P0001';
  end if;
  v_expires := now() + make_interval(days => p_days);
  insert into public.usage_grants (org_id, kind, units, starts_at, expires_at, source_key)
  values (p_org, 'adjustment', p_units, now(), v_expires, 'adjustment:' || gen_random_uuid()::text)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, null, 'farbaek.usage_added', v_id::text, jsonb_build_object('units', p_units, 'expires_at', v_expires));
  perform private.record_staff_event(p_actor, v_role, p_session, case when p_auth_strength = 'step_up' then 'step_up' else 'aal2' end,
    'usage.added', 'workspace', p_org::text, p_org, v_reason, null, 'success', jsonb_build_object('units', p_units, 'days', p_days, 'grant', v_id), p_ip_hash, p_ua, null);
  return v_id;
end;
$$;

-- A platform switch. Owners only, with a fresh authenticator code both ways.
create function public.app_staff_set_flag(
  p_actor uuid,
  p_session uuid,
  p_key text,
  p_paused boolean,
  p_message text,
  p_reason text,
  p_auth_strength text,
  p_ip_hash text,
  p_ua text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'flags.set');
  v_reason text := private.require_reason(p_reason);
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_was boolean;
begin
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  select f.paused into v_was from public.platform_flags f where f.key = p_key for update;
  if v_was is null then
    raise exception 'INVALID_FLAG' using errcode = 'P0001';
  end if;
  if p_paused and (v_message is null or char_length(v_message) not between 10 and 280) then
    raise exception 'NOTICE_REQUIRED' using errcode = 'P0001';
  end if;
  update public.platform_flags
     set paused = p_paused, public_message = case when p_paused then v_message else null end, updated_at = now(), updated_by = p_actor
   where key = p_key;
  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', case when p_paused then 'platform.paused' else 'platform.resumed' end,
    'flag', p_key, null, v_reason, null, 'success', jsonb_build_object('was_paused', v_was), p_ip_hash, p_ua, null);
end;
$$;

create function public.app_staff_publish_announcement(
  p_actor uuid,
  p_session uuid,
  p_message text,
  p_tone text,
  p_dismissible boolean,
  p_ends_at timestamptz,
  p_reason text,
  p_ip_hash text,
  p_ua text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'announcements.manage');
  v_reason text := private.require_reason(p_reason);
  v_message text := btrim(coalesce(p_message, ''));
  v_id uuid;
begin
  if char_length(v_message) not between 10 and 280 or p_tone not in ('info', 'incident') or (p_ends_at is not null and p_ends_at <= now()) then
    raise exception 'INVALID_ANNOUNCEMENT' using errcode = 'P0001';
  end if;
  insert into public.announcements (message, tone, dismissible, ends_at, created_by)
  values (v_message, p_tone, coalesce(p_dismissible, true) and p_tone = 'info', p_ends_at, p_actor)
  returning id into v_id;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'announcement.published', 'announcement', v_id::text, null, v_reason, null, 'success',
    jsonb_build_object('tone', p_tone), p_ip_hash, p_ua, null);
  return v_id;
end;
$$;

create function public.app_staff_end_announcement(p_actor uuid, p_session uuid, p_id uuid, p_reason text, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'announcements.manage');
  v_reason text := private.require_reason(p_reason);
begin
  update public.announcements set ended_at = now(), ended_by = p_actor where id = p_id and ended_at is null;
  if not found then
    raise exception 'ANNOUNCEMENT_MISSING' using errcode = 'P0001';
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'announcement.ended', 'announcement', p_id::text, null, v_reason, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
end;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function public.app_site_for_serving(text) from public, anon, authenticated;
revoke all on function public.app_staff_suspend_workspace(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_restore_workspace(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_block_site(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_unblock_site(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_add_usage(uuid, uuid, uuid, bigint, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_set_flag(uuid, uuid, text, boolean, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_publish_announcement(uuid, uuid, text, text, boolean, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_end_announcement(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.app_site_for_serving(text) to service_role;
grant execute on function public.app_staff_suspend_workspace(uuid, uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.app_staff_restore_workspace(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.app_staff_block_site(uuid, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.app_staff_unblock_site(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.app_staff_add_usage(uuid, uuid, uuid, bigint, integer, text, text, text, text) to service_role;
grant execute on function public.app_staff_set_flag(uuid, uuid, text, boolean, text, text, text, text, text) to service_role;
grant execute on function public.app_staff_publish_announcement(uuid, uuid, text, text, boolean, timestamptz, text, text, text) to service_role;
grant execute on function public.app_staff_end_announcement(uuid, uuid, uuid, text, text, text) to service_role;
