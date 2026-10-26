# Stage 68: Autonomy level 4, governed workflows

Spec §9 level 4, "Governed orchestration", and Stage 8 "autonomy levels 3–4". Settings showed level 4 as not built (ADR 0086).

- **Decision records:** `docs/adr/0092-governed-workflows.md`, and `docs/adr/0091-egress-ledger-decision.md` for the egress ledger, decided in this branch.
- **Branch:** `feat/governed-workflows`, on top of `feat/model-canary`.

## 2026-10-26

### Done

**Database: migration v58.**
- `workflows` and `workflow_steps`: Row Level Security, members read, no browser writes.
- Functions:
  - `app_create_workflow` (a task per step);
  - `app_approve_workflow` (owners and admins, every contract approved, hash);
  - `app_workflow_claim_next`:
    - one step at a time, in order, under a lock;
    - stops at checkpoints, while agents are paused, and at the spend ceiling;
    - finishes after the last step;
  - `app_workflow_attach_run`, `app_workflow_step_result`;
  - `app_continue_workflow`, `app_cancel_workflow`.
- Each records an audit event.

**Core.** `src/core/realityloop/workflow.ts`: the draft schema (2 to 8 steps), the approval hash, the words for each state, and `nextAction`.

**Server.**
- `src/server/workflows/`:
  - `orchestrator.ts`: `advanceWorkflow`, `settleStep`, `resultFor`;
  - `wiring.ts`: the database functions, step runs as the approver, and the hourly sweep;
  - `read.ts`;
  - `use-cases.ts`: create, approve, continue, cancel.
- **Hooks:** `afterRun` on cloud runs and `afterChecks` on task checks.
- **Sandbox without a session:** `cloudRunDeps(person, { system: true })` gives a workflow's run a sandbox through the server's client, as background work already does.
- **The hourly jobs** sweep running workflows.
- **New error codes:** `INVALID_WORKFLOW`, `WORKFLOW_CLOSED`, `CONTRACTS_NOT_APPROVED`, `NOT_AT_CHECKPOINT`.

**UI.**
- `/app/workflows`: the list, with icon and words for each status, and what happens next.
- `/app/workflows/new`: steps in order, checkpoints, and the run cap as a share of usage.
- `/app/workflows/[id]`:
  - the steps as a vertical path, each linking to its task, contract and run;
  - Approve and start, Continue and Cancel, each unavailable with its reason;
  - the page refreshes while running.
- Workflows is in the nav and More. Settings > Autonomy now describes level 4 and links to it.
- The demo shows one sample workflow over three of the Storefront's sample tasks.

**Also decided (ADR 0091).** The sandbox egress ledger can't list blocked attempts: Vercel's firewall doesn't report them. Receipts keep naming the exact policy each run had.

### Verified

- `tests/db/workflows.test.ts` (5):
  - creation makes the tasks, and browsers can't write;
  - approval by owners and admins only, once every contract is approved;
  - steps in order with their caps, the checkpoint and continue;
  - review waits, halting on failure, finishing;
  - pause, the ceiling, cancel.
- Unit tests:
  - `workflow.test.ts` (3);
  - `orchestrator.test.ts` (7): the approver's run, done by hand, refusals and a departed approver, state mapping, waits;
  - `use-cases.test.ts` (2).
- New security scenario **SE-029**, "A workflow running past its approval". `pnpm security:eval`: 29 of 29.
- The design, component, cloud-run and verification suites (219 tests). `browser-grants.test.ts` passes.
- `pnpm typecheck` and lint are clean.
- **Demo build at 1280 and 375:**
  - the Workflows list;
  - the sample workflow: waiting for step 1's review, step 2 a checkpoint, and Cancel unavailable with the demo's reason;
  - the New workflow form, with run caps as shares;
  - Settings' level 4 row.

  No console errors and no sideways scroll. The first render said each step's run stopped at "2853%", because the sample's ceiling was unrealistic; it's now three steps at the estimate (9%).
- `pnpm qa:a11y` on the three workflow pages: 0 findings. `pnpm qa:responsive` from 320 to 1440 (33 views): 0 findings.
- **v58 applied in production** and read back:
  - Row Level Security is on for both tables, with the member read policies;
  - signed-in reads only, nothing signed out;
  - the 7 functions are closed to browsers and open to the server.
