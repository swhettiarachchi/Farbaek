# Farbaek AutoSurvey: implementation report

The final report the owner's AutoSurvey brief asks for (§28), on 2026-11-23, after stages 222 to 234. It keeps four things apart:
- **Built and tested:** working in the product, with automated tests.
- **Built, not proven on real data:** working and tested, but only on synthetic data so far.
- **Partly built.**
- **Not built.**

Every dataset used in testing is synthetic: no real survey has gone through AutoSurvey yet. Each stage's own record is in `docs/stages/stage-222.md` to `stage-234.md`, and each decision in ADRs 0233 to 0243.

## 1. Survey Studio before AutoSurvey, and its weaknesses

**Before stage 222, Survey Studio was sound but step by step:**
- seven file readers;
- immutable points;
- tested bearings, areas and acres-roods-perches;
- subdivision, and an automatic draft from boundary-mark codes;
- 59 checks enforced on the server;
- the plan sheet, a vector PDF at exact scale, and an R12 DXF;
- approval by the named surveyor.

**The ten largest gaps to the brief** (mapped in stage 222):
1. Import, draft and photo reading were separate steps.
2. One file at a time.
3. Instrument observations refused, and no traverse adjustment.
4. Nothing read from sketches.
5. No office code library, and no curve or join codes.
6. Nothing in the background.
7. Every drafted item ticked one by one before approval.
8. No surveyor defaults.
9. Original photos not kept.
10. CAD editing limited to labels.

## 2. The target architecture, and where each part stands

The brief's sixteen services (§7) are modules in one codebase, not separate services: deterministic code under `src/core/survey/`, server work under `src/server/survey/`, and AI behind `src/server/ai/`.

| Service | Module | Status |
| --- | --- | --- |
| File intelligence | `autosurvey/start.ts` (`kindOfUpload`, `readSurveyFile`), `import/detect.ts` | Built and tested |
| Format adapter registry | `import/read.ts`, one strict reader per format | Built and tested |
| Surveyor profile resolver | `autosurvey/defaults.ts`, `server/survey/defaults.ts` | Partly built: carried code list, sheet presentation and grid; no profile table yet |
| Data normalisation | `import/*` readers, `import/reduce.ts` | Built and tested |
| CRS resolver | `crs.ts`, the start screen's last-confirmed grid | Built and tested: never inferred, always confirmed; no transformations |
| Field-to-finish | `autodraft.ts`, `fieldToFinish.ts`, `grammar.ts`, `codes.ts`, `codelib.ts` | Built and tested: Farbaek's and Carlson's line words (ADR 0243), joins to a point, a code report in the checks; arcs read but drawn straight |
| Sketch intelligence | `autosurvey/sketch.ts`, `server/survey/sketches.ts`, `server/ai/sketch-reader.ts` | Built, not proven on real sketches |
| Source reconciliation | point clashes, sketch-versus-instrument checks, observation checks | Built and tested |
| Survey computation | `angles.ts`, `geometry.ts`, `cogo.ts`, `units.ts`, `reduce.ts`, `adjust.ts` | Built and tested |
| Geometry construction | `autodraft.ts`, `lots.ts`, `partition.ts`, `roads.ts` | Built and tested |
| CAD drafting | `sheet/*`, `export/dxf.ts` | Built and tested |
| Annotation and layout | `sheet/labels.ts`, `sheet/draw.ts`, `sheet/compose.ts` | Built and tested: labels placed together by scored candidates (ADR 0242); what can't be cleared is reported; no leader lines or multi-sheet layout |
| Independent validation | `qc.ts` | Built and tested |
| Exception management | `exceptions.ts`, the "Needs you" list | Built and tested |
| Export and deliverables | `export/*`, `server/survey/pdf.ts`, the export route | Built and tested |
| Provenance and audit | document provenance, versions, stored source files, audit events, jobs | Built and tested |

## 3. Frontend changes actually implemented

- **One start screen** (`/app/survey/new`, stage 222):
  - one drop area with Choose files and Take a photo;
  - what was found in each file;
  - the grid last confirmed, with Change;
  - Generate Plan.
- **The traverse's closure and the rule to adjust it by,** beside each instrument file (stage 231).
- **Sketch reading** on the start screen and on the Draft step, with the surveyor's consent each time (stage 223). The photos read are shown beside their readings (stage 230).
- **Progress from the server:** Generate Plan runs as a job with real stages, shown again after leaving and coming back. No percentages are made up (stage 229).
- **One "Needs you" list** replaces ticking every drafted item (stage 224):
  - its groups are must fix, confirm, and for information;
  - Confirm comes with Undo;
  - Correct links to the step that edits it;
  - "See the sketch" goes to the evidence.
- **The plan's status in the header:** Needs correction, Needs your confirmation, Ready for your review, Approved or Exported (stage 224).
- **Three modes on one project** (stage 227): Express (the default), Professional and Manual CAD.
- **Checked at phone and desktop widths,** in light and dark, on the demo workspace.

## 4. Backend modules actually implemented

- **Generate Plan** (`generateSurveyPlanAction`):
  - every file is read again on the server;
  - nothing is saved until every file is clean;
  - then one project, one source per file and one drawn version.
- **Reducing a total station's observations by radiation:** Sokkia SDR (09, 11) and Leica GSI, with the grid scale factor and averaged faces (ADR 0236).
- **Traverse closure always reported, and adjustment by the compass or transit rule only when chosen** (ADR 0241).
- **Sketch reading with Claude** (ADR 0234):
  - a structured schema, validated before anything is kept;
  - readings compared with the coordinates by tested code;
  - differences held for the surveyor.
- **Exceptions only** (ADR 0235): drawn items need a confirmation of their own only when tested code doubts them.
- **Defaults:** the code list checked last, an office code library (Carlson-style CSV or .fcl) and the sheet's presentation (ADR 0237).
- **Background jobs** with stages (ADR 0239, schema v102).
- **Sketch photos kept** beside their readings, served through row-level security (ADR 0240, schema v103).
- **A benchmark of the deterministic path** (stage 232).
- **Labels placed together** (stage 233, ADR 0242): every movable label offers candidates, which are scored and searched together. For example, a synthetic row of eight 8 m lots at 1:1000 with every dimension on the face went from 26 overlapping pairs to 9.
- **Line words as a grammar** (stage 234, ADR 0243): Farbaek's END and CLO, or Carlson's BEG, END, CLO, JPN and PC/PT. A Carlson `.fcl` library brings its words. A code report in the checks lists the codes the library doesn't know and what reading the lines found.

## 5. Working input formats

| Format | What is read | Status |
| --- | --- | --- |
| Points files (CSV, TXT, DAT, PNEZD and similar) | Point, easting, northing, height, code; columns read from a header or asked about, never guessed | Built and tested |
| Sokkia SDR (SDR2x, SDR33) | Coordinates (08), stations (02), observations (09, 11) reduced by radiation, the traverse closure, adjustment when chosen | Built and tested on synthetic files laid out from Sokkia's document; the surveyor's real file is awaited |
| Leica GSI (8 and 16) | Coordinates, and stations with shots reduced by radiation | Built and tested on Leica's own decode examples |
| LandXML | CgPoints | Built and tested |
| Trimble JobXML | The reductions' final grid coordinates | Built and tested |
| GeoJSON points | Points with a named EPSG system | Built and tested |
| Field book (bearings and distances) | Legs from a known point; closure reported, not adjusted | Built and tested |
| Office code library (.fcl, CSV) | Codes, kinds and layers | Built and tested |
| Field sketch photos (JPEG, PNG, WebP) | Read by Claude with consent | Built, not proven on real sketches |
| PDF, Word, DWG, DXF | Listed and said plainly to be unread | Not built |
| Topcon GTS-7 raw | Not reduced | Not built |

## 6. Survey calculation methods

**Built and tested** (known answers, and where it matters a second implementation):
- Whole-circle and quadrant bearings, parsed and formatted, every quadrant and the wrap at 360°.
- Distances, inverses, polygon area, perimeter and interior angles.
- Acres, roods and perches.
- Self-intersection and zero-length-leg checks.
- Radiation from stations:
  - orientation from the backsight;
  - face left and right averaged;
  - slope to horizontal and vertical;
  - the grid scale factor with height.
- A traverse's linear misclosure and precision, and the compass and transit rules (ADR 0241).
- Lot subdivision by a dividing line (`partition.ts`).
- The stated extent read and compared with the computed area.

**Not built:**
- least squares, and balancing angles before a linear rule;
- curves;
- transformations between coordinate systems;
- earth curvature and refraction on heights. This last one is said wherever heights are worked out.

## 7. Field-sketch capabilities

**Built:**
- **Reading:** up to six photos, shrunk in the browser. Claude reads point numbers, distances, bearings, feature labels, adjoining names and road names, each kept as written.
- **Checking:** every reading is checked against the instrument's coordinates within 2 cm + 1:5,000 and 30″.
- **What the surveyor sees:**
  - agreements are summarised;
  - a difference holds approval until the surveyor answers it;
  - an unknown point number is said;
  - the photo each reading came from is one tap away.
- **Never a source of coordinates:** nothing is drawn or moved from a sketch.

**Not built:**
- positions on the photo, since Claude's are approximate;
- line work and shapes;
- rotated or poor photos are handled only as well as the model reads them, with no preprocessing beyond shrinking.

**Not proven:** no real sketch has been read yet.

## 8. CAD and PDF output

**Built and tested:**
- **PDF:** the plan sheet as a vector PDF 1.7. Tests read it back for page size, print scaling off, embedded fonts, and the boundary drawn at exactly the plan's scale, measured from the PDF's own path operators. A block-out plan PDF is also made.
- **DXF:** Farbaek's own R12 writer. Tests read it back with an independent parser.
  - It holds the plan's drawing: lot boundaries and corners, lines, roads and labels.
  - Spot heights go out in the coordinates CSV, not the DXF.
- **Coordinates CSV, a lots CSV and GeoJSON.**
- **Labels on the sheet are placed together** (ADR 0242). Dimensions on short legs are stacked or split across the line, and lot labels stay inside their lot. Geometry never moves, and what can't be cleared is reported.

**Not built:**
- leader lines or a table of legs for dimensions that can't fit at the chosen scale (labels are placed together by scored candidates since stage 233, and what can't be cleared is reported);
- multi-sheet layout;
- a measured Sinhala and Tamil text test in CAD programs.

## 9. QA and validation coverage

- **51 distinct checks** in `qc.ts`, each with a severity, the affected item, the evidence, the next step and what it blocks. 28 of them block the plan, its export or its approval, enforced on the server.
- **Before anything is saved:** a point given two places, points that don't fit the chosen grid (swapped columns said, never fixed), and an unreadable file all stop Generate Plan.
- **Observation checks:** a point both given and shot, or shot from two stations, with the difference said.
- **Doubts tested code raises on a drawn item:** an inward corner, a stated extent that differs, a road of uneven width, a line that jumps. Each needs the surveyor's confirmation.

## 10. Benchmark results

These come from synthetic data only, on the dev PC (Pentium Gold G6400, 4 threads, 7.8 GB); details are in `docs/survey/BENCHMARKS.md`.

- **The deterministic path** (read, draft, check and compose, PDF, DXF) takes about 40 ms for a 320-point job and about 50 ms for a 3,070-point job. The PDF is most of it.
- **Not measured:** uploads, database writes, the job record, sketch reading with Claude, and the browser's preview.

So the brief's 30-second target can't be called met or missed until a real Generate Plan on production is timed. Since stage 235, production times every run's stages itself, and `scripts/vps/autosurvey-timings.ps1` reads them for the owner (ADR 0244).

## 11. Test results

- **`pnpm test` on stage 234's branch:** 4,518 tests pass, 17 skipped, in 500 files.
- **Survey Studio's own tests:** 557 in 45 files, covering readers, calculations, the draft, checks, exceptions, sketches, jobs, the traverse, Generate Plan and the detailed import. The schema tests run against the real migrations in PGlite.
- **`pnpm lint`, `pnpm typecheck` and `pnpm build` pass.**
- **A fresh review agent read each stage's risky files after every check had passed.** It found real faults in each stage it read, for example 6 in stage 223, 5 in stage 230 and 9 in stage 231, all fixed with tests.
- **Not run:**
  - Generate Plan against a real database, since the demo workspace can't save and this PC runs no database;
  - a real instrument file;
  - a real sketch.

## 12. Build and deployment

| PR | Stages | State | Schema |
| --- | --- | --- | --- |
| #286 to #292 | 222 to 228 | Merged, live | none |
| #293 | 229 (background jobs) | Merged, live | **v102:** the owner applies it; the code works without it |
| #294 | 230 (sketch photos kept) | Merged, live (build c96322bebc79) | **v103:** the owner applies it; the code works without it |
| #295 | 231 and 232 (traverse, benchmark) | Merged, live (build 397d43d92a1a) | none |
| #296 | 233 (label placement) and this report | Open | none |
| #297 | 234 (line words, code report) | Open, builds on #296 | none |

Production deploys main by itself. Whether v102 and v103 are applied isn't confirmed. `scripts/vps/check-migrations.ps1` reads both back.

## 13. Incomplete capabilities

**Not built:**
- **Labels and layout:** leader lines and a leg table for dimensions that can't fit; multi-sheet layout.
- **Codes:** drawing curves (PC/PT arcs are drawn straight, and said); offsets, rectangles and jogs; a firm's own word list.
- **Computation:** least squares; balancing angles first; adjusting a field book's legs.
- **Defaults:** a surveyor profile table (equipment, title block, plan numbering).
- **Jobs:** resuming a cut-off import or sketch read (a run cut off after its import can be finished since stage 235); a timer for the jobs sweep; incremental regeneration (a correction saves a new version and re-checks the whole plan).
- **Files:** reading PDFs, Word files, DWG and DXF; Topcon raw files; keeping a camera's full-size original.
- **Platform:** tracking the brief's success metrics (§26); malware scanning of uploads; signed download links.

## 14. Remaining risks

- **No real job has been run end to end.** The SDR reader, the traverse and the sketch reader are proven only on synthetic data built from the manufacturers' documents. The surveyor's Bankuwatta SDR file is the first real test.
- **Sketch readings can be plausibly wrong.** The instrument check catches a misread number only where there is a coordinate to compare it with. A misread name or note is shown as read, for the surveyor to check.
- **Telling carried coordinates from control** rests on Sokkia's derivation codes and a tolerance. Codes from instruments newer than Sokkia's 1999 document aren't known. Unknown records never move and never close a traverse, and the closure names its route.
- **Migrations v102 and v103 are the owner's to apply.** Until then, jobs and kept photos are said not to be saved, but nothing else breaks.
- **Data leaves Sri Lanka** when sketches are read. It goes only with the surveyor's consent, each time, and that consent says so.
- **The brief's 30-second target** depends on the network and the database, which haven't been timed.
