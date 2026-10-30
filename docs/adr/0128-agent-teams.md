# ADR 0128: Agent teams, several agents on one workflow

- Status: accepted (2026-10-30).
- From master spec Stage 8 and §9 ("multi-agent coordination"), and the owner's list ("several agents coordinating on one job"). Updates ADR 0092, which said "Steps are sequential. Parallel steps and branching aren't built."

## Decision

**Steps of a governed workflow can run together.**
- In the New workflow form, a step can be set to **"Run at the same time as step N"**. That puts it in the same **stage** as the step before.
- Each step is still its own task, with its own approved contract and its own cloud agent run.
- **At most 3 steps share a stage**, since each agent uses its own sandbox within the plan's limits. The form, the draft schema and `app_create_workflow` all refuse a fourth (`TEAM_TOO_LARGE`).

**Farbaek coordinates the team. It never runs two agents on the same files.**
- **Before approval:** `approveWorkflow` refuses a stage where two steps' contracts could change the same files, and says which steps and which path.
  - A contract's files are its path scope (`pathScope`, the same rule the IntentLock applies to every change).
  - A contract without one can touch the whole project, so it overlaps every teammate.
  - Two paths overlap when they're equal or one is inside the other.
- **While running:** each run's change is still confined to its own contract, and applying refuses a file that changed since the change was proposed (`FILE_CHANGED`). Teammates can't overwrite each other.
- **The binding:** the approval's hash includes the stages whenever a stage is shared. Sequential workflows keep exactly the hash they were approved with.

**Running (migration v79):**
- **Claiming:**
  - `app_workflow_claim_next` works on the lowest stage with a step not yet verified;
  - it claims that stage's pending steps one per call, under the same lock and spend-ceiling check;
  - the orchestrator keeps claiming, so the whole team starts together;
  - it answers `busy` while teammates work.
- **The join:** the next stage starts only when every step of this one is verified.
- **Checkpoints:** a checkpoint on any step of a stage holds the whole next stage until a person continues.
- **Failure:** a teammate's failure, or a run that can't start, halts the workflow with words. Teammates already working finish their own step, as with a cancel. Nothing retries on its own.
- **Review:** while any teammate's change waits for review, the workflow waits; it carries on once nothing is waiting.
- **Existing workflows** get one step per stage and run exactly as before.

**Visible:**
- the form marks a step that runs together ("With step N");
- the workflow page says which steps run at the same time, each with its own agent;
- the next-action line names every step being worked on ("2 agents are working at the same time, on steps 2 and 3").

## Consequences

- One job can be split across up to 3 agents at once where the work separates cleanly by files, and it finishes sooner under the same controls: contracts, policy, workspace rules, autonomy limits, run caps and the spend ceiling.
- Three agents use three sandboxes at once. A plan's sandbox limits still apply, and a refusal halts the workflow rather than waiting.

## Not done

- **Teammates handing each other context mid-run.** Each agent reads the project as it is when its run starts.
- **Branching:** choosing a path from a result.
- **The trust graph and delegation registry** from spec §9.
