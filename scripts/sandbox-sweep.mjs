#!/usr/bin/env node
/**
 * Calls the sandbox sweeper once: ends expired and idle sessions, finishes
 * cleanups, closes lost commands, destroys orphaned runtime sandboxes and
 * prunes old history. Point any scheduler at it every 2 to 5 minutes
 * (cron, a systemd timer, Windows Task Scheduler, or your host's cron).
 *
 *   pnpm sandbox:sweep
 *
 * Reads NEXT_PUBLIC_SITE_URL and SANDBOX_CRON_SECRET; the secret is sent
 * only to this Farbaek server and never printed. The runtime's own time
 * limits still end sandboxes if the sweeper doesn't run.
 */
const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
const secret = process.env.SANDBOX_CRON_SECRET?.trim();
if (!secret || secret.length < 32) {
  console.error("SANDBOX_CRON_SECRET isn't set (32+ characters). Run pnpm setup:env and choose sandbox.");
  process.exit(1);
}
const res = await fetch(new URL("/api/internal/sandbox/sweep", site), { method: "POST", headers: { authorization: `Bearer ${secret}` } });
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Sweep failed: HTTP ${res.status} ${body?.error?.message ?? ""}`);
  process.exit(1);
}
console.log(JSON.stringify(body.data));
