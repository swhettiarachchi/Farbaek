# Turns on the browser check at sign-in (ADR 0067): Cloudflare Turnstile.
# Asks for the widget's site key (public) and secret key (stars as you paste),
# then:
#   1. saves the site key in the app's settings and restarts the app, so the
#      sign-in page shows the check and sends its token;
#   2. saves the secret in Supabase Auth's settings and restarts Auth, which
#      from then on refuses sign-in emails without a valid token.
# The office sends its codes with the server's secret key, which Auth doesn't
# check. Nothing is saved on this computer.
#
# Make the widget first: Cloudflare dashboard > Turnstile > Add widget, name it
# "Farbaek sign-in", hostname www.farbaek.com, mode Managed. Then run, in your
# own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-turnstile.ps1"
#
# To switch it off again (Auth first, then the page):
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-turnstile.ps1" -Off
param(
  [switch]$Off,
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")
$authEnv = "/opt/farbaek/supabase/docker/.env"
$restartAuth = "cd /opt/farbaek/supabase/docker && docker compose up -d auth >/dev/null 2>&1 && sleep 5 && docker exec supabase-auth printenv GOTRUE_SECURITY_CAPTCHA_ENABLED"

ssh @ssh "grep -q GOTRUE_SECURITY_CAPTCHA_ENABLED /opt/farbaek/app/deploy/vps/supabase/compose.farbaek.yaml"
if ($LASTEXITCODE -ne 0) { Write-Host "The server doesn't have the sign-in check change yet. Merge it, wait for the deploy, then run this again. Nothing changed." -ForegroundColor Red; exit 1 }

if ($Off) {
  Write-Host "Switching the check off in Supabase Auth..." -ForegroundColor Cyan
  "FARBAEK_CAPTCHA_ENABLED=false" | ssh @ssh "farbaek-set-env --file $authEnv"
  $state = ssh @ssh $restartAuth
  if ($state -ne "false") { Write-Host "Auth didn't restart with the check off. Run: ssh farbaek@$Server, then: $restartAuth" -ForegroundColor Red; exit 1 }
  Write-Host "Removing the check from the sign-in page (3 to 5 minutes)..." -ForegroundColor Cyan
  "TURNSTILE_SITE_KEY=" | ssh @ssh farbaek-set-env
  ssh @ssh "farbaek-deploy --again"
  if ($LASTEXITCODE -ne 0) { Write-Host "Auth no longer checks, but the app didn't restart. Run: ssh farbaek@$Server farbaek-deploy --again" -ForegroundColor Yellow; exit 1 }
  Write-Host "Done. Sign-in works without the browser check." -ForegroundColor Green
  exit 0
}

$site = (Read-Host -Prompt "Turnstile site key (public, starts with 0x)").Trim()
if ($site -notmatch '^[0-9A-Za-z_-]{10,100}$') { Write-Host "That doesn't look like a site key, so nothing changed." -ForegroundColor Red; exit 1 }

$secure = Read-Host -AsSecureString -Prompt "Turnstile secret key"
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $secret = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
# Checked without showing it: a wrong paste shouldn't end up on screen.
if ($secret -notmatch '^[0-9A-Za-z_-]{20,200}$' -or $secret -eq $site) { $secret = $null; Write-Host "That doesn't look like a secret key, so nothing changed." -ForegroundColor Red; exit 1 }

Write-Host "1 of 2: adding the check to the sign-in page (3 to 5 minutes)..." -ForegroundColor Cyan
"TURNSTILE_SITE_KEY=$site" | ssh @ssh farbaek-set-env
if ($LASTEXITCODE -ne 0) { $secret = $null; Write-Host "The server didn't save the site key, so nothing changed." -ForegroundColor Red; exit 1 }
ssh @ssh "farbaek-deploy --again"
if ($LASTEXITCODE -ne 0) { $secret = $null; Write-Host "The site key is saved, but the app didn't restart. Run this script again." -ForegroundColor Red; exit 1 }

Write-Host "2 of 2: asking Supabase Auth to check every sign-in..." -ForegroundColor Cyan
"FARBAEK_CAPTCHA_SECRET=$secret`nFARBAEK_CAPTCHA_ENABLED=true" | ssh @ssh "farbaek-set-env --file $authEnv"
$saved = $LASTEXITCODE
$secret = $null
if ($saved -ne 0) { Write-Host "Auth's settings weren't saved. The page shows the check, but Auth doesn't enforce it yet. Run this script again." -ForegroundColor Yellow; exit 1 }
$state = ssh @ssh $restartAuth
if ($state -ne "true") { Write-Host "Auth didn't restart with the check on. Run this script with -Off, then again without it." -ForegroundColor Red; exit 1 }

Write-Host "Done. Now check both sign-ins once:" -ForegroundColor Green
Write-Host "  - https://www.farbaek.com/sign-in sends you a link;"
Write-Host "  - https://officespace.farbaek.com sends you a code."
Write-Host "If either fails, run this script with -Off and tell Claude what it said."
