# Stage 269: AutoSurvey, curved lot boundaries

- **Date:** 2026-11-24
- **Branch:** `feat/stage-269-curved-lots`, on stage 268's
- **Decision:** ADR 0276
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (rule 1, tested code calculates; rule 5, areas say what kind they are; rule 7, nothing moved; rule 13, proved twice), `farbaek-ui` for the lot's Curves field.

## Why

The brief lists curved lot boundaries among what AutoSurvey doesn't do. A lot with a curved side had its area taken inside straight legs between the points on the curve: short by the segments, on a legal figure.

## What was built

- **`core/survey/lotcurves.ts`:** a lot's curves, each fitted as a line's curve is (ADR 0247), with the area each leg's segment adds or takes, the radius, the length along the arc and the chord; the ring densified for drawing and GeoJSON; DXF bulges; a curve found from its points' numbers; curves carried through a change of corners.
- **`parcel.ts`, `lots.ts`:** the lot's area and perimeter with its curves; the land's outline area with curves on its outer edge.
- **`document.ts`:** `arcs` on a lot, absent unless given.
- **`sheet/draw.ts`, `sheet/compose.ts`:** the curve drawn as one arc and lettered once along its chord with its radius and arc; the drawing's extent reaches the arc; the schedule's one row per curve and its paragraph.
- **`export/dxf.ts`, `export/points.ts`:** bulges on the boundary's curved legs; GeoJSON's polygon within a millimetre of the arc.
- **`qc.ts`:** `LOT_CURVE_NOT_FITTED`, stopping the export and approval.
- **`blockout.ts`, `partition-panel.tsx`:** curved lots aren't divided, and the reason is said.
- **`selection-editor.tsx`, `plan-panels.tsx`:** the lot's Curves field; a curved leg's details.

## Verified

- `lotcurves.test.ts` (10 cases) and `curved-lots.test.ts` (6 cases); see ADR 0276.
- Survey, server and design tests, `tsc --noEmit` with a 4 GB heap, lint on the changed files.
- **Looked at:** a 40 by 20 m lot with a 25 m radius curved north side, at 1:500 on the classic layout: one arc through points 3 to 7 lettered "270°00′00″ 40.00 (R 25.00, arc 46.36)", the extent 0.10796 ha (1,079.560 m², as worked by hand), and the schedule's curve row and paragraph.

## Next

- Curves read from PC/PT codes on lot corners by the automatic draft.
