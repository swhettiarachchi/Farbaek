# Stage 291: a build keeps its work when the server stops under it

- **Date:** 2026-11-27
- **Branch:** `feat/stage-291-stopped-build-keeps-work`, from stage 290's branch (its pull request, #347, was open while this was built)
- **Decision:** ADR 0299 (a build keeps its work when the server stops under it)
- **Part of:** the briefs' durable execution (A12, B6), for agent builds; item 2 in the order of work.
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `ecc-security-review` (a kept change is reviewed like any other and never applies by itself; a pause still takes no change from an agent; a stop reaches only its own workspace's runs; a log line carries an error's name, never its message); `audit-suite:audit-as-prod-readiness` (what happens on a deploy, on a hang, on a failed write; the exit is never held past its limit; nothing here can stop the server from starting); `farbaek-human-made` for the sentences a run says when it is stopped.

## Why

An agent's build runs inside the web server for up to 40 minutes, and production restarts that server on every deploy. A deploy follows every merge, and there are several a day. A build under way when one landed was lost with everything it had changed, and the person was told to start again.

A pause had a different fault. Its note in the run read "Your work so far is kept"; the run then ended "Cancelled. Nothing was suggested."

## What was built

- **A build the server stops under ends as one that reached a limit does:** what it changed so far becomes a partial change to review, and its outcome says "Farbaek's server restarted while this run was working". The task then offers Keep going, as it already did for a run that reached its cap.
- **When it had changed nothing yet,** the run ends as interrupted, not failed, says there was no work to keep, and settles whatever was waiting on it at once.
- **A stopping server waits for its builds** (`drainCloudRuns` in `src/server/cloud-agent/executor.ts`): each writes its change and how it ended, within 20 seconds. One that was already writing its end is waited for too.
- **The exit is held while they do** (`src/server/lifecycle/shutdown.ts`, installed by `src/instrumentation.ts` in production). With no build under way, which is nearly every deploy, nothing is changed.
- **A build stopped by a pause or a suspension now says what happened:** which of the two stopped it, and that nothing was suggested. It still keeps nothing, because the database takes no change from an agent while either lasts.
- **A partial change that the rules stopped says so,** where it used to say to apply it.

## What a person no longer has to do

- Start a build again from nothing because a deploy landed while it was working.
- Look for work that a paused run said it had kept.

## Verified

- **Tests,** all new unless said:
  - `server/cloud-agent/executor.test.ts` (23, eight new), through the real executor with a scripted model:
    - a build that has edited a file and is told the server is stopping ends with the edit as a partial change, the reason in its outcome and in its history, and nothing applied by itself; by the time the drain resolves, its end is written;
    - one that had changed nothing ends as interrupted, with "no work to keep" and what to do, and what waits on it is settled;
    - a pause, and a suspension, suggest nothing and say which it was; another workspace's build is left alone;
    - a person's own cancel still suggests nothing, and a restart that lands while it winds down doesn't change that;
    - a pause and then a restart: the run says what stopped it first, once;
    - a run already writing its end, which has left the list of live runs, is still waited for;
    - the drain resolves at once with nothing to wait for, and gives up when its time is up;
    - a partial change the rules stopped says so, and doesn't say to apply it.
  - `server/lifecycle/shutdown.test.ts` (7), with a stand-in for the process: nothing is changed when no work is live; the exit is held until the work has drained, then happens with the code asked for; the first code asked for is used, once; a drain that hangs or fails never keeps the server up; it does not exit by itself; it drains once however many signals arrive.
  - The whole suite, run after the last change: 5,645 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed after the last change, with the 4 GB heap.
- **The production server, built and started here** (`next start`), after the last change: it started in 400 ms, answered `/api/health` with 200, and its log carried `shutdown.drain_installed` with the 20-second limit. So the start-up file runs under `next start`, loads the executor and installs the hold.
- **Next.js's own stop handling, read in the installed version** (16.4.5, `server/lib/start-server.js`): on SIGTERM it closes the listener, waits, then calls `process.exit(143)`, and nothing in it exits in the same breath as the signal. `next start` adds no other handler that exits.
- **A fresh review** of the change by a separate agent, after the first checks had passed. It found nothing wrong in the exit hold or the start-up file, and confirmed from Next.js's source that its handler exits only after an await. It found six real things, and they changed the design:
  1. **the first version kept a paused build's work too, and that was wrong.** While agents are paused the database takes no change from an agent, and a suspended workspace takes none at all: the kept change only got through a gap in that rule for a pause, and was refused for a suspension after the run had said its work was kept. A pause and a suspension suggest nothing again, as before this stage, and now say so truthfully. Only the server stopping keeps the work;
  2. a person's own cancel could end up keeping work, if a restart or a pause landed while the cancelled run was winding down: a stop that arrives after their cancel no longer changes how the run ends;
  3. a run that ended as interrupted settled nothing, so a workflow's step waiting on it stayed "running" until the hourly sweep: it is settled at once;
  4. an approval asked for in the instant a stop landed was never answered, so the run never ended and the drain waited out its whole time: it is answered at once;
  5. a run writing its end had already left the list of live runs, so a stop signal in that moment was not held and the final write could be lost: such a run is counted and waited for;
  6. words that were untrue or said too much: "so nothing was lost" (the usage was spent), "for an update" (any restart stops the server), a note that promised the work "is kept" before it was, and "apply it" said of a partial change the rules had stopped. Each now says only what is so.
- One test timed a wait against the clock with a third of a second to spare; it now holds the model call open until the test lets it go.
- **The fixes were checked by the tests, not by a second review.**
- **Not verified:**
  - **A real stop signal.** Windows ends a process outright instead of delivering SIGTERM, so the whole path (signal, hold, drain, exit) has not been run end to end here. Its parts have: the hold with a stand-in process, the drain through the real executor, and the hook installing itself in a production start.
  - **A deploy during a real build on production.** That needs a build under way when a merge lands.
  - **The partial change on a screen,** and Keep going from it after a restart. The path is the one a capped run already takes.
  - **A build in an isolated test space** stopped mid-command by a restart.
  - **An approval asked for in the instant a stop lands.** It is now answered at once instead of never; the window is too narrow to hit in a test without standing in for the loop.

## Next

- After the merge: read the production log for `shutdown.drain_installed`, which needs the owner; then start a build just before a merge and read what it says afterwards, which needs the owner's yes, since a build draws on AI usage.
- The database's pause rule and a build's own change (in the ADR): a migration.
- Builds that carry on by themselves after a restart: the conversation and the files written down as the run goes, a lease like scheduled runs have, and a way to work as the person without their session. A migration and its own stage.
