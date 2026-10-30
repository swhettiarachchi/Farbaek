# Stage 95: The visual editor

The spec audit (`docs/architecture/spec-audit-2026-10-30.md`) found no visual builder (spec §6). This stage builds one for static sites: pick an element in the page, change it, review the exact change to the HTML and CSS, and save it as new revisions.

- **Decision record:** `docs/adr/0118-visual-editor.md`.
- **Branch:** `feat/visual-editor` (from `feat/permission-leases`, PR #122).

## 2026-10-30

### Done

- **`src/core/studio/visual-edit.ts`:**
  - a source-position HTML scanner;
  - the preview's element numbering and pick script;
  - text, link, image-description and style edits;
  - CSS rule writing, either in the page's stylesheet or in a marked style block;
  - relocating the selection after an edit.
- **`/app/projects/:id/design`:** the editor, with:
  - the page picker and device widths;
  - picking by click or tap, or from the keyboard-friendly list of elements;
  - an inspector for text, links, image descriptions and seven styles;
  - undo;
  - the diff review with accept and reject per change;
  - save through the file editor's server path.
- **Honest limits:**
  - projects with a build step, over 3 MB of text, or with no HTML pages say why the editor isn't available;
  - viewers, archived projects and the demo can edit and review the draft, but saving says why it can't.
- **The project page** has **Edit visually** beside the live preview.

### Verified

- `src/core/studio/visual-edit.test.ts` (15):
  - the scanner's positions, comments, script text, and implicit closes;
  - text only for elements that hold only text;
  - numbering that leaves the source unchanged;
  - the outline;
  - escaped text;
  - links refusing script and protocol-relative addresses;
  - image descriptions;
  - a class and rule in the stylesheet, then the same rule updated;
  - ids and taken class numbers;
  - the style block when the page links no stylesheet;
  - only offered values reaching the CSS, so injection attempts are refused;
  - only top-level rules with the exact selector changed;
  - computed colours.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`: 2,186 passed.
- **A demo build with a temporary static site** (removed before the commit):
  - picking the heading from the list outlined it in the frame and read its real styles;
  - a text edit and a style edit (colour, size, alignment) updated the preview, kept the selection and changed 2 files;
  - the review showed the one-line HTML change and the new CSS rule, with accept and reject;
  - Save stayed disabled with the demo's reason;
  - at 375px there was no sideways scroll and no target under 44px;
  - the demo's Next.js project showed why the editor isn't available;
  - the project page showed **Edit visually**.
- **The pick script,** in a test frame: a real click on the heading reported it with its styles, a click on a link reported it without following it, and hovering outlined the element. The browser tool's own clicks don't reach inside a sandboxed frame, so this was checked from a script instead.

### Next

- Apps with a build step, through source maps from the sandbox preview.
- Layout edits: move, add, remove and duplicate elements; spacing per side; styles for one breakpoint.
