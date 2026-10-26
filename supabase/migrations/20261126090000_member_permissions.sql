-- Farbaek schema v55: permissions per person (ADR 0087).
--
-- Owners and admins can turn three permissions off for a member: approving
-- changes, publishing and launching, and starting agent runs. Every
-- permission is on by default, so nothing changes until someone turns one
-- off. Owners and admins always have all three; viewers have none. Each is
-- enforced here, through the rows that already record who acted, whichever
-- server path made them.

-- Only withheld permissions are stored: { "approve": false, ... }. Containment
-- allows exactly the known keys, each false.
alter table public.organization_members add column permissions jsonb not null default '{}'::jsonb
  check (jsonb_typeof(permissions) = 'object' and permissions <@ '{"approve": false, "publish": false, "run_agents": false}'::jsonb);

-- A new role starts from that role's defaults.
create function private.reset_permissions_on_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    new.permissions := '{}'::jsonb;
  end if;
  return new;
end;
$$;
revoke all on function private.reset_permissions_on_role_change() from public;
create trigger reset_permissions_on_role_change before update of role on public.organization_members
  for each row execute function private.reset_permissions_on_role_change();

create function private.member_may(p_org uuid, p_user uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
             when m.role in ('owner', 'admin') then true
             when m.role = 'member' then not (m.permissions ? p_permission)
             else false
           end
      from public.organization_members m
     where m.org_id = p_org and m.user_id = p_user
  ), false);
$$;
revoke all on function private.member_may(uuid, uuid, text) from public;

create function private.require_permission(p_org uuid, p_user uuid, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.member_may(p_org, p_user, p_permission) then
    raise exception 'PERMISSION_WITHHELD' using errcode = '42501', detail = p_permission;
  end if;
end;
$$;
revoke all on function private.require_permission(uuid, uuid, text) from public;

-- Sets which permissions a member has. p_permissions: { "approve": true|false, ... };
-- a key left out keeps its current value.
create function public.app_set_member_permissions(p_org uuid, p_actor uuid, p_user uuid, p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.org_role;
  v_target public.org_role;
  v_old jsonb;
  v_new jsonb;
begin
  if jsonb_typeof(p_permissions) is distinct from 'object' or exists (
    select 1 from jsonb_each(p_permissions) e
     where e.key not in ('approve', 'publish', 'run_agents') or jsonb_typeof(e.value) <> 'boolean'
  ) then
    raise exception 'INVALID_PERMISSIONS' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select role into v_actor from public.organization_members where org_id = p_org and user_id = p_actor;
  select role, permissions into v_target, v_old from public.organization_members where org_id = p_org and user_id = p_user;
  if v_actor is null or v_target is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_actor not in ('owner', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- Owners and admins always have every permission, and viewers none.
  if v_target <> 'member' then
    raise exception 'INVALID_PERMISSIONS' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(k.key, false), '{}'::jsonb) into v_new
    from (
      select e.key from jsonb_each(v_old) e where not (p_permissions ? e.key)
      union
      select e.key from jsonb_each(p_permissions) e where e.value = 'false'::jsonb
    ) k;
  if v_new = v_old then
    return v_new;
  end if;
  update public.organization_members set permissions = v_new where org_id = p_org and user_id = p_user;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'member.permissions_changed', p_user::text, jsonb_build_object('from', v_old, 'to', v_new));
  return v_new;
end;
$$;
revoke all on function public.app_set_member_permissions(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_set_member_permissions(uuid, uuid, uuid, jsonb) to service_role;

-- A change that needs a person's approval applies only for someone who may
-- approve. One the workspace's autonomy allowed applies under its own limits.
create function private.refuse_withheld_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.policy ->> 'outcome', '') <> 'ALLOW_WITHIN_LIMITS' then
    perform private.require_permission(new.org_id, new.decided_by, 'approve');
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_withheld_approval() from public;
create trigger refuse_withheld_approval before update of status on public.change_proposals
  for each row when (old.status = 'pending' and new.status = 'applied')
  execute function private.refuse_withheld_approval();

-- tg_argv: the permission, then the column naming who acted.
create function private.refuse_withheld_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission(new.org_id, (to_jsonb(new) ->> tg_argv[1])::uuid, tg_argv[0]);
  return new;
end;
$$;
revoke all on function private.refuse_withheld_permission() from public;

create trigger refuse_withheld_publish before insert on public.site_deployments
  for each row execute function private.refuse_withheld_permission('publish', 'created_by');
create trigger refuse_withheld_launch before insert on public.launch_orders
  for each row execute function private.refuse_withheld_permission('publish', 'authorized_by');
create trigger refuse_withheld_agent_run before insert on public.agent_runs
  for each row execute function private.refuse_withheld_permission('run_agents', 'started_by');
create trigger refuse_withheld_arena_run before insert on public.arena_runs
  for each row execute function private.refuse_withheld_permission('run_agents', 'started_by');

-- Rolling a site back or taking it offline is publishing too.
create or replace function public.app_set_live_deployment(p_org uuid, p_actor uuid, p_site uuid, p_deployment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_number integer;
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.require_permission(p_org, p_actor, 'publish');
  select * into v_site from public.sites where id = p_site and org_id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_deployment is not null then
    select number into v_number from public.site_deployments where id = p_deployment and site_id = p_site;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
  update public.sites set live_deployment_id = p_deployment where id = p_site;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, case when p_deployment is null then 'site.unpublished' else 'site.rolled_back' end, p_site::text,
          jsonb_build_object('site', v_site.name, 'number', v_number));
end;
$$;

notify pgrst, 'reload schema';
