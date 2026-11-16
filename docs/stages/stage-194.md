# Stage 194: Survey Studio, upload the field data and the plan draws itself

- **Branch:** `feat/survey-194`, from main after stage 193 went live.
- **Migration:** v95 (`20270105090000_survey_instrument_files.sql`). It was applied on 2026-11-16, after the merge, together with v93 and v94, which had never reached production. The read-backs are in [stage 195](stage-195.md#productions-database).
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
  - **Column reading:** column names first, then the values. Easting or northing is settled by the grid only when exactly one order fits. Otherwise the file's shape decides: code second means CASS, easting first; anything else is PNEZC, northing first. The screen says so either way.
  - **Encodings:** UTF-8, or GB18030 with a notice.
  - **Rejected input:** latitude and longitude are refused.
  - **Preview:** the map shows the points, the lot that would be drawn, the lines and the road. The codes are listed with their meanings, and RD codes read as road edges.
  - **Drawing:** one checkbox draws the plan with the import. When the file uses the Survey Department's codes, their list is offered.
- **Readers:**
  - [`gsi.ts`](../../src/core/survey/import/gsi.ts): GSI-8 and GSI-16; coordinate or station words; a code on the same line. It refuses feet, raw observations, code lines standing alone and GSI-8 grid coordinates that were cut.
  - [`sdr.ts`](../../src/core/survey/import/sdr.ts): SDR2x and SDR33 08 and 02 records. A later record replaces an earlier one, as in the SDR, and the surveyor is told. Feet and observation-only files are refused.
  - [`landxml.ts`](../../src/core/survey/import/landxml.ts): CgPoints as northing, easting and elevation; metric units scaled exactly; imperial refused; references left out.
  - [`jobxml.ts`](../../src/core/survey/import/jobxml.ts): Reductions grid coordinates, with deleted points left out and the last day observed taken as the survey date.
  - [`detect.ts`](../../src/core/survey/import/detect.ts) and [`read.ts`](../../src/core/survey/import/read.ts): detection, the files Farbaek can't read (job databases, Trimble DC, Topcon GTS-7) with what to export, and one entry point for the panel and the server.
- **Typing points in, as in CAD** ([`manual-entry.tsx`](../../src/components/survey/manual-entry.tsx), [`fieldbook.ts`](../../src/core/survey/import/fieldbook.ts)). Two tables beside the upload:
  - **Type coordinates**, where a block pasted from a spreadsheet fills the rows;
  - **Bearings and distances**, a field book typed leg by leg (polar input and a traverse in one table). A leg onto a known point reports its misclosure and ratio, unadjusted.
- **Codes.** The Survey Department's list ([`codes.ts`](../../src/core/survey/codes.ts), `DSR_CODES`) is on the Plan step and offered on import. Stations are never lot corners. Its fences, walls, drains and tar edges have their own layers.
- **The review checklist** ([`review-checklist.tsx`](../../src/components/survey/review-checklist.tsx)) lists what was drawn to check, then what the checks still ask for, then the way to approval.
- **Schema v95** lets the stored source keep its true format. Its DB test checks the list matches the app's.

## Reviews

Two independent reviewers read the stage before its PR, one on the draft flow and one on the readers. They found 40 bugs, all fixed with a test each (commits `ed35048d` and `dd26188e`):
- **The draft:**
  - drawing again duplicated lines and replaced a named road;
  - nothing capped the work on a large file;
  - ordering around the centre accepted notched lots;
  - a mark shot twice counted twice;
  - a road was paired from edges hundreds of metres apart;
  - "Street marker" read as a tree.
- **The flow around it:**
  - the Survey Department's list never waited for a check, and swapping lists kept "checked";
  - its fences and drains fell on the walls layer;
  - a version was saved when only a date was filled;
  - History said drawn items waited for a check when they were checked;
  - the checklist named title fields from their keys and ignored export blockers.
- **The panel:**
  - typing re-guessed the columns on every key;
  - one-line XML gave every point the same preview id;
  - numbered codes showed as unknown;
  - the lot outline showed when nothing would be drawn;
  - a failed draw looked like success.
- **The readers:**
  - backtracking patterns that let a crafted 2 MB XML file stall the server;
  - line counting that grew with the square of the points;
  - XML files cut short read as complete;
  - GSI lines with coordinates but no point number silently skipped;
  - a repeated GSI word read as one;
  - an empty remark hid the code;
  - SDR accepted any unit byte but 2 and had no row limit;
  - invisible characters were allowed in point numbers;
  - an elevation column could set off the latitude-and-longitude refusal;
  - CSVs starting with STN were taken for Topcon files;
  - closure notes were counted as repeated rows.

A third reviewer re-checked both fix commits and found 10 more, fixed in `3950ecf3`:
- lines joined from the codes never waited for a check;
- adding a code to a swapped list lifted its check;
- "Electricity post" and "Coconut trees" could become lot corners;
- the preview and the server disagreed above the mark limit;
- pasting another file kept the first file's confirmation and columns, and switching tabs kept the old format;
- zero heights were read as a code;
- "Point No." wasn't understood;
- XML problems inside nested elements had the wrong line;
- the Sinhala joiner was refused.

The browser check then showed that a PNEZC header's "C" wasn't read as the code, which is fixed too.

## Verified

- **Unit tests:**
  - auto-draft and the draft flow: 21;
  - the readers review and re-check: 22;
  - columns: 8;
  - GSI, on Leica's own lines: 9;
  - SDR: 5;
  - LandXML and JobXML: 6;
  - field book: 5;
  - detection: 3.
- **All survey tests:** 259 pass.
- **DB test** for v95 (16 in the file).
- **Gates:** typecheck, lint and the design tests passed.
- **Browser** (dev demo, with the Sample's import panel unlocked for the check and locked again before committing):
  - a pasted PNEZC file read northing first with its reasons, its lot outlined, its building and road drawn;
  - a GSI-16 job read as GSI;
  - a file in the Survey Department's codes, which offered their list, kept station 9001 out of the lot and drew the wire fence.

## Next

- Lots from closed boundary linework, as Carlson and Civil 3D do, for sub divisions.
- Real instrument files from Sri Lankan surveyors as fixtures.
- Text encodings other than UTF-8 and GB18030.
- The GTS-7 XYZ record, once a real Topcon file confirms its axis order.
- The first real model call on production (the owner's check, still open since stage 191).
