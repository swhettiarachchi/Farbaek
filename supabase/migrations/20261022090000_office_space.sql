-- Farbaek schema v20: Office Space, the staff console (ADR 0032).
--
-- Farbaek's own staff (owner, admin, support, trust and safety, viewer) sign
-- in at the office host with an email code and an authenticator code. Their
-- role, their sessions and every action they take live here, and only these
-- functions write them. The server key can read these tables but not change
-- them directly, and the audit log is append-only and hash-chained: each
-- event stores SHA-256(previous hash + its facts), so a deleted, edited or
-- reordered event shows when the chain is checked.
--
-- Policy numbers (kept equal to src/config/office.ts by a test): a session
-- ends after interval '30 minutes' idle or interval '12 hours' after the
-- email code; an invite lasts at most interval '7 days'; a reason is
-- between 10 and 500 characters.

-- ------------------------------------------------------------------ tables

create table public.staff_members (
  user_id          uuid primary key references auth.users (id) on delete restrict,
  email            text not null check (email = lower(email) and length(email) between 3 and 254),
  role             text not null check (role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')),
  invited_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  removed_at       timestamptz,
  removed_by       uuid,
  mfa_reset_until  timestamptz
);
create unique index staff_members_active_email on public.staff_members (email) where removed_at is null;

create table public.staff_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email) and length(email) between 3 and 254),
  role         text not null check (role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')),
  invited_by   uuid not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid,
  revoked_at   timestamptz,
  revoked_by   uuid,
  constraint staff_invites_window check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create unique index staff_invites_one_open on public.staff_invites (email) where accepted_at is null and revoked_at is null;

-- One row per office sign-in, keyed by the Supabase session id in the JWT.
create table public.staff_sessions (
  session_id       uuid primary key,
  user_id          uuid not null,
  started_at       timestamptz not null default now(),
  first_factor_at  timestamptz not null,
  last_seen_at     timestamptz not null default now(),
  ended_at         timestamptz,
  end_reason       text check (end_reason in ('signed_out', 'idle', 'expired', 'replaced', 'revoked', 'removed', 'auth_session_gone')),
  ended_by         uuid,
  ip_hash          text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{32}$'),
  user_agent       text check (user_agent is null or length(user_agent) <= 300)
);
create index staff_sessions_open on public.staff_sessions (user_id) where ended_at is null;

-- The audit log. No foreign keys: a cascade would be an update or delete.
create table public.staff_audit_events (
  seq                 bigint primary key,
  occurred_at         timestamptz not null,
  actor_user_id       uuid,
  actor_role          text,
  actor_session_hash  text,
  auth_strength       text not null check (auth_strength in ('aal1', 'aal2', 'step_up', 'system')),
  action              text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_type         text check (target_type is null or length(target_type) <= 40),
  target_id           text check (target_id is null or length(target_id) <= 100),
  org_id              uuid,
  reason              text check (reason is null or length(reason) <= 500),
  ticket_ref          text check (ticket_ref is null or length(ticket_ref) <= 100),
  result              text not null check (result in ('success', 'denied', 'error')),
  detail              jsonb not null default '{}'::jsonb,
  ip_hash             text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{32}$'),
  user_agent          text check (user_agent is null or length(user_agent) <= 300),
  request_id          text check (request_id is null or length(request_id) <= 64),
  prev_hash           text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  envelope            text not null,
  row_hash            text not null unique check (row_hash ~ '^[0-9a-f]{64}$')
);
create index staff_audit_events_actor on public.staff_audit_events (actor_user_id, seq desc);
create index staff_audit_events_org on public.staff_audit_events (org_id, seq desc) where org_id is not null;

-- Each check of the chain, append-only too.
create table public.staff_audit_verifications (
  id             bigint generated always as identity primary key,
  verified_by    uuid,
  verified_at    timestamptz not null default now(),
  through_seq    bigint not null,
  head_hash      text check (head_hash is null or head_hash ~ '^[0-9a-f]{64}$'),
  ok             boolean not null,
  first_bad_seq  bigint
);

-- The chain's head: the last event's number and hash, locked by every writer.
create table private.staff_audit_head (
  id    boolean primary key default true check (id),
  seq   bigint not null,
  hash  text not null
);
insert into private.staff_audit_head (id, seq, hash) values (true, 0, repeat('0', 64));
revoke all on private.staff_audit_head from public, anon, authenticated;

-- ------------------------------------------------------------------ access

alter table public.staff_members enable row level security;
alter table public.staff_invites enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.staff_audit_events enable row level security;
alter table public.staff_audit_verifications enable row level security;

-- No policies: browsers read and write nothing here. The server key reads;
-- only the functions below write.
revoke all on public.staff_members, public.staff_invites, public.staff_sessions, public.staff_audit_events, public.staff_audit_verifications
  from public, anon, authenticated, service_role;
grant select on public.staff_members, public.staff_invites, public.staff_sessions, public.staff_audit_events, public.staff_audit_verifications
  to service_role;

-- ------------------------------------------------------------------ guards

create function private.refuse_staff_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'STAFF_AUDIT_IMMUTABLE' using errcode = '42501';
end;
$$;
create trigger staff_audit_events_immutable before update or delete on public.staff_audit_events
  for each row execute function private.refuse_staff_audit_change();
create trigger staff_audit_events_no_truncate before truncate on public.staff_audit_events
  for each statement execute function private.refuse_staff_audit_change();
create trigger staff_audit_verifications_immutable before update or delete on public.staff_audit_verifications
  for each row execute function private.refuse_staff_audit_change();
create trigger staff_audit_verifications_no_truncate before truncate on public.staff_audit_verifications
  for each statement execute function private.refuse_staff_audit_change();

-- Staff rows are kept (removal is a date), and the office always has an owner.
create function private.staff_keep_an_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'STAFF_ROWS_ARE_KEPT' using errcode = 'P0001';
  end if;
  if old.role = 'owner' and old.removed_at is null and (new.role <> 'owner' or new.removed_at is not null)
     and not exists (select 1 from public.staff_members m where m.role = 'owner' and m.removed_at is null and m.user_id <> old.user_id) then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger staff_members_keep_owner before update or delete on public.staff_members
  for each row execute function private.staff_keep_an_owner();

-- ------------------------------------------------------------------ helpers

-- The permission matrix. Mirrors PERMISSIONS in src/core/office/permissions.ts.
create function private.staff_can(p_role text, p_action text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case p_action
    when 'console.read'          then p_role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')
    when 'people.read_email'     then p_role in ('owner', 'admin', 'support', 'trust_safety')
    when 'audit.read_all'        then p_role in ('owner', 'admin', 'viewer')
    when 'audit.verify'          then p_role in ('owner', 'admin')
    when 'staff.read'            then p_role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')
    when 'staff.manage'          then p_role in ('owner')
    when 'workspace.suspend'     then p_role in ('owner', 'admin', 'trust_safety')
    when 'site.block'            then p_role in ('owner', 'admin', 'trust_safety')
    when 'usage.add'             then p_role in ('owner', 'admin')
    when 'trial.extend'          then p_role in ('owner', 'admin', 'support')
    when 'flags.set'             then p_role in ('owner')
    when 'announcements.manage'  then p_role in ('owner', 'admin')
    else false
  end, false);
$$;
revoke all on function private.staff_can(text, text) from public;

-- Appends one event to the chain. The head row's lock orders concurrent writers.
create function private.record_staff_event(
  p_actor uuid,
  p_role text,
  p_session uuid,
  p_strength text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_org uuid,
  p_reason text,
  p_ticket text,
  p_result text,
  p_detail jsonb,
  p_ip_hash text,
  p_ua text,
  p_request text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_head record;
  v_seq bigint;
  v_at timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_session_hash text := case when p_session is null then null else encode(sha256(convert_to(p_session::text, 'UTF8')), 'hex') end;
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
  v_env text;
  v_hash text;
begin
  select seq, hash into v_head from private.staff_audit_head where id for update;
  v_seq := v_head.seq + 1;
  v_env := jsonb_build_object(
    'v', 1,
    'seq', v_seq,
    'at', to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actor', p_actor,
    'role', p_role,
    'session', v_session_hash,
    'strength', p_strength,
    'action', p_action,
    'target_type', p_target_type,
    'target_id', p_target_id,
    'org', p_org,
    'reason', p_reason,
    'ticket', p_ticket,
    'result', p_result,
    'detail', v_detail
  )::text;
  v_hash := encode(sha256(convert_to(v_head.hash || v_env, 'UTF8')), 'hex');
  insert into public.staff_audit_events (
    seq, occurred_at, actor_user_id, actor_role, actor_session_hash, auth_strength, action, target_type, target_id,
    org_id, reason, ticket_ref, result, detail, ip_hash, user_agent, request_id, prev_hash, envelope, row_hash
  ) values (
    v_seq, v_at, p_actor, p_role, v_session_hash, p_strength, p_action, p_target_type, p_target_id,
    p_org, p_reason, p_ticket, p_result, v_detail, p_ip_hash, left(p_ua, 300), p_request, v_head.hash, v_env, v_hash
  );
  update private.staff_audit_head set seq = v_seq, hash = v_hash where id;
  return v_seq;
end;
$$;
revoke all on function private.record_staff_event(uuid, text, uuid, text, text, text, text, uuid, text, text, text, jsonb, text, text, text) from public;

-- The staff member's role, if they're active staff on a live session and allowed this action.
create function private.require_staff(p_actor uuid, p_session uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_s record;
begin
  select m.role into v_role from public.staff_members m where m.user_id = p_actor and m.removed_at is null;
  if v_role is null then
    raise exception 'NOT_STAFF' using errcode = 'P0001';
  end if;
  select * into v_s from public.staff_sessions s where s.session_id = p_session and s.user_id = p_actor;
  if not found or v_s.ended_at is not null
     or v_s.last_seen_at < now() - interval '30 minutes'
     or v_s.first_factor_at < now() - interval '12 hours' then
    raise exception 'STAFF_SESSION_ENDED' using errcode = 'P0001';
  end if;
  if not private.staff_can(v_role, p_action) then
    raise exception 'STAFF_FORBIDDEN' using errcode = 'P0001';
  end if;
  return v_role;
end;
$$;
revoke all on function private.require_staff(uuid, uuid, text) from public;

create function private.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_reason, ''));
begin
  if length(v) not between 10 and 500 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function private.require_reason(text) from public;

create function private.normalize_staff_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_email, '')));
begin
  if length(v) not between 3 and 254 or v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function private.normalize_staff_email(text) from public;

-- Ends a person's open office sessions.
create function private.end_staff_sessions(p_user uuid, p_reason text, p_by uuid, p_except uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.staff_sessions
     set ended_at = now(), end_reason = p_reason, ended_by = p_by
   where user_id = p_user and ended_at is null and (p_except is null or session_id <> p_except);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.end_staff_sessions(uuid, text, uuid, uuid) from public;

-- ------------------------------------------------------------------ signing in

-- Whether an email code may be sent to this address, and whether Supabase
-- may create the account. Records nothing, so it can't flood the log.
create function public.app_staff_sign_in_eligibility(p_email text, p_bootstrap_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_boot text := nullif(lower(btrim(coalesce(p_bootstrap_email, ''))), '');
begin
  if exists (select 1 from public.staff_members m where m.email = v_email and m.removed_at is null) then
    return jsonb_build_object('eligible', true, 'may_create', false);
  end if;
  if exists (select 1 from public.staff_invites i where i.email = v_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) then
    return jsonb_build_object('eligible', true, 'may_create', true);
  end if;
  if v_boot is not null and v_email = v_boot
     and not exists (select 1 from public.staff_members m where m.role = 'owner' and m.removed_at is null) then
    return jsonb_build_object('eligible', true, 'may_create', true);
  end if;
  return jsonb_build_object('eligible', false, 'may_create', false);
end;
$$;

-- Whether this account may add an authenticator without already having one
-- verified: the first owner, someone with an open invite, or staff inside a
-- reset window an owner opened. Nobody else gets a new factor from a mailbox alone.
create function public.app_staff_may_enroll(p_user uuid, p_bootstrap_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_boot text := nullif(lower(btrim(coalesce(p_bootstrap_email, ''))), '');
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_user and u.email_confirmed_at is not null;
  if v_email is null then
    return false;
  end if;
  if exists (select 1 from public.staff_members m where m.user_id = p_user and m.removed_at is null and m.mfa_reset_until > now()) then
    return true;
  end if;
  if exists (select 1 from public.staff_members m where m.user_id = p_user and m.removed_at is null) then
    return false;
  end if;
  if exists (select 1 from public.staff_invites i where i.email = v_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) then
    return true;
  end if;
  return v_boot is not null and v_email = v_boot
     and not exists (select 1 from public.staff_members m where m.role = 'owner' and m.removed_at is null);
end;
$$;

-- An authenticator was added: the reset window closes, and the log says so.
create function public.app_staff_note_enrollment(p_user uuid, p_session uuid, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select m.role into v_role from public.staff_members m where m.user_id = p_user and m.removed_at is null;
  update public.staff_members set mfa_reset_until = null where user_id = p_user and mfa_reset_until is not null;
  perform private.record_staff_event(p_user, v_role, p_session, 'aal2', 'factor.enrolled', 'staff', p_user::text, null, null, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
end;
$$;

-- Starts an office session once the person is at aal2. The first owner is
-- created here, only while the office has no owner, only for the bootstrap
-- address and only with a confirmed email. Any earlier open session of the
-- same person ends: one office session per person.
create function public.app_staff_begin_session(
  p_user uuid,
  p_session uuid,
  p_first_factor_at timestamptz,
  p_ip_hash text,
  p_ua text,
  p_bootstrap_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_role text;
  v_boot text := nullif(lower(btrim(coalesce(p_bootstrap_email, ''))), '');
  v_s record;
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_user and u.email_confirmed_at is not null;
  if v_email is null then
    return jsonb_build_object('status', 'not_staff');
  end if;
  if p_session is null or p_first_factor_at is null
     or p_first_factor_at < now() - interval '12 hours' or p_first_factor_at > now() + interval '5 minutes' then
    raise exception 'STAFF_SESSION_ENDED' using errcode = 'P0001';
  end if;

  lock table public.staff_members in share row exclusive mode;
  select m.role into v_role from public.staff_members m where m.user_id = p_user and m.removed_at is null;

  if v_role is null and v_boot is not null and v_email = v_boot
     and not exists (select 1 from public.staff_members m where m.role = 'owner' and m.removed_at is null) then
    insert into public.staff_members (user_id, email, role)
    values (p_user, v_email, 'owner')
    on conflict (user_id) do update set role = 'owner', email = excluded.email, removed_at = null, removed_by = null;
    v_role := 'owner';
    perform private.record_staff_event(p_user, 'owner', p_session, 'aal2', 'staff.bootstrapped', 'staff', p_user::text, null, null, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
  end if;

  if v_role is null then
    if exists (select 1 from public.staff_invites i where i.email = v_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) then
      return jsonb_build_object('status', 'invite_pending');
    end if;
    return jsonb_build_object('status', 'not_staff');
  end if;

  select * into v_s from public.staff_sessions s where s.session_id = p_session;
  if found then
    if v_s.user_id <> p_user or v_s.ended_at is not null then
      raise exception 'STAFF_SESSION_ENDED' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', 'active', 'role', v_role);
  end if;

  perform private.end_staff_sessions(p_user, 'replaced', p_user, p_session);
  insert into public.staff_sessions (session_id, user_id, first_factor_at, ip_hash, user_agent)
  values (p_session, p_user, p_first_factor_at, p_ip_hash, left(p_ua, 300));
  perform private.record_staff_event(p_user, v_role, p_session, 'aal2', 'auth.signed_in', 'staff', p_user::text, null, null, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
  return jsonb_build_object('status', 'active', 'role', v_role);
end;
$$;

-- Joins the staff from an open invite whose email matches the confirmed account.
create function public.app_staff_accept_invite(
  p_user uuid,
  p_session uuid,
  p_first_factor_at timestamptz,
  p_ip_hash text,
  p_ua text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_inv record;
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_user and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;
  lock table public.staff_members in share row exclusive mode;
  if exists (select 1 from public.staff_members m where m.user_id = p_user and m.removed_at is null) then
    raise exception 'ALREADY_STAFF' using errcode = 'P0001';
  end if;
  select * into v_inv from public.staff_invites i
   where i.email = v_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.staff_members (user_id, email, role, invited_by)
  values (p_user, v_email, v_inv.role, v_inv.invited_by)
  on conflict (user_id) do update set role = excluded.role, email = excluded.email, invited_by = excluded.invited_by, removed_at = null, removed_by = null;
  update public.staff_invites set accepted_at = now(), accepted_by = p_user where id = v_inv.id;
  perform private.record_staff_event(p_user, v_inv.role, p_session, 'aal2', 'staff.invite_accepted', 'invite', v_inv.id::text, null, null, null, 'success', jsonb_build_object('role', v_inv.role), p_ip_hash, p_ua, null);
  return public.app_staff_begin_session(p_user, p_session, p_first_factor_at, p_ip_hash, p_ua, null);
end;
$$;

-- Checked on every office request. Returns a status instead of raising, so
-- ending a session for idleness or age is saved.
create function public.app_staff_check_session(p_user uuid, p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_s record;
  v_gone boolean := false;
  v_end text;
begin
  select m.role into v_role from public.staff_members m where m.user_id = p_user and m.removed_at is null;
  if v_role is null then
    return jsonb_build_object('status', 'not_staff');
  end if;
  select * into v_s from public.staff_sessions s where s.session_id = p_session and s.user_id = p_user;
  if not found then
    return jsonb_build_object('status', 'no_session');
  end if;
  if v_s.ended_at is not null then
    return jsonb_build_object('status', 'ended', 'reason', v_s.end_reason);
  end if;

  if v_s.first_factor_at < now() - interval '12 hours' then
    v_end := 'expired';
  elsif v_s.last_seen_at < now() - interval '30 minutes' then
    v_end := 'idle';
  else
    -- Signed out in Supabase (or revoked there): the office session ends too.
    begin
      select not exists (select 1 from auth.sessions a where a.id = p_session) into v_gone;
    exception when undefined_table or insufficient_privilege then
      v_gone := false;
    end;
    if v_gone then
      v_end := 'auth_session_gone';
    end if;
  end if;

  if v_end is not null then
    update public.staff_sessions set ended_at = now(), end_reason = v_end where session_id = p_session;
    perform private.record_staff_event(p_user, v_role, p_session, 'system', 'auth.session_ended', 'staff', p_user::text, null, null, null, 'success', jsonb_build_object('why', v_end), null, null, null);
    return jsonb_build_object('status', 'ended', 'reason', v_end);
  end if;

  if v_s.last_seen_at < now() - interval '30 seconds' then
    update public.staff_sessions set last_seen_at = now() where session_id = p_session;
    v_s.last_seen_at := now();
  end if;
  return jsonb_build_object('status', 'active', 'role', v_role, 'last_seen_at', v_s.last_seen_at, 'first_factor_at', v_s.first_factor_at);
end;
$$;

-- Signing out of the office.
create function public.app_staff_end_session(p_user uuid, p_session uuid, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  update public.staff_sessions set ended_at = now(), end_reason = 'signed_out', ended_by = p_user
   where session_id = p_session and user_id = p_user and ended_at is null;
  if found then
    select m.role into v_role from public.staff_members m where m.user_id = p_user;
    perform private.record_staff_event(p_user, v_role, p_session, 'aal2', 'auth.signed_out', 'staff', p_user::text, null, null, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
  end if;
end;
$$;

-- Ends someone's office sessions (an owner), or one's own other sessions (anyone).
create function public.app_staff_end_sessions(p_actor uuid, p_session uuid, p_target uuid, p_reason text, p_ip_hash text, p_ua text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_reason text;
  v_count integer;
begin
  if p_target = p_actor then
    v_role := private.require_staff(p_actor, p_session, 'console.read');
    v_count := private.end_staff_sessions(p_actor, 'revoked', p_actor, p_session);
    perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'auth.other_sessions_ended', 'staff', p_actor::text, null, null, null, 'success', jsonb_build_object('count', v_count), p_ip_hash, p_ua, null);
    return v_count;
  end if;
  v_role := private.require_staff(p_actor, p_session, 'staff.manage');
  v_reason := private.require_reason(p_reason);
  v_count := private.end_staff_sessions(p_target, 'revoked', p_actor, null);
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'staff.sessions_ended', 'staff', p_target::text, null, v_reason, null, 'success', jsonb_build_object('count', v_count), p_ip_hash, p_ua, null);
  return v_count;
end;
$$;

-- ------------------------------------------------------------------ managing staff (owners, with a fresh authenticator code)

create function public.app_staff_invite(
  p_actor uuid,
  p_session uuid,
  p_email text,
  p_role text,
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
  v_role text := private.require_staff(p_actor, p_session, 'staff.manage');
  v_email text := private.normalize_staff_email(p_email);
  v_reason text := private.require_reason(p_reason);
  v_id uuid;
begin
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  if p_role not in ('owner', 'admin', 'support', 'trust_safety', 'viewer') then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  if p_days is null or p_days not between 1 and 7 then
    raise exception 'INVALID_INVITE_WINDOW' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.staff_members m where m.email = v_email and m.removed_at is null) then
    raise exception 'ALREADY_STAFF' using errcode = 'P0001';
  end if;
  -- A new invite replaces any open one for the same address.
  update public.staff_invites set revoked_at = now(), revoked_by = p_actor
   where email = v_email and accepted_at is null and revoked_at is null;
  insert into public.staff_invites (email, role, invited_by, expires_at)
  values (v_email, p_role, p_actor, now() + make_interval(days => p_days))
  returning id into v_id;
  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'staff.invited', 'invite', v_id::text, null, v_reason, null, 'success', jsonb_build_object('role', p_role, 'days', p_days), p_ip_hash, p_ua, null);
  return v_id;
end;
$$;

create function public.app_staff_revoke_invite(p_actor uuid, p_session uuid, p_invite uuid, p_reason text, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'staff.manage');
  v_reason text := private.require_reason(p_reason);
begin
  update public.staff_invites set revoked_at = now(), revoked_by = p_actor
   where id = p_invite and accepted_at is null and revoked_at is null;
  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'staff.invite_revoked', 'invite', p_invite::text, null, v_reason, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
end;
$$;

create function public.app_staff_change_role(
  p_actor uuid,
  p_session uuid,
  p_target uuid,
  p_role text,
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
  v_role text := private.require_staff(p_actor, p_session, 'staff.manage');
  v_reason text := private.require_reason(p_reason);
  v_from text;
begin
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  if p_target = p_actor then
    raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001';
  end if;
  if p_role not in ('owner', 'admin', 'support', 'trust_safety', 'viewer') then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  lock table public.staff_members in share row exclusive mode;
  select m.role into v_from from public.staff_members m where m.user_id = p_target and m.removed_at is null;
  if v_from is null then
    raise exception 'NOT_STAFF' using errcode = 'P0001';
  end if;
  if v_from = p_role then
    return;
  end if;
  update public.staff_members set role = p_role where user_id = p_target;
  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'staff.role_changed', 'staff', p_target::text, null, v_reason, null, 'success', jsonb_build_object('from', v_from, 'to', p_role), p_ip_hash, p_ua, null);
end;
$$;

create function public.app_staff_remove(
  p_actor uuid,
  p_session uuid,
  p_target uuid,
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
  v_role text := private.require_staff(p_actor, p_session, 'staff.manage');
  v_reason text := private.require_reason(p_reason);
  v_from text;
  v_count integer;
begin
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  if p_target = p_actor then
    raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001';
  end if;
  lock table public.staff_members in share row exclusive mode;
  select m.role into v_from from public.staff_members m where m.user_id = p_target and m.removed_at is null;
  if v_from is null then
    raise exception 'NOT_STAFF' using errcode = 'P0001';
  end if;
  update public.staff_members set removed_at = now(), removed_by = p_actor, mfa_reset_until = null where user_id = p_target;
  v_count := private.end_staff_sessions(p_target, 'removed', p_actor, null);
  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'staff.removed', 'staff', p_target::text, null, v_reason, null, 'success', jsonb_build_object('role', v_from, 'sessions_ended', v_count), p_ip_hash, p_ua, null);
end;
$$;

-- Lets a staff member who lost their authenticator add a new one within 24
-- hours. The server then removes their old factors. Their sessions end now.
create function public.app_staff_allow_mfa_reset(
  p_actor uuid,
  p_session uuid,
  p_target uuid,
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
  v_role text := private.require_staff(p_actor, p_session, 'staff.manage');
  v_reason text := private.require_reason(p_reason);
begin
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  if p_target = p_actor then
    raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001';
  end if;
  update public.staff_members set mfa_reset_until = now() + interval '24 hours'
   where user_id = p_target and removed_at is null;
  if not found then
    raise exception 'NOT_STAFF' using errcode = 'P0001';
  end if;
  perform private.end_staff_sessions(p_target, 'revoked', p_actor, null);
  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'staff.mfa_reset_allowed', 'staff', p_target::text, null, v_reason, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
end;
$$;

-- ------------------------------------------------------------------ the log itself

-- Events the server records outside the functions above: sign-in steps,
-- refusals, factor changes, chain checks. Nothing that claims a staff
-- action on customers can be written this way.
create function public.app_record_staff_event(
  p_actor uuid,
  p_session uuid,
  p_strength text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_result text,
  p_detail jsonb,
  p_ip_hash text,
  p_ua text,
  p_request text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if p_action !~ '^(auth|access|factor|audit)\.[a-z_]+$' then
    raise exception 'INVALID_EVENT' using errcode = 'P0001';
  end if;
  if p_strength not in ('aal1', 'aal2', 'step_up', 'system') or p_result not in ('success', 'denied', 'error') then
    raise exception 'INVALID_EVENT' using errcode = 'P0001';
  end if;
  if p_actor is not null then
    select m.role into v_role from public.staff_members m where m.user_id = p_actor;
  end if;
  return private.record_staff_event(p_actor, v_role, p_session, p_strength, p_action, p_target_type, left(p_target_id, 100), null, null, null, p_result, p_detail, p_ip_hash, p_ua, left(p_request, 64));
end;
$$;

create function public.app_staff_record_verification(
  p_actor uuid,
  p_session uuid,
  p_through_seq bigint,
  p_head_hash text,
  p_ok boolean,
  p_first_bad_seq bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'audit.verify');
begin
  insert into public.staff_audit_verifications (verified_by, through_seq, head_hash, ok, first_bad_seq)
  values (p_actor, p_through_seq, p_head_hash, p_ok, p_first_bad_seq);
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'audit.chain_checked', 'audit', p_through_seq::text, null, null, null,
    case when p_ok then 'success' else 'error' end, jsonb_build_object('through_seq', p_through_seq, 'first_bad_seq', p_first_bad_seq), null, null, null);
end;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function public.app_staff_sign_in_eligibility(text, text) from public, anon, authenticated;
revoke all on function public.app_staff_may_enroll(uuid, text) from public, anon, authenticated;
revoke all on function public.app_staff_note_enrollment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_begin_session(uuid, uuid, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_accept_invite(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_check_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_staff_end_session(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_end_sessions(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_invite(uuid, uuid, text, text, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_revoke_invite(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_change_role(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_remove(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_allow_mfa_reset(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_record_staff_event(uuid, uuid, text, text, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_record_verification(uuid, uuid, bigint, text, boolean, bigint) from public, anon, authenticated;

grant execute on function public.app_staff_sign_in_eligibility(text, text) to service_role;
grant execute on function public.app_staff_may_enroll(uuid, text) to service_role;
grant execute on function public.app_staff_note_enrollment(uuid, uuid, text, text) to service_role;
grant execute on function public.app_staff_begin_session(uuid, uuid, timestamptz, text, text, text) to service_role;
grant execute on function public.app_staff_accept_invite(uuid, uuid, timestamptz, text, text) to service_role;
grant execute on function public.app_staff_check_session(uuid, uuid) to service_role;
grant execute on function public.app_staff_end_session(uuid, uuid, text, text) to service_role;
grant execute on function public.app_staff_end_sessions(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.app_staff_invite(uuid, uuid, text, text, integer, text, text, text, text) to service_role;
grant execute on function public.app_staff_revoke_invite(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.app_staff_change_role(uuid, uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.app_staff_remove(uuid, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.app_staff_allow_mfa_reset(uuid, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.app_record_staff_event(uuid, uuid, text, text, text, text, text, jsonb, text, text, text) to service_role;
grant execute on function public.app_staff_record_verification(uuid, uuid, bigint, text, boolean, bigint) to service_role;
