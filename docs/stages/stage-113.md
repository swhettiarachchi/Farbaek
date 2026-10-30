# Stage 113: Mutation trials

A change waiting for review shows the small mistakes Farbaek would make in the lines it adds. A contributor can run them: the related tests run once clean and once per mistake in a disposable sandbox. The card shows which mistakes the tests caught and which survived. No AI is used.

- **Decision record:** `docs/adr/0136-mutation-trials.md`.
- **Branch:** `feat/mutation-trials` (from `feat/failure-futures`).
- **Migration:** v83, `supabase/migrations/20261224090000_mutation_runs.sql`.

## 2026-10-30

### Done

- **`src/core/realityloop/mutation.ts`:**
  - five operators on spaced code, never in strings or comments;
  - the plan across added lines (at most 8);
  - applying a mutant only where its original still is;
  - the related-tests command for each runner;
  - judging the clean run and each mutant's run;
  - the summary and time limits;
  - a window of each line centred on the change.
- **`src/server/mutation/`:**
  - the runner: one sandbox, the clean run first, each mutant written in and the original written back, a 12-minute budget, and no later results trusted after a failed restore;
  - the store, where the counts come from the database;
  - the reader;
  - the wiring.
- **Migration v83:** `mutation_runs` (one running per proposal) and three server-only functions with audit events.
- **The task page:** "Do the tests catch mistakes here?" under Failure futures:
  - before a run, the mistakes it would make;
  - after it, the results with survivors first (icon and word), the test that caught each one, the compute time, and the caveat that this isn't overall quality.
- **The shared runner check:** `testFramework` in `failure-futures.ts`, used by both trials.
- **Activity:** the two verbs.

### Verified

- `src/core/realityloop/mutation.test.ts` (7).
- `tests/db/mutation-runs.test.ts` (6):
  - binding to the proposal hash;
  - one run at a time;
  - refusals;
  - stale runs closed;
  - session for the right project;
  - counts from the mutants, not the caller;
  - the failure reason;
  - read access for members only.
- `src/server/mutation/runner.test.ts` (4):
  - refusals;
  - the clean run, then each mutant with the original written back;
  - no judging on a red or empty clean run;
  - a failed restore and the time budget.
- `src/components/mutation/mutation-card.test.ts` (3).
- **A demo production build:** the planned mistakes for the sample change at 375px, with the changed operator visible and highlighted, a 44px button and no sideways scroll.
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **A real run in a production sandbox:** it needs a signed-in workspace with a change waiting for review in a project with Vitest, Jest or pytest.
