# Stage 263: AutoSurvey, an independent check of the plan against the sketch

- **Date:** 2026-11-24
- **Branch:** `feat/stage-263-verify`, carried by the same pull request as stages 257 to 262
- **Decision:** ADR 0271
- **Migration:** none. **New dependency:** none.

## What was built

- **`core/survey/sketchintel/verify.ts`, `check-record.ts`:**
  - what the check is asked about (lots, lines, outlines, road edges, by point numbers);
  - the model's answer made safe;
  - the findings, each answered by keeping the plan as drawn.
- **`core/survey/autosurvey/sketch.ts`:** `sketch.check` on the record that only reading writes.
- **`server/ai/sketch-checker.ts`:** the prompt and the Anthropic call. **`server/survey/sketches.ts`:** `checkPlanAgainstSketch`, metered as `survey_read`.
- **`app/app/survey/ai-actions.ts`:** every sketch read now checks what it drew before saving, and `checkSketchAgainAction` checks the plan again from the kept photos.
- **`app/app/survey/actions.ts`:** the keep answer takes the check's keys.
- **`components/survey/sketch-check.tsx`:** the last check and "Check against the sketch again", in the field sketches panel.

## Verified

- `sketchintel/verify.test.ts` (6 cases) and `server/survey/sketches.test.ts` (2 new cases, a labelled stand-in model).
- The survey, editor, design, survey-action and server tests, and lint.
- A fresh review: four real bugs fixed (ADR 0271, "After review").

## Not verified yet

- A live check on the owner's real job, after the merge.
- The new panel section in a browser: it shows only where sketch photos were kept, which the demo workspace has none of.
