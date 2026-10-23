# ADR 0053: An accessibility audit on every route

- Status: accepted (2026-10-23).
- Builds on ADR 0008 (White Signal: 44px targets, visible focus, status in words), ADR 0049 (natural type) and ADR 0051 (the responsive audit).

## Context

**What was already covered:**
- the responsive audit (ADR 0051) checks layout and touch target sizes;
- the design tests check colour contrast.

**What nothing checked, across every route:**
- controls without an accessible name;
- missing alt text;
- focusable content hidden from screen readers;
- duplicate ids;
- heading structure;
- landmarks;
- whether keyboard focus is visible.

**Why not axe-core:** it would be a new dependency, which needs the owner's approval. Chrome already exposes the accessibility tree that screen readers use, through the DevTools protocol that `playwright-core` (already in the repo) speaks.

## Decision

**`pnpm qa:a11y`** (`scripts/qa/a11y-audit.mjs`) opens every route at 1280 and 375 pixels with reduced motion. It reports:

| Check | How |
| --- | --- |
| Controls with no accessible name | Chrome's accessibility tree: buttons, links, fields, combos, checks, switches, tabs, menu items, options, sliders, dialogs, images |
| Images without `alt` | DOM |
| Focusable content inside `aria-hidden` | DOM (inert content is excluded, since it can't take focus) |
| Duplicate ids | DOM |
| Not exactly one visible `h1`, or a heading level skipped going down | DOM |
| No `main`, no `lang`, several `nav`s without labels | DOM |
| A focus stop that looks the same focused and unfocused (first 60 Tab stops) | Computed outline, box-shadow, border, background, underline and colour. For an iframe, its three nearest wrappers |

**The audit is checked against a page of planted faults.** All eleven kinds were reported.

**Focus inside a preview frame.** Neither `:focus` nor `:focus-within` reaches the page when focus is inside a sandboxed iframe. `StaticPreview` draws its ring from script instead: the window blurs and the frame becomes the active element.

## Consequences

- **The first run found four real issues;** they're fixed:
  - **Pricing** went from the `h1` straight to the plan names (`h3`). A visually hidden "Plans" `h2` now sits between them.
  - **The template and project preview frame** showed no focus at all.
- **The first run also had a false positive:** the clip buttons in the inactive desktop stage panes, which are inert. The check now leaves inert content alone.
- **After the fixes:** 60 page views, no findings.
- **What it can't judge:** whether names and announcements make sense, reading order, or how it is with a real screen reader. Those still need a person. Progress already announces itself in the live run, verification and the composer (polite live regions and alerts).
- **Not covered:** Office Space and `/admin`, behind a staff sign-in.
