-- Farbaek schema v49: push notifications on a person's devices (ADR 0079).
--
-- A browser or installed app that a person turns notifications on in keeps
-- its push subscription here: the push service's address and the keys the
-- server encrypts each message with. It belongs to one person, who reads only
-- their own; the server writes through these functions, which accept only
-- the browsers' push services, keep at most ten devices a person, and drop a
-- subscription its push service says is gone.

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  endpoint      text not null unique check (
    char_length(endpoint) between 20 and 1000
    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  p256dh        text not null check (p256dh ~ '^B[A-Za-z0-9_-]{85,86}$'),
  auth          text not null check (auth ~ '^[A-Za-z0-9_-]{21,22}$'),
  label         text not null check (char_length(label) between 1 and 100),
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz,
  failures      smallint not null default 0 check (failures between 0 and 100)
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id, created_at desc);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated, service_role;
grant select (id, user_id, endpoint, label, created_at, last_sent_at) on public.push_subscriptions to authenticated;
grant select on public.push_subscriptions to service_role;
create policy "people read their own devices" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- Keeps a device's subscription for a person. A device that was someone
-- else's (another account signed in on it) becomes this person's.
create function public.app_save_push_subscription(p_user uuid, p_endpoint text, p_p256dh text, p_auth text, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, label)
  values (p_user, p_endpoint, p_p256dh, p_auth, left(btrim(p_label), 100))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, created_at = now(), failures = 0
  returning id into v_id;
  -- At most ten devices: the oldest go first.
  delete from public.push_subscriptions
   where user_id = p_user and id in (select id from public.push_subscriptions where user_id = p_user order by created_at desc offset 10);
  return v_id;
end;
$$;
revoke all on function public.app_save_push_subscription(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_save_push_subscription(uuid, text, text, text, text) to service_role;

-- Removes one of a person's devices (they turned notifications off there).
create function public.app_delete_push_subscription(p_user uuid, p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where user_id = p_user and endpoint = p_endpoint;
$$;
revoke all on function public.app_delete_push_subscription(uuid, text) from public, anon, authenticated;
grant execute on function public.app_delete_push_subscription(uuid, text) to service_role;

-- What a send did: sent clears failures; gone removes it; a failure counts,
-- and twenty in a row remove it.
create function public.app_note_push_result(p_endpoint text, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome = 'sent' then
    update public.push_subscriptions set last_sent_at = now(), failures = 0 where endpoint = p_endpoint;
  elsif p_outcome = 'gone' then
    delete from public.push_subscriptions where endpoint = p_endpoint;
  elsif p_outcome = 'failed' then
    update public.push_subscriptions set failures = failures + 1 where endpoint = p_endpoint;
    delete from public.push_subscriptions where endpoint = p_endpoint and failures >= 20;
  else
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.app_note_push_result(text, text) from public, anon, authenticated;
grant execute on function public.app_note_push_result(text, text) to service_role;

notify pgrst, 'reload schema';
