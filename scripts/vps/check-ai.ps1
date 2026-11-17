# Checks that production can reach Claude with its own key, the way Farbaek drafts plans, and
# OpenAI too when its key is set (set-openai-key.ps1). It sends a few tiny requests from the server
# (a fraction of a cent) and prints only the HTTP status and the provider's error type and message.
# The keys stay on the server and are never shown.
# Run it in your own PowerShell window and send Claude what it prints:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\check-ai.ps1"
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

# One bash script on standard input: no quotes pass through Windows' argument handling.
$remote = @'
set -u
env=/opt/farbaek/env/production.env
key=$(sed -n 's/^ANTHROPIC_API_KEY=//p' "$env" | head -n1 | tr -d '\r')
provider=$(sed -n 's/^AI_PROVIDER=//p' "$env" | head -n1 | tr -d '\r')
echo "AI_PROVIDER=${provider:-unset}  key set: $([ -n "$key" ] && echo yes || echo no)  key length: ${#key}"
[ -n "$key" ] || exit 0
umask 077
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf 'x-api-key: %s\nanthropic-version: 2023-06-01\ncontent-type: application/json\n' "$key" > "$tmp/h"
probe() {
  name="$1"; beta="$2"; body="$3"
  if [ -n "$beta" ]; then
    code=$(curl -sS -o "$tmp/out" -w '%{http_code}' -X POST https://api.anthropic.com/v1/messages -H @"$tmp/h" -H "anthropic-beta: $beta" --data-binary "$body")
  else
    code=$(curl -sS -o "$tmp/out" -w '%{http_code}' -X POST https://api.anthropic.com/v1/messages -H @"$tmp/h" --data-binary "$body")
  fi
  echo "$name: HTTP $code $(grep -oE '"type":"[a-z_]+_error"|"message":"[^"]{0,220}"|"stop_reason":"[a-z_]+"' "$tmp/out" | head -n3 | tr '\n' ' ')"
}
probe "Plain request (Haiku)" "" '{"model":"claude-haiku-5-5","max_tokens":5,"messages":[{"role":"user","content":"Say ok"}]}'
probe "As Farbaek drafts (Sonnet)" "server-side-fallback-2026-07-01" '{"model":"claude-sonnet-5-5","max_tokens":16,"fallbacks":"default","thinking":{"type":"adaptive"},"messages":[{"role":"user","content":"Say ok"}]}'
# A trial's plan is drafted on Haiku with a schema, the way the SDK sends it (src/server/ai/anthropic.ts).
probe "As a trial's plan is drafted (Haiku, schema)" "structured-outputs-2025-12-15" '{"model":"claude-haiku-5-5","max_tokens":400,"thinking":{"type":"adaptive"},"output_config":{"effort":"medium","format":{"type":"json_schema","schema":{"type":"object","properties":{"ok":{"type":"string"}},"required":["ok"],"additionalProperties":false}}},"messages":[{"role":"user","content":"Say ok"}]}'

# OpenAI (stage 202): the image studio, the chat's second model and the second check. Two free
# model lookups and one tiny text request; no picture is made.
okey=$(sed -n 's/^OPENAI_API_KEY=//p' "$env" | head -n1 | tr -d '\r')
echo "OpenAI key set: $([ -n "$okey" ] && echo yes || echo no)  key length: ${#okey}"
if [ -n "$okey" ]; then
  printf 'Authorization: Bearer %s\ncontent-type: application/json\n' "$okey" > "$tmp/oh"
  osay() { grep -oE '"code":"[a-z_]+"|"message":"[^"]{0,200}"' "$tmp/out" | head -n2 | tr '\n' ' '; }
  for model in gpt-6.1-terra gpt-image-2.5-sunburst; do
    code=$(curl -sS -o "$tmp/out" -w '%{http_code}' "https://api.openai.com/v1/models/$model" -H @"$tmp/oh")
    echo "OpenAI model $model: HTTP $code $(osay)"
  done
  code=$(curl -sS -o "$tmp/out" -w '%{http_code}' -X POST https://api.openai.com/v1/responses -H @"$tmp/oh" --data-binary '{"model":"gpt-6.1-terra","input":"Say ok","max_output_tokens":16,"store":false}')
  echo "OpenAI text request: HTTP $code $(osay)"
fi
'@

$OutputEncoding = New-Object System.Text.UTF8Encoding $false
Write-Host "Asking Claude from the server..." -ForegroundColor Cyan
($remote -replace "`r", "") | ssh -i $Key -o StrictHostKeyChecking=accept-new "farbaek@$Server" "bash -s"
if ($LASTEXITCODE -ne 0) { Write-Host "The server didn't answer. Check the connection and try again." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "HTTP 200 on the three Claude lines means Claude works, and on the three OpenAI lines (when its key is set) that OpenAI works. Copy everything above and send it to Claude." -ForegroundColor Green
