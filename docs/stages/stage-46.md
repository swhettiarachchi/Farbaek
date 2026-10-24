# Stage 46: Alerts to the owner about AI spending

The platform's daily AI limit pauses AI for everyone when it's reached. Now the owner gets an email first.

- **Decision record:** `docs/adr/0068-platform-alerts.md`.
- **Branch:** `feat/spend-alerts`, from `main` at `e0b0cf5`.

## 2026-10-24

### Done

**Migration v40** (`20261111090000_platform_alerts.sql`):
- `platform_alerts`;
- `app_platform_ai_units_today`, counted exactly like the daily limit;
- `app_platform_alerts_on`;
- claim, finish and skip functions;
- all for the server key only.

**Rules** (`src/core/billing/spend-alert.ts`): an alert at 80% and one at the limit, once each a day, with the amounts called estimates.

**The job** (`src/server/jobs/platform-alerts.ts`, wiring beside it): claims, sends and records the mail server's answer.

**One hourly runner** (`src/server/jobs/hourly.ts`):
- runs the trial reminders and the alerts independently;
- `/api/internal/jobs/hourly` is new, and `/trial-reminders` runs the same jobs for the `jobs.sh` copy already installed;
- `jobs.sh` calls `/hourly`.

**`ALERT_EMAIL`:** in both env examples, defaulting to hello@farbaek.com.

**Office Space wording:** the sign-in limit message no longer blames "Supabase", which is now our own service on the server. It says a code went to the address moments ago, and to wait a minute.

### Verified

- `src/core/billing/spend-alert.test.ts` (4): thresholds, superseding, no limit, wording.
- `src/server/jobs/platform-alerts.test.ts` (7): once at 80%, the limit with 80% skipped, refusals recorded, limit off, escaping, recipient checks including a header injection attempt.
- `tests/db/platform-alerts.test.ts` (4): today's sum includes only today's reserved and settled units, a claim works once a day with three tries, finishing needs a claim, and browsers are refused.
- `pnpm typecheck` and lint are clean; the full suite run is in the PR.

### Next

- Merge, then confirm in the next hourly run's log that `platformAlerts` ran.
