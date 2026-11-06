# The two server steps of a launch that only you can run (auto mode refuses them for Claude):
#
#   1. Restarts Supabase Auth, so it reads settings that changed in the repo (ADR 0176). Only Auth restarts,
#      for a few seconds, and people who are signed in stay signed in.
#   2. Copies the desktop app's installers to the server, comparing each one's SHA-256 before it goes live,
#      as docs/agent/README.md describes under "Publishing a release". Old installers stay.
#
# Nothing here reads a secret, and nothing is deleted. Run it in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\release\publish-desktop.ps1"
#
# It's safe to run twice. A file that's missing from desktop\release is skipped, and it says so.
param(
  [string]$Version = "0.10.0",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")
$release = Join-Path $PSScriptRoot "..\..\desktop\release"
$downloads = "/opt/farbaek/downloads"

Write-Host "1 of 2: restarting Supabase Auth so it reads its new settings..." -ForegroundColor Cyan
$limit = ssh @ssh "cd /opt/farbaek/supabase/docker && docker compose up -d auth >/dev/null 2>&1 && sleep 6 && docker exec supabase-auth printenv GOTRUE_RATE_LIMIT_EMAIL_SENT"
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
  $part = "$downloads/.$name.part"
  Write-Host "  Sending $name ($([math]::Round((Get-Item -LiteralPath $path).Length / 1MB)) MB)..."
  scp -i $Key -o StrictHostKeyChecking=accept-new $path "farbaek@${Server}:$part"
  if ($LASTEXITCODE -ne 0) { Write-Host "  Sending $name failed. Nothing changed for that file." -ForegroundColor Red; $failed = $true; continue }
  $remote = ssh @ssh "sha256sum '$part' | cut -d' ' -f1"
  if ($remote -ne $local) {
    ssh @ssh "rm -f '$part'"
    Write-Host "  $name arrived different from what was sent, so it wasn't kept. Run this again." -ForegroundColor Red
    $failed = $true
    continue
  }
  ssh @ssh "mv '$part' '$downloads/$name'"
  Write-Host "  $name is on the server, and its fingerprint matches." -ForegroundColor Green
}
if ($failed) { Write-Host "Something didn't finish. Run this again, then tell Claude." -ForegroundColor Red; exit 1 }
Write-Host "Done. Tell Claude, who'll switch the Desktop app page to this version." -ForegroundColor Green
