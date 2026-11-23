# ADR 0242: A sheet's labels are placed together, by scored candidates, rather than first come, first served

- **Status:** accepted (stage 233, AutoSurvey part 8, 2026-11-23)
- **Builds on:**
  - ADR 0201 (one scene for the preview and the PDF);
  - the survey skill's rule 7 (geometry is never moved, and labels never alter it);
  - the owner's AutoSurvey brief §15 (annotation and layout, collision avoidance);
  - the research report "Survey Field to Finish automation", which takes QGIS's engine as the model: candidate positions, scored, then searched.
- **Changes:** where labels go on the plan sheet. No migration and no change to what the sheet says. The overlap check's advice changes.

## Context

Each label already tried a few positions and took the first that covered nothing drawn or placed before it. That is greedy and order-dependent: a label drawn early could take the only clear place a later one had, and the later one was then forced onto something.

A leg's bearing and distance had two places, outside or inside at the leg's middle. On a leg shorter than its label, that ran neighbouring dimensions into each other end to end. A row of eight lots 8 m wide at 1:1000, with dimensions on the face, had 30 overlapping pairs. Sixty lots 10 m wide at 1:500 had 75.

## Decision

**Every movable label offers its candidates through one call** (`Placer.choose`, `src/core/survey/sheet/labels.ts`), in its drawing code's own order of preference:
- **Dimensions:**
  - on one line, outside then inside;
  - on a leg long enough, also a third of the way from either end, never past the leg's ends;
  - then the bearing over the distance, outside then inside;
  - then the bearing on one side of the line and the distance on the other.
- **Corner numbers and marks:** eight places round the corner, away from its lots first.
- **Loose marks:** four places.
- **Lot labels:** the centre and rings round it, then the 24 points deepest inside the lot. Only places wholly inside the lot can be chosen.
- **Adjoining-land labels:** blocks beside the leg, then the text along it. Only places inside the drawing's bounds can be chosen.

Fixed text (feature codes, road names) and every line, point and symbol are obstacles.

**Two passes and a solve:**
1. The sheet is drawn as before, each label at its first free candidate, recording the candidates.
2. Every candidate is scored. Its rank in its own order is worth 0 to 1. Crossing a line costs 6, covering a point, a symbol or fixed text 15, covering another movable label 30, and leaving the bounds 40. Two labels on each other can't be read; a label over a line still can.
3. Starting from the first pass, a label in conflict moves to its cheapest candidate. Labels that still meet are tried in pairs over each one's 12 cheapest candidates. This repeats until nothing improves, for at most 12 rounds.
4. Only a lower total is accepted, so the result is never worse than the first pass. The search is deterministic.
5. When anything improved, the sheet is drawn again with the solved places. When nothing was in conflict, it is drawn once.

**What stays as it was:**
- Geometry never moves. A test compares every line, point and symbol between the two passes.
- **A label the surveyor moved by hand never moves.**
  - Its offset records the place it was measured from (`slot`), the place the label was drawn at when the drag began, and it stays there.
  - The assistant's nudges record it too.
  - An offset saved before this has no place, and takes its first free place as before, chosen without the offset, so the drag never changes the base.
  - Each of its shapes, with its own entity's offset, is what other labels must avoid.
- What still overlaps is reported by the existing check, whose advice now says Farbaek has already placed every label where it covers the least.

**Kept quick:**
- Shapes are filed in an 8 mm grid.
- Each pair of candidates is tested once.
- A label is compared only with labels its own allowed places reach.
- Its scores are reused until a label near it moves.

On the dev PC, 60 lots with every dimension on the face take about 0.27 s at 1:500 and about 0.5 s at 1:1000, where they can't fit. A plan without conflicts costs one pass, as before.

## Measured (synthetic, `src/core/survey/sheet/labels.test.ts`)

| Sheet | First pass | Solved |
| --- | --- | --- |
| The sample, 1:2000 | 1 | 0 |
| The sample, 1:2500 | 2 | 1 |
| Eight lots 8 m wide, dimensions on the face, 1:500 | 0 (the new candidates alone) | 0 |
| Eight lots 8 m wide, dimensions on the face, 1:1000 | 26 | 9 |
| Sixty lots 10 m by 20 m, dimensions on the face, 1:500 | 11 | 10 |

Before corner numbers and marks were registered line by line instead of as one block, the sixty lots' first pass left 75 overlapping pairs.

## What it doesn't do

- **No leader lines for dimensions, and no table of legs:** a dimension that can't fit beside its leg at the chosen scale stays reported, and a larger scale is the advice.
- **Sizes stay as the template sets them.** Text is never shrunk to fit.
- **Labels the surveyor moved by hand** aren't part of the search.

## Consequences

- Crowded sheets come out mostly clear without the surveyor dragging labels, and what can't be cleared is still said.
- The DXF keeps its own placement of dimension text: it isn't drawn from the sheet's scene. The PDF and the preview are.
