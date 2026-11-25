#!/usr/bin/env bash
# Starts people's scheduled tasks that are due (stage 271, ADR 0278): calls
# POST /api/internal/jobs/scheduled inside the app container, which already
# holds the scheduler's secret (SANDBOX_CRON_SECRET), so the secret never
# passes through this script, a command line or a log (ADR 0035). Run every
# minute by farbaek-scheduled.timer; safe to run again at any time, since a
# due task is claimed under a lease in the database. While the app is being
# replaced by a deploy the call fails and the next minute's call does the
# work. 503 means the server isn't set up for it, which is not a fault here.
set -euo pipefail

docker exec farbaek-app node -e '
  const secret = process.env.SANDBOX_CRON_SECRET;
  if (!secret) { console.log("scheduled: SANDBOX_CRON_SECRET is not set; nothing to do"); process.exit(0); }
  fetch("http://127.0.0.1:3000/api/internal/jobs/scheduled", { method: "POST", headers: { authorization: "Bearer " + secret } })
    .then(async (r) => { console.log("scheduled: " + r.status + " " + (await r.text()).slice(0, 200)); process.exit(r.ok || r.status === 503 ? 0 : 1); })
    .catch((e) => { console.log("scheduled failed: " + e.message); process.exit(1); });
'
