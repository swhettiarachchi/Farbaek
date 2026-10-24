-- Farbaek schema v41: Office Space only on trusted devices (ADR 0069).
--
-- Each browser that signs in to Office Space carries its own secret device
-- cookie; the server stores only its SHA-256. A staff member's first device
-- is trusted when they sign in on it. Every later device gets a 6-digit code
-- and stays out until the person approves it, with that code and a fresh
-- authenticator code, from a device they already trust. The code is shown
-- only on the new device, so approving a stranger's request by mistake is
-- impossible. Removing a device keeps it out until it's approved again.
-- private.reset_staff_devices(email), for the database owner over SSH only,
-- is the way back in when every trusted device is lost.

create table public.staff_devices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  token_hash     text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  label          text not null check (char_length(label) between 1 and 80),
  request_code   text check (request_code ~ '^[0-9]{6}$'),
  approve_tries  integer not null default 0 check (approve_tries between 0 and 5),
  requested_at   timestamptz not null default now(),
  approved_at    timestamptz,
  approved_by    uuid,
  approved_via   text check (approved_via in ('first_device', 'approved')),
  revoked_at     timestamptz,
  revoked_by     uuid,
  last_seen_at   timestamptz not null default now(),
  unique (user_id, token_hash),
  check ((approved_at is null) = (approved_via is null))
);
create index staff_devices_user on public.staff_devices (user_id);
alter table public.staff_devices enable row level security;
revoke all on public.staff_devices from public, anon, authenticated, service_role;
grant select on public.staff_devices to service_role;

-- The permission matrix, with your own devices for every role.
create or replace function private.staff_can(p_role text, p_action text)
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
    when 'support.read'          then p_role in ('owner', 'admin', 'support', 'trust_safety')
    when 'support.reply'         then p_role in ('owner', 'admin', 'support', 'trust_safety')
    when 'devices.own'           then p_role in ('owner', 'admin', 'support', 'trust_safety', 'viewer')
    else false
  end, false);
$$;

-- Six digits from the strong random source behind gen_random_uuid().
create function private.device_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select lpad((('x' || lpad(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 16, '0'))::bit(64)::bigint % 1000000)::text, 6, '0');
$$;
revoke all on function private.device_code() from public;

-- At sign-in, after both codes: is this device trusted for this person?
-- Only staff, the first owner and people with an open invite get an answer.
create function public.app_staff_check_device(
  p_user uuid,
  p_token_hash text,
  p_label text,
  p_bootstrap_email text,
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
  v_role text;
  v_boot text := nullif(lower(btrim(coalesce(p_bootstrap_email, ''))), '');
  v_label text := left(coalesce(nullif(btrim(p_label), ''), 'A browser'), 80);
  v_d record;
  v_code text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_DEVICE' using errcode = '22023';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = p_user and u.email_confirmed_at is not null;
  if v_email is null then
    return jsonb_build_object('status', 'not_staff');
  end if;
  select m.role into v_role from public.staff_members m where m.user_id = p_user and m.removed_at is null;
  if v_role is null
     and not (v_boot is not null and v_email = v_boot and not exists (select 1 from public.staff_members m where m.role = 'owner' and m.removed_at is null))
     and not exists (select 1 from public.staff_invites i where i.email = v_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) then
    return jsonb_build_object('status', 'not_staff');
  end if;

  perform pg_advisory_xact_lock(hashtext('farbaek.staff_devices:' || p_user::text));
  select * into v_d from public.staff_devices d where d.user_id = p_user and d.token_hash = p_token_hash for update;

  if found and v_d.approved_at is not null and v_d.revoked_at is null then
    if v_d.last_seen_at < now() - interval '1 minute' then
      update public.staff_devices set last_seen_at = now() where id = v_d.id;
    end if;
    return jsonb_build_object('status', 'trusted', 'device', v_d.id);
  end if;

  -- No trusted device yet: this one becomes the first.
  if not exists (select 1 from public.staff_devices d where d.user_id = p_user and d.approved_at is not null and d.revoked_at is null) then
    if found then
      update public.staff_devices
      set label = v_label, request_code = null, approve_tries = 0, approved_at = now(), approved_by = p_user, approved_via = 'first_device',
          revoked_at = null, revoked_by = null, last_seen_at = now()
      where id = v_d.id;
    else
      insert into public.staff_devices (user_id, token_hash, label, approved_at, approved_by, approved_via)
      values (p_user, p_token_hash, v_label, now(), p_user, 'first_device')
      returning * into v_d;
    end if;
    perform private.record_staff_event(p_user, v_role, null, 'aal2', 'device.trusted', 'device', v_d.id::text, null, null, null, 'success', jsonb_build_object('via', 'first_device', 'label', v_label), p_ip_hash, p_ua, null);
    return jsonb_build_object('status', 'trusted', 'device', v_d.id, 'first', true);
  end if;

  -- Waiting for approval: the same code for a day, then a new one.
  if found and v_d.approved_at is null and v_d.revoked_at is null and v_d.request_code is not null and v_d.requested_at > now() - interval '1 day' then
    return jsonb_build_object('status', 'pending', 'device', v_d.id, 'code', v_d.request_code);
  end if;

  v_code := private.device_code();
  if found then
    update public.staff_devices
    set label = v_label, request_code = v_code, approve_tries = 0, requested_at = now(), approved_at = null, approved_by = null, approved_via = null,
        revoked_at = null, revoked_by = null, last_seen_at = now()
    where id = v_d.id;
  else
    insert into public.staff_devices (user_id, token_hash, label, request_code)
    values (p_user, p_token_hash, v_label, v_code)
    returning * into v_d;
  end if;
  perform private.record_staff_event(p_user, v_role, null, 'aal2', 'device.requested', 'device', v_d.id::text, null, null, null, 'success', jsonb_build_object('label', v_label), p_ip_hash, p_ua, null);
  return jsonb_build_object('status', 'pending', 'device', v_d.id, 'code', v_code);
end;
$$;

-- On every office request: is the device this session runs on still trusted?
create function public.app_staff_device_trusted(p_user uuid, p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_devices d
    where d.user_id = p_user and d.token_hash = p_token_hash and d.approved_at is not null and d.revoked_at is null
  );
$$;

-- Approves one of your own waiting devices, from a trusted one, with the
-- code the new device shows and a fresh authenticator code. Five wrong codes
-- cancel the request; the new device then asks again.
create function public.app_staff_approve_device(
  p_actor uuid,
  p_session uuid,
  p_from_token_hash text,
  p_device uuid,
  p_code text,
  p_auth_strength text,
  p_ip_hash text,
  p_ua text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_d record;
begin
  v_role := private.require_staff(p_actor, p_session, 'devices.own');
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  if not public.app_staff_device_trusted(p_actor, p_from_token_hash) then
    raise exception 'DEVICE_NOT_TRUSTED' using errcode = 'P0001';
  end if;
  select * into v_d from public.staff_devices d where d.id = p_device and d.user_id = p_actor for update;
  if not found or v_d.approved_at is not null or v_d.revoked_at is not null or v_d.request_code is null then
    raise exception 'DEVICE_NOT_WAITING' using errcode = 'P0001';
  end if;
  if p_code is distinct from v_d.request_code then
    update public.staff_devices
    set approve_tries = approve_tries + 1, request_code = case when approve_tries + 1 >= 5 then null else request_code end
    where id = v_d.id;
    return jsonb_build_object('ok', false, 'tries_left', greatest(0, 4 - v_d.approve_tries));
  end if;
  update public.staff_devices
  set approved_at = now(), approved_by = p_actor, approved_via = 'approved', request_code = null, approve_tries = 0
  where id = v_d.id;
  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'device.approved', 'device', v_d.id::text, null, null, null, 'success', jsonb_build_object('label', v_d.label), p_ip_hash, p_ua, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Removes one of your own devices (trusted or waiting). It's out at its next request.
create function public.app_staff_revoke_device(p_actor uuid, p_session uuid, p_device uuid, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_label text;
begin
  v_role := private.require_staff(p_actor, p_session, 'devices.own');
  update public.staff_devices
  set revoked_at = now(), revoked_by = p_actor, request_code = null
  where id = p_device and user_id = p_actor and revoked_at is null
  returning label into v_label;
  if not found then
    raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'device.revoked', 'device', p_device::text, null, null, null, 'success', jsonb_build_object('label', v_label), p_ip_hash, p_ua, null);
end;
$$;

-- The way back in when every trusted device is lost: removes all of one
-- person's devices, so the next device they sign in on becomes the first.
-- Callable only by the database owner, over SSH on the server.
create function private.reset_staff_devices(p_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_count integer;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'NO_SUCH_USER' using errcode = 'P0001';
  end if;
  update public.staff_devices set revoked_at = now(), revoked_by = null, request_code = null where user_id = v_user and revoked_at is null;
  get diagnostics v_count = row_count;
  perform private.record_staff_event(null, null, null, 'system', 'device.reset', 'staff', v_user::text, null, null, null, 'success', jsonb_build_object('devices', v_count), null, null, null);
  return v_count;
end;
$$;
revoke all on function private.reset_staff_devices(text) from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_staff_check_device(uuid, text, text, text, text, text)',
    'public.app_staff_device_trusted(uuid, text)',
    'public.app_staff_approve_device(uuid, uuid, text, uuid, text, text, text, text)',
    'public.app_staff_revoke_device(uuid, uuid, uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
