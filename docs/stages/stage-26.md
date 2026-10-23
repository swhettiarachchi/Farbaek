# Stage 26: Accessibility audit on every route

Phase 4 of the owner's brief asks for keyboard navigation, visible focus, semantic controls and labels, and screen-reader support, checked across the whole platform.

- **Decision record:** `docs/adr/0053-accessibility-audit.md`.
- **Branch:** `feat/accessibility-audit`, from `main` after #32.

## 2026-10-23

### Done

**`pnpm qa:a11y`** (`scripts/qa/a11y-audit.mjs`) reads Chrome's own accessibility tree and the DOM, on every route at 1280 and 375 px. It reports:
- nameless controls;
- missing alt text;
- focusable content inside `aria-hidden`;
- duplicate ids;
- heading problems (not one `h1`, skipped levels);
- missing landmarks (`main`, `lang`, labels on several `nav`s);
- focus stops that don't change when focused (first 60 Tab stops).

It also takes full URLs, so it can be checked against a page of planted faults. It caught all eleven kinds.

**Fixes:**
- **Pricing:** a visually hidden "Plans" `h2`, so the plan names (`h3`) sit under a heading.
- **`StaticPreview`:** a visible ring when focus is inside the preview frame. CSS can't see focus inside a sandboxed frame, so it's drawn from script: the window blurs and the frame becomes the active element.

**The audit itself:**
- it ignores inert content (which can't take focus);
- it checks a focused frame's wrappers.

### Verified

- **The planted-fault page:** each of the eleven checks fired.
- **The first full run** (60 page views): four findings, with three inert clip buttons as false positives. The real ones were the pricing heading skip, at both widths, and the preview frame's missing focus.
- **The frame:** the audit still flagged it on the build without the ring, and passed it with the ring.
- **After the fixes:** 60 page views, no findings.
- **Live regions** are already present for run progress (`aria-live="polite"`), alerts, verification status and the composer.
- **The command palette** is a native modal `<dialog>`, which keeps focus inside, closes on Escape and returns focus, with a combobox and listbox pattern.

### Not verified

- **A real screen reader** (NVDA, VoiceOver, TalkBack): names and order make sense to a script, not necessarily to a person.
- **Office Space and `/admin`** (staff sign-in).
- **Demo routes without data:** build runs, help tickets, sandbox sessions.

### Next

- A screen-reader pass of the main journeys by a person: new build, approve, verify, publish.
- The three audits (`qa:responsive`, `qa:a11y`, `qa:vitals`) in CI, once CI can run Chrome.
