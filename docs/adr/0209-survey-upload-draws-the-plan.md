# ADR 0209: Uploading the field data draws the plan, as a draft the surveyor checks

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 194
- **Builds on:**
  - ADR 0198 (points are immutable; tested code calculates);
  - ADR 0202 (AI drafts from words, the engine computes);
  - ADR 0204 (field-to-finish codes);
  - the survey skill's rule 3 (the coordinate system is confirmed by a person).

## Context

The owner asked for the simplest possible path: upload the data from the instrument, let Farbaek draw the plan, then review, verify and approve. Two questions needed answers:
1. How should a surveyor get the data in?
2. Should the plan be drawn automatically on upload, or only when the surveyor gives a separate instruction?

The research (`reports/Survey instrument export formats.md`, notes in `research_notes/Survey instrument export formats/`) found:
- **The Department's file format.** The Survey Department's regulations (DSR Chapter XXII) require total station data as a **PNEZC** file: point, northing, easting, height, code. They also define the boundary point and station codes, and number control stations from 9000.
- **Instruments write different formats.** Leica GSI, Sokkia SDR, LandXML and Trimble JobXML each have a documented layout. Chinese controllers write PNEZ-style CSVs, and CASS writes `name,code,E,N,H`.
- **No major product works out column order from the data.** Each relies on a named format or template plus a preview.
- **Drawing on import is a known pattern.** Civil 3D draws linework on import behind a Yes/No switch; Carlson and Trimble Business Center use a separate command.
- **Parcels come from closed linework, not from unordered points.** Carlson's per-code inspector is the best model for reviewing.
- **Practitioners value field-to-finish for checking.** Results depend on how carefully the crew coded.

## Decision

**One upload box for every instrument export.**
- **Formats:** CSV, TXT and DAT (any column order, PNEZC included), Leica GSI-8 and GSI-16, Sokkia SDR2x and SDR33, LandXML and Trimble JobXML. Each is read by its own strict reader (`src/core/survey/import/`).
- **Same reader on both sides:** the server reads the stored file again with the same code, so what was previewed is what is imported.
- **Refused, with what to export instead:**
  - instrument job databases, Trimble DC and Topcon GTS-7 (layouts not confirmed);
  - feet (which foot isn't said);
  - raw observations (Farbaek doesn't reduce them);
  - latitude and longitude;
  - GSI-8 grid coordinates that can't have kept their leading digits.
- **Hostile files:** the readers run on the server, so none may slow down on a crafted file. XML is scanned in one pass without backtracking patterns; an XML file cut short is refused whole.

**Typing is the second way in, as in CAD.** AutoCAD and ZWCAD take points by coordinates or by polar input ("@25.40<45°30'"). Survey Studio offers the same beside the upload, as two tables rather than a command line, because a table shows every value at once and can be checked against the field book:
- **Type coordinates:** point, northing, easting, height and code; a block pasted from a spreadsheet fills the rows.
- **Bearings and distances:** a field book typed leg by leg from a known point, the way Sri Lankan field books record each leg (DSR Chapter XXII §22.2.2). A leg that ends on a known point is a check: its misclosure is shown and never adjusted, since adjusting a traverse needs the surveyor's authorisation (survey skill, rule 7).
Both go through the same reader, preview and confirmation as a file.

**The table reads the file itself and says why.**
- **Column roles:** column names decide first. Without them, the values decide: distinct numbers or names make the point number, words make the code, and the coordinates form a pair plus an elevation.
- **Easting or northing:** the project's grid settles which is which only when exactly one order puts every point inside it. Across most of SLD99 both orders fit, so otherwise the file's shape decides, and the screen asks the surveyor to check:
  - a code in the second column is the CASS `.dat` layout that Hi-Target and South write (name, code, easting, northing, height), read easting first;
  - anything else is read northing first, as PNEZC has it.
- **The preview shows:**
  - a small map of the points, with the lot that would be drawn and the lines from the codes;
  - each code with its meaning;
  - every unreadable row, with its line number.
- **Survey Department codes:** when a file uses them, the Department's code list (annexes 3 and 10) is offered for drawing this plan. In it, MW is a mark on a wall.

**The plan is drawn on import, by default, as a draft.**
- **The one deliberate act before drawing:** the surveyor confirms that the coordinates are metres in the project's grid and that the columns are right. Rule 3 asks a person to confirm the system, and this confirmation is the same act as the import.
- **Opting out:** a checkbox, on by default, draws the plan in the same step. Leaving it off imports the points only.
- **What is drawn** (`src/core/survey/autodraft.ts`, `autodraft/1.1.0`):
  - The lot goes through the boundary marks.
    - Boundary marks are library marks whose meaning isn't a utility post, light, culvert, tree, well, valve, manhole, station, benchmark, monument or kilometre post (whole words, so "Street marker" is still a mark). A numbered code ("CP3") is looked up by its letters.
    - A mark shot again at the same place (within half a millimetre) counts once.
    - They are taken in the order observed when that order makes a simple outline; any inward corner is named for the surveyor to check ("a corner of the land, or a mark inside it?").
    - Failing that, they are ordered around their centre only when every mark lies on their convex hull: a convex land has one outline, a notched one doesn't.
    - Otherwise no lot is drawn, and the reason is given. A sub division with marks inside the land is the usual case; it goes through the Lots step or the Draft step.
  - The lines and buildings come from the field codes, by the field-to-finish rules.
  - A road is drawn from edges coded RD1 and RD2, or RDL and RDR, only when the two edges make one road between 1 and 60 m wide, and only on a plan with no road yet.
  - Drawing again never draws a line twice or replaces a road the surveyor named.
  - **Limits:** 500 marks, 500 points a line, 300 lines and 200 points a road edge. What doesn't fit is listed as not drawn, with the reason.
  - The survey date is taken from the file where it states one (JobXML).
  - The surveyor block is filled from the importing surveyor's profile.
- **What waits for a check:**
  - Inferences carry the provenance `auto`: the lot (which marks make it), the road (which edges pair) and the date. Each waits for the surveyor's "Looks right" and holds approval until then (`AUTO_ITEMS_UNREVIEWED`).
  - Lines drawn from codes wait for a check too. The codes are the crew's, but which points join into a line is inferred, so a wrong code in the field draws a wrong wall. They are checked together on the Lots step ("They look right"), and the checklist counts them as one item.
  - A code list put in place for the surveyor (the common list, or the Survey Department's on a swap) waits for a check (`LEGEND_UNREVIEWED`). A swap records the list as unchecked, so adding codes to it afterwards doesn't lift the check.
- **Limits on drawing:** nothing is drawn over a plan that has lots, or over a version whose settings can't be read. No point is moved or changed. A version is saved only when a lot, a line or a road was drawn.

**One list of what's left.** The Plan step opens with a checklist, once anything is drawn:
- the items drawn for the surveyor to check, each with where to check it and the same name the editor gives it;
- what the checks still ask for before approval or export;
- once nothing is left, a link to approve.

Approval remains a separate act.

## Why on import, rather than a separate command

- **Fewer steps and dead ends.** Most surveyors import to draw the plan. A separate command adds a step and a dead end ("I imported, where's my plan?").
- **Safety comes from what follows, not from a second click.** It rests on:
  - a draft that is never final, with every inference marked and blocking approval;
  - nothing ever drawn over the surveyor's own lots;
  - a way to opt out (the checkbox);
  - "Draw the plan from the points" for projects that already have points.
- **The deliberate act a person must make is already there:** confirming the units and the grid.

## Consequences

- **Lots that can't be inferred.** A plan whose lots can't be found from the marks (sub divisions, an unordered set of marks) still needs the Lots step or a sentence on the Draft step. A later stage could build lots from closed boundary linework, as Carlson and Civil 3D do.
- **Points can't be fixed in Farbaek.** Points are immutable, so a code fixed in the field book means importing again under a new number. Lines can be redrawn on the Lots step.
- **No real instrument files yet.** The readers were built from vendor documentation and synthetic files. Real files from Sri Lankan surveyors (Leica, Sokkia, South, Hi-Target) are the next test.
- **Text encoding.** Files are read as strict UTF-8, and otherwise as GB18030 (CASS often writes the Chinese GBK code page), with a notice to check the codes.
- **Schema v95** widens the stored source's format list to the readers above.
