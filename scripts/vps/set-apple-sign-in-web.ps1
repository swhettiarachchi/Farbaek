# Turns on Sign in with Apple on www.farbaek.com (ADR 0114), once the change
# is merged and deployed and iPhone sign-in is set up (set-apple-sign-in.ps1).
#
# Apple's side is already done: the Services ID com.farbaek.web returns to
# https://api.farbaek.com/auth/v1/callback. This:
#   1. lists the website's id first for Supabase Auth (its web flow uses the first);
#   2. installs the hourly check that keeps Auth's six-month Apple secret fresh;
#   3. makes the first secret (inside the server; never shown) and restarts Auth;
#   4. checks Auth now sends people to Apple. The sign-in page shows
#      "Continue with Apple" within five minutes.
# Run, in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-apple-sign-in-web.ps1"
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")
$authEnv = "/opt/farbaek/supabase/docker/.env"

ssh @ssh "test -f /opt/farbaek/app/scripts/vps/apple-web-secret.sh && grep -q GOTRUE_EXTERNAL_APPLE_SECRET /opt/farbaek/app/deploy/vps/supabase/compose.farbaek.yaml && grep -q '^FARBAEK_APPLE_SIGN_IN=true' $authEnv"
if ($LASTEXITCODE -ne 0) { Write-Host "The server doesn't have the website change yet, or iPhone sign-in with Apple isn't on. Merge it, wait for the deploy, then run this again. Nothing changed." -ForegroundColor Red; exit 1 }

Write-Host "1 of 3: listing the website's id first for Supabase Auth..." -ForegroundColor Cyan
"FARBAEK_APPLE_CLIENT_IDS=com.farbaek.web,com.farbaek.app" | ssh @ssh "farbaek-set-env --file $authEnv"
if ($LASTEXITCODE -ne 0) { Write-Host "Auth's settings weren't saved, so nothing changed." -ForegroundColor Red; exit 1 }

Write-Host "2 of 3: installing the hourly check on Auth's Apple secret..." -ForegroundColor Cyan
ssh @ssh "sudo bash /opt/farbaek/app/scripts/vps/install.sh --enable-apple-timer | grep apple-secret"
if ($LASTEXITCODE -ne 0) { Write-Host "The check wasn't installed. Run this script again." -ForegroundColor Red; exit 1 }

Write-Host "3 of 3: making Auth's first Apple secret and restarting Auth (about 10 seconds)..." -ForegroundColor Cyan
ssh @ssh "/usr/local/bin/farbaek-apple-secret"
if ($LASTEXITCODE -ne 0) { Write-Host "Auth didn't take the secret. Run this script again in a few minutes." -ForegroundColor Red; exit 1 }

$probe = "curl -s -o /dev/null -w '%{redirect_url}' 'https://api.farbaek.com/auth/v1/authorize?provider=apple&redirect_to=https://www.farbaek.com/auth/callback'"
$to = ssh @ssh $probe
if ($to -like "https://appleid.apple.com/auth/authorize?*client_id=com.farbaek.web*") {
  Write-Host "Done. Auth sends people to Apple. www.farbaek.com/sign-in shows Continue with Apple within five minutes." -ForegroundColor Green
} else {
  Write-Host "Auth restarted, but it doesn't send people to Apple yet. Ask Claude to look; the button stays hidden until it does." -ForegroundColor Yellow
  exit 1
}
