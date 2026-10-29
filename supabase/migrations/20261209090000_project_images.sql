-- Farbaek schema v68: images in projects (ADR 0108).
--
-- A file revision can hold an image: base64 in `content`, with
-- encoding = 'base64', and its sha256 and size over the decoded bytes,
-- computed here. Only image paths take images, and the text write refuses
-- image paths, so text can never overwrite an image (an agent change, a text
-- import or an edit) and an image can never land on a text path. Search
-- reads text files only. Every existing file is text and stays 'utf8'.

alter table public.project_file_revisions
  add column encoding text not null default 'utf8' check (encoding in ('utf8', 'base64'));
alter table public.project_file_revisions
  add constraint project_file_revisions_base64_content check (encoding = 'utf8' or content is null or content ~ '^[A-Za-z0-9+/]+={0,2}$');
alter table public.project_files
  add column encoding text not null default 'utf8' check (encoding in ('utf8', 'base64'));

-- The paths an image may have. SVG is text, so it isn't one.
create function private.image_path(p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_path) ~ '\.(png|jpe?g|gif|webp|avif|ico)$';
$$;

-- The text write, as before, but never to an image path.
create or replace function private.put_project_file(p_project uuid, p_org uuid, p_actor uuid, p_path text, p_content text, p_change text, p_max_file_bytes integer)
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
  if private.image_path(p_path) then
    raise exception 'IMAGE_PATH' using errcode = '22023';
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

  insert into public.project_file_revisions (project_id, org_id, path, revision, change, content, sha256, size_bytes, created_by, encoding)
  values (p_project, p_org, p_path, v_revision, p_change, p_content, v_sha, v_size, p_actor, 'utf8');

  insert into public.project_files (project_id, org_id, path, revision, sha256, size_bytes, updated_by, updated_at, encoding)
  values (p_project, p_org, p_path, v_revision, v_sha, v_size, p_actor, now(), 'utf8')
  on conflict (project_id, path) do update
    set revision = excluded.revision, sha256 = excluded.sha256, size_bytes = excluded.size_bytes,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at, encoding = 'utf8';

  return case when v_existed then 'updated' else 'created' end;
end;
$$;

-- The image write: base64 in, checked, hashed and sized over the decoded bytes.
create function private.put_project_image(p_project uuid, p_org uuid, p_actor uuid, p_path text, p_base64 text, p_change text, p_max_file_bytes integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bytes bytea;
  v_sha text;
  v_size integer;
  v_current_sha text;
  v_existed boolean;
  v_revision integer;
begin
  if not private.valid_project_path(p_path) or not private.image_path(p_path) then
    raise exception 'INVALID_PATH' using errcode = '22023';
  end if;
  if p_base64 is null or p_base64 !~ '^[A-Za-z0-9+/]+={0,2}$' or char_length(p_base64) % 4 <> 0 then
    raise exception 'INVALID_CONTENT' using errcode = '22023';
  end if;
  -- Checked before decoding: base64 is 4 characters for every 3 bytes.
  if char_length(p_base64) > ((p_max_file_bytes + 2) / 3) * 4 then
    raise exception 'FILE_TOO_LARGE' using errcode = '22023';
  end if;
  v_bytes := decode(p_base64, 'base64');
  v_size := length(v_bytes);
  if v_size = 0 then
    raise exception 'INVALID_CONTENT' using errcode = '22023';
  end if;
  if v_size > p_max_file_bytes then
    raise exception 'FILE_TOO_LARGE' using errcode = '22023';
  end if;
  v_sha := encode(sha256(v_bytes), 'hex');

  select f.sha256 into v_current_sha from public.project_files f where f.project_id = p_project and f.path = p_path;
  v_existed := found;
  if v_existed and v_current_sha = v_sha then
    return 'unchanged';
  end if;

  select coalesce(max(r.revision), 0) + 1 into v_revision
  from public.project_file_revisions r where r.project_id = p_project and r.path = p_path;

  insert into public.project_file_revisions (project_id, org_id, path, revision, change, content, sha256, size_bytes, created_by, encoding)
  values (p_project, p_org, p_path, v_revision, p_change, p_base64, v_sha, v_size, p_actor, 'base64');

  insert into public.project_files (project_id, org_id, path, revision, sha256, size_bytes, updated_by, updated_at, encoding)
  values (p_project, p_org, p_path, v_revision, v_sha, v_size, p_actor, now(), 'base64')
  on conflict (project_id, path) do update
    set revision = excluded.revision, sha256 = excluded.sha256, size_bytes = excluded.size_bytes,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at, encoding = 'base64';

  return case when v_existed then 'updated' else 'created' end;
end;
$$;

-- Saves one image, like app_save_file: the revision the person saw must still be current, and the project's limits hold.
create function public.app_save_binary_file(
  p_project uuid,
  p_actor uuid,
  p_path text,
  p_base64 text,
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

  perform private.put_project_image(p_project, v_org, p_actor, p_path, p_base64, 'edit', p_max_file_bytes);
  perform private.check_project_size(p_project, p_max_project_bytes, p_max_files);
  return (select f.revision from public.project_files f where f.project_id = p_project and f.path = p_path);
end;
$$;

-- One file with its content, now saying how the content is encoded.
drop function public.get_project_file(uuid, text);
create function public.get_project_file(p_project uuid, p_path text)
returns table (path text, revision integer, sha256 text, size_bytes integer, content text, updated_at timestamptz, encoding text)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.path, f.revision, f.sha256, f.size_bytes, r.content, f.updated_at, r.encoding
  from public.project_files f
  join public.project_file_revisions r on r.project_id = f.project_id and r.path = f.path and r.revision = f.revision
  where f.project_id = p_project and f.path = p_path;
$$;

-- Search reads text files only.
create or replace function public.search_project_files(p_project uuid, p_query text)
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
      and r.encoding = 'utf8'
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

revoke all on function private.image_path(text) from public, anon, authenticated;
revoke all on function private.put_project_image(uuid, uuid, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.app_save_binary_file(uuid, uuid, text, text, integer, integer, bigint, integer) from public, anon, authenticated;
grant execute on function public.app_save_binary_file(uuid, uuid, text, text, integer, integer, bigint, integer) to service_role;
revoke all on function public.get_project_file(uuid, text) from public, anon, authenticated;
grant execute on function public.get_project_file(uuid, text) to authenticated;
