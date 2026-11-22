# Stage 209: The audit, and the faults it found

- **Branch:** `feat/stage-209-program-audit`, from `feat/stage-207-chat-memory` (PR #273, stages 206 to 208). Its own PR follows #273's merge.
- **Migration:** none. **New dependency:** none.
- **Why:** on 2026-11-22 the owner asked for the whole platform to be audited against a master brief, and for what's broken to be fixed before anything new is built.
- **Skill applied:** `ecc-security-review`, to the fixes below. Its checklist led to the fifth fix (a command's output).

## What was audited

Four read-only audits, each returning facts with file and line: AI providers and routing; agents, automation and secure execution; plans, billing, analytics and security; frontend, design and the apps. A fifth read every installed skill. The results are in `docs/farbaek/FARBAEK_MASTER_AUDIT.md` and `FARBAEK_SKILLS_INVENTORY.md`.

## Faults fixed

Each was read again in the code before it was changed.

1. **Chat kept to a workspace's own key.**
   - **What was wrong:** a workspace can set its own Claude key (ADR 0125), and such a key fails closed when it can't be read. Chat didn't: `chatModels` returned OpenAI with no error, so the workspace's words went to OpenAI on Farbaek's key.
   - **The fix:** `aiForWorkspace` says when the failure is the workspace's own key. The choice of models for a turn is now a small pure function (`src/server/chat/turn-models.ts`), which stops the turn with the reason.
   - **What people see:** "This workspace's own AI key can't be read on this server anymore…", with what to do.
2. **A step that is still working isn't failed.**
   - **What was wrong:** an agent's run leaves its task at `CONTRACT_APPROVED` until it has a change to suggest. The hourly sweep read that state as "the run ended without a change" and stopped the workflow. A run can last 40 minutes, so a long step was likely to be caught.
   - **The fix:** `settleStep` asks whether a run for the task is still live, and leaves the step alone if so.
3. **Every step in progress is settled.** The sweep read one step per workflow. A team's steps run side by side (ADR 0128), so the others waited an hour each. It now settles all of them.
4. **Abandoned runs say so within the hour.** A run whose server restarted stayed "working" until someone opened Home or the run's page. The hourly job now marks them interrupted, before the workflow sweep reads them. Without this, fix 2 would leave such a step waiting for ever.
5. **Secrets on a person's computer don't reach a model.**
   - **What was wrong:** the agent's `read_file` and `search_files` had no screening, though every write and every import did. A local `.env` or key file could be sent in a prompt. A command's output wasn't screened either.
   - **The fix, reading:** `AgentWorkspace.read` refuses a credentials file by name and a file holding what looks like a key, and names the file without the value. Search leaves both out.
   - **The fix, commands:** output passes through the log's `redact` and a new `blankSecrets`, built from the same list that screens writes, so what the model reads never holds a secret by that check.
   - **What stays the same:** the class's own bookkeeping (a checkpoint's "before", an edit's base) still reads the file as it is, and nothing from it is shown to a model.
   - **Reach:** this is the cloud agent's loop too. The desktop app gets it with its next release.

## Verified

- **Unit tests,** all new:
  - `turn-models.test.ts`: Farbaek's keys, a workspace's own key, an unreadable own key (no OpenAI, the reason kept), and a server without Claude;
  - `orchestrator.test.ts`: a live run leaves the step alone, an ended run fails it, a task that has moved on is settled whatever a run is doing, and the sweep's word for several steps;
  - `loop.test.ts`: a planted `.env` and a key inside `config.js` are refused without the value, search leaves them out, an ordinary file still reads and edits, and a command that prints a key reaches the model with it blanked;
  - `files.test.ts`: `blankSecrets` blanks every format the screening knows, every copy, a private key from first line to last, and leaves ordinary output alone.
- **Suites:** workflows 18, chat, jobs and AI 159, the agent runtime and workspace 280 tests pass.
- **`pnpm typecheck`** and lint on the changed files: clean.
- **The full suite:** see the PR.

## Not done here

- Nothing the audit lists as "as reported" was changed. Those are stale documents and duplicated code, for their own stages.
- A pause still reaches only the server it was pressed on. Runs held by another process stop when they next check.

## Next

`docs/farbaek/FARBAEK_IMPLEMENTATION_PROGRESS.md` has the order of work.
