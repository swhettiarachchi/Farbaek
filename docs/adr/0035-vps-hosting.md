# ADR 0035: Hosting on the owner's VPS instead of Railway

- Status: accepted (2026-10-22).
- Replaces the hosting part of `docs/deploy/railway.md`.

## Context

On 2026-10-21 Railway reported that an attacker reached the systems storing customers' environment variables, and obtained some of them decrypted. It paused builds platform-wide, and they were still paused the next day. Farbaek's production secrets were stored there. The owner rotated them, starting with the Supabase secret key (`docs/security/incident-2026-10-21-railway.md`).

With builds paused, the Railway server kept running with a key that no longer exists. So saving, building and publishing stopped on farbaek.com, with no way to deploy a fix.

The owner bought a Hostinger KVM 2 (2 vCPU, 8 GB, 100 GB NVMe, Ubuntu 24.04) to run Farbaek themselves.

## Decision

Run Farbaek on the VPS with Docker.

- **One app container** built from the repo's `Dockerfile`: `pnpm build`, then `next start`, as the non-root `node` user. It's still one long-lived process with one replica (ADR 0022).
- **Caddy** in front: the only public listener, with automatic HTTPS. It passes the Host header through, so `src/proxy.ts` keeps deciding what each name serves.
- **Deploys pull:**
  - A systemd timer checks `origin/main` every 2 minutes, builds the new commit, and waits for `/api/health`.
  - It rolls back to the previous image if the new one isn't healthy.
  - The server reads the private repo with a read-only deploy key.
  - Nothing outside the server can push to it: no CI secret and no inbound webhook.
- **Secrets:**
  - They live only in `/opt/farbaek/env/production.env` (mode 600), typed in by the owner.
  - Scripts check that the required names are set and never read the values.
  - The build gets the file as a BuildKit secret mount, so it's never in an image layer.
  - The sandbox sweep runs inside the app container, which already has `SANDBOX_CRON_SECRET`.
- **The server is hardened** by `scripts/vps/bootstrap.sh`:
  - ufw allows only 22, 80 and 443, and fail2ban watches SSH;
  - SSH is keys only, with root login off;
  - unattended security upgrades, a swap file, and Docker log rotation.
- **Deployment facts are host-neutral.** `src/server/deployment.ts` reads `FARBAEK_COMMIT`, `FARBAEK_ENVIRONMENT` and `FARBAEK_REGION`, keeping the `RAILWAY_*` names as a fallback. `/api/health`, Office Space's health page and the admin label use it.
- **DNS:**
  - farbaek.com stays at Spaceship; `www` and `officespace` point at the server.
  - farbaek.si's wildcard needs DNS-01, and there's no Hostinger DNS plugin for Caddy, so its DNS moves to Cloudflare's free plan, with a zone-scoped token.

## Alternatives considered

- **Stay on Railway:** builds were paused with no end date, and its variable store had just leaked.
- **Push deploys from GitHub Actions over SSH:** that puts a key to production in GitHub. Pulling keeps the only credential on the server, and it's read only.
- **Hostinger's Docker manager or a panel such as Coolify:** another admin surface to secure, and it would fight with this compose setup.

## Consequences

- **Farbaek now owns patching, the firewall and SSH.** Unattended upgrades cover security updates. Docker and Caddy versions are pinned and updated deliberately.
- **A deploy restarts the app.** Caddy holds requests for up to 20 s while the container swaps, and agent runs going at that moment show as Interrupted, as before.
- **The server holds no data,** so losing it means rebuilding it from `docs/deploy/vps.md`. That stops being true when the database moves here; that stage brings off-server backups.
- **Next:** move the database from Supabase to self-hosted Supabase on this server, as the owner asked on 2026-10-22. That needs its own plan: the data copy, sign-in, email, and backups.
