# ADR 0135: The Failure Futures Lab

- Status: accepted (2026-10-30).
- From master spec §10: "Suggest and run controlled failure scenarios derived from the actual diff, architecture, contracts, tests and sanitized incidents. Run only in isolated environments with time and resource limits. Label hypothetical concerns separately from reproduced failures."

## Decision

**Suggested from the change itself.**
- On a change waiting for review, Farbaek reads the lines the change adds to source files. It skips tests, docs and lockfiles.
- It looks for signals of the spec's priority failures:
  - webhooks (a duplicate or out-of-order delivery);
  - network calls without a time limit or 429 handling (a timeout, a rate limit);
  - a read followed by a write, or work started side by side (concurrency);
  - writes outside a transaction (a partial database failure);
  - credentials (expired) and permission checks (denied);
  - input parsing (malformed or empty input);
  - dates (timezone boundaries);
  - retries (a retry that never stops);
  - versioned API URLs (an incompatible API);
  - settings read without a fallback (missing configuration).
- Each scenario names the line that suggested it, says what could go wrong and what a trial would do, and is labelled **Hypothetical**.
- This step is deterministic, uses no AI and costs nothing (`src/core/realityloop/failure-futures.ts`).
- Deploy and rollback failures stay with the Reversibility Radar (ADR 0122), because a unit test can't simulate them.

**Tried one at a time, on request.**
- **The request.** A contributor picks **Try this failure**. The server works the scenario out again from the stored proposal and never takes it from the browser.
- **The runner.** The trial needs the project's own test runner: Vitest or Jest from `package.json`, or pytest from the Python requirements. Without one, the buttons are off with that reason.
- **The test.** Claude writes one test that simulates the failure and asserts what correct code should do under it. It's metered as `failure_test` and refunded if it fails. Claude writes only the content: Farbaek picks the path, beside the file the scenario came from. Claude may also say the failure can't be simulated here, and that's recorded as **Not testable here**.
- **The run.** One disposable sandbox, as the person:
  1. It gets the project's files with the proposal's written over them.
  2. It installs packages with install scripts off. Network is limited to the package registries, and only when packages need installing.
  3. It adds the test and runs it once with the project's own runner (`npx --no-install`, so the runner is never downloaded), with a 3-minute limit.
  4. Then the sandbox stops.
- **Nothing reaches the project.** One trial runs per proposal at a time, and a trial left running for 30 minutes is closed.

**Only what was observed** (`classifyLabRun`):

| Outcome | When |
| --- | --- |
| **Reproduced** | The test loaded, ran and failed. |
| **Handled** | It ran and the runner reported passing tests. |
| **Inconclusive** | It didn't load, timed out, or reported nothing. |

- A trial never counts as verification.
- The record keeps the AI-written test (with its SHA-256), the command, the exit code, the duration, the end of the output and the model, and the task page shows them all. A person can judge whether the test was fair. The page says plainly that the test was written by AI and may be wrong.

**Recorded once by the server (migration v82).**
- The trial lives in `failure_futures` and is bound to the proposal's content hash.
- It's written through the service-role `app_start_failure_future`, `app_attach_failure_session` and `app_finish_failure_future`. Each re-checks that the person is a contributor, and each writes an audit event (`failure_future.started` and `failure_future.finished`).
- A database constraint requires that a reproduced or handled trial names the test it ran. Members read through row security.

## Consequences

- People see the specific failures a change could meet before they approve it, with the evidence line, at no cost.
- A trial costs one AI call and some sandbox time. The card says so, as an estimate.
- An AI-written test can be wrong in either direction. That's why the test is shown in full, and why nothing is called verified.

## Not done

- **Sanitized incidents as a source of scenarios:** incidents (ADR 0060) aren't read yet.
- **Runners other than Vitest, Jest and pytest.**
- **Fault injection beyond what a unit test can simulate:** for example a real database failing mid-transaction, or a real deploy rolled back.
