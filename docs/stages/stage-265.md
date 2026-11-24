# Stage 265: AutoSurvey, dimension lines, and words with their own size and angle

- **Date:** 2026-11-24
- **Branch:** `feat/stage-265-dimensions`, on stage 264's
- **Decision:** ADR 0273
- **Migration:** none. **New dependency:** none.

## What was built

- **`core/survey/sheet/dimensions.ts`:** dimension lines on the sheet, in both layouts. **`export/dxf.ts`:** the same in the DXF, with words' size and angle.
- **`core/survey/document.ts`:** `dimensions`, and `size` and `turn` on words. **`qc.ts`:** `DIMENSION_MISSING_POINTS`. **`compare.ts`:** dimension changes.
- **`sheet/texts.ts`:** words drawn at their own size and angle.
- **`components/survey/dimension-editor.tsx`:** adding a dimension, and its panel. **`point-editor.tsx`:** the words' size and angle.

## Verified

- `sheet/stage265.test.ts` (8 cases, with the fixes from a fresh review), with the survey, editor, design, survey-action and server tests, and lint.

## Not verified yet

- The panels in a browser. The demo's Sample is read-only, so it waits for the live site after the merge.
