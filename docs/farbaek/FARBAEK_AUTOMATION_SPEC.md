# Farbaek automation

What the owner's brief asks of automation, what exists today, and what comes next. A line says "built" only when it has a test or a look in a browser behind it; the stage and the ADR are named so the claim can be checked.

Last updated: 2026-11-25 (stage 273).

## What the brief asks for

Tell Farbaek what to do in plain words, and it does the work by itself: on a schedule or when something happens, with retries, no double runs, saved progress, pause and resume, a history of every run, an audit trail, and a cost a person can see and limit.

## Where each part stands

| Part | State | Where |
| --- | --- | --- |
| A task written in plain words | Built. The instruction is what a person would type in Chat | `/app/scheduled`, ADR 0278 |
| A schedule read from those words | Built for English, Sinhala and Sinhala in English letters, as a prefill the person confirms. Tested code reads it; no model | `src/core/automation/words.ts` |
| Schedules: once, hourly, daily, weekdays, chosen days, monthly; an end date or a number of runs; a named time zone | Built, with clock changes and month ends tested | `src/core/automation/schedule.ts` |
| Runs without a page open | Built: the Chat turn made on the server as the person | `src/server/automation/headless-chat.ts` |
| No double runs (idempotency) | Built: one run row for each due time, claimed under a lease in the database | Migration v106, `tests/db/scheduled-tasks.test.ts` |
| Retries | Built: twice more, 2 and 10 minutes later, only for trouble that may pass | `settle()` in `src/core/automation/tasks.ts` |
| A task that keeps failing | Built: paused after five due times in a row, with the reason on it | The same |
| A server that stops mid-run | Built: the lease runs out and the due time is claimed again | Migration v106 |
| Pause, resume, run now, change, remove | Built, each through a service-only function that checks the person. A change made while a run is under way is kept; Run now is apart from the schedule and isn't counted as one of its runs | `src/app/app/scheduled/actions.ts`, migration v106 |
| History of runs | Built: each run's time, how it ended, why, and a link to its answer | `scheduled_task_runs`, the task's card |
| Told when it has run | Built: email and push, by the person's own preferences | `scheduledFinished` in the notifier |
| Cost | Each run draws on the plan's AI usage as a Chat message does, and stops when it runs out. Plans limit how many tasks are active and how often they run, checked when a task is saved and again when it runs, so a trial that ended or a smaller plan pauses what it no longer allows | ADR 0020, `SCHEDULED_LIMITS`, `planProblem()` |
| One pause for everything | The platform's AI pause stops runs being claimed. A person pauses a task on its card. There is no single pause across builds, workflows and scheduled runs yet | Stage 217 |
| Triggers other than time: a webhook in, a file, an email | Not built | Next in this order |
| Tasks that do more than answer: build, make an image or a video, act on a computer | Not built. A run is a Chat turn | After triggers |
| Persistent agents: a goal, a budget, memory of their own, pause, resume and stop | Part 1 built (ADR 0282): an agent is a name, a goal, a schedule and a limit on its runs in any 30 days; one scheduled task does its work; each finished run leaves a note of what it did and what it does next, which the next run is given and the person can read and clear; a switch for the person's memory; pause, resume, work now, remove. It answers and researches only. Not built: a budget in AI usage, tools, more than one piece of work, talking to it with its goal in mind | Stage 275. Tools and budgets: later parts |
| Saved progress inside one long run (checkpoints) | Not built for scheduled runs. Workflows have checkpoints between steps (ADR 0092) | With persistent agents |
| Creating a task from inside Chat | Built: a request said with a time ("send me the AI news every morning at 8") is answered, and a chip under the answer offers to schedule it. The rule for when to offer is measured on 149 written messages. The task keeps its own chat; its answers arriving in the chat it was asked in is not built | ADR 0280, `src/components/chat/schedule-offer.tsx`, `src/core/automation/offer.ts` |
| A command center: running, waiting, failed, needs approval | A first piece: Home shows a person's scheduled work in one card (what runs next, what it last did, anything paused) and leads with a task Farbaek paused (ADR 0281). One place for every agent, with its own pause, cost and history, is not built. The operator sees the tick in Office Space's jobs list | Stage 217 |
| An audit trail a person can read | The task's runs are its record. Changes to a task are versioned but not listed for the person yet | With the command center |
| Cost shown per task | Not built. Usage is on Billing, with every other use | With the command center |

## How a run happens

1. Every minute the server's timer calls `POST /api/internal/jobs/scheduled` with the scheduler's secret, from inside the app container. Until that timer is switched on, the 15-minute sweep makes the same call.
2. The app asks the database for due tasks, up to the room it has (three runs at once). The database locks each, gives it a 15-minute lease and makes or reuses the run row for that due time.
3. The owner's plan is read, and a task it no longer allows is paused with the reason. Otherwise each claimed run becomes one Chat turn as the task's owner, in the task's own conversation, with a ten-minute limit. The turn checks that the person is still in the workspace with a role that may use its AI. The model is told, beside the instruction, that this is a scheduled task due now, so "remind me…" is answered as the reminder (ADR 0280).
4. The outcome is settled by tested rules: done, skipped (it wouldn't work if tried again), tried again later, or failed. The task's next time is worked out from its schedule and stored with the outcome in one database call, which refuses a stale attempt and leaves a task alone that its owner changed meanwhile. A call that fails is made again.
5. If the person asked to be told, the notifier sends its email and push.

## Limits by plan

| Plan | Active tasks | Hourly schedules |
| --- | --- | --- |
| Free | 1 | No |
| Lite | 2 | No |
| Maker | 3 | No |
| Starter | 5 | No |
| Plus | 10 | Yes |
| Pro | 20 | Yes |
| Studio | 30 | Yes |
| Max | 50, 75 or 100 by size | Yes |
| Enterprise | 100 | Yes |

These are the code's values today (`SCHEDULED_LIMITS`). They follow the current catalog; when the owner decides the new prices (stage 218), the limits move with the plans.

## What the owner does for it

- Apply migration v106 and read it back before the pull request is merged.
- Switch the every-minute timer on once: `sudo bash /opt/farbaek/app/scripts/vps/install.sh --enable-scheduled-timer`. Without it, tasks still run, up to 15 minutes late.
