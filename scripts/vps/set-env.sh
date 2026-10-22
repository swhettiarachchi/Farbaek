#!/usr/bin/env bash
# Saves settings into /opt/farbaek/env/production.env (or another allowed
# settings file) from NAME=value lines on standard input (ADR 0035, 0036). scripts/vps/set-secrets.ps1 sends the owner's
# values here over SSH, so they never appear on a command line, a screen or a
# log. It prints the names it set, never a value. Runs as farbaek.
set -euo pipefail

#   farbaek-set-env                  the app's settings (production.env)
#   farbaek-set-env --file <path>    another settings file, from the list below
ENV_FILE=/opt/farbaek/env/production.env
ALLOWED=(/opt/farbaek/env/production.env /opt/farbaek/env/migration.env /opt/farbaek/env/backup.env /opt/farbaek/supabase/docker/.env)

main() {
  if [ "${1:-}" = "--file" ]; then
    local wanted="${2:-}" ok=0 path
    for path in "${ALLOWED[@]}"; do [ "$wanted" = "$path" ] && ok=1; done
    [ "$ok" = 1 ] || { echo "farbaek-set-env only writes: ${ALLOWED[*]}"; exit 1; }
    ENV_FILE="$wanted"
  fi
  umask 077
  [ -f "$ENV_FILE" ] || : > "$ENV_FILE"
  local tmp
  tmp=$(mktemp "$(dirname "$ENV_FILE")/.production.env.XXXXXX")
  # Expanded now: the local variable is gone by the time the shell exits.
  trap "rm -f '$tmp' '$tmp.next'" EXIT
  cp "$ENV_FILE" "$tmp"

  local line name value count=0
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'} # Windows sends CRLF
    [ -n "$line" ] || continue
    name=${line%%=*}
    value=${line#*=}
    if [ "$name" = "$line" ] || ! [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]]; then
      echo "skipped a line that isn't NAME=value"
      continue
    fi
    if grep -q "^${name}=" "$tmp"; then
      # The value reaches awk through its environment, so no character in it needs escaping.
      NAME="$name" VALUE="$value" awk 'BEGIN { n = ENVIRON["NAME"] "=" } index($0, n) == 1 { print n ENVIRON["VALUE"]; next } { print }' "$tmp" > "$tmp.next"
      mv "$tmp.next" "$tmp"
    else
      printf '%s=%s\n' "$name" "$value" >> "$tmp"
    fi
    echo "set $name"
    count=$((count + 1))
  done

  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  echo "$count setting(s) saved."
}

main "$@"
exit 0
