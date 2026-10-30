# Stage 99: Reversibility Radar and the Cost Brain

Two of the "developer intelligence" views the spec audit found missing (spec §10), on every task.

- **Decision record:** `docs/adr/0122-reversibility-and-cost.md`.
- **Branch:** `feat/insights` (from `main`).

## 2026-10-30

### Done

- **`src/core/insights/reversibility.ts`:** each changed file sorted into the spec's five classes from its path and added lines, with the basis and the limits. The change takes its hardest file's class.
- **`src/core/insights/cost-brain.ts`:** a task's ledger rows rolled up by operation as shares, with estimates labelled, refunds counted apart, and sandbox sessions and minutes.
- **Readers:** `listTaskUsage` (the usage ledger) and `listTaskSandboxes`, read through the person's session. The demo shows sample usage on its change in review.
- **The task page:**
  - **How far this can be undone** on a change's review;
  - **What this task has used** on every task.

### Verified

- `src/core/insights/insights.test.ts` (7):
  - ordinary files are rollback;
  - structural and data-removing migrations are told apart;
  - an edit is judged by its added lines only;
  - dependencies, CI and deploy settings, public APIs and outside services are named;
  - files are ordered hardest first;
  - usage is rolled up by operation, with estimates and refunds;
  - shares, including when the allowance isn't known.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`: 2,220 passed.
- **Demo build at 375px** on the change in review:
  - the radar shows both files under rollback, with the basis and limits;
  - the Cost Brain shows 2.6% of the trial, both operations with tokens and models, 1 failed call given back, and 1 sandbox session of 4 minutes;
  - no sideways scroll.
