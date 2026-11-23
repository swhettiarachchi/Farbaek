# Stage 222: AutoSurvey, part 1: one screen and Generate Plan

- **Date:** 2026-11-23
- **Branch:** `feat/stage-222-autosurvey-start`, from `main`
- **Decision:** ADR 0233
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (its rules for every survey task: never infer the coordinate system, never invent survey facts, check validity at every step, label synthetic data), `deep-research` (the competitor and technology study), `farbaek-ui` and `farbaek-human-made` (the screen).

## What the owner asked

"Farbaek AutoSurvey": rebuild Survey Studio so a surveyor uploads survey data and field sketches together, presses Generate Plan, and gets an editable plan draft, then only corrects genuine exceptions, approves, prints and seals. The frontend extremely simple, the backend doing the work. Map the existing Survey Studio first, research the products that do this today, then build in stages, and never fake a capability.

## What was found first

**The map of today's Survey Studio** (a read of the code, 2026-11-23):

- **Sound and tested:** seven file readers (points files with column guessing, GeoJSON, Leica GSI, Sokkia SDR, LandXML, Trimble JobXML, a bearing-and-distance field book), immutable points, bearings, areas and acres-roods-perches with known answers, subdivision, the automatic draft from boundary-mark codes, 59 checks enforced on the server, the plan sheet, a vector PDF at exact scale, an R12 DXF read back in tests, approval by the named surveyor.
- **The ten largest gaps to AutoSurvey:**
  1. Import, draft and photo reading were separate steps.
  2. One file at a time.
  3. Instrument observations refused: the SDR 09 and 11 records and GSI angles are skipped, and there is no traverse adjustment.
  4. Photos fill title fields only, and nothing is read from sketches.
  5. Field codes have no curve or join codes, and there is no office code library.
  6. Nothing runs in the background.
  7. Every drafted item is ticked one by one before approval.
  8. The surveyor profile holds no defaults.
  9. Original files aren't kept byte for byte, and there is no storage for photos.
  10. CAD editing is labels only.

**The research** (three studies, with the report's order of work: a code report first, a label solver second, a sketch reader third; notes in `research_notes/Survey Field to Finish automation/`, report in `reports/Survey Field to Finish automation.md`):

- **Civil 3D, Leica Infinity, Carlson, Trimble Business Center and Topcon** all turn codes into drawings the same way: a code picks a library entry (layer, symbol, line style), and control codes on the same points build lines, curves and closures, each with its own spelling. Carlson's code library is a plain CSV, the most portable format found. None documents a finished, plot-ready plan from one command; labelling is what remains after good field-to-finish. Duplicates on re-import, unknown codes and reprocessing that wipes manual edits are the documented time sinks.
- **Sketches:** the survey products attach photos and sketches to points, and none reads them. Vision models misread handwriting in ways that look plausible (a 2026 benchmark found most errors come from the model's expectations rather than the image), and their stated confidence is poorly calibrated. The strongest check is the instrument data itself. Gemini returns documented text locations; Claude returns approximate ones; OpenAI documents none.
- **Labels and output:** no vendor claims collision-free automatic labelling either; QGIS's engine (candidate positions, scored, then searched) is the model to follow, with polylabel for lot labels. pdfkit stays right for the PDF (0.20.2; the newest needs a days-old font library), but its Sinhala and Tamil shaping needs a measured test. The report advises keeping Farbaek's own R12 DXF writer: the one maintained TypeScript writer is days old with open bugs, and the escapes the current writer uses already carry Sinhala text.

## What was built

- **`src/core/survey/autosurvey/start.ts`:** sorting uploads (survey data, sketch, document), reading a survey file with only the settings the file settles, point clashes within and between files, the check that points fit the chosen system's area (swapped columns reported, never fixed), the Survey Department's code list when the files use it, the project name, and the starting coordinate system.
- **`generateSurveyPlanAction`** (`src/app/app/survey/actions.ts`): reads every file again on the server, saves nothing until everything is clean, then creates the project with the system confirmed by the person pressing, imports each file as its own source and draws the plan once.
- **The screen** (`/app/survey/new`, `src/components/survey/autosurvey-start.tsx`): one drop area with Choose files and Take a photo, what was found in each file, sketches marked Not read yet with the reason, the coordinate system last confirmed with Change, an optional name, the surveyor's name or where to add it, and Generate Plan. The old step-by-step start is one fold below.
- "New survey project" is "New survey" on the Survey Studio page.

## Verified

- **Tests:**
  - 13 on the start: sorting uploads, reading with and without a header, asking instead of guessing columns, latitude and longitude refused, instrument files, the first problem named with a count, clashes, the grid check and swapped columns, the code list, the name, the starting system.
  - 4 on Generate Plan run as the server runs it, with the database standing in: one project with the system confirmed, one source per file, one drawn version, opening on the plan; and nothing saved for an unreadable file, a clash, the wrong system, an unknown system or too much data.
  - All 372 survey tests pass. Every file in the tests is synthetic.
- **In a browser,** on the demo workspace at 1440 and 390 px: two files read (the points file shows its kind, 5 points and its codes; the photo shows Not read yet with the reason), a third file giving a point a second place is caught and named, a headerless file whose columns both fit the grid asks instead of guessing, removing files clears it all, Generate Plan stays off with the demo's reason, no sideways scroll, no console errors.
- `pnpm test`: 4,378 pass, 17 skipped. `pnpm typecheck`, lint on the changed files and `pnpm build`: pass.

## Not done in this part, and why

- **Generate Plan was not run against a real database here:** the demo workspace can't save, and this PC runs no local database. The first real run is the owner's, after the merge.
- **Sketches and documents are listed, not read.**

## Next parts of AutoSurvey

Each is its own pull request, built and checked the same way:

2. **Only exceptions to review:** built in stage 224 (ADR 0235). One "Needs you" list (must fix, for you to confirm, for information) instead of ticking every drafted item; only drawn items tested code doubts wait for a confirmation of their own.
3. **The surveyor profile carries defaults:** built without a migration in stage 226 (ADR 0237): the office code library from a Carlson-style file, the code list the surveyor checked last, and their sheet's presentation; the coordinate system since stage 222. A profile table (equipment, title-block preferences, plan numbering) still needs a migration.
4. **Originals kept byte for byte, photos and sketches included,** in storage on Farbaek's own server. It needs a migration and a storage decision.
5. **Reading sketches:** built in stage 223 (ADR 0234), on Claude at the owner's choice. Each handwritten number or label is kept as written and checked against the instrument data, conflicts are shown with both values, and a sketch is never a source of coordinates. Places on the image are left out: Claude's are approximate.
6. **Work in the background:** Generate Plan as a resumable job with its real stages shown, so leaving the page loses nothing.
7. **More of the field-to-finish:**
   - observations reduced: SDR 09 and 11 built in stage 225 (ADR 0236), by radiation with nothing adjusted; GSI angles next;
   - traverse adjustment, only with the surveyor's choice of method;
   - curve and join codes.
8. **Labels placed like a cartographer would:** candidate positions scored and searched, lot labels at the point farthest from the edges, and what can't be placed reported rather than hidden. The DXF stays on Farbaek's own writer; Sinhala and Tamil get a measured test in the PDF and in CAD programs before they go on a sheet.
9. **Three modes on one project:** built in stage 227 (ADR 0238): Express (the default), Professional (settings and diagnostics) and Manual CAD (editing geometry), as views of one project.
