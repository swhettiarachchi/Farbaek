# 0006. Background jobs

- Status: proposed
- Date: 2026-10-13

## Need

Trial reminders (days 7, 12, 13 and expiry), trial expiry to Free, webhook processing with retries and dead-lettering, usage resets.

## Options

Inngest or Trigger.dev (durable steps, crons, good fit for serverless hosting), or pg-boss / graphile-worker (Postgres only, fewer vendors).

## Decision so far

Choose with the hosting decision in Stage 1. The scheduling logic is already provider-independent: `dueTrialReminders()` and `expireTrialIfDue()` are pure functions, so any scheduler only has to call them with server time and record delivery status from the email provider.
