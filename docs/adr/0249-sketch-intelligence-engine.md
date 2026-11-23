# ADR 0249: The sketch's drawing is read, and tested code turns it into proposals for the surveyor

- **Status:** accepted (stage 241, AutoSurvey, 2026-11-23)
- **Builds on:**
  - ADR 0234 (sketch reading with Claude: readings as written, checked against the coordinates);
  - ADR 0235 (exceptions only: one-press confirmations);
  - ADR 0240 (sketch photos kept);
  - the owner's AutoSurvey brief §7 (field-sketch intelligence) and their Item 1 brief (intelligent field-sketch understanding, with a real job they supplied as the test case).
- **Changes:**
  - the sketch reader's answer gains three lists (lines, symbols, areas);
  - the plan document gains an optional `symbols` list;
  - new core modules under `src/core/survey/sketchintel/`;
  - the sketch reader's model choice.

  No migration, no new dependency.

## Context

A real job the owner supplied went through Generate Plan and came out empty: its 40 points carry no field codes, so nothing said which points are the lot's corners, which make walls, or where the well is. All of that was on the field sketch, which Farbaek read only for its words and numbers (ADR 0234). Surveyors in Sri Lanka commonly work this way: the sketch, not the codes, holds the connectivity.

## Decision

**Read what the sketch draws, as relationships between numbered points, never as positions.**

The reader's answer gains:
- **`lines`:** the numbers each drawn line passes through, in order. Each line also records:
  - how it's drawn (`single`, `double`, `dashed`, `hatched`, `crossed`, `curved`, `other`);
  - what's written along it, as written;
  - whether it closes;
  - whether the reader is sure.
- **`symbols`:** a well, tree, post or gate drawn at a numbered point.
- **`areas`:** a name written inside a region, such as a building's letter, a lot letter or "ගෙය", with its numbered corners when the drawing shows them.

The schema has no number field except the photo's index, so no position, length or angle can come back from the sketch. Readings stay as before.

**Tested code does the rest, in separate steps** (`src/core/survey/sketchintel/`):
1. **Extraction** (`drawing.ts`): the answer validated and cleaned (hidden characters, unknown styles, other photos, limits), kept with the sketch record.
2. **Matching** (`match.ts`): each written number to a surveyed point. The match is exact, or by leading zeros or letter case, and said so. An ambiguous or unknown number is never guessed.
3. **Classification** (`classify.ts`): the code list first, then English and Sinhala words, then how the line is drawn. A line known only from its style is asked about.
4. **Interpretation** (`interpret.ts`): every relationship is tested against the coordinates.
   - **Corners** are judged by how far a point lies off the straight line between its neighbours, never by the angle it turns through. The real job showed why: two wall points 0.19 m apart turned by 11° and still lay within 4 cm of the wall.
   - **Tolerances** are Farbaek's defaults, passed in and said as such. A point within 0.25 m (`onLineM`) is on its side, within 0.10 m (`tightM`) is strong evidence, and a point in between is taken as on its side and asked about, with what the area would be as a corner.
   - **The lot** is the largest simple outline the boundary lines close round. Roads and dashed lines are never boundaries. The stated extent is compared, never used to choose.
   - **Strips** are found and said.
   - **A road's side** comes from which side of its surveyed edge the lot lies on. Its width is taken only as written, and its far edge is never drawn.
   - **A surveyed point** lying on a drawn line but not written on the sketch is said, never added.
   - **What the evidence can't settle becomes a question:** an unknown number, a line with nothing written along it, a missing width, a building without numbered corners.
5. **Confidence:** each proposal is "strong" (numbers matched exactly, the line clearly drawn and named, every point within the tight tolerance) or "check", with its evidence in sentences.
6. **Application** (`apply.ts`): proposals go on the plan as items read from a photo, unconfirmed (`ai_photo`).
   - A drawn line already on the plan isn't added again, and nothing already there is replaced.
   - The sketch's lot is added only to a plan without lots.
   - Each item is held for one press on the Plan step's "Needs you" list, its Confirm card carrying the evidence and any open question it answers. A symbol has no editor of its own, so its card can also remove it.
   - An item's id comes from what it is (its kind, its surveyed points, a symbol's code), never from the reader's numbering, so a later read can't take an earlier item's place.
   - A point's own surveyed code stands: a sketch that draws another symbol there is asked about. A symbol named only by its kind, with one such code in the list, is "check"; with several (posts), it's asked about.
7. **Questions on the plan** (`findings.ts`): recomputed from the reading and the current points each time the plan is shown, as warnings that hold nothing back. A question about an item goes away once the surveyor confirms or removes the item, or gives the lot a label.
8. **Evaluation** (`evaluate.ts`): what was drawn compared with a surveyor's own plan by point numbers. It reports:
   - the lot's corners, the corners missed and how far they lie off the outline;
   - each reference line drawn in full, in part or not, joined across drawn lines, and the points passed without a stop;
   - extra lines, the symbols and both areas.

   A real job is evaluated by `real-job.test.ts`, which runs only when pointed at a folder outside the repository: a client's land data never enters it.

**Symbols on the plan:** `symbols` (an id, a code from the code list and a point) is absent until a sketch adds one, so earlier documents and their approvals stand. A symbol is drawn at its point with its code's mark.

**The model:** Claude, as before (ADR 0234). Sketch reading asks for the deep route and the standard tier at least (Claude Sonnet 5.5), on every plan, with effort set high. A misread line moves nothing by itself, but costs the surveyor a correction, and reading drawn relationships in a handwritten sketch is beyond the fast tier.

## Consequences

- The owner's real job, from its SDR and its sketch's drawing as transcribed in the development session in the reader's format:
  - every written number matched;
  - the lot came out as the surveyor's 35, 18, 20, 21, 22 and 1, all but 2, which lies 0.043 m off the straight side; 132.70 m² against the plan's 132.53 m², with the stated 126.50 m² kept apart;
  - 7 of the plan's 8 lines drawn in full and the road edge in part;
  - the well placed;
  - the 16 cm wall point asked about.

  The production reader hasn't read that sketch yet: that needs the owner's consent for the client's photo.
- A sketch that draws nothing still gives what ADR 0234 gave.
- **Not built:**
  - drawing a road from one surveyed edge and a written width;
  - a building's outline from an area whose corners aren't numbered;
  - neighbours' walls carried past the corners as presentation;
  - a symbol's mark in DXF beyond its point.
