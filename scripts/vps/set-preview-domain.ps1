# Turns on app previews at p-<id>.farbaek.si (ADR 0152). Asks for a Cloudflare API token
# (stars as you paste) and checks it from the server before anything changes:
#   1. the token is active, can see farbaek.si, and Cloudflare serves that zone;
#   2. it can edit DNS there (it adds and removes one test TXT record);
#   3. the server's Caddy has the Cloudflare module.
# Then it gives Caddy one *.farbaek.si wildcard certificate and waits for it. If the
# certificate doesn't arrive in 3 minutes, it puts Caddy back as it was. Last, it sets
# SANDBOX_PREVIEW_DOMAIN=farbaek.si and restarts the app (3 to 5 minutes).
# The token stays on the server, readable by its owner only; it's never shown.
#
# First (docs/deploy/vps.md, "Previews"): farbaek.si's DNS on Cloudflare, and a token with
# Zone > Zone > Read and Zone > DNS > Edit for farbaek.si only. Then, in your own PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-preview-domain.ps1"
#
# To turn previews off again (published sites go back to their own certificates):
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-preview-domain.ps1" -Off
param(
  [switch]$Off,
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

if ($Off) {
  $offScript = @'
set -u
rm -f /opt/farbaek/app/deploy/vps/caddy/extra/previews.caddy
docker exec farbaek-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 && echo "caddy reloaded" || echo "caddy reload failed"
printf 'SANDBOX_PREVIEW_DOMAIN=\n' | farbaek-set-env >/dev/null && echo "setting cleared"
'@
  Write-Host "Turning previews off..." -ForegroundColor Cyan
  ($offScript -replace "`r", "") | ssh @ssh "bash -s"
  ssh @ssh "farbaek-deploy --again"
  Write-Host "Done. Previews are off; published sites get their own certificates again." -ForegroundColor Green
  exit 0
}

$secure = Read-Host -AsSecureString -Prompt "Cloudflare API token for farbaek.si (right-click to paste, then Enter)"
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
# Checked without showing it. This also keeps quotes and slashes out of the scripts below.
if ($token -notmatch '^[A-Za-z0-9_-]{30,120}$') {
  $token = $null
  Write-Host "That isn't a whole Cloudflare API token. Copy it again with the copy button, then run this again. Nothing changed." -ForegroundColor Red
  exit 1
}

# One bash script on standard input, so the token never appears on a command line or in a log.
$remote = @'
set -u
umask 077
APP=/opt/farbaek/app
EXTRA="$APP/deploy/vps/caddy/extra"
API=https://api.cloudflare.com/client/v4
token='__TOKEN__'
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$token" > "$tmp/h"
cf() { curl -sS -H @"$tmp/h" "$@"; }
say() { echo "$*"; }
message() { grep -oE '"message":"[^"]{0,160}"' "$1" | head -n1; }

# 1. The token, the zone, and Cloudflare serving it.
cf "$API/user/tokens/verify" > "$tmp/verify"
grep -q '"status":"active"' "$tmp/verify" || { say "STOP token Cloudflare says this token isn't active. $(message "$tmp/verify")"; exit 0; }
cf "$API/zones?name=farbaek.si" > "$tmp/zone"
zone=$(grep -oE '"id":"[0-9a-f]{32}"' "$tmp/zone" | head -n1 | cut -d'"' -f4)
[ -n "$zone" ] || { say "STOP zone This token can't see farbaek.si. It needs Zone > Zone > Read for farbaek.si."; exit 0; }
grep -q '"status":"active"' "$tmp/zone" || { say "STOP pending Cloudflare is still waiting for farbaek.si's nameservers to change at Hostinger. Try again once Cloudflare says the site is active."; exit 0; }
say "ok token and zone"

# 2. DNS edit: one test TXT record, added and removed.
cf -X POST "$API/zones/$zone/dns_records" --data '{"type":"TXT","name":"_farbaek-check.farbaek.si","content":"farbaek preview check","ttl":60}' > "$tmp/add"
rec=$(grep -oE '"id":"[0-9a-f]{32}"' "$tmp/add" | head -n1 | cut -d'"' -f4)
[ -n "$rec" ] || { say "STOP dns This token can't edit DNS for farbaek.si. It needs Zone > DNS > Edit. $(message "$tmp/add")"; exit 0; }
cf -X DELETE "$API/zones/$zone/dns_records/$rec" > /dev/null
say "ok dns edit"

# 3. Caddy with the Cloudflare module (deploy/vps/caddy-image).
docker exec farbaek-caddy caddy list-modules 2>/dev/null | grep -q '^dns.providers.cloudflare' || { say "STOP caddy The server's Caddy doesn't have the Cloudflare module yet: the deploy that builds it hasn't run. Wait a few minutes and run this again."; exit 0; }
say "ok caddy module"

# 4. The wildcard site, checked by Caddy before it's used.
mkdir -p "$EXTRA"
sed "s/__CLOUDFLARE_TOKEN__/$token/" "$APP/deploy/vps/caddy/previews.caddy.template" > "$EXTRA/previews.caddy"
chmod 600 "$EXTRA/previews.caddy"
undo() { rm -f "$EXTRA/previews.caddy"; docker exec farbaek-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; }
docker exec farbaek-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { undo; say "STOP config Caddy refused the new settings, so they were taken back out."; exit 0; }
docker exec farbaek-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || { undo; say "STOP reload Caddy couldn't load the new settings, so they were taken back out."; exit 0; }
say "ok caddy reloaded"

# 5. The certificate: a preview name answers over HTTPS with a trusted certificate (any status).
host="p-aaaaaaaaaaaaaaaaaaaaaaaaaa.farbaek.si"
for i in $(seq 1 36); do
  if curl -sS -o /dev/null --max-time 10 --resolve "$host:443:127.0.0.1" "https://$host/" 2>/dev/null; then say "ok certificate"; break; fi
  sleep 5
done
curl -sS -o /dev/null --max-time 10 --resolve "$host:443:127.0.0.1" "https://$host/" 2>/dev/null || { undo; say "STOP certificate The wildcard certificate didn't arrive in 3 minutes, so Caddy is back as it was. Published sites are unaffected."; exit 0; }

# 6. The app's setting (the restart follows).
printf 'SANDBOX_PREVIEW_DOMAIN=farbaek.si\n' | farbaek-set-env >/dev/null && say "SAVED" || say "STOP setting The certificate works, but the app's setting wasn't saved."
'@

Write-Host "Checking the token and setting up the certificate (up to 3 minutes)..." -ForegroundColor Cyan
$result = (($remote.Replace("__TOKEN__", $token)) -replace "`r", "") | ssh @ssh "bash -s"
$token = $null
if ($LASTEXITCODE -ne 0) { Write-Host "The server didn't answer. Check the connection and try again. Nothing changed." -ForegroundColor Red; exit 1 }
$lines = @($result)
$lines | Where-Object { $_ -like "ok *" } | ForEach-Object { Write-Host "  $($_.Substring(3))" }
$stop = $lines | Where-Object { $_ -like "STOP *" } | Select-Object -First 1
if ($stop) {
  Write-Host ($stop -replace '^STOP \S+ ', '') -ForegroundColor Red
  exit 1
}
if ($lines -notcontains "SAVED") { Write-Host "Something didn't finish. Run this again; it's safe to repeat." -ForegroundColor Red; exit 1 }

Write-Host "Restarting Farbaek with previews on (3 to 5 minutes)..." -ForegroundColor Cyan
ssh @ssh "farbaek-deploy --again"
if ($LASTEXITCODE -ne 0) { Write-Host "Previews are set up, but the app didn't restart. Run: ssh farbaek@$Server farbaek-deploy --again" -ForegroundColor Yellow; exit 1 }

Write-Host ""
Write-Host "Done. App previews open at p-<id>.farbaek.si, and published sites share the wildcard certificate." -ForegroundColor Green
Write-Host "Tell Claude, and it will open a preview to check."
