# Stage 268: AutoSurvey, plans over several sheets

- **Date:** 2026-11-24
- **Branch:** `feat/stage-268-sheets`, on stage 267's
- **Decision:** ADR 0275
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (plan-sheet composer: the drawing scale kept, never fitted to the page; nothing moved to make it fit; exports inspected), `farbaek-ui` and `farbaek-human-made` for the editor's sheet buttons.

## Why

The brief lists multi-sheet layout among what AutoSurvey doesn't do. A plan too large for one sheet at the scale the surveyor needs was an error that stopped the export.

## What was built

- **`sheet/tiles.ts`:** the grid of sheets over the drawing's extent; the drawing cut at a sheet's edge (lines cut, points and symbols kept by their centre, words by where they stand); match lines naming the sheet that continues; the key to the sheets; numbering north-west first.
- **`sheet/compose.ts` (panel layout) and `sheet/classic.ts`:** the drawing as one function, drawn once, or once per sheet with that sheet's viewport and the match lines' places reserved; a front page per sheet, with the key (a panel, or the strip under the classic layout's north needle); `SHEETS_SPLIT` and `SHEETS_TOO_MANY`; the shared checks run per sheet.
- **`sheet/scene.ts`:** a front page may carry its own viewport and which sheet it is.
- **`document.ts`, `plan-panels.tsx`, `compare.ts`:** the `severalSheets` setting, offered on the Sheet tab with a scale chosen, and named in the version comparison.
- **`plan-editor.tsx`:** one sheet at a time, a press for each.

## Verified

- `tiles.test.ts` (19 cases, see ADR 0275).
- Survey, server and design tests (1,267), `tsc --noEmit` with a 4 GB heap, lint on the changed files.
- The one-sheet path unchanged: earlier sheet tests, and the owner's real job drawn byte for byte as before.
- **Looked at:** a strip of twelve 40 m lots at 1:500 on A3 landscape, four sheets on each layout, drawn to PNG: match lines at the cuts, "Continued on sheet N" clear of the labels, the key with the sheet marked.

## Next

- Overlapping sheets, a north and scale placed to avoid the drawing, the DXF's paper space per sheet.
