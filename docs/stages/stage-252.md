# Stage 252: AutoSurvey, the owner's real job run end to end

- **Date:** 2026-11-24
- **Branch:** `fix/real-job-1`, on stage 250 (PR #314).
- **Decision:** ADR 0260
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`, with its field-sketch reference: the numbers beside each side, turned numbers, the surveyor's own answers about the house wall and the two corners not clearly visible;
  - deterministic geometry only: every position from the instrument's data.

## Why

The owner asked for their real job to be run through AutoSurvey exactly as a surveyor would: New Survey, upload the survey data and the field sketch, Generate Plan. The result was compared with the printed plan, which was the reference and never an input. Every difference was to be explained, and the engine (not the drawing) fixed.

## The run in production, and why it was wrong

New Survey; the SDR, its printed point list, its DXF and the sketch photo uploaded together; Generate Plan.

1. **Refused at the upload.** The point list and the DXF were said to be "at different coordinates" from the SDR. Every horizontal position agreed to the millimetre. The cause: the SDR has no heights for these points, the other two print 0, and the clash rule compared heights exactly.
2. **Generated with the SDR and the sketch only.** The first file's duplicates were removed, as a surveyor would.
   - The plan drew three walls, the well, and lines from the sketch, at 1:500 on A4 portrait in the classic layout, but **no lot**.
   - That read missed the north side (20, 21, 22) and the road.
   - It read the upside-down 20 as 10 again. The placement check offered "It's 20".
   - The house wall (12, 9, 6, 4, 3, as the surveyor named it) came out as lines of unknown kind.
   - The sketch's 1.58 and 1.43 were asked about, beside the two corners not clearly visible when measured.
3. **The title block was empty:** plan number, land name, lot, earlier plan, village, pattu, korale, district, province, neighbours, stated extent, survey date and surveyor. None of these is in the survey data. The sketch has the date written without its year.

**The root cause of the missing lot:** each read of the same photo misses something different. The previous production read had the north side but put 14 on the west wall. No single read closes the lot reliably.

## What was built

- **One survey across its exports** (`autosurvey/start.ts`): repeats are recognised, each point is imported once, every file is kept as a source, and the start screen says which file repeats which.
- **Two reads, merged by segments** (`autosurvey/sketch-merge.ts`, `server/survey/sketches.ts`): what either read drew is kept, what only one drew is read with doubt, nothing is invented, and the usage of both reads is counted.
- **Farbaek's plain corrections** (`sketchintel/correct.ts` `autoCorrections`, used when a sketch is read): shown on the item's card with "Put back N, as read", listed in the sketch report as Farbaek's, and waiting for the surveyor.
- **The reader** is asked to read road sides and building walls away from the land too.

## A fresh review, and what it changed

A review agent found ten real faults. All are fixed, each with a test.

1. **A real height difference could slip past the start check** and stop the import after the project existed: points were compared only with the first file that gave them, in upload order, not import order. Every file is now compared, in import order.
2. **Two uploads with the same name** sent a repeat unchanged, which the database refused. Files are told apart by their place.
3. **A DXF without codes still clashed with a coded instrument file,** with a message about coordinates. A file without codes doesn't disagree about codes, and a clash now says what differs.
4. **A height another file gave was dropped.** A point keeps a height from whichever file has one.
5. **An item drawn through Farbaek's correction led with "The sketch and the survey agree".** It leads with "Check this one".
6. **Two reads giving one place different numbers both stayed certain.** Both are now in doubt, each naming the other.
7. **Merge segments didn't match numbers as the engine does** ("07" and 7), and a closed line could make a segment from a number to itself.
8. **Auto-corrections could join two corners** (two numbers corrected to one point) or renumber a correct copy of a number written twice. Neither is made now, and corrections are kept only when they help.
9. **Farbaek's correction could show on an item drawn from another photo.** Only that photo's items show it.
10. **Areas without numbered corners collapsed into one.** They're kept apart by name.

## Verified

- **Locally, on the real job's data** (never committed):
  - the three exports give 0 clashes and 40 points in every upload order, and every repeat is sent exactly as kept;
  - the two production reads merged give the lot outline in either order;
  - with 10 read as 20, as the placement check reads it, the lot is 1, 22, 21, 20, 18, 35 at 132.70 m², the printed plan's lot.
- **Tests:**
  - `start.test.ts`: one survey exported three ways, heights first, a real difference still stopped;
  - `sketch-merge.test.ts`: segments, either way round, an alternative path, a closed outline, readings once, certain only if both were sure;
  - `correct.test.ts`: Farbaek's corrections only from plain suggestions, as written, once per number;
  - Survey Studio's whole suite passes.

## Still to do on this job, and why

- **Rerun in production** once this is live, with all four files, and compare again.
- **The title block's facts:** a surveyor types them, or Farbaek reads them from the deed or the earlier plan (not built). The surveyor's own details are a one-time profile.
- **The house as a building:** a surveyor's answer, or a reader that recognises a building drawn without a word.
- **The road,** if the merged reads still miss it.
- **The surveyor's own drafting style** (fonts, positions): an office profile can't carry CAD styles yet.
