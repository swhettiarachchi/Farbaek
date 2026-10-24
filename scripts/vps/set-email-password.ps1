# Turns on Farbaek's own email (ADR 0060): asks for the password of
# hello@farbaek.com (Spacemail), stores it on the VPS as SMTP_PASSWORD, and
# restarts the app so it's used. Nothing else is changed. What you paste shows
# as stars, goes straight to the server over SSH, and isn't saved here.
# Run it in your own PowerShell window:
#
#   cd C:\Users\INTEL\Documents\FarBaek
#   & .\scripts\vps\set-email-password.ps1
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$secure = Read-Host -AsSecureString -Prompt "Password for hello@farbaek.com (the one sign-in emails use)"
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $value = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if (-not $value) { Write-Host "Nothing typed, so nothing changed." -ForegroundColor Yellow; exit 1 }

Write-Host "Saving it on the server..." -ForegroundColor Cyan
"SMTP_PASSWORD=$value" | ssh -i $Key -o StrictHostKeyChecking=accept-new "farbaek@$Server" farbaek-set-env
$value = $null
Write-Host "Restarting the app with it (3 to 5 minutes)..." -ForegroundColor Cyan
ssh -i $Key "farbaek@$Server" "farbaek-deploy --again"
Write-Host "Done. Farbaek now emails people when their builds and checks finish." -ForegroundColor Green
