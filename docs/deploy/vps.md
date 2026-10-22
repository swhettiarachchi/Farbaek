# Running Farbaek on the VPS

Farbaek runs on the owner's Hostinger KVM 2 (ADR 0035). It replaced Railway after Railway's 2026-10-21 breach.

| | |
| --- | --- |
| Server | `srv2085400.hstgr.cloud`, `2.25.88.188`, Ubuntu 24.04, 2 vCPU, 8 GB, 100 GB |
| Database | Supabase, unchanged |
| Login | `ssh farbaek@2.25.88.188`, keys only |

It's still one long-lived Node server with one replica, because agent runs live in the process (ADR 0022). Values never go in the repo; this file names settings only.

## How it fits together

- **Caddy** (`farbaek-caddy`):
  - the only thing listening on ports 80 and 443;
  - gets and renews HTTPS certificates itself;
  - passes each request, Host header unchanged, to the app; `src/proxy.ts` decides what every name serves.
- **The app** (`farbaek-app`): the image built from `Dockerfile`. It's reachable only inside Docker's network.
- **Deploys:**
  - `farbaek-deploy.timer` runs `/usr/local/bin/farbaek-deploy` every 2 minutes;
  - when `origin/main` has moved, it builds `farbaek-app:<commit>`, starts it, and waits up to 90 s for `/api/health`;
  - a build that isn't healthy is replaced by the previous one;
  - a commit that failed isn't retried until a newer one lands;
  - the log is `/var/log/farbaek/deploy.log`.
- **Sandbox cleanup:** `farbaek-sweep.timer` calls `POST /api/internal/sandbox/sweep` every 15 minutes, from inside the app container, which already holds `SANDBOX_CRON_SECRET`.
- **Secrets:** they live only in `/opt/farbaek/env/production.env` (mode 600, owner `farbaek`).
  - The build reads that file as a secret mount, so the `NEXT_PUBLIC_*` values get inlined and nothing is written into a layer.
  - The running app gets it from compose's `env_file`.

## Files

| In the repo | On the server |
| --- | --- |
| `Dockerfile`, `.dockerignore` | Built in `/opt/farbaek/app`, the checkout |
| `deploy/vps/compose.yaml` | Run from the checkout |
| `deploy/vps/caddy/Caddyfile` | Mounted read-only into Caddy; reloaded after every deploy |
| `deploy/vps/production.env.example` | Copied once to `/opt/farbaek/env/production.env` |
| `deploy/vps/systemd/*` | `/etc/systemd/system/` |
| `scripts/vps/deploy.sh`, `sweep.sh` | `/usr/local/bin/farbaek-deploy`, `farbaek-sweep` |
| `scripts/vps/bootstrap.sh`, `install.sh` | Run by hand: the first setup, and after these files change |

## Setting up a server from nothing

1. **In hPanel:** Ubuntu 24.04, add the admin's SSH public key under VPS → Settings → SSH keys.
2. **As root:** `bash bootstrap.sh`. Once `ssh farbaek@<ip>` works, run `bash bootstrap.sh --lock-ssh`, which turns off password and root login.
3. **As farbaek:** make a deploy key, then add the public half at GitHub → Farbaek → Settings → Deploy keys, read only:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C farbaek-vps-deploy
   ```
   Then point `github.com` at that key in `~/.ssh/config` and clone the repo:
   ```bash
   git clone git@github.com:swhettiarachchi/Farbaek.git /opt/farbaek/app
   ```
4. **Install:** `sudo bash /opt/farbaek/app/scripts/vps/install.sh`. It creates `production.env` from the template.
5. **The owner fills in the secret values** with `nano /opt/farbaek/env/production.env`, in their own SSH session. Nobody else reads the file.
6. **First deploy:** `farbaek-deploy <branch>`, by hand.
7. **Timers:** once `main` has the deploy files, `sudo bash /opt/farbaek/app/scripts/vps/install.sh --enable-timers`.

## Everyday

| To | Run |
| --- | --- |
| Release | Merge to `main`; it's live within about 2 minutes plus the build |
| Deploy a branch now | `farbaek-deploy feat/something` |
| Rebuild what's running (for example after changing `production.env`) | `farbaek-deploy --again` |
| Roll back | `farbaek-deploy $(cat /opt/farbaek/state/previous)` |
| See the deploy log | `tail -50 /var/log/farbaek/deploy.log` |
| See the app's log | `docker logs --tail 200 farbaek-app` |
| Check health | `docker inspect -f '{{.State.Health.Status}}' farbaek-app` |
| Pause automatic deploys | `sudo systemctl stop farbaek-deploy.timer` |

A deploy restarts the app. Agent runs going at that moment show as Interrupted.

`NEXT_PUBLIC_*` values are built into the app, so run `farbaek-deploy --again` after changing them.

## DNS and certificates

- **farbaek.com:** DNS stays at Spaceship, with the email records. `www` and `officespace` are A records to the server, and the apex forwards to `https://www.farbaek.com`. Caddy gets ordinary certificates for both names.
- **farbaek.si:** published sites and previews need one wildcard certificate, `*.farbaek.si`. That needs a DNS-01 challenge, and Caddy has no Hostinger DNS plugin. So farbaek.si's DNS moves to Cloudflare (free plan), with an API token that can edit DNS for that one zone. Caddy is then built with the `caddy-dns/cloudflare` module, and a `*.farbaek.si, farbaek.si` block is added. Until then, farbaek.si isn't served from this server.

## Checking a deploy

1. `curl -s https://www.farbaek.com/api/health` shows the commit in the deploy log.
2. The home page, pricing and sign-in load. A sign-in link arrives and signs in.
3. `officespace.farbaek.com` shows the office sign-in. Any other `*.farbaek.com` name answers 404.
4. `docker logs farbaek-app` shows no errors.
