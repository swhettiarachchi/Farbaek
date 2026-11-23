# ADR 0244: Generate Plan's stages are timed on the server, and a run cut off after its import can be finished

- **Status:** accepted (stage 235, AutoSurvey part 6 continued, 2026-11-23)
- **Builds on:** ADR 0239 (Generate Plan as a job, schema v102), the owner's AutoSurvey brief §19 (persistent, resumable jobs; measure each stage) and §26 (success metrics: time from upload to draft, processing failures, job recovery)
- **Changes:** what a job records and what its card offers. No migration: the stages are already free-form JSON.

## Context

A Generate Plan job recorded its stages but no times, so the brief's speed target could only be estimated from a lab benchmark (`docs/survey/BENCHMARKS.md`). A run cut off by a restart was shown as interrupted, with advice to redo things by hand. Yet when the cut came after the import, the project already held every file's points.

## Decision

**Each stage is timed on the server.**
- A stage records when it began working (`startedAt`) and, once finished, how long it took (`ms`), from the server's clock as the job advances. The first stage starts when the job is created.
- The job card shows a time beside each stage that has one ("Importing 2 files, 0.4 s"), and the whole run's time once it's finished ("took 4.2 s in all"). Nothing is shown that wasn't measured, and runs from before this have no times.
- Callers that don't give a clock (tests, older paths) record nothing, and the stages read exactly as before.

**Production's times, read by the owner.** `scripts/vps/autosurvey-timings.ps1` reads, in a read-only transaction:
- the last 30 days' Generate Plan runs and how they ended (finished, finished after a cut-off, failed, cut off). With no timer running the sweep yet, a run silent for 15 minutes counts as cut off, as its card shows it;
- the median and slowest start-to-finish times of runs that finished without a cut-off (a run finished later would count the hours it lay stopped);
- each stage's median.

A database test runs the script's own SQL against the migrations, so the two can't drift apart. Its lines go into the benchmarks as production's numbers.

**A cut-off run is finished, where that's honest** (`finishCutOffRunAction`).
- **When:** the run is cut off (marked interrupted, or silent for 15 minutes), its import stage is done, its drawing stage never finished, and the plan is still on version 1, the version the run created it on. A plan saved since (drawn from the Draft step, edited, or drawn by the run just before it was cut off) is never drawn over: the card says there's nothing to finish.
- **What happens:**
  1. The card offers "Finish drawing the plan".
  2. The plan is drawn from the points the project keeps, with the same code list the run would have used and the survey date a file stated (kept with its import since this stage). The save builds on version 1 only, so of two presses at once, one draws and the other is told the plan was just drawn and leaves the record alone.
  3. The run's own record is finished: drawing done or failed and timed as it was drawn now, the sketches skipped with "read them again from the Draft step", and the result marked `finishedLater`, so no start-to-finish time is shown or counted for it.
  4. When that record was closed by the sweep and can't be written any more, a new record says how the run ended, so the card doesn't keep saying "cut off". A write that failed for any other reason adds no second record.
- **What isn't resumed:**
  - **A cut-off import:** files that hadn't arrived exist only in the surveyor's browser.
  - **A cut-off sketch read:** photos aren't kept until they're read (ADR 0240).
  - **The survey date of a run imported before this stage:** its imports didn't keep the date; add it on the Draft step.

  The card says what's left to do.

## Consequences

- The brief's 30-second target can be checked against production's own times instead of a lab number.
- A restart after the import no longer costs the surveyor the drawing.
