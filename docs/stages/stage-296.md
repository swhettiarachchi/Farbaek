# Stage 296: scanned PDFs of the deed or an old plan

The owner's brief lists PDFs among the files a surveyor uploads. Until now every PDF was "Documents aren't read yet". Decision: ADR 0303.

## What was done

- `src/server/survey/drafting.ts`: `scanTypeOf` (a PDF by its `%PDF-` bytes, else a photo), `scanLimit`, `PHOTO_LIMITS.pdfBytes` (3 MB) and `totalBytes` (5.5 MB).
- `src/server/ai/survey-drafter.ts`: a PDF goes to Claude as a document block; the prompt says images or scanned PDFs.
- `src/app/app/survey/ai-actions.ts`: `scansOf`, one check for "Read an old plan" and the start screen's title read.
- `src/components/survey/autosurvey-start.tsx`, `start-uploads.ts`: a PDF up to 3 MB becomes the deed or an old plan, read into the title after the plan is drawn; larger ones say why; no sketch choice for a PDF.
- `src/components/survey/draft-panel.tsx`: "Read an old plan" takes PDFs, shown as a file, sent as they are.

## Verified

- `read-title.test.ts`: a PDF is read as it is, by its bytes ("deed.pdf" that isn't one is refused), within its size, beside a photo; too large, or too large together, refused before anything is read. `start-uploads.test.ts`: a PDF keeps its mark only as the deed.
- 1,424 tests across `tests/design`, `src/core/survey`, `src/components/survey`, `src/app/app/survey`, `src/server/ai`, `src/server/survey`; `tsc` and `eslint` clean.
- Demo: a PDF shows as the deed, with no sketch choice; a Word file still isn't read.

## Not verified

- A real PDF read by Claude in production (no deed scan of the real job exists).
