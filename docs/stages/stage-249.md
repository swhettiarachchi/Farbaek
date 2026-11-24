# Stage 249: AutoSurvey, a misread number corrected in one press

- **Date:** 2026-11-24
- **Branch:** `feat/stage-249-sketch-corrections`, on main after #311, with the v105 fix (#312).
- **Decision:** ADR 0257
- **Migration:** none (the corrections are part of the plan's JSON). **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: a correction names a surveyed point and never a position, the reading stays as read, and nothing the surveyor confirmed changes;
  - `farbaek-ui` and `farbaek-human-made` for the card and the button.

## Why

The owner asked for the feature to be finished so a surveyor gets a complete plan in a few clicks. Stage 247 found the misread number on the owner's real job (the upside-down 20 read as 10) and asked about it, but answering meant editing the lot by hand on the Lots step. A surveyor who can see the 20 on their own sketch should be able to say so in one press.

## What was built

- **`core/survey/sketchintel/correct.ts`:**
  - `correctedDrawing` and `correctedReadings`: the sketch as the engine reads it, each corrected number replaced on its own photo;
  - `redrawFromCorrection`: what the sketch drew from the number before and doesn't propose after is taken off if it's still waiting, what it proposes now is put on, and anything confirmed or edited is kept and named.
- **The sketch record** keeps `corrections` (the photo, the number as read, the number it is, who and when; at most 50). A browser save keeps them; a new read starts without them.
- **The engine** reads with the corrections everywhere it reads the sketch: the interpretation, the checks, the "Needs you" list and the sketch report.
- **A suggestion on the question:** when a number is written where another point would be and that point's own number isn't written, the question carries "it's that point".
- **`correctSketchNumberAction`:** checks the request, the version and the photo; the number it becomes must be exactly one surveyed point, and the number corrected must be read on that photo. A corrected number can be corrected again, and corrected back to what was read the correction goes. The result is a new version with a note saying what was corrected.
- **The lot's card in "Needs you":** what the sketch shows, one fact a line; the open questions apart, each with its warning icon; then "It's 20: use 20 for the 10 read" as a button. It says what it took off, what it put on and what it left because the surveyor had confirmed it.
- **The sketch report** lists the corrections as the surveyor's, on the page and in its Markdown.

## A fresh review, and what it changed

A review agent found eight real faults. All are fixed, each with a test.

1. **A correction put back items the surveyor had taken off,** even ones the corrected number has nothing to do with. Only what the corrected sketch proposes and the uncorrected one didn't is put on now.
2. **The plan's checks read the readings uncorrected,** so a distance written between 3 and the misread 10 still held approval after the correction, while the report said it agreed. `checkSketch` reads with the corrections now, keeping each answer's key; the sketch panel says when a reading was checked with a corrected number.
3. **Two numbers swapped on a photo could never be corrected:** the second press undid the first. The press now names its reading by id and corrects that reading's own number, never one an earlier correction produced.
4. **The result was lost with the redraw,** and with it the warning that a confirmed item still used the misread number. It's said above the "Needs you" list now, and the version's note names what was left.
5. **The sketch's lot could go with nothing in its place** when the plan also had a lot drawn by hand. The corrected lot now replaces it.
6. **"10." or "010" written beside a "10" wasn't corrected with it.** Numbers are matched as the engine matches them; letter case is kept.
7. **A button could be offered that could only be refused,** when two surveyed points share the number. It's offered only for exactly one.
8. **One number could hold two corrections.** One per number on a photo now.

My own look at the card changed two things: the question said "correct the plan on the Lots step" right above the one-press fix, and its icon was the orange warning, which is for real warnings only. The question now points to the press, with the blue question mark that means "your turn".

## A fault in stage 248, found here

The full database suite wouldn't load: v105 (office profiles, merged in #311) opened one function's body with `as $` instead of `as $$`, a character lost in stage 248's review fixes after its database tests had passed. Production was never touched (one transaction, stopped at the error; the read-back shows v105 not applied). The fix is its own PR (#312), with the new hash in the line that applies it; this branch is built on it. The read-back script checks v104 and v105 now.

## Verified

- **`sketchintel/correct.test.ts`:** a number replaced on its own photo only, in lines, symbols, areas and readings, the newest correction winning; the wrong line and lot taken off and the right ones put on, waiting; a confirmed lot never changed, and named; a plan the sketch didn't draw left alone; and the review's faults: nothing taken off put back, the lot replaced beside a hand-drawn one, a swap, "7.", "07" and "7" alike but not "A7", and the plan's checks reading the corrected number.
- **`app/survey/sketch-correct.test.ts`** (the server action with the database standing in): the redraw and the recorded correction, with the reading kept as read; correcting again and back; a swap in two presses; refusals for a number that isn't one surveyed point (none, or two), a reading not on the photo, a photo not on the plan, no change, a stale version and a control character; a confirmed lot kept, said so, and named in the version's note.
- **`sketchintel/placement.test.ts`:** the suggestion is offered only when the other point's number isn't written there too, exactly one point has the number and the reading is known, and reaches the lot's card.
- **In the browser** (dev demo, with a synthetic sketch put on the Sample for the look and removed after): the lot's card at 1280 in light and 375 in dark, the evidence as a list, the question in blue, the button off in the read-only demo with the reason at the top, no sideways scroll.
- **The owner's real job** (local only, never committed): the production reader's third read's lines, with 10 corrected to 20, draw the lot through 20 at 125.84 m² (112.26 before), and the crossing question goes. The rest of the difference from the surveyor's 132.70 m² is the 14 read on the west wall, still a question.
- **Checks:** Survey Studio's tests with the design tests (1,072), the database suite (661 in 92 files), lint on the survey code, and `tsc --noEmit` with a 4 GB heap.

## Not done, and why

See ADR 0257:

- corrections of other readings (distances, names, a line's style);
- learning from corrections, kept apart as suggestions until approved;
- carrying corrections to a new read of the same photos.
