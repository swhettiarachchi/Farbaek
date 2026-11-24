# Stage 261: AutoSurvey, drafting as practising surveyors draft

- **Date:** 2026-11-24
- **Branch:** `feat/stage-261-fidelity`
- **Decision:** ADR 0269
- **Migration:** none. **New dependency:** none.

## What was built

- **`core/survey/sheet/draw.ts`:**
  - lines along a lot's boundary drawn once and carried on to it (`alongBoundary`);
  - a wall's code written once per straight run (`carriedOn`), outside the lot along its boundary (`outsideOf`), with a small S tick clear of the leg's ends;
  - stubs where a line carries on;
  - wells as plain circles;
  - adjoining words and road directions in lines (`placeLines`, `adjoiningLines`).
- **`core/survey/sheet/texts.ts`:** words along a side outside the lot first, gate words inside, each at three places along it.
- **`core/survey/sheet/compose.ts`:** the `LINES_DRAWN_AS_BOUNDARY` check.
- **`core/survey/sheet/classic.ts`:** the title block spread when the drawing leaves room.
- **`core/survey/document.ts`:** `feature.runsOn`, `settings.wallTicks`, `settings.thinBoundary`, all absent unless used.
- **The sketch:**
  - the reader asks whether a line carries on past its end;
  - `drawing.ts` keeps it for open lines;
  - `sketch-merge.ts` keeps it only on the end pieces;
  - `interpret.ts` and `apply.ts` carry it to the line.
- **`core/survey/export/dxf.ts`:** the stub at the plan's scale. **`core/survey/compare.ts`:** the new settings and stubs named.
- **The editor:** "Drawn on past its ends" in a line's panel; "Walls' codes lettered small, with a tick across the wall" and "Lot boundaries drawn as thin as the other lines" in the sheet's settings.

## Verified

- `pnpm exec vitest run src/core/survey`: every survey test, with `stage261.test.ts` (19 cases) and the updated words test.
- **A fresh review:** two real bugs and four smaller faults, each fixed with a test (ADR 0269, "After review").
  - The label solver now takes a preference order apart from its places' numbering (`labels.ts`), so labels the surveyor dragged never jump.
- The real job laid over the surveyor's print (local harness, never committed): see ADR 0269.

## Next

Stage 262: corners drawn square in a sketch but never surveyed, constructed from the surveyed points.
