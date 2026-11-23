-- Farbaek schema v103: the sketch photos a plan's readings came from (stage 230, ADR 0240). One addition, nothing taken away.
--
-- When Claude reads a surveyor's field sketches (ADR 0234), the photos it read (as the browser sent them, shrunk to 1,568 px) are
-- kept with the project, so the plan can show each reading beside its photo and a difference can show its evidence. Bytes are base64
-- in Postgres, like the studios' pictures (Farbaek has no object storage yet): up to 2 MB a photo, 6 a read, and 50 MB a project.
-- A new read's photos replace the earlier read's, as its readings do.
-- Members read them through row-level security; only the server writes, through app_survey_keep_sketches, which checks each photo's
-- SHA-256 against its bytes. They stay with the project, archived too, until it or the workspace is deleted.

create table public.survey_sketch_photos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  project_id  uuid not null references public.survey_projects (id) on delete cascade,
  -- The reading's time, as the sketch record has it (readAt), so a plan's readings find their photos.
  read_at     text not null check (char_length(read_at) between 1 and 40),
  position    integer not null check (position between 0 and 5),
  file_name   text not null check (char_length(file_name) between 1 and 200),
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes  integer not null check (size_bytes between 1 and 2000000),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  content     text not null,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  constraint survey_sketch_photos_place unique (project_id, read_at, position)
);

create index survey_sketch_photos_project on public.survey_sketch_photos (project_id, read_at);

alter table public.survey_sketch_photos enable row level security;
revoke all on public.survey_sketch_photos from public, anon, authenticated, service_role;
grant select on public.survey_sketch_photos to authenticated, service_role;
create policy "members read survey sketch photos" on public.survey_sketch_photos for select to authenticated using ((select private.is_member(org_id)));

-- One read's photos, kept in one step: [{ "name": "...", "mime": "image/jpeg", "sha256": "...", "content": "<base64>" }].
create function public.app_survey_keep_sketches(p_org uuid, p_actor uuid, p_project uuid, p_read_at text, p_photos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo jsonb;
  v_bytes bytea;
  v_total bigint := 0;
  v_position integer := 0;
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.survey_project_open(p_org, p_project);
  if p_read_at is null or char_length(p_read_at) not between 1 and 40 or p_photos is null or jsonb_typeof(p_photos) <> 'array'
     or jsonb_array_length(p_photos) not between 1 and 6 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('survey_sketch_photos:' || p_project::text, 0));
  for v_photo in select * from jsonb_array_elements(p_photos) loop
    v_bytes := decode(v_photo ->> 'content', 'base64');
    if v_bytes is null or octet_length(v_bytes) not between 1 and 2000000
       or (v_photo ->> 'mime') not in ('image/jpeg', 'image/png', 'image/webp')
       or encode(sha256(v_bytes), 'hex') is distinct from (v_photo ->> 'sha256') then
      raise exception 'INVALID_REQUEST' using errcode = 'P0001';
    end if;
    v_total := v_total + octet_length(v_bytes);
  end loop;
  -- A new read's photos replace the earlier read's, as its readings replace theirs: what's kept is what the plan shows.
  delete from public.survey_sketch_photos s where s.project_id = p_project and s.read_at <> p_read_at;
  if (select coalesce(sum(s.size_bytes), 0) from public.survey_sketch_photos s where s.project_id = p_project) + v_total > 52428800 then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  for v_photo in select * from jsonb_array_elements(p_photos) loop
    v_bytes := decode(v_photo ->> 'content', 'base64');
    insert into public.survey_sketch_photos (org_id, project_id, read_at, position, file_name, mime, size_bytes, sha256, content, created_by)
    values (p_org, p_project, p_read_at, v_position, left(btrim(coalesce(v_photo ->> 'name', '')), 200), v_photo ->> 'mime', octet_length(v_bytes), v_photo ->> 'sha256', v_photo ->> 'content', p_actor);
    v_position := v_position + 1;
  end loop;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'survey.sketches_kept', p_project::text, jsonb_build_object('photos', v_position, 'bytes', v_total));
  return v_position;
end;
$$;

revoke all on function public.app_survey_keep_sketches(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_survey_keep_sketches(uuid, uuid, uuid, text, jsonb) to service_role;
