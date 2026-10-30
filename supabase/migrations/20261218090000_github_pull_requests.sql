-- Farbaek schema v77: GitHub pull requests and the ProofPack status (ADR 0126,
-- spec "GitHub repository, branch and PR workflow" and §25 Portable Proof).
--
-- A workspace connects its own fine-grained GitHub token. The server seals it
-- (AES-256-GCM, bound to the workspace) before it gets here; browsers can't
-- read the sealed value. An owner or admin links a project to one repository
-- the token can push to. Each applied change can become one pull request,
-- with a "Farbaek ProofPack" status on the commit Farbaek made.

create table public.workspace_github (
  org_id        uuid primary key references public.organizations (id) on delete cascade,
  -- Postgres caps a regex repeat at 255, so the length is checked on its own.
  token_sealed  text not null check (token_sealed ~ '^v1\.(k1|d1)\.[A-Za-z0-9_-]+$' and char_length(token_sealed) between 46 and 2000),
  login         text not null check (login ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'),
  -- The token's last four characters, so people can tell tokens apart.
  token_hint    text not null check (token_hint ~ '^[A-Za-z0-9]{4}$'),
  expires_at    timestamptz,
  set_by        uuid references auth.users (id) on delete set null,
  set_at        timestamptz not null default now(),
  last_used_at  timestamptz
);

alter table public.workspace_github enable row level security;
revoke all on public.workspace_github from public, anon, authenticated, service_role;
-- Members see who connected GitHub and which token, never the sealed value.
grant select (org_id, login, token_hint, expires_at, set_by, set_at, last_used_at) on public.workspace_github to authenticated;
grant select on public.workspace_github to service_role;
create policy "members read their workspace's GitHub connection" on public.workspace_github
  for select to authenticated using ((select private.is_member(org_id)));

create table public.project_github_repos (
  project_id      uuid primary key,
  org_id          uuid not null,
  owner           text not null check (owner ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'),
  repo            text not null check (repo ~ '^[A-Za-z0-9._-]{1,100}$' and repo not in ('.', '..')),
  repo_id         bigint not null check (repo_id > 0),
  default_branch  text not null check (default_branch ~ '^[A-Za-z0-9._/-]{1,250}$'),
  linked_by       uuid references auth.users (id) on delete set null,
  linked_at       timestamptz not null default now(),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);
create index project_github_repos_org_idx on public.project_github_repos (org_id);

alter table public.project_github_repos enable row level security;
revoke all on public.project_github_repos from public, anon, authenticated, service_role;
grant select on public.project_github_repos to authenticated, service_role;
create policy "members read their projects' repositories" on public.project_github_repos
  for select to authenticated using ((select private.is_member(org_id)));

create table public.github_pull_requests (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  project_id        uuid not null,
  task_id           uuid not null,
  -- One pull request per applied change.
  proposal_id       uuid not null unique references public.change_proposals (id) on delete cascade,
  repo_full_name    text not null check (repo_full_name ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$'),
  number            integer not null check (number > 0),
  url               text not null check (url ~ '^https://github\.com/[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}/pull/[0-9]{1,10}$'),
  branch            text not null check (branch ~ '^farbaek/[a-z0-9-]{1,60}$'),
  base_branch       text not null check (base_branch ~ '^[A-Za-z0-9._/-]{1,250}$'),
  commit_sha        text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  status_state      text check (status_state in ('success', 'failure', 'pending')),
  status_posted_at  timestamptz,
  opened_by         uuid references auth.users (id) on delete set null,
  opened_at         timestamptz not null default now(),
  constraint github_pull_requests_status_time check ((status_state is null) = (status_posted_at is null)),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);
create index github_pull_requests_project_idx on public.github_pull_requests (project_id, opened_at desc);
create index github_pull_requests_task_idx on public.github_pull_requests (task_id, opened_at desc);
-- Opening one is publishing (ADR 0087), checked again on the row that records who did.
create trigger refuse_withheld_pull_request before insert on public.github_pull_requests
  for each row execute function private.refuse_withheld_permission('publish', 'opened_by');

alter table public.github_pull_requests enable row level security;
revoke all on public.github_pull_requests from public, anon, authenticated, service_role;
grant select on public.github_pull_requests to authenticated, service_role;
create policy "members read their workspace's pull requests" on public.github_pull_requests
  for select to authenticated using ((select private.is_member(org_id)));

-- ------------------------------------------------- server-only functions

-- Connects or replaces the workspace's token. Owners and admins only.
create function public.app_set_github_token(p_org uuid, p_actor uuid, p_token_sealed text, p_login text, p_token_hint text, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.workspace_github (org_id, token_sealed, login, token_hint, expires_at, set_by, set_at, last_used_at)
  values (p_org, p_token_sealed, p_login, p_token_hint, p_expires_at, p_actor, now(), null)
  on conflict (org_id) do update
    set token_sealed = excluded.token_sealed, login = excluded.login, token_hint = excluded.token_hint, expires_at = excluded.expires_at,
        set_by = excluded.set_by, set_at = excluded.set_at, last_used_at = null;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'workspace.github_connected', p_login, jsonb_build_object('login', p_login, 'token_ends', p_token_hint, 'expires_at', p_expires_at));
end;
$$;

-- Disconnects it. Repository links and pull requests stay as history. Owners and admins only.
create function public.app_remove_github_token(p_org uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_login text;
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.workspace_github where org_id = p_org returning login into v_login;
  if v_login is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'workspace.github_disconnected', v_login, jsonb_build_object('login', v_login));
end;
$$;

-- Links a project to a repository the server checked the token can push to. Owners and admins only.
create function public.app_link_github_repo(p_org uuid, p_actor uuid, p_project uuid, p_owner text, p_repo text, p_repo_id bigint, p_default_branch text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived timestamptz;
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if private.org_suspended(p_org) then
    raise exception 'WORKSPACE_SUSPENDED' using errcode = 'P0001';
  end if;
  select archived_at into v_archived from public.projects where id = p_project and org_id = p_org;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_archived is not null then
    raise exception 'PROJECT_ARCHIVED' using errcode = 'P0001';
  end if;
  insert into public.project_github_repos (project_id, org_id, owner, repo, repo_id, default_branch, linked_by, linked_at)
  values (p_project, p_org, p_owner, p_repo, p_repo_id, p_default_branch, p_actor, now())
  on conflict (project_id) do update
    set owner = excluded.owner, repo = excluded.repo, repo_id = excluded.repo_id, default_branch = excluded.default_branch,
        linked_by = excluded.linked_by, linked_at = excluded.linked_at;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'project.github_linked', p_project::text, jsonb_build_object('repository', p_owner || '/' || p_repo, 'branch', p_default_branch));
end;
$$;

-- Unlinks it. Owners and admins only.
create function public.app_unlink_github_repo(p_org uuid, p_actor uuid, p_project uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.project_github_repos where project_id = p_project and org_id = p_org returning owner || '/' || repo into v_name;
  if v_name is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'project.github_unlinked', p_project::text, jsonb_build_object('repository', v_name));
end;
$$;

-- Records the pull request opened for an applied change. Contributors who may
-- publish only: it sends the workspace's code to a connected service, like a launch.
create function public.app_record_github_pull_request(p_org uuid, p_actor uuid, p_proposal uuid, p_repo_full_name text, p_number integer, p_url text, p_branch text, p_base_branch text, p_commit_sha text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.require_permission(p_org, p_actor, 'publish');
  select task_id, project_id, status into v_p from public.change_proposals where id = p_proposal and org_id = p_org;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_p.status <> 'applied' then
    raise exception 'PROPOSAL_NOT_APPLIED' using errcode = 'P0001';
  end if;
  insert into public.github_pull_requests (org_id, project_id, task_id, proposal_id, repo_full_name, number, url, branch, base_branch, commit_sha, opened_by)
  values (p_org, v_p.project_id, v_p.task_id, p_proposal, p_repo_full_name, p_number, p_url, p_branch, p_base_branch, p_commit_sha, p_actor)
  returning id into v_id;
  update public.workspace_github set last_used_at = now() where org_id = p_org;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'task.pull_request_opened', v_p.task_id::text, jsonb_build_object('repository', p_repo_full_name, 'number', p_number, 'commit', p_commit_sha));
  return v_id;
end;
$$;

-- Records the status Farbaek last posted on a pull request's commit.
create function public.app_record_github_status(p_org uuid, p_proposal uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.github_pull_requests set status_state = p_state, status_posted_at = now() where org_id = p_org and proposal_id = p_proposal;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.workspace_github set last_used_at = now() where org_id = p_org;
end;
$$;

revoke all on function public.app_set_github_token(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.app_remove_github_token(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_link_github_repo(uuid, uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.app_unlink_github_repo(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_record_github_pull_request(uuid, uuid, uuid, text, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_record_github_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_set_github_token(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.app_remove_github_token(uuid, uuid) to service_role;
grant execute on function public.app_link_github_repo(uuid, uuid, uuid, text, text, bigint, text) to service_role;
grant execute on function public.app_unlink_github_repo(uuid, uuid, uuid) to service_role;
grant execute on function public.app_record_github_pull_request(uuid, uuid, uuid, text, integer, text, text, text, text) to service_role;
grant execute on function public.app_record_github_status(uuid, uuid, text) to service_role;
