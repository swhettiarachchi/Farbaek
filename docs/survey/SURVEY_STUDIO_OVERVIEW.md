# Survey Studio overview

Survey Studio is a module inside Farbaek for land survey plans. A surveyor, or someone drafting for one, imports field points, confirms the coordinate system, chooses the boundary, lays out a plan sheet and exports it as a vector PDF, a DXF, a CSV and a GeoJSON file. Tested TypeScript code computes every bearing, distance and area. The plan stays a draft until the surveyor named on it approves one exact version in Farbaek, and the surveyor still signs the printed sheet.

This folder documents what exists after stage 190. Where a part is planned, the document says so and names the stage. The decisions behind the module are in ADR 0198 to ADR 0201 in [`docs/adr`](../adr).

## What stage 190 built

One complete workflow: a cadastral (boundary) land survey plan, from points to an approved, printable PDF and a DXF.

| Part | Where | Document |
| --- | --- | --- |
| The engine: units, bearings, planar geometry, parcels, traverse misclosure, CRS registry, checks | [`src/core/survey/`](../../src/core/survey) | [GEOMETRY_ENGINE.md](GEOMETRY_ENGINE.md), [VALIDATION_SPECIFICATION.md](VALIDATION_SPECIFICATION.md) |
| Importers for delimited point files and GeoJSON points | [`src/core/survey/import/`](../../src/core/survey/import) | [IMPORT_EXPORT_SPECIFICATION.md](IMPORT_EXPORT_SPECIFICATION.md) |
| The plan sheet: a versioned template and a sheet scene in millimetres | [`src/core/survey/sheet/`](../../src/core/survey/sheet) | [PLAN_SHEET_SPECIFICATION.md](PLAN_SHEET_SPECIFICATION.md) |
| Writers for DXF R12, CSV and GeoJSON | [`src/core/survey/export/`](../../src/core/survey/export) | [IMPORT_EXPORT_SPECIFICATION.md](IMPORT_EXPORT_SPECIFICATION.md) |
| The PDF writer (PDFKit) | [`src/server/survey/pdf.ts`](../../src/server/survey/pdf.ts) | [IMPORT_EXPORT_SPECIFICATION.md](IMPORT_EXPORT_SPECIFICATION.md) |
| Database tables and `app_survey_*` functions (schema v93) | [`supabase/migrations/20270103090000_survey_studio.sql`](../../supabase/migrations/20270103090000_survey_studio.sql) | [DATA_MODEL.md](DATA_MODEL.md) |
| Server actions and the export route | [`src/app/app/survey/`](../../src/app/app/survey) | [API_SPECIFICATION.md](API_SPECIFICATION.md) |
| The plan editor and the other screens | [`src/components/survey/`](../../src/components/survey) | [CAD_ENGINE.md](CAD_ENGINE.md) |
| The public page, the public sample PDF and the home page section | [`src/app/(site)/survey/`](<../../src/app/(site)/survey>), [`src/components/marketing/survey-section.tsx`](../../src/components/marketing/survey-section.tsx) | [API_SPECIFICATION.md](API_SPECIFICATION.md) |

The rest of the documents: [ARCHITECTURE.md](ARCHITECTURE.md), [STANDARDS_RESEARCH.md](STANDARDS_RESEARCH.md), [TESTING_STRATEGY.md](TESTING_STRATEGY.md) and [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md).

## Where people meet it

| Address | What it is |
| --- | --- |
| `/app/survey` | Survey Studio's dashboard: the Sample project, the workspace's survey projects, and what this version includes. In the app navigation as "Survey Studio" ([`app-nav.tsx`](../../src/components/app/app-nav.tsx)) |
| `/app/survey/new` | A new project: name, plan type (only cadastral) and the coordinate system, confirmed by a tick |
| `/app/survey/profile` | The signed-in person's own surveyor details for this workspace |
| `/app/survey/<project>` | The project, in eight steps chosen with `?step=`: Import, Points, Boundary, Plan, Check, Export, History, Settings |
| `/app/survey/sample` | The Sample project: synthetic points, read-only, never stored |
| `/app/survey/<project>/export/<pdf, dxf, csv or geojson>` | The files, made from one drawing version and recorded before they are sent |
| `/survey` | The public page, in the site navigation ([`nav-links.ts`](../../src/components/site/nav-links.ts)) and the sitemap list ([`crawl.ts`](../../src/core/seo/crawl.ts)) |
| `/survey/sample-plan.pdf` | The Sample plan as a real vector PDF, built at build time and public |
| `/` | The home page section that draws the Sample sheet ([`survey-section.tsx`](../../src/components/marketing/survey-section.tsx)) |

The workspace activity log names every survey action in plain words ([`activity.ts`](../../src/core/workspace/activity.ts), the `survey.` entries).

## The workflow

1. **Create the project.** Name it and pick a coordinate system from the registry: SLD99 / Sri Lanka Grid 1999 (EPSG:5235), Kandawala / Sri Lanka Grid (EPSG:5234), WGS 84 / UTM zone 44N (EPSG:32644) or local coordinates. The person ticks a box that confirms it, and the project records who confirmed it and when. Nothing guesses it from the numbers.
2. **Import points.** Upload or paste a CSV, TXT or GeoJSON file. The person maps the columns and confirms the coordinates are metres in the project's system. Any row that can't be read stops the whole import. Imported points are never changed or deleted.
3. **Check the points.** A table of every point as imported (the first 500 on screen; exports include all).
4. **Choose the boundary.** Type the point numbers in order. Legs, the area and the ring checks update as you type. Buildings, walls, fences, drains, road edges and utilities can be added as features through existing points.
5. **Lay out the plan.** The plan editor shows the sheet. Pan, zoom, drag labels, show or lock layers, fill in the sheet fields, pick paper, orientation and scale, and choose the responsible surveyor. Every save is a new version.
6. **Check.** Every finding, most serious first, with what to do about it.
7. **Export.** PDF (open to print, or download), DXF, CSV and GeoJSON. A check that blocks export stops the PDF and DXF; the GeoJSON is stopped only by checks on the coordinates or the parcel, and the CSV of the points as imported is always available. Every file is recorded with its SHA-256 before it is sent.
8. **Approve.** Only the surveyor the plan names, with their own details entered, can approve the latest version. The approval stores a hash of what they approved. The DRAFT line leaves the sheet only for that approved version, and only while the approval still matches: changing the project's coordinate system withdraws it.

## Principles the code holds to

These come from the `farbaek-survey-studio` skill's rules and the stage plan.

- **Tested code calculates.** No AI takes part in this stage. Later, an assistant may only fill forms (stage 194, planned).
- **Nothing is invented.** Every sheet field is typed by a person. Empty fields print as a dotted line. The Sample project and every fixture are synthetic and labelled Sample.
- **The coordinate system is confirmed by a person** and recorded. Coordinate ranges only test whether a claim is plausible.
- **Bearings carry their convention.** Whole-circle bearings, clockwise from grid north of the confirmed system, written on the sheet.
- **Areas say what they are.** The computed planar grid area in m², from coordinates. A stated or deed extent is a separate field.
- **Three kinds of data.** Imported points are immutable; computed results are recomputed and stamped with `SURVEY_ENGINE_VERSION`; the drawing document is saved as append-only versions.
- **Nothing changes silently.** No snapping, repair, reordering or rounding of surveyed coordinates. A traverse misclosure is reported, never adjusted.
- **Approval is not certification.** Under section 13 of the Survey Act No. 17 of 2002, a plan is admissible in a Sri Lankan court only if certified by a registered licensed surveyor or made by or for the Surveyor General. Farbaek records a review; the surveyor's signature on paper certifies the plan. See [STANDARDS_RESEARCH.md](STANDARDS_RESEARCH.md).

## What it doesn't do yet

The public page lists the same limits.

- Only cadastral boundary plans. Subdivision, topographic, engineering and road plans are planned for stages 191 to 193.
- No traverse adjustment and no transformation between coordinate systems. `computeTraverse` reports a misclosure and is used only in tests so far.
- English only on the sheet. Sinhala and Tamil text is planned; the embedded Geist fonts have no Sinhala or Tamil glyphs, so a sheet with such text is refused for export (`TEXT_SCRIPT_NOT_SUPPORTED`) rather than printed as empty boxes.
- No submission to the Survey Department or the UDA.
- No drawing tools beyond label moves, layers and the typed boundary and features. Full CAD tools are planned for stage 195.
- No vertical datum is recorded with elevations. Elevations are stored and printed as imported.
