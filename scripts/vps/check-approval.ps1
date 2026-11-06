# Why a change won't apply: reads what the database and its gateway recorded about it, and changes nothing.
# It prints error lines, open database transactions, timeout settings, and this one task's state and file
# revisions. It never prints file contents, keys or the server's settings file. Auto mode refuses these reads
# for Claude, so run it in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\check-approval.ps1"
#
# It also saves what it printed to D:\FarbaekWork\tmp\approval-check.txt, so Claude can read it from there.
param(
  [string]$Task = "403b14d1-a5cb-4218-a603-6830bdf3eb7e",
  [string]$Since = "8h",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps",
  [string]$SaveTo = "D:\FarbaekWork\tmp\approval-check.txt"
)

if ($Task -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { Write-Host "That isn't a task id." -ForegroundColor Red; exit 1 }
if ($Since -notmatch '^\d+[mh]$') { Write-Host "Since needs a time like 8h." -ForegroundColor Red; exit 1 }

# One bash script on standard input: no quotes pass through Windows' argument handling.
$remote = @'
exec 2>&1
echo "== Containers"
docker ps --format '{{.Names}}: {{.Status}}' | sort
echo
echo "== The gateway and API on this approval"
for c in $(docker ps --format '{{.Names}}' | grep -E 'envoy|rest'); do
  echo "-- $c"
  docker logs --since __SINCE__ "$c" 2>&1 | grep -a 'app_apply_proposal' | cut -c1-240 | tail -n 8
done
echo
echo "== Database errors"
docker logs --since __SINCE__ supabase-db 2>&1 | grep -aE 'ERROR|FATAL|PANIC|deadlock|canceling|timeout' | cut -c1-240 | tail -n 30
echo
echo "== App warnings and errors"
docker logs --since __SINCE__ farbaek-app 2>&1 | grep -aiE '"level":"(warn|error)"|fetch failed|timeout|UND_ERR' | cut -c1-240 | tail -n 20
echo
echo "== Database"
docker exec -i supabase-db psql -h localhost -U postgres -d postgres -AtF ' | ' <<'SQL'
select 'open transaction', pid, usename, state, wait_event_type, wait_event, round(extract(epoch from now() - xact_start))::int || 's', left(regexp_replace(query, '\s+', ' ', 'g'), 110)
  from pg_stat_activity where xact_start is not null and pid <> pg_backend_pid() and backend_type = 'client backend' order by xact_start;
select 'prepared transactions', count(*) from pg_prepared_xacts;
select 'role setting', rolname, c from pg_roles, unnest(rolconfig) c where c ilike '%timeout%';
select 'database setting', c from pg_db_role_setting s, unnest(s.setconfig) c where c ilike '%timeout%';
select 'setting', name, setting from pg_settings where name in ('statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout', 'log_destination', 'logging_collector', 'log_min_messages');
select 'task', state, version, mode, project_id from public.tasks where id = '__TASK__';
select 'proposal', id, status, expires_at, policy ->> 'outcome', jsonb_array_length(changes), pg_column_size(changes) from public.change_proposals where task_id = '__TASK__' order by created_at desc limit 3;
select 'file', c.value ->> 'path', 'made from revision ' || (c.value ->> 'base_revision'), 'now at revision ' || coalesce(f.revision::text, 'none'), coalesce(f.size_bytes, 0) || ' bytes'
  from public.change_proposals p cross join lateral jsonb_array_elements(p.changes) c(value)
  left join public.project_files f on f.project_id = p.project_id and f.path = c.value ->> 'path'
  where p.task_id = '__TASK__' and p.status = 'pending';
select 'proofpacks in this project', count(*), max(seq) from public.proofpacks where project_id = (select project_id from public.tasks where id = '__TASK__');
SQL
# Windows adds a line ending to the last line, which has to stay clear of the SQL marker above.
'@

$remote = $remote.Replace("__TASK__", $Task).Replace("__SINCE__", $Since)
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
Write-Host "Reading the server's records. This changes nothing..." -ForegroundColor Cyan
$answer = ($remote -replace "`r", "") | ssh -i $Key -o StrictHostKeyChecking=accept-new "farbaek@$Server" "bash -s"
if ($LASTEXITCODE -ne 0) { Write-Host "The server didn't answer. Check the connection and try again." -ForegroundColor Red; exit 1 }
$answer | ForEach-Object { Write-Host $_ }
try {
  New-Item -ItemType Directory -Force -Path (Split-Path $SaveTo) | Out-Null
  $answer | Set-Content -LiteralPath $SaveTo -Encoding UTF8
  Write-Host ""
  Write-Host "Done. Tell Claude. It's saved in $SaveTo" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "It couldn't be saved, so copy everything above and send it to Claude." -ForegroundColor Yellow
}
