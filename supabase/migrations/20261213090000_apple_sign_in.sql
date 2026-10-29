-- Farbaek schema v72: Sign in with Apple (ADR 0113).
--
-- Supabase Auth makes the account and links the Apple ID (auth.identities,
-- provider 'apple'). This keeps the one thing Auth doesn't: Apple's refresh
-- token for the person's sign-in, so deleting the account can revoke it
-- through Apple's REST API, as Apple requires. One token per person, the
-- latest. Only the server can read or change it, and it goes with the
-- account.

create table public.apple_sign_in_tokens (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  refresh_token  text not null check (char_length(refresh_token) between 8 and 1024 and refresh_token ~ '^[A-Za-z0-9._-]+$'),
  updated_at     timestamptz not null default now()
);
alter table public.apple_sign_in_tokens enable row level security;
revoke all on public.apple_sign_in_tokens from public, anon, authenticated, service_role;
grant select on public.apple_sign_in_tokens to service_role;

create function public.app_apple_sign_in_keep(p_user uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.apple_sign_in_tokens (user_id, refresh_token)
  values (p_user, p_token)
  on conflict (user_id) do update set refresh_token = excluded.refresh_token, updated_at = now();
end;
$$;

create function public.app_apple_sign_in_forget(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.apple_sign_in_tokens t where t.user_id = p_user;
end;
$$;

revoke all on function public.app_apple_sign_in_keep(uuid, text) from public, anon, authenticated;
revoke all on function public.app_apple_sign_in_forget(uuid) from public, anon, authenticated;
grant execute on function public.app_apple_sign_in_keep(uuid, text) to service_role;
grant execute on function public.app_apple_sign_in_forget(uuid) to service_role;
