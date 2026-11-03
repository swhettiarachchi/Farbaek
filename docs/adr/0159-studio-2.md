# ADR 0159: Studio 2: sections, theme and in-place editing

- Status: accepted (2026-11-03). Amends ADR 0118 (the visual editor). It does two of the things ADR 0118 left undone: layout moves and the site's own colour tokens.
- Asked for by the owner: after a build, people should be able to edit the site themselves in the preview. That means moving sections by drag and drop, changing images, text, text size and colours, and having options that fit the site, all of it premium, user friendly and mobile friendly.

## Context

**What Studio already did (ADR 0118):**
- Edit one element's text, link, alt text, image, video, scene and seven style properties.
- Every change is an offset-based edit of the source, reviewed as a diff and saved as revisions.

**What it couldn't do:**
- move, copy, add or remove sections;
- change a site's colours or fonts site-wide;
- edit a kit button's label beside its arrow;
- set responsive text sizes;
- pick a whole section in the preview.

## Decision

- **New edits** in `src/core/studio/visual-edit.ts`, still source-preserving:
  - `move` (among a section's siblings), `duplicate` (ids made unique, with the labels and anchors inside following) and `remove` (never the last section);
  - `insert` of one of Farbaek's own sections (`src/core/studio/snippets.ts`), by id only, never HTML from the client;
  - `label` for a button or link whose only other content is an empty `aria-hidden` decoration;
  - `theme` for sites on the Studio kit:
    - the look on every page's `<html>`;
    - colour tokens written into the stylesheet's `:root` by a declaration upsert that keeps comments and the other declarations;
    - a font pairing (the Google Fonts link on every page plus `--font-display` and `--font-body`);
    - a corner style (`--radius` and `--radius-lg`).
- **Text size presets:** `font-size` also accepts five presets that scale with the screen (`TEXT_SIZES`), besides exact px.
- **`EditResult.select`** keeps the moved or added element selected. `relocate` is used only for edits that don't change the structure.
- **The preview** (`DESIGN_SCRIPT`):
  - draws a toolbar over the picked element's section, with a drag handle (pointer events, so touch works), up, down, duplicate and delete;
  - a drop line shows where a dragged section lands;
  - Alt+click picks a whole section;
  - the editor can preview a look and colours live with no reload;
  - the frame only reports actions (`farbaek-design-action`); the editor checks each with zod, keeps it within the page's elements, and makes the edit.
- **The editor:**
  - Element, Sections and Theme tabs;
  - the Sections panel (a drag-to-reorder list with keyboard arrows, duplicate, delete and an "Add a section" gallery);
  - the Theme panel (light and dark look cards drawn in each look's colours, four colours with a live preview and a WCAG contrast warning, eight font pairings, three corner styles);
  - Redo, and Ctrl+Z / Ctrl+Shift+Z.
  - Pro sections and looks are disabled on Free with the reason. The design page passes the plan's kit tier.
- **Saving is unchanged:** the diff review, then `saveFileAction`, stylesheets before pages.

## Consequences

- People can arrange and restyle a site without writing code or asking the agent, and every change stays a reviewable source edit.
- Theme controls only work on sites built on the kit. Older sites see an honest note and the **Upgrade its design** link.
- **Not done:**
  - uploading an image from inside the editor (it's still done on the Files page);
  - spacing per side and styles per breakpoint;
  - hover and focus states;
  - editing multi-element text inline in the preview.
