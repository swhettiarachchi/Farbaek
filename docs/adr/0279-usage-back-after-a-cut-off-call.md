# ADR 0279: Usage given back when a call is cut off

- **Status:** accepted (stage 272, 2026-11-25)
- **Builds on:** ADR 0020 (AI usage is reserved, then settled or refunded), ADR 0063 and ADR 0068 (the hourly jobs), ADR 0278 (scheduled runs use the Chat turn).
- **Changes:** migration v107 (one more refund reason, an index, one service-only function); one more hourly job; a settlement that can't reach the database is asked again and logged. No new dependency.

## Context

Every AI call reserves its usage before the model is asked: the units are drawn from the workspace's plan then, under a lock, so two calls can't both spend the last of it. When the call ends, the reservation is settled to what the provider reported, or refunded.

Both of those are done by the server process that made the call. Production restarts on every merge. A call in flight at that moment (an answer being written in Chat, an agent's step, a picture being made) ends with neither, and nothing ever looked at the reservation again. Its units stayed drawn from the plan for good, for an answer nobody got. On the Billing page it read as usage; on a task's page it made the cost read as an estimate for ever.

The review of stage 271 found it. It is not new: it has been true of every metered call since the ledger was built. The image and video studios already give back the usage of renders a stopped server left behind, when the person next opens them; nothing did so for the rest.

## Decision

**Each hour, a reservation too old to have a call behind it is closed, and its usage goes back to the plan it was drawn from.**

- **Too old is an hour.** A reservation covers one model call or one Chat turn, which take minutes, and none is held from one request to the next. The database function refuses any age under thirty minutes, so a mistaken call can't take a reservation from a call that is still running.
- **For every kind of call, at the ledger,** not one sweep per feature: a reservation is closed the same way whatever made it.
- **Said as what it is.** The entry is closed as refunded with its own reason, `interrupted`: not a failure a provider reported, nor a stop the person asked for. Nothing is counted on it, since what the provider used was never reported; what had been reserved stays on the record (`reserved_units`). No call can write that reason: only the hourly job does.
- **Given back once.** The function takes the workspace's lock and then the entry's, the order settling takes them in, and touches only an entry that is still open. Running it again changes nothing.
- **A free call** (Survey Studio's AI while it is tested) drew nothing from the workspace, so nothing goes back. Its entry keeps what it reserved as its count: a free entry counts towards Farbaek's daily limits whatever became of it, and closing it doesn't take it out of them.
- **In the hourly jobs,** on its own like the others: one failing never stops another, and a database that can't be asked is a failed job, never "nothing to do". Its result says how many reservations were closed, the units they had drawn, and how many of those went back to a plan period that is still running.
- **Where a person sees it:** on a task's page, the line that says what was given back counts these as "cut off when Farbaek restarted".

**A settlement that can't reach the database is asked again.** The job can't tell a call whose server stopped from a call that worked and whose settlement failed: both leave an open reservation. Before, the second kept counting at its estimate; with the job it would be given back whole, and the call would go unrecorded. So a settlement or a refund is now tried up to three times over about a second, unless the database itself refused it (the entry is closed, or the retry reserve is used). One that still fails is logged with its entry, and its reservation is then given back by the job: a person is never charged for a call Farbaek couldn't record.

## Consequences

- A person loses nothing to a restart. Their usage is back within about two hours of the cut-off call: an hour for the reservation to be old enough, and up to an hour for the job.
- **What Farbaek absorbs:** the provider's cost of a call that was cut off, or whose settlement failed three times, isn't on the ledger. The log line for a failed settlement, and the job's hourly result, are the record.
- **A limit nothing enforces:** no rule stops a single call running past an hour. The interactive Chat turn has no server deadline of its own, though a turn that long would need several slow models failing in a row. If it happened, its late settlement would be refused: the call would be free, never charged twice, and the answer still delivered.
- **The first runs clear the backlog** of every reservation a restart ever left open. Most belong to periods already over, so the units that reach a running plan will be far fewer than the units closed; the result says both.
- **Not done:**
  - giving the usage back sooner for Chat, by tying an answer to its reservation and releasing it when the answer is marked stopped. An hour or two is the price of one rule for every kind of call;
  - a hard deadline on the interactive Chat turn, as a scheduled run has.

## Verified

- `tests/db/stale-usage.test.ts` (10 cases): an old reservation is given back to its grants and closed as `interrupted`; a young one, a settled one and a refunded one are untouched; running again gives nothing back twice; several workspaces in one bounded run; a reservation drawn from two grants goes back to both, with only the running one counted as returned; a grant since removed doesn't fail the run; a free entry stays in the daily totals; a settlement afterwards is refused; an age under thirty minutes, anyone but the server, and a call writing `interrupted` are refused; and the owner's read-back line for production runs against the test database.
- `src/server/jobs/stale-usage.test.ts` (2), and three cases in `ai-usage.test.ts` for the settlement asked again: after a dropped request, never more than three times, and not at all when the database refused.
- **A fresh review** found no lost or double-counted usage. It found the settlement case above, the free entry dropping out of the daily totals, the job's count saying more than went back, the "fifteen minutes" claim resting on a limit nothing enforces, and the migration's lock with no timeout. All are fixed or said here.
- Every database test passes against v107.
- **Not verified:** the job on production, and two database sessions at the same instant (the test database has one connection; the lock order is read, not raced). After the merge, the hourly job's result in the server's log shows `staleUsage` with what it closed.
