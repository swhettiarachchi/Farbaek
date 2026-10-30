-- Farbaek schema v81: Tool Definition Pinning (ADR 0133, spec §25: "Hash-pin
-- tool descriptions and manifests; any change quarantines the tool until it
-- is reviewed, with a diff of the description. Acceptance: a changed
-- description blocks tool calls until re-approval").
--
-- Each paired agent sends its tools (names, descriptions, input schemas)
-- with every model step; the server adds each tool's hash. Tools are pinned
-- one by one: a known tool must match its pin; one of Farbaek's own tools
-- the agent hasn't used yet is added to the pin; a changed tool, or a name
-- Farbaek doesn't know, quarantines the agent until an owner or admin
-- reviews the difference.

create table public.agent_tool_pins (
  agent_id          uuid primary key references public.agents (id) on delete cascade,
  org_id            uuid not null references public.organizations (id) on delete cascade,
  -- [{ name, description, input_schema, sha256 }], one per tool.
  manifest          jsonb not null check (jsonb_typeof(manifest) = 'array' and octet_length(manifest::text) <= 262144),
  pinned_by         uuid references auth.users (id) on delete set null,
  pinned_at         timestamptz not null default now(),
  status            text not null default 'pinned' check (status in ('pinned', 'quarantined')),
  pending_manifest  jsonb check (pending_manifest is null or (jsonb_typeof(pending_manifest) = 'array' and octet_length(pending_manifest::text) <= 262144)),
  quarantined_at    timestamptz,
  constraint agent_tool_pins_pending check ((status = 'quarantined') = (pending_manifest is not null) and (pending_manifest is null) = (quarantined_at is null))
);
create index agent_tool_pins_org_idx on public.agent_tool_pins (org_id);

alter table public.agent_tool_pins enable row level security;
revoke all on public.agent_tool_pins from public, anon, authenticated, service_role;
-- Tool descriptions aren't secret: members see them, and the diff, to review a change.
grant select on public.agent_tool_pins to authenticated, service_role;
create policy "members read their agents' tool pins" on public.agent_tool_pins for select to authenticated using ((select private.is_member(org_id)));

-- An identifier for a manifest, to bind an approval to what was reviewed.
create function private.tool_manifest_id(p_manifest jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce((select jsonb_agg(e order by e ->> 'name') from jsonb_array_elements(p_manifest) e), '[]'::jsonb)::text, 'UTF8')), 'hex');
$$;

-- Checks a model step's tools against the agent's pins, atomically:
--   'pinned_now'   first use, or Farbaek tools new to this agent were added;
--   'match'        every tool matches its pin;
--   'quarantined'  a tool changed, or isn't one of p_known: the step is refused until reviewed.
create function public.app_check_agent_tools(p_agent uuid, p_manifest jsonb, p_known text[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_pin public.agent_tool_pins%rowtype;
  v_tool jsonb;
  v_pinned jsonb;
  v_added text[] := '{}';
  v_changed boolean := false;
  v_union jsonb;
begin
  select org_id into v_org from public.agents where id = p_agent and revoked_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_manifest) <> 'array' or exists (select 1 from jsonb_array_elements(p_manifest) e where e ->> 'sha256' !~ '^[0-9a-f]{64}$' or coalesce(e ->> 'name', '') = '') then
    raise exception 'INVALID_MANIFEST' using errcode = '22023';
  end if;
  select * into v_pin from public.agent_tool_pins where agent_id = p_agent for update;
  if not found then
    if exists (select 1 from jsonb_array_elements(p_manifest) e where not (e ->> 'name' = any(p_known))) then
      insert into public.agent_tool_pins (agent_id, org_id, manifest, status, pending_manifest, quarantined_at)
      values (p_agent, v_org, '[]'::jsonb, 'quarantined', p_manifest, now());
      insert into public.audit_events (org_id, actor_id, action, target, metadata)
      values (v_org, null, 'agent.tools_quarantined', p_agent::text, jsonb_build_object('reason', 'unknown tool', 'sent', private.tool_manifest_id(p_manifest)));
      return 'quarantined';
    end if;
    insert into public.agent_tool_pins (agent_id, org_id, manifest) values (p_agent, v_org, p_manifest);
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v_org, null, 'agent.tools_pinned', p_agent::text, jsonb_build_object('tools', jsonb_array_length(p_manifest), 'first_use', true));
    return 'pinned_now';
  end if;
  if v_pin.status = 'quarantined' then
    return 'quarantined';
  end if;

  for v_tool in select e from jsonb_array_elements(p_manifest) e loop
    select e into v_pinned from jsonb_array_elements(v_pin.manifest) e where e ->> 'name' = v_tool ->> 'name';
    if v_pinned is null then
      if v_tool ->> 'name' = any(p_known) then
        v_added := v_added || (v_tool ->> 'name');
      else
        v_changed := true;
      end if;
    elsif v_pinned ->> 'sha256' is distinct from v_tool ->> 'sha256' then
      v_changed := true;
    end if;
  end loop;

  -- The pin with this step's tools laid over it: what gets reviewed, or the new pin.
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_union from (
    select e from jsonb_array_elements(v_pin.manifest) e where not exists (select 1 from jsonb_array_elements(p_manifest) n where n ->> 'name' = e ->> 'name')
    union all
    select e from jsonb_array_elements(p_manifest) e
  ) t(e);

  if v_changed then
    update public.agent_tool_pins set status = 'quarantined', pending_manifest = v_union, quarantined_at = now() where agent_id = p_agent;
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v_org, null, 'agent.tools_quarantined', p_agent::text, jsonb_build_object('pinned', private.tool_manifest_id(v_pin.manifest), 'sent', private.tool_manifest_id(v_union)));
    return 'quarantined';
  end if;
  if array_length(v_added, 1) > 0 then
    update public.agent_tool_pins set manifest = v_union where agent_id = p_agent;
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v_org, null, 'agent.tools_pinned', p_agent::text, jsonb_build_object('added', to_jsonb(v_added)));
    return 'pinned_now';
  end if;
  return 'match';
end;
$$;

-- An owner or admin approves the tools waiting for review: they become the pin. Bound to the manifest they reviewed.
create function public.app_approve_agent_tools(p_agent uuid, p_actor uuid, p_manifest_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pin public.agent_tool_pins%rowtype;
begin
  select * into v_pin from public.agent_tool_pins where agent_id = p_agent for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.organization_members m where m.org_id = v_pin.org_id and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_pin.status <> 'quarantined' or private.tool_manifest_id(v_pin.pending_manifest) is distinct from p_manifest_id then
    raise exception 'TOOLS_CHANGED_AGAIN' using errcode = 'P0001';
  end if;
  update public.agent_tool_pins
     set manifest = v_pin.pending_manifest, pinned_by = p_actor, pinned_at = now(), status = 'pinned', pending_manifest = null, quarantined_at = null
   where agent_id = p_agent;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_pin.org_id, p_actor, 'agent.tools_approved', p_agent::text, jsonb_build_object('manifest', p_manifest_id));
end;
$$;

-- The identifier of what's waiting, for the page to bind its approval to.
create function public.app_agent_tools_pending_id(p_agent uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.tool_manifest_id(pending_manifest) from public.agent_tool_pins
   where agent_id = p_agent and pending_manifest is not null and (select private.is_member(org_id));
$$;

revoke all on function public.app_check_agent_tools(uuid, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.app_approve_agent_tools(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_agent_tools_pending_id(uuid) from public, anon;
revoke all on function private.tool_manifest_id(jsonb) from public;
grant execute on function public.app_check_agent_tools(uuid, jsonb, text[]) to service_role;
grant execute on function public.app_approve_agent_tools(uuid, uuid, text) to service_role;
grant execute on function public.app_agent_tools_pending_id(uuid) to authenticated, service_role;
