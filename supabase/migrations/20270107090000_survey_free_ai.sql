-- Farbaek schema v97: Survey Studio's AI is free while it's being tested (stage 197, ADR 0212).
--
-- Survey Studio's three AI operations (survey_draft, survey_read, survey_assist) no longer draw from a workspace's AI allowance,
-- so no plan or subscription is needed for them. They stay on the ledger, marked free: the platform's daily limit counts them, the
-- owner's spend alerts see them, and Office Space's totals include them. A separate daily limit on free entries keeps free use
-- from spending what the rest of Farbaek needs. The ledger's insert trigger still refuses a suspended workspace and a staff pause
-- of AI. Pricing comes back by the server no longer calling app_reserve_free_usage; nothing here needs undoing for that.
--
-- A free entry is Farbaek's cost whatever becomes of it: refunded or not, Farbaek paid the provider. So every daily total (the
-- platform's limit in both reservations, the free limit and the owner's spend alerts) counts free entries in every status, and
-- paid entries as before.

alter table public.ai_credit_ledger add column free boolean not null default false;

-- A free reservation: the same checks as app_reserve_usage, then a ledger entry that draws nothing from the workspace.
create function public.app_reserve_free_usage(
  p_org uuid,
  p_actor uuid,
  p_key text,
  p_operation text,
  p_units integer,
  p_platform_daily_units integer default null,
  p_free_daily_units integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_today bigint;
  v_free_today bigint;
begin
  -- Only Survey Studio's AI is free.
  if p_operation is null or p_operation not in ('survey_draft', 'survey_read', 'survey_assist') then
    raise exception 'INVALID_OPERATION' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(p_org, p_actor);
  if p_units is null or p_units < 1 or p_units > 10000000 then
    raise exception 'INVALID_CREDITS' using errcode = '22023';
  end if;
  if exists (select 1 from public.ai_credit_ledger where org_id = p_org and idempotency_key = p_key) then
    raise exception 'DUPLICATE_REQUEST' using errcode = '23505';
  end if;
  if p_platform_daily_units is not null or p_free_daily_units is not null then
    -- One lock for the whole platform's daily total, held to the end of this transaction, as app_reserve_usage takes it.
    perform pg_advisory_xact_lock(hashtext('farbaek.platform_ai_daily'));
  end if;
  if p_platform_daily_units is not null then
    select coalesce(sum(credits), 0) into v_today from public.ai_credit_ledger
    where (status in ('reserved', 'settled') or free) and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
    if v_today + p_units > p_platform_daily_units then
      raise exception 'PLATFORM_DAILY_LIMIT' using errcode = 'P0001';
    end if;
  end if;
  if p_free_daily_units is not null then
    select coalesce(sum(credits), 0) into v_free_today from public.ai_credit_ledger
    where free and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
    if v_free_today + p_units > p_free_daily_units then
      raise exception 'FREE_DAILY_LIMIT' using errcode = 'P0001';
    end if;
  end if;

  insert into public.ai_credit_ledger (org_id, actor_id, idempotency_key, operation, task_id, credits, reserved_units, grants, free)
  values (p_org, p_actor, p_key, p_operation, null, p_units, p_units, '[]'::jsonb, true)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.app_reserve_free_usage(uuid, uuid, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.app_reserve_free_usage(uuid, uuid, text, text, integer, integer, integer) to service_role;

-- Settling: as before, except that a free entry never touches a workspace's grants. Its credits keep the real cost, for the daily
-- limits, the spend alerts and Office Space, and anything over the reservation is Farbaek's, not the workspace's.
create or replace function public.app_settle_usage(
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

  if v_row.free then
    -- Nothing was drawn, so nothing is released or drawn now. A free retry is for paid work only.
    if p_refund_reason = 'free_retry' then
      raise exception 'INVALID_STATUS' using errcode = '22023';
    end if;
    update public.ai_credit_ledger
    set status = p_status, refund_reason = p_refund_reason, credits = least(v_actual, 100000000), grants = '[]'::jsonb,
        model = p_model, input_tokens = p_input_tokens, output_tokens = p_output_tokens,
        cache_write_tokens = p_cache_write_tokens, cache_read_tokens = p_cache_read_tokens, settled_at = now()
    where id = p_entry;
    return;
  end if;

  if p_status = 'refunded' then
    if p_refund_reason = 'free_retry' and (
      p_retry_cap is null or
      (select coalesce(sum(credits), 0) from public.ai_credit_ledger
       where org_id = p_org and not free and status = 'refunded' and refund_reason = 'free_retry' and settled_at > now() - interval '31 days') + v_actual > p_retry_cap
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
revoke all on function public.app_settle_usage(uuid, uuid, text, integer, text, integer, integer, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.app_settle_usage(uuid, uuid, text, integer, text, integer, integer, integer, integer, text, integer) to service_role;

-- The paid reservation, unchanged except that the platform's daily total also counts refunded free entries.
create or replace function public.app_reserve_usage(
  p_org uuid,
  p_actor uuid,
  p_key text,
  p_operation text,
  p_task uuid,
  p_units integer,
  p_grant jsonb,
  p_platform_daily_units integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_alloc jsonb;
  v_today bigint;
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
  if p_platform_daily_units is not null then
    -- One lock for the whole platform's daily total, held to the end of this transaction.
    perform pg_advisory_xact_lock(hashtext('farbaek.platform_ai_daily'));
    select coalesce(sum(credits), 0) into v_today from public.ai_credit_ledger
    where (status in ('reserved', 'settled') or free) and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
    if v_today + p_units > p_platform_daily_units then
      raise exception 'PLATFORM_DAILY_LIMIT' using errcode = 'P0001';
    end if;
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
revoke all on function public.app_reserve_usage(uuid, uuid, text, text, uuid, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.app_reserve_usage(uuid, uuid, text, text, uuid, integer, jsonb, integer) to service_role;

-- Today's AI usage for the owner's spend alerts, counted exactly as the daily limits count it.
create or replace function public.app_platform_ai_units_today()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(credits), 0)::bigint from public.ai_credit_ledger
  where (status in ('reserved', 'settled') or free) and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.app_platform_ai_units_today() from public, anon, authenticated;
grant execute on function public.app_platform_ai_units_today() to service_role;

notify pgrst, 'reload schema';
