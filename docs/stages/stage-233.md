# Stage 233: AutoSurvey, part 8: labels placed together, by scored candidates

- **Date:** 2026-11-23
- **Branch:** `feat/stage-233-labels`, from `main` (after #295)
- **Decision:** ADR 0242
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: rule 7 (geometry never moves; labels only), the plan sheet guide (presentation kept apart from measurement) and the cadastral drafting guide;
  - the research report's study of QGIS's labelling engine (candidates, scored, then searched).

## What was built

- **`src/core/survey/sheet/labels.ts`:**
  - the placer, which records each label's candidates and replays a solved plan;
  - the solver (rank, obstacles, other labels and bounds scored; single moves, then pairs; only improvements accepted);
  - an 8 mm grid, so placement looks only at what's near.
- **`src/core/survey/sheet/draw.ts`:** each movable label offers its candidates through the placer.
  - Dimensions gain places a third of the way along a long leg, and the bearing stacked over the distance or split across the line for a short leg.
  - Corner blocks, loose marks, lot labels (only inside the lot) and adjoining-land labels (only inside the bounds) keep their positions as candidates.
- **`composeSheet`** draws the sheet, solves, and draws again with the solved places when anything improved. `composeSheet(input, "greedy")` keeps the first pass for comparison.
- **The overlap check's advice** says Farbaek moved the labels it could, and these still touch.

## Verified

- **`sheet/labels.test.ts`, 12 tests:**
  - **The solver:** a label that took another's only clear place moves; two labels that can only be cleared together are; a hand-placed label never moves; a place that isn't allowed is never chosen; the bounds are kept; a sheet without conflicts is left alone; the answer is the same every time; a solved plan is replayed only on the label it was made for.
  - **Whole sheets** (all synthetic):
    - never more overlaps than the first pass;
    - fewer where crowded: the sample at 1:2500 2 to 1, a row of eight 8 m lots at 1:1000 26 to 9, sixty lots at 1:500 11 to 10;
    - every movable label exactly where it's dropped, at three scales, and an older offset's base unchanged by the drag;
    - every line, point and symbol identical between the passes;
    - every lot's label inside its lot at three scales.
- **The survey, server, app and design tests (816) pass,** and lint passes.
- **Looked at:** the eight-lot row drawn as SVG from the same scene, at 1:500 and 1:1000, first pass and solved.
  - At 1:500 the stacked dimensions read bearing over distance, beside their own legs.
  - At 1:1000 the solved sheet is far clearer than the first pass. The 9 left are where 8 m lots can't hold their text at that scale.
- **Timing on the dev PC:**
  - **60 lots with every dimension on the face:** about 0.27 s at 1:500 and 0.5 s at 1:1000. That was 3 s before the grid.
  - **The benchmark's check-and-compose step:** about 6 ms for the typical job, which was about 4 ms before.

## What a fresh review found, and what was fixed

A review agent confirmed 5 faults with a temporary test.

1. **A label the solver had moved jumped as soon as the surveyor dragged it.** The offset was measured from the solved place, then applied to the first-pass place. An offset now records the place it was measured from, as does the assistant's nudge, and the label stays there. A test drags every movable label of the sample at three scales and finds each exactly where it was dropped.
2. **While a label was dragged, its base place depended on the drag itself:** the place was chosen with the offset already applied. It's now chosen without it, so an older offset with no recorded place keeps its base. A test drags a mark three ways.
3. **A corner's number and mark, moved by different amounts,** were registered as one block at the first one's offset. Each line is now its own shape with its own offset, and so are a lot label and its extent.
4. **The cramped lot label and the adjoining label with no place inside the bounds** were registered without their offsets. Both now include them.
5. **Solving was slow on large crowded plans.**
   - Labels are now compared only where their allowed places reach, and scores are reused.
   - 60 lots at 1:1000 with every dimension on the face take about 0.5 s.
   - The editor still composes again on each move of a drag, which is noticeable only on such a sheet.

The review also found that the overlap check's advice ("Farbaek placed every label where it covers the least") wasn't true of a label moved by hand. It now says Farbaek moved the labels it could.

Separately, checking the sixty lots showed the solver could leave *more* labels on each other than the first pass. It had traded two crossed lines for one overlap at equal cost. Overlaps between labels now cost far more than crossing a line: 30 against 6.

## Not done, and why

- **No leader lines or leg table for dimensions** that can't fit: they stay reported, with a larger scale as the advice.
- **The DXF's dimension text** keeps its own placement, as before.
- **Not looked at on a real plan:** none has gone through AutoSurvey yet.
