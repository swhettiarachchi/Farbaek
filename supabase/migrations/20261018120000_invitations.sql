-- Farbaek schema v13: invitations to a workspace.
--
-- Owners and admins invite someone by email and role. Farbaek stores only
-- the SHA-256 of the invitation's random token: the link itself is shown
-- once to the person who created it (there's no email provider yet), so a
-- copy of the database can't be turned into working links.
--
-- An invitation works once, for 7 days, only for a signed-in person whose
-- confirmed email is the invited one, and only while the workspace has a
-- free seat (members plus pending invitations, checked under a lock).
-- Owners invite admins, members or viewers; admins invite members or
-- viewers. Nobody is invited as owner.

create table public.organization_invitations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  email         text not null check (char_length(email) between 3 and 254 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role          public.org_role not null check (role <> 'owner'),
  token_sha256  text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  invited_by    uuid not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  accepted_by   uuid,
  revoked_at    timestamptz,
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);
-- One open invitation per person per workspace.
create unique index organization_invitations_open_idx on public.organization_invitations (org_id, email)
  where accepted_at is null and revoked_at is null;
create index organization_invitations_org_idx on public.organization_invitations (org_id, created_at desc);

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from anon, authenticated;
-- Owners and admins see their workspace's invitations. The token hash is left out of the grant, so browsers can never select it.
grant select (id, org_id, email, role, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at) on public.organization_invitations to authenticated;
create policy "managers read invitations" on public.organization_invitations
  for select to authenticated using ((select private.has_role(org_id, array['owner', 'admin']::public.org_role[])));

-- Seats in use: members plus invitations still open.
create function private.seats_in_use(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.organization_members m where m.org_id = p_org)::integer
       + (select count(*) from public.organization_invitations i
          where i.org_id = p_org and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())::integer;
$$;
revoke all on function private.seats_in_use(uuid) from public;

create function public.app_create_invitation(
  p_org uuid,
  p_actor uuid,
  p_email text,
  p_role public.org_role,
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
  v_role public.org_role;
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  -- Serialize seat checks for this workspace.
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select role into v_role from public.organization_members where org_id = p_org and user_id = p_actor;
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_role = 'owner' or (p_role = 'admin' and v_role <> 'owner') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'INVALID_INVITATION' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_members m join auth.users u on u.id = m.user_id
    where m.org_id = p_org and lower(u.email) = v_email
  ) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.organization_invitations i
    where i.org_id = p_org and i.email = v_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  ) then
    raise exception 'ALREADY_INVITED' using errcode = '23505';
  end if;
  -- An expired invitation for the same person is closed so a new one can be sent.
  update public.organization_invitations set revoked_at = now()
  where org_id = p_org and email = v_email and accepted_at is null and revoked_at is null and expires_at <= now();
  if p_seat_limit is not null and private.seats_in_use(p_org) >= p_seat_limit then
    raise exception 'SEAT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.organization_invitations (org_id, email, role, token_sha256, invited_by, expires_at)
  values (p_org, v_email, p_role, p_token_sha256, p_actor, p_expires_at)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'invitation.created', v_id::text, jsonb_build_object('role', p_role, 'expires_at', p_expires_at));
  return v_id;
end;
$$;

create function public.app_revoke_invitation(p_invitation uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organization_invitations%rowtype;
begin
  select * into v_inv from public.organization_invitations where id = p_invitation for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.organization_members where org_id = v_inv.org_id and user_id = p_actor and role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    raise exception 'INVITATION_CLOSED' using errcode = '22023';
  end if;
  update public.organization_invitations set revoked_at = now() where id = p_invitation;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_inv.org_id, p_actor, 'invitation.revoked', p_invitation::text, '{}'::jsonb);
end;
$$;

-- What the invitation page shows before accepting. Only for the hash of a real token.
create function public.app_invitation_preview(p_token_sha256 text)
returns table (org_id uuid, org_name text, role public.org_role, email text, expires_at timestamptz, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, i.role, i.email, i.expires_at,
         case when i.accepted_at is not null then 'accepted'
              when i.revoked_at is not null then 'revoked'
              when i.expires_at <= now() then 'expired'
              else 'open' end
  from public.organization_invitations i
  join public.organizations o on o.id = i.org_id
  where i.token_sha256 = p_token_sha256;
$$;

create function public.app_accept_invitation(p_token_sha256 text, p_actor uuid, p_seat_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organization_invitations%rowtype;
  v_email text;
begin
  select * into v_inv from public.organization_invitations where token_sha256 = p_token_sha256 for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform 1 from public.organizations where id = v_inv.org_id for update;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'INVITATION_CLOSED' using errcode = '22023';
  end if;
  select lower(email) into v_email from auth.users where id = p_actor and email_confirmed_at is not null;
  if v_email is null or v_email <> v_inv.email then
    raise exception 'WRONG_ACCOUNT' using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members where org_id = v_inv.org_id and user_id = p_actor) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;
  -- This invitation already holds a seat, so the count includes it.
  if p_seat_limit is not null and private.seats_in_use(v_inv.org_id) > p_seat_limit then
    raise exception 'SEAT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.organization_members (org_id, user_id, role) values (v_inv.org_id, p_actor, v_inv.role);
  update public.organization_invitations set accepted_at = now(), accepted_by = p_actor where id = v_inv.id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_inv.org_id, p_actor, 'invitation.accepted', v_inv.id::text, jsonb_build_object('role', v_inv.role));
  return v_inv.org_id;
end;
$$;

revoke all on function public.app_create_invitation(uuid, uuid, text, public.org_role, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.app_revoke_invitation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_invitation_preview(text) from public, anon, authenticated;
revoke all on function public.app_accept_invitation(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.app_create_invitation(uuid, uuid, text, public.org_role, text, timestamptz, integer) to service_role;
grant execute on function public.app_revoke_invitation(uuid, uuid) to service_role;
grant execute on function public.app_invitation_preview(text) to service_role;
grant execute on function public.app_accept_invitation(text, uuid, integer) to service_role;
