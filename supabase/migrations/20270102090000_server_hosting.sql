-- Farbaek schema v92: LaunchOS to hosts that run a server (ADR 0191).
--
-- Render, Railway and Fly.io join Vercel and Netlify behind the same
-- connections and launch orders (v48, v59): the same sealed token, the same
-- evidence rule, one key per authorization and one launch per project at a
-- time. Only the checks that name providers change. An order's address and
-- its dashboard link must be on that provider's own domain.
--
-- Render and Railway build from a commit Farbaek writes to the project's
-- linked repository, on a branch Farbaek owns. That commit is recorded with
-- the order, so the next launch only moves the branch when it's still where
-- Farbaek left it.

alter table public.provider_connections
  drop constraint provider_connections_provider_check,
  add constraint provider_connections_provider_check check (provider in ('vercel', 'netlify', 'render', 'railway', 'flyio'));

alter table public.launch_orders
  drop constraint launch_orders_provider_check,
  add constraint launch_orders_provider_check check (provider in ('vercel', 'netlify', 'render', 'railway', 'flyio'));

alter table public.launch_orders
  drop constraint launch_orders_url_check,
  add constraint launch_orders_url_check check (
    url is null
    or (provider = 'vercel' and url ~ '^https://[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$')
    or (provider = 'netlify' and url ~ '^https://[a-z0-9-]+\.netlify\.app$')
    or (provider = 'render' and url ~ '^https://[a-z0-9-]+\.onrender\.com$')
    or (provider = 'railway' and url ~ '^https://[a-z0-9-]+\.up\.railway\.app$')
    or (provider = 'flyio' and url ~ '^https://[a-z0-9-]+\.fly\.dev$')
  );

alter table public.launch_orders
  drop constraint launch_orders_inspector_url_check,
  add constraint launch_orders_inspector_url_check check (
    inspector_url is null
    or (provider = 'vercel' and inspector_url ~ '^https://vercel\.com/')
    or (provider = 'netlify' and inspector_url ~ '^https://app\.netlify\.com/')
    or (provider = 'render' and inspector_url ~ '^https://dashboard\.render\.com/')
    or (provider = 'railway' and inspector_url ~ '^https://railway\.com/')
    or (provider = 'flyio' and inspector_url ~ '^https://fly\.io/')
  );

-- The commit a repository launch built from (Render and Railway).
alter table public.launch_orders add column commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$');
grant select (commit_sha) on public.launch_orders to authenticated;

create function public.app_record_launch_commit(p_order uuid, p_commit text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.launch_orders set commit_sha = p_commit, updated_at = now()
  where id = p_order and status in ('authorized', 'uploading', 'building') and provider in ('render', 'railway');
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- The commits Farbaek last wrote to the project's launch branch, newest first,
-- whichever of Render or Railway built them. The next launch moves the branch
-- only from one of these. A commit is recorded before the branch moves, so
-- the last few are kept: a move whose answer was lost still counts as Farbaek's.
create function public.app_recent_launch_commits(p_project uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.commit_sha order by c.at desc), '{}')
  from (
    select o.commit_sha, max(o.authorized_at) as at from public.launch_orders o
    where o.project_id = p_project and o.commit_sha is not null
    group by o.commit_sha
    order by at desc
    limit 3
  ) c;
$$;

-- An order with no progress for an hour counts as lost (a restart mid-launch).
-- The words name the provider the order went to.
create or replace function private.close_stale_launches(p_project uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.launch_orders
     set status = 'failed',
         failure = 'Farbaek lost track of this launch. Check its state in '
           || case provider when 'netlify' then 'Netlify' when 'render' then 'Render' when 'railway' then 'Railway' when 'flyio' then 'Fly.io' else 'Vercel' end
           || ', then launch again if needed.',
         updated_at = now(),
         finished_at = now()
   where project_id = p_project and status in ('authorized', 'uploading', 'building') and updated_at < now() - interval '60 minutes';
$$;
revoke all on function private.close_stale_launches(uuid) from public, anon, authenticated;

revoke all on function public.app_record_launch_commit(uuid, text) from public, anon, authenticated;
revoke all on function public.app_recent_launch_commits(uuid) from public, anon, authenticated;
grant execute on function public.app_record_launch_commit(uuid, text) to service_role;
grant execute on function public.app_recent_launch_commits(uuid) to service_role;

notify pgrst, 'reload schema';
