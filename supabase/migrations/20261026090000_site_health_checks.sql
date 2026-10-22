-- Farbaek schema v24: live-site health checks (LaunchOS A, ADR 0033).
--
-- After a site goes live, Farbaek fetches its real address and records
-- whether exactly that deployment answered. Members read their workspace's
-- checks; only the server writes them, through one function that checks the
-- person, the site and the deployment, and limits how often a site is checked.

create table public.site_health_checks (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  site_id        uuid not null references public.sites (id) on delete cascade,
  deployment_id  uuid not null references public.site_deployments (id) on delete cascade,
  verdict        text not null check (verdict in ('live', 'previous', 'down', 'unreachable')),
  status_code    integer check (status_code is null or status_code between 100 and 599),
  ms             integer not null check (ms between 0 and 120000),
  detail         text not null check (char_length(detail) between 1 and 200),
  checked_by     uuid references auth.users (id) on delete set null,
  checked_at     timestamptz not null default now()
);
create index site_health_checks_deployment on public.site_health_checks (deployment_id, checked_at desc);
create index site_health_checks_site on public.site_health_checks (site_id, checked_at desc);

alter table public.site_health_checks enable row level security;
revoke all on public.site_health_checks from public, anon, authenticated, service_role;
grant select on public.site_health_checks to authenticated, service_role;
create policy "members read their sites' health checks" on public.site_health_checks
  for select to authenticated using ((select private.is_member(org_id)));

-- Records one check. The person must belong to the site's workspace, the
-- deployment must be one of the site's, and a site is checked at most six
-- times a minute.
create function public.app_record_site_health(
  p_actor uuid,
  p_site uuid,
  p_deployment uuid,
  p_verdict text,
  p_status integer,
  p_ms integer,
  p_detail text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id bigint;
begin
  select s.org_id into v_org from public.sites s where s.id = p_site;
  if v_org is null or not exists (select 1 from public.organization_members m where m.org_id = v_org and m.user_id = p_actor) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.site_deployments d where d.id = p_deployment and d.site_id = p_site) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_verdict is null or p_verdict not in ('live', 'previous', 'down', 'unreachable') then
    raise exception 'INVALID_CHECK' using errcode = 'P0001';
  end if;
  if not public.app_rate_limit('site-health:' || p_site::text, 60, 6) then
    raise exception 'CHECK_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.site_health_checks (org_id, site_id, deployment_id, verdict, status_code, ms, detail, checked_by)
  values (v_org, p_site, p_deployment, p_verdict, p_status, least(greatest(coalesce(p_ms, 0), 0), 120000), left(btrim(coalesce(nullif(btrim(p_detail), ''), p_verdict)), 200), p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.app_record_site_health(uuid, uuid, uuid, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.app_record_site_health(uuid, uuid, uuid, text, integer, integer, text) to service_role;
