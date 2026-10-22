#!/usr/bin/env bash
# Installs Farbaek's deploy tools from the checkout at /opt/farbaek/app
# (ADR 0035): the deploy and sweep commands, and their systemd timers. Run as
# root after bootstrap.sh and the first clone, and again whenever these files
# change. Safe to run again.
set -euo pipefail

main() {
  [ "$(id -u)" = 0 ] || { echo "Run this as root (sudo)."; exit 1; }
  local app=/opt/farbaek/app
  [ -d "$app/.git" ] || { echo "Clone the repo to $app first (docs/deploy/vps.md)."; exit 1; }

  install -m 755 "$app/scripts/vps/deploy.sh" /usr/local/bin/farbaek-deploy
  install -m 755 "$app/scripts/vps/sweep.sh" /usr/local/bin/farbaek-sweep
  install -m 644 "$app"/deploy/vps/systemd/farbaek-*.service "$app"/deploy/vps/systemd/farbaek-*.timer /etc/systemd/system/
  if [ ! -f /opt/farbaek/env/production.env ]; then
    install -m 600 -o farbaek -g farbaek "$app/deploy/vps/production.env.example" /opt/farbaek/env/production.env
    echo "Created /opt/farbaek/env/production.env from the template. Fill in the secret values before deploying."
  fi
  systemctl daemon-reload
  # The deploy timer starts only when asked: the first deploy is done by hand.
  if [ "${1:-}" = "--enable-timers" ]; then
    systemctl enable --now farbaek-deploy.timer farbaek-sweep.timer
  fi
  echo "Installed. Timers: $(systemctl is-enabled farbaek-deploy.timer 2>/dev/null || echo off) (deploy), $(systemctl is-enabled farbaek-sweep.timer 2>/dev/null || echo off) (sweep)."
}

main "$@"
exit 0
