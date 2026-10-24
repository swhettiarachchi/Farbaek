# ADR 0068: Alerts to the owner about the platform

- Status: accepted (2026-10-24).
- Builds on ADR 0065 (the daily AI limit) and ADR 0063 (hourly jobs).

## Context

Since ADR 0065, AI work pauses for every workspace once the platform's daily limit is reached (`AI_DAILY_LIMIT_USD`, $20 by default). Nobody was told. The owner would find out from a customer, or from the Anthropic bill.

The hourly jobs ran through `/api/internal/jobs/trial-reminders`, called by `/usr/local/bin/farbaek-jobs`. That is a copy of `jobs.sh` made by `install.sh`, which only the owner can rerun as root.

## Decision

**Two alerts a day at most:**
- one when today's usage reaches 80% of the limit, and one when it reaches the limit;
- if the limit is already reached when the job first looks, only that one is sent, and 80% is recorded as skipped;
- no alerts when the limit is off.

**Counted as the limit counts:** `app_platform_ai_units_today()` sums reserved and settled ledger units since midnight UTC, the same sum `app_reserve_usage` checks.

**Honest amounts:** the email says "about $X of its $Y", calls them Farbaek's estimates from its rate card, and points to the Anthropic Console for what was billed.

**Once, with a record** (migration v40, `platform_alerts`, one row per day and kind):
- an alert is claimed before it's sent;
- a failed one is tried again, three tries in all;
- it ends `accepted` or `failed` with the mail server's answer, or `skipped`;
- only the server key can read or write it.

**Recipient:** `ALERT_EMAIL`, else Office Space's owner (`OFFICE_OWNER_EMAIL`, the inbox the owner reads), else hello@farbaek.com. Only plain addresses count.

**One runner for every hourly job:**
- `handleHourlyJobs` runs the trial reminders and the platform alerts, each on its own, so one failing or not configured doesn't stop the other;
- `/api/internal/jobs/hourly` and the older `/trial-reminders` both run it;
- `jobs.sh` now calls `/hourly`, but the copy installed today keeps working unchanged.

## Consequences

- The owner hears about the limit within an hour of reaching 80%, and again within an hour of AI pausing.
- Adding another owner alert is a new kind in `platform_alerts` and a step in the job.
- An hour can pass between the limit and the email. The limit itself stops spending at once.
