-- Farbaek core schema v1: organizations, membership, trial, billing state,
-- governed-evaluation usage, tasks and audit events.
--
-- Security model:
--   * Every table has Row Level Security. Server code still authorizes every
--     request; RLS is defence in depth.
--   * Browser roles (anon, authenticated) get explicit, minimal grants.
--     Writes to billing, trial, usage, task state and audit happen only through
--     security-definer functions or the server's secret key.
--   * Helper functions live in the private schema, which the Data API does
--     not expose.
--
-- The trial length (14 days) and the plan catalog version must match
-- src/core/billing/catalog.ts. tests/db/schema.test.ts checks this.

create schema if not exists private;

-- ---------------------------------------------------------------- types

create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');

create type public.subscription_state as enum (
  'free', 'trialing', 'checkout_pending', 'active', 'past_due',
  'cancellation_scheduled', 'suspended', 'expired'
);

-- --------------------------------------------------------------- tables

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.organization_members (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.org_role not null default 'member',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- One trial per organization (primary key) and per user (unique started_by).
create table public.trials (
  org_id      uuid primary key references public.organizations (id) on delete cascade,
  started_by  uuid unique references auth.users (id) on delete set null,
  plan_id     text not null default 'team' check (plan_id = 'team'),
  started_at  timestamptz not null default now(),
  ends_at     timestamptz not null,
  constraint trials_length_14_days check (ends_at = started_at + interval '14 days')
);

-- Billing state mirrors src/core/billing/trial.ts BillingSnapshot. Written only
-- by Farbaek (trial start here, provider webhooks later), never by the browser.
create table public.billing_accounts (
  org_id                uuid primary key references public.organizations (id) on delete cascade,
  state                 public.subscription_state not null default 'free',
  paid_plan_id          text check (paid_plan_id in ('developer', 'team', 'business', 'enterprise')),
  paid_through          timestamptz,
  suspended_reason      text check (suspended_reason in ('payment', 'paused')),
  plan_catalog_version  text not null,
  updated_at            timestamptz not null default now()
);

-- One governed evaluation = one unique authenticated request; retries with the
-- same idempotency key count once per organization (primary key).
create table public.evaluation_events (
  org_id           uuid not null references public.organizations (id) on delete cascade,
  idempotency_key  text not null check (char_length(idempotency_key) between 1 and 200),
  outcome          text not null check (outcome in
                     ('ALLOW', 'ALLOW_WITHIN_LIMITS', 'REQUIRE_APPROVAL', 'SIMULATE_FIRST', 'ESCALATE', 'BLOCK')),
  occurred_at      timestamptz not null default now(),
  primary key (org_id, idempotency_key)
);
create index evaluation_events_period_idx on public.evaluation_events (org_id, occurred_at);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  state       text not null default 'RECEIVED' check (state in (
                'RECEIVED', 'CONTEXT_ASSEMBLED', 'CONTRACT_DRAFTED', 'CONTRACT_APPROVED', 'PLAN_PROPOSED',
                'POLICY_EVALUATED', 'APPROVAL_PENDING', 'EXECUTION_AUTHORIZED', 'EXECUTING', 'VERIFYING',
                'VERIFIED', 'PARTIALLY_VERIFIED', 'FAILED', 'REVIEW_REQUIRED', 'BLOCKED', 'REJECTED',
                'EXPIRED', 'CANCELLED', 'INTERRUPTED', 'RECOVERY_PENDING', 'RECOVERED',
                'REQUIRES_HUMAN_INTERVENTION')),
  version     integer not null default 0 check (version >= 0),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_org_created_idx on public.tasks (org_id, created_at desc);

-- Applied by server code through the RealityLoop state machine with an
-- optimistic version check. (task_id, event_id) makes replays no-ops.
create table public.task_transitions (
  task_id      uuid not null references public.tasks (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  event_id     text not null check (char_length(event_id) between 1 and 200),
  event_type   text not null,
  from_state   text not null,
  to_state     text not null,
  actor_kind   text not null check (actor_kind in ('user', 'agent', 'system')),
  actor_id     text not null,
  occurred_at  timestamptz not null default now(),
  primary key (task_id, event_id)
);
create index task_transitions_org_idx on public.task_transitions (org_id, occurred_at desc);

create table public.audit_events (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  actor_id     uuid,
  action       text not null,
  target       text,
  metadata     jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events (org_id, occurred_at desc);

-- -------------------------------------------------- membership helpers

create function private.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create function private.has_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.is_member(uuid) from public;
revoke all on function private.has_role(uuid, public.org_role[]) from public;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.org_role[]) to authenticated;

-- ------------------------------------------------- organization creation

-- Creates an organization owned by the caller. The caller's first
-- organization gets the 14-day Team trial (no card); later ones start on Free.
create function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_org uuid;
  v_trial_started boolean := false;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  if char_length(v_name) not between 1 and 80 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  insert into public.organizations (name, created_by) values (v_name, v_uid) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org, v_uid, 'owner');

  insert into public.trials (org_id, started_by, started_at, ends_at)
  values (v_org, v_uid, now(), now() + interval '14 days')
  on conflict (started_by) do nothing;
  v_trial_started := found;

  insert into public.billing_accounts (org_id, state, plan_catalog_version)
  values (v_org, case when v_trial_started then 'trialing' else 'free' end::public.subscription_state, '2026-10-13.1');

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, v_uid, 'organization.created', v_org::text, jsonb_build_object('trial_started', v_trial_started));

  return v_org;
end;
$$;

revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

-- --------------------------------------------------- row level security

alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.trials               enable row level security;
alter table public.billing_accounts     enable row level security;
alter table public.evaluation_events    enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_transitions     enable row level security;
alter table public.audit_events         enable row level security;

-- Least-privilege grants. Supabase's default privileges grant everything to
-- anon and authenticated; start from nothing instead.
revoke all on public.organizations, public.organization_members, public.trials, public.billing_accounts,
  public.evaluation_events, public.tasks, public.task_transitions, public.audit_events
  from anon, authenticated;

grant select on public.organizations, public.organization_members, public.trials, public.billing_accounts,
  public.evaluation_events, public.tasks, public.task_transitions, public.audit_events
  to authenticated;
grant update (name) on public.organizations to authenticated;
grant insert (org_id, title, created_by) on public.tasks to authenticated;

create policy "members read their organizations" on public.organizations
  for select to authenticated using ((select private.is_member(id)));

create policy "owners and admins rename organizations" on public.organizations
  for update to authenticated
  using ((select private.has_role(id, array['owner', 'admin']::public.org_role[])))
  with check ((select private.has_role(id, array['owner', 'admin']::public.org_role[])));

create policy "members read membership" on public.organization_members
  for select to authenticated using ((select private.is_member(org_id)));

create policy "members read the trial" on public.trials
  for select to authenticated using ((select private.is_member(org_id)));

create policy "members read billing state" on public.billing_accounts
  for select to authenticated using ((select private.is_member(org_id)));

create policy "members read usage" on public.evaluation_events
  for select to authenticated using ((select private.is_member(org_id)));

create policy "members read tasks" on public.tasks
  for select to authenticated using ((select private.is_member(org_id)));

-- New tasks always start at RECEIVED / version 0 (column defaults; the browser
-- can't set state or version). State changes go through the server.
create policy "contributors create tasks" on public.tasks
  for insert to authenticated
  with check (
    (select private.has_role(org_id, array['owner', 'admin', 'member']::public.org_role[]))
    and created_by = (select auth.uid())
  );

create policy "members read task history" on public.task_transitions
  for select to authenticated using ((select private.is_member(org_id)));

create policy "members read audit events" on public.audit_events
  for select to authenticated using ((select private.is_member(org_id)));
