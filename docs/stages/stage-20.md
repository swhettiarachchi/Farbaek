# Stage 20: Verification in one step, and on its own after autonomy

Stage 19 let small, checked changes apply on their own, but nothing checked them afterwards, and checking by hand took four steps. Now one button runs an applied change's checks, and a change that applies on its own is checked straight away.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0047-verification-on-its-own.md`. ADR 0046 notes the change.
- **Branch:** `feat/verify-on-its-own`, from `main`.

## 2026-10-23

### Done

**Migration v32** (`20261103090000_task_verifications.sql`):
- **The table** `task_verifications`: one row per attempt.
  - It records who or what started it (`person` or `autonomy`), the session and how it ended: the receipt, or the reason it couldn't run.
  - One attempt runs per task at a time.
  - Members read it; only the server writes it.
- **The functions:**
  - `app_start_task_verification`: contributors only, for a task in VERIFYING with an applied change; it closes an attempt running for more than 20 minutes.
  - `app_attach_verification_session`: the session must be linked to the same task.
  - `app_finish_task_verification`: the result is the receipt's own status, from a session linked to the task.
  - Each is audited.
- **The trigger:** a change applied by policy whose checks partly fail now pauses autonomy too.

**Domain logic** (`src/core/realityloop/verification.ts`):
- **`verificationSetup`:** the install a fresh sandbox needs, from the project's lockfile, with install scripts skipped for npm and pnpm.
- **The state of an attempt:** running, stale, done or failed.
- **The words for each result,** and the cloud run's outcome after an automatic check.

**Server** (`src/server/verification/`):
- **`startTaskVerification`** checks the role, the sandbox, the task's state and the contract's checks, records the attempt, and runs it in the background.
- **`runTaskVerification`:**
  1. A session starts as the person, linked to the project and task.
  2. The install runs, with registry-only network and only when the plan allows it.
  3. Then `runChecks`, the same check run as by hand.
  4. Then the attempt is finished.
  5. The session always stops.
- **`verifyInRunSession`:** a cloud run writes exactly the applied files into its own sandbox, then runs the checks there.

**Where it's used:**
- **Cloud runs** check a change they applied on its own before the sandbox stops, and say what the checks found. Level 2 now needs the run's own sandbox to have started.
- **Web proposals** that apply on their own start a check run in the background.
- **The task page:**
  - "Run the checks now";
  - "Checking now", refreshing on its own;
  - an attempt that couldn't finish, with its reason, and "Run the checks again";
  - opening a sandbox by hand as a link;
  - disabled reasons for review only, viewers, writes off and the demo.
- **Other copy:** the Autonomy card says changes are checked straight away. The demo has a sample task waiting for its checks, with a sample attempt that couldn't run.

### Verified

- **`tests/db/task-verifications.test.ts`** (6 tests):
  - only contributors start an attempt, only for an applied change waiting for its checks, one at a time;
  - a stale attempt is closed;
  - a session or receipt from another task is refused;
  - the result comes from the receipt;
  - a reason is recorded when it couldn't run;
  - members read and can't write;
  - audit events are written;
  - a partly failed check pauses autonomy for a change applied by policy, and not for one a person approved.
- **`verification.test.ts`** (5): setup commands per lockfile, nothing for a static site, states and words.
- **`runner.test.ts`** (7):
  - refusals;
  - background start;
  - setup, then checks, then stop;
  - no network for nothing to install;
  - a failed or timed-out install runs no checks, and the session still stops;
  - no registry access;
  - a sandbox that won't start;
  - a lost session;
  - in-run checks write exactly the applied files;
  - a file that can't be copied.
- **`executor.test.ts`** (2 new, 2 changed): an automatic apply is checked in the run's sandbox with exactly the applied content; a failed check says autonomy is paused; a check that couldn't run says so; no way to check means no automatic apply.
- **The full suite:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,232 passed, 14 skipped.
- **In the browser,** on a demo build, the sample task waiting for its checks:
  - the Verification card shows the sample attempt that couldn't run, with its reason, who started it ("on its own … (autonomy level 2)") and when;
  - "Run the checks again" is disabled with the demo's reason, 48px tall;
  - "What happens next" points to the Verification card;
  - at 375px nothing scrolls sideways, and the attempt's line reads as one sentence (a wrapping bug found here was fixed);
  - at 1280px the card sits as before;
  - Mission Control lists the sample task.
- **Not checked in the browser:** the "Checking now" state. The demo's sample is a finished attempt. **Not run:** a live check run, which needs a signed-in workspace with a sandbox.

**Production database:** migration v32 applied to the self-hosted database on 2026-10-23.
- **How:** the SHA-256 (`ff6cdb28…aa47fc0`) matched on the server; one transaction with `ON_ERROR_STOP`.
- **Read-only checks:**
  - `task_verifications` has RLS with one read policy;
  - signed-in users can only read, and anonymous users have no access;
  - only the server can run the three functions;
  - the trigger function now covers `partially_verified`;
  - the table is empty.
- **Afterwards:** the API schema cache was reloaded.

### Next

- Live output of a check run on the task page.
- Yarn and Bun lockfiles installed with their own tools.
