# Whether AutoSurvey really saves surveyors work (the brief's success metrics, stage 237, docs/survey/METRICS.md): plans generated in the
# last 30 days, how the runs ended, how long the server took to draw them, what the surveyors still changed by hand, how many were
# approved and how long that took, what was exported, and what the AI photo reads used. It only reads, inside a read-only transaction,
# so it can't change anything, and it prints counts and medians only: no names, files, places or coordinates. It needs migration v102
# (survey_jobs); without it the query stops and says so.
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\autosurvey-metrics.ps1"
#
# Each line is a measure and its value. Send Claude the lines: they go in docs/survey/METRICS.md under their date.
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20")
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

$query = @'
docker exec -i supabase-db psql -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 <<'SQL'
begin read only;
with gen as (
  -- Each project's Generate Plan run. A run silent for 15 minutes counts as cut off, as its card shows it (no timer runs the sweep yet).
  select distinct on (project_id) project_id,
    case when state = 'running' and updated_at < now() - interval '15 minutes' then 'interrupted' else state end as state,
    coalesce((result->>'finishedLater')::boolean, false) as later,
    stages
  from public.survey_jobs
  where kind = 'generate' and started_at > now() - interval '30 days'
  order by project_id, started_at
), draft as (
  -- The plan AutoSurvey drew: the first version whose note says so.
  select g.project_id, min(d.version) as version, min(d.created_at) as at
  from gen g join public.survey_drawings d on d.project_id = g.project_id and d.note like 'Drawn by AutoSurvey%'
  group by g.project_id
), after_draft as (
  -- What was saved after it: confirmations and near misses kept are one press each; a sketch read is the machine's; the rest are edits.
  select dr.project_id,
    count(d.id) filter (where coalesce(d.note, '') ~ '^(Confirmed|Kept as surveyed|To check again): ') as confirms,
    count(d.id) filter (where coalesce(d.note, '') !~ '^(Confirmed|Kept as surveyed|To check again): ' and coalesce(d.note, '') !~ '^Read .+ with ') as edits
  from draft dr left join public.survey_drawings d on d.project_id = dr.project_id and d.version > dr.version
  group by dr.project_id
), approved as (
  select dr.project_id, extract(epoch from (min(a.approved_at) - dr.at)) as secs
  from draft dr join public.survey_approvals a on a.project_id = dr.project_id and a.drawing_version >= dr.version
  group by dr.project_id, dr.at
), timed as (
  -- Upload to drawn plan on the server: the import and drawing stages, for runs that measured both and finished without a cut-off.
  select (select sum((st->>'ms')::numeric) from jsonb_array_elements(g.stages) st where st->>'id' in ('import', 'draw')) as ms
  from gen g
  where g.state = 'done' and not g.later
    and (select count(*) from jsonb_array_elements(g.stages) st where st->>'id' in ('import', 'draw') and st ? 'ms') = 2
), exported as (
  select dr.project_id,
    count(x.id) filter (where x.kind = 'pdf' and coalesce(x.options->>'content', '') = '') as plan_pdfs,
    count(x.id) as files
  from draft dr left join public.survey_exports x on x.project_id = dr.project_id
  group by dr.project_id
), reads as (
  -- Reading sketches and old plans from photos (both are survey_read): the only AI a generated plan can use.
  select status, input_tokens, output_tokens, model
  from public.ai_credit_ledger
  where operation = 'survey_read' and created_at > now() - interval '30 days'
)
select 'plans generated in the last 30 days', count(*)::text from gen
union all select 'plans drawn by AutoSurvey', count(*)::text from draft
union all select 'runs stopped by a failed stage', count(*) filter (where state = 'failed')::text from gen
union all select 'runs cut off', count(*) filter (where state = 'interrupted')::text from gen
union all select 'runs finished after a cut-off', count(*) filter (where state = 'done' and later)::text from gen
union all select 'median upload to drawn plan on the server (s), ' || count(*) || ' measured', coalesce(round((percentile_cont(0.5) within group (order by ms))::numeric / 1000, 2)::text, 'none') from timed
union all select 'median edits after the draft', coalesce(round((percentile_cont(0.5) within group (order by edits))::numeric, 1)::text, 'none') from after_draft
union all select 'plans with no edit after the draft', count(*) filter (where edits = 0)::text from after_draft
union all select 'median confirmations after the draft', coalesce(round((percentile_cont(0.5) within group (order by confirms))::numeric, 1)::text, 'none') from after_draft
union all select 'plans approved at least once', count(*)::text from approved
union all select 'median draft to approval (h)', coalesce(round((percentile_cont(0.5) within group (order by secs))::numeric / 3600, 1)::text, 'none') from approved
union all select 'plans with the plan PDF exported', count(*) filter (where plan_pdfs > 0)::text from exported
union all select 'median files exported per plan', coalesce(round((percentile_cont(0.5) within group (order by files))::numeric, 1)::text, 'none') from exported
union all select 'AI photo reads', count(*)::text from reads
union all select 'AI photo reads refunded', count(*) filter (where status = 'refunded')::text from reads
union all select 'median tokens per AI photo read (in, out)', coalesce(round((percentile_cont(0.5) within group (order by input_tokens))::numeric)::text || ', ' || round((percentile_cont(0.5) within group (order by output_tokens))::numeric)::text, 'none') from reads where status = 'settled'
union all select 'AI photo read models', coalesce(string_agg(distinct model, ', '), 'none') from reads where status = 'settled';
rollback;
SQL
'@
Write-Host "Reading AutoSurvey's success metrics on production (nothing is changed)" -ForegroundColor Cyan
($query -replace "`r", "") | ssh @ssh "farbaek@$Server" "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { Write-Host "The query didn't finish. If it says survey_jobs doesn't exist, migration v102 isn't applied yet. Send Claude the lines above." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "Done. Send Claude these lines." -ForegroundColor Green
