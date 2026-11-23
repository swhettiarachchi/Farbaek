# Stage 231: AutoSurvey, part 7: a traverse's closure, and adjustment by the surveyor's chosen rule

- **Date:** 2026-11-23
- **Branch:** `feat/stage-231-traverse`, from `feat/stage-230-sketch-photos` (PR #294)
- **Decision:** ADR 0241
- **Migration:** none. The closure and the adjustment are kept in the import's settings.
- **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: rule 7 (adjust only with an explicitly chosen method, and report before and after), rule 13 (prove it twice) and the survey calculations guide;
  - `farbaek-ui` and `farbaek-human-made`: pills, the check on the chosen one, plain sentences.

## What was built

- **`src/core/survey/adjust.ts`:** the compass rule (Bowditch) and the transit rule, as tested arithmetic (engine `adjust/1.0.0`).
  - Each station's correction is returned, and so is the largest.
  - The transit rule is refused when no leg runs in the misclosure's direction.
- **`src/core/survey/import/closure.ts`:** finds the traverse in a total station job.
  - **Traverse stations:** a station set up from an earlier station's shot. It has either no coordinates, or the ones the instrument carried forward from that shot (within 5 mm plus 300 ppm of its length). Records keyed in, or given as control by their Sokkia derivation code, are control and never move.
  - **The closing point:** control the traverse closes on, chosen through the most stations.
  - **The closure, reported every time:** the misclosure with its easting and northing, the length, and "1 in N".
  - **With a rule chosen:**
    - stations move by their corrections, and points move with the station they were shot from;
    - control, the closing point and heights stay put;
    - a rule that can't be used is refused, never ignored.
- **The Sokkia SDR reader** records each station and uses the closure. When a rule is chosen, its notes say so instead of "nothing was adjusted". The closing point is said once, with the closure, not again as a check.
- **The choice:** "Keep as shot" (the default), "Compass rule" or "Transit rule". It sits beside the closure on AutoSurvey's start screen and in the detailed import, and each choice re-reads the file at once.
  - The server reads the file again with the same rule.
  - A rule sent for a file Farbaek doesn't adjust stops the run before anything is saved.
- **Recorded:**
  - the import's settings keep the closure and each station's correction;
  - the plan's version note says "the traverse adjusted by the compass rule (Bowditch) as chosen".

## Verified

- **`adjust.test.ts`, 6 tests:**
  - hand-worked answers for both rules on a synthetic loop;
  - a second implementation that corrects each leg and runs the legs from the start, landing exactly on the closing point, in every quadrant;
  - no correction when the traverse closes exactly;
  - every refusal.
- **`import/traverse.test.ts`, 6 tests, on SDR33 records laid out byte by byte:**
  - the closure said with nothing moved;
  - compass and transit placements by hand arithmetic;
  - detail points moving with their station, with control, the closing point and heights unmoved;
  - the same traverse found when the instrument carried coordinates forward;
  - control given before the shot closes it, and a record written after the shot doesn't;
  - refusals for no traverse and for a format that isn't SDR.
- **`generate.test.ts`, 2 new tests:** Generate Plan keeps the points as shot without a rule, and records the rule with the import and in the version's note. A rule for a CSV stops it before anything is saved.
- **In the browser** (demo workspace, synthetic SDR loop on SLD99, at 382 px and 1280 px, light and dark), on the start screen:
  - the closure shows;
  - each of the three choices re-reads the file and updates the notes;
  - "Keep as shot" puts it back;
  - the pills wrap cleanly at phone width with no sideways scroll.

## What a fresh review found, and what was fixed

A review agent on the risky files found 9 real faults after every check passed. It confirmed 6 with a temporary test and 3 by reading. All are fixed, and the 6 have tests of their own.

1. **A later check shot beat the loop's closure on its own start.** Now every shot to control counts, and on a tie the loop's own start wins.
2. **A computed detail point shot again became the closing point.** Only control can close a traverse now, decided by the record's derivation code, and a computed record is judged against the shot it followed.
3. **A station's recorded shot back to the previous station counted as a closure.** A back-shot re-measures the leg and isn't a closure, and a loop needs three stations.
4. **"Moved by up to" understated the movement** when a later shot to a station disagreed. A station now stands where its setup put it, with or without a rule.
5. **Control keyed in after it was shot, within 1 mm, moved.** Keyed-in records are control and never move.
6. **Carried stations on a projected grid were never found,** since the instrument's scale and Farbaek's differ by millimetres. The tolerance is now 5 mm plus 300 ppm of the shot's length.
7. **A long traverse could break the import's 8 KB settings limit.** The stations named and the corrections kept are capped at 40, rounded to 0.1 mm.
8. **The import panel kept a rule for a typed table or another format.** The rule now counts only while the file is read as SDR, and switching the way in clears it.
9. **The import panel's confirmation still said "never moves"** with a rule chosen. It now says what happens, and changing the rule asks again.
   - The detailed import's version note now names the rule, within the 200 characters a note holds.
   - A refused rule now says why, instead of "1 row can't be read".

## Not done, and why

- **Least squares, and balancing angles before the linear rule:** the angular misclosure isn't worked out from the file yet.
- **A field book's legs** still report their closure without an adjustment.
- **Leica GSI** jobs have no traverse to adjust: each station is oriented on a known point.
- **Not run on a real job:** the surveyor's SDR file is still awaited. Both ways a station can get its coordinates are tested.
- **The detailed import panel's choice** wasn't looked at in a browser. The start screen was, and both use the same component.
