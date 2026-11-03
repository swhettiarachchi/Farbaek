# ADR 0161: Studio changes always show, and photos upload in the editor

- Status: accepted (2026-11-03). Amends ADR 0118 (the visual editor), ADR 0156 (Replace) and ADR 0159 (Studio 2).
- Asked for by the owner: do drag and drop, image replace, text size and the other Studio features work?

## Context

On launch day I tested Studio 2 on production (Sunrise Bakery) and on a local build of the new store direction:
- **Worked:**
  - dragging sections in the list and in the preview;
  - the preview toolbar's arrows;
  - add, duplicate and delete;
  - text, Replace with a stand-in photo;
  - the Theme panel;
  - undo and review.
- **Didn't show:** a text size set on Sunrise Bakery's "Contact" heading. The editor writes a rule for a class it adds (`.vb-h2-1`), and the site's `.section h2` is more specific, so the site's own size won. The editor said so honestly, but the change didn't happen. Most real sites have rules like this, and the new directions do too (`.hero .fs-display`, `.hero .fs-link`).
- **Clumsy:** using your own photo meant leaving Studio for the Files page, then reloading.
- **Smaller faults:**
  - Replace always opened on "Laptops, desks" and the wide shape;
  - the Theme panel showed the main accent as the second accent;
  - a section without a heading was named by its first number ("120"), not by the name it gives itself ("In numbers");
  - uploaded file names split accented words ("cre-me").

## Decision

- **A style set in Studio always wins.**
  - Its declarations carry `!important`. They're the person's explicit choice for that one element, and the rule only matches that element.
  - The warning about a more specific rule stays, for the rare rule that also uses `!important`.
- **Upload a photo inside Replace,** under Your images:
  - it's saved to the project's files at once, under a free name in `assets/` made from the file's own name, with the extension its bytes say;
  - the picture then points at it in the draft and drops its Placeholder mark;
  - the editor shows it straight away, and the message asks for a screen-reader description;
  - it's unavailable, with the reason, wherever saving is (the demo, a paused workspace).
- **Replace opens on the photo being replaced:** its subject and its shape (`photoFacts`).
- **Each look's swatch carries its real colours.** A test reads them from the kit's own CSS.
- **A section's name:** its heading, else its `aria-label`, else its first line of text.

## Consequences

- **Sites' CSS:** a site's stylesheet gains `!important` declarations for elements styled in Studio. That's readable, scoped to one class, and removed by clearing the style in Studio.
- **Uploads:** a photo uploaded and then not used stays in the project's files, like any upload, and can be deleted on the Files page.
- **Still to do:** spacing per side, styles per breakpoint, and editing text in the preview itself.
