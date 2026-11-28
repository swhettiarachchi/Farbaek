# ADR 0310: Plans drawn at 0.13 mm; the plan's details filled in; the deed read on the strongest model; a house beside crossing lines

- **Status:** accepted (stage 304, 2026-11-28)
- **Changes:** ADR 0262 (the areas a sketch's lines close round), ADR 0309 (the join that closes a house), ADR 0237 (what a new plan takes from the surveyor's plans), ADR 0269 (lot boundaries drawn thin).

## Context

The owner's father, a practising licensed surveyor, looked at the plans Survey Studio draws and asked for two things:

- Every line should be 0.13 mm. The classic sheet drew lot boundaries at 0.45 mm, other lines at 0.25 mm and thin lines at 0.18 mm.
- The description and the plan's other details should fill themselves in, professionally and correctly. The best Claude model for the job should be used, at a sensible cost, because this is paid work.

Using the plan as a surveyor on the second live read of the owner's real job also showed the house still wasn't drawn. Two lines read only once (22-8-7-5 and 12-9) cross where no number is written. Any crossing made the room search give up, so the house fell back to three partial outlines from the corners read beside its label.

## Decision

- **Line thickness.** A plan has a line thickness (`settings.lineMm`). Every line of its drawing is drawn at that thickness: lots, walls, roads, dimensions, marks, the north arrow, match lines and the reference underline. The frame and the panel rules keep their own weights.
  - A new plan starts at 0.13 mm.
  - The Sheet panel offers 0.10, 0.13, 0.18, 0.25 and 0.35 mm. Beside it, the lot boundaries can be drawn heavier (`boundaryMm`); they're as the other lines unless chosen.
  - The surveyor's choice goes on to their next plan with the rest of the sheet's presentation.
  - Plans made before keep the template's weights, so earlier plans and their approvals look as they did. Their Sheet panel offers the thickness, with "As this plan was drawn" until one is chosen.
  - The DXF stays AutoCAD R12, the most widely read version, which has no field for line weight. In CAD, line weight comes from the layer's colour, as it always has.
- **The plan's details, filled in by tested code.** Each is filled only into an empty field, never over anything typed, and each is marked as drawn for the surveyor (`plan-details.ts`):
  - **Plan number:** the next after the surveyor's latest numbered plan here, keeping its lettering and zeros ("LS/12/0099" to "LS/12/0100"). A number ending in a year ("1234/2026") gives none. It waits for the surveyor's own confirmation.
  - **Where the land is:** the district, province, DS division, korale and pattu of the surveyor's latest plan that gives a district, since a surveyor mostly works in one area. Each waits for their own confirmation and says it came from their latest plan.
  - **Never carried:** the village and Grama Niladhari division belong to each land and are never carried. Neither is anything about the land itself: its name, owners, extent or boundaries.
  - **Survey date:** the date written on the field sketch ("14/10"), in the latest year that puts it on or before the day the sketch was read in Sri Lanka.
    - A day and month need a slash. With a dot or a dash they also need the year, since "4.10" is a measurement.
    - Read from handwriting, it always waits for the surveyor's confirmation.
    - A sketch with more than one date gives the first.
- **The deed and the old plan are read on the strongest model the plan allows.** They give the title, the description and the boundaries. This is the same model as a sketch's read, and never below the standard tier.
  - In this workspace that is Claude Opus 5.5.
  - A read of up to three photos costs a few US cents more on Opus 5.5 than on Sonnet 5.5. That's small beside a wrong boundary on a legal plan.
  - A typed description stays on the standard model, Sonnet 5.5, since it has no handwriting or Sinhala print to read.
- **A house beside crossing lines.** The room search for a house leaves out both legs of each crossing, and finds rooms from the rest (`facesOf(…, "drop")`).
  - A room that any left-out leg runs through is no room. This covers a leg whose ends both lie on the room's outline (two lines crossing inside it), which crosses none of its sides.
  - The room must still hold nothing else the sketch draws.
  - Elsewhere, crossing lines still make no areas at all.
- **Several joins in one press.** When no single short stroke closes a house's room, each loose end's nearest stroke is tried together. The strokes that are sides of the room are offered in one question and one press ("Join 3 to 2 and 14 to 15"), and checked to close the same room by themselves. Each join is taken off on its own.

## Consequences

- On both live reads of the owner's real job, the house is one offered join from 79.82 m² (81.71 m² printed), with no partial outlines.
- A new plan prints at 0.13 mm. The surveyor confirms the carried number and place once per plan, and each card says where it came from.
- No model is asked to make up a plan's details. A model only reads what the surveyor gave it (the sketch, the deed, an old plan), and what it reads waits for the surveyor like everything else.
- Next: boundaries (North, East, South and West) worked out from the drawing where roads, adjoining lands and other lots are on it. Also the district from the coordinates, once a free boundary dataset is chosen and checked.
