-- Farbaek schema v100: the image and video studios (stage 201, ADR 0216).
--
-- What a person makes in Farbaek AI's studios, and the pictures they upload to
-- work from: private to that person in the workspace, gone when they leave it.
-- Bytes are base64 in Postgres, like chat files and project images (Farbaek
-- has no object storage yet): a picture up to 8 MB, a video up to 20 MB, and
-- 500 MB per person in a workspace. A video gets a row while it renders
-- ("working"), so the library shows it after a reload; a row left working for
-- more than 15 minutes reads as failed. Video is metered as its own AI
-- operation, video_generation. The browser only reads, through row level
-- security; the server's functions below do every write.

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping', 'policy_draft', 'image_generation', 'second_check', 'task_note', 'failure_test', 'survey_draft', 'survey_read', 'survey_assist', 'chat', 'video_generation'));

create table public.studio_media (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  -- One request's results share a batch: four variations of one prompt.
  batch_id    uuid not null,
  kind        text not null check (kind in ('image', 'video', 'upload')),
  status      text not null default 'ready' check (status in ('working', 'ready', 'failed')),
  prompt      text not null default '' check (char_length(prompt) <= 4000),
  -- The controls it was made with (shape, detail, style, length), for "make it again".
  settings    jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 4000),
  model       text check (model is null or model ~ '^[a-z0-9][a-z0-9.:_-]{0,79}$'),
  -- The picture it was made from, for an edit or a video from a still.
  parent_id   uuid references public.studio_media (id) on delete set null,
  error       text check (error is null or char_length(error) <= 300),
  mime        text check (mime is null or mime in ('image/png', 'image/jpeg', 'image/webp', 'video/mp4')),
  width       integer check (width is null or width between 1 and 8192),
  height      integer check (height is null or height between 1 and 8192),
  duration_ms integer check (duration_ms is null or duration_ms between 1 and 60000),
  size_bytes  integer not null default 0 check (size_bytes between 0 and 20971520),
  sha256      text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  -- Base64 of the bytes: 20 MB is about 27 MB of text.
  content     text check (content is null or octet_length(content) <= 28000000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint studio_media_ready_has_bytes check ((status = 'ready') = (content is not null)),
  constraint studio_media_kind_mime check (mime is null or (kind = 'video') = (mime = 'video/mp4')),
  constraint studio_media_picture_size check (kind = 'video' or size_bytes <= 8388608)
);
create index studio_media_owner_idx on public.studio_media (org_id, owner_id, created_at desc);
create index studio_media_batch_idx on public.studio_media (batch_id);

alter table public.studio_media enable row level security;
revoke all on public.studio_media from public, anon, authenticated, service_role;
grant select on public.studio_media to authenticated, service_role;
create policy "owners read their studio media" on public.studio_media for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));

-- Room for more: each person keeps up to 500 MB of studio media in a workspace.
create function private.studio_storage_room(p_org uuid, p_actor uuid, p_bytes bigint)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select coalesce(sum(m.size_bytes), 0) from public.studio_media m where m.owner_id = p_actor and m.org_id = p_org) + p_bytes > 524288000 then
    raise exception 'STORAGE_FULL' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.studio_storage_room(uuid, uuid, bigint) from public, anon, authenticated;

-- The bytes of a finished item, checked against its kind.
create function private.studio_check_bytes(p_kind text, p_mime text, p_size integer, p_sha256 text, p_content text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_content is null or p_size is null or p_size < 1 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_FILE' using errcode = '22023';
  end if;
  if p_kind = 'video' then
    if p_mime is distinct from 'video/mp4' or p_size > 20971520 or octet_length(p_content) > 28000000 then
      raise exception 'FILE_TOO_LARGE' using errcode = '22023';
    end if;
  elsif p_mime not in ('image/png', 'image/jpeg', 'image/webp') or p_size > 8388608 or octet_length(p_content) > 11200000 then
    raise exception 'FILE_TOO_LARGE' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.studio_check_bytes(text, text, integer, text, text) from public, anon, authenticated;

-- The parent picture, when one is named: the actor's own, in this workspace.
create function private.studio_own_parent(p_org uuid, p_actor uuid, p_parent uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_parent is not null and not exists (
    select 1 from public.studio_media where id = p_parent and org_id = p_org and owner_id = p_actor and status = 'ready' and kind in ('image', 'upload')
  ) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function private.studio_own_parent(uuid, uuid, uuid) from public, anon, authenticated;

-- A finished picture or an upload, saved in one step.
create function public.app_studio_save(p_org uuid, p_actor uuid, p_batch uuid, p_kind text, p_prompt text, p_settings jsonb, p_model text, p_parent uuid, p_mime text, p_size integer, p_sha256 text, p_content text, p_width integer, p_height integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_batch is null or p_kind not in ('image', 'upload') then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  perform private.studio_check_bytes(p_kind, p_mime, p_size, p_sha256, p_content);
  perform private.studio_own_parent(p_org, p_actor, p_parent);
  perform private.studio_storage_room(p_org, p_actor, p_size);
  insert into public.studio_media (org_id, owner_id, batch_id, kind, status, prompt, settings, model, parent_id, mime, width, height, size_bytes, sha256, content)
  values (p_org, p_actor, p_batch, p_kind, 'ready', coalesce(left(p_prompt, 4000), ''), coalesce(p_settings, '{}'::jsonb), p_model, p_parent, p_mime, p_width, p_height, p_size, p_sha256, p_content)
  returning id into v_id;
  return v_id;
end;
$$;

-- A video starts rendering: a working row, so the library shows it. At most three at once per person.
create function public.app_studio_begin(p_org uuid, p_actor uuid, p_batch uuid, p_prompt text, p_settings jsonb, p_model text, p_parent uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_batch is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  perform private.studio_own_parent(p_org, p_actor, p_parent);
  perform private.studio_storage_room(p_org, p_actor, 0);
  -- A render left working for 15 minutes failed: the server that ran it stopped.
  update public.studio_media set status = 'failed', error = 'The video stopped rendering. It wasn''t counted.', updated_at = now()
  where owner_id = p_actor and status = 'working' and created_at < now() - interval '15 minutes';
  if (select count(*) from public.studio_media where owner_id = p_actor and org_id = p_org and status = 'working') >= 3 then
    raise exception 'TOO_MANY_RENDERS' using errcode = '22023';
  end if;
  insert into public.studio_media (org_id, owner_id, batch_id, kind, status, prompt, settings, model, parent_id)
  values (p_org, p_actor, p_batch, 'video', 'working', coalesce(left(p_prompt, 4000), ''), coalesce(p_settings, '{}'::jsonb), p_model, p_parent)
  returning id into v_id;
  return v_id;
end;
$$;

-- The video is ready.
create function public.app_studio_finish(p_org uuid, p_actor uuid, p_id uuid, p_mime text, p_size integer, p_sha256 text, p_content text, p_width integer, p_height integer, p_duration_ms integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.studio_media%rowtype;
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v from public.studio_media where id = p_id and org_id = p_org for update;
  if not found or v.owner_id is distinct from p_actor or v.status <> 'working' then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.studio_check_bytes(v.kind, p_mime, p_size, p_sha256, p_content);
  perform private.studio_storage_room(p_org, p_actor, p_size);
  update public.studio_media
  set status = 'ready', mime = p_mime, size_bytes = p_size, sha256 = p_sha256, content = p_content, width = p_width, height = p_height,
      duration_ms = p_duration_ms, error = null, updated_at = now()
  where id = p_id;
end;
$$;

-- The video didn't render; what went wrong, in words for the person.
create function public.app_studio_fail(p_org uuid, p_actor uuid, p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  update public.studio_media set status = 'failed', error = left(coalesce(p_error, 'It didn''t render.'), 300), updated_at = now()
  where id = p_id and org_id = p_org and owner_id = p_actor and status = 'working';
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- Gone for good: one item of the actor's own.
create function public.app_studio_delete(p_org uuid, p_actor uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contributor(p_org, p_actor);
  delete from public.studio_media where id = p_id and org_id = p_org and owner_id = p_actor;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- Someone who leaves a workspace (or is removed) takes what they made with them: nobody else could see it.
create function private.close_studio_of_departed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.studio_media where org_id = old.org_id and owner_id = old.user_id;
  return old;
end;
$$;
revoke all on function private.close_studio_of_departed() from public, anon, authenticated;
create trigger studio_leaves_with_member after delete on public.organization_members
  for each row execute function private.close_studio_of_departed();

revoke all on function public.app_studio_save(uuid, uuid, uuid, text, text, jsonb, text, uuid, text, integer, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.app_studio_begin(uuid, uuid, uuid, text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.app_studio_finish(uuid, uuid, uuid, text, integer, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.app_studio_fail(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_studio_delete(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_studio_save(uuid, uuid, uuid, text, text, jsonb, text, uuid, text, integer, text, text, integer, integer) to service_role;
grant execute on function public.app_studio_begin(uuid, uuid, uuid, text, jsonb, text, uuid) to service_role;
grant execute on function public.app_studio_finish(uuid, uuid, uuid, text, integer, text, text, integer, integer, integer) to service_role;
grant execute on function public.app_studio_fail(uuid, uuid, uuid, text) to service_role;
grant execute on function public.app_studio_delete(uuid, uuid, uuid) to service_role;
