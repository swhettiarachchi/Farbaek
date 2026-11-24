# Stage 254: AutoSurvey, a house from its walls, numbers written twice, a road from a gate

- **Date:** 2026-11-24
- **Branch:** `feat/stage-254-house-from-walls`, on stage 253 (PR #316).
- **Decision:** ADR 0262
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (field sketches; geometry only from surveyed points; nothing moved or invented).

## Why

The owner asked again for their real job to come out like the surveyor's own plan. Production's run drew the right lot, but drew the house as loose pieces with questions, asked twice about corners that were read right, and printed dashed lines solid.

## What was built

- **`sketchintel/faces.ts`:** the areas a sketch's lines close round, from the surveyed points they join. A wall's end drawn onto the boundary between its numbers joins it within the on-line tolerance. Crossing lines make none.
- **`placement.ts`:** `photoPlaces`, where each surveyed point is on a photo by the fit of its written numbers. A number written again at its own place no longer raises a doubt about the lines through it.
- **`interpret.ts`:**
  - a building's label in an area without numbered corners becomes the one area holding the label, its unlabelled walls absorbed into its outline;
  - a gate in the lot's side with one line across from it gives a road without a name, which is asked for;
  - dashed lines are marked.
- **`classify.ts`:** ගෙදර and "home" are building words; `buildingEntry` (the list's only building, P); `isGateWord`.
- **`findings.ts`:** passes the labels' places and the gates to the interpreter.
- **The drawing's features:** an optional `dashed`, drawn by the sheet, the PDF and the DXF (`DASHED`), and set in the editor's line panel.
- **`real-job.test.ts`:** reads several survey files of one job together and makes Farbaek's plain corrections, as Generate Plan does.

## Verified

- **`stage254.test.ts`:** 20 tests on synthetic points (see ADR 0262).
- **The owner's real job, with production's own read** (local, never committed): the house is one building P, 81.71 m², closed against the boundary as on the surveyor's plan. Its wall pieces and their questions are gone, and so are the two misread-corner questions. The dashed lines print dashed.
- **Checks:** the survey, component and design tests, lint, `tsc --noEmit`, `pnpm build`.

## Review

A fresh review found six faults, all fixed with tests (listed in ADR 0262): hidden doubts about the house's walls, land descriptions read as buildings, a house taken from an area nothing says is one, an unsurveyed corner dropped, a gate's side, and lines drawn twice.

## Not done, and why

- **The road on the owner's job:** the reader joined two different walls into one line, so nothing lies a road's width across from the gate, and none is drawn. The surveyor draws it.
- **Text and symbols on the sheet** (Gate, Proposed Drain, an electric post): stage 255.
