# ADR 0162: Studio: type in place, still previews, and space per side

- Status: accepted (2026-11-03). Amends ADR 0118 (the visual editor) and ADR 0159 (Studio 2).
- Asked for by the owner: edit the site right in the preview, at a premium level. This follows the Studio check in ADR 0161.

## Context

Three things still made editing feel indirect:
- **Words were edited in a side box.** You picked words in the preview, then typed in a side panel.
- **Rotating content moved under the pointer.** A hero carousel or a promo bar kept rotating in the edit preview, so what you clicked could change before you edited it.
- **Spacing was one number for all four sides.** There was no way to say "more room above and below this section", the most common layout change.

Also, the check that warns when a site's own CSS wins compared computed px with the chosen value. A size that scales with the screen (`clamp(...)`) never matched it, so the warning fired for Studio's own presets.

## Decision

- **Type in place.**
  - Double-click or double-tap words in the preview to type over them. Enter or clicking away keeps them; Escape puts them back.
  - Only elements that hold just words can be typed over (`data-fbk-text`): not one holding other elements, one that never closes, hidden text, the title or form values.
  - The frame only reports the new words. The editor makes the text edit, with the same checks, undo and review as before.
- **A still edit preview.**
  - A small script runs first in the edit preview (`DESIGN_HEAD`). Timers of two seconds or more don't start, so carousels and rotating messages hold still.
  - Faster timers, such as a countdown ticking each second, still run.
  - The published site and the plain preview are untouched.
- **Space per side:**
  - inside the element at the top, at the bottom and at the sides;
  - outside it, above and below;
  - presets for the space above and below that scale with the screen (None, Tight, Comfortable, Generous and Grand), or exact px.
  - Like every Studio style, they win over the site's own rules (ADR 0161).
- **The warning compares exact values only.** A size or space that scales with the screen is trusted, because it can't be compared with what the page computed.

## Consequences

- Most text changes no longer need the side panel. Links' and buttons' words beside an icon still use the label field, because typing there could remove the icon.
- In the edit preview, anything that waits two seconds or more doesn't happen, such as a toast hiding itself or a slide advancing. That's intended: it's a place to edit, and the plain preview runs the site as published.
- **Still to do:** styles for phones only (per breakpoint).
