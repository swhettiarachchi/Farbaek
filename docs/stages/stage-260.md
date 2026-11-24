# Stage 260: AutoSurvey, dragging a corner onto another surveyed point

- **Date:** 2026-11-24
- **Branch:** `feat/stage-260-drag-corners`
- **Decision:** ADR 0268
- **Migration:** none. **New dependency:** none.

## What was built

- **`components/survey/sheet-svg.tsx`:** handles, drawn over the sheet at one size on screen.
- **`components/survey/plan-editor.tsx`:**
  - handles on the selected lot's corners or line's points;
  - a drag that snaps to the nearest surveyed point within 16 px;
  - the drop (adjoining words follow the side, curves go, the item becomes the surveyor's), or a refusal said in words.

## Verified

See ADR 0268: the browser check on the Sample (snap, drop, refusal, undo), and the checks.
