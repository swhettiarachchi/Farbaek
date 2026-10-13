-- Farbaek schema v4: the AI credit ledger.
--
-- Every AI operation reserves its credits before the model is called, then
-- settles with the provider-reported token usage, or is refunded when no
-- result came back (provider error, refusal, cut-off output). Reserved and
-- settled rows count against the plan's allowance; refunded rows don't.
--
-- The allowance is re-checked under a row lock on the organization, so two
-- concurrent requests can't both spend the last credit, and the balance never
-- goes negative. The server passes the limit and the period from the
-- TypeScript plan catalog, as it does for project quotas.

create table public.ai_credit_ledger (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  actor_id         uuid references auth.users (id) on delete set null,
  idempotency_key  text not null check (char_length(idempotency_key) between 1 and 200),
  operation        text not null check (operation in ('contract_draft')),
  task_id          uuid,
  credits          integer not null check (credits between 1 and 1000),
  status           text not null default 'reserved' check (status in ('reserved', 'settled', 'refunded')),
  model            text check (model is null or char_length(model) between 1 and 100),
  input_tokens     integer check (input_tokens is null or input_tokens >= 0),
  output_tokens    integer check (output_tokens is null or output_tokens >= 0),
  created_at       timestamptz not null default now(),
  settled_at       timestamptz,
  unique (org_id, idempotency_key),
  constraint ai_credit_ledger_task_same_org_fk foreign key (task_id, org_id)
    references public.tasks (id, org_id) on delete set null (task_id),
  constraint ai_credit_ledger_settled_at check ((status = 'reserved') = (settled_at is null))
);
create index ai_credit_ledger_period_idx on public.ai_credit_ledger (org_id, created_at);

alter table public.ai_credit_ledger enable row level security;
revoke all on public.ai_credit_ledger from anon, authenticated;
grant select on public.ai_credit_ledger to authenticated;
create policy "members read AI credit usage" on public.ai_credit_ledger
  for select to authenticated using ((select private.is_member(org_id)));

-- Credits counted in a period. Runs as the caller, so Row Level Security
-- applies: a non-member gets 0.
create function public.ai_credits_used(p_org uuid, p_from timestamptz, p_to timestamptz)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(credits), 0)::integer
  from public.ai_credit_ledger
  where org_id = p_org and status <> 'refunded' and created_at >= p_from and created_at < p_to;
$$;
revoke all on function public.ai_credits_used(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.ai_credits_used(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ------------------------------------------------- server-only functions

-- p_limit is the effective allowance for the period; null means "set by
-- contract". The period must contain the database's current time.
create function public.app_reserve_ai_credits(
  p_org uuid,
  p_actor uuid,
  p_key text,
  p_operation text,
  p_task uuid,
  p_credits integer,
  p_limit integer,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_used integer;
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(p_org, p_actor);

  if p_credits is null or p_credits < 1 then
    raise exception 'INVALID_CREDITS' using errcode = '22023';
  end if;
  if p_period_start is null or p_period_end is null or not (now() >= p_period_start and now() < p_period_end) then
    raise exception 'PERIOD_MISMATCH' using errcode = '22023';
  end if;
  if p_task is not null and not exists (select 1 from public.tasks where id = p_task and org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ai_credit_ledger where org_id = p_org and idempotency_key = p_key) then
    raise exception 'DUPLICATE_REQUEST' using errcode = '23505';
  end if;

  select coalesce(sum(credits), 0) into v_used
  from public.ai_credit_ledger
  where org_id = p_org and status <> 'refunded' and created_at >= p_period_start and created_at < p_period_end;

  if p_limit is not null and v_used + p_credits > p_limit then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  insert into public.ai_credit_ledger (org_id, actor_id, idempotency_key, operation, task_id, credits)
  values (p_org, p_actor, p_key, p_operation, p_task, p_credits)
  returning id into v_id;
  return v_id;
end;
$$;

-- Closes a reservation exactly once: 'settled' keeps the credits, 'refunded'
-- returns them. Both record what the provider reported.
create function public.app_settle_ai_credits(
  p_org uuid,
  p_entry uuid,
  p_status text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ai_credit_ledger%rowtype;
begin
  if p_status not in ('settled', 'refunded') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  update public.ai_credit_ledger
  set status = p_status, model = p_model, input_tokens = p_input_tokens, output_tokens = p_output_tokens, settled_at = now()
  where id = p_entry and org_id = p_org and status = 'reserved'
  returning * into v_row;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (
    p_org,
    v_row.actor_id,
    'ai.credits_' || p_status,
    p_entry::text,
    jsonb_build_object(
      'operation', v_row.operation,
      'credits', v_row.credits,
      'task_id', v_row.task_id,
      'model', p_model,
      'input_tokens', p_input_tokens,
      'output_tokens', p_output_tokens
    )
  );
end;
$$;

revoke all on function public.app_reserve_ai_credits(uuid, uuid, text, text, uuid, integer, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.app_settle_ai_credits(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.app_reserve_ai_credits(uuid, uuid, text, text, uuid, integer, integer, timestamptz, timestamptz) to service_role;
grant execute on function public.app_settle_ai_credits(uuid, uuid, text, text, integer, integer) to service_role;
