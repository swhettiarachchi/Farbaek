# ADR 0247: A line's PC to PT run is drawn as the curve through its surveyed points

- **Status:** accepted (stage 239, AutoSurvey, 2026-11-23)
- **Builds on:** ADR 0243 (line words: Carlson's PC and PT were read, and their runs drawn straight and said); the owner's AutoSurvey brief §13 (field-to-finish: curves from control codes)
- **Changes:** the drawing document (an optional field on a line), reading the codes, the sheet and the DXF. No migration, no new dependency, no change to any approval of a plan without curves.

## Context

Field crews shoot a curved wall, kerb or drain as a run of points: the first coded PC (point of curvature), the last PT (point of tangency), and points along it between. Since stage 234 Farbaek read those words and drew the run as straight segments between the points, saying so. On a plan, a curve drawn as a polygon reads as a different object.

## Decision

**A PC to PT run is drawn as the circular curve through its surveyed points, when they make one.**

- **The curve is worked out, never assumed:** the circle through the run's first, middle and last points. It's drawn only when every point of the run lies within 2 cm of that circle (`ARC_FIT_M`, Farbaek's default, not a rule), each further along it than the one before, no more than a quarter circle past the one before (three points always lie on some circle, so shots out of order would otherwise make a curve that turns almost all the way round), turning less than a full circle. A run of two points (nothing between PC and PT), points in a straight line, points off the circle, points too far apart along it, or a run that ends where it began stay straight segments, and the code report says which and why.
- **Curve words are read in the order written,** so "PT PC" on one point ends one curve and begins the next there (a reverse or compound curve). A line holds at most 50 curves; past that the rest are drawn straight and said, so the plan can always be saved.
- **No point moves.** The curve passes through every surveyed point of the run exactly; only the line between them changes from chords to the curve.
- **Stored with the line** as `arcs: [{ from, to }]`, indexes into its points, and absent when the line has none, so a plan without curves has exactly the document, and the approval hash, it had before. A line drawn straight before this stage becomes its curve when the plan is drawn again from the points (or added from the Lots step's suggestions), and waits for a look like a new line; the comparison before approval says a line's curves changed.
- **The sheet's scale and fit, and the DXF's extent, take a curve's bulge,** not only its points. A line missing one of its points draws no curve, since its indexes would point at the wrong points (and the checks stop the plan until it's fixed).
- **Drawn by the same tested code everywhere:**
  - the sheet (screen and PDF) draws chords no more than 0.02 mm of paper from the curve at the plan's scale;
  - the DXF writes each curved segment exactly, as a bulge (tan of a quarter of its angle) on the polyline's vertex, which CAD programs draw as a true arc.
- **Checked each time it's drawn:** a curve whose points no longer make one is drawn straight and said in the plan's checks, never hidden.
- **Lot boundaries stay straight between their corners.** A curved boundary changes a lot's area, and that calculation isn't built: the curve is drawn on lines (walls, fences, kerbs, drains), not on lots.

## Consequences

- A curved wall or kerb shot with PC and PT reads as a curve on the plan and in CAD.
- The radius isn't printed: a curve's radius, length and chord on a plan are figures the surveyor decides to show, and that's a later decision.
