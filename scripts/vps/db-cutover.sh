#!/usr/bin/env bash
# Switches the app between Supabase Cloud and the self-hosted database on
# this server (ADR 0036). Runs as farbaek. No value is printed.
#
#   db-cutover.sh          check the row counts still match, keep the cloud
#                          settings aside, point the app at https://api.farbaek.com
#                          with the self-hosted keys, rebuild and redeploy
#   db-cutover.sh --back   put the cloud settings back, rebuild and redeploy
set -euo pipefail

APP_ENV=/opt/farbaek/env/production.env
CLOUD_COPY=/opt/farbaek/env/production.env.cloud
SUPABASE_ENV=/opt/farbaek/supabase/docker/.env
API_URL=https://api.farbaek.com
NAMES=(NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY)

main() {
  umask 077
  if [ "${1:-}" = "--back" ]; then
    [ -f "$CLOUD_COPY" ] || { echo "No cloud settings were kept aside; nothing to go back to."; exit 1; }
    grep -E "^($(IFS='|'; echo "${NAMES[*]}"))=" "$CLOUD_COPY" | farbaek-set-env
    echo "The app points at Supabase Cloud again. Rebuilding..."
    farbaek-deploy --again
    exit 0
  fi

  step "The address the app will use"
  # Any HTTP answer over valid HTTPS will do: without a key the gateway rightly says 401.
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$API_URL/auth/v1/health" 2>/dev/null || true)
  if [ -z "$code" ] || [ "$code" = 000 ]; then
    echo "$API_URL doesn't answer over HTTPS yet (DNS or its certificate). Not switching."
    exit 1
  fi
  echo "$API_URL answers over HTTPS ($code)"

  step "Row counts: Supabase Cloud against this server"
  farbaek-db-move --count

  step "Keep the cloud settings aside, for --back"
  if [ ! -f "$CLOUD_COPY" ]; then
    grep -E "^($(IFS='|'; echo "${NAMES[*]}"))=" "$APP_ENV" >"$CLOUD_COPY"
    chmod 600 "$CLOUD_COPY"
    echo "kept in $CLOUD_COPY"
  else
    echo "already kept in $CLOUD_COPY"
  fi

  step "Point the app at the self-hosted database"
  (
    set -a
    . "$SUPABASE_ENV"
    set +a
    printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%s\nSUPABASE_SECRET_KEY=%s\n' "$API_URL" "$ANON_KEY" "$SERVICE_ROLE_KEY"
  ) | farbaek-set-env

  step "Rebuild (the NEXT_PUBLIC_ values are built in) and deploy"
  farbaek-deploy --again
  echo "Done. To go back: db-cutover.sh --back"
}

step() { printf '\n== %s\n' "$1"; }

main "$@"
exit 0
