# ADR 0204: Lines from field codes are suggested, never applied

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 191
- **Builds on:**
  - ADR 0203 (the code library in drawing schema 2).

## Context

Total stations and GNSS controllers record a code with each point (MW for a masonry wall, P for a building corner, CP for a concrete post). CAD survey tools (Carlson, Civil 3D, TopoLT) turn coded points into linework, "field-to-finish". Their rules join points in the order they were observed, which goes wrong when a crew observes out of order. A wrong line on a cadastral plan can look like a boundary.

## Decision

**Deterministic suggestions** ([`fieldToFinish.ts`](../../src/core/survey/fieldToFinish.ts)) from the plan's code library:
- consecutive points with the same line or outline code join into one line;
- a number after the code keeps strings apart (MW1 and MW2 are two walls);
- END ends a string and CLO closes it; outline codes always close;
- mark and symbol codes stay as marks.

They appear on the Lots step as suggestions ("Suggest lines from the field codes"), each shown with its points; the surveyor adds the ones that are right. Nothing is drawn until then, and a suggestion never changes a lot or a point.

**The code library is per drawing**, starting from a common list labelled as common usage, not official. The Reference on the sheet lists only codes the plan uses, and `LEGEND_UNREVIEWED` blocks approval until the surveyor marks the codes checked or changes them.

## Consequences

- Out-of-order observations give visibly wrong suggestions the surveyor can skip, never silent linework.
- Two codes on one point, notes after a separator, curves and join-to-point are not supported yet ([DEVELOPMENT_ROADMAP.md](../survey/DEVELOPMENT_ROADMAP.md)).
- An office-wide code library needs a schema change and comes later.
