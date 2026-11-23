# Stage 229: AutoSurvey, part 6: Generate Plan's work, visible after leaving the page

- **Date:** 2026-11-23
- **Branch:** `feat/stage-229-background`, from `main` (after #292)
- **Decision:** ADR 0239
- **Migration:** **v102** (`supabase/migrations/20270112090000_survey_jobs.sql`): one table, three functions, nothing taken away. **The owner applies it**; `scripts/vps/check-migrations.ps1` reads it back. The code works without it and records jobs once it's applied.
- **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (audit and provenance of each run), `farbaek-ui` (StatusBadge and StatusGlyph kinds, no made-up percentages).

## What was built

- **Schema v102:** `survey_jobs`, which members read and only the server writes through `app_survey_job_start` and `app_survey_job_update`. A finished job never changes. `app_survey_jobs_sweep` marks runs silent for 15 minutes as interrupted.
- **`src/core/survey/autosurvey/job.ts`:** the stages (importing, drawing, reading the sketches or none to read), each advanced as the server reaches it, and how a silent running job shows.
- **`src/server/survey/jobs.ts`:** a tracker that writes each stage and never stops the work if it can't, plus loaders through row-level security.
- **Generate Plan** records its import and draw stages and returns the job.
- **The sketch read** finishes the job's last stage, done or failed, with why.
- **The project page** shows a running, cut-off or recently failed run with its stages, refreshing itself while it runs.
- **The start screen** offers "Open the plan now" while the sketches are read.

## What a fresh review found, and what changed

1. **The v102 read-back broke the whole migration check** (a statement ended one line early). Fixed.
2. **A sketch read that ended early left its job running,** with untrue words for 15 minutes. Examples: the day's limit, a bad photo, a refused request. Every early exit now ends the stage with its reason. A run cut off for any reason no longer blames the server.
3. **"Open the plan now" could pull the surveyor back to the plan later,** from wherever they'd gone. It no longer does once they've opened the plan or left the screen.
4. **A job id wasn't tied to its project.** It now has to match.
5. **A long stage detail emptied the job's stages.** Details are cut to fit.
6. **The sketch stage stayed waiting after a failed draw.** It now starts either way.
7. **A failed sketch read was badged Finished.** It is now "Needs a look".
8. **Each stage's state is read out to screen readers,** and the tests now cover the job writes, another workspace's project and a wrong workspace on update.

## Verified

- **Tests:**
  - 5 on v102 against the real migrations (PGlite), with another workspace refused on start and update:
    - a contributor starts a job that members read and others don't;
    - a stranger and an unknown kind are refused;
    - stages and the end are recorded, and a finished job never changes;
    - neither a signed-in person nor the public can write or sweep;
    - the sweep marks a 20-minute-silent job interrupted and leaves a live one.
  - 4 on the job model: the starting stages, advancing (after a failure too), long details, and a silent job showing as interrupted.
  - Generate Plan's 10 tests, with the job's writes checked: import, draw and done without sketches; running with the sketch stage started when photos follow.

## Not done, and why

- **A cut-off run isn't resumed:** that needs the files and photos kept on the server (part 4).
- **No timer runs the sweep yet;** the page shows a silent run as interrupted itself.
- **The job card wasn't seen with a live job in a browser:** the demo can't save. The card's states are covered by the model's tests.
