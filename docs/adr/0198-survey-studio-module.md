# ADR 0198: Survey Studio, a module inside Farbaek

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 190
- **Builds on:**
  - ADR 0001 (the stack and the shape of the repository);
  - ADR 0009 (model output is untrusted and only prefills forms);
  - ADR 0008 and ADR 0183 (White Signal, and status shown only through `StatusBadge`).

## Context

The owner asked for professional land surveying in Farbaek: surveyors give points, coordinates and field data, and Farbaek makes accurate, editable, print-ready plans with validation, vector PDF and DXF output. The brief asked for "a separate, independent module within the existing platform", researched from official sources, with nothing invented.

Plans are legal documents about real land. Under section 13 of the Survey Act No. 17 of 2002, a plan is admissible in a Sri Lankan court only if it was prepared by or for the Surveyor General and certified, or certified by a registered licensed surveyor. Section 64(1)(e)(iv) makes it an offence for anyone else to certify or sign such a plan. Section 2(p) recognises a separate role: a draughtsman who prepares a plan from a surveyor's field notes and computes its area for a registered surveyor. (Read in the Act's text on 15 November 2026; see `docs/survey/STANDARDS_RESEARCH.md`.)

A wrong but plausible number moves a boundary, and nobody can audit how a language model produced one.

## Decision

**A module inside Farbaek, not a separate product or brand.** Survey Studio lives in the same app, workspace, sign-in, roles, audit log and design system. People reach it as "Survey Studio" in the app navigation (`/app/survey`), in the site navigation (`/survey`) and in a home page section.

**Split like the rest of Farbaek:**

| Part | Where |
| --- | --- |
| The engine: calculations, importers, the sheet composer, the DXF, CSV and GeoJSON writers, checks | `src/core/survey/`: framework-free `.ts`, shared by the server, the browser and the future native apps |
| Reads, writes and the PDF writer | `src/server/survey/`: server-only |
| Pages, server actions, the export route | `src/app/app/survey/`; the public page in `src/app/(site)/survey/` |
| Screens | `src/components/survey/` |
| Data | migration v93 (`supabase/migrations/20270103090000_survey_studio.sql`): `survey_*` tables, written only through `app_survey_*` functions |

Each engine stays its own module with its own tests. The drawing model is independent of SVG or PDF, and no calculation reads presentation data. `SURVEY_ENGINE_VERSION` (`src/core/survey/version.ts`) is stamped on every computed result and export, and is raised whenever a calculation, a rounding rule or an export format changes.

**Farbaek drafts; the surveyor certifies.**
- Survey Studio takes the draughtsman's role and never the certifying one.
- Every plan is a draft until the surveyor the plan names approves one exact version. Only that member, with their own details entered, can approve, and the approval stores a hash of what they approved.
- An approval in Farbaek records a review. It is not a certification, a signature or a statement of legal compliance. The sheet keeps an empty signature box and an empty seal box, and says "DRAFT. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet." until the version is approved. The approve form, the Export step and the public page say the same in plain words.
- Surveyor details are what the surveyor enters. Farbaek checks no register and calls nothing "verified".

**Tested code calculates; AI never does.** No AI takes part in stage 190. A later assistant (stage 194, planned) may only turn a surveyor's words into a structured request and fill forms, under ADR 0009's rule that model output is untrusted.

**Nothing is invented.** No surveyor names, licence numbers, plan numbers, adjoining owners, signatures or stamps. The Sample project and all test data are synthetic and labelled Sample. An empty sheet field prints as a dotted line.

**Plan types arrive one at a time.** The database accepts six plan types, but only cadastral can be created in this stage; subdivision, topographic, engineering and road plans each get their own engine in stages 191 to 193.

## Consequences

- Survey Studio reuses Farbaek's sign-in, roles (owners, admins and members edit; viewers read), suspension, audit log and activity feed, with no second account system.
- The certifying act stays on paper. Farbaek's exposure under section 64 stays low, and every screen has to keep approval and certification apart in its wording.
- Every calculation is reproducible: the same points, document version and engine version give the same figures and the same files.
- The module adds `pdfkit` (a dependency) and `dxf-parser` (a dev dependency); ADR 0200 explains them.
- Rules for whether a sheet satisfies any regulation stay with the surveyor. Survey Studio reports findings and never claims compliance.
