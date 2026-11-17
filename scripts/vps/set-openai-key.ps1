# Connects Farbaek in production to OpenAI. Asks for the key (stars as you paste), tests it from
# the server, saves it only if OpenAI accepts it, then restarts the app (3 to 5 minutes). Nothing is
# saved on this computer, and the key is never shown.
#
# What the key turns on (ADR 0215, ADR 0216, ADR 0121):
#   - the image studio makes pictures with OpenAI's image model (GPT Image 2.5);
#   - Farbaek AI's chat can hand a question to OpenAI's model (GPT-6.1 Terra) on paid plans;
#   - the second check on a change is read by a model from another company.
#
# The test costs a fraction of a cent: two free model lookups and one tiny text request. It does
# NOT make a picture, so it can't tell whether OpenAI wants the organization verified first.
#
# Make the key first: platform.openai.com > API keys > Create new secret key, owned by you, in
# the Default project, named "Farbaek production", permissions All. Copy it (it's shown once).
# Then run, in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-openai-key.ps1"
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")

$secure = Read-Host -AsSecureString -Prompt "New OpenAI API key (right-click to paste, then Enter)"
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $apiKey = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
# Checked without showing it. A key starts sk- (project keys sk-proj-, service accounts
# sk-svcacct-); an admin key (sk-admin-) manages the organization and mustn't sit on the server,
# and a Claude key (sk-ant-) pasted here by mistake is turned away before it reaches the server.
# The check also keeps quotes out of the script below.
if ($apiKey -notmatch '^sk-(?!admin-|ant-)[A-Za-z0-9_-]{30,400}$') {
  $apiKey = $null
  Write-Host "That isn't a whole OpenAI API key (it starts sk- and is long). Copy it again with the copy button, then run this again. Nothing changed." -ForegroundColor Red
  exit 1
}

# One bash script on standard input, so the key never appears on a command line or in a log.
$remote = @'
set -u
umask 077
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
key='__KEY__'
printf 'Authorization: Bearer %s\ncontent-type: application/json\n' "$key" > "$tmp/h"
say() { grep -oE '"code":"[a-z_]+"|"message":"[^"]{0,200}"' "$tmp/out" | head -n2 | tr '\n' ' '; }
for model in gpt-6.1-terra gpt-image-2.5-sunburst; do
  code=$(curl -sS -o "$tmp/out" -w '%{http_code}' https://api.openai.com/v1/models/$model -H @"$tmp/h")
  if [ "$code" != "200" ]; then echo "REFUSED $model HTTP $code $(say)"; exit 0; fi
done
code=$(curl -sS -o "$tmp/out" -w '%{http_code}' -X POST https://api.openai.com/v1/responses -H @"$tmp/h" --data-binary '{"model":"gpt-6.1-terra","input":"Say ok","max_output_tokens":16,"store":false}')
if [ "$code" != "200" ]; then echo "REFUSED a text request HTTP $code $(say)"; exit 0; fi
printf 'OPENAI_API_KEY=%s\n' "$key" | farbaek-set-env >/dev/null && echo "SAVED" || echo "NOT SAVED"
'@

$OutputEncoding = New-Object System.Text.UTF8Encoding $false
Write-Host "1 of 2: testing the key from the server..." -ForegroundColor Cyan
$result = (($remote.Replace("__KEY__", $apiKey)) -replace "`r", "") | ssh @ssh "bash -s"
$apiKey = $null
if ($LASTEXITCODE -ne 0) { Write-Host "The server didn't answer. Check the connection and try again. Nothing changed." -ForegroundColor Red; exit 1 }
$lines = @($result)
$refused = $lines | Where-Object { $_ -like "REFUSED*" } | Select-Object -First 1
if ($refused) {
  Write-Host "OpenAI refused this key, so it wasn't saved. It said: $($refused.Substring(8))" -ForegroundColor Red
  Write-Host "HTTP 401: the key is wrong or deleted. HTTP 429 with insufficient_quota: the account has no credit left. HTTP 404 on a model: this key's project can't use it."
  exit 1
}
if ($lines -notcontains "SAVED") { Write-Host "The key works, but the server didn't save it. Run this again." -ForegroundColor Red; exit 1 }

Write-Host "2 of 2: restarting Farbaek with the new key (3 to 5 minutes)..." -ForegroundColor Cyan
ssh @ssh "farbaek-deploy --again"
if ($LASTEXITCODE -ne 0) { Write-Host "The key is saved, but the app didn't restart. Run: ssh farbaek@$Server farbaek-deploy --again" -ForegroundColor Yellow; exit 1 }

Write-Host ""
Write-Host "Done. Farbaek is connected to OpenAI." -ForegroundColor Green
Write-Host "Make one picture in the image studio to finish the check: OpenAI may ask you to verify the organization before its image model answers."
Write-Host "Then tell Claude."
