# ADR 0080: Outcome watch

- Status: accepted (2026-10-25).
- Builds on ADR 0033 (live checks), ADR 0078 (LaunchOS with Vercel), ADR 0063 and ADR 0068 (the hourly jobs) and ADR 0079 (push).
- Spec Stage 8: "Real-world outcome watch: users define conditions that should stay true after a change … Record baselines, evaluation windows, threshold breaches, alerts … Distinguish correlation from causation. Never automatically blame the latest change or run risky remediation without approval."

## Context

A live check ran only when someone pressed the button on the Launch page. A site that stopped answering, or kept serving an earlier version, stayed that way until someone happened to look.

## Decision

**One condition, the one every launch needs:** what's live keeps answering, as the version that should be live.
- **A Farbaek Site** is checked against exactly its live deployment: the version header, and the home page's SHA-256. This is the same judgement as the button (ADR 0033), retrying while an earlier version is still cached.
- **A Vercel launch** is checked at its public address. An answer from Vercel's sign-in (401 or 403) counts as answering, since that's protection the owner turned on.
- **When nothing is live**, the check is recorded with that reason and the state doesn't move.

**Contributors turn it on** per project on the Launch page. Whoever turns it on is the person told.

**Hourly, from the hourly jobs.** Each watch not checked in the last 50 minutes is checked once.

**The database decides the state** (migration v50, `app_record_watch_result`), so it's the same every time:
- two failed checks in a row mean down;
- the next good check means back up;
- each change of state is returned exactly once, and recorded in the audit log.

The last 24 results are kept.

**Alerts**, by email and push to the person who turned the watch on, only on a change: "Needs a look: <project>" with what the check saw, and "Back up: <project>". They say what was observed and nothing about why. Farbaek doesn't guess a cause or change anything by itself.

**On the Launch page:**
- the state in words and an icon (Off, Waiting for the first check, Answering, Needs a look since);
- the last 24 checks as a strip, failed ones striped as well as red, with a sentence summing them up;
- the last check's time and what it saw.

## Consequences

- People hear within about two hours when what they launched stops working, without watching it.
- Each watched project costs one fetch an hour from the server.
- More conditions (APIs staying compatible, error rates) can use the same records and alerts later.
