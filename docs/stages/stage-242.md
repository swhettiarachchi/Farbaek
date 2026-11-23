# Stage 242: AutoSurvey, Sokkia Link's point list and DXF points read

- **Date:** 2026-11-23
- **Branch:** `feat/stage-242-printout-dxf`, from `feat/stage-241-sketch-intelligence`
- **Decision:** ADR 0250
- **Migration:** v104 (`20270114090000_survey_more_formats.sql`), which widens `survey_sources`' format check. The owner applies it, before the merge. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio`: one strict reader per format, nothing converted or guessed, real client data kept out of tests, a format claimed only on its tests.

## What the owner asked

"Fix the input formats: the point-list printout and the DXF. Do not report that a format is supported unless it has passed meaningful tests." A real job's printout and DXF were both refused.

## What was built

- **`import/sokkialist.ts`:** Sokkia Link's printed point list.
  - Its POS and STN records are read by the columns its own heading gives.
  - Refused: a unit other than metres, or shots with distances (pointing to the job's .sdr).
  - Checked: the header's point count. A later line replaces an earlier one, as in the SDR.
- **`import/dxfpoints.ts`:** a DXF drawing's points, by group codes.
  - **Points:** POINT entities and block INSERTs.
  - **Numbers:** from a number attribute, or the text at the offset every point shares. Never the nearest text, never heights or repeated texts, and never a guess between two layers or two offsets.
  - **Codes and heights:** from attributes.
  - **Groups:** a group is points when 90% or more of it is numbered. The rest is counted and said.
  - **Units:** $INSUNITS other than metres is refused.
- **Wiring:** the formats are detected from their contents and read by `readPoints`. The start screen and the detailed import take .dxf. Stage 198's refusal of the printout stays for Sokkia reports without the record table.
- **Schema v104**, and a plain sentence when it isn't applied yet.

## Verified

- **`sokkialist.test.ts`** (synthetic printouts in the real columns):
  - stations, points and codes;
  - a blank height;
  - units, and a missing unit;
  - shots refused, naming the .sdr;
  - a missing page caught by the point count;
  - a later line replacing an earlier one;
  - a coordinate out of its column, a bad number and a hidden character, each refused with its line;
  - only a station, or nothing.
- **`dxfpoints.test.ts`** (synthetic drawings):
  - Sokkia-like blocks, with two points 0.07 m apart whose nearest labels are each other's;
  - attributes with a code and heights on a flat drawing;
  - a height clash refused;
  - Farbaek's own DXF read back;
  - units;
  - a point without its number, and one with two;
  - a turned block;
  - a north-arrow block left out;
  - two layers both numbering the points, refused;
  - binary and broken files.
- **The real job, locally** (`real-files.test.ts`, skipped without a local folder):
  - the printout's 40 points and the drawing's 39 are identical to the SDR's;
  - the drawing's station is a circle, said and left out.

## Review

A fresh review agent reproduced 15 faults. All are fixed, each with a test in `review242.test.ts`.

**The DXF reader:**
1. A drawing cut short was read in part, without a word. It's now refused unless its entities' section and the file both reach their end marks.
2. A blank line or an end-of-file character after the end mark refused a good file. Nothing after the end mark is read now.
3. MTEXT was placed at its direction vector (its 11 and 21). It's placed by its insertion point now.
4. Two number attributes: the first won, and an empty first one hid a filled second. All of a block's number attributes must now agree, or the block is refused.
5. A title block with a NO attribute became a point. A block that appears once is left out now.
6. Far-off blocks of another kind could hide the points' labels. Labels are now judged group by group.
7. A POINT drawn at a block's place stopped both being numbered. It's read as one point now, and said.
8. A turned north arrow refused the whole drawing. It's left out now, and only a turned point is refused.
9. A block numbered by its label lost its CODE and ELEV attributes. They are kept now.
10. Heights with one decimal ("10.5") were taken as numbers. Any decimal is a height now.
11. Aligned or fit TEXT was placed by its end, which moves with its length. It's placed by its start now.
12. Large or dense drawings were slow (quadratic). Labels are now found through position hashes, with a test reading 10,000 points.

**The printout reader and detection:**

13. A binary DXF got the job-database message. It now says what it is.
14. The point count accepted the station, or repeated records, in place of a missing page. It now counts POS records only, and says when a point was listed twice.
15. A printout listing one station twice was taken for points. It's refused now.

**Noted, not changed:**
- A grid of points closer than three label heights, or two points within a few millimetres, is refused as ambiguous: that's the rule.
- `$MEASUREMENT 0` with no units is now a warning.
- Before v104, Generate Plan creates the project before the import is refused, so the owner applies v104 first.

## Not done, and why

- **Shots in a printout** aren't worked out: the SDR is the source for them.
- **A DXF's lines** aren't read as features: they're the drawing, not survey points.
- **DWG and binary DXF** aren't read.
