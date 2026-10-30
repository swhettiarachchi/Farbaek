# ADR 0136: Mutation trials

- Status: accepted (2026-10-30).
- From master spec §10, Test integrity: "Where justified, run mutation testing (StrykerJS for TS/JS, mutmut or cosmic-ray for Python [VERIFY]) or constrained fault injection in disposable environments. Record detected and undetected mutants, the associated tests, compute time and limitations. Mutation score is not overall quality."

## Decision

**Farbaek's own small mutator, not StrykerJS or mutmut.**
- Running Stryker or mutmut in a sandbox would mean downloading a tool the project doesn't have on every run. That's an unpinned dependency fetched at run time, which the dependency rules avoid. It would also let a full mutation run take hours.
- The spec allows "constrained fault injection", so Farbaek makes its own mutants with five operators (`src/core/realityloop/mutation.ts`):
  - an equality check flipped (`===` and `!==`, `==` and `!=`);
  - a comparison's boundary moved (`<` and `<=`, `>` and `>=`);
  - `&&` and `||` swapped (`and` and `or` in Python);
  - `true` and `false` flipped;
  - arithmetic swapped (`+` and `-`, `*` and `/`).
- Only spaced operators count, so TypeScript generics and arrows are left alone. Strings and comments are never mutated.

**Only the lines a change adds.**
- Mutants come from the lines a change waiting for review adds to source files. Tests, docs and unchanged lines are left out.
- At most 8, spread across lines first: the first mutant on each line, then the second, and so on.
- The task page lists the planned mistakes before anything runs. Each shows a window of its line centred on the change, with the changed operator highlighted, so it reads on a phone.

**One disposable sandbox, as the person.**
1. The sandbox gets the project's files with the proposal's written over them, and installs packages with install scripts off.
2. **The clean run.** The tests related to the changed files run once with no mutant: `vitest related --run --bail=1`, `jest --findRelatedTests --bail`, or `pytest -x`, always through `npx --no-install`.
   - If they fail, or none cover the files, nothing is judged, and the run says why.
3. **Each mutant.** For each mutant, Farbaek writes it in, runs the same tests with a limit of about three times the clean run (30 to 180 seconds), then writes the original back.
   - If the original can't be written back, no later result is trusted, and the rest are marked not run.
   - After a 12-minute budget the remaining mutants are marked not run.
4. The sandbox stops. No AI is used, and nothing reaches the project.

**Recorded as observed** (migration v83, `mutation_runs`):

| Result | Meaning |
| --- | --- |
| **Caught** | A test failed. |
| **Caught: timed out** | The run hit its limit, which mutation tools usually count as caught. |
| **Survived** | Every test passed. |
| **Didn't load** | The mutant didn't compile or import, so it says nothing about the tests. |
| **Not run** | The run didn't reach it. |

- The database works out the caught, survived and judged counts from the mutants itself. The score is caught out of judged.
- The record keeps the command, the clean run's time and the total compute time. Each caught mutant keeps the name of the test that caught it, when the runner printed one.
- The card leads with survivors. It says the score covers these mutants only and isn't a measure of overall test quality.
- Runs are written through the service-role `app_start_mutation_run`, `app_attach_mutation_session` and `app_finish_mutation_run`. Each re-checks that the person is a contributor, and each writes an audit event (`mutation.started` and `mutation.finished`).

## Consequences

- A reviewer can see, before approving, which of the change's own conditions no test notices.
- A run costs sandbox time only, up to 20 minutes, shown as an estimate.

## Not done

- **More operators:** removed calls, changed return values, negated conditions.
- **StrykerJS or mutmut themselves:** for projects that already depend on them.
- **Runners other than Vitest, Jest and pytest.**
