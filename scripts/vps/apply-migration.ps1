# Applies one tested migration to production's database, in your own PowerShell window. It refuses unless the file's
# SHA-256 is the one Claude tested; the server checks the hash again before running anything; the whole file runs in
# one transaction, so a failure changes nothing; then it records the migration and reads back what it made.
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\apply-migration.ps1" -File "supabase\migrations\<file>.sql" -Sha256 <hash>
#
# Claude gives the exact line, with the hash, in the pull request that needs it. The commands go to the server on
# standard input, as set-google-play.ps1's do: Windows PowerShell mangles quotes in a command line.
param(
  [Parameter(Mandatory = $true)][string]$File,
  [Parameter(Mandatory = $true)][string]$Sha256,
  [string]$Check = "",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$path = if ([IO.Path]::IsPathRooted($File)) { $File } else { Join-Path $repo $File }
if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "There's no file at $path. Nothing changed." -ForegroundColor Red; exit 1 }
$want = $Sha256.Trim().ToLower()
if ($want -notmatch '^[0-9a-f]{64}$') { Write-Host "That isn't a SHA-256. Copy the whole line from the pull request. Nothing changed." -ForegroundColor Red; exit 1 }
# The hash is of the file with Unix line endings, so a Windows checkout's CRLF doesn't change it. That copy is what's sent.
$text = [IO.File]::ReadAllText($path, (New-Object System.Text.UTF8Encoding $false)) -replace "`r`n", "`n"
$copy = Join-Path ([IO.Path]::GetTempPath()) ("farbaek-" + [IO.Path]::GetFileName($path))
[IO.File]::WriteAllText($copy, $text, (New-Object System.Text.UTF8Encoding $false))
$have = (Get-FileHash -Algorithm SHA256 -LiteralPath $copy).Hash.ToLower()
if ($have -ne $want) { Remove-Item -LiteralPath $copy -ErrorAction SilentlyContinue; Write-Host "This file isn't the one that was tested (its SHA-256 is $have). Pull the branch again. Nothing changed." -ForegroundColor Red; exit 1 }

$name = [IO.Path]::GetFileNameWithoutExtension($path)
if ($name -notmatch '^(\d{14})_([a-z0-9_]+)$') { Write-Host "That isn't a migration file name. Nothing changed." -ForegroundColor Red; exit 1 }
$version = $Matches[1]
$label = $Matches[2]
if ($Check -match "[`r`n]") { Write-Host "The check must be one line. Nothing changed." -ForegroundColor Red; exit 1 }
$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20")
$remoteFile = "/tmp/farbaek-migration-$version.sql"
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

Write-Host "1 of 3: sending $name (SHA-256 $($want.Substring(0, 8))...)" -ForegroundColor Cyan
# scp copies the bytes as they are, so the server sees the same hash.
scp @ssh -q $copy "farbaek@${Server}:$remoteFile"
$sent = $LASTEXITCODE
Remove-Item -LiteralPath $copy -ErrorAction SilentlyContinue
if ($sent -ne 0) { Write-Host "The file couldn't be sent. Check the connection. Nothing changed." -ForegroundColor Red; exit 1 }

Write-Host "2 of 3: checking it on the server and applying it in one transaction" -ForegroundColor Cyan
$apply = @'
f=__FILE__
if [ "$(sha256sum "$f" | cut -c1-64)" != "__HASH__" ]; then echo HASH_MISMATCH; rm -f "$f"; exit 64; fi
docker exec -i supabase-db psql -U postgres -d postgres --single-transaction -v ON_ERROR_STOP=1 -q < "$f"
s=$?
rm -f "$f"
exit $s
'@
(($apply.Replace("__FILE__", $remoteFile).Replace("__HASH__", $want)) -replace "`r", "") | ssh @ssh "farbaek@$Server" "tr -d '\r' | bash -s"
$code = $LASTEXITCODE
# 64 is the hash check's own code. psql exits 3 when a statement fails, so 3 means the database refused the file.
if ($code -eq 64) { Write-Host "The server got a different file than the one tested. Nothing changed." -ForegroundColor Red; exit 1 }
if ($code -ne 0) { Write-Host "The database refused it (the ERROR line above says why), so the whole transaction was undone. Nothing changed. If it says something already exists, this migration is most likely applied already. Send Claude the lines above." -ForegroundColor Red; exit 1 }

Write-Host "3 of 3: recording it and reading back" -ForegroundColor Cyan
# Production's database (self-hosted) has no migration ledger, so it's recorded only where one exists.
$record = @'
docker exec -i supabase-db psql -U postgres -d postgres -Atq <<'SQL'
do $$ begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name) values ('__VERSION__', '__LABEL__') on conflict do nothing;
  end if;
end $$;
notify pgrst, 'reload schema';
__CHECK__
SQL
'@
(($record.Replace("__VERSION__", $version).Replace("__LABEL__", $label).Replace("__CHECK__", $Check)) -replace "`r", "") | ssh @ssh "farbaek@$Server" "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { Write-Host "Applied, but the record or read-back didn't finish. Send Claude the lines above." -ForegroundColor Yellow; exit 1 }

Write-Host ""
Write-Host "Done. $name is applied in production. Tell Claude, and it will check, then you can merge." -ForegroundColor Green
