# Stage 277: a link that starts a task or an agent from another app

- **Date:** 2026-11-25
- **Branch:** `feat/stage-277-run-from-a-link`, on top of stage 276, which is merged
- **Decision:** ADR 0284
- **Migration:** v109, `20270119090000_task_links.sql`. **Apply it before merging.** **New dependency:** none.
- **Skills used:** `ecc-security-review` for the public address and the new functions (the secret only in a header and only as a hash at rest, limits before any comparison, one answer for every kind of wrong, nothing sent back or logged); `farbaek-ui` and `farbaek-human-made` for the fold on the card (mono only for what is copied, a status said in words, a warning with its icon, plain sentences); `ui-ux-pro-max`'s feedback checks (a copy button that says it copied, the reason beside a control that is off, a destructive press confirmed).

## Why

The briefs ask for triggers other than time. A task or an agent could only run at its times or when its owner pressed a button: nothing outside Farbaek could start one.

## What was built

- **Migration v109:**
  - `scheduled_task_links`: one live link for a task, with only the SHA-256 of its secret. Read by its owner, without the hash.
  - `scheduled_task_links.min_seconds`: the least time between two runs the link starts, its plan's when it was made.
  - `scheduled_tasks.link_payload` and `link_due` (what the latest call sent, and the run it queued), `scheduled_task_runs.payload` and `from_link` (what a run was given, and that a link started it).
  - `app_scheduled_link_create`, `app_scheduled_link_revoke`, `app_scheduled_link_fire` (a call: queues a run through Run now itself) and `app_scheduled_run_payload` (for the runner).
- **`core/automation/links.ts`:** what a secret looks like, how much may be sent, how often a link may start a run on each plan, how a run is told about the caller's text (`linkDataLead`) and given it between marks (`linkDataPart`), and what a caller is answered.
- **`POST /api/v1/hooks/<link id>`** (`server/automation/link-call.ts`): the secret from the Authorization header only, a limit by address first, a small body, and one answer for a wrong secret, a stopped link and no link.
- **The runner:** every run that is in time asks whether a call queued it. One that was is told so in the server's note and given the caller's text apart from it, between two lines with a random mark made for that run. If that can't be read the run is tried again, not made without it.
- **A Chat turn made by the server** takes outside text as a part of its own (`data`, 2,200 characters) beside the server's note (6,000).
- **"Start it from another app"** on each task's and agent's card: Make a link (the address, the secret and a ready command, shown once, each with a copy button), Make a new link (it asks first), Turn the link off (never held back by a pause, a plan or a role). A run a link started says so in the list.

## Verified

- **Tests:**
  - `tests/db/task-links.test.ts` (18, on the real migrations in PGlite): who may make, read and stop a link; the hash unreadable from a browser; one live link for a task; a call queuing one run with what was sent; the wrong secret, a stopped link and no link answered alike and changing nothing; the wait between runs, the link's own and the plan's; busy, paused, ended and put-away tasks; an owner who may no longer use AI; a viewer turning their own link off; the text given to the run the call queued and to no later one, a second try given the same, and text left behind dropped; and the owner's read-back line for v109.
  - `server/automation/link-call.test.ts` (18): the secret taken only from the Authorization header, "Bearer" in any case; one answer for every kind of wrong; a caller limited before anything is compared, in memory, its room counted and never passed; a body too large and text too long refused; "try again" when the call couldn't be taken; and that neither the secret nor what was sent is ever sent back or logged.
  - `core/automation/links.test.ts` (13): the secret's shape, the wait for each plan in words, what is kept of what was sent, and that a caller can't end its text early: a line of hyphens, the old fence and a paragraph in Farbaek's voice all stay between the marks.
  - `server/automation/runner.test.ts` (34, six about links), `store.test.ts` (11), `headless-chat.test.ts` (13: the note and the outside text through the real turn, as two parts) and `app/scheduled/actions.test.ts` (36, six about links).
  - The whole unit, design and database suite: 5,328 passed and one failed, a test of live-site checks that counts calls inside one minute and has nothing to do with this change; run by itself it passed. The database tests of links and of the migrations they build on (scheduled tasks, agents): 62.
- `tsc --noEmit` with a 4 GB heap, and lint on the changed files.
- **In a browser, the demo workspace,** at 375 and 1280 px, light and dark: "Start it from another app" on each task's card, with its controls off in the demo and the reason said. No console errors, no sideways scroll.
- `qa:responsive --strict` on both Scheduled tabs at 375 and 1280 px, light and dark; `qa:a11y` on both: no findings.
- **Not verified:**
  - **No real call has been made.** The address was exercised in tests with stand-ins for the database, and the functions in PGlite; no request has gone over the network to a server.
  - **Making a real link and copying its secret:** the demo refuses every change, so the buttons and the panel a new link shows were exercised in tests, not pressed against a real database.
  - **What a model does with what was sent.** The run is told it is data and where it starts and ends; no run has been made with one, and no wording makes a model certain to obey.
  - How the server sees a caller's address behind its proxy. The limit by address is a flood guard only; the secret and the link's own wait are what protect a link.

## A fresh review, before the PR

A fresh agent was given the code, not the conclusions, and asked to break it. Every check had passed before it started. It found eight groups of real faults, all fixed before the pull request:

1. **A caller could speak as Farbaek.** The caller's text was joined to the server's note between two lines of hyphens, so a body containing that line and a paragraph in Farbaek's voice read as the server's own words. It now travels apart, between marks no caller can know.
2. **The text could reach the wrong run.** A scheduled run that claimed first was given what a later call had sent. The database now ties the text to the run the call queued.
3. **A run a link started read "started by you".** It now says "started from its link".
4. **Turning a link off could be refused** by a pause, an unreadable plan or a viewer's role. It no longer asks for any of them.
5. **Two functions took the task's and the link's rows in opposite orders,** which could deadlock. One order now.
6. **The new secret vanished from the screen** when the page couldn't re-read its links, before it had been copied. It stays.
7. **Tests that proved less than they said:** the limiter's bound was assumed, not counted; nothing made a second call after the wait; nothing sent the fence itself.
8. **Smaller:** text over 2,000 characters was cut in silence; "bearer" in lower case was refused; a new link replaced a working one without asking; the command had no note for Windows; a free plan's link could run a task more often than its schedule may.

## Next

- Triggers from inside Farbaek and from connected apps; a signed body; conditions on what was sent.
- An agent's cost shown and capped in AI usage; talking to an agent with its goal in mind; acting from a row of All work.
