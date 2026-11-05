-- v88: what two security audits found (ADR 0175).
--
-- Each function here is its previous definition with only the named change, so what isn't mentioned hasn't changed.
-- Rule sets whose hash is their version aren't touched, so no rules version changes.

-- 1. A test space Farbaek keeps for checking a change. Only one of these can produce proof, and nobody can write
-- to it or run commands in it. Set before a sandbox exists, so there's no moment when someone could touch it first.
alter table public.sandbox_sessions
  add column purpose text not null default 'person' check (purpose in ('person', 'verification'));

create function public.app_reserve_sandbox_for_verification(p_session uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sandbox_sessions
     set purpose = 'verification'
   where id = p_session and created_by = p_actor and state = 'requested' and provider_sandbox_id is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.app_reserve_sandbox_for_verification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_reserve_sandbox_for_verification(uuid, uuid) to service_role;

-- 2. A handoff only goes to a computer the person paired themselves: it runs the project's code there.
create or replace function public.app_request_handoff(p_org uuid, p_actor uuid, p_task uuid, p_agent uuid, p_proposal uuid, p_checks jsonb, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sha text := null;
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.tasks where id = p_task and org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.agents where id = p_agent and org_id = p_org and paired_by = p_actor and revoked_at is null) then
    raise exception 'AGENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.valid_handoff_checks(p_checks) or (p_note is not null and char_length(p_note) not between 1 and 500) then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if p_proposal is not null then
    select sha256 into v_sha from public.change_proposals where id = p_proposal and task_id = p_task and org_id = p_org and status = 'pending';
    if v_sha is null then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;
  end if;
  perform private.expire_agent_handoffs(p_org);
  if exists (select 1 from public.agent_handoffs where task_id = p_task and agent_id = p_agent and status in ('waiting', 'opened')) then
    raise exception 'HANDOFF_OPEN' using errcode = 'P0001';
  end if;
  insert into public.agent_handoffs (org_id, task_id, agent_id, proposal_id, proposal_sha256, requested_by, note, checks)
  values (p_org, p_task, p_agent, p_proposal, v_sha, p_actor, nullif(p_note, ''), p_checks)
  returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'handoff.requested', p_task::text, jsonb_build_object('handoff', v_id, 'agent', p_agent));
  return v_id;
end;
$$;

-- Anything waiting for someone else's computer is withdrawn, not run.
update public.agent_handoffs h
   set status = 'cancelled', finished_at = now()
  from public.agents a
 where a.id = h.agent_id and h.status in ('waiting', 'opened') and h.requested_by <> a.paired_by;

-- 3. An agent's session says whether the workspace is paused or suspended, and whether its person may run agents.
drop function public.app_agent_session(text);
create function public.app_agent_session(p_token_sha256 text)
returns table (
  agent_id uuid,
  org_id uuid,
  user_id uuid,
  role public.org_role,
  name text,
  lease_expires_at timestamptz,
  lease_projects uuid[],
  lease_capabilities text[],
  lease_actions_per_hour integer,
  agents_paused boolean,
  org_suspended boolean,
  may_run_agents boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
begin
  select * into v_agent from public.agents a where a.token_sha256 = p_token_sha256;
  if not found or v_agent.revoked_at is not null then
    return;
  end if;
  update public.agents a set last_seen_at = now()
  where a.id = v_agent.id and (a.last_seen_at is null or a.last_seen_at < now() - interval '1 minute');
  return query
    select v_agent.id, v_agent.org_id, v_agent.paired_by,
           (select m.role from public.organization_members m where m.org_id = v_agent.org_id and m.user_id = v_agent.paired_by),
           v_agent.name, v_agent.lease_expires_at, v_agent.lease_projects, v_agent.lease_capabilities, v_agent.lease_actions_per_hour,
           coalesce((select o.agents_paused_at is not null from public.organizations o where o.id = v_agent.org_id), false),
           private.org_suspended(v_agent.org_id),
           private.member_may(v_agent.org_id, v_agent.paired_by, 'run_agents');
end;
$$;
revoke all on function public.app_agent_session(text) from public, anon, authenticated;
grant execute on function public.app_agent_session(text) to service_role;

-- 4. A site's domains need the publish permission, and a domain can only be held by proving it.
alter table public.site_domains drop constraint site_domains_hostname_key;
create unique index site_domains_verified_hostname on public.site_domains (hostname) where status = 'verified';
create unique index site_domains_site_hostname on public.site_domains (site_id, hostname);

create or replace function public.app_add_site_domain(p_site uuid, p_actor uuid, p_hostname text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site record;
  v_id uuid;
begin
  select s.id, s.org_id, s.blocked_at into v_site from public.sites s where s.id = p_site for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_site.org_id, p_actor);
  perform private.require_permission(v_site.org_id, p_actor, 'publish');
  if v_site.blocked_at is not null then
    raise exception 'SITE_BLOCKED' using errcode = '42501';
  end if;
  if (select count(*) from public.site_domains where site_id = p_site) >= 2 then
    raise exception 'DOMAIN_LIMIT' using errcode = '54000';
  end if;
  -- Nobody holds a domain by only asking for it: a request lasts a week, and only proof keeps it.
  delete from public.site_domains where hostname = p_hostname and status = 'pending' and coalesce(checked_at, created_at) < now() - interval '7 days';
  if exists (select 1 from public.site_domains where hostname = p_hostname and (status = 'verified' or site_id = p_site)) then
    raise exception 'DOMAIN_TAKEN' using errcode = '23505';
  end if;
  begin
    insert into public.site_domains (org_id, site_id, hostname, verify_token, created_by)
    values (v_site.org_id, p_site, p_hostname, p_token, p_actor)
    returning id into v_id;
  exception when check_violation then
    raise exception 'INVALID_DOMAIN' using errcode = '22023';
  end;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_site.org_id, p_actor, 'site.domain_added', p_site::text, jsonb_build_object('hostname', p_hostname));
  return v_id;
end;
$$;

create or replace function public.app_remove_site_domain(p_domain uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.site_domains%rowtype;
begin
  select * into v_d from public.site_domains where id = p_domain for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_d.org_id, p_actor);
  perform private.require_permission(v_d.org_id, p_actor, 'publish');
  delete from public.site_domains where id = p_domain;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_d.org_id, p_actor, 'site.domain_removed', v_d.site_id::text, jsonb_build_object('hostname', v_d.hostname));
end;
$$;

create or replace function public.app_mark_site_domain(p_domain uuid, p_actor uuid, p_verified boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.site_domains%rowtype;
  v_status text := case when p_verified then 'verified' else 'pending' end;
begin
  select * into v_d from public.site_domains where id = p_domain for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_d.org_id, p_actor);
  perform private.require_permission(v_d.org_id, p_actor, 'publish');
  -- Whoever proves it first holds it, and anyone else's request for it ends there.
  if p_verified then
    if exists (select 1 from public.site_domains where hostname = v_d.hostname and status = 'verified' and id <> p_domain) then
      raise exception 'DOMAIN_TAKEN' using errcode = '23505';
    end if;
    delete from public.site_domains where hostname = v_d.hostname and status = 'pending' and id <> p_domain;
  end if;
  update public.site_domains
     set status = v_status,
         verified_at = case when p_verified then coalesce(verified_at, now()) else null end,
         checked_at = now()
   where id = p_domain;
  if v_status is distinct from v_d.status then
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v_d.org_id, p_actor, case when p_verified then 'site.domain_verified' else 'site.domain_unverified' end, v_d.site_id::text, jsonb_build_object('hostname', v_d.hostname));
  end if;
  return v_status;
end;
$$;

-- 5. Deleting an account can't erase a workspace under review, or free its site's name.
create or replace function public.app_account_deletion_plan(p_user uuid)
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
        case
          when b.state in ('active', 'past_due', 'cancellation_scheduled') then 'blocked_paid'
          when o.suspended_at is not null or exists (select 1 from public.sites s where s.org_id = o.id and s.blocked_at is not null) then 'blocked_review'
          else 'deleted'
        end
      when m.role = 'owner' and (select count(*) from public.organization_members x where x.org_id = o.id and x.role = 'owner') = 1 then 'blocked_last_owner'
      else 'left'
    end
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  left join public.billing_accounts b on b.org_id = o.id
  where m.user_id = p_user
  order by o.name, o.id;
$$;

-- 6. Someone who leaves a workspace takes their access with them: their computers stop, and their open invitations end.
create or replace function public.app_remove_member(p_org uuid, p_actor uuid, p_user uuid)
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
  delete from public.organization_invitations where org_id = p_org and invited_by = p_user and accepted_at is null;
  update public.agents set revoked_at = now(), revoked_by = p_actor where org_id = p_org and paired_by = p_user and revoked_at is null;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, case when p_actor = p_user then 'member.left' else 'member.removed' end, p_user::text, jsonb_build_object('role', v_target));
end;
$$;

create or replace function public.app_agent_lease_set(
  p_agent uuid,
  p_actor uuid,
  p_days integer,
  p_projects uuid[],
  p_capabilities text[],
  p_actions_per_hour integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
  v_expires timestamptz;
  v_projects uuid[];
begin
  select * into v_agent from public.agents a where a.id = p_agent for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.org_id = v_agent.org_id and m.user_id = p_actor and (m.role in ('owner', 'admin') or p_actor = v_agent.paired_by)
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_agent.revoked_at is not null then
    raise exception 'AGENT_REVOKED' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'INVALID_LEASE: a lease lasts 1 to 90 days' using errcode = '22023';
  end if;
  if p_capabilities is null or cardinality(p_capabilities) = 0 or not (p_capabilities <@ array['read', 'propose', 'model', 'mesh']::text[]) then
    raise exception 'INVALID_LEASE: unknown capability' using errcode = '22023';
  end if;
  if p_actions_per_hour is null or p_actions_per_hour < 10 or p_actions_per_hour > 5000 then
    raise exception 'INVALID_LEASE: 10 to 5000 requests an hour' using errcode = '22023';
  end if;
  if p_projects is not null then
    select array_agg(distinct x) into v_projects from unnest(p_projects) as x;
    if v_projects is null or cardinality(v_projects) > 100 or exists (
      select 1 from unnest(v_projects) as x where not exists (select 1 from public.projects p where p.id = x and p.org_id = v_agent.org_id)
    ) then
      raise exception 'INVALID_LEASE: a project isn''t in this workspace' using errcode = '22023';
    end if;
  end if;

  v_expires := now() + make_interval(days => p_days);
  update public.agents a
     set lease_expires_at = v_expires,
         lease_projects = v_projects,
         lease_capabilities = (select array_agg(distinct c order by c) from unnest(p_capabilities) as c),
         lease_actions_per_hour = p_actions_per_hour,
         lease_set_at = now(),
         lease_set_by = p_actor
   where a.id = p_agent;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_agent.org_id, p_actor, 'agent.lease_set', p_agent::text, jsonb_build_object(
    'name', v_agent.name,
    'expires_at', v_expires,
    'projects', coalesce(cardinality(v_projects), 0),
    'all_projects', v_projects is null,
    'capabilities', p_capabilities,
    'actions_per_hour', p_actions_per_hour
  ));
  return v_expires;
end;
$$;

create or replace function public.app_revoke_agent(p_agent uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
begin
  select * into v_agent from public.agents where id = p_agent for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organization_members
    where org_id = v_agent.org_id and user_id = p_actor and (role in ('owner', 'admin') or p_actor = v_agent.paired_by)
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_agent.revoked_at is not null then
    raise exception 'AGENT_REVOKED' using errcode = '22023';
  end if;
  update public.agents set revoked_at = now(), revoked_by = p_actor where id = p_agent;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_agent.org_id, p_actor, 'agent.revoked', p_agent::text, jsonb_build_object('name', v_agent.name));
end;
$$;

-- Agents of people who already left.
update public.agents a
   set revoked_at = now()
 where a.revoked_at is null
   and not exists (select 1 from public.organization_members m where m.org_id = a.org_id and m.user_id = a.paired_by);

-- 7. An account's export reads what you created in workspaces you're still in.
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

-- 8. A catch-all domain can't farm free trials of real AI spend. The big public providers are left out: each of their
-- addresses is one person, and they're already limited by the address itself.
create function private.trial_domain_is_busy(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(lower(p_email), '@', 2) not in (
           'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'aol.com', 'gmx.com', 'zoho.com'
         )
     and (
       select count(*) from public.trials t join auth.users u on u.id = t.started_by
        where t.started_at > now() - interval '1 day'
          and split_part(lower(u.email), '@', 2) = split_part(lower(p_email), '@', 2)
     ) >= 5;
$$;
revoke all on function private.trial_domain_is_busy(text) from public, anon, authenticated;

alter table public.billing_accounts drop constraint billing_accounts_trial_withheld_check;
alter table public.billing_accounts add constraint billing_accounts_trial_withheld_check check (trial_withheld in ('address_used', 'disposable_address', 'domain_busy'));

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
  v_withheld text;
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

  if v_email is not null and private.is_disposable_email(v_email) then
    v_withheld := 'disposable_address';
  elsif v_email is not null and private.trial_domain_is_busy(v_email) then
    v_withheld := 'domain_busy';
  elsif v_email is not null then
    insert into public.trial_claims (email_hash) values (private.email_claim(v_email)) on conflict do nothing;
    if found then
      insert into public.trials (org_id, started_by, started_at, ends_at)
      values (v_org, v_uid, now(), now() + interval '14 days')
      on conflict (started_by) do nothing;
      v_trial_started := found;
    end if;
    if not v_trial_started then
      v_withheld := 'address_used';
    end if;
  end if;

  insert into public.billing_accounts (org_id, state, plan_catalog_version, trial_withheld)
  values (v_org, case when v_trial_started then 'trialing' else 'free' end::public.subscription_state, '2026-10-18.1', v_withheld);

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_org, v_uid, 'organization.created', v_org::text, jsonb_build_object('trial_started', v_trial_started, 'trial_withheld', v_withheld));

  return v_org;
end;
$$;

-- 9. Published sites' hostname points at sites.farbaek.si, so nobody can take that name.
do $check$
begin
  if exists (select 1 from public.sites where name = 'sites') then
    raise warning 'A site is already named sites. It can no longer be changed until someone renames it.';
  end if;
end;
$check$;
alter table public.sites add constraint sites_name_not_sites check (name <> 'sites') not valid;

-- 10. A workflow whose steps changed after approval stops, because its runs act as the person who approved.
create function public.app_workflow_halt(p_workflow uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workflows
     set status = 'halted', waiting_reason = null, halted_reason = left(p_reason, 500), updated_at = now()
   where id = p_workflow and status in ('approved', 'running', 'waiting');
end;
$$;
revoke all on function public.app_workflow_halt(uuid, text) from public, anon, authenticated;
grant execute on function public.app_workflow_halt(uuid, text) to service_role;

-- 11. Whether a subscription naming this workspace can land on it: an owner or admin started that checkout in the last
-- 48 hours, and the workspace has no live subscription for it to overwrite.
create function public.app_billing_checkout_claimable(p_org uuid, p_product text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.billing_checkouts c
            where c.org_id = p_org and c.product_id = p_product and c.created_at > now() - interval '48 hours'
         )
     and not exists (
           select 1 from public.billing_accounts b
            where b.org_id = p_org and b.provider_subscription_id is not null
              and b.state in ('active', 'past_due', 'cancellation_scheduled', 'suspended')
         );
$$;
revoke all on function public.app_billing_checkout_claimable(uuid, text) from public, anon, authenticated;
grant execute on function public.app_billing_checkout_claimable(uuid, text) to service_role;

-- 12. Deleting an account takes its access too, as removing the person from a workspace does.
create or replace function public.app_delete_account_data(p_user uuid)
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
      delete from public.organization_invitations where org_id = r.org_id and invited_by = p_user and accepted_at is null;
      update public.agents set revoked_at = now() where org_id = r.org_id and paired_by = p_user and revoked_at is null;
      insert into public.audit_events (org_id, actor_id, action, target, metadata)
      values (r.org_id, p_user, 'member.account_deleted', p_user::text, jsonb_build_object('role', r.role));
      v_left := v_left + 1;
    end if;
  end loop;
  return jsonb_build_object('deleted_workspaces', v_deleted, 'left_workspaces', v_left);
end;
$$;

notify pgrst, 'reload schema';
