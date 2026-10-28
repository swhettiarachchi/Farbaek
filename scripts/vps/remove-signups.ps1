# Removes every Farbaek account that signed up on one day (Sri Lanka time), for
# example a wave of spam or test sign-ups. Run by the owner, never by Claude:
# it permanently deletes accounts.
#
# For each account it does exactly what "Delete account" in Settings does
# (ADR 0064):
#   - workspaces where the person is the only member are deleted, with their
#     projects, files and sites;
#   - the person is taken out of shared workspaces;
#   - the sign-in record is deleted.
# An account with a paid plan, or one that's the last owner of a shared
# workspace, is kept and listed with the reason. Farbaek staff accounts are
# never touched.
#
# It shows the list first and deletes nothing until you type DELETE and the
# number of accounts. Run, in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\remove-signups.ps1"
#
# Options:
#   -Date 2026-10-28                     another day (Sri Lanka time); default today
#   -Keep "me@example.com,you@x.com"     addresses to keep even if they signed up that day
#   -List                                only show the list, delete nothing
param(
  [string]$Date = "",
  [string]$Keep = "",
  [switch]$List,
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")
$psql = "docker exec -i supabase-db psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -AtF '|'"

if (-not $Date) {
  $Date = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, "Sri Lanka Standard Time").ToString("yyyy-MM-dd")
}
if ($Date -notmatch '^\d{4}-\d{2}-\d{2}$') { Write-Host "Use a date like 2026-10-28." -ForegroundColor Red; exit 1 }

$keepList = @($Keep.Split(",") | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
foreach ($k in $keepList) {
  if ($k -notmatch '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$') { Write-Host "'$k' isn't an email address, so nothing changed." -ForegroundColor Red; exit 1 }
}
$keepSql = if ($keepList.Count) { "array[" + (($keepList | ForEach-Object { "'" + $_ + "'" }) -join ",") + "]::text[]" } else { "array[]::text[]" }

$listSql = @"
select u.id, u.email, to_char(u.created_at at time zone 'Asia/Colombo', 'HH24:MI'),
  coalesce((select string_agg(p.org_name || ' (' || p.outcome || ')', '; ' order by p.org_name) from public.app_account_deletion_plan(u.id) p), 'no workspace')
from auth.users u
where (u.created_at at time zone 'Asia/Colombo')::date = '$Date'::date
  and not exists (select 1 from public.staff_members s where s.user_id = u.id)
  and lower(coalesce(u.email, '')) <> all ($keepSql)
order by u.created_at;
"@

Write-Host "Reading the accounts that signed up on $Date (Sri Lanka time)..." -ForegroundColor Cyan
$rows = @($listSql | ssh @ssh $psql)
if ($LASTEXITCODE -ne 0) { Write-Host "The list couldn't be read, so nothing changed." -ForegroundColor Red; exit 1 }
$accounts = @()
foreach ($row in $rows) {
  $parts = $row.Split("|")
  if ($parts.Count -lt 4 -or $parts[0] -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { continue }
  $accounts += [pscustomobject]@{ Id = $parts[0]; Email = $parts[1]; Time = $parts[2]; Workspaces = $parts[3] }
}
if ($accounts.Count -eq 0) { Write-Host "No accounts (other than staff and the ones you keep) signed up on $Date. Nothing to do." -ForegroundColor Green; exit 0 }

Write-Host ""
Write-Host "$($accounts.Count) account(s) signed up on ${Date}:" -ForegroundColor Yellow
$n = 0
foreach ($a in $accounts) {
  $n++
  Write-Host ("{0,3}. {1}  at {2}  {3}" -f $n, $a.Email, $a.Time, $a.Workspaces)
}
Write-Host ""
Write-Host "'deleted' workspaces go with the account; 'left' means it's taken out of a shared workspace; 'blocked' accounts are kept." -ForegroundColor DarkGray
if ($List) { Write-Host "List only: nothing was deleted." -ForegroundColor Green; exit 0 }

$expected = "DELETE $($accounts.Count)"
$typed = Read-Host -Prompt "This can't be undone. To delete these accounts, type $expected"
if ($typed.Trim() -cne $expected) { Write-Host "That didn't match, so nothing was deleted." -ForegroundColor Green; exit 0 }

# One block per account: if one is blocked or fails, it's kept and the rest go ahead.
$blocks = foreach ($a in $accounts) {
  $label = ($a.Email -replace "'", "''")
  @"
do `$`$ begin
  perform public.app_delete_account_data('$($a.Id)'::uuid);
  delete from auth.users where id = '$($a.Id)'::uuid;
  raise notice 'deleted|%', '$label';
exception when others then
  raise notice 'kept|%|%', '$label', sqlerrm;
end `$`$;
"@
}
Write-Host "Deleting..." -ForegroundColor Cyan
$out = ($blocks -join "`n") | ssh @ssh "docker exec -i supabase-db psql -h localhost -U postgres -d postgres -q" 2>&1
$deleted = 0; $kept = 0
foreach ($line in $out) {
  $text = "$line"
  if ($text -match 'NOTICE:\s+deleted\|(.*)$') { $deleted++; Write-Host "  deleted  $($Matches[1])" -ForegroundColor Green }
  elseif ($text -match 'NOTICE:\s+kept\|([^|]*)\|(.*)$') { $kept++; Write-Host "  kept     $($Matches[1])  ($($Matches[2]))" -ForegroundColor Yellow }
}
Write-Host ""
Write-Host "Done: $deleted deleted, $kept kept. Last night's backup still has them if one was removed by mistake (docs/deploy/vps.md, restoring)." -ForegroundColor Green
