-- Farbaek schema v40: alerts to the owner about the platform (ADR 0068).
--
-- The daily AI limit (v38) pauses AI for everyone once it's reached. The owner
-- now gets an email at 80% of it and when it's reached, at most once each per
-- UTC day. A claim makes sure two runs can't both send, and records what the
-- mail server said, never claiming delivery.

create table public.platform_alerts (
  day         date not null,
  kind        text not null check (kind in ('ai_spend_80', 'ai_spend_100')),
  status      text not null check (status in ('sending', 'accepted', 'failed', 'skipped')),
  detail      text check (char_length(detail) <= 300),
  attempts    integer not null default 1 check (attempts between 1 and 3),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (day, kind)
);
alter table public.platform_alerts enable row level security;
revoke all on public.platform_alerts from public, anon, authenticated;

-- Today's AI usage across every workspace, counted exactly as the daily limit counts it.
create function public.app_platform_ai_units_today()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(credits), 0)::bigint from public.ai_credit_ledger
  where status in ('reserved', 'settled') and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

-- The alerts already recorded for a day, whatever their status.
create function public.app_platform_alerts_on(p_day date)
returns table (kind text, status text, attempts integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.kind, a.status, a.attempts from public.platform_alerts a where a.day = p_day;
$$;

-- Claims an alert for sending: a new row, or a failed one with tries left.
create function public.app_claim_platform_alert(p_day date, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  insert into public.platform_alerts (day, kind, status) values (p_day, p_kind, 'sending')
  on conflict (day, kind) do nothing;
  if found then return true; end if;
  update public.platform_alerts set status = 'sending', attempts = attempts + 1, updated_at = now()
  where day = p_day and kind = p_kind and status = 'failed' and attempts < 3;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Records how a claimed alert ended. Only a claimed alert can finish.
create function public.app_finish_platform_alert(p_day date, p_kind text, p_status text, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('accepted', 'failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  update public.platform_alerts set status = p_status, detail = left(p_detail, 300), updated_at = now()
  where day = p_day and kind = p_kind and status = 'sending';
end;
$$;

-- Records an alert that won't be sent, such as 80% once the limit is already reached.
create function public.app_skip_platform_alert(p_day date, p_kind text, p_detail text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_alerts (day, kind, status, detail) values (p_day, p_kind, 'skipped', left(p_detail, 300))
  on conflict (day, kind) do nothing;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_platform_ai_units_today()',
    'public.app_platform_alerts_on(date)',
    'public.app_claim_platform_alert(date, text)',
    'public.app_finish_platform_alert(date, text, text, text)',
    'public.app_skip_platform_alert(date, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
