# ADR 0248: A surveyor can leave legs too crowded to letter to the boundaries schedule

- **Status:** accepted (stage 240, AutoSurvey, 2026-11-23)
- **Builds on:** ADR 0242 (labels placed together, and what can't be cleared reported); the owner's AutoSurvey brief §14 (annotation that a cartographer would accept); the boundaries schedule overleaf, which lists every leg's bearing and distance
- **Changes:** one optional sheet setting, and how the sheet is composed when it's on. No migration, no new dependency.

## Context

With bearings and distances on the face, a sub division of narrow lots can't letter every leg clearly at a workable scale: since stage 233 the labels are placed together and what still overlaps is reported, but the surveyor's choices were a larger scale or sheet, or dragging labels by hand. Plans drawn by hand and in CAD handle this the same way: the legs too short to letter are left to a table, and the face says so.

## Decision

**An optional setting, "Leave legs too crowded to letter to the schedule", on the Sheet tab.**

- **Offered only when it can apply:** bearings and distances on the face, and the boundaries schedule overleaf, which lists every leg. Without the schedule a leg left off the face would be nowhere, so the setting does nothing.
- **Absent unless chosen** (`crowdedLegsToSchedule: true`), and removed again when unticked, so every earlier document and its approval stand.
- **What it does:** the sheet is composed as before, with the labels placed together; then each leg whose label still overlaps another label or a point is left to the schedule (of two legs overlapping each other, the shorter), and the sheet is composed again without those labels, at the same scale and on the same paper, so the note's own lines can't move the drawing. Leaving labels off moves the others, so legs crowded by that are added too, for at most four rounds.
- **Kept only when it helps:** the result is used only when the face has fewer overlapping labels and nothing new stops the export (the note can leave too little room for the drawing at that scale). Otherwise every leg stays lettered, and the checks say the option didn't make the face clearer.
- **The face says which:** a note names every such leg, by its corners' point numbers, and says their bearings and distances are in the boundaries schedule. The plan's checks carry the same list, for information, with the way back (a larger scale or sheet, or turning it off).
- **Nothing is lost:** every leg's bearing and distance stays in the schedule overleaf, and the corners keep their numbers on the face, so each leg can be found.

## Consequences

- On a row of eight 8 m lots at 1:1000 (synthetic), the overlapping label pairs went from 9 to 0 on the classic layout and from 14 to 0 on the panel layout, with 8 legs left to the schedule on each. On four deep 5 m lots on the classic layout, it made nothing clearer, so every leg stayed lettered, as the checks say.
- It's the surveyor's choice: by default every leg is lettered on the face, as before.
