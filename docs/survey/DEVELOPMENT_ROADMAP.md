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

## Next: subdivision proposals (planned)

Splitting a parent parcel into lots and access roads, with a feasibility report, never presenting a layout that breaks a hard rule as feasible.
- **Rules as versioned data.** The UDA figures in [STANDARDS_RESEARCH.md](STANDARDS_RESEARCH.md) (minimum lot 150 m², 6.0 m frontage, 12.0 m depth, access rules, turning circles, open space), each citing the regulation, with a Development Plan override, and flagged as due for replacement on 31 December 2026. Schedule 4's width-to-lots pairing must not be encoded until a clean copy is found.
- **Area conservation**: parent area, roads and reservations, the sum of the lots, the residual, and the tolerance.
- **Block-out plans** at not less than 1:1000 (UDA reg. 8).
- **Libraries.** Polygon clipping is the riskiest choice and the research couldn't settle it (clipper2-ts and martinez were both days old on 15 November 2026). Every clip needs a JSTS validity check, an area-sum check and vertex snapping to the parcel's own vertices, with a fuzz suite.
- Reproducible seeds for any optimiser; never assume a road width or reservation.

## Stage 192: topographic plans and contours (planned)

- A TIN with breaklines, then contours (the research's candidates: delaunator 5.1.0, @kninnug/constrainautor 4.1.0, d3-tricontour 1.1.0).
- **Heights:** a vertical datum recorded separately from the horizontal CRS, and height types kept apart (GNSS ellipsoidal heights never stored as SLVD heights).
- Uncertainty and data density reported; raw and smoothed contours kept apart; no extrapolation without a clear warning.

## Stage 193: engineering and road plans (planned)

Alignments, chainage, long sections and cross-sections, with curve elements from tested formulas. Never assume design speeds, gradients, radii or widths.

## Stage 194: the assistant answers questions (planned)

Drafting from the surveyor's words came in stage 191. This stage lets the surveyor ask about a plan ("show lot B2's marks", "which lots are under 6 perches"): the model calls engine functions and the screen selects or zooms, with every number from code. It also checks the brief against the plan: a lot count, road width or deed extent the surveyor stated becomes a claim the engine compares with what it computed. Red-pen markup on a printed draft, read into suggested changes, comes after. The model never calculates (skill rule 1) and never edits on its own.

## Stage 195: full CAD tools (planned)

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
| **A plot stamp** | One line in the margin with the drawing version, approval state, engine version and export date, so a paper copy can be traced (CAD_PRODUCT_STUDY.md) |
| **A lot schedule CSV** | Each lot's area in m², hectares and A-R-P with a total row, cross-checked against the entire land, computed from the lots on every export |
| **Near-miss findings** | Name a corner a few centimetres off a neighbour's leg, or two marks a few millimetres apart, and let the surveyor answer "keep as surveyed" in the hashed version. Never move a point |
| **A plan-standard profile** | The sheet checks as named, versioned rules, each citing its source (the classic layout as observed practice, UDA regulation 9 as official text) |
| **Field codes** | Two codes on one point (a mark that also ends a wall) and a note after a separator; curves and join-to-point after the curve engine; a code library per office |
| **DXF in ZWCAD and AutoCAD LT** | Open the exports in both by hand before a release: the likeliest desktops a Sri Lankan surveyor uses |
| **Dictating the description** | Speech to text for the Draft step, with its own privacy note |
| **The surveyor's record** | A licence year and accreditation status on the surveyor profile, and plan numbering that exports cleanly to the Plan Issuing Register (format still unverified) |
| **Traverse adjustment** | Bowditch or transit, only with the surveyor's authorisation and an explicit method choice, keeping the unadjusted observations and reporting residuals before and after |
| **More import formats** | In the research's order: GNSS CSV in WGS 84 (after transformations), Leica GSI coordinate words, Trimble JobXML reductions, SDR33 coordinate records |
| **Export checks** | ezdxf's strict read and audit in CI; sample files opened in AutoCAD, LibreCAD and QCAD; PDFs in two viewers and printed at actual size; DXF R2000 only after the writer builds the full object graph and matches a known-good file |
| **PostGIS** | Revisit under the conditions in ADR 0199 |
