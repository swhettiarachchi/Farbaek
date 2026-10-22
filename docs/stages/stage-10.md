# Stage 10: Farbaek on its own server

Railway leaked customers' environment variables on 2026-10-21 and paused builds (`docs/security/incident-2026-10-21-railway.md`). The owner bought a Hostinger KVM 2 and asked for everything to move there: first the app, then the database.

- **Plan:** approved 2026-10-22.
- **Decision record:** `docs/adr/0035-vps-hosting.md`.
- **Runbook:** `docs/deploy/vps.md`.

## 2026-10-22: the app on the VPS

### Done

**Keys rotated by the owner:**
- the Supabase secret key (now `vps_server_2026_10_22`) and the publishable key (now `farbaek_web`);
- the Anthropic key;
- new random preview and cleanup secrets.

**The server** (`srv2085400.hstgr.cloud`, `2.25.88.188`: Ubuntu 24.04.5, 2 vCPU, 7.9 GB, 96 GB):
- `scripts/vps/bootstrap.sh`:
  - updates and unattended security upgrades;
  - ufw (22, 80, 443) and fail2ban;
  - 2 GB swap, Docker 29.9 and Compose 5.6 from Docker's repository, with log rotation;
  - the `farbaek` user;
  - SSH keys only, with root login off.
- My SSH key went in through hPanel; the server reads the repo with a read-only GitHub deploy key.

**Production settings:**
- They live only in `/opt/farbaek/env/production.env` (mode 600).
- The owner entered them through a local form that sent `NAME=value` lines over SSH to `farbaek-set-env`, which prints names only. No value passed through the chat, a command line or a log.

**The app:**
- `Dockerfile`, with the settings as a BuildKit secret, running as the non-root `node` user.
- Caddy in front with automatic HTTPS.
- `farbaek-deploy`: build, health check, roll back if unhealthy.
- The deploy and sweep timers are installed, and switched on once `main` has these files.

**Code:** `src/server/deployment.ts`, a host-neutral commit, environment and region, used by `/api/health`, Office Space and the admin label.

**Pull request:** swhettiarachchi/Farbaek#12.

### Verified

- **Locally:** the `deploymentInfo` and health route tests (7), `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- **Server hardening:**
  - `bootstrap.sh` ran twice, the second time changing nothing;
  - `ufw status` shows only 22, 80 and 443;
  - root login and password login are refused, and `farbaek` with the key works;
  - GitHub's host key matched its published fingerprint before the deploy key was trusted.
- **The keys from the server:** Supabase secret and publishable keys and the Anthropic key answer 200. Only status codes were printed.
- **The first deploy, `f5a7c197a4a1`:** built and healthy in about 2 minutes. Through Caddy's network, with each Host header:
  - `/api/health` shows the commit;
  - `/`, `/pricing` and `/sign-in` return 200, with the right page title;
  - `officespace.farbaek.com` returns 307 to its sign-in;
  - an unknown `*.farbaek.com` name returns 404;
  - the app log shows no errors.
- **Supabase Auth:** the site URL is `https://www.farbaek.com`, and the redirect URLs already include `www.farbaek.com/auth/callback` and `officespace.farbaek.com/sign-in`.
- **Caddy:** before DNS points at it, Caddy retries certificates on Let's Encrypt staging and ZeroSSL, so the production rate limits aren't spent.

### Not done yet

- **DNS at Spaceship:** `www` and `officespace` become A records to `2.25.88.188`. This needs the owner signed in. Until then farbaek.com is down: the Railway server's Supabase keys were rotated and Railway can't redeploy.
- **Merge #12,** then `sudo bash /opt/farbaek/app/scripts/vps/install.sh --enable-timers`.
- **farbaek.si:** published sites and previews need DNS at Cloudflare for the wildcard certificate.
- **The sandbox:** a new Vercel token (the old one was on Railway), entered through the settings form.
- **The database:** move it from Supabase to self-hosted Supabase on this server, with off-server backups. That's its own plan.
- **Retire Railway:** the owner deletes the project once farbaek.com has been served from the VPS for a day.
