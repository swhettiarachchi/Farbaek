# Stage 78: Fixing what failed checks found, with free retries

Paid plans hold back about 5% of their AI budget for free retries, and the pricing page promised them, but nothing used the reserve. A task whose checks failed could only be undone. This stage adds the next step: ask the agent to fix it. When that fix fails its checks too, its AI usage is given back.

- **Decision record:** `docs/adr/0101-fix-what-failed-checks-found.md`.
- **Branch:** `feat/after-payments`.

## 2026-10-28

### Done

**Migration v63** (`20261204090000_fix_retries.sql`).
- **`tasks` gains** `fix_of_task_id` (a same-org link) and `fix_refunded_at`.
- **`app_link_fix_task`** checks the contributor, the source's failed state and a fresh task, and allows one open fix. It writes one audit event.
- **`app_refund_fix_task`** works under the org lock: whole settled entries within the 31-day cap go back to their grants, once, with one audit event. It gives nothing for a fix that passed, a task that isn't a fix, or a cap of 0.

**Server:**
- `startFix` (`src/server/workspace/fixes.ts`): role and agent-run permission, source state and approved contract, one open fix; then it creates, links and saves the contract with the note.
- `settleFixRetry` (`fix-retry.ts`), called after checks and after agent runs, with the plan's reserve as the cap.
- The reader gains `Task.fixOf` and `getFixFor`.

**Task page:**
- **The fix card,** on failed tasks: what happens and the free retry on this plan, then "Start a fix", the open fix with a link, "Fixed in…" or the last fix's state. Every refusal says why.
- **On a fix,** a notice links to the task it fixes.

**Copy:** the wallet card's free-retry rule is live, and the pricing promise and FAQ describe it accurately. Earlier tonight the pricing page also stopped promising the feature before it existed.

**Also tonight:**
- Dodo's test-mode webhook endpoint was added in the owner's dashboard, without opening its secret.
- Dodo Payments was added to the privacy page's processors.
- Paid-plan terms were drafted for legal review (`docs/legal/paid-plans-terms-draft.md`).

### Verified

- **PGlite** (`tests/db/fix-retries.test.ts`, 5):
  - browsers refused;
  - the link rules: contributor, source state, drafting only, one open fix, another after it ends;
  - the refund: whole entries within the cap (600 of 1,200 at a cap of 1,000), the grant re-credited, once only, one audit event;
  - the 31-day sum counted;
  - nothing for a passed fix, a task that isn't a fix, or a cap of 0.
- **Unit** (`src/server/workspace/fixes.test.ts`, 5):
  - the created, linked and saved contract with the note;
  - refusals for viewers, withheld runs, the wrong states and unapproved contracts;
  - one open fix;
  - title and note limits;
  - the cap per plan.
- **Migration v63 applied in production** (2026-10-28), before the code. The SHA-256 (`88143e99…92e1e`) was checked on the server, and it ran in one transaction. Read back: both columns exist; only the server role can run the two functions; browsers can't write `fix_of_task_id`. `/api/health` and `/api/ready` stayed OK.
- `browser-grants` passes unchanged. `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,975 passed, 17 skipped.

### Not verified yet

- **The fix card in a browser:** the demo workspace has no failed task, and the PC was under 1 GB free, too little for a local build. The card uses only existing primitives (Card, Notice, TaskStateBadge, the shared submit button), and the design tests pass.

- **A real fix end to end in production:** a task whose checks fail, then a fix whose checks fail, then the usage returning. It needs a connected sandbox and a real task, which the owner's own work will produce.

