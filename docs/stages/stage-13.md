# Stage 13: a run's own usage cap

The spec's backlog (§25) lists the Cost-Before-Compute Envelope as an MVP item: an estimate and a hard cap before a run, a run that never exceeds the cap, and a stop at the cap with a resumable checkpoint.

- **Plan:** approved 2026-10-22.
- **Decision record:** `docs/adr/0040-run-caps.md`.
- **Branch:** `feat/run-caps`, from `main`.

## 2026-10-22

### Done

**Plan card:** **Stop the run at**: the estimate, twice that (the default), or no run cap. The choice is explained in words, and the cap is worked out in units on the server.

**Gateway:** prices each step's worst case and refuses with `RUN_CAP_REACHED` when it doesn't fit, before reserving or calling anything.

**Executor:**
- tracks settled spend and passes what's left before each step;
- keeps the work of any limit stop (cap, steps, tokens, time) as a partial proposal, the checkpoint Keep going carries on from.

**Database:** migration v26 adds `agent_runs.cap_units` and an optional `p_cap_units` on `app_start_agent_run`. Calls with the earlier seven arguments still work.

**Run page:** a Cap chip with a meter of the cap used.

### Verified

- `run-cap.test.ts` (5 tests): cap units per choice; the worst case covers a cache miss writing its full output, and an input count off by the margin.
- `gateway.test.ts` (3 new tests): refuses without reserving or calling the model when the worst case doesn't fit; allows when it does; unchanged with no cap.
- `executor.test.ts` (3 new tests), driving the real Farbaek tool model through the real gateway with fake storage:
  - a run that would never finish stops before its cap, its settled total under the cap, with the edit kept as a partial change;
  - a cap too small for one step stops before any charge and says nothing changed;
  - a run that reaches the 40-step limit keeps its work too.
- `loop.test.ts`: a cap error ends as a limit.
- `tests/db/agent-runs.test.ts`: the cap is stored and audited; zero is refused; uncapped and seven-argument starts still work.

**Production database:** migration v26 applied to the self-hosted database on 2026-10-22 (SHA-256 `77693e38…5e967ee4` matched; one transaction with `ON_ERROR_STOP`). Read-only checks: `cap_units` is a nullable integer; there is one `app_start_agent_run`, with the new optional parameter, executable by `service_role` only (not `anon` or `authenticated`); the API schema cache was reloaded. It's compatible with the code already running, which calls the function with seven arguments.

### Next

- Caps for the desktop agent's runs.
