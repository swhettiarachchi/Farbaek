-- Farbaek schema v70: phones signed in to Farbaek (ADR 0110).
--
-- Farbaek for iPhone signs in through the web, as an app on a phone should:
-- the person signs in on www.farbaek.com in the system browser sheet, agrees
-- to connect the phone, and the phone gets a one-time code bound to a PKCE
-- challenge only it can answer. Redeeming the code gives the phone its own
-- Supabase session, recorded here as a device the person can see and
-- disconnect. Every request from the phone is checked against this record,
-- so disconnecting takes effect at once, and the phone's session in Supabase
-- Auth is ended too.
--
-- Codes and devices are written only by the service-role functions below.
-- People read their own devices (names and times, never the push token or
-- the session).

create table public.phone_connect_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  platform text not null check (platform in ('ios', 'android')),
  device_name text not null check (char_length(device_name) between 1 and 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes',
  used_at timestamptz
);
create index phone_connect_codes_user on public.phone_connect_codes (user_id, created_at desc);
alter table public.phone_connect_codes enable row level security;
revoke all on public.phone_connect_codes from anon, authenticated;

create table public.phone_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null unique,
  platform text not null check (platform in ('ios', 'android')),
  name text not null check (char_length(name) between 1 and 60),
  app_version text check (app_version is null or app_version ~ '^[0-9A-Za-z.+-]{1,32}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  push_token text check (push_token is null or push_token ~ '^[0-9a-f]{64,200}$'),
  push_environment text check (push_environment is null or push_environment in ('production', 'development')),
  push_failures integer not null default 0 check (push_failures >= 0)
);
create index phone_devices_user on public.phone_devices (user_id, created_at desc);
create unique index phone_devices_push_token on public.phone_devices (push_token) where push_token is not null;
alter table public.phone_devices enable row level security;
revoke all on public.phone_devices from anon, authenticated;
grant select (id, user_id, platform, name, app_version, created_at, last_seen_at, revoked_at) on public.phone_devices to authenticated;
create policy "people read their own phones" on public.phone_devices for select to authenticated using (user_id = (select auth.uid()));

-- Ends a phone's Supabase Auth session, so its refresh token stops working.
-- Returns false where this database can't (no auth.sessions, or no right to
-- it): the phone is still refused at once, because every request checks the
-- device record.
create function private.end_phone_session(p_user uuid, p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions s where s.id = p_session and s.user_id = p_user;
  return true;
exception when undefined_table or insufficient_privilege then
  return false;
end;
$$;

-- A one-time code for the phone that asked, after the person agreed in the browser.
create function public.app_phone_code_create(p_user uuid, p_code_hash text, p_challenge text, p_platform text, p_device_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.phone_connect_codes c where c.user_id = p_user and (c.expires_at < now() - interval '1 day' or c.used_at < now() - interval '1 day');
  if (select count(*) from public.phone_connect_codes c where c.user_id = p_user and c.used_at is null and c.expires_at > now()) >= 5 then
    raise exception 'TOO_MANY_CODES' using errcode = '22023';
  end if;
  insert into public.phone_connect_codes (code_hash, user_id, challenge, platform, device_name)
  values (p_code_hash, p_user, p_challenge, p_platform, btrim(p_device_name));
end;
$$;

-- Redeems a code once. Any attempt uses it up, so a wrong answer to the
-- challenge can't be retried. An unknown, used, expired or wrongly answered
-- code returns no row (not an error, which would undo using it up).
create function public.app_phone_code_redeem(p_code_hash text, p_challenge text)
returns table (user_id uuid, platform text, device_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.phone_connect_codes;
begin
  update public.phone_connect_codes c set used_at = now()
  where c.code_hash = p_code_hash and c.used_at is null
  returning * into v_code;
  if found and v_code.expires_at > now() and v_code.challenge = p_challenge then
    return query select v_code.user_id, v_code.platform, v_code.device_name;
  end if;
end;
$$;

-- Records the phone's new session. A person keeps at most ten phones; past
-- that, the one used longest ago is disconnected.
create function public.app_phone_register(p_user uuid, p_session uuid, p_platform text, p_name text, p_app_version text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_old record;
begin
  insert into public.phone_devices (user_id, session_id, platform, name, app_version)
  values (p_user, p_session, p_platform, btrim(p_name), nullif(btrim(coalesce(p_app_version, '')), ''))
  returning id into v_id;
  for v_old in
    select d.id, d.session_id from public.phone_devices d
    where d.user_id = p_user and d.revoked_at is null
    order by d.last_seen_at desc offset 10
  loop
    update public.phone_devices set revoked_at = now(), push_token = null where id = v_old.id;
    perform private.end_phone_session(p_user, v_old.session_id);
  end loop;
  return v_id;
end;
$$;

-- The connected phone behind a session, or nothing once it was disconnected.
-- Notes when it was last seen, at most once a minute.
create function public.app_phone_seen(p_session uuid)
returns table (device_id uuid, user_id uuid, platform text, push boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.phone_devices d set last_seen_at = now()
  where d.session_id = p_session and d.revoked_at is null and d.last_seen_at < now() - interval '1 minute';
  return query
    select d.id, d.user_id, d.platform, d.push_token is not null
    from public.phone_devices d
    where d.session_id = p_session and d.revoked_at is null;
end;
$$;

-- Disconnects one of the person's phones: refused from then on, its push
-- token dropped and its sign-in ended. Returns whether the sign-in ended,
-- or null when there's no such phone.
create function public.app_phone_revoke(p_user uuid, p_device uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
begin
  update public.phone_devices d set revoked_at = coalesce(d.revoked_at, now()), push_token = null, push_environment = null
  where d.id = p_device and d.user_id = p_user
  returning d.session_id into v_session;
  if not found then
    return null;
  end if;
  return private.end_phone_session(p_user, v_session);
end;
$$;

-- Where to send the phone's notifications. A token belongs to one phone: it
-- moves to whichever connected phone reports it last.
create function public.app_phone_set_push(p_session uuid, p_token text, p_environment text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select d.id into v_id from public.phone_devices d where d.session_id = p_session and d.revoked_at is null;
  if v_id is null then
    return false;
  end if;
  if p_token is not null then
    update public.phone_devices set push_token = null, push_environment = null where push_token = lower(p_token) and id <> v_id;
  end if;
  update public.phone_devices
    set push_token = lower(p_token), push_environment = case when p_token is null then null else p_environment end, push_failures = 0
  where id = v_id;
  return true;
end;
$$;

-- What Apple's push service said about a token: gone drops it, and twenty
-- failures in a row drop it too.
create function public.app_phone_note_push(p_token text, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome = 'sent' then
    update public.phone_devices set push_failures = 0 where push_token = p_token;
  elsif p_outcome = 'gone' then
    update public.phone_devices set push_token = null, push_environment = null where push_token = p_token;
  elsif p_outcome = 'failed' then
    update public.phone_devices
      set push_failures = push_failures + 1,
          push_token = case when push_failures + 1 >= 20 then null else push_token end,
          push_environment = case when push_failures + 1 >= 20 then null else push_environment end
    where push_token = p_token;
  else
    raise exception 'INVALID_OUTCOME' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.end_phone_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_phone_code_create(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_phone_code_redeem(text, text) from public, anon, authenticated;
revoke all on function public.app_phone_register(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_phone_seen(uuid) from public, anon, authenticated;
revoke all on function public.app_phone_revoke(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_phone_set_push(uuid, text, text) from public, anon, authenticated;
revoke all on function public.app_phone_note_push(text, text) from public, anon, authenticated;
grant execute on function public.app_phone_code_create(uuid, text, text, text, text) to service_role;
grant execute on function public.app_phone_code_redeem(text, text) to service_role;
grant execute on function public.app_phone_register(uuid, uuid, text, text, text) to service_role;
grant execute on function public.app_phone_seen(uuid) to service_role;
grant execute on function public.app_phone_revoke(uuid, uuid) to service_role;
grant execute on function public.app_phone_set_push(uuid, text, text) to service_role;
grant execute on function public.app_phone_note_push(text, text) to service_role;
