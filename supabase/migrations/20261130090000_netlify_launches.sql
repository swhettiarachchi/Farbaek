-- Farbaek schema v59: LaunchOS with Netlify (ADR 0093).
--
-- Netlify is the second hosting provider behind the same connections and
-- launch orders as Vercel (v48, ADR 0078): the same sealed token, the same
-- evidence rule, one key per authorization and one launch per project at a
-- time. Only the checks that named Vercel change. An order's address and
-- its link to the provider must be on that provider's own domain, so a
-- Netlify order can't point at a Vercel address or anywhere else.

alter table public.provider_connections
  drop constraint provider_connections_provider_check,
  add constraint provider_connections_provider_check check (provider in ('vercel', 'netlify'));

alter table public.launch_orders
  drop constraint launch_orders_provider_check,
  add constraint launch_orders_provider_check check (provider in ('vercel', 'netlify'));

alter table public.launch_orders
  drop constraint launch_orders_url_check,
  add constraint launch_orders_url_check check (
    url is null
    or (provider = 'vercel' and url ~ '^https://[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$')
    or (provider = 'netlify' and url ~ '^https://[a-z0-9-]+\.netlify\.app$')
  );

alter table public.launch_orders
  drop constraint launch_orders_inspector_url_check,
  add constraint launch_orders_inspector_url_check check (
    inspector_url is null
    or (provider = 'vercel' and inspector_url ~ '^https://vercel\.com/')
    or (provider = 'netlify' and inspector_url ~ '^https://app\.netlify\.com/')
  );

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
         failure = 'Farbaek lost track of this launch. Check its state in ' || case provider when 'netlify' then 'Netlify' else 'Vercel' end || ', then launch again if needed.',
         updated_at = now(),
         finished_at = now()
   where project_id = p_project and status in ('authorized', 'uploading', 'building') and updated_at < now() - interval '60 minutes';
$$;
revoke all on function private.close_stale_launches(uuid) from public;

notify pgrst, 'reload schema';
