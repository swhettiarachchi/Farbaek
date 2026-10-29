#!/usr/bin/env bash
# Keeps Supabase Auth's Sign in with Apple client secret for the website fresh
# (ADR 0114). Apple lets one live at most six months; the app makes a 180-day
# one with the Sign in with Apple key it holds (POST /api/internal/apple/
# web-secret, inside the container, with the scheduler's secret), and this
# writes it straight into Auth's settings and restarts Auth. The secret never
# reaches a screen, a command line or a log.
#
# Run every hour by farbaek-apple-secret.timer as farbaek. It does nothing
# until the checkout's compose file passes the secret to Auth, and nothing
# while the current one has more than 60 days left, so Auth restarts about
# every four months. Safe to run again at any time.
set -euo pipefail

compose=/opt/farbaek/app/deploy/vps/supabase/compose.farbaek.yaml
auth_env=/opt/farbaek/supabase/docker/.env
state=/opt/farbaek/state/apple-web-secret
failed=/opt/farbaek/state/apple-web-secret.failed
now=$(date +%s)

grep -q GOTRUE_EXTERNAL_APPLE_SECRET "$compose" || { echo "apple secret: Auth's settings don't take it yet; nothing to do"; exit 0; }
grep -q '^FARBAEK_APPLE_SIGN_IN=true' "$auth_env" || { echo "apple secret: Sign in with Apple is off in Auth; nothing to do"; exit 0; }

expires=$(cat "$state" 2>/dev/null || echo 0)
[[ "$expires" =~ ^[0-9]+$ ]] || expires=0
running=yes
docker exec supabase-auth sh -c 'test -n "$GOTRUE_EXTERNAL_APPLE_SECRET"' 2>/dev/null || running=no
if [ "$running" = yes ] && [ $((expires - now)) -gt $((60 * 86400)) ]; then
  echo "apple secret: good until $(date -u -d "@$expires" +%F)"
  exit 0
fi
# After a failed restart, wait half a day before trying again rather than restarting Auth every hour.
last_failure=$(cat "$failed" 2>/dev/null || echo 0)
[[ "$last_failure" =~ ^[0-9]+$ ]] || last_failure=0
if [ $((now - last_failure)) -lt $((12 * 3600)) ]; then
  echo "apple secret: the last renewal failed less than 12 hours ago; waiting"
  exit 0
fi

lines=$(docker exec farbaek-app node -e '
  const secret = process.env.SANDBOX_CRON_SECRET;
  if (!secret) { console.error("SANDBOX_CRON_SECRET is not set"); process.exit(1); }
  fetch("http://127.0.0.1:3000/api/internal/apple/web-secret", { method: "POST", headers: { authorization: "Bearer " + secret } })
    .then(async (r) => { const t = await r.text(); if (!r.ok) { console.error("HTTP " + r.status + " " + t.slice(0, 200)); process.exit(1); } process.stdout.write(t); })
    .catch((e) => { console.error(e.message); process.exit(1); });
') || { echo "apple secret: the app couldn't make one (is the Sign in with Apple key set?)"; exit 1; }

secret_line=$(printf '%s\n' "$lines" | grep -E '^FARBAEK_APPLE_SECRET=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' || true)
next_expires=$(printf '%s\n' "$lines" | sed -n 's/^FARBAEK_APPLE_SECRET_EXPIRES=\([0-9]\{10\}\)$/\1/p')
lines=
[ -n "$secret_line" ] && [ -n "$next_expires" ] || { echo "apple secret: the app's answer wasn't a secret; nothing changed"; exit 1; }

printf '%s\n' "$secret_line" | farbaek-set-env --file "$auth_env" >/dev/null
secret_line=
(cd /opt/farbaek/supabase/docker && docker compose up -d auth >/dev/null 2>&1)
sleep 5
if docker exec supabase-auth sh -c 'test -n "$GOTRUE_EXTERNAL_APPLE_SECRET"' 2>/dev/null; then
  echo "$next_expires" > "$state"
  rm -f "$failed"
  echo "apple secret: renewed; good until $(date -u -d "@$next_expires" +%F)"
else
  echo "$now" > "$failed"
  echo "apple secret: Auth restarted without it; trying again in 12 hours"
  exit 1
fi
