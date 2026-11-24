# ADR 0270: Square corners a sketch draws that nobody surveyed

- **Status:** accepted (stage 262, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0249 (the sketch's drawing interpreted), ADR 0265 (three reads merged), ADR 0269 (drafting as surveyors draft).
- **Changes:** the plan document (one optional field), the plan's build, the checks, the DXF export, the sketch reader's prompt, the merging of reads, the sketch's interpretation and applying, the save action and the editor. No migration, no new dependency.

## Context

On the owner's real job a well box stands against the lot's west wall. Its far corner, where the box's bottom turns up to the house, was never surveyed. The surveyor's field sketch draws it as a square corner with no number. The surveyor's printed plan draws the box square there: measured on the registered print, the corner lies within 4 cm of where squaring it gives.

AutoSurvey had no way to say this. The reader was told a line's end without a number can't be used, so it joined the two surveyed points straight, and the box's bottom ran diagonally across it.

The rules that bind this:

- Survey skill rule 1: tested code calculates, the AI never does.
- Survey skill rule 6: the document never holds a coordinate.
- Survey skill rule 7: nothing changes silently.

## Decision

- **A recipe, never a coordinate.** The document keeps `constructed?: { id, kind: "square", from, to, ref: [a, b] }[]`, all surveyed point ids.
  - **The construction:** the corner lies square off the reference line `a` to `b` from `from`, level with `to` along it.
  - **The two legs:** the leg from `from` runs straight across the line, and the leg into `to` along it. So both legs meet at a right angle.
  - **Who works it out:** tested code (`construct.ts`), every time the plan is built. So it moves with the surveyed points.
  - **When none is made:** a leg would be shorter than 2 cm, or the line has no length.
  - **Hashes:** the field is absent until the first, so earlier approvals stand.
- **Which line it's squared to:** as a surveyor squares an outline off the wall it stands against.
  - **The candidates:** the legs of the plan's lines and lots that start or end at either point, or pass within 0.25 m of it (a wall's thickness).
  - **The choice:** the longest of them, since a long surveyed line gives the truest direction.
  - **Never a candidate:**
    - the leg between the two points themselves;
    - a leg through a constructed corner.
  - **The corner's `from`:** the point the line was found at.
  - **When none qualifies:** no corner is made, and that's said.
  - **On the real job:** the lot's west side 18 to 35. That puts the corner 10 cm from the print's measured corner, within the print's own measuring.
- **Only lines and outlines use them.**
  - **Never as a lot's corner:** a lot's corners are surveyed. `usedPointIds` counts a line's corner as the surveyed points it's worked out from, so the approval covers those. Anything else naming one names an unknown point, which a save refuses.
  - **Never a surveyed point's id:** a save refuses a corner whose id is one.
  - **Lots:** they're computed from surveyed points only.
- **Said, and checked.**
  - **`CONSTRUCTED_CORNERS`:** a warning that names each corner and the line it's squared to, so none is taken for a surveyed mark. It blocks nothing.
  - **`CONSTRUCTED_CORNER_MISPLACED`:** an error, stopping export and approval, when a corner doesn't stand between the two points it's worked out from.
  - **A corner that can't be worked out:** the line misses a point, which the existing check stops.
- **From the sketch.**
  - **The reader:** it writes the word `corner` in a line's points where the line turns a square corner with no number, never at an end, and never as a number.
  - **Merging reads:** the corner words are set aside, counted per segment across the reads, and put back where at least half the reads drew one. One read's slip neither adds a corner nor loses one.
  - **Interpretation:** the word is never matched as a number. A corner between two matched points gets its line chosen as above; without one, it's a question and the line runs straight.
  - **Applying:** the corner goes between its two points in each line and outline that reading added (never a curved one). Its id comes from the two points, so reading again doesn't make another.
- **In the editor.**
  - **The points field:** a line's points show a constructed corner as `corner`. The surveyor types `corner` between two numbers to add one. It reuses the plan's corner between those points, or squares a new one as above, or says why it can't.
  - **After every edit:** dragged points, typed numbers, a line closed or opened, a line removed. Each corner is worked out again between its new neighbours, or taken out when nothing squares it. Corners no line uses are dropped.
  - **Saving:** unused corners are pruned too.
- **Export:** the DXF draws the same corners. The comparison of versions says when corners were added, taken out or squared to another line.

## After review

A fresh review found five real bugs, all fixed, four of them with tests:

- **Duplicate ids.** Two recipes under one id let the drawing take one and the approval cover the other's points. The schema now refuses repeated ids, and every reader takes the first.
- **Block-out plans and dividing lines.** Lines and buildings with a constructed corner were left out of block-out plans and of dividing lines. Both now get the corners worked out.
- **A lot side drawn round a corner.** Where the sketch turns a square corner between two of the lot's corners, the lot runs straight and leaves that land out.
  - The reading asks about it, against the lot.
  - `CONSTRUCTED_CORNER_BY_LOT` (professional review) holds approval, for corners made in the editor too.
- **Dragging across a corner.** A line's point dragged onto the point beyond a corner beside it could leave a line through one point twice. The drag now looks past corners for the points beside it, and says when a corner was taken out.
- **The 200-corner limit.** At the limit, a corner went into a line with no recipe kept, so every later save was refused. The limit is now checked before the corner goes in.

Also:

- the sheet's fit counts only drawn points, not the points a corner is squared to;
- point counts and the range check count surveyed points only;
- a corner word in an area's corner numbers is left out.

## Consequences

- A sketch's unnumbered square corner reaches the plan in the normal flow (Generate, then the sketch read), checked and said, with no click needed beyond confirming the building, as for anything the sketch draws.
- A plan without constructed corners is unchanged and keeps its approval.
- **Not yet:** other constructions (two lines meeting, a tape offset from a line). Each would be another `kind`, with its own tests.

## Verified

- `construct.test.ts` (10 cases):
  - the corner at any bearing;
  - legs too short;
  - the reference chosen, and never the corner's own leg;
  - points missing, and never replacing a surveyed point;
  - a stable valid UUID;
  - insertion on a closed line's last leg.
- `stage262.test.ts` (12 cases):
  - from the sketch to the plan: squared to the lot's side, with the question when nothing squares it, and the word let go at an end;
  - the checks, a lot refused a corner, and the approval covering the recipe's points;
  - pruning;
  - merging three reads (two of three keep a corner, one doesn't);
  - the stage 261 merge fixes.
- `corners.test.ts` (6 cases): typing `corner`, reusing a corner, the refusals, rebuilding after a drag, taking a corner out, and the misplaced corner stopping export.
- **The owner's real job, end to end, locally (never committed):** the stored sketch read, with the corner marked as the reader is now told to, was interpreted and applied. The house came out as 17, 33, 34, 35, 3, 4, 6, 9, 16, 15, 14 and the constructed corner, squared to 18 to 35, and the check said one corner wasn't surveyed. Laid over the surveyor's print, the box's bottom now turns square where the print does.
