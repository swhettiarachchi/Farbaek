# ADR 0274: Least squares for a traverse

- **Status:** accepted (stage 267, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0241 (a traverse's closure, adjusted only by the rule the surveyor chooses).
- **Changes:** the adjustment engine (`adjust/1.1.0`), the traverse's closure note, the rule choice. No migration, no new dependency.

## Context

The owner's brief lists least squares among the calculations AutoSurvey doesn't do. The compass and transit rules spread a traverse's misclosure by proportion. They don't weigh the observations by how well they were measured, and they say nothing about how well they fit. Survey skill rule 7 allows an adjustment only by a method the surveyor chooses, with residuals reported.

## Decision

- **Least squares, a third rule beside the compass and transit rules,** never applied unless chosen.
- **The observations:**
  - each leg's horizontal distance;
  - the first leg's direction from the start's orientation;
  - the angle between each leg and the next.

  These are exactly what the legs were reduced from.
- **The weights:** each observation is weighted by the instrument's precision. Angles have one standard deviation; distances have a constant plus parts per million of their length.
- **The unknowns:** the stations between the start and the closing point. Both ends stay fixed, so a traverse closing on a known point has two observations more than it needs.
- **The solution:** Gauss-Newton on the weighted normal equations, iterated until no station moves by 1e-10 m.
- **What it reports:**
  - each station's correction, applied to the points shot from it as the other rules' are;
  - σ0, the a posteriori standard deviation of unit weight, and whether r·σ0² passes the χ² test at 95% (0.0506 to 7.378 for r = 2);
  - the largest distance and angle residuals;
  - each station's standard deviation, scaled by σ0.
- **The precision used is always said.** Until an instrument's own is kept with the office profile, it's a typical total station's: 5″ angles, 2 mm + 2 ppm distances. The note says so: "a typical total station's, not necessarily yours".
- **The engine is `adjust/1.1.0`:** the compass and transit rules are unchanged, but the engine that records them has a new method.

## Consequences

- A surveyor can adjust a traverse by the method practice expects for careful work, and is told plainly when the misclosure is bigger (or smaller) than the stated precision explains.
- **Not yet:**
  - the instrument's own precision in the office profile;
  - networks with more than one traverse or closing azimuths;
  - heights;
  - error ellipses on the sheet.

## Verified

- `least-squares.test.ts` (5 cases):
  - **Straight run:** a straight run's misclosure split equally between equal legs, with σ0 worked by hand (failing the χ² test for 20 mm on 200 m with a 2 mm instrument), and passing for 3 mm.
  - **Rotation:** the same answer for the traverse turned 30°.
  - **Independent check:** the adjusted stations' observations recomputed one by one give the σ0 reported, and a smaller weighted sum of squares than the compass rule's.
  - **Refusals:** a precision of nothing, and a leg of no length.
- The traverse and Generate tests, with the engine's version.
