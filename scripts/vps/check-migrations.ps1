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
union all select 'v97 survey free ai', exists (select 1 from pg_catalog.pg_proc where proname = 'app_reserve_free_usage')
union all select 'v98 chat workspace', to_regclass('public.chat_conversations') is not null
union all select 'v99 chat search index', to_regclass('public.chat_messages_owner_idx') is not null
union all select 'v100 creative studios', to_regclass('public.studio_media') is not null
union all select 'v101 chat memory', to_regclass('public.chat_memories') is not null and to_regclass('public.chat_summaries') is not null and exists (select 1 from pg_catalog.pg_proc where proname = 'app_chat_for_share' and prosrc like '%''search''%')
union all select 'v102 survey jobs', to_regclass('public.survey_jobs') is not null and exists (select 1 from pg_catalog.pg_proc where proname = 'app_survey_job_update')
union all select 'v103 survey sketch photos', to_regclass('public.survey_sketch_photos') is not null and exists (select 1 from pg_catalog.pg_proc where proname = 'app_survey_keep_sketches')
union all select 'v104 survey more formats', exists (select 1 from pg_catalog.pg_constraint where conname = 'survey_sources_format_check' and pg_catalog.pg_get_constraintdef(oid) like '%sokkialist%')
union all select 'v105 survey office profiles', to_regclass('public.survey_office_profiles') is not null and exists (select 1 from pg_catalog.pg_proc where proname = 'app_survey_profile_choose')
union all select 'v106 scheduled tasks', to_regclass('public.scheduled_tasks') is not null and to_regclass('public.scheduled_task_runs') is not null and exists (select 1 from pg_catalog.pg_proc where proname = 'app_scheduled_claim') and exists (select 1 from pg_catalog.pg_proc where proname = 'app_scheduled_run_finish' and pronargs = 10) and exists (select 1 from pg_catalog.pg_proc where proname = 'app_scheduled_tasks_export') and exists (select 1 from pg_catalog.pg_trigger where tgname = 'scheduled_tasks_leave_with_member') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'scheduled_tasks' and column_name = 'resume_at')
union all select 'v107 stale usage', exists (select 1 from pg_catalog.pg_proc where proname = 'app_release_stale_usage') and exists (select 1 from pg_catalog.pg_constraint where conname = 'ai_credit_ledger_refund_reason_check' and pg_catalog.pg_get_constraintdef(oid) like '%interrupted%')
union all select 'v108 personal agents', to_regclass('public.personal_agents') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'scheduled_tasks' and column_name = 'personal_agent_id') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'scheduled_task_runs' and column_name = 'note') and exists (select 1 from pg_catalog.pg_proc where proname = 'app_personal_agent_save' and pronargs = 13) and exists (select 1 from pg_catalog.pg_proc where proname = 'app_personal_agent_archive') and exists (select 1 from pg_catalog.pg_proc where proname = 'app_personal_agent_notes_clear') and exists (select 1 from pg_catalog.pg_proc where proname = 'app_personal_agent_run_context') and exists (select 1 from pg_catalog.pg_proc where proname = 'app_scheduled_run_note') and exists (select 1 from pg_catalog.pg_proc where proname = 'app_personal_agents_export') and exists (select 1 from pg_catalog.pg_trigger where tgname = 'personal_agents_leave_with_member') and exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'scheduled_tasks_personal_agent')
union all select 'v109 task links', to_regclass('public.scheduled_task_links') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'scheduled_task_links' and column_name = 'min_seconds') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'scheduled_tasks' and column_name = 'link_due') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'scheduled_task_runs' and column_name = 'from_link') and exists (select 1 from pg_catalog.pg_proc where proname = 'app_scheduled_link_create' and pronargs = 5) and exists (select 1 from pg_catalog.pg_proc where proname = 'app_scheduled_link_revoke') and exists (select 1 from pg_catalog.pg_proc where proname = 'app_scheduled_link_fire' and pronargs = 4) and exists (select 1 from pg_catalog.pg_proc where proname = 'app_scheduled_run_payload') and exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'scheduled_task_links_live') and not has_column_privilege('authenticated', 'public.scheduled_task_links', 'secret_hash', 'select');
rollback;
SQL
'@
Write-Host "Reading which migrations production has (nothing is changed)" -ForegroundColor Cyan
($check -replace "`r", "") | ssh @ssh "farbaek@$Server" "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { Write-Host "The check didn't finish. Send Claude the lines above." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "Done. Send Claude these lines." -ForegroundColor Green
