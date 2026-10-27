-- Farbaek schema v62: payments through Dodo Payments, in test mode (ADR 0100).
--
-- A workspace's billing state changes only when the server has verified a
-- provider webhook and re-fetched the subscription from the provider: never
-- from a browser, and never from the webhook's own claims. A checkout records
-- the words the person agreed to and changes nothing until the provider
-- confirms. Every webhook is stored once by its id, so a replay is a no-op.
-- The server key reads these tables; it writes only through these functions.

alter table public.billing_accounts
  add column provider                 text check (provider in ('dodo')),
  add column provider_mode            text check (provider_mode in ('test', 'live')),
  add column provider_customer_id     text check (provider_customer_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  add column provider_subscription_id text unique check (provider_subscription_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  -- Paid usage periods follow this day of the month (currentGrant in src/core/billing/wallet.ts).
  add column subscription_started_at  timestamptz,
  add column cancel_at_period_end     boolean not null default false,
  -- When the server last read the subscription from the provider: an older read never overwrites a newer one.
  add column provider_synced_at       timestamptz;

create table public.billing_products (
  provider         text not null check (provider in ('dodo')),
  mode             text not null check (mode in ('test', 'live')),
  plan_id          text not null check (plan_id in ('starter', 'plus', 'pro', 'studio', 'max', 'max_2x', 'max_3x')),
  interval         text not null default 'month' check (interval in ('month')),
  product_id       text not null unique check (product_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  amount_cents     integer not null check (amount_cents between 1 and 10000000),
  currency         text not null check (currency ~ '^[A-Z]{3}$'),
  catalog_version  text not null check (char_length(catalog_version) between 1 and 40),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (provider, mode, plan_id, interval, catalog_version)
);

create table public.billing_checkouts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  provider        text not null check (provider in ('dodo')),
  mode            text not null check (mode in ('test', 'live')),
  session_id      text not null unique check (session_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  plan_id         text not null check (plan_id in ('starter', 'plus', 'pro', 'studio', 'max', 'max_2x', 'max_3x')),
  product_id      text not null check (product_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  amount_cents    integer not null check (amount_cents between 1 and 10000000),
  -- The exact words agreed to, and their SHA-256, computed here.
  consent_text    text not null check (char_length(consent_text) between 50 and 1000),
  consent_sha256  text not null check (consent_sha256 ~ '^[0-9a-f]{64}$'),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  status          text not null default 'open' check (status in ('open', 'completed', 'expired')),
  completed_at    timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);
create index billing_checkouts_org_idx on public.billing_checkouts (org_id, created_at desc);

create table public.provider_webhook_events (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null check (provider in ('dodo')),
  mode             text not null check (mode in ('test', 'live')),
  webhook_id       text not null check (webhook_id ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  type             text not null check (type ~ '^[a-z_]+\.[a-z_]+$' and char_length(type) <= 80),
  payload          jsonb not null check (jsonb_typeof(payload) = 'object'),
  subscription_id  text check (subscription_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  org_id           uuid references public.organizations (id) on delete set null,
  event_at         timestamptz not null,
  received_at      timestamptz not null default now(),
  status           text not null default 'received' check (status in ('received', 'processing', 'processed', 'ignored', 'failed', 'dead')),
  attempts         integer not null default 0 check (attempts between 0 and 50),
  next_attempt_at  timestamptz not null default now(),
  last_error       text check (last_error is null or char_length(last_error) between 1 and 300),
  processed_at     timestamptz,
  unique (provider, webhook_id)
);
create index provider_webhook_events_due_idx on public.provider_webhook_events (next_attempt_at) where status in ('received', 'processing', 'failed');
create index provider_webhook_events_received_idx on public.provider_webhook_events (received_at desc);

alter table public.billing_products enable row level security;
alter table public.billing_checkouts enable row level security;
alter table public.provider_webhook_events enable row level security;
revoke all on public.billing_products, public.billing_checkouts, public.provider_webhook_events from public, anon, authenticated, service_role;
grant select on public.billing_products, public.billing_checkouts, public.provider_webhook_events to service_role;

-- --------------------------------------------------------------- webhooks

-- Stores a verified webhook once. Returns its id, or null when it was already stored (a replay).
create function public.app_billing_record_webhook(
  p_provider text,
  p_mode text,
  p_webhook_id text,
  p_type text,
  p_payload jsonb,
  p_subscription_id text,
  p_org uuid,
  p_event_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_org uuid := (select o.id from public.organizations o where o.id = p_org);
begin
  insert into public.provider_webhook_events (provider, mode, webhook_id, type, payload, subscription_id, org_id, event_at)
  values (p_provider, p_mode, p_webhook_id, p_type, p_payload, p_subscription_id, v_org, p_event_at)
  on conflict (provider, webhook_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Claims due events for processing: one by id (right after it arrives) or the oldest due. A claim lasts 10 minutes.
-- Processed and ignored events are deleted after 90 days: they hold names and email addresses, and a replay
-- that old fails the signature's timestamp check anyway.
create function public.app_billing_claim_webhooks(p_limit integer, p_id uuid)
returns table (id uuid, mode text, type text, subscription_id text, org_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.provider_webhook_events e
   where e.status in ('processed', 'ignored') and e.received_at < now() - interval '90 days';
  return query
  with due as (
    select e.id from public.provider_webhook_events e
     where e.status in ('received', 'processing', 'failed') and e.next_attempt_at <= now()
       and (p_id is null or e.id = p_id)
     order by e.received_at
     limit greatest(1, least(coalesce(p_limit, 10), 50))
     for update skip locked
  )
  update public.provider_webhook_events e
     set status = 'processing', attempts = e.attempts + 1, next_attempt_at = now() + interval '10 minutes'
    from due
   where e.id = due.id
  returning e.id, e.mode, e.type, e.subscription_id, e.org_id, e.attempts;
end;
$$;

-- Records how processing went. A failure is retried after 1, 5 and 30 minutes, then 2, 5 and 10 hours, and is dead after 8 attempts.
create function public.app_billing_finish_webhook(p_id uuid, p_status text, p_error text, p_org uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_status text;
begin
  if p_status not in ('processed', 'ignored', 'failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  select e.attempts into v_attempts from public.provider_webhook_events e where e.id = p_id and e.status = 'processing' for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  v_status := case when p_status = 'failed' and v_attempts >= 8 then 'dead' else p_status end;
  update public.provider_webhook_events e
     set status = v_status,
         last_error = case when p_status = 'failed' then left(coalesce(nullif(btrim(p_error), ''), 'Processing failed.'), 300) else null end,
         processed_at = case when p_status = 'failed' then null else now() end,
         next_attempt_at = now() + case least(v_attempts, 6)
           when 1 then interval '1 minute' when 2 then interval '5 minutes' when 3 then interval '30 minutes'
           when 4 then interval '2 hours' when 5 then interval '5 hours' else interval '10 hours' end,
         org_id = coalesce(e.org_id, (select o.id from public.organizations o where o.id = p_org))
   where e.id = p_id;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------- checkout

-- Records a checkout an owner or admin agreed to. It changes nothing about the workspace's plan:
-- only the provider's confirmed subscription does.
create function public.app_billing_start_checkout(
  p_org uuid,
  p_actor uuid,
  p_provider text,
  p_mode text,
  p_session_id text,
  p_plan text,
  p_product text,
  p_amount_cents integer,
  p_consent_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_hash text := encode(sha256(convert_to(coalesce(p_consent_text, ''), 'UTF8')), 'hex');
begin
  perform private.require_manager(p_org, p_actor);
  if private.org_suspended(p_org) then
    raise exception 'PAUSED_BY_FARBAEK' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.billing_accounts b
     where b.org_id = p_org and b.provider_subscription_id is not null
       and b.state in ('active', 'past_due', 'cancellation_scheduled', 'suspended')
  ) then
    raise exception 'ALREADY_SUBSCRIBED' using errcode = 'P0001';
  end if;
  update public.billing_checkouts c set status = 'expired' where c.org_id = p_org and c.status = 'open';
  insert into public.billing_checkouts (org_id, provider, mode, session_id, plan_id, product_id, amount_cents, consent_text, consent_sha256, created_by)
  values (p_org, p_provider, p_mode, p_session_id, p_plan, p_product, p_amount_cents, p_consent_text, v_hash, p_actor)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'billing.checkout_started', v_id::text,
    jsonb_build_object('plan', p_plan, 'mode', p_mode, 'amount_cents', p_amount_cents, 'consent_sha256', v_hash));
  return v_id;
end;
$$;

-- ------------------------------------------------------------ subscription

-- Applies a subscription as the server just read it from the provider. Returns:
--   'applied'            the state changed, with one audit event;
--   'unchanged'          nothing to change;
--   'stale'              a newer read was already applied;
--   'other_subscription' an ended subscription that isn't the workspace's current one.
create function public.app_billing_apply_subscription(
  p_org uuid,
  p_provider text,
  p_mode text,
  p_subscription_id text,
  p_customer_id text,
  p_state text,
  p_plan text,
  p_paid_through timestamptz,
  p_suspended_reason text,
  p_cancel_at_period_end boolean,
  p_started_at timestamptz,
  p_synced_at timestamptz,
  p_source text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.billing_accounts%rowtype;
  v_live boolean := p_state in ('active', 'past_due', 'cancellation_scheduled', 'suspended');
begin
  if p_state not in ('active', 'past_due', 'cancellation_scheduled', 'suspended', 'expired') then
    raise exception 'INVALID_STATE' using errcode = '22023';
  end if;
  if v_live and p_plan is null then
    raise exception 'PLAN_REQUIRED' using errcode = '22023';
  end if;
  if p_synced_at is null or p_started_at is null then
    raise exception 'INVALID_TIMES' using errcode = '22023';
  end if;
  select * into v_b from public.billing_accounts b where b.org_id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_b.provider_subscription_id is distinct from p_subscription_id and v_b.provider_subscription_id is not null and not v_live then
    return 'other_subscription';
  end if;
  if v_b.provider_subscription_id = p_subscription_id and v_b.provider_synced_at is not null and p_synced_at < v_b.provider_synced_at then
    return 'stale';
  end if;

  if v_b.provider_subscription_id is not distinct from p_subscription_id
     and v_b.state::text = p_state
     and v_b.paid_plan_id is not distinct from p_plan
     and v_b.paid_through is not distinct from p_paid_through
     and v_b.suspended_reason is not distinct from p_suspended_reason
     and v_b.cancel_at_period_end = coalesce(p_cancel_at_period_end, false) then
    update public.billing_accounts b set provider_synced_at = p_synced_at where b.org_id = p_org;
    return 'unchanged';
  end if;

  update public.billing_accounts b
     set state = p_state::public.subscription_state,
         paid_plan_id = case when p_state = 'expired' then null else p_plan end,
         paid_through = case when p_state = 'expired' then null else p_paid_through end,
         suspended_reason = case when p_state = 'suspended' then p_suspended_reason else null end,
         cancel_at_period_end = coalesce(p_cancel_at_period_end, false) and p_state <> 'expired',
         provider = p_provider,
         provider_mode = p_mode,
         provider_customer_id = coalesce(p_customer_id, b.provider_customer_id),
         provider_subscription_id = p_subscription_id,
         subscription_started_at = p_started_at,
         provider_synced_at = p_synced_at,
         updated_at = now()
   where b.org_id = p_org;

  if v_live then
    update public.billing_checkouts c set status = 'completed', completed_at = now() where c.org_id = p_org and c.status = 'open';
  end if;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, null, 'billing.subscription_changed', p_subscription_id,
    jsonb_strip_nulls(jsonb_build_object(
      'from', v_b.state, 'to', p_state, 'plan', p_plan, 'mode', p_mode, 'source', left(p_source, 80),
      'paid_through', p_paid_through, 'cancel_at_period_end', coalesce(p_cancel_at_period_end, false))));
  return 'applied';
end;
$$;

-- ------------------------------------------------------------ Office Space

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
    when 'models.canary'         then p_role in ('owner', 'admin')
    when 'models.switch'         then p_role in ('owner')
    when 'billing.products'      then p_role in ('owner')
    when 'billing.replay'        then p_role in ('owner', 'admin')
    else false
  end, false);
$$;

-- Records a product the server just created at the provider for a plan in the current catalog.
create function public.app_staff_record_billing_product(
  p_actor uuid,
  p_session uuid,
  p_provider text,
  p_mode text,
  p_plan text,
  p_product text,
  p_amount_cents integer,
  p_currency text,
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
  insert into public.billing_products (provider, mode, plan_id, product_id, amount_cents, currency, catalog_version, created_by)
  values (p_provider, p_mode, p_plan, p_product, p_amount_cents, p_currency, p_catalog_version, p_actor)
  on conflict do nothing;
  if not found then
    raise exception 'PRODUCT_EXISTS' using errcode = 'P0001';
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'billing.product_recorded', 'billing_product', p_product, null, null, null, 'success',
    jsonb_build_object('provider', p_provider, 'mode', p_mode, 'plan', p_plan, 'amount_cents', p_amount_cents, 'currency', p_currency, 'catalog_version', p_catalog_version),
    p_ip_hash, p_ua, null);
end;
$$;

-- Queues a failed or dead webhook again. Processing re-reads the subscription from the provider, so a replay is safe.
create function public.app_staff_replay_webhook(p_actor uuid, p_session uuid, p_id uuid, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'billing.replay');
  v_e record;
begin
  update public.provider_webhook_events e
     set status = 'received', attempts = 0, next_attempt_at = now(), last_error = null
   where e.id = p_id and e.status in ('failed', 'dead')
  returning e.webhook_id, e.type, e.org_id into v_e;
  if not found then
    raise exception 'NOT_REPLAYABLE' using errcode = 'P0001';
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'billing.webhook_replayed', 'webhook', v_e.webhook_id, v_e.org_id, null, null, 'success',
    jsonb_build_object('type', v_e.type), p_ip_hash, p_ua, null);
end;
$$;

revoke all on function public.app_billing_record_webhook(text, text, text, text, jsonb, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.app_billing_claim_webhooks(integer, uuid) from public, anon, authenticated;
revoke all on function public.app_billing_finish_webhook(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.app_billing_start_checkout(uuid, uuid, text, text, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.app_billing_apply_subscription(uuid, text, text, text, text, text, text, timestamptz, text, boolean, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.app_staff_record_billing_product(uuid, uuid, text, text, text, text, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_replay_webhook(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_billing_record_webhook(text, text, text, text, jsonb, text, uuid, timestamptz) to service_role;
grant execute on function public.app_billing_claim_webhooks(integer, uuid) to service_role;
grant execute on function public.app_billing_finish_webhook(uuid, text, text, uuid) to service_role;
grant execute on function public.app_billing_start_checkout(uuid, uuid, text, text, text, text, text, integer, text) to service_role;
grant execute on function public.app_billing_apply_subscription(uuid, text, text, text, text, text, text, timestamptz, text, boolean, timestamptz, timestamptz, text) to service_role;
grant execute on function public.app_staff_record_billing_product(uuid, uuid, text, text, text, text, integer, text, text, text, text) to service_role;
grant execute on function public.app_staff_replay_webhook(uuid, uuid, uuid, text, text) to service_role;
