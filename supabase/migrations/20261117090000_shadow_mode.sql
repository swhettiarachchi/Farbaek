-- Farbaek schema v46: shadow mode, rehearsing autonomy level 2 (ADR 0075).
--
-- An owner or admin can rehearse level 2 before turning it on: every change
-- still waits for a person, and each proposal's policy records what level 2
-- would have decided, under policy -> 'shadow'. The server decides each
-- rehearsal; this migration adds the switch and keeps rehearsal records to
-- the time a workspace really rehearses. A late rehearsal is dropped, never
-- the proposal it rode with.

alter table public.org_autonomy add column shadow_since timestamptz;
alter table public.org_autonomy add constraint org_autonomy_shadow check (shadow_since is null or level = 0);

-- Whether a workspace rehearses level 2 right now.
create function private.autonomy_rehearses(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.org_autonomy a where a.org_id = p_org and a.shadow_since is not null);
$$;
revoke all on function private.autonomy_rehearses(uuid) from public;

-- Owners and admins set the level, its limits, and whether level 0 rehearses
-- level 2. p_shadow defaults to false, so calls made before this migration
-- keep working. Rehearsing again keeps its start; turning level 2 on ends it.
drop function public.app_set_autonomy(uuid, uuid, integer, integer, boolean);
create function public.app_set_autonomy(p_org uuid, p_actor uuid, p_level integer, p_max_files integer, p_allow_creates boolean, p_shadow boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.org_autonomy%rowtype;
  v_shadow boolean := p_level = 0 and coalesce(p_shadow, false);
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_level not in (0, 2) or p_max_files not between 1 and 5 then
    raise exception 'INVALID_AUTONOMY' using errcode = '22023';
  end if;
  select * into v_old from public.org_autonomy where org_id = p_org for update;
  insert into public.org_autonomy (org_id, level, max_files, allow_creates, suspended_at, suspended_reason, shadow_since, updated_by, updated_at)
  values (p_org, p_level, p_max_files, p_allow_creates, null, null, case when v_shadow then now() end, p_actor, now())
  on conflict (org_id) do update
    set level = excluded.level, max_files = excluded.max_files, allow_creates = excluded.allow_creates,
        suspended_at = case when excluded.level = 2 then null else public.org_autonomy.suspended_at end,
        suspended_reason = case when excluded.level = 2 then null else public.org_autonomy.suspended_reason end,
        shadow_since = case when v_shadow then coalesce(public.org_autonomy.shadow_since, now()) end,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'autonomy.changed', p_org::text, jsonb_build_object(
    'from', jsonb_build_object('level', coalesce(v_old.level, 0), 'max_files', v_old.max_files, 'allow_creates', v_old.allow_creates, 'suspended', v_old.suspended_at is not null, 'shadow', v_old.shadow_since is not null),
    'to', jsonb_build_object('level', p_level, 'max_files', p_max_files, 'allow_creates', p_allow_creates, 'shadow', v_shadow)));
end;
$$;
revoke all on function public.app_set_autonomy(uuid, uuid, integer, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.app_set_autonomy(uuid, uuid, integer, integer, boolean, boolean) to service_role;

-- No proposal is "allowed within limits" unless the workspace allows it at
-- that moment; a rehearsal is kept only while the workspace rehearses.
create or replace function private.refuse_autonomy_when_off()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.policy ->> 'outcome' = 'ALLOW_WITHIN_LIMITS' and not private.autonomy_allows(new.org_id) then
    raise exception 'AUTONOMY_OFF' using errcode = '42501';
  end if;
  if new.policy ? 'shadow' and (new.policy ->> 'outcome' = 'ALLOW_WITHIN_LIMITS' or not private.autonomy_rehearses(new.org_id)) then
    new.policy := new.policy - 'shadow';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_autonomy_when_off() from public;

-- PostgREST picks up the new function signature.
notify pgrst, 'reload schema';
