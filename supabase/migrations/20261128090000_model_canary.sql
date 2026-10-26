-- Farbaek schema v57: Model Change Canary (ADR 0090).
--
-- Which model serves each tier can be switched at runtime, but only by an
-- owner with a fresh authenticator code, and only to a candidate a canary
-- compared with the current model in the last 7 days. A canary runs
-- Farbaek's own sample tasks, never customer work, one at a time and at
-- most three a day. A daily check records what Anthropic lists, so a
-- retired or replaced model is noticed. Staff write through these
-- functions only; the server key reads.

create table public.model_canary_runs (
  id               uuid primary key default gen_random_uuid(),
  family           text not null check (family in ('anthropic')),
  tier             text not null check (tier in ('fast', 'standard', 'strong', 'frontier')),
  current_model    text not null check (current_model ~ '^[a-z0-9][a-z0-9.-]{2,80}$'),
  candidate_model  text not null check (candidate_model ~ '^[a-z0-9][a-z0-9.-]{2,80}$'),
  status           text not null default 'running' check (status in ('running', 'finished', 'failed')),
  reason           text not null check (char_length(reason) between 10 and 500),
  estimate_units   bigint not null check (estimate_units between 0 and 10000000),
  report           jsonb check (report is null or jsonb_typeof(report) = 'object'),
  report_sha256    text check (report_sha256 is null or report_sha256 ~ '^[0-9a-f]{64}$'),
  failure          text check (failure is null or char_length(failure) between 1 and 300),
  started_by       uuid references auth.users (id) on delete set null,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  check (candidate_model <> current_model),
  check ((status = 'running') = (finished_at is null)),
  check ((status = 'finished') = (report is not null and report_sha256 is not null)),
  check ((status = 'failed') = (failure is not null))
);
create unique index model_canary_runs_one_running on public.model_canary_runs ((true)) where status = 'running';
create index model_canary_runs_started_idx on public.model_canary_runs (started_at desc);

create table public.platform_models (
  family     text not null check (family in ('anthropic')),
  tier       text not null check (tier in ('fast', 'standard', 'strong', 'frontier')),
  model      text not null check (model ~ '^[a-z0-9][a-z0-9.-]{2,80}$'),
  reason     text not null check (char_length(reason) between 10 and 500),
  canary_id  uuid not null references public.model_canary_runs (id),
  set_by     uuid references auth.users (id) on delete set null,
  set_at     timestamptz not null default now(),
  primary key (family, tier)
);

create table public.model_checks (
  id          bigint generated always as identity primary key,
  checked_at  timestamptz not null default now(),
  listed      jsonb not null check (jsonb_typeof(listed) = 'array'),
  findings    jsonb not null check (jsonb_typeof(findings) = 'array')
);
create index model_checks_checked_idx on public.model_checks (checked_at desc);

alter table public.model_canary_runs enable row level security;
alter table public.platform_models enable row level security;
alter table public.model_checks enable row level security;
revoke all on public.model_canary_runs, public.platform_models, public.model_checks from public, anon, authenticated, service_role;
grant select on public.model_canary_runs, public.platform_models, public.model_checks to service_role;
revoke all on sequence public.model_checks_id_seq from public, anon, authenticated;

-- The daily check tells the owner about a model that's gone or a newer one.
alter table public.platform_alerts drop constraint platform_alerts_kind_check;
alter table public.platform_alerts add constraint platform_alerts_kind_check
  check (kind in ('ai_spend_80', 'ai_spend_100', 'model_missing', 'model_newer'));

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
    else false
  end, false);
$$;

-- Starts a canary: one at a time, at most three in 24 hours. It spends Farbaek's own AI credit, so a reason goes with it.
create function public.app_staff_start_canary(
  p_actor uuid,
  p_session uuid,
  p_family text,
  p_tier text,
  p_current text,
  p_candidate text,
  p_estimate_units bigint,
  p_reason text,
  p_ip_hash text,
  p_ua text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'models.canary');
  v_reason text := private.require_reason(p_reason);
  v_id uuid;
begin
  if exists (select 1 from public.model_canary_runs where status = 'running') then
    raise exception 'CANARY_RUNNING' using errcode = 'P0001';
  end if;
  if (select count(*) from public.model_canary_runs where started_at > now() - interval '24 hours') >= 3 then
    raise exception 'CANARY_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.model_canary_runs (family, tier, current_model, candidate_model, reason, estimate_units, started_by)
  values (p_family, p_tier, p_current, p_candidate, v_reason, p_estimate_units, p_actor)
  returning id into v_id;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'models.canary_started', 'model', p_candidate, null, v_reason, null, 'success',
    jsonb_build_object('run', v_id, 'family', p_family, 'tier', p_tier, 'current', p_current, 'candidate', p_candidate, 'estimate_units', p_estimate_units),
    p_ip_hash, p_ua, null);
  return v_id;
end;
$$;

-- The server records how a canary ended.
create function public.app_finish_canary(p_id uuid, p_status text, p_report jsonb, p_report_sha256 text, p_failure text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('finished', 'failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  update public.model_canary_runs
     set status = p_status,
         report = case when p_status = 'finished' then p_report end,
         report_sha256 = case when p_status = 'finished' then p_report_sha256 end,
         failure = case when p_status = 'failed' then left(coalesce(nullif(btrim(p_failure), ''), 'The canary stopped.'), 300) end,
         finished_at = now()
   where id = p_id and status = 'running';
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- Switches a tier to a candidate a canary compared in the last 7 days, or (a null model) back to its default.
create function public.app_staff_set_model(
  p_actor uuid,
  p_session uuid,
  p_family text,
  p_tier text,
  p_model text,
  p_canary uuid,
  p_reason text,
  p_auth_strength text,
  p_ip_hash text,
  p_ua text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_staff(p_actor, p_session, 'models.switch');
  v_reason text := private.require_reason(p_reason);
  v_was text;
begin
  if p_auth_strength is distinct from 'step_up' then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  select model into v_was from public.platform_models where family = p_family and tier = p_tier for update;
  if p_model is null then
    if v_was is null then
      raise exception 'NOTHING_TO_CHANGE' using errcode = 'P0001';
    end if;
    delete from public.platform_models where family = p_family and tier = p_tier;
    perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'models.default_restored', 'model', p_tier, null, v_reason, null, 'success',
      jsonb_build_object('family', p_family, 'tier', p_tier, 'was', v_was), p_ip_hash, p_ua, null);
    return;
  end if;
  if not exists (
    select 1 from public.model_canary_runs r
     where r.id = p_canary and r.status = 'finished' and r.family = p_family and r.tier = p_tier
       and r.candidate_model = p_model and r.finished_at > now() - interval '7 days'
  ) then
    raise exception 'CANARY_REQUIRED' using errcode = 'P0001';
  end if;
  insert into public.platform_models (family, tier, model, reason, canary_id, set_by, set_at)
  values (p_family, p_tier, p_model, v_reason, p_canary, p_actor, now())
  on conflict (family, tier) do update
    set model = excluded.model, reason = excluded.reason, canary_id = excluded.canary_id, set_by = excluded.set_by, set_at = excluded.set_at;
  perform private.record_staff_event(p_actor, v_role, p_session, 'step_up', 'models.switched', 'model', p_model, null, v_reason, null, 'success',
    jsonb_build_object('family', p_family, 'tier', p_tier, 'was', v_was, 'to', p_model, 'canary', p_canary), p_ip_hash, p_ua, null);
end;
$$;

-- The server records what Anthropic listed today, and what the check found.
create function public.app_record_model_check(p_listed jsonb, p_findings jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.model_checks (listed, findings) values (p_listed, p_findings) returning id into v_id;
  delete from public.model_checks where checked_at < now() - interval '90 days';
  return v_id;
end;
$$;

revoke all on function public.app_staff_start_canary(uuid, uuid, text, text, text, text, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.app_finish_canary(uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.app_staff_set_model(uuid, uuid, text, text, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_record_model_check(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_staff_start_canary(uuid, uuid, text, text, text, text, bigint, text, text, text) to service_role;
grant execute on function public.app_finish_canary(uuid, text, jsonb, text, text) to service_role;
grant execute on function public.app_staff_set_model(uuid, uuid, text, text, text, uuid, text, text, text, text) to service_role;
grant execute on function public.app_record_model_check(jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
