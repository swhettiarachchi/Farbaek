# Stage 54: Future-State Arena

The spec's Stage 3 lists the Future-State Arena on disposable worktrees. Here it's a change tried in a disposable sandbox before anyone approves it.

- **Decision record:** `docs/adr/0076-future-state-arena.md`.
- **Branch:** `feat/arena`, on top of `feat/shadow-mode` (PR #66).

## 2026-10-25

### Done

- **Sandbox service:** `runChecks`' check loop moved into `executeChecks`. A new `trialChecks` runs the same checks, Farbaek's site check included, and returns only what each did: no receipt, no ProofPack, no task transition.
- **`src/core/realityloop/arena.ts`:**
  - pairs the two runs check by check: breaks, fixes, still passes, still fails, no result;
  - gives a verdict that leads with a break;
  - knows when a change needs its packages installed again.
- **Migration v47** (`20261118090000_arena_runs.sql`):
  - `arena_runs`, with start, attach and finish functions;
  - one running trial per pending proposal, stale ones closed after 30 minutes;
  - sessions only for the proposal's project;
  - results written once, at most 20 named checks.
  - **Applied in production** and read back.
- **`src/server/arena/`:** the runner installs once, checks the current files, writes the change in, installs again only for dependency changes, checks again, and stops. The store and wiring share `sandboxForPerson` with verification.
- **Task page:** "Try it before you approve" under a pending change. Results are labelled observed, the time an estimate, with "Nothing is applied". It refreshes while running, and says why it can't start when it can't.

### Verified

- `service.test.ts`: trials write nothing but results, include the site check, stay in the workspace, and take 1 to 20 checks. The 33 earlier service tests still pass.
- `arena.test.ts` (5), `runner.test.ts` (7, the exact order of steps), `arena-panel.test.ts` (5, every state in words), `tests/db/arena-runs.test.ts` (7).
- `pnpm typecheck` and lint are clean; the design tests pass.
- Demo build: the panel on a pending change at 1280 and 375 px, with no sideways scroll; the demo shows its read-only reason. `pnpm qa:a11y` on that task page: 0 findings.
- **Not yet done:** a trial in a live sandbox. It needs a pending proposal in a real workspace, so it's the owner's check after merging.

### Next

The desktop agent rebuild (Stage 4), then LaunchOS (Stage 6).
