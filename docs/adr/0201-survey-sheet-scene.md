# ADR 0201: The survey sheet as template data and one scene in millimetres

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 190
- **Builds on:**
  - ADR 0198 (Survey Studio as a module);
  - ADR 0200 (the PDF and DXF writers).

## Context

A surveyor reviews a plan on screen and signs it on paper. If the screen preview and the PDF were drawn by separate code, they could drift apart: a label in one place on screen and another on paper, a panel that fits in one and overflows in the other. The surveyor would then approve something other than what prints.

The survey skill also asks for sheet templates as versioned data, not hard-coded layout, with page size, margins, frame, regions, text heights, line weights and scale policy. Drawing scale must stay separate from printer scaling, and geometry must never be moved to make text fit.

## Decision

**The template is data.** `SRI_LANKA_CADASTRAL_V1` in `src/core/survey/sheet/template.ts` is a `SheetTemplate` with an id (`lk-cadastral`) and a version (1): margins per paper size, text sizes and line weights in millimetres, the panel's share of the page with limits, and every caption. Captions whose wording no official source fixes (such as "North by") are template values, not code.

**One render-agnostic sheet scene.** `composeSheet` in `src/core/survey/sheet/compose.ts` is pure and deterministic. It turns the template, one drawing version, the points, the parcel, the CRS, the confirmation, the surveyor and the approval into:
- pages of primitives (paths, text and circles) in millimetres, origin top-left, y down (`src/core/survey/sheet/scene.ts`), each tagged with its layer and drawing entity;
- the viewport, the scale used and the scale suggested;
- findings: text that doesn't fit, text in a script the embedded fonts can't draw, a drawing that doesn't fit at the chosen scale, no scale that fits, labels that overlap, labels longer than their leg.

**Every consumer reads that scene.**
- The screen preview (`src/components/survey/sheet-svg.tsx`) draws a page as SVG in a `viewBox` in millimetres.
- The PDF writer (`src/server/survey/pdf.ts`) draws every page at 72 / 25.4 points per millimetre.
- The checks come from the same composition, through `buildPlan` in `src/core/survey/view.ts`, which the project page, the plan editor, the export route, the approval action and the public Sample all call.

So what is printed is what was reviewed: the same positions, the same text, the same findings. Only the colours differ: the screen uses the design tokens, the PDF fixed black and greys.

**Scale is a decision, not a fit.** The composer suggests the largest standard scale whose drawing fits 80% of the drawing area, and the person can choose another. It never shrinks the drawing: a chosen scale that doesn't fit is a `DRAWING_OFF_SHEET` finding that blocks export.

**Nothing moves by itself.** Geometry is placed only by `toPage` at the plan's scale. Labels are placed by fixed rules and moved only by a person (label offsets in the document, a presentation edit). Overlaps and overflow are reported as findings, never fixed silently.

## Consequences

- One place to change how a sheet looks, with tests that check every primitive lies on its page, the check line is exactly 100 mm, and a 10 m line is exactly `10 000 / scale` mm.
- The PDF test can measure true scale from the PDF's own path operators, because the PDF draws the scene's millimetres directly.
- The DXF doesn't use the scene: it writes real-world coordinates from the drawing model, without the sheet's frame, panels or label offsets.
- The editor's layer visibility filters the scene a second time on screen, with the same layers the composer skips. The `TITLE` layer (north point, scale bar, check line and title block) always prints, so the editor never hides it either.
- Adding a plan type means adding a template and composing into the same scene. Today the document doesn't record which template it used, because there is only one.
- Text widths come from Geist's measured advance widths (Geist Mono at 0.6 em, unknown characters at 0.7 em), with a 4% margin, so overflow and overlap checks err toward reporting. They are still estimates: they ignore kerning.
