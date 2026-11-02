# Replaces the Claude API key Farbaek uses in production. Asks for the new key (stars as you
# paste), tests it from the server with one tiny request (a fraction of a cent), and saves it
# only if Anthropic accepts it. Then it restarts the app (3 to 5 minutes). Nothing is saved on
# this computer, and the key is never shown.
#
# Make the key first: platform.claude.com > API keys > Create key ("Continue with an API key":
# the VPS has no identity provider for federation), name it "Farbaek production", choose the
# longest expiry offered, and copy it (it's shown once). Keys expire: the first one, made
# 2026-10-22, stopped on 2026-10-29. Then run, in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-anthropic-key.ps1"
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")

$secure = Read-Host -AsSecureString -Prompt "New Claude API key (right-click to paste, then Enter)"
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $apiKey = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
# Checked without showing it. A key starts sk-ant- and a kind (api, or usr for keys made since
# October 2026); an admin key (sk-ant-admin) can't make requests and shouldn't sit on the server.
# The check also keeps quotes out of the script below.
if ($apiKey -notmatch '^sk-ant-(?!admin)[a-z]+[0-9]*-[0-9A-Za-z_-]{60,220}$') {
  $apiKey = $null
  Write-Host "That isn't a whole Claude API key (it starts sk-ant- and is about 100 characters). Copy it again with the copy button, then run this again. Nothing changed." -ForegroundColor Red
  exit 1
}

# One bash script on standard input, so the key never appears on a command line or in a log.
$remote = @'
set -u
umask 077
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
key='__KEY__'
printf 'x-api-key: %s\nanthropic-version: 2023-06-01\ncontent-type: application/json\n' "$key" > "$tmp/h"
code=$(curl -sS -o "$tmp/out" -w '%{http_code}' -X POST https://api.anthropic.com/v1/messages -H @"$tmp/h" --data-binary '{"model":"claude-haiku-5-5","max_tokens":5,"messages":[{"role":"user","content":"Say ok"}]}')
if [ "$code" != "200" ]; then
  echo "REFUSED HTTP $code $(grep -oE '"type":"[a-z_]+_error"|"message":"[^"]{0,200}"' "$tmp/out" | head -n2 | tr '\n' ' ')"
  exit 0
fi
printf 'ANTHROPIC_API_KEY=%s\n' "$key" | farbaek-set-env >/dev/null && echo "SAVED" || echo "NOT SAVED"
'@

$OutputEncoding = New-Object System.Text.UTF8Encoding $false
Write-Host "1 of 2: testing the key from the server..." -ForegroundColor Cyan
$result = (($remote.Replace("__KEY__", $apiKey)) -replace "`r", "") | ssh @ssh "bash -s"
$apiKey = $null
if ($LASTEXITCODE -ne 0) { Write-Host "The server didn't answer. Check the connection and try again. Nothing changed." -ForegroundColor Red; exit 1 }
$lines = @($result)
$refused = $lines | Where-Object { $_ -like "REFUSED*" } | Select-Object -First 1
if ($refused) {
  Write-Host "Anthropic refused this key, so it wasn't saved. It said: $($refused.Substring(8))" -ForegroundColor Red
  Write-Host "Check that it's from the account with your credit, then make a new one and run this again."
  exit 1
}
if ($lines -notcontains "SAVED") { Write-Host "The key works, but the server didn't save it. Run this again." -ForegroundColor Red; exit 1 }

Write-Host "2 of 2: restarting Farbaek with the new key (3 to 5 minutes)..." -ForegroundColor Cyan
ssh @ssh "farbaek-deploy --again"
if ($LASTEXITCODE -ne 0) { Write-Host "The key is saved, but the app didn't restart. Run: ssh farbaek@$Server farbaek-deploy --again" -ForegroundColor Yellow; exit 1 }

Write-Host ""
Write-Host "Done. Farbaek uses the new key." -ForegroundColor Green
Write-Host "In platform.claude.com > API keys, delete the old key (farbaek-vps-2026-10-22). Note when the new one expires."
Write-Host "Then tell Claude, and it will check that plans draft again."
