-- Farbaek schema v86: importing a private repository with the workspace's GitHub token (ADR 0144).
--
-- A public repository has always been importable by anyone who can make a
-- project (ADR 0074). A private one is read with the workspace's own
-- fine-grained token (ADR 0126), which only owners and admins may use for
-- this. The server records each such import here: who used the token, for
-- which repository and commit, into which project. It's audited once and
-- marks the token as used, like opening a pull request does.

create function public.app_record_github_import(p_org uuid, p_actor uuid, p_project uuid, p_repository text, p_commit text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects p where p.id = p_project and p.org_id = p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_repository is null or p_repository !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$' then
    raise exception 'INVALID_REPOSITORY' using errcode = '22023';
  end if;
  if p_commit is not null and p_commit !~ '^[0-9a-f]{40}$' then
    raise exception 'INVALID_COMMIT' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspace_github g where g.org_id = p_org) then
    raise exception 'GITHUB_NOT_CONNECTED' using errcode = 'P0001';
  end if;
  update public.workspace_github set last_used_at = now() where org_id = p_org;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'project.github_imported', p_project::text, jsonb_build_object('repository', p_repository, 'commit', p_commit, 'with', 'workspace token'));
end;
$$;

revoke all on function public.app_record_github_import(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_record_github_import(uuid, uuid, uuid, text, text) to service_role;
