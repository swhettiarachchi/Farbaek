-- Farbaek schema v87: plans bought through Google Play in Farbaek for Android (ADR 0154).
--
-- Farbaek for Android is the website in a Trusted Web Activity; it buys a
-- plan with the Digital Goods API and Google Play's billing. Google doesn't
-- sign the purchase: the server asks the Google Play Developer API about the
-- token and applies the plan through app_billing_apply_subscription, the same
-- function Dodo and Apple use. Google's library can't carry an account id,
-- so a token is bound to a workspace only when it matches an intent an owner
-- or admin opened just before buying, or when it replaces the workspace's
-- current Google token. Once bound, a token never moves.
--
-- Tokens contain dots, which billing_accounts.provider_subscription_id
-- doesn't allow, so the workspace's row holds 'gp_' and the token's SHA-256;
-- the token itself is kept here to ask Google about it again.

alter table public.billing_accounts drop constraint billing_accounts_provider_check;
alter table public.billing_accounts add constraint billing_accounts_provider_check check (provider in ('dodo', 'apple', 'google'));

-- What an owner or admin is about to buy in the Android app. Good for one purchase that starts within 30 minutes of it.
create table public.google_play_intents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  product_id  text not null check (product_id ~ '^[a-z0-9_.]{1,100}$'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
create index google_play_intents_org_idx on public.google_play_intents (org_id, created_at desc);

create table public.google_play_purchases (
  token_sha256        text primary key check (token_sha256 ~ '^[0-9a-f]{64}$'),
  purchase_token      text not null unique check (char_length(purchase_token) between 10 and 1000 and purchase_token ~ '^[A-Za-z0-9._:-]+$'),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  product_id          text not null check (product_id ~ '^[a-z0-9_.]{1,100}$'),
  mode                text not null check (mode in ('test', 'live')),
  -- The token this one replaced, when the plan was changed in Google Play.
  predecessor_sha256  text check (predecessor_sha256 is null or predecessor_sha256 ~ '^[0-9a-f]{64}$'),
  -- 'superseded' once a newer token replaced it; 'ended' when Google says it's over.
  status              text not null default 'active' check (status in ('active', 'superseded', 'ended')),
  acknowledged        boolean not null default false,
  bound_by            uuid references auth.users (id) on delete set null,
  bound_at            timestamptz not null default now(),
  last_synced_at      timestamptz,
  next_check_at       timestamptz not null default now(),
  detail              text check (detail is null or char_length(detail) between 1 and 300)
);
create index google_play_purchases_due_idx on public.google_play_purchases (status, next_check_at);
create index google_play_purchases_org_idx on public.google_play_purchases (org_id);

-- How far the hourly pull of refunded and revoked purchases has read.
create table public.google_play_sync (
  id             boolean primary key default true check (id),
  voided_since   timestamptz
);
insert into public.google_play_sync (id) values (true);

alter table public.google_play_intents enable row level security;
alter table public.google_play_purchases enable row level security;
alter table public.google_play_sync enable row level security;
revoke all on public.google_play_intents, public.google_play_purchases, public.google_play_sync from public, anon, authenticated, service_role;
grant select on public.google_play_intents, public.google_play_purchases, public.google_play_sync to service_role;

-- An owner or admin is about to buy a plan through Google Play.
create function public.app_google_open_intent(p_org uuid, p_actor uuid, p_product text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_manager(p_org, p_actor);
  if private.org_suspended(p_org) then
    raise exception 'PAUSED_BY_FARBAEK' using errcode = 'P0001';
  end if;
  if (select count(*) from public.google_play_intents i where i.org_id = p_org and i.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'TOO_MANY_ATTEMPTS' using errcode = 'P0001';
  end if;
  delete from public.google_play_intents i where i.org_id = p_org and i.created_at < now() - interval '7 days';
  insert into public.google_play_intents (org_id, product_id, created_by) values (p_org, p_product, p_actor) returning id into v_id;
  return v_id;
end;
$$;

-- Binds a token Google confirmed to a workspace. Returns:
--   'bound'             a first purchase, matching an intent;
--   'successor'         it replaces this workspace's current Google token;
--   'bound_here'        already this workspace's;
--   'bound_elsewhere'   another workspace's: never moved;
--   'needs_successor'   the workspace has a live Google plan, and this isn't its replacement;
--   'paid_elsewhere'    the workspace is billed on the web or through Apple;
--   'no_intent'         nobody here opened a purchase for it.
create function public.app_google_bind_purchase(
  p_org uuid,
  p_actor uuid,
  p_token text,
  p_token_sha256 text,
  p_product text,
  p_mode text,
  p_predecessor_sha256 text,
  p_started_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_intent uuid;
  v_b public.billing_accounts%rowtype;
  v_has_account boolean;
begin
  perform private.require_manager(p_org, p_actor);
  if p_token_sha256 is distinct from encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') then
    raise exception 'TOKEN_HASH_MISMATCH' using errcode = '22023';
  end if;

  select g.org_id into v_owner from public.google_play_purchases g where g.token_sha256 = p_token_sha256;
  if found then
    return case when v_owner = p_org then 'bound_here' else 'bound_elsewhere' end;
  end if;

  select * into v_b from public.billing_accounts b where b.org_id = p_org for update;
  v_has_account := found;
  if v_has_account and v_b.provider in ('dodo', 'apple') and v_b.provider_subscription_id is not null
     and v_b.state in ('active', 'past_due', 'cancellation_scheduled', 'suspended') then
    return 'paid_elsewhere';
  end if;

  if p_predecessor_sha256 is not null then
    select g.org_id into v_owner from public.google_play_purchases g where g.token_sha256 = p_predecessor_sha256;
    if found then
      if v_owner <> p_org then
        return 'bound_elsewhere';
      end if;
      insert into public.google_play_purchases (token_sha256, purchase_token, org_id, product_id, mode, predecessor_sha256, bound_by)
      values (p_token_sha256, p_token, p_org, p_product, p_mode, p_predecessor_sha256, p_actor);
      update public.google_play_purchases g set status = 'superseded', next_check_at = now() + interval '30 days'
       where g.token_sha256 = p_predecessor_sha256;
      insert into public.audit_events (org_id, actor_id, action, target, metadata)
      values (p_org, p_actor, 'billing.google_play_bound', 'gp_' || p_token_sha256, jsonb_build_object('product', p_product, 'mode', p_mode, 'replaces', 'gp_' || p_predecessor_sha256));
      return 'successor';
    end if;
  end if;

  if v_has_account and v_b.provider = 'google' and v_b.provider_subscription_id is not null
     and v_b.state in ('active', 'past_due', 'cancellation_scheduled', 'suspended') then
    return 'needs_successor';
  end if;

  -- The purchase began after the intent, and no more than 30 minutes after it. The two minutes allow for clocks.
  select i.id into v_intent from public.google_play_intents i
   where i.org_id = p_org and i.product_id = p_product and i.used_at is null
     and i.created_at <= p_started_at + interval '2 minutes'
     and i.created_at >= p_started_at - interval '30 minutes'
   order by i.created_at desc
   limit 1
   for update;
  if not found then
    return 'no_intent';
  end if;
  update public.google_play_intents i set used_at = now() where i.id = v_intent;
  insert into public.google_play_purchases (token_sha256, purchase_token, org_id, product_id, mode, bound_by)
  values (p_token_sha256, p_token, p_org, p_product, p_mode, p_actor);
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'billing.google_play_bound', 'gp_' || p_token_sha256, jsonb_build_object('product', p_product, 'mode', p_mode));
  return 'bound';
end;
$$;

-- After the server asked Google: what it learned and when to ask again.
create function public.app_google_mark_checked(p_token_sha256 text, p_status text, p_synced_at timestamptz, p_next_check_at timestamptz, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('active', 'superseded', 'ended') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  update public.google_play_purchases g
     set status = p_status,
         last_synced_at = greatest(coalesce(g.last_synced_at, p_synced_at), p_synced_at),
         next_check_at = p_next_check_at,
         detail = nullif(left(coalesce(p_detail, ''), 300), '')
   where g.token_sha256 = p_token_sha256;
end;
$$;

create function public.app_google_mark_acknowledged(p_token_sha256 text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.google_play_purchases g set acknowledged = true where g.token_sha256 = p_token_sha256;
$$;

create function public.app_google_set_voided_since(p_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.google_play_sync s set voided_since = p_at where s.id;
$$;

revoke all on function public.app_google_open_intent(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_google_bind_purchase(uuid, uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.app_google_mark_checked(text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.app_google_mark_acknowledged(text) from public, anon, authenticated;
revoke all on function public.app_google_set_voided_since(timestamptz) from public, anon, authenticated;
grant execute on function public.app_google_open_intent(uuid, uuid, text) to service_role;
grant execute on function public.app_google_bind_purchase(uuid, uuid, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.app_google_mark_checked(text, text, timestamptz, timestamptz, text) to service_role;
grant execute on function public.app_google_mark_acknowledged(text) to service_role;
grant execute on function public.app_google_set_voided_since(timestamptz) to service_role;
