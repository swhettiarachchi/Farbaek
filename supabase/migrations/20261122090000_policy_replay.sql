-- Farbaek schema v51: counterfactual policy replay (ADR 0081).
--
-- To replay proposed autonomy limits over a workspace's past changes, the
-- server needs each change's shape, not its content: the files' paths and
-- kinds, whether it broke the contract, whether the desktop agent made it,
-- whether its contract listed checks, and its newest ProofPack's status.
-- This function returns exactly that for the last days asked (at most 90,
-- at most 300 changes). It runs as the caller (security invoker), so Row
-- Level Security limits it to workspaces the person belongs to.

create function public.app_replay_history(p_org uuid, p_days integer)
returns table (
  proposal_id uuid,
  task_id uuid,
  status text,
  created_at timestamptz,
  files jsonb,
  violations integer,
  from_agent boolean,
  has_checks boolean,
  evidence text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.task_id,
    p.status,
    p.created_at,
    (select coalesce(jsonb_agg(jsonb_build_object('path', c ->> 'path', 'kind', c ->> 'kind')), '[]'::jsonb) from jsonb_array_elements(p.changes) c),
    jsonb_array_length(p.violations),
    p.agent_id is not null,
    coalesce((
      select jsonb_array_length(coalesce(ic.body -> 'requiredChecks', '[]'::jsonb)) > 0
        from public.intent_contracts ic
       where ic.task_id = p.task_id and ic.version = p.contract_version
    ), false),
    (select pp.status from public.proofpacks pp where pp.proposal_id = p.id order by pp.seq desc limit 1)
  from public.change_proposals p
  where p.org_id = p_org
    and p.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90))
  order by p.created_at desc
  limit 300;
$$;
revoke all on function public.app_replay_history(uuid, integer) from public, anon;
grant execute on function public.app_replay_history(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
