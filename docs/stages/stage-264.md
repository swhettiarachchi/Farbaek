# Stage 264: AutoSurvey, points where two lines meet, and tape offsets

- **Date:** 2026-11-24
- **Branch:** `feat/stage-264-constructions`, on stage 263's
- **Decision:** ADR 0272
- **Migration:** none. **New dependency:** none.

## What was built

- **`core/survey/construct.ts`:**
  - `meet` and `offset` beside `square`, as one discriminated union;
  - `meetPoint`, `offsetPoint`, `constructAt`, `recipeInputs`;
  - `pointFromSpec`, which checks what the surveyor typed.
- **`core/survey/document.ts`, `qc.ts`, `compare.ts`, `sketchintel/verify.ts`:** every kind covered by the approval, the checks, the comparison and the independent check.
- **`components/survey/construct-point.tsx`:** "Add a point that wasn't surveyed" in a line's panel. **`selection-editor.tsx`:** names typed and shown among a line's numbers.
- **`app/app/survey/actions.ts`:** the save refuses a name that's a surveyed point's number.

## Verified

- `stage264.test.ts` (11 cases) and the new cases in `components/survey/corners.test.ts`, with the fixes from a fresh review (ADR 0272, "After review").
- The survey, editor, design, survey-action and server tests, and lint.

## Not verified yet

- The new panel in a browser. The demo's Sample is read-only, so it waits for the live site after the merge.
