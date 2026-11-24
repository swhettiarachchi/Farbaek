# Stage 246: AutoSurvey, doubt where it's real and crossings asked about

- **Date:** 2026-11-24
- **Branch:** `feat/stage-246-doubt-and-crossings`, from main after #308, with stage 245's notes on the production reads.
- **Decision:** ADR 0254
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio` and its field-sketch reference: turned numbers, how surveyors' lines meet;
  - `farbaek-ui` and `farbaek-human-made` for the report's two groups.

## Why

The production reader read the owner's real sketch with stage 245's guidance (stage 245's notes). It kept its doubts as intended, and tied the two disputed tapes to their sides. But it doubted 41 of 46 readings, mostly numbers written turned, and it read an upside-down 20 as 10, a number the survey also has. The owner's go covers reading the sketch again once this is live.

## What was built

- **The reader** (`sketch-reader.ts`):
  - a turned number isn't in doubt for being turned;
  - turned round, a 2 looks like a Z and a 7 like an L;
  - doubt only when the other reading is another plausible number, never a letter.
- **The report** (`sketchintel/report.ts`, `components/survey/sketch-report.tsx`):
  - each uncertain item is ranked: the survey's disagreements first, then doubtful readings nothing confirms, then lines read with doubt;
  - doubtful labels and notes, and numbers the survey has as read, are folded away as "Also read with doubt";
  - the count of what needs the surveyor leaves the folded ones out;
  - the Markdown has the same two groups.
- **The engine** (`sketchintel/interpret.ts`, `crossesAway`): two drawn lines crossing in the survey through both their insides, more than 0.10 m from every end, are asked about, at most five times. The line read with doubt is named, and confirming or removing it answers the question.

## A fresh review, and what it changed

A review agent found three real faults and three smaller ones. All are fixed, each with a test:

1. **A point lying on the other line counted as a crossing:** a house wall built along the boundary, its ends a centimetre either side of it. No end may now lie within 0.10 m of the crossing or of the other line. The on-line tolerance (0.25 m) was tried and dropped: on the real job, the misread end 10 lies 0.26 m from the junction 9, and the wrong wall crosses the fence 0.24 m from 9, so it would have hidden the very case this is for.
2. **A doubtful point number the survey has was folded away.** For a point, "agrees" means only that the number exists, and the incident itself was a misread number that exists. Doubtful point numbers now stay in front. Only measurements the survey agrees with exactly as read are folded, with the labels.
3. **The summary could say nothing needs the surveyor while the engine had questions open.** It now counts them, and the questions have their own open card, after what needs the surveyor.

The smaller ones:

- **A question that vanished:** where the plan already had the same line, the sketch's copy was never added, so the question looked answered. Confirming the plan's own copy now answers it, and the surveyor's own line already does.
- **Work at a drawing's limits:** each line's legs are now built once, lines whose boxes are apart are skipped, and the work is capped.
- **A line read twice** is asked about once.
- **Dashed lines** (roof edges, proposed lines) are left out.
- **The prompt's examples:** only numbers whose digits are all 0, 1, 6, 8 or 9 read as another number turned round, so the examples are those.

## Verified

- **`sketchintel/stage246.test.ts`**, on synthetic points:
  - a crossing is told from a shared end, a touch, a point on the other line and a near-miss 5 cm from an end;
  - a wall read to the wrong number is asked about, with the line read with doubt named;
  - lines meeting only at their numbers raise nothing;
  - at most five crossings are asked about;
  - the report's ranking and its quieter group;
  - the reader's guidance.
- **The owner's real job, locally:**
  - the hand reading raises no crossing, and the lot and lines are unchanged;
  - the production read's lines, run through the engine, ask about the misread wall 18 to 10, which crosses the fence 9 to 15.
- **Checks:** the full `pnpm test` (4,716 passed; the only two failures were these tests caught mid-edit, since passing), then the survey, reader, app and design tests after the review's fixes (1,078); `pnpm typecheck`, lint, and `pnpm build` with a 4 GB heap.
