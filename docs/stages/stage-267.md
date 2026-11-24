# Stage 267: AutoSurvey, least squares for a traverse

- **Date:** 2026-11-24
- **Branch:** `feat/stage-267-least-squares`, on stage 266's
- **Decision:** ADR 0274
- **Migration:** none. **New dependency:** none.

## What was built

- **`core/survey/adjust.ts`:** least squares beside the compass and transit rules. It uses Gauss-Newton on distances, the first direction and angles, each weighted by the instrument's precision, and gives σ0, a χ² test, the largest residuals and the stations' standard deviations.
- **`core/survey/import/closure.ts`:** the closure note says what least squares weighed by and how well the observations fit.
- **`components/survey/traverse-choice.tsx`:** "Least squares" among the rules.

## Verified

- `least-squares.test.ts` (5 cases, with an independent recomputation), the traverse, Generate, survey, editor and server tests.

## Next

- The instrument's own precision kept with the office profile.
