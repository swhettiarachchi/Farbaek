# Stage 144: Studio 2

- **Branch:** `feat/studio-2`, stacked on `feat/site-theme-choice` (PR #187).
- **Migration:** none.
- **ADR:** 0159.

## 2026-11-03

### Asked

The owner wants people to edit their site after a build, right in the preview:
- move sections by drag and drop;
- change images, text, text size and colours;
- options that fit the site;
- premium, user friendly and mobile friendly.

### Done

- **Core edits** (`src/core/studio/visual-edit.ts`):
  - move, duplicate, remove and insert for sections;
  - button labels;
  - the theme (look, colours, fonts, corners) for sites on the Studio kit;
  - responsive text size presets;
  - `sections()`, `labelText()`, `readTheme()` and `upsertCustomProps()`.
- **Options** (`src/core/studio/site-theme.ts`): theme tokens, eight font pairings, corners, text sizes, look swatches and WCAG contrast.
- **Section gallery** (`src/core/studio/snippets.ts`): seven core sections (feature with photo, numbers, card gallery, quote, questions, call to action, photo gallery) and three Pro ones (story chapters, carousel, marquee).
- **The preview:**
  - a section toolbar with a drag handle (mouse and touch), up, down, duplicate and delete;
  - a drop line while dragging;
  - Alt+click for a whole section;
  - live theme preview.
- **The editor:**
  - Element, Sections and Theme tabs;
  - the Sections panel with drag to reorder, arrows, duplicate, delete and Add a section;
  - the Theme panel with look cards, colours with a live preview and a contrast warning, fonts and corners;
  - the label field, text size presets and "Select the section around this";
  - Redo and keyboard shortcuts.

### Verified

- **Unit tests:** `src/core/studio`, 53 tests. They cover:
  - moves that leave the page byte for byte when undone;
  - duplicate with unique ids and labels;
  - remove;
  - every snippet passing `review_site`;
  - labels;
  - the theme across pages, keeping comments in `:root`;
  - fonts and corners;
  - refused inputs;
  - the preview script parsing;
  - the theme reader;
  - swatch contrast.
- **Checks:**
  - typecheck and eslint are clean;
  - vitest on `src/core`, `src/content`, `src/components`, `tests/design` and `tests/kit` passes.
- **In the browser** (a local demo build, with the bakery template temporarily as a demo project):
  - the Sections panel lists the sections by name, picks one, moves it up and opens its actions;
  - the preview draws the toolbar over the chosen section;
  - the Theme tab shows the current look and fonts, and Noir changes the whole site;
  - at 375 px there is no sideways scroll and no target under 44 px.
- **Fixes from that check:**
  - section names were cut off, so the actions moved under the selected row;
  - a look hid behind the site's own colours, so choosing one now clears them (Undo restores them);
  - a section without a heading is named by its first text.

### Next

- Upload an image from inside the editor.
- Spacing per side, and styles per breakpoint.
- Inline text editing in the preview.
