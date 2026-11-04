# ADR 0166: Studio styles for phones only

- Status: accepted (2026-11-04).
- Extends ADR 0118 (the visual editor) and ADR 0162 (spacing).

## Context

Studio's styles applied to every screen. A headline sized for a desktop hero is often too big on a phone, and spacing that breathes on a laptop wastes a small screen. The person's only way to change one without the other was to edit the CSS by hand. Stage 146 listed "styles for phones only" as next.

## Decision

- **A style can be for every screen or for phones only.**
  - The inspector's Style section starts with "Applies to: Every screen / Phones only".
  - Phones are screens up to 640 px wide, where the kit and the templates switch to their single-column layouts.
- **The scope follows the preview,** as in other professional site editors.
  - Choosing the Phone preview sets "Phones only"; Tablet or Desktop sets "Every screen".
  - Choosing "Phones only" switches the preview to a phone, so the person sees what they change.
- **Where phone styles go:**
  - one marked block at the end of the page's stylesheet: `/* Studio: phones only */` then `@media (max-width: 640px) { … }`, holding each element's phone rule (`upsertScreenRule` in `src/core/studio/visual-edit.ts`);
  - in the page's style block when it links no stylesheet in the project.
- **Rules for every screen always stay above that block,** so on a phone the phone rule comes later and wins. Both carry `!important`, as the editor's rules do (ADR 0161).
- **The values allowed are the same** as for every screen. Anything else, including any scope other than the two, is refused.
- **The "a more specific rule still wins" warning only runs when the preview shows the screen the style is for.** It can't judge a phone-only change on a desktop preview, or an every-screen change that a phone rule overrides on the phone preview.

## Consequences

- People can tune a site for phones in Studio without touching code, and the change reads plainly in the review diff.
- **One media query, one place:** the agent and people reading the CSS find every phone override together.
- **Styles for tablets only aren't offered.** The two scopes cover the common case; a tablet-only rule can still be written in code.
