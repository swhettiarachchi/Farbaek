# Stage 258: AutoSurvey, road and line labels placed clear of the rest

- **Date:** 2026-11-24
- **Branch:** `feat/stage-257-agreed-reads` (with stage 257).
- **Decision:** ADR 0266
- **Migration:** none. **New dependency:** none.

## Why

The owner's real job, reproduced in production, printed "Road" over a wall's "MW" and "Proposed Drain" over the road's direction words.

## What was built

- **`sheet/draw.ts`:**
  - `placeText`, one text placed at the first of its places that covers nothing;
  - lines' codes, road names and direction words each with a few places, the old one first.

## Verified

- **`sheet/stage258.test.ts`:** three tests; the overlap test fails on the old code.
- **Checks:** the survey and design tests, lint, `tsc --noEmit`, `pnpm build`.
