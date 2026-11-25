-- Farbaek schema v107: usage given back when a call was cut off (stage 272, ADR 0279). Additions only, nothing taken away.
--
-- Every AI call reserves usage before the model is asked, and settles or refunds it when the call ends. A call whose server stopped
-- first (a restart in the middle of an answer) did neither: its reservation stayed drawn from the plan for good, for an answer
-- nobody got. The hourly jobs now give such reservations back, said as what they are.

-- The changes below need the ledger to themselves for a moment. If something long is reading it (the nightly backup), this gives
-- up after five seconds and changes nothing, rather than hold every reservation and settlement queued behind it.
set local lock_timeout = '5s';

-- A reservation closed because its server stopped is its own kind of refund: not a failure the provider reported, nor a stop the
-- person asked for.
alter table public.ai_credit_ledger drop constraint ai_credit_ledger_refund_reason_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_refund_reason_check
  check (refund_reason is null or refund_reason in ('failed', 'free_retry', 'stopped', 'interrupted'));

-- Open reservations are few at any moment: this finds the old ones without reading the whole ledger.
create index ai_credit_ledger_open_idx on public.ai_credit_ledger (created_at) where status = 'reserved';

-- Closes reservations older than p_minutes that were never settled or refunded, as refunded, 'interrupted': the usage returns to
-- the grants it was drawn from, and what had been reserved stays on the entry (reserved_units). Safe to run again: a closed entry is
-- never touched. It answers with how many entries were closed, the units they had reserved, and how many of those went back to a
-- grant that is still running (the rest belonged to periods already over, or to grants since removed).
create function public.app_release_stale_usage(p_minutes integer, p_limit integer)
returns table (released integer, units bigint, returned bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_row public.ai_credit_ledger%rowtype;
  v_reserved bigint;
  v_back bigint;
  v_count integer := 0;
  v_units bigint := 0;
  v_returned bigint := 0;
begin
  -- A reservation covers one model call or one Chat turn, which take minutes: half an hour is far past any of them. A shorter age
  -- could take a reservation from a call that is still running.
  if p_minutes is null or p_minutes < 30 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  for v in
    select l.id, l.org_id from public.ai_credit_ledger l
    where l.status = 'reserved' and l.created_at < now() - make_interval(mins => p_minutes)
    order by l.org_id, l.created_at
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  loop
    -- The workspace first, then the entry: the order settling takes them in, so the two never wait on each other.
    perform 1 from public.organizations o where o.id = v.org_id for update;
    select * into v_row from public.ai_credit_ledger l where l.id = v.id and l.status = 'reserved' for update;
    if not found then
      continue;
    end if;
    v_reserved := coalesce(v_row.reserved_units, v_row.credits);
    if v_row.free then
      -- A free entry drew nothing from the workspace, so nothing goes back. It keeps what it reserved as its count: a free entry
      -- counts towards Farbaek's daily limits whatever became of it (v97), and closing it mustn't take it out of them.
      update public.ai_credit_ledger l
      set status = 'refunded', refund_reason = 'interrupted', reserved_units = v_reserved, credits = least(v_reserved, 100000000),
          grants = '[]'::jsonb, settled_at = now()
      where l.id = v.id;
    else
      select coalesce(sum((a.item ->> 'units')::bigint), 0) into v_back
      from jsonb_array_elements(v_row.grants) as a(item)
        join public.usage_grants g on g.id = (a.item ->> 'grant')::uuid
      where g.expires_at > now();
      perform private.release_units(v_row.grants, v_reserved);
      -- Nothing is counted: what the provider used was never reported.
      update public.ai_credit_ledger l
      set status = 'refunded', refund_reason = 'interrupted', reserved_units = v_reserved, credits = 0, grants = '[]'::jsonb, settled_at = now()
      where l.id = v.id;
      v_units := v_units + v_reserved;
      v_returned := v_returned + least(v_back, v_reserved);
    end if;
    v_count := v_count + 1;
  end loop;
  released := v_count;
  units := v_units;
  returned := v_returned;
  return next;
end;
$$;
revoke all on function public.app_release_stale_usage(integer, integer) from public, anon, authenticated;
grant execute on function public.app_release_stale_usage(integer, integer) to service_role;
