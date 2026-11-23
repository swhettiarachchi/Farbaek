# Stage 230: AutoSurvey, part 4: the sketch photos kept beside their readings

- **Date:** 2026-11-23
- **Branch:** `feat/stage-230-sketch-photos`, from `feat/stage-229-background` (PR #293)
- **Decision:** ADR 0240
- **Migration:** **v103** (`supabase/migrations/20270113090000_survey_sketch_photos.sql`): one table, one function, nothing taken away. **The owner applies it** (after v102); `scripts/vps/check-migrations.ps1` reads it back. The code works without it.
- **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (evidence and provenance, private land data), `ecc-security-review` (serving user files: type fixed at upload, nosniff, sandbox, row-level security).

## What was built

- **Schema v103:** `survey_sketch_photos`, read by members, written only by `app_survey_keep_sketches`. Each photo's SHA-256 is checked against its bytes; limits are 2 MB a photo, 6 a read and 50 MB a project; a new read's photos replace the earlier read's; one audit event per read.
- **The sketch read keeps the photos it read** after saving the readings, and says so when they can't be kept.
- **`/app/survey/[project]/sketch-photo/[id]`** serves a kept photo through row-level security, with its stored type, nosniff and a sandbox.
- **The Draft step's sketch card** shows the photos, and each reading's file name opens its photo.
- **In the "Needs you" list,** a sketch difference links to "See the sketch on the Draft step".
- **Each photo's name is unique within a read** ("image.jpg", "image.jpg (2)"), so each reading opens the photo it came from.
- **The consent wording** now says the photos are kept with the plan until they're read again or the workspace is deleted.

## Verified

- **Tests:** 4 on v103 against the real migrations (PGlite):
  - photos kept in order, read by members only;
  - a photo whose bytes don't match its SHA-256 refused, as are a non-picture type, seven photos and a stranger;
  - six full reads in a row leave only the last read's photos (the earlier ones are replaced, so the 50 MB limit is never reached by reading again);
  - no writes or deletes by a signed-in person or the public.
- The exceptions and design tests pass with the Draft step added to where an exception can send the surveyor.

## What a fresh review found, and what was fixed

- **Reading again filled the project.** Every read added up to six photos and nothing removed the earlier ones, so about four full reads used the 50 MB and later reads couldn't keep their photos. A new read's photos now replace the earlier read's in the same step.
- **Two photos with the same name opened the same photo.** A phone camera names every shot "image.jpg", and a reading finds its photo by name. Names are now made unique within a read.
- **The consent said the photos go when the project is deleted,** but an archived project keeps them and a re-read replaces them. It now says what happens: kept until they're read again or the workspace is deleted.
- **Old texts said the photos are never kept** (a server comment, the reading schema and ADR 0234). They now point to ADR 0240.
- **A reading's photo link was a small tap target.** It's now 40px tall.

## Not done, and why

- **The camera's full-size original isn't kept,** only the photo as read.
- **The photo card wasn't seen with kept photos in a browser:** the demo can't save.
