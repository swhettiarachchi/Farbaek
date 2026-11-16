# Reports which recent migrations production's database has, by looking for what each one makes. It only reads, inside a
# read-only transaction, so it can't change anything. Production's self-hosted database has no migration ledger, so this is
# how to tell what's applied.
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\check-migrations.ps1"
#
# Each line says a migration and t (it's there) or f (it isn't). Send Claude the lines.
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20")
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

$check = @'
docker exec -i supabase-db psql -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 <<'SQL'
begin read only;
select 'v90 api keys', to_regclass('public.api_keys') is not null
union all select 'v91 project sharing', exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'guest_project_ids')
union all select 'v92 server hosting', exists (select 1 from pg_catalog.pg_proc where proname = 'app_record_launch_commit')
union all select 'v93 survey studio', to_regclass('public.survey_projects') is not null
union all select 'v94 survey drafting', exists (select 1 from pg_catalog.pg_proc where proname = 'app_survey_record_ai_draft')
union all select 'v95 instrument files', exists (select 1 from pg_catalog.pg_constraint where conname = 'survey_sources_format_check' and pg_catalog.pg_get_constraintdef(oid) like '%gsi%')
union all select 'v96 survey assistant', to_regclass('public.survey_assistant_turns') is not null
union all select 'v97 survey free ai', exists (select 1 from pg_catalog.pg_proc where proname = 'app_reserve_free_usage');
rollback;
SQL
'@
Write-Host "Reading which migrations production has (nothing is changed)" -ForegroundColor Cyan
($check -replace "`r", "") | ssh @ssh "farbaek@$Server" "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { Write-Host "The check didn't finish. Send Claude the lines above." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "Done. Send Claude these lines." -ForegroundColor Green
