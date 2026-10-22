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

## 2026-10-22: the database on the VPS, and farbaek.com live from it

Decision record: `docs/adr/0036-database-on-the-vps.md`.

### Done

- **farbaek.com moved:** at Spaceship, `www`, `officespace` and `api` became A records to `2.25.88.188` (TTL 5 min). The owner made the changes; the session's safety layer blocks DNS edits. Caddy got Let's Encrypt certificates for all three.
- **Self-hosted Supabase** (`scripts/vps/supabase-setup.sh`):
  - Supabase's official compose, pinned at `3fc8af38`, plus Farbaek's override;
  - Postgres 17.6, Auth 2.197.0 (the cloud's version), PostgREST 14.17, Envoy, meta and Studio;
  - no published ports;
  - secrets generated on the server by Supabase's own `generate-keys.sh` (the owner ran the setup);
  - the email password entered by the owner through the settings form.
- **The data moved** (`farbaek-db-move`):
  - Supabase's documented dump with the CLI pinned at 2.120.0 (checksum verified), restored in one transaction;
  - two adjustments, both documented in the script: the cloud's grant to Realtime's reserved role is left out (Realtime is off), and Supabase Storage's empty tables are left out (the script stops if they ever hold rows).
- **Cutover** (`farbaek-db-cutover`, run by the owner):
  - checked the counts again;
  - kept the cloud settings in `production.env.cloud`;
  - pointed the app at `https://api.farbaek.com`;
  - rebuilt.
- **Backups:**
  - nightly `pg_dump` at 02:30 UTC, keeping 14 days;
  - a weekly restore test;
  - the off-server copy waits for an R2 bucket.

### Verified

- **Row counts:** all 45 tables match between Supabase Cloud and the server (every `public` and `private` table, plus `auth.users`, `auth.identities` and `auth.mfa_factors`), at the rehearsal and again at cutover.
- **Through the gateway:**
  - Auth `/settings` answers 200;
  - anon reads 0 rows of `organizations` and `projects` (RLS);
  - the service key reads 1 workspace and 6 projects;
  - no key gets 401;
  - Studio's gateway route gets 401;
  - only `/auth/v1` and `/rest/v1` are forwarded publicly.
- **Live:**
  - `https://www.farbaek.com/api/health` answers 200;
  - `/`, `/pricing` and `/sign-in` return 200;
  - `officespace.farbaek.com` returns 307 to its sign-in;
  - the app server reads 6 projects through `https://api.farbaek.com`, and Auth reports email sign-in on;
  - all eight containers are healthy, and the app and Auth logs show no errors.
- **Backups:** the first backup (1.1 MB) restored into a throwaway container with all 43 checked tables present.

### Problems found and fixed

- **A leaked password:** the Supabase CLI's parse error quoted part of the database password into the session output (the password contained `@`). The owner reset it. `db-move.sh` now checks the address's shape without printing it, and keeps tool output in a server-side log. This is recorded in the incident record.
- **A short outage of the database route:** the cutover's rebuild used the running commit, whose Caddyfile predated `api.farbaek.com`, so for a few minutes the app couldn't reach its database. It was fixed by reloading the current Caddyfile and deploying `feat/vps-database`. `deploy.sh` now refuses such a commit.

### Not done yet

- **Sign-in end to end:** an email code arriving through Spacemail and signing in, done by the owner on www.farbaek.com. Everyone signs in once more, because the signing secret changed.
- **Merges and automatic deploys:** merge #12, then the database PR, then turn on the deploy and sweep timers.
- **Off-server backups:** a Cloudflare R2 bucket and token, entered through the settings form.
- **farbaek.si:** Cloudflare DNS for the wildcard certificate.
- **The sandbox:** a new Vercel token.
- **After 7 days:** delete or keep the Supabase Cloud project, and delete the Railway project.
