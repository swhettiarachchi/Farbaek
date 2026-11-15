# Survey Studio architecture

Survey Studio follows Farbaek's usual split: framework-free domain code in `src/core`, server-only code in `src/server`, routes and server actions in `src/app`, and UI in `src/components`. ADR 0198 records why it is a module inside Farbaek rather than a separate product.

## Layers

| Layer | Folder | Rules |
| --- | --- | --- |
| Engine | [`src/core/survey/`](../../src/core/survey) | Plain `.ts`. No React, Next, `server-only` or `node:` imports. Shared by the server, the browser and, later, the native apps. Every calculation is here, with known-answer tests |
| Server | [`src/server/survey/`](../../src/server/survey) | `import "server-only"`. Reads as the signed-in person through row level security ([`read.ts`](../../src/server/survey/read.ts)); writes through the service role's `app_survey_*` functions ([`store.ts`](../../src/server/survey/store.ts)); the PDF writer ([`pdf.ts`](../../src/server/survey/pdf.ts)) |
| App | [`src/app/app/survey/`](../../src/app/app/survey) | Server Components for the pages, `"use server"` actions in [`actions.ts`](../../src/app/app/survey/actions.ts), and the export route handler |
| Public site | [`src/app/(site)/survey/`](<../../src/app/(site)/survey>) | The public page and the public sample PDF |
| UI | [`src/components/survey/`](../../src/components/survey) | `"use client"` leaves for anything with state: the plan editor, the boundary editor, the import panel and the forms |
| Database | [`supabase/migrations/20270103090000_survey_studio.sql`](../../supabase/migrations/20270103090000_survey_studio.sql) | Seven tables, read by members, written only by eight `app_survey_*` functions. See [DATA_MODEL.md](DATA_MODEL.md) |

## The engine's modules

| Module | Does |
| --- | --- |
| [`version.ts`](../../src/core/survey/version.ts) | `SURVEY_ENGINE_VERSION = "survey-engine/1.0.0"` |
| [`units.ts`](../../src/core/survey/units.ts) | Area units and acres, roods and perches |
| [`angles.ts`](../../src/core/survey/angles.ts) | Whole-circle bearings, DMS with carry, quadrant notation, parsing typed bearings |
| [`geometry.ts`](../../src/core/survey/geometry.ts) | Distance, shoelace area, perimeter, bounds, centroid, orientation, self-intersections, zero-length legs, interior angles |
| [`parcel.ts`](../../src/core/survey/parcel.ts) | A parcel from boundary point ids: legs, area, perimeter and ring checks |
| [`traverse.ts`](../../src/core/survey/traverse.ts) | Coordinates from bearing and distance legs, with linear misclosure. No adjustment |
| [`crs.ts`](../../src/core/survey/crs.ts) | The CRS registry and the plausibility checks. No transformations |
| [`document.ts`](../../src/core/survey/document.ts) | The drawing document's zod schema, layers, paper sizes, standard scales, the legend starting examples |
| [`qc.ts`](../../src/core/survey/qc.ts) | Quality-control findings |
| [`view.ts`](../../src/core/survey/view.ts) | `buildPlan` (one way to compute everything a screen or export shows) and `approvalHash` |
| [`fixtures.ts`](../../src/core/survey/fixtures.ts) | Synthetic sample points and document |
| [`import/`](../../src/core/survey/import) | `delimited.ts`, `geojson.ts`, `detect.ts` |
| [`sheet/`](../../src/core/survey/sheet) | `template.ts` (template data), `scene.ts` (the scene types and page maths), `compose.ts` (`composeSheet`) |
| [`export/`](../../src/core/survey/export) | `dxf.ts` (`writeDxf`), `points.ts` (`pointsCsv`, `surveyGeoJson`) |

The PDF writer is in `src/server/survey/pdf.ts`, not in the engine, because it reads font files from disk and depends on PDFKit, a Node package.

## One computation path

Every view of a plan comes from `buildPlan(input)` in [`view.ts`](../../src/core/survey/view.ts). It takes the immutable points, one drawing version, the CRS id, the CRS confirmation in words, the surveyor's details and the approval of that version, and returns:

- the CRS record;
- the parcel (`computeParcel`), or the missing point ids;
- every finding, from `checkSurvey` and from the sheet composer, sorted by severity;
- the composed sheet (`composeSheet` with `SRI_LANKA_CADASTRAL_V1`);
- the findings that block export (`blocksExport`), the subset of those that concern the coordinates or the parcel and so also hold back the GeoJSON (`blocksData`), and those that block approval (`blocksApproval`).

These all call it:

| Caller | Purpose |
| --- | --- |
| [`[projectId]/page.tsx`](<../../src/app/app/survey/[projectId]/page.tsx>) | The project screens and the export and approval states |
| [`plan-editor.tsx`](../../src/components/survey/plan-editor.tsx) | Recomputes in the browser after every edit, so the preview is the plan |
| [`export/[kind]/route.ts`](<../../src/app/app/survey/[projectId]/export/[kind]/route.ts>) | The files |
| `approveSurveyAction` in [`actions.ts`](../../src/app/app/survey/actions.ts) | Refuses approval while a finding blocks it |
| [`sample-plan.ts`](../../src/components/survey/sample-plan.ts) | The Sample sheet on the home page and `/survey` |
| [`sample-plan.pdf/route.ts`](<../../src/app/(site)/survey/sample-plan.pdf/route.ts>) | The public sample PDF |

[`present.ts`](../../src/server/survey/present.ts) turns a loaded project into `buildPlan`'s input: the CRS confirmation as "Confirmed by <name> on <YYYY-MM-DD>" (or "Sample data: no real survey"), the surveyor's details, and the approval of the loaded version. An approval counts only while it isn't withdrawn and its hash equals the plan's hash computed now (`approvalStatus`); an approved sheet shows the surveyor's details as recorded at approval.

## Data flow

```
Point file ──► import panel (preview in the browser, same tested reader)
                    │
                    ▼
            importSurveyPointsAction ──► reads the file again on the server
                    │                        (the browser's rows are never trusted)
                    ▼
            app_survey_import ──► survey_sources (file, hash) + survey_points (immutable)

Boundary editor / plan editor ──► saveSurveyDrawingAction ──► zod schema, known points,
                                                             surveyor has a profile
                                        │
                                        ▼
                               app_survey_save_drawing ──► survey_drawings (new version)

Project page / editor / export route ──► buildPlan(points, one version) ──► parcel, findings, sheet scene
                                                                               │
                                       SVG preview ◄───────────────────────────┤
                                       PDF (PDFKit) ◄──────────────────────────┤
                                       DXF, CSV, GeoJSON ◄── parcel and points ┘
```

## Who can do what

- **Reads** go through the person's own Supabase client, so row level security limits them to workspaces they belong to (`private.is_member`).
- **Writes** go through `writer()` in [`actions.ts`](../../src/app/app/survey/actions.ts), which checks, in order: a signed-in context (else redirect to `/sign-in`), not the demo, a current workspace, writes enabled for the workspace, and a contributor role (owner, admin or member). Then it calls the `app_survey_*` function with the admin client. The function checks the role again (`private.require_contributor`) and refuses a suspended workspace.
- **Read-only reasons** shown on screen come from `surveyReadOnlyReason` in [`access.ts`](../../src/server/survey/access.ts): the Sample, the demo workspace, writes disabled, or a viewer.
- **Exports** are open to any member who can read the project, viewers included. Recording an export (`app_survey_record_export`) needs membership, an active workspace and an unarchived project. Archived projects can't be opened at all: the reader skips them.
- **Approval** is only for the surveyor the latest version names, with their own profile in the workspace. The SQL function enforces this; the screen shows the form only to that person.

## The Sample project

[`sample.ts`](../../src/server/survey/sample.ts) builds the project with id `sample` from [`fixtures.ts`](../../src/core/survey/fixtures.ts): nine synthetic points near E 500 km, N 600 km on the SLD99 grid, a five-sided boundary, a building outline and a wall. It is the same for everyone, never stored, and read-only. Its exports are not recorded. It can't be approved. It works in the demo workspace, where the dashboard shows no other projects and project pages other than the Sample return 404.

## Dependencies added in this stage

| Package | Version | Where | Why |
| --- | --- | --- | --- |
| `pdfkit` | 0.20.2 | dependency, and `serverExternalPackages` in [`next.config.ts`](../../next.config.ts) | The vector PDF writer (ADR 0200). It reads its font metric files from its own folder at run time, so it isn't bundled |
| `@types/pdfkit` | 0.17.7 | devDependency | Types |
| `dxf-parser` | 1.1.2 | devDependency | The independent DXF reader in the tests |

`fontkit` 2.0.4 comes in through PDFKit (from `pnpm-lock.yaml`). `zod` 4.6.7 and `@electric-sql/pglite` 0.5.8 were already in the repo. The PDF embeds Geist and Geist Mono from `android/app/src/main/assets/fonts/`, which `scripts/android-fonts.mjs` unpacks from Next.js's WOFF2 files.

## How to add a plan type

This is a guide for stages 191 to 193 (subdivision, topographic, engineering and road). None of it is done yet. Today several places assume cadastral, and each needs a deliberate change.

**Where cadastral is assumed now:**

| Place | What it does today |
| --- | --- |
| `survey_projects.plan_type` check constraint | Already allows `cadastral`, `subdivision`, `topographic`, `engineering`, `road` and `custom` |
| `app_survey_create_project` | Raises `PLAN_TYPE_NOT_AVAILABLE` for anything but `cadastral` |
| `createSurveyProjectAction` | Always sends `planType: "cadastral"` |
| `NewSurveyProjectForm` in [`forms.tsx`](../../src/components/survey/forms.tsx) | One radio button, cadastral, with a note that the others come later |
| `buildPlan` in [`view.ts`](../../src/core/survey/view.ts) | Always composes with `SRI_LANKA_CADASTRAL_V1`; `PlanInput` has no plan type |
| `surveyDocumentSchema` in [`document.ts`](../../src/core/survey/document.ts) | `schema: 1`, with one boundary ring and features |
| `checkSurvey` in [`qc.ts`](../../src/core/survey/qc.ts) | Cadastral checks only |
| The project page | Its description says "Land survey plan on <CRS>", and its steps are the cadastral ones |

**Steps, in order:**

1. **Research first.** Record every jurisdiction rule the type needs in [STANDARDS_RESEARCH.md](STANDARDS_RESEARCH.md) with its source and status (skill rule 8). An unverified rule becomes a setting with a review warning, never a hard-coded value. For subdivision, the UDA figures are versioned data due for replacement on 31 December 2026.
2. **Its own engine.** Add a folder such as `src/core/survey/subdivision/` with its own known-answer tests and an independent second method (skill rule 13). Keep it separate from the cadastral code and from rendering. If it needs a new library (clipping, triangulation, contours), ask the owner, pin the exact version, and avoid releases only days old; the research's candidates are in STANDARDS_RESEARCH.md.
3. **The document.** Extend the schema without breaking stored versions. `loadSurveyProject` marks a version that doesn't parse as unreadable and shows defaults, so every existing `schema: 1` document must still parse. A discriminated union on a new field, or `schema: 2` alongside `schema: 1`, both work; the choice needs an ADR.
4. **The template.** Add a new `SheetTemplate` to `TEMPLATES` in [`template.ts`](../../src/core/survey/sheet/template.ts) with its own id and version. Store which template and version a drawing uses (today nothing stores it, because there is one), and pass the plan type into `buildPlan`.
5. **The checks.** Add finding codes with a severity, an action and what they block, and list them in [VALIDATION_SPECIFICATION.md](VALIDATION_SPECIFICATION.md).
6. **The sheet.** Compose any new content into the same sheet scene in millimetres, so the SVG preview, the PDF and the checks still read one structure (ADR 0201). Report text that doesn't fit; never move geometry.
7. **Exports.** Add layers to `LAYER_IDS` and `LAYER_STYLE` in [`dxf.ts`](../../src/core/survey/export/dxf.ts) as needed, and extend the GeoJSON writer. Test the DXF with an independent reader.
8. **The database.** A migration that replaces `app_survey_create_project` to accept the new type, plus any new tables. Add PGlite tests in `tests/db/`. Ask the owner before the migration (CLAUDE.md). If spatial queries become necessary, revisit ADR 0199 first.
9. **The screens.** Enable the type in the new-project form and the action, and give the project page the steps the type needs. Follow the design rules in CLAUDE.md and the `farbaek-ui` and `farbaek-human-made` skills.
10. **Records.** An ADR for each decision, the stage doc, and updates to these documents.
