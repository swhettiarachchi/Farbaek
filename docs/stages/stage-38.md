# Stage 38: An archived project's tasks say so

With checks running in production (stage 37), I ran them on the three tasks waiting for verification:
- **Sunrise Bakery** and **Volt Ride:** verified, each with a signed ProofPack.
- **The starter check:** failed with "That project is archived, so it can't be copied into a new session".

The task page had offered "Check the site now" as if it would work. That was a dead end: an archived project stays readable, but the database refuses any change to it.

- **Branch:** `fix/archived-task-controls`, from `main` after #45.

## 2026-10-24

### Done

**The task page** (`src/app/app/tasks/[taskId]/page.tsx`) loads the task's project with its other reads. When the project is archived:
- every control that changes the work names the reason: "This project is archived, so nothing in it can change." That covers approving or revising the contract, proposing a change, starting a build, running the checks and undoing;
- a notice under the title says the task stays readable and can still be cancelled;
- Cancel stays available, since the database allows it.

### Verified

- **Tests:**
  - `tests/db/archive-projects.test.ts` gains a test: a task in an archived project can still be cancelled, and starting a sandbox for it is refused with `PROJECT_ARCHIVED`;
  - the archive tests pass (5).
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean.
- **Production, before this change:**
  - Sunrise Bakery and Volt Ride are `VERIFIED`, and two ProofPacks are signed;
  - the owner received the result emails.

### Not verified

- **The archived notice on the live task page.** It needs this merged; the starter check's task page is the check.
