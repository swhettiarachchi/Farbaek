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
