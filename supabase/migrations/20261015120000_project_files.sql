-- Farbaek schema v5: project files.
--
-- Every change to a file is an immutable revision (import, edit or delete).
-- project_files points at each path's current revision, so the file tree is
-- cheap to read and history is never lost; checkpoints and diffs build on
-- the revisions. Contents are UTF-8 text only. The database computes each
-- hash and size itself and re-checks paths and limits the server passes in
-- from src/config/workspace.ts.

-- Same rules as checkPath in src/core/workspace/files.ts: a relative POSIX
-- path with no "." or ".." segments, no empty segments, no backslashes or
-- control characters.
create function private.valid_project_path(p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is not null
    and char_length(p_path) between 1 and 300
    and p_path !~ '[\x01-\x1f\x7f\\]'
    and left(p_path, 1) <> '/'
    and right(p_path, 1) <> '/'
    and position('//' in p_path) = 0
    and p_path !~ '(^|/)\.\.?(/|$)'
    and cardinality(string_to_array(p_path, '/')) <= 24
    and not exists (select 1 from unnest(string_to_array(p_path, '/')) as s (name) where char_length(s.name) > 120);
$$;
revoke all on function private.valid_project_path(text) from public;

create table public.project_file_revisions (
  project_id  uuid not null,
  org_id      uuid not null,
  path        text not null check (private.valid_project_path(path)),
  revision    integer not null check (revision > 0),
  change      text not null check (change in ('import', 'edit', 'delete')),
  content     text,
  sha256      text check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes  integer check (size_bytes >= 0),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (project_id, path, revision),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  constraint project_file_revisions_delete_has_no_content check ((change = 'delete') = (content is null)),
  constraint project_file_revisions_content_metadata check ((content is null) = (sha256 is null) and (content is null) = (size_bytes is null))
);
create index project_file_revisions_org_idx on public.project_file_revisions (org_id, created_at desc);

create table public.project_files (
  project_id  uuid not null,
  org_id      uuid not null,
  path        text not null,
  revision    integer not null,
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes  integer not null check (size_bytes >= 0),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (project_id, path),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  foreign key (project_id, path, revision) references public.project_file_revisions (project_id, path, revision) on delete cascade
);

alter table public.project_file_revisions enable row level security;
alter table public.project_files enable row level security;
revoke all on public.project_file_revisions, public.project_files from anon, authenticated;
grant select on public.project_file_revisions, public.project_files to authenticated;
create policy "members read file revisions" on public.project_file_revisions
  for select to authenticated using ((select private.is_member(org_id)));
create policy "members read files" on public.project_files
  for select to authenticated using ((select private.is_member(org_id)));

-- ------------------------------------------------------------- reads

-- One file's current content. Runs as the caller, so Row Level Security applies.
create function public.get_project_file(p_project uuid, p_path text)
returns table (path text, revision integer, sha256 text, size_bytes integer, content text, updated_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.path, f.revision, f.sha256, f.size_bytes, r.content, f.updated_at
  from public.project_files f
  join public.project_file_revisions r on r.project_id = f.project_id and r.path = f.path and r.revision = f.revision
  where f.project_id = p_project and f.path = p_path;
$$;

-- Case-insensitive plain-text search over current files. Returns matching
-- lines (trimmed to 300 characters), at most 200.
create function public.search_project_files(p_project uuid, p_query text)
returns table (path text, line integer, text text)
language sql
stable
security invoker
set search_path = ''
as $$
  with current_files as (
    select f.path, r.content
    from public.project_files f
    join public.project_file_revisions r on r.project_id = f.project_id and r.path = f.path and r.revision = f.revision
    where f.project_id = p_project
      and char_length(p_query) between 1 and 200
      and strpos(lower(r.content), lower(p_query)) > 0
  )
  select c.path, l.n::integer, left(l.body, 300)
  from current_files c
  cross join lateral regexp_split_to_table(c.content, E'\n') with ordinality as l (body, n)
  where strpos(lower(l.body), lower(p_query)) > 0
  order by c.path, l.n
  limit 200;
$$;

revoke all on function public.get_project_file(uuid, text) from public, anon;
revoke all on function public.search_project_files(uuid, text) from public, anon;
grant execute on function public.get_project_file(uuid, text) to authenticated, service_role;
grant execute on function public.search_project_files(uuid, text) to authenticated, service_role;

-- ------------------------------------------------- server-only functions

-- Locks the project for the rest of the transaction and checks the actor
-- can change it. Returns the project's organization.
create function private.lock_project(p_project uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project and archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_org, p_actor);
  return v_org;
end;
$$;
revoke all on function private.lock_project(uuid, uuid) from public;

-- Writes a new revision when the content changed. Returns 'created',
-- 'updated' or 'unchanged'.
create function private.put_project_file(p_project uuid, p_org uuid, p_actor uuid, p_path text, p_content text, p_change text, p_max_file_bytes integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sha text;
  v_size integer;
  v_current_sha text;
  v_existed boolean;
  v_revision integer;
begin
  if not private.valid_project_path(p_path) then
    raise exception 'INVALID_PATH' using errcode = '22023';
  end if;
  if p_content is null then
    raise exception 'INVALID_CONTENT' using errcode = '22023';
  end if;
  v_size := octet_length(p_content);
  if v_size > p_max_file_bytes then
    raise exception 'FILE_TOO_LARGE' using errcode = '22023';
  end if;
  v_sha := encode(sha256(convert_to(p_content, 'UTF8')), 'hex');

  select f.sha256 into v_current_sha from public.project_files f where f.project_id = p_project and f.path = p_path;
  v_existed := found;
  if v_existed and v_current_sha = v_sha then
    return 'unchanged';
  end if;

  select coalesce(max(r.revision), 0) + 1 into v_revision
  from public.project_file_revisions r where r.project_id = p_project and r.path = p_path;

  insert into public.project_file_revisions (project_id, org_id, path, revision, change, content, sha256, size_bytes, created_by)
  values (p_project, p_org, p_path, v_revision, p_change, p_content, v_sha, v_size, p_actor);

  insert into public.project_files (project_id, org_id, path, revision, sha256, size_bytes, updated_by, updated_at)
  values (p_project, p_org, p_path, v_revision, v_sha, v_size, p_actor, now())
  on conflict (project_id, path) do update
    set revision = excluded.revision, sha256 = excluded.sha256, size_bytes = excluded.size_bytes,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  return case when v_existed then 'updated' else 'created' end;
end;
$$;
revoke all on function private.put_project_file(uuid, uuid, uuid, text, text, text, integer) from public;

create function private.check_project_size(p_project uuid, p_max_bytes bigint, p_max_files integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.project_files where project_id = p_project) > p_max_files
     or (select coalesce(sum(size_bytes), 0) from public.project_files where project_id = p_project) > p_max_bytes then
    raise exception 'PROJECT_TOO_LARGE' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.check_project_size(uuid, bigint, integer) from public;

-- p_files: [{ "path": "...", "content": "..." }, ...]. All or nothing.
create function public.app_import_files(
  p_project uuid,
  p_actor uuid,
  p_files jsonb,
  p_max_file_bytes integer,
  p_max_import_bytes integer,
  p_max_project_bytes bigint,
  p_max_files integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_item jsonb;
  v_result text;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
begin
  v_org := private.lock_project(p_project, p_actor);

  if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) = 0 then
    raise exception 'INVALID_IMPORT' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_files) e
    where jsonb_typeof(e.value -> 'path') is distinct from 'string' or jsonb_typeof(e.value -> 'content') is distinct from 'string'
  ) then
    raise exception 'INVALID_IMPORT' using errcode = '22023';
  end if;
  if jsonb_array_length(p_files) > p_max_files then
    raise exception 'PROJECT_TOO_LARGE' using errcode = 'P0001';
  end if;
  if (select count(distinct e.value ->> 'path') from jsonb_array_elements(p_files) e) <> jsonb_array_length(p_files) then
    raise exception 'DUPLICATE_PATH' using errcode = '22023';
  end if;
  if (select sum(octet_length(e.value ->> 'content')) from jsonb_array_elements(p_files) e) > p_max_import_bytes then
    raise exception 'IMPORT_TOO_LARGE' using errcode = '22023';
  end if;

  for v_item in select e.value from jsonb_array_elements(p_files) e loop
    v_result := private.put_project_file(p_project, v_org, p_actor, v_item ->> 'path', v_item ->> 'content', 'import', p_max_file_bytes);
    if v_result = 'created' then
      v_created := v_created + 1;
    elsif v_result = 'updated' then
      v_updated := v_updated + 1;
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  perform private.check_project_size(p_project, p_max_project_bytes, p_max_files);

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'project.files_imported', p_project::text,
          jsonb_build_object('created', v_created, 'updated', v_updated, 'unchanged', v_unchanged));
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'unchanged', v_unchanged);
end;
$$;

-- Creates (p_expected_revision = 0) or edits one file. Returns the file's
-- revision afterwards. FILE_CHANGED means someone saved it first.
create function public.app_save_file(
  p_project uuid,
  p_actor uuid,
  p_path text,
  p_content text,
  p_expected_revision integer,
  p_max_file_bytes integer,
  p_max_project_bytes bigint,
  p_max_files integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_current integer;
begin
  v_org := private.lock_project(p_project, p_actor);
  select coalesce((select f.revision from public.project_files f where f.project_id = p_project and f.path = p_path), 0) into v_current;
  if v_current <> p_expected_revision then
    raise exception 'FILE_CHANGED' using errcode = '40001';
  end if;

  perform private.put_project_file(p_project, v_org, p_actor, p_path, p_content, 'edit', p_max_file_bytes);
  perform private.check_project_size(p_project, p_max_project_bytes, p_max_files);
  return (select f.revision from public.project_files f where f.project_id = p_project and f.path = p_path);
end;
$$;

-- Removes a file from the current tree, keeping its history.
create function public.app_delete_file(p_project uuid, p_actor uuid, p_path text, p_expected_revision integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_current integer;
  v_revision integer;
begin
  v_org := private.lock_project(p_project, p_actor);
  select f.revision into v_current from public.project_files f where f.project_id = p_project and f.path = p_path;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current <> p_expected_revision then
    raise exception 'FILE_CHANGED' using errcode = '40001';
  end if;

  select max(r.revision) + 1 into v_revision from public.project_file_revisions r where r.project_id = p_project and r.path = p_path;
  delete from public.project_files where project_id = p_project and path = p_path;
  insert into public.project_file_revisions (project_id, org_id, path, revision, change, created_by)
  values (p_project, v_org, p_path, v_revision, 'delete', p_actor);

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'project.file_deleted', p_project::text, jsonb_build_object('path', p_path, 'revision', v_revision));
end;
$$;

revoke all on function public.app_import_files(uuid, uuid, jsonb, integer, integer, bigint, integer) from public, anon, authenticated;
revoke all on function public.app_save_file(uuid, uuid, text, text, integer, integer, bigint, integer) from public, anon, authenticated;
revoke all on function public.app_delete_file(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.app_import_files(uuid, uuid, jsonb, integer, integer, bigint, integer) to service_role;
grant execute on function public.app_save_file(uuid, uuid, text, text, integer, integer, bigint, integer) to service_role;
grant execute on function public.app_delete_file(uuid, uuid, text, integer) to service_role;
