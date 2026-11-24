# ADR 0273: Dimension lines, and words with their own size and angle

- **Status:** accepted (stage 265, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0261 (the editor's properties panel), ADR 0263 (words on the plan), ADR 0266 (labels placed by the solver).
- **Changes:** the plan document (an optional list and two optional fields on words), both sheet layouts, the DXF, the checks, the comparison and the editor. No migration, no new dependency.

## Context

The owner's visual CAD editor brief asks for a dimension tool, and for words that can be made larger or turned. A plan's legs already carry their bearings and distances. A surveyor also dimensions other things: a building's width, the gap between two walls, a road's width across. The plan had no way to show those.

## Decision

- **Dimension lines** between two surveyed points: `dimensions?: { id, from, to, offset }[]`, absent until the first.
  - **The distance:** always worked out from the coordinates, and written with the plan's distance decimals. It's never typed.
  - **Placing it:** `offset` is millimetres of paper to the left looking from `from` to `to` (negative: to the right), between -40 and 40.
  - **On the sheet:** the line, an extension line from a little off each point to a little past it, a filled arrowhead at each end, and the distance over the line's middle on the side away from the points. The words are placed by the label solver, clear of the rest, and can be dragged like any label. A dimension shorter than its words gets them just past its end.
  - **Layer:** the Dimensions layer, so hiding or locking it hides or locks them.
  - **In the DXF:** the same lines and distance, at the plan's scale, on the Dimensions layer.
  - **Approval and comparison:** the approval covers both points. The comparison says when one is added, taken out or drawn differently.
  - **A missing point:** a dimension whose point is no longer in the survey stops export and approval (`DIMENSION_MISSING_POINTS`).
  - **In the editor:** added from the Selected tab ("Add a dimension line between two points", by their numbers). Selected on the sheet, it shows its distance from the coordinates, its two points, its offset and Remove.
- **Words with their own size and angle:** `size` (0.5 to 3 times the usual) and `turn` (degrees on paper) on a word item, absent until set.
  - **On the sheet:** every place the solver tries is turned the same way, so it judges the words as they're drawn.
  - **In the DXF:** the same height and angle.
  - **In the editor:** in the words' panel, as Smaller, As usual, Larger and Largest, and an angle, empty for along the line or level.

## After review

A fresh review found five real bugs, all fixed, four with tests:

- **The DXF's distance across its line.** A DXF text stands on its baseline, so for a line running from east to west the distance was written across its own line. Where the text's tops face the line, it now goes a text's height further out.
- **A negative offset couldn't be typed:** the lone minus sign became 0. The field now keeps what's typed until it's a number.
- **The comparison missed size and angle.** A word's size or angle changed only the approval, never the comparison of versions. The comparison now says it.
- **A dragged figure wasn't registered where it's drawn,** so the next labels could cover it. It now takes the surveyor's drag as every label does.
- **A short dimension's figure** was judged above the line's middle but drawn past its end. It's now judged where it's drawn.

Also:

- a short dimension draws its arrowheads outside, pointing in;
- a figure that can't stay inside the drawing is reported as running off the sheet;
- every dimension is listed beside "Add", so one whose point is gone can still be opened and removed;
- a dimension has its own summary on the phone, and "Put the label back";
- the words' angle says it's clockwise;
- a dimension takes surveyed points only (a constructed point's id is refused on save, like any unknown point).

## Consequences

- A plan without dimensions or sized words is unchanged and keeps its approval.
- Dimension lines are presentation: nothing is measured from where they're drawn, and the distance is always the coordinates'.

## Verified

- `sheet/stage265.test.ts` (8 cases, with the review fixes):
  - the line, extension lines, arrowheads and distance, to the left or the right;
  - a hidden layer, and a missing point stopping the plan;
  - the DXF;
  - absent until used, counted for the approval, and in the comparison;
  - words' size and angle.
