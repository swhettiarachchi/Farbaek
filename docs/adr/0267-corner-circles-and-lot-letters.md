# ADR 0267: Corners without circles, and lot letters left off the drawing

- **Status:** accepted (stage 259, AutoSurvey, 2026-11-24)
- **Builds on:** ADR 0252 (the deed's extent on the face, an optional sheet setting).
- **Changes:** two optional sheet settings. No migration, no new dependency.

## Context

The owner's real job, drawn by its surveyor, has no circles at the lot's corners and no lot letter on the drawing: the title names the lot. Farbaek always drew both.

## Decision

Two settings on the Sheet tab, both on unless turned off:

- **Circles at the lots' corners:** off draws the corners without their small circles, on the sheet and the PDF.
- **Lot letters on the drawing:** off leaves the letters (and the panel layout's extent under them) off the drawing and the DXF. The title still names each lot, and the checks still need each one's letter.

Off is stored as `noCornerCircles` and `noLotLetters` (`true`); on removes them. So a plan that never changes them, and its approval, are as before. Comparing two versions says when either changes.

## Verified

- **`sheet/stage259.test.ts`:**
  - circles and the letter are drawn by default and left off when turned off, with the title still naming the lot;
  - the DXF follows the letters setting;
  - a plan without the settings parses without them, and the change between versions is said.
