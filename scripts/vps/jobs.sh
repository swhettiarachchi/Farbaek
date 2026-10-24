#!/usr/bin/env bash
# Runs Farbaek's hourly jobs (ADR 0063): today, the trial reminders. Calls
# POST /api/internal/jobs/trial-reminders inside the app container, which
# already holds the scheduler's secret (SANDBOX_CRON_SECRET), so the secret
# never passes through this script, a command line or a log (ADR 0035). Run
# every hour by farbaek-jobs.timer; safe to run again at any time.
set -euo pipefail

docker exec farbaek-app node -e '
  const secret = process.env.SANDBOX_CRON_SECRET;
  if (!secret) { console.log("jobs: SANDBOX_CRON_SECRET is not set; nothing to do"); process.exit(0); }
  fetch("http://127.0.0.1:3000/api/internal/jobs/trial-reminders", { method: "POST", headers: { authorization: "Bearer " + secret } })
    .then(async (r) => { console.log("trial reminders: " + r.status + " " + (await r.text()).slice(0, 300)); process.exit(r.ok || r.status === 503 ? 0 : 1); })
    .catch((e) => { console.log("trial reminders failed: " + e.message); process.exit(1); });
'
