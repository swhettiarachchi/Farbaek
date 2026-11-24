# Stage 253: AutoSurvey, editing the plan on the sheet

- **Date:** 2026-11-24
- **Branch:** `feat/stage-253-editor`, on stage 252 (merged).
- **Decision:** ADR 0261
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: geometry only from surveyed points, presentation apart from measurement, every edit reversible and recorded;
  - `farbaek-ui` and `farbaek-human-made` for the panel and the drawing bar.

## Why

The owner's master brief (2026-11-24) asks for a website-builder-style editor for the generated plan, CAD-aware and survey-aware: tap something on the sheet, change it in a panel that fits what it is, see the plan follow, undo it.

## What was there, and what was missing

The plan editor already had undo and redo, selecting one item or several, dragging labels (presentation only), zoom, pan and fit with keys, layers with locks, full screen, and the drafting assistant.

What was missing: the Selected tab only described what was tapped. Lots, lines and the title block were changed elsewhere, and nothing could be drawn on the sheet itself.

## What was built

- **`components/survey/selection-editor.tsx`:** the properties panel.
  - **A lot:** letter, raised suffix, note; corners as surveyed point numbers, applied in one go; removing it after a second press.
  - **A line:** what it's drawn as, its code, whether it's a closed outline, its points; removing it.
  - **An adjoining land's words.**
  - **The title block's texts:** "Edit the title block" opens the Sheet tab.
  - `pointsFromNumbers` never invents a point, and takes a shared number only when the item already uses one of those points.
  - A "not checked yet" line, with "It's right", on what the sketch, the draft or the assistant drew.
- **"Draw a line"** in the toolbar, and on the Selected tab for phones: tap surveyed points in order or type their numbers; tap the first again to close an outline; choose what it's drawn as and its code; then Finish, Undo point, or Cancel (or Escape). A locked layer, a full plan and a hidden layer are each said.
- **The selection's descriptions** now point to the panel.

## Verified

- **In the browser** (dev demo, the Sample made editable for the check and put back after):
  - tapping lot B¹ opened its panel with corners 1, 2, 3, 8, 7;
  - applying 1, 2, 3, 8 changed the area from 1,057.38 to 785.95 m² and the perimeter from 141.93 to 127.91 m, and Undo restored both;
  - "Draw a line" through 17 and 5, then Finish, drew it, and its panel showed walls, MW, 17, 5;
  - tapping the title opened the Sheet tab through "Edit the title block".
- **After the review fixes:** typed numbers (an unknown one refused), a closed outline drawn as Buildings P and opened in its panel, the locked and hidden layer lines, and at 375 px the toolbar fitting, the Selected tab's "Draw a line" bringing the bar into view, taps on two points, and Escape.
- **`selection-editor.test.ts`:** points by number, and drawing (each point once, closing, why it can't finish).
- **Checks:** design, component and survey core tests (1,155), lint, `tsc --noEmit`, `pnpm build`.

## Review

A fresh review found 12 faults in the first version, all fixed (listed in ADR 0261): field limits, removing a lot cleanly, what marks an item checked, shared numbers, closed outlines, the title block's texts, drawing on locked or hidden layers, typed points, Escape, and the phone toolbar.

## Not done, and why

See ADR 0261:

- dragging a lot corner onto another point on the canvas;
- text size and rotation per label, align and distribute, free text, symbols and dimensions, which need stored presentation overrides;
- moving a symbol to another point.
