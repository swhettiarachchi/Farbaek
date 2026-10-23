# ADR 0046: Autonomy level 2, bounded execution

- Status: accepted (2026-10-23).
- Spec: §9 "Autonomy maturity" (levels 0 to 2 belong to Stage 3). Builds on ADR 0004 (policy), ADR 0011 (hash-bound approval), ADR 0012 (ProofPacks), ADR 0015 (recovery) and ADR 0042 (the approval window).

## Context

The spec defines autonomy levels:
- **Level 0:** observe;
- **Level 1:** propose;
- **Level 2:** bounded execution, "execute preapproved low-risk operations within strict limits".

**Organizations configure** the eligible actions and limits, and "autonomy is automatically reduced … after serious failures … with an explanation and a change-log entry".

**Farbaek ran only level 0.** The change policy floored every proposal at `REQUIRE_APPROVAL`, so a one-line change inside the contract still waited for a person.

## Decision

### Owners and admins choose a level, with limits

`org_autonomy` (migration v31) holds:
- the level: 0 or 2, default 0;
- a file limit, 1 to 5 (default 3);
- whether new files may apply on their own (default no);
- any suspension.

**Who changes it:** owners and admins, through `app_set_autonomy`. Each change is audited with the before and after. Turning level 2 on clears a suspension.

### Policy version 2

`evaluateChangePolicy` (`src/core/trust/policy.ts`) keeps every earlier rule. A contract violation still blocks, and sensitive files or large changes still escalate.

**When level 2 applies:** only when the result would otherwise be `REQUIRE_APPROVAL`. The outcome becomes `ALLOW_WITHIN_LIMITS` only if:
- the change is within the file limit;
- it creates no files, unless allowed;
- the contract lists checks and a verified sandbox can run them ("verifiable").

**Its finding is in words.** It says the change applies on its own, or which limit made it wait.

**The rule set's schema is `farbaek.policy/v2`,** so the policy version recorded with each proposal changed.

### Applying on its own, through the same path

A proposal allowed within limits is applied right after it's created, by `autoApplyWithinLimits`, which calls the same `applyProposal` a person uses, with `by: "policy"`:
- **What applies:** exactly the proposal's content; nothing was edited in a review.
- **The task's history:** `grant_approval` is recorded with actor `system`.
- **The ProofPack's approval:** says `by: "policy", autonomyLevel: 2`, with the person whose work it was.
- **Unchanged from a person's approval:**
  - the base-revision check;
  - the 72-hour window (ADR 0042);
  - the ProofPack chain;
  - recovery.
- **If it can't apply** (for example, a file changed meanwhile), the proposal waits for a person, and the run says why.

**Where it applies:**
- web proposals;
- cloud runs that finish. A cloud run stopped by a limit keeps its partial work for review.

**Where it doesn't:** the desktop agent's proposals always wait. That work ran on someone's computer, outside Farbaek's sandbox.

### The database holds the line

- **Before a proposal is inserted,** a trigger refuses `ALLOW_WITHIN_LIMITS` unless the workspace has level 2 on and isn't suspended (`AUTONOMY_OFF`). It covers the web, cloud-run and agent create functions without changing them.
- **After a ProofPack is inserted,** a trigger checks whether it's failed and belongs to a proposal whose first ProofPack says `"by": "policy"`. If so, it suspends the workspace's autonomy, with the reason and date, and audits `autonomy.suspended`.

### What people see

- **Settings has an Autonomy card:**
  - the two levels, with level 2's conditions written out;
  - the file limit and "Allow new files";
  - a notice when no verified sandbox is connected, because then every change still waits;
  - a suspension with its reason, and "Turn on again".
- **The review:** an applied change says "Applied on its own … within this workspace's autonomy limits (level 2)", and the policy box shows the finding.
- **Approvals:** these never wait, so they never appear there.

## Consequences

- **Small, checked changes stop waiting** in workspaces that opt in. Everything risky still waits, because autonomy never lowers a block or an escalation.
- **Checks don't run by themselves after an automatic apply.** They run when someone runs them, as for any applied change, so a failure suspends autonomy only once they've run. Running them automatically is the next step.
- **Not done:**
  - levels 3 and 4;
  - per-project autonomy;
  - lowering autonomy for other kinds of failure, such as credential concerns.
