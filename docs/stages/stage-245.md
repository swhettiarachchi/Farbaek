# Stage 245: AutoSurvey, the sketch interpretation report

- **Date:** 2026-11-24
- **Branch:** `feat/stage-245-sketch-report`, from `feat/stage-244-deed-extent` (PR #307)
- **Decision:** ADR 0253
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`, with its new reference on reading field sketches (`references/survey/field-sketches.md`, local to the skill): what each number on a sketch is, where it sits and how to tell them apart;
  - `farbaek-ui` and `farbaek-human-made` for the report page: status as words with their icon, no chips for facts, phone first.

## What the owner asked

A licensed surveyor's instructions, through the owner:

- **Read the sketch as a surveyor does.** Tell point numbers from side measurements, dimensions, notes and feature references.
- **Record each number fully:** its text, place on the image, side, meaning, confidence, source and whether the survey confirms it.
- **Look closely at the numbers 3 and 4 on the left side,** which weren't clearly visible when measured.
- **Give a separate report,** with what's uncertain kept apart and out of the geometry.

The surveyor also said the line 12, 9, 6, 4, 3 is the house wall.

## What was built

- **The reader** (`sketch-reader.ts`, `autosurvey/sketch.ts`):
  - each reading says whether it was read clearly, what's in doubt, and where on the photo it's written;
  - the prompt says how surveyors place numbers;
  - a new kind, `dimension`;
  - uncertain writing is kept as a reading with its doubt, no longer dropped.
- **Safe keeping:**
  - a doubt makes a reading uncertain;
  - a doubt with invisible characters isn't kept;
  - a place off the photo is dropped;
  - a clear reading keeps its old shape.
- **Never a fact:**
  - a doubtful road reading doesn't name or size a road;
  - a differing doubtful reading says so in the plan's checks.
- **The report** (`sketchintel/report.ts`): each side with the numbers beside it, the point numbers, ties and dimensions, other writing, and what's uncertain listed apart. "How sure" follows one fixed rule. A Markdown form is kept for a job's file.
- **The page** `/app/survey/<project>/sketch-report` (`components/survey/sketch-report.tsx`):
  - what needs the surveyor comes first, with the photo and a ring where the writing is;
  - then the sides, point numbers, measurements and writing;
  - linked from the Draft step's sketch card.
- **The real-job runner** writes the report beside its evaluation, with the surveyor's own notes kept apart.

## A fresh review, and what it changed

A review agent read the change after the checks passed and found six real faults and some smaller ones. All are fixed, each with a test in `sketchintel/review245.test.ts`:

1. **A doubtful road name still named the road,** through the area of the same name the reader is asked to give. A name read with doubt now keeps that area from naming the road too.
2. **Doubtful road writing was dropped, hiding conflicts.** It's now counted and never taken:
   - a clear name and a doubtful one differing is asked about;
   - a doubtful name alone draws no road and says why;
   - a lone doubtful width is no longer called missing.
3. **A closed line lost its closing side** in the report. It now has it, as the engine draws it.
4. **The report matched numbers two ways.** Every number in it is now matched one way: leading zeros and letter case said, a number two surveyed points share never compared.
5. **The prompt contradicted itself on arrows.** A dimension is now only between things that aren't numbered points, and one given between two numbered points is compared as a measurement.
6. **The report listed answered questions.** With the plan, it now lists only those the checks still ask.

The smaller ones:

- "none" or "N/A" in the doubt field isn't a doubt;
- a number found only at a symbol points to that symbol's photo;
- the Markdown escapes backslashes and brackets, so no link or image is made from a sketch's writing;
- a doubled full stop;
- "seen but not read" where "couldn't be read for certain" no longer fit;
- dimensions counted as measurements in the checks' summary.

**Kept as designed, for the owner to confirm:** a reading made with doubt that differs from the survey still holds approval until the surveyor keeps the survey's figure or corrects it. A differing tape is worth a look whether or not it was read with doubt, and keeping the survey is one press.

## Verified

- **`sketchintel/report.test.ts`**, on the synthetic job:
  - the reader's doubt, words and place are kept;
  - a place off the photo is dropped, and a doubt makes a reading uncertain;
  - the model is asked for no number but the photo and the place on it;
  - a place on the photo, or a doubtful reading, never changes what's drawn;
  - the plan's checks say a differing reading was read with doubt;
  - the "how sure" rule;
  - measurements go beside their sides, and ties and dimensions apart;
  - every point number is matched and said how;
  - everything uncertain is listed apart, and nothing sure is;
  - nothing is compared before the coordinate system is confirmed;
  - the Markdown has every section, with the sketch's text escaped.
- **In the browser** (dev demo, with a temporary synthetic sketch on the Sample, since removed):
  - the page at phone width and at 1280 px, light and dark, with no sideways scroll;
  - the rings sit where the positions say;
  - the link from the Draft step works.
- **The owner's real job, locally,** with the sketch read again by hand in the new format:
  - the house wall 12, 9, 6, 4, 3 is drawn in full;
  - 3, 4, 6 and 9 are recorded as read with doubt, each with where it sits;
  - 1.43 and 1.58 are shown beside their sides, differing from the survey by 1.50 m and 0.40 m;
  - the lot (132.70 m²) is unchanged.
- **Checks:**
  - the full `pnpm test` (4,701 passed, before the review's fixes), then the sketch, survey-reader and design tests after them (437);
  - `pnpm typecheck` and lint;
  - `pnpm build`, run with `NODE_OPTIONS=--max-old-space-size=4096` as the Dockerfile builds. The type check now needs about 2.4 GB, more than Node's default heap on the 8 GB dev PC (2.24 GB), so a plain local build or typecheck can fail for memory alone.

## The production reader on the real sketch (2026-11-24)

With the owner's consent, the real job was run through Generate Plan in production, in the owner's own workspace: the SDR and the sketch photo, read by the live reader (stage 244's prompt; Sonnet 5.5, the floor for sketch reading on the Free plan).

- **What it read:**
  - 18 point numbers, all in the survey;
  - the walls along the west, south and east sides, with MW;
  - two crossed lines read as fences, and two lines with nothing written along them;
  - 1.58 and 1.43, without their ends. It listed "the ends of distances 1.58 (near 3/4) and 1.43 (near 6)" as uncertain: the same doubt the surveyor raised.
- **What it left out:** the corners it couldn't read for certain (20 or 02, 21, the numbers along the road, 10, 12 and 13). With them, the north side, so the outline didn't close and **no lot was found**. The hand reading in the new format finds the lot.
- **Why it matters:** this is the cost of the old rule, to leave out anything not read for certain. Stage 245 keeps such readings, with their doubt, so the outline can close while the doubt stays visible.

**Read again once this stage was live** (build d511322a0df0, the same photo and model, "Read and replace"):

- **Better:**
  - 46 readings (34 before), and 27 point numbers, all in the survey;
  - 1.58 and 1.43 are tied to 3 to 4 and 4 to 6, read with doubt ("ends could be other points"), and shown differing from the survey by 0.40 m and 1.50 m: the surveyor's own concern, now on the page;
  - the house wall is drawn through 2, 3, 4, 6 and 9: the reader saw the short side's upper end meet the south wall at 2, which the survey bears out (3 is 0.112 m from 2).
- **Too much doubt:** 41 of 46 readings came back doubtful, most of them plain numbers written turned ("35 or SE", "1 or a tick"). "For you to decide" listed 47 things, burying the few that matter.
- **A misread number the survey can't catch by itself:** the upside-down 20 was read as "10 or 01". Point 10 exists (on the house wall), so the north wall came out as 18 to 10. 21 was still left out, so the outline didn't close, and no lot was found.
- **Next (stage 246):**
  - **Calibrate doubt:** a number written turned is doubtful only when its turned reading is another plausible number (6 and 9, 12 and 21, 20 and 02), never a letter.
  - **Rank "For you to decide":** what the survey disagrees with, or doesn't have, first. Doubtful numbers the survey confirms go in a quieter group.
  - **Check each line's numbers against the drawing's shape,** so a misread end that lands on another surveyed point is asked about.

## Not done, and why

- **No PDF of the report:** the PDF fonts can't draw Sinhala.
- **A surveyor's own notes about a sketch** have no place in the product yet. The real-job runner keeps them in its own file.
