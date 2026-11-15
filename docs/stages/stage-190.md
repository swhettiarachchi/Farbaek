# Stage 190: Survey Studio, a land survey plan from field points

- **Branch:** `feat/survey-studio`, from `main` at d5cdfbb.
- **ADRs:** 0198 (Survey Studio as a module), 0199 (survey data without PostGIS), 0200 (the PDF and DXF writers), 0201 (one sheet scene).
- **Migration:** v93, `supabase/migrations/20270103090000_survey_studio.sql`. The owner applies it before the merge (see the end of this page).
- **Docs:** `docs/survey/`, twelve documents, from the overview to the roadmap, with the standards research and its sources.
- **Skills:**
  - **`farbaek-survey-studio`:** its fourteen rules throughout. Tested code calculates, never AI; no invented survey facts; the grid is confirmed by a person and recorded; bearings and areas say what they are; points are immutable; nothing changes quietly; Sri Lankan rules carry a source and a status; a draft until the surveyor approves it.
  - **`deep-research`:** four research tracks (Sri Lankan survey rules, grids and point formats, DXF and vector PDF, geometry libraries), in `research_notes/Survey Studio standards and tech/` and `reports/`.
  - **`farbaek-ui`, `farbaek-human-made`, `ui-ux-pro-max`, `taste-skill:high-end-visual-design`, `mobile-app-ui-design`:** White Signal tokens, the double bezel and button-in-button, StatusBadge kinds for every state, plain words, 44px targets and 16px inputs, no sideways scroll at 375 px, motion only under `prefers-reduced-motion: no-preference`.

## What the owner asked

A professional surveying module inside Farbaek, separate from website building but not a separate brand: surveyors' points, coordinates and field data in; accurate, editable, print-ready survey plans out (cadastral, subdivision, topographic, engineering, road and custom), with a CAD-style editor, validation, vector PDF and DXF, researched from official sources, and a premium showcase on the home page with no AI look.

This stage builds the foundation and one complete workflow: **a cadastral land survey plan, from points to an approved, printed PDF and a DXF.** Subdivision, topographic, engineering and road plans, the AI assistant, full CAD tools and mobile field entry are planned as stages 191 to 196 in `docs/survey/DEVELOPMENT_ROADMAP.md`. Nothing claims to exist before it does. The reference plan image the owner described didn't arrive; the sheet follows the owner's written list of sections and is a template the surveyor can change.

## Done

- **The engine, `src/core/survey/`** (framework-free, stamped `survey-engine/1.0.0`):
  - units from the international yard, with acres, roods and perches rounded once in perches, then carried;
  - whole-circle bearings from grid north, degrees, minutes and seconds with carry;
  - shoelace area, perimeter, orientation, zero-length legs, crossings and touches measured in millimetres;
  - traverse misclosure, never adjusted;
  - a CRS registry (SLD99, Kandawala, UTM 44N, local) that checks a claim and never makes one;
  - point readers for delimited text and GeoJSON;
  - the checks (`qc.ts`), each with a code, severity, what to do and what it blocks;
  - the drawing document (zod), versioned;
  - the sheet scene and the Sri Lankan-style template as data, the DXF R12 writer, and CSV and GeoJSON writers.
- **The database, migration v93:** projects, sources (with the database's own SHA-256), points that can't be changed, append-only drawing versions, surveyor profiles, approvals (withdrawn when the grid changes) and exports. Members read through RLS; every write goes through a service-role `app_survey_*` function that checks the workspace and role and records an audit event.
- **The server, `src/server/survey/`:** the reader (as the person), the store, the PDF writer (PDFKit, Geist embedded, Print Scaling None), the Sample project and the read-only reasons.
- **The app, `/app/survey`:** the dashboard with the Sample; a new project with the grid confirmed by the person; the project in steps (Import, Points, Boundary, Plan, Check, Export, History, Settings); the plan editor (pan and zoom by wheel, pinch and keys, label drag, layers, undo and redo, versions); the surveyor's details; approval of one exact version; exports recorded before they're sent. "Survey Studio" is in the app's tools.
- **The public site:**
  - **`/survey`:** what it does, how a plan comes together, how the numbers are worked out (with the Sample's legs and extent from the engine), the Sri Lankan sources, what it doesn't do yet. In the site's nav and sitemap.
  - **`/survey/sample-plan.pdf`:** the Sample as a real PDF, built once at build time, for anyone to print and measure the 100 mm check line.
  - **The home page:** a Survey Studio section after the showroom. The Sample's sheet draws itself once when it scrolls into view, tilted back in CSS 3D on large screens, with the extent block enlarged in front. Labelled Sample, still under reduced motion.

## Reviews and what they changed

- **My own check of the PDF** with Xpdf's `pdftotext` showed two collisions on the Sample: the wall's code sat on a leg's bearing, and a mark code on its point. Fixed: line features are labelled on the lot's side of their longest segment, buildings in their middle, mark codes one line beyond the point number. A new check, `LABELS_OVERLAP` (a warning, moves nothing), reports labels that cover each other or a point.
- **An independent review** of the engine, SQL, actions, routes and editor found 13 defects. All are fixed, with tests:
  1. A GeoJSON file's own grid was read but not compared with the project's: UTM 44N points in western Sri Lanka would have been drawn as SLD99 with no warning. Now refused, in the browser and on the server, and the import is refused if the grid changed while the person was confirming.
  2. An approval kept showing after the grid changed. The database now withdraws it; approving checks the grid under a lock; an approval counts only while its SHA-256 matches the plan recomputed now; the approved sheet uses the surveyor's details as they were.
  3. A code column swallowed the columns after it, permanently (points can't be changed). The code is now its own cell unless it's the last column; a repeat with another code is a conflict, in the file and in the database.
  4. The scale bar's middle tick read "3" at 1:100. Now "2.5".
  5. Points on a line passed every check. `BOUNDARY_NO_AREA` now blocks export and approval.
  6. A corner resting on a far leg was missed at grid-sized coordinates. Touches are now measured as distances (0.5 mm), and a leg folding back on its neighbour counts.
  7. GeoJSON skipped the export checks. Every file but the CSV of points now waits for them.
  8. The DXF didn't say it was a draft. DXF and GeoJSON now carry the status and the grid confirmation inside the file.
  9. Sinhala or Tamil text would print as empty boxes. `TEXT_SCRIPT_NOT_SUPPORTED` blocks export and says why.
  10. Bearings landed inside concave lots. The side now comes from the ring's direction.
  11. A long plan number ran off its panel unnoticed. `TEXT_OVERFLOW` now covers width too.
  12. Ids and codes were cut short or cleaned quietly, and the CSV guard turned "-1" into "'-1". Now refused with the line, and plain numbers stay as they are.
  13. Distances rounded differently from areas and angles. `fmt` now rounds half away from zero.

- **The same reviewer checked the fixes** and confirmed 11 outright. It found what they missed or broke, all fixed with tests:
  - **A:** the code fix cut descriptions short, because the import panel padded the mapping with "Leave out" to the widest row. The preview now maps the usual row length; a row with extra cells is refused with its line (`EXTRA_COLUMNS`), except a space-separated description in a last code column. An unquoted thousands separator is now refused instead of read as two numbers.
  - **B:** the GeoJSON link led to an error page. GeoJSON now waits only for checks on the coordinates and the parcel (`blocksData`), and the link hides only then.
  - **C:** History and the dashboard said "Approved" for withdrawn approvals and older versions. Now "Approved", "Approval withdrawn", "Approval no longer applies" or "Version N approved".
  - **D:** wide capitals escaped the overflow check. Text widths now come from Geist's measured advances.
  - **E:** a bow-tie was called "no area". Points on one line say that; a crossing ring says it crosses.
  - **F:** the editor previewed an approved plan with the live surveyor profile. It now shows the approval's snapshot, as the PDF does.
- **The docs agent's cross-check** found more, fixed: hiding the title layer hid the north point and title block on screen but not in the PDF (it's no longer hideable); the export recorder skipped the paused-workspace and archived-project checks (now refused, with tests); archived projects opened by URL (now not found); "set a custom scale" pointed at a control that doesn't exist; "SLD99 by default" wasn't true of the form; the local grid's record claimed an official source; stale comments.

## Known gaps, honestly

- No custom scale beyond the standard list, no screen for the precision settings, and no tapping points to set the boundary (it's typed).
- Old versions can be exported by number but not opened or compared on screen.
- Elevations are stored as imported; no vertical datum is recorded yet, and nothing in this stage draws them.
- The surveyor profile has no licence year or accreditation field, which the research recommends.
- The DXF writes no `$INSUNITS` (R12 predates it; the units are written into the drawing as text). ADR 0200 keeps this open.
- Crossings are tested by distance in floating point with a 0.5 mm tolerance, not exact predicates (`robust-predicates` is the research's suggestion for later).
- Findings that block "plan" are recorded and shown, but nothing acts on that flag yet. A finding for the surveyor shows as "For the surveyor" to everyone.
- A future engine version will make existing approvals "no longer apply" (the hash includes the engine), so the surveyor saves a new version and approves again. That's deliberate: a different engine may compute different numbers.

## Verified

- **Unit tests:** `src/core/survey` (engine and plan), `src/server/survey/pdf.test.ts` and `src/components/survey/sample-plan.test.ts`: 51 tests, including known answers (NIST: 1 ha = 2A 1R 35.3686P), the Sample's area exact by BigInt, a DXF read back by `dxf-parser`, PDF page size and a boundary leg's length in points.
- **Database (PGlite):** `tests/db/survey-studio.test.ts` with the global grants, schema and retry rules: 35 tests.
- **Design, nav and SEO tests:** pass; `pnpm typecheck` and lint pass.
- **The PDF in two readers:** Chrome's viewer (PDFium) shows both pages; Xpdf's `pdftotext` reads every bearing, the extent, the notes and the overleaf.
- **The demo build in the browser:** every Survey page answers; all four exports download for the Sample, and DXF and GeoJSON carry "DRAFT"; the editor's drag, undo, redo, layers, zoom and selection work.
- **`qa:responsive`** on `/` and `/survey`, 320 to 1440 px: nothing sideways, cut off or too small. The home page sometimes logs a hydration warning from the statement section's Motion list in dev, which this stage doesn't touch (a separate task is suggested).
- **`qa:a11y`** on `/` and `/survey` at 1280 and 375: 0 findings.
- **Not checked here:** a real project on a real database (the local Supabase project is paused). That's checked on production after the migration and the merge: create a project, import, set a boundary, approve, print at 100% and measure the check line.

## Next

Stage 191, subdivision, per `docs/survey/DEVELOPMENT_ROADMAP.md`. The reference plan image, when the owner shares it, refines the template's layout.
