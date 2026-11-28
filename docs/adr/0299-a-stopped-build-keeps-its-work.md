# ADR 0299: A build keeps its work when the server stops under it

- **Status:** accepted (stage 291, the Farbaek program, 2026-11-27)
- **Builds on:** ADR 0022 (an agent's run lives in the server's process), ADR 0040 (a run that reaches its cap keeps its work so far as a partial change), ADR 0027 ("Keep going" carries on from a run that ended), ADR 0083 (the workspace's pause), ADR 0032 (Office Space pauses AI and suspends workspaces), ADR 0279 (usage a restart left reserved is given back).
- **Changes:** how a live agent build ends when the server stops under it, and what a build stopped by a pause says. No migration, no new dependency, no paid service.
- **Part of:** the briefs' durable execution (A12, B6), for agent builds; item 2 in the order of work.

## Context

An agent's build runs inside the web server's process for up to 40 minutes. Production restarts that process on every deploy, and a deploy follows every merge: several a day. A build that was under way was simply lost. Nothing of what it had changed was kept, an hourly sweep later marked it "interrupted", and the person was told to start a new run.

Everything needed to keep the work already existed. A run that reaches its usage cap or a limit ends by writing what it changed so far as a partial change for a person to review, and the task then offers "Keep going", which starts a new run from it (ADR 0040, ADR 0027).

A pause had a different fault. Pausing agents stops live builds at once. The note written into each run said "Your work so far is kept", and the run then ended "Cancelled. Nothing was suggested."

## Decision

**A build that the server stops under ends the way a build that reached a limit does: its work so far is kept as a partial change, and it says why it stopped.**

- **What is kept is a change to review, never an applied one.** It goes through the same checks as any change the agent suggests, so one that leaves the plan is stopped as before, and then says so instead of saying to apply it. Nothing applies by itself.
- **When nothing was changed yet,** the run ends as interrupted, not failed, and says there was no work to keep and to start it again. Whatever waits on the run (a workflow's step) is settled at once, not at the next sweep.
- **When the server is told to stop,** it stops every live build and waits for each to write its change and how it ended (`drainCloudRuns`), for at most 20 seconds. A run that was already writing its end is waited for too. Production kills the container 30 seconds after the signal.
- **The exit is held while that happens** (`src/server/lifecycle/shutdown.ts`). Next.js answers the stop signal by closing its listener and calling `process.exit`, which with nothing in flight is within milliseconds. When a signal arrives and there is work to wait for, that exit is held until the work has drained or the time is up, then happens with the code that was asked for. With nothing to wait for, which is nearly every deploy, nothing is changed at all.
- **It is installed once, when the server starts,** in production only (`src/instrumentation.ts`). If it can't be set up, the server starts and runs as it did before, and says so in its log.

**A pause or a suspension does not keep the work, and now says so.**

- While a workspace's agents are paused, the database takes no change from an agent (ADR 0083); a suspended workspace takes no change at all (ADR 0032). A pause is an emergency stop, often pressed because of what an agent was doing. So a build stopped by one suggests nothing, as before.
- What changed is the words. The run's note and its outcome say what stopped it (AI work was paused, or the workspace was suspended) and that nothing was suggested. The untrue "Your work so far is kept" is gone.
- **A person's own cancel is unchanged:** nothing is suggested. A restart or a pause that lands while a cancelled run winds down doesn't change that.

## Consequences

- A deploy during a build no longer loses the build's work. The person finds a partial change waiting, with "Farbaek's server restarted while this run was working", and carries on with Keep going.
- A deploy that lands during a build takes a few seconds longer to stop the old server: the time it takes to write the change, and never more than 20 seconds.
- **A server that dies without being told** (a crash, the kernel ending it, a power cut) still loses the build's work, as before. The hourly sweep marks such runs interrupted.
- **Found and left for its own change:** the database's rule that refuses an agent's change while agents are paused does not catch a build's own change, because the build's mark is put on the row just after it is inserted. Nothing in the app writes one during a pause, since paused builds suggest nothing; a build that finishes by itself in the same second as a pause could. Closing it is a migration.
- **Not yet:**
  - a build that carries on by itself after a restart. That needs its conversation and its files written down as it goes, a lease like scheduled runs have, and a way to work as the person without their session: a migration and its own stage;
  - workflows: a step whose build the server stops under ends as it does when a limit stops it, with its partial change waiting for review. A step that had changed nothing still fails its workflow, as before. A workflow does not carry on by itself after a restart;
  - an email for a run that ended interrupted with nothing to keep;
  - Chat answers, images and videos in flight at a restart.

## Verified

See `docs/stages/stage-291.md`.
