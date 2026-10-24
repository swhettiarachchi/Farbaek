-- Farbaek schema v37: people and accounts (ADR 0064).
--
-- Owners and admins change roles and remove people; anyone can leave a
-- workspace; a workspace always keeps an owner. A person can delete their
-- account: workspaces where they're the only member go with it, they leave
-- the others, and anything that would strand a team (the last owner of a
-- workspace with other people) or a paid plan stops it, with the reason.
--
-- One free trial per email address: when a trial starts, a one-way hash of
-- the normalised address (case, +tags, and Gmail's dots ignored) is kept, so
-- deleting an account and signing up again doesn't start another trial.

create table public.trial_claims (
  email_hash  text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  claimed_at  timestamptz not null default now()
);
alter table public.trial_claims enable row level security;
revoke all on public.trial_claims from anon, authenticated;

-- "First.Last+test@GoogleMail.com" and "firstlast@gmail.com" are the same mailbox.
create function private.normalized_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  with e as (select lower(btrim(coalesce(p_email, ''))) as v),
       parts as (select split_part(v, '@', 1) as local, split_part(v, '@', 2) as domain from e),
       clean as (
         select split_part(local, '+', 1) as local,
                case when domain = 'googlemail.com' then 'gmail.com' else domain end as domain
         from parts
       )
  select case when domain = 'gmail.com' then replace(local, '.', '') else local end || '@' || domain from clean;
$$;
revoke all on function private.normalized_email(text) from public;

create function private.email_claim(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(private.normalized_email(p_email), 'UTF8')), 'hex');
$$;
revoke all on function private.email_claim(text) from public;

-- Every trial so far has its claim.
insert into public.trial_claims (email_hash)
select private.email_claim(u.email)
from public.trials t
join auth.users u on u.id = t.started_by
where u.email is not null
on conflict do nothing;

-- Same as v13, except the trial needs an unclaimed email address. The claim
-- comes first, so two sign-ups with variants of one address can't both get one.
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_org uuid;
  v_email text;
  v_trial_started boolean := false;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if not found then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  if char_length(v_name) not between 1 and 80 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  insert into public.organizations (name, created_by) values (v_name, v_uid) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org, v_uid, 'owner');

  if v_email is not null then
    insert into public.trial_claims (email_hash) values (private.email_claim(v_email)) on conflict do nothing;
    if found then
      insert into public.trials (org_id, started_by, started_at, ends_at)
      values (v_org, v_uid, now(), now() + interval '14 days')
      on conflict (started_by) do nothing;
      v_trial_started := found;
    end if;
  end if;

  insert into public.billing_accounts (org_id, state, plan_catalog_version)
  values (v_org, case when v_trial_started then 'trialing' else 'free' end::public.subscription_state, '2026-10-18.1');

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, v_uid, 'organization.created', v_org::text, jsonb_build_object('trial_started', v_trial_started));

  return v_org;
end;
$$;

-- Changes someone's role. Owners set any role; admins move members and
-- viewers between member and viewer. A workspace always keeps an owner.
create function public.app_set_member_role(p_org uuid, p_actor uuid, p_user uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.org_role;
  v_target public.org_role;
begin
  if p_role is null then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select role into v_actor from public.organization_members where org_id = p_org and user_id = p_actor;
  select role into v_target from public.organization_members where org_id = p_org and user_id = p_user;
  if v_actor is null or v_target is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (v_actor = 'owner' or (v_actor = 'admin' and v_target in ('member', 'viewer') and p_role in ('member', 'viewer'))) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_target = p_role then
    return;
  end if;
  if v_target = 'owner' and (select count(*) from public.organization_members where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  update public.organization_members set role = p_role where org_id = p_org and user_id = p_user;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'member.role_changed', p_user::text, jsonb_build_object('from', v_target, 'to', p_role));
end;
$$;

-- Removes someone from a workspace, or lets a person leave one. Owners remove
-- anyone; admins remove members and viewers. A workspace always keeps an
-- owner. The invitation they joined with goes too, so their address doesn't stay.
create function public.app_remove_member(p_org uuid, p_actor uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.org_role;
  v_target public.org_role;
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select role into v_actor from public.organization_members where org_id = p_org and user_id = p_actor;
  select role into v_target from public.organization_members where org_id = p_org and user_id = p_user;
  if v_actor is null or v_target is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_actor <> p_user and not (v_actor = 'owner' or (v_actor = 'admin' and v_target in ('member', 'viewer'))) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_target = 'owner' and (select count(*) from public.organization_members where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  delete from public.organization_members where org_id = p_org and user_id = p_user;
  delete from public.organization_invitations where org_id = p_org and accepted_by = p_user;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, case when p_actor = p_user then 'member.left' else 'member.removed' end, p_user::text, jsonb_build_object('role', v_target));
end;
$$;

-- What deleting an account would do to each of the person's workspaces:
-- deleted (they're its only member), left (others stay on), or blocked
-- (they're its last owner and others are in it, or it has a paid plan).
create function public.app_account_deletion_plan(p_user uuid)
returns table (org_id uuid, org_name text, role public.org_role, members integer, outcome text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, m.role,
    (select count(*) from public.organization_members x where x.org_id = o.id)::integer,
    case
      when (select count(*) from public.organization_members x where x.org_id = o.id) = 1 then
        case when b.state in ('active', 'past_due', 'cancellation_scheduled') then 'blocked_paid' else 'deleted' end
      when m.role = 'owner' and (select count(*) from public.organization_members x where x.org_id = o.id and x.role = 'owner') = 1 then 'blocked_last_owner'
      else 'left'
    end
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  left join public.billing_accounts b on b.org_id = o.id
  where m.user_id = p_user
  order by o.name, o.id;
$$;

-- Deletes the person's workspaces where they're the only member and takes
-- them out of the rest. The server then deletes the sign-in record, which
-- takes their email choices and support requests with it.
create function public.app_delete_account_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_left integer := 0;
  r record;
begin
  perform 1 from public.organizations o
  where o.id in (select m.org_id from public.organization_members m where m.user_id = p_user)
  order by o.id
  for update;
  if exists (select 1 from public.app_account_deletion_plan(p_user) p where p.outcome like 'blocked%') then
    raise exception 'ACCOUNT_DELETION_BLOCKED' using errcode = 'P0001';
  end if;
  for r in select * from public.app_account_deletion_plan(p_user) loop
    if r.outcome = 'deleted' then
      delete from public.organizations where id = r.org_id;
      v_deleted := v_deleted + 1;
    else
      delete from public.organization_members where org_id = r.org_id and user_id = p_user;
      delete from public.organization_invitations where org_id = r.org_id and accepted_by = p_user;
      insert into public.audit_events (org_id, actor_id, action, target, metadata)
      values (r.org_id, p_user, 'member.account_deleted', p_user::text, jsonb_build_object('role', r.role));
      v_left := v_left + 1;
    end if;
  end loop;
  return jsonb_build_object('deleted_workspaces', v_deleted, 'left_workspaces', v_left);
end;
$$;

revoke all on function public.app_set_member_role(uuid, uuid, uuid, public.org_role) from public, anon, authenticated;
revoke all on function public.app_remove_member(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_account_deletion_plan(uuid) from public, anon, authenticated;
revoke all on function public.app_delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.app_set_member_role(uuid, uuid, uuid, public.org_role) to service_role;
grant execute on function public.app_remove_member(uuid, uuid, uuid) to service_role;
grant execute on function public.app_account_deletion_plan(uuid) to service_role;
grant execute on function public.app_delete_account_data(uuid) to service_role;

notify pgrst, 'reload schema';
