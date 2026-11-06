# ADR 0178: No function raises error code 40001

- Status: accepted (2026-11-06).
- Applies to every `app_*` and `private.*` function, and to any written later.

## Context

The owner pressed "Approve and apply 5 files" on a real task. The page waited about 31 seconds, then said "Something went wrong and nothing was changed. Try again in a moment." It did the same every time, with or without a deploy running.

The right answer was a plain refusal. All five files had changed since the change was made, so `app_apply_proposal` raised `FILE_CHANGED`. That refusal used error code `40001`, which means "serialization failure", and it never arrived:

1. PostgREST runs each call through `transaction` from hasql-transaction (`src/PostgREST/MainTx.hs`, v14.17). On `40001` or `40P01` that function starts the whole transaction again, with no limit (`inRetryingTransaction`).
2. So the same call ran again and again, each attempt refused in moments. Statement timeouts don't stop it, because no single attempt is slow.
3. The gateway gave up after its 30-second route timeout (Envoy, `timeout: 30s`) and answered with a timeout message.
4. The app didn't recognise that message, so it said "Something went wrong".
5. Nothing tells PostgREST that the caller has left, so the retries could carry on until it restarts, each holding one of its connections.

The refusal reached the person only when a call was refused by the database and not by the TypeScript rules before it. Those rules catch most cases, so this was rare. It's also why the tests never saw it: they run on PGlite with no PostgREST in front, where a refusal always arrives. 18 functions raised `40001`, for `FILE_CHANGED`, `FILES_CHANGED`, `VERSION_CONFLICT`, `PROPOSAL_CLOSED`, `PROPOSAL_EXPIRED`, `CONTRACT_CHANGED` and `PROOFPACK_CHAIN`.

It's also a way to harm the service. PostgREST has a small pool of connections, so anyone able to press a button on an out-of-date change enough times could use them all, and the whole app would stop answering.

## Decision

**No function raises `40001` or `40P01`.** A function's own refusal uses `P0001`.

- Migration v89 rewrites each affected function from its own live definition, so nothing else in it changes, and its owner and grants stay. It stops if any mention remains.
- The app reads the words of a refusal and not its code, so no app code changes for this. A running retry ends at its next attempt, because that attempt runs the new definition.
- `tests/db/no-endless-retries.test.ts` fails if any function mentions these codes again, whichever migration adds it.

**An error the app doesn't recognise is written to its log** (`database.unknown_error`). The person is told something vague, and until now nothing recorded what really happened. Production's database logs only fatal errors, so this was found by reasoning from the task's data, and it would have taken one log line.

**`scripts/vps/stop-stuck-retries.ps1`** measures how many transactions are being undone each second, and restarts only PostgREST if that's abnormal. **`scripts/vps/check-approval.ps1`** reads what's known about a change that won't apply. Both are the owner's to run, because auto mode refuses production reads and writes for Claude.

**A change that can't apply says so before anyone presses anything.** `filesChangedSince` compares each change's starting revision with the file now, the same comparison the database makes. The page then offers Discard and not Approve, and it doesn't offer trials. The database still decides, for a file that changes while the page is open.

## Consequences

- A refused change now answers at once and says why. If a file changes while the page is open, the person sees "A file changed after this was made. Discard it and ask the agent to try again."
- Real deadlocks (`40P01`) are still retried by PostgREST, which is what it's for, and they end once the other transaction has gone.
- HTTP status for these refusals changes from 500 to 400. Nothing reads it.
