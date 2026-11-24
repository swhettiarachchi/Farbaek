# ADR 0259: Leader lines for legs too crowded to letter against

- **Status:** accepted (stage 251, parked, then built as stage 266, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0242 (labels placed together, a dragged label's place recorded);
  - ADR 0248 (crowded legs left to the boundaries schedule).
- **Changes:**
  - each leg's bearing and distance gets more places to stand: a little way out from the leg, joined to its middle by a leader line;
  - the preview's point hit targets leave leader dots out.

  No migration, no new dependency, no change to what's stored.

## Context

The brief (§15) asks for intelligent annotation placement that reduces label and dimension overlap, without distorting the scale. A row of narrow lots is the everyday case. At 1:1000, an 8 m frontage is 8 mm on the sheet, and its bearing and distance need about 25 mm. Every place against the leg was taken, so labels overlapped: 9 pairs on the classic layout and 14 on the panel layout, for a row of eight. The only remedies were a larger scale, dragging labels by hand, or leaving the crowded legs to the schedule (ADR 0248).

Drafters handle this with a leader: the dimension stands where there's room, and a thin line ties it to its leg.

## Decision

**Each leg's words get leader places, after every place against the leg.**

- **Where:** on one line, parallel to the leg, 5, 9, 13 or 17 mm out from the place against it, on the lot's outside only. Each distance is tried straight out, and shifted along the leg by half the words' width plus 2 mm, or twice that, either way. Inside a narrow lot stand the other legs' words, the points' numbers and the lot's own label. Leader places inside too were measured on the rows below: on the twelve 5 m lots they cleared three more pairs on the classic layout, left one more on the panel, and doubled the time, so they aren't offered.
- **The leader:** from the leg's middle to the middle of the words' nearest edge, stopping 0.4 mm short, with a 0.35 mm dot on the leg. Thin, in ink, on the DIMENSIONS layer, with the leg label's entity, so the editor selects and moves it with the words.
- **Counted as part of the place:** the leader and its dot are shapes of the place, so other labels are kept off both, and both are charged for what they cover like any label. The leader is checked from 1.2 mm along, so the leg it starts on never counts as covered. The dot always crosses its own leg, which every leader place pays for alike.
- **Last in line, and dearer:** the places come after every place against the leg. A leader place costs the solver 2, and 8 with its dot's crossing: more than a place against the leg that crosses a line (6), much less than covering another label (30). So a leader is taken only when it clears something. Existing places keep their numbers, so a label dragged before this stage stays where it was dragged from.
- **The solver looks again:** a label standing clear at a dearer place, such as a leader, is looked at again each round, so it comes back against its leg once the label it made way for has moved. And a label still in conflict may take a place another label holds (one or two), when they have somewhere clear to go: a row where every place is spoken for needs that chain, which no single move or pair finds. Each step is kept only when the sheet's total cost falls.
- **A dragged leader label** keeps its leader: the line follows the words by the same offset, and the dot stays on the leg.
- **The overlap check counts leaders:** the sheet's "labels overlap" check (and the crowded-leg schedule, which reads it) counts a label covering another's leader or dot, as well as its words.

**What it does to real-shaped plans** (synthetic rows, measured on this PC, the same solver both ways, counting leaders and dots):

| Row, scale | Overlapping pairs without leaders | With leaders |
| --- | --- | --- |
| Eight 8 m lots at 1:1000, classic | 9 | 0 |
| Eight 8 m lots at 1:1000, panel | 12 | 0 |
| Ten 6 m lots at 1:500, classic | 0 | 0 |
| Twelve 5 m lots at 1:1000, classic | 53 | 7 |
| Twelve 5 m lots at 1:1000, panel | 60 | 6 |

The row of ten at 1:500 had 3 pairs before the solver's new step and needs no leaders now. The uncrowded plans checked are unchanged, with no leaders: the sample sheet, and the owner's real job, whose sheet is drawn byte for byte as before. Composing the most crowded sheet takes about 0.3 s. Frontages of 5 mm on the sheet are still too tight: there, the answers are a larger scale, or leaving the crowded legs to the schedule, which is still offered.

## Not done

- **Leaders in the DXF:** the DXF writes its own text in model space at each leg (ADR 0200). It doesn't use the sheet's placement, so the DXF's dimensions on a crowded row still sit on their legs.
- **Plans over several sheets,** for a drawing that won't fit one sheet at a readable scale: next.
