#!/usr/bin/env bash
# Ends expired and idle sandboxes: calls POST /api/internal/sandbox/sweep
# inside the app container, which already holds SANDBOX_CRON_SECRET, so the
# secret never passes through this script, a command line or a log
# (ADR 0035). Run every 15 minutes by farbaek-sweep.timer.
set -euo pipefail

docker exec farbaek-app node -e '
  const secret = process.env.SANDBOX_CRON_SECRET;
  if (!secret) { console.log("sweep: SANDBOX_CRON_SECRET is not set; nothing to do"); process.exit(0); }
  fetch("http://127.0.0.1:3000/api/internal/sandbox/sweep", { method: "POST", headers: { authorization: "Bearer " + secret } })
    .then((r) => { console.log("sweep: " + r.status); process.exit(r.ok ? 0 : 1); })
    .catch((e) => { console.log("sweep failed: " + e.message); process.exit(1); });
'
