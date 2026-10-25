-- Farbaek schema v52: workspace rules and the policy builder (ADR 0082).
--
-- Owners and admins add their own rules on top of the built-in change
-- policy: files, by pattern, and what a change to them needs (stopped, an
-- owner or admin, or always a person). Each activation is a numbered
-- version holding the reviewed set, its sha256, the patterns compiled to
-- anchored regexes, and what testing it against past changes showed. One
-- version is active per workspace; turning rules off activates an empty set.
--
-- The server decides each change with the active rules. This migration
-- checks that again: a new proposal whose outcome is weaker than the active
-- rules require for its files is refused, whichever path created it.

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping', 'policy_draft'));

create table public.workspace_rule_versions (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  version     integer not null check (version >= 1),
  document    jsonb not null check (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 65536),
  compiled    jsonb not null check (jsonb_typeof(compiled) = 'array' and octet_length(compiled::text) <= 131072),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  active      boolean not null default false,
  tested      jsonb not null check (jsonb_typeof(tested) = 'object' and octet_length(tested::text) <= 65536),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (org_id, version)
);
create unique index workspace_rule_versions_one_active on public.workspace_rule_versions (org_id) where active;

alter table public.workspace_rule_versions enable row level security;
revoke all on public.workspace_rule_versions from anon, authenticated;
grant select on public.workspace_rule_versions to authenticated;
-- Everyone in the workspace can read its rules: reviewers see why a change waits.
create policy "members read their workspace's rules" on public.workspace_rule_versions
  for select to authenticated using ((select private.is_member(org_id)));

create trigger guard_activity before insert on public.workspace_rule_versions for each row execute function private.guard_activity('');

-- Owners and admins activate a tested set as the next version. Everything is
-- checked again here; an expression Postgres can't read fails now, not on a
-- later change.
create function public.app_activate_workspace_rules(p_org uuid, p_actor uuid, p_document jsonb, p_compiled jsonb, p_sha256 text, p_tested jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_rule jsonb;
  v_re text;
begin
  perform private.require_contributor(p_org, p_actor);
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_document) is distinct from 'object'
     or p_document ->> 'schema' is distinct from 'farbaek.workspace-rules/v1'
     or jsonb_typeof(p_document -> 'rules') is distinct from 'array'
     or jsonb_array_length(p_document -> 'rules') > 20
     or jsonb_typeof(p_compiled) is distinct from 'array'
     or jsonb_array_length(p_compiled) <> jsonb_array_length(p_document -> 'rules')
     or jsonb_typeof(p_tested) is distinct from 'object'
     or p_tested ->> 'sha256' is distinct from p_sha256 then
    raise exception 'INVALID_RULES' using errcode = '22023';
  end if;
  for v_rule in select value from jsonb_array_elements(p_compiled) loop
    if coalesce(v_rule ->> 'effect', '') not in ('block', 'owner_approval', 'person_approval')
       or jsonb_typeof(v_rule -> 'regex') is distinct from 'array'
       or jsonb_array_length(v_rule -> 'regex') not between 1 and 10 then
      raise exception 'INVALID_RULES' using errcode = '22023';
    end if;
    for v_re in select value from jsonb_array_elements_text(v_rule -> 'regex') loop
      if char_length(v_re) > 600 or left(v_re, 1) <> '^' or right(v_re, 1) <> '$' then
        raise exception 'INVALID_RULES' using errcode = '22023';
      end if;
      perform 'x' ~ v_re;
    end loop;
  end loop;

  -- One activation at a time per workspace.
  perform 1 from public.organizations o where o.id = p_org for update;
  select coalesce(max(v.version), 0) + 1 into v_version from public.workspace_rule_versions v where v.org_id = p_org;
  update public.workspace_rule_versions set active = false where org_id = p_org and active;
  insert into public.workspace_rule_versions (org_id, version, document, compiled, sha256, active, tested, created_by)
  values (p_org, v_version, p_document, p_compiled, p_sha256, true, p_tested, p_actor);

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'policy.rules_activated', 'workspace_rules:v' || v_version::text, jsonb_build_object(
    'sha256', p_sha256,
    'rules', jsonb_array_length(p_document -> 'rules'),
    'tested_changes', p_tested -> 'changes',
    'stricter', p_tested -> 'stricter',
    'looser', p_tested -> 'looser'));
  return v_version;
end;
$$;
revoke all on function public.app_activate_workspace_rules(uuid, uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_activate_workspace_rules(uuid, uuid, jsonb, jsonb, text, jsonb) to service_role;

-- The strictest effect the active rules give any of a change's files, or null.
create function private.workspace_rule_floor(p_org uuid, p_changes jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.rule ->> 'effect'
    from public.workspace_rule_versions v
    cross join lateral jsonb_array_elements(v.compiled) as c(rule)
   where v.org_id = p_org
     and v.active
     and exists (
       select 1
         from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) as ch(change)
         cross join lateral jsonb_array_elements_text(c.rule -> 'regex') as x(re)
        where (ch.change ->> 'path') ~ x.re
     )
   order by case c.rule ->> 'effect' when 'block' then 3 when 'owner_approval' then 2 else 1 end desc
   limit 1;
$$;
revoke all on function private.workspace_rule_floor(uuid, jsonb) from public;

create function private.enforce_workspace_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_need text := private.workspace_rule_floor(new.org_id, new.changes);
  v_outcome text := new.policy ->> 'outcome';
begin
  if (v_need = 'block' and v_outcome is distinct from 'BLOCK')
     or (v_need = 'owner_approval' and coalesce(v_outcome, '') not in ('ESCALATE', 'BLOCK'))
     or (v_need = 'person_approval' and coalesce(v_outcome, '') in ('ALLOW', 'ALLOW_WITHIN_LIMITS')) then
    raise exception 'WORKSPACE_RULES_CHANGED' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_workspace_rules() from public;

create trigger change_proposals_workspace_rules
  before insert on public.change_proposals
  for each row execute function private.enforce_workspace_rules();

notify pgrst, 'reload schema';
