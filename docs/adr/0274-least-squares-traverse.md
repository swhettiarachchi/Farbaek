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
- **The weights:** each observation is weighted by the instrument's precision, as its specification states it (ISO 17123-3 and 17123-4): the standard deviation of one direction, and of a distance as a constant plus parts per million of its length. An angle is the difference of two directions, so it is weighed at √2 times the direction's figure, and the first leg's direction from the start's orientation likewise.
- **Up to 100 legs.** The work grows with the cube of the stations and runs while the plan is drawn: 100 legs take about a tenth of a second, 500 about ten. A longer traverse is refused, with the compass and transit rules offered, so no file (made to be long or not) holds the server up.
- **The unknowns:** the stations between the start and the closing point. Both ends stay fixed, so a traverse closing on a known point has two observations more than it needs.
- **The solution:** Gauss-Newton on the weighted normal equations, iterated until no station moves by 1e-10 m.
- **What it reports:**
  - each station's correction, applied to the points shot from it as the other rules' are;
  - σ0, the a posteriori standard deviation of unit weight, and whether r·σ0² passes the χ² test at 95% (0.0506 to 7.378 for r = 2), and on which side it falls when it doesn't: above (the misclosure is more than the precision explains: check the observations) or below (they agree better than it, as when the instrument already adjusted them or the closure is within rounding);
  - the largest distance and angle residuals;
  - each station's standard deviation from the stated precision, scaled by σ0 only when the test fails high, as adjustment programs report it, so a fit better than the precision never makes a station look surer than the instrument can.
- **The lasting record says it too:** the version's note ("least squares (5″, 2 mm + 2 ppm, typical)") and the checks and sources report carry the figures and whose they are, not just the rule's name.
- **The instrument's own precision, from the office profile:** a total station in an office profile may state its precision (a direction in seconds, a distance in mm plus ppm, as its specification gives them). The instruments that could have made a file are the profile's total stations that export its format, or all of them when none is said to. Generate Plan weighs by their precision only when every one of them states one and they agree: never one instrument's figures for a file another may have made.
- **The precision used is always said.** The note names the instrument ("as your office profile gives for the Sokkia CX-105"), or, without one, says it's a typical total station's (5″ angles, 2 mm + 2 ppm distances), "not necessarily yours". The start screen reads the file with the same precision, so what it shows is what Generate sends, and the rule's hint says where to give the instrument's own.
- **Stored as JSON in the profile's body,** which has no shape check in the database: no migration. Older profiles read as before, with no precision.
- **The engine is `adjust/1.1.0`:** the compass and transit rules are unchanged, but the engine that records them has a new method.

## Consequences

- A surveyor can adjust a traverse by the method practice expects for careful work, and is told plainly when the misclosure is bigger (or smaller) than the stated precision explains.
- **Not yet:**
  - the profile's precision for a file imported into an existing plan (the project doesn't record which profile it started from), so that import weighs by a typical instrument's and says so;
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
- **The instrument's precision:** the closure note names the office profile's instrument and never says "typical" when it's used; a finer instrument makes the same misclosure a worse fit; the compass rule never reads it; Generate reads it from the chosen profile on the server and records it with the closure.
- **The profile:** precision kept with a total station, older profiles still read, out-of-range figures refused, the form's three figures all or none, and the choice between instruments (`profile.test.ts`).
