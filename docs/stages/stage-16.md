# Stage 16: Skill pinning

The spec's backlog (§25, Next) lists Tool Definition Pinning against tool poisoning. In Farbaek, the outside text that reaches the agent's instructions is a project's own skills. Each now applies only in the exact version a person approved.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0043-skill-pinning.md`.
- **Branch:** `feat/skill-pins`, from `feat/approval-wallet`. Merge #20, then #21, then this.

## 2026-10-23

### Done

**Migration v28** (`20261030090000_skill_pins.sql`):
- **The table** `project_skill_pins` holds the revision, SHA-256, who and when. Members read it; only the server writes.
- **`app_pin_skill`** approves only the file's current revision and hash (otherwise `FILE_CHANGED`). It's for contributors, on projects that aren't archived, and it's audited.
- **`app_unpin_skill`** withdraws an approval.
- **Existing skill files** are pinned once, as they are.

**The logic:** `src/core/agent/skill-pins.ts`:
- each skill's status: approved, changed or new;
- `splitByPins`;
- the run's note for held skills.

**Runs:** cloud runs load only approved project skills, and name the held ones in their steps. The plan card lists approved skills and links held ones to their review.

**The project page:**
- each skill shows its state with an icon and words;
- a held skill opens a read-only diff against its approved version, or its whole text when new;
- "Approve this version" pins exactly what was shown.
- **The actions:** a skill added with the form is approved as written; removing one withdraws its approval.
- **In the demo:** the section now shows in the demo workspace, read-only. The demo Storefront has a labelled sample skill, approved at revision 1 and changed since.

### Verified

- **`tests/db/skill-pins.test.ts`** (7 tests), on PGlite:
  - only the current revision and hash can be pinned, and a stale one keeps the old pin;
  - only skill paths, a contributor of the workspace, and the server can write;
  - each change is audited;
  - members read only their own workspace's pins;
  - the migration's backfill pins existing skills with no person named and leaves existing pins alone;
  - pins go with their project.
- **Unit tests:**
  - `skill-pins.test.ts` (core): the statuses, the split, ordinary files named `SKILL.md` outside skill folders, and the note.
  - `skill-pins.test.ts` (server): the exact revision and hash are sent; viewers and non-skill paths are refused before the database; the "changed again" message; the demo sample is changed since its approval.
  - `executor.test.ts`:
    - an approved skill reaches the agent;
    - a changed one and a planted new one don't;
    - the run's note names both.
- **The full suite:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,155 passed, 14 skipped. One earlier run had a single failure that didn't recur, one of the known load-sensitive tests.
- **In the browser,** on a demo build, on the Storefront project page:
  - the Skills section says "1 skill is waiting for review";
  - house-style shows "Changed since it was approved" and "Approved at revision 1; now at revision 2. Not used in builds until reviewed."
  - "Review what changed" opens the diff with the one added line in green: a newsletter popup with a pre-ticked consent box;
  - "Approve this version" is unavailable, with the demo's reason;
  - at 375px the diff wraps, the button is 44px tall, and nothing scrolls sideways.
- **Not seen in the browser:** the plan card's "waiting for review" line. No demo task in that project has a plan awaiting approval; the line comes from the tested `splitByPins`.

**Production database:** migration v28 applied to the self-hosted database on 2026-10-23.
- **How:** the SHA-256 (`23cdb046…d80a2fed`) matched on the server; one transaction with `ON_ERROR_STOP`.
- **Read-only checks:**
  - RLS is on, with one read policy;
  - signed-in users can read and not write, and anonymous users can't read;
  - only the server can run `app_pin_skill` and `app_unpin_skill`;
  - the one skill file in production was pinned at its current revision and hash, with no person named.
- **Afterwards:** the API schema cache was reloaded.
- **Until this branch is deployed:** cloud runs keep loading every project skill, as before.

### Next

- When agents connect to MCP servers, pin each server's tool descriptions the same way.
