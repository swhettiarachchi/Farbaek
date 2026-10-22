# ADR 0040: A run's own usage cap (the Cost-Before-Compute Envelope)

- Status: accepted (2026-10-22).
- Spec: §25, the innovation backlog's MVP item "Cost-Before-Compute Envelope".

## Context

People who build with AI tools report unpredictable usage burn. Farbaek already shows an estimate on the plan card ("likely to use 2 to 6%"), refunds failed and refused steps, and shows what a run used.

Nothing bounded a single run, though:
- **The gateway** reserves an expected output size for each step and settles the real cost afterwards (ADR 0020, ADR 0021). That protects the plan's allowance as a whole, not one run.
- **When a run stopped** at a fixed limit (steps, tokens or time), it was marked failed and its work so far was dropped.

The spec asks for three things: a hard cap shown before the run, a run that never exceeds it, and a stop at the cap with a resumable checkpoint.

## Decision

### Choosing the cap

The plan card has **Stop the run at**:
- **The estimate:** the top of the estimate's range;
- **Twice that:** the default;
- **No run cap:** the plan's allowance still applies.

The browser sends only the choice. The server works out the units from the workspace's own plan and the same estimate (`runCapUnits`, `src/server/workspace/plan-card-data.ts`). The cap is stored on the run: `agent_runs.cap_units`, migration v26, set through `app_start_agent_run`'s new optional `p_cap_units`.

### Never going past it

1. **Tracking spend.** The cloud executor adds up what each settled step really cost (`stepUnits`). Refused steps were refunded, so they count as nothing.
2. **Checking before each step.** The executor passes what's left to `callModel`. After routing, the gateway prices the step's **worst case** (`worstStepUnits`, `src/core/agent/run-cap.ts`):
   - every input token written to the cache, the dearest way to read it, with a 25% margin, because input is counted approximately before the call;
   - the step's whole output allowance, `STEP_MAX_OUTPUT_TOKENS`.
3. **Refusing.** If the worst case doesn't fit, the gateway refuses with `RUN_CAP_REACHED` before reserving or calling anything. The step costs nothing.

So a run's settled total stays under its cap, provided the input estimate is within the margin. The usage doc says that the input count is an estimate.

### A checkpoint, not a failure

`RUN_CAP_REACHED` becomes a `cap` model error, which the loop ends as a `limit`.

Every limit stop now keeps the work, whether the cap, steps, tokens or time stopped it:
- **If the agent changed files,** they become a proposal whose summary starts "Partial: the run stopped before finishing". It goes through the same policy checks and review as any change. The run says the work so far is waiting for review, and Keep going carries on from it once it's applied.
- **With no changes,** the run says the agent hadn't changed any files yet.

### Showing it

The run page shows the cap next to "Used", with a small meter of the cap used, and the outcome says when the cap stopped the run.

## Consequences

- People choose the most a run may use before it starts, and it never passes that. When it stops, nothing is lost.
- **Cloud runs only.** The desktop agent's runs don't take a cap yet: its API doesn't pass one, so the gateway behaves exactly as before.
- **A tight cap means more stops.** "The estimate" can stop a large change early. That's why the default is twice the estimate, and why the card says so.
- **Partial proposals for every limit.** Runs that hit the fixed step, token or time limits also keep their work now. Before, they lost it.
