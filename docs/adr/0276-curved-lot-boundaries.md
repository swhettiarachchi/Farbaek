# ADR 0276: Curved lot boundaries

- **Status:** accepted (stage 269, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0247 (a line's curve from PC to PT: the circle through its first, middle and last points, every one within 2 cm), which left lots straight because their areas weren't built for curves.
- **Changes:** the lot record (`arcs`), the parcel's area and perimeter, the land's outline area, the sheet, the boundaries schedule, the DXF, GeoJSON, the checks, subdivision and the editor. No migration, no new dependency.

## Context

The owner's brief lists curved lot boundaries among what AutoSurvey doesn't do. A lot fronting a curved road, or with a curved wall as its side, has a boundary that's an arc between surveyed points. Drawn as straight legs between those points, its area is short by the segments between each leg and the arc. The area is a legal figure, so it has to be the area inside the curve.

## Decision

- **A curve is a run of the lot's corners:** from the curve's start (PC), through points on it, to its end (PT), as surveyed. Stored as `arcs: [{ from, to }]` by index in the lot's corners, as a line's curve is. `to` counts on past the last corner when the curve runs through the first (index k is corner k mod their count), so a curve is held wherever the ring starts. Absent when a lot has none, so earlier plans and approvals are unchanged.
- **One circle, whichever way the ring runs:** the circle is fitted with the curve's points in one order (the end whose coordinates come first, first), so two lots sharing a curve, which walk it in opposite directions, fit the same circle and their segments cancel exactly. The sheet, the DXF and GeoJSON draw that same circle.
- **A curve only when it is one:** every point of the run within 2 cm of the circle through its first, middle and last points, each further along than the last, under a full circle (`fitArc`, ADR 0247). A run that isn't one stays straight, and `LOT_CURVE_NOT_FITTED` stops the export and the approval. The area would otherwise be the straight legs', not the land the plan says.
- **The area:** the shoelace over the corners, plus for each leg of a curve the circular segment between the leg and the arc, r²/2 (θ − sin θ), signed so a curve bowing out adds and one bowing in takes away, whichever way round the corners run. The perimeter counts each curve's length along the arc. The method says so: "coordinate (shoelace) method on grid coordinates, with the circular segments of its curves".
- **The land:** a curve on the land's outer edge adds its segments to the land's area too. One between two lots adds to one and takes from the other, so the land's area is unchanged. (A curved leg split by another lot's corner is left straight in the outline; that's said by the area check if it matters.)
- **Nothing moves:** the corners stay as surveyed. The points on a curve are drawn and numbered as the surveyed points they are.
- **The sheet:** the curve drawn as one arc, within 0.02 mm of it on paper, and lettered once, along its chord: the chord's bearing and distance, then its radius and length along the arc, "270°00′00″ 40.00 (R 25.00, arc 46.36)". Labels keep clear of the arc itself.
- **The boundaries schedule:** one row per curve, from its first point to its last, with the chord's bearing and "40.00 (chord)"; under the table, "3 to 7 is a circular curve through 4, 5, 6: radius 25.000 m, 46.365 m along the arc". The lot's and the land's areas say they include the curves' segments.
- **The DXF:** the boundary polyline carries each curved leg's bulge (tan of a quarter of its turn), so a CAD program draws the true arc. The curve's label is its chord's, with its radius and arc.
- **GeoJSON** has no arcs: the curve as short chords within a millimetre of the arc. The exact area is in `area_m2`.
- **Subdivision** works on straight boundaries only: a curved lot isn't offered for division, and a block-out plan refuses one, saying why.
- **The editor:** on a lot, "Curves": each curve's points by number, a slash between curves ("4 5 6 / 9 10 11"), checked to be the lot's corners in a row, through the first corner too. Every change of a lot's corners (the Lots step, the selection panel, the assistant, a dragged corner) carries each curve to its points' new places; one whose points are no longer corners in a row is taken off (and said where the editor can say it), never refitted through other points. Tapping a curved leg shows its chord, radius and length along the arc. The version comparison says when a lot's curves change.
- **Crowded legs to the schedule** take a curve as it's lettered: its chord, from its first point to its last.

## Consequences

- A curved frontage is drawn, measured and exported as surveyors draw it, with the area the land has.
- **Not yet:**
  - curves read automatically from PC/PT codes on lot corners (the automatic draft takes lots from boundary marks only);
  - a curve given by its radius rather than points on it;
  - walls along a curved side drawn as the boundary (ADR 0269 matches straight sides only);
  - dividing a curved lot;
  - leaving a curve's label to the schedule when crowded.

## Verified

- `lotcurves.test.ts` (12 cases, areas worked by hand): a half disc (πr²/2, perimeter πr + 2r, radius, arc length, chord), checked again by fine chords; a curve bowing in, either way round; a curve through the ring's start; runs that aren't curves, with why; DXF bulges; two lots sharing a curve with the land's area unchanged; a curve on the outline; a straight lot exactly as before; curves found by their points and carried through a change of corners.
- `curved-lots.test.ts` (9 cases, through the whole plan): the lot's and land's area, no area mismatch; one arc and one label on the sheet; one schedule row and the curve's paragraph; DXF bulges on the four curved legs; GeoJSON within 0.05 m² of the exact area; a curve that isn't one stops the export; a curved lot isn't divided.
- **Looked at:** the curved lot's sheet and schedule, drawn to PNG.
- **A fresh review** checked the area against its own Green's-theorem integral (a full disc of two curves, stadiums and S-curves, every rotation and direction: agreement under 1e-4 m²) and found six faults, all fixed, each with a test that fails without its fix: the Lots step dropped every lot's curves when saving; the assistant's corner edit kept curves by stale index, refitting them through the wrong points (7.7 m² too much); the version comparison never mentioned curves; a shared curve of an even number of points was fitted to two circles; a crowded curve went to the schedule as its first straight leg; a curve through the ring's first corner couldn't be held.
- **Still to do, said by the review:** an arc isn't checked for crossing the lot's other legs or another lot (the overlap checks use straight legs); a lot with only two corners on a curve can't carry it (it fails closed, as an area mismatch).
