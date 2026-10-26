# ADR 0092: Autonomy level 4, governed workflows

- Status: accepted (2026-10-26).
- Spec §9: "Level 4, Governed orchestration: complex approved workflows with intervention requirements and enterprise governance."
- Builds on ADR 0046 and ADR 0086 (autonomy levels 2 and 3), ADR 0047 (checks straight after an automatic apply), ADR 0083 (the emergency pause), ADR 0087 (permissions per person) and ADR 0040 (run caps).

## Context

One cloud run can take one task all the way: run, proposal, apply on its own within the workspace's limits, checks in the run's sandbox, verified. A goal that needs several changes in order still meant starting each run by hand, and Settings showed level 4 as not built.

## Decision

**A workflow is an ordered list of 2 to 8 steps.**
- **Each step is a normal task**, with its own contract a person drafts and approves through the usual task page.
- **Steps can be checkpoints:** the workflow stops for a person after them.
- **A spend ceiling** is set from the familiar run caps: each step's run stops at "the estimate" or "twice that", shown as a share of the period's usage.

**Approval binds the plan.**
- **Who:** an owner or admin approves the whole workflow once, and only when every step's contract is approved.
- **What's bound:** the canonical hash of the exact steps, their contract hashes and the ceiling.
- **Plans:** Max 3x and up (`advanced_autonomy`, the same feature as level 3).

**Farbaek runs the steps in order.** `app_workflow_claim_next` claims one step at a time under a lock, so every caller can ask safely:
- the approve and continue actions;
- the hook when a cloud run ends (`afterRun`);
- the hook when a task's checks end (`afterChecks`);
- the hourly sweep.

**Starting a step.**
- **As the approver:** a step's run starts as the person who approved the workflow, through the same checks as any run. Their membership, role and permissions (ADR 0087) are read again each time.
- **A cap per step:** each run is capped at its equal share of the ceiling, and the database refuses a step that would pass it.
- **A sandbox without a session:** a run a workflow starts gets its sandbox through the server's client, as the approver, scoped to the workspace by the sandbox service. This is how other background work already does it.
- **Done by hand:** a step whose task was already verified that way counts as done.

**Every existing control still applies to each step.**
- the built-in policy;
- workspace rules;
- the contract checks;
- the workspace's autonomy limits.

A change outside the limits waits for review, and the workflow waits with it.

**It stops for a person, and never retries on its own.**
- **Checkpoints:** a person continues.
- **A change waiting for review:** applying it and running its checks carries the workflow on.
- **Any failure:** failed or partly passed checks, a blocked change, or a run that ended without one.
- **The emergency pause:** the database refuses to start a step.
- **The spend ceiling.**

**Cancelling** stops the steps not yet started; a run already working finishes its own step.

**Recorded and visible.**
- **The audit log:** every creation, approval, step start and result, continue and cancel.
- **The Workflows page:** shows each step's state with an icon and words, and what happens next.
- **Settings > Autonomy:** describes level 4 and links to Workflows.

## Consequences

- A multi-step goal runs unattended between the points where a person has to look, inside the same limits as a single run.
- Steps are sequential. Parallel steps and branching aren't built.
- Contracts are approved one by one before the workflow. Changing a contract after approval makes a new version, which the workflow's hash no longer matches, so a new workflow is needed.
