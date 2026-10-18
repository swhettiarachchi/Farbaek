# 0011. Change proposals at autonomy level 0, in Review Only

- Status: accepted
- Date: 2026-10-13

## Context

Stage 2 asks for targeted patch generation, diff review and checkpoints, with execution through a sandbox. Spec section 6 lays out the pipeline: resolve the project, retrieve only relevant context, propose a plan, generate targeted edits, validate them against the contract, show the diff, get approval, run checks, record evidence. Section 7 adds that when no isolated sandbox is verified, the product must say so and stay in Review Only. No sandbox provider is connected yet (ADR 0003).

## Decision

- **Proposal, not execution.** Under an approved contract, the agent (Claude, ADR 0009) receives the contract, every path in the project, the contents of the files the person chose (up to 20 files and 300 KB) and their notes, as JSON data. It returns a plan and targeted changes: find/replace edits whose anchor must appear exactly once in the file it was shown, or complete new files. Edits are never guessed. Anything that doesn't apply cleanly is dropped and listed with the reason.
- **Deterministic contract checks** (`src/core/realityloop/change-proposal.ts`): each change is an operation (`files.edit`, `files.create`) checked against allowed and forbidden operations. The number of changed files counts against the contract's record limit. Contract resources written as paths define the paths in scope. Changed content goes through the import screening (credentials, secret-looking content, build folders, size). Any violation blocks the task. Invariants written in words can't be checked automatically, so the review lists them for a person.
- **Lifecycle.** `propose_plan` (agent), then `evaluate_policy` (Farbaek, meaning the contract checks above), then `require_approval`, or `block` on a violation. At autonomy level 0 every proposal waits for a person. A new event, `discard_plan`, returns a pending or blocked proposal to the approved contract. Without it, rejecting one proposal would end the whole task.
- **Review and approval.** Each file is shown as a diff against the revision it was made from, with accept and reject per chunk. The approval binds to the proposal hash the person reviewed and to an applied-content hash (RFC 8785 + SHA-256) over the exact files they accepted. Applying runs `grant_approval` (the person), then `start_execution` and `begin_verification` (Farbaek). It writes new file revisions linked to the proposal, and refuses if any file changed after the proposal was made. All of this happens in one transaction.
- **Verification is honest.** Applying is not verifying. With no isolated runner, checks can't run, so the task stays in VERIFYING and the screen says it is not verified. Nothing here can produce VERIFIED; that still requires real exit codes and a ProofPack.
- **Credits.** `change_proposal` costs 3 credits (`src/config/credits.ts`). Refusals, provider errors, proposals with no applicable change and a file changing during the call are refunded.
- **Who decided what.** Task transitions now record the agent and Farbaek as actors for the steps they decide (`private.apply_transitions` reads `actor_kind` from each step). Person steps are always the signed-in user.

## Consequences

- The full policy engine (Stage 3) will replace "evaluate_policy = contract checks", keeping the same lifecycle events.
- When a sandbox provider is connected, a runner can pick up VERIFYING tasks, run the contract's required checks against the applied revisions, and move them on with real evidence.
- Proposals store full proposed contents (up to 4 MB per proposal) for audit and review.
