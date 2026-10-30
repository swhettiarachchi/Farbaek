# ADR 0118: The visual editor for static sites

- Status: accepted (2026-10-30).
- Implements master spec §6 ("Farbaek Studio: visual builder and professional workspace"): "The visual builder and the code workspace operate on the same project and source of truth. A visual edit becomes a maintainable code change", and "Every visual edit maps to a reviewable diff". The spec audit of 2026-10-30 found it missing.
- Builds on ADR 0027 (the locked-down static preview) and the file editor's review and revisions.

## Context

Farbaek had a code workspace (files, CodeMirror, diffs, revisions) and a live preview, but no way to change a page by pointing at it. The spec asks for one, with two conditions:
- it edits the same files the code editor does, not a separate design model;
- every edit shows as a diff before it's saved.

## Decision

**Scope: static sites.** The editor works on projects that preview instantly in the browser: HTML, CSS and their images (`runProfile` "static", text up to 3 MB). A project with a build step (Next.js, React) shows why it isn't available and points to the code and the agent. Mapping a click in a built app back to its JSX would need source maps from a running build; that's a later step, not something to fake.

**Source positions, not a re-serialised DOM.** A small scanner in `src/core/studio/visual-edit.ts`:
- reads the page's HTML and keeps every element's position;
- skips comments and raw text such as scripts;
- closes paragraphs and list items the way a browser does.

An edit replaces only the bytes it means to, so the rest of the file stays as the person wrote it. A browser's DOM would reformat the whole file.

**Picking.** The preview numbers each element in source order (`data-fbk`), only in the preview. A script in the locked-down frame reports the clicked element's number and its computed styles to the parent. The browser may reshape the tree, but the number still points at the source. The parent accepts a pick only:
- from that frame;
- in the expected shape;
- for an element that exists.

A list of the page's headings, text, links and images gives the same choice by keyboard.

**What an edit can change:**

| Edit | Where it goes |
| --- | --- |
| Text of an element that holds only text | Between its tags, escaped |
| A link's address | Its `href`: a page in the site, an anchor, or https, mailto and tel only |
| An image's description | Its `alt` |
| Text colour, background, text size, weight, alignment, padding, corners | A CSS rule for the element |

**Styles stay maintainable:**
- They go into a rule for the element's id, or for a new class (`vb-h1-1`) added to it, never into a `style` attribute.
- The rule is written in the first stylesheet the page links in the project. If there is none, it goes in a marked `<style>` block in the page's head.
- A later edit to the same element updates the same rule.
- Only the values the editor offers reach the CSS: hex colours, pixel sizes within limits, listed weights and alignments.
- When a more specific rule elsewhere still wins, the editor checks what the page shows after the edit, says so, and says where to look.

**Review and save:**
- Edits build a draft in the browser, with undo.
- **Review** shows each changed file in the same diff review as the code editor, with accept or reject for each change.
- **Save** writes each file through `saveFileAction`, the same server path as the code editor, with its checks: role, path, size, secrets and the revision it started from.
- Stylesheets save before pages, so a failure part-way leaves at most an unused rule.
- Each file becomes a new revision, which its history can show and restore.

**Viewers, archived projects and the demo** can use the editor and review the draft; saving says why it isn't possible.

## Consequences

- People can change words, links and styles on a static site without reading code, and still see exactly what changed in the source.
- The code editor and the visual editor never disagree: there's one set of files.
- Nothing new on the server: the boundary is the existing file save.

## Not done

- **Apps with a build step** (Next.js, React): needs mapping from the running preview to source through source maps.
- **Layout changes:** moving, adding, removing or duplicating elements, and spacing per side.
- **Breakpoint-specific styles:** a rule only for phones or tablets.
- **Hover and focus states, and the site's own colour tokens as choices.**
