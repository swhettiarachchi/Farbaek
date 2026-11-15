# ADR 0203: Several lots per plan, and the classic Sri Lankan sheet

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 191
- **Builds on:**
  - ADR 0198 (Survey Studio as a module), ADR 0201 (the sheet as template data and one scene in millimetres).

## Context

Stage 190 drew one boundary per plan on a layout with a side panel, built before any real plan had been seen. Six plans by a practising licensed surveyor ([REFERENCE_PLANS_ANALYSIS.md](../survey/REFERENCE_PLANS_ANALYSIS.md), structure only) showed what surveyors actually issue: several lots per plan with raised labels (B¹, B², 4ᴬ), roads drawn from two edges with widths in feet, adjoining lands labelled outside the lot with arrows, a Reference of the codes used, one composed title sentence, the extent in hectares beside acres, roods and perches, and bearings and distances overleaf, all on a portrait sheet with slanted lettering.

## Decision

**Document schema 2** ([`document.ts`](../../src/core/survey/document.ts)): lots, roads, adjoining lands, notes, a code library, a structured title (land name, alias, operation, parent lots, the earlier plan, village, pattu, korale), sheet settings and provenance. Still no coordinates: everything names points by id. Schema 1 documents upgrade as they are read (the boundary becomes lot 1, the legend becomes the code library, the panel layout is kept).

**Lot topology from shared point ids** ([`lots.ts`](../../src/core/survey/lots.ts)): each lot's parcel by the existing engine; legs refined where a corner lies on another lot's leg within 0.5 mm; edges used by two lots cancel and the entire land's outline is chained from the rest. Overlaps, gaps, separate pieces and an entire area that differs from the lots' sum are findings; nothing is moved or repaired.

**Road widths are computed**, square across the two surveyed edges where the perpendicular falls inside a segment, and written in feet to the half foot (the international foot), in metres, or not at all.

**The classic template** (`SRI_LANKA_CLASSIC_V1`, [`classic.ts`](../../src/core/survey/sheet/classic.ts)) is the default; the stage 190 layout stays as "Panel layout". Text sizes are shares of the frame height. The title sentence is composed from fields ([`description.ts`](../../src/core/survey/description.ts)) and leaves dotted blanks, never guesses. Paper and scale are chosen automatically (1:500 first, A4 then A3, A2 last) unless the surveyor fixes them. Labels are placed greedily clear of everything drawn; geometry never moves.

**The layout is recorded as observed practice**, not an official specification ([STANDARDS_RESEARCH.md](../survey/STANDARDS_RESEARCH.md), S21 to S24). No names, plan numbers, places or measurements from the reference plans entered the repository; the Sample is synthetic.

## Consequences

- Plans look like what Sri Lankan surveyors issue, so a surveyor can sign one without redrawing it.
- The approval hash covers every point any lot, road or line uses.
- DXF and GeoJSON carry each lot; the sheet's Reference can't list a code the plan doesn't use.
- Captions aren't yet editable per surveyor, and Sinhala and Tamil text are still blocked on the sheet.
