# Stage 228: AutoSurvey, part 7 continued: Leica GSI observations

- **Date:** 2026-11-23
- **Branch:** `feat/stage-228-gsi-observations`, from `feat/stage-227-modes` (PR #291, which carries #289 and #290)
- **Decision:** ADR 0236 (its "Leica GSI" section)
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio`:
  - rule 1: tested code calculates;
  - rule 4: never assume a bearing's convention;
  - rule 7: nothing adjusted.

## What was built

- **`src/core/survey/import/gsi.ts`:**
  - station lines (84 to 86, 88) set up stations, and shots (21, 22, 31, or 32 and 33, with 87) are read with their codes;
  - angles in gons, decimal degrees, packed degrees-minutes-seconds and mils;
  - each station's circle is oriented by its first shot to a point the file gives, since GSI doesn't say whether the instrument oriented it;
  - shots are worked out by the stage 225 engine, and later shots to known points are checks;
  - what can't be worked out is listed by reason and line.
- The import records the reduction, as for Sokkia.

## Verified

- **Tests:** 3 new, and the raw-only refusal updated:
  - Leica's own decodes (75.675 gon, 218°57′58″ packed) and an impossible packed angle;
  - a GSI-16 job: an angles-only backsight orienting a circle read 30° off, a shot worked out to hand arithmetic on SLD99, and a distance shot to the backsight agreeing within 2 cm;
  - a station with no shot to a known point, placing nothing and saying why.
- All 83 import tests pass.

## Not done, and why

- **Not tried on a real Leica job.** Whether word 22 is always the zenith angle on a given instrument's format file is taken from Leica's word table.
- **Topcon GTS-7 raw files** aren't read: no official layout was found (research notes).
