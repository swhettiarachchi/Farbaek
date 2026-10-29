-- Farbaek schema v71: plans bought through Apple's In-App Purchase (ADR 0112).
--
-- Farbaek for iPhone sells monthly plans with StoreKit. Apple signs every
-- transaction and every App Store Server Notification; the server checks the
-- signature against Apple's root and applies the plan through
-- app_billing_apply_subscription, the same function Dodo's webhooks use, so
-- entitlements, usage and limits work the same way. Apple's subscription is
-- identified by its original transaction id. A workspace is billed by one
-- provider at a time: the server refuses an Apple purchase for a workspace
-- the web bills, and the web's checkout and plan changes refuse one Apple
-- bills.

alter table public.billing_accounts drop constraint billing_accounts_provider_check;
alter table public.billing_accounts add constraint billing_accounts_provider_check check (provider in ('dodo', 'apple'));

-- Each notification once, by Apple's id, so a replay changes nothing. Apple
-- retries a notification Farbaek didn't answer with 200, so a failed one is
-- tried again when it comes back.
create table public.apple_notifications (
  notification_uuid        uuid primary key,
  type                     text not null check (type ~ '^[A-Z_]{1,60}$'),
  subtype                  text check (subtype is null or subtype ~ '^[A-Z_]{1,60}$'),
  environment              text not null check (environment in ('Sandbox', 'Production')),
  original_transaction_id  text check (original_transaction_id is null or original_transaction_id ~ '^[0-9]{1,30}$'),
  org_id                   uuid references public.organizations (id) on delete set null,
  received_at              timestamptz not null default now(),
  status                   text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  detail                   text check (detail is null or char_length(detail) between 1 and 300),
  processed_at             timestamptz
);
create index apple_notifications_received_idx on public.apple_notifications (received_at desc);
alter table public.apple_notifications enable row level security;
revoke all on public.apple_notifications from public, anon, authenticated, service_role;
grant select on public.apple_notifications to service_role;

-- 'new' the first time, 'done' when it was already handled, 'retry' when an earlier try didn't finish.
-- Handled notifications are deleted after 180 days.
create function public.app_apple_record_notification(p_uuid uuid, p_type text, p_subtype text, p_environment text, p_original text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  delete from public.apple_notifications n where n.status in ('processed', 'ignored') and n.received_at < now() - interval '180 days';
  insert into public.apple_notifications (notification_uuid, type, subtype, environment, original_transaction_id)
  values (p_uuid, p_type, p_subtype, p_environment, p_original)
  on conflict (notification_uuid) do nothing;
  if found then
    return 'new';
  end if;
  select n.status into v_status from public.apple_notifications n where n.notification_uuid = p_uuid;
  return case when v_status in ('processed', 'ignored') then 'done' else 'retry' end;
end;
$$;

create function public.app_apple_finish_notification(p_uuid uuid, p_status text, p_detail text, p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('processed', 'ignored', 'failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  update public.apple_notifications n
     set status = p_status,
         detail = nullif(left(coalesce(p_detail, ''), 300), ''),
         org_id = coalesce((select o.id from public.organizations o where o.id = p_org), n.org_id),
         processed_at = case when p_status = 'failed' then null else now() end
   where n.notification_uuid = p_uuid;
end;
$$;

revoke all on function public.app_apple_record_notification(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_apple_finish_notification(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.app_apple_record_notification(uuid, text, text, text, text) to service_role;
grant execute on function public.app_apple_finish_notification(uuid, text, text, uuid) to service_role;
