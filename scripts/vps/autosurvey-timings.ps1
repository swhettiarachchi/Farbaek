# How long AutoSurvey's Generate Plan really takes on production (stage 235): runs in the last 30 days, how they ended, and the
# median and slowest times, overall and for each stage, as the server measured them. It only reads, inside a read-only transaction,
# so it can't change anything. It needs migration v102 (survey_jobs); runs from before stage 235 have no stage times.
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\autosurvey-timings.ps1"
#
# Each line is a measure and its value. Send Claude the lines: they go in docs/survey/BENCHMARKS.md as production's numbers.
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20")
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

$query = @'
docker exec -i supabase-db psql -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 <<'SQL'
begin read only;
with j as (
  -- No timer runs the sweep yet (ADR 0239), so a run silent for 15 minutes counts as cut off, as the page shows it. A run finished
  -- after a cut-off has no start-to-finish time: it would include the hours it lay stopped.
  select case when state = 'running' and updated_at < now() - interval '15 minutes' then 'interrupted' else state end as state,
    stages,
    coalesce((result->>'finishedLater')::boolean, false) as later,
    extract(epoch from (finished_at - started_at)) * 1000 as total_ms
  from public.survey_jobs
  where kind = 'generate' and started_at > now() - interval '30 days'
), s as (
  select st->>'id' as stage, (st->>'ms')::numeric as ms
  from j, jsonb_array_elements(j.stages) st
  where st ? 'ms'
)
select 'runs in the last 30 days', count(*)::text from j
union all select 'finished', count(*) filter (where state = 'done' and not later)::text from j
union all select 'finished after a cut-off', count(*) filter (where state = 'done' and later)::text from j
union all select 'stopped by a failed stage', count(*) filter (where state = 'failed')::text from j
union all select 'cut off', count(*) filter (where state = 'interrupted')::text from j
union all select 'median start to finish, finished runs (s)', coalesce(round((percentile_cont(0.5) within group (order by total_ms) filter (where state = 'done' and not later))::numeric / 1000, 1)::text, 'none') from j
union all select 'slowest start to finish, finished runs (s)', coalesce(round((max(total_ms) filter (where state = 'done' and not later))::numeric / 1000, 1)::text, 'none') from j
union all select * from (
  select 'median ' || stage || ' (s), ' || count(*) || ' measured', round((percentile_cont(0.5) within group (order by ms))::numeric / 1000, 2)::text
  from s group by stage order by stage
) per_stage;
rollback;
SQL
'@
Write-Host "Reading AutoSurvey's run times on production (nothing is changed)" -ForegroundColor Cyan
($query -replace "`r", "") | ssh @ssh "farbaek@$Server" "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { Write-Host "The query didn't finish. If it says survey_jobs doesn't exist, migration v102 isn't applied yet. Send Claude the lines above." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "Done. Send Claude these lines." -ForegroundColor Green
