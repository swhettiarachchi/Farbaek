# Stage 297: alignment guides in the plan editor

The owner's brief asks the editor for alignment guides, as a website builder has. The editor moved words and labels freely, and snapped a dragged lot corner onto surveyed points, but nothing helped line one word up with another.

## What was done

- `src/components/survey/align-guides.ts` `alignTo`: a dragged point lines up with the nearest other word's point within reach, across and down apart, and says where.
- `src/components/survey/plan-editor.tsx`: while a word or label is dragged, it lines up with any other word or label on the page within 6 screen pixels, and keeps that place when dropped. Presentation only: what moves is the label's offset, never a surveyed point or anything measured.
- `src/components/survey/sheet-svg.tsx`: a thin dashed guide across or down the page while it's lined up, gone when the drag ends; never on paper.

Snapping to lines isn't added for words: a word can already be set along a line (its `along` point), and a lot corner already snaps to surveyed points, which is the only place a corner may go.

## Verified

- `align-guides.test.ts`: lines up across and down apart, the nearest within reach, nothing when nothing is near.
- In the browser (demo, the sample plan made editable for the check only, then restored): dragging "To Houses" to 2 px off "From Main Road"'s line showed the guide at 19.79 mm and dropped it exactly on that line; the guide went with the drag.
- `tsc` and `eslint` clean.

## Checked live, and a fix it showed (2026-11-28)

On production (build 02a64e567ea5), on a test project: dragging a label showed the guide at the other word's line. But the plan number, dragged, didn't move: the title block's words (plan number, surveyor, title, notes) are laid out by the sheet, which never applies a dragged offset to them, yet the editor offered them for dragging with a move cursor. They're no longer offered (`canDrag` leaves out the title layer): tapped to select, edited in the Sheet panel. Checked in the demo: the plan number and the surveyor block show a pointer, and the drawing's 27 labels still move.
