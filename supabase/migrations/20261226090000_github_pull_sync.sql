-- Farbaek schema v85: what happened to a pull request after Farbaek opened it (ADR 0143).
--
-- Farbaek opens a pull request on GitHub for an applied change (ADR 0126).
-- Until now nothing came back. The server now reads each open one from
-- GitHub with the workspace's own token, on the hourly run and when someone
-- asks: whether it's still open, merged or closed, the commit at its head,
-- and a summary of the checks GitHub ran on that commit. Written only by the
-- server; members read. Becoming merged or closed is recorded in the audit
-- log once.

alter table public.github_pull_requests
  add column pr_state     text check (pr_state is null or pr_state in ('open', 'closed', 'merged')),
  add column merged_at    timestamptz,
  add column head_sha     text check (head_sha is null or head_sha ~ '^[0-9a-f]{40}$'),
  add column checks       jsonb,
  add column synced_at    timestamptz,
  add column sync_problem text check (sync_problem is null or char_length(sync_problem) between 1 and 300),
  add constraint github_pull_requests_merged check ((pr_state = 'merged') = (merged_at is not null) or pr_state is null);

-- A checks summary as the server writes it: counts, and at most 30 runs by name.
create function private.valid_pull_checks(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and coalesce(jsonb_typeof(p -> 'total'), 'missing') = 'number'
    and coalesce(jsonb_typeof(p -> 'passed'), 'missing') = 'number'
    and coalesce(jsonb_typeof(p -> 'failed'), 'missing') = 'number'
    and coalesce(jsonb_typeof(p -> 'pending'), 'missing') = 'number'
    and coalesce(jsonb_typeof(p -> 'runs'), 'missing') = 'array'
    and jsonb_array_length(p -> 'runs') <= 30
    and not exists (
      select 1 from jsonb_array_elements(p -> 'runs') e
       where jsonb_typeof(e) <> 'object'
          or coalesce(jsonb_typeof(e -> 'name'), 'missing') <> 'string'
          or char_length(e ->> 'name') not between 1 and 120
          or coalesce(e ->> 'result', 'missing') not in ('passed', 'failed', 'pending', 'skipped')
    )
  );
$$;
revoke all on function private.valid_pull_checks(jsonb) from public;

-- Records what GitHub said, or why it couldn't be read. Only the server calls it.
create function public.app_sync_github_pull(p_pull uuid, p_state text, p_merged_at timestamptz, p_head_sha text, p_checks jsonb, p_problem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.github_pull_requests%rowtype;
begin
  select * into v from public.github_pull_requests where id = p_pull for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_problem is not null then
    update public.github_pull_requests set sync_problem = left(p_problem, 300), synced_at = now() where id = p_pull;
    return;
  end if;
  if p_state not in ('open', 'closed', 'merged') or (p_state = 'merged') <> (p_merged_at is not null) or not private.valid_pull_checks(p_checks) then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  update public.github_pull_requests
     set pr_state = p_state, merged_at = p_merged_at, head_sha = p_head_sha, checks = p_checks, synced_at = now(), sync_problem = null
   where id = p_pull;
  if p_state in ('merged', 'closed') and v.pr_state is distinct from p_state then
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v.org_id, null, 'github.pull_' || p_state, v.task_id::text, jsonb_build_object('repo', v.repo_full_name, 'number', v.number));
  end if;
end;
$$;
revoke all on function public.app_sync_github_pull(uuid, text, timestamptz, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.app_sync_github_pull(uuid, text, timestamptz, text, jsonb, text) to service_role;

notify pgrst, 'reload schema';
