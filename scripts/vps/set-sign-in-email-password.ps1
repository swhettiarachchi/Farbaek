# Puts the password of hello@farbaek.com (Spacemail) back on the server after the
# mailbox was set up again, so sign-in emails and Farbaek's own emails send.
#
# On 2026-11-23 Spacemail for farbaek.com was started again, with new mailboxes.
# The server still had the old mailbox's password in two places:
#   - Supabase Auth's SMTP_PASS (sign-in links and codes), and
#   - the app's SMTP_PASSWORD (Farbaek's own emails, ADR 0060).
#
# This:
#   1. asks for the password (shown as stars, never saved on this PC);
#   2. checks it with Spacemail by signing in to the mail server, sending nothing;
#      a wrong password stops here and nothing changes;
#   3. saves it in both places on the server;
#   4. restarts Auth (about 10 seconds), then the app (3 to 5 minutes).
#
# Run it in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-sign-in-email-password.ps1"
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps",
  [string]$Mailbox = "hello@farbaek.com"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")
$authEnv = "/opt/farbaek/supabase/docker/.env"
# What is piped to ssh and curl goes as UTF-8, so a password with any character arrives as typed.
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

$secure = Read-Host -AsSecureString -Prompt "Password for $Mailbox (as set in Spacemail today)"
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $value = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if (-not $value) { Write-Host "Nothing typed, so nothing changed." -ForegroundColor Yellow; exit 1 }

Write-Host "1 of 4: checking the password with Spacemail (nothing is sent)..." -ForegroundColor Cyan
# The sign-in goes to curl through its standard input, never on a command line.
$escaped = $value.Replace('\', '\\').Replace('"', '\"')
"user = `"$($Mailbox):$escaped`"" | curl.exe --silent --show-error --max-time 30 --ssl-reqd --url "smtps://mail.spacemail.com:465" --request NOOP --config - | Out-Null
$check = $LASTEXITCODE
$escaped = $null
if ($check -eq 67) { $value = $null; Write-Host "Spacemail refused that password for $Mailbox. Nothing changed. Check it in Spacemail (Spaceship, Spacemail Manager, the mailbox's menu) and run this again." -ForegroundColor Red; exit 1 }
if ($check -ne 0) { $value = $null; Write-Host "Couldn't reach Spacemail to check the password (curl said $check). Nothing changed. Check the internet connection and run this again." -ForegroundColor Red; exit 1 }
Write-Host "   Spacemail accepted it." -ForegroundColor Green

Write-Host "2 of 4: saving it for sign-in emails and for Farbaek's own emails..." -ForegroundColor Cyan
"SMTP_PASS=$value" | ssh @ssh "farbaek-set-env --file $authEnv"
$savedAuth = $LASTEXITCODE
"SMTP_PASSWORD=$value" | ssh @ssh "farbaek-set-env"
$savedApp = $LASTEXITCODE
$value = $null
if ($savedAuth -ne 0) { Write-Host "The server didn't save it for sign-in emails. Check the connection and run this again." -ForegroundColor Red; exit 1 }
if ($savedApp -ne 0) { Write-Host "Saved for sign-in emails, but not for Farbaek's own emails. Run this again." -ForegroundColor Yellow }

Write-Host "3 of 4: restarting the sign-in service (about 10 seconds)..." -ForegroundColor Cyan
ssh @ssh "cd /opt/farbaek/supabase/docker && docker compose up -d auth >/dev/null 2>&1; sleep 8; docker ps --filter name=supabase-auth --format '{{.Status}}'"
if ($LASTEXITCODE -ne 0) { Write-Host "The password is saved, but the sign-in service didn't restart. Ask Claude to look." -ForegroundColor Red; exit 1 }

Write-Host "4 of 4: restarting the app (3 to 5 minutes)..." -ForegroundColor Cyan
ssh @ssh "farbaek-deploy --again"
if ($LASTEXITCODE -ne 0) { Write-Host "Sign-in emails will work, but the app's restart didn't finish, so Farbaek's own emails wait for the next deploy." -ForegroundColor Yellow; exit 1 }

Write-Host "Done. Sign in at https://www.farbaek.com/sign-in with your email: the link should arrive within a minute." -ForegroundColor Green
