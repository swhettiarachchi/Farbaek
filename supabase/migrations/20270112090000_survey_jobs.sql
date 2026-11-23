-- Farbaek schema v102: AutoSurvey's work in the background (stage 229, ADR 0239). One addition, nothing taken away:
-- a Generate Plan run is a job with real stages, so the surveyor can leave the page and come back to the same state. The job's rows
-- are read by the workspace's members (row-level security) and written only through the two functions below, by the server.

create table public.survey_jobs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  project_id  uuid not null references public.survey_projects (id) on delete cascade,
  created_by  uuid not null,
  kind        text not null check (kind in ('generate')),
  state       text not null check (state in ('running', 'done', 'failed', 'interrupted')),
  -- [{ "id": "draw", "label": "Drawing the plan", "state": "waiting" | "running" | "done" | "failed" | "skipped", "detail": "..." }]
  stages      jsonb not null default '[]'::jsonb check (jsonb_typeof(stages) = 'array' and jsonb_array_length(stages) <= 12),
  -- { "next": "/app/survey/...", "message": "..." }
  result      jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  started_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index survey_jobs_project on public.survey_jobs (project_id, started_at desc);
create index survey_jobs_running on public.survey_jobs (state, updated_at) where state = 'running';

alter table public.survey_jobs enable row level security;
revoke all on public.survey_jobs from public, anon, authenticated, service_role;
grant select on public.survey_jobs to authenticated, service_role;
create policy "members read survey jobs" on public.survey_jobs for select to authenticated using ((select private.is_member(org_id)));

-- A job starts with its stages, for a project of the workspace, by a contributor.
create function public.app_survey_job_start(p_org uuid, p_actor uuid, p_project uuid, p_kind text, p_stages jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_contributor(p_org, p_actor);
  perform private.survey_project_open(p_org, p_project);
  if p_kind is distinct from 'generate' or p_stages is null or jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) > 12 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  insert into public.survey_jobs (org_id, project_id, created_by, kind, state, stages)
  values (p_org, p_project, p_actor, p_kind, 'running', p_stages)
  returning id into v_id;
  return v_id;
end;
$$;

-- A running job's stages, and at the end its state and result. A finished job never changes again.
create function public.app_survey_job_update(p_org uuid, p_job uuid, p_stages jsonb, p_state text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_state not in ('running', 'done', 'failed', 'interrupted') or p_stages is null or jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) > 12
     or p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  update public.survey_jobs j
  set stages = p_stages,
      state = p_state,
      result = p_result,
      updated_at = now(),
      finished_at = case when p_state = 'running' then null else now() end
  where j.id = p_job and j.org_id = p_org and j.state = 'running';
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- Jobs a restart cut off: still "running" with no word for 15 minutes are marked interrupted, so nobody waits on them forever.
create function public.app_survey_jobs_sweep()
returns integer
language sql
security definer
set search_path = ''
as $$
  with cut as (
    update public.survey_jobs j
    set state = 'interrupted', updated_at = now(), finished_at = now()
    where j.state = 'running' and j.updated_at < now() - interval '15 minutes'
    returning 1
  )
  select count(*)::integer from cut;
$$;

revoke all on function public.app_survey_job_start(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.app_survey_job_update(uuid, uuid, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.app_survey_jobs_sweep() from public, anon, authenticated;
grant execute on function public.app_survey_job_start(uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.app_survey_job_update(uuid, uuid, jsonb, text, jsonb) to service_role;
grant execute on function public.app_survey_jobs_sweep() to service_role;
