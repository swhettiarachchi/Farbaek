#!/usr/bin/env bash
# Sets up self-hosted Supabase for Farbaek's database (ADR 0036,
# docs/deploy/vps.md). Runs as farbaek. Safe to run again: it never
# regenerates secrets that already exist.
#
#   supabase-setup.sh           fetch the pinned files, make the secrets, apply settings, start
#   supabase-setup.sh --reset   also delete the database and start empty (asks first)
set -euo pipefail

# Supabase's official docker folder, at a commit at least two weeks old.
SUPABASE_COMMIT=3fc8af387ec4dfb449510828a938e1f6e57a9575
ROOT=/opt/farbaek/supabase
DOCKER_DIR=$ROOT/docker
APP=/opt/farbaek/app

main() {
  step "Supabase's official files at ${SUPABASE_COMMIT:0:12}"
  if [ ! -d "$ROOT/.git" ]; then
    git init --quiet "$ROOT"
    git -C "$ROOT" remote add origin https://github.com/supabase/supabase.git
    git -C "$ROOT" sparse-checkout set docker
  fi
  if [ "$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)" != "$SUPABASE_COMMIT" ]; then
    git -C "$ROOT" fetch --quiet --depth 1 --filter=blob:none origin "$SUPABASE_COMMIT"
    git -C "$ROOT" checkout --quiet --detach "$SUPABASE_COMMIT"
  fi

  step "Secrets (made here, never printed)"
  if [ ! -f "$DOCKER_DIR/.env" ]; then
    (umask 077 && cp "$DOCKER_DIR/.env.example" "$DOCKER_DIR/.env")
    (cd "$DOCKER_DIR" && sh utils/generate-keys.sh --update-env >/dev/null)
    echo "generated new secrets in $DOCKER_DIR/.env"
  else
    echo "kept the existing secrets"
  fi
  chmod 600 "$DOCKER_DIR/.env"

  step "Farbaek's settings"
  grep -Ev '^\s*(#|$)' "$APP/deploy/vps/supabase/farbaek.env" | farbaek-set-env --file "$DOCKER_DIR/.env" | grep -c '^set ' | sed 's/$/ settings applied/'

  if [ "${1:-}" = "--reset" ]; then
    step "Reset: delete the database and start empty"
    read -r -p "This deletes every row in the self-hosted database. Type RESET to go on: " answer
    [ "$answer" = "RESET" ] || { echo "Not reset."; exit 1; }
    (cd "$DOCKER_DIR" && docker compose down --remove-orphans)
    sudo rm -rf "$DOCKER_DIR/volumes/db/data"
  fi

  step "Start"
  (cd "$DOCKER_DIR" && docker compose up -d --remove-orphans)
  wait_healthy supabase-db supabase-auth supabase-rest supabase-meta supabase-studio supabase-envoy
  (cd "$DOCKER_DIR" && docker compose ps --format '{{.Name}}  {{.Status}}')
}

wait_healthy() {
  local name status i
  for name in "$@"; do
    for i in $(seq 1 60); do
      status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo missing)
      [ "$status" = healthy ] || [ "$status" = running ] && break
      sleep 3
    done
    echo "$name: $status"
  done
}

step() { printf '\n== %s\n' "$1"; }

main "$@"
exit 0
