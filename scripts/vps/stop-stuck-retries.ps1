# Stops database retries that never end (ADR 0178). PostgREST retries a transaction for ever when a function
# raises error code 40001, and it keeps going after the person's page has given up. This measures how many
# transactions are being undone each second. If that's abnormally high, it restarts only PostgREST, which takes
# a few seconds and loses no data, then measures again. If not, it restarts nothing. It reads no keys or files.
# Auto mode refuses this for Claude, so run it in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\stop-stuck-retries.ps1"
#
# It also saves what it printed to D:\FarbaekWork\tmp\stuck-retries.txt, so Claude can read it from there.
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps",
  [string]$SaveTo = "D:\FarbaekWork\tmp\stuck-retries.txt"
)

# One bash script on standard input: no quotes pass through Windows' argument handling.
$remote = @'
exec 2>&1
q() { docker exec supabase-db psql -h localhost -U postgres -d postgres -At -c "$1" </dev/null; }
rate() {
  a=$(q "select xact_rollback from pg_stat_database where datname = 'postgres'")
  sleep 10
  b=$(q "select xact_rollback from pg_stat_database where datname = 'postgres'")
  echo $(( (b - a) / 10 ))
}
sessions() { q "select count(*) from pg_stat_activity where usename = 'authenticator' and xact_start is not null"; }
load() { q "select round(100.0 * count(*) filter (where state = 'active') / greatest(count(*), 1)) || '% of ' || count(*) || ' connections busy' from pg_stat_activity where usename = 'authenticator'"; }
echo "Transaction ids used so far: $(q "select age(datfrozenxid) from pg_database where datname = 'postgres'")"
before=$(rate)
echo "Before: $before transactions undone each second, $(sessions) open now, $(load)"
if [ "$before" -lt 5 ]; then
  echo "That's normal, so nothing was restarted."
  exit 0
fi
echo "That's far too many. Restarting PostgREST..."
docker restart supabase-rest >/dev/null </dev/null
for i in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' supabase-rest </dev/null)" = "healthy" ] && break
  sleep 2
done
echo "PostgREST is $(docker inspect -f '{{.State.Health.Status}}' supabase-rest </dev/null)."
after=$(rate)
echo "After: $after transactions undone each second, $(sessions) open now, $(load)"
echo "Site check: $(curl -s --max-time 15 https://www.farbaek.com/api/ready </dev/null)"
# end
'@

$OutputEncoding = New-Object System.Text.UTF8Encoding $false
Write-Host "Measuring for 10 seconds..." -ForegroundColor Cyan
$answer = ($remote -replace "`r", "") | ssh -i $Key -o StrictHostKeyChecking=accept-new "farbaek@$Server" "bash -s"
if ($LASTEXITCODE -ne 0) { Write-Host "The server didn't answer. Check the connection and try again." -ForegroundColor Red; exit 1 }
$answer | ForEach-Object { Write-Host $_ }
try {
  New-Item -ItemType Directory -Force -Path (Split-Path $SaveTo) | Out-Null
  $answer | Set-Content -LiteralPath $SaveTo -Encoding UTF8
  Write-Host ""
  Write-Host "Done. Tell Claude. It's saved in $SaveTo" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "It couldn't be saved, so copy everything above and send it to Claude." -ForegroundColor Yellow
}
