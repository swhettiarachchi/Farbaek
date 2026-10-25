# ADR 0071: Background jobs report each run

- Status: accepted (2026-10-24).
- Builds on ADR 0063 (scheduled jobs), ADR 0036 (backups) and ADR 0065 (`/api/ready`).

## Context

Four timers run Farbaek's background work:
- the sandbox sweep, every 15 minutes;
- the hourly jobs;
- the nightly backup;
- the weekly restore test.

Nothing watched them. A stopped timer, or a backup failing every night, would go unnoticed until something else broke.

## Decision

**Each job records its last success and last failure** in `job_runs` (migration v43):
- the sweep and hourly routes record through the server key;
- the backup scripts record with `psql` as the database owner;
- recording never fails the job.

**Each job has a limit** (`src/core/ops/jobs.ts`):
- sweep 1 hour;
- hourly jobs 3 hours;
- backup 30 hours;
- restore test 8 days.

A job is **failing** if its last run failed, and **late** past its limit. One that never reported is **unknown**, never alarming.

**Where it shows:**
- Office Space Health shows one check per job;
- `/api/ready` answers 503 with `"jobs": "late"` and the job names, so the uptime check emails the owner.

**One server step:** the backup scripts are installed copies, so they report only once `install.sh` has been run again. Until then, their checks say so.

## Consequences

- A stopped or failing job reaches the owner through the same uptime alert as an outage.
- The alert says "late" for at most one job limit's worth of time after a fix lands.
