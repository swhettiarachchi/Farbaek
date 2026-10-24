# Stage 39: Trial reminder emails, and email choices

Email works in production (stage 37), and "Trial reminder emails" was on the homepage's Next list. The spec asks for reminders on day 7, day 12, day 13 and at expiry, with the provider's status recorded. The schedule was in the code, but nothing ran it.

- **Decision record:** `docs/adr/0063-scheduled-jobs-and-trial-reminders.md`. It also settles ADR 0006.
- **Branch:** `feat/trial-reminders`, from `main` after #46.

## 2026-10-24

### Done

**The rules** (`src/core/billing/trial.ts`):
- day 12 and day 13 are anchored to the trial's end, so they stay right when staff extend a trial;
- `trialReminderToSend` sends only the latest reminder that's due and records the earlier ones as superseded;
- an expiry reminder more than 3 days late is skipped.

**The words** (`src/core/billing/trial-emails.ts`):
- they come from the real end time ("4 days left", "Ends Tue 28 Oct 2026, 02:49 UTC");
- "Then the workspace moves to Free automatically and nothing is charged";
- no upgrade push, since payments aren't connected;
- a button to Billing.

**One email layout** (`src/server/email/compose.ts`): the notifier and the reminders share it. Every email now ends with "Choose which emails you get", linking to Settings > Email.

**Migration v36** (`20261107090000_trial_reminders.sql`):
- `trial_reminders`: one row per workspace and kind, with `accepted`, `failed` (three tries), `skipped` or `no_recipient`;
- `email_preferences`;
- service-only functions to claim, finish and skip a reminder, list candidates, and save choices.

**The job:**
- `src/server/jobs/trial-reminders.ts`: emails the owners who want reminders, records what the mail server said, and keeps going past one workspace's failure;
- `/api/internal/jobs/trial-reminders`: behind the scheduler's secret, with the check shared with the sweep (`src/server/jobs/auth.ts`);
- `scripts/vps/jobs.sh` and `farbaek-jobs.timer`: hourly, installed by `install.sh`.

**Settings > Email** (`#email`): two choices for the signed-in person, "Builds and checks" and "Trial reminders". The notifier checks the first; the job checks the second.

### Verified

**Tests:**
- trial rules (anchoring, sends in turn, supersedes after a gap, too late);
- email words (days from the real end, UTC label, no em dashes);
- the job with fakes:
  - latest only, then nothing on the next run;
  - skips;
  - owners who want it;
  - `no_recipient`;
  - a refusal recorded, then retried;
  - one workspace's failure doesn't stop the next;
- the scheduler token;
- the notifier honouring the email choice and adding the footer;
- `tests/db/trial-reminders.test.ts` (7):
  - claims, the retry cap and statuses;
  - candidates by state, suspension and a 3-day window;
  - email choices read only by their owner;
  - RLS, and nothing callable from the browser.

**Checks:** `pnpm typecheck` and `pnpm lint` are clean. The full `pnpm test`: 1,387 passed; the cloud-agent executor's autonomy test timed out once under full-suite load (as in stage 33), then passed three runs on its own.

**On the demo production build, at 375 and 1280 px:** the Email card shows the demo's read-only reason, every row is at least 44px, no sideways scroll, no errors. `qa:responsive` and `qa:a11y` on `/app/settings` found nothing.

**Production database:**
- a read-only preview before anything changed: one trial, the owner's workspace Far001, 3.7 days left;
- v36 applied with the hash-verified pattern (`e5797263…14f035`);
- read back:
  - RLS on both tables, with select-only grants to signed-in users;
  - all five functions executable by `service_role` only;
  - the candidates list holds Far001 with one owner and nothing recorded;
  - PostgREST reloaded its schema.

### Not verified yet

- **The timer and the first run in production,** after merging: the install step, one run, and the reminder accepted for Far001.
