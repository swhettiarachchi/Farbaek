# ADR 0239: A Generate Plan run is a job with real stages, readable after leaving the page

- **Status:** accepted (stage 229, AutoSurvey part 6, 2026-11-23)
- **Builds on:** ADR 0233 (Generate Plan), ADR 0234 (reading sketches), the owner's AutoSurvey brief §7 (a persistent orchestrator), §19 (background processing, progress events, partial results) and §20 (Screen B: genuine stages, no made-up percentages, leave and return)
- **Changes:** Generate Plan and the sketch read record their stages. Schema v102 adds one table and three functions; nothing is taken away.

## Context

Generate Plan imported, drew and then read the sketches while the start screen waited, and the stages were only on that screen. A server action carries on to the end on the server even when the surveyor leaves, so the work itself was never lost. But anyone arriving at the project, in another tab or after coming back, couldn't see that a run was going, where it stood, or that its sketches had failed.

## Decision

**Schema v102:** a `survey_jobs` row per run.
- **Columns:** the project, who started it, the state (running, done, failed, interrupted), the stages, and the result (where the plan opens, and a message).
- **Who reads and writes:** members read it through row-level security. Only the server writes it, through `app_survey_job_start` and `app_survey_job_update`; a finished job never changes again.
- **The sweep:** `app_survey_jobs_sweep` marks a running job with no word for 15 minutes as interrupted.

**The stages are the work as the server reaches it:**
- importing the files;
- drawing the plan;
- reading the sketches with Claude, or "No sketches to read".

Each is waiting, running, done, failed or skipped, with a sentence of detail. There is no percentage. A failed import skips what was waiting, so the job ends.

**Recording never stands in the way.** A job that can't be started or written (v102 not applied yet, a database hiccup) leaves the plan exactly as before.

**The project page shows the latest run:**
- while it works, with the page refreshing itself every 5 seconds;
- when it was cut off (shown as interrupted after 15 minutes of silence, as the sweep would mark it);
- when a stage failed in the last day.

**The start screen offers "Open the plan now"** while the sketches are read. The read carries on, and the plan's job card shows it finishing.

## What it doesn't do

- **It doesn't resume a cut-off run.** Restarting a run would need the photos and files kept on the server: that is AutoSurvey part 4, originals in storage. An interrupted job says what was saved and where to redo the rest.
- **Closing the tab before the photos have been sent stops the read.** The photos live only in the browser until then.
- **No scheduled sweep yet.** The page shows a silent running job as interrupted itself; the sweep function is there for a timer on the server.

## Consequences

- A surveyor who generates, opens the plan and comes back later sees each stage's outcome, including "Reading 2 sketches with Claude: failed, the AI provider is busy", instead of a plan without readings and no word why.
- **Apply v102 before merging:** `scripts/vps/check-migrations.ps1` reads it back. The code works without it and only records jobs once it's there.
