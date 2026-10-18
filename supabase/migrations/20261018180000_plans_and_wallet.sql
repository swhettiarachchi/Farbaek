-- Farbaek schema v15: the eight plans and the usage wallet (ADR 0020).
--
-- Plans: Starter, Plus, Pro, Studio, Max, Max 2x, Max 3x and Enterprise
-- replace Developer, Team and Business. No paid subscription exists yet
-- (payments aren't connected), so renaming is safe; any old id is mapped.
-- The 14-day trial now carries Pro's features.
--
-- The wallet: AI usage is metered in units (1 unit = $0.0001 of provider list
-- cost, src/core/billing/rate-card.ts) and held in grants. Each period issues
-- one grant that lasts two months, so unused usage rolls over. Spending draws
-- from the grant that expires soonest. Every ledger entry records exactly
-- which grants it drew from, so settling to the real cost or refunding gives
-- usage back to the same grants. A refund for a free retry is capped per
-- month by the plan (the server passes the cap; the sum is checked here
-- under the organization lock).
--
-- Existing ledger rows hold the old per-action credits (1 to 3 each). They
-- now read as units, which is a negligible amount; nothing else changes.

-- ------------------------------------------------------------------ plans

alter table public.billing_accounts drop constraint billing_accounts_paid_plan_id_check;
update public.billing_accounts
set paid_plan_id = case paid_plan_id when 'developer' then 'plus' when 'team' then 'max' when 'business' then 'max_3x' else paid_plan_id end
where paid_plan_id in ('developer', 'team', 'business');
alter table public.billing_accounts add constraint billing_accounts_paid_plan_id_check
  check (paid_plan_id in ('starter', 'plus', 'pro', 'studio', 'max', 'max_2x', 'max_3x', 'enterprise'));

alter table public.trials drop constraint trials_plan_id_check;
alter table public.trials alter column plan_id set default 'pro';
update public.trials set plan_id = 'pro' where plan_id <> 'pro';
alter table public.trials add constraint trials_plan_id_check check (plan_id = 'pro');

-- Every workspace now reads the new catalog (src/core/billing/catalog.ts).
update public.billing_accounts set plan_catalog_version = '2026-10-18.1';

-- New workspaces record the new catalog version. Otherwise unchanged from schema v1.
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_org uuid;
  v_trial_started boolean := false;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  if char_length(v_name) not between 1 and 80 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  insert into public.organizations (name, created_by) values (v_name, v_uid) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org, v_uid, 'owner');

  insert into public.trials (org_id, started_by, started_at, ends_at)
  values (v_org, v_uid, now(), now() + interval '14 days')
  on conflict (started_by) do nothing;
  v_trial_started := found;

  insert into public.billing_accounts (org_id, state, plan_catalog_version)
  values (v_org, case when v_trial_started then 'trialing' else 'free' end::public.subscription_state, '2026-10-18.1');

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, v_uid, 'organization.created', v_org::text, jsonb_build_object('trial_started', v_trial_started));

  return v_org;
end;
$$;

-- ------------------------------------------------------------------ ledger in units

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_credits_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_credits_check check (credits between 0 and 100000000);
alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway'));
alter table public.ai_credit_ledger add column reserved_units integer check (reserved_units is null or reserved_units >= 0);
alter table public.ai_credit_ledger add column grants jsonb not null default '[]'::jsonb check (jsonb_typeof(grants) = 'array');
alter table public.ai_credit_ledger add column cache_write_tokens integer check (cache_write_tokens is null or cache_write_tokens >= 0);
alter table public.ai_credit_ledger add column cache_read_tokens integer check (cache_read_tokens is null or cache_read_tokens >= 0);
alter table public.ai_credit_ledger add column refund_reason text check (refund_reason is null or refund_reason in ('failed', 'free_retry', 'stopped'));
alter table public.ai_credit_ledger add constraint ai_credit_ledger_refund_reason check ((refund_reason is null) or (status = 'refunded'));

-- ------------------------------------------------------------------ grants

create table public.usage_grants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  kind        text not null check (kind in ('plan', 'trial', 'free', 'topup', 'adjustment')),
  units       bigint not null check (units between 0 and 10000000000),
  used        bigint not null default 0 check (used >= 0 and used <= units),
  starts_at   timestamptz not null,
  expires_at  timestamptz not null,
  source_key  text not null check (char_length(source_key) between 1 and 200),
  created_at  timestamptz not null default now(),
  check (expires_at > starts_at),
  unique (org_id, source_key)
);
create index usage_grants_org_idx on public.usage_grants (org_id, expires_at);

alter table public.usage_grants enable row level security;
revoke all on public.usage_grants from anon, authenticated;
grant select on public.usage_grants to authenticated;
create policy "members read usage grants" on public.usage_grants
  for select to authenticated using ((select private.is_member(org_id)));

-- Issues a grant once (by its source key). The server computes units and the window from the catalog.
create function private.ensure_grant(p_org uuid, p_grant jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := p_grant ->> 'kind';
  v_units bigint := (p_grant ->> 'units')::bigint;
  v_starts timestamptz := (p_grant ->> 'starts_at')::timestamptz;
  v_expires timestamptz := (p_grant ->> 'expires_at')::timestamptz;
  v_key text := p_grant ->> 'source_key';
begin
  if v_kind not in ('plan', 'trial', 'free') or v_units is null or v_units < 0 or v_starts is null or v_expires is null
     or v_expires <= v_starts or v_expires > v_starts + interval '70 days' or v_key is null or v_key !~ ('^' || v_kind || ':') then
    raise exception 'INVALID_GRANT' using errcode = '22023';
  end if;
  insert into public.usage_grants (org_id, kind, units, starts_at, expires_at, source_key)
  values (p_org, v_kind, v_units, v_starts, v_expires, v_key)
  on conflict (org_id, source_key) do nothing;
end;
$$;
revoke all on function private.ensure_grant(uuid, jsonb) from public;

-- Draws units from active grants, soonest expiry first. With p_strict it
-- refuses (and the transaction rolls back) when there isn't enough;
-- otherwise it draws what's there. Returns [{grant, units}] in draw order.
create function private.draw_units(p_org uuid, p_units bigint, p_strict boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left bigint := p_units;
  v_take bigint;
  v_alloc jsonb := '[]'::jsonb;
  r record;
begin
  if p_units <= 0 then
    return v_alloc;
  end if;
  for r in
    select g.id, g.units - g.used as free
    from public.usage_grants g
    where g.org_id = p_org and g.starts_at <= now() and g.expires_at > now() and g.used < g.units
    order by g.expires_at, g.created_at, g.id
    for update
  loop
    v_take := least(v_left, r.free);
    update public.usage_grants set used = used + v_take where id = r.id;
    v_alloc := v_alloc || jsonb_build_array(jsonb_build_object('grant', r.id, 'units', v_take));
    v_left := v_left - v_take;
    exit when v_left = 0;
  end loop;
  if v_left > 0 and p_strict then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  return v_alloc;
end;
$$;
revoke all on function private.draw_units(uuid, bigint, boolean) from public;

-- Gives units back to the grants an entry drew from, last drawn first. Returns what stays drawn.
create function private.release_units(p_alloc jsonb, p_units bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left bigint := p_units;
  v_take bigint;
  v_kept jsonb := '[]'::jsonb;
  v_item jsonb;
  i integer;
begin
  for i in reverse jsonb_array_length(p_alloc) - 1 .. 0 loop
    v_item := p_alloc -> i;
    v_take := least(v_left, (v_item ->> 'units')::bigint);
    if v_take > 0 then
      update public.usage_grants set used = greatest(used - v_take, 0) where id = (v_item ->> 'grant')::uuid;
      v_left := v_left - v_take;
    end if;
    if (v_item ->> 'units')::bigint - v_take > 0 then
      v_kept := jsonb_build_array(jsonb_build_object('grant', v_item ->> 'grant', 'units', (v_item ->> 'units')::bigint - v_take)) || v_kept;
    end if;
  end loop;
  return v_kept;
end;
$$;
revoke all on function private.release_units(jsonb, bigint) from public;

-- Reserves an estimate before a model call. p_grant is the current period's
-- grant as the server computes it from the catalog; it's issued if missing.
create function public.app_reserve_usage(
  p_org uuid,
  p_actor uuid,
  p_key text,
  p_operation text,
  p_task uuid,
  p_units integer,
  p_grant jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_alloc jsonb;
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(p_org, p_actor);
  if p_units is null or p_units < 1 or p_units > 10000000 then
    raise exception 'INVALID_CREDITS' using errcode = '22023';
  end if;
  if p_task is not null and not exists (select 1 from public.tasks where id = p_task and org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ai_credit_ledger where org_id = p_org and idempotency_key = p_key) then
    raise exception 'DUPLICATE_REQUEST' using errcode = '23505';
  end if;
  if p_grant is not null then
    perform private.ensure_grant(p_org, p_grant);
  end if;

  v_alloc := private.draw_units(p_org, p_units, true);
  insert into public.ai_credit_ledger (org_id, actor_id, idempotency_key, operation, task_id, credits, reserved_units, grants)
  values (p_org, p_actor, p_key, p_operation, p_task, p_units, p_units, v_alloc)
  returning id into v_id;
  return v_id;
end;
$$;

-- Settles a reservation to the real cost, or refunds it. A higher real cost
-- draws the difference if there's room (the call already happened, so the
-- rest is absorbed). A free-retry refund must fit under p_retry_cap for the
-- last 31 days, or it's refused with RETRY_CAP and the server settles instead.
create function public.app_settle_usage(
  p_org uuid,
  p_entry uuid,
  p_status text,
  p_units integer,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_write_tokens integer,
  p_cache_read_tokens integer,
  p_refund_reason text,
  p_retry_cap integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ai_credit_ledger%rowtype;
  v_reserved bigint;
  v_actual bigint := greatest(coalesce(p_units, 0), 0);
  v_alloc jsonb;
  v_extra jsonb;
  v_drawn bigint := 0;
  v_item jsonb;
begin
  if p_status not in ('settled', 'refunded') or (p_status = 'settled' and p_refund_reason is not null)
     or (p_status = 'refunded' and coalesce(p_refund_reason, '') not in ('failed', 'free_retry', 'stopped')) then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = p_org for update;
  select * into v_row from public.ai_credit_ledger where id = p_entry and org_id = p_org for update;
  if not found or v_row.status <> 'reserved' then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  v_reserved := coalesce(v_row.reserved_units, v_row.credits);

  if p_status = 'refunded' then
    if p_refund_reason = 'free_retry' and (
      p_retry_cap is null or
      (select coalesce(sum(credits), 0) from public.ai_credit_ledger
       where org_id = p_org and status = 'refunded' and refund_reason = 'free_retry' and settled_at > now() - interval '31 days') + v_actual > p_retry_cap
    ) then
      raise exception 'RETRY_CAP' using errcode = 'P0001';
    end if;
    perform private.release_units(v_row.grants, v_reserved);
    update public.ai_credit_ledger
    set status = 'refunded', refund_reason = p_refund_reason, credits = least(v_actual, 100000000), grants = '[]'::jsonb,
        model = p_model, input_tokens = p_input_tokens, output_tokens = p_output_tokens,
        cache_write_tokens = p_cache_write_tokens, cache_read_tokens = p_cache_read_tokens, settled_at = now()
    where id = p_entry;
    return;
  end if;

  if v_actual <= v_reserved then
    v_alloc := private.release_units(v_row.grants, v_reserved - v_actual);
  else
    v_extra := private.draw_units(p_org, v_actual - v_reserved, false);
    v_alloc := v_row.grants || v_extra;
    for v_item in select value from jsonb_array_elements(v_extra) loop
      v_drawn := v_drawn + (v_item ->> 'units')::bigint;
    end loop;
    -- Whatever couldn't be drawn is absorbed by Farbaek: the entry records what was drawn.
    v_actual := v_reserved + v_drawn;
  end if;

  update public.ai_credit_ledger
  set status = 'settled', credits = least(v_actual, 100000000), grants = v_alloc,
      model = p_model, input_tokens = p_input_tokens, output_tokens = p_output_tokens,
      cache_write_tokens = p_cache_write_tokens, cache_read_tokens = p_cache_read_tokens, settled_at = now()
  where id = p_entry;
end;
$$;

-- The old fixed-cost functions are replaced by the two above.
drop function public.app_reserve_ai_credits(uuid, uuid, text, text, uuid, integer, integer, timestamptz, timestamptz);
drop function public.app_settle_ai_credits(uuid, uuid, text, text, integer, integer);

revoke all on function public.app_reserve_usage(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.app_settle_usage(uuid, uuid, text, integer, text, integer, integer, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.app_reserve_usage(uuid, uuid, text, text, uuid, integer, jsonb) to service_role;
grant execute on function public.app_settle_usage(uuid, uuid, text, integer, text, integer, integer, integer, integer, text, integer) to service_role;
