# Stage 105: Agent teams

Several agents coordinating on one job: steps of a governed workflow can run together, each with its own agent, as long as their files are separate.

- **Decision record:** `docs/adr/0128-agent-teams.md`.
- **Branch:** `feat/agent-teams` (from `feat/sandbox-egress`, PR #133).
- **Migration:** v79, `supabase/migrations/20261220090000_workflow_teams.sql`.

## 2026-10-30

### Done

- **Migration v79:**
  - `workflow_steps.stage` (backfilled to the position, checked from 1 to 8 and no later than the position);
  - `app_create_workflow` reads `together`, with at most 3 per stage;
  - `app_workflow_claim_next` claims the current stage's steps and joins before the next stage;
  - `app_workflow_step_result` keeps waiting while any teammate waits for review.
- **`src/core/realityloop/workflow.ts`:**
  - `together` and `MAX_TEAM`;
  - `stagesOf`;
  - `teamOverlaps` (from each contract's path scope);
  - the stage-aware hash;
  - a next-action line for several agents.
- **The server:**
  - the reader carries stages and each contract's paths;
  - approval refuses overlapping teammates;
  - the orchestrator starts every step of a stage.
- **The UI:**
  - the form's "Run at the same time as step N" (unavailable past 3, with the reason);
  - the workflow page says which steps run together.

### Verified

- `src/core/realityloop/workflow.test.ts` (4 new):
  - stages and the team limit;
  - overlap rules (nested, equal, the whole project, a missing contract, separate stages);
  - sequential hashes unchanged and team hashes bound;
  - the next-action line.
- `src/server/workflows/orchestrator.test.ts` (2 new): a whole stage starts; a teammate that can't start halts it.
- `src/server/workflows/use-cases.test.ts` (1 new): approval refuses overlapping teammates with words, and approves separate ones.
- `tests/db/workflow-teams.test.ts` (5):
  - stages from `together`, with more than 3 refused;
  - a team's claim and join;
  - a checkpoint holding the next stage;
  - halt on a teammate's failure;
  - waiting while a teammate waits for review;
  - sequential workflows unchanged.
- `tests/db/workflows.test.ts` still passes.
- `pnpm typecheck`, lint on the changed files.

### Not verified

- A real team of cloud runs in production: that needs an approved workflow on a plan with workflows, started by the owner.
