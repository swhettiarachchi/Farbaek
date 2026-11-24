# ADR 0262: A house drawn as walls meeting the boundary, a road found from a gate, and dashed lines kept dashed

- **Status:** accepted (stage 254, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0249 (the sketch's drawing interpreted against the survey);
  - ADR 0251 (a road between two surveyed sides);
  - ADR 0255 (where numbers are written on the photo);
  - ADR 0260 (the owner's real job run end to end).
- **Changes:** the sketch interpreter, the drawing's features (one optional field), the sheet and the DXF writer. No migration, no new dependency.

## Context

The owner's real job, run through production with no presses, drew the lot the surveyor drew, but not the house. The sketch draws the house the way field sketches usually do: two or three walls inside the lot that meet the boundary, the word for home written in the middle, and no number at most of its corners. The reader read all of that correctly:

- the walls, as separate lines;
- the word, ගෙදර (home), as a labelled area beside two of the walls' points;
- where the word is written on the photo.

Farbaek then drew the walls as six loose pieces, half of them fences (the sketch marks them with crosses), each with its own question. It didn't know ගෙදර as a building word, and a building needed every corner numbered.

The same run asked whether two corners were misread. Each number was written twice, once at its own point and once beside another point (a 23 read as 22). The written road had no name the reader could read (it's in Sinhala), so no road was drawn, though a gate is written in the lot's side facing it. And the sketch's dashed lines (a roof's edge) printed solid.

## Decision

### A house from the area its walls close round

When a building's label (P, house, ගෙය, ගෙදර, නිවස and the like) is written in an area whose corners aren't all numbered, the outline is found from the sketch itself:

- **The areas the lines close round** are worked out from the surveyed points the lines join (`sketchintel/faces.ts`). A drawn point lying on another line between two of its numbers (a wall meeting the boundary) joins it there, when the surveyed point lies within the on-line tolerance (0.25 m) of that line. A leg drawn twice (on two photos, or a side drawn on its own as well) is one leg. Nothing is moved: the area's corners are the surveyed points, and a sliver between a wall's end and the boundary belongs to neither area. Lines that cross where no number is make no areas at all, and nor does a drawing too large to check within the work cap.
- **The one area that holds the label** is chosen by where the label and the numbers are written on the photo, through the same fit of the photo's numbers that ADR 0255 uses. The fit only says which area the label is in, never where anything is.
- **It's drawn only when it's settled.** It's asked about, as before, unless all of these hold:
  - the plan has a lot;
  - exactly one area holds the label and every corner the area names;
  - every corner the area names is a surveyed point;
  - it isn't the whole lot;
  - at least one of its sides is a wall drawn inside the lot with nothing written to say it's something else;
  - none of its sides is a line written as a fence, a drain or a gate;
  - no line through its corners was left undrawn (a number not surveyed, or a line crossing itself).
- **Its walls are its outline.** Lines wholly on its outline, with nothing written to say they're something else, are drawn once, as the building, and not asked about on their own. A wall written as one (MW), a side of the lot drawn as a plain line, and a wall that runs on past the building's corner stay as drawn: the building only meets them.
- **Doubts about its walls are its own.** A wall's number written where another point would be, or a wall crossing another line where no number is, is asked about on the building, and its card says so.
- **Its code** is the one written, else the code list's only building (P, Permanent Building in the common list), said as such in its evidence. With no building in the list, or several, it has none.

### Numbers written twice

A number written again at its own point's place is that point's. The other writing of it is most likely another number misread as it. It's no longer asked about; the lot or the line that uses the number says it on its card: "12 is also written on the sketch beside where 19 would be; the 12 written at its own point was taken." So the surveyor still sees it, without a question that holds the plan.

### A road found from a gate

A gate is written or drawn in the lot's side: a gate word (gate, ගේට්ටුව) near a point, a gate symbol, or a line labelled as a gate.

- **Which side it's in:** a gate on a side is in that side, and a gate drawn as a line is in the side all its points are on. A gate at a corner could be in either side there.
- **When a road is drawn:** no road name is read, the gate's side is settled, and exactly one line is drawn across from that side at a road's distance. The road is then drawn between them as ADR 0251 draws a named one. Its width is measured, it has no name, and the name is asked for.
- **Otherwise:** when a gate at a corner has a line across from both its sides, or two lines are across from its side, it's asked about and nothing is drawn.

### Dashed lines

A feature can be marked `dashed` (optional, absent by default, so earlier versions and approvals are unchanged).

- A line the sketch draws dashed keeps that mark, and the sheet, the PDF and the DXF (its own `DASHED` line type) draw it dashed whatever its code says.
- The line's panel in the editor has "Drawn dashed" to change it.

## Verified

- **`stage254.test.ts`** (synthetic):
  - the areas a turned lot and a house against two of its sides make;
  - a wall's end joined only within the tolerance;
  - crossing lines make none;
  - the house chosen by its label's place, and the other area when the label is there;
  - asked, not drawn, without a label place, with too few numbers, with a corner the area doesn't have, or as the whole lot;
  - ගෙදර and the other building words, and the one building code;
  - a number written twice;
  - a road from a gate, and none without a gate or with no line across;
  - a dashed line kept dashed through the plan and the DXF.
- **The owner's real job, with production's own read** (local only, never committed):
  - the house is drawn as one building, P, closed against the boundary, 81.71 m², as on the surveyor's plan;
  - its seven wall pieces and their questions are gone;
  - the two misread-corner questions are gone;
  - the dashed lines print dashed.
- **The rest of the survey tests** pass unchanged.

## Review

A fresh review found six faults, all fixed with tests:

- a doubt about a wall drawn as part of the house was hidden, being about a line no longer on the plan;
- "Home garden" and "Land of NHDA නිවාස" were read as buildings;
- any area holding a house's label became the house, even one bounded by a fence or with no wall of a house;
- a corner the area names that isn't surveyed was dropped without a word;
- a gate at a corner could choose the side it isn't in, and a gate on a side wasn't seen;
- the same walls on two photos, or a side drawn twice, lost the house.

Also from it: the crossing check is capped, "Drawn dashed" in the editor makes the line the surveyor's, and comparing versions says when a line is drawn dashed now.

## Not done, and why

- **The road on the owner's job** isn't drawn. The reader joined the far wall and a neighbour's wall on the near side into one line, so no line lies a road's width across from the gate. Farbaek refuses a road under 2 m wide rather than draw this one. The surveyor draws it on the Lots step.
- **Text on the sheet** (Gate, Proposed Drain) and **a symbol at a chosen point** (an electric post) have no place in the plan yet: the editor's text and symbol tools come next.
