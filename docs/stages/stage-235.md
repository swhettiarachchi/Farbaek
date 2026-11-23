# Stage 235: AutoSurvey, part 6 continued: timed stages, finishing a cut-off run, and production's timings

- **Date:** 2026-11-23
- **Branch:** `feat/stage-235-jobs`, from `feat/stage-234-grammar` (PR #297)
- **Decision:** ADR 0244
- **Migration:** none. Stage times go in the job's stages, which are JSON already. **Needs v102** (jobs) on production to record anything, as before.
- **New dependency:** none.
- **Skills used:**
  - `farbaek-human-made`: numbers only when measured, in a sentence;
  - `farbaek-survey-studio`: a resumed run draws only from the points the project keeps, never from anything guessed.

## What was built

- **`src/core/survey/autosurvey/job.ts`:**
  - stages record `startedAt` and `ms` from the server's clock;
  - `tookText` says a time as a reader would;
  - `finishable` decides when a cut-off run can be finished.
- **`JobTracker`** times each stage as it advances, and says whether a write reached the record.
- **`finishCutOffRunAction`:**
  - draws the plan from the project's points for a run cut off after its import, only while the plan is still on version 1;
  - finishes the run's record, marked as finished later, or writes a new one when the sweep closed the old;
  - offers the survey date a file stated, now kept with each import;
  - says the sketches must be read again.
- **The job card:**
  - a measured time beside each stage that has one;
  - the run's total once finished;
  - "Finish drawing the plan" on a finishable cut-off run, off with the reason when the project can't be changed;
  - when the plan has been saved since the run stopped, a sentence saying there's nothing to finish.
- **`scripts/vps/autosurvey-timings.ps1`:** the owner's read-only summary of production's runs and times.

## Verified

- **`job.test.ts`:** stages timed with the clock given and untouched without it, durations in words (never "60 s" or "1 min 60 s"), and the finish rule for every state and for a plan saved since, 7 tests.
- **`generate.test.ts`:**
  - finishing a cut-off run draws the plan and finishes the record, with the drawing timed, the record marked as finished later and the sketches left to read again;
  - the survey date a file stated reaches the drawn plan;
  - a plan saved since the run stopped isn't drawn over, and the record is left alone;
  - of two presses at once, the one whose save is refused leaves the record alone;
  - a new record is made only when the sweep closed the old one, never for a still-running record that couldn't be written;
  - a finished, still-working or half-imported run is refused with nothing drawn.
- **`tests/db/autosurvey-timings.test.ts`:** the script's own SQL, run against the migrations in PGlite, counts a swept run and a quiet one as cut off, counts a run finished later on its own line and keeps it out of the start-to-finish times, and gives each stage's median.

## Review

A fresh review agent read the stage's changes and reproduced five faults in a temporary test, all fixed above:

1. **Two presses at once** left a "failed" record over a plan the other press drew. Now the save builds only on version 1, the press that loses says so and writes nothing, and a new record is made only for a record the sweep closed.
2. **Finishing drew over a plan saved since the cut-off** (re-adding a line the surveyor had removed), because only the job's record was read. Now the plan must still be on version 1, in the action and on the card.
3. **A run finished later had a start-to-finish time of hours** (or of a few milliseconds, for a new record). It's now marked, and neither the card nor the script gives it a total.
4. **The script's "cut off" count was always 0,** since nothing runs the sweep. It now counts a run silent for 15 minutes, as the card does.
5. **`tookText` could say "1 min 60 s".** Seconds are now rounded before minutes are split off.

A sixth, lower: the finished plan lost the survey date the files stated. Each import now keeps it, and the finish offers it.

## Not done, and why

- **A cut-off import or sketch read can't be resumed:** the files and photos it hadn't got yet are only in the surveyor's browser.
- **No timer runs the jobs sweep yet,** as in stage 229. The card treats a run silent for 15 minutes as cut off itself.
- **The job card wasn't seen with a live job in a browser:** the demo workspace can't save.
- **Production's times** wait for the owner to run the script once real plans have been generated.
