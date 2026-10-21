-- Farbaek schema v22: Office Space trial extensions and the owner's numbers
-- (ADR 0032, phase 3).
--
-- A trial can now run 14 to 44 days, so staff can extend one; new trials
-- stay exactly 14 days (create_organization is unchanged). Extensions are
-- capped by role and move the trial's usage grant with it. The metrics
-- function reads everything once, on the server, for the office overview,
-- and the search function backs the office's quick search. Revenue isn't
-- here: billing stays not_connected until go-live.

alter table public.trials drop constraint trials_length_14_days;
alter table public.trials add constraint trials_length_14_to_44_days
  check (ends_at >= started_at + interval '14 days' and ends_at <= started_at + interval '44 days');

-- Support may add up to 7 days once; admins up to 14; owners up to 30. A
-- trial never runs past 44 days from its start.
create function public.app_staff_extend_trial(
  p_actor uuid,
  p_session uuid,
  p_org uuid,
  p_days integer,
  p_reason text,
  p_ip_hash text,
  p_ua text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'trial.extend');
  v_reason text := private.require_reason(p_reason);
  v_trial record;
  v_cap integer;
  v_end timestamptz;
begin
  if p_days is null or p_days < 1 then
    raise exception 'INVALID_DAYS' using errcode = 'P0001';
  end if;
  v_cap := case v_role when 'owner' then 30 when 'admin' then 14 when 'support' then 7 else 0 end;
  if p_days > v_cap then
    raise exception 'TRIAL_CAP' using errcode = 'P0001';
  end if;
  select t.started_at, t.ends_at into v_trial from public.trials t where t.org_id = p_org for update;
  if not found then
    raise exception 'NO_TRIAL' using errcode = 'P0001';
  end if;
  if v_role = 'support' and v_trial.ends_at <> v_trial.started_at + interval '14 days' then
    raise exception 'ALREADY_EXTENDED' using errcode = 'P0001';
  end if;
  v_end := greatest(v_trial.ends_at, now()) + make_interval(days => p_days);
  if v_end > v_trial.started_at + interval '44 days' then
    raise exception 'TRIAL_LIMIT' using errcode = 'P0001';
  end if;
  update public.trials set ends_at = v_end where org_id = p_org;
  update public.usage_grants set expires_at = v_end where org_id = p_org and kind = 'trial';
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, null, 'farbaek.trial_extended', p_org::text, jsonb_build_object('days', p_days, 'ends_at', v_end));
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'trial.extended', 'workspace', p_org::text, p_org, v_reason, null, 'success',
    jsonb_build_object('days', p_days, 'from', v_trial.ends_at, 'to', v_end), p_ip_hash, p_ua, null);
  return v_end;
end;
$$;

-- The owner's numbers, read in one call. Counts only: no names, no emails,
-- no money other than AI list cost (an estimate until reconciled).
create function public.app_office_metrics(p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(date_trunc('day', p_now) - interval '13 days', date_trunc('day', p_now), interval '1 day') as day
  ),
  active as (
    select org_id from public.tasks where updated_at > p_now - interval '7 days'
    union select org_id from public.agent_runs where started_at > p_now - interval '7 days'
    union select org_id from public.project_file_revisions where created_at > p_now - interval '7 days'
    union select org_id from public.site_deployments where created_at > p_now - interval '7 days'
  ),
  cohort as (
    select o.id, o.created_at from public.organizations o
    where o.created_at <= p_now - interval '8 days' and o.created_at > p_now - interval '60 days'
  ),
  activated as (
    select c.id from cohort c
    where exists (select 1 from public.intent_contracts ic where ic.org_id = c.id and ic.approved_at <= c.created_at + interval '7 days')
      and (
        exists (select 1 from public.proofpacks p where p.org_id = c.id and p.status = 'verified' and p.created_at <= c.created_at + interval '7 days')
        or exists (select 1 from public.site_deployments d where d.org_id = c.id and d.created_at <= c.created_at + interval '7 days')
      )
  )
  select jsonb_build_object(
    'signups', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'last7', (select count(*) from auth.users u where u.created_at > p_now - interval '7 days'),
      'last30', (select count(*) from auth.users u where u.created_at > p_now - interval '30 days'),
      'byDay', (select jsonb_agg((select count(*) from auth.users u where u.created_at >= d.day and u.created_at < d.day + interval '1 day') order by d.day) from days d)
    ),
    'workspaces', jsonb_build_object(
      'total', (select count(*) from public.organizations),
      'new7', (select count(*) from public.organizations o where o.created_at > p_now - interval '7 days'),
      'active7', (select count(*) from active),
      'suspended', (select count(*) from public.organizations o where o.suspended_at is not null)
    ),
    'activation', jsonb_build_object(
      'cohort', (select count(*) from cohort),
      'activated', (select count(*) from activated)
    ),
    'sites', jsonb_build_object(
      'live', (select count(*) from public.sites s where s.live_deployment_id is not null and s.blocked_at is null),
      'blocked', (select count(*) from public.sites s where s.blocked_at is not null)
    ),
    'aiUnitsByDay', (select jsonb_agg((
        select coalesce(sum(l.credits), 0) from public.ai_credit_ledger l
        where l.status = 'settled' and l.created_at >= d.day and l.created_at < d.day + interval '1 day'
      ) order by d.day) from days d),
    'runs7', jsonb_build_object(
      'total', (select count(*) from public.agent_runs r where r.started_at > p_now - interval '7 days'),
      'finished', (select count(*) from public.agent_runs r where r.started_at > p_now - interval '7 days' and r.status = 'finished'),
      'failed', (select count(*) from public.agent_runs r where r.started_at > p_now - interval '7 days' and r.status = 'failed'),
      'stopped', (select count(*) from public.agent_runs r where r.started_at > p_now - interval '7 days' and r.status in ('cancelled', 'interrupted'))
    ),
    'trials', jsonb_build_object(
      'started30', (select count(*) from public.trials t where t.started_at > p_now - interval '30 days'),
      'active', (select count(*) from public.trials t where t.ends_at > p_now),
      'ended', (select count(*) from public.trials t where t.ends_at <= p_now),
      'extended', (select count(*) from public.trials t where t.ends_at > t.started_at + interval '14 days'),
      'paid', (select count(*) from public.billing_accounts b where b.state in ('active', 'past_due', 'cancellation_scheduled'))
    )
  );
$$;

-- Quick search for Office Space: workspaces by name or id prefix, people by
-- email, sites by name. At most 8 of each; the server masks emails for roles
-- that may not read them. Read-only, service role only.
create function public.app_office_search(p_query text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select lower(btrim(p_query)) as raw,
      '%' || replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select case when char_length((select raw from q)) < 2 or char_length((select raw from q)) > 100
    then jsonb_build_object('workspaces', '[]'::jsonb, 'people', '[]'::jsonb, 'sites', '[]'::jsonb)
    else jsonb_build_object(
      'workspaces', coalesce((
        select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'suspended', w.suspended_at is not null) order by w.created_at desc)
        from (
          select o.id, o.name, o.suspended_at, o.created_at from public.organizations o, q
          where lower(o.name) like q.pattern or starts_with(o.id::text, q.raw)
          order by o.created_at desc limit 8
        ) w
      ), '[]'::jsonb),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'orgId', u.org_id) order by u.created_at desc)
        from (
          select au.id, au.email, au.created_at,
            (select m.org_id from public.organization_members m where m.user_id = au.id order by m.created_at limit 1) as org_id
          from auth.users au, q
          where lower(au.email) like q.pattern
          order by au.created_at desc limit 8
        ) u
      ), '[]'::jsonb),
      'sites', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'orgId', x.org_id, 'workspace', x.workspace, 'live', x.live, 'blocked', x.blocked) order by x.created_at desc)
        from (
          select s.id, s.name, s.org_id, o.name as workspace, s.live_deployment_id is not null as live, s.blocked_at is not null as blocked, s.created_at
          from public.sites s join public.organizations o on o.id = s.org_id, q
          where lower(s.name) like q.pattern
          order by s.created_at desc limit 8
        ) x
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.app_staff_extend_trial(uuid, uuid, uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.app_office_metrics(timestamptz) from public, anon, authenticated;
revoke all on function public.app_office_search(text) from public, anon, authenticated;
grant execute on function public.app_staff_extend_trial(uuid, uuid, uuid, integer, text, text, text) to service_role;
grant execute on function public.app_office_metrics(timestamptz) to service_role;
grant execute on function public.app_office_search(text) to service_role;
