# ADR 0269: Drafting as practising surveyors draft

- **Status:** accepted (stage 261, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0262 (houses from walls), ADR 0263 (words and symbols on the plan), ADR 0266 (labels placed by the solver), ADR 0267 (corner circles and lot letters).
- **Changes:** the sheet's drawing and title block, the DXF, the sketch reader's prompt and schema, the plan document (three optional fields), the editor's line and sheet panels. No migration, no new dependency.

## Context

The owner's real job was drawn by AutoSurvey and laid over the surveyor's own printed plan, registered on the surveyed points (residuals of 1 to 2 px). The lot, the house, the well, the dashed line and the road matched. The drafting didn't. In order of what the owner pointed out:

- **Doubled lines:** walls and a house side ran along the lot's boundary a few centimetres off it, so two strokes printed as one thick, blurred line.
- **Clutter at corners:** wall ticks landed on junctions where two walls meet.
- **Repeated codes:** a wall split at a point carried its code twice along one straight run.
- **Codes and words on the wrong side:** some codes went inside the lot, and "Gate" ran over a line.
- **Missing practice details:**
  - neighbours' walls carried on past the land's corners;
  - the S-shaped tick beside a wall's code;
  - thin boundaries;
  - wells as plain circles;
  - "Land claimed by" on its own line;
  - long road directions in two lines;
  - a title block that fills the page when the drawing is small.

## Decision

- **A line along the lot's boundary is the boundary.**
  - **What counts:** a wall, fence or building side whose both ends lie within 0.25 m of a lot's side and between its corners. That is a 225 mm wall's thickness, and a little over: the scatter of points taken on one wall's faces.
  - **How it's drawn:** that leg isn't drawn again. The boundary draws it once. Where the line leaves the boundary it's carried on to it, to where its leg's line meets the side (or the foot of its point).
  - **Codes:** the line's code is still written.
  - **Nothing is moved or hidden:**
    - the drawing keeps every point;
    - the DXF keeps every line as surveyed;
    - the checks say which lines were drawn this way and how far the farthest point lies from the boundary (`LINES_DRAWN_AS_BOUNDARY`, information, blocks nothing).
  - **Extracts:** only the extract's lot counts.
- **A wall's code, written once and outside.**
  - **Once per straight run:** lines of the same code that meet end to end at one point and carry straight on (within 12°) are one wall on paper. The code is written once, beside the longest of them. Walls that turn a corner keep their own codes.
  - **Outside the lot:** along the boundary, the code goes outside the lot first. Outside is found from the lots' outlines, not from where the lot's label is, which an L-shaped lot puts on either side of an arm.
- **Practice style, the surveyor's choice (`settings.wallTicks`, absent unless chosen):**
  - a wall's code is lettered small (0.6 of the small lettering), with an S-shaped tick across the wall about a fifth taller than the code's capitals;
  - the tick goes just before the code, or just after it when that's nearer than 1.2 mm to the leg's end, where another line meets it;
  - the tick is an obstacle for every other label;
  - words along lines take the same small size.
- **Thin boundaries (`settings.thinBoundary`, absent unless chosen):** lots' boundaries drawn at the weight of the other lines.
- **Carried on past an end (`feature.runsOn`, absent unless set):**
  - **On paper:** a stub 5 mm long, along the end leg's direction. It is never a surveyed length, and the DXF draws the same stub at the plan's scale.
  - **From the sketch:** the reader says when a line is drawn on past its first or last number to an end with no number. Only open lines keep it.
  - **When reads are merged:** only the first and last pieces of a split line keep it.
  - **In the editor:** set in the line's panel.
- **Words along a lot's side:** outside first, as before, except gate words ("Gate", "Gates"), which are the lot's own and go inside it at the opening, as plans letter them. Each tries the middle, then a third of the way from each end.
- **Wells are plain circles;** other symbols keep their cross.
- **Labels:** a well's name tries a close ring of places round it, below first, after its first four places (see "After review").
- **Adjoining land and road directions:**
  - "Land claimed by …" and the like are lettered on two lines when long;
  - road directions longer than 30 mm are wrapped in two;
  - the lines are placed together.
- **Title block spread:** when the chosen scale leaves room, the classic layout spreads its title block, up to 1.8 times its spacing and a third as much in size. The drawing must still fit within 90% of the width and 55% of its band.

## After review

A fresh review found two real bugs and four smaller faults, all fixed with tests:

- **Outside, judged from the boundary.** A wall 0.2 m inside the boundary is 1 mm inside on paper at 1:200. So "outside" is tested off the boundary's own line, never the wall's, and it's null when nothing tells (both sides in a lot, or neither).
- **Dragged labels keep their places.** A dragged label's saved place is a number in its list of places, so the lists keep their old numbering. New places are added at the end.
  - The label solver takes a preference order apart from the numbering (`order` in `Placer.choose`, and in the solver's ranks). So a wall code prefers the outside, and a gate word the inside, without renumbering.
  - A well's name keeps its first four places. They're followed by a close ring of places round it, below first, as a well's name is written just under it.
- **Ticks.** On a leg drawn as the boundary, the tick crosses the boundary's line. A dragged code takes its tick along the line with it.
- **What counts as the boundary.** Only walls, fences and buildings, drawn solid, are drawn as the boundary. A dashed or ticked line, or a drain, keeps its own look. A lot missing a point hides nothing.
- **Stubs from the boundary.** A stub whose end leg is drawn as the boundary carries on from the boundary, along it.
- **Reads and the DXF.** A wall carrying on that only a later read drew keeps it. A closed line's pieces never do. The DXF's stub follows a curve's end as the sheet draws it.

## Consequences

- Plans that never set the new fields draw their boundaries, ticks and sizes as before, and keep their approvals, since the fields are absent until used.
- Two changes reach every plan, because they're corrections:
  - lines along the boundary are drawn once;
  - wall codes along the boundary go outside the lot.
- **Gate words:** the stage 255 rule that put every word outside the lot now puts gate words inside. Its test says so.
- **Compare:** the comparison of versions names each new setting and lines carried on differently.

## Verified

- `stage261.test.ts` (13 cases, synthetic points):
  - stubs on the sheet and in the DXF;
  - the reader keeping `runsOn` for open lines only;
  - approvals unchanged until used, and the comparison;
  - lines drawn once along the boundary, with the check and the carry to the boundary;
  - a building's side along the boundary;
  - a line farther off left alone;
  - one code per straight run;
  - codes outside, including an L-shaped lot's arm (this case fails with the label-based rule);
  - ticks clear of the ends, and the tick's size;
  - wells as plain circles, and "Land claimed by" in two lines.
- The updated stage 255 words test.
- The real job, drawn again and laid over the surveyor's print (local only, never committed):
  - the south and east boundaries are single lines;
  - the house meets the boundary wall at a clean junction;
  - corner 1 is clear;
  - every wall's code is outside the lot, with its tick;
  - "Gate" is inside at the opening, as on the print.
- Remaining against the print: the well box's corner that wasn't surveyed. It's constructed in stage 262.
