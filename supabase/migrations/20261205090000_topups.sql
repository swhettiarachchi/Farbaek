-- Farbaek schema v64: AI usage top-ups with a spend cap (ADR 0102).
--
-- An owner or admin sets a monthly top-up limit; until then top-ups are off.
-- Starting a top-up checkout counts this month's paid top-ups plus checkouts
-- opened in the last day, so open checkouts can't pass the limit either. A
-- top-up becomes usage only when the server has read the payment back from
-- the provider: then one grant, lasting 12 months, keyed so it happens once.
-- The server key reads these tables; it writes only through these functions.

alter table public.billing_accounts
  add column topup_cap_cents integer check (topup_cap_cents is null or topup_cap_cents between 0 and 100000);

create table public.billing_topup_products (
  provider         text not null check (provider in ('dodo')),
  mode             text not null check (mode in ('test', 'live')),
  pack_cents       integer not null check (pack_cents in (1000, 2500, 5000)),
  product_id       text not null unique check (product_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  catalog_version  text not null check (char_length(catalog_version) between 1 and 40),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (provider, mode, pack_cents, catalog_version)
);

create table public.billing_topups (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  provider        text not null check (provider in ('dodo')),
  mode            text not null check (mode in ('test', 'live')),
  session_id      text not null unique check (session_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  product_id      text not null check (product_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  pack_cents      integer not null check (pack_cents in (1000, 2500, 5000)),
  units           bigint not null check (units between 1 and 100000000),
  consent_text    text not null check (char_length(consent_text) between 50 and 1000),
  consent_sha256  text not null check (consent_sha256 ~ '^[0-9a-f]{64}$'),
  status          text not null default 'open' check (status in ('open', 'paid')),
  payment_id      text unique check (payment_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  check ((status = 'paid') = (paid_at is not null and payment_id is not null))
);
create index billing_topups_org_idx on public.billing_topups (org_id, created_at desc);

alter table public.billing_topup_products enable row level security;
alter table public.billing_topups enable row level security;
revoke all on public.billing_topup_products, public.billing_topups from public, anon, authenticated, service_role;
grant select on public.billing_topup_products, public.billing_topups to service_role;

-- Sets (or clears, with null) the workspace's monthly top-up limit. Owners and admins.
create function public.app_billing_set_topup_cap(p_org uuid, p_actor uuid, p_cents integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_manager(p_org, p_actor);
  if p_cents is not null and (p_cents < 0 or p_cents > 100000) then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  update public.billing_accounts b set topup_cap_cents = p_cents, updated_at = now() where b.org_id = p_org;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'billing.topup_cap_set', p_org::text, jsonb_build_object('cents', p_cents));
end;
$$;

-- Records a top-up checkout an owner or admin agreed to, within the monthly limit.
create function public.app_billing_start_topup(
  p_org uuid,
  p_actor uuid,
  p_provider text,
  p_mode text,
  p_session text,
  p_product text,
  p_pack_cents integer,
  p_units bigint,
  p_consent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.billing_accounts%rowtype;
  v_spent bigint;
  v_id uuid;
  v_hash text := encode(sha256(convert_to(coalesce(p_consent, ''), 'UTF8')), 'hex');
begin
  perform private.require_manager(p_org, p_actor);
  if private.org_suspended(p_org) then
    raise exception 'PAUSED_BY_FARBAEK' using errcode = 'P0001';
  end if;
  -- The account row's lock orders concurrent top-ups, so two can't both fit under the limit.
  select * into v_b from public.billing_accounts b where b.org_id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_b.state not in ('active', 'past_due', 'cancellation_scheduled') or v_b.paid_plan_id is null then
    raise exception 'NOT_SUBSCRIBED' using errcode = 'P0001';
  end if;
  if v_b.topup_cap_cents is null then
    raise exception 'NO_CAP' using errcode = 'P0001';
  end if;
  select coalesce(sum(t.pack_cents), 0) into v_spent from public.billing_topups t
   where t.org_id = p_org
     and ((t.status = 'paid' and t.paid_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
       or (t.status = 'open' and t.created_at > now() - interval '24 hours'));
  if v_spent + p_pack_cents > v_b.topup_cap_cents then
    raise exception 'CAP_REACHED' using errcode = 'P0001';
  end if;
  insert into public.billing_topups (org_id, provider, mode, session_id, product_id, pack_cents, units, consent_text, consent_sha256, created_by)
  values (p_org, p_provider, p_mode, p_session, p_product, p_pack_cents, p_units, p_consent, v_hash, p_actor)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'billing.topup_started', v_id::text,
    jsonb_build_object('pack_cents', p_pack_cents, 'units', p_units, 'mode', p_mode, 'consent_sha256', v_hash));
  return v_id;
end;
$$;

-- Turns a paid top-up into usage, once. The server calls this after reading the payment back from the provider.
-- It's found by the checkout session the payment came from. Returns 'paid' or 'already'.
create function public.app_billing_complete_topup(p_org uuid, p_session text, p_payment text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.billing_topups%rowtype;
begin
  select * into v_t from public.billing_topups t where t.session_id = p_session and t.org_id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_t.status = 'paid' then
    if v_t.payment_id is distinct from p_payment then
      raise exception 'INVALID_REQUEST' using errcode = '22023';
    end if;
    return 'already';
  end if;
  insert into public.usage_grants (org_id, kind, units, starts_at, expires_at, source_key)
  values (p_org, 'topup', v_t.units, now(), now() + interval '12 months', 'topup:' || v_t.id::text)
  on conflict (org_id, source_key) do nothing;
  update public.billing_topups t set status = 'paid', payment_id = p_payment, paid_at = now() where t.id = v_t.id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, null, 'billing.topup_paid', v_t.id::text,
    jsonb_build_object('pack_cents', v_t.pack_cents, 'units', v_t.units, 'payment', p_payment));
  return 'paid';
end;
$$;

-- Records a top-up pack's product the server just created at the provider. Owners only (billing.products).
create function public.app_staff_record_topup_product(
  p_actor uuid,
  p_session uuid,
  p_provider text,
  p_mode text,
  p_pack_cents integer,
  p_product text,
  p_catalog_version text,
  p_ip_hash text,
  p_ua text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'billing.products');
begin
  insert into public.billing_topup_products (provider, mode, pack_cents, product_id, catalog_version, created_by)
  values (p_provider, p_mode, p_pack_cents, p_product, p_catalog_version, p_actor)
  on conflict do nothing;
  if not found then
    raise exception 'PRODUCT_EXISTS' using errcode = 'P0001';
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'billing.topup_product_recorded', 'billing_product', p_product, null, null, null, 'success',
    jsonb_build_object('provider', p_provider, 'mode', p_mode, 'pack_cents', p_pack_cents, 'catalog_version', p_catalog_version),
    p_ip_hash, p_ua, null);
end;
$$;

revoke all on function public.app_billing_set_topup_cap(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.app_billing_start_topup(uuid, uuid, text, text, text, text, integer, bigint, text) from public, anon, authenticated;
revoke all on function public.app_billing_complete_topup(uuid, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_record_topup_product(uuid, uuid, text, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_billing_set_topup_cap(uuid, uuid, integer) to service_role;
grant execute on function public.app_billing_start_topup(uuid, uuid, text, text, text, text, integer, bigint, text) to service_role;
grant execute on function public.app_billing_complete_topup(uuid, text, text) to service_role;
grant execute on function public.app_staff_record_topup_product(uuid, uuid, text, text, integer, text, text, text, text) to service_role;
