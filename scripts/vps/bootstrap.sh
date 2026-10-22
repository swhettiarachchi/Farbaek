#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 VPS for Farbaek (ADR 0035, docs/deploy/vps.md).
# Run as root. Safe to run again: each step checks before it changes anything.
#
#   bootstrap.sh              updates, firewall, Docker, the farbaek user, folders
#   bootstrap.sh --lock-ssh   then turns off password and root login over SSH
#                             (only once `ssh farbaek@<server>` works with a key)
set -euo pipefail

main() {
  [ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }
  export DEBIAN_FRONTEND=noninteractive

  step "Updates and base packages"
  apt-get update -q
  apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
  apt-get -y -q install ca-certificates curl git jq ufw fail2ban unattended-upgrades
  timedatectl set-timezone UTC

  step "Automatic security updates"
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
  systemctl enable --now unattended-upgrades >/dev/null

  step "Swap (2 GB), so a build can't run the server out of memory"
  if ! swapon --show | grep -q /swapfile; then
    [ -f /swapfile ] || { fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null; }
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  step "Firewall: SSH, HTTP and HTTPS only"
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  for rule in 22/tcp 80/tcp 443/tcp 443/udp; do ufw allow "$rule" >/dev/null; done
  ufw --force enable >/dev/null
  systemctl enable --now fail2ban >/dev/null

  step "Docker Engine and compose, from Docker's own repository"
  if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  local daemon='{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}'
  if [ "$(cat /etc/docker/daemon.json 2>/dev/null)" != "$daemon" ]; then
    echo "$daemon" > /etc/docker/daemon.json
    systemctl restart docker
  fi
  systemctl enable --now docker >/dev/null

  step "The farbaek user, with root's SSH keys"
  id farbaek >/dev/null 2>&1 || useradd -m -s /bin/bash farbaek
  usermod -aG docker farbaek
  install -d -m 700 -o farbaek -g farbaek /home/farbaek/.ssh
  if [ -s /root/.ssh/authorized_keys ]; then
    install -m 600 -o farbaek -g farbaek /root/.ssh/authorized_keys /home/farbaek/.ssh/authorized_keys
  fi
  echo 'farbaek ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/farbaek
  chmod 440 /etc/sudoers.d/farbaek
  visudo -cf /etc/sudoers.d/farbaek >/dev/null

  step "Folders"
  install -d -m 755 -o farbaek -g farbaek /opt/farbaek /opt/farbaek/state /var/log/farbaek
  install -d -m 700 -o farbaek -g farbaek /opt/farbaek/env

  if [ "${1:-}" = "--lock-ssh" ]; then
    step "SSH: keys only, no root login"
    [ -s /home/farbaek/.ssh/authorized_keys ] || { echo "farbaek has no SSH key yet; not locking SSH."; exit 1; }
    cat > /etc/ssh/sshd_config.d/10-farbaek.conf <<'CONF'
# Farbaek (scripts/vps/bootstrap.sh): keys only. Read before 50-cloud-init.conf, so these win.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
    sshd -t
    # Ubuntu 24.04 may run sshd through ssh.socket; a restart keeps open sessions either way.
    systemctl reload ssh 2>/dev/null || systemctl restart ssh
  fi

  step "Done"
}

step() { printf '\n== %s\n' "$1"; }

main "$@"
exit 0
