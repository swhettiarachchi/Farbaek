# Stage 194: Survey Studio, upload the field data and the plan draws itself

- **Branch:** `feat/survey-194`, from main after stage 193 went live.
- **Migration:** v95 (`20270105090000_survey_instrument_files.sql`), applied by the owner before the merge.
- **Why:** the owner asked for the simplest path. Upload the data from the instrument, let Farbaek draw the plan, then review, verify and approve. They also asked whether drawing should happen on upload or on a separate instruction. The decision and the reasons are in ADR 0209.

## Plan

1. **Research.** Instrument export formats and the Survey Department's own rules, plus how survey CAD software imports and draws. The report is `reports/Survey instrument export formats.md`.
2. **The automatic draft** (`autodraft.ts`):
   - the lot through the boundary marks;
   - lines from the codes;
   - the road from its edges;
   - the stated survey date and the surveyor.
   Inferences are marked for checking and hold approval until checked.
3. **A smart import table.** It reads the columns itself and says why, previews the points and the lot on a small map, and lists the codes with their meanings.
4. **Readers** for Leica GSI, Sokkia SDR, LandXML and Trimble JobXML. One entry point serves the panel and the server, and unreadable files are named with what to export instead.
5. **The Survey Department's codes** (DSR Chapter XXII) as a second starting list, and PNEZC as the default order.
6. **The review checklist** on the Plan step.
7. **The work around it:** docs, reviews, the build, and a PR with the migration hash.

## Done

- **Research.** Four researchers and a report, covering:
  - Leica GSI word layouts and units, from Leica's GSI ONLINE guide and Format Manager reference;
  - Sokkia's SDR interface document, byte by byte;
  - Trimble's JobXML 5.2 schema;
  - LandXML CgPoints;
  - Chinese controllers (Hi-Survey, LandStar, Cube-a, Emlid) and CASS;
  - the Survey Department's DSR Chapter XXII (PNEZC, boundary and station codes, point numbering);
  - Civil 3D, Carlson, TBC and Leica Infinity import and field-to-finish.
- **The automatic draft** ([`autodraft.ts`](../../src/core/survey/autodraft.ts)):
  - It runs straight after an import when the plan has no lots, and from "Draw the plan from the points" for older projects.
  - Inferences carry the new provenance `auto` and raise `AUTO_ITEMS_UNREVIEWED` until checked.
- **The import table** ([`import-panel.tsx`](../../src/components/survey/import-panel.tsx), [`columns.ts`](../../src/core/survey/import/columns.ts)):
  - **Column reading:** column names first, then the values. Easting or northing is settled by the grid only when exactly one order fits; otherwise the pair is read northing first, as in PNEZC, and the screen says so.
  - **Rejected input:** latitude and longitude are refused.
  - **Preview:** the map shows the points, the lot that would be drawn, the lines and the road. The codes are listed with their meanings, and RD codes read as road edges.
  - **Drawing:** one checkbox draws the plan with the import. When the file uses the Survey Department's codes, their list is offered.
- **Readers:**
  - [`gsi.ts`](../../src/core/survey/import/gsi.ts): GSI-8 and GSI-16; coordinate or station words; a code on the same line. It refuses feet, raw observations, code lines standing alone and GSI-8 grid coordinates that were cut.
  - [`sdr.ts`](../../src/core/survey/import/sdr.ts): SDR2x and SDR33 08 and 02 records. A later record replaces an earlier one, as in the SDR, and the surveyor is told. Feet and observation-only files are refused.
  - [`landxml.ts`](../../src/core/survey/import/landxml.ts): CgPoints as northing, easting and elevation; metric units scaled exactly; imperial refused; references left out.
  - [`jobxml.ts`](../../src/core/survey/import/jobxml.ts): Reductions grid coordinates, with deleted points left out and the last day observed taken as the survey date.
  - [`detect.ts`](../../src/core/survey/import/detect.ts) and [`read.ts`](../../src/core/survey/import/read.ts): detection, the files Farbaek can't read (job databases, Trimble DC, Topcon GTS-7) with what to export, and one entry point for the panel and the server.
- **Codes.** The Survey Department's list ([`codes.ts`](../../src/core/survey/codes.ts), `DSR_CODES`) is on the Plan step and offered on import. Stations are never lot corners.
- **The review checklist** ([`review-checklist.tsx`](../../src/components/survey/review-checklist.tsx)) lists what was drawn to check, then what the checks still ask for, then the way to approval.
- **Schema v95** lets the stored source keep its true format. Its DB test checks the list matches the app's.

## Verified

- **Unit tests:**
  - auto-draft: 8;
  - columns: 7;
  - GSI, on Leica's own lines: 9;
  - SDR: 5;
  - LandXML and JobXML: 6;
  - detection: 3.
- **DB test** for v95 (16 in the file).
- **Gates:** typecheck, lint and the design tests passed.
- **Browser** (dev demo, with the Sample's import panel unlocked for the check and locked again before committing):
  - a pasted PNEZC file read northing first with its reasons, its lot outlined, its building and road drawn;
  - a GSI-16 job read as GSI;
  - a file in the Survey Department's codes, which offered their list, kept station 9001 out of the lot and drew the wire fence.

## Next

- Lots from closed boundary linework, as Carlson and Civil 3D do, for sub divisions.
- Real instrument files from Sri Lankan surveyors as fixtures.
- Text encodings other than UTF-8.
- The first real model call on production (the owner's check, still open since stage 191).
