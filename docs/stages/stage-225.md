# Stage 225: AutoSurvey, part 7: a total station's observations worked out into coordinates

- **Date:** 2026-11-23
- **Branch:** `feat/stage-225-observations`, from `feat/stage-224-exceptions` (PR #288, which carries #286 and #287)
- **Decision:** ADR 0236
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio`:
  - rule 1: tested code calculates;
  - rule 6: raw observations immutable, results with method and version;
  - rule 7: nothing adjusted without the surveyor's chosen method;
  - rule 13: known-answer tests;
  - the survey-calculations guide's edge cases.

## What the owner asked

"dont stop unit full build the feature fully automation". The largest gap left for real jobs was §13: a job holding the instrument's raw measurements was refused, and the owner's surveyor's Sokkia job may be one.

## What was built

- **`src/core/survey/scale.ts`:** the grid scale factor, shared with the sketch checks.
- **`src/core/survey/import/reduce.ts`:**
  - one shot worked out from its setup (orientation by backsight, zenith angle, grid scale, heights);
  - a setup's shots averaged per point, with spreads said.
- **`src/core/survey/import/sdr.ts`:**
  - reads 01 (vertical convention, prism constant), 02 (stations, instrument height), 03 (target height), 07 (backsight), 09 (shots, face left and right, corrected) and 11 (reduced shots), in degrees, gons or mils;
  - reduces them station by station, carrying a traverse forward when a station's record has no coordinates;
  - checks every point worked out twice, and lists what it left out by reason and line.
- **The import records the reduction** in the source's settings (engine, points, stations), from Generate Plan and from the step-by-step import.
- **The start screen** says how many points were worked out from observations, with the reader's notes on scale, prism constant and checks.

## What a fresh review found, and what changed

A fresh agent checked every byte offset against the reference and probed the reader:

1. **A second backsight at a station re-oriented the shots taken before it** (wrong coordinates, up to the change in orientation). Each shot now carries the orientation in force when it was taken.
2. **Vertical angles from the horizontal weren't wrapped to one turn,** so a face-left 355° (5° down) or face-right 175° was left out with an untrue reason. Both are now normalised.
3. **Slow on large jobs** (time grew with the square of the shots): arrays are now pushed in place, and the spread of many shots to one point is found without comparing every pair beyond 200. 20,000 shots now take well under a second.
4. **A station with blank coordinates and no shots was dropped silently.** It is now listed with its line.
5. **The spread was twice the distance from the mean,** not the largest gap between two shots. Now it is the largest gap.
6. **Messages:**
   - a 01 record that doesn't give the vertical convention is named as such, not as missing;
   - a blank distance is "an angles-only shot";
   - stations are counted only when a worked-out point came from them;
   - what was left out is counted as records.
7. **An impossible station height could give infinite coordinates.** Such heights are refused, and no shot is kept unless it works out to finite numbers.

## Verified

- **Tests:**
  - 8 on the reduction, against hand-worked answers on SLD99's central meridian at height 0, where the scale factor is exactly k0:
    - a level shot;
    - an oriented shot with a zenith angle;
    - a corrected reading and a reduced shot;
    - heights, and refusals without a backsight or with impossible readings;
    - face averaging and its spread;
    - the scale factor itself.
  - 3 on a whole SDR33 job laid out byte by byte, every coordinate checked to 1e-9 m:
    - a station, a backsight check 7.6 mm off (the grid factor on 100 m), face left and right averaged, a shot 10° up;
    - a traverse station without coordinates and a shot from it;
    - a check over 2 cm named;
    - left-outs grouped by reason;
    - a local grid;
    - the same job in gons.
  - 7 after the review: a second backsight, vertical angles from the horizontal face left and right, SDR2x observation records in mils, the zenith guess and its refusal, an unused station, the station count, and 20,000 shots under a second.
  - All 80 import tests pass, the earlier ones unchanged.

## Not done, and why

- **No traverse adjustment or closure report.** It needs the surveyor's choice of method (rule 7).
- **Leica GSI and Topcon GTS-7 observations aren't reduced yet.** The engine is format-independent, so they are next.
- **Not tried on a real Sokkia job.** Whether F1 distances already include the prism constant needs the surveyor's `bankuwatta.sdr`; the import names the constant, and the backsight check shows a systematic error.
