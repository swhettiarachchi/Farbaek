# ADR 0195: The site preview on phones

- **Status:** accepted
- **Date:** 2026-11-12
- **Stage:** 185
- **Builds on:** ADR 0027 (static previews in a locked-down frame), ADR 0169 (the preview frame document).

## Context

People build sites from their phones, and the owner asked for the preview to be full width, modern, easy to move around and pleasant to look at there. At 375 px the preview was 291 px wide, inside three layers of padding. Its Phone, Tablet and Desktop buttons only narrowed the frame, so on a phone Phone was wider than the space and Desktop looked the same as Phone. Moving between pages needed a select, and there was no back, reload or full screen.

## Decision

**One preview, `StaticPreview`, used on the project page, the run page and template pages:**
- **Edge to edge on a phone:** it reaches the card's edges, and with Phone, the site's own window is the full width, so it lays itself out exactly as on the phone.
- **Real devices:**
  - **Phone:** the site's real width on a phone, 390 px on a wider screen.
  - **Tablet:** 820 px. Shown only where there's room to choose it.
  - **Desktop:** fills wide space; in narrower space, the real 1280 px desktop layout scaled to fit, with the scale shown ("Desktop at 29%").
  - **Default:** until the person picks one, a phone starts on Phone and a computer on Desktop. The sizes are computed in `src/core/workspace/preview-geometry.ts`, with tests.
  - **A device narrower than its space** sits on the stage like a device: 16 px from the top and bottom, a large panel's 28 px corners (kept at 28 px when scaled), a hairline ring and a soft shadow. A window that fills its space has no frame: on a phone, the preview is the screen.
- **A browser bar:** back through the pages visited, the page as an address (`/`, `/menu.html`) that opens the list of pages, reload, and full screen. Links inside the site still move between its pages.
- **Full screen:** a native dialog that fills the screen with the site.
  - The controls sit in a glass bar at the bottom, where a thumb rests: close, back, pages, reload, device.
  - Escape closes it, and the page behind doesn't scroll.
  - It fades in, and its bar rises, only when motion is allowed.
- **Loading:** a skeleton shaped like a page until the site has drawn, never for longer than four seconds.

**Unchanged:** the frame's isolation (no same-origin access, no network, its own policy), the version switch, and the note about what the frame can reach.

## Consequences

- **What people see on a phone:** their site at the phone's real width, full width, as visitors will. One press shows the desktop layout or the whole screen.
- **Desktop previews in narrower space** show the true desktop layout, smaller, rather than a squeezed one that no visitor would see.
- **The visual editor** (Studio) keeps its own frame. It isn't changed here.
