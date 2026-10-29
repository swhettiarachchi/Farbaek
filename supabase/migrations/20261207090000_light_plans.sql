-- Farbaek schema v66: Lite and Maker, billed yearly (ADR 0105).
--
-- Two plans below Starter, shown as $0.99 and $1.99 a month and charged once
-- a year ($11.88 and $23.88), so Dodo's per-payment fee is paid once a year
-- and each keeps a 57% margin. Their products at Dodo are yearly, so a
-- product row now records its interval. Before each yearly renewal the
-- workspace's owners and admins get one email, 30 to 16 days ahead (some US
-- states require a notice before a yearly renewal); this table makes it one
-- per period. Additive: nothing existing changes meaning.

alter table public.billing_accounts drop constraint billing_accounts_paid_plan_id_check;
alter table public.billing_accounts add constraint billing_accounts_paid_plan_id_check
  check (paid_plan_id in ('lite', 'maker', 'starter', 'plus', 'pro', 'studio', 'max', 'max_2x', 'max_3x', 'enterprise'));

alter table public.billing_products drop constraint billing_products_plan_id_check;
alter table public.billing_products add constraint billing_products_plan_id_check
  check (plan_id in ('lite', 'maker', 'starter', 'plus', 'pro', 'studio', 'max', 'max_2x', 'max_3x'));
alter table public.billing_products drop constraint billing_products_interval_check;
alter table public.billing_products add constraint billing_products_interval_check check (interval in ('month', 'year'));

alter table public.billing_checkouts drop constraint billing_checkouts_plan_id_check;
alter table public.billing_checkouts add constraint billing_checkouts_plan_id_check
  check (plan_id in ('lite', 'maker', 'starter', 'plus', 'pro', 'studio', 'max', 'max_2x', 'max_3x'));

-- Records a product created at the provider, now with its interval. Same checks and event as before.
drop function public.app_staff_record_billing_product(uuid, uuid, text, text, text, text, integer, text, text, text, text);
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
  p_ua text,
  p_interval text default 'month'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'billing.products');
begin
  insert into public.billing_products (provider, mode, plan_id, interval, product_id, amount_cents, currency, catalog_version, created_by)
  values (p_provider, p_mode, p_plan, coalesce(p_interval, 'month'), p_product, p_amount_cents, p_currency, p_catalog_version, p_actor)
  on conflict do nothing;
  if not found then
    raise exception 'PRODUCT_EXISTS' using errcode = 'P0001';
  end if;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'billing.product_recorded', 'billing_product', p_product, null, null, null, 'success',
    jsonb_build_object('provider', p_provider, 'mode', p_mode, 'plan', p_plan, 'interval', coalesce(p_interval, 'month'), 'amount_cents', p_amount_cents, 'currency', p_currency, 'catalog_version', p_catalog_version),
    p_ip_hash, p_ua, null);
end;
$$;

create table public.billing_renewal_reminders (
  org_id       uuid not null references public.organizations (id) on delete cascade,
  period_end   timestamptz not null,
  status       text not null default 'claimed' check (status in ('claimed', 'accepted', 'failed', 'no_recipient')),
  recipients   integer not null default 0 check (recipients between 0 and 1000),
  detail       text check (char_length(detail) <= 500),
  created_at   timestamptz not null default now(),
  finished_at  timestamptz,
  primary key (org_id, period_end)
);
alter table public.billing_renewal_reminders enable row level security;
revoke all on public.billing_renewal_reminders from public, anon, authenticated, service_role;
grant select on public.billing_renewal_reminders to service_role;

-- Workspaces on one of the given yearly plans whose renewal is 16 to 30 days away, still set to renew, not yet reminded for that date.
create function public.app_billing_renewal_candidates(p_now timestamptz, p_plans text[])
returns table (org_id uuid, org_name text, plan_id text, renews_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.org_id, o.name, b.paid_plan_id, b.paid_through
  from public.billing_accounts b
  join public.organizations o on o.id = b.org_id
  where b.paid_plan_id = any (p_plans)
    and b.state = 'active'
    and not b.cancel_at_period_end
    and b.provider_subscription_id is not null
    and b.paid_through > p_now + interval '16 days'
    and b.paid_through <= p_now + interval '30 days'
    and not exists (select 1 from public.billing_renewal_reminders r where r.org_id = b.org_id and r.period_end = b.paid_through and r.status <> 'failed')
  order by b.paid_through
  limit 500;
$$;

-- Claims the reminder for one renewal date, or takes back one that failed. False when it's claimed or sent, so a rerun never sends twice.
create function public.app_billing_claim_renewal_reminder(p_org uuid, p_period_end timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.billing_renewal_reminders as r (org_id, period_end) values (p_org, p_period_end)
  on conflict (org_id, period_end) do update set status = 'claimed', recipients = 0, detail = null, finished_at = null where r.status = 'failed';
  return found;
end;
$$;

-- Records what the mail server said for a claimed reminder.
create function public.app_billing_finish_renewal_reminder(p_org uuid, p_period_end timestamptz, p_status text, p_recipients integer, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('accepted', 'failed', 'no_recipient') then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  update public.billing_renewal_reminders r
     set status = p_status, recipients = greatest(0, least(coalesce(p_recipients, 0), 1000)), detail = left(p_detail, 500), finished_at = now()
   where r.org_id = p_org and r.period_end = p_period_end and r.status = 'claimed';
end;
$$;

revoke all on function public.app_staff_record_billing_product(uuid, uuid, text, text, text, text, integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_billing_renewal_candidates(timestamptz, text[]) from public, anon, authenticated;
revoke all on function public.app_billing_claim_renewal_reminder(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.app_billing_finish_renewal_reminder(uuid, timestamptz, text, integer, text) from public, anon, authenticated;
grant execute on function public.app_staff_record_billing_product(uuid, uuid, text, text, text, text, integer, text, text, text, text, text) to service_role;
grant execute on function public.app_billing_renewal_candidates(timestamptz, text[]) to service_role;
grant execute on function public.app_billing_claim_renewal_reminder(uuid, timestamptz) to service_role;
grant execute on function public.app_billing_finish_renewal_reminder(uuid, timestamptz, text, integer, text) to service_role;
