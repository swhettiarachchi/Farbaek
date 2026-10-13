# 0002. Code editor

- Status: accepted (not yet implemented)
- Date: 2026-10-13

## Decision

CodeMirror 6 is the shared editor for web, tablet and mobile web. Diff review uses `@codemirror/merge` (verify the current package before Stage 2).

Monaco is not shipped to phones: its README FAQ states it is not supported in mobile browsers. It may be added later as a desktop-only option, through a separate ADR, if IntelliSense parity justifies the weight.

## Consequences

The marketing site's diff preview (`src/components/code/diff-view.tsx`) is a lightweight read-only renderer, not the editor. It is replaced by CodeMirror's merge view inside Studio.
