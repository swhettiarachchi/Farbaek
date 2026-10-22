-- Farbaek schema v25: Workspace Capsules (Mesh phase A, ADR 0037).
--
-- Records every Capsule a workspace packs or opens: the BLAKE3 digest of its
-- manifest, what it held and who handled it. The files themselves never
-- touch this table. Members read their own workspace's records; only the
-- server writes, through one function that checks the person, the project
-- and how often it's called.

create table public.workspace_capsules (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  direction     text not null check (direction in ('export', 'import')),
  digest        text not null check (digest ~ '^[0-9a-f]{64}$'),
  project_name  text not null check (char_length(project_name) between 1 and 120),
  files         integer not null check (files between 0 and 10000),
  bytes         bigint not null check (bytes between 0 and 268435456),
  excluded      integer not null default 0 check (excluded between 0 and 50000),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index workspace_capsules_org on public.workspace_capsules (org_id, created_at desc);

alter table public.workspace_capsules enable row level security;
revoke all on public.workspace_capsules from public, anon, authenticated, service_role;
grant select on public.workspace_capsules to authenticated, service_role;
create policy "members read their workspace's capsules" on public.workspace_capsules
  for select to authenticated using ((select private.is_member(org_id)));

-- Records one Capsule. Packing needs membership (anyone who can read the
-- files); opening writes files, so it needs a contributor. The project must
-- be the workspace's own. At most 30 records a minute per workspace.
create function public.app_record_capsule(
  p_org uuid,
  p_actor uuid,
  p_project uuid,
  p_direction text,
  p_digest text,
  p_project_name text,
  p_files integer,
  p_bytes bigint,
  p_excluded integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_direction is null or p_direction not in ('export', 'import') then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  if p_direction = 'import' then
    perform private.require_contributor(p_org, p_actor);
  elsif not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_project is not null and not exists (select 1 from public.projects where id = p_project and org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  if not public.app_rate_limit('capsule:' || p_org::text, 60, 30) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.workspace_capsules (org_id, project_id, direction, digest, project_name, files, bytes, excluded, created_by)
  values (p_org, p_project, p_direction, p_digest, left(btrim(coalesce(nullif(btrim(p_project_name), ''), 'Untitled project')), 120), p_files, p_bytes, coalesce(p_excluded, 0), p_actor)
  returning id into v_id;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, case when p_direction = 'export' then 'capsule.exported' else 'capsule.imported' end, coalesce(p_project::text, v_id::text),
    jsonb_build_object('capsule', v_id, 'digest', p_digest, 'files', p_files, 'bytes', p_bytes, 'excluded', coalesce(p_excluded, 0)));
  return v_id;
end;
$$;

revoke all on function public.app_record_capsule(uuid, uuid, uuid, text, text, text, integer, bigint, integer) from public, anon, authenticated;
grant execute on function public.app_record_capsule(uuid, uuid, uuid, text, text, text, integer, bigint, integer) to service_role;
