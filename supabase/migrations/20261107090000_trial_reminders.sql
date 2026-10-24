-- Farbaek schema v36: trial reminders, and the emails a person wants (ADR 0063).
--
-- An hourly job sends each workspace's owners the trial reminders the spec
-- asks for (day 7, day 12, day 13 and at expiry). Every reminder is recorded
-- once per workspace and kind, with what happened: accepted by the mail
-- server (not "delivered", which no mail server confirms), failed, skipped
-- (superseded by a later one, or too late), or no one to send it to. A claim
-- before sending means two runs at once can't both send it.
--
-- A person can turn off the emails about their work and the trial reminders.
-- No row means both are on.

create table public.trial_reminders (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  kind        text not null check (kind in ('day_7', 'day_12', 'day_13', 'expiry')),
  status      text not null check (status in ('sending', 'accepted', 'failed', 'skipped', 'no_recipient')),
  detail      text check (char_length(detail) <= 300),
  recipients  integer not null default 0 check (recipients >= 0),
  attempts    integer not null default 1 check (attempts between 0 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, kind)
);

alter table public.trial_reminders enable row level security;
revoke all on public.trial_reminders from anon, authenticated;
grant select on public.trial_reminders to authenticated;
create policy "members read their workspace's trial reminders" on public.trial_reminders
  for select to authenticated using ((select private.is_member(org_id)));

create table public.email_preferences (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  work_updates     boolean not null default true,
  trial_reminders  boolean not null default true,
  updated_at       timestamptz not null default now()
);

alter table public.email_preferences enable row level security;
revoke all on public.email_preferences from anon, authenticated;
grant select on public.email_preferences to authenticated;
create policy "people read their own email preferences" on public.email_preferences
  for select to authenticated using (user_id = (select auth.uid()));

-- Claims a reminder before it's sent. A new one is claimed once; a failed one
-- can be claimed again, three tries in all. Anything else isn't sent twice.
create function public.app_claim_trial_reminder(p_org uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trial_reminders (org_id, kind, status)
  values (p_org, p_kind, 'sending')
  on conflict (org_id, kind) do update
    set status = 'sending', attempts = public.trial_reminders.attempts + 1, detail = null, updated_at = now()
    where public.trial_reminders.status = 'failed' and public.trial_reminders.attempts < 3;
  return found;
end;
$$;

-- Records what happened to a claimed reminder.
create function public.app_finish_trial_reminder(p_org uuid, p_kind text, p_status text, p_recipients integer, p_detail text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status is null or p_status not in ('accepted', 'failed', 'no_recipient') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  update public.trial_reminders set
    status = p_status,
    recipients = greatest(0, coalesce(p_recipients, 0)),
    detail = left(nullif(btrim(coalesce(p_detail, '')), ''), 300),
    updated_at = now()
  where org_id = p_org and kind = p_kind and status = 'sending';
  return found;
end;
$$;

-- Records a reminder that won't be sent, unless it's already recorded.
create function public.app_skip_trial_reminder(p_org uuid, p_kind text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason is null or p_reason not in ('superseded', 'too_late') then
    raise exception 'INVALID_REASON' using errcode = '22023';
  end if;
  insert into public.trial_reminders (org_id, kind, status, detail, attempts)
  values (p_org, p_kind, 'skipped', p_reason, 0)
  on conflict (org_id, kind) do nothing;
  return found;
end;
$$;

-- The workspaces on a trial, or whose trial ended in the last three days,
-- that aren't suspended: their window, the reminders already recorded (a
-- failed one with tries left doesn't count) and their owners.
create function public.app_trial_reminder_candidates(p_now timestamptz default now())
returns table (org_id uuid, org_name text, started_at timestamptz, ends_at timestamptz, recorded text[], owners uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select t.org_id, o.name, t.started_at, t.ends_at,
    coalesce((select array_agg(r.kind order by r.kind) from public.trial_reminders r
              where r.org_id = t.org_id and not (r.status = 'failed' and r.attempts < 3)), '{}'),
    coalesce((select array_agg(m.user_id order by m.user_id) from public.organization_members m
              where m.org_id = t.org_id and m.role = 'owner'), '{}')
  from public.trials t
  join public.organizations o on o.id = t.org_id
  join public.billing_accounts b on b.org_id = t.org_id
  where b.state in ('trialing', 'checkout_pending')
    and o.suspended_at is null
    and t.ends_at > p_now - interval '3 days'
  order by t.ends_at;
$$;

-- Saves which emails a person wants.
create function public.app_set_email_preferences(p_user uuid, p_work_updates boolean, p_trial_reminders boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_work_updates is null or p_trial_reminders is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  insert into public.email_preferences (user_id, work_updates, trial_reminders, updated_at)
  values (p_user, p_work_updates, p_trial_reminders, now())
  on conflict (user_id) do update
    set work_updates = excluded.work_updates, trial_reminders = excluded.trial_reminders, updated_at = now();
end;
$$;

revoke all on function public.app_claim_trial_reminder(uuid, text) from public, anon, authenticated;
revoke all on function public.app_finish_trial_reminder(uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.app_skip_trial_reminder(uuid, text, text) from public, anon, authenticated;
revoke all on function public.app_trial_reminder_candidates(timestamptz) from public, anon, authenticated;
revoke all on function public.app_set_email_preferences(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.app_claim_trial_reminder(uuid, text) to service_role;
grant execute on function public.app_finish_trial_reminder(uuid, text, text, integer, text) to service_role;
grant execute on function public.app_skip_trial_reminder(uuid, text, text) to service_role;
grant execute on function public.app_trial_reminder_candidates(timestamptz) to service_role;
grant execute on function public.app_set_email_preferences(uuid, boolean, boolean) to service_role;

notify pgrst, 'reload schema';
