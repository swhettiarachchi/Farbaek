# ADR 0063: Scheduled jobs and trial reminders

- Status: accepted (2026-10-24).
- Settles ADR 0006 (background jobs) for the VPS. Uses ADR 0060's email.

## Context

**The spec asks for trial reminders:**
- on day 7, day 12, day 13 and at expiry, sent by a scheduled job;
- by email only when email is configured;
- with the provider's status recorded, and never a claim that an email was delivered without confirmation.

**The schedule existed but nothing ran it.** `trialReminderSchedule` and `dueTrialReminders` lived in `src/core/billing/trial.ts`, ADR 0006 was still "proposed", and the only scheduled work was the sandbox sweep.

**Two traps in a plain reading of the schedule:**
- **Extended trials:** staff can extend a trial (ADR 0032), and then "day 12" from the start isn't 2 days before the end.
- **A first run or an outage** finds several reminders due at once.

**Email had no off switch.** ADR 0060 sends people emails about their own work but offered no way to turn them off, and reminders are emails nobody asked for in the moment.

## Decision

**Scheduled jobs on the VPS are systemd timers that call internal routes:**
- `farbaek-jobs.timer` runs `scripts/vps/jobs.sh` every hour;
- the script calls `POST /api/internal/jobs/trial-reminders` inside the app container with the scheduler's secret (`SANDBOX_CRON_SECRET`), as the sweep does, so the secret never leaves the container;
- jobs are idempotent, with claims in the database;
- `src/server/jobs/auth.ts` holds the shared constant-time check;
- no job queue service: one server, a few jobs, and Postgres to record them.

**The reminder rules** (`src/core/billing/trial.ts`):
- **Anchoring:** day 12 and day 13 are anchored to the trial's end (2 days and 1 day before it), so they stay right when a trial is extended. Day 7 counts from the start. For a 14-day trial it's the same instants as the spec.
- **`trialReminderToSend`** sends only the latest reminder that's due and records the earlier ones as skipped ("superseded"), so nobody gets a burst.
- **Expiry:** an expiry reminder more than 3 days late is skipped ("too_late").

**The words** (`src/core/billing/trial-emails.ts`):
- they come from the real end time, never the reminder's name, so a late day 7 reminder says "4 days left";
- they match the Billing page: the end in UTC, then "moves to Free automatically and nothing is charged";
- they don't push an upgrade, since nothing can be bought until payments are connected;
- the button goes to Billing.

**Who gets them:** the workspace's owners who have a confirmed address and haven't turned trial reminders off.

**What's recorded** (`trial_reminders`, migration v36), one row per workspace and kind:
- `accepted` by the mail server, which is as far as anyone can tell;
- `failed`, tried up to three times on later runs;
- `skipped`, with why;
- `no_recipient`, when no owner wants them.

A claim before sending means two runs at once can't both send. Members of the workspace can read the rows.

**Email choices** (`email_preferences`):
- a person turns off emails about their builds and checks, trial reminders, or both, in Settings > Email;
- no row means both are on;
- every email now ends with a link to that card;
- the notifier and the reminder job both check it.

## Consequences

- **Reminders go out within an hour of being due.** The first run in production sends each workspace on a trial the reminder that's due now, with the days actually left.
- **One manual step installs the timer:** `install.sh --enable-timers`, as root. Deploys don't change systemd units.
- **The scheduler's secret is shared** by the sweep and the jobs. It's still named `SANDBOX_CRON_SECRET`, to avoid a settings change.
- **The email link opens Billing for the current workspace.** Trials are one per person, so an owner has at most one workspace on a trial, and the email names it.
- **Not yet:**
  - persisting the trial's move to Free (`expireTrialIfDue`); access already follows it at read time;
  - other jobs, such as usage resets and webhook retries, which will use the same timer and route pattern.
