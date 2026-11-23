# ADR 0240: The sketch photos read are kept with the plan, beside their readings

- **Status:** accepted (stage 230, AutoSurvey part 4, 2026-11-23)
- **Builds on:** ADR 0234 (reading sketches), ADR 0235 (only real problems need the surveyor), ADR 0216 (the studios keep pictures in Postgres), the owner's AutoSurvey brief §11 ("Preserve the original sketch"), §17 ("View source") and §23 (private storage, provenance)
- **Changes:** what Farbaek keeps when it reads sketches, and what the consent says. Schema v103 adds one table and one function; nothing is taken away. **This replaces ADR 0234's "the photos aren't kept".**

## Context

Readings named their photo by file name, but the photo itself was gone after the read. A difference that held approval ("The sketch says 21.00 between 2 and 3") couldn't show the writing it came from, and the brief asks for the source evidence beside each exception and for the original sketch to be preserved. Text survey files were already kept byte for byte with their SHA-256 (since stage 190); photos weren't, because Farbaek has no object storage.

## Decision

**Keep the photos Claude read, as they were sent** (shrunk in the browser to 1,568 px, JPEG): in Postgres as base64, as the studios keep theirs. The table is `survey_sketch_photos` (v103), keyed to the project and the reading's time (`readAt`), so a plan's readings find their own photos. Limits: 2 MB a photo, 6 a read, 50 MB a project.

- **Members read them** through row-level security, served by `/app/survey/[project]/sketch-photo/[id]` with the type checked when kept, never sniffed, and sandboxed.
- **Only the server writes**, through `app_survey_keep_sketches`, which checks each photo's SHA-256 against its bytes and records one audit event with the count and size.
- **A new read's photos replace the earlier read's,** as its readings replace theirs, in the same step that keeps them: what's kept is what the plan shows, and reading again never fills the project.
- **Each photo's name is its own within a read.** A phone camera names every shot "image.jpg"; the second becomes "image.jpg (2)", so each reading opens the photo it came from.
- **They stay with the project,** archived too, until it or the workspace is deleted.
- **Keeping never undoes a reading.** If the photos can't be kept (v103 not applied, the project's 50 MB used), the readings stand, and the message says the photos weren't kept.

**The consent says so:** "When something is read, Farbaek keeps the photos with this plan, so your team can see what each reading came from, until they're read again or the workspace is deleted." The box is still unticked by default and still says the photos go to Anthropic, outside Sri Lanka, to be read.

**What the surveyor sees:**
- the Draft step's sketch card shows the photos read;
- each reading's file name opens its photo;
- a sketch difference in the "Needs you" list links to "See the sketch on the Draft step".

## What it doesn't do

- **The camera's full-size original isn't kept,** only the photo as read. A 50 MP original wouldn't fit a request or the database sensibly.
- **No positions on the photo** (ADR 0234).
- **Documents and DXF files aren't kept.** Points files are, as before.

## Consequences

- Every reading can be checked against its writing by anyone in the workspace, which is what a difference that holds approval needs.
- **Apply v103 before or after the merge:** `scripts/vps/check-migrations.ps1` reads it back, and the code works without it, saying the photos weren't kept.
