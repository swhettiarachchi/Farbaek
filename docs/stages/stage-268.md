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

## A fresh review found five real faults, fixed before the PR

Each one reproduced by the reviewer, and now a test that fails without its fix:

1. **Any word on a plan over several sheets stopped the export.** Each sheet's labels are placed inside that sheet, so a word belonging to another sheet counted as "off the sheet" (TEXT_OFF_SHEET). Now a word is off the sheet only when no sheet found it a place.
2. **A side lying exactly on a shared edge was drawn on no sheet.** The grid is centred on the drawing, so a shared edge often runs along a lot's side, and rounding put it a hair outside both sheets (24 of 30 corners shown on a block of lots). Now a line along an edge is drawn on both sheets, and points within a micrometre count as on the sheet.
3. **Crowded legs were left to the schedule only from sheet 1.** Now from every sheet, and "is the face clearer" counts every sheet.
4. **The twelve-sheet limit counted empty grid places,** so a diagonal run of lots was refused as "16 sheets" when 7 show anything. Now up to 24 places are drawn and only those that show the drawing count.
5. **A classic drawing just past its margins became "1 of 1" sheets.** The grid now uses the same margins as the one-sheet fit, and fewer than two sheets showing anything is one sheet.

Also: one sheet's checks are exactly as before (a wall drawn as the boundary is no longer merged by name on one sheet), a sheet with only a neighbour's words or a line along its edge isn't made, and with every drawing layer hidden there is still one page.

## Verified

- `tiles.test.ts` (32 cases, see ADR 0275), with one for each fault the review found.
- Survey, server and design tests (1,281), `tsc --noEmit` with a 4 GB heap, lint on the changed files.
- The one-sheet path unchanged: earlier sheet tests, and the owner's real job drawn byte for byte as before.
- **Looked at:** a strip of twelve 40 m lots at 1:500 on A3 landscape, four sheets on each layout, drawn to PNG: match lines at the cuts, "Continued on sheet N" clear of the labels, the key with the sheet marked.

## Next

- Overlapping sheets, a north and scale placed to avoid the drawing, the DXF's paper space per sheet.
