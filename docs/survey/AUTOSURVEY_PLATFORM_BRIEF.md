# The AutoSurvey platform brief (2026-11-28): what's built, what isn't, and the order

On 2026-11-28 the owner asked to develop AutoSurvey into a fully automated, AI-powered plan generation platform. The brief has four sections and two notes:

1. a backend that deeply understands every upload;
2. fully automated generation;
3. later changes and additional information;
4. a simple frontend.

The notes ask to use every relevant skill and that accuracy comes first; and that every kind of survey data be recognised and genuinely understood.

This page maps every requirement to the code, says plainly what isn't built, and gives the order the gaps are built in. `AUTOSURVEY_REPORT.md` is the full report of what exists. The "Status" column counts strictly: anything missing is Partly.

## 1. The backend

| Requirement | Where it is | Status |
| --- | --- | --- |
| Analyse every coordinate and survey data file | `import/detect.ts` (format from the content), one strict reader per format in `import/*`, every file read again on the server | Built |
| Understand sketches, handwriting, numbers, measurements, symbols | Claude reads each sketch three times side by side (`server/survey/sketches.ts`, ADRs 0260, 0265). Readings and the drawing's lines, symbols and areas are kept as written (`autosurvey/sketch.ts`) | Built |
| Match the sketch to the surveyed coordinates | Numbers matched to points; where each is written checked against the coordinates (`photoPlaces`); a number written where another point belongs is asked about and corrected in one press (ADRs 0255, 0257, 0260) | Built |
| Identify boundaries, walls, roads, buildings, access | `sketchintel/interpret.ts`: the lot, lines by kind, roads with their width, a house as the room its walls close round, joins offered (ADRs 0249, 0262, 0309, 0310); field codes (`autodraft.ts`, `fieldToFinish.ts`) | Built |
| How the sources relate | Sketch against instrument, file against file (`pointClashes`), observations against coordinates; the second reading checks the plan against the photo (ADR 0271) | Built |
| Missing information, inconsistencies, conflicts | 59+ server checks (`qc.ts`), the "Needs you" list (`exceptions.ts`), measurements on the sketch against the coordinates, another job's sketch, a too-small photo | Built |
| Survey calculations and geometry | Bearings, distances, areas, traverses with Bowditch, transit or least squares, COGO constructions, partitions, curves (`angles.ts`, `geometry.ts`, `cogo.ts`, `adjust.ts`, `construct.ts`, `partition.ts`, `lotcurves.ts`) | Built |
| A complete plan: details, annotations, measurements, descriptions | Sheet, labels, dimensions, leaders, schedules, several sheets; title details filled from earlier plans and the sketch, the deed read into the title (ADR 0310) | **Partly.** North, East, South and West aren't worked out from the drawing; the names of adjoining lands written on the sketch are read but not used |
| Independently verify the output | The second reading against the photo (ADR 0271, 0308), the server checks on every save, approval bound to the exact version | Built |
| Claude for interpretation, deterministic code for every number | Claude only reads; every coordinate, distance, area and line is tested code (survey skill, rule 1) | Built |
| Never invent | Unreadable values are listed and asked about; nothing about the land is carried from another plan | Built |

## 2. Automated generation

| Requirement | Where it is | Status |
| --- | --- | --- |
| One action from upload to plan | Generate Plan: files read, project made, plan drawn, sketches read and checked, deed read (ADRs 0233, 0239, 0294) | Built |
| No manual interpretation of every point | The lot, lines, buildings and roads drawn from codes and the sketch; only doubts wait for the surveyor (ADR 0235) | Built |
| All geometry, dimensions, annotations, symbols, descriptions | See section 1 | **Partly**, as above |

## 3. Later changes and additional information

| Requirement | Where it is | Status |
| --- | --- | --- |
| Upload more coordinates or survey data to an existing project | "Add to this plan" on the Plan step (stage 306, ADR 0311): read, checked against the plan's points, imported, and the plan updated | Built |
| Add new sketches or reference documents | The same card: a new sketch read with the ones the plan keeps, the surveyor's corrections and joins kept; the deed into the title | Built |
| Extra measurements, corrections, changed boundaries or features | Lots step, Plan step editor, the assistant (spoken or typed), one-press corrections | Built |
| Find what changed and update only the affected parts | `updateForNewPoints`: only what the new points change is redrawn; anything confirmed, edited or taken off stays, and is said (stage 306) | Built |
| Recalculate and validate | Every save is checked again; geometry is worked out from the points each time | Built |
| History, traceability, undo and redo | Append-only versions with notes, the History step compares any version with the latest in words, sources with SHA-256, provenance per item, undo and redo in the editor | **Partly**: no way to go back to an earlier version |
| A simple update experience | One card, one press, what changed said with a link to the comparison (stage 306) | Built |

## 4. The frontend

| Requirement | Where it is | Status |
| --- | --- | --- |
| Upload, generate, review, approve, print | Express: Generate Plan, the "Needs you" list, Approve, Export (ADR 0238) | Built |
| Open a project, add information, Farbaek updates the plan | "Add to this plan" (stage 306) | Built |

## Recognition of every kind of survey data

| Requirement | Status |
| --- | --- |
| Format and structure identified from the content | Built: points files, Sokkia SDR, Leica GSI, LandXML, Trimble JobXML, GeoJSON, field books, Sokkia Link printouts, DXF points |
| GNSS and RTK data | Built for coordinate exports (CSV, TXT, LandXML, JobXML). Raw GNSS observations (RINEX) aren't coordinates, and stay out |
| Total station raw data | Sokkia SDR and Leica GSI reduced and adjusted. **Not built:** Topcon, Nikon and Carlson RW5 raw files |
| Point IDs, codes, descriptions, measurements told apart | Built: columns from a header or asked, never guessed |
| Sketches, handwriting, symbols | Built (section 1) |
| Unreadable, missing, duplicated, conflicting | Built: a file that can't be read refuses itself with what to upload; repeats kept once; a point number with two places stops the import and is named |
| Original data preserved and traceable | Built: each source file kept with its SHA-256, the sketch photos kept with the plan, provenance on every drawn item |
| Validated before geometry | Built: an import is all or nothing; the plan is drawn only from files that read cleanly |
| PDF, Word and DWG | **Not built**: each needs a new dependency, which the owner approves first |

## The order

Each stage is its own branch and PR, with tests, a fresh review, an ADR where a decision changes, and a live walk as a surveyor once merged.

1. **Stage 306, add to an existing plan.** One card on the plan: drop more survey files, sketches or the deed. Farbaek:
   - reads them with the same readers;
   - names any point that conflicts, and imports nothing over it;
   - redraws only what the new points change. A waiting line that gains points is redrawn, not drawn twice, and a waiting lot or road is redrawn from the new marks. Anything confirmed stays, and is named when the new points bear on it.
   - reads the sketches again with the ones already kept, and the deed into the title;
   - says what changed, with a link to the comparison.
2. **Stage 307, go back to an earlier version.** One press on the History step saves an earlier version as the newest, so an update can be undone as a whole.
3. **Stage 308, the boundaries described from the drawing.** The names of adjoining lands written on the sketch are placed beside the lot's sides. North, East, South and West are then filled from those names, the roads and the other lots, each waiting for the surveyor.
4. **Stage 309, more total station formats.** Topcon, Nikon and Carlson RW5 raw files are read from their published format documents. They are reduced with the same tested code as SDR and GSI, and tested on files laid out from those documents.
5. **Owner's call:**
   - reading PDFs, Word files and DWG (each a new dependency);
   - the district worked out from the coordinates (a public boundary dataset to download and check).
