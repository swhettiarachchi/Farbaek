#!/usr/bin/env bash
# Runs Farbaek's hourly jobs (ADR 0063, ADR 0068): the trial reminders and the
# owner's platform alerts. Calls POST /api/internal/jobs/hourly inside the app
# container, which already holds the scheduler's secret (SANDBOX_CRON_SECRET),
# so the secret never passes through this script, a command line or a log
# (ADR 0035). Run every hour by farbaek-jobs.timer; safe to run again at any
# time. Copies installed before ADR 0068 call /trial-reminders, which runs
# the same jobs.
set -euo pipefail

docker exec farbaek-app node -e '
  const secret = process.env.SANDBOX_CRON_SECRET;
  if (!secret) { console.log("jobs: SANDBOX_CRON_SECRET is not set; nothing to do"); process.exit(0); }
  fetch("http://127.0.0.1:3000/api/internal/jobs/hourly", { method: "POST", headers: { authorization: "Bearer " + secret } })
    .then(async (r) => { console.log("hourly jobs: " + r.status + " " + (await r.text()).slice(0, 300)); process.exit(r.ok || r.status === 503 ? 0 : 1); })
    .catch((e) => { console.log("hourly jobs failed: " + e.message); process.exit(1); });
'
