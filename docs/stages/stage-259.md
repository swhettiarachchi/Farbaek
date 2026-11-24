# Stage 259: AutoSurvey, corners without circles, and lot letters off the drawing

- **Date:** 2026-11-24
- **Branch:** `feat/stage-259-sheet-marks`, on stages 257 and 258.
- **Decision:** ADR 0267
- **Migration:** none. **New dependency:** none.

## Why

The owner's real job, drawn by its surveyor, has neither circles at the corners nor the lot's letter on the drawing.

## What was built

- **The sheet's settings:** `noCornerCircles` and `noLotLetters`, optional.
- **The sheet:** both layouts honour them. **The DXF:** leaves the letters off with the sheet.
- **The Sheet tab:** "Circles at the lots' corners" and "Lot letters on the drawing".
- **Comparing versions:** says when either changes.

## Verified

- **`sheet/stage259.test.ts`:** three tests.
- **Checks:** the survey, design and component tests, lint, `tsc --noEmit`, `pnpm build`.
