# Saves the Google Play service account Farbaek uses to check purchases made in Farbaek for Android
# (ADR 0154), after testing it from the server: Google must accept the key, and Google Play must
# let it read this app's purchases. Then it restarts the app (3 to 5 minutes). Nothing is saved on
# this computer, and nothing from the key is ever shown.
#
# Make the key first (docs/mobile/android.md, "Selling plans in the app"): a service account in
# Google Cloud with the Google Play Android Developer API turned on, invited in Play Console with
# "View financial data" and "Manage orders and subscriptions". Its access can take up to a day to
# start working. Download its JSON key, then run, in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-google-play.ps1"
#
# Add -TurnOn once the five subscriptions are active in Play Console, to start selling in the app.
# -Off stops selling (the key stays saved); purchases already made keep being checked.
param(
  [string]$File = "",
  [switch]$TurnOn,
  [switch]$Off,
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")

function Restart-Farbaek([string]$what) {
  Write-Host "Restarting Farbaek $what (3 to 5 minutes)..." -ForegroundColor Cyan
  ssh @ssh "farbaek-deploy --again"
  if ($LASTEXITCODE -ne 0) { Write-Host "It's saved, but the app didn't restart. Run: ssh farbaek@$Server farbaek-deploy --again" -ForegroundColor Yellow; exit 1 }
}

if ($Off) {
  ssh @ssh "printf 'GOOGLE_PLAY_BILLING=off\n' | farbaek-set-env >/dev/null"
  if ($LASTEXITCODE -ne 0) { Write-Host "The server didn't answer. Nothing changed." -ForegroundColor Red; exit 1 }
  Restart-Farbaek "with selling in the Android app off"
  Write-Host "Done. The Android app no longer sells plans. Purchases already made are still checked every hour." -ForegroundColor Green
  exit 0
}

if (-not $File) { $File = (Read-Host -Prompt "The service account's JSON key file (drag it into this window, then Enter)").Trim('"', ' ') }
if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { Write-Host "There's no file at that path. Nothing changed." -ForegroundColor Red; exit 1 }

# Checked here without showing anything from it. The checks also keep quotes out of the script below.
$bytes = [IO.File]::ReadAllBytes($File)
try { $json = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json } catch { $json = $null }
if (-not $json -or $json.type -ne "service_account" -or "$($json.client_email)" -notmatch '^[a-z0-9-]{1,63}@[a-z0-9-]{1,63}\.iam\.gserviceaccount\.com$' -or "$($json.private_key)" -notmatch 'BEGIN PRIVATE KEY') {
  $bytes = $null; $json = $null
  Write-Host "That isn't a Google service account key (the JSON file Google Cloud downloads under Keys). Nothing changed." -ForegroundColor Red
  exit 1
}
$account = $json.client_email
$b64 = [Convert]::ToBase64String($bytes)
$bytes = $null; $json = $null

# The check runs in the app's own container, with the key on standard input, so it never appears
# on a command line or in a log. A purchase token Google doesn't know answers 400 when the key and
# its Play Console access both work; 401 or 403 means one of them doesn't yet.
$check = @'
const { createPrivateKey, sign } = require("node:crypto");
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", async () => {
  try {
    const f = JSON.parse(Buffer.from(input.trim(), "base64").toString("utf8"));
    const key = createPrivateKey({ key: f.private_key, format: "pem" });
    const now = Math.floor(Date.now() / 1000);
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = b({ alg: "RS256", typ: "JWT" }) + "." + b({ iss: f.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 });
    const assertion = unsigned + "." + sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url");
    const t = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
    if (!t.ok) { const e = await t.json().catch(() => ({})); console.log("REFUSED google " + t.status + " " + String(e.error || "")); return; }
    const { access_token } = await t.json();
    const r = await fetch("https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.farbaek.app/purchases/subscriptionsv2/tokens/farbaek-setup-check", { headers: { authorization: "Bearer " + access_token } });
    // Google's reason code only (letters), e.g. permissionDenied or accessNotConfigured: it tells a slow new grant from a missing setting.
    if (r.status === 401 || r.status === 403) { const e = await r.json().catch(() => ({})); const why = String(e?.error?.errors?.[0]?.reason || e?.error?.status || "").replace(/[^A-Za-z]/g, "").slice(0, 40); console.log("REFUSED play " + r.status + " " + why); return; }
    console.log("OK " + r.status);
  } catch {
    console.log("REFUSED file");
  }
});
'@
$remote = @'
set -u
umask 077
b64='__B64__'
check=$(cat <<'JS'
__CHECK__
JS
)
result=$(printf '%s' "$b64" | docker exec -i farbaek-app node -e "$check" 2>/dev/null | tail -n1)
case "$result" in
  OK*) printf 'GOOGLE_PLAY_SERVICE_ACCOUNT=%s\n' "$b64" | farbaek-set-env >/dev/null && echo "SAVED" || echo "NOT SAVED" ;;
  *) echo "${result:-REFUSED server}" ;;
esac
'@

$OutputEncoding = New-Object System.Text.UTF8Encoding $false
Write-Host "1 of 2: testing $account from the server..." -ForegroundColor Cyan
# Windows PowerShell ends piped text with CRLF, which would turn the final "esac" into "esac\r": the server strips it.
$result = (($remote.Replace("__CHECK__", $check).Replace("__B64__", $b64)) -replace "`r", "") | ssh @ssh "tr -d '\r' | bash -s"
$b64 = $null
if ($LASTEXITCODE -ne 0) { Write-Host "The server didn't answer. Check the connection and try again. Nothing changed." -ForegroundColor Red; exit 1 }
$lines = @($result)
$refused = $lines | Where-Object { $_ -like "REFUSED*" } | Select-Object -First 1
if ($refused -like "REFUSED google*") {
  Write-Host "Google refused this key ($($refused.Substring(15))). Make a new key for the service account and run this again. Nothing changed." -ForegroundColor Red; exit 1
}
if ($refused -like "REFUSED play*accessNotConfigured*") {
  Write-Host "Google accepts the key, but the Google Play Android Developer API isn't turned on in the service account's Google Cloud project. Turn it on (APIs and services > Library), wait a few minutes and run this again. Nothing changed." -ForegroundColor Red; exit 1
}
if ($refused -like "REFUSED play*") {
  Write-Host "Google accepts the key, but Google Play doesn't let it read Farbaek's purchases yet (Google says: $($refused.Substring(13))). In Play Console > Users and permissions, check $account has View financial data and Manage orders and subscriptions for Farbaek. New access can take up to a day. Nothing changed." -ForegroundColor Red; exit 1
}
if ($refused) { Write-Host "The server couldn't test the key ($refused). Nothing changed." -ForegroundColor Red; exit 1 }
if ($lines -notcontains "SAVED") { Write-Host "The key works, but the server didn't save it. Run this again." -ForegroundColor Red; exit 1 }

if ($TurnOn) {
  ssh @ssh "printf 'GOOGLE_PLAY_BILLING=on\n' | farbaek-set-env >/dev/null"
  if ($LASTEXITCODE -ne 0) { Write-Host "The key is saved, but selling wasn't turned on. Run this again with -TurnOn." -ForegroundColor Yellow; exit 1 }
}
Restart-Farbaek "with the key$(if ($TurnOn) { ', selling in the Android app' })"

Write-Host ""
Write-Host "Done. Farbaek checks Google Play purchases with $account." -ForegroundColor Green
if (-not $TurnOn) { Write-Host "Selling in the Android app is still off. Run this again with -TurnOn once the five subscriptions are active." }
Write-Host "Delete the downloaded key file now: it's saved on the server, and you can make a new key at any time."
Write-Host "Then tell Claude, and it will check the setup."
