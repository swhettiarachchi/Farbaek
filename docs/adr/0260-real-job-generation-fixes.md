# ADR 0260: One survey across its exports, a sketch read twice, and Farbaek's plain corrections

- **Status:** accepted (stage 252, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0233 (Generate Plan);
  - ADR 0249 (the Sketch Intelligence Engine);
  - ADR 0255 (where each number is written);
  - ADR 0257 (a misread number corrected in one press).
- **Changes:**
  - files that repeat each other's points are read as one survey;
  - every sketch read is two reads, merged;
  - the plain misreads the engine would offer to correct are corrected when the sketch is read, as Farbaek's, and can be put back in one press;
  - the reader is told to read lines away from the land too.

  No migration, no new dependency.

## Context: the owner's real job, run as a surveyor would

On 2026-11-24 the owner asked for an end-to-end test on their real job. The test was New Survey, upload the instrument file, its printed point list, its DXF and the field sketch, then Generate Plan, compared with the printed plan. The printed plan was used only as the reference, never as an input. In production, three things went wrong:

1. **The upload was refused before anything was drawn.** The point list and the DXF were "at different coordinates" from the SDR. Every horizontal position agreed to the millimetre. The SDR had no heights for these points, and the other two printed 0, and the clash rule compared heights exactly.
2. **No lot was drawn.** That run's sketch read drew the west, south and east walls, but not the north side (20, 21, 22) or the road. The previous read had drawn the north side but put 14 on the west wall. Each read of the same photo misses something different, so the lot closed only when one read happened to catch every side.
3. **The same misread twice.** Both reads gave the upside-down 20 as 10, a real point on the house wall. The placement check (ADR 0255) found it each time, but drawing the right lot needed the surveyor's press.

## Decision

**One survey across its exports.**

- Every file that gives a point number is compared, in the order files are imported (those with heights first), never only with the first file and never by file name.
- Two files give the same point when they agree to half a millimetre, the same code where both files have codes, and the same height where both have heights. A file whose every height is 0 or missing was exported without heights, and one with no codes was exported without them, so neither disagrees about what it doesn't have.
- A point is kept once, with the best the files say: its place, a height from a file that has one, a code from a file that has one. Every file sends it exactly as kept, so the database keeps it once.
- A real difference stops the start and says what it is: the place, the code or the height, and the two files.
- Every file is still kept as a source, as uploaded.
- The start screen says which files repeat which ("They're the same as job.sdr's, so each is imported once"), and the import stage says it too.

**Every sketch read is two reads, merged by their segments.**

- The two reads run side by side.
- The first read's lines stand as read. Every run of segments (between consecutive numbers, matched as the engine matches numbers) the second drew and the first didn't is added as its own line. A segment from a number to itself is never one.
- A line seen by only one read is read with doubt.
- Readings, symbols and areas are kept once each. A reading both reads gave is certain only if both were sure. Where the two reads give one place different writing of the same kind (a 6 and a 9), both are kept, each in doubt naming the other. A reading only one read gave stays as that read gave it.
- Nothing is invented: every number, line and word comes from one of the reads.
- The read costs two reads' usage. One read that fails leaves the other used alone.

**Farbaek's plain corrections.**

- When a sketch is read, the corrections the engine would offer in one press are made at once. Those are a number written where another surveyed point belongs, whose own number isn't written, and which exactly one point has.
- They're recorded with no person (`by: null`), in one round only: a correction never leads to another.
- Never for a number written twice on its photo, or for two numbers corrected to one point. They're kept only if the corrected reading still draws at least as many lots and asks no more questions than the reading as read.
- What they draw waits for the surveyor, as everything from a sketch does. The item's card, only for an item drawn from that photo, says "Check this one", then "Drawn with 20 where the sketch was read as 10…", with "Put back 10, as read". The sketch report and the version's note list them as Farbaek's.

**The reader reads the whole page:** road sides above or beside the land, the walls along them, and a building's walls inside it, even with nothing written along them.

## Evidence

- **One survey across exports:** on the real job's three exports, run locally, there are no clashes; 40 points are kept; the point list repeats 40 of the SDR's points and the DXF 39.
- **Two reads merged:** on the two production reads of the real sketch (the third and the fourth), run locally:

  | Reads | Lot |
  | --- | --- |
  | Third alone | 112.26 m², through 14 |
  | Fourth alone | none |
  | Merged, either order | the outline 1, 35, 18, 10, 21, 22, with 2, 34, 33 and 5 on its sides |
  | Merged, with 10 read as 20 | 1, 22, 21, 20, 18, 35 at 132.70 m², the surveyor's lot |

- **The printed plan states the deed's extent,** as its surveyor confirmed. The face can print it (ADR 0252), with the computed area in the schedule.

## Not done, and why

- **The title block's facts** are the land's name, lot, earlier plan, village, pattu, korale, district, province, neighbours, stated extent and the surveyor. None is in the survey data or the sketch: a surveyor types them, or Farbaek would read them from the deed or the earlier plan, which isn't built yet.
- **A house drawn as lines inside the lot** without a word is read as lines of unknown kind. The printed plan names it P, permanent building. The surveyor's answer says what it is.
- **The road:** the merged reads may still miss it. The prompt now asks for it, and a production run will show whether it's read.
- **Exact reproduction of the surveyor's own drafting:** their fonts, positions and line weights are their own CAD template. Farbaek draws its classic Sri Lankan layout, the same arrangement, and an office profile can't carry CAD styles yet.
