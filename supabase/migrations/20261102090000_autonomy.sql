-- Farbaek schema v31: autonomy level 2, bounded execution (ADR 0046).
--
-- An owner or admin may let small, checked changes apply on their own:
-- inside the contract, no sensitive files, within a file limit, with checks
-- a verified sandbox can run. The server decides each proposal; this
-- migration makes sure no proposal can be marked "allowed within limits"
-- unless the workspace has level 2 on, and switches it off by itself when
-- a change applied that way fails its checks.

create table public.org_autonomy (
  org_id            uuid primary key references public.organizations (id) on delete cascade,
  level             smallint not null default 0 check (level in (0, 2)),
  max_files         smallint not null default 3 check (max_files between 1 and 5),
  allow_creates     boolean not null default false,
  suspended_at      timestamptz,
  suspended_reason  text check (suspended_reason is null or char_length(suspended_reason) between 1 and 300),
  updated_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint org_autonomy_suspension check ((suspended_at is null) = (suspended_reason is null))
);

alter table public.org_autonomy enable row level security;
revoke all on public.org_autonomy from public, anon, authenticated, service_role;
grant select on public.org_autonomy to authenticated, service_role;
create policy "members read their workspace's autonomy" on public.org_autonomy
  for select to authenticated using ((select private.is_member(org_id)));

-- Whether a workspace lets changes apply on their own right now.
create function private.autonomy_allows(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.org_autonomy a where a.org_id = p_org and a.level = 2 and a.suspended_at is null);
$$;
revoke all on function private.autonomy_allows(uuid) from public;

-- Owners and admins set the level and its limits. Turning level 2 on clears a suspension.
create function public.app_set_autonomy(p_org uuid, p_actor uuid, p_level integer, p_max_files integer, p_allow_creates boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.org_autonomy%rowtype;
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_level not in (0, 2) or p_max_files not between 1 and 5 then
    raise exception 'INVALID_AUTONOMY' using errcode = '22023';
  end if;
  select * into v_old from public.org_autonomy where org_id = p_org for update;
  insert into public.org_autonomy (org_id, level, max_files, allow_creates, suspended_at, suspended_reason, updated_by, updated_at)
  values (p_org, p_level, p_max_files, p_allow_creates, null, null, p_actor, now())
  on conflict (org_id) do update
    set level = excluded.level, max_files = excluded.max_files, allow_creates = excluded.allow_creates,
        suspended_at = case when excluded.level = 2 then null else public.org_autonomy.suspended_at end,
        suspended_reason = case when excluded.level = 2 then null else public.org_autonomy.suspended_reason end,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'autonomy.changed', p_org::text, jsonb_build_object(
    'from', jsonb_build_object('level', coalesce(v_old.level, 0), 'max_files', v_old.max_files, 'allow_creates', v_old.allow_creates, 'suspended', v_old.suspended_at is not null),
    'to', jsonb_build_object('level', p_level, 'max_files', p_max_files, 'allow_creates', p_allow_creates)));
end;
$$;
revoke all on function public.app_set_autonomy(uuid, uuid, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.app_set_autonomy(uuid, uuid, integer, integer, boolean) to service_role;

-- No proposal is "allowed within limits" unless the workspace allows it at that moment.
create function private.refuse_autonomy_when_off()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.policy ->> 'outcome' = 'ALLOW_WITHIN_LIMITS' and not private.autonomy_allows(new.org_id) then
    raise exception 'AUTONOMY_OFF' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_autonomy_when_off() from public;

create trigger change_proposals_autonomy
  before insert on public.change_proposals
  for each row execute function private.refuse_autonomy_when_off();

-- A change applied on its own that then fails its checks switches autonomy off, with the reason.
create function private.suspend_autonomy_on_failure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by_policy boolean;
begin
  if new.status <> 'failed' or new.proposal_id is null then
    return new;
  end if;
  select (p.statement -> 'predicate' -> 'approval' ->> 'by') = 'policy' into v_by_policy
  from public.proofpacks p where p.proposal_id = new.proposal_id order by p.seq asc limit 1;
  if coalesce(v_by_policy, false) then
    update public.org_autonomy
       set suspended_at = now(),
           suspended_reason = 'A change applied on its own failed its checks on ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD') || '. Review it, then turn autonomy on again.'
     where org_id = new.org_id and level = 2 and suspended_at is null;
    if found then
      insert into public.audit_events (org_id, actor_id, action, target, metadata)
      values (new.org_id, null, 'autonomy.suspended', new.proposal_id::text, jsonb_build_object('proofpack', new.digest));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.suspend_autonomy_on_failure() from public;

create trigger proofpacks_autonomy_failure
  after insert on public.proofpacks
  for each row execute function private.suspend_autonomy_on_failure();
