# ADR 0261: Editing the plan on the sheet: a properties panel and a line tool, survey-aware

- **Status:** accepted (stage 253, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0242 (labels placed together, a dragged label's place recorded);
  - ADR 0235 (only real problems need the surveyor);
  - the plan editor's history, layers and assistant (stages 195 and 196).
- **Changes:**
  - the Selected tab edits what's tapped on the sheet;
  - a "Draw a line" tool joins surveyed points tapped in order.

  No migration, no new dependency.

## Context

The owner's master brief (2026-11-24) asks for the generated plan to be edited the way a website builder edits a page: tap something, change it, see the result. It asks for that without losing what a survey plan is. Presentation edits must never move measured geometry. Geometry edits must recompute what depends on them, be validated, be undoable and keep their history.

The plan editor already had:

- undo and redo over the plan's own history;
- tap to select, and several picked in order;
- labels dragged on paper (presentation only);
- zoom, pan and fit, with keyboard shortcuts;
- layer visibility and locks, and full screen;
- the drafting assistant's typed or spoken instructions.

The Selected tab described what was tapped but changed nothing: corners and lines were edited on the Lots step, the title block on the Sheet tab.

## Decision

**The Selected tab is a properties panel for the thing tapped:**

- **A lot:** its letter, raised suffix and note; its corners in order, as surveyed point numbers, applied in one go; and removing it after a second press.
- **A line:** what it's drawn as (buildings, walls, fences, drains, roads, utilities), its code, whether it's a closed outline, its points in order, and removing it.
- **An adjoining land's words,** and removing them.
- **The title block's texts** (title, heading, plan number, dates, extent, boundaries, notes, surveyor, signature, legend, region, scale): "Edit the title block" opens their fields on the Sheet tab.
- **A point or a leg's dimension:** described as before. A point is the survey's own, and a dimension is worked out from the coordinates, so neither is edited here.

**"Draw a line"** in the toolbar (on a phone, on the Selected tab, since the toolbar has no room there): tap surveyed points in order (a point's mark, number or corner), or type their numbers for points not drawn on the sheet, then Finish. Choose what it's drawn as and its code. Tapping the first point again after three or more closes the outline, as for a building. "Undo point" takes the last step back, and Cancel or Escape leaves nothing.

**Survey-aware by construction:**

- **Geometry is never moved.** A corner or a line's point is always exactly one surveyed point, chosen by its number or by tapping it. A number nothing surveyed has, or one two points share, is refused with the reason.
- **Everything that depends on it is worked out again at once:** the lot's area, perimeter and legs, the sheet, and every check. The plan is worked out from its inputs in about 5 ms (ADR 0258).
- **Presentation edits stay presentation:** moving a label changes only its offset on paper, never a coordinate or a dimension.
- **Every change goes through the plan's history:** undo, redo and Save version work as for any edit, and a saved version is a new version with its note.
- **What the sketch or the assistant drew becomes the surveyor's** once they change its geometry or its words, or press "It's right" on the panel's "not checked yet" line: its provenance is marked reviewed, as the Lots step does. A name, raised suffix, note or code typed alone doesn't check it.
- **The plan's own limits hold:** every field keeps to the document's lengths, and a line can't be finished on a locked layer or past the plan's 300 lines, each with the reason shown, so a save never fails on what was typed or drawn. A hidden layer is said, so a finished line isn't lost from sight.
- **Removing keeps the plan whole:** a lot goes with its adjoining lands' words, its extract on the sheet and its moved labels; changing a lot's corners says which adjoining words lost their side.

## Verified

- **In the browser** (dev demo, the Sample made editable for the check and put back after):
  - tapping lot B¹ opened its panel with corners 1, 2, 3, 8, 7;
  - applying 1, 2, 3, 8 changed the area from 1,057.38 to 785.95 m² and the perimeter from 141.93 to 127.91 m;
  - Undo restored both;
  - "Draw a line" through 17 and 5, then Finish, drew the line ("Line drawn through 17, 5"), and tapping it opened its panel (walls, MW, 17, 5);
  - tapping the title opened "Edit the title block", which switched to the Sheet tab.
- **After the review fixes,** in the same way:
  - typed numbers "17, 5, 999" were refused ("There's no point 999 in the survey."), and "17 5 4 17" gave "Through 17, 5, 4, closed.";
  - locking Walls turned Finish off with its reason; hiding Buildings said the line wouldn't show;
  - Finish drew "Outline drawn through 17, 5, 4.", and tapping it opened Buildings P, closed, 17, 5, 4;
  - at 375 px the toolbar fits (Save ends at 359 px), "Draw a line" on the Selected tab opens the bar and brings it into view, two taps gave "Through 1, 2.", and Escape left drawing; no sideways scroll.
- **`selection-editor.test.ts`:** points by number with commas, semicolons or spaces, never an unknown number, a shared number only when the item already uses one of them; drawing adds each point once, closes on the first point again, and says why it can't finish.

## Review

A fresh review of the first version found real faults, all fixed before the pull request:

- the note had no length limit the plan accepts, and a cleared adjoining land's words emptied them;
- removing a lot left its adjoining words, its extract and its moved labels behind;
- typing a name marked a drawn item as checked; a shared point number was always refused, even for the corner already there;
- a line's closed shape couldn't be changed, and a line cut below three points stayed "closed";
- region and scale weren't treated as title block texts;
- drawing ignored locked and hidden layers and the 300-line limit, couldn't take points not drawn on the sheet, let a label drag start, and Escape didn't leave it;
- at 375 px the toolbar ran off the screen.

## Not done, and why

- **Dragging a lot corner onto another point on the canvas:** corners are chosen by number or tap in the panel today.
- **Text size and rotation per label, align and distribute, adding free text, symbols and dimensions:** each needs a stored presentation override, a schema addition to plan in its own stage.
- **Moving symbols:** a symbol stands at a surveyed point, so moving one is choosing another point. It needs its own control.
