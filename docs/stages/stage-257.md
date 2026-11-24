# Stage 257: AutoSurvey, three reads of a sketch, and the lot from what they agree on

- **Date:** 2026-11-24
- **Branch:** `feat/stage-257-agreed-reads`
- **Decision:** ADR 0265
- **Migration:** none. **New dependency:** none.

## Why

The owner's real job gave a different lot from one production run to the next: a wall only one of the two reads drew moved the lot to the wrong corner.

## What was built

- **`autosurvey/sketch-merge.ts`:** `mergeSketchReads` takes any number of reads, and splits each merged line where the number of reads that drew it changes, marking each with that number.
- **`sketchintel/drawing.ts`:** an optional `reads` on a stored sketch line, checked to 1 to 9.
- **`sketchintel/interpret.ts`:** the lot from the lines at least two reads drew, the wider outline a stray line would make asked about.
- **`server/survey/sketches.ts`:** three reads.

## Verified

- **`stage257.test.ts`:** four tests on synthetic data.
- **Checks:** the sketch, survey and server tests, lint, `tsc --noEmit`, `pnpm build`.
