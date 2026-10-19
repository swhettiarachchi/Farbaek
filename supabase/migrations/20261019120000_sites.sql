-- Farbaek schema v19: published sites (ADR 0029).
--
-- A project's static files can go live at <name>.<site domain>. Each publish
-- is a deployment: the exact list of file revisions that went live, with the
-- SHA-256 digest of that list and the security check it passed. The site
-- points at one live deployment; rolling back points it at an earlier one,
-- unpublishing at none. Only the server writes, and this database repeats
-- the publish gate: a finished check, newer than the files, with nothing
-- critical, of exactly the files being published.

create table public.sites (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  project_id          uuid not null unique,
  name                text not null unique check (
    char_length(name) between 3 and 40
    and name ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'
    and name not like '%--%'
    and name not like 'p-%'
    and name not in (
      'www', 'app', 'api', 'admin', 'auth', 'login', 'signin', 'sign-in', 'signup', 'account', 'accounts', 'billing',
      'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'ssh', 'status', 'docs', 'help', 'support', 'security', 'abuse',
      'farbaek', 'preview', 'previews', 'static', 'assets', 'cdn', 'dashboard', 'console', 'root', 'localhost'
    )
  ),
  live_deployment_id  uuid,
  created_by          uuid not null references auth.users (id) on delete cascade,
  created_at          timestamptz not null default now(),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);

create table public.site_deployments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  site_id             uuid not null references public.sites (id) on delete cascade,
  project_id          uuid not null,
  number              integer not null check (number > 0),
  files               jsonb not null check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 1 and 3000),
  file_count          integer not null check (file_count > 0),
  total_bytes         bigint not null check (total_bytes >= 0),
  digest              text not null check (digest ~ '^[0-9a-f]{64}$'),
  security_report_id  uuid references public.security_reports (id) on delete set null,
  security_score      integer check (security_score between 0 and 100),
  created_by          uuid not null references auth.users (id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (site_id, number),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);
create index site_deployments_site_idx on public.site_deployments (site_id, number desc);

alter table public.sites add constraint sites_live_deployment_fk foreign key (live_deployment_id) references public.site_deployments (id) on delete set null;

alter table public.sites enable row level security;
alter table public.site_deployments enable row level security;
revoke all on public.sites, public.site_deployments from anon, authenticated;
grant select on public.sites, public.site_deployments to authenticated;
create policy "members read sites" on public.sites
  for select to authenticated using ((select private.is_member(org_id)));
create policy "members read site deployments" on public.site_deployments
  for select to authenticated using ((select private.is_member(org_id)));

-- Publishes exactly the project's current files as a new deployment and makes it live.
create function public.app_publish_site(p_org uuid, p_actor uuid, p_project uuid, p_name text, p_files jsonb, p_digest text, p_report uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_report public.security_reports%rowtype;
  v_site public.sites%rowtype;
  v_changed timestamptz;
  v_count integer;
  v_matching integer;
  v_bytes bigint;
  v_number integer;
  v_id uuid;
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(p_org, p_actor);
  select * into v_project from public.projects where id = p_project and org_id = p_org;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_project.archived_at is not null then
    raise exception 'PROJECT_ARCHIVED' using errcode = 'P0001';
  end if;
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_files is null or jsonb_typeof(p_files) <> 'array' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  -- The files must be exactly what the project holds now, revision for revision.
  select count(*), coalesce(sum(size_bytes), 0) into v_count, v_bytes from public.project_files where project_id = p_project;
  -- Any change counts, deletions included: the revision history records them all.
  select max(created_at) into v_changed from public.project_file_revisions where project_id = p_project;
  select count(*) into v_matching
  from jsonb_array_elements(p_files) f
  join public.project_files pf
    on pf.project_id = p_project
   and pf.path = f ->> 'path'
   and pf.revision = (f ->> 'revision')::integer
   and pf.sha256 = f ->> 'sha256'
   and pf.size_bytes = (f ->> 'size')::integer;
  if v_count = 0 or v_matching <> v_count or jsonb_array_length(p_files) <> v_count then
    raise exception 'FILES_CHANGED' using errcode = '40001';
  end if;
  if not exists (select 1 from public.project_files where project_id = p_project and path = 'index.html') then
    raise exception 'NO_INDEX' using errcode = '22023';
  end if;

  -- The publish gate, again: a finished check of these files that found nothing critical.
  select * into v_report from public.security_reports where id = p_report and project_id = p_project;
  if not found or v_report.status <> 'done' then
    raise exception 'CHECK_REQUIRED' using errcode = 'P0001';
  end if;
  if v_report.started_at < v_changed then
    raise exception 'CHECK_STALE' using errcode = 'P0001';
  end if;
  if coalesce((v_report.counts ->> 'critical')::integer, 0) > 0 then
    raise exception 'CRITICAL_FINDINGS' using errcode = 'P0001';
  end if;

  select * into v_site from public.sites where project_id = p_project for update;
  begin
    if not found then
      insert into public.sites (org_id, project_id, name, created_by) values (p_org, p_project, p_name, p_actor) returning * into v_site;
    elsif v_site.name <> p_name then
      update public.sites set name = p_name where id = v_site.id returning * into v_site;
    end if;
  exception
    when unique_violation then
      raise exception 'NAME_TAKEN' using errcode = '23505';
    when check_violation then
      raise exception 'INVALID_NAME' using errcode = '22023';
  end;

  select coalesce(max(number), 0) + 1 into v_number from public.site_deployments where site_id = v_site.id;
  insert into public.site_deployments (org_id, site_id, project_id, number, files, file_count, total_bytes, digest, security_report_id, security_score, created_by)
  values (p_org, v_site.id, p_project, v_number, p_files, v_count, v_bytes, p_digest, v_report.id, v_report.score, p_actor)
  returning id into v_id;
  update public.sites set live_deployment_id = v_id where id = v_site.id;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'site.published', v_id::text, jsonb_build_object('site', v_site.name, 'number', v_number, 'digest', p_digest, 'report', v_report.id));
  return v_id;
end;
$$;

-- Points the site at one of its own earlier deployments (roll back), or at none (unpublish).
create function public.app_set_live_deployment(p_org uuid, p_actor uuid, p_site uuid, p_deployment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_number integer;
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v_site from public.sites where id = p_site and org_id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_deployment is not null then
    select number into v_number from public.site_deployments where id = p_deployment and site_id = p_site;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
  update public.sites set live_deployment_id = p_deployment where id = p_site;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, case when p_deployment is null then 'site.unpublished' else 'site.rolled_back' end, p_site::text,
          jsonb_build_object('site', v_site.name, 'number', v_number));
end;
$$;

revoke all on function public.app_publish_site(uuid, uuid, uuid, text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.app_set_live_deployment(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_publish_site(uuid, uuid, uuid, text, jsonb, text, uuid) to service_role;
grant execute on function public.app_set_live_deployment(uuid, uuid, uuid, uuid) to service_role;
