# Stage 262: AutoSurvey, square corners a sketch draws that nobody surveyed

- **Date:** 2026-11-24
- **Branch:** `feat/stage-261-fidelity`, carried by the same pull request as stages 257 to 261
- **Decision:** ADR 0270
- **Migration:** none. **New dependency:** none.

## What was built

- **`core/survey/construct.ts`:**
  - the square corner;
  - the line it's squared to;
  - resolving corners into points;
  - stable ids;
  - inserting a corner and rebuilding corners after an edit.
- **`core/survey/document.ts`:** `constructed`, absent until used. `usedPointIds` counts a corner as its recipe's surveyed points; there's also `drawnPointIds` and `pruneConstructed`.
- **`core/survey/view.ts`:** corners resolved for the sheet and the checks; lots from surveyed points only.
- **`core/survey/qc.ts`:** `CONSTRUCTED_CORNERS` (warning) and `CONSTRUCTED_CORNER_MISPLACED` (error).
- **The sketch:**
  - the reader writes `corner` (`sketch-reader.ts`, `drawing.ts`);
  - `sketch-merge.ts` counts corners per segment across reads;
  - `interpret.ts` makes a corner proposal or a question;
  - `apply.ts` puts the corner into the lines that read added.
- **The save and the export:** the save prunes corners, and refuses one with a surveyed point's id. The DXF draws them. `compare.ts` names corner changes.
- **The editor:**
  - a line's points show and take `corner`;
  - every edit rebuilds or removes corners whose neighbours changed.

## Verified

- `construct.test.ts`, `sketchintel/stage262.test.ts` and `components/survey/corners.test.ts`: 28 cases, with the fixes from a fresh review (ADR 0270, "After review").
- The survey, editor, design and survey-action tests.
- The real job, end to end and laid over the surveyor's print (local only): see ADR 0270.

## Next

- **Live:** once merged and live, read the real job's sketch again in production and check the reader writes `corner` for the well box.
- **Owner's questions:**
  - whether the S ticks on the house's walls without a code on the print mean those are masonry walls too;
  - whether a long wall's code is written twice on purpose.
