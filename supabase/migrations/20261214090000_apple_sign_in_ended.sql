-- Farbaek schema v73: when Apple says a person stopped using Sign in with
-- Apple with Farbaek (ADR 0114).
--
-- Apple's server-to-server notifications report "consent-revoked" (the
-- person removed Farbaek from their Apple Account's Sign in with Apple list)
-- and "account-delete" (they deleted their Apple Account). Either way the
-- server checks Apple's signature, then calls this with Apple's id for the
-- person (the token's "sub", which Auth keeps as the Apple identity's
-- provider_id). It signs the person out everywhere, disconnects their
-- phones and forgets Apple's refresh token. The account and its workspaces
-- stay: the person can still sign in by email, and deleting the account is
-- their choice.

create function public.app_apple_sign_in_ended(p_sub text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_sub is null or p_sub !~ '^[A-Za-z0-9._-]{1,255}$' then
    raise exception 'INVALID_SUB' using errcode = '22023';
  end if;
  select i.user_id into v_user from auth.identities i where i.provider = 'apple' and i.provider_id = p_sub limit 1;
  if v_user is null then
    return null;
  end if;
  delete from auth.sessions s where s.user_id = v_user;
  update public.phone_devices d set revoked_at = now(), push_token = null, push_environment = null where d.user_id = v_user and d.revoked_at is null;
  delete from public.apple_sign_in_tokens t where t.user_id = v_user;
  return v_user;
end;
$$;

revoke all on function public.app_apple_sign_in_ended(text) from public, anon, authenticated;
grant execute on function public.app_apple_sign_in_ended(text) to service_role;
