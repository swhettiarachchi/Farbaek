-- Farbaek schema v44: Office Space is invisible to unknown devices (ADR 0072).
--
-- ADR 0069 kept unknown devices out, but they could still see the sign-in
-- page. Now the office answers "not found" to any device it doesn't know,
-- before any page. A new device is added with a one-time 8-character code
-- made on a trusted device (with a fresh authenticator code), typed on the
-- new device at /add-device within 15 minutes; only then does it see the
-- sign-in page. While no device is trusted at all (a new office, or after
-- private.reset_staff_devices over SSH), the office is open, so the first
-- device can sign in.

alter table public.staff_devices drop constraint staff_devices_approved_via_check;
alter table public.staff_devices add constraint staff_devices_approved_via_check check (approved_via in ('first_device', 'approved', 'invite'));

create table public.staff_device_invites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  code_hash   text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  device_id   uuid
);
create index staff_device_invites_user on public.staff_device_invites (user_id);
alter table public.staff_device_invites enable row level security;
revoke all on public.staff_device_invites from public, anon, authenticated, service_role;

-- Before any office page: may this device see the office at all?
create function public.app_office_device_known(p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.staff_devices d where d.revoked_at is null) then true
    when p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then false
    else exists (select 1 from public.staff_devices d where d.token_hash = p_token_hash and d.revoked_at is null)
  end;
$$;

-- On a trusted device, with a fresh authenticator code: a code for one new
-- device, for 15 minutes. Any earlier unused code of yours stops working.
create function public.app_staff_create_device_invite(
  p_actor uuid,
  p_session uuid,
  p_from_token_hash text,
  p_code_hash text,
  p_auth_strength text,
  p_ip_hash text,
  p_ua text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  v_role := private.require_staff(p_actor, p_session, 'devices.own');
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  if not public.app_staff_device_trusted(p_actor, p_from_token_hash) then
    raise exception 'DEVICE_NOT_TRUSTED' using errcode = 'P0001';
  end if;
  update public.staff_device_invites set expires_at = now() where user_id = p_actor and used_at is null and expires_at > now();
  insert into public.staff_device_invites (user_id, code_hash, expires_at) values (p_actor, p_code_hash, v_expires);
  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'device.invite_created', 'staff', p_actor::text, null, null, null, 'success', '{}'::jsonb, p_ip_hash, p_ua, null);
  return v_expires;
end;
$$;

-- On the new device: a valid code makes it a trusted device of the person who
-- made the code. Anything else answers false, without saying why.
create function public.app_staff_redeem_device_invite(p_code_hash text, p_token_hash text, p_label text, p_ip_hash text, p_ua text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_role text;
  v_label text := left(coalesce(nullif(btrim(p_label), ''), 'A browser'), 80);
  v_device uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_DEVICE' using errcode = '22023';
  end if;
  select * into v_inv from public.staff_device_invites i where i.code_hash = p_code_hash for update;
  if not found or v_inv.used_at is not null or v_inv.expires_at <= now() then
    return false;
  end if;
  select m.role into v_role from public.staff_members m where m.user_id = v_inv.user_id and m.removed_at is null;
  if v_role is null then
    return false;
  end if;
  insert into public.staff_devices (user_id, token_hash, label, approved_at, approved_by, approved_via)
  values (v_inv.user_id, p_token_hash, v_label, now(), v_inv.user_id, 'invite')
  on conflict (user_id, token_hash) do update set
    label = excluded.label, request_code = null, approve_tries = 0, approved_at = now(), approved_by = excluded.approved_by,
    approved_via = 'invite', revoked_at = null, revoked_by = null, last_seen_at = now()
  returning id into v_device;
  update public.staff_device_invites set used_at = now(), device_id = v_device where id = v_inv.id;
  perform private.record_staff_event(v_inv.user_id, v_role, null, 'system', 'device.trusted', 'device', v_device::text, null, null, null, 'success', jsonb_build_object('via', 'invite', 'label', v_label), p_ip_hash, p_ua, null);
  return true;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_office_device_known(text)',
    'public.app_staff_create_device_invite(uuid, uuid, text, text, text, text, text)',
    'public.app_staff_redeem_device_invite(text, text, text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
