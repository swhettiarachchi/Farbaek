# Turns on notifications for Farbaek for iPhone (ADR 0110): saves Apple's push
# (APNs) key on the server and restarts the app.
#
# First make the key: developer.apple.com > Certificates, Identifiers &
# Profiles > Keys > + > name it "Farbaek push", tick Apple Push Notifications
# service (APNs), Continue, Register, then Download. Apple lets you download
# it once: a file named AuthKey_XXXXXXXXXX.p8.
#
# This asks where that file is, reads it, checks it's a key, and sends it to
# the server with its Key ID (the ten characters in the file's name). Nothing
# is shown on screen or kept on this computer besides the file you downloaded.
# Run, in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-apns.ps1"
#
# To switch iPhone notifications off again:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-apns.ps1" -Off
param(
  [switch]$Off,
  [string]$File = "",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")

ssh @ssh "test -f /opt/farbaek/app/src/server/push/apns.ts"
if ($LASTEXITCODE -ne 0) { Write-Host "The server doesn't have the iPhone app's change yet. Merge it, wait for the deploy, then run this again. Nothing changed." -ForegroundColor Red; exit 1 }

if ($Off) {
  Write-Host "Switching iPhone notifications off and restarting the app (3 to 5 minutes)..." -ForegroundColor Cyan
  "APNS_KEY_P8=`nAPNS_KEY_ID=" | ssh @ssh "farbaek-set-env && farbaek-deploy --again"
  if ($LASTEXITCODE -ne 0) { Write-Host "The app didn't restart. Run: ssh farbaek@$Server farbaek-deploy --again" -ForegroundColor Yellow; exit 1 }
  Write-Host "Done. The iPhone app says notifications aren't set up; everything else works." -ForegroundColor Green
  exit 0
}

$path = if ($File) { $File } else { (Read-Host -Prompt "Path to the AuthKey_....p8 file you downloaded (drag it here)").Trim().Trim('"') }
if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "There's no file at that path, so nothing changed." -ForegroundColor Red; exit 1 }
$name = [IO.Path]::GetFileName($path)
if ($name -notmatch '^AuthKey_([A-Z0-9]{10})\.p8$') { Write-Host "The file should be named AuthKey_ followed by ten letters and digits, then .p8. Nothing changed." -ForegroundColor Red; exit 1 }
$keyId = $Matches[1]

$pem = [IO.File]::ReadAllText($path)
if ($pem -notmatch '-----BEGIN PRIVATE KEY-----' -or $pem.Length -gt 2000) { $pem = $null; Write-Host "That file isn't an APNs key, so nothing changed." -ForegroundColor Red; exit 1 }
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pem.Trim()))
$pem = $null

Write-Host "Saving the key ($keyId) and restarting the app (3 to 5 minutes)..." -ForegroundColor Cyan
"APNS_KEY_P8=$b64`nAPNS_KEY_ID=$keyId" | ssh @ssh "farbaek-set-env && farbaek-deploy --again"
$saved = $LASTEXITCODE
$b64 = $null
if ($saved -ne 0) { Write-Host "The key may be saved, but the app didn't restart. Run this script again." -ForegroundColor Red; exit 1 }
Write-Host "Done. In the iPhone app: You > Turn on notifications." -ForegroundColor Green
