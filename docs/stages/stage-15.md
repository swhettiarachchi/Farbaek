# Stage 15: the Approval Wallet

The spec's backlog (§25) lists the Approval Wallet (MVP→Next). The approvals inbox shows, on each card:
- the payload hash;
- an expiry timer;
- the risk;
- a recovery path.

Approvals sync to the desktop runtime. A stale hash can't be approved.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0042-approval-wallet.md`.
- **Branch:** `feat/approval-wallet`, from `feat/intent-lens`. It uses the lens summary; merge #20 first.

## 2026-10-23

### Done

**The approval window (migration v27, `20261029090000_approval_window.sql`):**
- **The column.** `change_proposals.expires_at` defaults to 72 hours after insert.
- **The trigger.** `change_proposals_approval_window` refuses applying after the window (`PROPOSAL_EXPIRED`) and any change to the window.
- **The server.** `applyProposal` refuses an expired proposal before building anything. The error code has a message.

**The logic:** `src/core/trust/approval-wallet.ts`:
- `approvalWindow`: open, closing (the last 12 hours) or expired, failing closed on a bad date;
- `walletRisk`: facts from the policy and the lens, with no score.

**The inbox:**
- `/app/approvals` shows wallet cards (`src/components/approvals/wallet-card.tsx`), soonest to close first.
- **The left side:**
  - the state;
  - the facts;
  - the undo path;
  - the checks that will verify the change.
- **The stub:**
  - the window, with a live countdown and a bar;
  - the proposal hash;
  - "Review and approve".
- `useNow` (`src/components/ui/use-now.ts`) is a shared live clock that agrees with the server render.

**The review** shows "Approve by … · closes …". Once expired:
- Approve is unavailable, with the reason;
- the diff controls lock;
- Discard becomes the primary action.

**The desktop agent:**
- **The endpoint.** `GET /api/v1/agent/proposals/{id}` covers only the agent's own proposals.
- **The client.** `FarbaekAgentClient.proposal` reads it, and `RunManager.refreshProposal` keeps the answer.
- **The check.** The app works out the proposal hash from what it sent and compares it with Farbaek's.
- **The run screen:**
  - shows the state, with log notes when it changes;
  - checks every 30 seconds while the proposal can still change and the window is visible;
  - has a "Check now" button.

### Verified

- **`tests/db/change-proposals.test.ts`** (18 tests, 3 new), on PGlite:
  - the window is 72 hours;
  - an expired proposal can't be applied, leaving files, ProofPacks and the task unchanged, and can still be discarded;
  - the window can't be moved, even by the server or the table owner.
- **`approval-wallet.test.ts`** (6 tests): the window states at their boundaries; a bad date; the facts.
- **`proposals.test.ts`:** an expired proposal is refused before anything is written; a proposal one second inside its window applies.
- **`service.test.ts`:**
  - the status endpoint answers for the agent's own proposal;
  - another agent, another workspace or an unknown id gets 404;
  - a person who left gets 401.
- **`desktop/src/main/runs.test.ts`:**
  - the hash worked out on the desktop equals the server's formula for the same change;
  - each check is saved;
  - notes appear once for "applied" and once for "verified";
  - a different hash raises the warning.
- **The full suite:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,140 passed, 14 skipped.
- **In the browser,** on a demo build, with demo task b007:
  - **The approvals page** shows its card:
    - "Waiting for approval";
    - "2 changes match a clause by its words" and "2 edited files";
    - the undo line and "Then `pnpm test` runs in a sandbox";
    - "Approve by …, closes in 2 days", with the bar nearly full;
    - `sha256:fe04241d…04d597`.
  - **The second waiting demo task** has no proposal on record. It's listed as a plain row saying so, so the menu's count of 2 adds up.
  - **"Review and approve"** lands on the task's Change section, which shows the same short hash and "Approve by … · closes in 2 days".
  - **Moving the page's clock ahead in the browser,** the live clock switched states on its next tick:
    - with 5 hours left, the card says "Closing soon", "Closes in 5 hours", and the bar is at 8%;
    - past the end, the review shows Expired: Approve is unavailable, Discard is the primary action, and the reason is given;
    - the card says "Expired yesterday", offers "Review and discard", and drops the undo and checks lines.
  - **At 375px:**
    - the card stacks with its stub below a dashed tear line;
    - the button is 44px tall;
    - nothing scrolls sideways;
    - there are no hydration errors.
- **The desktop agent:** `pnpm agent:build` bundles cleanly. The run screen's new states weren't seen live, because that needs a paired agent against a signed-in workspace. The state handling is covered by the `RunManager` test.

### Next

- A passkey (WebAuthn) step-up for escalated approvals. It needs a WebAuthn library approved.
- A notice when a window is closing, once email or push is connected.
