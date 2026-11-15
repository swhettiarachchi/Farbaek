# Survey Studio data model

Sources: [`supabase/migrations/20270103090000_survey_studio.sql`](../../supabase/migrations/20270103090000_survey_studio.sql) (Farbaek schema v93, stage 190) and [`20270104090000_survey_autodraft.sql`](../../supabase/migrations/20270104090000_survey_autodraft.sql) (v94, stage 191: the drafting assistant's usage operations and its audit function). Plain Postgres: no PostGIS (ADR 0199). Tests: [`tests/db/survey-studio.test.ts`](../../tests/db/survey-studio.test.ts).

## Three layers of data

The skill's rule 6 asks for raw observations, computed results and presentation kept apart. Survey Studio keeps them like this:

| Layer | Where | Changes |
| --- | --- | --- |
| **Imported observations** | `survey_sources` (the file as given, its SHA-256) and `survey_points` (point number, E, N, Z, code) | Never updated or deleted. Nobody, not even the server, has an update path. A correction is a new import with new point numbers |
| **Computed results** | Not stored. Bearings, distances, areas, findings and the sheet are recomputed from the points and one drawing version by `buildPlan` every time they are shown or exported | Each result carries `SURVEY_ENGINE_VERSION` (`survey-engine/1.0.0`, [`version.ts`](../../src/core/survey/version.ts)) |
| **The drawing document** | `survey_drawings.document`: what the surveyor decided (the boundary as point ids, features, label offsets, layers, sheet fields, settings, the responsible surveyor) | Append-only versions. Each save inserts version N + 1 |

Where the engine version is stamped:
- `ParcelResult.engine` and `method` ([`parcel.ts`](../../src/core/survey/parcel.ts));
- the sheet's notes ("Prepared with Farbaek Survey Studio (survey-engine/1.0.0).") and the overleaf ("Computed by survey-engine/1.0.0.");
- the DXF's note on the TEXT layer;
- the GeoJSON's `farbaek.engine` and the parcel feature's `engine` property;
- the PDF's Creator entry;
- the approval hash, which covers the engine version with the document, the CRS and the points used.

Two records keep a fingerprint of a computed output: `survey_exports.sha256` (each file made) and `survey_approvals.content_sha256` (what the surveyor approved).

## Tables

Every table has row level security on. `public`, `anon`, `authenticated` and `service_role` lose all privileges; `authenticated` and `service_role` get `select` back. Each table has one policy, "members read …", `for select to authenticated using ((select private.is_member(org_id)))`. No role can insert, update or delete directly; writes happen only inside the `security definer` functions below.

### `survey_projects`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key, `gen_random_uuid()` |
| `org_id` | uuid | not null, references `organizations`, cascade delete |
| `name` | text | 1 to 120 characters after trimming, no control characters |
| `plan_type` | text | one of `cadastral`, `subdivision`, `topographic`, `engineering`, `road`, `custom` |
| `crs_id` | text | matches `^(EPSG:[0-9]{4,6}|LOCAL)$` |
| `crs_confirmed_by` | uuid | references `auth.users`, set null on delete |
| `crs_confirmed_at` | timestamptz | |
| `created_by` | uuid | references `auth.users`, set null on delete |
| `created_at`, `updated_at` | timestamptz | not null, default `now()` |
| `archived_at` | timestamptz | set by archiving |

Constraint `survey_projects_confirmation_check`: a confirmer always has a time (`crs_confirmed_at is not null or crs_confirmed_by is null`). The time stays if the confirmer's account is deleted. Index `survey_projects_org_idx (org_id, updated_at desc)`.

### `survey_sources`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key |
| `project_id`, `org_id` | uuid | not null, cascade delete |
| `file_name` | text | 1 to 200 characters, no control characters |
| `format` | text | `delimited` or `geojson` |
| `content` | text | the file as uploaded, at most 2,097,152 bytes |
| `sha256` | text | 64 lowercase hex characters, computed by the database from the content as UTF-8 |
| `size_bytes` | integer | 0 to 2,097,152, set to `octet_length(content)` by the database |
| `settings` | jsonb | how it was read (delimiter, header, column mapping, units), at most 8,192 bytes |
| `point_count` | integer | 0 to 20,000: the rows sent, including ones skipped as repeats |
| `created_by`, `created_at` | | |

Index `survey_sources_project_idx (project_id, created_at)`.

### `survey_points`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key. The drawing document refers to points by this id |
| `project_id`, `org_id`, `source_id` | uuid | not null, cascade delete |
| `point_id` | text | the point number as written: 1 to 32 characters, no control characters |
| `e`, `n` | numeric | not null, absolute value under 100,000,000. Decimal, stored exactly as imported |
| `z` | numeric | null, or absolute value under 100,000 |
| `code` | text | null, or at most 64 characters with no control characters |
| `line` | integer | the line (or feature) number in the source file, above 0 |
| `created_at` | timestamptz | |

Constraint `survey_points_unique (project_id, point_id)`: a point number appears once per project. Index `survey_points_source_idx (source_id)`.

The reader converts `e`, `n` and `z` to JavaScript numbers (`z.coerce.number()` in [`read.ts`](../../src/server/survey/read.ts)), so every calculation runs in float64. The database comparison that finds conflicting re-imports runs on the exact decimals.

### `survey_drawings`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key |
| `project_id`, `org_id` | uuid | not null, cascade delete |
| `version` | integer | above 0; unique with `project_id` (`survey_drawings_version_unique`) |
| `document` | jsonb | a JSON object of at most 524,288 bytes. The server checks it with `surveyDocumentSchema` before saving |
| `note` | text | null or at most 200 characters |
| `created_by`, `created_at` | | |

### `survey_surveyor_profiles`

What a surveyor enters about themselves, per workspace. Farbaek checks no licence or register.

| Column | Type | Rules |
| --- | --- | --- |
| `org_id`, `user_id` | uuid | primary key together, cascade delete |
| `full_name` | text | 1 to 120 characters after trimming, no control characters |
| `designation` | text | default `''`, at most 120, no control characters |
| `registration` | text | default `''`, at most 60, no control characters |
| `address` | text | default `''`, at most 300 (line breaks allowed) |
| `contact` | text | default `''`, at most 160, no control characters |
| `updated_at` | timestamptz | |

There is no licence year or accreditation field yet; the research recommends both (see [STANDARDS_RESEARCH.md](STANDARDS_RESEARCH.md)).

### `survey_approvals`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key |
| `project_id`, `org_id` | uuid | not null, cascade delete |
| `drawing_id` | uuid | references `survey_drawings` |
| `drawing_version` | integer | not null |
| `approved_by` | uuid | set null on delete |
| `surveyor` | jsonb | the surveyor's details at that moment (name, designation, registration, address, contact), at most 4,096 bytes |
| `content_sha256` | text | 64 lowercase hex characters: `approvalHash`, computed by the server |
| `approved_at` | timestamptz | |
| `withdrawn_at` | timestamptz | set when the approval stops applying. The row stays as a record |
| `withdrawn_reason` | text | null, or `crs_changed` |

Constraint `survey_approvals_withdrawn`: `withdrawn_at` and `withdrawn_reason` are both set or both null. The partial unique index `survey_approvals_once (drawing_id) where withdrawn_at is null` allows one standing approval per version; after a withdrawal the version can be approved again.

### `survey_exports`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key |
| `project_id`, `org_id` | uuid | not null, cascade delete |
| `drawing_version` | integer | above 0 |
| `kind` | text | `pdf`, `dxf`, `csv` or `geojson` |
| `sha256` | text | 64 lowercase hex characters, of the bytes sent |
| `size_bytes` | integer | 0 to 52,428,800 |
| `options` | jsonb | paper, orientation and scale; at most 4,096 bytes |
| `created_by`, `created_at` | | |

Index `survey_exports_project_idx (project_id, created_at desc)`. The file itself isn't stored: it can be rebuilt from the same version.

## The drawing document

Defined in [`document.ts`](../../src/core/survey/document.ts) with zod. It never holds a coordinate: lots, roads and lines name points by id. Schema 2 came with stage 191 (ADR 0203); `parseSurveyDocument` reads schema 1 documents and upgrades them (the boundary becomes lot 1, the legend becomes the code library, the panel layout is kept).

| Field | Type and limits |
| --- | --- |
| `schema` | the literal `2` |
| `lots` | up to 60: `id` (1 to 40 characters of letters, digits, `_` and `-`), `label` (1 to 12, as written, such as B), `sup` (its raised part, up to 6, such as 1 for B¹), `points` (up to 500 point ids in order round the lot), `note` (up to 80, such as "Res. for Access, 10ft. wide") |
| `roads` | up to 20: `id`, `name` (80), `edgeA` (2 to 200 point ids), `edgeB` (up to 200), `width` written in `feet`, `metres` or `none` (always computed from the edges, never typed), `start` and `end` direction texts (60 each) |
| `adjoining` | up to 80: `id`, `text` (1 to 200), `lot` (a lot id), `leg` (the leg's index in that lot's ring) |
| `features` | up to 300 lines or outlines: `id`, `layer` (BUILDINGS, WALLS, FENCES, DRAINS, ROADS or UTILITIES), `code` (12), `closed`, `points` (2 to 500 point ids) |
| `notes` | up to 10 lines of up to 300 characters, printed as "Note:- …" |
| `codes` | up to 80 entries of the code library: `code`, `meaning`, `kind` (mark, line, outline or symbol), `line` (solid, dashed or ticked) and `legend` (shown in the Reference when used). New projects start from `COMMON_CODES`, labelled common usage, not an official list |
| `labelOffsets` | entity key (up to 80 characters) to `{ dx, dy }` in paper millimetres, each between -200 and 200. Presentation only |
| `layers` | each of the 15 layer ids (ADJOINING added) to `{ visible, locked }` |
| `sheet` | `planNumber` (40), `planDate` (20), `landName` (120), `alias` (160), `nowKnownAs` (120), `operation` (resurvey, subdivision, amalgamation or custom), `parentLots` (60), `previousPlan` (`number` 40, `date` 20, `by` 80, `byDesignation` 60, `mine`, `filing` 160), `customClause` (800), `village`, `pattu`, `korale`, `gnDivision`, `dsDivision`, `district`, `province` (60 each), `previousPlans` (400), `boundaries` north, east, south and west (200 each), `statedExtent` (80), `surveyDate`, `partitionDate` (20 each), `statement` (200), `remarks` (600), `extractOf` (a lot id, or empty) |
| `settings` | `template` classic or panel; `paper` auto, A4, A3 or A2; `orientation`; `scale` (integer 50 to 100,000, or null for the suggested one); `perchDecimals` 0 to 4; `secondDecimals` 0 to 2; `distanceDecimals` 2 to 4; `overleaf`; `permitBox`; `slant`; `faceDimensions` |
| `provenance` | item key to `{ source, reviewed }`, for items not typed by the surveyor. Keys: `lot:<id>`, `road:<id>`, `adjoining:<id>`, `feature:<id>`, `sheet.<field>` (`sheet.boundaries.north` and so on, `sheet.previousPlan` for the earlier plan), `notes`, `codes`. Sources: `ai_brief` (read from the surveyor's description), `ai_photo` (read from a photo), `engine` (suggested by tested code and accepted), `auto` (drawn by tested code from the field data on import, an inference such as which marks make the lot; stage 194, ADR 0209). An AI or auto item counts once `reviewed` is true, which only the surveyor's own action sets |
| `kept` | up to 200 keys of near misses the surveyor answered "keep as surveyed" (`dup:<id>|<id>`, `leg:<corner>:<id>|<id>`), part of the version so the approval covers them (stage 192, ADR 0205). Defaults to empty, so earlier documents read unchanged |
| `rules` | the planning rules the lots are checked against, or null (stage 193, ADR 0207): `{ id: "uda-2020" }`, or `{ id: "own", areaM2, frontageM, depthM, source }` with the surveyor's own figures and where they come from, in their words. Defaults to null, which is left out of the approval hash, so earlier approvals still stand |
| `surveyorUserId` | a member's user id, or null |

Every text field has control characters removed (except tab, line feed and carriage return) as it is parsed. A new project starts from `emptyDocument()`: no lots, the common codes, the classic layout on automatic paper, portrait, slanted lettering, perches to 2 decimals, whole seconds, distances to 2 decimals, the overleaf on, bearings and distances overleaf rather than on the face, and the permit box off.

## Functions

All are `security definer` with `search_path = ''`. Execute is revoked from `public`, `anon` and `authenticated` and granted only to `service_role`. The server calls them through [`store.ts`](../../src/server/survey/store.ts), which maps each error name to a sentence (`SURVEY_MESSAGES`). Each function writes one row to `audit_events`.

Helpers:
- `private.require_contributor(org, user)` (from an earlier migration): raises `FORBIDDEN` (42501) unless the user is an owner, admin or member, and `WORKSPACE_SUSPENDED` (P0001) when the workspace is suspended.
- `private.survey_project_open(org, project)`: raises `NOT_FOUND` (P0002) unless the project belongs to the workspace and isn't archived.

| Function | Does | Errors (SQLSTATE) | Audit action |
| --- | --- | --- | --- |
| `app_survey_create_project(org, actor, name, plan_type, crs, confirm, document)` returns uuid | Inserts the project (trimmed name; the confirmer and time only when `confirm`) and drawing version 1 with the note "Project created". Takes an advisory lock per workspace | `FORBIDDEN`, `WORKSPACE_SUSPENDED`, `PLAN_TYPE_NOT_AVAILABLE` (22023) for anything but cadastral, `QUOTA_EXCEEDED` (P0001) at 200 unarchived projects | `survey.project_created` (name, plan type, CRS, confirmed) |
| `app_survey_update_project(org, actor, project, name, crs, confirm)` | Renames and sets the CRS. With `confirm`, the actor and now become the confirmation. Without it, the old confirmation stays only if the CRS is unchanged. **When the CRS changes, every standing approval of the project is withdrawn** (`withdrawn_reason = 'crs_changed'`): the surveyor approved the plan in its old grid. Confirming the same CRS again withdraws nothing | `FORBIDDEN`, `WORKSPACE_SUSPENDED`, `NOT_FOUND` | `survey.crs_confirmed` when confirmed, else `survey.project_updated` (name, CRS, CRS before, `approvals_withdrawn`) |
| `app_survey_import(org, actor, project, file_name, format, content, settings, points)` returns `{source_id, added, skipped}` | Locks the project's points. Refuses the import if `settings.crs` isn't the project's CRS now (the person confirmed the units in the grid the page showed). Refuses the whole import if any point number already exists with a different E, N, Z or code. Inserts the source with the database's own SHA-256 and size, then the new points; points identical to existing ones are skipped | `FORBIDDEN`, `WORKSPACE_SUSPENDED`, `NOT_FOUND`, `INVALID_REQUEST` (22023) when `points` isn't an array of 1 to 20,000, `CRS_CHANGED` (P0001), `POINT_CONFLICT: <up to 10 point numbers>` (23505), `QUOTA_EXCEEDED` when the project would pass 20,000 points | `survey.points_imported` (file, format, SHA-256, added, skipped) |
| `app_survey_save_drawing(org, actor, project, base_version, document, note)` returns integer | Locks the project's drawings and inserts version latest + 1, only if `base_version` is the latest. A blank note becomes null | `FORBIDDEN`, `WORKSPACE_SUSPENDED`, `NOT_FOUND`, `VERSION_CONFLICT` (P0001) for a stale base, `QUOTA_EXCEEDED` when the latest version is 5,000 | `survey.drawing_saved` (version, note) |
| `app_survey_set_profile(org, actor, full_name, designation, registration, address, contact)` | Inserts or updates the actor's own profile, values trimmed | `FORBIDDEN`, `WORKSPACE_SUSPENDED` | `survey.profile_saved` (name) |
| `app_survey_approve(org, actor, project, version, crs, content_sha256)` returns uuid | Approves the latest version. `crs` must still be the project's CRS: the hash covers the grid the server read, and the function holds the project row (`for update`) so the grid can't change before it commits. The document's `surveyorUserId` must be the actor, who must have a profile. Copies the profile into `surveyor` | `FORBIDDEN`, `WORKSPACE_SUSPENDED`, `NOT_FOUND`, `CRS_CHANGED` (P0001), `VERSION_CONFLICT` when `version` isn't the latest, `NOT_THE_SURVEYOR` (42501), `NO_SURVEYOR_PROFILE` (42501), `ALREADY_APPROVED` (23505) when a standing approval exists | `survey.approved` (version, SHA-256) |
| `app_survey_record_export(org, actor, project, version, kind, sha256, size, options)` returns uuid | Records a file made for a version. Any member may export what they can read, viewers included: it checks membership, not role. Like every other write here, a suspended workspace and an archived project make no new files | `FORBIDDEN` (not a member), `WORKSPACE_SUSPENDED`, `NOT_FOUND` (an archived project, or no such version in the workspace) | `survey.exported` (version, kind, SHA-256, bytes) |
| `app_survey_archive_project(org, actor, project)` | Sets `archived_at`; the project leaves the list and takes no more edits. Its data and history stay | `FORBIDDEN`, `WORKSPACE_SUSPENDED`, `NOT_FOUND` | `survey.project_archived` |
| `app_survey_record_ai_draft(org, actor, project, operation, model, accepted, dropped, questions)` (v94) | Records that the drafting assistant ran on an open project: `survey_draft` or `survey_read`, the model id, and how many items it offered, left out and asked about. Nothing the person typed or photographed is stored | `FORBIDDEN`, `WORKSPACE_SUSPENDED`, `NOT_FOUND`, `INVALID_OPERATION`, `INVALID_MODEL`, `INVALID_COUNTS` (22023) | `survey.ai_drafted` (operation, model, counts) |

A check constraint failing inside a function (for example a point number with a control character) raises a Postgres error that names no code above; `surveyErrorFrom` turns it into `UNKNOWN` ("That didn't work, and nothing was changed. Try again in a moment.").

The TypeScript layer adds three codes of its own: `INVALID_REQUEST` (input that fails validation before any call), `NOT_CONFIGURED` (no admin or user client) and `UNKNOWN`. `approveSurveyAction` also returns `VERSION_CONFLICT` itself when the loaded version isn't the one the form named, and `importSurveyPointsAction` returns `CRS_CHANGED` itself when the project's CRS isn't the one the page showed.

## Approval binding

`approvalHash` in [`view.ts`](../../src/core/survey/view.ts) is the SHA-256 (Web Crypto) of the RFC 8785 canonical JSON of:
- `engine`: `SURVEY_ENGINE_VERSION`;
- `crs`: the project's CRS id;
- `document`: the whole drawing document;
- `points`: every point a lot, road or feature uses (`usedPointIds`), as `{ id, point, e, n, z, code }`, sorted by id.

The server computes it in `approveSurveyAction`, after recomputing the plan and refusing while any finding blocks approval. Saving after approval makes a new version with no approval row, so the sheet shows DRAFT again. Changing the project's CRS withdraws every standing approval, because the hash and the surveyor's review covered the old grid.

An approval is shown only while it stands **and** its `content_sha256` equals the hash computed now (`approvalStatus` in [`present.ts`](../../src/server/survey/present.ts)). Points and versions can't change, so a mismatch comes from a change in the code, for example raising `SURVEY_ENGINE_VERSION` or changing how a stored document is parsed. Raising the engine version therefore makes every earlier approval lapse, and the plan shows as a draft until a new version is saved and approved. An approved sheet carries the surveyor's details from the approval record, not the profile's later edits.

## Limits

| Limit | Value | Where |
| --- | --- | --- |
| Unarchived projects per workspace | 200 | `app_survey_create_project`; the dashboard lists at most 200 |
| Points per project | 20,000 | `app_survey_import`; the reader pages through 1,000 at a time up to 20,000 |
| Points per import | 20,000 | `IMPORT_LIMITS.maxRows`, `app_survey_import` |
| Source file | 2 MiB (2,097,152 bytes) | `IMPORT_LIMITS.maxBytes`, `survey_sources` checks |
| Drawing versions per project | 5,000 | `app_survey_save_drawing` |
| Document size | 512 KiB | `survey_drawings` check |
| Versions shown in History | 100 newest | [`read.ts`](../../src/server/survey/read.ts) |
| Exports shown in History | 50 newest | [`read.ts`](../../src/server/survey/read.ts) |
