# Survey Studio development roadmap

Stage 190 built the foundation and one complete workflow; stage 191 added several lots, the classic sheet and drafting. Everything after them is **planned**: the stage numbers come from the stage plan, and nothing below exists until its stage is done and documented. Each stage starts in plan mode, writes an ADR for each significant decision, and asks the owner before any dependency, migration or production change (CLAUDE.md).

## Stage 190: the cadastral foundation (done)

- The engine in `src/core/survey/`: units and A-R-P, bearings and DMS, planar geometry, parcels, traverse misclosure (no adjustment), the CRS registry and plausibility checks, quality-control findings.
- Importers for delimited point files and GeoJSON with a named grid; WGS 84 GeoJSON refused.
- The Sri Lankan cadastral sheet template as data, the sheet scene in millimetres, the overleaf schedule, label-overlap and overflow findings.
- Vector PDF (PDFKit), DXF R12, CSV and GeoJSON exports, each recorded with its SHA-256.
- Schema v93: seven tables and eight `app_survey_*` functions; immutable points, append-only drawing versions, approvals by the named surveyor, exports and audit.
- The screens: the dashboard, a new project, surveyor details, the eight-step project workspace with the plan editor, the Sample project, the public page, the public sample PDF, and the home page section.
- ADRs 0198 to 0201 and this documentation.

## Stage 191: several lots, the classic sheet and drafting (done)

- **Several lots per plan** (schema 2, ADR 0203): lots with raised labels and notes, roads from two surveyed edges with widths written in feet, adjoining-land labels with arrows, notes, a code library and a structured title; schema 1 documents upgrade when read. Lot topology: shared legs, T-junctions, overlaps, gaps, pieces and the entire land's outline.
- **The classic Sri Lankan sheet** from six practising surveyor's plans ([REFERENCE_PLANS_ANALYSIS.md](REFERENCE_PLANS_ANALYSIS.md)): portrait, slanted lettering, the Reference built from the codes used, the composed title sentence, bounded as follows, the extent in hectares and A-R-P, the boundaries schedule overleaf, automatic paper and scale, labels placed clear of each other.
- **Field-to-finish** (ADR 0204): lines and outlines suggested from point codes, accepted by the surveyor.
- **The drafting assistant** (ADR 0202, [AI_DRAFTING.md](AI_DRAFTING.md)): the surveyor's description, or photos of an earlier plan, read into lots, roads, adjoining lands and the title. Every item quotes the words it came from, waits to be checked, and blocks approval until it is. Schema v94 meters it.
- **Compare two versions** in words on the History step.
- The CAD product study that shaped these choices: [CAD_PRODUCT_STUDY.md](CAD_PRODUCT_STUDY.md).

## Stage 192: a plan the surveyor can trust end to end (done)

- The stated extent read in its own units and set beside the computed land.
- Near misses (a corner a few centimetres off a neighbour's leg, two marks within 1 cm) answered "keep as surveyed" in the version (ADR 0205).
- The lot schedule as CSV, a plot stamp under the frame, the inverse between any two points, and two codes on one point with notes after a slash.
- Dividing a lot into shares (ADR 0206): dividing lines square or parallel to a leg for stated or equal shares, the area balance, setting-out distances, and the UDA minimums when asked. A proposal to peg, never a change to the plan.

## Stage 193: dividing land by width, through a corner, under cited rules (done)

- **Shares by width:** frontages along a road from a starting corner, or strips such as a 10 ft access reserve behind it, in metres or feet.
- **Lines through one corner:** shares fan out from a corner, each line solved exactly, with bearings and lengths for setting out. A line that would leave a concave lot is reported, never shown as feasible.
- **Rules as versioned data** (ADR 0207): the UDA minimums with their document, sections and review date (31 December 2026), cited reminders for consent, the RQP declaration and open space, and the surveyor's own minimums for a Development Plan or other rule. A plan's own lots are checked against the chosen set.
- **The block-out plan** (ADR 0208): a division printed as a classic sheet headed BLOCK OUT PLAN, worked out again on the server, with the new corners as drawing-only points and a warning when a dividing line runs through a building.

## Stage 194: upload the field data and the plan draws itself (done)

- **One upload for every instrument export** (ADR 0209): CSV, TXT and DAT (PNEZC as the Survey Department asks), Leica GSI, Sokkia SDR, LandXML and Trimble JobXML.
  - **Strict readers:** the server reads the stored file again with the same code.
  - **Named instead of read:** job databases, Trimble DC and Topcon GTS-7, with what to export instead.
- **A smart table.** It reads the columns itself and says why, previews the points and the lot on a small map, lists the codes with their meanings, and offers the Survey Department's code list when the file uses it.
- **The plan drawn on import, as a draft:**
  - the lot through the boundary marks;
  - lines and buildings from the codes;
  - the road from its edges;
  - the stated survey date and the surveyor.

  Every inference waits for the surveyor's check before approval, and the Plan step lists what's left.

## Stage 195: talk or type to the plan (done)

The drafting assistant ([ASSISTANT.md](ASSISTANT.md), ADR 0210): a bar on the Plan step's sheet that takes spoken or typed instructions.
- **Two readers:** a local reader for frequent instructions; Claude's fast tier for the rest.
- **Values come from words:** every value is read by code from the surveyor's own words and checked.
- **Applying:** changes are shown on the sheet and applied as one undo step; answers come from the engine.
- **Hand-overs:** divisions and dictated measurements are handed to the divide panel and the typed tables.
- **Voice:** push to talk and live talk, through the browser's own recogniser, in English and Sinhala.
- **Next for it:**
  - recordings from surveyors to measure accuracy, deciding whether a self-hosted Sinhala recogniser is worth running;
  - Sinhala number words;
  - Tamil;
  - the native apps' microphone permissions.

## Next: subdivision with roads (planned)

Still to come: a whole land laid out at once, with its access road and its lots and a feasibility report, never presenting a layout that breaks a hard rule as feasible.
- **More rules as data.** Access widths, turning circles and splays (regs. 18, 21, 22) join the `uda-2020` set as checks on a layout's road. Schedule 4's width-to-lots pairing must not be encoded until a clean copy is found.
- **Area conservation**: parent area, roads and reservations, the sum of the lots, the residual, and the tolerance.
- **Libraries.** Polygon clipping is the riskiest choice and the research couldn't settle it (clipper2-ts and martinez were both days old on 15 November 2026). Every clip needs a JSTS validity check, an area-sum check and vertex snapping to the parcel's own vertices, with a fuzz suite.
- Reproducible seeds for any optimiser; never assume a road width or reservation.

## Stage 192: topographic plans and contours (planned)

- A TIN with breaklines, then contours (the research's candidates: delaunator 5.1.0, @kninnug/constrainautor 4.1.0, d3-tricontour 1.1.0).
- **Heights:** a vertical datum recorded separately from the horizontal CRS, and height types kept apart (GNSS ellipsoidal heights never stored as SLVD heights).
- Uncertainty and data density reported; raw and smoothed contours kept apart; no extrapolation without a clear warning.

## Stage 193: engineering and road plans (planned)

Alignments, chainage, long sections and cross-sections, with curve elements from tested formulas. Never assume design speeds, gradients, radii or widths.

## Later: the assistant answers more questions (planned)

Drafting from the surveyor's words came in stage 191, and stage 195's assistant answers the area, perimeters, checks and what's missing. This stage lets the surveyor ask about a plan ("show lot B2's marks", "which lots are under 6 perches"): the model calls engine functions and the screen selects or zooms, with every number from code. It also checks the brief against the plan: a lot count, road width or deed extent the surveyor stated becomes a claim the engine compares with what it computed. Red-pen markup on a printed draft, read into suggested changes, comes after. The model never calculates (skill rule 1) and never edits on its own.

## Later: full CAD tools (planned)

The editing that [CAD_ENGINE.md](CAD_ENGINE.md) lists as not built:
- drawing and editing on the canvas, choosing boundary points by tapping, snapping and measuring;
- free text, symbols and dimension entities placed by hand, multi-select, rotation and keyboard nudges;
- a custom scale, and controls for the precision settings;
- the geometry of two versions overlaid in colour, below the compare list stage 191 added, and revision clouds on an amended plan;
- a faster renderer for large drawings (the research suggests Canvas or WebGL, with Konva 10.9.1 as a candidate), and DXF or scanned-plan backdrops.

## Stage 196: mobile field entry (planned)

Entering and checking points in the field on a phone. The screens are already built mobile first; this stage adds field capture, which needs its own provenance (instrument, operator, time) and must keep observations immutable.

## Not yet scheduled

These are needed but have no stage number yet.

| Work | What it needs |
| --- | --- |
| **Coordinate transformations** | proj4js, pinned at 2.22.0 (2.23.0 was three days old during the research). Use the corrected EPSG:5235 rotation signs, and check them against PROJ (`projinfo` or pyproj, EPSG:5235 to EPSG:4326) as saved test vectors before shipping. Every transformation carries its EPSG code and accuracy (EPSG:5236 is 14 m, EPSG:1157 35 m); warn or refuse when one would be used for boundary work. There is no official Kandawala to SLD99 transformation. Then WGS 84 GeoJSON and GNSS CSV can be imported |
| **Sinhala and Tamil text on sheets** | Fonts with those scripts (the embedded Geist has none). A release gate that compares PDFKit's glyph ids with HarfBuzz's (harfbuzzjs 1.6.4) for a fixed word list such as ශ්‍රී. Check fontkit's Indic output in the PDFKit version in use. DXF text keeps the `\U+` escapes, including the zero-width joiner; whether CAD programs draw it needs a hands-on test |
| **A UDA submission profile** | A switchable set of sheet items from UDA regulation 9, named after the document it was built from: adjoining assessment numbers, access width, drainage flow, previous boundaries in red, street and building lines, and the existing permit box |
| **Captions** | The template is chosen per drawing (classic or panel); let a surveyor edit its captions |
| **A plan-standard profile** | The sheet checks as named, versioned rules, each citing its source (the classic layout as observed practice, UDA regulation 9 as official text) |
| **Field codes** | Curves and join-to-point after the curve engine; a code library per office |
| **DXF in ZWCAD and AutoCAD LT** | Open the exports in both by hand before a release: the likeliest desktops a Sri Lankan surveyor uses |
| **Dictating the description** | Speech to text for the Draft step's long description, through the same browser recogniser and privacy note as the stage 195 assistant |
| **The surveyor's record** | A licence year and accreditation status on the surveyor profile, and plan numbering that exports cleanly to the Plan Issuing Register (format still unverified) |
| **Traverse adjustment** | Bowditch or transit, only with the surveyor's authorisation and an explicit method choice, keeping the unadjusted observations and reporting residuals before and after |
| **More import formats** | In the research's order: GNSS CSV in WGS 84 (after transformations), Leica GSI coordinate words, Trimble JobXML reductions, SDR33 coordinate records |
| **Export checks** | ezdxf's strict read and audit in CI; sample files opened in AutoCAD, LibreCAD and QCAD; PDFs in two viewers and printed at actual size; DXF R2000 only after the writer builds the full object graph and matches a known-good file |
| **PostGIS** | Revisit under the conditions in ADR 0199 |
