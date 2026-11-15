# Survey Studio API specification

Survey Studio has no public JSON API. Its interfaces are Next.js server actions, two route handlers and the pages. Writes go from a server action to an `app_survey_*` SQL function (see [DATA_MODEL.md](DATA_MODEL.md)); reads go through the signed-in person's Supabase client and row level security.

## Server actions

All in [`src/app/app/survey/actions.ts`](../../src/app/app/survey/actions.ts) (`"use server"`). The form actions return a `SurveyFormState`:

```ts
type SurveyFormState =
  | { status: "idle" }
  | { status: "error"; message: string; issues?: ImportIssue[] }
  | { status: "done"; message: string; version?: number };
```

### The write guard

Every action that writes first calls `writer()`, which returns the admin client, the person's own client and the actor (`orgId`, `userId`), or a reason:

| Condition | Result |
| --- | --- |
| No signed-in app context | redirect to `/sign-in` |
| The demo workspace | "The demo workspace is read-only, so nothing here is saved." |
| No current workspace | "Create a workspace first." |
| Writes disabled for the workspace | the workspace's own reason |
| Not an owner, admin or member | `FORBIDDEN`: "Only owners, admins and members of this workspace can change survey projects." |
| No admin or user client | `NOT_CONFIGURED` |

Errors from the database come back through `surveyErrorFrom` in [`store.ts`](../../src/server/survey/store.ts) as one of the messages in `SURVEY_MESSAGES`; anything it doesn't recognise becomes `UNKNOWN`. `POINT_CONFLICT` adds the conflicting point numbers.

### `createSurveyProjectAction(prev, form)`

| Field | Rule |
| --- | --- |
| `name` | 1 to 120 characters after trimming |
| `crs` | an id from the registry: `EPSG:5235`, `EPSG:5234`, `EPSG:32644` or `LOCAL` |
| `confirm` | must be `yes`: "Confirm the coordinate system. Farbaek never guesses it from the numbers." |

Creates a cadastral project with an empty first version (`emptyDocument()`), confirmed by the actor, then redirects to `/app/survey/<id>?step=import`.

### `updateSurveyProjectAction(prev, form)`

Fields `projectId` (UUID), `name` (1 to 120), `crs` (from the registry) and `confirm` (`yes` or absent); anything else is `INVALID_REQUEST`. Returns "Saved. The coordinate system is confirmed, by you." or "Saved." Changing the CRS without confirming clears the confirmation, and changing it at all withdraws the project's standing approvals (in SQL).

### `importSurveyPointsAction(input)`

Called with an object, not a form:

| Field | Rule |
| --- | --- |
| `projectId` | UUID |
| `fileName` | 1 to 200 characters, no control characters |
| `content` | the file's text, at most 2,097,152 characters |
| `format` | `delimited` or `geojson` |
| `delimiter` | `,`, a tab, `;` or `whitespace` |
| `hasHeader` | boolean |
| `columns` | 3 to 40 roles: `point`, `easting`, `northing`, `elevation`, `code`, `ignore` |
| `units` | the literal `metre` |
| `crsId` | the CRS the page showed when the person confirmed the units (at most 40 characters) |

Steps:
1. Validate the input, else `INVALID_REQUEST`; run the write guard.
2. Read the project's CRS as the person (unarchived, in this workspace), else `NOT_FOUND`. If it isn't `crsId`, refuse with `CRS_CHANGED`.
3. Read the file again on the server with the same tested reader as the preview: `parseGeoJsonPoints(content, <the project's EPSG code or null>)` or `parseDelimited`. The browser's parsed rows are never trusted.
4. Any error-severity issue refuses the whole import: "<n> rows can't be read, so nothing was imported. Fix the file and try again.", with up to 50 issues. No points: "The file has no points to import."
5. Call `app_survey_import` with the settings (delimiter, header, columns, units, CRS) and the points. The database refuses again if the CRS changed, and refuses the whole import on a conflicting point.
6. "Imported <n> points; <k> already here, unchanged; <w> repeated rows kept once."

### `saveSurveyDrawingAction({ projectId, baseVersion, document, note? })`

1. `projectId` must be a UUID and `baseVersion` an integer (`INVALID_REQUEST`).
2. `document` must parse with `surveyDocumentSchema`: "The plan couldn't be saved: some of its settings aren't valid. Reload and try again."
3. Write guard; load the project as the person (`NOT_FOUND`).
4. Every point id in the boundary and features must be in the project: "The plan uses points that aren't in this project. Reload and try again."
5. A chosen surveyor must have a profile in the workspace: "The chosen surveyor hasn't entered their details in this workspace yet."
6. `app_survey_save_drawing` with the note cut to 200 characters. A stale base gives `VERSION_CONFLICT`.
7. Returns `{ status: "done", message: "Saved as version <n>.", version: <n> }`.

### `setSurveyorProfileAction(prev, form)`

Fields `fullName` (required), `designation`, `registration`, `address` and `contact`, each trimmed and cut to 120, 120, 60, 300 and 160 characters. Saves the actor's own profile only. "Your surveyor details are saved. They appear on plans you are responsible for."

### `approveSurveyAction(prev, form)`

| Field | Rule |
| --- | --- |
| `projectId` | UUID |
| `version` | integer |
| `confirm` | must be `yes`: "Tick the box to confirm you reviewed this version." |

1. Write guard; load the project as the person. If the latest version isn't `version`: `VERSION_CONFLICT`.
2. Recompute the plan with `buildPlan`, with the approver's own profile as the surveyor. Any finding that blocks approval refuses: "This version can't be approved yet: <messages>".
3. Compute `approvalHash` (document, CRS, the points it uses, engine version).
4. `app_survey_approve` with the version, the CRS the server read and the hash. The database refuses `CRS_CHANGED`, `NOT_THE_SURVEYOR`, `NO_SURVEYOR_PROFILE` and `ALREADY_APPROVED`.
5. "Version <n> is approved by you. Print it at 100% and sign it: the signature on paper is what certifies a plan."

### `archiveSurveyProjectAction(form)`

Field `projectId` (UUID). Calls `app_survey_archive_project` and redirects to `/app/survey`. It returns nothing: an invalid id or a refused write returns without a message, and the result of the archive call isn't checked before the redirect.

## Reads

[`src/server/survey/read.ts`](../../src/server/survey/read.ts), as the signed-in person:

| Function | Returns |
| --- | --- |
| `listSurveyProjects(client, orgId)` | Up to 200 unarchived projects, newest change first, each with its point count and the versions that have a standing approval; null on a read error |
| `loadSurveyProject(client, orgId, projectId, version?)` | The project, every point (paged 1,000 at a time up to 20,000), its sources, one drawing version (the latest, or `version`), the 100 newest versions, every approval (with `withdrawn_at`), the 50 newest exports and the workspace's surveyor profiles. Null for a non-UUID id, a project of another workspace, an archived project, or a read error. A stored document that doesn't parse comes back as `emptyDocument()` with `readable: false` |

[`src/server/survey/present.ts`](../../src/server/survey/present.ts):
- `approvalStatus(data)` decides whether the loaded version is approved: an approval of that version counts only if it isn't withdrawn **and** its `content_sha256` equals `approvalHash` computed now. Otherwise it reports the lapse, `crs_changed` or `content_changed`.
- `planInputFor(data)` builds `buildPlan`'s input. An approved version shows the surveyor's details as they were at approval, from the approval record; otherwise the named surveyor's current profile.

## The export route

`GET /app/survey/<projectId>/export/<kind>[?version=N][&inline=1]`, in [`[projectId]/export/[kind]/route.ts`](<../../src/app/app/survey/[projectId]/export/[kind]/route.ts>).

| Parameter | Values |
| --- | --- |
| `projectId` | a project UUID, or `sample` |
| `kind` | `pdf`, `dxf`, `csv` or `geojson` |
| `version` | optional; a positive integer. Without it, the latest version |
| `inline` | `1` serves a PDF inline instead of as a download; ignored for other kinds |

Steps:
1. Check the kind and the version parameter.
2. Load the app context; the Sample comes from `sampleProject()`, any other project is read as the person (none in the demo workspace).
3. Build the plan input (`planInputFor`) and the plan (`buildPlan`).
4. **Refuse while a finding blocks this kind.** The PDF and DXF wait for every finding that blocks export (`blocksExport`). The GeoJSON waits only for those that concern the coordinates or the parcel (`blocksData`), because it has no sheet. The CSV, the points exactly as imported, is never held back.
5. Build the file. The DXF and GeoJSON carry a status line: "Approved in Farbaek by <name> on <date>, version <n>. Approval records a review; the signed print certifies the plan." or "DRAFT, version <n>. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet." The DXF adds the CRS confirmation, and the GeoJSON a `coordinate_system_confirmed` flag.
6. Hash the bytes (SHA-256).
7. **Record the export before sending it** (`app_survey_record_export`: version, kind, hash, size, and the paper, orientation and scale). If it can't be recorded, nothing is sent. The function refuses a non-member (`FORBIDDEN`), a suspended workspace (`WORKSPACE_SUSPENDED`), an archived project and a version that doesn't exist (`NOT_FOUND`). The Sample's exports aren't recorded.
8. Send the file.

**Responses:**

| Status | When | Body |
| --- | --- | --- |
| 200 | The file | the file |
| 400 | `version` isn't a positive integer | "That version number isn't valid." |
| 403 | Recording refused as `FORBIDDEN` (not a member) | the store's message |
| 404 | Unknown kind | "There's no such export." |
| 404 | No signed-in workspace | "There's no such survey project." |
| 404 | No such project in this workspace, an archived project, a project other than the Sample in the demo, or a version that doesn't exist | "There's no such survey project, or it isn't in this workspace." |
| 409 | A finding blocks this kind (see step 4) | "This plan can't be exported yet:" then one line per finding, "- <message> <action>" |
| 500 | Recording failed for another reason, such as a suspended workspace | the store's message |
| 503 | No admin client to record the export | "Farbaek's server isn't set up to record exports, so none is made." |

Error bodies are `text/plain; charset=utf-8` with `cache-control: no-store`.

**Headers on 200:**

| Header | Value |
| --- | --- |
| `content-type` | `application/pdf`, `application/dxf`, `text/csv; charset=utf-8` or `application/geo+json` |
| `content-disposition` | `attachment` (or `inline` for `?inline=1` on a PDF); `filename="<stem>-v<version>[-draft].<ext>"`, the stem from the plan number or the project name in ASCII letters, digits and hyphens, at most 60 characters, or `survey-plan` |
| `content-length` | the byte count |
| `cache-control` | `private, no-store` |
| `x-content-type-options` | `nosniff` |
| `x-farbaek-sha256` | the SHA-256 of the body, as recorded |

File formats: [IMPORT_EXPORT_SPECIFICATION.md](IMPORT_EXPORT_SPECIFICATION.md).

## The public sample PDF

`GET /survey/sample-plan.pdf`, in [`sample-plan.pdf/route.ts`](<../../src/app/(site)/survey/sample-plan.pdf/route.ts>).

- Public, no sign-in. `dynamic = "force-static"`, so it is built once at build time from the same engine as every export.
- The Sample project's plan (synthetic points), marked as a sample and a draft on the sheet itself.
- Headers: `content-type: application/pdf`, `content-disposition: inline; filename="farbaek-survey-sample-plan.pdf"`, `cache-control: public, max-age=3600`, `x-content-type-options: nosniff`.
- The PDF's title is "Farbaek Survey Studio sample plan (synthetic data)" and its subject "Sample survey plan from synthetic points. Draft, not certified."

## Pages

| Route | File | Notes |
| --- | --- | --- |
| `/app/survey` | [`page.tsx`](../../src/app/app/survey/page.tsx) | The dashboard. A project card says "Version N approved" (the highest version with a standing approval) or "Draft". In the demo workspace, only the Sample |
| `/app/survey/new` | [`new/page.tsx`](../../src/app/app/survey/new/page.tsx) | The new-project form, disabled with the read-only reason where writes aren't possible |
| `/app/survey/profile` | [`profile/page.tsx`](../../src/app/app/survey/profile/page.tsx) | The person's own surveyor details |
| `/app/survey/<id>?step=<step>` | [`[projectId]/page.tsx`](<../../src/app/app/survey/[projectId]/page.tsx>) | Steps `import`, `points`, `boundary`, `plan`, `check`, `export`, `history`, `settings`. Without a valid step: Import when there are no points, Boundary when there is no boundary, otherwise Plan. Always the latest version. History marks each version "Approved", "Approval withdrawn", or, for the version shown, "Approval no longer applies". 404 for a project the person can't read, or an archived one |
| `/app/survey/sample` | the same page | The Sample, read-only |
| `/survey` | [`(site)/survey/page.tsx`](<../../src/app/(site)/survey/page.tsx>) | The public page, with the Sample sheet drawn by the engine |

Every `/app/survey` page returns 404 when there is no current workspace.
