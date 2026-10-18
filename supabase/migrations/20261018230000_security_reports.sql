-- Farbaek schema v18: security checks (ADR 0024).
--
-- A contributor runs a security check on a project: Farbaek's rules over the
-- files, a package audit in a sandbox, and an AI review of the riskiest
-- files. The result is a report: an in-toto statement with every finding and
-- the score, kept with its SHA-256 digest so it can be checked later. One
-- check runs per project at a time. Only the server writes reports.

create table public.security_reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  created_by    uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'running' check (status in ('running', 'done', 'failed')),
  score         integer check (score between 0 and 100),
  grade         text check (grade in ('A', 'B', 'C', 'D', 'F')),
  counts        jsonb check (counts is null or jsonb_typeof(counts) = 'object'),
  statement     jsonb check (statement is null or (jsonb_typeof(statement) = 'object' and octet_length(statement::text) <= 1000000)),
  digest        text check (digest is null or digest ~ '^[0-9a-f]{64}$'),
  error         text check (error is null or char_length(error) <= 1000),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  check ((status = 'running') = (completed_at is null)),
  check (status <> 'done' or (statement is not null and digest is not null and score is not null and grade is not null))
);
create index security_reports_project_idx on public.security_reports (project_id, started_at desc);
create unique index security_reports_one_running on public.security_reports (project_id) where status = 'running';

alter table public.security_reports enable row level security;
revoke all on public.security_reports from anon, authenticated;
grant select on public.security_reports to authenticated;
create policy "members read security reports" on public.security_reports
  for select to authenticated using ((select private.is_member(org_id)));

create function public.app_start_security_report(p_org uuid, p_actor uuid, p_project uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_id uuid;
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
  if exists (select 1 from public.security_reports where project_id = p_project and status = 'running') then
    raise exception 'CHECK_RUNNING' using errcode = '23505';
  end if;
  insert into public.security_reports (org_id, project_id, created_by) values (p_org, p_project, p_actor) returning id into v_id;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'security.check_started', v_id::text, jsonb_build_object('project_id', p_project));
  return v_id;
end;
$$;

-- Records the outcome of a running check, once.
create function public.app_finish_security_report(
  p_report uuid,
  p_status text,
  p_score integer,
  p_grade text,
  p_counts jsonb,
  p_statement jsonb,
  p_digest text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.security_reports%rowtype;
begin
  select * into v_report from public.security_reports where id = p_report for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_report.status <> 'running' then
    raise exception 'CHECK_FINISHED' using errcode = '22023';
  end if;
  if p_status not in ('done', 'failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if p_status = 'done' and (p_statement ->> 'predicateType') is distinct from 'https://farbaek.dev/security-report/v1' then
    raise exception 'INVALID_REPORT' using errcode = '22023';
  end if;
  update public.security_reports
  set status = p_status,
      score = case when p_status = 'done' then p_score end,
      grade = case when p_status = 'done' then p_grade end,
      counts = case when p_status = 'done' then p_counts end,
      statement = case when p_status = 'done' then p_statement end,
      digest = case when p_status = 'done' then p_digest end,
      error = case when p_status = 'failed' then left(coalesce(p_error, 'The check failed.'), 1000) end,
      completed_at = now()
  where id = p_report;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_report.org_id, v_report.created_by, 'security.check_finished', p_report::text, jsonb_build_object('status', p_status, 'score', p_score));
end;
$$;

-- Checks that were running when their server went away.
create function public.app_interrupt_stale_security_reports(p_started_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.security_reports
  set status = 'failed', error = 'Farbaek stopped while this check was running. Run it again.', completed_at = now()
  where status = 'running' and started_at < p_started_before;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.app_start_security_report(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_finish_security_report(uuid, text, integer, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.app_interrupt_stale_security_reports(timestamptz) from public, anon, authenticated;
grant execute on function public.app_start_security_report(uuid, uuid, uuid) to service_role;
grant execute on function public.app_finish_security_report(uuid, text, integer, text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.app_interrupt_stale_security_reports(timestamptz) to service_role;
