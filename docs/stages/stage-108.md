# Stage 108: Operating modes

Learn, Pair, Build and Audit for every task, enforced by the database, with AI explanations and audit reports for the modes that change nothing.

- **Decision record:** `docs/adr/0131-operating-modes.md`.
- **Branch:** `feat/task-modes` (from `feat/osv`).
- **Migration:** v80, `supabase/migrations/20261221090000_task_modes.sql`.

## 2026-10-30

### Done

- **Migration v80:**
  - `tasks.mode`;
  - triggers on proposals (Learn and Audit refused, Pair at most 3 files), on applying (Pair never on its own) and on agent runs (Learn and Audit refused);
  - `app_set_task_mode`;
  - `task_notes` and `app_record_task_note`;
  - the ledger accepts `task_note`.
- **`src/core/realityloop/modes.ts`:** modes, words, refusals, the note schema, what a note reads, and what's kept from it.
- **`src/server/ai/task-note-writer.ts`:** the Learn and Audit prompts, with Claude's structured output.
- **`src/server/workspace/task-notes.ts`:** a metered note (`task_note`), and the reader.
- **The proposer:** Pair's brief asks for a small step; extra files are named as `pair_step`.
- **The task page:**
  - the Mode card (a segmented control with each mode's meaning);
  - Learn and Audit get a notes card, with Propose and Start run unavailable and the reason shown;
  - Activity names mode changes and notes;
  - `docs/billing/usage.md` lists the operation.

### Verified

- `tests/db/task-modes.test.ts` (5):
  - Learn and Audit refuse proposals and runs, and Build doesn't;
  - Pair refuses 4 files, and refuses an apply by policy but allows one by a person;
  - modes change only for contributors, never while a change waits, and each change is recorded;
  - notes match the mode, contributors write them and members read them;
  - the ledger accepts `task_note`.
- `src/server/workspace/task-notes.test.ts` (4):
  - the contract's files are read, the call is metered, and invented paths are dropped;
  - Audit gets a report, while Build and Pair are refused before anything is spent;
  - viewers are refused;
  - a failure is refunded;
  - the 8-file and 60,000-character limits.
- `src/server/workspace/proposals.test.ts` (1 new): Pair's brief, 3 files kept, and the fourth named.
- `pnpm typecheck`, lint on the changed files.
