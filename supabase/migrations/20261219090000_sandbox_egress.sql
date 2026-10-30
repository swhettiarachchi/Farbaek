-- Farbaek schema v78: the Sandbox Egress Ledger (ADR 0127, spec §25).
--
-- After each command, Farbaek reads what its proxy inside the sandbox
-- recorded: each address the command asked for, allowed or blocked. The
-- server checks and groups it (src/core/sandbox/egress-ledger.ts) and
-- stores it with the command, once. The provider's firewall outside the
-- sandbox is still what blocks; this is the record of what was asked.

alter table public.sandbox_executions
  add column egress jsonb check (egress is null or (jsonb_typeof(egress) = 'object' and octet_length(egress::text) <= 65536));

-- Records one command's network record. Server only, and only once per command.
create function public.app_record_sandbox_egress(p_execution uuid, p_egress jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_egress jsonb;
begin
  select egress into v_egress from public.sandbox_executions where id = p_execution for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_egress is not null then
    raise exception 'ALREADY_RECORDED' using errcode = 'P0001';
  end if;
  if p_egress is null or jsonb_typeof(p_egress) <> 'object' or coalesce(jsonb_typeof(p_egress -> 'allowed'), '') <> 'array' or coalesce(jsonb_typeof(p_egress -> 'blocked'), '') <> 'array' then
    raise exception 'INVALID_EGRESS' using errcode = '22023';
  end if;
  update public.sandbox_executions set egress = p_egress where id = p_execution;
end;
$$;

revoke all on function public.app_record_sandbox_egress(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_record_sandbox_egress(uuid, jsonb) to service_role;
