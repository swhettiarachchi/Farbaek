# Connects Farbaek to Dodo Payments in TEST mode (ADR 0100). Live payments
# stay off in the code until docs/billing/go-live.md is complete, whatever
# this script sets.
#
# It asks for three things:
#   1. Dodo's TEST API key (stars as you paste). Dodo dashboard, Test Mode on,
#      Developer > API Keys > Add API Key.
#   2. The webhook's signing secret (stars as you paste, starts with whsec_).
#      Dodo dashboard, Test Mode on, Developer > Webhooks > Add Endpoint, URL
#      https://www.farbaek.com/api/webhooks/dodo, then open it and copy the
#      Signing Secret.
#   3. Your workspace's id (public). Office Space > Workspaces > your workspace:
#      it's the last part of the address. Only this workspace can check out.
#
# Then it saves them on the server and restarts the app. Nothing is saved on
# this computer, and no value is shown on screen. Run, in your own PowerShell
# window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-dodo.ps1"
#
# To switch payments off again:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-dodo.ps1" -Off
param(
  [switch]$Off,
  [string]$Workspace = "",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")

ssh @ssh "grep -q readBillingConfig /opt/farbaek/app/src/server/billing/config.ts"
if ($LASTEXITCODE -ne 0) { Write-Host "The server doesn't have the payments change yet. Merge it, wait for the deploy, then run this again. Nothing changed." -ForegroundColor Red; exit 1 }

if ($Off) {
  Write-Host "Switching payments off and restarting the app (3 to 5 minutes)..." -ForegroundColor Cyan
  "BILLING_MODE=not_connected" | ssh @ssh "farbaek-set-env && farbaek-deploy --again"
  if ($LASTEXITCODE -ne 0) { Write-Host "The app didn't restart. Run: ssh farbaek@$Server farbaek-deploy --again" -ForegroundColor Yellow; exit 1 }
  Write-Host "Done. Payments aren't connected; Billing says so, and nothing can be bought." -ForegroundColor Green
  exit 0
}

function Read-Secret([string]$Prompt) {
  $secure = Read-Host -AsSecureString -Prompt $Prompt
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$ws = if ($Workspace) { $Workspace.Trim() } else { (Read-Host -Prompt "Your workspace id (public, from Office Space > Workspaces)").Trim() }
if ($ws -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') { Write-Host "That isn't a workspace id (it looks like 8-4-4-4-12 letters and digits), so nothing changed." -ForegroundColor Red; exit 1 }

$apiKey = Read-Secret "Dodo TEST API key"
# Checked without showing it: a wrong paste shouldn't end up on screen.
if ($apiKey.Length -lt 20 -or $apiKey.Length -gt 400 -or $apiKey -match '\s' -or $apiKey -like 'whsec_*') { $apiKey = $null; Write-Host "That doesn't look like an API key, so nothing changed." -ForegroundColor Red; exit 1 }

$webhookKey = Read-Secret "Webhook signing secret (starts with whsec_)"
if ($webhookKey -notmatch '^whsec_[A-Za-z0-9+/=]{20,300}$') { $apiKey = $null; $webhookKey = $null; Write-Host "That doesn't look like a webhook signing secret (it starts with whsec_), so nothing changed." -ForegroundColor Red; exit 1 }

Write-Host "Saving the settings and restarting the app (3 to 5 minutes)..." -ForegroundColor Cyan
"BILLING_MODE=test`nDODO_PAYMENTS_API_KEY=$apiKey`nDODO_PAYMENTS_WEBHOOK_KEY=$webhookKey`nBILLING_TEST_WORKSPACES=$($ws.ToLower())" | ssh @ssh "farbaek-set-env && farbaek-deploy --again"
$saved = $LASTEXITCODE
$apiKey = $null; $webhookKey = $null
if ($saved -ne 0) { Write-Host "The settings may be saved, but the app didn't restart. Run this script again." -ForegroundColor Red; exit 1 }

# Connected, an unsigned delivery is refused (401). Not connected, it's 503.
$code = (curl.exe -s -o NUL -w "%{http_code}" -X POST -H "content-type: application/json" -d "{}" "https://www.farbaek.com/api/webhooks/dodo")
if ($code -eq "401") {
  Write-Host "Done. Payments are in test mode for your workspace, and the webhook endpoint checks signatures." -ForegroundColor Green
} else {
  Write-Host "Saved, but the webhook endpoint answered $code instead of 401. Wait a minute and open https://www.farbaek.com/api/health, then tell Claude what this said." -ForegroundColor Yellow
  exit 1
}
Write-Host "Next:"
Write-Host "  1. officespace.farbaek.com > Payments > Create test products."
Write-Host "  2. www.farbaek.com/app/billing > Choose a plan > pay with one of Dodo's test cards."
Write-Host "  3. Back in Billing, the plan shows as Active within a minute. Office Space > Payments lists the webhooks."
