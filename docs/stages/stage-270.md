# Stage 270: AutoSurvey, learning from corrections

- **Date:** 2026-11-24
- **Branch:** `feat/stage-270-learning`, on stage 269's
- **Decision:** ADR 0277
- **Migration:** none (the profile's body is JSON). **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (nothing applied without the surveyor; provenance said), `farbaek-ui` and `farbaek-human-made` for the suggestions list.

## Why

The brief asks AutoSurvey to learn from the surveyor's corrections, kept apart until approved.

## What was built

- **`core/survey/learning.ts`:** suggestions from the surveyor's three newest plans (drafting choices they all make, codes all their checked lists share), each with its sentence and source; applying one, worked out again; turning one down for good.
- **`core/survey/profile.ts`:** the profile's sheet carries drafting choices; `declined` records suggestions turned down; a profile started from a plan takes its drafting choices.
- **`server/survey/defaults.ts`:** `loadRecentPlans`, shared with the defaults.
- **`app/survey/actions.ts`:** `answerProfileSuggestionAction`, adding or turning down one suggestion as a new version.
- **`components/survey/profile-suggestions.tsx`, `app/survey/office/page.tsx`:** "Learned from your plans" on each profile, with Add and "Not for this profile".

## Verified

- `learning.test.ts` (10 cases) and the action's tests in `generate.test.ts`; see ADR 0277.
- Survey, server and design tests, `tsc --noEmit` with a 4 GB heap, lint on the changed files.
- **Not looked at in a browser:** the demo workspace has no office profiles, so the list can't show there; it uses the same parts as the profile form beside it.

## Next

- Learning from corrections to sketch readings, as its own decision.
