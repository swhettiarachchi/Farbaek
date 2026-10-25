# Stage 49: Background jobs report each run

- **Decision record:** `docs/adr/0071-job-runs.md`.
- **Branch:** `feat/job-heartbeats`, from `main` at `bf39f18`.

## 2026-10-24

### Done

- **Migration v43:** `job_runs`, `app_note_job_run`, `app_job_runs`.
- **Recording:**
  - the sweep and hourly routes record each run;
  - `db-backup.sh` and `db-restore-test.sh` record theirs with `psql`, failures included.
- **Health page:** Office Space Health has a check per job: ok, late, failing, or no report yet.
- **Readiness:** `/api/ready` fails with `"jobs": "late"` and the job names.

### Verified

- `src/core/ops/jobs.test.ts` (3): limits, failing after a success, never-reported jobs left out of readiness.
- `tests/db/job-runs.test.ts` (3): success and failure times kept, unknown jobs refused, browsers refused, the database owner can record.
- The office tests still pass.
- `pnpm typecheck` and lint are clean.

### The owner's step after merging

Rerun the installer once so the backup scripts report:

```bash
ssh -t -i ~/.ssh/farbaek_vps farbaek@2.25.88.188 "sudo bash /opt/farbaek/app/scripts/vps/install.sh"
```

## 2026-10-25

### Done

- **Installer:** the owner ran it at 04:21 UTC. The installed backup and restore-test scripts now report their runs.
- **File modes:** the server scripts are stored as executable in git. Before this, running `install.sh` directly said "command not found".
- **`note_run`:**
  - the line continuation in both scripts was the two characters `\n`, not a line break. psql ignored the stray `n`, so it still worked, but only by luck;
  - quotes in a message are now escaped;
  - the restore test now records a failure when it stops early, such as when there's no backup or Docker fails.

### Verified

- `tests/ops/server-scripts.test.ts` (2): no broken line continuations in `scripts/vps/`, and the reporting scripts use known job keys and report both outcomes. It fails on the old scripts.
- On the server, read-only: the corrected `psql` call runs as `farbaek` and can execute `app_note_job_run`.
- `job_runs` shows the sweep at 04:24 UTC. The hourly jobs report next, the backup at 02:30 UTC, and the restore test on Sunday.

### Next

After this merges, rerun the installer once (the command above), so the server gets the corrected scripts.
