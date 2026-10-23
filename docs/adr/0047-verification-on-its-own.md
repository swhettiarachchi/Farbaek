# ADR 0047: Verification in one step, and on its own after autonomy

- Status: accepted (2026-10-23).
- Spec: §8 RealityLoop ("verify against the contract"), §9 "Autonomy maturity" (level 2 is bounded execution, reduced automatically after failures). Builds on ADR 0012 (ProofPacks), ADR 0013 (the sandbox), ADR 0022 (cloud runs) and ADR 0046 (autonomy level 2).

## Context

**Verifying an applied change took four manual steps:**
1. Open a new sandbox from the task.
2. Start a session.
3. Install the project's packages in the console.
4. Run the checks from the session's Checks tab.

**Autonomy level 2 (ADR 0046) depended on those steps.**
- A change could apply on its own.
- Its checks ran only when someone remembered to run them.
- So the rule "a failed check pauses autonomy" rarely had anything to act on.

**The trigger had a gap.** It paused autonomy only when a ProofPack was `failed`. A partly failed run (`partially_verified`) left autonomy on, although a check had failed.

## Decision

### One step, recorded

**`task_verifications` (migration v32)** records each attempt to verify an applied change:
- **who or what started it:** a person, or autonomy;
- **the session it ran in;**
- **how it ended:**
  - with the receipt its check run wrote;
  - or with the reason it couldn't run.

**The functions** are server-only, check the person, and are audited:
- `app_start_task_verification`;
- `app_attach_verification_session`;
- `app_finish_task_verification`.

**The rules they enforce:**
- **One at a time:** one attempt runs per task.
- **Stale runs:** an attempt running for more than 20 minutes is closed as stopped.
- **Where the result comes from:** the receipt of a session linked to the same task, never a separate claim.

**The check run itself is unchanged** (`runChecks` in `src/server/sandbox/service.ts`):
- it hashes the applied files inside the sandbox;
- it runs the contract's required checks;
- it writes the receipt and, when the files matched, a verification ProofPack;
- it moves the task by the real exit codes.

### Fresh sessions: setup, checks, stop

`runTaskVerification` (`src/server/verification/runner.ts`):
1. **Starts a session** linked to the project and task, as the person, with their refreshed token held in memory only. This is the same pattern as security checks and cloud runs.
2. **Installs the project's packages,** as worked out by `verificationSetup` (`src/core/realityloop/verification.ts`):
   - `npm ci`, or `npm install` without a lockfile;
   - `corepack pnpm install --frozen-lockfile`;
   - `pip install -r requirements.txt`.

   npm and pnpm installs always pass `--ignore-scripts`, so packages' own install scripts never run. pip has no such switch.

   Installs use registry-only network, and only when the plan allows it.
3. **Runs the checks.**
4. **Stops the session,** always.

**When it can't run the checks:**
- an install that fails, or a sandbox that won't start, is recorded with its reason;
- no checks run;
- nothing about the task or autonomy changes.

### After autonomy applies a change

- **Cloud runs** check the change in their own sandbox, before it stops.
  - Exactly the applied files are written in first.
  - The run's steps and outcome say what the checks found.
  - Level 2 now also needs the run's sandbox to have actually started; being connected isn't enough.
- **Web proposals** that apply on their own start a fresh-session attempt in the background, started by `autonomy`.

### The trigger

`private.suspend_autonomy_on_failure` now also pauses autonomy on `partially_verified`, for changes applied by policy.

### What people see

**The task's Verification card:**
- **Run the checks now:** one button, with one sentence on what it does and that it uses sandbox time.
- **While it runs:** "Checking now", with who started it, refreshing on its own.
- **An attempt that couldn't finish:** shown with its reason, and "Run the checks again".
- **Opening a sandbox by hand** stays available as a link.
- **When the button is disabled,** it gives the reason:
  - review only;
  - viewer;
  - writes off;
  - the demo.

## Consequences

- **Verification is one click,** and a change applied on its own is checked without anyone remembering to.
- **A failed or partly failed check after an automatic apply pauses autonomy,** as ADR 0046 intended.
- **Installs follow the project's lockfile** and skip lifecycle scripts. A project that needs those scripts, or a system package, fails setup with the reason. The person can still open a sandbox by hand.
- **Not done:**
  - Yarn and Bun lockfiles are installed with `npm install`, so their exact pins aren't followed.
  - Verifying desktop-agent changes on the person's own computer.
  - Showing a check run's live output on the task page; the receipt arrives when it finishes.
