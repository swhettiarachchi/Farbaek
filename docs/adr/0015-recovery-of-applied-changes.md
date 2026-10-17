# 0015. Recovery of applied changes

- Status: accepted
- Date: 2026-10-17
- Builds on ADR 0010 (versioned project files), ADR 0011 (change proposals) and ADR 0012 (ProofPacks).

## Context

The spec asks for "safe undo and compensating recovery": re-check the state, detect intervening changes, preview, re-check authorization and entitlement, get approval, execute idempotently, verify the final state and record evidence. It forbids overwriting newer legitimate changes and reporting success before the backend confirms it. Recovery was the last Stage 3 item on the in-app roadmap.

Every file write is already a kept revision, and applying a proposal tags the revisions it wrote with the proposal id. The earlier content of every file a proposal touched is therefore on record.

## Decision

- **Scope: one applied change proposal, project files only.** Undo writes each file's base revision back as a new revision, or removes a file the proposal created (a `delete` revision, history kept). Nothing outside Farbaek is undone, and the receipt says so.
- **Plan from the current state** (`src/core/realityloop/recovery.ts`). Per file: `ready` while it still holds exactly the applied content, `done` when it's already back, `conflict` when it changed or was deleted after the apply. Conflicts can't be chosen, so newer work is never overwritten. The person resolves them by hand (file history) or stops the task.
- **Approval bound to the plan.** The plan's canonical SHA-256 (RFC 8785) goes to the browser. The server rebuilds the plan on confirm and refuses with `RECOVERY_CHANGED` if the hash differs. The operation hash (plan hash plus the chosen paths) makes a repeated confirmation return the first result.
- **Policy and entitlement re-checked.** The change policy runs on the files being undone, so sensitive files and large undos escalate to an owner or admin, and an escalated proposal's undo needs one too. Recovery is the `replay_and_recovery` feature: Team plan and up, and the trial.
- **Lifecycle through the existing state machine.** From `VERIFYING`: `interrupt`, `plan_recovery`, then `recover` (recorded as Farbaek) only when every file is back. From `FAILED` or `INTERRUPTED`: `plan_recovery`, then `recover`. A partial undo leaves the task in `RECOVERY_PENDING`; a later undo or a manual fix finishes it. Verified and other finished tasks are closed records.
- **Verify before recording** (migration 11, `app_recover_change`). Under the project lock, the function re-checks that each file still holds the applied content, writes, then compares the new current revision's digest and content with the base revision (or checks the file is gone). It computes completeness itself and refuses a status claim that doesn't match. Any mismatch aborts the whole transaction.
- **Evidence.** One append-only `recovery_operations` row per recovery, holding an in-toto statement (`https://farbaek.dev/recovery/v1`, placeholder URI like the ProofPack's) whose subjects are the restored contents and the ProofPack being undone. It records the plan hash, the operation hash, the policy decision, the approver, each file's from and to, what was left and why, and the record's limits. The task page recomputes its digest on every view and offers it as a download.

## Consequences

- ProofPacks stay immutable. A recovered change keeps its ProofPack, and the recovery record links to it.
- "Recovered" means the files are back at their earlier content, verified byte for byte. It doesn't mean any checks ran, and the record says so.
- Restored revisions aren't tagged with the proposal id, so "what the proposal wrote" stays stable across several partial undos.
- Not yet run against a live applied change: the hosted project has no applied proposal yet. The PGlite tests cover the database function, and fakes cover the use case.
