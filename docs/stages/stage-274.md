# Stage 274: scheduled work on Home

- **Date:** 2026-11-25
- **Branch:** `feat/stage-274-scheduled-on-home`, from stage 273's branch (it stacks on that pull request)
- **Decision:** ADR 0281
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` for the card (a `CardTitle` with the page's own icon, status as one of the thirteen kinds with its words, facts as sentences, no dots or tiles); `premium-app-ui` for restraint (three rows, nothing for a person with no tasks); `ui-ux-pro-max`'s list and feedback checks (one tap target per row, 44px links, status never by colour alone). The owner's direction: simple, like ChatGPT.

## Why

Scheduled tasks run while nobody is looking, and the main screen said nothing about them. A task Farbaek paused sat unseen after one email.

## What was built

- **`core/automation/home.ts`:** what Home shows of a person's tasks and their latest runs. Three rows at most: a task Farbaek paused (with why), then what runs next (soonest first, said as running, due or later), then a task the person paused. The count of the rest, the tasks that are the person's to look at (paused by Farbaek in the last seven days), and the newest run that ended, with its chat when it finished there.
- **`components/scheduled/home-card.tsx`:** the "Scheduled" card on Home, beside Recent tasks. Drawn only for a person who has tasks.
- **`core/realityloop/needs-you.ts`:** Home's "Your turn" card now says "A scheduled task was paused" with the task and the reason, after an agent's question and a change waiting for approval.
- **`components/scheduled/status.ts`:** the status words for a task and a run, in one list for the Scheduled page and Home.
- **`app/app/page.tsx`:** reads the person's tasks (`listHomeTasks`, only the columns Home shows) and their latest thirty runs as them, beside Home's other reads; the demo shows its labelled samples.
- **`core/automation/tasks.ts`:** `BY_FARBAEK`, the one lead every reason starts with when Farbaek pauses a task.

## Verified

- **Tests:** `home.test.ts` (19) and `needs-you.test.ts` (15, one new). With the other automation and Scheduled page tests, 123 in that run; the design tests and the rest of Home's rules, 504.
- `tsc --noEmit` with a 4 GB heap, and lint on the changed files.
- **In a browser, the demo workspace's Home,** at 375 and 1280 px, light and dark: the card with two tasks to run and one paused, and the last run. With a temporary sample (removed) of a task paused by Farbaek: its row first with the reason, and Home leading with "A scheduled task was paused". No console errors, no sideways scroll.
- `qa:responsive --strict` on Home at 320, 375, 768 and 1280 px, in Dark, and at 200% text; `qa:a11y`: no findings.
- **Not verified:**
  - **Real tasks on production.** The card has only been seen with the demo's samples: a real person's tasks, in their own time zone, are the first live check.
  - **A real task paused by Farbaek.** No scheduled run has been made on production yet, so none has been paused there.
  - The "Read the answer" link: the demo's samples have no chat, so the link was not pressed in a browser.

## A fresh review, before the PR

A reviewer read the first version without my notes. It found the rules sound in the ordinary case and eight faults at the edges. All are fixed:

1. **"Next run 12 minutes ago."** A task's next time stays in the past while it waits for the tick, runs, or waits to be tried again. The row now says "Running now" or "Due now".
2. **A "Your turn" that could never clear.** A task paused because the plan allows fewer can't be resumed, so Home would have led with it until it was deleted. A pause now leads for seven days, then stays as a row.
3. **The lead wasn't tied to where it is written.** Four reasons started with "Paused by Farbaek: " by hand. They are built from one constant now, and a test holds each to it.
4. **The last run could be the wrong one, with the wrong chat.** The task's own record isn't updated when a pause or a change closes a run, and the task's chat can be replaced. The last run is now read from the runs, and its answer is linked only while its chat is still the task's.
5. **The card vanished when every task had ended,** as after a one-time reminder. It now stays for a week with the last run.
6. "And 1 more on the Scheduled page" left out ended tasks the page lists: it now says "more scheduled or paused".
7. Tests that were missing: the count of the rest, a skipped last run, a time that has come.
8. Home read every column of up to 200 tasks to show three names: it reads only what it shows.

## Next

- Persistent agents (a name, a goal, a limit, notes of its own, one pause), the largest gap in the briefs; then triggers other than time (a webhook in) and one command center with one pause.
- A scheduled task's answers arriving in the chat it was asked in.
