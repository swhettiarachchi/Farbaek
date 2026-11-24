# Stage 255: AutoSurvey, words and symbols on the plan

- **Date:** 2026-11-24
- **Branch:** `feat/stage-254-house-from-walls` (with stage 254).
- **Decision:** ADR 0263
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: presentation kept apart from measurement; a point never moves;
  - `farbaek-ui` for the point and text panels.

## Why

The owner's real job, drawn by its surveyor, has "Gate", "Proposed Drain" and an electric post (EP) that the survey files don't carry. Farbaek had no place for words on the plan, or for a mark given to a point. The owner's editor brief asks for both.

## What was built

- **The plan's document:** optional `texts` (words beside a point, or along the line to another; at most 100).
- **`sheet/texts.ts`:** draws them, placed clear of other labels, draggable on paper, on the Text layer.
- **`sheet/compose.ts`:** the Reference lists a mark given to a point.
- **`export/dxf.ts`:** words on the Text layer, turned with their line.
- **`components/survey/point-editor.tsx`:**
  - a point's panel: "Drawn as" (the code list's marks and symbols), and "Words beside it" with an optional "along the line to point";
  - the words' own panel, to change or remove them.

## Verified

- **`sheet/texts.test.ts`:** seven tests on synthetic points (see ADR 0263).
- **In the browser** (dev demo, the Sample made editable for the check and put back after): "Gate" added along 1 to 2 and drawn there; an unknown number refused; a point set to TP drawn as TP with Telephone Post in the Reference; the words' own panel opened by tapping them.
- **Checks:** the survey, component and design tests, lint, `tsc --noEmit`, `pnpm build`.

## Review

A fresh review found three faults, all fixed (listed in ADR 0263): a corner's symbol listed but not drawn, points the sheet doesn't draw couldn't be chosen ("Find a point by its number" now), and comparing versions missed words and symbols.

## Not done, and why

- **A size or angle of their own for words:** not needed yet.
- **Adding words or symbols by the assistant:** the panel does it.
