# Stage 125: The audits cover every page

The responsive and accessibility audits now include the pages added since they were written. The first full run found four problems, which are fixed.

- **Branch:** `feat/qa-sweep` (from `feat/stacked-pulls`).
- **Migration:** none.

## 2026-10-31

### Done

- **`scripts/qa/responsive-audit.mjs` and `scripts/qa/a11y-audit.mjs`** now include:
  - Activity, Incidents and one incident, Integrations, Policies and the Trust graph;
  - Workflows, a new workflow and one workflow;
  - each project's GitHub, graph and design pages.
- **The fixes:**
  - **Activity:** each "Details" toggle is at least 44px wide (it was 38).
  - **Trust graph map:** on touch screens it's drawn at full size, so each node is a 44px target (they were 21px tall), and it scrolls sideways inside its own frame. From 1024px it fits its column as before.
  - **Component editor:** an element shown by its classes truncates in its own row, with the full list on hover, instead of running past it.
  - **Page headers:** the actions sit beside the title only from 1024px, and wrap. At 768px a project's four actions ran past the screen.

### Verified

- **`pnpm qa:responsive` on a demo build:**
  - **Before the fixes**, at 320, 375, 768 and 1280: 196 page views, 3 with content cut off and 6 with small touch targets.
  - **After**, at 320, 375, 768, 1024 and 1280: 245 page views, with no sideways scroll, no cut-off content, no small targets, no crowded scroll frames and no console errors.
- **`pnpm qa:a11y`** at 1280 and 375: 94 page views, 0 findings.
- **Looked at in the browser pane at phone width:** the trust map's full-size nodes scroll inside their frame, and the rules section reads correctly.
- `pnpm typecheck` and lint.

### Next

- Picking an element in a running app, and MCP servers as a tool source.
