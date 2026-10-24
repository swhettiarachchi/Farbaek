# Stage 44: Production check, and a disk that was filling up

A check of everything live after #51, which found the server's disk 81% full of Docker build cache.

- **Branch:** `fix/build-cache-cap`, from `main` at `610daae`.

## 2026-10-24

### Checked in production (commit `610daae`)

- **Pages and endpoints:** `/`, `/pricing`, `/sign-in`, `/verify`, `/security`, `/proofpack/v1`, `/terms`, `/privacy`, `/acceptable-use`, `/.well-known/farbaek-keys.json` and `/.well-known/security.txt` answer 200; `/app` redirects to sign-in; the bare domain redirects with its path; Office Space answers.
- **`/api/health`** and **`/api/ready`** are ok.
- **Containers:** all eight are up, and the seven with health checks are healthy.
- **Timers:** the sweep (every 15 minutes), the jobs (hourly) and the nightly backup last ran successfully.
- **Backups:** the restore test had never run (its weekly timer first fires on Sunday).
  - Run by hand, it failed on last night's backup: five tables missing and one empty. All six came from today: the tables from today's migrations, and the first rows of `task_verifications` from today's first check.
  - A fresh backup (`farbaek-20261024T134517Z.dump`) then passed: 54 tables.
- **Not checked:** a real sign-in after #51. Writing a test row to the production database, to check the new limiter without sending an email, was refused, so the owner's next sign-in is the check.

### Found and fixed

**The disk was 81% full (77 of 96 GB):**
- **Cause:** Docker build cache, 67.7 GB of it. Each deploy adds about 3.5 GB, and `deploy.sh` only removed cache older than a week. With a dozen deploys a day, the disk would have filled within days, and Postgres stops when it can't write.
- **Cleared on the server:** cache older than a day, then the rest down to 10 GB. The disk is now 27% used, with 71 GB free.
- **`deploy.sh`** now caps build cache at 10 GB after each deploy, keeping the newest.
- **`/api/ready`** now also reports the disk: under 10% or 5 GB free, it answers 503 with `"disk": "low"`, so an uptime monitor alerts. Inside the app container, `/` reports the server's own disk: read back as 75.8 GB free, matching the host.

### Verified

- `src/server/ops/disk.test.ts` (3);
- `pnpm typecheck` and `pnpm lint` are clean;
- the full `pnpm test` passed 1,421 tests.

### Next

- **Owner:**
  - a monitor on `https://www.farbaek.com/api/ready`;
  - an R2 bucket for off-server backups (`backup.env` has no remote yet);
  - one sign-in to confirm #51.
- **Code:** heartbeat pings for the timers, and an export of everything a person has.
