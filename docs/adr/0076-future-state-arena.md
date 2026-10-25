# ADR 0076: Future-State Arena, trying a change before approving it

- Status: accepted (2026-10-25).
- Builds on ADR 0013 (the sandbox), ADR 0047 (verification in one step) and ADR 0058 (app checks).
- Spec Stage 3: "Future-State Arena on disposable worktrees". The spec says to compare candidates in isolated environments, show changes, test outcomes, cost estimates, policy violations and uncertainty, never replay against production, and keep observed, predicted and AI-approximated results visibly apart.

## Context

A proposal's checks ran only after a person applied it (ADR 0059). A person deciding whether to approve had the diff, the Intent Diff Lens and the policy decision, but no evidence of what the change does to the project's own checks. Approving a change that breaks the build meant finding out afterwards and undoing it.

## Decision

**"Try it first" on a change waiting for review.** One disposable sandbox runs the contract's checks twice, with nothing applied to the project:
1. on the project's current files, the baseline;
2. with the proposal's files written over them, the candidate.

The setup (installing packages without their install scripts) runs once. It runs again before the candidate only when the change touches a dependency manifest. The sandbox stops at the end either way.

**Never evidence.** A trial writes no receipt, no ProofPack, no task transition and nothing to the project. Each command still goes through the sandbox's guard and is recorded in the session's history, like any command. The sandbox service gains `trialChecks`: the same check loop as `runChecks`, Farbaek's site check included, returning only what each check did.

**Comparing** (`src/core/realityloop/arena.ts`). Each check is passed, failed or not run, before and after. It shows as "breaks", "fixes", "still passes", "still fails" or "didn't run". The verdict leads with a break.

**Labels:**
- The results are observed: "Ran in a sandbox", with the time.
- The sandbox time it uses is a prediction, labelled as one.
- The page never calls a change verified because of a trial. Verification still happens after applying, against exactly the applied content (ADR 0047).

**Records** (migration v47, `arena_runs`). The table records the proposal and its content hash, who asked, the session, the status, and both result lists. Rules:
- one running trial per proposal;
- only for a pending proposal;
- for contributors only;
- results are written once, by the server.

Members read their workspace's trials.

**Plan and cost.** Trials use the plan's sandbox time, like any session, and the sandbox's limits apply. Like checks, they're unavailable where no verified sandbox is connected, and the reason is shown.

## Consequences

- A person sees "this change breaks `npm test`" before approving, from a real run.
- A trial costs sandbox minutes. People start it themselves; it's never automatic.
- Comparing several candidate plans side by side, and simulations for business workflows, can build on the same records later.
