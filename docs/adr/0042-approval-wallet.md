# ADR 0042: The Approval Wallet

- Status: accepted (2026-10-23).
- Spec: §25, the innovation backlog's MVP→Next item "Approval Wallet".

## Context

The spec asks for an approvals inbox where each card shows:
- the payload hash;
- an expiry timer;
- the risk;
- a recovery path.

Approvals sync to the desktop runtime, and the biometric step-up is optional. Acceptance: a stale hash can't be approved, and an approval executes only the exact hashed payload.

**Already in place:**
- **Approval is bound to the hash.** `applyProposal` refuses a proposal whose hash isn't the one the person reviewed. `app_apply_proposal` refuses files that changed since the proposal was made, and binds the ProofPack to the exact content applied (ADR 0011, ADR 0012).
- **Recovery** undoes an applied change file by file (ADR 0015).

**What was missing:**
- A proposal could be approved at any age, long after the reviewer, the files and the reasons had moved on.
- The inbox showed only a title, a file count and the policy label.
- The desktop agent showed "Submitted" and never learned what happened next.

## Decision

### A 72-hour approval window, kept by the database

- **Setting the window.** `change_proposals.expires_at` defaults to 72 hours after the row is inserted (migration v27). Every path that makes a proposal (the web app, cloud runs and the desktop agent) gets it without code changes.
  - When the column was added, rows that already existed got the migration's time plus 72 hours. Nothing open expired when it was applied.
- **Enforcing it.** A `before update` trigger refuses `pending → applied` once `now() >= expires_at` (`PROPOSAL_EXPIRED`).
  - The refusal rolls back the whole application: files, ProofPack and task transitions.
  - The trigger also refuses any change to `expires_at`, so nobody, the server included, can move a window.
- **In the server code.** `applyProposal` checks the same thing first, so the person gets a clear message before anything is built. The trigger is the backstop.
- **After expiry,** a proposal can only be discarded. The task goes back to proposing, and the agent proposes again against the files as they are then.

**Why 72 hours.** It covers a weekend. It's also short enough that what was reviewed still describes the project.

**Why in the database.** The UI only reads the window and never computes it, so a client clock can't open a closed window.

### Wallet cards instead of a list

`/app/approvals` shows each waiting proposal as a card, soonest to close first. Its left side states facts about the change:
- **What the checks found,** each with an icon and words, from the policy and the Intent Diff Lens (ADR 0041):
  - an escalation;
  - changes flagged by the contract;
  - changes no clause explains;
  - changes that match a clause;
  - new and edited files.
- **No risk score.** Nothing in Farbaek would back a number, so the card shows facts.
- **Recovery:** undo afterwards, file by file, never over a newer change.
- **Verification:** the contract's checks that run in a sandbox, or why they can't run yet.

The right side is a stub, set off by a dashed tear line like a ticket:
- **the approval window:** "Approve by …", a live "Closes in …", and a bar of the time left;
- **the proposal hash,** in the same short form as the review;
- **the way to the review.**

The card never approves on its own, because the diff is what's being approved. Its button opens the task's review: "Review and approve", "Review" for escalated changes the viewer can't approve, or "Review and discard" once expired.

**The review shows the window too.** It says "Approve by … · closes …". Once expired, the status is Expired, Approve is visibly unavailable with the reason, and Discard is the primary action.

**Times update live.** `useNow` is one shared clock that ticks every 15 seconds while something listens. The server render and hydration use the server's render time, so they agree. `RelativeTime` stays a one-time label.

### Approvals reach the desktop agent

**The endpoint.** `GET /api/v1/agent/proposals/{id}` returns where one of the agent's own proposals stands:
- its status, hash, window, decision time and applied hash;
- its latest ProofPack (digest and status).

It's scoped to the agent's workspace and to the agent that made it. Anyone else's proposal is not found.

**What the desktop app does:**
- **When it sends a proposal,** it works out the proposal hash from exactly what it sent, with the same `proposalHash` the server uses.
- **On each check,** it compares Farbaek's hash with its own. A mismatch is shown as a warning not to approve.
- **It shows the state:**
  - "Waiting for review" with the window;
  - Expired;
  - "Applied, not verified", Verified, or "Checks failed";
  - "Discarded in Farbaek".
- **It checks every 30 seconds** while the proposal can still change and the window is visible, and on "Check now". Each change of state is noted in the run's log.

The desktop only reads. Approval stays in Farbaek, against the diff.

## Not in this decision

- **The biometric step-up.** A passkey (WebAuthn) check before an escalated approval needs a vetted WebAuthn library, which is a dependency to approve. Until then, approval relies on the signed-in session and the role checks in the server and the database.
- **A notice when a window is closing.** Email and push notifications aren't connected.

## Consequences

- An unattended proposal stops being approvable after three days. The agent's work isn't lost: the task returns to proposing, and a new run starts from the current files.
- A proposal's hash is checked on both ends of the desktop agent's trip: what the app sent and what Farbaek holds.
