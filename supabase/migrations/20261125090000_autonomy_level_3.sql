-- Farbaek schema v54: autonomy level 3, earned and bounded (ADR 0086).
--
-- Level 3 lets wider changes apply on their own (up to 10 files, new files
-- if chosen), within a daily budget the workspace sets. It can only be
-- turned on after a clean record: in the last 30 days, at least 10 changes
-- applied on their own passed their checks and none failed or only partly
-- passed. A failure pauses autonomy as at level 2, and stays in the record,
-- so level 3 can't come back until it's earned again.

alter table public.org_autonomy drop constraint org_autonomy_level_check;
alter table public.org_autonomy drop constraint org_autonomy_max_files_check;
alter table public.org_autonomy add column daily_limit smallint;
alter table public.org_autonomy add constraint org_autonomy_level_check check (level in (0, 2, 3));
alter table public.org_autonomy add constraint org_autonomy_max_files_check
  check (max_files between 1 and 5 or (level = 3 and max_files between 1 and 10));
alter table public.org_autonomy add constraint org_autonomy_daily_limit_check
  check ((level = 3) = (daily_limit is not null) and (daily_limit is null or daily_limit between 1 and 50));

-- Changes applied on their own in the last 30 days, by their newest ProofPack.
create function private.autonomy_record(p_org uuid)
returns table (verified integer, failed integer)
language sql
stable
security definer
set search_path = ''
as $$
  with auto as (
    select distinct p.proposal_id
      from public.proofpacks p
     where p.org_id = p_org
       and p.proposal_id is not null
       and p.created_at >= now() - interval '30 days'
       and p.statement -> 'predicate' -> 'approval' ->> 'by' = 'policy'
  ), latest as (
    select (select pp.status from public.proofpacks pp where pp.proposal_id = a.proposal_id order by pp.seq desc limit 1) as status
      from auto a
  )
  select (count(*) filter (where status = 'verified'))::integer,
         (count(*) filter (where status in ('failed', 'partially_verified')))::integer
    from latest;
$$;
revoke all on function private.autonomy_record(uuid) from public;

-- The same record for the Settings page, read as the person.
create function public.app_autonomy_record(p_org uuid)
returns table (verified integer, failed integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with auto as (
    select distinct p.proposal_id
      from public.proofpacks p
     where p.org_id = p_org
       and p.proposal_id is not null
       and p.created_at >= now() - interval '30 days'
       and p.statement -> 'predicate' -> 'approval' ->> 'by' = 'policy'
  ), latest as (
    select (select pp.status from public.proofpacks pp where pp.proposal_id = a.proposal_id order by pp.seq desc limit 1) as status
      from auto a
  )
  select (count(*) filter (where status = 'verified'))::integer,
         (count(*) filter (where status in ('failed', 'partially_verified')))::integer
    from latest;
$$;
revoke all on function public.app_autonomy_record(uuid) from public, anon;
grant execute on function public.app_autonomy_record(uuid) to authenticated, service_role;

create or replace function private.autonomy_allows(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.org_autonomy a where a.org_id = p_org and a.level in (2, 3) and a.suspended_at is null);
$$;

create or replace function private.suspend_autonomy_on_failure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by_policy boolean;
begin
  if new.status not in ('failed', 'partially_verified') or new.proposal_id is null then
    return new;
  end if;
  select (p.statement -> 'predicate' -> 'approval' ->> 'by') = 'policy' into v_by_policy
  from public.proofpacks p where p.proposal_id = new.proposal_id order by p.seq asc limit 1;
  if coalesce(v_by_policy, false) then
    update public.org_autonomy
       set suspended_at = now(),
           suspended_reason = 'A change applied on its own failed its checks on ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD') || '. Review it, then turn autonomy on again.'
     where org_id = new.org_id and level in (2, 3) and suspended_at is null;
    if found then
      insert into public.audit_events (org_id, actor_id, action, target, metadata)
      values (new.org_id, null, 'autonomy.suspended', new.proposal_id::text, jsonb_build_object('proofpack', new.digest, 'status', new.status));
    end if;
  end if;
  return new;
end;
$$;

drop function public.app_set_autonomy(uuid, uuid, integer, integer, boolean, boolean);
create function public.app_set_autonomy(
  p_org uuid, p_actor uuid, p_level integer, p_max_files integer, p_allow_creates boolean, p_shadow boolean default false, p_daily_limit integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.org_autonomy%rowtype;
  v_shadow boolean := p_level = 0 and coalesce(p_shadow, false);
  v_daily smallint := case when p_level = 3 then p_daily_limit end;
  v_verified integer;
  v_failed integer;
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_level not in (0, 2, 3)
     or (p_level <> 3 and p_max_files not between 1 and 5)
     or (p_level = 3 and (p_max_files not between 1 and 10 or coalesce(p_daily_limit, 0) not between 1 and 50)) then
    raise exception 'INVALID_AUTONOMY' using errcode = '22023';
  end if;
  select * into v_old from public.org_autonomy where org_id = p_org for update;
  -- Earned on the way in, and again after a failure paused it; changing the limits of a running level 3 needs nothing more.
  if p_level = 3 and (coalesce(v_old.level, 0) <> 3 or v_old.suspended_at is not null) then
    select r.verified, r.failed into v_verified, v_failed from private.autonomy_record(p_org) r;
    if coalesce(v_verified, 0) < 10 or coalesce(v_failed, 0) > 0 then
      raise exception 'AUTONOMY_NOT_EARNED' using errcode = '42501';
    end if;
  end if;
  insert into public.org_autonomy (org_id, level, max_files, allow_creates, daily_limit, suspended_at, suspended_reason, shadow_since, updated_by, updated_at)
  values (p_org, p_level, p_max_files, p_allow_creates, v_daily, null, null, case when v_shadow then now() end, p_actor, now())
  on conflict (org_id) do update
    set level = excluded.level, max_files = excluded.max_files, allow_creates = excluded.allow_creates, daily_limit = excluded.daily_limit,
        suspended_at = case when excluded.level in (2, 3) then null else public.org_autonomy.suspended_at end,
        suspended_reason = case when excluded.level in (2, 3) then null else public.org_autonomy.suspended_reason end,
        shadow_since = case when v_shadow then coalesce(public.org_autonomy.shadow_since, now()) end,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'autonomy.changed', p_org::text, jsonb_build_object(
    'from', jsonb_build_object('level', coalesce(v_old.level, 0), 'max_files', v_old.max_files, 'allow_creates', v_old.allow_creates, 'daily_limit', v_old.daily_limit, 'suspended', v_old.suspended_at is not null, 'shadow', v_old.shadow_since is not null),
    'to', jsonb_build_object('level', p_level, 'max_files', p_max_files, 'allow_creates', p_allow_creates, 'daily_limit', v_daily, 'shadow', v_shadow)));
end;
$$;
revoke all on function public.app_set_autonomy(uuid, uuid, integer, integer, boolean, boolean, integer) from public, anon, authenticated;
grant execute on function public.app_set_autonomy(uuid, uuid, integer, integer, boolean, boolean, integer) to service_role;

-- No proposal is "allowed within limits" unless the workspace allows it at
-- that moment and, at level 3, its daily budget has room; a rehearsal is
-- kept only while the workspace rehearses.
create or replace function private.refuse_autonomy_when_off()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_daily smallint;
begin
  if new.policy ->> 'outcome' = 'ALLOW_WITHIN_LIMITS' then
    if not private.autonomy_allows(new.org_id) then
      raise exception 'AUTONOMY_OFF' using errcode = '42501';
    end if;
    v_daily := private.autonomy_daily_limit(new.org_id);
    if v_daily is not null and private.applied_on_own_today(new.org_id) >= v_daily then
      raise exception 'AUTONOMY_DAILY_LIMIT' using errcode = '42501';
    end if;
  end if;
  if new.policy ? 'shadow' and (new.policy ->> 'outcome' = 'ALLOW_WITHIN_LIMITS' or not private.autonomy_rehearses(new.org_id)) then
    new.policy := new.policy - 'shadow';
  end if;
  return new;
end;
$$;

create function private.autonomy_daily_limit(p_org uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select a.daily_limit from public.org_autonomy a where a.org_id = p_org and a.level = 3;
$$;
revoke all on function private.autonomy_daily_limit(uuid) from public;

create function private.applied_on_own_today(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.change_proposals p
   where p.org_id = p_org and p.policy ->> 'outcome' = 'ALLOW_WITHIN_LIMITS' and p.created_at >= now() - interval '24 hours';
$$;
revoke all on function private.applied_on_own_today(uuid) from public;

notify pgrst, 'reload schema';
