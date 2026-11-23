# Stage 239: AutoSurvey, curves from PC to PT

- **Date:** 2026-11-23
- **Branch:** `feat/stage-239-curves`, from `feat/stage-238-code-hints` (PR #301)
- **Decision:** ADR 0247
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: tested code works out the curve, no surveyed point moves, a curve that doesn't fit is said, never hidden; checked in an independent DXF reader;
  - `farbaek-human-made`: the reason a curve is drawn straight said in a plain sentence.

## What the owner asked

The AutoSurvey brief's §13 asks field-to-finish to draw curves from the crew's control codes. Since stage 234, Carlson's PC and PT were read and their runs drawn as straight segments, said.

## What was built

- **`src/core/survey/arcs.ts`:**
  - `circleThrough`, worked relative to the first point so grid-sized coordinates keep their precision;
  - `fitArc`: the circle through a run's first, middle and last points, drawn only when every point lies within 2 cm of it (`ARC_FIT_M`, Farbaek's default), in order along it, turning less than a full circle;
  - `chordsAlong` and `densify` for the sheet, `bulges` for the DXF.
- **The document:** a line's curved runs as `arcs: [{ from, to }]`, absent when it has none, so a plan without curves keeps its document and approval hash.
- **Reading the codes:** a PC to PT run whose points make a curve becomes one; otherwise it stays straight, and the code report says why (two points only, a straight line, or a point off the circle, with how far).
- **The draft and the Lots step's suggested lines** keep a line's curves; a suggestion says "with a curve".
- **The sheet** draws chords no more than 0.02 mm of paper from the curve; **the DXF** writes each curved segment as a bulge on its vertex, which CAD programs draw as a true arc.
- **The checks:** `CURVE_DRAWN_STRAIGHT`, a warning, when a stored curve's points no longer make one.
- **Wording:** the Carlson hint on the Codes tab and the grammar's notes now say curves are drawn.

## Verified

- **`arcs.test.ts`, 8 tests** (one widened after the review): a known centre and radius at grid-sized coordinates; none for a straight line, a repeated point or a radius past 100 km; a fit turning anticlockwise and a half circle turning clockwise; refusals for a point off the circle, too few points, a straight line and points out of order; chords within the sagitta; bulges, and none for a run that doesn't fit.
- **`curves.test.ts`, 7 tests** (three added after the review: a straight line becoming its curve and the comparison saying so, the extents taking a bulge, no curve on a line missing a point):
  - on the sample plan, the curve passes through every surveyed point and every chord point is on the circle at the plan's scale;
  - the DXF, read back by an independent parser (dxf-parser), has the bulge of a 30° segment on each curved vertex and the surveyed coordinates;
  - with a point moved 10 cm, the line is drawn straight and the warning names it;
  - a plan without curves has no `arcs` in its document and the same approval hash.
- **`grammar.test.ts`:** PC to PT along a circle becomes a curve; zig-zag points, a point 5 cm off and a run of two points stay straight, said; "PT PC" makes two curves; a line stops at 50 curves.
- **In a browser, on the demo build** with a curved wall added to the sample for the look only (then restored): the sheet draws a smooth curve through the five points, its MW label clear of it, and the PDF shows it.
- Survey, app, component and design tests: 885 pass. `pnpm typecheck`, lint on the changed files and `pnpm build` pass.

## Review

A fresh review agent reproduced four faults and found four more by reading, all fixed and tested:

1. **Any three points fitted as a curve,** even shot out of order: the PT back between the others drew a 250 m circle turning almost all the way round, off the sheet, with no warning. A curve may now turn at most a quarter circle between two points in a row; the stage's own zig-zag fixture is now refused, and the curve tests use points on a circle.
2. **"PT PC" on one point lost both curves.** Curve words are now read in the order written, so a reverse curve is two curves.
3. **A line with more than 50 curves stopped the whole draft from saving.** The 51st is drawn straight and said.
4. **A plan that already had the straight line never got its curve.** Drawing again now gives that line its curve, to be looked at; the Lots step's suggestion does the same.
5. **The sheet's scale and fit, and the DXF's extent, ignored a curve's bulge.** Both now take it.
6. **The comparison before approval didn't say a line became a curve.** It does.
7. **A line missing a point drew its curve through the wrong points.** It draws none.
8. **Smaller:** a run ending where it began is said as such, and the DXF writes a curved line's code on the curve.

Left as found: a block-out division line is tested against a curved building's points, not its curve.

## Not done, and why

- **Curved lot boundaries:** a curve changes a lot's area and its legs' figures, and that calculation isn't built. Curves are drawn on lines (walls, fences, kerbs, drains), not on lots.
- **A curve's radius, length and chord on the plan:** figures the surveyor decides to show; not printed yet.
- **Farbaek's own words** (END, CLO) have no curve word; only Carlson's PC and PT make curves.
