# Stage 275: agents that keep working toward a goal (part 1)

- **Date:** 2026-11-25
- **Branch:** `feat/stage-275-agents`, from main after stages 273 and 274 were merged
- **Decision:** ADR 0282
- **Migration:** v108, `20270118090000_personal_agents.sql`. **Apply it before merging.** **New dependency:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` for the tab and the cards (pills for the tab control, status as one of the thirteen kinds with its words, counts in a sentence, icons that name the thing: a person with a gear, a broom to clear); `premium-app-ui` for restraint (one form reused, three starting points, no new sidebar item); `ui-ux-pro-max`'s forms checks (labels above fields, the reason beside a control that is off, a number field that can be cleared and retyped); `ecc-security-review` for the new functions (who may call them, what a model's words may reach). The owner's direction: hardest first, and simple, like ChatGPT.

## Why

Persistent personal agents were the largest gap in the briefs: nothing had a lasting goal, a budget, notes of its own, or one pause. Scheduled tasks (stage 271) repeat an instruction and remember nothing between conversations.

## What was built

- **Migration v108:**
  - `personal_agents`: a name, a goal, a limit on runs, the memory switch, and when its notes were last cleared. Read by its owner; written only by the functions.
  - `scheduled_tasks.personal_agent_id` (one task for each agent) and `scheduled_task_runs.note`.
  - `app_personal_agent_save` (the agent and its task together, through the task's own save), `app_personal_agent_archive`, `app_personal_agent_notes_clear`, `app_personal_agent_run_context` (for the runner), `app_scheduled_run_note`, `app_personal_agents_export`, and a trigger that removes a person's agents when they leave a workspace.
- **`core/automation/agents.ts`:** what a run is told (`agentRunNote`), the note read from a finished answer (`noteFromAnswer`), the limit (`limitProblem`, `suggestedRunsLimit`, `LIMIT_WINDOW_HOURS`), plan limits and three starting points.
- **The runner:** an agent's task runs with the agent's note and memory choice; at its limit it is passed over without a turn and the person is told once for each stretch at the limit; a finished run's note is kept; a run after the notes were cleared starts a new chat; a removed agent's task never runs. A task that is no agent's runs as before.
- **The workspace's pause of its agents** (Problems and pause) now stops scheduled work, tasks and agents alike. Before this stage, scheduled tasks kept running through it.
- **A server note beside a Chat message** may now be 6,000 characters (`SERVER_NOTE_MAX`), so an agent's notes reach the model whole.
- **`server/automation/agents.ts`** and three actions: save, remove, clear notes. The task actions now refuse to change or remove an agent's task as a plain one, and refuse to remove a task that can't be read.
- **The Agents tab** (`/app/scheduled/agents`): each agent's card with its schedule, next time, how much of its limit it has used, its last runs with what each left, and Work now, Pause or Resume, Change, Clear its notes, Remove. The task form doubles as the agent's form.
- **Home and the email** send an agent's links to the Agents tab, and Home says "An agent was paused".
- **The download of a person's data** includes their agents and each one's notes.
- **The demo workspace** has one labelled sample agent.

## Verified

- **Tests:**
  - `tests/db/personal-agents.test.ts` (22, on the real migrations in PGlite): who may read and write an agent, the plan's two limits, a change from the version on screen, removal, leaving a workspace, what the runner is given (runs counted, a retried run once, told once, the fresh chat, notes newest first and none from before a clearing), the data download, and the owner's read-back line for v108.
  - `core/automation/agents.test.ts` (25): the limit, what a run is told, and the note read from an answer.
  - `server/automation/runner.test.ts` (28, 15 new), `store.test.ts` (9, new: what each answer from the database means, and a database without v108), `headless-chat.test.ts` (11, 5 new: an agent's longest note reaches the model whole through the real turn) and `app/scheduled/actions.test.ts` (30, 9 new).
  - `home.test.ts` (20) and `needs-you.test.ts` (16) for the links to the Agents tab.
  - With the other automation, Home, email, Chat and design tests: 1,002 in the last run. The database tests of the earlier migrations this builds on (scheduled tasks, usage, the paired desktop agents) with v108: 63.
- `tsc --noEmit` with a 4 GB heap, and lint on the changed files.
- **In a browser, the demo workspace,** at 375 and 1280 px, light and dark: the Agents tab with its labelled sample agent and its notes; a starting point filling the form with its name, goal, schedule and a limit of 35; the Tasks tab reached from the tab control. With temporary samples (removed): an agent at its limit, one paused by Farbaek, one that has never worked, and notes that were cleared. No console errors, no sideways scroll.
- `qa:responsive --strict` on both tabs and Home at 375 and 1280 px (and both tabs at 320 and 768), the Agents tab in Dark and at 200% text; `qa:a11y` on both tabs and Home: no findings.
- **Not verified:**
  - **No agent has run anywhere but in tests.** What a real model writes as its opening and its "Next:" line, and so how useful the notes are, is the first live check.
  - **A real save and the card's buttons against a real database.** The demo refuses every change, so they were exercised in tests (the actions with stand-ins, the functions in PGlite), not pressed.
  - **A database without v108.** The fall-backs are tested against the error codes the API documents, with a stand-in; they were not run against a server in that state.
  - That the workspace's pause reaches a real scheduled run: the rule is tested, the server's read of the workspace is not.

## A fresh review, before the PR

A reviewer read the stage without my notes, after every check had passed. It found no fault in who may call the new functions. It found ten faults elsewhere, the first of which would have made the stage's main feature not work. All are fixed:

1. **The notes mostly never reached the model.** The Chat turn cut any server note to 1,000 characters, and an agent's note is 811 before its first note. The cap is now 6,000, the longest agent note is held under it by a test, and a test sends one through the real turn.
2. **"Clear its notes" didn't clear what it remembers:** the next run carried on the same chat and read every earlier answer there. Clearing is now a fresh start: the next run begins a new chat, and the button says so.
3. **The card's "no notes to clear" disagreed with the server,** which gives the newest eight notes of any age while the card saw five runs. The card now asks the database with the same rule, and says runs "couldn't be read" rather than "hasn't worked yet" when they couldn't.
4. **A database fault could make an agent run as a plain task,** with no limit and with memory on. Only the one answer that means "this database has no agents yet" is taken that way now; an agent removed after its run was claimed is answered for and never run.
5. **An agent could lose its task, vanish from the page and still hold its place in the plan's count.** A task that can't be read is no longer removed, and only agents that have their work are counted.
6. **The note reader on real answers:** a "Next:" in a list copied from a page was taken as the plan (it is now only taken from the end of the answer, never from a list); Chinese or Japanese openings were cut to a word; a cut could split an emoji, and a note the database refused was never logged; "**Summary**" became the whole note.
7. **Home and the email led to the Tasks tab,** where an agent's work isn't listed. They go to the Agents tab now.
8. **A limit equal to the schedule's count skipped runs at random,** depending on which second each was claimed in. Runs are counted by when they were due, over 30 days less half a day.
9. **A starting point changed its own schedule** when its goal was edited ("Each day" read as a schedule). The starting points name no time now, and a test holds that.
10. Runs that never reached the model counted against the limit, and the first notice of reaching the limit could be missed. Only runs that began a turn count, and the notice is sent once for each stretch at the limit.

## Next

- An agent's cost shown and capped in AI usage; talking to an agent with its goal and notes in mind; more than one piece of work for an agent.
- Triggers other than time (a webhook in), and one command center with one pause.
