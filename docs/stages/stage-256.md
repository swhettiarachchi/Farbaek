# Stage 256: AutoSurvey, reading the sketch's words, and a new read replacing an unchecked one

- **Date:** 2026-11-24
- **Branch:** `feat/stage-256-sketch-words`
- **Decision:** ADR 0264
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (field sketches; doubtful readings never taken as facts).

## Why

Run again in production after stage 254, the owner's real job came out differently each time. Claude read the Sinhala word for home on one run and not on the next. "Read and replace" kept the first read's unconfirmed lot beside the second read's, so a better read couldn't fix a worse one.

## What was built

- **`server/ai/sketch-reader.ts`:** the reader is given the Sinhala words sketches use, and asked for a best reading with doubt rather than "unreadable". It's also told a house's word inside the land is an area.
- **`sketchintel/findings.ts`:** `withBuildingWords`, a building's word given only as writing taken as an area's label.
- **`sketchintel/apply.ts`:** `withoutWaitingSketchItems`, what a new read replaces.
- **`app/survey/ai-actions.ts`:** "Read and replace" clears it before applying the new read.

## Verified

- **`stage256.test.ts`:** five tests on synthetic data.
- **The real-job harness:** unchanged on production's earlier read.
- **Checks:** 1,259 tests (survey, server, actions, design, components), lint, `tsc --noEmit`, `pnpm build`.

## Next

After this is live, read the sketch again on the latest production run of the owner's job. The surveyor's inputs from the printed plan then go on the plan as the surveyor would enter them.
