# Stage 305: what the live walk of stage 304 turned up

Stage 304 went live (build ecfd2b03a483) and was walked on production as a surveyor would, on the owner's real job. Decisions: ADR 0310, with the one change below.

## The walk

- **A plan read before stage 304:**
  - The house card offered "Join 14 to 15". One press drew the house round its room: 3, 4, 6, 9, 15, 14, 17, 33, 34 and 35, 81.95 m² from the coordinates, against 81.71 m² printed.
  - The Line thickness box showed "As this plan was drawn". Choosing 0.13 mm drew every line of the drawing at 0.13 mm, with the frame at 0.35 mm, and saved as a new version.
- **A new plan from the same SDR file and sketch:**
  - Every line of the drawing came out at 0.13 mm.
  - "Surveyed on" filled itself as 2026-10-14, the printed plan's date. Its card asks to check it, since the sketch also gives 15/10.
  - The lot is 132.70 m², and one press on Join drew the house once.
  - The plan number and district stayed empty: none of the earlier plans here have them typed in.

## What was fixed

- **The old plan's partial outlines stayed under its house:** the three partial building outlines that the reading before stage 304 drew stayed on the plan, under the house. A redraw (a join, a correction, a line put back, the second reading) takes off only what the reading before it proposed. Those outlines came from an earlier version of the reader, so nothing took them off.
- **The change:** a redraw now also takes off lines and symbols an earlier reading drew that the sketch as read now doesn't draw at all, while nobody has confirmed them (`redrawFromCorrection` in `sketchintel/correct.ts`). Lots and roads are left as they are, since their replacement may not be drawn again. One the surveyor confirmed stays, and isn't named.

## Verified

- `house-join.test.ts`: an outline left by an earlier reading goes with the join, and a confirmed one stays.
- The survey, Survey Studio app and component tests pass (1,076). `tsc` and `eslint` are clean.

## Next

- An empty survey date on a plan read before stage 304 could offer the sketch's date in one press.
- Boundaries worked out from the drawing, and the district from the coordinates (ADR 0310).
