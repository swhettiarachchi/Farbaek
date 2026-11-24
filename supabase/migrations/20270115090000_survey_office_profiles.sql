-- Farbaek schema v105: office profiles for AutoSurvey (stage 248, ADR 0256). Additions only, nothing taken away.
--
-- A workspace keeps its surveyors' set-up once and reuses it: the grid they work in, their instruments and what those export, the
-- office code library and how the crew writes line words, the sheet's presentation and the statement on the plan. Never anything about
-- a piece of land. Each save is a new version, kept, so what a plan started from can always be read again. A surveyor's last chosen
-- profile is remembered, so the next Generate Plan picks it without asking. Members read; only the server writes, through the
-- functions below; saving and archiving record audit events, and a choice is the surveyor's own setting.

create table public.survey_office_profiles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80 and name !~ '[[:cntrl:]]'),
  version     integer not null default 1 check (version >= 1),
  body        jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 100000),
  archived_at timestamptz,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_by  uuid not null,
  updated_at  timestamptz not null default now()
);
create index survey_office_profiles_org on public.survey_office_profiles (org_id) where archived_at is null;

create table public.survey_office_profile_versions (
  profile_id uuid not null references public.survey_office_profiles (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  version    integer not null check (version >= 1),
  name       text not null,
  body       jsonb not null,
  saved_by   uuid not null,
  saved_at   timestamptz not null default now(),
  primary key (profile_id, version)
);

create table public.survey_office_profile_choices (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null,
  profile_id uuid not null references public.survey_office_profiles (id) on delete cascade,
  chosen_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.survey_office_profiles enable row level security;
alter table public.survey_office_profile_versions enable row level security;
alter table public.survey_office_profile_choices enable row level security;
revoke all on public.survey_office_profiles from public, anon, authenticated, service_role;
revoke all on public.survey_office_profile_versions from public, anon, authenticated, service_role;
revoke all on public.survey_office_profile_choices from public, anon, authenticated, service_role;
grant select on public.survey_office_profiles to authenticated, service_role;
grant select on public.survey_office_profile_versions to authenticated, service_role;
grant select on public.survey_office_profile_choices to authenticated, service_role;
create policy "members read office profiles" on public.survey_office_profiles for select to authenticated using ((select private.is_member(org_id)));
create policy "members read office profile versions" on public.survey_office_profile_versions for select to authenticated using ((select private.is_member(org_id)));
create policy "surveyors read their own profile choice" on public.survey_office_profile_choices for select to authenticated using (user_id = (select auth.uid()) and (select private.is_member(org_id)));

-- Creates a profile (p_profile null) or saves a new version of one, from the version the surveyor started from.
create function public.app_survey_profile_save(p_org uuid, p_actor uuid, p_profile uuid, p_base_version integer, p_name text, p_body jsonb)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 or p_name ~ '[[:cntrl:]]'
     or p_body is null or jsonb_typeof(p_body) <> 'object' or octet_length(p_body::text) > 100000 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  -- One save at a time per workspace, so the limits below can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('survey_office_profiles:' || p_org::text, 0));
  if p_profile is null then
    -- 50 in use, and 200 kept with the archived ones.
    if (select count(*) from public.survey_office_profiles s where s.org_id = p_org and s.archived_at is null) >= 50
       or (select count(*) from public.survey_office_profiles s where s.org_id = p_org) >= 200 then
      raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
    end if;
    insert into public.survey_office_profiles (org_id, name, version, body, created_by, updated_by)
    values (p_org, btrim(p_name), 1, p_body, p_actor, p_actor)
    returning survey_office_profiles.id, survey_office_profiles.version into v_id, v_version;
  else
    select s.version into v_version from public.survey_office_profiles s
    where s.id = p_profile and s.org_id = p_org and s.archived_at is null
    for update;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
    if p_base_version is distinct from v_version then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    -- 200 versions of one profile at most.
    if v_version >= 200 then
      raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
    end if;
    update public.survey_office_profiles s
    set name = btrim(p_name), body = p_body, version = s.version + 1, updated_by = p_actor, updated_at = now()
    where s.id = p_profile
    returning s.id, s.version into v_id, v_version;
  end if;
  insert into public.survey_office_profile_versions (profile_id, org_id, version, name, body, saved_by)
  values (v_id, p_org, v_version, btrim(p_name), p_body, p_actor);
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.office_profile_saved', v_id::text, jsonb_build_object('version', v_version));
  return query select v_id, v_version;
end;
$$;

-- Archives a profile: it's no longer offered, and its versions stay for the plans that started from them.
create function public.app_survey_profile_archive(p_org uuid, p_actor uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  update public.survey_office_profiles s set archived_at = now(), updated_by = p_actor, updated_at = now()
  where s.id = p_profile and s.org_id = p_org and s.archived_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  delete from public.survey_office_profile_choices c where c.profile_id = p_profile;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.office_profile_archived', p_profile::text, '{}'::jsonb);
end;
$$;

-- Remembers the profile a surveyor generated a plan with, so the next one starts from it; none (null) forgets the choice, so a
-- surveyor who chose none isn't offered the old one again as "used last".
create function public.app_survey_profile_choose(p_org uuid, p_actor uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $
begin
  perform private.require_contributor(p_org, p_actor);
  if p_profile is null then
    delete from public.survey_office_profile_choices c where c.org_id = p_org and c.user_id = p_actor;
    return;
  end if;
  if not exists (select 1 from public.survey_office_profiles s where s.id = p_profile and s.org_id = p_org and s.archived_at is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.survey_office_profile_choices (org_id, user_id, profile_id, chosen_at)
  values (p_org, p_actor, p_profile, now())
  on conflict (org_id, user_id) do update set profile_id = excluded.profile_id, chosen_at = excluded.chosen_at;
end;
$$;

revoke all on function public.app_survey_profile_save(uuid, uuid, uuid, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.app_survey_profile_archive(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_survey_profile_choose(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_survey_profile_save(uuid, uuid, uuid, integer, text, jsonb) to service_role;
grant execute on function public.app_survey_profile_archive(uuid, uuid, uuid) to service_role;
grant execute on function public.app_survey_profile_choose(uuid, uuid, uuid) to service_role;
