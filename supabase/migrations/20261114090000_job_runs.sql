-- Farbaek schema v43: background jobs report each run (ADR 0071).
--
-- The sandbox sweep, the hourly jobs, the nightly backup and the weekly
-- restore test ran on timers that nobody watched: a job that stopped, or
-- failed every night, went unnoticed. Each now records its last success and
-- its last failure here. Office Space's Health page and /api/ready read them,
-- so a late or failing job shows up there and in the uptime check.
-- The server key records runs from the app; the backup scripts record theirs
-- with psql as the database owner.

create table public.job_runs (
  job             text primary key check (job in ('sandbox_sweep', 'hourly_jobs', 'db_backup', 'restore_test')),
  last_ok_at      timestamptz,
  last_failed_at  timestamptz,
  last_detail     text check (char_length(last_detail) <= 300),
  updated_at      timestamptz not null default now()
);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from public, anon, authenticated;

create function public.app_note_job_run(p_job text, p_ok boolean, p_detail text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.job_runs (job, last_ok_at, last_failed_at, last_detail, updated_at)
  values (p_job, case when p_ok then now() end, case when not p_ok then now() end, left(p_detail, 300), now())
  on conflict (job) do update set
    last_ok_at = case when p_ok then now() else public.job_runs.last_ok_at end,
    last_failed_at = case when not p_ok then now() else public.job_runs.last_failed_at end,
    last_detail = left(p_detail, 300),
    updated_at = now();
$$;

create function public.app_job_runs()
returns table (job text, last_ok_at timestamptz, last_failed_at timestamptz, last_detail text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.job, r.last_ok_at, r.last_failed_at, r.last_detail from public.job_runs r order by r.job;
$$;

revoke all on function public.app_note_job_run(text, boolean, text) from public, anon, authenticated;
revoke all on function public.app_job_runs() from public, anon, authenticated;
grant execute on function public.app_note_job_run(text, boolean, text) to service_role;
grant execute on function public.app_job_runs() to service_role;
