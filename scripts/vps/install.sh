#!/usr/bin/env bash
# Installs Farbaek's deploy tools from the checkout at /opt/farbaek/app
# (ADR 0035, 0036): the deploy, sweep, set-env and database commands, and
# the systemd timers. Run as
# root after bootstrap.sh and the first clone, and again whenever these files
# change. Safe to run again.
set -euo pipefail

main() {
  [ "$(id -u)" = 0 ] || { echo "Run this as root (sudo)."; exit 1; }
  local app=/opt/farbaek/app
  [ -d "$app/.git" ] || { echo "Clone the repo to $app first (docs/deploy/vps.md)."; exit 1; }

  install -m 755 "$app/scripts/vps/deploy.sh" /usr/local/bin/farbaek-deploy
  install -m 755 "$app/scripts/vps/sweep.sh" /usr/local/bin/farbaek-sweep
  install -m 755 "$app/scripts/vps/jobs.sh" /usr/local/bin/farbaek-jobs
  install -m 755 "$app/scripts/vps/set-env.sh" /usr/local/bin/farbaek-set-env
  # The database on this server (ADR 0036).
  install -m 755 "$app/scripts/vps/supabase-setup.sh" /usr/local/bin/farbaek-supabase-setup
  install -m 755 "$app/scripts/vps/db-move.sh" /usr/local/bin/farbaek-db-move
  install -m 755 "$app/scripts/vps/db-backup.sh" /usr/local/bin/farbaek-db-backup
  install -m 755 "$app/scripts/vps/db-restore-test.sh" /usr/local/bin/farbaek-db-restore-test
  install -m 755 "$app/scripts/vps/db-cutover.sh" /usr/local/bin/farbaek-db-cutover
  # Sign in with Apple on the website (ADR 0114): Auth's six-month secret, renewed when due.
  install -m 755 "$app/scripts/vps/apple-web-secret.sh" /usr/local/bin/farbaek-apple-secret
  install -m 644 "$app"/deploy/vps/systemd/farbaek-*.service "$app"/deploy/vps/systemd/farbaek-*.timer /etc/systemd/system/
  if [ ! -f /opt/farbaek/env/production.env ]; then
    install -m 600 -o farbaek -g farbaek "$app/deploy/vps/production.env.example" /opt/farbaek/env/production.env
    echo "Created /opt/farbaek/env/production.env from the template. Fill in the secret values before deploying."
  fi
  systemctl daemon-reload
  # The deploy timer starts only when asked: the first deploy is done by hand.
  local arg
  for arg in "$@"; do
    case "$arg" in
      --enable-timers) systemctl enable --now farbaek-deploy.timer farbaek-sweep.timer farbaek-jobs.timer ;;
      # Once the database runs here: nightly backups and a weekly restore test.
      --enable-db-timers) systemctl enable --now farbaek-db-backup.timer farbaek-db-restore-test.timer ;;
      # Once Sign in with Apple is set up: the hourly check on Auth's secret.
      --enable-apple-timer) systemctl enable --now farbaek-apple-secret.timer ;;
    esac
  done
  local t
  for t in deploy sweep jobs db-backup db-restore-test apple-secret; do echo "timer $t: $(systemctl is-enabled farbaek-$t.timer 2>/dev/null || true)"; done
}

main "$@"
exit 0
