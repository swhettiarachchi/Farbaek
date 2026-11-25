# Stage 271: scheduled tasks

- **Date:** 2026-11-25
- **Branch:** `feat/stage-271-scheduled`, from main at #327's merge
- **Decision:** ADR 0278. The automation record is `docs/farbaek/FARBAEK_AUTOMATION_SPEC.md`.
- **Migration:** v106, `20270116090000_scheduled_tasks.sql`. **Applied to production by the owner on 2026-11-25, read-back `check|t`.** It went on after the merge, not before: #328 was live for a while without it, and the Scheduled page said its tasks couldn't be read. Read again signed in after the migration, the page shows "Schedule your first task" with no fault. **New dependency:** none. **New provider:** none.
- **Skills used:**
  - `farbaek-ui` and `farbaek-human-made` for the page (tokens, pills, the thirteen status kinds, sentences for counts, plain words);
  - `premium-app-ui` for the structure (one job per screen, every state designed) and its checklist;
  - `ui-ux-pro-max` for a pre-delivery pass on forms and feedback: two changes came from it (fewer fields up front, the number hint tied to its field). Its search tool needs Python, which this PC doesn't have, so its written checklist was read instead;
  - `ecc-security-review`'s checklist for the SQL functions and the actions;
  - the production-readiness lens (`audit-suite`) for the run's life: restarts, retries, leases.
  - Not used: the taste, image-generation and brand skills the owner named. They are for landing pages, pictures and new visual directions; this page is built from the app's own parts.

## Why

The owner's master brief asks, first, for automation: tell Farbaek what to do and when, and it does it with no page open. The audit named it the largest gap. This is the first stage of it: a scheduler a person can set, and the durable run underneath.

## What was built

- **`core/automation/schedule.ts`:** the repeat kinds, the ends, time zones, `nextRun`, `describeSchedule`.
- **`core/automation/words.ts`:** a schedule read from a person's words, English, Sinhala and Sinhala in English letters, only when the words say one thing.
- **`core/automation/tasks.ts`:** what a task holds, each plan's limits, what a refused turn means, `settle()` (done, skipped, tried again, failed, paused), the plan checked again at run time, six starting points.
- **Migration v106:** `scheduled_tasks` and `scheduled_task_runs` (read by their owner only), eight service-only functions (save, pause or resume, run now, remove, claim, link the conversation, finish, export), a trigger that takes a leaving member's tasks with them, and the timer in the list of background jobs.
- **`server/automation/`:** the store, the headless Chat turn, the runner, the tick's wiring (three at once, each capped at 13 minutes), sample tasks for the demo workspace.
- **`POST /api/internal/jobs/scheduled`,** `farbaek-scheduled.timer` and `scripts/vps/scheduled.sh` (every minute), with the 15-minute sweep starting due tasks too until the timer is on.
- **`/app/scheduled`:** the task list, the form, the starting points, in the navigation (a core page; under More on a phone) and the command palette.
- **Notices:** email and push when a run ends, by the person's own preferences.
- **The download of a person's data** carries their scheduled tasks.

## Verified

- **93 tests, all passing:**
  - `tests/db/scheduled-tasks.test.ts` (22): who reads and writes, limits, versions, the claim and its lease, retries, a dead runner, changes during a run, runs by hand, closed-off runs, a member leaving, the export, and the owner's read-back line for production run against the test database;
  - `words.test.ts` (15), `schedule.test.ts` (14), `tasks.test.ts` (9);
  - `runner.test.ts` (13), `headless-chat.test.ts` (5, through the real Chat turn), `actions.test.ts` (15).
- Every database test against the final migration (683 in 93 files), and the design, ops, navigation, Chat, notice and jobs tests with the stage's own (511 in that run).
- `tsc --noEmit` with a 4 GB heap, and lint on every changed file.
- **In a browser, the demo workspace:**
  - the page at 320, 375, 768 and 1280 px, light and dark, and at 200% text: no sideways scroll, small targets, lost taps or console errors (`qa:responsive --strict`), and no accessibility findings (`qa:a11y`);
  - the form used by hand: "every weekday at 8:30am" and "hamadama udeta" set the schedule as typed; a starting point fills the form and takes the cursor; a number field clears and retypes; the last chosen weekday says why it stays on.
- **Not verified, and why:**
  - **A real run.** No model has been called by a scheduled task yet: that needs v106 on a real database. The headless turn is tested through the real `prepareTurn` with the database and the model standing in. The first live run on production is the check that remains.
  - **Two requests at the same instant.** The limit's lock and the claim's `skip locked` are read and reasoned, not raced: the test database has one connection.
  - **Email and push arriving.** The notifier is called in tests; nothing was sent.
  - **The timer on the server.** The unit files follow the two that run today; they haven't run.

## Two fresh reviews, before the PR

Two reviewers read the code without my notes, one on the server and database, one on the clock maths, the words reader and the screens. Every check had passed before them. They found the faults below, and each is fixed. Where a test can reach the fault, there is one that fails without the fix. The rest were checked by reading, or by hand in the browser: the limit's lock, the sweep's order, the count of runs under way, the indexes, how far back the run list reads, and how the form behaves.

**The one that would have stopped the feature:** the headless turn made the task's conversation first, then sent the question into it with no parent message. The Chat turn refuses exactly that, so every run would have failed before reaching a model, the same way each time, until the task paused itself. The runner's tests had the turn standing in, so nothing ran the real one. The turn now starts the conversation with the question, and `headless-chat.test.ts` runs the real turn.

**Server and database:**
1. A change or a resume while a run was under way freed its lease and was then overwritten by the run's own ending: a schedule changed mid-run was lost, and a second run could start beside the first.
2. The limit on active tasks was counted without a lock, so resumes sent together could all pass.
3. Run now used up a one-time schedule, and counted against "ends after N runs".
4. A one-time task that had run could never be given a new time; the reason shown was false.
5. A member removed from a workspace kept live tasks there that they could no longer see, stop or export.
6. Plan limits were checked only on save and resume: a trial's twenty hourly tasks would have outlived the trial.
7. One failed call to record an outcome meant the whole run was made again.
8. Outcomes sorted the wrong way: Farbaek's own daily limit was retried and counted against the task; an answer still being written in the conversation failed outright; a full conversation failed every run from then on.
9. The sweep claimed due tasks before its own work, with the lease running meanwhile.
10. The count of runs under way could be passed by two ticks at once, and could stick if a run never settled.
11. A task paused for an unreadable schedule told nobody.
12. No index for the clear-out of old runs or for a person's runs.

**Clock maths, words and screens:**
13. The words reader took the subject for the schedule in many ordinary sentences: "in 5 minutes or less", "thus", "sats", "the sun's", "the top 10 may be", "Saturday's weather", "my monthly budget", "what happened on 5 March". It was rewritten to read a schedule only where the words say one, and nothing when they say two. Every sentence the review listed is a test.
14. Ranges ("Monday to Thursday") read as their two ends; "except Sunday" read as Sunday only; a second time or day was dropped silently.
15. The part of the day was taken from anywhere in the sentence ("last night's game" made 8 into 8 PM), and night with 12 gave noon.
16. A time that was said was dropped when the sentence carried on after it, and the screen then said none was given.
17. A date's year was ignored, and 29 February could land on 1 March.
18. Sinhala "අද" matched inside longer words, and amounts ("5ට වැඩි") read as times.
19. The run list was the latest hundred rows across all tasks, so a weekly task's runs vanished behind an hourly one's.
20. A run whose server stopped read as "Running now" for ever.
21. The form's clock was fixed when the page opened; number fields fought the typing; the last weekday did nothing when pressed, without a reason; a saved task's schedule carried into the next; a pasted page break was called "too long".
22. Hourly tasks on Lord Howe Island ran off their minute twice a year; a date such as 31 February passed the schema; a bare offset passed as a time zone.
23. Smaller: a warning icon on a normal ending, a title cut through an emoji, an answer link to a conversation since replaced, a scroll that ignored reduced motion, sample runs that disagreed with their own tasks.

**Found and left, said in the ADR:** a turn cut off by a restart leaves its usage reservation unsettled (Chat's own behaviour, for Chat and scheduled runs together); a model's refusal is retried like any failed answer; a schedule edited mid-run can make one run more than its count allows.

## For the owner, before and after the merge

1. Done: v106 is on production (`check|t`, 2026-11-25).
2. Done: #328 is merged and live (build `bc473b7cb6bb`).
3. **Once, on the server:** `sudo bash /opt/farbaek/app/scripts/vps/install.sh --enable-scheduled-timer`. Without it tasks still run, up to 15 minutes late.
4. **Then the live check:** schedule one task a few minutes ahead, and read its answer in Chat.

## Next

In the order the brief's weight suggests, hardest first:
- **Triggers other than time:** a signed webhook in, so something outside can start a task.
- **Persistent agents:** a goal, a budget, memory of their own, pause, resume and stop, on this stage's claim and lease.
- **A command center:** what is running, waiting, failed and needs approval across builds, workflows and scheduled runs, with one pause.
- **Creating a task from inside Chat** ("do this every morning"), with the same words reader and a confirmation.
- **The unsettled reservation after a restart,** for Chat and scheduled runs together.
