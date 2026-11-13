# The two server steps of a launch that only you can run (auto mode refuses them for Claude):
#
#   1. Restarts Supabase Auth if it hasn't read the settings that changed in the repo (ADR 0176). Only Auth
#      restarts, for a few seconds, and people who are signed in stay signed in.
#   2. Copies the desktop app's installers to the server, comparing each one's SHA-256 before it goes live,
#      as docs/agent/README.md describes under "Publishing a release". Old installers stay.
#
# If the connection drops or stalls, it carries on from where it stopped, however many times that takes, and a
# file that's already there isn't sent again. You can also close it and run it again at any time.
# Nothing here reads a secret, and nothing is deleted. Run it in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\release\publish-desktop.ps1"
#
# A file that's missing from desktop\release is skipped, and it says so.
param(
  [string]$Version = "0.12.0",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps",
  [int]$Tries = 60,
  # A question to the server gets this long. Finding a file's fingerprint takes seconds.
  [int]$QuestionSeconds = 120,
  # One connection sends for this long, then a fresh one carries on. Reconnecting costs seconds, and a stalled one costs no more than this.
  [int]$SendSeconds = 300
)

$options = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes", "-o", "ConnectTimeout=30", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=8")
$target = "farbaek@$Server"
$release = (Resolve-Path (Join-Path $PSScriptRoot "..\..\desktop\release")).Path
$downloads = "/opt/farbaek/downloads"
$ssh = (Get-Command ssh -ErrorAction Stop).Source
$sftp = (Get-Command sftp -ErrorAction Stop).Source

# A connection can stall with nothing to say so, and ssh's own time limits don't cover every stage of one. A stalled
# question once sat for an hour with no message. So every call here has a limit of its own.
function Invoke-Limited([string]$file, [string[]]$arguments, [int]$seconds, [bool]$capture) {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $file
  $info.Arguments = ($arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join " "
  $info.UseShellExecute = $false
  $info.RedirectStandardInput = $true
  if ($capture) { $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true }
  $process = [System.Diagnostics.Process]::Start($info)
  $process.StandardInput.Close()
  $output = $null
  if ($capture) {
    $output = $process.StandardOutput.ReadToEndAsync()
    [void]$process.StandardError.ReadToEndAsync()
  }
  if (-not $process.WaitForExit($seconds * 1000)) {
    # sftp runs its connection as a child process, which would otherwise carry on without it and keep its files open.
    & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
    [void]$process.WaitForExit(5000)
    return @{ ok = $false; timedOut = $true; text = $null }
  }
  if ($process.ExitCode -ne 0) { return @{ ok = $false; timedOut = $false; text = $null } }
  $text = if ($capture) { $output.Result.Trim() } else { "" }
  return @{ ok = $true; timedOut = $false; text = $text }
}

function Remote([string]$command) {
  # A dropped or stalled connection answers with nothing, which every caller treats as "ask again".
  $result = Invoke-Limited $ssh ($options + @($target, $command)) $QuestionSeconds $true
  return $result.text
}

function Send-Resuming([string]$path, [string]$part, [long]$size) {
  $batch = New-TemporaryFile
  $local = $path -replace '\\', '/'
  try {
    Set-Content -LiteralPath $batch.FullName -Encoding ascii -Value @("progress", "reput `"$local`" `"$part`"")
    for ($try = 1; $try -le $Tries; $try++) {
      $sent = Remote "touch '$part' && stat -c %s '$part'"
      if ($null -ne $sent -and $sent -match '^\d+$') {
        if ([long]$sent -ge $size) { return $true }
        Write-Host ("  {0} of {1} MB there so far..." -f [math]::Round([long]$sent / 1MB), [math]::Round($size / 1MB))
        $result = Invoke-Limited $sftp ($options + @("-b", $batch.FullName, $target)) $SendSeconds $false
        if ($result.ok) { return $true }
        # This one is expected on a big file: the next connection carries on straight away.
        if ($result.timedOut) { continue }
      }
      Write-Host "  The connection dropped. Carrying on from where it stopped in a minute (try $try of $Tries)..." -ForegroundColor Yellow
      Start-Sleep -Seconds 60
    }
    return $false
  } finally {
    Remove-Item -LiteralPath $batch.FullName -ErrorAction SilentlyContinue
  }
}

Write-Host "1 of 2: making sure Supabase Auth has its new settings..." -ForegroundColor Cyan
$limit = Remote "docker exec supabase-auth printenv GOTRUE_RATE_LIMIT_EMAIL_SENT"
if ($null -eq $limit) {
  # No answer says nothing about Auth, so this is no reason to restart it.
  Write-Host "The server didn't answer. Nothing was changed. Run this again in a few minutes." -ForegroundColor Red
  exit 1
}
if ($limit -ne "300") {
  $limit = Remote "cd /opt/farbaek/supabase/docker && docker compose up -d auth >/dev/null 2>&1 && sleep 6 && docker exec supabase-auth printenv GOTRUE_RATE_LIMIT_EMAIL_SENT"
}
if ($limit -ne "300") {
  Write-Host "Auth didn't come back with the new settings (it said: $limit). Tell Claude. Sign-in may need checking." -ForegroundColor Red
  exit 1
}
Write-Host "Auth is running, and allows 300 sign-in emails an hour." -ForegroundColor Green

Write-Host "2 of 2: copying the installers to the server..." -ForegroundColor Cyan
$files = @("Farbaek-Agent-Setup-$Version.exe", "Farbaek-Agent-$Version-mac.dmg", "Farbaek-Agent-$Version-linux-x86_64.AppImage")
$failed = $false
foreach ($name in $files) {
  $path = Join-Path $release $name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Write-Host "  $name isn't in desktop\release, so it was skipped." -ForegroundColor Yellow
    continue
  }
  $local = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower()
  $size = (Get-Item -LiteralPath $path).Length
  if ((Remote "sha256sum '$downloads/$name' 2>/dev/null | cut -d' ' -f1") -eq $local) {
    Write-Host "  $name is already on the server, and its fingerprint matches." -ForegroundColor Green
    continue
  }
  $part = "$downloads/.$name.part"
  Write-Host "  Sending $name ($([math]::Round($size / 1MB)) MB)..."
  if (-not (Send-Resuming $path $part $size)) {
    Write-Host "  $name still isn't all there. Run this again later: it carries on from where it stopped." -ForegroundColor Red
    $failed = $true
    continue
  }
  $remote = Remote "sha256sum '$part' | cut -d' ' -f1"
  if ($null -eq $remote) {
    Write-Host "  $name is there, but the check was interrupted. Run this again: nothing is lost." -ForegroundColor Red
    $failed = $true
    continue
  }
  if ($remote -ne $local) {
    # A real difference means the partial copy can't be trusted.
    Remote "rm -f '$part'" | Out-Null
    Write-Host "  $name arrived different from what was sent, so it wasn't kept. Run this again." -ForegroundColor Red
    $failed = $true
    continue
  }
  if ((Remote "mv '$part' '$downloads/$name' && echo moved") -ne "moved") {
    Write-Host "  $name is there, but the last step was interrupted. Run this again: nothing is lost." -ForegroundColor Red
    $failed = $true
    continue
  }
  Write-Host "  $name is on the server, and its fingerprint matches." -ForegroundColor Green
}
if ($failed) { Write-Host "Something didn't finish. Run this again, then tell Claude." -ForegroundColor Red; exit 1 }
Write-Host "Done. Tell Claude, who'll check the downloads on the live site." -ForegroundColor Green
