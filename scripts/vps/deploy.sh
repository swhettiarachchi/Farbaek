#!/usr/bin/env bash
# Builds and runs Farbaek from git, and puts the last good build back if the
# new one isn't healthy (ADR 0035, docs/deploy/vps.md). Runs as farbaek.
#
#   farbaek-deploy             deploy origin/main if it moved (the 2-minute timer)
#   farbaek-deploy <ref>       deploy that branch or commit now
#   farbaek-deploy --again     rebuild and redeploy what's running
#
# install.sh copies this to /usr/local/bin/farbaek-deploy, so a checkout can
# never change the script while it runs.
set -euo pipefail

APP=/opt/farbaek/app
ENV_FILE=/opt/farbaek/env/production.env
STATE=/opt/farbaek/state
LOG=/var/log/farbaek/deploy.log
COMPOSE=(docker compose -f "$APP/deploy/vps/compose.yaml")
REQUIRED=(NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY)

main() {
  exec 9>"$STATE/deploy.lock"
  flock -n 9 || exit 0 # another deploy is running

  local ref="main" timer=1
  case "${1:-}" in
    "") ;;
    --again) timer=0 ;;
    *) ref="$1"; timer=0 ;;
  esac

  cd "$APP"
  git fetch --quiet --prune origin
  local sha current
  sha=$(git rev-parse --verify --quiet "origin/$ref^{commit}" || git rev-parse --verify --quiet "$ref^{commit}") || { log "no such ref: $ref"; exit 1; }
  current=$(cat "$STATE/current" 2>/dev/null || true)
  if [ "$timer" = 1 ] && [ "$sha" = "$current" ]; then exit 0; fi
  # A commit that failed once waits for the next one, instead of rebuilding every 2 minutes.
  if [ "$timer" = 1 ] && [ "$sha" = "$(cat "$STATE/failed" 2>/dev/null || true)" ]; then exit 0; fi
  [ "${1:-}" = "--again" ] && sha="${current:?nothing is deployed yet}"

  # Names only: the values are never read into this script or a log.
  local name
  for name in "${REQUIRED[@]}"; do
    grep -Eq "^${name}=.+" "$ENV_FILE" || { log "not deploying: $name isn't set in $ENV_FILE"; exit 1; }
  done

  log "building ${sha:0:12} ($ref)"
  git checkout --quiet --force --detach "$sha"
  # Once the database runs on this server (ADR 0036), a commit without its API route would cut the app off from it.
  if [ -f /opt/farbaek/supabase/docker/.env ] && ! grep -q 'api\.farbaek\.com' deploy/vps/caddy/Caddyfile; then
    log "not deploying ${sha:0:12}: its Caddyfile has no api.farbaek.com route, and the database runs here"
    [ -n "$current" ] && git checkout --quiet --force --detach "$current"
    echo "$sha" > "$STATE/failed"
    exit 1
  fi
  if ! DOCKER_BUILDKIT=1 docker build --secret "id=env,src=$ENV_FILE" --build-arg "FARBAEK_COMMIT=$sha" -t "farbaek-app:$sha" . >>"$LOG" 2>&1; then
    log "build failed for ${sha:0:12}; still running ${current:0:12}"
    echo "$sha" > "$STATE/failed"
    exit 1
  fi

  # Caddy's own image (ADR 0152), built once per tag. A failed build keeps today's Caddy and app.
  if ! FARBAEK_IMAGE_TAG="$sha" "${COMPOSE[@]}" build caddy >>"$LOG" 2>&1; then
    log "caddy image build failed for ${sha:0:12}; still running ${current:0:12}"
    echo "$sha" > "$STATE/failed"
    exit 1
  fi

  FARBAEK_IMAGE_TAG="$sha" "${COMPOSE[@]}" up -d --remove-orphans >>"$LOG" 2>&1
  if healthy; then
    [ -n "$current" ] && [ "$current" != "$sha" ] && echo "$current" > "$STATE/previous"
    echo "$sha" > "$STATE/current"
    FARBAEK_IMAGE_TAG="$sha" "${COMPOSE[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile >>"$LOG" 2>&1 || log "caddy reload failed; it keeps its last config"
    log "live: ${sha:0:12}"
    prune "$sha" "$current"
  else
    log "${sha:0:12} isn't healthy; putting ${current:0:12} back"
    echo "$sha" > "$STATE/failed"
    if [ -n "$current" ]; then
      git checkout --quiet --force --detach "$current"
      FARBAEK_IMAGE_TAG="$current" "${COMPOSE[@]}" up -d >>"$LOG" 2>&1
    fi
    exit 1
  fi
}

# Waits up to 90 seconds for Docker's health check on the app.
healthy() {
  local i status
  for i in $(seq 1 30); do
    status=$(docker inspect -f '{{.State.Health.Status}}' farbaek-app 2>/dev/null || echo missing)
    [ "$status" = healthy ] && return 0
    sleep 3
  done
  return 1
}

# Keeps the running image and the one before it; removes older Farbaek images.
# Build cache is capped at 10 GB, newest kept: each build adds about 3.5 GB,
# and a week of it (the old rule) filled 81% of the disk on 2026-10-24.
prune() {
  local keep_a="farbaek-app:$1" keep_b="farbaek-app:${2:-none}" image
  for image in $(docker images farbaek-app --format '{{.Repository}}:{{.Tag}}'); do
    [ "$image" = "$keep_a" ] || [ "$image" = "$keep_b" ] || docker rmi "$image" >/dev/null 2>&1 || true
  done
  docker builder prune -f --max-used-space 10GB >/dev/null 2>&1 || docker builder prune -f --filter until=24h >/dev/null 2>&1 || true
}

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG"; }

main "$@"
exit 0
