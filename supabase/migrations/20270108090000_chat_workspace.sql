-- Farbaek schema v98: Farbaek Chat, the AI chat workspace (stage 199, ADR 0213).
--
-- A person's conversations with Farbaek's AI inside a workspace. Conversations
-- are private to the person who started them: nobody else in the workspace
-- reads them, and they go when the person leaves the workspace. Messages form
-- a tree, so editing a question or asking again keeps the earlier answer as a
-- branch; the conversation remembers which branch is showing (leaf_id).
-- Answers are written while they stream, so a stopped or interrupted answer
-- keeps what was already written. Files people attach and images the AI makes
-- are kept with the conversation (base64 in Postgres, like project images,
-- ADR 0188 has no object storage). A conversation can be shared read-only by
-- a link that stores only the SHA-256 of its token, as a snapshot of the branch
-- showing when it was shared, for people in the workspace or for anyone.
-- One more AI operation is metered like the others (chat); images use
-- image_generation. The browser only reads, through row level security; the
-- server's functions below do every write.

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping', 'policy_draft', 'image_generation', 'second_check', 'task_note', 'failure_test', 'survey_draft', 'survey_read', 'survey_assist', 'chat'));

create table public.chat_conversations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  title         text not null default '' check (char_length(title) <= 120),
  -- Named by the person: the AI's title never replaces it.
  titled        boolean not null default false,
  pinned_at     timestamptz,
  archived_at   timestamptz,
  -- The newest message of the branch showing; set by the functions below.
  leaf_id       uuid,
  message_count integer not null default 0 check (message_count between 0 and 4000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index chat_conversations_owner_idx on public.chat_conversations (owner_id, org_id, updated_at desc);

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  org_id          uuid not null references public.organizations (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  parent_id       uuid references public.chat_messages (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  kind            text not null default 'text' check (kind in ('text', 'image')),
  content         text not null default '' check (char_length(content) <= 200000),
  status          text not null default 'complete' check (status in ('streaming', 'complete', 'stopped', 'failed')),
  model           text check (model ~ '^[a-z0-9][a-z0-9.:_-]{0,79}$'),
  error           text check (char_length(error) <= 400),
  rating          smallint check (rating in (-1, 1)),
  -- How long the model thought before answering, in milliseconds. The thinking itself is never kept (ADR 0009).
  thinking_ms     integer check (thinking_ms between 0 and 3600000),
  -- Small facts about the answer: the shape of a generated image, why it stopped.
  meta            jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 8192),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((role = 'user') = (model is null))
);
create index chat_messages_parent_idx on public.chat_messages (conversation_id, parent_id, created_at);
create index chat_messages_streaming_idx on public.chat_messages (owner_id) where status = 'streaming';

alter table public.chat_conversations
  add constraint chat_conversations_leaf_fkey foreign key (leaf_id) references public.chat_messages (id) on delete set null;

create table public.chat_attachments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.chat_conversations (id) on delete cascade,
  message_id      uuid references public.chat_messages (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 200),
  kind            text not null check (kind in ('image', 'pdf', 'text')),
  mime            text not null check (mime in ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json')),
  size_bytes      integer not null check (size_bytes between 1 and 5242880),
  sha256          text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Base64 of the bytes: 5 MB is about 7 MB of text.
  content         text not null check (octet_length(content) <= 7000000),
  width           integer check (width between 1 and 20000),
  height          integer check (height between 1 and 20000),
  -- Made by the AI (an image answer), not attached by the person.
  generated       boolean not null default false,
  created_at      timestamptz not null default now()
);
create index chat_attachments_message_idx on public.chat_attachments (message_id);
create index chat_attachments_owner_idx on public.chat_attachments (owner_id, created_at desc);

create table public.chat_share_links (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  org_id          uuid not null references public.organizations (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  token_sha256    text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  -- The newest message shared: the link shows the branch up to here, as it was then.
  leaf_id         uuid not null references public.chat_messages (id) on delete cascade,
  audience        text not null check (audience in ('workspace', 'anyone')),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  last_opened_at  timestamptz
);
create index chat_share_links_conversation_idx on public.chat_share_links (conversation_id);

-- Only the person whose conversation it is reads it, and only while they're in the workspace.
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_attachments enable row level security;
alter table public.chat_share_links enable row level security;
revoke all on public.chat_conversations, public.chat_messages, public.chat_attachments, public.chat_share_links from public, anon, authenticated, service_role;
grant select on public.chat_conversations, public.chat_messages, public.chat_attachments, public.chat_share_links to authenticated, service_role;
create policy "owners read their chats" on public.chat_conversations for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));
create policy "owners read their chat messages" on public.chat_messages for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));
create policy "owners read their chat files" on public.chat_attachments for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));
create policy "owners read their chat links" on public.chat_share_links for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_member(org_id)));

-- The conversation, locked, when it's the actor's own in this workspace.
create function private.chat_own(p_org uuid, p_actor uuid, p_conversation uuid)
returns public.chat_conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.chat_conversations%rowtype;
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v from public.chat_conversations where id = p_conversation and org_id = p_org for update;
  if not found or v.owner_id is distinct from p_actor then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function private.chat_own(uuid, uuid, uuid) from public, anon, authenticated;

-- The branch tip under a message: its newest child, then that one's, down to a message with none.
create function private.chat_tip(p_message uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_message;
  v_next uuid;
  v_steps integer := 0;
begin
  loop
    select m.id into v_next from public.chat_messages m where m.parent_id = v_id order by m.created_at desc, m.id desc limit 1;
    exit when v_next is null or v_steps > 4000;
    v_id := v_next;
    v_steps := v_steps + 1;
  end loop;
  return v_id;
end;
$$;
revoke all on function private.chat_tip(uuid) from public, anon, authenticated;

-- A new conversation, optionally in one of the workspace's projects.
create function public.app_chat_start(p_org uuid, p_actor uuid, p_project uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_project is not null and not exists (select 1 from public.projects p where p.id = p_project and p.org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if (select count(*) from public.chat_conversations c where c.owner_id = p_actor and c.org_id = p_org) >= 5000 then
    raise exception 'CHAT_LIMIT' using errcode = '22023';
  end if;
  insert into public.chat_conversations (org_id, owner_id, project_id, title)
  values (p_org, p_actor, p_project, left(coalesce(btrim(p_title), ''), 120))
  returning id into v_id;
  return v_id;
end;
$$;

-- A question: a child of an answer (or the first message), with the files attached to it. A file already attached to an earlier
-- message of this conversation (editing a question keeps its files) is copied onto the new one.
create function public.app_chat_add_user_message(p_org uuid, p_actor uuid, p_conversation uuid, p_parent uuid, p_content text, p_attachments uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.chat_conversations%rowtype;
  v_parent public.chat_messages%rowtype;
  v_id uuid;
  v_file uuid;
  v_row public.chat_attachments%rowtype;
begin
  v_conv := private.chat_own(p_org, p_actor, p_conversation);
  if v_conv.message_count >= 4000 then
    raise exception 'CHAT_LIMIT' using errcode = '22023';
  end if;
  if p_content is null or char_length(p_content) > 100000 then
    raise exception 'INVALID_MESSAGE' using errcode = '22023';
  end if;
  if btrim(p_content) = '' and coalesce(cardinality(p_attachments), 0) = 0 then
    raise exception 'INVALID_MESSAGE' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_attachments), 0) > 6 then
    raise exception 'TOO_MANY_FILES' using errcode = '22023';
  end if;
  if p_parent is not null then
    select * into v_parent from public.chat_messages where id = p_parent and conversation_id = p_conversation;
    if not found or v_parent.role <> 'assistant' then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
  insert into public.chat_messages (conversation_id, org_id, owner_id, parent_id, role, content)
  values (p_conversation, p_org, p_actor, p_parent, 'user', p_content)
  returning id into v_id;
  foreach v_file in array coalesce(p_attachments, '{}'::uuid[]) loop
    select * into v_row from public.chat_attachments where id = v_file and owner_id = p_actor and org_id = p_org and not generated for update;
    if not found or (v_row.message_id is not null and v_row.conversation_id is distinct from p_conversation) then
      raise exception 'FILE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_row.message_id is null then
      update public.chat_attachments set message_id = v_id, conversation_id = p_conversation where id = v_file;
    else
      insert into public.chat_attachments (org_id, owner_id, conversation_id, message_id, name, kind, mime, size_bytes, sha256, content, width, height)
      values (p_org, p_actor, p_conversation, v_id, v_row.name, v_row.kind, v_row.mime, v_row.size_bytes, v_row.sha256, v_row.content, v_row.width, v_row.height);
    end if;
  end loop;
  update public.chat_conversations set leaf_id = v_id, message_count = message_count + 1, updated_at = now() where id = p_conversation;
  return v_id;
end;
$$;

-- An answer starts, empty, under a question; it's written as it streams (app_chat_write_reply). Answers someone's earlier request
-- left streaming for over ten minutes (the server stopped) are marked stopped, keeping what they had.
create function public.app_chat_begin_reply(p_org uuid, p_actor uuid, p_conversation uuid, p_parent uuid, p_kind text, p_model text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.chat_conversations%rowtype;
  v_parent public.chat_messages%rowtype;
  v_id uuid;
begin
  v_conv := private.chat_own(p_org, p_actor, p_conversation);
  if v_conv.message_count >= 4000 then
    raise exception 'CHAT_LIMIT' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('text', 'image') then
    raise exception 'INVALID_MESSAGE' using errcode = '22023';
  end if;
  if p_model is null or p_model !~ '^[a-z0-9][a-z0-9.:_-]{0,79}$' then
    raise exception 'INVALID_MODEL' using errcode = '22023';
  end if;
  select * into v_parent from public.chat_messages where id = p_parent and conversation_id = p_conversation;
  if not found or v_parent.role <> 'user' then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.chat_messages set status = 'stopped', updated_at = now()
  where owner_id = p_actor and status = 'streaming' and updated_at < now() - interval '10 minutes';
  insert into public.chat_messages (conversation_id, org_id, owner_id, parent_id, role, kind, status, model)
  values (p_conversation, p_org, p_actor, p_parent, 'assistant', p_kind, 'streaming', p_model)
  returning id into v_id;
  update public.chat_conversations set leaf_id = v_id, message_count = message_count + 1, updated_at = now() where id = p_conversation;
  return v_id;
end;
$$;

-- Writes an answer while it streams (status streaming) and when it ends (complete, stopped or failed). Once ended it no longer changes,
-- except through app_chat_reopen_reply.
create function public.app_chat_write_reply(p_org uuid, p_actor uuid, p_message uuid, p_content text, p_status text, p_model text, p_error text, p_thinking_ms integer, p_meta jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.chat_messages%rowtype;
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v_msg from public.chat_messages where id = p_message and org_id = p_org for update;
  if not found or v_msg.owner_id is distinct from p_actor or v_msg.role <> 'assistant' then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_msg.status <> 'streaming' then
    raise exception 'ALREADY_ENDED' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('streaming', 'complete', 'stopped', 'failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if p_model is not null and p_model !~ '^[a-z0-9][a-z0-9.:_-]{0,79}$' then
    raise exception 'INVALID_MODEL' using errcode = '22023';
  end if;
  update public.chat_messages
  set content = coalesce(p_content, ''),
      status = p_status,
      model = coalesce(p_model, model),
      error = left(p_error, 400),
      thinking_ms = coalesce(p_thinking_ms, thinking_ms),
      meta = coalesce(p_meta, meta),
      updated_at = now()
  where id = p_message;
  update public.chat_conversations set updated_at = now() where id = v_msg.conversation_id;
end;
$$;

-- Continue an answer that stopped: it streams again, and what follows is added to what it has. Returns what it has.
create function public.app_chat_reopen_reply(p_org uuid, p_actor uuid, p_message uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.chat_messages%rowtype;
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v_msg from public.chat_messages where id = p_message and org_id = p_org for update;
  if not found or v_msg.owner_id is distinct from p_actor or v_msg.role <> 'assistant' then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_msg.kind <> 'text' or v_msg.status not in ('stopped', 'complete') or btrim(v_msg.content) = '' then
    raise exception 'CANNOT_CONTINUE' using errcode = '22023';
  end if;
  update public.chat_messages set status = 'streaming', error = null, updated_at = now() where id = p_message;
  update public.chat_conversations set leaf_id = private.chat_tip(p_message), updated_at = now() where id = v_msg.conversation_id;
  return v_msg.content;
end;
$$;

-- A file the person attaches (before the question is sent), or an image the AI made for an answer that's streaming.
create function public.app_chat_save_attachment(p_org uuid, p_actor uuid, p_message uuid, p_name text, p_kind text, p_mime text, p_size integer, p_sha256 text, p_content text, p_width integer, p_height integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.chat_messages%rowtype;
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if p_content is null or p_size is null or p_size < 1 or p_size > 5242880 or octet_length(p_content) > 7000000 then
    raise exception 'FILE_TOO_LARGE' using errcode = '22023';
  end if;
  if p_message is null then
    -- Files waiting to be sent: a day at most, and not many at once.
    delete from public.chat_attachments where owner_id = p_actor and message_id is null and created_at < now() - interval '1 day';
    if (select count(*) from public.chat_attachments where owner_id = p_actor and message_id is null) >= 40 then
      raise exception 'TOO_MANY_FILES' using errcode = '22023';
    end if;
    insert into public.chat_attachments (org_id, owner_id, name, kind, mime, size_bytes, sha256, content, width, height)
    values (p_org, p_actor, btrim(p_name), p_kind, p_mime, p_size, p_sha256, p_content, p_width, p_height)
    returning id into v_id;
  else
    select * into v_msg from public.chat_messages where id = p_message and org_id = p_org for update;
    if not found or v_msg.owner_id is distinct from p_actor or v_msg.role <> 'assistant' or v_msg.kind <> 'image' or v_msg.status <> 'streaming' then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_kind <> 'image' then
      raise exception 'INVALID_FILE' using errcode = '22023';
    end if;
    insert into public.chat_attachments (org_id, owner_id, conversation_id, message_id, name, kind, mime, size_bytes, sha256, content, width, height, generated)
    values (p_org, p_actor, v_msg.conversation_id, p_message, btrim(p_name), p_kind, p_mime, p_size, p_sha256, p_content, p_width, p_height, true)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Rename, pin, archive or move a conversation into one of the workspace's projects (or out of it). A null leaves that part as it is;
-- p_project_set says whether p_project is meant (null then takes it out of its project).
create function public.app_chat_update(p_org uuid, p_actor uuid, p_conversation uuid, p_title text, p_pinned boolean, p_archived boolean, p_project_set boolean, p_project uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.chat_conversations%rowtype;
begin
  v_conv := private.chat_own(p_org, p_actor, p_conversation);
  if p_title is not null and (char_length(btrim(p_title)) < 1 or char_length(btrim(p_title)) > 120) then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  if coalesce(p_project_set, false) and p_project is not null and not exists (select 1 from public.projects p where p.id = p_project and p.org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.chat_conversations
  set title = case when p_title is null then title else btrim(p_title) end,
      titled = titled or p_title is not null,
      pinned_at = case when p_pinned is null then pinned_at when p_pinned then coalesce(pinned_at, now()) else null end,
      archived_at = case when p_archived is null then archived_at when p_archived then coalesce(archived_at, now()) else null end,
      project_id = case when coalesce(p_project_set, false) then p_project else project_id end
  where id = p_conversation;
end;
$$;

-- The AI's short name for a conversation, after its first answer; never over a name the person gave it.
create function public.app_chat_auto_title(p_org uuid, p_actor uuid, p_conversation uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.chat_conversations%rowtype;
begin
  v_conv := private.chat_own(p_org, p_actor, p_conversation);
  if p_title is null or char_length(btrim(p_title)) < 1 then
    return;
  end if;
  update public.chat_conversations set title = left(btrim(p_title), 120) where id = p_conversation and not titled;
end;
$$;

-- Shows another branch: the message given (a question or answer that has siblings) and the newest messages under it.
create function public.app_chat_set_leaf(p_org uuid, p_actor uuid, p_conversation uuid, p_message uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.chat_conversations%rowtype;
  v_tip uuid;
begin
  v_conv := private.chat_own(p_org, p_actor, p_conversation);
  if not exists (select 1 from public.chat_messages where id = p_message and conversation_id = p_conversation) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  v_tip := private.chat_tip(p_message);
  update public.chat_conversations set leaf_id = v_tip where id = p_conversation;
  return v_tip;
end;
$$;

-- A thumbs up (1), down (-1) or neither (null) on an answer.
create function public.app_chat_rate(p_org uuid, p_actor uuid, p_message uuid, p_rating smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.chat_messages%rowtype;
begin
  perform private.require_contributor(p_org, p_actor);
  select * into v_msg from public.chat_messages where id = p_message and org_id = p_org for update;
  if not found or v_msg.owner_id is distinct from p_actor or v_msg.role <> 'assistant' then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_rating is not null and p_rating not in (-1, 1) then
    raise exception 'INVALID_RATING' using errcode = '22023';
  end if;
  update public.chat_messages set rating = p_rating where id = p_message;
end;
$$;

-- Deletes a conversation with its messages, files and links. Recorded without its words.
create function public.app_chat_delete(p_org uuid, p_actor uuid, p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.chat_conversations%rowtype;
begin
  v_conv := private.chat_own(p_org, p_actor, p_conversation);
  delete from public.chat_conversations where id = p_conversation;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'chat.deleted', p_conversation::text, jsonb_build_object('messages', v_conv.message_count));
end;
$$;

-- A read-only link to the branch showing now. One link per conversation: a new one replaces the last.
create function public.app_chat_share(p_org uuid, p_actor uuid, p_conversation uuid, p_token_sha256 text, p_audience text, p_expires_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.chat_conversations%rowtype;
  v_id uuid;
begin
  v_conv := private.chat_own(p_org, p_actor, p_conversation);
  if v_conv.leaf_id is null then
    raise exception 'NOTHING_TO_SHARE' using errcode = '22023';
  end if;
  if exists (select 1 from public.chat_messages where id = v_conv.leaf_id and status = 'streaming') then
    raise exception 'STILL_ANSWERING' using errcode = '22023';
  end if;
  if p_audience is null or p_audience not in ('workspace', 'anyone') then
    raise exception 'INVALID_AUDIENCE' using errcode = '22023';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '400 days') then
    raise exception 'INVALID_EXPIRY' using errcode = '22023';
  end if;
  if p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN' using errcode = '22023';
  end if;
  update public.chat_share_links set revoked_at = now() where conversation_id = p_conversation and revoked_at is null;
  insert into public.chat_share_links (conversation_id, org_id, owner_id, token_sha256, leaf_id, audience, expires_at)
  values (p_conversation, p_org, p_actor, p_token_sha256, v_conv.leaf_id, p_audience, p_expires_at)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'chat.shared', p_conversation::text, jsonb_build_object('audience', p_audience, 'expires', p_expires_at is not null));
  return v_id;
end;
$$;

create function public.app_chat_unshare(p_org uuid, p_actor uuid, p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.chat_conversations%rowtype;
begin
  v_conv := private.chat_own(p_org, p_actor, p_conversation);
  if exists (select 1 from public.chat_share_links where conversation_id = p_conversation and revoked_at is null) then
    update public.chat_share_links set revoked_at = now() where conversation_id = p_conversation and revoked_at is null;
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (p_org, p_actor, 'chat.unshared', p_conversation::text, '{}'::jsonb);
  end if;
end;
$$;

create function private.chat_link_state(p_token_sha256 text)
returns table (state text, link_id uuid, org_id uuid, conversation_id uuid, leaf_id uuid, audience text, owner_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when l.id is null then 'none'
           when l.revoked_at is not null then 'revoked'
           when l.expires_at is not null and l.expires_at <= now() then 'expired'
           when private.platform_paused('share_links') then 'paused'
           when private.org_suspended(l.org_id) then 'suspended'
           when not exists (select 1 from public.organization_members m where m.org_id = l.org_id and m.user_id = l.owner_id) then 'revoked'
           else 'live'
         end,
         l.id, l.org_id, l.conversation_id, l.leaf_id, l.audience, l.owner_id
  from (select p_token_sha256 as t) x
  left join public.chat_share_links l on l.token_sha256 = x.t;
$$;
revoke all on function private.chat_link_state(text) from public, anon, authenticated;

-- What a link shows: its state, and when live the conversation's title and the shared branch, oldest first, with each message's files
-- (names and sizes only). p_viewer is the signed-in person opening it, or null; a workspace link needs a member of the workspace.
create function public.app_chat_for_share(p_token_sha256 text, p_viewer uuid)
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
           'files', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'mime', a.mime, 'size', a.size_bytes, 'width', a.width, 'height', a.height, 'generated', a.generated) order by a.created_at)
                              from public.chat_attachments a where a.message_id = m.id), '[]'::jsonb)
         ) order by up.depth desc), '[]'::jsonb)
    into v_messages
  from up join public.chat_messages m on m.id = up.id;
  return jsonb_build_object('state', 'live', 'audience', v.audience, 'title', v_title, 'messages', v_messages);
end;
$$;

-- One file of a shared branch, when the link is live and the viewer may open it.
create function public.app_chat_share_file(p_token_sha256 text, p_viewer uuid, p_file uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_file public.chat_attachments%rowtype;
begin
  select * into v from private.chat_link_state(p_token_sha256);
  if v.state <> 'live' then
    return null;
  end if;
  if v.audience = 'workspace' and (p_viewer is null or not exists (select 1 from public.organization_members m where m.org_id = v.org_id and m.user_id = p_viewer)) then
    return null;
  end if;
  select a.* into v_file from public.chat_attachments a where a.id = p_file and a.conversation_id = v.conversation_id;
  if not found then
    return null;
  end if;
  -- Only files of the shared branch, never of another one.
  if not exists (
    with recursive up as (
      select m.id, m.parent_id, 0 as depth from public.chat_messages m where m.id = v.leaf_id
      union all
      select m.id, m.parent_id, up.depth + 1 from public.chat_messages m join up on m.id = up.parent_id where up.depth < 4000
    )
    select 1 from up where up.id = v_file.message_id
  ) then
    return null;
  end if;
  return jsonb_build_object('name', v_file.name, 'mime', v_file.mime, 'kind', v_file.kind, 'content', v_file.content);
end;
$$;

-- The branch the person reads, newest message first walking up, as many as asked (up to 200): with each message's siblings in order
-- (so the screen can show "2 of 3" and switch) and its files' names. Read as the person, so row level security applies.
create function public.chat_path(p_conversation uuid, p_leaf uuid, p_limit integer)
returns table (
  id uuid, parent_id uuid, role text, kind text, content text, status text, model text, error text, rating smallint,
  thinking_ms integer, meta jsonb, created_at timestamptz, updated_at timestamptz, siblings uuid[], files jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive up as (
    select m.id, m.parent_id, 0 as depth
    from public.chat_messages m
    where m.conversation_id = p_conversation
      and m.id = coalesce(p_leaf, (select c.leaf_id from public.chat_conversations c where c.id = p_conversation))
    union all
    select m.id, m.parent_id, up.depth + 1
    from public.chat_messages m join up on m.id = up.parent_id
    where up.depth + 1 < greatest(1, least(coalesce(p_limit, 60), 200))
  )
  select m.id, m.parent_id, m.role, m.kind, m.content, m.status, m.model, m.error, m.rating, m.thinking_ms, m.meta, m.created_at, m.updated_at,
         (select array_agg(s.id order by s.created_at, s.id) from public.chat_messages s where s.conversation_id = p_conversation and s.parent_id is not distinct from m.parent_id),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'mime', a.mime, 'size', a.size_bytes, 'width', a.width, 'height', a.height, 'generated', a.generated) order by a.created_at)
                   from public.chat_attachments a where a.message_id = m.id), '[]'::jsonb)
  from up join public.chat_messages m on m.id = up.id
  order by up.depth desc;
$$;
revoke all on function public.chat_path(uuid, uuid, integer) from public, anon;
grant execute on function public.chat_path(uuid, uuid, integer) to authenticated, service_role;

-- Someone who leaves a workspace (or is removed) takes their conversations with them: nobody else could read them.
create function private.close_chats_of_departed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chat_conversations where org_id = old.org_id and owner_id = old.user_id;
  delete from public.chat_attachments where org_id = old.org_id and owner_id = old.user_id;
  return old;
end;
$$;
revoke all on function private.close_chats_of_departed() from public, anon, authenticated;
create trigger chats_leave_with_member after delete on public.organization_members
  for each row execute function private.close_chats_of_departed();

revoke all on function public.app_chat_start(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_chat_add_user_message(uuid, uuid, uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.app_chat_begin_reply(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.app_chat_write_reply(uuid, uuid, uuid, text, text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.app_chat_reopen_reply(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_chat_save_attachment(uuid, uuid, uuid, text, text, text, integer, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.app_chat_update(uuid, uuid, uuid, text, boolean, boolean, boolean, uuid) from public, anon, authenticated;
revoke all on function public.app_chat_auto_title(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_chat_set_leaf(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_chat_rate(uuid, uuid, uuid, smallint) from public, anon, authenticated;
revoke all on function public.app_chat_delete(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_chat_share(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.app_chat_unshare(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_chat_for_share(text, uuid) from public, anon, authenticated;
revoke all on function public.app_chat_share_file(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_chat_start(uuid, uuid, uuid, text) to service_role;
grant execute on function public.app_chat_add_user_message(uuid, uuid, uuid, uuid, text, uuid[]) to service_role;
grant execute on function public.app_chat_begin_reply(uuid, uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.app_chat_write_reply(uuid, uuid, uuid, text, text, text, text, integer, jsonb) to service_role;
grant execute on function public.app_chat_reopen_reply(uuid, uuid, uuid) to service_role;
grant execute on function public.app_chat_save_attachment(uuid, uuid, uuid, text, text, text, integer, text, text, integer, integer) to service_role;
grant execute on function public.app_chat_update(uuid, uuid, uuid, text, boolean, boolean, boolean, uuid) to service_role;
grant execute on function public.app_chat_auto_title(uuid, uuid, uuid, text) to service_role;
grant execute on function public.app_chat_set_leaf(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.app_chat_rate(uuid, uuid, uuid, smallint) to service_role;
grant execute on function public.app_chat_delete(uuid, uuid, uuid) to service_role;
grant execute on function public.app_chat_share(uuid, uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.app_chat_unshare(uuid, uuid, uuid) to service_role;
grant execute on function public.app_chat_for_share(text, uuid) to service_role;
grant execute on function public.app_chat_share_file(text, uuid, uuid) to service_role;

-- An account's export includes the person's conversations, in workspaces they're still in (ADR 0070).
create or replace function public.app_account_export(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'format', 'farbaek-account-export/v1',
    'exported_at', now(),
    'account', (
      -- Read through to_jsonb so a column Supabase Auth adds or drops never breaks the export.
      select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', to_jsonb(u) -> 'created_at', 'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', to_jsonb(u) -> 'last_sign_in_at')
      from auth.users u where u.id = p_user
    ),
    'email_preferences', coalesce(
      (select jsonb_build_object('work_updates', e.work_updates, 'trial_reminders', e.trial_reminders, 'updated_at', e.updated_at) from public.email_preferences e where e.user_id = p_user),
      jsonb_build_object('work_updates', true, 'trial_reminders', true)
    ),
    'workspaces', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role, 'joined_at', m.created_at) order by m.created_at)
      from public.organization_members m join public.organizations o on o.id = m.org_id
      where m.user_id = p_user
    ), '[]'::jsonb),
    'support_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', t.subject, 'topic', t.topic, 'status', t.status, 'created_at', t.created_at,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object('from', case when sm.from_staff then 'Farbaek' else 'you' end, 'body', sm.body, 'at', sm.created_at) order by sm.created_at)
          from public.support_messages sm where sm.thread_id = t.id and not sm.internal
        ), '[]'::jsonb)
      ) order by t.created_at)
      from public.support_threads t where t.author_id = p_user
    ), '[]'::jsonb),
    'projects_created', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'workspace', o.name, 'created_at', p.created_at, 'archived_at', p.archived_at) order by p.created_at)
      from public.projects p join public.organizations o on o.id = p.org_id
        join public.organization_members mp on mp.org_id = p.org_id and mp.user_id = p_user
      where p.created_by = p_user
    ), '[]'::jsonb),
    'tasks_created', coalesce((
      select jsonb_agg(x.row order by x.at)
      from (
        select jsonb_build_object('title', t.title, 'state', t.state, 'workspace', o.name, 'created_at', t.created_at) as row, t.created_at as at
        from public.tasks t join public.organizations o on o.id = t.org_id
          join public.organization_members mt on mt.org_id = t.org_id and mt.user_id = p_user
        where t.created_by = p_user order by t.created_at desc limit 2000
      ) x
    ), '[]'::jsonb),
    'sites_created', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'workspace', o.name, 'live', s.live_deployment_id is not null, 'created_at', s.created_at) order by s.created_at)
      from public.sites s join public.organizations o on o.id = s.org_id
        join public.organization_members ms on ms.org_id = s.org_id and ms.user_id = p_user
      where s.created_by = p_user
    ), '[]'::jsonb),
    'chats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', c.title, 'workspace', o.name, 'created_at', c.created_at, 'archived_at', c.archived_at,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object('from', case when cm.role = 'user' then 'you' else 'Farbaek' end, 'kind', cm.kind, 'text', cm.content, 'at', cm.created_at) order by cm.created_at)
          from public.chat_messages cm where cm.conversation_id = c.id
        ), '[]'::jsonb)
      ) order by c.created_at)
      from public.chat_conversations c join public.organizations o on o.id = c.org_id
      where c.owner_id = p_user
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(x.row order by x.at)
      from (
        select jsonb_build_object('action', a.action, 'target', a.target, 'workspace', o.name, 'at', a.occurred_at) as row, a.occurred_at as at
        from public.audit_events a left join public.organizations o on o.id = a.org_id
        where a.actor_id = p_user order by a.occurred_at desc limit 5000
      ) x
    ), '[]'::jsonb),
    'ai_use', coalesce((
      select jsonb_agg(x.row order by x.at)
      from (
        select jsonb_build_object('operation', l.operation, 'model', l.model, 'input_tokens', l.input_tokens, 'output_tokens', l.output_tokens, 'status', l.status, 'workspace', o.name, 'at', l.created_at) as row, l.created_at as at
        from public.ai_credit_ledger l join public.organizations o on o.id = l.org_id
        where l.actor_id = p_user order by l.created_at desc limit 10000
      ) x
    ), '[]'::jsonb),
    'trial_fingerprint_kept', exists (
      select 1 from public.trial_claims c, auth.users u
      where u.id = p_user and c.email_hash = private.email_claim(u.email)
    )
  )
  where exists (select 1 from auth.users u where u.id = p_user);
$$;
