# Farbaek AutoSurvey: implementation report

The final report the owner's AutoSurvey brief asks for (§28), on 2026-11-23, after stages 222 to 243. It keeps four things apart:
- **Built and tested:** working in the product, with automated tests.
- **Built, not proven on real data:** working and tested, but only on synthetic data so far.
- **Partly built.**
- **Not built.**

Every dataset in the automated tests is synthetic. One real job, supplied by the owner, has been run on the dev PC only, outside the repository (section 7). Each stage's own record is in `docs/stages/stage-222.md` to `stage-267.md`, and each decision in ADRs 0233 to 0274.

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
| Surveyor profile resolver | `profile.ts`, `server/survey/profiles.ts`, `autosurvey/defaults.ts` | Built and tested (stage 248, ADR 0256, schema v105): office profiles (grid, instruments and their formats, code library and line words, sheet, statement), versioned, picked by the files' formats, the last choice or the only one, else asked once; recent plans' defaults when there's none. Learning from corrections not built |
| Data normalisation | `import/*` readers, `import/reduce.ts` | Built and tested |
| CRS resolver | `crs.ts`, the start screen's last-confirmed grid | Built and tested: never inferred, always confirmed; no transformations |
| Field-to-finish | `autodraft.ts`, `fieldToFinish.ts`, `grammar.ts`, `codes.ts`, `codelib.ts`, `codehints.ts` | Built and tested: Farbaek's and Carlson's line words (ADR 0243), joins to a point, a code report in the checks, suggestions for unknown codes added in one press (ADR 0246); PC to PT runs drawn as curves through their points (ADR 0247) |
| Sketch intelligence | `autosurvey/sketch.ts`, `sketchintel/*`, `server/survey/sketches.ts`, `server/ai/sketch-reader.ts` | Built and tested: readings, and the drawing's lines, symbols and areas joined to the survey as proposals with evidence (ADR 0249); the owner's real sketch read by the production reader three times (stages 244 to 246); a number written where another point belongs is asked about (ADR 0255), and corrected in one press, with what it drew redrawn (ADR 0257) |
| Source reconciliation | point clashes, sketch-versus-instrument checks, observation checks | Built and tested |
| Survey computation | `angles.ts`, `geometry.ts`, `cogo.ts`, `units.ts`, `reduce.ts`, `adjust.ts` | Built and tested |
| Geometry construction | `autodraft.ts`, `lots.ts`, `partition.ts`, `roads.ts` | Built and tested |
| CAD drafting | `sheet/*`, `export/dxf.ts` | Built and tested |
| Annotation and layout | `sheet/labels.ts`, `sheet/draw.ts`, `sheet/compose.ts` | Built and tested: labels placed together by scored candidates (ADR 0242); what can't be cleared is reported; leader lines for crowded legs (ADR 0259); no multi-sheet layout |
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
- **Nothing lost on a refresh** (stage 250, ADR 0258): the start screen keeps its files in the browser until the plan is generated, and sketch photos until their read is saved; a read that didn't finish is offered on the project, with its consent.
- **Progress from the server:** Generate Plan runs as a job with real stages, shown again after leaving and coming back. No percentages are made up (stage 229).
- **One "Needs you" list** replaces ticking every drafted item (stage 224):
  - its groups are must fix, confirm, and for information;
  - Confirm comes with Undo;
  - Correct links to the step that edits it;
  - "See the sketch" goes to the evidence;
  - a lot drawn from a sketch shows what the sketch shows one fact a line, the open questions apart, and a misread number's correction as one press (stage 249).
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
- **The Sketch Intelligence Engine** (stage 241, ADR 0249): the sketch's drawing (which numbered points each line joins, how it's drawn, what's written along it, symbols, named areas) matched to the survey, classified, tested against the coordinates, and added as items for one-press confirmation. The lot, the walls, strips, the road's side and the well come from it; what the evidence can't settle is asked. No position comes from the sketch.
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
| Sokkia Link point list (printout) | Points' and stations' North, East, Elev and code, by the printout's own columns; metres only; shots refused (upload the SDR) | Built and tested (stage 242, ADR 0250); a real printout read identical to its SDR |
| DXF drawing (its points) | POINT entities and blocks, numbered by an attribute or by the text at the offset every point shares; metres only; lines not read | Built and tested (stage 242); a real Sokkia Link DXF read identical to its SDR; schema v104 applied 2026-11-24 |
| Field sketch photos (JPEG, PNG, WebP) | Read by Claude with consent: readings, and the drawing's lines, symbols and areas | Built and tested; the owner's real sketch read in production (stages 245 to 247 notes) |
| PDF, Word, DWG | Listed and said plainly to be unread | Not built |
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
- Least squares on a traverse, weighted by the office profile's total station or a typical one, said as such, with σ0, the χ² test, the largest residuals and each station's standard deviation (ADR 0274).
- Lot subdivision by a dividing line (`partition.ts`).
- The stated extent read and compared with the computed area.
- The circle through a curve's surveyed points, its fit (2 cm), chords for the sheet and exact DXF bulges (`arcs.ts`, ADR 0247).

**Not built:**
- balancing angles before a linear rule, and least squares over networks of more than one traverse;
- curved lot boundaries and their areas;
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
- **The drawing understood** (stage 241, ADR 0249):
  - lines between numbered points, with their style and what's written along them;
  - symbols at points, such as a well;
  - named areas.

  Tested code matches the numbers, classifies each line, and tests it against the coordinates: corners by how far a point lies off the line between its neighbours (0.25 m by default, 0.10 m for strong evidence, said as Farbaek's defaults). It finds the lot as the largest outline the boundary lines close round, with strips, the road's side and the well. Each result goes on the plan as an item waiting for one press, with its evidence. A point between the tolerances, a line with nothing written along it, a missing road width and a building without numbered corners are asked about.
- **Read as surveyors write** (stage 243, ADR 0251):
  - the reader knows field books are turned while drawing (upside-down numbers), that a title at the top is a note, and that gates and road names are written as such;
  - a road the sketch names is drawn between its two surveyed sides (the lot's frontage carried on by the neighbours' walls, and a line drawn across from it), its width measured, a different written width asked about. Several candidate lines or names are asked about, never chosen;
  - a stated extent of whole perches is said to be most likely the deed's.
- **The deed's extent on the face** (stage 244, ADR 0252): a classic plan can give the deed's extent on its extent line, as the surveyor chooses, with the computed extent kept in the schedule overleaf and the checks saying which is where.
- **Never a source of coordinates:** every drawn point is a surveyed one; a surveyed point the sketch doesn't number is said, never added; no far edge or outline is guessed.
- **Every number traceable** (stage 245, ADR 0253): each reading says whether it was read clearly, what's in doubt and where on the photo it is; a doubtful reading is never used as a fact. The sketch interpretation report gives each side with the numbers beside it, every point number and how it matched, and what's uncertain apart, with how sure Farbaek is by a fixed rule.
- **A misread number corrected in one press** (stage 249, ADR 0257): where a number is written at another point's place and that point's own number isn't written, the lot's card offers "It's 20: use 20 for the 10 read". The correction is kept beside the reading as the surveyor's, the reading stays as read, and what the sketch drew from the number and nobody confirmed is redrawn, waiting for the surveyor; what they confirmed is never changed.
- **Compared with a surveyor's own plan** by point numbers (`sketchintel/evaluate.ts`), and run on a real job's folder outside the repository (`real-job.test.ts`).

**The owner's real job (local only, never committed):**
- 27 of 27 sketch numbers matched;
- the surveyor's lot, all but one corner lying 0.043 m off the straight side, 132.70 m² against the plan's 132.53 m²;
- the surveyor confirmed the plan's 5-perch extent is the deed's; since stage 244 Farbaek prints it on the face as the surveyor's plan does, with the computed 5.25 perches in the schedule;
- after stage 243, with the sketch read as a surveyor reads it: all 8 of the plan's lines in full, the road drawn between its two surveyed sides and measured at 3.25 to 3.63 m (the plan states 15 ft, its reserved width), the gate read, and the stated 5-perch extent pointed out;
- the well placed;
- after stage 245, the house wall 12, 9, 6, 4, 3 (as the surveyor named it) drawn in full; 3, 4, 6 and 9 recorded as read with doubt, each with where it sits; 1.43 and 1.58 shown beside their sides, differing from the survey by 1.50 m and 0.40 m, and listed for the surveyor, in line with the surveyor's note that 3 and 4 weren't clearly visible when measured;
- after stage 249, the production reader's third read with its misread 10 corrected to 20 in one press: the lot draws through 20 at 125.84 m² (112.26 before) and the crossing question goes. The rest of the difference is the 14 read on the west wall, which stays a question.

The sketch was transcribed in the development session in the reader's format; the production reader runs on it only with the owner's consent.

**Not built:**
- a place on the photo as more than evidence: since stage 245 the reader gives one for each reading, approximate, only to find the writing again;
- a road from one surveyed edge and a written width; a building's outline from an area without numbered corners;
- rotated or poor photos are handled only as well as the model reads them, with no preprocessing beyond shrinking.

## 8. CAD and PDF output

**Built and tested:**
- **PDF:** the plan sheet as a vector PDF 1.7. Tests read it back for page size, print scaling off, embedded fonts, and the boundary drawn at exactly the plan's scale, measured from the PDF's own path operators. A block-out plan PDF is also made.
- **DXF:** Farbaek's own R12 writer. Tests read it back with an independent parser.
  - It holds the plan's drawing: lot boundaries and corners, lines, roads, labels, and marks and symbols at points (since stage 241).
  - Spot heights go out in the coordinates CSV, not the DXF.
- **Coordinates CSV, a lots CSV and GeoJSON.**
- **A checks and sources report** (stage 236, ADR 0245): one version's checks, sources with their SHA-256, what was worked out from each file, who filled what, the sketch read, versions and exports, as a PDF to file with the plan. It certifies nothing, and says so.
- **Labels on the sheet are placed together** (ADR 0242). Dimensions on short legs are stacked or split across the line, and lot labels stay inside their lot. Geometry never moves, and what can't be cleared is reported.

**Not built:**
- leader lines in the DXF: the sheet and PDF letter crowded legs with leaders since stage 266 (ADR 0259), and since stage 240 (ADR 0248) the surveyor can leave legs too crowded even for leaders to the boundaries schedule, which the face names;
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
  - a real instrument file;
  - many real sketches: one real job has been read in production so far.

## 12. Build and deployment

| PR | Stages | State | Schema |
| --- | --- | --- | --- |
| #286 to #292 | 222 to 228 | Merged, live | none |
| #293 | 229 (background jobs) | Merged, live | **v102:** the owner applies it; the code works without it |
| #294 | 230 (sketch photos kept) | Merged, live (build c96322bebc79) | **v103:** the owner applies it; the code works without it |
| #295 | 231 and 232 (traverse, benchmark) | Merged, live (build 397d43d92a1a) | none |
| #296 | 233 (label placement) and this report | Merged, live | none |
| #297 | 234 (line words, code report) | Merged, live (build dbc3fa889203) | none |
| #298 | 235 (timed jobs, finishing a cut-off run) | Merged, live (build 684f7edfa43f) | none |
| #299 | 236 (checks and sources report) | Merged, live | none |
| #300 | 237 (success metrics script) | Merged, live | none |
| #301 | 238 (suggestions for unknown codes) | Merged, live (build 63bc07a5d93e) | none |
| #302 | 239 (curves from PC to PT) | Merged, live | none |
| #303 | 240 (crowded legs left to the schedule) | Merged | none |
| #304 | 241 (Sketch Intelligence Engine) | Merged, live (build 52e29e9ad207) | none |
| #305 | 242 (point-list printout and DXF points) | Merged through #306, live | **v104** applied 2026-11-24 with the owner's go, read back: the format check allows sokkialist and dxf |
| #306 | 243 (reading sketches as surveyors do) | Merged, live (build 1ba637a86eb5), with 242 | none |
| #307 | 244 (the deed's extent on the face) | Merged, live (build 73408c17ac24) | none |
| #308 | 245 (the sketch interpretation report) | Merged, live | none |
| #309 | 246 (doubt where it's real, crossing lines) | Merged, live (build 98cc285939fc) | none |
| #310 | 247 (where each number is written) | Merged, live | none |
| #311 | 248 (office profiles) | Merged, live (build bd331357bdeb) | **v105** applied 2026-11-24 from #312's fixed file, read back `t` by `check-migrations.ps1` |
| #312 | 248 fix (v105 loads again) | Merged, live (build 3f4f19669543) | **v105:** applied by the owner with the line in the PR, read back `t` |

| #313 | 249 (a misread number corrected in one press) | Merged, live (build 28d7ba63e260); pressed on the owner's real job in production | none |
| #314 | 250 (nothing lost on a refresh) | Merged | none |
| #315 | 252 (the owner's real job run end to end) | Merged | none |
| #316 | 253 (editing the plan on the sheet) | Merged | none |
| #317 | 254 and 255 (a house from its walls, words and symbols on the plan) | Merged | none |
| #318 | 256 (sketch words) | Merged | none |
| #319 | 257 to 262 (agreed reads, drafting as surveyors draft, square corners) | Merged | none |
| #320 | 263 (an independent AI check against the sketch) | Merged, live (build 3a8db8f6ff3e) | none |
| #321 | 264 (points where two lines meet, tape offsets) | Open | none |
| #322 | 265 (dimension lines, words with their own size and angle) | Open, on #321 | none |
| #323 | 266 (leader lines for crowded legs, built as 251 and parked) | Open, on #322 | none |
| next | 267 (least squares, the instrument's precision in the office profile) | Open, on #323 | none |

Production deploys main by itself. **v102 and v103 were found missing on 2026-11-24 and applied the same day** with the owner's go (`apply-migration.ps1`, hash-checked), and read back `t` by `scripts/vps/check-migrations.ps1`; v104 was applied and read back that day too.

## 13. Incomplete capabilities

**Not built:**
- **Labels and layout:** multi-sheet layout; leader lines in the DXF (the sheet and PDF have them since stage 266, ADR 0259). Crowded legs can still be left to the schedule (stage 240) where even leaders don't fit.
- **Codes:** curved lot boundaries (curves are drawn on lines, not lots, since a lot's area would change); a curve's radius and length on the plan; offsets, rectangles and jogs; a firm's own word list.
- **Computation:** least squares over networks and with heights; balancing angles first; adjusting a field book's legs.
- **Profiles:** learning from corrections (suggestions kept apart until approved), CAD layer and text styles, title-block fields other than the statement, plan numbering.
- **Jobs:** finishing a cut-off sketch read without the browser that started it (since stage 250 the photos stay in that browser until the read is saved, and the project offers to finish it); server-side resumable uploads in chunks; a timer for the jobs sweep. Incremental regeneration is decided, not built (ADR 0258): the plan is worked out again in about 5 ms, and tests hold that a correction changes only what depends on it.
- **Files:** reading PDFs, Word files and DWG, and a DXF's lines; Topcon raw files; keeping a camera's full-size original.
- **Platform:** the success metrics (§26) that production doesn't record: time to first preview, findings across plans, refused exports, and a comparison with the same job by hand (`docs/survey/METRICS.md`, stage 237, says how the rest are read); malware scanning of uploads; signed download links.

## 14. Remaining risks

- **One real job has been run,** locally and, with the owner's go, in production (2026-11-24): Generate Plan on its SDR and sketch, and the production reader on the sketch three times. Read by hand, the sketch gives the surveyor's lot within one corner; the production reader's best read gave a lot of 112.26 m² against 132.70 m², wrong through two misread numbers that the crossing and placement checks now ask about. One of them (10 for 20) is corrected in one press since stage 249; the other stays a question. The traverse is proven only on synthetic data built from the manufacturers' documents.
- **Sketch readings can be plausibly wrong.** The instrument check catches a misread number only where there is a coordinate to compare it with. A misread name or note is shown as read, for the surveyor to check. A misread line is tested against the coordinates and asked about where they disagree, but a wrong line between two real points can look right: each one waits for the surveyor's press.
- **Telling carried coordinates from control** rests on Sokkia's derivation codes and a tolerance. Codes from instruments newer than Sokkia's 1999 document aren't known. Unknown records never move and never close a traverse, and the closure names its route.
- **Data leaves Sri Lanka** when sketches are read. It goes only with the surveyor's consent, each time, and that consent says so.
- **The brief's 30-second target** depends on the network and the database, which haven't been timed.
