# Turns on Sign in with Apple for Farbaek for iPhone (ADR 0113): Supabase Auth
# starts accepting Apple's identity tokens for com.farbaek.app, and the app
# server gets the Sign in with Apple key it needs to revoke a person's Apple
# sign-in when they delete their account (Apple requires this).
#
# First make the key: developer.apple.com > Certificates, Identifiers &
# Profiles > Keys > + > name it "Farbaek sign in", tick Sign in with Apple,
# click Configure next to it, choose the App ID com.farbaek.app, Save,
# Continue, Register, then Download. Apple lets you download it once: a file
# named AuthKey_XXXXXXXXXX.p8.
#
# This asks where that file is, reads it, checks it's a key, and sends it to
# the server with its Key ID (the ten characters in the file's name). Nothing
# is shown on screen or kept on this computer besides the file you downloaded.
# Run, in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-apple-sign-in.ps1"
#
# To switch Sign in with Apple off again (people who used it sign in with
# email instead, with the same address):
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-apple-sign-in.ps1" -Off
param(
  [switch]$Off,
  [string]$File = "",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")
$authEnv = "/opt/farbaek/supabase/docker/.env"
$restartAuth = "cd /opt/farbaek/supabase/docker && docker compose up -d auth >/dev/null 2>&1 && sleep 5 && docker exec supabase-auth printenv GOTRUE_EXTERNAL_APPLE_ENABLED"

ssh @ssh "test -f /opt/farbaek/app/src/server/auth/apple.ts && grep -q GOTRUE_EXTERNAL_APPLE_ENABLED /opt/farbaek/app/deploy/vps/supabase/compose.farbaek.yaml"
if ($LASTEXITCODE -ne 0) { Write-Host "The server doesn't have the Sign in with Apple change yet. Merge it, wait for the deploy, then run this again. Nothing changed." -ForegroundColor Red; exit 1 }

if ($Off) {
  Write-Host "Hiding the button in the app and restarting it (3 to 5 minutes)..." -ForegroundColor Cyan
  "APPLE_SIGN_IN=" | ssh @ssh "farbaek-set-env && farbaek-deploy --again"
  if ($LASTEXITCODE -ne 0) { Write-Host "The app didn't restart. Run: ssh farbaek@$Server farbaek-deploy --again" -ForegroundColor Yellow; exit 1 }
  Write-Host "Switching Apple off in Supabase Auth..." -ForegroundColor Cyan
  "FARBAEK_APPLE_SIGN_IN=false" | ssh @ssh "farbaek-set-env --file $authEnv"
  $state = ssh @ssh $restartAuth
  if ($state -ne "false") { Write-Host "The button is hidden, but Auth didn't restart with Apple off. Run: ssh farbaek@$Server, then: $restartAuth" -ForegroundColor Yellow; exit 1 }
  Write-Host "Done. The iPhone app offers Sign in with email only. The key stays on the server, so deleted accounts can still be revoked." -ForegroundColor Green
  exit 0
}

$path = if ($File) { $File } else { (Read-Host -Prompt "Path to the AuthKey_....p8 file for Sign in with Apple (drag it here)").Trim().Trim('"') }
if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "There's no file at that path, so nothing changed. Run it again and drag the file in before pressing Enter." -ForegroundColor Red; exit 1 }
$name = [IO.Path]::GetFileName($path)
if ($name -notmatch '^AuthKey_([A-Z0-9]{10})\.p8$') { Write-Host "The file should be named AuthKey_ followed by ten letters and digits, then .p8. Nothing changed." -ForegroundColor Red; exit 1 }
$keyId = $Matches[1]

$pem = [IO.File]::ReadAllText($path)
if ($pem -notmatch '-----BEGIN PRIVATE KEY-----' -or $pem.Length -gt 2000) { $pem = $null; Write-Host "That file isn't an Apple key, so nothing changed." -ForegroundColor Red; exit 1 }
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pem.Trim()))
$pem = $null

Write-Host "1 of 2: letting Supabase Auth accept Apple's sign-ins for com.farbaek.app..." -ForegroundColor Cyan
"FARBAEK_APPLE_SIGN_IN=true" | ssh @ssh "farbaek-set-env --file $authEnv"
if ($LASTEXITCODE -ne 0) { $b64 = $null; Write-Host "Auth's settings weren't saved, so nothing changed." -ForegroundColor Red; exit 1 }
$state = ssh @ssh $restartAuth
if ($state -ne "true") { $b64 = $null; Write-Host "Auth didn't restart with Apple on. Run this script again." -ForegroundColor Red; exit 1 }

Write-Host "2 of 2: saving the key ($keyId) and showing the button in the app (3 to 5 minutes)..." -ForegroundColor Cyan
"APPLE_SIGN_IN_KEY_P8=$b64`nAPPLE_SIGN_IN_KEY_ID=$keyId`nAPPLE_SIGN_IN=on" | ssh @ssh "farbaek-set-env && farbaek-deploy --again"
$saved = $LASTEXITCODE
$b64 = $null
if ($saved -ne 0) { Write-Host "The key may be saved, but the app didn't restart. Run this script again." -ForegroundColor Red; exit 1 }
Write-Host "Done. Open Farbaek for iPhone: the welcome screen shows Continue with Apple." -ForegroundColor Green
