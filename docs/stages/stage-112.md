# Stage 112: The Failure Futures Lab

A change waiting for review shows the failures it could meet, found in the lines it adds and labelled Hypothetical. A contributor can try one: Claude writes a test that simulates it, and a disposable sandbox runs that test with the change. The result is recorded as reproduced, handled or inconclusive, with the test and its output.

- **Decision record:** `docs/adr/0135-failure-futures-lab.md`.
- **Branch:** `feat/failure-futures` (from `feat/local-models`).
- **Migration:** v82, `supabase/migrations/20261223090000_failure_futures.sql`.

## 2026-10-30

### Done

- **`src/core/realityloop/failure-futures.ts`:**
  - the 14 scenario kinds, in the spec's order, with what could go wrong and what a trial does;
  - detection on the lines a change adds;
  - the test runner and the test's path;
  - how a run's result is classified;
  - the test writer's schema and request.
- **`src/server/ai/failure-test-writer.ts`:** Claude, structured output, inputs treated as data.
- **`src/server/failure-futures/`:**
  - the runner: the scenario is worked out on the server, metered as `failure_test`, and run in one sandbox with install scripts off and a 3-minute test limit;
  - the store and reader;
  - the wiring, which uses the workspace's own key when it has one.
- **Migration v82:**
  - the `failure_futures` table (one running trial per proposal; an observed result must name its test);
  - three server-only functions with audit events;
  - the ledger accepts `failure_test`.
- **The task page:** a "Failure futures" card under the Arena:
  - each scenario with its evidence line, a Hypothetical or outcome pill (icon and word), and **Try this failure**;
  - each trial's details: what the test expects, the command, the exit code, the model, the AI-written test and the end of its output;
  - disabled reasons, including a project with no test runner.
- **Also:** usage availability (Claude only), Activity verbs and the usage doc row.

### Verified

- `src/core/realityloop/failure-futures.test.ts` (6):
  - added lines;
  - suggestions, order and evidence;
  - what's left out;
  - runner and path choice, with a taken name;
  - classification;
  - the request budget.
- `tests/db/failure-futures.test.ts` (8):
  - binding to the proposal hash;
  - one running trial at a time;
  - refusals;
  - stale trials closed;
  - session for the right project;
  - written once;
  - the observed constraint;
  - the `failure_test` ledger;
  - read access for members only.
- `src/server/failure-futures/runner.test.ts` (4):
  - refusals;
  - metering and refund;
  - the sandbox sequence;
  - not testable, AI busy, and a test that didn't load.
- `src/components/failure-futures/failure-futures-card.test.ts` (3).
- **A demo production build:**
  - the card on the task page at 375px, in its empty state;
  - the filled card swapped into the live page with sample data: 44px controls, nothing under 12px, no sideways scroll.
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **A real trial end to end:** Claude writing a test and a real sandbox running it. That needs a signed-in workspace with a change waiting for review in a project with Vitest, Jest or pytest. Production sandboxes are connected; the next live change with such a project can try it.
