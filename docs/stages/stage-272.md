# Stage 272: usage given back when a call is cut off

- **Date:** 2026-11-25
- **Branch:** `fix/stage-272-stale-usage`, on stage 271's. PR #329. Stage 271's PR #328 was merged while this was being finished, so this one carries only its own commit.
- **Decision:** ADR 0279
- **Migration:** v107, `20270117090000_stale_usage.sql`. **Applied to production by the owner on 2026-11-25, after v106, read-back `check|t`,** before this stage's merge. **New dependency:** none.
- **Skills used:** `ecc-security-review`'s checklist for the SQL function (who may call it, what it may touch), and the production-readiness lens (`audit-suite`) for what a restart leaves behind. No screen changed beyond one phrase on a task's page, so no design skill was needed.

## Why

The owner asked for this fix after stage 271's review found it: a call whose server stopped before it settled left its usage drawn from the plan for good. Production restarts on every merge, so every merge could cost someone an answer's worth of usage they never got.

## Confirmed first

- Usage is drawn from the plan when a call is reserved (`app_reserve_usage`), and given back or settled only by `app_settle_usage`, called by the same process when the call ends.
- Nothing else ever closed a reservation: no job, no trigger. The image and video studios reclaim their own renders when the person next opens them; Chat, the agent's steps, proposals and the rest had nothing.
- Chat's own sweep marks a cut-off answer as stopped, but doesn't touch its usage.

## What was built

- **Migration v107:** the refund reason `interrupted`; an index over open reservations; `app_release_stale_usage(minutes, limit)`, service-only, which closes open reservations older than the age, returns their units to the grants they came from, and answers with how many it closed, the units they held, and how many reached a plan still running. It refuses an age under thirty minutes. A five-second lock timeout, so applying it never queues the ledger behind a long reader.
- **`server/jobs/stale-usage.ts`,** called from the hourly jobs with an age of an hour and a batch of 500.
- **`server/workspace/ai-usage.ts`:** a settlement or refund that can't reach the database is tried three times, then logged with its entry (`usage.settle_failed`). The database's own refusals aren't asked again.
- **The new reason where reasons are read:** the task-usage reader (which now reads an unknown reason as a plain failure rather than failing the page), the cost summary, and the task page's line of what was given back.

## Verified

- `tests/db/stale-usage.test.ts` (10), `src/server/jobs/stale-usage.test.ts` (2), and three new cases in `ai-usage.test.ts`; the list is in ADR 0279.
- Every database test against v107 (693 in 94 files), and the jobs, insights, workspace, Chat, agent, automation and design tests.
- `tsc --noEmit` with a 4 GB heap, and lint on the changed files.
- **A fresh review** of the change found no lost or double-counted usage, and five points, all fixed or said in the ADR: a call that worked but couldn't be settled would have been given back unrecorded (now retried and logged); a free entry dropped out of the daily totals (now kept); the job's count said more than went back (now says both); the safety argument named a fifteen-minute limit nothing enforces (now said as it is); the migration could hold the ledger's lock behind a long reader (now gives up after five seconds).
- **Not verified:**
  - the job on production: after the merge, the hourly job's result in the server's log shows `staleUsage`;
  - two database sessions at the same instant: the lock order is read, not raced;
  - the task page's new phrase in a browser: it appears only for a task with such an entry, which the demo workspace doesn't have.

## For the owner

1. Done on 2026-11-25 (`check|t`): apply v106 first. #328 was merged and went live on 2026-11-25 (build `bc473b7cb6bb`) without it: the live Scheduled page, read signed in, says "Your scheduled tasks couldn't be read just now", which is what it says when its tables aren't there. Nothing else is affected, and nothing can be saved there until v106 is on. The line is in #328.
2. Done on 2026-11-25 (`check|t`): apply v107 and read it back. The line is in #329. Not during the nightly backup: it would give up after five seconds and change nothing, and can simply be run again.
3. Merge #329. The next hourly run closes every reservation a restart ever left open; most are from periods already over.

## Next

- Giving Chat's usage back at once when its answer is marked stopped, rather than within two hours.
- A hard deadline on the interactive Chat turn, as a scheduled run has.
- Then back to the program's order: triggers other than time, and persistent agents.
