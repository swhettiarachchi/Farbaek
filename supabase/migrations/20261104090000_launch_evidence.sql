-- Farbaek schema v33: the Launch Evidence Gate (ADR 0050).
--
-- Publishing a site now needs evidence as well as a security check: the
-- project's latest applied change has a verified ProofPack, and no file has
-- changed since that change was applied. The newest ProofPack alone isn't
-- enough. A check run for an earlier change can be appended after a later
-- change's own ProofPack, and hand edits, undos and imports write files with
-- no ProofPack at all. Without that evidence an owner or admin can still
-- publish by saying why; the reason is kept on the version and in the audit
-- log. Versions published before this migration have no evidence recorded.

alter table public.site_deployments
  add column evidence text check (evidence in ('verified', 'unverified', 'partially_verified', 'failed', 'changed', 'none')),
  add column evidence_proofpack text references public.proofpacks (digest) on delete set null,
  add column override_reason text check (override_reason is null or char_length(override_reason) between 10 and 500),
  add constraint site_deployments_override check (
    evidence is null
    or (evidence = 'verified' and override_reason is null)
    or (evidence <> 'verified' and override_reason is not null)
  );

-- What evidence covers the project's files right now, and the ProofPack it
-- rests on: the latest verification of the latest applied change, or that
-- change's own ProofPack when nothing verified it.
create function private.launch_evidence(p_project uuid, out status text, out proofpack text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_change public.proofpacks%rowtype;
  v_check public.proofpacks%rowtype;
  v_changed timestamptz;
begin
  select * into v_change from public.proofpacks
  where project_id = p_project and statement -> 'predicate' -> 'verification' is null
  order by seq desc limit 1;
  if not found then
    status := 'none';
    return;
  end if;
  proofpack := v_change.digest;
  -- Applying a change writes its revisions and its ProofPack in one
  -- transaction, so a later revision is a change no ProofPack covers.
  select max(created_at) into v_changed from public.project_file_revisions where project_id = p_project;
  if v_changed > v_change.created_at then
    status := 'changed';
    return;
  end if;
  select * into v_check from public.proofpacks
  where project_id = p_project and statement -> 'predicate' -> 'verification' ->> 'appliedProofPack' = v_change.digest
  order by seq desc limit 1;
  if not found then
    status := v_change.status;
    return;
  end if;
  status := v_check.status;
  proofpack := v_check.digest;
end;
$$;
revoke all on function private.launch_evidence(uuid) from public;

create function private.require_override_role(p_org uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = p_user and m.role in ('owner', 'admin')
  ) then
    raise exception 'OVERRIDE_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_override_role(uuid, uuid) from public;

drop function public.app_publish_site(uuid, uuid, uuid, text, jsonb, text, uuid);

-- Same as v19, plus the evidence gate. p_override_reason is the owner's or
-- admin's reason for publishing without verified evidence; it's ignored when
-- the evidence is verified. Calls without it still resolve, and are refused
-- when the evidence isn't verified.
create function public.app_publish_site(p_org uuid, p_actor uuid, p_project uuid, p_name text, p_files jsonb, p_digest text, p_report uuid, p_override_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_report public.security_reports%rowtype;
  v_site public.sites%rowtype;
  v_changed timestamptz;
  v_count integer;
  v_matching integer;
  v_bytes bigint;
  v_number integer;
  v_id uuid;
  v_evidence text;
  v_proofpack text;
  v_reason text;
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(p_org, p_actor);
  select * into v_project from public.projects where id = p_project and org_id = p_org;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_project.archived_at is not null then
    raise exception 'PROJECT_ARCHIVED' using errcode = 'P0001';
  end if;
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_files is null or jsonb_typeof(p_files) <> 'array' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  -- The files must be exactly what the project holds now, revision for revision.
  select count(*), coalesce(sum(size_bytes), 0) into v_count, v_bytes from public.project_files where project_id = p_project;
  -- Any change counts, deletions included: the revision history records them all.
  select max(created_at) into v_changed from public.project_file_revisions where project_id = p_project;
  select count(*) into v_matching
  from jsonb_array_elements(p_files) f
  join public.project_files pf
    on pf.project_id = p_project
   and pf.path = f ->> 'path'
   and pf.revision = (f ->> 'revision')::integer
   and pf.sha256 = f ->> 'sha256'
   and pf.size_bytes = (f ->> 'size')::integer;
  if v_count = 0 or v_matching <> v_count or jsonb_array_length(p_files) <> v_count then
    raise exception 'FILES_CHANGED' using errcode = '40001';
  end if;
  if not exists (select 1 from public.project_files where project_id = p_project and path = 'index.html') then
    raise exception 'NO_INDEX' using errcode = '22023';
  end if;

  -- The publish gate, again: a finished check of these files that found nothing critical.
  select * into v_report from public.security_reports where id = p_report and project_id = p_project;
  if not found or v_report.status <> 'done' then
    raise exception 'CHECK_REQUIRED' using errcode = 'P0001';
  end if;
  if v_report.started_at < v_changed then
    raise exception 'CHECK_STALE' using errcode = 'P0001';
  end if;
  if coalesce((v_report.counts ->> 'critical')::integer, 0) > 0 then
    raise exception 'CRITICAL_FINDINGS' using errcode = 'P0001';
  end if;

  -- The evidence gate: the latest applied change, verified, with nothing
  -- changed since. Without it, an owner or admin says why.
  select e.status, e.proofpack into v_evidence, v_proofpack from private.launch_evidence(p_project) e;
  if v_evidence <> 'verified' then
    if p_override_reason is null or btrim(p_override_reason) = '' then
      raise exception 'EVIDENCE_REQUIRED' using errcode = 'P0001';
    end if;
    perform private.require_override_role(p_org, p_actor);
    v_reason := private.require_reason(p_override_reason);
  end if;

  select * into v_site from public.sites where project_id = p_project for update;
  begin
    if not found then
      insert into public.sites (org_id, project_id, name, created_by) values (p_org, p_project, p_name, p_actor) returning * into v_site;
    elsif v_site.name <> p_name then
      update public.sites set name = p_name where id = v_site.id returning * into v_site;
    end if;
  exception
    when unique_violation then
      raise exception 'NAME_TAKEN' using errcode = '23505';
    when check_violation then
      raise exception 'INVALID_NAME' using errcode = '22023';
  end;

  select coalesce(max(number), 0) + 1 into v_number from public.site_deployments where site_id = v_site.id;
  insert into public.site_deployments (org_id, site_id, project_id, number, files, file_count, total_bytes, digest, security_report_id, security_score, created_by, evidence, evidence_proofpack, override_reason)
  values (p_org, v_site.id, p_project, v_number, p_files, v_count, v_bytes, p_digest, v_report.id, v_report.score, p_actor, v_evidence, v_proofpack, v_reason)
  returning id into v_id;
  update public.sites set live_deployment_id = v_id where id = v_site.id;

  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'site.published', v_id::text,
          jsonb_build_object('site', v_site.name, 'number', v_number, 'digest', p_digest, 'report', v_report.id, 'evidence', v_evidence, 'proofpack', v_proofpack, 'override', v_reason));
  return v_id;
end;
$$;

revoke all on function public.app_publish_site(uuid, uuid, uuid, text, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function public.app_publish_site(uuid, uuid, uuid, text, jsonb, text, uuid, text) to service_role;
