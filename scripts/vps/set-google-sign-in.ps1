# Turns on signing in with Google on www.farbaek.com (ADR 0115), once the
# change is merged and deployed. The iPhone and Android apps sign in through
# the website, so they get it too.
#
# First make the OAuth client: console.cloud.google.com > Google Auth
# Platform > Clients > Create client > Web application, named "Farbaek
# website", with the authorized redirect URI
#   https://api.farbaek.com/auth/v1/callback
# then Create, and Download JSON. Google shows the secret only then: the file
# is named client_secret_....json.
#
# This asks where that file is, reads it, checks it's Farbaek's web client,
# and saves its id and secret in Supabase Auth's settings, then restarts Auth.
# Nothing is shown on screen or kept on this computer besides the file you
# downloaded. Run, in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-google-sign-in.ps1"
#
# To switch Google sign-in off again (people who used it sign in with email,
# with the same address):
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-google-sign-in.ps1" -Off
param(
  [switch]$Off,
  [string]$File = "",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")
$authEnv = "/opt/farbaek/supabase/docker/.env"
$callback = "https://api.farbaek.com/auth/v1/callback"
$restartAuth = "cd /opt/farbaek/supabase/docker && docker compose up -d auth >/dev/null 2>&1 && sleep 5 && docker exec supabase-auth printenv GOTRUE_EXTERNAL_GOOGLE_ENABLED"

ssh @ssh "grep -q GOTRUE_EXTERNAL_GOOGLE_ENABLED /opt/farbaek/app/deploy/vps/supabase/compose.farbaek.yaml"
if ($LASTEXITCODE -ne 0) { Write-Host "The server doesn't have the Google sign-in change yet. Merge it, wait for the deploy, then run this again. Nothing changed." -ForegroundColor Red; exit 1 }

if ($Off) {
  Write-Host "Switching Google off in Supabase Auth..." -ForegroundColor Cyan
  "FARBAEK_GOOGLE_SIGN_IN=false" | ssh @ssh "farbaek-set-env --file $authEnv"
  $state = ssh @ssh $restartAuth
  if ($state -ne "false") { Write-Host "Auth didn't restart with Google off. Run: ssh farbaek@$Server, then: $restartAuth" -ForegroundColor Red; exit 1 }
  Write-Host "Done. The sign-in page stops showing Continue with Google within five minutes." -ForegroundColor Green
  exit 0
}

$path = if ($File) { $File } else { (Read-Host -Prompt "Path to the client_secret_....json file you downloaded (drag it here)").Trim().Trim('"') }
if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "There's no file at that path, so nothing changed. Run it again and drag the file in before pressing Enter." -ForegroundColor Red; exit 1 }

try { $client = (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json).web } catch { $client = $null }
if (-not $client) { Write-Host "That file isn't a Google OAuth client for a web application, so nothing changed." -ForegroundColor Red; exit 1 }
$id = [string]$client.client_id
$secret = [string]$client.client_secret
$client = $null
# Checked without showing the secret.
if ($id -notmatch '^[0-9]{6,20}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$' -or $secret -notmatch '^[A-Za-z0-9_-]{20,100}$') { $secret = $null; Write-Host "That file doesn't hold a web client's id and secret, so nothing changed." -ForegroundColor Red; exit 1 }
$uris = @((Get-Content -LiteralPath $path -Raw | ConvertFrom-Json).web.redirect_uris)
if ($uris -notcontains $callback) { $secret = $null; Write-Host "That client's redirect URIs don't include $callback. Add it in Google Cloud, download the file again, then run this again. Nothing changed." -ForegroundColor Red; exit 1 }

Write-Host "Saving the client ($id) in Supabase Auth and restarting it (about 10 seconds)..." -ForegroundColor Cyan
"FARBAEK_GOOGLE_CLIENT_ID=$id`nFARBAEK_GOOGLE_SECRET=$secret`nFARBAEK_GOOGLE_SIGN_IN=true" | ssh @ssh "farbaek-set-env --file $authEnv"
$saved = $LASTEXITCODE
$secret = $null
if ($saved -ne 0) { Write-Host "Auth's settings weren't saved, so nothing changed." -ForegroundColor Red; exit 1 }
$state = ssh @ssh $restartAuth
if ($state -ne "true") { Write-Host "Auth didn't restart with Google on. Run this script again." -ForegroundColor Red; exit 1 }

$probe = "curl -s -o /dev/null -w '%{redirect_url}' 'https://api.farbaek.com/auth/v1/authorize?provider=google&redirect_to=https://www.farbaek.com/auth/callback'"
$to = ssh @ssh $probe
if ($to -like "https://accounts.google.com/*client_id=$id*") {
  Write-Host "Done. Auth sends people to Google. www.farbaek.com/sign-in shows Continue with Google within five minutes." -ForegroundColor Green
  Write-Host "Move the client_secret file out of Downloads and keep it with your other keys." -ForegroundColor Green
} else {
  Write-Host "Auth restarted, but it doesn't send people to Google yet. Ask Claude to look; the button stays hidden until it does." -ForegroundColor Yellow
  exit 1
}
