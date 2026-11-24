# ADR 0250: Sokkia Link's point list and a DXF drawing's points are read

- **Status:** accepted (stage 242, AutoSurvey, 2026-11-23)
- **Builds on:**
  - ADR 0209 (one strict reader per format; the server reads the stored file again);
  - stage 198 (printouts recognised and refused with the job file to upload instead);
  - ADR 0236 (a total station's shots worked out from the SDR);
  - the owner's Item 1 brief: "Fix the input formats: the point-list printout and the DXF. Do not report that a format is supported unless it has passed meaningful tests."
- **Changes:**
  - two readers (`import/sokkialist.ts`, `import/dxfpoints.ts`);
  - two format ids;
  - schema v104, which widens `survey_sources`' format check.

  No new dependency.

## Context

A real job came as three files: the SDR, Sokkia Link's printed point list of it, and Sokkia Link's DXF drawing of its points. Farbaek read the SDR and refused the other two. A surveyor often has only one of them to hand, and the printout is what many offices keep.

## Decision

**The printout** (`sokkialist`) is read by its own layout.
- **Known by its marks:** its "< Condition >" opening and its record table's heading.
- **Columns:** they come from that heading line, on every page. A coordinate line out of its columns is refused with its line number.
- **What's read:** POS and STN records' North, East and Elev, and the Code column.
- **Refused, never converted or guessed:**
  - a distance unit other than metres;
  - a printout listing shots with distances. Farbaek works shots out only from the SDR itself, and the message names the job's .sdr from the printout's own File Name line.
- **The header's point count** is checked against the POS records found (on a real printout it counts them, not the station), so a missing page is caught. When the records match but a point is listed twice, that's said.
- **As in the SDR, a later line for a point replaces an earlier one,** and says so.
- **Observation lines without a distance** are counted and left out.

**A DXF drawing's points** (`dxf`) are read by group codes, with no CAD library.
- **A point** is a POINT entity or a block INSERT, at X (easting), Y (northing) and Z. A POINT at a block's place is the same point drawn twice, read once. A block drawn in another plane is never turned: refused where it would be a point, else left out.
- **Whole files only:** a drawing that stops before its end mark (0, EOF), or before its entities' section ends, is refused, never read in part. Nothing after the end mark is read.
- **Its number** comes from a number attribute (PNT, POINT, PT, NUMBER, ID…), refused when two of them disagree, or from text on one layer at the offset every point of its group shares, as exporting software places its labels.
  - That offset is found from the drawing itself, group by group, counted directly. Each point takes the one text there, never the nearest text: in a tight cluster the nearest is often the next point's. A TEXT is placed by its alignment point when justified (by its start when aligned or fit); MTEXT by its insertion point.
  - Heights (any decimal, "12.5") and repeated texts (codes) are never taken for numbers.
  - Two layers, or two offsets on one layer, that could both be the numbers are refused, as is a point with no text or two texts at its offset.
  - One point alone can't show an offset, so it isn't numbered.
- **Its code** comes from a CODE or DESC attribute, however it's numbered. **Its height** is Z, or on a flat drawing a height attribute, said so; a flat drawing without one says its points have no heights in it. A height attribute disagreeing with Z is refused.
- **What isn't a point:** a group of the same block or entity on the same layer is points only when it has two members or more and 90% or more of it is numbered. A block that appears once (a title block, a north arrow), other blocks, lines, circles and texts are counted and said.
- **Units:** a $INSUNITS other than metres or none is refused. An R12 drawing doesn't say its units: the grid the surveyor confirms decides, and the grid check catches points that don't fit it, as for any points file.

**Each format is said supported only on its tests:**
- synthetic printouts and drawings in the real layouts (`sokkialist.test.ts`, `dxfpoints.test.ts`);
- Farbaek's own DXF read back;
- the real job's files, compared point by point with its SDR on the dev PC only (`real-files.test.ts`, skipped without a local folder).

**Schema v104** adds `sokkialist` and `dxf` to `survey_sources.format`. The owner applies it before the merge. Until then, importing one of them is refused with a sentence saying so; in Generate Plan that refusal comes after the project is made, which leaves it empty. Every other format is unchanged.

## Consequences

- On the real job, the printout gave all 40 points and the drawing 39, both identical to the SDR to the 0.1 mm the files hold. The drawing's station is drawn as a circle, not a point, and is said and left out.
- Not read:
  - shots in a printout (upload the SDR);
  - DWG;
  - a DXF's lines, which aren't survey points;
  - binary DXF;
  - units other than metres.
