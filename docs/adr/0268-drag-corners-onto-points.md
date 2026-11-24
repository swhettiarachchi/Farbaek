# ADR 0268: Dragging a lot's corner or a line's point onto another surveyed point

- **Status:** accepted (stage 260, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0261 (the editor's properties panel and line tool).
- **Changes:** the plan editor and the sheet's preview. No migration, no new dependency, nothing printed changes.

## Context

The owner's editor brief asks for dragging on the sheet, as a website builder drags. A survey plan's geometry can't be dragged anywhere: a corner is a surveyed point. Until now a corner was changed only by typing point numbers.

## Decision

- **Handles:** a selected lot's corners, or a selected line's points, show handles on the sheet. They're drawn over everything at one size on screen, and on unlocked layers only. They show even where corners are drawn without circles (ADR 0267).
- **Dragging snaps to a surveyed point:** a handle dragged snaps to the nearest surveyed point within 16 screen pixels, which is ringed while the drag lasts. Dropped there, the corner or point becomes that surveyed point.
  - For a lot, words beside a side through the old corner stay beside the same side, now through the new one.
  - For a line, its curves go, since they were drawn through the old points.
  - The item becomes the surveyor's own (reviewed), and the area, the legs and every check are worked out again at once.
- **Nothing is ever placed between points:** dropped anywhere else, nothing changes, and that's said. A point already next to the corner is refused.
- **History:** every drop is one step in the plan's history, so Undo, Redo and Save version work as for any edit.

## Verified

- **In the browser** (dev demo, the Sample made editable for the check and put back after):
  - selecting lot B¹ showed five handles on its corners 1, 2, 3, 8 and 7;
  - dragging 8 showed the snap ring on 17, and dropping it made the corners 1, 2, 3, 17, 7, saying "Corner 8 is now 17: the area, the legs and the checks are worked out again.";
  - corner 3 dropped on empty paper was refused ("Corner 3 wasn't moved: drop it on a surveyed point.");
  - Undo restored 1, 2, 3, 8, 7;
  - at 425 px with a mouse, the toolbar wraps instead of running off the screen.
- **Checks:** lint, `tsc --noEmit`, the survey and component tests, `pnpm build`.
