# ADR 0236: Farbaek reduces a total station's observations, by radiation, adjusting nothing

- **Status:** accepted (stage 225, AutoSurvey part 7, 2026-11-23)
- **Builds on:** ADR 0233 (AutoSurvey's start), the Sokkia SDR reader (stage 194), the owner's AutoSurvey brief §13 ("Deterministic survey computation engine")
- **Changes:** an SDR job holding the instrument's measurements no longer has to be computed elsewhere first.

## Context

Until now a Sokkia job that held only observations (09 records: slope distance, vertical and horizontal readings) was refused: "compute the coordinates in Sokkia Link and export again". The owner's surveyor's job (BANKUWATTA, a Sokkia SET650X) may be such a job. The brief asks for deterministic computation from raw observations, reproducible, with inputs, method and tolerances recorded, nothing adjusted to look right, and missing information named.

## Decision

**Radiation from each occupied station, by tested arithmetic** (`src/core/survey/import/reduce.ts`, format-independent):

- **Orientation:** a shot's circle reading becomes an azimuth through the station's backsight (07: the azimuth to the backsight point minus the circle reading there). A corrected (MC) reading is already an azimuth.
- **Distances:**
  - The slope distance and zenith angle give the horizontal and vertical distances. Face right (F2) is turned to face left first.
  - The vertical-angle convention comes from the 01 record. Without one, the readings are taken as zenith angles only when every one is near 90° or 270°, and that is said.
  - The angle unit (degrees, gons, mils) comes from the header.
- **The grid:** the horizontal distance is multiplied by the projection's scale factor at the station and the station's height (`gridScaleFactor`, `src/core/survey/scale.ts`: k0(1 + x²/2R²) · R/(R + h)), and the factor range used is said. A local grid's factor is 1.
- **Heights:** station height + instrument height + vertical distance - target height, when all four are known. Earth curvature and refraction aren't applied (a few millimetres at 200 m), and that is said.
- **Several shots to one point from one setup** (face left and right, repeats) are averaged, and a spread over 2 cm is said.
- **A traverse:** a station set up with no coordinates in its record takes them from an earlier station's shot. That is unadjusted radiation, station to station.
- **The prism constant** the 01 record gives is said; the recorded distances are taken as the instrument corrected them.

**Nothing is adjusted.** The SDR's own rule stands: a later record replaces an earlier one, and coordinates override an observation. Every such pair is a check, and the difference is reported:
- a point the file gives coordinates for that is also shot (the backsight, a control point, a station);
- a point shot from two stations.

Differences over 2 cm are named point by point. Adjusting a traverse needs the surveyor's chosen method (survey skill, rule 7) and is not done here.

**Recorded with the import:** the raw observations stay in the stored source file byte for byte. Each worked-out point carries the line of the shot it came from. The source's settings record the engine (`reduce/1.0.0`) and how many points and stations. Shots that can't be worked out are listed by reason with their lines, never guessed.

## What it doesn't do

- **No traverse adjustment** (Bowditch, transit, least squares) and **no closure report** beyond the checks above. Those need the surveyor's choice of method.
- **Leica GSI observations, Topcon GTS-7 raw files and 11 records' heights** are not reduced yet. 11 records' heights are left out because what their vertical distance includes isn't given. The engine is format-independent, so GSI can follow.
- **Not tried on a real Sokkia job yet:** the tests are synthetic, laid out byte by byte from Sokkia's interface document. Whether a real SET650X job records F1 distances before or after the prism constant needs the surveyor's file. The import says which constant was recorded, and the backsight check shows a systematic error at once.

## Consequences

- A Sokkia job of observations can go straight into Generate Plan. Its points are worked out on the confirmed grid, and its checks are shown on the start screen and in the import.
- A wrong orientation, scale or prism constant shows as a backsight check that disagrees, not as a quietly wrong plan.
