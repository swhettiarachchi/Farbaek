-- Farbaek schema v91: share one project (ADR 0188).
--
-- A person can be a guest on one project without joining its workspace.
-- "view" reads everything in that project; "edit" also saves, adds and
-- deletes its files and writes tasks. AI, test spaces, approving, applying,
-- publishing and launching stay with the workspace's members, because every
-- function that does them still asks for a member (require_contributor,
-- lock_project, apply_transitions are unchanged). Guests read through a
-- second, permissive policy on an explicit list of tables; members' own
-- policies are untouched, so a member sees exactly what they saw before.
--
-- A read-only link shows a project's current files to anyone who has it,
-- through service-role functions that check the link again on every call.

-- ------------------------------------------------------------ 1. guests

create table public.project_guests (
  org_id      uuid not null,
  project_id  uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  access      text not null check (access in ('view', 'edit')),
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);
create index project_guests_user_idx on public.project_guests (user_id);
create index project_guests_org_idx on public.project_guests (org_id);

create table public.project_invitations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  project_id    uuid not null,
  email         text not null check (char_length(email) between 3 and 254 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  access        text not null check (access in ('view', 'edit')),
  token_sha256  text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  invited_by    uuid not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  accepted_by   uuid,
  revoked_at    timestamptz,
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);
-- One open invitation per person per project.
create unique index project_invitations_open_idx on public.project_invitations (project_id, email)
  where accepted_at is null and revoked_at is null;
create index project_invitations_org_idx on public.project_invitations (org_id, created_at desc);

create table public.project_share_links (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  project_id      uuid not null,
  token_sha256    text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  -- Null: until someone turns it off.
  expires_at      timestamptz,
  allow_download  boolean not null default false,
  revoked_at      timestamptz,
  revoked_by      uuid,
  last_opened_at  timestamptz,
  check (expires_at is null or expires_at > created_at),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);
create index project_share_links_project_idx on public.project_share_links (project_id, created_at desc);

alter table public.project_guests enable row level security;
alter table public.project_invitations enable row level security;
alter table public.project_share_links enable row level security;
revoke all on public.project_guests, public.project_invitations, public.project_share_links from public, anon, authenticated;

grant select (org_id, project_id, user_id, access, invited_by, created_at, updated_at) on public.project_guests to authenticated;
-- A guest sees their own rows; the workspace's members see who their projects are shared with.
create policy "guests and members read project guests" on public.project_guests
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_member(org_id)));

-- The token hashes are left out of the grants, so browsers can never select them.
grant select (id, org_id, project_id, email, access, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at) on public.project_invitations to authenticated;
create policy "contributors read project invitations" on public.project_invitations
  for select to authenticated using ((select private.has_role(org_id, array['owner', 'admin', 'member']::public.org_role[])));

grant select (id, org_id, project_id, created_by, created_at, expires_at, allow_download, revoked_at, revoked_by, last_opened_at) on public.project_share_links to authenticated;
create policy "contributors read share links" on public.project_share_links
  for select to authenticated using ((select private.has_role(org_id, array['owner', 'admin', 'member']::public.org_role[])));

-- ------------------------------------------------- 2. what a guest reads

-- The projects the signed-in person is a guest on. Security definer, so a
-- policy asks once per query rather than reading project_guests per row.
create function private.guest_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.project_id from public.project_guests g where g.user_id = (select auth.uid());
$$;
revoke all on function private.guest_project_ids() from public, anon, authenticated;
grant execute on function private.guest_project_ids() to authenticated;

-- The explicit list. Anything not here (the workspace itself, launches,
-- watches, Capsules, incidents, AI use, audit events, handoffs, runs, test
-- spaces) stays members-only.
create policy "guests read their projects" on public.projects
  for select to authenticated using (id in (select private.guest_project_ids()));
create policy "guests read their projects' files" on public.project_files
  for select to authenticated using (project_id in (select private.guest_project_ids()));
create policy "guests read their projects' file history" on public.project_file_revisions
  for select to authenticated using (project_id in (select private.guest_project_ids()));
create policy "guests read their projects' tasks" on public.tasks
  for select to authenticated using (project_id in (select private.guest_project_ids()));
create policy "guests read their projects' changes" on public.change_proposals
  for select to authenticated using (project_id in (select private.guest_project_ids()));
create policy "guests read their projects' proof" on public.proofpacks
  for select to authenticated using (project_id in (select private.guest_project_ids()));
create policy "guests read their projects' sites" on public.sites
  for select to authenticated using (project_id in (select private.guest_project_ids()));
create policy "guests read their projects' site versions" on public.site_deployments
  for select to authenticated using (project_id in (select private.guest_project_ids()));
-- Through the parent row.
create policy "guests read their projects' task history" on public.task_transitions
  for select to authenticated using (exists (
    select 1 from public.tasks t where t.id = task_id and t.project_id in (select private.guest_project_ids())));
create policy "guests read their projects' plans" on public.intent_contracts
  for select to authenticated using (exists (
    select 1 from public.tasks t where t.id = task_id and t.project_id in (select private.guest_project_ids())));
create policy "guests read their projects' checks" on public.task_verifications
  for select to authenticated using (exists (
    select 1 from public.tasks t where t.id = task_id and t.project_id in (select private.guest_project_ids())));
create policy "guests read their projects' proof signatures" on public.proofpack_signatures
  for select to authenticated using (exists (
    select 1 from public.proofpacks p where p.digest = proofpack_signatures.digest and p.project_id in (select private.guest_project_ids())));

-- ----------------------------------------------- 3. what an edit guest does

-- A member who may contribute, or an edit guest of this very project.
create function private.require_project_editor(p_org uuid, p_project uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = p_user and m.role in ('owner', 'admin', 'member')
  ) and not exists (
    select 1 from public.project_guests g
    where g.org_id = p_org and g.project_id = p_project and g.user_id = p_user and g.access = 'edit'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if private.org_suspended(p_org) then
    raise exception 'WORKSPACE_SUSPENDED' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.require_project_editor(uuid, uuid, uuid) from public, anon, authenticated;

-- lock_project's twin for file edits only. lock_project itself stays
-- members-only: applying changes, ProofPacks and recovery use it.
create function private.lock_project_for_edit(p_project uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_archived timestamptz;
begin
  select org_id, archived_at into v_org, v_archived from public.projects where id = p_project for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_project_editor(v_org, p_project, p_actor);
  if v_archived is not null then
    raise exception 'PROJECT_ARCHIVED' using errcode = 'P0001';
  end if;
  return v_org;
end;
$$;
revoke all on function private.lock_project_for_edit(uuid, uuid) from public, anon, authenticated;

create or replace function public.app_save_file(
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
  v_org := private.lock_project_for_edit(p_project, p_actor);
  select coalesce((select f.revision from public.project_files f where f.project_id = p_project and f.path = p_path), 0) into v_current;
  if v_current <> p_expected_revision then
    raise exception 'FILE_CHANGED' using errcode = 'P0001';
  end if;

  perform private.put_project_file(p_project, v_org, p_actor, p_path, p_content, 'edit', p_max_file_bytes);
  perform private.check_project_size(p_project, p_max_project_bytes, p_max_files);
  return (select f.revision from public.project_files f where f.project_id = p_project and f.path = p_path);
end;
$$;

create or replace function public.app_save_binary_file(
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
  v_org := private.lock_project_for_edit(p_project, p_actor);
  select coalesce((select f.revision from public.project_files f where f.project_id = p_project and f.path = p_path), 0) into v_current;
  if v_current <> p_expected_revision then
    raise exception 'FILE_CHANGED' using errcode = 'P0001';
  end if;

  perform private.put_project_image(p_project, v_org, p_actor, p_path, p_base64, 'edit', p_max_file_bytes);
  perform private.check_project_size(p_project, p_max_project_bytes, p_max_files);
  return (select f.revision from public.project_files f where f.project_id = p_project and f.path = p_path);
end;
$$;

create or replace function public.app_delete_file(p_project uuid, p_actor uuid, p_path text, p_expected_revision integer)
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
  v_org := private.lock_project_for_edit(p_project, p_actor);
  select f.revision into v_current from public.project_files f where f.project_id = p_project and f.path = p_path;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current <> p_expected_revision then
    raise exception 'FILE_CHANGED' using errcode = 'P0001';
  end if;

  select max(r.revision) + 1 into v_revision from public.project_file_revisions r where r.project_id = p_project and r.path = p_path;
  delete from public.project_files where project_id = p_project and path = p_path;
  insert into public.project_file_revisions (project_id, org_id, path, revision, change, created_by)
  values (p_project, v_org, p_path, v_revision, 'delete', p_actor);

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'project.file_deleted', p_project::text, jsonb_build_object('path', p_path, 'revision', v_revision));
end;
$$;

create or replace function public.app_create_task(p_org uuid, p_actor uuid, p_project uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
begin
  perform private.require_project_editor(p_org, p_project, p_actor);
  if char_length(v_title) not between 1 and 200 then
    raise exception 'INVALID_TITLE' using errcode = '22023';
  end if;
  if not exists (select 1 from public.projects where id = p_project and org_id = p_org and archived_at is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.tasks (org_id, project_id, title, created_by)
  values (p_org, p_project, v_title, p_actor)
  returning id into v_id;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'task.created', v_id::text, jsonb_build_object('project_id', p_project));
  return v_id;
end;
$$;

-- ---------------------------------------- 4. seats, inviting and managing

-- Who may close access: owners, admins, and members who may publish (ADR 0087).
-- Closing is allowed while a workspace is suspended, so a person can always be shut out.
create function private.require_closer(p_org uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.member_may(p_org, p_user, 'publish') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_closer(uuid, uuid) from public, anon, authenticated;

-- Who may open access: the same people, and never while the workspace is suspended.
create function private.require_sharer(p_org uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_closer(p_org, p_user);
  if private.org_suspended(p_org) then
    raise exception 'WORKSPACE_SUSPENDED' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.require_sharer(uuid, uuid) from public, anon, authenticated;

-- Seats: members, open invitations, and edit guests, each person once (by
-- email, or by id for an account without one). View guests are free; a
-- project has at most 10.
create function private.seat_holders(p_org uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct who from (
    select coalesce(lower(u.email), m.user_id::text) as who
      from public.organization_members m left join auth.users u on u.id = m.user_id
     where m.org_id = p_org
    union all
    select i.email from public.organization_invitations i
     where i.org_id = p_org and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    union all
    select coalesce(lower(u.email), g.user_id::text)
      from public.project_guests g left join auth.users u on u.id = g.user_id
     where g.org_id = p_org and g.access = 'edit'
    union all
    select pi.email from public.project_invitations pi
     where pi.org_id = p_org and pi.access = 'edit' and pi.accepted_at is null and pi.revoked_at is null and pi.expires_at > now()
  ) seats;
$$;
revoke all on function private.seat_holders(uuid) from public, anon, authenticated;

create or replace function private.seats_in_use(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from private.seat_holders(p_org);
$$;

-- Whether this address already holds a seat, so asking it in again needs none.
create function private.holds_seat(p_org uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.seat_holders(p_org) s where s = lower(p_email));
$$;
revoke all on function private.holds_seat(uuid, text) from public, anon, authenticated;
revoke all on function private.seats_in_use(uuid) from public, anon, authenticated;

create function private.view_guests_on(p_project uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.project_guests g where g.project_id = p_project and g.access = 'view')::integer
       + (select count(*) from public.project_invitations pi
          where pi.project_id = p_project and pi.access = 'view' and pi.accepted_at is null and pi.revoked_at is null and pi.expires_at > now())::integer;
$$;
revoke all on function private.view_guests_on(uuid) from public, anon, authenticated;

create function public.app_create_project_invitation(
  p_project uuid,
  p_actor uuid,
  p_email text,
  p_access text,
  p_token_sha256 text,
  p_expires_at timestamptz,
  p_seat_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_archived timestamptz;
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  select org_id, archived_at into v_org, v_archived from public.projects where id = p_project;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Serialize seat checks for this workspace.
  perform 1 from public.organizations where id = v_org for update;
  perform private.require_sharer(v_org, p_actor);
  if v_archived is not null then
    raise exception 'PROJECT_ARCHIVED' using errcode = 'P0001';
  end if;
  if p_access not in ('view', 'edit') then
    raise exception 'INVALID_INVITATION' using errcode = '22023';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'INVALID_INVITATION' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_members m join auth.users u on u.id = m.user_id
    where m.org_id = v_org and lower(u.email) = v_email
  ) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.project_guests g join auth.users u on u.id = g.user_id
    where g.project_id = p_project and lower(u.email) = v_email
  ) then
    raise exception 'ALREADY_GUEST' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.project_invitations pi
    where pi.project_id = p_project and pi.email = v_email and pi.accepted_at is null and pi.revoked_at is null and pi.expires_at > now()
  ) then
    raise exception 'ALREADY_INVITED' using errcode = '23505';
  end if;
  -- An expired invitation for the same person is closed so a new one can be sent.
  update public.project_invitations set revoked_at = now()
  where project_id = p_project and email = v_email and accepted_at is null and revoked_at is null and expires_at <= now();
  if p_access = 'view' and private.view_guests_on(p_project) >= 10 then
    raise exception 'GUEST_LIMIT' using errcode = 'P0001';
  end if;
  if p_access = 'edit' and p_seat_limit is not null and private.seats_in_use(v_org) >= p_seat_limit and not private.holds_seat(v_org, v_email) then
    raise exception 'SEAT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.project_invitations (org_id, project_id, email, access, token_sha256, invited_by, expires_at)
  values (v_org, p_project, v_email, p_access, p_token_sha256, p_actor, p_expires_at)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'project_invitation.created', v_id::text, jsonb_build_object('project_id', p_project, 'access', p_access, 'expires_at', p_expires_at));
  return v_id;
end;
$$;

create function public.app_revoke_project_invitation(p_invitation uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.project_invitations%rowtype;
begin
  select * into v_inv from public.project_invitations where id = p_invitation for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_closer(v_inv.org_id, p_actor);
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    raise exception 'INVITATION_CLOSED' using errcode = '22023';
  end if;
  update public.project_invitations set revoked_at = now() where id = p_invitation;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_inv.org_id, p_actor, 'project_invitation.revoked', p_invitation::text, jsonb_build_object('project_id', v_inv.project_id));
end;
$$;

-- What the invitation page shows before accepting. Only for the hash of a real token.
create function public.app_project_invitation_preview(p_token_sha256 text)
returns table (org_id uuid, org_name text, project_id uuid, project_name text, access text, email text, expires_at timestamptz, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, p.id, p.name, i.access, i.email, i.expires_at,
         case when i.accepted_at is not null then 'accepted'
              when i.revoked_at is not null then 'revoked'
              when i.expires_at <= now() then 'expired'
              when p.archived_at is not null then 'revoked'
              else 'open' end
  from public.project_invitations i
  join public.projects p on p.id = i.project_id
  join public.organizations o on o.id = i.org_id
  where i.token_sha256 = p_token_sha256;
$$;

create function public.app_accept_project_invitation(p_token_sha256 text, p_actor uuid, p_seat_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.project_invitations%rowtype;
  v_email text;
begin
  select * into v_inv from public.project_invitations where token_sha256 = p_token_sha256 for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform 1 from public.organizations where id = v_inv.org_id for update;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now()
     or exists (select 1 from public.projects where id = v_inv.project_id and archived_at is not null) then
    raise exception 'INVITATION_CLOSED' using errcode = '22023';
  end if;
  -- No one new comes in while Farbaek has the workspace suspended.
  if private.org_suspended(v_inv.org_id) then
    raise exception 'WORKSPACE_SUSPENDED' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from auth.users where id = p_actor and email_confirmed_at is not null;
  if v_email is null or v_email <> v_inv.email then
    raise exception 'WRONG_ACCOUNT' using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members where org_id = v_inv.org_id and user_id = p_actor) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;
  if exists (select 1 from public.project_guests where project_id = v_inv.project_id and user_id = p_actor) then
    raise exception 'ALREADY_GUEST' using errcode = '23505';
  end if;
  -- This invitation already holds its seat, so the count includes it.
  if v_inv.access = 'edit' and p_seat_limit is not null and private.seats_in_use(v_inv.org_id) > p_seat_limit then
    raise exception 'SEAT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.project_guests (org_id, project_id, user_id, access, invited_by)
  values (v_inv.org_id, v_inv.project_id, p_actor, v_inv.access, v_inv.invited_by);
  update public.project_invitations set accepted_at = now(), accepted_by = p_actor where id = v_inv.id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_inv.org_id, p_actor, 'project_invitation.accepted', v_inv.id::text, jsonb_build_object('project_id', v_inv.project_id, 'access', v_inv.access));
  return v_inv.project_id;
end;
$$;

create function public.app_set_project_guest_access(p_project uuid, p_actor uuid, p_user uuid, p_access text, p_seat_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_was text;
begin
  select org_id into v_org from public.projects where id = p_project;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform 1 from public.organizations where id = v_org for update;
  -- Lowering access is closing it, so it works in a suspended workspace; raising it does not.
  if p_access = 'edit' then
    perform private.require_sharer(v_org, p_actor);
  else
    perform private.require_closer(v_org, p_actor);
  end if;
  if p_access not in ('view', 'edit') then
    raise exception 'INVALID_INVITATION' using errcode = '22023';
  end if;
  select access into v_was from public.project_guests where project_id = p_project and user_id = p_user for update;
  if v_was is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_was = p_access then
    return;
  end if;
  -- Moving an editor to view is never refused for the viewer limit: it only takes access away.
  if p_access = 'edit' and p_seat_limit is not null and private.seats_in_use(v_org) >= p_seat_limit
     and not private.holds_seat(v_org, coalesce((select u.email from auth.users u where u.id = p_user), p_user::text)) then
    raise exception 'SEAT_LIMIT' using errcode = 'P0001';
  end if;
  update public.project_guests set access = p_access, updated_at = now() where project_id = p_project and user_id = p_user;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'project_guest.changed', p_user::text, jsonb_build_object('project_id', p_project, 'from', v_was, 'to', p_access));
end;
$$;

-- A sharer removes a guest, or a guest leaves.
create function public.app_remove_project_guest(p_project uuid, p_actor uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_access text;
begin
  select org_id into v_org from public.projects where id = p_project;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_actor <> p_user then
    perform private.require_closer(v_org, p_actor);
  end if;
  delete from public.project_guests where project_id = p_project and user_id = p_user returning access into v_access;
  if v_access is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, case when p_actor = p_user then 'project_guest.left' else 'project_guest.removed' end, p_user::text,
          jsonb_build_object('project_id', p_project, 'access', v_access));
end;
$$;

-- Who a project is shared with, for the Share sheet. Any member reads it;
-- only sharers change it.
create function public.app_project_sharing(p_project uuid, p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project;
  if not found or not exists (select 1 from public.organization_members m where m.org_id = v_org and m.user_id = p_actor) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'can_share', private.member_may(v_org, p_actor, 'publish'),
    'guests', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', g.user_id, 'email', u.email, 'access', g.access, 'since', g.created_at) order by g.created_at)
      from public.project_guests g join auth.users u on u.id = g.user_id
      where g.project_id = p_project
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'access', i.access, 'expires_at', i.expires_at) order by i.created_at)
      from public.project_invitations i
      where i.project_id = p_project and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'created_at', l.created_at, 'expires_at', l.expires_at, 'allow_download', l.allow_download, 'last_opened_at', l.last_opened_at) order by l.created_at desc)
      from public.project_share_links l
      where l.project_id = p_project and l.revoked_at is null and (l.expires_at is null or l.expires_at > now())
    ), '[]'::jsonb)
  );
end;
$$;

-- The projects shared with a person, with their workspace's name: a guest
-- can't read the workspace itself.
create function public.app_shared_with_me(p_user uuid)
returns table (project_id uuid, project_name text, project_description text, org_id uuid, org_name text, access text, since timestamptz, archived boolean, suspended boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.description, o.id, o.name, g.access, g.created_at, p.archived_at is not null, private.org_suspended(o.id)
  from public.project_guests g
  join public.projects p on p.id = g.project_id
  join public.organizations o on o.id = g.org_id
  where g.user_id = p_user
  order by g.created_at desc;
$$;

-- -------------------------------------------------- 5. read-only links

alter table public.platform_flags drop constraint platform_flags_key_check;
alter table public.platform_flags add constraint platform_flags_key_check
  check (key in ('ai_runs', 'sandboxes', 'publishing', 'serve_published_sites', 'new_workspaces', 'share_links'));
insert into public.platform_flags (key) values ('share_links') on conflict do nothing;

create function public.app_create_share_link(p_project uuid, p_actor uuid, p_token_sha256 text, p_expires_at timestamptz, p_allow_download boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_archived timestamptz;
  v_id uuid;
begin
  select org_id, archived_at into v_org, v_archived from public.projects where id = p_project for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_sharer(v_org, p_actor);
  if v_archived is not null then
    raise exception 'PROJECT_ARCHIVED' using errcode = 'P0001';
  end if;
  if private.platform_paused('share_links') then
    raise exception 'PAUSED_BY_FARBAEK:share_links' using errcode = 'P0001';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '31 days') then
    raise exception 'INVALID_LINK' using errcode = '22023';
  end if;
  if (select count(*) from public.project_share_links l
      where l.project_id = p_project and l.revoked_at is null and (l.expires_at is null or l.expires_at > now())) >= 5 then
    raise exception 'LINK_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.project_share_links (org_id, project_id, token_sha256, created_by, expires_at, allow_download)
  values (v_org, p_project, p_token_sha256, p_actor, p_expires_at, coalesce(p_allow_download, false))
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, p_actor, 'share_link.created', v_id::text, jsonb_build_object('project_id', p_project, 'expires_at', p_expires_at, 'allow_download', coalesce(p_allow_download, false)));
  return v_id;
end;
$$;

create function public.app_revoke_share_link(p_link uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.project_share_links%rowtype;
begin
  select * into v_link from public.project_share_links where id = p_link for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Turning a link off is always allowed to a sharer, even in a suspended workspace.
  if not private.member_may(v_link.org_id, p_actor, 'publish') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_link.revoked_at is not null then
    return;
  end if;
  update public.project_share_links set revoked_at = now(), revoked_by = p_actor where id = p_link;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_link.org_id, p_actor, 'share_link.revoked', p_link::text, jsonb_build_object('project_id', v_link.project_id));
end;
$$;

-- The state of a link, and only when it's live, its project's current
-- files (no contents, no history). Checked again on every call.
create function private.share_link_state(p_token_sha256 text)
returns table (state text, link_id uuid, org_id uuid, project_id uuid)
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
           when p.archived_at is not null then 'archived'
           when private.org_suspended(l.org_id) then 'suspended'
           when exists (select 1 from public.sites s where s.project_id = l.project_id and s.blocked_at is not null) then 'blocked'
           else 'live'
         end,
         l.id, l.org_id, l.project_id
  from (select p_token_sha256 as t) x
  left join public.project_share_links l on l.token_sha256 = x.t
  left join public.projects p on p.id = l.project_id;
$$;
revoke all on function private.share_link_state(text) from public, anon, authenticated;

create function public.app_project_for_share(p_token_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select * into v from private.share_link_state(p_token_sha256);
  if v.state <> 'live' then
    return jsonb_build_object('state', v.state);
  end if;
  -- When it was last opened, at most once every five minutes.
  update public.project_share_links set last_opened_at = now()
  where id = v.link_id and (last_opened_at is null or last_opened_at < now() - interval '5 minutes');
  return jsonb_build_object(
    'state', 'live',
    'project', (select jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description) from public.projects p where p.id = v.project_id),
    'allow_download', (select l.allow_download from public.project_share_links l where l.id = v.link_id),
    'expires_at', (select l.expires_at from public.project_share_links l where l.id = v.link_id),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object('path', f.path, 'size_bytes', f.size_bytes, 'encoding', f.encoding, 'updated_at', f.updated_at) order by f.path)
      from public.project_files f where f.project_id = v.project_id
    ), '[]'::jsonb),
    'site', (
      select jsonb_build_object('name', s.name)
      from public.sites s where s.project_id = v.project_id and s.live_deployment_id is not null and s.blocked_at is null
    ),
    -- The same rule publishing uses: the latest applied change passed its checks and no file changed since.
    'verified', coalesce((select e.status from private.launch_evidence(v.project_id) e) = 'verified', false)
  );
end;
$$;

-- One current file's content through a live link. No revision parameter:
-- old revisions can hold deleted files and content newer screening catches.
create function public.app_share_file(p_token_sha256 text, p_path text)
returns table (path text, content text, encoding text, size_bytes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select f.path, r.content, r.encoding, f.size_bytes
  from private.share_link_state(p_token_sha256) s
  join public.project_files f on f.project_id = s.project_id and f.path = p_path
  join public.project_file_revisions r on r.project_id = f.project_id and r.path = f.path and r.revision = f.revision
  where s.state = 'live';
$$;

-- Every current file of a live link at once, for its download: one check of
-- the link and one read, so a link turned off midway never gives half a project.
create function public.app_share_files(p_token_sha256 text)
returns table (path text, content text, encoding text, size_bytes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select f.path, r.content, r.encoding, f.size_bytes
  from private.share_link_state(p_token_sha256) s
  join public.project_share_links l on l.id = s.link_id and l.allow_download
  join public.project_files f on f.project_id = s.project_id
  join public.project_file_revisions r on r.project_id = f.project_id and r.path = f.path and r.revision = f.revision
  where s.state = 'live'
  order by f.path;
$$;

-- -------------------------------------------- 6. leaving and accounts

-- A member who leaves, is removed, or may no longer share (a lower role, or
-- publishing withheld): the links and open invitations they made close.
create function private.close_sharing_of_departed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and private.member_may(new.org_id, new.user_id, 'publish') then
    return new;
  end if;
  update public.project_share_links set revoked_at = now(), revoked_by = old.user_id
  where org_id = old.org_id and created_by = old.user_id and revoked_at is null;
  update public.project_invitations set revoked_at = now()
  where org_id = old.org_id and invited_by = old.user_id and accepted_at is null and revoked_at is null;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.close_sharing_of_departed() from public, anon, authenticated;
create trigger close_sharing_of_departed after delete on public.organization_members
  for each row execute function private.close_sharing_of_departed();
create trigger close_sharing_of_demoted after update of role, permissions on public.organization_members
  for each row execute function private.close_sharing_of_departed();

-- A member is never also a guest in the same workspace: joining makes the guest rows redundant.
create function private.drop_guest_rows_on_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.project_guests where org_id = new.org_id and user_id = new.user_id;
  return new;
end;
$$;
revoke all on function private.drop_guest_rows_on_join() from public, anon, authenticated;
create trigger drop_guest_rows_on_join after insert on public.organization_members
  for each row execute function private.drop_guest_rows_on_join();

-- The account export also lists the projects shared with the person.
create function public.app_account_shared_projects(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('project', p.name, 'workspace', o.name, 'access', g.access, 'since', g.created_at) order by g.created_at), '[]'::jsonb)
  from public.project_guests g
  join public.projects p on p.id = g.project_id
  join public.organizations o on o.id = g.org_id
  where g.user_id = p_user;
$$;

-- --------------------------------------------------------- 7. grants

revoke all on function public.app_create_project_invitation(uuid, uuid, text, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.app_revoke_project_invitation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_project_invitation_preview(text) from public, anon, authenticated;
revoke all on function public.app_accept_project_invitation(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.app_set_project_guest_access(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.app_remove_project_guest(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_project_sharing(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_shared_with_me(uuid) from public, anon, authenticated;
revoke all on function public.app_create_share_link(uuid, uuid, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.app_revoke_share_link(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_project_for_share(text) from public, anon, authenticated;
revoke all on function public.app_share_file(text, text) from public, anon, authenticated;
revoke all on function public.app_share_files(text) from public, anon, authenticated;
revoke all on function public.app_account_shared_projects(uuid) from public, anon, authenticated;
grant execute on function public.app_create_project_invitation(uuid, uuid, text, text, text, timestamptz, integer) to service_role;
grant execute on function public.app_revoke_project_invitation(uuid, uuid) to service_role;
grant execute on function public.app_project_invitation_preview(text) to service_role;
grant execute on function public.app_accept_project_invitation(text, uuid, integer) to service_role;
grant execute on function public.app_set_project_guest_access(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.app_remove_project_guest(uuid, uuid, uuid) to service_role;
grant execute on function public.app_project_sharing(uuid, uuid) to service_role;
grant execute on function public.app_shared_with_me(uuid) to service_role;
grant execute on function public.app_create_share_link(uuid, uuid, text, timestamptz, boolean) to service_role;
grant execute on function public.app_revoke_share_link(uuid, uuid) to service_role;
grant execute on function public.app_project_for_share(text) to service_role;
grant execute on function public.app_share_file(text, text) to service_role;
grant execute on function public.app_share_files(text) to service_role;
grant execute on function public.app_account_shared_projects(uuid) to service_role;
grant select, insert, update, delete on public.project_guests, public.project_invitations, public.project_share_links to service_role;

notify pgrst, 'reload schema';
