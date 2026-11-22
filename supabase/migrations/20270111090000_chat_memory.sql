-- Farbaek schema v101: Chat remembers (stage 207, ADR 0224). Three additions, nothing taken away:
--   1. a shared chat shows the sources its answers cite;
--   2. a long conversation's earlier part is kept as a summary, so the model still knows it once the messages no longer fit;
--   3. the things a person asked Farbaek AI to remember, which they can read and delete.

-- 1. Sources on a shared chat ------------------------------------------------------------------------------------------------

create or replace function public.app_chat_for_share(p_token_sha256 text, p_viewer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_title text;
  v_messages jsonb;
begin
  select * into v from private.chat_link_state(p_token_sha256);
  if v.state <> 'live' then
    return jsonb_build_object('state', v.state);
  end if;
  if v.audience = 'workspace' and (p_viewer is null or not exists (select 1 from public.organization_members m where m.org_id = v.org_id and m.user_id = p_viewer)) then
    return jsonb_build_object('state', case when p_viewer is null then 'sign_in' else 'members_only' end);
  end if;
  update public.chat_share_links set last_opened_at = now()
  where id = v.link_id and (last_opened_at is null or last_opened_at < now() - interval '5 minutes');
  select c.title into v_title from public.chat_conversations c where c.id = v.conversation_id;
  with recursive up as (
    select m.id, m.parent_id, 0 as depth from public.chat_messages m where m.id = v.leaf_id
    union all
    select m.id, m.parent_id, up.depth + 1 from public.chat_messages m join up on m.id = up.parent_id where up.depth < 4000
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'role', m.role, 'kind', m.kind, 'content', m.content, 'status', m.status, 'model', m.model, 'created_at', m.created_at,
           -- Only the search facts of an answer leave with a link: its sources and when the web was checked. Never the rest of its meta.
           'search', case when m.role = 'assistant' and m.kind = 'text' then m.meta -> 'search' end,
           'files', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'mime', a.mime, 'size', a.size_bytes, 'width', a.width, 'height', a.height, 'generated', a.generated) order by a.created_at)
                              from public.chat_attachments a where a.message_id = m.id), '[]'::jsonb)
         ) order by up.depth desc), '[]'::jsonb)
    into v_messages
  from up join public.chat_messages m on m.id = up.id;
  return jsonb_build_object('state', 'live', 'audience', v.audience, 'title', v_title, 'messages', v_messages);
end;
$$;

-- 2. Summaries of a long conversation's earlier part -------------------------------------------------------------------------

-- A summary belongs to one message and stands for the branch up to and including it. Written by the server after an answer, read
-- by the person's own turns. It goes when its message or conversation goes.
create table public.chat_summaries (
  message_id      uuid primary key references public.chat_messages (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  org_id          uuid not null references public.organizations (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  summary         text not null check (char_length(summary) between 1 and 6000),
  -- How many messages of the branch it stands for, from the first.
  covers          integer not null check (covers between 1 and 4000),
  model           text check (model ~ '^[a-z0-9][a-z0-9.:_-]{0,79}$'),
  created_at      timestamptz not null default now()
);
create index chat_summaries_conversation_idx on public.chat_summaries (conversation_id);

alter table public.chat_summaries enable row level security;
revoke all on public.chat_summaries from public, anon, authenticated, service_role;
grant select on public.chat_summaries to authenticated, service_role;
create policy "owners read their chat summaries" on public.chat_summaries for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));

create function public.app_chat_save_summary(p_org uuid, p_actor uuid, p_message uuid, p_summary text, p_covers integer, p_model text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.chat_messages%rowtype;
  v_summary text := btrim(coalesce(p_summary, ''));
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v_msg from public.chat_messages where id = p_message and org_id = p_org;
  if not found or v_msg.owner_id is distinct from p_actor then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if char_length(v_summary) not between 1 and 6000 or p_covers is null or p_covers not between 1 and 4000 then
    raise exception 'INVALID_SUMMARY' using errcode = '22023';
  end if;
  if p_model is not null and p_model !~ '^[a-z0-9][a-z0-9.:_-]{0,79}$' then
    raise exception 'INVALID_MODEL' using errcode = '22023';
  end if;
  insert into public.chat_summaries (message_id, conversation_id, org_id, owner_id, summary, covers, model)
  values (p_message, v_msg.conversation_id, p_org, p_actor, v_summary, p_covers, p_model)
  on conflict (message_id) do update set summary = excluded.summary, covers = excluded.covers, model = excluded.model, created_at = now();
end;
$$;
revoke all on function public.app_chat_save_summary(uuid, uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.app_chat_save_summary(uuid, uuid, uuid, text, integer, text) to service_role;

-- 3. What a person asked Farbaek AI to remember ------------------------------------------------------------------------------

-- Each row is one thing, in the person's own words, kept for their chats in one workspace until they delete it. At most 50.
create table public.chat_memories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 300),
  created_at timestamptz not null default now()
);
create index chat_memories_owner_idx on public.chat_memories (owner_id, org_id, created_at);

alter table public.chat_memories enable row level security;
revoke all on public.chat_memories from public, anon, authenticated, service_role;
grant select on public.chat_memories to authenticated, service_role;
create policy "owners read their chat memories" on public.chat_memories for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));

-- Remembers one thing. The same words twice are kept once. Returns the row's id.
create function public.app_chat_remember(p_org uuid, p_actor uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content text := btrim(regexp_replace(coalesce(p_content, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if char_length(v_content) not between 1 and 300 then
    raise exception 'INVALID_MEMORY' using errcode = '22023';
  end if;
  -- One at a time for a person, so two tabs can't both be the fiftieth.
  perform pg_advisory_xact_lock(hashtextextended('chat_memories:' || p_org::text || ':' || p_actor::text, 0));
  select m.id into v_id from public.chat_memories m where m.org_id = p_org and m.owner_id = p_actor and lower(m.content) = lower(v_content);
  if found then
    return v_id;
  end if;
  if (select count(*) from public.chat_memories m where m.org_id = p_org and m.owner_id = p_actor) >= 50 then
    raise exception 'MEMORY_FULL' using errcode = '22023';
  end if;
  insert into public.chat_memories (org_id, owner_id, content) values (p_org, p_actor, v_content) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.app_chat_remember(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_chat_remember(uuid, uuid, text) to service_role;

-- Forgets one thing, or everything when p_memory is null. Anyone still in the workspace may delete what is theirs, whatever
-- their role. Returns how many went.
create function public.app_chat_forget(p_org uuid, p_actor uuid, p_memory uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.chat_memories m where m.org_id = p_org and m.owner_id = p_actor and (p_memory is null or m.id = p_memory);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.app_chat_forget(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_chat_forget(uuid, uuid, uuid) to service_role;

-- Someone who leaves a workspace takes what they asked to be remembered there with them (their conversations already go).
create function private.forget_memories_of_departed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chat_memories where org_id = old.org_id and owner_id = old.user_id;
  return old;
end;
$$;
revoke all on function private.forget_memories_of_departed() from public, anon, authenticated;
create trigger memories_leave_with_member after delete on public.organization_members
  for each row execute function private.forget_memories_of_departed();

-- What the account export adds: everything the person asked to be remembered, in workspaces they're still in.
create function public.app_chat_memories_export(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('remembered', m.content, 'workspace', o.name, 'at', m.created_at) order by m.created_at), '[]'::jsonb)
  from public.chat_memories m
    join public.organizations o on o.id = m.org_id
    join public.organization_members om on om.org_id = m.org_id and om.user_id = p_user
  where m.owner_id = p_user;
$$;
revoke all on function public.app_chat_memories_export(uuid) from public, anon, authenticated;
grant execute on function public.app_chat_memories_export(uuid) to service_role;
