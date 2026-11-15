-- Farbaek schema v93: Survey Studio (stage 190, ADRs 0198 to 0201).
--
-- A surveying module inside a workspace. Three kinds of data, kept apart:
--   * imported observations: the source file as given, and its points. Never
--     updated or deleted (a correction is a new import with new point numbers);
--   * the drawing document: append-only versions of what the surveyor decided
--     (the boundary as point ids, labels, sheet fields). It holds no coordinates;
--   * approvals and exports: who approved which version, and every file made.
-- Computed results (bearings, distances, areas) are recomputed by the tested
-- TypeScript engine and stamped with its version; they are never stored as truth.
--
-- Members read their workspace's survey data. Every write goes through an
-- app_survey_* function that only the server's service role can call, checks
-- the person's role again, and writes one audit event.

create table public.survey_projects (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[[:cntrl:]]'),
  plan_type         text not null check (plan_type in ('cadastral', 'subdivision', 'topographic', 'engineering', 'road', 'custom')),
  -- An EPSG code from Survey Studio's registry, or LOCAL for an unreferenced site grid. Never inferred from the data.
  crs_id            text not null check (crs_id ~ '^(EPSG:[0-9]{4,6}|LOCAL)$'),
  crs_confirmed_by  uuid references auth.users (id) on delete set null,
  crs_confirmed_at  timestamptz,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,
  -- A confirmer always has a time; the time stays if the confirmer's account is later deleted.
  constraint survey_projects_confirmation_check check (crs_confirmed_at is not null or crs_confirmed_by is null)
);
create index survey_projects_org_idx on public.survey_projects (org_id, updated_at desc);

create table public.survey_sources (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.survey_projects (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  file_name    text not null check (char_length(file_name) between 1 and 200 and file_name !~ '[[:cntrl:]]'),
  format       text not null check (format in ('delimited', 'geojson')),
  -- The file exactly as uploaded, as text, and its SHA-256 as the database computes it.
  content      text not null check (octet_length(content) <= 2097152),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes   integer not null check (size_bytes between 0 and 2097152),
  -- How it was read: delimiter, header, column mapping, units, as the person chose them.
  settings     jsonb not null default '{}'::jsonb check (pg_column_size(settings) <= 8192),
  point_count  integer not null check (point_count between 0 and 20000),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index survey_sources_project_idx on public.survey_sources (project_id, created_at);

create table public.survey_points (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.survey_projects (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  source_id   uuid not null references public.survey_sources (id) on delete cascade,
  point_id    text not null check (char_length(point_id) between 1 and 32 and point_id !~ '[[:cntrl:]]'),
  -- Decimal, exactly as imported: grid metres in the project's CRS.
  e           numeric not null check (abs(e) < 100000000),
  n           numeric not null check (abs(n) < 100000000),
  z           numeric check (z is null or abs(z) < 100000),
  code        text check (code is null or (char_length(code) <= 64 and code !~ '[[:cntrl:]]')),
  line        integer not null check (line > 0),
  created_at  timestamptz not null default now(),
  constraint survey_points_unique unique (project_id, point_id)
);
create index survey_points_source_idx on public.survey_points (source_id);

create table public.survey_drawings (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.survey_projects (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  version     integer not null check (version > 0),
  -- The drawing document (src/core/survey/document.ts), checked by the server before it is saved.
  document    jsonb not null check (jsonb_typeof(document) = 'object' and pg_column_size(document) <= 524288),
  note        text check (note is null or char_length(note) <= 200),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint survey_drawings_version_unique unique (project_id, version)
);

-- What a surveyor enters about themselves. Shown as entered: Farbaek checks no licence.
create table public.survey_surveyor_profiles (
  org_id        uuid not null references public.organizations (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  full_name     text not null check (char_length(btrim(full_name)) between 1 and 120 and full_name !~ '[[:cntrl:]]'),
  designation   text not null default '' check (char_length(designation) <= 120 and designation !~ '[[:cntrl:]]'),
  registration  text not null default '' check (char_length(registration) <= 60 and registration !~ '[[:cntrl:]]'),
  address       text not null default '' check (char_length(address) <= 300),
  contact       text not null default '' check (char_length(contact) <= 160 and contact !~ '[[:cntrl:]]'),
  updated_at    timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.survey_approvals (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.survey_projects (id) on delete cascade,
  org_id           uuid not null references public.organizations (id) on delete cascade,
  drawing_id       uuid not null references public.survey_drawings (id) on delete cascade,
  drawing_version  integer not null,
  approved_by      uuid references auth.users (id) on delete set null,
  -- The surveyor's details as they were when they approved.
  surveyor         jsonb not null check (jsonb_typeof(surveyor) = 'object' and pg_column_size(surveyor) <= 4096),
  -- SHA-256 of what was approved: the document and every coordinate it uses (computed by the server).
  content_sha256   text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  approved_at      timestamptz not null default now(),
  -- Set when the approval stops applying (the project's grid changed after it). The row stays as a record.
  withdrawn_at     timestamptz,
  withdrawn_reason text check (withdrawn_reason is null or withdrawn_reason in ('crs_changed')),
  constraint survey_approvals_withdrawn check ((withdrawn_at is null) = (withdrawn_reason is null))
);
-- One standing approval per version; a withdrawn one can be followed by a new approval.
create unique index survey_approvals_once on public.survey_approvals (drawing_id) where withdrawn_at is null;

create table public.survey_exports (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.survey_projects (id) on delete cascade,
  org_id           uuid not null references public.organizations (id) on delete cascade,
  drawing_version  integer not null check (drawing_version > 0),
  kind             text not null check (kind in ('pdf', 'dxf', 'csv', 'geojson')),
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes       integer not null check (size_bytes between 0 and 52428800),
  options          jsonb not null default '{}'::jsonb check (pg_column_size(options) <= 4096),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index survey_exports_project_idx on public.survey_exports (project_id, created_at desc);

-- Row level security: members read; nobody writes except through the functions below.
alter table public.survey_projects enable row level security;
alter table public.survey_sources enable row level security;
alter table public.survey_points enable row level security;
alter table public.survey_drawings enable row level security;
alter table public.survey_surveyor_profiles enable row level security;
alter table public.survey_approvals enable row level security;
alter table public.survey_exports enable row level security;

revoke all on public.survey_projects, public.survey_sources, public.survey_points, public.survey_drawings,
  public.survey_surveyor_profiles, public.survey_approvals, public.survey_exports
  from public, anon, authenticated, service_role;
grant select on public.survey_projects, public.survey_sources, public.survey_points, public.survey_drawings,
  public.survey_surveyor_profiles, public.survey_approvals, public.survey_exports
  to authenticated, service_role;

create policy "members read survey projects" on public.survey_projects for select to authenticated using ((select private.is_member(org_id)));
create policy "members read survey sources" on public.survey_sources for select to authenticated using ((select private.is_member(org_id)));
create policy "members read survey points" on public.survey_points for select to authenticated using ((select private.is_member(org_id)));
create policy "members read survey drawings" on public.survey_drawings for select to authenticated using ((select private.is_member(org_id)));
create policy "members read surveyor profiles" on public.survey_surveyor_profiles for select to authenticated using ((select private.is_member(org_id)));
create policy "members read survey approvals" on public.survey_approvals for select to authenticated using ((select private.is_member(org_id)));
create policy "members read survey exports" on public.survey_exports for select to authenticated using ((select private.is_member(org_id)));

-- A project of the workspace, open for work; raises NOT_FOUND otherwise.
create function private.survey_project_open(p_org uuid, p_project uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.survey_projects p where p.id = p_project and p.org_id = p_org and p.archived_at is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function private.survey_project_open(uuid, uuid) from public;

-- Starts a project, with its first (empty) drawing version. Only cadastral plans are available in this stage.
create function public.app_survey_create_project(p_org uuid, p_actor uuid, p_name text, p_plan_type text, p_crs text, p_confirm boolean, p_document jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_plan_type is distinct from 'cadastral' then
    raise exception 'PLAN_TYPE_NOT_AVAILABLE' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('survey_projects:' || p_org::text, 0));
  if (select count(*) from public.survey_projects p where p.org_id = p_org and p.archived_at is null) >= 200 then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.survey_projects (org_id, name, plan_type, crs_id, crs_confirmed_by, crs_confirmed_at, created_by)
  values (p_org, btrim(p_name), p_plan_type, p_crs, case when p_confirm then p_actor end, case when p_confirm then now() end, p_actor)
  returning id into v_id;
  insert into public.survey_drawings (project_id, org_id, version, document, note, created_by)
  values (v_id, p_org, 1, p_document, 'Project created', p_actor);
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.project_created', v_id::text, jsonb_build_object('name', btrim(p_name), 'plan_type', p_plan_type, 'crs', p_crs, 'crs_confirmed', coalesce(p_confirm, false)));
  return v_id;
end;
$$;

-- Renames a project or sets its coordinate system. Changing the CRS clears its confirmation unless it is confirmed again.
create function public.app_survey_update_project(p_org uuid, p_actor uuid, p_project uuid, p_name text, p_crs text, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.survey_projects%rowtype;
  v_withdrawn integer := 0;
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.survey_project_open(p_org, p_project);
  select * into v_old from public.survey_projects p where p.id = p_project for update;
  update public.survey_projects p set
    name = btrim(p_name),
    crs_id = p_crs,
    crs_confirmed_by = case when p_confirm then p_actor when p_crs = v_old.crs_id then v_old.crs_confirmed_by end,
    crs_confirmed_at = case when p_confirm then now() when p_crs = v_old.crs_id then v_old.crs_confirmed_at end,
    updated_at = now()
  where p.id = p_project;
  -- A surveyor approved the plan in its old grid, not this one: their approvals stop applying.
  if p_crs is distinct from v_old.crs_id then
    update public.survey_approvals a set withdrawn_at = now(), withdrawn_reason = 'crs_changed'
    where a.project_id = p_project and a.withdrawn_at is null;
    get diagnostics v_withdrawn = row_count;
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, case when p_confirm then 'survey.crs_confirmed' else 'survey.project_updated' end, p_project::text,
    jsonb_build_object('name', btrim(p_name), 'crs', p_crs, 'crs_before', v_old.crs_id, 'approvals_withdrawn', v_withdrawn));
end;
$$;

-- Imports a file's points. The whole import is refused if a point number already exists with different coordinates;
-- points identical to existing ones are skipped. Returns the source id and the counts.
create function public.app_survey_import(p_org uuid, p_actor uuid, p_project uuid, p_file_name text, p_format text, p_content text, p_settings jsonb, p_points jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source uuid;
  v_sha text;
  v_added integer := 0;
  v_skipped integer := 0;
  v_conflicts text[];
  v_total integer;
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.survey_project_open(p_org, p_project);
  if jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) = 0 or jsonb_array_length(p_points) > 20000 then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('survey_points:' || p_project::text, 0));
  -- The person confirmed the file's units in the grid the page showed; if the grid changed since, nothing imports.
  if (p_settings ->> 'crs') is distinct from (select p.crs_id from public.survey_projects p where p.id = p_project for share) then
    raise exception 'CRS_CHANGED' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x.point_id order by x.point_id), '{}') into v_conflicts
  from jsonb_to_recordset(p_points) as x(point_id text, e numeric, n numeric, z numeric, code text)
  join public.survey_points sp on sp.project_id = p_project and sp.point_id = x.point_id
  where sp.e <> x.e or sp.n <> x.n or sp.z is distinct from x.z or sp.code is distinct from nullif(x.code, '');
  if array_length(v_conflicts, 1) > 0 then
    raise exception 'POINT_CONFLICT: %', array_to_string(v_conflicts[1:10], ', ') using errcode = '23505';
  end if;
  select count(*) + (select count(*) from public.survey_points sp where sp.project_id = p_project) into v_total
  from jsonb_to_recordset(p_points) as x(point_id text)
  where not exists (select 1 from public.survey_points sp where sp.project_id = p_project and sp.point_id = x.point_id);
  if v_total > 20000 then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  v_sha := encode(sha256(convert_to(p_content, 'UTF8')), 'hex');
  insert into public.survey_sources (project_id, org_id, file_name, format, content, sha256, size_bytes, settings, point_count, created_by)
  values (p_project, p_org, p_file_name, p_format, p_content, v_sha, octet_length(p_content), coalesce(p_settings, '{}'::jsonb), jsonb_array_length(p_points), p_actor)
  returning id into v_source;
  with incoming as (
    select x.point_id, x.e, x.n, x.z, x.code, x.line
    from jsonb_to_recordset(p_points) as x(point_id text, e numeric, n numeric, z numeric, code text, line integer)
  ), added as (
    insert into public.survey_points (project_id, org_id, source_id, point_id, e, n, z, code, line)
    select p_project, p_org, v_source, i.point_id, i.e, i.n, i.z, nullif(i.code, ''), i.line
    from incoming i
    where not exists (select 1 from public.survey_points sp where sp.project_id = p_project and sp.point_id = i.point_id)
    returning 1
  )
  select count(*) into v_added from added;
  v_skipped := jsonb_array_length(p_points) - v_added;
  update public.survey_projects p set updated_at = now() where p.id = p_project;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.points_imported', p_project::text,
    jsonb_build_object('file', p_file_name, 'format', p_format, 'sha256', v_sha, 'added', v_added, 'skipped', v_skipped));
  return jsonb_build_object('source_id', v_source, 'added', v_added, 'skipped', v_skipped);
end;
$$;

-- Saves a new drawing version on top of the one the person was editing. A stale base is refused, so two people
-- editing at once can't overwrite each other.
create function public.app_survey_save_drawing(p_org uuid, p_actor uuid, p_project uuid, p_base_version integer, p_document jsonb, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest integer;
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.survey_project_open(p_org, p_project);
  perform pg_advisory_xact_lock(hashtextextended('survey_drawings:' || p_project::text, 0));
  select max(d.version) into v_latest from public.survey_drawings d where d.project_id = p_project;
  if v_latest is distinct from p_base_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_latest >= 5000 then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.survey_drawings (project_id, org_id, version, document, note, created_by)
  values (p_project, p_org, v_latest + 1, p_document, nullif(btrim(coalesce(p_note, '')), ''), p_actor);
  update public.survey_projects p set updated_at = now() where p.id = p_project;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.drawing_saved', p_project::text, jsonb_build_object('version', v_latest + 1, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  return v_latest + 1;
end;
$$;

-- A surveyor's own details, set by themselves only.
create function public.app_survey_set_profile(p_org uuid, p_actor uuid, p_full_name text, p_designation text, p_registration text, p_address text, p_contact text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  insert into public.survey_surveyor_profiles (org_id, user_id, full_name, designation, registration, address, contact, updated_at)
  values (p_org, p_actor, btrim(p_full_name), btrim(coalesce(p_designation, '')), btrim(coalesce(p_registration, '')), btrim(coalesce(p_address, '')), btrim(coalesce(p_contact, '')), now())
  on conflict (org_id, user_id) do update set
    full_name = excluded.full_name, designation = excluded.designation, registration = excluded.registration,
    address = excluded.address, contact = excluded.contact, updated_at = now();
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.profile_saved', p_actor::text, jsonb_build_object('name', btrim(p_full_name)));
end;
$$;

-- The responsible surveyor approves the latest version, exactly as it is. Only the surveyor the document names, with
-- their own profile, can approve; the approval records their details at that moment and the hash of what they saw.
create function public.app_survey_approve(p_org uuid, p_actor uuid, p_project uuid, p_version integer, p_crs text, p_content_sha256 text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_drawing public.survey_drawings%rowtype;
  v_profile public.survey_surveyor_profiles%rowtype;
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.survey_project_open(p_org, p_project);
  -- The hash covers the grid the server read; holding the project row keeps the grid from changing until this commits.
  if p_crs is distinct from (select p.crs_id from public.survey_projects p where p.id = p_project for update) then
    raise exception 'CRS_CHANGED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('survey_drawings:' || p_project::text, 0));
  select * into v_drawing from public.survey_drawings d where d.project_id = p_project order by d.version desc limit 1;
  if v_drawing.version is distinct from p_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if (v_drawing.document ->> 'surveyorUserId') is distinct from p_actor::text then
    raise exception 'NOT_THE_SURVEYOR' using errcode = '42501';
  end if;
  select * into v_profile from public.survey_surveyor_profiles s where s.org_id = p_org and s.user_id = p_actor;
  if not found then
    raise exception 'NO_SURVEYOR_PROFILE' using errcode = '42501';
  end if;
  if exists (select 1 from public.survey_approvals a where a.drawing_id = v_drawing.id and a.withdrawn_at is null) then
    raise exception 'ALREADY_APPROVED' using errcode = '23505';
  end if;
  insert into public.survey_approvals (project_id, org_id, drawing_id, drawing_version, approved_by, surveyor, content_sha256)
  values (p_project, p_org, v_drawing.id, v_drawing.version, p_actor,
    jsonb_build_object('name', v_profile.full_name, 'designation', v_profile.designation, 'registration', v_profile.registration, 'address', v_profile.address, 'contact', v_profile.contact),
    p_content_sha256)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.approved', p_project::text, jsonb_build_object('version', v_drawing.version, 'sha256', p_content_sha256));
  return v_id;
end;
$$;

-- Records a file Farbaek made for a version. Any member may export what they can read.
create function public.app_survey_record_export(p_org uuid, p_actor uuid, p_project uuid, p_version integer, p_kind text, p_sha256 text, p_size integer, p_options jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- Like every other write here: a paused workspace and an archived project make no new files.
  if private.org_suspended(p_org) then
    raise exception 'WORKSPACE_SUSPENDED' using errcode = 'P0001';
  end if;
  perform private.survey_project_open(p_org, p_project);
  if not exists (select 1 from public.survey_drawings d join public.survey_projects p on p.id = d.project_id where d.project_id = p_project and p.org_id = p_org and d.version = p_version) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.survey_exports (project_id, org_id, drawing_version, kind, sha256, size_bytes, options, created_by)
  values (p_project, p_org, p_version, p_kind, p_sha256, p_size, coalesce(p_options, '{}'::jsonb), p_actor)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.exported', p_project::text, jsonb_build_object('version', p_version, 'kind', p_kind, 'sha256', p_sha256, 'bytes', p_size));
  return v_id;
end;
$$;

-- Archives a project: it leaves the list and takes no more edits. Its data and history stay.
create function public.app_survey_archive_project(p_org uuid, p_actor uuid, p_project uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.survey_project_open(p_org, p_project);
  update public.survey_projects p set archived_at = now(), updated_at = now() where p.id = p_project;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.project_archived', p_project::text, '{}'::jsonb);
end;
$$;

revoke all on function public.app_survey_create_project(uuid, uuid, text, text, text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.app_survey_update_project(uuid, uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.app_survey_import(uuid, uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.app_survey_save_drawing(uuid, uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.app_survey_set_profile(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_survey_approve(uuid, uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.app_survey_record_export(uuid, uuid, uuid, integer, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.app_survey_archive_project(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_survey_create_project(uuid, uuid, text, text, text, boolean, jsonb) to service_role;
grant execute on function public.app_survey_update_project(uuid, uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.app_survey_import(uuid, uuid, uuid, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.app_survey_save_drawing(uuid, uuid, uuid, integer, jsonb, text) to service_role;
grant execute on function public.app_survey_set_profile(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.app_survey_approve(uuid, uuid, uuid, integer, text, text) to service_role;
grant execute on function public.app_survey_record_export(uuid, uuid, uuid, integer, text, text, integer, jsonb) to service_role;
grant execute on function public.app_survey_archive_project(uuid, uuid, uuid) to service_role;
